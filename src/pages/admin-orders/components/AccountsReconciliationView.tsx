import {
  buildReconRows,
  SOURCE_HEALTH_META,
  type DataSourceRow,
  type ReconRow,
  type ReconRowInput,
} from "../../../lib/accountsFinancialFlow";

// ── Accounts › Reconciliation ───────────────────────────────────────────────
// The honesty section. Two comparison groups, deliberately kept apart:
//
//   A. Stripe cash basis  vs  Order basis
//      These legitimately differ (add-on payments with no order row, refunds
//      dated in a later month, charged ≠ recorded price, boundary charges,
//      provider-resolver differences). Every difference is itemized by the
//      Stripe ↔ Orders bridge; a difference is only labelled "Explained" when
//      that bridge reports no unexplained residual.
//
//   B. Order basis  vs  Channel Contribution
//      SAME basis, so these must tie EXACTLY. Any non-zero delta here is a real
//      defect (e.g. an attribution join dropping paid orders) and is shown in
//      amber, never suppressed.
//
// Plus data-source health and aggregate counts of unclassified items. Counts
// only — no customer PII ever reaches this component.

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

interface Props {
  rangeLabel: string;
  stripeBasis: BasisTotals;
  orderBasis: BasisTotals;
  channelTotals: BasisTotals;
  bridgeFullyExplained: boolean | null;
  sources: DataSourceRow[];
  unclassified: { label: string; count: number | null; note: string }[];
}

export default function AccountsReconciliationView({
  rangeLabel, stripeBasis, orderBasis, channelTotals, bridgeFullyExplained, sources, unclassified,
}: Props) {
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

      {/* Group A — different bases, differences expected and itemized */}
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
              ? "The bridge has an unexplained residual — open the Stripe ↔ Orders Reconciliation panel in Overview."
              : "Waiting for the bridge to resolve."
        }
        okTone={bridgeFullyExplained === true ? "ok" : bridgeFullyExplained === false ? "warn" : "muted"}
      />

      {/* Group B — same basis, must tie exactly */}
      <div className="mt-4">
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
            {rows.map((r) => {
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
