// Gap analysis (code, no AI): per dispute reason, the evidence PayPal Seller Protection asks for.
// The LLM never decides strength: STRONG only when every requirement is met by collected evidence.

import type { Dispute, DisputeReason, Evidence } from "@guardrail/apis/domain";

type EvidenceKind = Evidence["kind"];

type Requirement = {
  kind: EvidenceKind;
  /** Why this kind is needed, shown nowhere yet but kept next to the rule. */
  why: string;
  /** Extra condition on the evidence item beyond its kind. */
  satisfiedBy?: (e: Evidence) => boolean;
};

/** Tracking only counts when the carrier shows the parcel delivered. */
export const trackingShowsDelivery = (e: Evidence) =>
  Boolean(e.data.deliveredAt) || String(e.data.status ?? "").toUpperCase() === "DELIVERED";

/** The delivery address only counts when it matches the address on the PayPal order. */
export const addressMatchesOrder = (e: Evidence) => e.data.matchesOrderAddress === true;

const ORDER: Requirement = { kind: "ORDER", why: "Proves what was bought, for how much and when." };

export const REQUIREMENTS: Record<DisputeReason, Requirement[]> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: [
    { kind: "TRACKING", why: "Carrier tracking that shows delivery.", satisfiedBy: trackingShowsDelivery },
    { kind: "ADDRESS", why: "Delivered to the address on the order.", satisfiedBy: addressMatchesOrder },
  ],
  UNAUTHORISED: [ORDER, { kind: "ADDRESS", why: "Shipped to the buyer's own PayPal address." }],
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: [
    ORDER,
    { kind: "COMMUNICATION", why: "What was promised and what the buyer said." },
  ],
  CREDIT_NOT_PROCESSED: [ORDER, { kind: "REFUND_POLICY", why: "The refund terms the buyer accepted." }],
  DUPLICATE_TRANSACTION: [ORDER],
  INCORRECT_AMOUNT: [ORDER],
  PAYMENT_BY_OTHER_MEANS: [ORDER],
  CANCELED_RECURRING_BILLING: [ORDER],
  PROBLEM_WITH_REMITTANCE: [ORDER],
  OTHER: [ORDER],
};

export type GapAnalysis = Pick<Dispute["dossier"] & object, "strength" | "missingEvidence">;

export function analyzeGaps(reason: DisputeReason, evidence: Evidence[]): GapAnalysis {
  const missing: EvidenceKind[] = [];
  for (const req of REQUIREMENTS[reason]) {
    const ok = evidence.some((e) => e.kind === req.kind && (req.satisfiedBy ? req.satisfiedBy(e) : true));
    if (!ok && !missing.includes(req.kind)) missing.push(req.kind);
  }
  return { strength: missing.length === 0 ? "STRONG" : "WEAK", missingEvidence: missing };
}
