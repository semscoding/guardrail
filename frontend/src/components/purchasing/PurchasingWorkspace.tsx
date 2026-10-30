"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import type { PolicyVersion } from "@guardrail/apis/domain";
import { mockRuns } from "@guardrail/apis/mocks";

import { AgentStream } from "@/components/purchasing/AgentStream";
import { DecisionBanner } from "@/components/purchasing/DecisionBanner";
import { PolicyCard } from "@/components/purchasing/PolicyCard";
import { Receipt } from "@/components/purchasing/Receipt";
import { RuleChecklist } from "@/components/purchasing/RuleChecklist";
import { Button } from "@/components/ui/button";
import { mockRunSource, useRunStream } from "@/hooks/useRunStream";

/** Recorded demo runs. Replaced by POST /api/runs once the agent endpoint is on main. */
const DEMO_REQUESTS = mockRuns.map((run) => ({ runId: run.id, command: run.command }));

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

export function PurchasingWorkspace({ policy }: { policy: PolicyVersion }) {
  const source = useMemo(() => mockRunSource(700), []);
  const { view, state, streamError, start, reset } = useRunStream(source);
  const [command, setCommand] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const streaming = state === "streaming";
  const started = state !== "idle";

  function submit(event: FormEvent) {
    event.preventDefault();
    const match = DEMO_REQUESTS.find((r) => normalize(r.command) === normalize(command));
    if (!match) {
      setFormError("Free-form requests work once the agent is connected. For now, pick one of the demo requests below.");
      return;
    }
    setFormError(null);
    start(match.runId);
  }

  function restart() {
    reset();
    setCommand("");
    setFormError(null);
  }

  return (
    <div className="grid items-start gap-section lg:grid-cols-[minmax(18rem,22rem)_1fr]">
      <div className="lg:sticky lg:top-[calc(var(--spacing-header)+1.5rem)]">
        <PolicyCard policy={policy} />
      </div>

      <div className="flex min-w-0 flex-col gap-section">
        <form onSubmit={submit} className="rounded-lg border border-border bg-surface-raised p-card">
          <label htmlFor={inputId} className="text-base font-semibold text-ink">
            What should the agent buy?
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id={inputId}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={streaming}
              aria-describedby={hintId}
              aria-invalid={formError ? true : undefined}
              placeholder="Restock our first-aid kit, under €100."
              className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            />
            <div className="flex gap-2">
              <Button type="submit" size="lg" disabled={streaming || !command.trim()} className="flex-1 sm:flex-none">
                <Sparkles aria-hidden="true" />
                {streaming ? "Agent working…" : "Send to agent"}
              </Button>
              {started ? (
                <Button type="button" size="lg" variant="outline" onClick={restart} disabled={streaming}>
                  <RotateCcw aria-hidden="true" />
                  Start over
                </Button>
              ) : null}
            </div>
          </div>

          <div id={hintId} className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
            <span>Demo requests:</span>
            {DEMO_REQUESTS.map((r) => (
              <button
                key={r.runId}
                type="button"
                disabled={streaming}
                onClick={() => {
                  setCommand(r.command);
                  setFormError(null);
                }}
                className="rounded-md border border-border bg-surface-subtle px-2.5 py-1 text-ink hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              >
                {r.command}
              </button>
            ))}
          </div>
          {formError ? (
            <p role="alert" className="mt-3 text-sm text-block">
              {formError}
            </p>
          ) : null}
        </form>

        {streamError ? (
          <p role="alert" className="rounded-lg border border-block-border bg-block-soft p-card text-sm text-block">
            {streamError} Start over to try again.
          </p>
        ) : null}

        {started ? (
          <>
            <AgentStream steps={view.steps} startedAt={view.startedAt} streaming={streaming} />
            {view.proposal || view.checks.length ? (
              <RuleChecklist checks={view.checks} proposal={view.proposal} />
            ) : null}
            {view.decision ? <DecisionBanner decision={view.decision} payment={view.payment} /> : null}
            {view.payment ? <Receipt payment={view.payment} /> : null}
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            The agent searches, compares and proposes. It cannot pay: GUARDRAIL creates the PayPal order and checks every
            rule against it before any money moves.
          </p>
        )}
      </div>
    </div>
  );
}
