// Submit an APPROVED dossier: PayPal provide-evidence for real disputes; the seeded demo dispute is only recorded.
import { SubmitDossierRequest } from "@guardrail/apis/contracts";
import { provideEvidence } from "@guardrail/apis/paypal/disputes";
import { route } from "@guardrail/backend";
import { submitDossier } from "@guardrail/services/disputes";

import { disputeCall } from "../../errors";

export const POST = route<SubmitDossierRequest, undefined, { id: string }>(
  { auth: "demo", body: SubmitDossierRequest },
  ({ params, body }) => disputeCall(() => submitDossier(params.id, body.dossierVersion, { provideEvidence })),
);
