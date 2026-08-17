// ADMIN-ORDERS-EXPORT-PACKAGE-ADDONS-001
//
// The canonical "what did this order actually BUY" overlay for the Admin Orders
// CSV `Package / Add-ons` column.
//
// The base product and the RA COMBO already have a canonical classifier —
// src/pages/admin-orders/orderPackage.ts::classifyOrderPackage — which reads
// only explicit saved identity (package_key / includes_reasonable_accommodation
// _letter / letter_type) and never price. This module supplies the two CHILD-ROW
// entitlements that classifier cannot see from the order row alone:
//
//   1. a separately purchased Additional-Documentation (RA) add-on, and
//   2. an Additional Pet entitlement.
//
// ── WHAT COUNTS AS AN ENTITLEMENT ───────────────────────────────────────────
//
// Only PURCHASED, INCLUDED or otherwise currently-valid rows. Explicitly NOT:
//   • an uploaded document               (a file is not a purchase)
//   • a pending / unpaid / failed request (an intent is not a purchase)
//   • a cancelled, rejected, expired, refunded or refund-pending row
//   • anything inferred from price, amount, coupon, notes or free text
//
// RA add-on — `order_additional_documentation_requests.status` is one of
// (pending, paid, cancelled, expired, refunded). `paid` is the ONLY entitled
// value, which is exactly what the Orders list already filters on for the
// "RA Add-on" chip, so the CSV and the chip cannot disagree.
//
// Additional Pet — `order_additional_pet_requests.status` runs
// (draft, manual_review_required, payment_required, checkout_created,
//  paid_pending_details, pending_provider_review, clarification_requested,
//  resubmitted, approved_pending_document, completed,
//  rejected, refund_pending, refunded, cancelled).
// The entitled set is everything AT OR AFTER the money step and not unwound.
// It is expressed as an allowlist, not a denylist: a NEW status added upstream
// must be classified deliberately rather than defaulting to "entitled".
//
// The $0 "included" path (pricing_outcome='included') never has a paid_at and
// jumps straight to `pending_provider_review` (create-additional-pet-request:
// `status: isPaid ? "payment_required" : "pending_provider_review"`), so gating
// on the post-checkout STATUS — not on paid_at — is what covers both the paid
// upgrade and the included entitlement.
//
// An order may have several requests over its life (e.g. one cancelled and one
// live). ANY entitled row entitles the order; a dead row never un-entitles it.

import { supabase } from "./supabaseClient";

export interface AddonEntitlement {
  /** A separately purchased Additional-Documentation (RA) add-on. */
  raAddonPaid: boolean;
  /** A paid or included Additional Pet, still valid. */
  additionalPet: boolean;
}

export const NO_ADDON_ENTITLEMENT: AddonEntitlement = Object.freeze({
  raAddonPaid: false,
  additionalPet: false,
});

/** The ONLY entitled status on order_additional_documentation_requests. */
export const RA_ADDON_ENTITLED_STATUS = "paid";

/** Post-checkout, not-unwound Additional Pet states. Allowlist — see header. */
export const ADDITIONAL_PET_ENTITLED_STATUSES: readonly string[] = Object.freeze([
  "paid_pending_details",
  "pending_provider_review",
  "clarification_requested",
  "resubmitted",
  "approved_pending_document",
  "completed",
]);

export interface AddonRequestRow {
  order_id?: unknown;
  status?: unknown;
}

export interface AddonEntitlementOrder {
  id?: unknown;
  [key: string]: unknown;
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

export function isRaAddonEntitled(row: AddonRequestRow): boolean {
  return s(row.status).trim().toLowerCase() === RA_ADDON_ENTITLED_STATUS;
}

export function isAdditionalPetEntitled(row: AddonRequestRow): boolean {
  return ADDITIONAL_PET_ENTITLED_STATUSES.includes(s(row.status).trim().toLowerCase());
}

/**
 * PURE (no I/O): fold the child rows onto the exported orders. Every exported
 * order gets an entry, so a missing map key can never be mistaken for "no
 * add-ons" by a caller that forgot to fetch.
 */
export function computeAddonEntitlements(
  orders: AddonEntitlementOrder[],
  raAddonRows: AddonRequestRow[],
  additionalPetRows: AddonRequestRow[],
): Map<string, AddonEntitlement> {
  const result = new Map<string, AddonEntitlement>();
  for (const o of orders) {
    const id = s(o.id);
    if (id) result.set(id, { raAddonPaid: false, additionalPet: false });
  }
  for (const r of raAddonRows) {
    const id = s(r.order_id);
    const cur = result.get(id);
    if (cur && isRaAddonEntitled(r)) cur.raAddonPaid = true;
  }
  for (const r of additionalPetRows) {
    const id = s(r.order_id);
    const cur = result.get(id);
    if (cur && isAdditionalPetEntitled(r)) cur.additionalPet = true;
  }
  return result;
}

// Bounded batch size for the `in (...)` reads. Matches providerPaymentExport.ts
// so a large export issues a predictable, small number of queries instead of one
// per row (N+1) or one giant unbounded filter.
const BATCH = 200;

async function fetchRequestRows(
  table: string,
  orderIds: string[],
): Promise<AddonRequestRow[]> {
  const rows: AddonRequestRow[] = [];
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select("order_id, status")
      .in("order_id", orderIds.slice(i, i + BATCH));
    // Throw so the caller CANCELS the export rather than emitting a CSV whose
    // Package / Add-ons column silently under-reports every add-on.
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    if (data) rows.push(...(data as AddonRequestRow[]));
  }
  return rows;
}

/**
 * I/O wrapper. Reads ONLY (order_id, status) from the two child tables — no
 * amount, no Stripe id, no refund value ever reaches the export path.
 */
export async function fetchAddonEntitlementsForExport(
  orders: AddonEntitlementOrder[],
): Promise<Map<string, AddonEntitlement>> {
  const orderIds = Array.from(new Set(orders.map((o) => s(o.id)).filter(Boolean)));
  if (orderIds.length === 0) return new Map();
  const [raAddonRows, additionalPetRows] = await Promise.all([
    fetchRequestRows("order_additional_documentation_requests", orderIds),
    fetchRequestRows("order_additional_pet_requests", orderIds),
  ]);
  return computeAddonEntitlements(orders, raAddonRows, additionalPetRows);
}
