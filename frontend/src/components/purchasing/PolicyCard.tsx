import { Link2, Link2Off } from "lucide-react";
import { formatMoney, type PolicyVersion, type RuleId } from "@guardrail/apis/domain";

// UTC, like the policy engine: a policy valid until 31 Dec 23:59 UTC must not read as "1 Jan" in Amsterdam.
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const label = (id: string) => id.replace(/-/g, " ");

/** The rules as the treasurer wrote them: plain sentences, each with the ID the checklist uses. */
function ruleSentences(policy: PolicyVersion): [RuleId, string][] {
  const r = policy.rules;
  return [
    ["R1", `Up to ${formatMoney(r.perPurchaseLimit)} per purchase, shipping and fees included`],
    ["R2", `${formatMoney(r.monthlyBudget)} per month in total`],
    ["R3", "Paid in euros"],
    ["R4", `Only approved sellers${r.requireEu ? " based in the EU" : ""} (${r.allowedSellerIds.length} on the list)`],
    ["R5", "Money goes only to the seller's registered PayPal account"],
    ["R6", `Seller rated ${r.minRating.toFixed(1)} or higher by an independent source`],
    ["R7", `Only ${r.allowedCategories.map(label).join(", ")}`],
    ["R8", `Valid until ${dateFormat.format(new Date(policy.validUntil))}`],
    ["R9", `Above ${formatMoney(r.approvalThreshold)} the agent asks you first`],
    ["R10", "Never pay a payee you have blocked"],
  ];
}

export function PolicyCard({ policy }: { policy: PolicyVersion }) {
  return (
    <section
      aria-labelledby="policy-title"
      className="rounded-lg border border-border bg-surface-raised p-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="policy-title" className="text-lg font-semibold text-ink">
          {policy.name}
        </h2>
        <span className="text-xs text-ink-muted">Version {policy.version}</span>
      </div>
      <p className="mt-1 text-sm text-ink-secondary">
        The agent can only spend within these rules. It can read them, never change them.
      </p>

      <ol className="mt-4 space-y-2.5">
        {ruleSentences(policy).map(([id, sentence]) => (
          <li key={id} id={`rule-${id}`} className="grid scroll-mt-24 grid-cols-[2.5rem_1fr] gap-2 rounded text-sm target:bg-approval-soft">
            <span className="font-mono text-xs leading-5 text-ink-muted">{id}</span>
            <span className="text-ink">{sentence}</span>
          </li>
        ))}
      </ol>

      <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-ink-secondary">
        {policy.paypalLinked ? (
          <>
            <Link2 aria-hidden="true" className="size-4 text-allow" />
            PayPal linked once, with these rules attached
          </>
        ) : (
          <>
            <Link2Off aria-hidden="true" className="size-4 text-approval" />
            PayPal not linked yet: the agent cannot pay
          </>
        )}
      </p>
    </section>
  );
}
