"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function isRouteActive(pathname: string, href: NavItem["href"]): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Vertical in the desktop sidebar, a five-up tab row on small screens. */
export function AppNav({
  orientation = "vertical",
  label = "Primary",
}: {
  orientation?: "vertical" | "horizontal";
  label?: string;
}) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav aria-label={label} className="w-full">
      <ul className={vertical ? "flex flex-col gap-0.5" : "grid grid-cols-5 gap-1"}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isRouteActive(pathname, href);

          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center rounded-md transition-[background-color,color] duration-150 ease-[var(--ease-out-quart)]",
                  vertical
                    ? "h-9 gap-3 px-2.5 text-sm"
                    : "flex-col justify-center gap-1 px-1 py-2 text-[11px] leading-tight",
                  active
                    ? "bg-accent-soft font-semibold text-accent-ink"
                    : "font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-[18px] shrink-0 stroke-[1.75]",
                    active ? "text-accent-ink" : "text-ink-muted group-hover:text-ink-secondary",
                  )}
                />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
