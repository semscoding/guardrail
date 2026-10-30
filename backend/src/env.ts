// Server configuration, validated once. A missing required key fails loudly at the first use
// instead of surfacing later as an odd PayPal or database error.

import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_BASE_URL: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  /** The buyer wallet saved once with the policy (vault). Without it the agent cannot pay. */
  PAYPAL_VAULT_ID: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CHANNEL3_API_KEY: z.string().optional(),
  DEMO_ADMIN_TOKEN: z.string().optional(),
  NTFY_TOPIC: z.string().optional(),
  LLM_MODEL_AGENT: z.string().default("claude-sonnet-5-5"),
  LLM_MODEL_TRIAGE: z.string().default("claude-haiku-5-5"),
});
export type Env = z.infer<typeof Env>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    // Names only: never print values, they may be secrets.
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change process.env. */
export function resetEnvCache() {
  cached = null;
}
