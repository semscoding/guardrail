import { route, runDeps } from "@guardrail/backend";
import { approveRun } from "@guardrail/services/agent";

/** A human approves a NEEDS_APPROVAL run: GUARDRAIL captures the open authorization. */
export const POST = route<undefined, undefined, { id: string }>({ auth: "demo" }, ({ params }) =>
  approveRun(params.id, runDeps()),
);
