import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getPolicy } from "@guardrail/services/policies";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { PurchasingWorkspace } from "@/components/purchasing/PurchasingWorkspace";

export const metadata: Metadata = {
  title: "Purchasing · GUARDRAIL",
};

/** The demo has one policy; it becomes a choice once there are several. */
const POLICY_ID = "pol_club_supplies";

async function Workspace() {
  // Live database data: render per request, never at build time.
  await connection();
  const policy = await getPolicy(POLICY_ID);
  if (!policy) {
    return (
      <p role="alert" className="rounded-lg border border-approval-border bg-approval-soft p-card text-sm text-ink">
        No spending policy is set up yet, so the agent cannot buy anything. Load the demo policy with{" "}
        <code className="font-mono">npm run db:seed</code>.
      </p>
    );
  }
  return <PurchasingWorkspace policy={policy} />;
}

export default function PurchasingPage() {
  return (
    <PageShell>
      <PageHeader
        title="Purchasing"
        description="Give the agent a request. It proposes a purchase, and GUARDRAIL checks every rule against the real PayPal order before paying."
      />
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading your spending policy…</p>}>
        <Workspace />
      </Suspense>
    </PageShell>
  );
}
