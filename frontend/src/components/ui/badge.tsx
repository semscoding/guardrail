import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3.5 [&>svg]:pointer-events-none transition-[background-color,color,border-color] duration-150",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-surface-subtle text-ink-secondary",
        accent: "border-transparent bg-accent-soft text-accent-ink",
        outline: "border-border bg-surface-raised text-ink",
        allow: "border-allow-border bg-allow-soft text-allow",
        block: "border-block-border bg-block-soft text-block",
        approval: "border-approval-border bg-approval-soft text-approval",
        scam: "border-scam-border bg-scam-soft text-scam",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
