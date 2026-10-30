import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Evidence } from "@guardrail/apis/domain";
import { offlineLlm, type Llm } from "@guardrail/apis/llm";
import type { PayPalOrder } from "@guardrail/apis/paypal";
import { createDbClient, listAuditEvents, resetDatabase, verifyAuditChain, type DbClient } from "@guardrail/database";

import {
  analyzeGaps,
  approveDossier,
  DEMO_SUBMIT_NOTE,
  DisputeError,
  dossierProblems,
  draftDossier,
  getDispute,
  handleDisputeWebhook,
  mapPayPalDispute,
  OFFLINE_NOTE,
  submitDossier,
  templateSections,
} from "../../src/disputes/index";

const SEEDED = "PP-D-27803";

const ev = (id: string, kind: Evidence["kind"], data: Record<string, unknown> = {}): Evidence => ({
  id,
  kind,
  source: "paypal_order",
  summary: `${kind} summary`,
  collectedAt: "2026-10-30T10:00:00.000Z",
  data,
});

/** A getOrder / provideEvidence stand-in that records calls. */
function spy<A extends unknown[], R>(impl: (...args: A) => Promise<R>) {
  const calls: A[] = [];
  const fn = async (...args: A) => {
    calls.push(args);
    return impl(...args);
  };
  return Object.assign(fn, { calls });
}

const neverCalled = () => {
  throw new Error("PayPal must not be called");
};

let client: DbClient;
before(async () => {
  client = await createDbClient({ pgliteDir: "memory://" });
  await resetDatabase({ client });
});
after(async () => {
  await client.close();
});

// ---- Gap analysis (code decides strength) ---------------------------------------------------------

test("not received: STRONG only with delivered tracking and an address that matches the order", () => {
  const delivered = ev("t", "TRACKING", { deliveredAt: "2026-10-24T14:12:00Z" });
  const shipped = ev("t", "TRACKING", { status: "SHIPPED" });
  const matches = ev("a", "ADDRESS", { matchesOrderAddress: true });
  const unknown = ev("a", "ADDRESS", { matchesOrderAddress: null });
  const reason = "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";

  assert.deepEqual(analyzeGaps(reason, [delivered, matches]), { strength: "STRONG", missingEvidence: [] });
  assert.deepEqual(analyzeGaps(reason, [shipped, matches]), { strength: "WEAK", missingEvidence: ["TRACKING"] });
  assert.deepEqual(analyzeGaps(reason, [delivered, unknown]), { strength: "WEAK", missingEvidence: ["ADDRESS"] });
  assert.deepEqual(analyzeGaps(reason, []), { strength: "WEAK", missingEvidence: ["TRACKING", "ADDRESS"] });
});

test("unauthorised needs ORDER + ADDRESS; not as described needs ORDER + COMMUNICATION", () => {
  assert.equal(analyzeGaps("UNAUTHORISED", [ev("o", "ORDER"), ev("a", "ADDRESS")]).strength, "STRONG");
  assert.deepEqual(analyzeGaps("UNAUTHORISED", [ev("o", "ORDER")]).missingEvidence, ["ADDRESS"]);
  const nad = "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED";
  assert.equal(analyzeGaps(nad, [ev("o", "ORDER"), ev("c", "COMMUNICATION")]).strength, "STRONG");
  assert.deepEqual(analyzeGaps(nad, [ev("c", "COMMUNICATION")]).missingEvidence, ["ORDER"]);
  assert.deepEqual(analyzeGaps("OTHER", []).missingEvidence, ["ORDER"]);
});

// ---- Dossier validation ------------------------------------------------------------------------

test("dossier validation rejects sections without evidence or with unknown evidence IDs", () => {
  const evidence = [ev("ev_order", "ORDER")];
  assert.deepEqual(dossierProblems([{ heading: "Order", body: "x", evidenceIds: ["ev_order"] }], evidence), []);
  assert.equal(dossierProblems([{ heading: "Order", body: "x", evidenceIds: [] }], evidence).length, 1);
  const unknown = dossierProblems([{ heading: "Delivery", body: "x", evidenceIds: ["ev_order", "ev_made_up"] }], evidence);
  assert.match(unknown[0]!, /unknown evidence "ev_made_up"/);
});

test("offline template cites only existing evidence, and every section cites something", () => {
  const evidence = [ev("o", "ORDER"), ev("t", "TRACKING"), ev("a", "ADDRESS")];
  const sections = templateSections(evidence, []);
  assert.ok(sections.length >= 3);
  assert.deepEqual(dossierProblems(sections, evidence), []);
  assert.deepEqual(templateSections([], ["ORDER"]), []);
});

test("an AI draft that cites unknown evidence is rejected, never stored", async () => {
  const lying: Llm = {
    mode: "anthropic",
    model: "stub",
    async json({ schema }) {
      // Same contract as the real adapter: the answer must pass the schema (which includes the citation check).
      return schema.parse({ sections: [{ heading: "Delivery", body: "Delivered.", evidenceIds: ["ev_invented"] }] });
    },
    async runTools() {
      throw new Error("unused");
    },
  };
  await assert.rejects(draftDossier(SEEDED, { llm: lying, getOrder: neverCalled, client }));
  const dispute = await getDispute(SEEDED, client);
  assert.equal(dispute?.dossier?.version, 1, "no new version stored");
});

// ---- Seeded demo dispute: offline draft, approve, submit without PayPal --------------------------

test("seeded dispute: offline draft is labelled, submit refuses a non-approved draft, PayPal is never called", async () => {
  const getOrder = spy<[string], PayPalOrder>(async () => neverCalled());
  const dossier = await draftDossier(SEEDED, { llm: offlineLlm(), getOrder, client });
  assert.equal(dossier.version, 2);
  assert.equal(dossier.status, "DRAFT");
  assert.equal(dossier.draftedBy, "template");
  assert.equal(dossier.note, OFFLINE_NOTE);
  assert.equal(dossier.strength, "STRONG");
  const evidence = (await getDispute(SEEDED, client))!.evidence;
  assert.deepEqual(dossierProblems(dossier.sections, evidence), []);
  assert.equal(getOrder.calls.length, 0);

  const provideEvidence = spy<[string, unknown], unknown>(async () => neverCalled());
  await assert.rejects(submitDossier(SEEDED, 2, { provideEvidence, client }), (err: unknown) => {
    assert.ok(err instanceof DisputeError);
    assert.equal(err.code, "CONFLICT");
    return true;
  });

  // Approving an outdated version is refused.
  await assert.rejects(approveDossier(SEEDED, 1, { client }), DisputeError);
  const approved = await approveDossier(SEEDED, 2, { client });
  assert.equal(approved.dossier?.status, "APPROVED");

  const submitted = await submitDossier(SEEDED, 2, { provideEvidence, client });
  assert.equal(provideEvidence.calls.length, 0);
  assert.equal(submitted.demo, true);
  assert.equal(submitted.dossier?.status, "SUBMITTED");
  assert.equal(submitted.dossier?.note, DEMO_SUBMIT_NOTE);

  // One submitted response per dispute.
  await assert.rejects(submitDossier(SEEDED, 2, { provideEvidence, client }), DisputeError);
  await assert.rejects(draftDossier(SEEDED, { llm: offlineLlm(), getOrder, client }), DisputeError);

  const actions = (await listAuditEvents(client)).filter((e) => e.entityId === SEEDED).map((e) => e.action);
  for (const a of ["evidence.collected", "dossier.drafted", "dossier.approved", "dossier.submitted"]) {
    assert.ok(actions.includes(a), `audit has ${a}`);
  }
  assert.equal((await verifyAuditChain(client)).ok, true);
});

// ---- Real dispute: webhook ingest, evidence from the order, provide-evidence --------------------

test("a real PayPal dispute is ingested, drafted from its order and sent with provide-evidence", async () => {
  const raw = {
    dispute_id: "PP-D-REAL-1",
    reason: "UNAUTHORISED",
    status: "WAITING_FOR_SELLER_RESPONSE",
    dispute_amount: { currency_code: "EUR", value: "12.50" },
    seller_response_due_date: "2026-11-20T23:59:59Z",
    disputed_transactions: [{ seller_transaction_id: "CAP123" }],
  };
  assert.equal(mapPayPalDispute({ ...raw, reason: "SOMETHING_NEW" }).reason, "OTHER");

  const outcome = await handleDisputeWebhook(
    { id: "WH-1", event_type: "CUSTOMER.DISPUTE.CREATED", resource: raw },
    { client },
  );
  assert.equal(outcome, "created");
  await client.query("UPDATE disputes SET order_id = 'ORDER-1' WHERE id = 'PP-D-REAL-1'");

  const order = {
    id: "ORDER-1",
    status: "COMPLETED",
    purchase_units: [
      {
        amount: { currency_code: "EUR", value: "12.50" },
        description: "Club socks",
        shipping: { address: { address_line_1: "Sportlaan 1", postal_code: "1234 AB", admin_area_2: "Sneek", country_code: "NL" } },
        payments: { captures: [{ id: "CAP123", status: "COMPLETED" }] },
      },
    ],
  } as unknown as PayPalOrder;
  const getOrder = spy<[string], PayPalOrder>(async () => order);
  const dossier = await draftDossier("PP-D-REAL-1", { llm: offlineLlm(), getOrder, client });
  assert.deepEqual(getOrder.calls, [["ORDER-1"]]);
  assert.equal(dossier.strength, "STRONG");

  await approveDossier("PP-D-REAL-1", dossier.version, { client });
  const provideEvidence = spy<[string, unknown], unknown>(async () => ({ links: [] }));
  const done = await submitDossier("PP-D-REAL-1", dossier.version, { provideEvidence, client });
  assert.equal(provideEvidence.calls.length, 1);
  assert.equal(provideEvidence.calls[0]![0], "PP-D-REAL-1");
  assert.equal(done.dossier?.status, "SUBMITTED");
  assert.equal(done.demo, false);
});
