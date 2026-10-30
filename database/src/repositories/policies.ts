// Repository for versioned spending policies. Vault IDs stay server-side; domain PolicyVersion only exposes paypalLinked.

import { PolicyVersion } from "@guardrail/apis/domain";
import { db, type DbClient, type Queryable } from "../client";

type PolicyVersionRow = {
  policy_id: string;
  version: number;
  name: string;
  rules: unknown;
  valid_until: Date | string;
  vault_id: string | null;
  paypal_linked: boolean;
  created_at: Date | string;
};

function toIsoString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

function mapPolicyRow(row: PolicyVersionRow): PolicyVersion {
  return PolicyVersion.parse({
    policyId: row.policy_id,
    version: row.version,
    name: row.name,
    rules: row.rules,
    validUntil: toIsoString(row.valid_until),
    paypalLinked: row.paypal_linked || Boolean(row.vault_id),
    createdAt: toIsoString(row.created_at),
  });
}

export async function getActivePolicy(
  policyId: string,
  client?: DbClient,
): Promise<PolicyVersion | null> {
  const active = client ?? (await db());
  const { rows } = await active.query<PolicyVersionRow>(
    `SELECT pv.policy_id, pv.version, pv.name, pv.rules, pv.valid_until, pv.vault_id, pv.paypal_linked, pv.created_at
     FROM policies p
     JOIN policy_versions pv
       ON pv.policy_id = p.id AND pv.version = p.active_version
     WHERE p.id = $1`,
    [policyId],
  );
  return rows[0] ? mapPolicyRow(rows[0]) : null;
}

export async function getPolicyVersion(
  policyId: string,
  version: number,
  client?: DbClient,
): Promise<PolicyVersion | null> {
  const active = client ?? (await db());
  const { rows } = await active.query<PolicyVersionRow>(
    `SELECT policy_id, version, name, rules, valid_until, vault_id, paypal_linked, created_at
     FROM policy_versions
     WHERE policy_id = $1 AND version = $2`,
    [policyId, version],
  );
  return rows[0] ? mapPolicyRow(rows[0]) : null;
}

/**
 * Inserts a policy version if not yet present. Returns true when newly inserted, false when already seeded.
 */
export async function insertPolicyVersionInTx(
  tx: Queryable,
  policy: PolicyVersion,
  options: { vaultId?: string | null; createdBy?: string } = {},
): Promise<boolean> {
  const parsed = PolicyVersion.parse(policy);
  const existing = await tx.query<{ version: number }>(
    "SELECT version FROM policy_versions WHERE policy_id = $1 AND version = $2",
    [parsed.policyId, parsed.version],
  );
  if (existing.rows.length > 0) {
    return false;
  }

  await tx.query(
    `INSERT INTO policies (id, name, active_version, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           active_version = GREATEST(policies.active_version, EXCLUDED.active_version)`,
    [parsed.policyId, parsed.name, parsed.version, parsed.createdAt],
  );

  const vaultId = options.vaultId ?? null;
  await tx.query(
    `INSERT INTO policy_versions (
       policy_id, version, name, rules, valid_until, vault_id, paypal_linked, created_by, created_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
    [
      parsed.policyId,
      parsed.version,
      parsed.name,
      JSON.stringify(parsed.rules),
      parsed.validUntil,
      vaultId,
      parsed.paypalLinked || Boolean(vaultId),
      options.createdBy ?? "system",
      parsed.createdAt,
    ],
  );

  return true;
}
