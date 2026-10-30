// Payment records and PayPal webhook handling. The webhook is the final word on whether money moved.

import { db, type Queryable } from "@guardrail/database";

export type PaymentStatus = "AUTHORIZED" | "CAPTURED" | "CAPTURE_PENDING" | "CAPTURE_DENIED" | "VOIDED";

export type Payment = {
  order_id: string;
  authorization_id: string | null;
  capture_id: string | null;
  shop_id: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  payee_email: string | null;
  status: PaymentStatus;
  webhook_verified: boolean;
  created_at: string;
  updated_at: string;
};

export async function recordPayment(p: {
  orderId: string;
  authorizationId: string;
  shopId: string;
  description: string;
  amount: string;
  currency: string;
  payeeEmail: string | undefined;
  status: PaymentStatus;
  /** The agent run that created this payment (pillar 1). */
  runId?: string;
}, tx?: Queryable) {
  await (tx ?? (await db())).query(
    `INSERT INTO payments (order_id, authorization_id, shop_id, description, amount, currency, payee_email, status, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
    [p.orderId, p.authorizationId, p.shopId, p.description, p.amount, p.currency, p.payeeEmail ?? null, p.status, p.runId ?? null],
  );
}

/**
 * Our own view of a capture or void. Never overrides a status a verified webhook already confirmed:
 * the webhook is the final word.
 */
export async function updatePaymentStatus(
  p: { orderId: string; status: PaymentStatus; captureId?: string | null },
  tx?: Queryable,
) {
  await (tx ?? (await db())).query(
    `UPDATE payments SET status = $2, capture_id = COALESCE($3, capture_id), updated_at = now()
     WHERE order_id = $1 AND webhook_verified = false`,
    [p.orderId, p.status, p.captureId ?? null],
  );
}

/** Sum of captured payments since `since` (start of the month for rule R2), in integer cents per currency. */
export async function capturedSpendSince(since: Date, currency: string, tx?: Queryable): Promise<number> {
  const { rows } = await (tx ?? (await db())).query<{ cents: string | number | null }>(
    `SELECT COALESCE(SUM(ROUND(amount * 100)), 0)::bigint AS cents
     FROM payments WHERE status = 'CAPTURED' AND currency = $2 AND created_at >= $1`,
    [since.toISOString(), currency],
  );
  return Number(rows[0]?.cents ?? 0);
}

export async function listPayments(): Promise<Payment[]> {
  const { rows } = await (await db()).query<Payment>("SELECT * FROM payments ORDER BY created_at DESC");
  return rows;
}

type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } };
  };
};

/** Webhook event type → payment status it proves. */
const STATUS_BY_EVENT: Record<string, PaymentStatus> = {
  "PAYMENT.AUTHORIZATION.CREATED": "AUTHORIZED",
  "PAYMENT.AUTHORIZATION.VOIDED": "VOIDED",
  "PAYMENT.CAPTURE.COMPLETED": "CAPTURED",
  "PAYMENT.CAPTURE.PENDING": "CAPTURE_PENDING",
  "PAYMENT.CAPTURE.DENIED": "CAPTURE_DENIED",
};

export const WEBHOOK_EVENT_TYPES = Object.keys(STATUS_BY_EVENT);

/**
 * Stores every incoming event (verified or not, for the audit trail) and applies only verified ones.
 * Returns "duplicate" when PayPal redelivers an event we already have.
 */
export async function handleWebhookEvent(event: WebhookEvent, verified: boolean) {
  const client = await db();
  const related = event.resource?.supplementary_data?.related_ids;
  const orderId = related?.order_id ?? null;

  const inserted = await client.query(
    `INSERT INTO webhook_events (id, event_type, resource_id, order_id, verified, payload)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [event.id, event.event_type, event.resource?.id ?? null, orderId, verified, JSON.stringify(event)],
  );
  if (inserted.rows.length === 0) return "duplicate" as const;
  if (!verified) return "rejected" as const;

  const status = STATUS_BY_EVENT[event.event_type];
  if (!status || !orderId) return "ignored" as const;

  const isCapture = event.event_type.startsWith("PAYMENT.CAPTURE.");
  const updated = await client.query(
    `UPDATE payments
     SET status = $2, webhook_verified = true, updated_at = now(),
         capture_id = COALESCE($3, capture_id)
     WHERE order_id = $1 RETURNING order_id`,
    [orderId, status, isCapture ? (event.resource?.id ?? null) : null],
  );
  // Verified, but for an order GUARDRAIL didn't create (e.g. from the spike).
  return updated.rows.length ? ("applied" as const) : ("unknown-order" as const);
}
