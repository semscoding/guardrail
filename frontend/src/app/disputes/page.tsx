import type { Metadata } from "next";
import { mockDisputes } from "@guardrail/apis/mocks";

import { DisputeDesk } from "@/components/disputes/DisputeDesk";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Disputes · GUARDRAIL",
};

export default function DisputesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Disputes"
        description="When a buyer opens a PayPal dispute on a club shop sale, GUARDRAIL collects the evidence and drafts your response. You approve before anything is sent."
      />
      {/* mockDisputes until GET /api/disputes is on main. */}
      <DisputeDesk disputes={mockDisputes} />
    </PageShell>
  );
}
