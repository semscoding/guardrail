import { CircleCheck, CircleDashed, CircleX, Hand } from "lucide-react";
import {
  RULE_LABELS,
  RuleId,
  formatMoney,
  type Check,
  type EvidenceSource,
  type PurchaseProposal,
} from "@guardrail/apis/domain";

import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  paypal_order: "PayPal order",
  seller_registry: "Seller registry",
  product_data: "Product data",
  policy: "Policy",
  payments_ledger: "Payments this month",
  payee_denylist: "Blocked payees",
};

/** What the agent asserted that a rule can contradict. Everything else the agent never claimed. */
function agentClaim(ruleId: RuleId, proposal: PurchaseProposal | null): string | null {
  const claims = proposal?.claims;
  if (!claims) return null;
  if (ruleId === "R1" && claims.total) return formatMoney(claims.total);
  if (ruleId === "R4" && claims.sellerCountry) return `Seller in ${claims.sellerCountry}`;
  if (ruleId === "R6" && claims.sellerRating !== undefined) return `Rated ${claims.sellerRating.toFixed(1)}`;
  return null;
}

/** Amounts, counts and codes are machine data and get the mono face; words stay in the text face. */
const isMachineData = (value: string) => /^[€$\d]|^[A-Z]{3}$/.test(value);

type RowState = "pending" | "pass" | "fail" | "approval";

function rowState(ruleId: RuleId, check: Check | undefined): RowState {
  if (!check) return "pending";
  if (check.passed) return "pass";
  // R9 is not a violation: it hands the decision to a person.
  return ruleId === "R9" ? "approval" : "fail";
}

const STATE_META: Record<RowState, { text: string; icon: typeof CircleCheck; className: string }> = {
  pending: { text: "Checking", icon: CircleDashed, className: "text-ink-muted" },
  pass: { text: "Pass", icon: CircleCheck, className: "text-allow" },
  fail: { text: "Fail", icon: CircleX, className: "text-block" },
  approval: { text: "Needs you", icon: Hand, className: "text-approval" },
};

/**
 * The verification ledger: per rule, what the agent claimed next to what the source of truth says.
 * This is the core idea of GUARDRAIL in one table, so it is the one place the screen gets loud.
 */
export function RuleChecklist({ checks, proposal }: { checks: Check[]; proposal: PurchaseProposal | null }) {
  const byRule = new Map(checks.map((c) => [c.ruleId, c]));
  const failed = checks.filter((c) => !c.passed && c.ruleId !== "R9").length;

  return (
    <section aria-labelledby="ledger-title" className="rounded-lg border border-border-strong bg-surface-raised">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-card py-4">
        <h2 id="ledger-title" className="text-lg font-semibold text-ink">
          Checked against the real order
        </h2>
        <p className="text-sm text-ink-secondary" aria-live="polite">
          {checks.length < RuleId.options.length
            ? `${checks.length} of ${RuleId.options.length} rules checked`
            : failed
              ? `${failed} ${failed === 1 ? "rule" : "rules"} broken`
              : "Every rule holds"}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Each policy rule, what the agent claimed, and what the source of truth shows
        </caption>
        <thead className="hidden text-left text-xs text-ink-muted md:table-header-group">
          <tr className="border-b border-border">
            <th scope="col" className="px-card py-2 font-medium">Rule</th>
            <th scope="col" className="px-3 py-2 font-medium">Agent said</th>
            <th scope="col" className="px-3 py-2 font-medium">Verified</th>
            <th scope="col" className="px-card py-2 text-right font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {RuleId.options.map((ruleId) => {
            const check = byRule.get(ruleId);
            const state = rowState(ruleId, check);
            const meta = STATE_META[state];
            const claim = agentClaim(ruleId, proposal);
            const contradicted = state === "fail" && claim !== null;
            const Icon = meta.icon;

            return (
              <tr
                key={check ? `${ruleId}-done` : `${ruleId}-pending`}
                className={cn(
                  "grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-border px-card py-3 last:border-b-0 md:table-row md:p-0",
                  check && "gr-enter",
                  state === "fail" && "bg-block-soft/60",
                  state === "approval" && "bg-approval-soft/60",
                )}
              >
                <th scope="row" className="text-left font-normal md:px-card md:py-3 md:align-top">
                  <span className="font-mono text-xs text-ink-muted">{ruleId}</span>{" "}
                  <span className="font-medium text-ink">{RULE_LABELS[ruleId]}</span>
                  {check ? <span className="mt-0.5 block text-ink-secondary">{check.explanation}</span> : null}
                </th>

                <td className="col-span-2 row-start-2 md:px-3 md:py-3 md:align-top">
                  {claim ? (
                    <>
                      <span className="text-ink-secondary md:sr-only">Agent said: </span>
                      <span
                        className={cn(
                          isMachineData(claim) && "font-mono tabular-nums",
                          contradicted ? "text-ink-muted line-through decoration-block decoration-2" : "text-ink",
                        )}
                      >
                        {claim}
                      </span>
                      {contradicted ? <span className="sr-only"> (contradicted by the source)</span> : null}
                    </>
                  ) : (
                    <span className="hidden text-ink-muted md:inline">
                      <span aria-hidden="true">–</span>
                      <span className="sr-only">No claim</span>
                    </span>
                  )}
                </td>

                <td className="col-span-2 md:px-3 md:py-3 md:align-top">
                  {check ? (
                    <span className="block">
                      <span className="md:sr-only">Verified: </span>
                      <span
                        className={cn(
                          check.actual ? "text-ink" : "font-medium text-block",
                          check.actual && isMachineData(check.actual) && "font-mono tabular-nums",
                        )}
                      >
                        {check.actual ?? "No evidence"}
                      </span>
                      <span className="block text-xs text-ink-muted">{SOURCE_LABELS[check.source]}</span>
                    </span>
                  ) : (
                    <span className="hidden md:inline" aria-hidden="true">
                      <span className="inline-block h-3 w-24 animate-pulse rounded bg-surface-subtle motion-reduce:animate-none" />
                    </span>
                  )}
                </td>

                <td className="col-start-2 row-start-1 text-right md:px-card md:py-3 md:align-top">
                  <span className={cn("inline-flex items-center gap-1.5 font-semibold", meta.className)}>
                    <Icon aria-hidden="true" className={cn("size-4", state !== "pending" && "gr-pop")} />
                    {meta.text}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
