/**
 * OwnerKpiStrip — Decision strip for the Analytics dashboard.
 *
 * Layout:
 *   4 LARGE plain-English KPIs (Revenue / Orders / Conversion / CPA)
 *
 * The previous "Today's Insights" box was removed because Smart Insights
 * already surfaces winner / biggest leak / best recovery in a richer form.
 *
 * No technical language. No duplicate metrics. UI-only — read-only DB.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { analyticsScopeRange, analyticsScopeLabel } from "./analyticsScope";

interface StripData {
  revenue: number;
  orders: number;
  conversionRate: number | null;   // 0–100
  blendedCpa: number | null;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function HeroKpi({ icon, iconBg, iconFg, label, value, subtitle }: {
  icon: string; iconBg: string; iconFg: string; label: string; value: string; subtitle: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${iconBg} ${iconFg} flex-shrink-0`}>
          <i className={`${icon} text-lg`}></i>
        </span>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold leading-tight">{label}</p>
      </div>
      <p className="text-3xl sm:text-4xl font-extrabold text-gray-900 tabular-nums leading-none break-words">{value}</p>
      <p className="text-[12px] text-gray-500 mt-2 leading-snug">{subtitle}</p>
    </div>
  );
}

export default function OwnerKpiStrip() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StripData>({
    revenue: 0,
    orders: 0,
    conversionRate: null,
    blendedCpa: null,
  });

  const load = useCallback(async () => {
    setLoading(true);

    const { fromIso } = analyticsScopeRange();

    const [ordersRes, sessionsRes, roiRes] = await Promise.all([
      // PAID orders inside the scope window — same shape as Business Snapshot.
      supabase.from("orders")
        .select("id, price")
        .not("payment_intent_id", "is", null)
        .not("status", "in", "(\"refunded\",\"cancelled\",\"archived\")")
        .gte("created_at", fromIso),
      // Visitor sessions inside the scope window for conversion-rate denominator.
      supabase.from("visitor_sessions")
        .select("session_id", { count: "exact", head: true })
        .gte("created_at", fromIso),
      supabase.from("analytics_roi_summary").select("*"),
    ]).then((arr) => arr).catch(() => [
      { data: [] }, { count: 0 }, { data: [] },
    ] as const);

    interface PaidOrder {
      price: number | string | null;
    }

    let revenue = 0;
    let paidCount = 0;
    try {
      const paidOrders = (ordersRes?.data ?? []) as PaidOrder[];
      paidCount = paidOrders.length;
      revenue = paidOrders.reduce((acc, r) => acc + num(r?.price), 0);
    } catch { /* ignore */ }

    const totalSessions = num((sessionsRes as { count?: number })?.count ?? 0);
    const conversionRate = totalSessions > 0 ? (paidCount / totalSessions) * 100 : null;

    let blendedCpa: number | null = null;
    try {
      const rows = (roiRes?.data ?? []) as Array<{ spend: number | string | null; orders: number | null }>;
      const totalSpend  = rows.reduce((acc, r) => acc + num(r?.spend), 0);
      const totalOrders = rows.reduce((acc, r) => acc + num(r?.orders), 0);
      if (totalSpend > 0 && totalOrders > 0) blendedCpa = totalSpend / totalOrders;
    } catch { /* ignore */ }

    setData({
      revenue,
      orders: paidCount,
      conversionRate,
      blendedCpa,
    });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const placeholder = "—";

  return (
    <div className="space-y-5">
      {/* Scope badge — explains what's in scope */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[11px] font-bold text-gray-600">
        <i className="ri-calendar-line text-gray-400"></i>
        Reporting period: {analyticsScopeLabel()}
      </div>

      {/* 4 LARGE KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroKpi
          icon="ri-money-dollar-circle-line"
          iconBg="bg-emerald-50"
          iconFg="text-emerald-600"
          label="Revenue"
          value={loading ? placeholder : fmtUsd(data.revenue)}
          subtitle="Total earned from paid orders"
        />
        <HeroKpi
          icon="ri-shopping-bag-line"
          iconBg="bg-sky-50"
          iconFg="text-sky-600"
          label="Orders"
          value={loading ? placeholder : data.orders.toLocaleString()}
          subtitle="Customers who paid"
        />
        <HeroKpi
          icon="ri-percent-line"
          iconBg="bg-violet-50"
          iconFg="text-violet-600"
          label="Conversion Rate"
          value={loading ? placeholder : fmtPct(data.conversionRate)}
          subtitle="How many visitors become customers"
        />
        <HeroKpi
          icon="ri-bank-card-line"
          iconBg="bg-amber-50"
          iconFg="text-amber-600"
          label="Cost per Order"
          value={loading ? placeholder : (data.blendedCpa != null ? `$${data.blendedCpa.toFixed(2)}` : placeholder)}
          subtitle="What it costs to win one customer"
        />
      </div>
    </div>
  );
}
