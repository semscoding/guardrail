"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Ban, CircleCheck, FileSearch, ShieldAlert, TriangleAlert } from "lucide-react";
import { ENDPOINTS } from "@guardrail/apis/contracts";
import { formatMoney, type Finding, type InboundInvoice, type InvoiceAnalysis, type SignalKind, type Verdict } from "@guardrail/apis/domain";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIGNAL_LABELS: Record<SignalKind, string> = {
  PHONE_NUMBER: "Phone number to call",
  BRAND_IMPERSONATION: "Impersonated brand",
  URGENCY: "Time pressure",
  CALL_TO_CANCEL: "Pushes you off PayPal",
  UNKNOWN_PAYEE: "Unknown payee",
  CRYPTO: "Crypto payment",
  AMOUNT_PATTERN: "Typical scam amount",
  OTHER: "Other signal",
};

const VERDICTS: Record<Verdict, { label: string; variant: "allow" | "approval" | "scam"; icon: typeof CircleCheck; advice: string }> = {
  SAFE: { label: "Looks legitimate", variant: "allow", icon: CircleCheck, advice: "No scam signals found. Pay it as usual if you expected it." },
  SUSPICIOUS: { label: "Suspicious", variant: "approval", icon: TriangleAlert, advice: "Check with the sender through a channel you already know before paying." },
  SCAM: { label: "Scam", variant: "scam", icon: ShieldAlert, advice: "Don't pay and don't call any number in it. Block the payee." },
};

/** POST to our API and validate the reply with the contract schema. Returns data or a user-safe error message. */
type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function post<T>(
  path: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } },
  body?: unknown,
): Promise<Reply<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) return { ok: false, error: "The server sent an unexpected answer. Try again." };
    const reply = parsed.data as { data: T } | { error: { message: string } };
    return "data" in reply ? { ok: true, data: reply.data } : { ok: false, error: reply.error.message };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

/** The invoice text with every finding marked in place, so the reason is visible where it is written. */
function MarkedText({ text, findings }: { text: string; findings: Finding[] }) {
  const sorted = [...findings].sort((a, b) => a.span.start - b.span.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((f, i) => {
    if (f.span.start < cursor || f.span.end === f.span.start) return; // overlapping or not in the text: list only
    parts.push(text.slice(cursor, f.span.start));
    parts.push(
      <mark
        key={i}
        title={`${SIGNAL_LABELS[f.kind]}: ${f.explanation}`}
        className="rounded-sm bg-scam-soft px-0.5 text-ink underline decoration-scam decoration-2 underline-offset-2"
      >
        {text.slice(f.span.start, f.span.end)}
        <sup className="ml-0.5 font-mono text-[0.65rem] text-scam">{i + 1}</sup>
      </mark>,
    );
    cursor = f.span.end;
  });
  parts.push(text.slice(cursor));
  return <p className="whitespace-pre-wrap font-mono text-sm leading-6 text-ink">{parts}</p>;
}

export function InvoiceGuard({ invoices: initial }: { invoices: InboundInvoice[] }) {
  const [invoices, setInvoices] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const textId = useId();
  const selected = invoices.find((i) => i.id === selectedId) ?? null;

  async function analyze(e: FormEvent) {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    setFormMessage(null);
    const result = await post<InboundInvoice>(ENDPOINTS.analyzeInvoice.path, ENDPOINTS.analyzeInvoice.response, { text: draft });
    setChecking(false);
    if (!result.ok) {
      setFormMessage(result.error);
      return;
    }
    setInvoices((list) => [result.data, ...list.filter((i) => i.id !== result.data.id)]);
    setSelectedId(result.data.id);
    setDraft("");
  }

  function markBlocked(payeeEmail: string) {
    setInvoices((list) => list.map((i) => (i.payeeEmail?.toLowerCase() === payeeEmail.toLowerCase() ? { ...i, payeeBlocked: true } : i)));
  }

  return (
    <div className="grid items-start gap-section lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <div className="flex flex-col gap-section">
        <form onSubmit={analyze} className="rounded-lg border border-border bg-surface-raised p-card">
          <label htmlFor={textId} className="text-base font-semibold text-ink">
            Check an invoice
          </label>
          <p className="mt-1 text-sm text-ink-secondary">Paste the PayPal invoice email or its note.</p>
          <textarea
            id={textId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="mt-3 w-full rounded-md border border-border-strong bg-surface-raised p-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button type="submit" className="mt-3" disabled={!draft.trim() || checking}>
            <FileSearch aria-hidden="true" />
            {checking ? "Checking…" : "Check invoice"}
          </Button>
          {formMessage ? (
            <p role="alert" className="mt-3 text-sm text-block">
              {formMessage}
            </p>
          ) : null}
        </form>

        <section aria-labelledby="received-title" className="rounded-lg border border-border bg-surface-raised">
          <h2 id="received-title" className="border-b border-border px-card py-3 text-base font-semibold text-ink">
            Checked invoices
          </h2>
          {invoices.length ? null : <p className="px-card py-3 text-sm text-ink-secondary">No invoices checked yet.</p>}
          <ul>
            {invoices.map((inv) => {
              const v = VERDICTS[inv.verdict];
              const Icon = v.icon;
              return (
                <li key={inv.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    aria-current={inv.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(inv.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-1.5 px-card py-3 text-left text-sm hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      inv.id === selectedId && "bg-surface-subtle",
                    )}
                  >
                    <span className="flex w-full items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-ink">{inv.text.split("\n")[0]}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={v.variant}>
                        <Icon aria-hidden="true" />
                        {v.label}
                      </Badge>
                      {inv.amount ? <span className="font-mono text-xs tabular-nums text-ink-secondary">{formatMoney(inv.amount)}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {selected ? (
        <InvoiceDetail key={selected.id} invoice={selected} onBlocked={markBlocked} />
      ) : null}
    </div>
  );
}

/** Says whether an AI looked at the invoice. Rule output is never presented as AI. */
function AnalysisNote({ analysis }: { analysis: InvoiceAnalysis }) {
  if (analysis.mode === "anthropic") {
    return analysis.tactic ? (
      <p className="mt-1 text-sm text-ink">
        <span className="font-medium">Tactic, according to AI:</span> {analysis.tactic}
      </p>
    ) : null;
  }
  return (
    <p className="mt-1 text-sm text-ink-secondary">
      {analysis.mode === "offline"
        ? "AI explanation unavailable: offline test mode. This verdict comes from fixed rules only."
        : "AI explanation unavailable: the AI step failed. This verdict comes from fixed rules only."}
    </p>
  );
}

function InvoiceDetail({ invoice, onBlocked }: { invoice: InboundInvoice; onBlocked: (payeeEmail: string) => void }) {
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const blocked = invoice.payeeBlocked;
  const v = VERDICTS[invoice.verdict];
  const Icon = v.icon;
  async function block() {
    setBlocking(true);
    setBlockError(null);
    const path = ENDPOINTS.blockPayee.path.replace(":id", encodeURIComponent(invoice.id));
    const result = await post<{ payeeEmail: string }>(path, ENDPOINTS.blockPayee.response);
    setBlocking(false);
    if (!result.ok) setBlockError(result.error);
    else onBlocked(result.data.payeeEmail);
  }

  const tone = { allow: "border-allow-border bg-allow-soft text-allow", approval: "border-approval-border bg-approval-soft text-approval", scam: "border-scam-border bg-scam-soft text-scam" }[v.variant];

  return (
    <div className="flex min-w-0 flex-col gap-section">
      <div role="status" className={cn("gr-stamp flex items-start gap-4 rounded-lg border-2 p-card", tone)}>
        <Icon aria-hidden="true" className="mt-0.5 size-8 shrink-0" />
        <div>
          <p className="text-2xl font-semibold tracking-tight">{v.label}</p>
          <p className="mt-1 text-sm text-ink">{v.advice}</p>
          <AnalysisNote analysis={invoice.analysis} />
        </div>
      </div>

      <section aria-labelledby="invoice-title" className="rounded-lg border border-border bg-surface-raised p-card">
        <h2 id="invoice-title" className="text-base font-semibold text-ink">
          The invoice, with what we found
        </h2>
        <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-secondary">From</dt>
          <dd className="break-all font-mono text-ink">{invoice.payeeEmail ?? "Unknown"}</dd>
          {invoice.amount ? (
            <>
              <dt className="text-ink-secondary">Amount</dt>
              <dd className="font-mono tabular-nums text-ink">{formatMoney(invoice.amount)}</dd>
            </>
          ) : null}
          {invoice.paypalInvoiceId ? (
            <>
              <dt className="text-ink-secondary">Invoice</dt>
              <dd className="break-all font-mono text-ink">{invoice.paypalInvoiceId}</dd>
            </>
          ) : null}
        </dl>
        <div className="mt-4 rounded-md border border-border bg-surface-subtle p-4">
          <MarkedText text={invoice.text} findings={invoice.findings} />
        </div>

        {invoice.findings.length ? (
          <ol className="mt-4 space-y-2 text-sm">
            {[...invoice.findings]
              .sort((a, b) => a.span.start - b.span.start)
              .map((f, i) => (
                <li key={`${f.kind}-${f.span.start}`} className="grid grid-cols-[1.5rem_1fr] gap-2">
                  <span className="font-mono text-xs leading-5 text-scam">{i + 1}</span>
                  <span>
                    <span className="font-medium text-ink">{SIGNAL_LABELS[f.kind]}.</span>{" "}
                    {f.explanation.toLowerCase() !== SIGNAL_LABELS[f.kind].toLowerCase() ? (
                      <span className="text-ink-secondary">{f.explanation} </span>
                    ) : null}
                    <span className="text-xs text-ink-muted">
                      ({f.detectedBy === "rule" ? "found by a fixed rule" : "found by AI"}
                      {f.span.end === f.span.start ? ", from the invoice details, not in the text" : ""})
                    </span>
                  </span>
                </li>
              ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-ink-secondary">No scam signals in this text.</p>
        )}
      </section>

      {invoice.verdict !== "SAFE" && invoice.payeeEmail ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" variant={blocked ? "outline" : "default"} onClick={block} disabled={blocked || blocking}>
            <Ban aria-hidden="true" />
            {blocked ? "Payee blocked" : blocking ? "Blocking…" : "Block this payee"}
          </Button>
          <p className="text-sm text-ink-secondary" role="status">
            {blocked
              ? "Rule R10 now refuses any payment to this payee, including by the agent."
              : "Blocking adds the payee to rule R10: GUARDRAIL will refuse any payment to them."}
          </p>
          {blockError ? (
            <p role="alert" className="w-full text-sm text-block">
              {blockError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
