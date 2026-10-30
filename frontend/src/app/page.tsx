import type { Metadata } from "next";
import Link from "next/link";
import {
  FileSearch,
  Scale,
  ScrollText,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Overview · GUARDRAIL",
};

interface SectionLink {
  href: "/purchasing" | "/disputes" | "/invoices" | "/audit";
  pillar: string;
  title: string;
  description: string;
  cta: string;
  icon: LucideIcon;
}

const SECTIONS: readonly SectionLink[] = [
  {
    href: "/purchasing",
    pillar: "Pillar 1",
    title: "Autonomous Purchasing",
    description:
      "Delegate routine supply orders while deterministic rules R1–R10 verify the real PayPal order before capture.",
    cta: "Open purchasing workspace",
    icon: ShoppingBag,
  },
  {
    href: "/disputes",
    pillar: "Pillar 3",
    title: "Dispute Defender",
    description:
      "Assemble Seller Protection evidence packages from orders and carrier tracking for treasurer sign-off.",
    cta: "Review dispute queue",
    icon: Scale,
  },
  {
    href: "/invoices",
    pillar: "Pillar 2",
    title: "Invoice Guard",
    description:
      "Inspect inbound invoices for refund scams, impersonation, and off-platform payment lures before blocking payees.",
    cta: "Inspect inbound invoices",
    icon: FileSearch,
  },
  {
    href: "/audit",
    pillar: "Ledger",
    title: "Audit Log",
    description:
      "Search and export the append-only decision log across purchasing runs, disputes, and invoice checks.",
    cta: "Browse audit log",
    icon: ScrollText,
  },
];

export default function OverviewPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-[var(--container-shell)] flex-1 flex-col gap-section px-4 py-page-y focus:outline-none md:px-page-x"
    >
      <PageHeader
        title="Overview"
        description="Give AI a budget, not a blank cheque. Every proposal is checked against server-verified evidence before funds move."
      />

      <section aria-label="Guardrail workspaces" className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ href, pillar, title, description, cta, icon: Icon }) => (
          <Card key={href} className="justify-between">
            <CardHeader className="gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand"
                  >
                    <Icon className="size-4" />
                  </span>
                  <CardTitle>
                    <Link
                      href={href}
                      className="rounded-xs underline-offset-4 hover:underline"
                    >
                      {title}
                    </Link>
                  </CardTitle>
                </div>
                <Badge variant="secondary">{pillar}</Badge>
              </div>
              <CardDescription className="text-ink-secondary">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              <Link
                href={href}
                className="inline-flex items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                {cta}
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
