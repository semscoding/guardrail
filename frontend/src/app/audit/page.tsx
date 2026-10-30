import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Audit · GUARDRAIL",
};

export default function AuditPage() {
  return (
    <PageShell>
      <PageHeader
        title="Audit Log"
        description="Append-only ledger of every policy check, payment capture or void, dispute dossier, and invoice verdict."
      />

      <Card className="border-dashed bg-surface-raised/70">
        <CardHeader className="flex-row items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand"
          >
            <ScrollText className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle>Audit table ready</CardTitle>
            <CardDescription>
              Filterable decision history, rule chips, and CSV compliance export will render in this view.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </PageShell>
  );
}
