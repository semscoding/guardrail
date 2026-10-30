// Input of the policy engine. Every field comes from a source of truth, never from the agent:
// the order from PayPal (GET order after authorize), the seller from GUARDRAIL's own registry,
// the product from the catalog fetched by the server.

import type { Category, Check, Money, PolicyVersion, RuleId } from "@guardrail/apis/domain";

import type { RegisteredSeller } from "../catalog/registry";

export type OrderFacts = {
  total: Money;
  /** payee.email_address on the PayPal order: who actually gets paid. */
  payeeEmail: string | null;
};

export type ProductFacts = {
  /** Null when the server could not fetch the product: counts as missing evidence. */
  category: Category | null;
};

export type EvaluateInput = {
  policy: PolicyVersion;
  /** The shop the agent proposed. Only used to look it up in the registry, never trusted itself. */
  proposedShopId: string;
  order: OrderFacts;
  product: ProductFacts;
  registry: readonly RegisteredSeller[];
  /** Sum of captured payments under this policy this month. */
  monthSpent: Money;
  /** Payees blocked by the user (Invoice Guard). */
  denylist: readonly string[];
  now: Date;
};

export type Rule = {
  id: RuleId;
  evaluate: (input: EvaluateInput) => Check;
};
