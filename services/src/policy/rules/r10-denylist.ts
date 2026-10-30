import type { Rule } from "../types";
import { sameEmail } from "../facts";

export const r10Denylist: Rule = {
  id: "R10",
  evaluate: ({ order, denylist }) => {
    const blocked = denylist.some((p) => sameEmail(p, order.payeeEmail));
    const passed = order.payeeEmail !== null && !blocked;
    return {
      ruleId: "R10",
      passed,
      explanation: !order.payeeEmail
        ? "The PayPal order names no payee"
        : blocked
          ? "Payee was blocked after a suspicious invoice"
          : "Payee is not on the denylist",
      expected: "not denylisted",
      actual: !order.payeeEmail ? null : blocked ? "denylisted" : "not denylisted",
      source: "payee_denylist",
    };
  },
};
