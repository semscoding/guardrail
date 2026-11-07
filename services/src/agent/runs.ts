// Agent runs end to end: create the run, let the agent propose, let the orchestrator decide and pay,
// and publish every event twice: stored in run_events (replay) and on an in-process bus (live SSE).
// Single-process by design (PGlite / one Render instance); a second instance would need Postgres
// LISTEN/NOTIFY instead of the EventEmitter.

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { AgentMode, AppError, RunEvent } from "@guardrail/apis/contracts";
import type { Llm } from "@guardrail/apis/llm";
import type { Logger, PolicyVersion, Run, RunStatus } from "@guardrail/apis/domain";
import {
  appendRunEvent,
  getActivePolicy,
  getRun,
  insertRun,
  listRunEvents,
  updateRunStatus,
  type NewRunEvent,
} from "@guardrail/database";

import { approveRunPayment, orchestratePayment, recordProposal, RunFailure, type PayPalApi } from "../payments/orchestrate";
import { runAgent } from "./agent";

export type RunDeps = {
  llm: Llm;
  paypal: PayPalApi;
  vaultId: string | undefined;
  /** Maps any thrown error to a safe AppError (backend's toAppError). */
  toAppError: (err: unknown) => AppError;
  log: Logger;
  checkIntervalMs?: number;
};

// One bus and one write queue per process, surviving Next.js dev hot reloads.
const g = globalThis as unknown as { guardrailRunBus?: EventEmitter; guardrailRunQueues?: Map<string, Promise<unknown>> };
const bus = (g.guardrailRunBus ??= new EventEmitter().setMaxListeners(200));
const queues = (g.guardrailRunQueues ??= new Map());

/** Stores then publishes one event. Writes per run are serialized so seq stays gap-free. */
export function publishRunEvent(runId: string, event: NewRunEvent): Promise<RunEvent> {
  const prev = queues.get(runId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(async () => {
    const full = await appendRunEvent(runId, event);
    bus.emit(runId, full);
    return full;
  });
  queues.set(runId, next);
  void next.finally(() => {
    if (queues.get(runId) === next) queues.delete(runId);
  });
  return next;
}

/** Live events for a run; returns the unsubscribe function. */
export function subscribeRunEvents(runId: string, listener: (event: RunEvent) => void): () => void {
  bus.on(runId, listener);
  return () => bus.off(runId, listener);
}

export { listRunEvents };

export const getRunById = (runId: string): Promise<Run | null> => getRun(runId);

async function finish(runId: string, status: RunStatus) {
  await updateRunStatus(runId, status);
  await publishRunEvent(runId, { type: "done", status });
}

async function fail(runId: string, err: unknown, deps: Pick<RunDeps, "toAppError" | "log">) {
  const error = err instanceof RunFailure ? err.appError : deps.toAppError(err);
  deps.log.error("run.failed", { runId, code: error.code, cause: err instanceof Error ? err.message : undefined });
  try {
    await publishRunEvent(runId, { type: "error", error });
    await finish(runId, "FAILED");
  } catch (inner) {
    deps.log.error("run.fail_record_failed", { runId, cause: inner instanceof Error ? inner.message : undefined });
  }
}

/** Runs the agent and the orchestrator for an existing run. Never throws: failures end the run FAILED. */
export async function executeRun(
  run: { id: string; command: string; policy: PolicyVersion; agentMode?: AgentMode },
  deps: RunDeps,
): Promise<RunStatus> {
  const emit = (event: NewRunEvent) => publishRunEvent(run.id, event);
  try {
    const proposal = await runAgent(run.command, {
      llm: deps.llm,
      mode: run.agentMode ?? "standard",
      emit: (step) => emit({ type: "step", ...step }).then(() => undefined),
    });
    if (!proposal) {
      throw new RunFailure({
        code: "VALIDATION",
        message: "The agent did not propose a purchase. Try a more specific request, e.g. a product the shops sell.",
      });
    }
    await recordProposal(run.id, proposal, emit);
    const status = await orchestratePayment({ id: run.id, policy: run.policy }, proposal, {
      paypal: deps.paypal,
      vaultId: deps.vaultId,
      emit,
      checkIntervalMs: deps.checkIntervalMs,
    });
    await finish(run.id, status);
    deps.log.info("run.finished", { runId: run.id, status, mode: deps.llm.mode, agentMode: run.agentMode ?? "standard" });
    return status;
  } catch (err) {
    await fail(run.id, err, deps);
    return "FAILED";
  }
}

/**
 * POST /api/runs: creates the run and starts it in the background (in-process).
 * Returns at once with the id; the client follows along on the SSE stream.
 */
export async function startRun(input: { policyId: string; command: string; agentMode?: AgentMode }, deps: RunDeps): Promise<{ runId: string }> {
  const policy = await getActivePolicy(input.policyId);
  if (!policy) throw new RunFailure({ code: "NOT_FOUND", message: `No policy "${input.policyId}".` });
  const runId = `run_${randomUUID()}`;
  await insertRun({ id: runId, policyId: policy.policyId, policyVersion: policy.version, command: input.command });
  void executeRun({ id: runId, command: input.command, policy, agentMode: input.agentMode }, deps);
  return { runId };
}

/** POST /api/runs/:id/approve: capture a NEEDS_APPROVAL run's open authorization. */
export async function approveRun(runId: string, deps: Pick<RunDeps, "paypal" | "toAppError" | "log">): Promise<Run> {
  const status = await approveRunPayment(runId, {
    paypal: deps.paypal,
    emit: (event) => publishRunEvent(runId, event),
  });
  await finish(runId, status);
  const run = await getRun(runId);
  if (!run) throw new RunFailure({ code: "NOT_FOUND", message: `No run "${runId}".` });
  return run;
}
