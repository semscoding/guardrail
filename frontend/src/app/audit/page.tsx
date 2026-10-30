import type { Metadata } from "next";
import { mockAudit } from "@guardrail/apis/mocks";

import { AuditGrid } from "@/components/audit/AuditGrid";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Audit · GUARDRAIL",
};

export default function AuditPage() {
  return (
    <PageShell>
      <PageHeader
        title="Audit log"
        description="Every decision GUARDRAIL made, with the rule, the source and the outcome. Entries can be added, never changed."
      />
      {/* mockAudit until GET /api/audit is on main. */}
      <AuditGrid events={mockAudit} />
    </PageShell>
  );
}
