// The policy engine: pure functions, no network, no AI. All ten rules are always evaluated,
// in order, so the UI can show the full checklist. Missing evidence fails a rule.

import { Decision, type Outcome } from "@guardrail/apis/domain";

import { r01Limit } from "./rules/r01-limit";
import { r02MonthlyBudget } from "./rules/r02-monthly-budget";
import { r03Currency } from "./rules/r03-currency";
import { r04ApprovedSeller } from "./rules/r04-approved-seller";
import { r05Payee } from "./rules/r05-payee";
import { r06Rating } from "./rules/r06-rating";
import { r07Category } from "./rules/r07-category";
import { r08NotExpired } from "./rules/r08-not-expired";
import { r09Approval } from "./rules/r09-approval";
import { r10Denylist } from "./rules/r10-denylist";
import type { EvaluateInput, Rule } from "./types";

export const RULES: readonly Rule[] = [
  r01Limit,
  r02MonthlyBudget,
  r03Currency,
  r04ApprovedSeller,
  r05Payee,
  r06Rating,
  r07Category,
  r08NotExpired,
  r09Approval,
  r10Denylist,
];

export function evaluate(input: EvaluateInput): Decision {
  const checks = RULES.map((rule) => rule.evaluate(input));
  const blocked = checks.some((c) => !c.passed && c.ruleId !== "R9");
  const needsApproval = checks.some((c) => !c.passed && c.ruleId === "R9");
  const outcome: Outcome = blocked ? "BLOCK" : needsApproval ? "NEEDS_APPROVAL" : "ALLOW";
  // Parse so a rule can never emit something the contract (and the UI) does not accept.
  return Decision.parse({ outcome, checks, decidedAt: input.now.toISOString() });
}
