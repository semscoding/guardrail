// Which LLM each AI step uses. Without ANTHROPIC_API_KEY every step runs in labelled offline test mode.

import { createLlm, type Llm } from "@guardrail/apis/llm";

import { env } from "./env";

/** The purchasing agent and dispute drafting: the stronger model. */
export const agentLlm = (): Llm => createLlm({ apiKey: env().ANTHROPIC_API_KEY, model: env().LLM_MODEL_AGENT });

/** Invoice triage: the fast, cheap model. */
export const triageLlm = (): Llm => createLlm({ apiKey: env().ANTHROPIC_API_KEY, model: env().LLM_MODEL_TRIAGE });
