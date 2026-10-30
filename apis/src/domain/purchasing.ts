// Pillar 1: what the agent proposes, what the engine decides, and what PayPal did.
// The proposal is the agent's word and is never used as evidence; checks cite their real source.

import { z } from "zod";
import { Money } from "./money";
import { RuleId } from "./policy";

export const ProductSource = z.enum(["demo", "channel3"]);

export const PurchaseProposal = z.object({
  shopId: z.string(),
  productId: z.string(),
  source: ProductSource,
  quantity: z.number().int().min(1),
  reasoning: z.string(),
  /** What the agent believes. Stored for the audit trail, ignored by the engine. */
  claims: z.object({
    sellerCountry: z.string().optional(),
    sellerRating: z.number().optional(),
    total: Money.optional(),
  }),
});
export type PurchaseProposal = z.infer<typeof PurchaseProposal>;

export const EvidenceSource = z.enum([
  "paypal_order",
  "seller_registry",
  "product_data",
  "policy",
  "payments_ledger",
  "payee_denylist",
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const Check = z.object({
  ruleId: RuleId,
  /** Missing evidence counts as failed. */
  passed: z.boolean(),
  /** One sentence for the UI, e.g. "€389.00 > €350.00 limit". */
  explanation: z.string(),
  expected: z.string(),
  actual: z.string().nullable(),
  source: EvidenceSource,
});
export type Check = z.infer<typeof Check>;

export const Outcome = z.enum(["ALLOW", "BLOCK", "NEEDS_APPROVAL"]);
export type Outcome = z.infer<typeof Outcome>;

export const Decision = z.object({
  outcome: Outcome,
  /** Always all rules, in order, so the UI can show the full checklist. */
  checks: z.array(Check),
  decidedAt: z.iso.datetime(),
});
export type Decision = z.infer<typeof Decision>;

export const PaymentStatus = z.enum(["AUTHORIZED", "CAPTURED", "CAPTURE_PENDING", "CAPTURE_DENIED", "VOIDED"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentSummary = z.object({
  orderId: z.string(),
  authorizationId: z.string().nullable(),
  captureId: z.string().nullable(),
  amount: Money,
  payeeEmail: z.string().nullable(),
  status: PaymentStatus,
  /** True once a signature-verified webhook confirmed the status. */
  webhookVerified: z.boolean(),
});
export type PaymentSummary = z.infer<typeof PaymentSummary>;

export const RunStatus = z.enum(["RUNNING", "PROPOSED", "ALLOWED", "BLOCKED", "NEEDS_APPROVAL", "FAILED"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Run = z.object({
  id: z.string(),
  policyId: z.string(),
  policyVersion: z.number().int().positive(),
  command: z.string(),
  status: RunStatus,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  proposal: PurchaseProposal.nullable(),
  decision: Decision.nullable(),
  payment: PaymentSummary.nullable(),
});
export type Run = z.infer<typeof Run>;
