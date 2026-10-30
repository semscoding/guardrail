import assert from "node:assert/strict";
import test from "node:test";
import type { Finding } from "@guardrail/apis/domain";
import { offlineLlm, type Llm } from "@guardrail/apis/llm";
import { mockInvoices } from "@guardrail/apis/mocks";
import { createDbClient, listAuditEvents, listDeniedPayees, resetDatabase, verifyAuditChain } from "@guardrail/database";

import {
  analyzeInvoice,
  assessInvoice,
  blockPayee,
  decideVerdict,
  extractAmount,
  extractPayeeEmail,
  reconcileLlmFindings,
  runRules,
} from "../../src/invoices/index";

const scam = mockInvoices.find((i) => i.id === "inv_scam_1")!;
const legit = mockInvoices.find((i) => i.id === "inv_legit_1")!;

const assertExactSpans = (text: string, findings: Finding[]) => {
  for (const f of findings) assert.equal(text.slice(f.span.start, f.span.end), f.excerpt, `${f.kind} span`);
};

/** A fake "anthropic" LLM that returns a fixed triage, to test reconciliation without a key. */
const fakeLlm = (triage: unknown): Llm => ({
  mode: "anthropic",
  model: "fake",
  json: async ({ schema }) => schema.parse(triage),
  runTools: async () => ({ steps: 0, finished: true, mode: "anthropic" }),
});

test("the mock scam invoice is SCAM with at least 3 rule findings and exact spans (offline mode)", async () => {
  const inv = await assessInvoice({ text: scam.text, payeeEmail: scam.payeeEmail }, offlineLlm());
  assert.equal(inv.verdict, "SCAM");
  assert.equal(inv.analysis.mode, "offline");
  assert.equal(inv.analysis.tactic, null);
  assert.ok(inv.findings.every((f) => f.detectedBy === "rule"), "offline mode adds no LLM findings");
  assert.ok(inv.findings.length >= 3);
  assertExactSpans(scam.text, inv.findings);
  const kinds = new Set(inv.findings.map((f) => f.kind));
  for (const k of ["PHONE_NUMBER", "BRAND_IMPERSONATION", "URGENCY", "CALL_TO_CANCEL", "UNKNOWN_PAYEE"] as const) {
    assert.ok(kinds.has(k), `expected ${k}`);
  }
  assert.ok(inv.findings.some((f) => f.excerpt === "+1 (808) 555-0147"));
  assert.ok(inv.findings.some((f) => f.excerpt === "within 24 hours"));
  assert.ok(inv.findings.some((f) => f.excerpt === "Do not pay through PayPal"));
  assert.deepEqual(extractAmount(scam.text), { cents: 49999, currency: "USD" });
});

test("the mock legit invoice is SAFE, with its amount read as integer cents", async () => {
  const inv = await assessInvoice({ text: legit.text }, offlineLlm());
  assert.equal(inv.verdict, "SAFE");
  assert.deepEqual(inv.findings, []);
  assert.deepEqual(inv.amount, { cents: 12600, currency: "EUR" });
  assert.equal(inv.payeeEmail, null);
});

test("payee and amount are extracted from pasted text", () => {
  assert.equal(extractPayeeEmail("From: Billing@Scam.example.com, pay now"), "billing@scam.example.com");
  assert.deepEqual(extractAmount("Total 1.299,99 EUR"), { cents: 129999, currency: "EUR" });
  assert.deepEqual(extractAmount("Amount: $1,250.00"), { cents: 125000, currency: "USD" });
  assert.equal(extractAmount("no amount here"), null);
});

test("invoice numbers and dates are not phone numbers; a plain office phone alone is not SCAM", () => {
  assert.deepEqual(runRules("Invoice 2026-0412, dated 14-10-2026", null), []);
  const f = runRules("Questions? Call our office at 020 123 4567.", "x@shop.example.com");
  assert.notEqual(decideVerdict(f), "SCAM");
});

test("crypto wallet plus a phone number is SCAM", () => {
  const text = "Send 0.01 BTC to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh. Questions: +44 20 7946 0958.";
  const f = runRules(text, null);
  assertExactSpans(text, f);
  assert.equal(decideVerdict(f), "SCAM");
});

test("LLM spans that do not occur in the text are dropped; offsets are recomputed", async () => {
  const text = legit.text;
  const kept = reconcileLlmFindings(text, [
    { kind: "OTHER", excerpt: "Training bibs (30 pcs)", explanation: "fine" },
    { kind: "URGENCY", excerpt: "pay within 1 hour", explanation: "invented" },
    { kind: "OTHER", excerpt: "training bibs (30 pcs)", explanation: "wrong case" },
    { kind: "OTHER", excerpt: "   ", explanation: "empty" },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].detectedBy, "llm");
  assert.equal(text.slice(kept[0].span.start, kept[0].span.end), "Training bibs (30 pcs)");

  // Through the whole pipeline: an LLM alone can never make it SCAM.
  const inv = await assessInvoice(
    { text },
    fakeLlm({
      tactic: "fake renewal",
      findings: [
        { kind: "CALL_TO_CANCEL", excerpt: "as agreed with your club", explanation: "x" },
        { kind: "BRAND_IMPERSONATION", excerpt: "EU SportDirect GmbH", explanation: "x" },
        { kind: "PHONE_NUMBER", excerpt: "+1 555 0100 0000", explanation: "not in text" },
      ],
    }),
  );
  assert.equal(inv.analysis.mode, "anthropic");
  assert.equal(inv.analysis.tactic, "fake renewal");
  assert.equal(inv.findings.length, 2);
  assert.ok(inv.findings.every((f) => f.detectedBy === "llm"));
  assert.equal(inv.verdict, "SUSPICIOUS");
});

test("a failing LLM falls back to rules and says so", async () => {
  const broken: Llm = { ...fakeLlm({}), json: async () => { throw new Error("boom"); } };
  const inv = await assessInvoice({ text: scam.text, payeeEmail: scam.payeeEmail }, broken);
  assert.equal(inv.analysis.mode, "failed");
  assert.equal(inv.verdict, "SCAM");
});

test("analyzeInvoice persists invoice + findings + audit; blockPayee writes payee_denylist", async () => {
  const client = await createDbClient({ pgliteDir: "memory://" });
  try {
    await resetDatabase({ client });
    const stored = await analyzeInvoice(
      { id: "inv_test_scam", text: scam.text, payeeEmail: scam.payeeEmail, amount: scam.amount, source: "PAYPAL_SANDBOX" },
      { llm: offlineLlm(), client },
    );
    assert.equal(stored.verdict, "SCAM");
    assert.deepEqual(stored.amount, { cents: 49999, currency: "USD" });
    assertExactSpans(scam.text, stored.findings);

    const result = await blockPayee("inv_test_scam", { client });
    assert.deepEqual(result, { ok: true, payeeEmail: "billing-renewals@business.example.com", blocked: true });
    assert.deepEqual(await listDeniedPayees(client), ["billing-renewals@business.example.com"]);
    // Idempotent: a second block is fine and adds no second audit event.
    await blockPayee("inv_test_scam", { client });
    assert.deepEqual(await blockPayee("nope", { client }), { ok: false, reason: "NOT_FOUND" });

    const events = await listAuditEvents(client);
    assert.equal(events.filter((e) => e.action === "invoice.verdict" && e.outcome === "SCAM").length, 1);
    assert.equal(events.filter((e) => e.action === "payee.blocked").length, 1);
    assert.equal((await verifyAuditChain(client)).ok, true);
  } finally {
    await client.close();
  }
});
