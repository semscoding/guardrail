import {
  CheckCircle2,
  ClockAlert,
  OctagonX,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OutcomeKind = "allow" | "block" | "approval" | "scam";

const OUTCOME_META: Record<
  OutcomeKind,
  {
    defaultLabel: string;
    icon: LucideIcon;
  }
> = {
  allow: {
    defaultLabel: "Allowed",
    icon: CheckCircle2,
  },
  block: {
    defaultLabel: "Blocked",
    icon: OctagonX,
  },
  approval: {
    defaultLabel: "Needs approval",
    icon: ClockAlert,
  },
  scam: {
    defaultLabel: "Scam flagged",
    icon: ShieldAlert,
  },
};

interface OutcomeBadgeProps {
  outcome: OutcomeKind;
  label?: string;
  className?: string;
}

/**
 * Semantic status pill that always pairs a distinct icon shape with explicit text,
 * ensuring color is never the sole carrier of meaning (WCAG 2.2 AA 1.4.1).
 */
export function OutcomeBadge({ outcome, label, className }: OutcomeBadgeProps) {
  const { defaultLabel, icon: Icon } = OUTCOME_META[outcome];

  return (
    <Badge variant={outcome} className={cn("font-semibold", className)}>
      <Icon aria-hidden="true" />
      <span>{label ?? defaultLabel}</span>
    </Badge>
  );
}
