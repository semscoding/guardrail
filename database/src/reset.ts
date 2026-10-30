// Drops all GUARDRAIL schema objects, re-applies migrations, and seeds fresh demo state.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, db, type DbClient } from "./client";
import { migrate, type MigrateResult } from "./migrate";
import { seed, type SeedResult } from "./seed";

const DROP_ALL_SQL = `
  DROP TABLE IF EXISTS
    dispute_dossiers,
    dispute_evidence,
    disputes,
    payee_denylist,
    invoice_findings,
    inbound_invoices,
    policy_decisions,
    proposals,
    run_events,
    payments,
    webhook_events,
    runs,
    policy_versions,
    policies,
    audit_events,
    schema_migrations
  CASCADE;
  DROP FUNCTION IF EXISTS forbid_audit_mutation() CASCADE;
`;

export interface ResetOptions {
  client?: DbClient;
  adminToken?: string;
}

export async function resetDatabase(
  options: ResetOptions = {},
): Promise<{ migrations: MigrateResult; seeded: SeedResult }> {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.DEMO_ADMIN_TOKEN;
    // The caller must bring the token itself (request header, CLI flag). Never fall back to the
    // server's own env var: that would make every call in production authorized.
    const provided = options.adminToken;
    if (!expected || provided !== expected) {
      throw new Error("Refusing to reset database in production without valid DEMO_ADMIN_TOKEN");
    }
  }

  const active = options.client ?? (await db());
  await active.exec(DROP_ALL_SQL);
  const migrations = await migrate(active);
  const seeded = await seed(active);
  return { migrations, seeded };
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

/** CLI: `npm run db:reset -- --token=<DEMO_ADMIN_TOKEN>` (only checked when NODE_ENV=production). */
function tokenFromArgs(argv: readonly string[]): string | undefined {
  const flag = argv.find((a) => a.startsWith("--token="));
  return flag ? flag.slice("--token=".length) : undefined;
}

if (isMain) {
  resetDatabase({ adminToken: tokenFromArgs(process.argv.slice(2)) })
    .then(({ migrations }) => {
      console.log(`ok    db:reset complete (${migrations.applied.length} migrations applied, seed loaded)`);
    })
    .catch((err) => {
      console.error("FAIL  db:reset", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
