// Pillar 3, Dispute Defender (seller side: the club shop). Collect evidence (code), analyse gaps (code),
// draft the response (LLM or labelled template), a person approves, then submit to PayPal.

export { DisputeError, type DisputeErrorCode } from "./errors";
export { analyzeGaps, REQUIREMENTS } from "./requirements";
export { collectEvidence, evidenceFromOrder, type CollectDeps } from "./collectEvidence";
export {
  assertValidSections,
  dossierProblems,
  draftDossier,
  OFFLINE_NOTE,
  templateSections,
  type DraftDeps,
} from "./draftDossier";
export {
  approveDossier,
  DEMO_SUBMIT_NOTE,
  paypalEvidencesFor,
  submitDossier,
  type SubmitDeps,
} from "./submit";
export {
  DISPUTE_WEBHOOK_EVENT_TYPES,
  handleDisputeWebhook,
  isDisputeEvent,
  mapPayPalDispute,
  syncDisputes,
  upsertDispute,
} from "./ingest";
export { getDispute, listDisputes } from "./repo";
