import { useState, useEffect, type ReactNode } from "react";
import {
  buildReconRows,
  SOURCE_HEALTH_META,
  type DataSourceRow,
  type ReconRow,
  type ReconRowInput,
} from "../../../lib/accountsFinancialFlow";

// ── Accounts › Reconciliation (layered, §8) ─────────────────────────────────
// The honesty section, in three layers so a first-time viewer is never faced
// with a wall of empty cells:
//
//   LEVEL 1 — compact evidence-driven status chips, one per data domain
//     (Stripe cash basis · Order basis · Channel classification · Provider
//     earnings · Ad-spend sync · Company expenses). "Balanced" is RESERVED
//     for exact-equality comparisons (Order Basis = Channel Total); the
//     cash-vs-order relationship can only read "Reconciled · explained
//     differences", never "Balanced".
//
//   LEVEL 2 — the Stripe ↔ Orders cash-to-order bridge (passed in as
//     `bridgeSlot`), itemizing only PROVEN bridge items, including
//     additional-documentation payments without a primary order row.
//
//   LEVEL 3 — the full comparison detail (two tables, data-source health,
//     unclassified counts) behind an accessible toggle. Auto-opens when
//     anything needs review; a table whose side has no data collapses to a
//     one-line "Unavailable" note instead of a grid of dashes.
//
// Comparison groups, deliberately kept apart:
//   A. Stripe cash basis vs Order basis — legitimately differ; itemized by
//      the bridge; only "Explained" when the bridge has no residual.
//   B. Order basis vs Channel Contribution — SAME basis, must tie EXACTLY.
// Counts only — no customer PII ever reaches this component.

const fmtUsd = (n: number | null) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n: number | null) => (n == null ? "—" : Math.trunc(n).toLocaleString("en-US"));

export interface BasisTotals {
  paidOrders: number | null;
  gross: number | null;
  refunds: number | null;
  net: number | null;
  provider: number | null;
}

/** Level-1 status chip. Statuses mirror §8 of the correction addendum. */
export interface ReconChip {
  key: string;
  label: string;
  status: "balanced_exact" | "explained" | "ok" | "sync_pending" | "needs_review" | "error" | "unavailable";
  detail: string;
}

const CHIP_META: Record<ReconChip["status"], { label: string; cls: string; icon: string }> = {
  balanced_exact: { label: "Balanced",                            cls: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "ri-checkbox-circle-fill" },
  explained:      { label: "Reconciled · explained differences",  cls: "text-[#3b6ea5] bg-[#eef4fa] border-[#d6e4f0]",      icon: "ri-checkbox-circle-line" },
  ok:             { label: "Reconciled",                          cls: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "ri-checkbox-circle-line" },
  sync_pending:   { label: "Sync Pending",                        cls: "text-amber-700 bg-amber-50 border-amber-200",       icon: "ri-time-line" },
  needs_review:   { label: "Needs Review",                        cls: "text-amber-700 bg-amber-50 border-amber-200",       icon: "ri-error-warning-line" },
  error:          { label: "Data Source Error",                   cls: "text-rose-700 bg-rose-50 border-rose-200",          icon: "ri-close-circle-line" },
  unavailable:    { label: "Unavailable",                         cls: "text-gray-500 bg-gray-50 border-gray-200",          icon: "ri-question-line" },
};

interface Props {
  rangeLabel: string;
  /** Level 1 — computed by the Accounts shell from the SAME lifted evidence. */
  chips: ReconChip[];
  /** Aggregate add-on payment facts (count + gross) — no PII. */
  addonSummary?: { count: number | null; grossUsd: number | null };
  /** Level 2 — the mounted Stripe ↔ Orders bridge panel. */
  bridgeSlot?: ReactNode;
  stripeBasis: BasisTotals;
  orderBasis: BasisTotals;
  channelTotals: BasisTotals;
  bridgeFullyExplained: boolean | null;
  sources: DataSourceRow[];
  unclassified: { label: string; count: number | null; note: string }[];
  /** Opens the Level-3 detail on first render (e.g. something needs review). */
  detailInitiallyOpen?: boolean;
}

const hasAnyValue = (b: BasisTotals): boolean =>
  b.paidOrders != null || b.gross != null || b.refunds != null || b.net != null || b.provider != null;

export default function AccountsReconciliationView({
  rangeLabel, chips, addonSummary, bridgeSlot,
  stripeBasis, orderBasis, channelTotals, bridgeFullyExplained, sources, unclassified,
  detailInitiallyOpen = false,
}: Props) {
  const [showDetail, setShowDetail] = useState(detailInitiallyOpen);
  // Auto-open (never auto-close) when attention arrives after mount.
  useEffect(() => {
    if (detailInitiallyOpen) setShowDetail(true);
  }, [detailInitiallyOpen]);

  const basisRows = buildReconRows(
    metricRows(stripeBasis, orderBasis, {
      paidOrders: "Stripe counts payments settled in range; orders counts orders paid in range. Add-on document payments have no order row.",
      gross: "Add-on document payments, charged-vs-recorded price differences and boundary charges.",
      refunds: "Stripe counts refunds by refund date; the order basis attaches refunds to the order's paid month.",
      net: "The combined effect of the gross and refund basis differences.",
      provider: "Stripe deducts per charge via the payout resolver; the order basis sums all earnings on the completed order.",
    }),
    bridgeFullyExplained,
  );

  // Same basis on both sides → any difference is a genuine defect (basisNote null).
  const channelRows = buildReconRows(
    metricRows(orderBasis, channelTotals, {
      paidOrders: null, gross: null, refunds: null, net: null, provider: null,
    }),
    bridgeFullyExplained,
  );

  const channelClean = channelRows.every((r) => r.status === "ok" || r.status === "unavailable");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="mb-3">
        <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
          <i className="ri-scales-3-line text-[#3b6ea5]"></i>Reconciliation
        </h3>
        <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
          Where each Accounts figure comes from and whether the sections agree for <span className="font-semibold text-[#3b6ea5]">{rangeLabel}</span>.
          Differences are shown as they are — nothing is rounded away or hidden.
        </p>
      </div>

      {/* ── LEVEL 1: status chips ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {chips.map((c) => {
          const meta = CHIP_META[c.status];
          return (
            <div key={c.key} className="border border-gray-200 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-gray-800 truncate">{c.label}</span>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border ${meta.cls}`}>
                  <i className={meta.icon}></i>{meta.label}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">{c.detail}</p>
            </div>
          );
        })}
      </div>

      {/* Unallocated additional-documentation revenue — aggregate facts only. */}
      {addonSummary && (addonSummary.count ?? 0) > 0 && (
        <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap px-3 py-2 bg-[#eef4fa] border border-[#d6e4f0] rounded-xl">
          <span className="text-[11px] font-bold text-[#3b6ea5]">
            <i className="ri-file-add-line mr-1"></i>Unallocated additional-documentation revenue
          </span>
          <span className="text-[11px] text-gray-600">
            {fmtInt(addonSummary.count)} payment{(addonSummary.count ?? 0) === 1 ? "" : "s"} · {fmtUsd(addonSummary.grossUsd)} — in the Stripe cash basis,
            outside the order/channel universe; itemized in the bridge below.
          </span>
        </div>
      )}

      {/* ── LEVEL 2: cash-to-order bridge (proven items only) ─────────────── */}
      {bridgeSlot}

      {/* ── LEVEL 3: full comparison detail ───────────────────────────────── */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowDetail((s) => !s)}
          aria-expanded={showDetail}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
        >
          <i className={showDetail ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
          {showDetail ? "Hide reconciliation detail" : "Show reconciliation detail"}
        </button>
      </div>

      {showDetail && (
        <>
          {/* Group A — different bases, differences expected and itemized */}
          <div className="mt-3">
            {hasAnyValue(stripeBasis) && hasAnyValue(orderBasis) ? (
              <ComparisonTable
                title="Stripe cash basis vs Order basis"
                subtitle="These count different things, so they are expected to differ. The Stripe ↔ Orders bridge itemizes every difference."
                leftLabel="Stripe basis"
                rightLabel="Order basis"
                rows={basisRows}
                okBanner={
                  bridgeFullyExplained === true
                    ? "Every difference between these two bases is itemized and fully explained."
                    : bridgeFullyExplained === false
                      ? "The bridge has an unexplained residual — see the Stripe ↔ Orders bridge above."
                      : "Waiting for the bridge to resolve."
                }
                okTone={bridgeFullyExplained === true ? "ok" : bridgeFullyExplained === false ? "warn" : "muted"}
              />
            ) : (
              <UnavailableNote what="Stripe cash basis vs Order basis" />
            )}
          </div>

          {/* Group B — same basis, must tie exactly */}
          <div className="mt-4">
            {hasAnyValue(orderBasis) && hasAnyValue(channelTotals) ? (
              <ComparisonTable
                title="Order basis vs Channel Contribution"
                subtitle="Both sides use the same paid-order universe and the same money model, so these must match exactly."
                leftLabel="Order basis"
                rightLabel="Channel total"
                rows={channelRows}
                okBanner={
                  channelClean
                    ? "Channel Contribution reconciles exactly to the order basis — every paid order is counted in exactly one channel, including Unknown."
                    : "Channel totals do not tie to the order basis. Paid orders may be dropping out of the channel view."
                }
                okTone={channelClean ? "ok" : "warn"}
              />
            ) : (
              <UnavailableNote what="Order basis vs Channel Contribution" />
            )}
          </div>

          {/* Data-source health */}
          <div className="mt-4">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Data-source health</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {sources.map((s) => {
                const meta = SOURCE_HEALTH_META[s.health];
                const tone =
                  meta.tone === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : meta.tone === "warn" ? "text-amber-700 bg-amber-50 border-amber-200"
                  : meta.tone === "bad" ? "text-rose-700 bg-rose-50 border-rose-200"
                  : "text-gray-600 bg-gray-50 border-gray-200";
                return (
                  <div key={s.name} className="border border-gray-200 rounded-xl p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-800 truncate">{s.name}</span>
                      <span className={`shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 border ${tone}`}>{meta.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug">{s.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unclassified items — aggregate counts only, never PII */}
          <div className="mt-4">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Unclassified items</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {unclassified.map((u) => (
                <div key={u.label} className="border border-gray-200 rounded-xl p-2.5">
                  <p className="text-[11px] text-gray-500 leading-tight">{u.label}</p>
                  <p className={`text-lg font-extrabold tabular-nums ${(u.count ?? 0) > 0 ? "text-amber-600" : "text-gray-800"}`}>
                    {fmtInt(u.count)}
                  </p>
                  <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{u.note}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              <i className="ri-shield-check-line mr-1"></i>Counts only — no customer names, emails or payment details appear in this section.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function UnavailableNote({ what }: { what: string }) {
  return (
    <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-500">
      <i className="ri-question-line mr-1"></i>
      <span className="font-semibold">{what}</span> — one side has no data yet for this range, so the comparison
      table is not shown. It appears automatically once both sources load.
    </div>
  );
}

const METRIC_ORDER: { key: keyof BasisTotals; metric: string; isCount?: boolean }[] = [
  { key: "paidOrders", metric: "Paid Orders", isCount: true },
  { key: "gross", metric: "Gross Charged" },
  { key: "refunds", metric: "Refunds" },
  { key: "net", metric: "Net Revenue" },
  { key: "provider", metric: "Provider Payments" },
];

function metricRows(
  left: BasisTotals,
  right: BasisTotals,
  notes: Record<keyof BasisTotals, string | null>,
): ReconRowInput[] {
  return METRIC_ORDER.map(({ key, metric, isCount }) => ({
    metric,
    companyValue: left[key],
    channelValue: right[key],
    isCount,
    basisNote: notes[key],
  }));
}

function ComparisonTable({ title, subtitle, leftLabel, rightLabel, rows, okBanner, okTone }: {
  title: string;
  subtitle: string;
  leftLabel: string;
  rightLabel: string;
  rows: ReconRow[];
  okBanner: string;
  okTone: "ok" | "warn" | "muted";
}) {
  const bannerCls =
    okTone === "ok" ? "text-emerald-800 bg-emerald-50 border-emerald-200"
    : okTone === "warn" ? "text-amber-800 bg-amber-50 border-amber-200"
    : "text-gray-600 bg-gray-50 border-gray-200";

  // Rows where both sides are missing add nothing — drop them instead of
  // rendering dash-filled lines (§8: no large empty tables).
  const visibleRows = rows.filter((r) => !(r.companyValue == null && r.channelValue == null));

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-extrabold text-gray-800">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-bold uppercase tracking-wider text-[10px] px-3 py-2 border-b border-gray-200">Metric</th>
              <th className="text-right font-bold uppercase tracking-wider text-[10px] px-3 py-2 border-b border-gray-200 whitespace-nowrap">{leftLabel}</th>
              <th className="text-right font-bold uppercase tracking-wider text-[10px] px-3 py-2 border-b border-gray-200 whitespace-nowrap">{rightLabel}</th>
              <th className="text-right font-bold uppercase tracking-wider text-[10px] px-3 py-2 border-b border-gray-200">Difference</th>
              <th className="text-right font-bold uppercase tracking-wider text-[10px] px-3 py-2 border-b border-gray-200">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const fmt = r.isCount ? fmtInt : fmtUsd;
              const badge =
                r.status === "ok" ? { t: "Matches", c: "text-emerald-700 bg-emerald-50 border-emerald-200" }
                : r.status === "explained" ? { t: "Explained", c: "text-[#3b6ea5] bg-[#eef4fa] border-[#d6e4f0]" }
                : r.status === "mismatch" ? { t: "Needs review", c: "text-amber-700 bg-amber-50 border-amber-200" }
                : { t: "Unavailable", c: "text-gray-500 bg-gray-50 border-gray-200" };
              return (
                <tr key={r.metric} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 border-b border-gray-100">
                    <span className="font-semibold text-gray-800">{r.metric}</span>
                    {r.basisNote && r.status === "explained" && (
                      <span className="block text-[10px] text-gray-400 leading-snug mt-0.5">{r.basisNote}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums text-gray-800">{fmt(r.companyValue)}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums text-gray-800">{fmt(r.channelValue)}</td>
                  <td className={`px-3 py-2 border-b border-gray-100 text-right tabular-nums font-semibold ${
                    r.deltaValue == null ? "text-gray-400" : r.status === "ok" ? "text-gray-400" : "text-amber-700"
                  }`}>
                    {r.deltaValue == null ? "—" : `${r.deltaValue > 0 ? "+" : ""}${fmt(r.deltaValue)}`}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right">
                    <span className={`inline-block text-[10px] font-bold rounded-full px-2 py-0.5 border whitespace-nowrap ${badge.c}`}>{badge.t}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={`text-[11px] px-3 py-2 border-t ${bannerCls}`}>{okBanner}</p>
    </div>
  );
}
