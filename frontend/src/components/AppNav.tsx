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

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="w-full md:w-auto">
      <ul className="grid grid-cols-5 gap-1 md:flex md:items-center md:gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isRouteActive(pathname, href);

          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 rounded-md px-1.5 py-2 text-[11px] leading-tight transition-[background-color,color] duration-150 ease-[var(--ease-out-quart)] md:flex-row md:gap-2 md:px-3 md:py-1.5 md:text-sm",
                  active
                    ? "bg-surface-subtle font-semibold text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand"
                    : "font-medium text-ink-secondary hover:bg-surface-subtle/70 hover:text-ink"
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-brand stroke-[2.25]" : "text-ink-muted"
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
