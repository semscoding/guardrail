// A person approves one dossier version. Nothing is submitted without this step.
import { ApproveDossierRequest } from "@guardrail/apis/contracts";
import { route } from "@guardrail/backend";
import { approveDossier } from "@guardrail/services/disputes";

import { disputeCall } from "../../errors";

export const POST = route<ApproveDossierRequest, undefined, { id: string }>(
  { auth: "demo", body: ApproveDossierRequest },
  ({ params, body }) => disputeCall(() => approveDossier(params.id, body.dossierVersion)),
);
