import { anthropicLlm } from "./anthropic";
import { offlineLlm } from "./offline";
import type { Llm } from "./types";

export { defineTool, type Llm, type LlmMode, type Tool, type ToolLoopResult, type ToolRunner } from "./types";
export { offlineLlm } from "./offline";

/** Claude when a key is configured, otherwise the labelled offline test mode. */
export function createLlm(config: { apiKey?: string; model: string }): Llm {
  return config.apiKey ? anthropicLlm(config.apiKey, config.model) : offlineLlm();
}
