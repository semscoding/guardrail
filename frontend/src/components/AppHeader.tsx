import { Suspense } from "react";
import Link from "next/link";
import { FlaskConical, TriangleAlert } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { BrandMark } from "@/components/BrandMark";
import { ResetDemoButton } from "@/components/ResetDemoButton";

const isLive = () => !(process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com").includes("sandbox");

/**
 * States a fact from config, not a claim: which PayPal environment payments go to.
 * Sandbox reads like a test-mode bar; live gets a warning so a demo is never confused with real money.
 */
export function EnvironmentBar() {
  const live = isLive();
  return (
    <aside
      aria-label="Payment environment"
      className={
        live
          ? "sticky top-0 z-50 flex h-8 items-center justify-center gap-2 border-b border-block-border bg-block-soft px-4 text-xs font-semibold text-block"
          : "sticky top-0 z-50 flex h-8 items-center justify-center gap-2 border-b border-sandbox-border bg-sandbox-soft px-4 text-xs font-semibold text-sandbox"
      }
    >
      {live ? (
        <TriangleAlert aria-hidden="true" className="size-3.5" />
      ) : (
        <FlaskConical aria-hidden="true" className="size-3.5" />
      )}
      <span>{live ? "PayPal live" : "PayPal sandbox"}</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span className="font-medium">{live ? "real payments" : "no real money moves"}</span>
    </aside>
  );
}

function NavFallback({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return <div className={orientation === "vertical" ? "h-[11.5rem]" : "h-14"} aria-hidden="true" />;
}

/** Desktop: sticky left sidebar. Small screens: a compact top bar with a tab row. */
export function AppSidebar() {
  return (
    <>
      <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-sidebar shrink-0 flex-col border-r border-border bg-surface-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" className="rounded-md">
            <BrandMark />
          </Link>
        </div>
        <div className="px-3">
          <Suspense fallback={<NavFallback orientation="vertical" />}>
            <AppNav />
          </Suspense>
        </div>
        <div className="mt-auto border-t border-border px-5 py-4">
          <p className="mb-3 text-xs text-ink-muted">AI proposes, code decides</p>
          <ResetDemoButton />
        </div>
      </aside>

      <header className="sticky top-8 z-40 border-b border-border bg-surface-raised lg:hidden">
        <div className="flex h-13 items-center justify-between gap-3 px-4">
          <Link href="/" className="rounded-md">
            <BrandMark />
          </Link>
          <ResetDemoButton />
        </div>
        <div className="border-t border-border px-2 py-1">
          <Suspense fallback={<NavFallback orientation="horizontal" />}>
            <AppNav orientation="horizontal" label="Primary, compact" />
          </Suspense>
        </div>
      </header>
    </>
  );
}
