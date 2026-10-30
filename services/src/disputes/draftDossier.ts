// Dossier drafting. Code collects the evidence and decides strength (requirements.ts); the LLM only writes
// the text, and every section must cite evidence IDs that exist. Without an LLM key the sections come from
// a deterministic template and the dossier says so: template text is never presented as AI.

import { Dossier, type Dispute, type Evidence } from "@guardrail/apis/domain";
import type { Llm } from "@guardrail/apis/llm";
import { recordAuditInTx } from "@guardrail/database";

import { collectEvidence, type CollectDeps } from "./collectEvidence";
import { DisputeError } from "./errors";
import { DOSSIER_PROMPT_VERSION, DOSSIER_SYSTEM, dossierPrompt } from "./prompt";
import { analyzeGaps } from "./requirements";
import { client, getDisputeRow, hasSubmittedDossier, toDossier, type DossierBody } from "./repo";

export const OFFLINE_NOTE = "Drafted from a template in offline test mode, no AI.";

type Section = Dossier["sections"][number];

/** Problems with the sections, empty when valid: each cites at least one id, and only known ids. */
export function dossierProblems(sections: Section[], evidence: Pick<Evidence, "id">[]): string[] {
  const known = new Set(evidence.map((e) => e.id));
  const problems: string[] = [];
  sections.forEach((s, i) => {
    if (!s.heading.trim() || !s.body.trim()) problems.push(`section ${i + 1} is empty`);
    if (s.evidenceIds.length === 0) problems.push(`section ${i + 1} ("${s.heading}") cites no evidence`);
    for (const id of s.evidenceIds) {
      if (!known.has(id)) problems.push(`section ${i + 1} ("${s.heading}") cites unknown evidence "${id}"`);
    }
  });
  return problems;
}

export function assertValidSections(sections: Section[], evidence: Pick<Evidence, "id">[]) {
  const problems = dossierProblems(sections, evidence);
  if (problems.length) throw new DisputeError("VALIDATION", `Dossier rejected: ${problems.join("; ")}.`);
}

const KIND_LABEL: Record<Evidence["kind"], string> = {
  ORDER: "order",
  TRACKING: "tracking",
  ADDRESS: "delivery address",
  COMMUNICATION: "customer communication",
  REFUND_POLICY: "refund policy",
};

/** Offline test mode: sections built only from the evidence summaries, each citing what it uses. */
export function templateSections(evidence: Evidence[], missing: Evidence["kind"][]): Section[] {
  const of = (...kinds: Evidence["kind"][]) => evidence.filter((e) => kinds.includes(e.kind));
  const section = (heading: string, items: Evidence[]): Section[] =>
    items.length
      ? [{ heading, body: items.map((e) => `${e.summary}.`).join(" "), evidenceIds: items.map((e) => e.id) }]
      : [];

  const sections = [
    ...section("Order", of("ORDER")),
    ...section("Delivery", of("TRACKING", "ADDRESS")),
    ...section("Customer communication", of("COMMUNICATION")),
    ...section("Refund policy", of("REFUND_POLICY")),
  ];
  if (evidence.length) {
    sections.push({
      heading: "Request",
      body: missing.length
        ? `The club shop provides the evidence above. It cannot show: ${missing.map((k) => KIND_LABEL[k]).join(", ")}.`
        : "Based on the evidence above, the club shop asks PayPal to decide this dispute in the seller's favour.",
      evidenceIds: evidence.map((e) => e.id),
    });
  }
  return sections;
}

export type DraftDeps = CollectDeps & { llm: Llm };

export async function draftDossier(disputeId: string, deps: DraftDeps): Promise<Dossier> {
  const active = await client(deps.client);
  const row = await getDisputeRow(active, disputeId);
  if (!row) throw new DisputeError("NOT_FOUND", `No dispute "${disputeId}".`);
  if (await hasSubmittedDossier(active, disputeId)) {
    throw new DisputeError("CONFLICT", "A response for this dispute was already submitted.");
  }

  const evidence = await collectEvidence(disputeId, { ...deps, client: active });
  const dispute = { id: row.id, reason: row.reason as Dispute["reason"] };
  const gaps = analyzeGaps(dispute.reason, evidence);
  const template = () => templateSections(evidence, gaps.missingEvidence);

  let sections: Section[];
  let draftedBy: NonNullable<Dossier["draftedBy"]>;
  let note: string | null = null;
  if (deps.llm.mode === "offline" || evidence.length === 0) {
    sections = template();
    draftedBy = "template";
    note = deps.llm.mode === "offline" ? OFFLINE_NOTE : "No evidence collected yet: nothing for AI to cite.";
  } else {
    // The citation check is part of the schema, so the LLM layer's repair attempt sees the reason.
    const schema = Dossier.pick({ sections: true }).superRefine((v, ctx) => {
        if (v.sections.length === 0) ctx.addIssue({ code: "custom", message: "write at least one section" });
        for (const p of dossierProblems(v.sections, evidence)) ctx.addIssue({ code: "custom", message: p });
      });
    const out = await deps.llm.json({
      system: DOSSIER_SYSTEM,
      prompt: dossierPrompt(dispute, evidence, gaps.missingEvidence),
      schema,
      offline: () => ({ sections: template() }),
      maxTokens: 2000,
    });
    sections = out.sections;
    draftedBy = "ai";
  }
  assertValidSections(sections, evidence);

  return active.withTx(async (tx) => {
    const { rows } = await tx.query<{ v: number | null }>(
      "SELECT MAX(version) AS v FROM dispute_dossiers WHERE dispute_id = $1",
      [disputeId],
    );
    const version = (rows[0]?.v ?? 0) + 1;
    const body: DossierBody = { sections, draftedBy, note };
    await tx.query(
      `INSERT INTO dispute_dossiers (dispute_id, version, strength, missing_evidence, body, status)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'DRAFT')`,
      [disputeId, version, gaps.strength, JSON.stringify(gaps.missingEvidence), JSON.stringify(body)],
    );
    await recordAuditInTx(tx, {
      pillar: "disputes",
      actor: draftedBy === "ai" ? "agent" : "system",
      action: "dossier.drafted",
      entity: "dispute",
      entityId: disputeId,
      outcome: gaps.strength,
      summary: `Drafted response v${version} for ${disputeId} (${draftedBy === "ai" ? "AI" : "template, no AI"}): ${gaps.strength}`,
      data: {
        version,
        strength: gaps.strength,
        missingEvidence: gaps.missingEvidence,
        draftedBy,
        llmMode: deps.llm.mode,
        model: deps.llm.model,
        promptVersion: DOSSIER_PROMPT_VERSION,
      },
    });
    const { rows: saved } = await tx.query<Parameters<typeof toDossier>[0]>(
      "SELECT * FROM dispute_dossiers WHERE dispute_id = $1 AND version = $2",
      [disputeId, version],
    );
    return toDossier(saved[0]!);
  });
}
