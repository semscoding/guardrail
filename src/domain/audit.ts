// One row of the append-only, hash-chained audit log. Flat on purpose: it feeds AG Grid directly.

import { z } from "zod";

export const Pillar = z.enum(["purchasing", "invoices", "disputes", "system"]);
export type Pillar = z.infer<typeof Pillar>;

export const Actor = z.enum(["agent", "engine", "user", "paypal", "system"]);

export const AuditEvent = z.object({
  seq: z.number().int().positive(),
  at: z.iso.datetime(),
  pillar: Pillar,
  actor: Actor,
  /** domain.action, e.g. "policy.decision", "payment.captured", "dossier.submitted". */
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  /** ALLOW / BLOCK / SCAM / SUBMITTED …, when the event has one. */
  outcome: z.string().nullable(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()),
  hash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
