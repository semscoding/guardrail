"use client";

import { useState } from "react";
import { CalendarClock, CircleAlert, FileCheck2, FilePen, Package, Send, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import type { AppError } from "@guardrail/apis/contracts";
import { formatMoney, type Dispute, type DisputeReason, type Dossier, type Evidence } from "@guardrail/apis/domain";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REASONS: Record<DisputeReason, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorised payment",
  CREDIT_NOT_PROCESSED: "Refund not processed",
  DUPLICATE_TRANSACTION: "Duplicate payment",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid by other means",
  CANCELED_RECURRING_BILLING: "Cancelled subscription",
  PROBLEM_WITH_REMITTANCE: "Problem with remittance",
  OTHER: "Other",
};

const EVIDENCE_ICONS: Record<Evidence["kind"], LucideIcon> = {
  ORDER: Package,
  TRACKING: Truck,
  ADDRESS: FileCheck2,
  COMMUNICATION: FileCheck2,
  REFUND_POLICY: FileCheck2,
};

const KIND_LABELS: Record<Evidence["kind"], string> = {
  ORDER: "Order",
  TRACKING: "Tracking",
  ADDRESS: "Delivery address",
  COMMUNICATION: "Customer messages",
  REFUND_POLICY: "Refund policy",
};

// UTC, like PayPal's deadlines: 15 Nov 23:59 UTC must not read as "16 Nov" in Amsterdam.
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function daysLeft(due: string | null, now: Date) {
  if (!due) return null;
  return Math.ceil((Date.parse(due) - now.getTime()) / 86_400_000);
}

/** Calls one of our endpoints and unwraps { data } / { error }. */
async function callApi<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: AppError } | null;
  if (!res.ok || !json || json.error || json.data === undefined) {
    throw new Error(json?.error?.message ?? "The server did not answer. Try again.");
  }
  return json.data;
}

type Action = "draft" | "approve" | "submit";

/**
 * `now` comes from the server render so the deadline countdown is the same on server and client.
 * Without `live` (mock data) the actions are hidden.
 */
export function DisputeDesk({ disputes: initial, now, live = false }: { disputes: Dispute[]; now: string; live?: boolean }) {
  const [disputes, setDisputes] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? null);
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = disputes.find((d) => d.id === selectedId) ?? null;
  const nowDate = new Date(now);

  async function run(action: Action, dispute: Dispute) {
    setPending(action);
    setError(null);
    try {
      const base = `/api/disputes/${encodeURIComponent(dispute.id)}`;
      let next: Dispute;
      if (action === "draft") {
        await callApi<Dossier>(`${base}/dossier`, "POST");
        next = await callApi<Dispute>(base);
      } else {
        next = await callApi<Dispute>(`${base}/${action}`, "POST", { dossierVersion: dispute.dossier!.version });
      }
      setDisputes((all) => all.map((d) => (d.id === next.id ? next : d)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  if (!disputes.length) {
    return <p className="text-sm text-ink-muted">No open disputes. New PayPal disputes appear here within minutes.</p>;
  }

  return (
    <div className="grid items-start gap-section lg:grid-cols-[minmax(16rem,20rem)_1fr]">
      <section aria-labelledby="queue-title" className="rounded-lg border border-border bg-surface-raised shadow-card">
        <h2 id="queue-title" className="border-b border-border px-card py-3 text-base font-semibold text-ink">
          Open disputes
        </h2>
        <ul>
          {disputes.map((d) => {
            const left = daysLeft(d.sellerResponseDue, nowDate);
            const active = d.id === selectedId;
            return (
              <li key={d.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 px-card py-3 text-left text-sm hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    active && "bg-surface-subtle",
                  )}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{REASONS[d.reason]}</span>
                    <span className="font-mono tabular-nums text-ink">{formatMoney(d.amount)}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-muted">{d.id}</span>
                  {left !== null ? (
                    <span className={cn("flex items-center gap-1 text-xs", left <= 2 ? "text-block" : "text-ink-secondary")}>
                      <CalendarClock aria-hidden="true" className="size-3.5" />
                      Respond within {left} {left === 1 ? "day" : "days"}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selected ? (
        <DisputeDetail
          key={selected.id}
          dispute={selected}
          live={live}
          pending={pending}
          error={error}
          onAction={(action) => run(action, selected)}
        />
      ) : null}
    </div>
  );
}

const DRAFTED_BY: Record<NonNullable<Dossier["draftedBy"]>, string> = {
  ai: "Drafted by AI from the evidence above. Every paragraph cites its evidence; nothing is sent until you approve.",
  template: "Drafted from a template in offline test mode, no AI. Every paragraph cites its evidence; nothing is sent until you approve.",
  demo_seed: "Pre-written demo draft, not AI. Draft again to build it from the collected evidence; nothing is sent until you approve.",
};

function statusLine(dispute: Dispute, dossier: Dossier): string {
  if (dossier.status === "SUBMITTED") return dossier.note ?? "Submitted.";
  if (dossier.status === "FAILED") return "PayPal did not accept this response. Draft again and retry.";
  if (dossier.status === "APPROVED") {
    return dispute.demo
      ? "Approved. Demo dispute: sending records the submission, nothing goes to PayPal."
      : "Approved. Send it to PayPal when ready.";
  }
  return dossier.strength === "WEAK"
    ? "This response is weak. Consider accepting the claim instead."
    : "Read it once more: this is what PayPal will see.";
}

function DisputeDetail({
  dispute,
  live,
  pending,
  error,
  onAction,
}: {
  dispute: Dispute;
  live: boolean;
  pending: Action | null;
  error: string | null;
  onAction: (action: Action) => void;
}) {
  const busy = pending !== null;
  const dossier = dispute.dossier;
  const evidenceById = new Map(dispute.evidence.map((e) => [e.id, e]));

  return (
    <div className="flex min-w-0 flex-col gap-section">
      <section aria-labelledby="evidence-title" className="rounded-lg border border-border bg-surface-raised shadow-card p-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="evidence-title" className="text-base font-semibold text-ink">
            {REASONS[dispute.reason]} · {formatMoney(dispute.amount)}
          </h2>
          {dispute.sellerResponseDue ? (
            <span className="text-sm text-ink-secondary">Due {date.format(new Date(dispute.sellerResponseDue))}</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          Evidence GUARDRAIL collected itself, from PayPal and the carrier. Nothing here was written by AI.
        </p>
        <ol className="mt-4 space-y-3">
          {dispute.evidence.map((e) => {
            const Icon = EVIDENCE_ICONS[e.kind];
            return (
              <li key={e.id} id={`evidence-${e.id}`} className="grid scroll-mt-24 grid-cols-[1.25rem_1fr] gap-3 rounded text-sm target:bg-approval-soft">
                <Icon aria-hidden="true" className="mt-0.5 size-4 text-ink-muted" />
                <div>
                  <p className="font-medium text-ink">{KIND_LABELS[e.kind]}</p>
                  <p className="text-ink">{e.summary}</p>
                  <p className="text-xs text-ink-muted">
                    Source: {e.source.replace(/_/g, " ")} · collected {dateTime.format(new Date(e.collectedAt))}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {dossier ? (
        <section aria-labelledby="dossier-title" className="rounded-lg border border-border-strong bg-surface-raised shadow-card p-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="dossier-title" className="text-base font-semibold text-ink">
              Response to PayPal, draft {dossier.version}
            </h2>
            {dossier.strength === "STRONG" ? (
              <Badge variant="allow">
                <ShieldCheck aria-hidden="true" />
                All required evidence present
              </Badge>
            ) : (
              <Badge variant="approval">
                <CircleAlert aria-hidden="true" />
                Missing: {dossier.missingEvidence.map((k) => KIND_LABELS[k]).join(", ")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-secondary">{DRAFTED_BY[dossier.draftedBy ?? "ai"]}</p>

          <div className="mt-4 space-y-4">
            {dossier.sections.map((section) => (
              <article key={section.heading}>
                <h3 className="font-medium text-ink">{section.heading}</h3>
                <p className="mt-1 max-w-prose text-ink">{section.body}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  <span className="text-ink-muted">Based on:</span>
                  {section.evidenceIds.map((id) => (
                    <a
                      key={id}
                      href={`#evidence-${id}`}
                      className="rounded border border-border bg-surface-subtle px-1.5 text-ink hover:underline"
                    >
                      {evidenceById.get(id) ? KIND_LABELS[evidenceById.get(id)!.kind] : id}
                    </a>
                  ))}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            {live && dossier.status === "DRAFT" ? (
              <>
                <Button size="lg" onClick={() => onAction("approve")} disabled={busy}>
                  <ShieldCheck aria-hidden="true" />
                  {pending === "approve" ? "Approving…" : "Approve"}
                </Button>
                <Button size="lg" variant="outline" onClick={() => onAction("draft")} disabled={busy}>
                  <FilePen aria-hidden="true" />
                  {pending === "draft" ? "Drafting…" : "Draft again"}
                </Button>
              </>
            ) : null}
            {live && dossier.status === "APPROVED" ? (
              <Button size="lg" onClick={() => onAction("submit")} disabled={busy}>
                <Send aria-hidden="true" />
                {pending === "submit" ? "Sending…" : "Send to PayPal"}
              </Button>
            ) : null}
            {live && dossier.status === "FAILED" ? (
              <Button size="lg" variant="outline" onClick={() => onAction("draft")} disabled={busy}>
                <FilePen aria-hidden="true" />
                {pending === "draft" ? "Drafting…" : "Draft again"}
              </Button>
            ) : null}
            <p className="text-sm text-ink-secondary" role="status">
              {statusLine(dispute, dossier)}
            </p>
          </div>
          {dispute.demo && dossier.status === "DRAFT" ? (
            <p className="mt-2 text-xs text-ink-muted">Demo dispute: submitting records it here, it is not sent to PayPal.</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-block" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-raised shadow-card p-card">
          <p className="text-sm text-ink-secondary">
            No response drafted yet. GUARDRAIL collects the evidence first, then drafts a response that cites it.
          </p>
          {live ? (
            <Button size="lg" onClick={() => onAction("draft")} disabled={busy}>
              <FilePen aria-hidden="true" />
              {pending === "draft" ? "Drafting…" : "Draft response"}
            </Button>
          ) : null}
          {error ? (
            <p className="text-sm text-block" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
