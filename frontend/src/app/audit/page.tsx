import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { queryAudit } from "@guardrail/services/audit";

import { AuditGrid } from "@/components/audit/AuditGrid";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Audit · GUARDRAIL",
};

async function Log() {
  // Live database data: render per request, never at build time.
  await connection();
  const events = await queryAudit({ limit: 500 });
  return <AuditGrid events={events} />;
}

export default function AuditPage() {
  return (
    <PageShell>
      <PageHeader
        title="Audit log"
        description="Every decision GUARDRAIL made, with the rule, the source and the outcome. Entries can be added, never changed."
      />
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading the audit log…</p>}>
        <Log />
      </Suspense>
    </PageShell>
  );
}
