"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Headset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSchema, type DbRow } from "@/lib/schema";
import type { AgentKey } from "@/lib/agents";
import { formatCallTime } from "@/lib/datetime";
import { getOverlay, applyOverlay, clearOverlay } from "@/lib/local-overlay";

interface Props {
  agent: AgentKey;
  /** Key-column value of the row to highlight + expand (set after a call). */
  highlightKey?: string | null;
}

const TIME_COLUMNS = new Set(["Call Time", "Last Call"]);
const LONG_TEXT_COLUMNS = new Set(["Issue", "Resolution", "Intent"]);

export default function CustomerDbTable({ agent, highlightKey }: Props) {
  const schema = getSchema(agent);
  const [rows, setRows] = useState<DbRow[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(highlightKey ?? null);
  const [resetting, setResetting] = useState(false);
  const [staleHeaders, setStaleHeaders] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/db/rows?agent=${agent}`, { cache: "no-store" });
      const d = await r.json();
      const base: DbRow[] = Array.isArray(d.rows) ? d.rows : schema.seedRows;
      const isConnected = Boolean(d.connected);
      setConnected(isConnected);
      const hdrs: string[] = Array.isArray(d.headers) ? d.headers : [];
      setStaleHeaders(isConnected && hdrs.length > 0 && schema.columns.some((c) => !hdrs.includes(c)));
      if (d.success === false && d.error) setError(String(d.error));
      setRows(isConnected ? base : applyOverlay(base, schema.keyColumn, getOverlay(agent)));
    } catch (e) {
      setConnected(false);
      setError(String(e));
      setRows(applyOverlay(schema.seedRows, schema.keyColumn, getOverlay(agent)));
    } finally {
      setLoading(false);
    }
  }, [agent, schema]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (highlightKey) setExpanded(highlightKey);
  }, [highlightKey]);

  const handleReset = async () => {
    if (!window.confirm("Reset this table to the demo seed data? Call write-backs will be cleared.")) return;
    setResetting(true);
    try {
      await fetch("/api/db/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent }),
      });
    } catch {
      /* not connected — overlay clear below is the reset */
    } finally {
      clearOverlay(agent);
      setExpanded(null);
      setResetting(false);
      load();
    }
  };

  const colCount = schema.displayColumns.length + 1;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-navy">{schema.title}</h2>
          {connected === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
              <CheckCircle className="h-3 w-3" /> Google Sheet connected
            </span>
          )}
          {connected === false && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3" /> Demo mode — sheet not connected (session data)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleReset} disabled={resetting}>
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reset demo data
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}
      {staleHeaders && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          The columns of this tab in the Google Sheet are out of date. Click <strong>Reset demo data</strong> once to
          rewrite the headers and seed rows (existing test rows are cleared).
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-left text-white">
                <th className="w-8 px-2 py-3" aria-label="expand" />
                {schema.displayColumns.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/90"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No rows yet.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const key = row[schema.keyColumn] || `row-${i}`;
                  const isHighlighted = Boolean(highlightKey) && key === highlightKey;
                  const isExpanded = expanded === key;
                  return (
                    <RowGroup
                      key={key}
                      row={row}
                      schema={schema}
                      index={i}
                      isHighlighted={isHighlighted}
                      isExpanded={isExpanded}
                      onToggle={() => setExpanded(isExpanded ? null : key)}
                      colCount={colCount}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RowGroup({
  row,
  schema,
  index,
  isHighlighted,
  isExpanded,
  onToggle,
  colCount,
}: {
  row: DbRow;
  schema: ReturnType<typeof getSchema>;
  index: number;
  isHighlighted: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  colCount: number;
}) {
  const transferred = (row["Transferred To"] || "").trim();
  const hasHandoff = transferred !== "" && transferred.toLowerCase() !== "none";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-border/60 transition-colors ${
          isHighlighted
            ? "bg-brand-soft/70 hover:bg-brand-soft"
            : index % 2 === 1
            ? "bg-muted/30 hover:bg-muted/50"
            : "bg-card hover:bg-muted/40"
        }`}
      >
        <td className="px-2 py-3 text-muted-foreground">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        {schema.displayColumns.map((col, ci) => {
          const raw = row[col] ?? "";
          let display: React.ReactNode = raw;
          if (TIME_COLUMNS.has(col)) display = formatCallTime(raw);
          if (col === "Transferred To") display = <TransferChip value={raw} />;
          if (col === "Handled By") display = <HandledByChip value={raw} />;
          if (col === "Routed To" && raw) display = <span className="font-medium text-foreground">{raw}</span>;
          const isKey = ci === 0;
          return (
            <td
              key={col}
              className={`px-3 py-3 align-top ${
                isKey ? "whitespace-nowrap font-medium text-foreground" : "text-foreground/80"
              } ${LONG_TEXT_COLUMNS.has(col) ? "min-w-[220px] max-w-[320px]" : "whitespace-nowrap"}`}
            >
              <span className={LONG_TEXT_COLUMNS.has(col) ? "line-clamp-2 leading-snug" : ""}>
                {display === "" ? <span className="text-muted-foreground/40">—</span> : display}
              </span>
              {isKey && isHighlighted && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  <Sparkles className="h-3 w-3" /> New
                </span>
              )}
            </td>
          );
        })}
      </tr>

      {isExpanded && (
        <tr className={isHighlighted ? "bg-brand-soft/40" : "bg-muted/20"}>
          <td colSpan={colCount} className="px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_minmax(260px,0.6fr)]">
              {/* Call summary */}
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Call Summary
                </p>
                {row["Call Summary"] ? (
                  <div className="prose prose-sm max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{row["Call Summary"]}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No call recorded yet.</p>
                )}
              </div>

              {/* Hand-off brief (the "screen-pop" a human agent would see) + meta */}
              <div className="space-y-4">
                {hasHandoff && (
                  <div className="rounded-lg border border-cyan/60 bg-navy p-4 text-white">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan">
                      <Headset className="h-3.5 w-3.5" /> Hand-off brief · {transferred}
                    </p>
                    <p className="text-xs text-white/60 mb-2">What the human agent sees before picking up</p>
                    <p className="text-sm leading-relaxed">{row["Hand-off Brief"] || "—"}</p>
                  </div>
                )}
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                  {schema.detailColumns
                    .filter((c) => c !== "Call Summary" && c !== "Hand-off Brief")
                    .map((c) => (
                      <DetailRow key={c} label={c} value={row[c]} />
                    ))}
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-5">
        {label}
      </dt>
      <dd className={`leading-5 text-foreground ${label === "Call ID" ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </>
  );
}

function TransferChip({ value }: { value: string }) {
  const v = value.trim();
  if (!v || v.toLowerCase() === "none") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-deep-purple/10 px-2 py-0.5 text-xs font-medium text-deep-purple">
      {v}
    </span>
  );
}

function HandledByChip({ value }: { value: string }) {
  const v = value.trim();
  if (!v) return <span className="text-xs text-muted-foreground">—</span>;
  const ai = v.toLowerCase().includes("ai");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ai ? "bg-cyan/20 text-navy" : "bg-navy text-white"
      }`}
    >
      {ai ? <Sparkles className="h-3 w-3" /> : <Headset className="h-3 w-3" />}
      {v}
    </span>
  );
}
