import { BadgeCheck, Clock } from "lucide-react";
import { formatMoney, type PaymentSummary } from "@guardrail/apis/domain";

import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<PaymentSummary["status"], string> = {
  AUTHORIZED: "Authorized, not captured",
  CAPTURED: "Captured",
  CAPTURE_PENDING: "Capture pending",
  CAPTURE_DENIED: "Capture denied by PayPal",
  VOIDED: "Voided, never captured",
};

/** The PayPal side of the run, with the IDs a treasurer can look up in PayPal. */
export function Receipt({ payment }: { payment: PaymentSummary }) {
  // [term, value, is machine data (set in mono)]
  const rows: [string, string, boolean][] = [
    ["Amount", formatMoney(payment.amount), false],
    ["Status", STATUS_TEXT[payment.status], false],
    ["Payee", payment.payeeEmail ?? "Unknown", true],
    ["PayPal order", payment.orderId, true],
    ["Authorization", payment.authorizationId ?? "None", true],
    ["Capture", payment.captureId ?? "None", true],
  ];

  return (
    <section aria-labelledby="receipt-title" className="rounded-lg border border-border bg-surface-raised shadow-card p-card">
      <h2 id="receipt-title" className="text-base font-semibold text-ink">
        PayPal receipt
      </h2>
      <dl className="mt-3 grid grid-cols-[9rem_1fr] text-sm">
        {rows.map(([term, value, data]) => (
          <div key={term} className="contents">
            <dt className="border-t border-border py-2.5 text-ink-secondary">{term}</dt>
            <dd className={cn("break-all border-t border-border py-2.5 text-ink tabular-nums", data ? "font-mono text-sm" : "font-medium")}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex items-center gap-2 text-sm text-ink-secondary">
        {payment.webhookVerified ? (
          <>
            <BadgeCheck aria-hidden="true" className="size-4 text-allow" />
            Confirmed by PayPal (signed webhook)
          </>
        ) : (
          <>
            <Clock aria-hidden="true" className="size-4 text-approval" />
            Waiting for PayPal to confirm
          </>
        )}
      </p>
    </section>
  );
}
