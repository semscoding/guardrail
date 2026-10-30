import { CircleCheck, Hand, OctagonX } from "lucide-react";
import type { Decision, PaymentSummary } from "@guardrail/apis/domain";
import { formatMoney } from "@guardrail/apis/domain";

import { cn } from "@/lib/utils";

/** The verdict, written for the treasurer: what happened to the money. */
export function DecisionBanner({ decision, payment }: { decision: Decision; payment: PaymentSummary | null }) {
  const broken = decision.checks.filter((c) => !c.passed && c.ruleId !== "R9").map((c) => c.ruleId);
  const amount = payment ? formatMoney(payment.amount) : null;

  const content = {
    ALLOW: {
      icon: CircleCheck,
      title: amount ? `Paid ${amount}` : "Purchase allowed",
      body: "Every rule held, so GUARDRAIL captured the payment.",
      tone: "border-allow-border bg-allow-soft text-allow",
    },
    BLOCK: {
      icon: OctagonX,
      title: "Blocked. No money moved.",
      body: `Broken: ${broken.join(", ")}. The PayPal authorization${amount ? ` for ${amount}` : ""} was voided, never captured.`,
      tone: "border-block-border bg-block-soft text-block",
    },
    NEEDS_APPROVAL: {
      icon: Hand,
      title: "Waiting for your approval",
      body: `${amount ?? "This purchase"} is above your approval limit. Nothing is paid until you approve.`,
      tone: "border-approval-border bg-approval-soft text-approval",
    },
  }[decision.outcome];

  const Icon = content.icon;
  return (
    <div role="status" className={cn("gr-stamp flex items-start gap-4 rounded-lg border-2 p-card", content.tone)}>
      <Icon aria-hidden="true" className="mt-0.5 size-8 shrink-0" />
      <div>
        <p className="text-2xl font-semibold tracking-tight">{content.title}</p>
        <p className="mt-1 text-sm text-ink">{content.body}</p>
      </div>
    </div>
  );
}
