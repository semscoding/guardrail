import { Suspense } from "react";
import Link from "next/link";
import { FlaskConical, ShieldCheck, TriangleAlert } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/navigation";
import { ResetDemoButton } from "@/components/ResetDemoButton";

function AppNavSkeleton() {
  return (
    <nav aria-label="Primary" className="w-full md:w-auto">
      <ul className="grid grid-cols-5 gap-1 md:flex md:items-center md:gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href} className="min-w-0">
            <Link
              href={href}
              className="relative flex flex-col items-center justify-center gap-1 rounded-md px-1.5 py-2 text-[11px] font-medium leading-tight text-ink-secondary md:flex-row md:gap-2 md:px-3 md:py-1.5 md:text-sm"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * States a fact from config, not a claim: which PayPal environment payments go to.
 * Live payments get a warning style so a demo can never be confused with real money.
 */
function PayPalEnvironmentBadge() {
  const live = !(process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com").includes("sandbox");
  return live ? (
    <Badge variant="block" className="font-medium">
      <TriangleAlert aria-hidden="true" />
      <span>PayPal live</span>
    </Badge>
  ) : (
    <Badge variant="secondary" className="font-medium">
      <FlaskConical aria-hidden="true" />
      <span>PayPal sandbox</span>
    </Badge>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-raised/95 backdrop-blur-xs">
      <div className="mx-auto flex max-w-[var(--container-shell)] flex-wrap items-center justify-between gap-x-6 px-4 md:h-header md:flex-nowrap md:px-page-x">
        <div className="flex h-13 items-center gap-3 md:h-auto">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-md py-1 text-ink"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground shadow-2xs"
            >
              <ShieldCheck className="size-4 stroke-[2.25]" />
            </span>
            <span className="text-base font-semibold tracking-tight text-ink">
              GUARDRAIL
            </span>
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-border xl:inline-block"
          />
          <span className="hidden text-xs text-ink-muted xl:inline">
            AI proposes, code decides
          </span>
        </div>

        <div className="order-3 -mx-4 w-[calc(100%+2rem)] border-t border-border bg-surface-raised px-2 py-1 md:order-2 md:mx-0 md:w-auto md:border-t-0 md:bg-transparent md:p-0">
          <Suspense fallback={<AppNavSkeleton />}>
            <AppNav />
          </Suspense>
        </div>

        <div className="order-2 flex h-13 items-center gap-2 md:order-3 md:h-auto">
          <ResetDemoButton />
          <PayPalEnvironmentBadge />
        </div>
      </div>
    </header>
  );
}
