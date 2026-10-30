// Pillar 3: Dispute Defender (seller side: the club shop). Evidence is collected by code;
// the LLM only writes the dossier, and every section must cite evidence IDs.
// A human approves before anything is submitted to PayPal.

import { z } from "zod";
import { Money } from "./money";

/** PayPal dispute reasons (Disputes API v1). */
export const DisputeReason = z.enum([
  "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
  "UNAUTHORISED",
  "CREDIT_NOT_PROCESSED",
  "DUPLICATE_TRANSACTION",
  "INCORRECT_AMOUNT",
  "PAYMENT_BY_OTHER_MEANS",
  "CANCELED_RECURRING_BILLING",
  "PROBLEM_WITH_REMITTANCE",
  "OTHER",
]);
export type DisputeReason = z.infer<typeof DisputeReason>;

export const DisputeStatus = z.enum([
  "OPEN",
  "WAITING_FOR_BUYER_RESPONSE",
  "WAITING_FOR_SELLER_RESPONSE",
  "UNDER_REVIEW",
  "RESOLVED",
  "OTHER",
]);

export const EvidenceKind = z.enum(["ORDER", "TRACKING", "ADDRESS", "COMMUNICATION", "REFUND_POLICY"]);

export const Evidence = z.object({
  id: z.string(),
  kind: EvidenceKind,
  source: z.enum(["paypal_order", "paypal_capture", "shipping", "club_shop", "email"]),
  summary: z.string(),
  collectedAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()),
});
export type Evidence = z.infer<typeof Evidence>;

export const DossierSection = z.object({
  heading: z.string(),
  body: z.string(),
  evidenceIds: z.array(z.string()).min(1),
});

export const Dossier = z.object({
  disputeId: z.string(),
  version: z.number().int().positive(),
  /** Decided by code (gap analysis), not by the LLM. */
  strength: z.enum(["STRONG", "WEAK"]),
  missingEvidence: z.array(EvidenceKind),
  sections: z.array(DossierSection),
  status: z.enum(["DRAFT", "APPROVED", "SUBMITTED", "FAILED"]),
  approvedAt: z.iso.datetime().nullable(),
  submittedAt: z.iso.datetime().nullable(),
});
export type Dossier = z.infer<typeof Dossier>;

export const Dispute = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  reason: DisputeReason,
  status: DisputeStatus,
  amount: Money,
  sellerResponseDue: z.iso.datetime().nullable(),
  evidence: z.array(Evidence),
  dossier: Dossier.nullable(),
});
export type Dispute = z.infer<typeof Dispute>;
