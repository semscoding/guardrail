// Wiring for pillar 1 runs: the real PayPal client, the configured LLM (or offline test mode),
// the vaulted wallet and our error mapping. Route handlers pass this to @guardrail/services/agent.

import { authorizeOrder, captureAuthorization, createOrder, getOrder, voidAuthorization } from "@guardrail/apis/paypal";
import type { RunDeps } from "@guardrail/services/agent";

import { env } from "./env";
import { toAppError } from "./errors";
import { agentLlm } from "./llm";
import { log } from "./logger";

export const runDeps = (): RunDeps => ({
  llm: agentLlm(),
  paypal: { createOrder, authorizeOrder, getOrder, captureAuthorization, voidAuthorization },
  vaultId: env().PAYPAL_VAULT_ID,
  toAppError,
  log: log.child({ component: "runs" }),
});
