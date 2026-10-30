import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The one <main> per page. The skip link in the root layout targets its id. */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "mx-auto flex w-full max-w-[var(--container-shell)] flex-1 flex-col gap-section px-4 py-page-y focus:outline-none md:px-page-x",
        className,
      )}
    >
      {children}
    </main>
  );
}
