import {
  FileSearch,
  LayoutGrid,
  Scale,
  ScrollText,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: "/" | "/purchasing" | "/disputes" | "/invoices" | "/audit";
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/purchasing", label: "Purchasing", icon: ShoppingBag },
  { href: "/disputes", label: "Disputes", icon: Scale },
  { href: "/invoices", label: "Invoices", icon: FileSearch },
  { href: "/audit", label: "Audit", icon: ScrollText },
];
