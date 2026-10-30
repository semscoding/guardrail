import type { Rule } from "../types";
import { registeredSeller } from "../facts";

/** Only the verified rating in the registry counts; the shop's own stars are a claim. */
export const r06Rating: Rule = {
  id: "R6",
  evaluate: (input) => {
    const min = input.policy.rules.minRating;
    const rating = registeredSeller(input)?.verifiedRating;
    const passed = rating !== undefined && rating >= min;
    return {
      ruleId: "R6",
      passed,
      explanation:
        rating === undefined
          ? "No verified rating for this seller"
          : `Verified rating ${rating.toFixed(1)} ${passed ? "≥" : "<"} ${min.toFixed(1)}`,
      expected: `≥ ${min.toFixed(1)}`,
      actual: rating === undefined ? null : rating.toFixed(1),
      source: "seller_registry",
    };
  },
};
