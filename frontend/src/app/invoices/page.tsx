import type { Metadata } from "next";
import { mockInvoices } from "@guardrail/apis/mocks";

import { InvoiceGuard } from "@/components/invoices/InvoiceGuard";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Invoices · GUARDRAIL",
};

export default function InvoicesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        description="Fake PayPal invoices try to make you call a number or pay outside PayPal. Paste one here and see exactly what gives it away."
      />
      {/* mockInvoices until POST /api/invoices is on main. */}
      <InvoiceGuard invoices={mockInvoices} />
    </PageShell>
  );
}
