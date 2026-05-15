/**
 * AttributionDetailsPopover — Phase K4.5
 *
 * Reusable, lightweight popover that surfaces WHY a row was classified
 * a particular way. Triggered by clicking an attribution chip on an
 * OrderCard or a Live Visitors row.
 *
 * Design contract:
 *   - Reuses the existing acquisitionClassifier output — no new
 *     classification logic, no second attribution system.
 *   - Uses only already-loaded data (the raw AcquisitionInputs + the
 *     classification result). No extra fetches, no polling, no realtime.
 *   - Renders as a fixed-position floating card near the top of the
 *     viewport with a soft backdrop. Click backdrop / Escape / X to
 *     close.
 *   - Stateless about positioning — keeps complexity low. If a future
 *     phase wants anchor-relative positioning, swap the wrapper out
 *     without touching consumers.
 */

import { useEffect } from "react";
import {
  type AcquisitionClassification,
  type AcquisitionInputs,
  visualFor as visualForAcquisition,
} from "../../lib/acquisitionClassifier";

interface Props {
  open: boolean;
  classification: AcquisitionClassification;
  onClose: () => void;
  /**
   * Optional subtitle context line, e.g. "Order #PT-20250514-ABC" or
   * "Visitor · #ab123". Helps admin remember which row they clicked.
   */
  contextLabel?: string;
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

function joinUtm(src: string | null | undefined, med: string | null | undefined): string {
  const s = nonEmpty(src);
  const m = nonEmpty(med);
  if (s && m) return `${s} / ${m}`;
  if (s)      return s;
  if (m)      return `· / ${m}`;
  return "—";
}

function presentClickIds(i: AcquisitionInputs): string {
  const ids: string[] = [];
  if (nonEmpty(i.gclid))   ids.push("gclid");
  if (nonEmpty(i.gbraid))  ids.push("gbraid");
  if (nonEmpty(i.wbraid))  ids.push("wbraid");
  if (nonEmpty(i.fbclid))  ids.push("fbclid");
  if (nonEmpty(i.msclkid)) ids.push("msclkid");
  if (nonEmpty(i.ttclid))  ids.push("ttclid");
  return ids.length ? ids.join(", ") : "none";
}

// ── Component ──────────────────────────────────────────────────────────

export default function AttributionDetailsPopover({
  open,
  classification,
  onClose,
  contextLabel,
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
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-[22rem] max-w-[92vw] p-4"
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

        <dl className="text-xs text-gray-700 space-y-1.5">
          <Row label="Referrer"   value={shortenUrl(inputs.referrer)} />
          <Row label="Landing"    value={pathOnly(inputs.landing_url)} />
          <Row label="UTM"        value={joinUtm(inputs.utm_source, inputs.utm_medium)} />
          <Row label="Campaign"   value={nonEmpty(inputs.utm_campaign) ?? "—"} />
          <Row label="Click IDs"  value={presentClickIds(inputs)} />
          <Row label="Ref param"  value={nonEmpty(inputs.ref) ?? "—"} />
          <Row label="referred_by" value={nonEmpty(inputs.referred_by) ?? "—"} />
        </dl>

        <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
          Classification is computed client-side from the raw attribution signals above. No new data is fetched when this popover opens.
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
