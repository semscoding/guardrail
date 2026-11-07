import { cn } from "@/lib/utils";

/** GUARDRAIL wordmark: a shield crossed by a single rail. Not a PayPal asset. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 28 28"
        className="size-7 shrink-0 rounded-[7px] bg-brand text-brand-foreground shadow-card"
      >
        <path
          d="M14 5.2 20.8 7.8v5.6c0 4.3-2.9 7.4-6.8 9.2-3.9-1.8-6.8-4.9-6.8-9.2V7.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path d="M10.2 14.2h7.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">GUARDRAIL</span>
    </span>
  );
}
