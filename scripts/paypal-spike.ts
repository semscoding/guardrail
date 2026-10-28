// Day-2 spike: does the payment side of GUARDRAIL work in the PayPal sandbox?
//
//   Test A  €89  → buyer approves once (and saves wallet) → authorize → CAPTURE   (allowed purchase)
//   Test B  €389 → pay with saved wallet, no buyer click   → authorize → VOID     (blocked purchase)
//
// If Test B can run without a buyer click, plan A (autonomous agent with a mandate) works.
// Otherwise we fall back to plan B (buyer approves each order, policy check before capture).
//
// Run: npm run spike

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  PayPalError,
  type PayPalOrder,
  approveUrlOf,
  authorizationOf,
  authorizeOrder,
  captureAuthorization,
  createOrder,
  getAccessToken,
  getOrder,
  vaultIdOf,
  voidAuthorization,
} from "../src/lib/paypal";

const RETURN_URL = "https://example.com/guardrail/approved";
const CANCEL_URL = "https://example.com/guardrail/cancelled";
const results: Record<string, unknown> = { startedAt: new Date().toISOString() };
const rl = createInterface({ input: process.stdin, output: process.stdout });

const log = (step: string, data?: unknown) =>
  console.log(`\n▶ ${step}`, data === undefined ? "" : JSON.stringify(data, null, 2));

async function waitForBuyer(order: PayPalOrder) {
  console.log(`\n  Open this link, log in with your sandbox PERSONAL account and approve:\n  ${approveUrlOf(order)}`);
  await rl.question("\n  Press Enter once you've approved (you'll land on example.com, that's fine)… ");
}

/** Authorize if the buyer approved; with a vault id PayPal may already have authorized at creation. */
async function ensureAuthorized(orderId: string) {
  let order = await getOrder(orderId);
  if (order.status === "APPROVED") order = await authorizeOrder(orderId, randomUUID());
  const auth = authorizationOf(order);
  if (!auth) throw new Error(`No authorization on order ${orderId} (status ${order.status})`);
  return { order, auth };
}

async function main() {
  await getAccessToken();
  log("Access token OK");

  // ── Test A: approved purchase, also saves the buyer's wallet ──────────────
  const orderA = await createOrder({
    amount: { currency_code: "EUR", value: "89.00" },
    description: "First-aid kit refill (spike A)",
    referenceId: "spike-a",
    payeeEmail: process.env.PAYEE_EMAIL_NORDIC_GEAR || undefined,
    storeInVault: true,
    returnUrl: RETURN_URL,
    cancelUrl: CANCEL_URL,
    requestId: randomUUID(),
  });
  log("A: order created", { id: orderA.id, status: orderA.status });
  await waitForBuyer(orderA);

  const a = await ensureAuthorized(orderA.id);
  log("A: authorized", { authorization: a.auth, payee: a.order.purchase_units[0].payee });
  const vaultId = vaultIdOf(a.order);
  log("A: vault id", vaultId ?? "none: wallet was NOT saved");

  const captureA = await captureAuthorization(a.auth.id, randomUUID());
  log("A: captured", { id: captureA.id, status: captureA.status, details: captureA.status_details });
  results.testA = { orderId: orderA.id, authorizationId: a.auth.id, capture: captureA.status, vaultId };

  // ── Test B: blocked purchase, ideally without any buyer click ──────────────
  let orderB;
  try {
    orderB = await createOrder({
      amount: { currency_code: "EUR", value: "389.00" },
      description: "20 match balls incl. hidden shipping (spike B)",
      referenceId: "spike-b",
      vaultId,
      returnUrl: RETURN_URL,
      cancelUrl: CANCEL_URL,
      requestId: randomUUID(),
    });
  } catch (err) {
    log("B: order with vault id FAILED", err instanceof PayPalError ? err.details : String(err));
    throw err;
  }
  log("B: order created", { id: orderB.id, status: orderB.status, viaVault: Boolean(vaultId) });
  const autonomous = Boolean(vaultId) && orderB.status !== "PAYER_ACTION_REQUIRED" && orderB.status !== "CREATED";
  if (!autonomous) await waitForBuyer(orderB);

  const b = await ensureAuthorized(orderB.id);
  log("B: authorized", { amount: b.auth.amount });
  // Here the policy engine would see €389 > €350 (R1) and refuse to capture.
  await voidAuthorization(b.auth.id);
  const voided = authorizationOf(await getOrder(orderB.id));
  log("B: voided", { status: voided?.status });
  results.testB = { orderId: orderB.id, authorizationId: b.auth.id, status: voided?.status, autonomous };

  results.verdict = autonomous
    ? "PLAN A: agent can pay with the saved wallet, no buyer click"
    : "PLAN B: buyer approval needed per order; policy check before capture";
  log("VERDICT", results.verdict);
}

main()
  .catch((err) => {
    results.error = err instanceof PayPalError ? { status: err.status, details: err.details } : String(err);
    console.error("\n✖ Spike failed:", JSON.stringify(results.error, null, 2));
    process.exitCode = 1;
  })
  .finally(() => {
    writeFileSync("spike-results.json", JSON.stringify(results, null, 2));
    console.log("\nResults saved to spike-results.json");
    rl.close();
  });
