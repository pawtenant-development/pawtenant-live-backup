// orderPackage.ts — canonical order product/package classification for the
// Admin Orders list (chips + filters). ORDERS-RA-COMBO-CHIP-FILTER-001.
//
// ONE reusable, typed classification path. Classification uses ONLY explicit
// saved identity fields:
//   • orders.package_key                              (canonical, 4 literals)
//   • orders.includes_reasonable_accommodation_letter (explicit RA-bundle flag)
//   • orders.letter_type                              (documented legacy metadata)
//   • presence of a PAID standalone Additional-Documentation add-on request
//     (order_additional_documentation_requests — a child row, NOT a package_key)
//
// It NEVER infers product/package from price, amount, coupon, provider payout,
// Stripe amount, historical price, or order total. Records with no explicit
// identity classify as "unknown" — they are NEVER guessed as ESA.
//
// Reuses the canonical package helpers in src/config/pricing.ts (isRaBundle /
// packageProduct / PackageKey) so the four package_key literals keep a single
// source of truth.

import { isRaBundle, packageProduct, type PackageKey } from "@/config/pricing";

export type OrderPackageCategory =
  | "esa"
  | "psd"
  | "esa_ra"
  | "psd_ra"
  | "ra_addon"
  | "unknown";

/** Minimal order shape the classifier reads. All fields optional/nullable so
 *  legacy rows and partial column projections classify safely. */
export interface PackageClassifiable {
  package_key?: string | null;
  letter_type?: string | null;
  includes_reasonable_accommodation_letter?: boolean | null;
  confirmation_id?: string | null;
}

/** PSD evidence from explicit saved fields — letter_type ("psd" or the retired
 *  "psd-consultation") or the "-PSD" marker in the confirmation id. Mirrors
 *  isPSD() in my-orders/orderDisplay + the edge functions. */
function isPsdEvidence(o: PackageClassifiable): boolean {
  const lt = (o.letter_type ?? "").trim().toLowerCase();
  return lt === "psd" || lt.startsWith("psd-") || (o.confirmation_id ?? "").toUpperCase().includes("-PSD");
}
function isEsaEvidence(o: PackageClassifiable): boolean {
  return (o.letter_type ?? "").trim().toLowerCase() === "esa";
}

/**
 * Classify an order into a mutually-exclusive product/package category.
 * Priority (task §8) — explicit evidence only, never price:
 *   1. canonical package_key (*_ra_bundle)                    → esa_ra / psd_ra
 *   2. explicit includes_reasonable_accommodation_letter flag → esa_ra / psd_ra
 *   3. PAID standalone Additional-Documentation add-on on a base order → ra_addon
 *   4. canonical package_key (*_standard) / legacy letter_type → esa / psd
 *   5. no explicit identity                                    → unknown
 */
export function classifyOrderPackage(
  o: PackageClassifiable,
  opts?: { hasPaidStandaloneAddon?: boolean },
): OrderPackageCategory {
  const hasAddon = opts?.hasPaidStandaloneAddon === true;
  const pk = (o.package_key ?? "").trim().toLowerCase();

  // 1 + 2 — Combo: canonical *_ra_bundle key OR the explicit RA flag.
  if (isRaBundle(pk)) {
    return packageProduct(pk as PackageKey) === "psd" ? "psd_ra" : "esa_ra";
  }
  if (o.includes_reasonable_accommodation_letter === true) {
    return isPsdEvidence(o) ? "psd_ra" : "esa_ra";
  }

  const isPsd = isPsdEvidence(o);
  const isEsa = isEsaEvidence(o);
  const hasBaseIdentity = pk === "esa_standard" || pk === "psd_standard" || isPsd || isEsa;

  // 3 — Standalone PAID add-on layered on a base (standard) order.
  if (hasAddon && hasBaseIdentity) return "ra_addon";

  // 4 — Base package: canonical key first, then documented legacy letter_type.
  if (pk === "esa_standard") return "esa";
  if (pk === "psd_standard") return "psd";
  if (isPsd) return "psd";
  if (isEsa) return "esa";

  // 5 — No explicit identity. Never guess ESA.
  return "unknown";
}

/** True for the three RA-involving categories (combo ESA/PSD or a standalone add-on). */
export function isRaRelated(cat: OrderPackageCategory): boolean {
  return cat === "esa_ra" || cat === "psd_ra" || cat === "ra_addon";
}

// ── Package filter keys (list UI) ───────────────────────────────────────────
export type PackageFilterKey =
  | "all"
  | "esa"
  | "psd"
  | "esa_ra"
  | "psd_ra"
  | "all_ra"
  | "ra_addon";

/**
 * Does a classified order match a package-filter selection? Exact semantics:
 *   - esa / psd       → standard ONLY (never a combo, never an add-on, never unknown)
 *   - esa_ra / psd_ra → that exact combo only
 *   - all_ra          → esa_ra ∪ psd_ra ∪ ra_addon
 *   - ra_addon        → standalone add-on only
 *   - unknown never leaks into esa / psd.
 */
export function matchesPackageFilter(cat: OrderPackageCategory, filter: PackageFilterKey): boolean {
  switch (filter) {
    case "all": return true;
    case "esa": return cat === "esa";
    case "psd": return cat === "psd";
    case "esa_ra": return cat === "esa_ra";
    case "psd_ra": return cat === "psd_ra";
    case "ra_addon": return cat === "ra_addon";
    case "all_ra": return isRaRelated(cat);
    default: return true;
  }
}

// ── Chip presentation metadata (Admin visual system: blue/amber/emerald/gray) ─
export interface PackageChipMeta { label: string; className: string; icon: string; title: string; }

export function packageChipMeta(cat: OrderPackageCategory): PackageChipMeta {
  switch (cat) {
    case "esa":
      return { label: "ESA", icon: "", className: "bg-[#e8f0f9] text-[#3b6ea5]", title: "ESA Letter (standard)" };
    case "psd":
      return { label: "PSD", icon: "", className: "bg-amber-100 text-amber-700", title: "PSD Documentation (standard)" };
    case "esa_ra":
      return { label: "ESA + RA", icon: "ri-home-heart-line", className: "bg-[#dbe4f0] text-[#1e3a5f]", title: "ESA + Reasonable Accommodation bundle" };
    case "psd_ra":
      return { label: "PSD + RA", icon: "ri-home-heart-line", className: "bg-amber-100 text-[#92400E]", title: "PSD + Reasonable Accommodation bundle" };
    case "ra_addon":
      return { label: "RA Add-on", icon: "ri-file-add-line", className: "bg-[#dbe4f0] text-[#1e3a5f]", title: "Standard order + standalone Additional Documentation add-on" };
    case "unknown":
    default:
      return { label: "Unknown", icon: "", className: "bg-gray-100 text-gray-500", title: "No saved package identity" };
  }
}

// ── RA documentation state (secondary row chip) ─────────────────────────────
export type RaDocState = "missing" | "uploaded" | "in_review" | "completed" | null;

export interface RaDocClassifiable {
  additional_documentation_status?: string | null;
  additional_documentation_required?: boolean | null;
}

/**
 * Concise RA-document state for RA-related orders, derived from the explicit
 * saved `additional_documentation_status`. Returns null for non-RA orders.
 * RA-related orders always require a document (combo includes it; a paid add-on
 * was purchased for it), so a null/"not_uploaded" status reads as "missing".
 */
export function raDocState(
  o: RaDocClassifiable,
  cat: OrderPackageCategory,
): RaDocState {
  if (!isRaRelated(cat)) return null;
  const s = (o.additional_documentation_status ?? "").trim().toLowerCase();
  if (s === "completed") return "completed";
  if (s === "in_review") return "in_review";
  if (s === "uploaded") return "uploaded";
  if (s === "not_uploaded" || s === "") return "missing";
  return null;
}

export interface RaDocChipMeta { label: string; className: string; icon: string; }

export function raDocChipMeta(state: RaDocState): RaDocChipMeta | null {
  switch (state) {
    case "missing":   return { label: "Doc Missing",   icon: "ri-error-warning-line",   className: "bg-amber-100 text-[#92400E]" };
    case "uploaded":  return { label: "Doc Uploaded",  icon: "ri-file-check-line",      className: "bg-emerald-100 text-emerald-800" };
    case "in_review": return { label: "Under Review",  icon: "ri-loader-2-line",        className: "bg-[#dbeafe] text-[#1e40af]" };
    case "completed": return { label: "RA Completed",  icon: "ri-checkbox-circle-line", className: "bg-emerald-100 text-emerald-800" };
    default: return null;
  }
}
