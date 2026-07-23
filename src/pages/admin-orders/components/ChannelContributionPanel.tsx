import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  aggregateChannelContribution,
  CHANNEL_CATEGORY_META,
  CHANNEL_LEAF_META,
  type ChannelOrderEvidence,
  type ChannelCategory,
  type ChannelMetrics,
  type ChannelContributionResult,
} from "../../../lib/channelContribution";

// ── Accounts › Channel Contribution ─────────────────────────────────────────
// Read-only, admin-gated drilldown of paid-order contribution by acquisition
// channel. Reads get_channel_contribution_orders(p_from, p_to) — a PII-safe
// per-order projection + canonical money (orders.price / refund_amount /
// providerPaymentExport) — then classifies each order with the single pure
// classifier (channelContribution.ts) and folds it into an exclusive
// 4-category partition that reconciles to the company paid-order totals.
//
// Basis note: money uses the canonical per-order model (same as Admin Orders /
// CSV), which can differ slightly from the Stripe cash-basis Accounts cards
// above. There is no order-level Stripe fee, so per-channel contribution stops
// BEFORE Stripe fees and is never labelled profit.

interface ChannelRpcResponse {
  date_from: string;
  date_to: string;
  currency: string;
  fx_pkr_per_usd: number;
  google_ads_spend_usd: number;
  orders: ChannelOrderEvidence[];
}

const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const fmtPct = (frac: number | null | undefined) => (frac == null ? "—" : `${(frac * 100).toFixed(1)}%`);

const signCls = (n: number) => (n < 0 ? "text-rose-600" : "text-gray-900");

export default function ChannelContributionPanel({ from, to, rangeLabel }: {
  from: string;
  to: string;
  rangeLabel: string;
}) {
  const [raw, setRaw] = useState<ChannelRpcResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<ChannelCategory, boolean>>({
    paid_media: true,
    organic: true,
    organic_ai: true,
    unknown: true,
  });

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.rpc("get_channel_contribution_orders", { p_from: from, p_to: to });
    if (err) setError(err.message || "Failed to load channel contribution");
    else setRaw(data as unknown as ChannelRpcResponse);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const result: ChannelContributionResult | null = useMemo(() => {
    if (!raw) return null;
    return aggregateChannelContribution(raw.orders ?? [], { googleAdsSpendUsd: raw.google_ads_spend_usd });
  }, [raw]);

  const toggle = (c: ChannelCategory) => setExpanded((e) => ({ ...e, [c]: !e[c] }));
  const allExpanded = result ? Object.values(expanded).every(Boolean) : false;
  const setAll = (v: boolean) =>
    setExpanded({ paid_media: v, organic: v, organic_ai: v, unknown: v });

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-pie-chart-line text-[#3b6ea5]"></i>Channel Contribution
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            Paid-order contribution by acquisition channel for <span className="font-semibold text-[#3b6ea5]">{rangeLabel}</span>.
            A drilldown of the paid-order totals — every paid order is counted in exactly one channel. Canonical per-order
            figures (same model as Admin Orders); may differ slightly from the Stripe cash-basis cards above.
          </p>
        </div>
        {result && (
          <button
            type="button"
            onClick={() => setAll(!allExpanded)}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <i className={allExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-500">
          <i className="ri-loader-4-line animate-spin text-xl block mb-2 text-[#3b6ea5]"></i>Loading channel contribution…
        </div>
      ) : error ? (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          <i className="ri-error-warning-line"></i> {error}
        </div>
      ) : !result || result.total.paidOrders === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg">
          <i className="ri-inbox-line text-xl block mb-1 text-gray-400"></i>
          No paid orders in this range.
        </div>
      ) : (
        <>
          {/* KPI strip — at-a-glance totals (mobile-friendly) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
            {[
              { label: "Paid Orders", value: fmtInt(result.total.paidOrders), color: "text-gray-800", icon: "ri-shopping-bag-3-line", sub: "in range" },
              { label: "Net Revenue", value: fmtUsd(result.total.netRevenue), color: "text-emerald-600", icon: "ri-money-dollar-circle-line", sub: "gross − refunds" },
              { label: "Provider Payments", value: fmtUsd(result.total.providerPayments), color: "text-amber-600", icon: "ri-stethoscope-line", sub: "completed only" },
              { label: "Contribution", value: fmtUsd(result.total.contributionBeforeStripeAndSpend), color: signCls(result.total.contributionBeforeStripeAndSpend), icon: "ri-scales-3-line", sub: "before fees & spend" },
              { label: "Ad Spend", value: fmtUsd(result.total.adSpend), color: "text-rose-500", icon: "ri-megaphone-line", sub: "Google Ads (synced)" },
              { label: "After Ad Spend", value: fmtUsd(result.total.netAfterAdSpendBeforeStripe), color: signCls(result.total.netAfterAdSpendBeforeStripe), icon: "ri-funds-line", sub: "before Stripe fees" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl border border-gray-200 p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className={`${s.icon} ${s.color} text-sm`}></i>
                  <span className="text-[11px] text-gray-500 font-medium leading-tight">{s.label}</span>
                </div>
                <p className={`text-base font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Reconciliation warning (should never fire — partition is exact) */}
          {!result.reconciliation.balanced && (
            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
              <i className="ri-error-warning-line mr-1"></i>
              Channel totals do not reconcile to the paid-order total — gross Δ {fmtUsd(result.reconciliation.grossDelta)},
              orders Δ {result.reconciliation.paidOrdersDelta}. Figures may be incomplete.
            </div>
          )}

          {/* Contribution table — scrolls inside its own container (no page overflow) */}
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[860px] text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-gray-500">
                  <Th sticky align="left">Channel</Th>
                  <Th align="right">Paid Orders</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right">Refunds</Th>
                  <Th align="right">Net Revenue</Th>
                  <Th align="right">Provider</Th>
                  <Th align="right">Contribution</Th>
                  <Th align="right">Ad Spend</Th>
                  <Th align="right">After Spend</Th>
                  <Th align="right">AOV</Th>
                  <Th align="right">Refund %</Th>
                  <Th align="right">Margin %</Th>
                  <Th align="right">% Orders</Th>
                  <Th align="right">% Net</Th>
                </tr>
              </thead>
              <tbody>
                {result.categories.map((cat) => {
                  const meta = CHANNEL_CATEGORY_META[cat.category];
                  const isOpen = expanded[cat.category];
                  const rows: ReactNode[] = [];
                  rows.push(
                    <tr key={cat.category} className="bg-gray-50/70 font-bold">
                      <TdSticky>
                        <button
                          type="button"
                          onClick={() => toggle(cat.category)}
                          aria-expanded={isOpen}
                          className="flex items-center gap-1.5 text-left w-full hover:text-[#3b6ea5]"
                        >
                          <i className={`${isOpen ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"} text-gray-400`}></i>
                          <i className={`${meta.icon} ${meta.accent}`}></i>
                          <span className="text-gray-900">{meta.label}</span>
                        </button>
                      </TdSticky>
                      <MetricCells m={cat} bold />
                    </tr>,
                  );
                  if (isOpen) {
                    cat.children.forEach((leaf) => {
                      // "Other Paid Media" is an extensibility catch-all — only shown once it has volume,
                      // so "Paid Media == Google Ads" holds until a non-Google paid order appears.
                      if (leaf.leaf === "Other Paid Media" && !leaf.hasVolume) return;
                      const lmeta = CHANNEL_LEAF_META[leaf.leaf];
                      rows.push(
                        <tr key={cat.category + leaf.leaf} className={leaf.hasVolume ? "hover:bg-gray-50" : "hover:bg-gray-50 text-gray-400"}>
                          <TdSticky>
                            <span className="flex items-center gap-1.5 pl-7">
                              <i className={`${lmeta.icon} ${leaf.hasVolume ? "text-gray-400" : "text-gray-300"}`}></i>
                              <span className={leaf.hasVolume ? "text-gray-700" : "text-gray-400"}>{leaf.leaf}</span>
                            </span>
                          </TdSticky>
                          <MetricCells m={leaf} muted={!leaf.hasVolume} />
                        </tr>,
                      );
                    });
                  }
                  return rows;
                })}
                {/* All-channels total */}
                <tr className="border-t-2 border-gray-300 font-extrabold bg-[#3b6ea5]/5">
                  <TdSticky>
                    <span className="flex items-center gap-1.5 text-[#3b6ea5]">
                      <i className="ri-bar-chart-box-line"></i>All Channels
                    </span>
                  </TdSticky>
                  <MetricCells m={result.total} bold hideShares />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Attribution quality + notes */}
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
              <span><i className="ri-shield-check-line text-emerald-500 mr-1"></i>Attributed (verified + strong): <span className="font-bold text-gray-700">{fmtPct(result.quality.attributedPct / 100)}</span></span>
              <span><i className="ri-question-line text-gray-400 mr-1"></i>Unknown / Unattributed: <span className="font-bold text-gray-700">{fmtPct(result.quality.unknownPct / 100)}</span></span>
              <span>Verified {fmtInt(result.quality.verified)} · Strong {fmtInt(result.quality.strong)} · Weak {fmtInt(result.quality.weak)} · Unknown {fmtInt(result.quality.unknown)}</span>
            </div>
          </div>

          <div className="mt-3 space-y-1 text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-2">
            <p><i className="ri-information-line mr-1"></i>Channel-level Stripe fees are pending actual order-level reconciliation — contribution is shown <em>before</em> Stripe fees and is not profit.</p>
            <p><i className="ri-money-dollar-circle-line mr-1"></i>Gross = order price, Net = gross − refunds, Provider = completed-order provider payments. Refund % = refunds ÷ gross. Ad spend is synced Google Ads cost (PKR→USD @ {raw?.fx_pkr_per_usd ?? 280}); Organic, Organic AI &amp; Unknown carry no ad spend.</p>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children, align, sticky }: { children: ReactNode; align: "left" | "right"; sticky?: boolean }) {
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} font-bold uppercase tracking-wider text-[10px] px-2.5 py-2 border-b border-gray-200 whitespace-nowrap ${sticky ? "sticky left-0 bg-white z-10" : ""}`}
    >
      {children}
    </th>
  );
}

function TdSticky({ children }: { children: ReactNode }) {
  return <td className="px-2.5 py-1.5 border-b border-gray-100 whitespace-nowrap sticky left-0 bg-inherit z-10">{children}</td>;
}

function Cell({ children, tone }: { children: ReactNode; tone?: string }) {
  return <td className={`px-2.5 py-1.5 border-b border-gray-100 text-right tabular-nums whitespace-nowrap ${tone ?? ""}`}>{children}</td>;
}

function MetricCells({ m, bold, muted, hideShares }: { m: ChannelMetrics; bold?: boolean; muted?: boolean; hideShares?: boolean }) {
  const base = muted ? "text-gray-400" : "";
  const strong = bold ? "font-bold" : "";
  return (
    <>
      <Cell tone={`${base} ${strong}`}>{fmtInt(m.paidOrders)}</Cell>
      <Cell tone={`${base} ${strong}`}>{fmtUsd(m.grossCharged)}</Cell>
      <Cell tone={muted ? "text-gray-400" : m.refunds > 0 ? "text-rose-500" : "text-gray-500"}>{fmtUsd(m.refunds)}</Cell>
      <Cell tone={`${muted ? "text-gray-400" : "text-emerald-600"} ${strong}`}>{fmtUsd(m.netRevenue)}</Cell>
      <Cell tone={muted ? "text-gray-400" : "text-amber-600"}>{fmtUsd(m.providerPayments)}</Cell>
      <Cell tone={`${muted ? "text-gray-400" : signCls(m.contributionBeforeStripeAndSpend)} ${strong}`}>{fmtUsd(m.contributionBeforeStripeAndSpend)}</Cell>
      <Cell tone={muted ? "text-gray-400" : m.adSpend > 0 ? "text-rose-500" : "text-gray-400"}>{fmtUsd(m.adSpend)}</Cell>
      <Cell tone={`${muted ? "text-gray-400" : signCls(m.netAfterAdSpendBeforeStripe)}`}>{fmtUsd(m.netAfterAdSpendBeforeStripe)}</Cell>
      <Cell tone={base}>{m.averageOrderValue == null ? "—" : fmtUsd(m.averageOrderValue)}</Cell>
      <Cell tone={base}>{fmtPct(m.refundRate)}</Cell>
      <Cell tone={base}>{fmtPct(m.contributionMargin)}</Cell>
      <Cell tone={base}>{hideShares ? "—" : fmtPct(m.paidOrderShare)}</Cell>
      <Cell tone={base}>{hideShares ? "—" : fmtPct(m.netRevenueShare)}</Cell>
    </>
  );
}
