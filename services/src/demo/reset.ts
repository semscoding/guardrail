// "Reset demo": back to a clean demo state between video takes, without breaking our own principle.
// Runs, payments, invoices, disputes and the denylist are cleared; the audit log is NOT. It is
// append-only, so the reset itself becomes an audit entry. Open PayPal authorizations are voided
// first, so no hold stays on the sandbox wallet.

import type { Logger } from "@guardrail/apis/domain";
import type { Llm } from "@guardrail/apis/llm";
import { db, recordAuditInTx, seed } from "@guardrail/database";

import { seedDemoInvoices } from "../invoices";

const CLEARED_TABLES = [
  "run_events",
  "policy_decisions",
  "proposals",
  "payments",
  "runs",
  "invoice_findings",
  "payee_denylist",
  "inbound_invoices",
  "dispute_dossiers",
  "dispute_evidence",
  "disputes",
] as const;

export type ResetDeps = {
  voidAuthorization: (authorizationId: string, requestId?: string) => Promise<unknown>;
  llm: Llm;
  log?: Logger;
};

export type ResetResult = { voided: number; voidFailed: number; cleared: string[]; invoices: number };

export async function resetDemo(deps: ResetDeps): Promise<ResetResult> {
  const client = await db();

  const { rows: open } = await client.query<{ authorization_id: string }>(
    "SELECT authorization_id FROM payments WHERE status = 'AUTHORIZED' AND authorization_id IS NOT NULL",
  );
  let voided = 0;
  let voidFailed = 0;
  for (const { authorization_id } of open) {
    try {
      await deps.voidAuthorization(authorization_id, `reset:${authorization_id}`);
      voided += 1;
    } catch (err) {
      // An expired or already-voided authorization must not block the reset.
      voidFailed += 1;
      deps.log?.warn("demo.reset.void_failed", { authorizationId: authorization_id, cause: err instanceof Error ? err.message : String(err) });
    }
  }

  await client.withTx(async (tx) => {
    for (const table of CLEARED_TABLES) await tx.query(`DELETE FROM ${table}`);
    await recordAuditInTx(tx, {
      pillar: "system",
      actor: "user",
      action: "demo.reset",
      entity: "demo",
      entityId: "demo",
      outcome: null,
      summary: `Demo reset: cleared runs, payments, invoices and disputes; ${voided} open authorization(s) voided`,
      data: { cleared: [...CLEARED_TABLES], voided, voidFailed },
    });
  });

  await seed(client);
  const invoices = await seedDemoInvoices(deps.llm, deps.log);
  deps.log?.info("demo.reset", { voided, voidFailed, invoices: invoices.length });
  return { voided, voidFailed, cleared: [...CLEARED_TABLES], invoices: invoices.length };
}
