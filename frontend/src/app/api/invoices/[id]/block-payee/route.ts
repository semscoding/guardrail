import { appError, route } from "@guardrail/backend";
import { blockPayee } from "@guardrail/services/invoices";

export const POST = route<undefined, undefined, { id: string }>({ auth: "demo" }, async ({ params, log }) => {
  const result = await blockPayee(params.id, { log });
  if (!result.ok) {
    throw result.reason === "NOT_FOUND"
      ? appError("NOT_FOUND", `No invoice "${params.id}".`)
      : appError("VALIDATION", "This invoice has no known payee to block.");
  }
  return { payeeEmail: result.payeeEmail, blocked: result.blocked };
});
