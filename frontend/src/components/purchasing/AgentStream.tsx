import type { ReactNode } from "react";
import { Bot, CreditCard, PackageSearch, Search, ShieldAlert, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UntrustedContent } from "@guardrail/apis/domain";

import { elapsedLabel, type StepEvent } from "@/lib/runView";

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_products: Search,
  get_product: PackageSearch,
  propose_purchase: ShoppingCart,
};

/**
 * Text the agent read from a web page, shown as data. Instruction-like phrases are marked by a fixed
 * detector (not by AI), so the viewer sees what tried to steer the agent.
 */
function UntrustedText({ content }: { content: UntrustedContent }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  content.flags.forEach((flag, i) => {
    parts.push(content.text.slice(cursor, flag.start));
    parts.push(
      <mark key={i} className="rounded-sm bg-block-soft px-0.5 text-block underline decoration-block decoration-2 underline-offset-2">
        {content.text.slice(flag.start, flag.end)}
      </mark>,
    );
    cursor = flag.end;
  });
  parts.push(content.text.slice(cursor));

  const flagged = content.flags.length > 0;
  return (
    <details open={flagged} className="col-span-2 col-start-2 rounded-md border border-border bg-surface-subtle px-3 py-2">
      <summary className="cursor-pointer text-xs text-ink-secondary">
        {flagged ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-block">
            <ShieldAlert aria-hidden="true" className="size-3.5" />
            Page text tried to instruct the agent ({content.flags.length} {content.flags.length === 1 ? "phrase" : "phrases"})
          </span>
        ) : (
          "Page text the agent read"
        )}
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-ink">{parts}</p>
      <p className="mt-2 text-xs text-ink-muted">
        Source: {content.source}. Marked by a fixed pattern check. GUARDRAIL never treats this text as evidence.
      </p>
    </details>
  );
}

/** What the agent did, in order. Server steps (no tool) are PayPal work the agent cannot do itself. */
export function AgentStream({
  steps,
  startedAt,
  streaming,
}: {
  steps: StepEvent[];
  startedAt: string | null;
  streaming: boolean;
}) {
  return (
    <section aria-labelledby="stream-title" className="rounded-lg border border-border bg-surface-raised shadow-card p-card">
      <h2 id="stream-title" className="text-base font-semibold text-ink">
        What the agent did
      </h2>
      {steps.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          {streaming ? "Starting the agent…" : "Nothing yet. Give the agent a request to see each step here."}
        </p>
      ) : (
        <ol className="relative mt-4 space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border" aria-live="polite">
          {steps.map((step) => {
            const Icon = step.tool ? (TOOL_ICONS[step.tool] ?? Bot) : CreditCard;
            return (
              <li key={step.seq} className="gr-enter relative grid grid-cols-[1.75rem_1fr_auto] items-start gap-3 text-sm">
                <span className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-surface-raised text-ink-secondary">
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
                <span className="pt-1 leading-5 text-ink">
                  {step.message}
                  {step.tool === null ? <span className="text-ink-muted"> (server, not the agent)</span> : null}
                </span>
                <span className="pt-1 font-mono text-xs leading-5 text-ink-muted tabular-nums">
                  {elapsedLabel(startedAt, step.at)}
                </span>
                {step.untrustedContent ? <UntrustedText content={step.untrustedContent} /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
