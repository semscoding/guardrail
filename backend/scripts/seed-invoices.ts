// Demo seed for Invoice Shield: runs the two mock invoice texts (the Geek Squad refund scam and the
// legitimate EU SportDirect invoice) through the real pipeline: rules, triage LLM (or the labelled
// offline test mode), verdict, database and audit log. Idempotent: an invoice that exists is skipped.
//
// Run: npm run invoices:seed   (after npm run db:reset; stop the dev server first when using PGlite)

import { closeDb, migrate } from "@guardrail/database";
import { sellerRegistry } from "@guardrail/services/catalog";
import { seedDemoInvoices } from "@guardrail/services/invoices";

import { triageLlm } from "../src/llm";

async function main() {
  await migrate();
  const llm = triageLlm();
  console.log(`Triage LLM: ${llm.mode === "offline" ? "offline test mode (rules only, no AI explanation)" : llm.model}`);
  if (!sellerRegistry().find((s) => s.shopId === "eu-sportdirect")?.payeeEmail) {
    console.log("note  PAYEE_EMAIL_EU_SPORTDIRECT is not set: the legit invoice is seeded without a payee");
  }
  for (const r of await seedDemoInvoices(llm)) {
    console.log(r.skipped ? `skip  ${r.id} (already seeded)` : `added ${r.id}: ${r.verdict}, ${r.findings} finding(s)`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
