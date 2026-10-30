// Repository for pillar 1 agent runs: runs, their stored SSE events (run_events), the agent's
// proposal and the policy engine's decision. Payments live in the payments table (services/payments).

import { RunEvent } from "@guardrail/apis/contracts";
import {
  Decision,
  PaymentSummary,
  PurchaseProposal,
  Run,
  type PaymentStatus,
  type RunStatus,
} from "@guardrail/apis/domain";
import { db, type DbClient, type Queryable } from "../client";
import { moneyToNumeric, numericToMoney } from "../money";

function toIsoString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

const FINAL_STATUSES: readonly RunStatus[] = ["ALLOWED", "BLOCKED", "NEEDS_APPROVAL", "FAILED"];

export async function insertRun(
  run: { id: string; policyId: string; policyVersion: number; command: string },
  client?: Queryable,
): Promise<void> {
  const active = client ?? (await db());
  await active.query(
    `INSERT INTO runs (id, policy_id, policy_version, command, status) VALUES ($1, $2, $3, $4, 'RUNNING')`,
    [run.id, run.policyId, run.policyVersion, run.command],
  );
}

/** Final statuses also set finished_at; RUNNING/PROPOSED clear it. */
export async function updateRunStatus(id: string, status: RunStatus, client?: Queryable): Promise<void> {
  const active = client ?? (await db());
  const final = FINAL_STATUSES.includes(status);
  await active.query(
    `UPDATE runs SET status = $2, finished_at = CASE WHEN $3::boolean THEN now() ELSE NULL END WHERE id = $1`,
    [id, status, final],
  );
}

/** Distributive Omit so each RunEvent variant keeps its own fields. */
export type NewRunEvent = RunEvent extends infer E ? (E extends RunEvent ? Omit<E, "runId" | "seq" | "at"> : never) : never;

/**
 * Appends one event with the next seq for the run and returns the full, contract-valid event.
 * Callers serialize writes per run (one writer at a time), so MAX(seq)+1 cannot collide.
 */
export async function appendRunEvent(runId: string, event: NewRunEvent, client?: Queryable): Promise<RunEvent> {
  const active = client ?? (await db());
  const { rows } = await active.query<{ seq: number }>(
    "SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM run_events WHERE run_id = $1",
    [runId],
  );
  const seq = Number(rows[0].seq);
  const full = RunEvent.parse({ ...event, runId, seq, at: new Date().toISOString() });
  await active.query(
    `INSERT INTO run_events (run_id, seq, type, payload, at) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [runId, seq, full.type, JSON.stringify(full), full.at],
  );
  return full;
}

export async function listRunEvents(runId: string, client?: Queryable): Promise<RunEvent[]> {
  const active = client ?? (await db());
  const { rows } = await active.query<{ payload: unknown }>(
    "SELECT payload FROM run_events WHERE run_id = $1 ORDER BY seq ASC",
    [runId],
  );
  return rows.map((r) => RunEvent.parse(r.payload));
}

export async function insertProposalInTx(
  tx: Queryable,
  input: { id: string; runId: string; proposal: PurchaseProposal },
): Promise<void> {
  const p = PurchaseProposal.parse(input.proposal);
  const claimed = p.claims.total ? moneyToNumeric(p.claims.total) : null;
  await tx.query(
    `INSERT INTO proposals (id, run_id, shop_id, product_id, source, quantity, claimed_total, claimed_currency, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.id,
      input.runId,
      p.shopId,
      p.productId,
      p.source,
      p.quantity,
      claimed?.amount ?? null,
      claimed?.currency ?? null,
      JSON.stringify(p),
    ],
  );
}

export async function insertPolicyDecisionInTx(
  tx: Queryable,
  input: { id: string; runId: string; decision: Decision },
): Promise<void> {
  const d = Decision.parse(input.decision);
  await tx.query(
    `INSERT INTO policy_decisions (id, run_id, outcome, checks, decided_at) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [input.id, input.runId, d.outcome, JSON.stringify(d.checks), d.decidedAt],
  );
}

type RunRow = {
  id: string;
  policy_id: string;
  policy_version: number;
  command: string;
  status: RunStatus;
  started_at: Date | string;
  finished_at: Date | string | null;
};

type PaymentRow = {
  order_id: string;
  authorization_id: string | null;
  capture_id: string | null;
  amount: string | null;
  currency: string | null;
  payee_email: string | null;
  status: PaymentStatus;
  webhook_verified: boolean;
};

export function paymentRowToSummary(row: PaymentRow): PaymentSummary {
  return PaymentSummary.parse({
    orderId: row.order_id,
    authorizationId: row.authorization_id,
    captureId: row.capture_id,
    amount: numericToMoney(String(row.amount ?? "0"), row.currency ?? "EUR"),
    payeeEmail: row.payee_email,
    status: row.status,
    webhookVerified: row.webhook_verified,
  });
}

/** The run as the API returns it, assembled from runs, proposals, policy_decisions and payments. */
export async function getRun(id: string, client?: DbClient): Promise<Run | null> {
  const active = client ?? (await db());
  const { rows } = await active.query<RunRow>(
    "SELECT id, policy_id, policy_version, command, status, started_at, finished_at FROM runs WHERE id = $1",
    [id],
  );
  const run = rows[0];
  if (!run) return null;

  const [proposal, decision, payment] = await Promise.all([
    active.query<{ raw: unknown }>("SELECT raw FROM proposals WHERE run_id = $1", [id]),
    active.query<{ outcome: string; checks: unknown; decided_at: Date | string }>(
      "SELECT outcome, checks, decided_at FROM policy_decisions WHERE run_id = $1",
      [id],
    ),
    active.query<PaymentRow>(
      `SELECT order_id, authorization_id, capture_id, amount, currency, payee_email, status, webhook_verified
       FROM payments WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    ),
  ]);

  const d = decision.rows[0];
  return Run.parse({
    id: run.id,
    policyId: run.policy_id,
    policyVersion: run.policy_version,
    command: run.command,
    status: run.status,
    startedAt: toIsoString(run.started_at),
    finishedAt: run.finished_at ? toIsoString(run.finished_at) : null,
    proposal: proposal.rows[0] ? PurchaseProposal.parse(proposal.rows[0].raw) : null,
    decision: d ? { outcome: d.outcome, checks: d.checks, decidedAt: toIsoString(d.decided_at) } : null,
    payment: payment.rows[0] ? paymentRowToSummary(payment.rows[0]) : null,
  });
}
