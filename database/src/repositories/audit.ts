// Append-only, hash-chained audit_events repository + chain verifier.

import { createHash } from "node:crypto";
import { AuditEvent, type Pillar } from "@guardrail/apis/domain";
import { db, type DbClient, type Queryable } from "../client";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditRecordInput {
  at?: string;
  pillar: Pillar;
  actor: AuditEvent["actor"];
  action: string;
  entity: string;
  entityId: string;
  outcome?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

type AuditRow = {
  seq: string | number;
  at: Date | string;
  pillar: Pillar;
  actor: AuditEvent["actor"];
  action: string;
  entity: string;
  entity_id: string;
  outcome: string | null;
  summary: string;
  data: Record<string, unknown> | null;
  prev_hash: string;
  hash: string;
};

function toIsoString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeJsonValue(item)));
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const entry = obj[key];
    if (entry !== undefined) {
      sorted[key] = normalizeJsonValue(entry);
    }
  }
  return sorted;
}

/** Deterministic JSON string independent of JS/JSONB key insertion order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

export interface AuditHashPayload {
  prevHash: string;
  seq: number;
  at: string;
  pillar: Pillar;
  actor: AuditEvent["actor"];
  action: string;
  entity: string;
  entityId: string;
  outcome: string | null;
  summary: string;
  data: Record<string, unknown>;
}

export function computeAuditHash(payload: AuditHashPayload): string {
  const normalizedAt = new Date(payload.at).toISOString();
  const body = canonicalJson({
    seq: payload.seq,
    at: normalizedAt,
    pillar: payload.pillar,
    actor: payload.actor,
    action: payload.action,
    entity: payload.entity,
    entityId: payload.entityId,
    outcome: payload.outcome,
    summary: payload.summary,
    data: payload.data,
  });
  return createHash("sha256").update(`${payload.prevHash}|${body}`).digest("hex");
}

function mapAuditRow(row: AuditRow): AuditEvent {
  return AuditEvent.parse({
    seq: Number(row.seq),
    at: toIsoString(row.at),
    pillar: row.pillar,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    outcome: row.outcome,
    summary: row.summary,
    data: row.data ?? {},
    hash: row.hash,
  });
}

/**
 * Appends an audit event inside an active transaction, locking audit_events so
 * concurrent transactions cannot fork prev_hash or sequence numbers.
 */
export async function recordAuditInTx(
  tx: Queryable,
  input: AuditRecordInput,
): Promise<AuditEvent> {
  await tx.query("LOCK TABLE audit_events IN EXCLUSIVE MODE");

  const prevRes = await tx.query<{ seq: string | number; hash: string }>(
    "SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1",
  );
  const prevRow = prevRes.rows[0];
  const prevHash = prevRow?.hash ?? GENESIS_HASH;

  const seqRes = await tx.query<{ seq: string | number }>(
    "SELECT nextval(pg_get_serial_sequence('audit_events', 'seq')) AS seq",
  );
  const seq = Number(seqRes.rows[0].seq);
  if (prevRow && seq <= Number(prevRow.seq)) {
    throw new Error(`Audit sequence regression: next seq ${seq} <= previous seq ${prevRow.seq}`);
  }

  const at = new Date(input.at ?? Date.now()).toISOString();
  const outcome = input.outcome ?? null;
  const data = (normalizeJsonValue(input.data ?? {}) ?? {}) as Record<string, unknown>;

  const hash = computeAuditHash({
    prevHash,
    seq,
    at,
    pillar: input.pillar,
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    outcome,
    summary: input.summary,
    data,
  });

  const inserted = await tx.query<AuditRow>(
    `INSERT INTO audit_events (
       seq, at, pillar, actor, action, entity, entity_id, outcome, summary, data, prev_hash, hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
     RETURNING seq, at, pillar, actor, action, entity, entity_id, outcome, summary, data, prev_hash, hash`,
    [
      seq,
      at,
      input.pillar,
      input.actor,
      input.action,
      input.entity,
      input.entityId,
      outcome,
      input.summary,
      JSON.stringify(data),
      prevHash,
      hash,
    ],
  );

  return mapAuditRow(inserted.rows[0]);
}

export async function recordAuditEvent(
  input: AuditRecordInput,
  client?: DbClient,
): Promise<AuditEvent> {
  const active = client ?? (await db());
  return active.withTx((tx) => recordAuditInTx(tx, input));
}

export async function listAuditEvents(client?: DbClient): Promise<AuditEvent[]> {
  const active = client ?? (await db());
  const { rows } = await active.query<AuditRow>(
    `SELECT seq, at, pillar, actor, action, entity, entity_id, outcome, summary, data, prev_hash, hash
     FROM audit_events
     ORDER BY seq DESC`,
  );
  return rows.map(mapAuditRow);
}

export type AuditVerificationResult =
  | { ok: true; checked: number; headHash: string }
  | { ok: false; checked: number; brokenAtSeq: number; reason: string };

export async function verifyAuditChain(client?: DbClient): Promise<AuditVerificationResult> {
  const active = client ?? (await db());
  const { rows } = await active.query<AuditRow>(
    `SELECT seq, at, pillar, actor, action, entity, entity_id, outcome, summary, data, prev_hash, hash
     FROM audit_events
     ORDER BY seq ASC`,
  );

  let expectedPrevHash = GENESIS_HASH;
  let prevSeq = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const seq = Number(row.seq);
    const at = toIsoString(row.at);

    if (seq <= prevSeq) {
      return {
        ok: false,
        checked: i + 1,
        brokenAtSeq: seq,
        reason: `Non-monotonic sequence: seq ${seq} follows ${prevSeq}`,
      };
    }

    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        checked: i + 1,
        brokenAtSeq: seq,
        reason: `Broken prev_hash link at seq ${seq}: expected ${expectedPrevHash}, found ${row.prev_hash}`,
      };
    }

    const expectedHash = computeAuditHash({
      prevHash: row.prev_hash,
      seq,
      at,
      pillar: row.pillar,
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      outcome: row.outcome,
      summary: row.summary,
      data: row.data ?? {},
    });

    if (row.hash !== expectedHash) {
      return {
        ok: false,
        checked: i + 1,
        brokenAtSeq: seq,
        reason: `Hash mismatch at seq ${seq}: stored ${row.hash} does not match recomputed ${expectedHash}`,
      };
    }

    expectedPrevHash = row.hash;
    prevSeq = seq;
  }

  return {
    ok: true,
    checked: rows.length,
    headHash: expectedPrevHash,
  };
}
