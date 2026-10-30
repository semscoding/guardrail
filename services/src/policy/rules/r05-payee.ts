import type { Rule } from "../types";
import { registeredSeller, sameEmail } from "../facts";

/** Who gets the money must be the account GUARDRAIL registered for this seller, whatever the shop says. */
export const r05Payee: Rule = {
  id: "R5",
  evaluate: (input) => {
    const seller = registeredSeller(input);
    const passed = sameEmail(input.order.payeeEmail, seller?.payeeEmail);
    return {
      ruleId: "R5",
      passed,
      explanation: passed
        ? `Payee is ${seller!.legalName}'s registered PayPal account`
        : !input.order.payeeEmail
          ? "The PayPal order names no payee"
          : "Payee is not a registered seller account",
      expected: seller ? `${seller.shopId} payee` : "registered payee",
      actual: passed ? `${seller!.shopId} payee` : input.order.payeeEmail ? "unknown payee" : null,
      source: "paypal_order",
    };
  },
};
