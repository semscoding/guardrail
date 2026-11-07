"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
  type IRowNode,
  type RowClickedEvent,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { CircleCheck, CircleX, Download, Hand, ShieldAlert, X, type LucideIcon } from "lucide-react";
import { RULE_LABELS, RuleId, type AuditEvent, type Pillar } from "@guardrail/apis/domain";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid's Quartz theme, tuned to the GUARDRAIL tokens so the grid reads as part of the ledger.
const gridTheme = themeQuartz.withParams({
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  foregroundColor: "var(--ink)",
  backgroundColor: "var(--surface-raised)",
  headerBackgroundColor: "var(--surface)",
  headerTextColor: "var(--ink-muted)",
  headerFontSize: 12,
  headerFontWeight: 500,
  borderColor: "var(--border)",
  accentColor: "var(--accent-ink)",
  rowHoverColor: "var(--surface)",
  selectedRowBackgroundColor: "var(--accent-soft)",
  wrapperBorderRadius: 8,
  wrapperBorder: { color: "var(--border)" },
  rowHeight: 48,
  headerHeight: 40,
  cellHorizontalPadding: 16,
});

type Tone = "allow" | "block" | "approval" | "scam" | "secondary";

const OUTCOME_TONES: Record<string, Tone> = {
  ALLOW: "allow",
  CAPTURED: "allow",
  STRONG: "allow",
  SUBMITTED: "allow",
  SAFE: "allow",
  BLOCK: "block",
  VOIDED: "block",
  FAILED: "block",
  NEEDS_APPROVAL: "approval",
  WEAK: "approval",
  SUSPICIOUS: "scam",
  SCAM: "scam",
};

const TONE_ICONS: Record<Tone, LucideIcon | null> = {
  allow: CircleCheck,
  block: CircleX,
  approval: Hand,
  scam: ShieldAlert,
  secondary: null,
};

const PROPER_NAMES: Record<string, string> = { paypal: "PayPal" };

const humanize = (value: string) =>
  PROPER_NAMES[value] ?? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, " ");

function OutcomeCell({ value }: ICellRendererParams<AuditEvent, string | null>) {
  if (!value) return <span className="text-ink-muted">–</span>;
  const tone = OUTCOME_TONES[value] ?? "secondary";
  const Icon = TONE_ICONS[tone];
  return (
    <Badge variant={tone}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {humanize(value)}
    </Badge>
  );
}

const failedRulesOf = (event: AuditEvent): RuleId[] => {
  const raw = event.data.failedRules;
  return Array.isArray(raw) ? raw.filter((r): r is RuleId => RuleId.safeParse(r).success) : [];
};

function RulesCell({ data }: ICellRendererParams<AuditEvent>) {
  const rules = data ? failedRulesOf(data) : [];
  if (!rules.length) return <span className="text-ink-muted">–</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {rules.map((id) => (
        <Link
          key={id}
          href={`/purchasing#rule-${id}`}
          title={RULE_LABELS[id]}
          aria-label={`${id}: ${RULE_LABELS[id]}`}
          className="rounded border border-block-border bg-block-soft px-1.5 font-mono text-xs leading-5 text-block hover:underline"
          // Keep the row click (details panel) from firing when a chip is followed.
          onClick={(e) => e.stopPropagation()}
        >
          {id}
        </Link>
      ))}
    </span>
  );
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const PILLARS: { value: Pillar | "all"; label: string }[] = [
  { value: "all", label: "All pillars" },
  { value: "purchasing", label: "Purchasing" },
  { value: "invoices", label: "Invoices" },
  { value: "disputes", label: "Disputes" },
  { value: "system", label: "System" },
];

const selectClass = "gr-field h-9 px-2.5 text-sm";

export function AuditGrid({ events }: { events: AuditEvent[] }) {
  const apiRef = useRef<GridApi<AuditEvent> | null>(null);
  const seenSeqs = useRef<Set<number>>(new Set());
  const [quickFilter, setQuickFilter] = useState("");
  const [pillar, setPillar] = useState<Pillar | "all">("all");
  const [outcome, setOutcome] = useState<string>("all");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [visibleCount, setVisibleCount] = useState(events.length);

  const outcomes = useMemo(
    () => Array.from(new Set(events.map((e) => e.outcome).filter((o): o is string => Boolean(o)))).sort(),
    [events],
  );

  const columnDefs = useMemo<ColDef<AuditEvent>[]>(
    () => [
      { field: "seq", headerName: "#", width: 72, sort: "desc", type: "numericColumn" },
      {
        field: "at",
        headerName: "Time",
        width: 170,
        valueFormatter: (p) => (p.value ? timeFormat.format(new Date(p.value)) : ""),
        // Export the exact timestamp, not the display format.
        useValueFormatterForExport: false,
      },
      { field: "pillar", headerName: "Pillar", width: 120, valueFormatter: (p) => (p.value ? humanize(p.value) : "") },
      { field: "actor", headerName: "Actor", width: 100, valueFormatter: (p) => (p.value ? humanize(p.value) : "") },
      { field: "action", headerName: "Action", width: 170, cellClass: "font-mono text-xs" },
      {
        field: "outcome",
        headerName: "Outcome",
        width: 150,
        cellRenderer: OutcomeCell,
        enableCellChangeFlash: true,
      },
      {
        colId: "rules",
        headerName: "Broken rules",
        width: 170,
        valueGetter: (p) => (p.data ? failedRulesOf(p.data).join(" ") : ""),
        cellRenderer: RulesCell,
      },
      { field: "summary", headerName: "Summary", flex: 1, minWidth: 260, tooltipField: "summary" },
      {
        field: "hash",
        headerName: "Hash",
        width: 120,
        cellClass: "font-mono text-xs text-ink-muted",
        valueFormatter: (p) => (p.value ? `${p.value.slice(0, 10)}…` : ""),
        useValueFormatterForExport: false,
      },
    ],
    [],
  );

  const isExternalFilterPresent = useCallback(() => pillar !== "all" || outcome !== "all", [pillar, outcome]);
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<AuditEvent>) =>
      !!node.data &&
      (pillar === "all" || node.data.pillar === pillar) &&
      (outcome === "all" || node.data.outcome === outcome),
    [pillar, outcome],
  );

  // New rows (e.g. a run that just finished) flash once so the eye finds them.
  const onRowDataUpdated = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const fresh: IRowNode<AuditEvent>[] = [];
    api.forEachNode((node) => {
      if (node.data && !seenSeqs.current.has(node.data.seq)) {
        if (seenSeqs.current.size > 0) fresh.push(node);
        seenSeqs.current.add(node.data.seq);
      }
    });
    if (fresh.length) api.flashCells({ rowNodes: fresh });
  }, []);

  const exportCsv = () =>
    apiRef.current?.exportDataAsCsv({
      fileName: `guardrail-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      onlySelected: false,
      allColumns: true,
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm text-ink-secondary">
          Search
          <input
            type="search"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            placeholder="Order ID, payee, rule, summary…"
            className="gr-field h-9 px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-secondary">
          Pillar
          <select value={pillar} onChange={(e) => setPillar(e.target.value as Pillar | "all")} className={selectClass}>
            {PILLARS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-secondary">
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={selectClass}>
            <option value="all">All outcomes</option>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {humanize(o)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={exportCsv} className="ml-auto">
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <p className="text-sm text-ink-secondary" aria-live="polite">
        Showing {visibleCount} of {events.length} entries. Click a row for its full record.
      </p>

      <div className={cn("grid gap-4", selected && "xl:grid-cols-[1fr_22rem]")}>
        <div className="h-[560px] min-w-0 rounded-lg shadow-card">
          <AgGridReact<AuditEvent>
            theme={gridTheme}
            rowData={events}
            columnDefs={columnDefs}
            getRowId={(p) => String(p.data.seq)}
            quickFilterText={quickFilter}
            isExternalFilterPresent={isExternalFilterPresent}
            doesExternalFilterPass={doesExternalFilterPass}
            onGridReady={(e) => {
              apiRef.current = e.api;
              onRowDataUpdated();
            }}
            onRowDataUpdated={onRowDataUpdated}
            onModelUpdated={(e) => setVisibleCount(e.api.getDisplayedRowCount())}
            onRowClicked={(e: RowClickedEvent<AuditEvent>) => setSelected(e.data ?? null)}
            onCellKeyDown={(e) => {
              // Same as a click, for keyboard users: Enter on a focused cell opens the record.
              if ((e.event as KeyboardEvent | undefined)?.key === "Enter" && e.data) setSelected(e.data);
            }}
            rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
            tooltipShowDelay={400}
          />
        </div>

        {selected ? (
          <aside
            aria-labelledby="audit-detail-title"
            className="rounded-lg border border-border bg-surface-raised shadow-card p-card text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="audit-detail-title" className="text-base font-semibold text-ink">
                Entry #{selected.seq}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label="Close details">
                <X aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-1 text-ink">{selected.summary}</p>
            <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-ink-secondary">Action</dt>
              <dd className="font-mono text-xs leading-5">{selected.action}</dd>
              <dt className="text-ink-secondary">Entity</dt>
              <dd className="break-all font-mono text-xs leading-5">
                {selected.entity} {selected.entityId}
              </dd>
              <dt className="text-ink-secondary">Hash</dt>
              <dd className="break-all font-mono text-xs leading-5">{selected.hash}</dd>
            </dl>
            <h3 className="mt-4 font-medium text-ink">Recorded data</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-surface-subtle p-3 font-mono text-xs leading-5 text-ink">
              {JSON.stringify(selected.data, null, 2)}
            </pre>
            <p className="mt-3 text-xs text-ink-muted">
              Each entry&rsquo;s hash covers the previous one, so a changed row breaks the chain.
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
