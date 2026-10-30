"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { ENDPOINTS } from "@guardrail/apis/contracts";
import type { PolicyVersion } from "@guardrail/apis/domain";
import { mockRuns } from "@guardrail/apis/mocks";

import { AgentStream } from "@/components/purchasing/AgentStream";
import { DecisionBanner } from "@/components/purchasing/DecisionBanner";
import { PolicyCard } from "@/components/purchasing/PolicyCard";
import { Receipt } from "@/components/purchasing/Receipt";
import { RuleChecklist } from "@/components/purchasing/RuleChecklist";
import { Button } from "@/components/ui/button";
import { sseRunSource, useRunStream } from "@/hooks/useRunStream";

/** The two demo scenes, offered as suggestions. Any other request works too. */
const DEMO_REQUESTS = mockRuns.map((run) => ({ runId: run.id, command: run.command }));

const CreateRunResponse = ENDPOINTS.createRun.response;
const ApproveRunResponse = ENDPOINTS.approveRun.response;

/** POSTs and parses the { data } | { error } envelope; throws the safe error message. */
async function post<T>(url: string, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error("The server sent an unexpected response.");
  return parsed.data;
}

export function PurchasingWorkspace({ policy }: { policy: PolicyVersion }) {
  const { view, state, streamError, start, resume, reset, lastSeq } = useRunStream(sseRunSource);
  const [command, setCommand] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const streaming = state === "streaming" || submitting;
  const started = state !== "idle";
  const awaitingApproval =
    state === "done" &&
    view.finalStatus === "NEEDS_APPROVAL" &&
    view.decision?.outcome === "NEEDS_APPROVAL" &&
    view.payment?.status === "AUTHORIZED";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setApproveError(null);
    setSubmitting(true);
    try {
      const res = await post(
        "/api/runs",
        CreateRunResponse,
        { policyId: policy.policyId, command: command.trim() },
      );
      if ("error" in res) setFormError(res.error.message);
      else start(res.data.runId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not start the agent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function approve() {
    if (!view.runId) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await post(`/api/runs/${encodeURIComponent(view.runId)}/approve`, ApproveRunResponse);
      if ("error" in res) setApproveError(res.error.message);
      else resume(view.runId, lastSeq);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Could not approve the purchase.");
    } finally {
      setApproving(false);
    }
  }

  function restart() {
    reset();
    setCommand("");
    setFormError(null);
    setApproveError(null);
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
            <span>Try:</span>
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
            {view.error ? (
              <p role="alert" className="rounded-lg border border-block-border bg-block-soft p-card text-sm text-block">
                {view.error.message}
              </p>
            ) : null}
            {view.decision ? <DecisionBanner decision={view.decision} payment={view.payment} /> : null}
            {awaitingApproval ? (
              <div className="flex flex-col gap-2 rounded-lg border border-approval-border bg-surface-raised p-card sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink">
                  The PayPal authorization is still open. Approve to capture it; nothing is paid until you do.
                </p>
                <Button type="button" size="lg" onClick={approve} disabled={approving}>
                  <Check aria-hidden="true" />
                  {approving ? "Capturing…" : "Approve and pay"}
                </Button>
              </div>
            ) : null}
            {approveError ? (
              <p role="alert" className="text-sm text-block">
                {approveError}
              </p>
            ) : null}
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
