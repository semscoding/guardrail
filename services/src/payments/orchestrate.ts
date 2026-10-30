// Payment orchestrator (pillar 1): proposal → server-side quote → PayPal order (AUTHORIZE, vaulted wallet)
// → authorize → GET order → policy engine on the facts PayPal returned → capture | void | wait for a human.
// The agent's claims are never evidence: amount and payee come from the PayPal order, the seller from
// GUARDRAIL's registry, the category from the catalog. Every PayPal mutation carries
// PayPal-Request-Id = `${runId}:${step}` so a retry can never pay twice.

import type { RunEvent } from "@guardrail/apis/contracts";
import type { AppError } from "@guardrail/apis/contracts";
import {
  eur,
  formatMoney,
  type Decision,
  type Money,
  type PaymentStatus,
  type PaymentSummary,
  type PolicyVersion,
  type PurchaseProposal,
  type RunStatus,
} from "@guardrail/apis/domain";
import type * as PayPal from "@guardrail/apis/paypal";
import { authorizationOf } from "@guardrail/apis/paypal";
import {
  db,
  getRun,
  insertPolicyDecisionInTx,
  insertProposalInTx,
  moneyToNumeric,
  numericToMoney,
  recordAuditInTx,
  updateRunStatus,
  withTx,
  type NewRunEvent,
} from "@guardrail/database";
import { randomUUID } from "node:crypto";

import { getCatalogProduct, quote } from "../catalog/shops";
import { sellerRegistry } from "../catalog/registry";
import { evaluate } from "../policy/evaluate";
import { capturedSpendSince, recordPayment, updatePaymentStatus } from "./payments";

/** A failure with a message that is safe to show; the run ends FAILED with this error. */
export class RunFailure extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}

/** The PayPal calls the orchestrator needs; injected so tests run offline. */
export type PayPalApi = {
  createOrder: typeof PayPal.createOrder;
  authorizeOrder: typeof PayPal.authorizeOrder;
  getOrder: typeof PayPal.getOrder;
  captureAuthorization: typeof PayPal.captureAuthorization;
  voidAuthorization: typeof PayPal.voidAuthorization;
};

export type OrchestratorDeps = {
  paypal: PayPalApi;
  /** The buyer's saved PayPal wallet (env PAYPAL_VAULT_ID). Without it the agent cannot pay. */
  vaultId: string | undefined;
  emit: (event: NewRunEvent) => Promise<RunEvent>;
  /** Pause between check events so the UI ledger fills visibly. */
  checkIntervalMs?: number;
  now?: () => Date;
};

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const toPayPalAmount = (m: Money): PayPal.Money => ({ currency_code: m.currency, value: moneyToNumeric(m).amount });

/** Capture statuses PayPal returns, mapped to ours. */
function captureStatus(status: string): PaymentStatus {
  if (status === "COMPLETED") return "CAPTURED";
  if (status === "PENDING") return "CAPTURE_PENDING";
  if (status === "DECLINED" || status === "FAILED") return "CAPTURE_DENIED";
  return "CAPTURE_PENDING";
}

const startOfMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Payees blocked by the user through Invoice Guard, read straight from the table. */
async function denylistedPayees(): Promise<string[]> {
  const { rows } = await (await db()).query<{ payee_email: string }>("SELECT payee_email FROM payee_denylist");
  return rows.map((r) => r.payee_email);
}

/** Stores the proposal (agent's word, audit only) and emits it. */
export async function recordProposal(runId: string, proposal: PurchaseProposal, emit: OrchestratorDeps["emit"]) {
  await withTx(async (tx) => {
    await insertProposalInTx(tx, { id: `prop_${randomUUID()}`, runId, proposal });
    await recordAuditInTx(tx, {
      pillar: "purchasing",
      actor: "agent",
      action: "purchase.proposed",
      entity: "run",
      entityId: runId,
      outcome: null,
      summary: `Agent proposed ${proposal.quantity} × ${proposal.shopId}/${proposal.productId}`,
      data: { proposal },
    });
  });
  await updateRunStatus(runId, "PROPOSED");
  await emit({ type: "proposal", proposal });
}

export async function orchestratePayment(
  run: { id: string; policy: PolicyVersion },
  proposal: PurchaseProposal,
  deps: OrchestratorDeps,
): Promise<RunStatus> {
  const { paypal, emit } = deps;
  const now = deps.now ?? (() => new Date());
  const interval = deps.checkIntervalMs ?? 250;
  const rid = (step: string) => `${run.id}:${step}`;

  if (!deps.vaultId) {
    throw new RunFailure({
      code: "CONFLICT",
      message: "No PayPal wallet is linked (PAYPAL_VAULT_ID is not set), so GUARDRAIL cannot create the order.",
    });
  }

  // The real checkout total, hidden fees included, computed by the server.
  const q = quote(proposal.shopId, proposal.productId, proposal.quantity);
  const product = getCatalogProduct(proposal.shopId, proposal.productId);
  if (!q || !product) {
    throw new RunFailure({ code: "NOT_FOUND", message: `The proposed product ${proposal.shopId}/${proposal.productId} does not exist.` });
  }
  const quoted = eur(Math.round(q.total * 100));
  const description = `${proposal.quantity} × ${product.name}`.slice(0, 127);

  await emit({
    type: "step",
    tool: null,
    message: `GUARDRAIL is creating a PayPal order (authorize only) for ${formatMoney(quoted)} at checkout.`,
  });

  const created = await paypal.createOrder({
    amount: toPayPalAmount(quoted),
    description,
    referenceId: run.id,
    payeeEmail: q.payeeEmail,
    vaultId: deps.vaultId,
    returnUrl: "https://example.com/return",
    cancelUrl: "https://example.com/cancel",
    requestId: rid("create"),
  });
  // With a vaulted wallet PayPal usually authorizes during create (status COMPLETED); authorize only if it did not.
  const authorized = authorizationOf(created) ? created : await paypal.authorizeOrder(created.id, rid("authorize"));
  const authorization = authorizationOf(authorized);
  if (!authorization || authorization.status !== "CREATED") {
    throw new RunFailure({ code: "UPSTREAM", message: "PayPal did not authorize the payment.", upstream: { service: "paypal" } });
  }

  // The facts the engine trusts come from PayPal, not from our request or the agent.
  const order = await paypal.getOrder(created.id);
  const unit = order.purchase_units[0];
  const total = numericToMoney(unit.amount.value, unit.amount.currency_code);
  const payeeEmail = unit.payee?.email_address ?? null;

  await withTx((tx) =>
    recordPayment(
      {
        orderId: created.id,
        authorizationId: authorization.id,
        shopId: proposal.shopId,
        description,
        amount: unit.amount.value,
        currency: unit.amount.currency_code,
        payeeEmail: payeeEmail ?? undefined,
        status: "AUTHORIZED",
        runId: run.id,
      },
      tx,
    ),
  );

  const decision = evaluate({
    policy: run.policy,
    proposedShopId: proposal.shopId,
    order: { total, payeeEmail },
    product: { category: product.category },
    registry: sellerRegistry(),
    monthSpent: { cents: await capturedSpendSince(startOfMonth(now()), total.currency), currency: total.currency },
    denylist: await denylistedPayees(),
    now: now(),
  });

  for (const check of decision.checks) {
    await sleep(interval);
    await emit({ type: "check", check });
  }
  await recordDecision(run.id, decision);
  await emit({ type: "decision", decision });

  const summary: PaymentSummary = {
    orderId: created.id,
    authorizationId: authorization.id,
    captureId: null,
    amount: total,
    payeeEmail,
    status: "AUTHORIZED",
    webhookVerified: false,
  };

  if (decision.outcome === "ALLOW") {
    const payment = await capture(run.id, summary, "engine", paypal);
    await emit({ type: "payment", payment });
    return payment.status === "CAPTURE_DENIED" ? "FAILED" : "ALLOWED";
  }

  if (decision.outcome === "BLOCK") {
    await paypal.voidAuthorization(authorization.id, rid("void"));
    const payment: PaymentSummary = { ...summary, status: "VOIDED" };
    await withTx(async (tx) => {
      await updatePaymentStatus({ orderId: created.id, status: "VOIDED" }, tx);
      await recordAuditInTx(tx, {
        pillar: "purchasing",
        actor: "engine",
        action: "payment.voided",
        entity: "payment",
        entityId: created.id,
        outcome: "VOIDED",
        summary: `Voided the ${formatMoney(total)} authorization; no money moved`,
        data: { runId: run.id, authorizationId: authorization.id, amount: total, payeeEmail },
      });
    });
    await emit({ type: "payment", payment });
    return "BLOCKED";
  }

  // NEEDS_APPROVAL: the authorization stays open until a human approves.
  await emit({ type: "payment", payment: summary });
  return "NEEDS_APPROVAL";
}

async function recordDecision(runId: string, decision: Decision) {
  const failedRules = decision.checks.filter((c) => !c.passed).map((c) => c.ruleId);
  await withTx(async (tx) => {
    await insertPolicyDecisionInTx(tx, { id: `dec_${randomUUID()}`, runId, decision });
    await recordAuditInTx(tx, {
      pillar: "purchasing",
      actor: "engine",
      action: "policy.decision",
      entity: "run",
      entityId: runId,
      outcome: decision.outcome,
      summary:
        decision.outcome === "ALLOW"
          ? "All rules passed"
          : `${decision.outcome}: failed ${failedRules.join(", ")}`,
      data: { failedRules },
    });
  });
}

async function capture(
  runId: string,
  summary: PaymentSummary,
  actor: "engine" | "user",
  paypal: PayPalApi,
): Promise<PaymentSummary> {
  if (!summary.authorizationId) throw new RunFailure({ code: "CONFLICT", message: "There is no authorization to capture." });
  const result = await paypal.captureAuthorization(summary.authorizationId, `${runId}:capture`);
  const status = captureStatus(result.status);
  await withTx(async (tx) => {
    await updatePaymentStatus({ orderId: summary.orderId, status, captureId: result.id }, tx);
    await recordAuditInTx(tx, {
      pillar: "purchasing",
      actor,
      action: status === "CAPTURED" ? "payment.captured" : "payment.capture_attempted",
      entity: "payment",
      entityId: summary.orderId,
      outcome: status,
      summary: `${actor === "user" ? "Approved and captured" : "Captured"} ${formatMoney(summary.amount)}`,
      data: { runId, captureId: result.id, amount: summary.amount, payeeEmail: summary.payeeEmail },
    });
  });
  return { ...summary, captureId: result.id, status };
}

/**
 * A human approves a NEEDS_APPROVAL run: capture the still-open authorization.
 * Returns the status the run ends with.
 */
export async function approveRunPayment(
  runId: string,
  deps: Pick<OrchestratorDeps, "paypal" | "emit">,
): Promise<RunStatus> {
  const run = await getRun(runId);
  if (!run) throw new RunFailure({ code: "NOT_FOUND", message: `No run "${runId}".` });
  if (run.status !== "NEEDS_APPROVAL" || run.decision?.outcome !== "NEEDS_APPROVAL") {
    throw new RunFailure({ code: "CONFLICT", message: "Only a run waiting for approval can be approved." });
  }
  if (!run.payment || run.payment.status !== "AUTHORIZED" || !run.payment.authorizationId) {
    throw new RunFailure({ code: "CONFLICT", message: "The PayPal authorization is no longer open." });
  }
  const payment = await capture(runId, run.payment, "user", deps.paypal);
  await deps.emit({ type: "payment", payment });
  return payment.status === "CAPTURE_DENIED" ? "FAILED" : "ALLOWED";
}
