// Orchestrator decision paths against an in-memory database and a fake PayPal (no network).

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { RunEvent } from "@guardrail/apis/contracts";
import { PolicyVersion, type PurchaseProposal } from "@guardrail/apis/domain";
import { mockPolicy } from "@guardrail/apis/mocks";
import type * as PayPal from "@guardrail/apis/paypal";

process.env.PGLITE_DIR = "memory://";
process.env.PAYEE_EMAIL_NORDIC_GEAR = "nordic-gear@business.example.com";
process.env.PAYEE_EMAIL_EU_SPORTDIRECT = "eu-sportdirect@business.example.com";
process.env.PAYEE_EMAIL_DEALZONE_X = "dealzone-x@business.example.com";

const { closeDb, db, getRun, insertRun, listAuditEvents, listRunEvents, migrate, seed, updateRunStatus } = await import("@guardrail/database");
const { orchestratePayment, recordProposal } = await import("../../../src/payments/orchestrate");
const { approveRun, publishRunEvent } = await import("../../../src/agent/runs");

const policy = PolicyVersion.parse(mockPolicy);
const now = () => new Date("2026-11-02T10:00:00Z");

type Call = { fn: string; id: string; requestId?: string };

/** authorizeOnCreate mimics the sandbox: with a vaulted wallet the order comes back already authorized. */
function fakePayPal(authorizeOnCreate = false) {
  const calls: Call[] = [];
  const orders = new Map<string, PayPal.PayPalOrder>();
  let n = 0;
  const api = {
    async createOrder(input: PayPal.CreateOrderInput) {
      const id = `ORDER-${counter}-${++n}`;
      calls.push({ fn: "createOrder", id, requestId: input.requestId });
      assert.ok(input.vaultId, "orders are paid with the vaulted wallet");
      const order: PayPal.PayPalOrder = {
        id,
        status: "CREATED",
        purchase_units: [{ amount: input.amount, payee: input.payeeEmail ? { email_address: input.payeeEmail } : undefined }],
      };
      orders.set(id, order);
      if (authorizeOnCreate) {
        order.status = "COMPLETED";
        order.purchase_units[0].payments = {
          authorizations: [{ id: `AUTH-${id}`, status: "CREATED", amount: input.amount }],
        };
      }
      return order;
    },
    async authorizeOrder(orderId: string, requestId?: string) {
      calls.push({ fn: "authorizeOrder", id: orderId, requestId });
      const order = orders.get(orderId)!;
      order.status = "COMPLETED";
      order.purchase_units[0].payments = {
        authorizations: [{ id: `AUTH-${orderId}`, status: "CREATED", amount: order.purchase_units[0].amount }],
      };
      return order;
    },
    async getOrder(orderId: string) {
      calls.push({ fn: "getOrder", id: orderId });
      return orders.get(orderId)!;
    },
    async captureAuthorization(authorizationId: string, requestId?: string) {
      calls.push({ fn: "captureAuthorization", id: authorizationId, requestId });
      return { id: `CAP-${authorizationId}`, status: "COMPLETED" };
    },
    async voidAuthorization(authorizationId: string, requestId?: string) {
      calls.push({ fn: "voidAuthorization", id: authorizationId, requestId });
      return {};
    },
  };
  return { api, calls };
}

const proposalFor = (shopId: string, productId: string): PurchaseProposal => ({
  shopId,
  productId,
  source: "demo",
  quantity: 1,
  reasoning: "test",
  claims: {},
});

let counter = 0;
async function scenario(shopId: string, productId: string, authorizeOnCreate = false) {
  const runId = `run_test_${++counter}`;
  await insertRun({ id: runId, policyId: policy.policyId, policyVersion: policy.version, command: "test" });
  const { api, calls } = fakePayPal(authorizeOnCreate);
  const events: RunEvent[] = [];
  const emit = async (e: Parameters<typeof publishRunEvent>[1]) => {
    const full = await publishRunEvent(runId, e);
    events.push(full);
    return full;
  };
  const proposal = proposalFor(shopId, productId);
  await recordProposal(runId, proposal, emit);
  const status = await orchestratePayment({ id: runId, policy }, proposal, {
    paypal: api,
    vaultId: "VAULT-TEST",
    emit,
    checkIntervalMs: 0,
    now,
  });
  await updateRunStatus(runId, status);
  return { runId, status, calls, events, api };
}

after(() => closeDb());

before(async () => {
  await migrate(await db());
  await seed(await db());
});

test("scene 1, ALLOW → capture: Nordic Gear first-aid refill, €89", async () => {
  const { runId, status, calls, events } = await scenario("nordic-gear", "first-aid-refill", true);
  assert.equal(status, "ALLOWED");
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["createOrder", "getOrder", "captureAuthorization"],
  );
  assert.deepEqual(
    calls.filter((c) => c.requestId).map((c) => c.requestId),
    [`${runId}:create`, `${runId}:capture`],
  );
  assert.equal(events.filter((e) => e.type === "check").length, 10);
  const payment = events.find((e) => e.type === "payment");
  assert.ok(payment && payment.type === "payment");
  assert.equal(payment.payment.status, "CAPTURED");
  assert.deepEqual(payment.payment.amount, { cents: 8900, currency: "EUR" });

  const run = await getRun(runId);
  assert.equal(run?.decision?.outcome, "ALLOW");
  assert.equal(run?.payment?.status, "CAPTURED");
  assert.equal(run?.proposal?.shopId, "nordic-gear");
});

test("scene 2, BLOCK → void: DealZone X €389 fails R1, R4, R5, R6", async () => {
  const { runId, status, calls, events } = await scenario("dealzone-x", "match-balls-20");
  assert.equal(status, "BLOCKED");
  assert.ok(!calls.some((c) => c.fn === "captureAuthorization"), "never captured");
  assert.equal(calls.find((c) => c.fn === "authorizeOrder")?.requestId, `${runId}:authorize`);
  const voided = calls.find((c) => c.fn === "voidAuthorization");
  assert.equal(voided?.requestId, `${runId}:void`);

  const decision = events.find((e) => e.type === "decision");
  assert.ok(decision && decision.type === "decision");
  assert.equal(decision.decision.outcome, "BLOCK");
  const failed = decision.decision.checks.filter((c) => !c.passed).map((c) => c.ruleId);
  for (const id of ["R1", "R4", "R5", "R6"]) assert.ok(failed.includes(id as never), `${id} fails`);
  // Hidden checkout fee: the engine sees PayPal's €389, not the advertised €340.
  const r1 = decision.decision.checks.find((c) => c.ruleId === "R1");
  assert.equal(r1?.actual, "€389.00");

  const payment = events.find((e) => e.type === "payment");
  assert.ok(payment && payment.type === "payment");
  assert.equal(payment.payment.status, "VOIDED");

  const audit = (await listAuditEvents()).filter((a) => a.entityId === runId || a.data.runId === runId);
  const decisionAudit = audit.find((a) => a.action === "policy.decision");
  assert.deepEqual((decisionAudit?.data.failedRules as string[]).filter((r) => ["R1", "R4", "R5", "R6"].includes(r)), ["R1", "R4", "R5", "R6"]);
  assert.ok(audit.some((a) => a.action === "payment.voided"));
  assert.ok(audit.some((a) => a.action === "purchase.proposed"));
});

test("NEEDS_APPROVAL → authorization kept, approve captures it", async () => {
  const { runId, status, calls, api } = await scenario("nordic-gear", "match-balls-20");
  assert.equal(status, "NEEDS_APPROVAL");
  assert.ok(!calls.some((c) => c.fn === "captureAuthorization" || c.fn === "voidAuthorization"));
  const before = await getRun(runId);
  assert.equal(before?.payment?.status, "AUTHORIZED");

  const after = await approveRun(runId, {
    paypal: api,
    toAppError: () => ({ code: "INTERNAL", message: "x" }),
    log: { info() {}, warn() {}, error() {}, child() { return this; } },
  });
  assert.equal(after.status, "ALLOWED");
  assert.equal(after.payment?.status, "CAPTURED");
  assert.equal(calls.filter((c) => c.fn === "captureAuthorization").length, 1);
  const stored = await listRunEvents(runId);
  assert.deepEqual(stored.slice(-2).map((e) => e.type), ["payment", "done"]);

  await assert.rejects(() =>
    approveRun(runId, { paypal: api, toAppError: () => ({ code: "INTERNAL", message: "x" }), log: { info() {}, warn() {}, error() {}, child() { return this; } } }),
  );
});

test("missing vault id fails with a clear message", async () => {
  const runId = `run_test_${++counter}`;
  await insertRun({ id: runId, policyId: policy.policyId, policyVersion: policy.version, command: "test" });
  const { api, calls } = fakePayPal();
  await assert.rejects(
    () => orchestratePayment({ id: runId, policy }, proposalFor("nordic-gear", "first-aid-refill"), {
      paypal: api,
      vaultId: undefined,
      emit: (e) => publishRunEvent(runId, e),
      checkIntervalMs: 0,
      now,
    }),
    /PAYPAL_VAULT_ID/,
  );
  assert.equal(calls.length, 0);
});
