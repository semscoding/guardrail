// Postgres when DATABASE_URL is set (Render), otherwise an embedded PGlite database in .data/
// (same SQL, nothing to install). Both expose query(text, params) → { rows }.

import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";

type Row = Record<string, unknown>;
type Client = { query: <T extends Row = Row>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS payments (
    order_id          text PRIMARY KEY,
    authorization_id  text,
    capture_id        text,
    shop_id           text,
    description       text,
    amount            numeric(10, 2),
    currency          text,
    payee_email       text,
    status            text NOT NULL,
    webhook_verified  boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS webhook_events (
    id           text PRIMARY KEY,
    event_type   text NOT NULL,
    resource_id  text,
    order_id     text,
    verified     boolean NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now(),
    payload      jsonb NOT NULL
  );
`;

// Survive Next.js dev hot reloads: one client per process.
const globalForDb = globalThis as unknown as { guardrailDb?: Promise<Client> };

async function connect(): Promise<Client> {
  let client: Client;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool: Pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = { query: async (text, params) => ({ rows: (await pool.query(text, params)).rows }) };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdir } = await import("node:fs/promises");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    await mkdir(dir, { recursive: true });
    const lite: PGlite = await PGlite.create(dir);
    client = { query: (text, params) => lite.query(text, params) };
  }
  for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await client.query(statement);
  }
  return client;
}

export function db(): Promise<Client> {
  globalForDb.guardrailDb ??= connect().catch((err) => {
    globalForDb.guardrailDb = undefined; // retry on the next request instead of caching the failure
    throw err;
  });
  return globalForDb.guardrailDb;
}
