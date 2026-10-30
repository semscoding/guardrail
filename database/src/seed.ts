// Idempotent demo seed: "Club Supplies" policy (from mockPolicy) + sandbox dispute placeholder + audit trail.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Dispute, PolicyVersion } from "@guardrail/apis/domain";
import { mockDisputes, mockPolicy } from "@guardrail/apis/mocks";
import { closeDb, db, type DbClient } from "./client";
import { migrate } from "./migrate";
import { moneyToNumeric } from "./money";
import { recordAuditInTx } from "./repositories/audit";
import { insertPolicyVersionInTx } from "./repositories/policies";

export interface SeedResult {
  policyInserted: boolean;
  disputeInserted: boolean;
}

export async function seed(client?: DbClient): Promise<SeedResult> {
  const active = client ?? (await db());
  await migrate(active);

  const clubPolicy = PolicyVersion.parse(mockPolicy);
  const sampleDispute = mockDisputes[0] ? Dispute.parse(mockDisputes[0]) : null;

  return active.withTx(async (tx) => {
    const policyInserted = await insertPolicyVersionInTx(tx, clubPolicy, {
      vaultId: process.env.PAYPAL_VAULT_ID || null,
      createdBy: "seed",
    });

    if (policyInserted) {
      await recordAuditInTx(tx, {
        pillar: "system",
        actor: "system",
        action: "policy.seeded",
        entity: "policy",
        entityId: clubPolicy.policyId,
        outcome: null,
        summary: `Seeded policy "${clubPolicy.name}" v${clubPolicy.version}`,
        data: { version: clubPolicy.version },
      });
    }

    let disputeInserted = false;
    if (sampleDispute) {
      const existingDispute = await tx.query<{ id: string }>(
        "SELECT id FROM disputes WHERE id = $1",
        [sampleDispute.id],
      );

      if (existingDispute.rows.length === 0) {
        const { amount, currency } = moneyToNumeric(sampleDispute.amount);
        await tx.query(
          `INSERT INTO disputes (id, order_id, reason, status, amount, currency, seller_response_due, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            sampleDispute.id,
            sampleDispute.orderId,
            sampleDispute.reason,
            sampleDispute.status,
            amount,
            currency,
            sampleDispute.sellerResponseDue,
            JSON.stringify({ seeded: true }),
          ],
        );

        for (const ev of sampleDispute.evidence) {
          await tx.query(
            `INSERT INTO dispute_evidence (id, dispute_id, kind, source, summary, payload, collected_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
            [
              ev.id,
              sampleDispute.id,
              ev.kind,
              ev.source,
              ev.summary,
              JSON.stringify(ev.data),
              ev.collectedAt,
            ],
          );
        }

        if (sampleDispute.dossier) {
          const d = sampleDispute.dossier;
          await tx.query(
            `INSERT INTO dispute_dossiers (
               dispute_id, version, strength, missing_evidence, body, status, approved_at, submitted_at
             ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
            [
              d.disputeId,
              d.version,
              d.strength,
              JSON.stringify(d.missingEvidence),
              JSON.stringify(d.sections),
              d.status,
              d.approvedAt,
              d.submittedAt,
            ],
          );
        }

        await recordAuditInTx(tx, {
          pillar: "disputes",
          actor: "system",
          action: "dispute.seeded",
          entity: "dispute",
          entityId: sampleDispute.id,
          outcome: sampleDispute.dossier?.strength ?? null,
          summary: `Seeded sandbox dispute placeholder ${sampleDispute.id}`,
          data: { orderId: sampleDispute.orderId },
        });

        disputeInserted = true;
      }
    }

    return { policyInserted, disputeInserted };
  });
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  seed()
    .then(({ policyInserted, disputeInserted }) => {
      console.log(
        `ok    seed complete (policy: ${policyInserted ? "inserted" : "unchanged"}, dispute: ${disputeInserted ? "inserted" : "unchanged"})`,
      );
    })
    .catch((err) => {
      console.error("FAIL  db:seed", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
