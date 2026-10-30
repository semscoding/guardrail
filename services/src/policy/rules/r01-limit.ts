import type { Rule } from "../types";
import { fmt, sameCurrency } from "../facts";

export const r01Limit: Rule = {
  id: "R1",
  evaluate: ({ policy, order }) => {
    const limit = policy.rules.perPurchaseLimit;
    const comparable = sameCurrency(order.total, limit);
    const passed = comparable && order.total.cents <= limit.cents;
    return {
      ruleId: "R1",
      passed,
      explanation: !comparable
        ? `Order is in ${order.total.currency}, the limit in ${limit.currency}`
        : passed
          ? `${fmt(order.total)} ≤ ${fmt(limit)} limit`
          : `${fmt(order.total)} > ${fmt(limit)} limit`,
      expected: `≤ ${fmt(limit)}`,
      actual: fmt(order.total),
      source: "paypal_order",
    };
  },
};
