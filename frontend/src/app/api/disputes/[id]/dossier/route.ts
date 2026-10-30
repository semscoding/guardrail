// Collect evidence (code) and draft a new dossier version (LLM, or the labelled offline template).
import { getOrder } from "@guardrail/apis/paypal";
import { agentLlm, route } from "@guardrail/backend";
import { draftDossier } from "@guardrail/services/disputes";

import { disputeCall } from "../../errors";

export const POST = route<undefined, undefined, { id: string }>({ auth: "demo" }, ({ params }) =>
  disputeCall(() => draftDossier(params.id, { llm: agentLlm(), getOrder })),
);
