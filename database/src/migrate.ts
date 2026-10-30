// Forward-only SQL migration runner backed by schema_migrations.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, db, type DbClient } from "./client";

const defaultMigrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(
  client?: DbClient,
  migrationsDir: string = defaultMigrationsDir,
): Promise<MigrateResult> {
  const active = client ?? (await db());

  await active.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  const entries = await readdir(migrationsDir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();

  const existing = await active.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version ASC",
  );
  const appliedSet = new Set(existing.rows.map((r) => r.version));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await active.withTx(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    });
    applied.push(file);
  }

  return { applied, skipped };
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  migrate()
    .then(({ applied, skipped }) => {
      if (applied.length === 0) {
        console.log(`ok    migrations up to date (${skipped.length} applied)`);
      } else {
        for (const name of applied) console.log(`apply ${name}`);
        console.log(`ok    applied ${applied.length} migration(s)`);
      }
    })
    .catch((err) => {
      console.error("FAIL  db:migrate", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
