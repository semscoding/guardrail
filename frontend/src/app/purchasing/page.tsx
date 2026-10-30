import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Purchasing · GUARDRAIL",
};

export default function PurchasingPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-[var(--container-shell)] flex-1 flex-col gap-section px-4 py-page-y focus:outline-none md:px-page-x"
    >
      <PageHeader
        title="Autonomous Purchasing"
        description="Submit a supply request and watch the policy engine verify every rule against the real PayPal order."
      />

      <Card className="border-dashed bg-surface-raised/70">
        <CardHeader className="flex-row items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand"
          >
            <ShoppingBag className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle>No active purchasing run</CardTitle>
            <CardDescription>
              Policy card, live agent stream, and rule checklist R1–R10 will appear here once a run starts.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </main>
  );
}
