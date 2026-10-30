import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { appError, resetEnvCache, route } from "../src/index";

process.env.PAYPAL_CLIENT_ID ??= "test-id";
process.env.PAYPAL_CLIENT_SECRET ??= "test-secret";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

test("valid body → 200 { data }", async () => {
  const handler = route({ auth: "demo", body: z.object({ n: z.number() }) }, ({ body }) => ({ doubled: body.n * 2 }));
  const res = await handler(post(JSON.stringify({ n: 2 })));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { data: { doubled: 4 } });
});

test("invalid body → 400 VALIDATION", async () => {
  const handler = route({ auth: "demo", body: z.object({ n: z.number() }) }, () => "never");
  const res = await handler(post(JSON.stringify({ n: "two" })));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "VALIDATION");
  assert.equal((await handler(post("not json"))).status, 400);
});

test("unknown error → 500 without the internal message", async () => {
  const handler = route({ auth: "demo" }, () => {
    throw new Error("password=hunter2 at db.ts:12");
  });
  const res = await handler(new Request("http://localhost/api/x"));
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes("hunter2"), "internal details must not reach the client");
  assert.equal(JSON.parse(text).error.code, "INTERNAL");
});

test("AppErrorException keeps its code and status", async () => {
  const handler = route({ auth: "demo" }, () => {
    throw appError("NOT_FOUND", "No such run.");
  });
  const res = await handler(new Request("http://localhost/api/x"));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.message, "No such run.");
});

test("admin route: no or wrong token → 401, right token → 200", async () => {
  process.env.DEMO_ADMIN_TOKEN = "s3cret";
  resetEnvCache();
  const handler = route({ auth: "admin" }, () => ({ ok: true }));
  assert.equal((await handler(new Request("http://localhost/api/x"))).status, 401);
  assert.equal((await handler(new Request("http://localhost/api/x", { headers: { "x-admin-token": "nope" } }))).status, 401);
  assert.equal((await handler(new Request("http://localhost/api/x", { headers: { "x-admin-token": "s3cret" } }))).status, 200);
  delete process.env.DEMO_ADMIN_TOKEN;
  resetEnvCache();
});
