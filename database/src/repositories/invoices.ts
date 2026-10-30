// Repository for Invoice Shield (pillar 2): inbound invoices, their findings, and the payee denylist
// that rule R10 of the policy engine reads. Money is stored as numeric(10,2) and converted exactly.

import { InboundInvoice, type Finding } from "@guardrail/apis/domain";
import { db, type DbClient, type Queryable } from "../client";
import { moneyToNumeric, numericToMoney } from "../money";

type InvoiceRow = {
  id: string;
  source: InboundInvoice["source"];
  paypal_invoice_id: string | null;
  payee_email: string | null;
  amount: string | null;
  currency: string | null;
  raw_text: string;
  verdict: InboundInvoice["verdict"];
  payee_blocked: boolean;
  received_at: Date | string;
  analysis_mode: InboundInvoice["analysis"]["mode"];
  tactic: string | null;
};

type FindingRow = {
  invoice_id: string;
  signal: Finding["kind"];
  span_start: number;
  span_end: number;
  excerpt: string;
  explanation: string;
  rule_or_llm: Finding["detectedBy"];
};

const toIso = (val: Date | string) => (val instanceof Date ? val : new Date(val)).toISOString();

function mapInvoice(row: InvoiceRow, findings: FindingRow[], denylisted: boolean): InboundInvoice {
  return InboundInvoice.parse({
    id: row.id,
    source: row.source,
    paypalInvoiceId: row.paypal_invoice_id,
    payeeEmail: row.payee_email,
    amount: row.amount !== null && row.currency ? numericToMoney(String(row.amount), row.currency) : null,
    text: row.raw_text,
    receivedAt: toIso(row.received_at),
    verdict: row.verdict,
    findings: findings.map((f) => ({
      kind: f.signal,
      span: { start: f.span_start, end: f.span_end },
      excerpt: f.excerpt,
      explanation: f.explanation,
      detectedBy: f.rule_or_llm,
    })),
    payeeBlocked: row.payee_blocked || denylisted,
    analysis: { mode: row.analysis_mode, tactic: row.tactic },
  });
}

const INVOICE_COLUMNS = `i.id, i.source, i.paypal_invoice_id, i.payee_email, i.amount::text AS amount, i.currency,
  i.raw_text, i.verdict, i.payee_blocked, i.received_at, i.analysis_mode, i.tactic,
  (d.payee_email IS NOT NULL) AS denylisted`;

async function loadInvoices(q: Queryable, where: string, params: unknown[]): Promise<InboundInvoice[]> {
  const { rows } = await q.query<InvoiceRow & { denylisted: boolean }>(
    `SELECT ${INVOICE_COLUMNS}
     FROM inbound_invoices i
     LEFT JOIN payee_denylist d ON lower(d.payee_email) = lower(i.payee_email)
     ${where}
     ORDER BY i.received_at DESC, i.id ASC`,
    params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { rows: findings } = await q.query<FindingRow>(
    `SELECT invoice_id, signal, span_start, span_end, excerpt, explanation, rule_or_llm
     FROM invoice_findings WHERE invoice_id = ANY($1::text[]) ORDER BY span_start ASC, id ASC`,
    [ids],
  );
  return rows.map((r) =>
    mapInvoice(
      r,
      findings.filter((f) => f.invoice_id === r.id),
      r.denylisted,
    ),
  );
}

export async function listInboundInvoices(client?: DbClient): Promise<InboundInvoice[]> {
  return loadInvoices(client ?? (await db()), "", []);
}

export async function getInboundInvoice(id: string, q?: Queryable): Promise<InboundInvoice | null> {
  const [invoice] = await loadInvoices(q ?? (await db()), "WHERE i.id = $1", [id]);
  return invoice ?? null;
}

/** Inserts the invoice and all its findings. Call inside the transaction that also writes the audit event. */
export async function insertInboundInvoiceInTx(tx: Queryable, invoice: InboundInvoice): Promise<void> {
  const money = invoice.amount ? moneyToNumeric(invoice.amount) : null;
  await tx.query(
    `INSERT INTO inbound_invoices (
       id, source, paypal_invoice_id, payee_email, amount, currency, raw_text, verdict, payee_blocked,
       received_at, analysis_mode, tactic
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      invoice.id,
      invoice.source,
      invoice.paypalInvoiceId,
      invoice.payeeEmail,
      money?.amount ?? null,
      money?.currency ?? null,
      invoice.text,
      invoice.verdict,
      invoice.payeeBlocked,
      invoice.receivedAt,
      invoice.analysis.mode,
      invoice.analysis.tactic,
    ],
  );
  for (const f of invoice.findings) {
    await tx.query(
      `INSERT INTO invoice_findings (invoice_id, signal, span_start, span_end, excerpt, explanation, rule_or_llm)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [invoice.id, f.kind, f.span.start, f.span.end, f.excerpt, f.explanation, f.detectedBy],
    );
  }
}

/** Adds the payee to the denylist (idempotent) and marks the source invoice. Returns false if it was already listed. */
export async function denylistPayeeInTx(
  tx: Queryable,
  input: { payeeEmail: string; reason: string; sourceInvoiceId: string; addedBy?: string },
): Promise<boolean> {
  const { rows } = await tx.query<{ payee_email: string }>(
    `INSERT INTO payee_denylist (payee_email, reason, source_invoice_id, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (payee_email) DO NOTHING
     RETURNING payee_email`,
    [input.payeeEmail.toLowerCase(), input.reason, input.sourceInvoiceId, input.addedBy ?? "user"],
  );
  await tx.query("UPDATE inbound_invoices SET payee_blocked = true WHERE id = $1", [input.sourceInvoiceId]);
  return rows.length > 0;
}

export async function listDeniedPayees(client?: DbClient): Promise<string[]> {
  const active = client ?? (await db());
  const { rows } = await active.query<{ payee_email: string }>("SELECT payee_email FROM payee_denylist ORDER BY added_at");
  return rows.map((r) => r.payee_email);
}
