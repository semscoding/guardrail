import type { Metadata } from "next";
import { FileSearch } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Invoices · GUARDRAIL",
};

export default function InvoicesPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-[var(--container-shell)] flex-1 flex-col gap-section px-4 py-page-y focus:outline-none md:px-page-x"
    >
      <PageHeader
        title="Invoice Guard"
        description="Check inbound invoices for impersonation, urgency lures, and off-platform payment traps before funds leave."
      />

      <Card className="border-dashed bg-surface-raised/70">
        <CardHeader className="flex-row items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand"
          >
            <FileSearch className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle>No invoice selected</CardTitle>
            <CardDescription>
              Paste or select an inbound invoice here to inspect flagged signals and block malicious payees.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </main>
  );
}
