import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { listInvoices } from "@guardrail/services/invoices";

import { InvoiceGuard } from "@/components/invoices/InvoiceGuard";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Invoices · GUARDRAIL",
};

async function Invoices() {
  // Live database data: render per request, never at build time.
  await connection();
  const invoices = await listInvoices();
  return <InvoiceGuard invoices={invoices} />;
}

export default function InvoicesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        description="Fake PayPal invoices try to make you call a number or pay outside PayPal. Paste one here and see exactly what gives it away."
      />
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading checked invoices…</p>}>
        <Invoices />
      </Suspense>
    </PageShell>
  );
}
