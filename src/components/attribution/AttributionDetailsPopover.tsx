/**
 * AttributionDetailsPopover — Phase K4.5 (+ attribution-honesty pass)
 *
 * Reusable, lightweight popover that surfaces WHY a row was classified
 * a particular way, WHAT raw signals were captured, and — honestly — what
 * cannot be known (exact organic keyword, AI prompt, stripped referrer
 * query). Triggered by clicking an attribution chip on an OrderCard or a
 * Live Visitors row.
 *
 * Design contract:
 *   - Reuses the existing acquisitionClassifier output — no new
 *     classification logic, no second attribution system.
 *   - Uses only already-loaded data (the raw AcquisitionInputs + the
 *     classification result + optional ResolvedAttribution). No extra
 *     fetches, no polling, no realtime.
 *   - Never invents a keyword. When the exact query/prompt is not
 *     recoverable it says so and explains why, instead of a bare
 *     "Unknown".
 *   - Renders as a fixed-position floating card near the top of the
 *     viewport with a soft backdrop. Click backdrop / Escape / X to close.
 */

import { useEffect } from "react";
import {
  type AcquisitionClassification,
  type AcquisitionInputs,
  visualFor as visualForAcquisition,
} from "../../lib/acquisitionClassifier";
import type { ResolvedAttribution } from "../../lib/attributionResolver";

interface Props {
  open: boolean;
  classification: AcquisitionClassification;
  onClose: () => void;
  /**
   * Optional subtitle context line, e.g. "Order #PT-20250514-ABC" or
   * "Visitor · #ab123". Helps admin remember which row they clicked.
   */
  contextLabel?: string;
  /**
   * Optional resolved attribution (orders only). When provided, the popover
   * additionally surfaces the strict source/keyword/campaign/landing view so
   * admin can trust the marketing data without opening the export. Live
   * Visitors rows pass nothing here and render the classifier view only.
   */
  resolved?: ResolvedAttribution | null;
}

const CONFIDENCE_VISUAL: Record<AcquisitionClassification["confidence"], { label: string; bg: string; text: string }> = {
  high:   { label: "High confidence",   bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  medium: { label: "Medium confidence", bg: "bg-amber-50 border-amber-200",     text: "text-amber-700"   },
  low:    { label: "Low confidence",    bg: "bg-rose-50 border-rose-200",       text: "text-rose-700"    },
};

// ── Display helpers ────────────────────────────────────────────────────

function nonEmpty(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function shortenUrl(value: string | null | undefined, max = 64): string {
  const v = nonEmpty(value);
  if (!v) return "—";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
}

function hostOf(value: string | null | undefined): string | null {
  const v = nonEmpty(value);
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return v.toLowerCase().replace(/^https?:\/\//i, "").split("/")[0] || null;
  }
}

function pathOnly(value: string | null | undefined, max = 64): string {
  const v = nonEmpty(value);
  if (!v) return "—";
  if (v.startsWith("/")) return v.length <= max ? v : v.slice(0, max - 1) + "…";
  try {
    const u = new URL(v);
    const p = u.pathname + (u.search ? u.search : "");
    return p.length <= max ? p : p.slice(0, max - 1) + "…";
  } catch {
    return v.length <= max ? v : v.slice(0, max - 1) + "…";
  }
}

// Each click-ID rendered with its actual value (truncated), not just a name,
// so admin can copy/verify it. Returns [] when none are present.
function clickIdRows(i: AcquisitionInputs): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const add = (label: string, v: string | null | undefined) => {
    const val = nonEmpty(v);
    if (val) out.push({ label, value: val.length > 28 ? val.slice(0, 27) + "…" : val });
  };
  add("gclid", i.gclid);
  add("gbraid", i.gbraid);
  add("wbraid", i.wbraid);
  add("fbclid", i.fbclid);
  add("msclkid", i.msclkid);
  add("ttclid", i.ttclid);
  return out;
}

// ── Keyword / query honesty ────────────────────────────────────────────
// Single source of truth for the "why is the keyword Unknown?" answer. Never
// invents a keyword — only echoes a captured one, otherwise explains the hard
// limitation for that channel.
function keywordInsight(
  channel: string,
  keyword: string | null,
  searchTerm: string | null,
): { value: string; note: string; exact: boolean } {
  const kw = nonEmpty(keyword) ?? nonEmpty(searchTerm);
  if (kw) {
    return { value: kw, exact: true, note: "Exact term captured from the paid click (UTM term / ValueTrack {keyword})." };
  }
  const ch = (channel || "").toLowerCase();
  if (ch.includes("paid")) {
    return {
      value: "Not passed on this click",
      exact: false,
      note: "This paid click did not carry a keyword/term param (UTM term or ValueTrack {keyword} was not set on the ad).",
    };
  }
  if (ch.includes("organic search")) {
    return {
      value: "Unavailable (organic search)",
      exact: false,
      note: "Google, Bing & other search engines do NOT pass the exact organic query to the destination site. The order-level keyword is unknowable here — only Search Console shows aggregate queries by page/date.",
    };
  }
  if (ch.includes("ai")) {
    return {
      value: "Unavailable (AI tool)",
      exact: false,
      note: "AI assistants (ChatGPT, Perplexity, Gemini, Copilot, etc.) do NOT pass the user's prompt/query to PawTenant. Only the referrer/UTM is available — the prompt itself cannot be recovered.",
    };
  }
  if (ch.includes("referral") || ch.includes("internal")) {
    return {
      value: "Unavailable (referral)",
      exact: false,
      note: "Referring sites usually pass only their domain. Most strip the path/query via referrer policy, so any on-site search term is not provided.",
    };
  }
  if (ch.includes("direct")) {
    return {
      value: "Unavailable (direct)",
      exact: false,
      note: "No referrer or campaign parameters were present (direct visit, or dark social where the app strips the referrer). There is no query to attribute.",
    };
  }
  return {
    value: "Unavailable",
    exact: false,
    note: "No keyword/query was passed by the referrer for this visit.",
  };
}

// ── Component ──────────────────────────────────────────────────────────

export default function AttributionDetailsPopover({
  open,
  classification,
  onClose,
  contextLabel,
  resolved,
}: Props) {
  // Close on Escape. Avoids the user being stuck if backdrop click misses.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const inputs = classification.raw;
  const vis    = visualForAcquisition(classification.label);
  const conf   = CONFIDENCE_VISUAL[classification.confidence];

  // Channel drives the keyword-honesty copy. Prefer the resolved (marketing)
  // channel; fall back to the classifier label for Live Visitors rows.
  const channel = nonEmpty(resolved?.traffic_channel_final) ?? classification.label;
  const kwInsight = keywordInsight(channel, resolved?.keyword ?? null, resolved?.search_term ?? null);

  const referrerHost = hostOf(inputs.referrer);
  const clickIds = clickIdRows(inputs);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-16 sm:pt-24 px-4"
      onClick={onClose}
    >
      {/* Backdrop — subtle, not a full modal dim. */}
      <div className="absolute inset-0 bg-black/15 backdrop-blur-[1px]" aria-hidden="true" />

      {/* Card */}
      <div
        role="dialog"
        aria-label="Attribution details"
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-[24rem] max-w-[94vw] max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Attribution</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${vis.color}`}>
                <i className={vis.icon} />
                {vis.label}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold ${conf.bg} ${conf.text}`}>
                {conf.label}
              </span>
            </div>
            {contextLabel && (
              <p className="text-[11px] text-gray-400 mt-1 truncate">{contextLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 -mr-1 -mt-1 p-1 rounded"
            aria-label="Close"
          >
            <i className="ri-close-line text-base" />
          </button>
        </div>

        <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 mb-3">
          {classification.reasoning}
        </p>

        {/* ── Keyword / query — honest answer, never invented ──────────── */}
        <div className={`rounded-md border px-3 py-2 mb-3 ${kwInsight.exact ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">
            Keyword / query
          </p>
          <p className={`text-sm font-semibold ${kwInsight.exact ? "text-emerald-800" : "text-amber-800"}`}>
            {kwInsight.value}
          </p>
          <p className="text-[11px] text-gray-600 leading-relaxed mt-1">{kwInsight.note}</p>
        </div>

        {/* ── Captured signals (raw, as provided by the browser) ───────── */}
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Captured signals</p>
        <dl className="text-xs text-gray-700 space-y-1.5">
          <Row label="Raw referrer"  value={shortenUrl(inputs.referrer)} />
          <Row label="Referrer host" value={referrerHost ?? "— (none / stripped)"} />
          <Row label="Landing"       value={pathOnly(inputs.landing_url)} />
          <Row label="UTM source"    value={nonEmpty(inputs.utm_source) ?? "—"} />
          <Row label="UTM medium"    value={nonEmpty(inputs.utm_medium) ?? "—"} />
          <Row label="UTM campaign"  value={nonEmpty(inputs.utm_campaign) ?? nonEmpty(resolved?.utm_campaign) ?? "—"} />
          {resolved && <Row label="UTM term"    value={nonEmpty(resolved.utm_term) ?? "—"} />}
          {resolved && <Row label="UTM content" value={nonEmpty(resolved.utm_content) ?? "—"} />}
          {clickIds.length > 0
            ? clickIds.map((c) => <Row key={c.label} label={c.label} value={c.value} />)
            : <Row label="Click IDs" value="none" />}
          <Row label="Ref param"   value={nonEmpty(inputs.ref) ?? "—"} />
          <Row label="referred_by" value={nonEmpty(inputs.referred_by) ?? "—"} />
        </dl>

        {resolved && (
          <>
            <p className="mt-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Derived &amp; campaign
            </p>
            <dl className="text-xs text-gray-700 space-y-1.5">
              <Row label="Source (final)" value={nonEmpty(resolved.traffic_source_final) ?? "—"} />
              <Row label="Channel"        value={nonEmpty(resolved.traffic_channel_final) ?? "—"} />
              <Row label="Search term"    value={nonEmpty(resolved.search_term) ?? "—"} />
              <Row label="Campaign"       value={nonEmpty(resolved.utm_campaign) ?? nonEmpty(resolved.campaign_id) ?? "—"} />
              <Row label="Ad set / Ad"    value={[nonEmpty(resolved.adset_id), nonEmpty(resolved.ad_id)].filter(Boolean).join(" / ") || "—"} />
              <Row label="Network / device" value={[nonEmpty(resolved.network), nonEmpty(resolved.device)].filter(Boolean).join(" / ") || "—"} />
              <Row label="First landing"  value={pathOnly(resolved.first_landing_page_url) + (nonEmpty(resolved.first_landing_page_type) ? ` (${resolved.first_landing_page_type})` : "")} />
              <Row label="First referrer" value={shortenUrl(resolved.first_referrer)} />
              <Row label="Session"        value={nonEmpty(resolved.session_id) ?? "—"} />
              <Row label="Raw source"     value={nonEmpty(resolved.traffic_source_raw) ?? "—"} />
              <Row label="Data coverage"  value={nonEmpty(resolved.attribution_data_completeness) ?? "—"} />
            </dl>
          </>
        )}

        <p className="mt-3 text-[10px] text-gray-500 leading-relaxed border-t border-gray-100 pt-2">
          <span className="font-semibold text-gray-600">Why some fields are blank:</span> Google Organic and AI
          tools (ChatGPT, Perplexity, etc.) do not send the exact user query/prompt to PawTenant, and many referrers
          strip their path/query. We capture the strongest available signal — UTMs, click IDs (gclid/fbclid/msclkid),
          referrer and landing page — and never guess a keyword. Paid traffic (Google/Meta/Microsoft) carries the best
          per-order detail; organic keywords can only be inferred from aggregate Search Console data, never tied to one
          customer. Classification is computed client-side from the signals above — no data is fetched when this opens.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 min-w-0">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 font-medium truncate text-right" title={value}>{value}</dd>
    </div>
  );
}
