/**
 * SyncHealthCards — Section 6 health snapshot for the unified Analytics tab.
 *
 * Read-only. NEVER throws. Reads only existing tables/columns:
 *   • orders.google_ads_upload_status / google_ads_last_attempt_at
 *   • orders.google_ads_upload_error
 *   • orders.meta_capi_status / meta_capi_sent_at / meta_capi_error
 *   • ad_platform_settings.last_fetched_at / last_spend_data
 *
 * Each card shows:
 *   • status pill: Healthy / Needs attention / Not configured
 *   • last sync timestamp (relative)
 *   • error count or latest error string when relevant
 *
 * No writes. No edge-function calls.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Tone = "healthy" | "warn" | "off";

interface CardData {
  tone: Tone;
  pill: string;
  detail: string;
  lastSync?: string | null;
  errorCount?: number;
  latestError?: string | null;
}

const TONE_PILL: Record<Tone, string> = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn:    "bg-amber-50 text-amber-700 border-amber-200",
  off:     "bg-gray-50 text-gray-600 border-gray-200",
};

function fmtRelative(ts: string | null | undefined): string {
  if (!ts) return "never";
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return "never";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HealthCard({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  data,
}: {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  data: CardData;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${iconBg} ${iconFg}`}>
          <i className={`${icon} text-base`}></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-gray-900 leading-tight">{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${TONE_PILL[data.tone]}`}>
          {data.tone === "healthy" && <i className="ri-checkbox-circle-line"></i>}
          {data.tone === "warn"    && <i className="ri-error-warning-line"></i>}
          {data.tone === "off"     && <i className="ri-close-circle-line"></i>}
          {data.pill}
        </span>
        {data.lastSync !== undefined && (
          <span className="text-[11px] text-gray-400 tabular-nums">Last: {fmtRelative(data.lastSync)}</span>
        )}
      </div>
      <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{data.detail}</p>
      {data.latestError && (
        <p className="text-[10px] text-red-600 mt-1 leading-relaxed font-mono break-all line-clamp-3">{data.latestError}</p>
      )}
    </div>
  );
}

export default function SyncHealthCards() {
  const [loading, setLoading] = useState(true);
  const [google, setGoogle]   = useState<CardData>({ tone: "off", pill: "Loading…", detail: "—" });
  const [meta, setMeta]       = useState<CardData>({ tone: "off", pill: "Loading…", detail: "—" });
  const [backfill, setBackfill] = useState<CardData>({ tone: "off", pill: "Loading…", detail: "—" });
  const [adSpend, setAdSpend] = useState<CardData>({ tone: "off", pill: "Loading…", detail: "—" });

  const load = useCallback(async () => {
    setLoading(true);

    // ── Google Ads conversion recovery ───────────────────────────────────
    try {
      const [{ count: uploaded }, { count: failed }, latestAttempt, latestError] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("google_ads_upload_status", "uploaded"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("google_ads_upload_status", "failed"),
        supabase.from("orders").select("google_ads_last_attempt_at").not("google_ads_last_attempt_at", "is", null).order("google_ads_last_attempt_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("orders").select("google_ads_upload_error, google_ads_last_attempt_at").eq("google_ads_upload_status", "failed").not("google_ads_upload_error", "is", null).order("google_ads_last_attempt_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const upCount = uploaded ?? 0;
      const fCount  = failed ?? 0;

      let tone: Tone = "off";
      let pill = "Not configured";
      if (upCount > 0 && fCount === 0) { tone = "healthy"; pill = "Healthy"; }
      else if (upCount > 0 && fCount > 0) { tone = "warn"; pill = "Needs attention"; }
      else if (upCount === 0 && fCount > 0) { tone = "warn"; pill = "Needs attention"; }
      else if (upCount === 0 && fCount === 0) { tone = "off"; pill = "No data yet"; }

      setGoogle({
        tone,
        pill,
        detail: `${upCount.toLocaleString()} conversions uploaded · ${fCount.toLocaleString()} failed`,
        lastSync: latestAttempt.data?.google_ads_last_attempt_at ?? null,
        errorCount: fCount,
        latestError: fCount > 0 ? (latestError.data?.google_ads_upload_error ?? null) : null,
      });
    } catch {
      setGoogle({ tone: "off", pill: "Unavailable", detail: "Could not query orders table." });
    }

    // ── Meta CAPI / server events ────────────────────────────────────────
    try {
      const [{ count: sent }, { count: failed }, latestSent, latestError] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("meta_capi_status", "sent"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("meta_capi_status", "failed"),
        supabase.from("orders").select("meta_capi_sent_at").not("meta_capi_sent_at", "is", null).order("meta_capi_sent_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("orders").select("meta_capi_error, meta_capi_sent_at").eq("meta_capi_status", "failed").not("meta_capi_error", "is", null).order("meta_capi_sent_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const sCount = sent ?? 0;
      const fCount = failed ?? 0;

      let tone: Tone = "off";
      let pill = "Not configured";
      if (sCount > 0 && fCount === 0) { tone = "healthy"; pill = "Healthy"; }
      else if (sCount > 0 && fCount > 0) { tone = "warn"; pill = "Needs attention"; }
      else if (sCount === 0 && fCount > 0) { tone = "warn"; pill = "Needs attention"; }
      else if (sCount === 0 && fCount === 0) { tone = "off"; pill = "No data yet"; }

      setMeta({
        tone,
        pill,
        detail: `${sCount.toLocaleString()} server events sent · ${fCount.toLocaleString()} failed`,
        lastSync: latestSent.data?.meta_capi_sent_at ?? null,
        errorCount: fCount,
        latestError: fCount > 0 ? (latestError.data?.meta_capi_error ?? null) : null,
      });
    } catch {
      setMeta({ tone: "off", pill: "Unavailable", detail: "Could not query orders table." });
    }

    // ── Conversion backfill (queue size: paid orders not yet synced) ─────
    try {
      const [{ count: pendingGoogle }, { count: pendingMeta }] = await Promise.all([
        supabase.from("orders")
          .select("id", { count: "exact", head: true })
          .not("payment_intent_id", "is", null)
          .in("status", ["processing", "completed"])
          .is("google_ads_uploaded_at", null)
          .neq("google_ads_upload_status", "skipped_website_tag"),
        supabase.from("orders")
          .select("id", { count: "exact", head: true })
          .not("payment_intent_id", "is", null)
          .in("status", ["processing", "completed"])
          .is("meta_capi_sent_at", null)
          .neq("meta_capi_status", "skipped_missing_user_data"),
      ]);

      const pg = pendingGoogle ?? 0;
      const pm = pendingMeta ?? 0;
      const total = pg + pm;

      let tone: Tone = "healthy";
      let pill = "Healthy";
      if (total > 50) { tone = "warn"; pill = "Needs attention"; }
      else if (total === 0) { tone = "healthy"; pill = "Up to date"; }

      setBackfill({
        tone,
        pill,
        detail: `${pg.toLocaleString()} pending Google · ${pm.toLocaleString()} pending Meta`,
        lastSync: null,
      });
    } catch {
      setBackfill({ tone: "off", pill: "Unavailable", detail: "Could not query orders table." });
    }

    // ── Ad spend API connection (last_fetched_at on ad_platform_settings) ─
    try {
      const { data: rows, error } = await supabase
        .from("ad_platform_settings")
        .select("platform, last_fetched_at, last_spend_data")
        .order("last_fetched_at", { ascending: false });

      if (error || !rows || rows.length === 0) {
        setAdSpend({ tone: "off", pill: "Not configured", detail: "No ad-platform credentials saved yet." });
      } else {
        const platforms = rows.map((r) => r.platform).join(" · ");
        const latest = rows[0].last_fetched_at as string | null;
        const hasError = rows.some((r) => {
          const d = r.last_spend_data as { error?: string } | null;
          return !!(d && typeof d === "object" && d.error);
        });
        let tone: Tone = "healthy";
        let pill = "Healthy";
        if (!latest)        { tone = "off";  pill = "Not configured"; }
        else if (hasError)  { tone = "warn"; pill = "Needs attention"; }
        setAdSpend({
          tone,
          pill,
          detail: `Connected: ${platforms || "none"}`,
          lastSync: latest,
          latestError: hasError ? "Latest fetch returned an API error." : null,
        });
      }
    } catch {
      setAdSpend({ tone: "off", pill: "Unavailable", detail: "Could not query ad_platform_settings." });
    }

    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <HealthCard
        icon="ri-google-fill"
        iconBg="bg-orange-50"
        iconFg="text-orange-500"
        title="Google Ads conversion recovery"
        description="Sends paid orders back to Google Ads when the website tag missed them."
        data={loading ? { tone: "off", pill: "Loading…", detail: "—" } : google}
      />
      <HealthCard
        icon="ri-facebook-circle-fill"
        iconBg="bg-blue-50"
        iconFg="text-[#1877F2]"
        title="Meta CAPI / server events"
        description="Server-side Purchase events to Meta when the browser pixel was blocked or missed."
        data={loading ? { tone: "off", pill: "Loading…", detail: "—" } : meta}
      />
      <HealthCard
        icon="ri-refresh-line"
        iconBg="bg-violet-50"
        iconFg="text-violet-600"
        title="Conversion backfill"
        description="Queue of paid orders waiting to be re-synced to Google or Meta."
        data={loading ? { tone: "off", pill: "Loading…", detail: "—" } : backfill}
      />
      <HealthCard
        icon="ri-line-chart-line"
        iconBg="bg-emerald-50"
        iconFg="text-emerald-600"
        title="Ad spend API connection"
        description="Live spend pulled from Meta / Google / TikTok Ads APIs."
        data={loading ? { tone: "off", pill: "Loading…", detail: "—" } : adSpend}
      />
    </div>
  );
}
