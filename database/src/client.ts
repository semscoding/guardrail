// Postgres when DATABASE_URL is set (Render), otherwise an embedded PGlite database in .data/
// (same SQL, nothing to install). Both expose query(text, params), exec(sql), withTx(fn), and close().

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

export interface DbClient extends Queryable {
  withTx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  databaseUrl?: string;
  pgliteDir?: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function createDbClient(options: CreateDbOptions = {}): Promise<DbClient> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl) {
    const { Pool } = await import("pg");
    const pool: Pool = new Pool({ connectionString: databaseUrl });
    return {
      query: async <T extends Row = Row>(text: string, params?: unknown[]) => {
        const res = await pool.query(text, params);
        return { rows: res.rows as T[] };
      },
      exec: async (sql: string) => {
        // Omitting params uses PostgreSQL's simple query protocol, allowing multi-statement SQL files.
        await pool.query(sql);
      },
      withTx: async <T>(fn: (tx: Queryable) => Promise<T>): Promise<T> => {
        const pgClient = await pool.connect();
        try {
          await pgClient.query("BEGIN");
          const tx: Queryable = {
            query: async <R extends Row = Row>(text: string, params?: unknown[]) => {
              const res = await pgClient.query(text, params);
              return { rows: res.rows as R[] };
            },
            exec: async (sql: string) => {
              await pgClient.query(sql);
            },
          };
          const result = await fn(tx);
          await pgClient.query("COMMIT");
          return result;
        } catch (err) {
          await pgClient.query("ROLLBACK").catch(() => undefined);
          throw err;
        } finally {
          pgClient.release();
        }
      },
      close: async () => {
        await pool.end();
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const rawDir = options.pgliteDir ?? process.env.PGLITE_DIR;
  const dir = rawDir ?? path.join(repoRoot, ".data/pglite");

  if (!dir.startsWith("memory://")) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  }

  const lite: PGlite = await PGlite.create(dir);
  return {
    query: async <T extends Row = Row>(text: string, params?: unknown[]) => {
      const res = await lite.query<T>(text, params);
      return { rows: res.rows };
    },
    exec: async (sql: string) => {
      await lite.exec(sql);
    },
    withTx: async <T>(fn: (tx: Queryable) => Promise<T>): Promise<T> => {
      return lite.transaction(async (pgliteTx) => {
        const tx: Queryable = {
          query: async <R extends Row = Row>(text: string, params?: unknown[]) => {
            const res = await pgliteTx.query<R>(text, params);
            return { rows: res.rows };
          },
          exec: async (sql: string) => {
            await pgliteTx.exec(sql);
          },
        };
        return fn(tx);
      });
    },
    close: async () => {
      await lite.close();
    },
  };
}

// Survive Next.js dev hot reloads: one client per process.
const globalForDb = globalThis as unknown as { guardrailDb?: Promise<DbClient> };

export function db(): Promise<DbClient> {
  globalForDb.guardrailDb ??= createDbClient().catch((err) => {
    globalForDb.guardrailDb = undefined; // retry on the next request instead of caching the failure
    throw err;
  });
  return globalForDb.guardrailDb;
}

export async function withTx<T>(
  fn: (tx: Queryable) => Promise<T>,
  client?: DbClient,
): Promise<T> {
  const active = client ?? (await db());
  return active.withTx(fn);
}

export async function closeDb(): Promise<void> {
  const pending = globalForDb.guardrailDb;
  globalForDb.guardrailDb = undefined;
  if (pending) {
    const client = await pending;
    await client.close();
  }
}
