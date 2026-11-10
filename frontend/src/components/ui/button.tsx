import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground shadow-[0_1px_2px_rgb(11_22_40/0.18),inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-brand/88",
        destructive: "bg-block text-white shadow-[0_1px_2px_rgb(11_22_40/0.18)] hover:bg-block/90",
        outline:
          "border border-border-strong/80 bg-surface-raised text-ink shadow-[0_1px_2px_rgb(11_22_40/0.06)] hover:bg-surface-subtle",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-ink-secondary hover:bg-surface-subtle hover:text-ink",
        link: "text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
