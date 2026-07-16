// Meta (Facebook/Instagram) Custom Audience CSV export — IDENTIFIERS ONLY.
//
// PRIVACY / COMPLIANCE (do not remove):
// This file produces an UPLOAD-SAFE contact list for a Meta Custom Audience.
// It includes ONLY the matching identifiers Meta supports:
//   email, phone, fn (first name), ln (last name), st (state),
//   country, dob, doby (birth year), age
// It deliberately EXCLUDES everything that could reveal — or be combined to
// reveal — a person's health, ESA/PSD/service-animal status, diagnosis, plan,
// payment, attribution, or order details. Do NOT add order IDs, payment status,
// service type, traffic source, campaign, provider, or assessment answers here.
//
// Do NOT label the audience or file as "ESA buyers", "PSD users", etc.
// Recommended neutral audience name in Meta: "PawTenant Site Contacts - Paid Clients".
//
// This is an admin-only export. DOB/age are included only where the customer
// already supplied a DOB; age is calculated at export time and never stored.

import { extractDob, dobBirthYear, dobToAge } from "./dob";
import { isRefundTerminal, hasAnyRefund, type ClassifiableOrder } from "./orderClassification";

export interface MetaAudienceOrder {
  [key: string]: unknown;
}

export type MetaAudienceMode = "paid" | "paid_or_refunded";

// PawTenant is a US-only service (state-based ESA/PSD letters), so every
// matchable contact is in the United States. This is a service fact, not
// invented personal data.
const DEFAULT_COUNTRY = "US";

// Meta audience identifier columns — fixed order, identifiers only.
const META_HEADERS = ["email", "phone", "fn", "ln", "st", "country", "dob", "doby", "age"];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

// Normalised keys used ONLY for in-file deduplication (not written out).
function normEmail(value: unknown): string {
  return str(value).trim().toLowerCase();
}
function normPhone(value: unknown): string {
  return str(value).replace(/\D/g, "");
}

// Paid = has paid_at and was not made whole by a FULL refund.
// paid_or_refunded additionally includes any refund activity.
//
// PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: a partially-refunded customer
// is still a paying client and must stay in the "paid" audience. Excluding them
// on a bare refunded_at dropped real customers out of Meta targeting.
function isEligible(o: MetaAudienceOrder, mode: MetaAudienceMode): boolean {
  const paid = !!o.paid_at;
  if (mode === "paid_or_refunded") return paid || hasAnyRefund(o as ClassifiableOrder);
  return paid && !isRefundTerminal(o as ClassifiableOrder);
}

// Build the deduplicated, identifiers-only rows for the chosen mode.
// Returns the number of contact rows (excludes the header).
export function buildMetaAudienceRows(
  orders: MetaAudienceOrder[],
  mode: MetaAudienceMode,
): { csv: string; count: number } {
  const seen = new Set<string>();
  const rows: string[] = [];

  for (const o of orders) {
    if (!isEligible(o, mode)) continue;

    const email = normEmail(o.email);
    const phone = normPhone(o.phone);
    if (!email && !phone) continue; // nothing matchable — skip

    // Dedup by email when present, else by phone. Orders arrive newest-first,
    // so the first row kept per person is their most recent record.
    const key = email ? `e:${email}` : `p:${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const dob = extractDob(o);
    rows.push(
      [
        o.email,
        o.phone,
        o.first_name,
        o.last_name,
        o.state,
        DEFAULT_COUNTRY,
        dob,
        dobBirthYear(dob),
        dobToAge(dob),
      ].map(csvEscape).join(","),
    );
  }

  const header = META_HEADERS.map(csvEscape).join(",");
  const csv = [header, ...rows].join("\r\n");
  return { csv, count: rows.length };
}

// Trigger a browser download of the Meta audience CSV. Returns the row count
// so the caller can report "0 contacts" instead of silently downloading an
// empty file. Neutral filename — no health/ESA/PSD wording.
export function exportMetaAudienceToCSV(
  orders: MetaAudienceOrder[],
  mode: MetaAudienceMode = "paid",
): number {
  const { csv, count } = buildMetaAudienceRows(orders, mode);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  const suffix = mode === "paid_or_refunded" ? "paid-or-refunded" : "paid-clients";
  link.download = `pawtenant-meta-audience-${suffix}-${ts}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  return count;
}
