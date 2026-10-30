import type { Rule } from "../types";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const r08NotExpired: Rule = {
  id: "R8",
  evaluate: ({ policy, now }) => {
    const validUntil = new Date(policy.validUntil);
    const passed = now.getTime() <= validUntil.getTime();
    return {
      ruleId: "R8",
      passed,
      explanation: `Policy ${passed ? "valid" : "expired"} until ${day.format(validUntil)}`,
      expected: "not expired",
      actual: passed ? "valid" : "expired",
      source: "policy",
    };
  },
};
