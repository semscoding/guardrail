import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  FileSearch,
  Scale,
  ScrollText,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";

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
    href: "/invoices",
    pillar: "Pillar 2",
    title: "Invoice Guard",
    description:
      "Inspect inbound invoices for refund scams, impersonation, and off-platform payment lures before blocking payees.",
    cta: "Inspect inbound invoices",
    icon: FileSearch,
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
    <PageShell>
      <PageHeader
        title="Overview"
        description="Give AI a budget, not a blank cheque. Every proposal is checked against server-verified evidence before funds move."
      />

      <section
        aria-label="Guardrail workspaces"
        className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-card"
      >
        <ul className="divide-y divide-border">
          {SECTIONS.map(({ href, pillar, title, description, cta, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="group grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 px-5 py-5 transition-colors duration-150 hover:bg-surface md:grid-cols-[auto_1fr_auto] md:items-center md:px-6"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-ink-secondary transition-colors duration-150 group-hover:border-accent-ink/30 group-hover:text-accent-ink"
                >
                  <Icon className="size-[18px] stroke-[1.75]" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</span>
                    <Badge variant="secondary">{pillar}</Badge>
                  </span>
                  <span className="mt-1 block max-w-[68ch] text-sm leading-6 text-ink-secondary">{description}</span>
                </span>
                <span className="col-start-2 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink md:col-start-3">
                  {cta}
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 transition-transform duration-150 ease-[var(--ease-out-quart)] group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
