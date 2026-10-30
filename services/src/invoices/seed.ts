// The two demo invoices (the Geek Squad refund scam and the legit EU SportDirect invoice) through the
// real pipeline. Idempotent: an invoice that exists is skipped. Used by `npm run invoices:seed` and the
// demo reset.

import type { Logger } from "@guardrail/apis/domain";
import type { Llm } from "@guardrail/apis/llm";
import { mockInvoices } from "@guardrail/apis/mocks";

import { sellerRegistry } from "../catalog";
import { analyzeInvoice, getInvoice } from "./index";

export type SeededInvoice = { id: string; verdict: string | null; findings: number; skipped: boolean };

export async function seedDemoInvoices(llm: Llm, log?: Logger): Promise<SeededInvoice[]> {
  const legitPayee = sellerRegistry().find((s) => s.shopId === "eu-sportdirect")?.payeeEmail;
  const out: SeededInvoice[] = [];
  // Legit first, scam last: the list is newest first, so the scam opens on top.
  for (const mock of [...mockInvoices].reverse()) {
    if (await getInvoice(mock.id)) {
      out.push({ id: mock.id, verdict: null, findings: 0, skipped: true });
      continue;
    }
    const invoice = await analyzeInvoice(
      {
        id: mock.id,
        text: mock.text,
        source: mock.source,
        paypalInvoiceId: mock.paypalInvoiceId,
        // Without PAYEE_EMAIL_EU_SPORTDIRECT the legit invoice is analysed like a paste: its text names no payee.
        payeeEmail: mock.id === "inv_legit_1" ? (legitPayee ?? null) : mock.payeeEmail,
        amount: mock.amount,
      },
      { llm, log },
    );
    out.push({ id: invoice.id, verdict: invoice.verdict, findings: invoice.findings.length, skipped: false });
  }
  return out;
}
