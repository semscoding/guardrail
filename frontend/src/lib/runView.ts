// Folds the SSE events of one agent run into what the Purchasing screen shows.
// Pure and order-tolerant: events are sorted by seq, so a replay after reconnect gives the same view.

import type { AppError, RunEvent } from "@guardrail/apis/contracts";
import type { Check, Decision, PaymentSummary, PurchaseProposal, RunStatus } from "@guardrail/apis/domain";

export type StepEvent = Extract<RunEvent, { type: "step" }>;

export type RunView = {
  runId: string | null;
  startedAt: string | null;
  steps: StepEvent[];
  proposal: PurchaseProposal | null;
  checks: Check[];
  decision: Decision | null;
  payment: PaymentSummary | null;
  /** Set by the final `done` event. */
  finalStatus: RunStatus | null;
  error: AppError | null;
};

export const EMPTY_RUN_VIEW: RunView = {
  runId: null,
  startedAt: null,
  steps: [],
  proposal: null,
  checks: [],
  decision: null,
  payment: null,
  finalStatus: null,
  error: null,
};

export function foldRunEvents(events: readonly RunEvent[]): RunView {
  const view: RunView = { ...EMPTY_RUN_VIEW, steps: [], checks: [] };
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  for (const event of ordered) {
    view.runId ??= event.runId;
    view.startedAt ??= event.at;
    switch (event.type) {
      case "step":
        view.steps.push(event);
        break;
      case "proposal":
        view.proposal = event.proposal;
        break;
      case "check":
        view.checks.push(event.check);
        break;
      case "decision":
        view.decision = event.decision;
        break;
      case "payment":
        view.payment = event.payment;
        break;
      case "error":
        view.error = event.error;
        break;
      case "done":
        view.finalStatus = event.status;
        break;
    }
  }
  return view;
}

/** "+2.1 s" since the first event, for the agent timeline. */
export function elapsedLabel(startedAt: string | null, at: string): string {
  if (!startedAt) return "";
  const seconds = Math.max(0, (Date.parse(at) - Date.parse(startedAt)) / 1000);
  return `+${seconds.toFixed(1)} s`;
}
