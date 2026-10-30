import { CreateRunRequest } from "@guardrail/apis/contracts";
import { route, runDeps } from "@guardrail/backend";
import { startRun } from "@guardrail/services/agent";

/** Creates the run and starts the agent in the background; follow it on GET /api/runs/:id/stream. */
export const POST = route({ auth: "demo", body: CreateRunRequest }, ({ body }) => startRun(body, runDeps()));
