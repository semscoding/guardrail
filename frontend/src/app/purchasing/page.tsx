import type { Metadata } from "next";
import { mockPolicy } from "@guardrail/apis/mocks";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { PurchasingWorkspace } from "@/components/purchasing/PurchasingWorkspace";

export const metadata: Metadata = {
  title: "Purchasing · GUARDRAIL",
};

export default function PurchasingPage() {
  return (
    <PageShell>
      <PageHeader
        title="Purchasing"
        description="Give the agent a request. It proposes a purchase, and GUARDRAIL checks every rule against the real PayPal order before paying."
      />
      {/* mockPolicy until GET /api/policies/:id is on main. */}
      <PurchasingWorkspace policy={mockPolicy} />
    </PageShell>
  );
}
