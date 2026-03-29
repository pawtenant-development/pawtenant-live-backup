// StateBreakdownChart — Orders & Revenue by US State
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface StateRow {
  state: string;
  orderCount: number;
  revenue: number;
  avgOrder: number;
  paidCount: number;
}

type SortMode = "orders" | "revenue";

const STATE_COLORS = [
  "#1a5c4f", "#22786a", "#2a9485", "#34b09e", "#41c9b7",
  "#4fd6c4", "#65dece", "#7de5d8", "#99ece3", "#b3f0eb",
];

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

export default function StateBreakdownChart() {
  const [rows, setRows] = useState<StateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("orders");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("state, price, payment_intent_id")
        .not("state", "is", null);

      if (!data) { setLoading(false); return; }

      const map: Record<string, { orderCount: number; revenue: number; paidCount: number }> = {};

      (data as { state: string; price: number | null; payment_intent_id: string | null }[]).forEach((o) => {
        const s = (o.state ?? "").trim().toUpperCase();
        if (!s) return;
        if (!map[s]) map[s] = { orderCount: 0, revenue: 0, paidCount: 0 };
        map[s].orderCount += 1;
        if (o.payment_intent_id && o.price) {
          map[s].revenue += o.price;
          map[s].paidCount += 1;
        }
      });

      const built: StateRow[] = Object.entries(map).map(([state, v]) => ({
        state,
        orderCount: v.orderCount,
        revenue: v.revenue,
        paidCount: v.paidCount,
        avgOrder: v.paidCount > 0 ? v.revenue / v.paidCount : 0,
      }));

      setRows(built);
      setLoading(false);
    };
    load();
  }, []);

  const sorted = [...rows].sort((a, b) =>
    sortMode === "orders" ? b.orderCount - a.orderCount : b.revenue - a.revenue
  );

  const displayed = showAll ? sorted : sorted.slice(0, 12);
  const maxOrders = sorted[0]?.orderCount ?? 1;
  const maxRevenue = sorted[0]?.revenue ?? 1;
  const maxVal = sortMode === "orders" ? maxOrders : maxRevenue;

  const totalOrders = rows.reduce((s, r) => s + r.orderCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const topState = sorted[0];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-2 text-gray-400">
        <i className="ri-loader-4-line animate-spin text-[#1a5c4f]"></i>
        <span className="text-sm">Loading state data...</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-400">No state data available yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0">
            <i className="ri-map-2-line text-[#1a5c4f] text-base"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Orders by State</h3>
            <p className="text-xs text-gray-400">{rows.length} states · {totalOrders} total orders · {fmt(totalRevenue)} revenue</p>
          </div>
        </div>
        {/* Sort toggle */}
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
          {(["orders", "revenue"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                sortMode === mode ? "bg-white border border-gray-200 text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <i className={mode === "orders" ? "ri-file-list-3-line" : "ri-money-dollar-circle-line"}></i>
              {mode === "orders" ? "By Orders" : "By Revenue"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary pills */}
      <div className="px-5 pt-4 pb-2 flex items-center gap-3 flex-wrap">
        {[
          { label: "Top State", value: topState?.state ?? "—", sub: sortMode === "orders" ? `${topState?.orderCount} orders` : fmt(topState?.revenue ?? 0), icon: "ri-trophy-line", color: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "States with Orders", value: rows.length, sub: `of 51 US states/DC`, icon: "ri-map-pin-2-line", color: "bg-[#f0faf7] text-[#1a5c4f] border-[#b8ddd5]" },
          { label: "Avg Revenue/State", value: fmt(totalRevenue / rows.length), sub: "paid orders only", icon: "ri-bar-chart-grouped-line", color: "bg-gray-50 text-gray-700 border-gray-200" },
        ].map((s) => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${s.color}`}>
            <i className={`${s.icon} text-sm`}></i>
            <div>
              <span className="font-extrabold text-sm">{s.value}</span>
              <span className="font-normal text-xs opacity-70 ml-1">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="px-5 pb-5 pt-2">
        <div className="space-y-2">
          {displayed.map((row, idx) => {
            const pct = maxVal > 0 ? ((sortMode === "orders" ? row.orderCount : row.revenue) / maxVal) * 100 : 0;
            const colorIdx = Math.min(idx, STATE_COLORS.length - 1);
            const barColor = colorIdx < 3 ? STATE_COLORS[0] : colorIdx < 6 ? STATE_COLORS[3] : STATE_COLORS[7];

            return (
              <div key={row.state} className="flex items-center gap-3 group">
                {/* Rank */}
                <div className="w-5 text-right">
                  <span className="text-xs font-extrabold text-gray-300 group-hover:text-gray-500 transition-colors">
                    {idx + 1}
                  </span>
                </div>

                {/* State abbr */}
                <div className="w-8 flex-shrink-0">
                  <span className="text-xs font-extrabold text-gray-700 uppercase">{row.state}</span>
                </div>

                {/* Bar + value */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="flex-1 h-6 bg-gray-50 rounded-md overflow-hidden relative group-hover:bg-gray-100 transition-colors">
                    <div
                      className="h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: barColor, opacity: 0.85 + (idx < 3 ? 0.15 : 0) }}
                    >
                      {pct > 20 && (
                        <span className="text-white text-xs font-extrabold whitespace-nowrap">
                          {sortMode === "orders" ? row.orderCount : fmt(row.revenue)}
                        </span>
                      )}
                    </div>
                    {pct <= 20 && (
                      <span className="absolute left-[calc(100%+6px)] top-1/2 -translate-y-1/2 text-xs font-extrabold text-gray-700 whitespace-nowrap" style={{ left: `${Math.max(pct, 2)}%`, paddingLeft: "6px" }}>
                        {sortMode === "orders" ? row.orderCount : fmt(row.revenue)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Side stats */}
                <div className="flex items-center gap-3 flex-shrink-0 w-44 text-right">
                  {sortMode === "orders" ? (
                    <>
                      <span className="text-xs text-gray-400 w-20">{fmt(row.revenue)}</span>
                      <span className={`text-xs font-bold w-20 ${row.paidCount > 0 ? "text-[#1a5c4f]" : "text-gray-300"}`}>
                        {row.paidCount} paid
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400 w-20">{row.orderCount} orders</span>
                      <span className="text-xs font-bold text-gray-700 w-20">{fmt(row.avgOrder)} avg</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Show more / less */}
        {sorted.length > 12 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="whitespace-nowrap mt-4 w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-500 hover:text-[#1a5c4f] hover:bg-gray-50 rounded-lg transition-colors cursor-pointer border border-gray-200"
          >
            <i className={showAll ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
            {showAll ? `Show top 12 only` : `Show all ${sorted.length} states`}
          </button>
        )}
      </div>
    </div>
  );
}
