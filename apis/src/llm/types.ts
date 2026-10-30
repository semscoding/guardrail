// One LLM interface for every AI step in GUARDRAIL (agent, invoice triage, dispute drafting).
// Two modes: "anthropic" when ANTHROPIC_API_KEY is set, otherwise "offline": a deterministic stand-in
// so the system can be built and tested without a key. Offline mode is always labelled as such in
// events and UI; it is never presented as AI.

import type { z } from "zod";

export type LlmMode = "anthropic" | "offline";

export type Tool<I = unknown> = {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Runs server-side. The return value goes back to the model as JSON. */
  execute: (input: I) => Promise<unknown>;
  /** Ends the loop after this tool ran (e.g. propose_purchase). */
  terminal?: boolean;
};

/** Executes a tool by name with validated input; used by offline plans so they go through the same path. */
export type ToolRunner = (name: string, input: unknown) => Promise<unknown>;

export type ToolLoopResult = { steps: number; finished: boolean; mode: LlmMode };

export interface Llm {
  readonly mode: LlmMode;
  readonly model: string;

  /** A structured answer, validated with `schema` (one repair attempt). Offline: returns `offline()`. */
  json<T>(args: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    offline: () => T | Promise<T>;
    maxTokens?: number;
  }): Promise<T>;

  /**
   * Tool-use loop until a terminal tool ran, the model stops, or `maxSteps` tool calls.
   * Offline: runs `offline(run)`, a deterministic plan that calls the same tools.
   */
  runTools(args: {
    system: string;
    prompt: string;
    tools: Tool<never>[];
    maxSteps: number;
    offline: (run: ToolRunner) => Promise<void>;
  }): Promise<ToolLoopResult>;
}

/** Keeps each tool's input type while letting differently typed tools share one array. */
export const defineTool = <I>(tool: Tool<I>): Tool<never> => tool as unknown as Tool<never>;
