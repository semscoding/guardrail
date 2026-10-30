import type { Rule } from "../types";
import { fmt, sameCurrency } from "../facts";

/** Not a violation: failing R9 hands the decision to a person (NEEDS_APPROVAL), unless another rule blocks. */
export const r09Approval: Rule = {
  id: "R9",
  evaluate: ({ policy, order }) => {
    const threshold = policy.rules.approvalThreshold;
    const passed = sameCurrency(order.total, threshold) && order.total.cents <= threshold.cents;
    return {
      ruleId: "R9",
      passed,
      explanation: passed
        ? `${fmt(order.total)} ≤ ${fmt(threshold)}, no approval needed`
        : `${fmt(order.total)} > ${fmt(threshold)} needs your approval`,
      expected: `≤ ${fmt(threshold)}`,
      actual: fmt(order.total),
      source: "paypal_order",
    };
  },
};
