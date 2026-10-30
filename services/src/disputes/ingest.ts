// Ingest: PayPal disputes into the `disputes` table, from CUSTOMER.DISPUTE.* webhooks and from a poll
// (syncDisputes, the safety net when a webhook does not arrive). PayPal shapes are mapped here.

import { DisputeReason, DisputeStatus } from "@guardrail/apis/domain";
import type { PayPalDispute, PayPalDisputeSummary } from "@guardrail/apis/paypal/disputes";
import { recordAuditInTx, type DbClient, type Queryable } from "@guardrail/database";

import { client, getDisputeRow } from "./repo";

export const DISPUTE_WEBHOOK_EVENT_TYPES = [
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.UPDATED",
  "CUSTOMER.DISPUTE.RESOLVED",
] as const;

export const isDisputeEvent = (eventType: string) => eventType.startsWith("CUSTOMER.DISPUTE.");

export type MappedDispute = {
  id: string;
  orderId: string | null;
  /** Capture id from disputed_transactions; used to find our order when PayPal gives no order id. */
  captureId: string | null;
  reason: DisputeReason;
  status: DisputeStatusValue;
  amount: string;
  currency: string;
  sellerResponseDue: string | null;
};

type DisputeStatusValue = (typeof DisputeStatus.options)[number];

const AMOUNT = /^-?\d+(\.\d{1,2})?$/;

/** PayPal dispute (summary or detail) → our columns. Unknown reason/status become OTHER. */
export function mapPayPalDispute(raw: PayPalDispute | PayPalDisputeSummary): MappedDispute {
  if (!raw.dispute_id) throw new Error("PayPal dispute without dispute_id");
  const tx = "disputed_transactions" in raw ? raw.disputed_transactions?.[0] : undefined;
  const value = raw.dispute_amount?.value ?? tx?.gross_amount?.value ?? "0.00";
  return {
    id: raw.dispute_id,
    orderId: null,
    captureId: tx?.seller_transaction_id ?? null,
    reason: DisputeReason.catch("OTHER").parse(raw.reason),
    status: DisputeStatus.catch("OTHER").parse(raw.status),
    amount: AMOUNT.test(value) ? value : "0.00",
    currency: raw.dispute_amount?.currency_code ?? tx?.gross_amount?.currency_code ?? "EUR",
    sellerResponseDue: raw.seller_response_due_date ?? null,
  };
}

export type UpsertResult = "created" | "updated";

/** Insert or update one dispute and record it in the audit log, in one transaction. */
export async function upsertDispute(
  raw: PayPalDispute | PayPalDisputeSummary,
  opts: { via: "webhook" | "poll"; eventType?: string; client?: DbClient },
): Promise<UpsertResult> {
  const mapped = mapPayPalDispute(raw);
  const active = await client(opts.client);
  return active.withTx(async (tx) => {
    const existing = await getDisputeRow(tx, mapped.id);
    const orderId = existing?.order_id ?? (await orderIdForCapture(tx, mapped.captureId));

    if (existing) {
      // Never overwrite the seeded demo dispute's marker.
      const raw0 = existing.raw?.seeded === true ? existing.raw : raw;
      await tx.query(
        `UPDATE disputes SET order_id = $2, reason = $3, status = $4, amount = $5, currency = $6,
           seller_response_due = $7, raw = $8::jsonb, updated_at = now() WHERE id = $1`,
        [mapped.id, orderId, mapped.reason, mapped.status, mapped.amount, mapped.currency, mapped.sellerResponseDue, JSON.stringify(raw0)],
      );
    } else {
      await tx.query(
        `INSERT INTO disputes (id, order_id, reason, status, amount, currency, seller_response_due, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [mapped.id, orderId, mapped.reason, mapped.status, mapped.amount, mapped.currency, mapped.sellerResponseDue, JSON.stringify(raw)],
      );
    }

    const action = !existing
      ? "dispute.created"
      : opts.eventType === "CUSTOMER.DISPUTE.RESOLVED" || mapped.status === "RESOLVED"
        ? "dispute.resolved"
        : "dispute.updated";
    // A poll that finds nothing new stays out of the audit log.
    const changed = !existing || existing.status !== mapped.status || action === "dispute.resolved";
    if (opts.via === "webhook" || changed) {
      await recordAuditInTx(tx, {
        pillar: "disputes",
        actor: "paypal",
        action,
        entity: "dispute",
        entityId: mapped.id,
        outcome: mapped.status,
        summary: `${action === "dispute.created" ? "New" : "Updated"} PayPal dispute ${mapped.id} (${mapped.reason}) via ${opts.via}`,
        data: { reason: mapped.reason, status: mapped.status, amount: mapped.amount, currency: mapped.currency, orderId },
      });
    }
    return existing ? "updated" : "created";
  });
}

async function orderIdForCapture(q: Queryable, captureId: string | null): Promise<string | null> {
  if (!captureId) return null;
  const { rows } = await q.query<{ order_id: string }>("SELECT order_id FROM payments WHERE capture_id = $1", [captureId]);
  return rows[0]?.order_id ?? null;
}

type WebhookEvent = { id: string; event_type: string; resource?: unknown };

/**
 * Applies a verified CUSTOMER.DISPUTE.* event. The payments webhook handler has already stored the event
 * (idempotency by event id) and rejected unverified ones; call this only for "fresh + verified" events.
 */
export async function handleDisputeWebhook(event: WebhookEvent, opts: { client?: DbClient } = {}) {
  if (!isDisputeEvent(event.event_type)) return "ignored" as const;
  const resource = event.resource as PayPalDispute | undefined;
  if (!resource?.dispute_id) return "ignored" as const;
  return upsertDispute(resource, { via: "webhook", eventType: event.event_type, client: opts.client });
}

export type SyncDeps = {
  listDisputes: () => Promise<{ items?: PayPalDisputeSummary[] }>;
  getDispute: (id: string) => Promise<PayPalDispute>;
  client?: DbClient;
};

/** Poll PayPal for disputes and upsert each one with its full details. */
export async function syncDisputes(deps: SyncDeps) {
  const { items = [] } = await deps.listDisputes();
  const result = { seen: items.length, created: 0, updated: 0 };
  for (const item of items) {
    const detail = await deps.getDispute(item.dispute_id);
    const outcome = await upsertDispute(detail, { via: "poll", client: deps.client });
    result[outcome] += 1;
  }
  return result;
}
