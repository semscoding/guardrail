// Invoice Shield (pillar 2): analyse an inbound invoice with fixed rules plus the triage LLM, store it
// with its findings, and let the user block the payee (rule R10 then refuses any payment to them).
// Plain functions with dependencies as parameters; never pays or reports anything on its own.

import { randomUUID } from "node:crypto";
import type { InboundInvoice, Logger, Money } from "@guardrail/apis/domain";
import { formatMoney } from "@guardrail/apis/domain";
import type { Llm } from "@guardrail/apis/llm";
import {
  denylistPayeeInTx,
  getInboundInvoice,
  insertInboundInvoiceInTx,
  listInboundInvoices,
  recordAuditInTx,
  withTx,
  type DbClient,
} from "@guardrail/database";

import { classifyWithLlm } from "./classify";
import { extractAmount, extractPayeeEmail } from "./extract";
import { runRules } from "./rules";
import { decideVerdict } from "./verdict";

export { classifyWithLlm, LlmTriage, reconcileLlmFindings } from "./classify";
export { extractAmount, extractPayeeEmail, parseCents } from "./extract";
export { runRules } from "./rules";
export { decideVerdict, STRONG_SIGNALS } from "./verdict";

export type AnalyzeInput = {
  text: string;
  /** Known from invoice metadata (PayPal invoice, seed); otherwise extracted from the text. */
  payeeEmail?: string | null;
  amount?: Money | null;
  source?: InboundInvoice["source"];
  paypalInvoiceId?: string | null;
  id?: string;
  receivedAt?: string;
};

export type InvoiceDeps = { llm: Llm; client?: DbClient; log?: Logger };

const SIGNAL_NAMES: Record<string, string> = {
  PHONE_NUMBER: "phone number",
  BRAND_IMPERSONATION: "brand impersonation",
  URGENCY: "urgency",
  CALL_TO_CANCEL: "call to cancel",
  UNKNOWN_PAYEE: "unknown payee",
  CRYPTO: "crypto",
  AMOUNT_PATTERN: "amount pattern",
  OTHER: "other",
};

/** Rules first, then the LLM; the verdict is decided by code. Pure apart from the LLM call. */
export async function assessInvoice(input: AnalyzeInput, llm: Llm, log?: Logger): Promise<InboundInvoice> {
  const text = input.text;
  const payeeEmail = input.payeeEmail !== undefined ? input.payeeEmail : extractPayeeEmail(text);
  const amount = input.amount !== undefined ? input.amount : extractAmount(text);
  const ruleFindings = runRules(text, payeeEmail);
  const { analysis, findings: llmFindings } = await classifyWithLlm(llm, text, ruleFindings, (err) =>
    log?.warn("invoice.llm_failed", { message: err instanceof Error ? err.message : "unknown" }),
  );
  const findings = [...ruleFindings, ...llmFindings].sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  return {
    id: input.id ?? `inv_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    source: input.source ?? "PASTE",
    paypalInvoiceId: input.paypalInvoiceId ?? null,
    payeeEmail,
    amount,
    text,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    verdict: decideVerdict(findings),
    findings,
    payeeBlocked: false,
    analysis,
  };
}

/** Analyses, stores the invoice + findings and writes the invoice.verdict audit event in one transaction. */
export async function analyzeInvoice(input: AnalyzeInput, deps: InvoiceDeps): Promise<InboundInvoice> {
  const invoice = await assessInvoice(input, deps.llm, deps.log);
  const kinds = [...new Set(invoice.findings.map((f) => SIGNAL_NAMES[f.kind]))];
  await withTx(async (tx) => {
    await insertInboundInvoiceInTx(tx, invoice);
    await recordAuditInTx(tx, {
      pillar: "invoices",
      actor: "engine",
      action: "invoice.verdict",
      entity: "invoice",
      entityId: invoice.id,
      outcome: invoice.verdict,
      summary: invoice.findings.length
        ? `${invoice.findings.length} signal${invoice.findings.length === 1 ? "" : "s"}: ${kinds.join(", ")}`
        : "No scam signals",
      data: {
        source: invoice.source,
        payeeEmail: invoice.payeeEmail,
        amount: invoice.amount ? formatMoney(invoice.amount) : null,
        ruleFindings: invoice.findings.filter((f) => f.detectedBy === "rule").length,
        llmFindings: invoice.findings.filter((f) => f.detectedBy === "llm").length,
        analysisMode: invoice.analysis.mode,
      },
    });
  }, deps.client);
  deps.log?.info("invoice.verdict", { invoiceId: invoice.id, verdict: invoice.verdict, mode: invoice.analysis.mode });
  return (await getInboundInvoice(invoice.id, deps.client)) ?? invoice;
}

export const listInvoices = (client?: DbClient): Promise<InboundInvoice[]> => listInboundInvoices(client);

export const getInvoice = (id: string, client?: DbClient) => getInboundInvoice(id, client);

export type BlockPayeeResult =
  | { ok: true; payeeEmail: string; blocked: true }
  | { ok: false; reason: "NOT_FOUND" | "NO_PAYEE" };

/** Adds the invoice's payee to payee_denylist (read by policy rule R10) and audits it. Idempotent. */
export async function blockPayee(invoiceId: string, deps: { client?: DbClient; log?: Logger } = {}): Promise<BlockPayeeResult> {
  return withTx(async (tx) => {
    const invoice = await getInboundInvoice(invoiceId, tx);
    if (!invoice) return { ok: false, reason: "NOT_FOUND" } as const;
    if (!invoice.payeeEmail) return { ok: false, reason: "NO_PAYEE" } as const;
    const payeeEmail = invoice.payeeEmail.toLowerCase();
    const added = await denylistPayeeInTx(tx, {
      payeeEmail,
      reason: `Invoice ${invoice.id} judged ${invoice.verdict}`,
      sourceInvoiceId: invoice.id,
    });
    if (added) {
      await recordAuditInTx(tx, {
        pillar: "invoices",
        actor: "user",
        action: "payee.blocked",
        entity: "payee",
        entityId: payeeEmail,
        outcome: "BLOCKED",
        summary: `Blocked ${payeeEmail} after invoice ${invoice.id} (${invoice.verdict})`,
        data: { invoiceId: invoice.id, verdict: invoice.verdict },
      });
      deps.log?.info("payee.blocked", { invoiceId: invoice.id });
    }
    return { ok: true, payeeEmail, blocked: true } as const;
  }, deps.client);
}
export { seedDemoInvoices, type SeededInvoice } from "./seed";
