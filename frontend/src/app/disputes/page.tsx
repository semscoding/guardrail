import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { listDisputes } from "@guardrail/services/disputes";

import { DisputeDesk } from "@/components/disputes/DisputeDesk";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Disputes · GUARDRAIL",
};

async function Queue() {
  // Live database data: render per request, never at build time.
  await connection();
  const disputes = await listDisputes();
  return <DisputeDesk disputes={disputes} now={new Date().toISOString()} live />;
}

export default function DisputesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Disputes"
        description="When a buyer opens a PayPal dispute on a club shop sale, GUARDRAIL collects the evidence and drafts your response. You approve before anything is sent."
      />
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading disputes…</p>}>
        <Queue />
      </Suspense>
    </PageShell>
  );
}
