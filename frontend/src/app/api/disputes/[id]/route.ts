import { appError, route } from "@guardrail/backend";
import { getDispute } from "@guardrail/services/disputes";

export const GET = route<undefined, undefined, { id: string }>({ auth: "demo" }, async ({ params }) => {
  const dispute = await getDispute(params.id);
  if (!dispute) throw appError("NOT_FOUND", `No dispute "${params.id}".`);
  return dispute;
});
