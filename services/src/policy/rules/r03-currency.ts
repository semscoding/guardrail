import type { Rule } from "../types";

export const r03Currency: Rule = {
  id: "R3",
  evaluate: ({ policy, order }) => {
    const passed = order.total.currency === policy.rules.currency;
    return {
      ruleId: "R3",
      passed,
      explanation: passed
        ? `Order currency is ${order.total.currency}`
        : `Order is in ${order.total.currency}, policy allows ${policy.rules.currency} only`,
      expected: policy.rules.currency,
      actual: order.total.currency,
      source: "paypal_order",
    };
  },
};
