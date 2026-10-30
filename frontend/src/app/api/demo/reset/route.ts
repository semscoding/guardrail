import { voidAuthorization } from "@guardrail/apis/paypal";
import { route, triageLlm } from "@guardrail/backend";
import { resetDemo } from "@guardrail/services/demo";

export const POST = route({ auth: "admin" }, async ({ log }) => {
  await resetDemo({ voidAuthorization, llm: triageLlm(), log });
  return { ok: true as const };
});
