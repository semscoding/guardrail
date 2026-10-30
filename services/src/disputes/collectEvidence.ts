// Evidence collection (deterministic code, no AI). Every item lands in dispute_evidence with its source
// and collection time. The seeded demo dispute keeps its seed evidence and never calls PayPal.

import type { Evidence } from "@guardrail/apis/domain";
import type { PayPalOrder } from "@guardrail/apis/paypal";
import type { PayPalDispute } from "@guardrail/apis/paypal/disputes";
import { recordAuditInTx, type DbClient, type Queryable } from "@guardrail/database";

import { DisputeError } from "./errors";
import { client, getDisputeRow, isDemo, listEvidence } from "./repo";

/** Orders v2 fields we read beyond the shared PayPalOrder type. */
type OrderWithShipping = PayPalOrder & {
  create_time?: string;
  purchase_units: (PayPalOrder["purchase_units"][number] & {
    description?: string;
    shipping?: {
      name?: { full_name?: string };
      address?: Record<string, string | undefined>;
      trackers?: { id: string; status?: string; create_time?: string }[];
    };
    payments?: { captures?: { id: string; status: string; create_time?: string }[] };
  })[];
};

export type CollectDeps = {
  /** GET /v2/checkout/orders/{id}; injected so tests never reach PayPal. */
  getOrder: (orderId: string) => Promise<PayPalOrder>;
  client?: DbClient;
  now?: () => Date;
};

type NewEvidence = Omit<Evidence, "collectedAt">;

async function upsertEvidence(q: Queryable, disputeId: string, items: NewEvidence[], at: string) {
  for (const e of items) {
    await q.query(
      `INSERT INTO dispute_evidence (id, dispute_id, kind, source, summary, payload, collected_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, source = EXCLUDED.source, summary = EXCLUDED.summary,
         payload = EXCLUDED.payload, collected_at = EXCLUDED.collected_at`,
      [e.id, disputeId, e.kind, e.source, e.summary, JSON.stringify(e.data), at],
    );
  }
}

function formatAddress(a: Record<string, string | undefined> | undefined): string | null {
  if (!a) return null;
  const parts = [a.address_line_1, a.address_line_2, a.postal_code, a.admin_area_2, a.country_code].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Order, capture, tracking and address evidence from a PayPal order. Pure: easy to test. */
export function evidenceFromOrder(disputeId: string, order: PayPalOrder): NewEvidence[] {
  const o = order as OrderWithShipping;
  const unit = o.purchase_units[0];
  if (!unit) return [];
  const capture = unit.payments?.captures?.[0];
  const items: NewEvidence[] = [
    {
      id: `${disputeId}-order`,
      kind: "ORDER",
      source: capture ? "paypal_capture" : "paypal_order",
      summary: `PayPal order ${o.id}: ${unit.description ?? "club shop order"}, ${unit.amount.currency_code} ${unit.amount.value}, status ${o.status}${capture ? `, capture ${capture.id} ${capture.status}` : ""}`,
      data: {
        orderId: o.id,
        status: o.status,
        amount: unit.amount.value,
        currency: unit.amount.currency_code,
        description: unit.description ?? null,
        captureId: capture?.id ?? null,
        captureStatus: capture?.status ?? null,
        createdAt: o.create_time ?? null,
      },
    },
  ];

  const address = formatAddress(unit.shipping?.address);
  const tracker = unit.shipping?.trackers?.[0];
  if (tracker) {
    // PayPal trackers say SHIPPED or CANCELLED; they never prove delivery on their own.
    items.push({
      id: `${disputeId}-tracking`,
      kind: "TRACKING",
      source: "shipping",
      summary: `Tracking ${tracker.id} registered on the PayPal order, status ${tracker.status ?? "unknown"} (no delivery confirmation)`,
      data: { trackerId: tracker.id, status: tracker.status ?? null, deliveredAt: null },
    });
  }
  if (address) {
    items.push({
      id: `${disputeId}-address`,
      kind: "ADDRESS",
      source: "paypal_order",
      summary: `Shipping address on the PayPal order: ${address}`,
      // Matching needs a carrier delivery address; without one we do not claim a match.
      data: { orderAddress: address, matchesOrderAddress: null },
    });
  }
  return items;
}

/** Without an order: the disputed transaction PayPal reports on the dispute itself. */
export function evidenceFromDisputeRaw(disputeId: string, raw: Record<string, unknown> | null): NewEvidence[] {
  const tx = (raw as PayPalDispute | null)?.disputed_transactions?.[0];
  if (!tx?.seller_transaction_id) return [];
  return [
    {
      id: `${disputeId}-order`,
      kind: "ORDER",
      source: "paypal_capture",
      summary: `Disputed PayPal transaction ${tx.seller_transaction_id}${tx.gross_amount ? `, ${tx.gross_amount.currency_code} ${tx.gross_amount.value}` : ""}`,
      data: {
        captureId: tx.seller_transaction_id,
        invoiceNumber: tx.invoice_number ?? null,
        amount: tx.gross_amount?.value ?? null,
        currency: tx.gross_amount?.currency_code ?? null,
      },
    },
  ];
}

export async function collectEvidence(disputeId: string, deps: CollectDeps): Promise<Evidence[]> {
  const active = await client(deps.client);
  const row = await getDisputeRow(active, disputeId);
  if (!row) throw new DisputeError("NOT_FOUND", `No dispute "${disputeId}".`);
  const at = (deps.now?.() ?? new Date()).toISOString();

  let fresh: NewEvidence[] = [];
  let source: string;
  if (isDemo(row)) {
    // Demo: the seed holds the order, tracking and address evidence; PayPal knows nothing of this order.
    source = "seed";
  } else if (row.order_id) {
    fresh = evidenceFromOrder(disputeId, await deps.getOrder(row.order_id));
    source = "paypal_order";
  } else {
    fresh = evidenceFromDisputeRaw(disputeId, row.raw);
    source = "paypal_dispute";
  }

  return active.withTx(async (tx) => {
    await upsertEvidence(tx, disputeId, fresh, at);
    const evidence = await listEvidence(tx, disputeId);
    await recordAuditInTx(tx, {
      pillar: "disputes",
      actor: "system",
      action: "evidence.collected",
      entity: "dispute",
      entityId: disputeId,
      outcome: null,
      summary: `Collected ${evidence.length} evidence item(s) for ${disputeId} (source: ${source})`,
      data: { source, evidenceIds: evidence.map((e) => e.id), kinds: evidence.map((e) => e.kind) },
    });
    return evidence;
  });
}
