// SQL for disputes, evidence and dossiers. Maps rows to the domain types in @guardrail/apis/domain.
// dispute_dossiers.body holds { sections, draftedBy, note }; the seed stores a bare sections array.

import { Dispute, DisputeReason, Dossier, Evidence, type Money } from "@guardrail/apis/domain";
import { db, numericToMoney, type DbClient, type Queryable } from "@guardrail/database";

export type DossierBody = {
  sections: Dossier["sections"];
  draftedBy?: Dossier["draftedBy"];
  note?: string | null;
  submission?: Record<string, unknown>;
};

type DisputeRow = {
  id: string;
  order_id: string | null;
  reason: string;
  status: string;
  amount: string;
  currency: string;
  seller_response_due: Date | string | null;
  raw: Record<string, unknown> | null;
};

type EvidenceRow = {
  id: string;
  dispute_id: string;
  kind: Evidence["kind"];
  source: Evidence["source"];
  summary: string;
  payload: Record<string, unknown> | null;
  collected_at: Date | string;
};

type DossierRow = {
  dispute_id: string;
  version: number;
  strength: "STRONG" | "WEAK";
  missing_evidence: Evidence["kind"][] | null;
  body: DossierBody | Dossier["sections"];
  status: Dossier["status"];
  approved_at: Date | string | null;
  submitted_at: Date | string | null;
};

const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();
const isoOrNull = (v: Date | string | null) => (v === null ? null : iso(v));

export const client = async (c?: DbClient): Promise<DbClient> => c ?? (await db());

export function bodyOf(row: Pick<DossierRow, "body">): DossierBody {
  return Array.isArray(row.body) ? { sections: row.body, draftedBy: "demo_seed" } : row.body;
}

function mapDossier(row: DossierRow): Dossier {
  const body = bodyOf(row);
  return Dossier.parse({
    disputeId: row.dispute_id,
    version: row.version,
    strength: row.strength,
    missingEvidence: row.missing_evidence ?? [],
    sections: body.sections,
    status: row.status,
    draftedBy: body.draftedBy,
    note: body.note ?? null,
    approvedAt: isoOrNull(row.approved_at),
    submittedAt: isoOrNull(row.submitted_at),
  });
}

function mapEvidence(row: EvidenceRow): Evidence {
  return Evidence.parse({
    id: row.id,
    kind: row.kind,
    source: row.source,
    summary: row.summary,
    collectedAt: iso(row.collected_at),
    data: row.payload ?? {},
  });
}

export const isDemo = (row: { raw: Record<string, unknown> | null }) => row.raw?.seeded === true;

export async function getDisputeRow(q: Queryable, id: string): Promise<DisputeRow | null> {
  const { rows } = await q.query<DisputeRow>(
    "SELECT id, order_id, reason, status, amount::text AS amount, currency, seller_response_due, raw FROM disputes WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function listEvidence(q: Queryable, disputeId: string): Promise<Evidence[]> {
  const { rows } = await q.query<EvidenceRow>(
    "SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY collected_at, id",
    [disputeId],
  );
  return rows.map(mapEvidence);
}

export async function latestDossierRow(q: Queryable, disputeId: string): Promise<DossierRow | null> {
  const { rows } = await q.query<DossierRow>(
    "SELECT * FROM dispute_dossiers WHERE dispute_id = $1 ORDER BY version DESC LIMIT 1",
    [disputeId],
  );
  return rows[0] ?? null;
}

export async function dossierRow(q: Queryable, disputeId: string, version: number): Promise<DossierRow | null> {
  const { rows } = await q.query<DossierRow>(
    "SELECT * FROM dispute_dossiers WHERE dispute_id = $1 AND version = $2",
    [disputeId, version],
  );
  return rows[0] ?? null;
}

export async function hasSubmittedDossier(q: Queryable, disputeId: string): Promise<boolean> {
  const { rows } = await q.query("SELECT 1 FROM dispute_dossiers WHERE dispute_id = $1 AND status = 'SUBMITTED'", [
    disputeId,
  ]);
  return rows.length > 0;
}

export const toDossier = (row: DossierRow) => mapDossier(row);

async function assemble(q: Queryable, row: DisputeRow): Promise<Dispute> {
  const latest = await latestDossierRow(q, row.id);
  const amount: Money = numericToMoney(row.amount, row.currency);
  return Dispute.parse({
    id: row.id,
    orderId: row.order_id,
    reason: DisputeReason.catch("OTHER").parse(row.reason),
    status: row.status,
    amount,
    sellerResponseDue: isoOrNull(row.seller_response_due),
    evidence: await listEvidence(q, row.id),
    dossier: latest ? mapDossier(latest) : null,
    demo: isDemo(row),
  });
}

/** All disputes, soonest seller deadline first. */
export async function listDisputes(c?: DbClient): Promise<Dispute[]> {
  const active = await client(c);
  const { rows } = await active.query<DisputeRow>(
    `SELECT id, order_id, reason, status, amount::text AS amount, currency, seller_response_due, raw
     FROM disputes ORDER BY seller_response_due ASC NULLS LAST, updated_at DESC`,
  );
  return Promise.all(rows.map((r) => assemble(active, r)));
}

export async function getDispute(id: string, c?: DbClient): Promise<Dispute | null> {
  const active = await client(c);
  const row = await getDisputeRow(active, id);
  return row ? assemble(active, row) : null;
}

export async function getDisputeIn(q: Queryable, id: string): Promise<Dispute | null> {
  const row = await getDisputeRow(q, id);
  return row ? assemble(q, row) : null;
}
