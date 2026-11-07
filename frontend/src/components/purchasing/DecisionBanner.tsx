import { CircleCheck, Hand, OctagonX } from "lucide-react";
import type { Decision, PaymentSummary } from "@guardrail/apis/domain";
import { formatMoney } from "@guardrail/apis/domain";

import { VerdictBanner } from "@/components/VerdictBanner";

/** The verdict, written for the treasurer: what happened to the money. */
export function DecisionBanner({ decision, payment }: { decision: Decision; payment: PaymentSummary | null }) {
  const broken = decision.checks.filter((c) => !c.passed && c.ruleId !== "R9").map((c) => c.ruleId);
  const amount = payment ? formatMoney(payment.amount) : null;

  const content = {
    ALLOW: {
      icon: CircleCheck,
      title: amount ? `Paid ${amount}` : "Purchase allowed",
      body: "Every rule held, so GUARDRAIL captured the payment.",
      tone: "allow" as const,
    },
    BLOCK: {
      icon: OctagonX,
      title: "Blocked. No money moved.",
      body: `Broken: ${broken.join(", ")}. The PayPal authorization${amount ? ` for ${amount}` : ""} was voided, never captured.`,
      tone: "block" as const,
    },
    NEEDS_APPROVAL: payment?.status === "CAPTURED" ? {
      icon: CircleCheck,
      title: amount ? `Approved and paid ${amount}` : "Approved and paid",
      body: "You approved it, so GUARDRAIL captured the payment.",
      tone: "allow" as const,
    } : {
      icon: Hand,
      title: "Waiting for your approval",
      body: `${amount ?? "This purchase"} is above your approval limit. Nothing is paid until you approve.`,
      tone: "approval" as const,
    },
  }[decision.outcome];

  return <VerdictBanner tone={content.tone} icon={content.icon} title={content.title} body={content.body} />;
}
