// PayPal may deliver webhooks out of order; a late AUTHORIZATION.CREATED must not undo a capture.

import assert from "node:assert/strict";
import test, { after } from "node:test";

process.env.PGLITE_DIR = "memory://";

const { closeDb, db, migrate } = await import("@guardrail/database");
const { handleWebhookEvent, recordPayment } = await import("../../src/payments/payments");

const event = (id: string, type: string, orderId: string) => ({
  id,
  event_type: type,
  resource: { id: `RES-${id}`, supplementary_data: { related_ids: { order_id: orderId } } },
});

const statusOf = async (orderId: string) =>
  (await (await db()).query<{ status: string; webhook_verified: boolean }>(
    "SELECT status, webhook_verified FROM payments WHERE order_id = $1",
    [orderId],
  )).rows[0];

after(closeDb);

test("a late AUTHORIZATION.CREATED does not move a captured payment back", async () => {
  await migrate(await db());
  await recordPayment({
    orderId: "ORDER-1", authorizationId: "AUTH-1", shopId: "nordic-gear", description: "kit",
    amount: "89.00", currency: "EUR", payeeEmail: undefined, status: "AUTHORIZED",
  });
  assert.equal(await handleWebhookEvent(event("E1", "PAYMENT.CAPTURE.COMPLETED", "ORDER-1"), true), "applied");
  assert.equal(await handleWebhookEvent(event("E2", "PAYMENT.AUTHORIZATION.CREATED", "ORDER-1"), true), "applied");
  assert.deepEqual(await statusOf("ORDER-1"), { status: "CAPTURED", webhook_verified: true });
});

test("in-order webhooks still move a payment forward", async () => {
  await recordPayment({
    orderId: "ORDER-2", authorizationId: "AUTH-2", shopId: "nordic-gear", description: "kit",
    amount: "89.00", currency: "EUR", payeeEmail: undefined, status: "AUTHORIZED",
  });
  await handleWebhookEvent(event("E3", "PAYMENT.AUTHORIZATION.CREATED", "ORDER-2"), true);
  assert.equal((await statusOf("ORDER-2")).status, "AUTHORIZED");
  await handleWebhookEvent(event("E4", "PAYMENT.CAPTURE.PENDING", "ORDER-2"), true);
  assert.equal((await statusOf("ORDER-2")).status, "CAPTURE_PENDING");
  await handleWebhookEvent(event("E5", "PAYMENT.CAPTURE.COMPLETED", "ORDER-2"), true);
  assert.equal((await statusOf("ORDER-2")).status, "CAPTURED");
});
