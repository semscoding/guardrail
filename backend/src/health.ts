// GET /api/health: is the demo able to work right now? Checks without spending money or tokens.

import { execSync } from "node:child_process";
import type { z } from "zod";
import type { HealthResponse } from "@guardrail/apis/contracts";
import { getAccessToken } from "@guardrail/apis/paypal";
import { db } from "@guardrail/database";

import { env } from "./env";

type Health = z.infer<typeof HealthResponse>;
type Probe = Health["db"];

const probe = async (fn: () => Promise<unknown>): Promise<Probe> => {
  try {
    await fn();
    return "ok";
  } catch {
    return "fail";
  }
};

let version: string | null = null;
function gitVersion() {
  if (version) return version;
  try {
    version = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    version = "dev";
  }
  return version;
}

export async function checkHealth(): Promise<Health> {
  const config = env();
  const [dbProbe, paypal] = await Promise.all([
    probe(async () => (await db()).query("SELECT 1")),
    probe(() => getAccessToken()),
  ]);
  return {
    db: dbProbe,
    paypal,
    // Configured is all we check: a real call would cost tokens on every health ping.
    anthropic: config.ANTHROPIC_API_KEY ? "ok" : "skip",
    channel3: config.CHANNEL3_API_KEY ? "ok" : "skip",
    version: gitVersion(),
  };
}
