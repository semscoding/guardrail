// Human approval, then submission. Only an APPROVED dossier is ever submitted; one SUBMITTED dossier per
// dispute (unique index). The seeded demo dispute is recorded as submitted but never sent to PayPal.

import type { Dispute, Dossier, Evidence } from "@guardrail/apis/domain";
import type { PayPalEvidence } from "@guardrail/apis/paypal/disputes";
import { recordAuditInTx, type DbClient } from "@guardrail/database";

import { DisputeError } from "./errors";
import {
  bodyOf,
  client,
  dossierRow,
  getDisputeIn,
  getDisputeRow,
  hasSubmittedDossier,
  isDemo,
  latestDossierRow,
  listEvidence,
  toDossier,
  type DossierBody,
} from "./repo";

export const DEMO_SUBMIT_NOTE = "Demo dispute: recorded, not sent to PayPal.";
export const SENT_NOTE = "Sent to PayPal with provide-evidence.";

const NOTES_MAX = 2000;

/** Dossier + evidence → PayPal provide-evidence items. Pure. */
export function paypalEvidencesFor(dossier: Pick<Dossier, "sections">, evidence: Evidence[]): PayPalEvidence[] {
  const out: PayPalEvidence[] = [];
  const tracking = evidence.filter((e) => e.kind === "TRACKING" && e.data.trackingNumber && e.data.carrier);
  if (tracking.length) {
    out.push({
      evidence_type: "PROOF_OF_FULFILLMENT",
      evidence_info: {
        tracking_info: tracking.map((e) => ({
          carrier_name: String(e.data.carrier),
          tracking_number: String(e.data.trackingNumber),
        })),
      },
      notes: tracking.map((e) => e.summary).join("\n").slice(0, NOTES_MAX),
    });
  }
  const text = dossier.sections.map((s) => `${s.heading}: ${s.body}`).join("\n\n");
  out.push({ evidence_type: "OTHER", notes: text.slice(0, NOTES_MAX) });
  return out;
}

export async function approveDossier(
  disputeId: string,
  version: number,
  opts: { client?: DbClient; approvedBy?: string } = {},
): Promise<Dispute> {
  const active = await client(opts.client);
  return active.withTx(async (tx) => {
    const row = await dossierRow(tx, disputeId, version);
    if (!row) throw new DisputeError("NOT_FOUND", `No draft ${version} for dispute "${disputeId}".`);
    const latest = await latestDossierRow(tx, disputeId);
    if (latest && latest.version !== version) {
      throw new DisputeError("CONFLICT", `Draft ${version} is outdated; review draft ${latest.version}.`);
    }
    if (row.status !== "DRAFT") throw new DisputeError("CONFLICT", `Draft ${version} is ${row.status}, not DRAFT.`);

    await tx.query(
      `UPDATE dispute_dossiers SET status = 'APPROVED', approved_by = $3, approved_at = now()
       WHERE dispute_id = $1 AND version = $2`,
      [disputeId, version, opts.approvedBy ?? "demo-user"],
    );
    await recordAuditInTx(tx, {
      pillar: "disputes",
      actor: "user",
      action: "dossier.approved",
      entity: "dispute",
      entityId: disputeId,
      outcome: "APPROVED",
      summary: `Response v${version} for ${disputeId} approved by a person`,
      data: { version, approvedBy: opts.approvedBy ?? "demo-user" },
    });
    return (await getDisputeIn(tx, disputeId))!;
  });
}

export type SubmitDeps = {
  /** PayPal provide-evidence; injected so tests can prove the demo path never calls it. */
  provideEvidence: (disputeId: string, evidences: PayPalEvidence[]) => Promise<unknown>;
  client?: DbClient;
};

export async function submitDossier(disputeId: string, version: number, deps: SubmitDeps): Promise<Dispute> {
  const active = await client(deps.client);
  const dispute = await getDisputeRow(active, disputeId);
  if (!dispute) throw new DisputeError("NOT_FOUND", `No dispute "${disputeId}".`);
  const row = await dossierRow(active, disputeId, version);
  if (!row) throw new DisputeError("NOT_FOUND", `No draft ${version} for dispute "${disputeId}".`);
  if (row.status === "SUBMITTED") throw new DisputeError("CONFLICT", `Draft ${version} was already submitted.`);
  if (row.status !== "APPROVED") {
    throw new DisputeError("CONFLICT", `Draft ${version} is ${row.status}: approve it before submitting.`);
  }
  if (await hasSubmittedDossier(active, disputeId)) {
    throw new DisputeError("CONFLICT", "A response for this dispute was already submitted.");
  }

  const demo = isDemo(dispute);
  const dossier = toDossier(row);
  const body = bodyOf(row);
  let submission: Record<string, unknown>;
  if (demo) {
    submission = { sentToPaypal: false };
  } else {
    const evidences = paypalEvidencesFor(dossier, await listEvidence(active, disputeId));
    try {
      await deps.provideEvidence(disputeId, evidences);
    } catch (err) {
      await active.withTx(async (tx) => {
        await tx.query("UPDATE dispute_dossiers SET status = 'FAILED' WHERE dispute_id = $1 AND version = $2", [
          disputeId,
          version,
        ]);
        await recordAuditInTx(tx, {
          pillar: "disputes",
          actor: "paypal",
          action: "dossier.submit_failed",
          entity: "dispute",
          entityId: disputeId,
          outcome: "FAILED",
          summary: `PayPal did not accept response v${version} for ${disputeId}`,
          data: { version },
        });
      });
      throw err;
    }
    submission = { sentToPaypal: true, evidenceTypes: evidences.map((e) => e.evidence_type) };
  }

  return active.withTx(async (tx) => {
    const next: DossierBody = { ...body, note: demo ? DEMO_SUBMIT_NOTE : SENT_NOTE, submission };
    await tx.query(
      `UPDATE dispute_dossiers SET status = 'SUBMITTED', submitted_at = now(), body = $3::jsonb
       WHERE dispute_id = $1 AND version = $2 AND status = 'APPROVED'`,
      [disputeId, version, JSON.stringify(next)],
    );
    await recordAuditInTx(tx, {
      pillar: "disputes",
      actor: demo ? "system" : "paypal",
      action: "dossier.submitted",
      entity: "dispute",
      entityId: disputeId,
      outcome: "SUBMITTED",
      summary: demo
        ? `Response v${version} for ${disputeId} recorded as submitted. ${DEMO_SUBMIT_NOTE}`
        : `Response v${version} for ${disputeId} sent to PayPal`,
      data: { version, ...submission },
    });
    return (await getDisputeIn(tx, disputeId))!;
  });
}
