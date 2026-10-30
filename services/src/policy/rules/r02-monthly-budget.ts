import type { Rule } from "../types";
import { fmt, sameCurrency } from "../facts";

export const r02MonthlyBudget: Rule = {
  id: "R2",
  evaluate: ({ policy, order, monthSpent }) => {
    const budget = policy.rules.monthlyBudget;
    const comparable = sameCurrency(order.total, budget) && sameCurrency(monthSpent, budget);
    const after = { cents: monthSpent.cents + order.total.cents, currency: budget.currency };
    const passed = comparable && after.cents <= budget.cents;
    return {
      ruleId: "R2",
      passed,
      explanation: !comparable
        ? "Spending and budget are in different currencies"
        : `${fmt(after)} of ${fmt(budget)} would be used this month`,
      expected: `≤ ${fmt(budget)}`,
      actual: comparable ? fmt(after) : null,
      source: "payments_ledger",
    };
  },
};
