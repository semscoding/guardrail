// Demo seed for Invoice Shield: runs the two mock invoice texts (the Geek Squad refund scam and the
// legitimate EU SportDirect invoice) through the real pipeline: rules, triage LLM (or the labelled
// offline test mode), verdict, database and audit log. Idempotent: an invoice that exists is skipped.
//
// Run: npm run invoices:seed   (after npm run db:reset; stop the dev server first when using PGlite)

import { mockInvoices } from "@guardrail/apis/mocks";
import { closeDb, migrate } from "@guardrail/database";
import { sellerRegistry } from "@guardrail/services/catalog";
import { analyzeInvoice, getInvoice } from "@guardrail/services/invoices";

import { triageLlm } from "../src/llm";

async function main() {
  await migrate();
  const llm = triageLlm();
  console.log(`Triage LLM: ${llm.mode === "offline" ? "offline test mode (rules only, no AI explanation)" : llm.model}`);

  const legitPayee = sellerRegistry().find((s) => s.shopId === "eu-sportdirect")?.payeeEmail;
  if (!legitPayee) console.log("note  PAYEE_EMAIL_EU_SPORTDIRECT is not set: the legit invoice is seeded without a payee");
  // Legit first, scam last: the list is newest first, so the scam opens on top. Received "now", so a
  // freshly pasted invoice also sorts above the seeded ones.
  for (const mock of [...mockInvoices].reverse()) {
    if (await getInvoice(mock.id)) {
      console.log(`skip  ${mock.id} (already seeded)`);
      continue;
    }
    const invoice = await analyzeInvoice(
      {
        id: mock.id,
        text: mock.text,
        source: mock.source,
        paypalInvoiceId: mock.paypalInvoiceId,
        // The legit invoice comes from the registered EU SportDirect PayPal account. Without
        // PAYEE_EMAIL_EU_SPORTDIRECT it is analysed like a paste: its text names no payee.
        payeeEmail: mock.id === "inv_legit_1" ? (legitPayee ?? null) : mock.payeeEmail,
        amount: mock.amount,
      },
      { llm },
    );
    console.log(`added ${invoice.id}: ${invoice.verdict}, ${invoice.findings.length} finding(s)`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
