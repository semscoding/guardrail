import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type VerdictTone = "allow" | "block" | "approval" | "scam";

const TONES: Record<VerdictTone, string> = {
  allow: "border-allow-border bg-allow-soft text-allow",
  block: "border-block-border bg-block-soft text-block",
  approval: "border-approval-border bg-approval-soft text-approval",
  scam: "border-scam-border bg-scam-soft text-scam",
};

/** The one verdict treatment for every pillar: icon plus words, never colour alone. */
export function VerdictBanner({
  tone,
  icon: Icon,
  title,
  body,
  children,
}: {
  tone: VerdictTone;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role="status" className={cn("gr-stamp flex items-start gap-5 rounded-lg border px-6 py-5 shadow-card", TONES[tone])}>
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-raised shadow-card">
        <Icon aria-hidden="true" className="size-6 stroke-[2]" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] tabular-nums">{title}</p>
        <p className="mt-0.5 text-[15px] leading-6 text-ink">{body}</p>
        {children}
      </div>
    </div>
  );
}
