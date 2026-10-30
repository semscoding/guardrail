// A spending policy: the rules the club sets once. Versions are immutable; every decision
// points at the exact version that applied. The agent can never read or change a policy.

import { z } from "zod";
import { Money } from "./money";

export const Category = z.enum(["first-aid", "balls", "training", "electronics"]);
export type Category = z.infer<typeof Category>;

export const RuleId = z.enum(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]);
export type RuleId = z.infer<typeof RuleId>;

/** Human-readable rule names, shared by the engine and the UI. */
export const RULE_LABELS: Record<RuleId, string> = {
  R1: "Total within per-purchase limit",
  R2: "Monthly budget not exceeded",
  R3: "Currency is EUR",
  R4: "Seller is approved and EU-based",
  R5: "Payee matches the registered seller",
  R6: "Seller rating meets minimum",
  R7: "Category allowed",
  R8: "Policy not expired",
  R9: "Above approval threshold needs a human",
  R10: "Payee not on denylist",
};

export const PolicyRules = z.object({
  perPurchaseLimit: Money,
  monthlyBudget: Money,
  currency: z.literal("EUR"),
  allowedSellerIds: z.array(z.string()).min(1),
  requireEu: z.boolean(),
  minRating: z.number().min(0).max(5),
  allowedCategories: z.array(Category).min(1),
  approvalThreshold: Money,
});
export type PolicyRules = z.infer<typeof PolicyRules>;

export const PolicyVersion = z.object({
  policyId: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  rules: PolicyRules,
  validUntil: z.iso.datetime(),
  /** True once PayPal is linked (vaulted). The vault ID itself never leaves the server. */
  paypalLinked: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type PolicyVersion = z.infer<typeof PolicyVersion>;
