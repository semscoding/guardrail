// Read side of the audit log for the UI (AG Grid). Writing goes through recordAuditInTx in the
// same transaction as the change it records.

import type { AuditEvent, Pillar } from "@guardrail/apis/domain";
import { listAuditEvents } from "@guardrail/database";

export type AuditFilter = { pillar?: Pillar; outcome?: string; limit: number };

export async function queryAudit(filter: AuditFilter): Promise<AuditEvent[]> {
  // Newest first. The log is small for the demo; move the filter into SQL when it grows.
  const events = await listAuditEvents();
  return events
    .filter((e) => (!filter.pillar || e.pillar === filter.pillar) && (!filter.outcome || e.outcome === filter.outcome))
    .slice(0, filter.limit);
}
