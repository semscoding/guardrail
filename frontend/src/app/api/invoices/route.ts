import { AnalyzeInvoiceRequest } from "@guardrail/apis/contracts";
import { route, triageLlm } from "@guardrail/backend";
import { analyzeInvoice, listInvoices } from "@guardrail/services/invoices";

export const GET = route({ auth: "demo" }, () => listInvoices());

export const POST = route({ auth: "demo", body: AnalyzeInvoiceRequest }, ({ body, log }) =>
  analyzeInvoice({ text: body.text, source: "PASTE" }, { llm: triageLlm(), log }),
);
