// IncludedResourcesSection — the Customer Portal's "Included Resources" card(s):
// the free Pet Care Planner by PawTenant that comes with a paid ESA package,
// and the Psychiatric Service Dog Training Workbook that comes with a paid
// PSD package. ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001 /
// ESA-PSD-PLANNERS-MARKETING-LIVE-001.
//
// Deliberately SEPARATE from My Documents. These resources are not clinical
// letters, not order documents and not part of the provider's evaluation, so
// they never render inside the documents list, never key on doctor_status or
// delivery timestamps, and opening one changes nothing about the order.
//
// Who sees what is decided by the DATABASE, once, from the authoritative
// payment + service-family helpers (customer_resource_entitlements). This
// component only renders the answer, one card per returned resource:
//   * eligible + available     → the card, "Available now", View + Download
//   * eligible + unavailable   → honest "temporarily unavailable" + retry
//   * unpaid lead              → a locked teaser for that family (no file)
//   * no order of a family     → nothing for that family (no placeholder)
//   * load failure             → an error card with Retry (only when the
//                                customer has an order to be told about)
// A customer with several paid orders of one family gets ONE card for it.
// Admin Customer View passes the previewed email; the server re-checks
// is_admin_staff() before honouring it.

import { useCallback, useEffect, useState } from "react";
import CustomerPortalSection, { SectionStatusChip } from "./CustomerPortalSection";
import ResponsiveImage from "@/components/base/ResponsiveImage";
import { classifyServiceFamily, type ServiceFamily, type ServiceFamilyFields } from "@/lib/serviceFamily";
import { isPaidOrder, isUnpaidLead, type BookingOrderLike } from "@/lib/bookingProgress";
import { PLANNER_DISCLAIMER, PSD_WORKBOOK_DISCLAIMER, PLANNER_NAME, PSD_WORKBOOK_NAME, plannerBenefitFor } from "@/data/plannerBenefit";
import {
  PLANNER_DEFAULT_THUMBNAIL,
  PLANNER_DEFAULT_THUMBNAIL_HEIGHT,
  PLANNER_DEFAULT_THUMBNAIL_WIDTH,
  PSD_DEFAULT_THUMBNAIL,
  PSD_DEFAULT_THUMBNAIL_HEIGHT,
  PSD_DEFAULT_THUMBNAIL_WIDTH,
  customerResourceThumbnailUrl,
  downloadCustomerResource,
  fetchCustomerResourceEntitlements,
  formatResourceBytes,
  openCustomerResource,
  type CustomerResourceEntitlement,
  type CustomerResourceKey,
} from "@/lib/customerResources";

type PortalOrderLike = ServiceFamilyFields & BookingOrderLike & { id: string };

interface Props {
  orders: PortalOrderLike[];
  isAdminPreview: boolean;
  /** Admin Customer View — the previewed customer's email; null for real customers. */
  previewEmail: string | null;
}

const ACTION_MESSAGES: Record<string, string> = {
  unauthenticated: "Your session has expired — please sign in again to open this resource.",
  not_entitled: "This resource is included with paid packages of its service type. It isn't available on this order.",
  unavailable: "This resource is being updated right now. Please try again shortly.",
  sign_failed: "We couldn't prepare your download just now. Please try again.",
  lookup_failed: "We couldn't check your access just now. Please try again.",
  network: "Network error — please check your connection and try again.",
};

function friendlyActionError(code?: string, fallback?: string): string {
  return (code && ACTION_MESSAGES[code]) || fallback || "Something went wrong. Please try again.";
}

/** Per-family presentation that never comes from the server. */
const FAMILY_UI: Record<"esa" | "psd", {
  key: CustomerResourceKey;
  name: string;
  thumb: { src: string; width: number; height: number; alt: string };
  blurb: string;
  disclaimer: string;
  lockedBlurb: string;
}> = {
  esa: {
    key: "esa_planner",
    name: PLANNER_NAME,
    thumb: { src: PLANNER_DEFAULT_THUMBNAIL, width: PLANNER_DEFAULT_THUMBNAIL_WIDTH, height: PLANNER_DEFAULT_THUMBNAIL_HEIGHT, alt: "Cover of the Pet Care Planner by PawTenant" },
    blurb: "A printable planner for vet visits, medications, routines, supplies and emergency details — yours to keep from the moment your payment is confirmed.",
    disclaimer: `${PLANNER_DISCLAIMER} It is not a clinical document and is separate from your ESA letter.`,
    lockedBlurb: "Included free with your ESA package. Your download unlocks the moment your payment is confirmed — no need to wait for your letter.",
  },
  psd: {
    key: "psd_planner",
    name: PSD_WORKBOOK_NAME,
    thumb: { src: PSD_DEFAULT_THUMBNAIL, width: PSD_DEFAULT_THUMBNAIL_WIDTH, height: PSD_DEFAULT_THUMBNAIL_HEIGHT, alt: "Cover of the Psychiatric Service Dog Training Workbook by PawTenant" },
    blurb: "An owner-trainer workbook for task-training plans, public-access sessions, training hours, milestones, handler preparation and emergency planning — yours to keep from the moment your payment is confirmed.",
    disclaimer: `${PSD_WORKBOOK_DISCLAIMER} It is separate from your PSD letter.`,
    lockedBlurb: "Included free with your PSD package. Your download unlocks the moment your payment is confirmed — no need to wait for your letter.",
  },
};

function Thumb({ family, entitlement, dim = false }: { family: "esa" | "psd"; entitlement?: CustomerResourceEntitlement | null; dim?: boolean }) {
  const ui = FAMILY_UI[family];
  const url = entitlement ? customerResourceThumbnailUrl(entitlement) : ui.thumb.src;
  const usesDefault = url === ui.thumb.src || url === PLANNER_DEFAULT_THUMBNAIL;
  return (
    <div className={`w-24 sm:w-28 flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-[#e2e8f0] bg-white ${dim ? "opacity-70" : "shadow-[0_6px_16px_-10px_rgba(30,58,95,0.35)]"}`}>
      {usesDefault ? (
        <ResponsiveImage src={ui.thumb.src} alt={ui.thumb.alt} width={ui.thumb.width} height={ui.thumb.height} sizes="112px" className="w-full h-auto block" />
      ) : (
        <img src={url} alt={ui.thumb.alt} width={ui.thumb.width} height={ui.thumb.height} loading="lazy" decoding="async" className="w-full h-auto block" />
      )}
    </div>
  );
}

export default function IncludedResourcesSection({ orders, isAdminPreview, previewEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<CustomerResourceEntitlement[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  // Local hints only — they choose which EMPTY state to render per family.
  // Access itself is never inferred here.
  const familyOf = (o: PortalOrderLike): ServiceFamily => classifyServiceFamily(o);
  const hasOrder = (f: "esa" | "psd") => orders.some((o) => familyOf(o) === f);
  const hasPaidLocally = (f: "esa" | "psd") => orders.some((o) => familyOf(o) === f && isPaidOrder(o));
  const hasUnpaidLead = (f: "esa" | "psd") => orders.some((o) => familyOf(o) === f && isUnpaidLead(o));
  const hasAnyOrder = hasOrder("esa") || hasOrder("psd");
  const previewMode = isAdminPreview;
  const canQuery = !previewMode || !!previewEmail;

  const load = useCallback(async () => {
    if (!canQuery) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    const res = await fetchCustomerResourceEntitlements(previewMode ? previewEmail : null);
    if (!res.ok) setLoadError(res.error ?? "Could not load your included resources");
    setItems(res.items);
    setLoading(false);
  }, [canQuery, previewMode, previewEmail]);

  useEffect(() => { void load(); }, [load]);

  if (!canQuery) return null;

  const act = async (key: CustomerResourceKey, kind: "view" | "download") => {
    setBusy(`${key}:${kind}`);
    setActionError((e) => ({ ...e, [key]: "" }));
    const opts = { previewEmail: previewMode ? previewEmail : null };
    const res = kind === "view" ? await openCustomerResource(key, opts) : await downloadCustomerResource(key, opts);
    if (!res.ok) setActionError((e) => ({ ...e, [key]: friendlyActionError(res.code, res.error) }));
    setBusy(null);
  };

  // Which families get a row: a server entitlement, or a locked teaser for an
  // unpaid lead of an advertised family (plannerBenefitFor is the client's
  // "advertised" signal), never a placeholder for a family with no order.
  const families: Array<"esa" | "psd"> = ["esa", "psd"];
  const rows = families.map((f) => {
    const entitlement = items.find((i) => i.resource_key === FAMILY_UI[f].key) ?? null;
    const locked = !entitlement && !hasPaidLocally(f) && hasUnpaidLead(f) && plannerBenefitFor(f) !== null;
    return { family: f, entitlement, locked };
  }).filter((r) => r.entitlement || r.locked);

  if (!loading && !loadError && rows.length === 0) return null;

  if (loading) {
    if (!hasAnyOrder) return null;
    return (
      <CustomerPortalSection title="Included Resources" icon="ri-gift-line" tone="emerald" className="mt-5">
        <div className="flex items-start gap-4 animate-pulse" aria-busy="true" aria-live="polite">
          <div className="w-24 h-[7.5rem] rounded-lg bg-[#f1f5f9] flex-shrink-0" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="h-3.5 w-2/3 rounded bg-[#f1f5f9]" />
            <div className="h-3 w-1/2 rounded bg-[#f1f5f9]" />
            <div className="h-8 w-40 rounded-lg bg-[#f1f5f9] mt-4" />
          </div>
        </div>
        <p className="sr-only">Loading your included resources</p>
      </CustomerPortalSection>
    );
  }

  if (loadError && rows.length === 0) {
    if (!hasAnyOrder) return null;
    return (
      <CustomerPortalSection
        title="Included Resources"
        icon="ri-gift-line"
        tone="gray"
        className="mt-5"
        headerRight={<SectionStatusChip tone="gray" icon="ri-error-warning-line" label="Couldn't load" />}
      >
        <p className="text-sm text-gray-700">We couldn&apos;t load your included resources just now. Nothing about your order is affected.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="whitespace-nowrap mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#e8f0f9] text-[#1e3a5f] hover:bg-[#dbe4f0] transition-colors cursor-pointer"
        >
          <i className="ri-refresh-line"></i>Try again
        </button>
      </CustomerPortalSection>
    );
  }

  const anyAvailable = rows.some((r) => r.entitlement?.available);
  const allLocked = rows.every((r) => r.locked);
  const tone = anyAvailable ? "emerald" : allLocked ? "gray" : "amber";
  const chip = anyAvailable
    ? <SectionStatusChip tone="emerald" icon="ri-checkbox-circle-fill" label="Available now" />
    : allLocked
      ? <SectionStatusChip tone="gray" icon="ri-lock-2-line" label="Unlocks after payment" />
      : <SectionStatusChip tone="amber" icon="ri-time-line" label="Temporarily unavailable" />;

  return (
    <CustomerPortalSection title="Included Resources" icon="ri-gift-line" tone={tone} className="mt-5" headerRight={chip}>
      <div className="space-y-5">
        {rows.map(({ family, entitlement, locked }, idx) => {
          const ui = FAMILY_UI[family];
          const key = ui.key;
          const divider = idx > 0 ? "pt-5 border-t border-[#eef2f7]" : "";

          if (locked) {
            return (
              <div key={key} className={`flex items-start gap-4 ${divider}`} data-testid={`planner-locked-${family}`}>
                <Thumb family={family} dim />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-[#475569]">{ui.name}</p>
                    <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Locked</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{ui.lockedBlurb}</p>
                </div>
              </div>
            );
          }

          const e = entitlement!;
          if (!e.available) {
            return (
              <div key={key} className={`flex items-start gap-4 ${divider}`} data-testid={`planner-unavailable-${family}`}>
                <Thumb family={family} entitlement={e} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#1e3a5f]">{e.display_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{e.subtitle}</p>
                  <p className="text-xs text-gray-700 mt-2 leading-relaxed">
                    This resource is being updated and will be back shortly. This doesn&apos;t affect your order or your letter in any way.
                  </p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="whitespace-nowrap mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#FFFBEB] text-[#B45309] hover:bg-[#fef3c7] transition-colors cursor-pointer"
                  >
                    <i className="ri-refresh-line"></i>Check again
                  </button>
                </div>
              </div>
            );
          }

          const meta = ["PDF", e.page_count ? `${e.page_count} pages` : null, formatResourceBytes(e.byte_size) || null].filter(Boolean).join(" · ");
          const err = actionError[key];
          return (
            <div key={key} className={`flex flex-col sm:flex-row items-start gap-4 ${divider}`} data-testid={`planner-card-${family}`} data-resource={key}>
              <Thumb family={family} entitlement={e} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-[#1e3a5f] leading-tight">{e.display_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{e.subtitle}</p>
                {meta && <p className="text-[11px] text-gray-400 mt-1.5">{meta}</p>}
                <p className="text-xs text-gray-700 mt-2 leading-relaxed">{ui.blurb}</p>

                <div className="flex flex-wrap gap-2 mt-3.5">
                  <button
                    type="button"
                    onClick={() => void act(key, "view")}
                    disabled={busy !== null}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {busy === `${key}:view` ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-eye-line"></i>}
                    {family === "esa" ? "View Planner" : "View Workbook"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(key, "download")}
                    disabled={busy !== null}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 bg-white text-[#1e3a5f] text-xs font-bold rounded-lg border border-[#c3d6ea] hover:bg-[#e8f0f9] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {busy === `${key}:download` ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-download-2-line"></i>}
                    Download PDF
                  </button>
                </div>

                {err && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2" role="alert">
                    <i className="ri-error-warning-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
                    <div className="text-xs text-amber-800 leading-relaxed flex-1">
                      <p>{err}</p>
                      <button
                        type="button"
                        onClick={() => setActionError((s) => ({ ...s, [key]: "" }))}
                        className="mt-1 text-[11px] font-bold text-amber-700 underline underline-offset-2 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">{ui.disclaimer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </CustomerPortalSection>
  );
}
