import { appError, route } from "@guardrail/backend";
import { getPolicy } from "@guardrail/services/policies";

export const GET = route<undefined, undefined, { id: string }>({ auth: "demo" }, async ({ params }) => {
  const policy = await getPolicy(params.id);
  if (!policy) throw appError("NOT_FOUND", `No policy "${params.id}".`);
  return policy;
});
