import { appError, route } from "@guardrail/backend";
import { getRunById } from "@guardrail/services/agent";

export const GET = route<undefined, undefined, { id: string }>({ auth: "demo" }, async ({ params }) => {
  const run = await getRunById(params.id);
  if (!run) throw appError("NOT_FOUND", `No run "${params.id}".`);
  return run;
});
