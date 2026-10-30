import type { Metadata } from "next";
import { Scale } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Disputes · GUARDRAIL",
};

export default function DisputesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Dispute Defender"
        description="Review incoming PayPal disputes, verify Seller Protection evidence, and approve dossiers before submission."
      />

      <Card className="border-dashed bg-surface-raised/70">
        <CardHeader className="flex-row items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand"
          >
            <Scale className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle>Dispute queue ready</CardTitle>
            <CardDescription>
              Incoming buyer disputes, carrier tracking evidence, and draft response dossiers will be listed here.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </PageShell>
  );
}
