/**
 * RecoveryPerformancePanel — Section 4 of the unified Analytics dashboard.
 *
 * Read-only. Aggregates recovery comms stored in public.communications by
 * slug, splits them into Stage / Channel (Email vs SMS) / Discount buckets,
 * and renders three compact tables.
 *
 * NEVER throws. NEVER writes. NEVER touches edge functions.
 *
 * Data conventions (defined by lead-followup-sequence + send-checkout-recovery):
 *   • Email recovery slugs: seq_30min / seq_24h / seq_48h / seq_3day / seq_5day
 *   • SMS recovery slugs:   seq_sms_stage1 / seq_sms_stage2 / seq_sms_stage_final
 *   • Manual checkout recovery: checkout_recovery / checkout_recovery_discount
 *   • Per-stage discounts: PAW20 (stage 1+2), SPRING30 (stage 3+4), FURBABY (stage 5)
 *
 * Discount usage is read from orders.coupon_code, since that is the
 * authoritative record of which coupon was actually applied to a paid order.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Stage config ────────────────────────────────────────────────────────────
interface StageConfig {
  slug: string;
  label: string;
  channel: "email" | "sms";
  discount: string;
}

const STAGES: StageConfig[] = [
  { slug: "seq_30min",            label: "30-min email",        channel: "email", discount: "PAW20" },
  { slug: "seq_24h",              label: "24-hour email",       channel: "email", discount: "PAW20" },
  { slug: "seq_48h",              label: "48-hour email",       channel: "email", discount: "SPRING30" },
  { slug: "seq_3day",             label: "3-day email",         channel: "email", discount: "SPRING30" },
  { slug: "seq_5day",             label: "5-day email",         channel: "email", discount: "FURBABY" },
  { slug: "seq_sms_stage1",       label: "SMS — initial",       channel: "sms",   discount: "PAW20" },
  { slug: "seq_sms_stage2",       label: "SMS — mid",           channel: "sms",   discount: "SPRING30" },
  { slug: "seq_sms_stage_final",  label: "SMS — final",         channel: "sms",   discount: "FURBABY" },
];

const DISCOUNT_CODES = ["PAW20", "SPRING30", "FURBABY"];

interface CommsRow {
  slug:   string | null;
  status: string | null;
}

interface OrderCouponRow {
  coupon_code: string | null;
  price:       number | string | null;
}

interface AggregatedStage extends StageConfig {
  sent:   number;
  failed: number;
}

interface DiscountRow {
  code:     string;
  uses:     number;
  revenue:  number;
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ChannelBadge({ channel }: { channel: "email" | "sms" }) {
  if (channel === "email") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
        <i className="ri-mail-line"></i> Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-700 border-sky-200">
      <i className="ri-message-3-line"></i> SMS
    </span>
  );
}

export default function RecoveryPerformancePanel() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [stages, setStages]     = useState<AggregatedStage[]>([]);
  const [emailVsSms, setEvS]    = useState<{ email: { sent: number; failed: number }; sms: { sent: number; failed: number } }>({ email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } });
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Recovery comms grouped by slug + status.
      const { data: commsData, error: commsErr } = await supabase
        .from("communications")
        .select("slug, status")
        .like("slug", "seq_%");

      if (commsErr) throw new Error(`communications: ${commsErr.message}`);

      const rows = (commsData ?? []) as CommsRow[];

      // Aggregate by slug.
      const counts: Record<string, { sent: number; failed: number }> = {};
      const eVs = { email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } };

      for (const r of rows) {
        const slug = (r?.slug ?? "").toLowerCase();
        const status = (r?.status ?? "").toLowerCase();
        if (!slug.startsWith("seq_")) continue;

        if (!counts[slug]) counts[slug] = { sent: 0, failed: 0 };
        if (status === "sent")    counts[slug].sent    += 1;
        else if (status === "failed") counts[slug].failed += 1;

        const isSms = slug.startsWith("seq_sms_");
        const bucket = isSms ? eVs.sms : eVs.email;
        if (status === "sent")    bucket.sent    += 1;
        else if (status === "failed") bucket.failed += 1;
      }

      // Build aggregated stages in canonical order.
      const stagesOut: AggregatedStage[] = STAGES.map((s) => ({
        ...s,
        sent:   counts[s.slug]?.sent   ?? 0,
        failed: counts[s.slug]?.failed ?? 0,
      }));

      setStages(stagesOut);
      setEvS(eVs);

      // 2. Discount performance — count orders per coupon_code.
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("coupon_code, price")
        .in("coupon_code", DISCOUNT_CODES)
        .not("payment_intent_id", "is", null)
        .not("status", "in", "(\"refunded\",\"cancelled\",\"archived\")");

      if (ordersErr) throw new Error(`orders: ${ordersErr.message}`);

      const orders = (ordersData ?? []) as OrderCouponRow[];
      const dByCode: Record<string, { uses: number; revenue: number }> = {};
      for (const code of DISCOUNT_CODES) dByCode[code] = { uses: 0, revenue: 0 };

      for (const o of orders) {
        const code = (o?.coupon_code ?? "").trim().toUpperCase();
        if (!dByCode[code]) continue;
        dByCode[code].uses += 1;
        dByCode[code].revenue += safeNum(o?.price);
      }

      const discountsOut: DiscountRow[] = DISCOUNT_CODES.map((code) => ({
        code,
        uses:    dByCode[code].uses,
        revenue: dByCode[code].revenue,
      }));

      setDiscounts(discountsOut);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStages([]);
      setEvS({ email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } });
      setDiscounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Loading / error ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-orange-400 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading recovery performance…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-sm font-bold text-red-700 mb-1">Could not load recovery data</p>
        <p className="text-xs text-red-600 font-mono break-all">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-lg cursor-pointer"
        >
          <i className="ri-refresh-line"></i> Retry
        </button>
      </div>
    );
  }

  // ── Plain-const derived values ──────────────────────────────────────
  const stagesWithSends = stages.filter((s) => s.sent > 0 || s.failed > 0);
  const totalSent = stages.reduce((acc, s) => acc + s.sent, 0);
  const totalFailed = stages.reduce((acc, s) => acc + s.failed, 0);
  const totalDiscountUses = discounts.reduce((a, d) => a + d.uses, 0);
  const totalDiscountRevenue = discounts.reduce((a, d) => a + d.revenue, 0);

  // ── Winners (plain-English insights) ────────────────────────────────
  const bestStage = stages
    .filter((s) => s.sent > 0)
    .slice()
    .sort((a, b) => b.sent - a.sent)[0] ?? null;

  const emailVsSmsWinner: { label: string; sent: number; loserLabel: string; loserSent: number } | null = (() => {
    const e = emailVsSms.email.sent;
    const s = emailVsSms.sms.sent;
    if (e === 0 && s === 0) return null;
    if (e >= s) return { label: "Email", sent: e, loserLabel: "SMS", loserSent: s };
    return { label: "SMS", sent: s, loserLabel: "Email", loserSent: e };
  })();

  const bestDiscount = discounts
    .filter((d) => d.uses > 0)
    .slice()
    .sort((a, b) => (b.revenue - a.revenue) || (b.uses - a.uses))[0] ?? null;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Plain-English winner cards (top, primary) ───────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Best performing stage */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700">
              <i className="ri-trophy-line"></i>
            </span>
            <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Best performing stage</p>
          </div>
          {bestStage ? (
            <>
              <p className="text-base font-extrabold text-emerald-900 leading-tight">{bestStage.label}</p>
              <p className="text-[11px] text-emerald-800 mt-1">{bestStage.sent.toLocaleString()} sends · discount {bestStage.discount}.</p>
            </>
          ) : (
            <p className="text-sm text-emerald-800">No recovery sends yet.</p>
          )}
        </div>

        {/* Email vs SMS winner */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-sky-100 text-sky-700">
              <i className="ri-vs-line"></i>
            </span>
            <p className="text-[10px] uppercase tracking-wider font-bold text-sky-700">Email vs SMS winner</p>
          </div>
          {emailVsSmsWinner ? (
            <>
              <p className="text-base font-extrabold text-sky-900 leading-tight">{emailVsSmsWinner.label} wins</p>
              <p className="text-[11px] text-sky-800 mt-1">
                {emailVsSmsWinner.sent.toLocaleString()} sends vs {emailVsSmsWinner.loserSent.toLocaleString()} for {emailVsSmsWinner.loserLabel}.
              </p>
            </>
          ) : (
            <p className="text-sm text-sky-800">No data yet.</p>
          )}
        </div>

        {/* Best discount */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 text-amber-700">
              <i className="ri-coupon-line"></i>
            </span>
            <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Best discount</p>
          </div>
          {bestDiscount ? (
            <>
              <p className="text-base font-extrabold text-amber-900 leading-tight">{bestDiscount.code}</p>
              <p className="text-[11px] text-amber-800 mt-1">
                {bestDiscount.uses.toLocaleString()} orders · {fmtUsd(bestDiscount.revenue)} revenue.
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-800">No coupon-recovered orders yet.</p>
          )}
        </div>
      </div>

      {/* ── Detailed tables (secondary) ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Stage-wise table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden lg:col-span-2">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Recovery by stage</h3>
            <p className="text-xs text-gray-500 mt-0.5">Email + SMS recovery sequence — sent / failed per stage.</p>
          </div>
          <div className="text-[11px] text-gray-500 flex items-center gap-3 flex-wrap">
            <span>Total sent <strong className="text-gray-800 tabular-nums">{totalSent.toLocaleString()}</strong></span>
            <span>Failed <strong className="text-red-600 tabular-nums">{totalFailed.toLocaleString()}</strong></span>
          </div>
        </div>

        {stagesWithSends.length === 0 ? (
          <div className="text-center py-10">
            <i className="ri-mail-send-line text-gray-200 text-4xl"></i>
            <p className="text-sm text-gray-400 mt-2">No recovery sends yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stage</th>
                  <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Channel</th>
                  <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Discount</th>
                  <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Sent</th>
                  <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.slug} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 font-medium text-gray-800">{s.label}</td>
                    <td className="py-2.5 px-4"><ChannelBadge channel={s.channel} /></td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {s.discount}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-bold text-gray-900">{s.sent.toLocaleString()}</td>
                    <td className={`py-2.5 px-4 text-right tabular-nums ${s.failed > 0 ? "text-red-600 font-bold" : "text-gray-400"}`}>{s.failed.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Email vs SMS card ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-extrabold text-gray-900">Email vs SMS</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">Total sent and failed across both channels.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700">
                <i className="ri-mail-line"></i>
              </span>
              <p className="text-xs font-bold text-emerald-900">Email</p>
            </div>
            <p className="text-2xl font-extrabold text-emerald-900 tabular-nums">{emailVsSms.email.sent.toLocaleString()}</p>
            <p className="text-[11px] text-emerald-800 mt-1">sent · <span className={emailVsSms.email.failed > 0 ? "text-red-600 font-bold" : ""}>{emailVsSms.email.failed.toLocaleString()} failed</span></p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-sky-100 text-sky-700">
                <i className="ri-message-3-line"></i>
              </span>
              <p className="text-xs font-bold text-sky-900">SMS</p>
            </div>
            <p className="text-2xl font-extrabold text-sky-900 tabular-nums">{emailVsSms.sms.sent.toLocaleString()}</p>
            <p className="text-[11px] text-sky-800 mt-1">sent · <span className={emailVsSms.sms.failed > 0 ? "text-red-600 font-bold" : ""}>{emailVsSms.sms.failed.toLocaleString()} failed</span></p>
          </div>
        </div>
      </div>

      {/* ── Discount performance card ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-extrabold text-gray-900">Discount performance</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">PAW20 / SPRING30 / FURBABY — uses and revenue from paid orders.</p>
        {totalDiscountUses === 0 ? (
          <div className="text-center py-6">
            <i className="ri-coupon-line text-gray-200 text-3xl"></i>
            <p className="text-sm text-gray-400 mt-2">No recovery-coupon orders yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {discounts.map((d) => (
                <div key={d.code} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {d.code}
                  </span>
                  <div className="flex items-center gap-4 text-[11px] text-gray-600">
                    <span><strong className="tabular-nums text-gray-800">{d.uses.toLocaleString()}</strong> uses</span>
                    <span><strong className="tabular-nums text-gray-800">{fmtUsd(d.revenue)}</strong> revenue</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              Total: <strong className="text-gray-800">{totalDiscountUses.toLocaleString()}</strong> orders · <strong className="text-gray-800">{fmtUsd(totalDiscountRevenue)}</strong> revenue.
            </p>
          </>
        )}
      </div>
      </div>
      {/* /detailed-tables wrapper */}
    </div>
  );
}
