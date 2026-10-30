// route() wraps every API handler: parse and validate input, check auth, map errors, log.
// Handlers return plain data; the wrapper turns it into { data } or { error }.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Logger } from "@guardrail/apis/domain";

import { env } from "./env";
import { appError, statusOf, toAppError } from "./errors";
import { log } from "./logger";

export type Auth = "open" | "demo" | "admin";

type HandlerArgs<B, Q, P> = { body: B; query: Q; params: P; request: Request; log: Logger };

export function route<B = undefined, Q = undefined, P = Record<string, string>>(
  options: { auth: Auth; body?: z.ZodType<B>; query?: z.ZodType<Q> },
  handler: (args: HandlerArgs<B, Q, P>) => Promise<unknown> | unknown,
) {
  return async (request: Request, context?: { params?: Promise<P> }) => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const reqLog = log.child({ requestId, path: new URL(request.url).pathname });
    const started = Date.now();
    try {
      if (options.auth === "admin") {
        const expected = env().DEMO_ADMIN_TOKEN;
        if (!expected || request.headers.get("x-admin-token") !== expected) {
          throw appError("UNAUTHORIZED", "This action needs the admin token.");
        }
      }
      // "demo" is open while GUARDRAIL has a single demo user; real auth replaces this check.

      let body = undefined as B;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw appError("VALIDATION", "The request body is not valid JSON.");
        }
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) throw appError("VALIDATION", "The request body is invalid.", z.treeifyError(parsed.error));
        body = parsed.data;
      }

      let query = undefined as Q;
      if (options.query) {
        const parsed = options.query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!parsed.success) throw appError("VALIDATION", "The query is invalid.", z.treeifyError(parsed.error));
        query = parsed.data;
      }

      const params = ((await context?.params) ?? {}) as P;
      const data = await handler({ body, query, params, request, log: reqLog });
      reqLog.info("http.request", { method: request.method, status: 200, durationMs: Date.now() - started });
      return Response.json({ data }, { headers: { "x-request-id": requestId } });
    } catch (err) {
      const error = toAppError(err);
      const status = statusOf(error);
      reqLog[status >= 500 ? "error" : "warn"]("http.request", {
        method: request.method,
        status,
        code: error.code,
        durationMs: Date.now() - started,
        // Full cause for us, never for the client.
        cause: status >= 500 && err instanceof Error ? err.message : undefined,
      });
      return Response.json({ error }, { status, headers: { "x-request-id": requestId } });
    }
  };
}
