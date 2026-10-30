// PayPal Disputes API v1 (seller side). Raw PayPal shapes only: mapping to our domain types happens
// in services/src/disputes, not here. Server-side only.
//
// Verified against the published OpenAPI spec (developer.paypal.com/api/customer-disputes/v1/schema.json):
// paths, query params (page_size max 50, dispute_state, start_time), dispute fields and evidence types.
// Not verified against a live sandbox dispute: the multipart part name "input" for the JSON evidence body
// (the spec only names the file part "evidence-file"; "input" is what PayPal's integration guide uses).

import { call, getAccessToken, PayPalError, type Money } from "./client";

const BASE_URL = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";

/** Item of GET /v1/customer/disputes. */
export type PayPalDisputeSummary = {
  dispute_id: string;
  create_time?: string;
  update_time?: string;
  reason?: string;
  status?: string;
  dispute_state?: string;
  dispute_amount?: Money;
  seller_response_due_date?: string;
  links?: { rel: string; href: string; method?: string }[];
};

export type PayPalDisputedTransaction = {
  buyer_transaction_id?: string;
  /** The capture id as the merchant sees it. */
  seller_transaction_id?: string;
  reference_id?: string;
  invoice_number?: string;
  custom?: string;
  gross_amount?: Money;
};

/** GET /v1/customer/disputes/{id}: the parts GUARDRAIL reads. */
export type PayPalDispute = PayPalDisputeSummary & {
  disputed_transactions?: PayPalDisputedTransaction[];
  dispute_life_cycle_stage?: string;
  dispute_channel?: string;
};

export type PayPalEvidence = {
  /** e.g. PROOF_OF_FULFILLMENT, DELIVERY_ADDRESS, ORDER_DETAILS, OTHER (see the spec's evidence_type enum). */
  evidence_type: string;
  evidence_info?: {
    tracking_info?: { carrier_name: string; carrier_name_other?: string; tracking_url?: string; tracking_number: string }[];
    refund_ids?: { refund_id: string }[];
  };
  notes?: string;
};

export type ListDisputesParams = { pageSize?: number; disputeState?: string; startTime?: string; nextPageToken?: string };

export async function listDisputes(params: ListDisputesParams = {}) {
  const q = new URLSearchParams();
  q.set("page_size", String(Math.min(Math.max(params.pageSize ?? 50, 1), 50)));
  if (params.disputeState) q.set("dispute_state", params.disputeState);
  if (params.startTime) q.set("start_time", params.startTime);
  if (params.nextPageToken) q.set("next_page_token", params.nextPageToken);
  return call<{ items?: PayPalDisputeSummary[]; links?: { rel: string; href: string }[] }>(
    "GET",
    `/v1/customer/disputes?${q.toString()}`,
  );
}

export const getDispute = (disputeId: string) =>
  call<PayPalDispute>("GET", `/v1/customer/disputes/${encodeURIComponent(disputeId)}`);

/**
 * POST /v1/customer/disputes/{id}/provide-evidence. The API takes multipart/form-data: a JSON part
 * named "input" with { evidences } and optional "evidence-file" parts (we send no files).
 */
export async function provideEvidence(disputeId: string, evidences: PayPalEvidence[]): Promise<unknown> {
  const form = new FormData();
  form.append("input", new Blob([JSON.stringify({ evidences })], { type: "application/json" }), "input.json");

  const path = `/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`;
  // No Content-Type header: fetch sets multipart/form-data with the boundary itself.
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    body: form,
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new PayPalError(`POST ${path} failed`, res.status, json);
  return json;
}
