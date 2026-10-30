import { Bot, CreditCard, PackageSearch, Search, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { elapsedLabel, type StepEvent } from "@/lib/runView";

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_products: Search,
  get_product: PackageSearch,
  propose_purchase: ShoppingCart,
};

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
    <section aria-labelledby="stream-title" className="rounded-lg border border-border bg-surface-raised p-card">
      <h2 id="stream-title" className="text-base font-semibold text-ink">
        What the agent did
      </h2>
      {steps.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          {streaming ? "Starting the agent…" : "Nothing yet. Give the agent a request to see each step here."}
        </p>
      ) : (
        <ol className="mt-3 space-y-2" aria-live="polite">
          {steps.map((step) => {
            const Icon = step.tool ? (TOOL_ICONS[step.tool] ?? Bot) : CreditCard;
            return (
              <li key={step.seq} className="gr-enter grid grid-cols-[1.25rem_1fr_auto] items-start gap-2.5 text-sm">
                <Icon aria-hidden="true" className="mt-0.5 size-4 text-ink-muted" />
                <span className="text-ink">
                  {step.message}
                  {step.tool === null ? <span className="text-ink-muted"> (server, not the agent)</span> : null}
                </span>
                <span className="font-mono text-xs leading-5 text-ink-muted tabular-nums">
                  {elapsedLabel(startedAt, step.at)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
