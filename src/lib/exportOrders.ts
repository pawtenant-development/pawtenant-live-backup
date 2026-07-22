// Admin Orders CSV export helper.
// Column order is explicit and stable so the CSV never leaks unexpected fields
// and so downstream spreadsheets keep a predictable shape.

import { resolveOrderAttribution, type ResolvedAttribution, type ResolvableOrder } from "./attributionResolver";
import { extractDob, dobBirthYear, dobToAge } from "./dob";
import {
  refundDisposition,
  isRefundTerminal,
  type ClassifiableOrder,
} from "./orderClassification";

export interface ExportableOrder {
  [key: string]: unknown;
}

// Resolve clean attribution (source vs landing page) ONCE per order row and
// memoize, so the many attribution columns below don't recompute per cell.
const _attrCache = new WeakMap<object, ResolvedAttribution>();
function attr(o: ExportableOrder): ResolvedAttribution {
  const cached = _attrCache.get(o as object);
  if (cached) return cached;
  const resolved = resolveOrderAttribution(o as ResolvableOrder);
  _attrCache.set(o as object, resolved);
  return resolved;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  // Escape double-quotes by doubling them; wrap whole field in quotes.
  return `"${s.replace(/"/g, '""')}"`;
}

function fmtDate(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

// Derived: ESA vs PSD service type from letter_type / confirmation id.
function serviceType(o: ExportableOrder): string {
  const lt = str(o.letter_type).toLowerCase();
  if (lt === "psd") return "PSD";
  if (lt === "esa") return "ESA";
  const conf = str(o.confirmation_id).toUpperCase();
  if (conf.includes("-PSD")) return "PSD";
  return "ESA";
}

// Derived: high-level payment status from timestamps (no extra columns leaked).
// PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: only a FULL refund undoes the
// payment. A partially-refunded customer still Paid — the partial is reported in
// the dedicated Refund/Dispute Status and Refund Amount columns.
function paymentStatus(o: ExportableOrder): string {
  if (isRefundTerminal(o as ClassifiableOrder)) return "Refunded";
  if (o.paid_at) return "Paid";
  if (o.payment_failed_at) return "Failed";
  return "Unpaid";
}

// Derived: recovery sequence stage — mirrors the Orders page sequence logic.
function sequenceStage(o: ExportableOrder): string {
  if (o.followup_opt_out || o.seq_opted_out_at) return "Opted Out";
  if (o.seq_3day_sent_at) return "3-Day Sent";
  if (o.seq_24h_sent_at) return "24h Sent";
  if (o.seq_30min_sent_at) return "5min Sent";
  return "Not Started";
}

// This column IS the place refund activity belongs — it reports the canonical
// disposition rather than a bare "Refunded" that hid the partial/full split.
function refundDisputeStatus(o: ExportableOrder): string {
  const parts: string[] = [];
  const disposition = refundDisposition(o as ClassifiableOrder);
  if (disposition === "partial") parts.push("Partial Refund");
  else if (disposition === "full") parts.push("Refunded");
  else if (disposition === "full_cancelled") parts.push("Refunded + Cancelled");
  else if (disposition === "unknown") parts.push("Refund (completeness unknown)");
  if (o.dispute_status) parts.push(`Dispute: ${str(o.dispute_status)}`);
  if (o.fraud_warning) parts.push("Fraud Warning");
  return parts.join(" | ");
}

// Derived: letter/document delivery stage from the order's document timestamps
// (operational status only — no clinical content).
function documentStatus(o: ExportableOrder): string {
  if (o.patient_notification_sent_at) return "Delivered";
  if (o.signed_letter_url) return "Signed — Not Delivered";
  if (o.letter_url) return "Draft Generated";
  return "Pending";
}

// Derived: gross minus refund (operational net). Returned UNROUNDED so the
// provider-deduction column can subtract from the raw value and format once.
function netAfterRefundNum(o: ExportableOrder): number | null {
  const price = typeof o.price === "number" ? o.price : parseFloat(str(o.price));
  if (isNaN(price)) return null;
  const refund = typeof o.refund_amount === "number" ? o.refund_amount : parseFloat(str(o.refund_amount));
  return price - (isNaN(refund) ? 0 : refund);
}

// Existing "Net After Refund (USD)" column — unchanged output.
function netAfterRefund(o: ExportableOrder): string {
  const net = netAfterRefundNum(o);
  if (net === null) return "";
  return (Math.round(net * 100) / 100).toFixed(2);
}

// addon_services may be a JSON array/object or a string — render readably.
function addons(o: ExportableOrder): string {
  const v = o.addon_services;
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return str(v);
}

// Per-export context passed to every column getter. Carries the canonical
// provider payment per order (already gated + summed; see providerPaymentExport.ts).
interface ExportCtx {
  providerPayment: (o: ExportableOrder) => number;
}

// label : value accessor. Order here is the column order in the CSV.
const EXPORT_COLUMNS: { label: string; get: (o: ExportableOrder, ctx: ExportCtx) => unknown }[] = [
  { label: "First Name", get: (o) => o.first_name },
  { label: "Last Name", get: (o) => o.last_name },
  { label: "Full Name", get: (o) => `${str(o.first_name)} ${str(o.last_name)}`.trim() },
  { label: "Email", get: (o) => o.email },
  { label: "Phone", get: (o) => o.phone },
  // Date of Birth lives in assessment_answers.dob ("YYYY-MM-DD"); Age is
  // calculated at export time from DOB. All three stay blank when DOB is
  // missing/invalid — we never invent these values. (Admin-only export.)
  { label: "Date of Birth", get: (o) => extractDob(o) },
  { label: "Birth Year", get: (o) => dobBirthYear(extractDob(o)) },
  { label: "Age", get: (o) => dobToAge(extractDob(o)) },
  { label: "Confirmation ID", get: (o) => o.confirmation_id },
  { label: "Order ID", get: (o) => o.id },
  { label: "Verification / Letter ID", get: (o) => o.letter_id },
  { label: "Created At", get: (o) => fmtDate(o.created_at) },
  { label: "Paid At", get: (o) => fmtDate(o.paid_at) },
  { label: "Gross Amount (USD)", get: (o) => o.price },
  { label: "Payment Status", get: (o) => paymentStatus(o) },
  { label: "Payment Method", get: (o) => o.payment_method },
  { label: "Stripe Payment Intent", get: (o) => o.payment_intent_id },
  { label: "Refund Amount (USD)", get: (o) => o.refund_amount },
  { label: "Net After Refund (USD)", get: (o) => netAfterRefund(o) },
  // ── Provider payout retained for the order + resulting business net.
  // Provider Payment = SUM of valid (non-cancelled) doctor_earnings components on a
  // COMPLETED order (doctor_status='patient_notified'); stays retained when the
  // customer later refunds, and is 0 when refunded/closed before completion or still
  // under review. Never derived from price or a rate. Net After Provider Deduction =
  // Net After Refund − Provider Payment (may be negative on a completed-then-refunded
  // order — intentionally not clamped to zero). Bare 2-dp numbers so Excel keeps them
  // numeric; 0 is written as "0.00", never blank.
  { label: "Provider Payment", get: (o, ctx) => ctx.providerPayment(o).toFixed(2) },
  {
    label: "Net After Provider Deduction",
    get: (o, ctx) => {
      const net = netAfterRefundNum(o);
      if (net === null) return ""; // gross unknown → cannot compute (matches Net After Refund)
      return (net - ctx.providerPayment(o)).toFixed(2);
    },
  },
  { label: "Coupon Code", get: (o) => o.coupon_code },
  { label: "Coupon Discount (USD)", get: (o) => o.coupon_discount },
  { label: "Refund / Dispute", get: (o) => refundDisputeStatus(o) },
  { label: "Order Status", get: (o) => o.status },
  { label: "Provider Status", get: (o) => o.doctor_status },
  { label: "Assigned Provider", get: (o) => o.doctor_name },
  { label: "Requested Provider (ID)", get: (o) => o.selected_provider },
  { label: "Document Status", get: (o) => documentStatus(o) },
  { label: "State", get: (o) => o.state },
  { label: "Service Type", get: (o) => serviceType(o) },
  { label: "Plan Type", get: (o) => o.plan_type },
  { label: "Add-on Services", get: (o) => addons(o) },
  { label: "Delivery Speed", get: (o) => o.delivery_speed },
  // Raw legacy value preserved (may contain landing labels like "state-page").
  { label: "Traffic Source (Raw)", get: (o) => o.referred_by },
  // Clean, marketing-ready attribution — source separated from landing page.
  { label: "Traffic Source Final", get: (o) => attr(o).traffic_source_final },
  { label: "Traffic Channel Final", get: (o) => attr(o).traffic_channel_final },
  { label: "Attribution Rule Reason", get: (o) => attr(o).attribution_rule_reason },
  { label: "Attribution Confidence", get: (o) => attr(o).attribution_confidence },
  { label: "Source Confidence", get: (o) => attr(o).attribution_confidence },
  { label: "Attribution Data Completeness", get: (o) => attr(o).attribution_data_completeness },
  { label: "UTM Source", get: (o) => o.utm_source },
  { label: "UTM Medium", get: (o) => o.utm_medium },
  { label: "UTM Campaign", get: (o) => o.utm_campaign },
  { label: "UTM Term", get: (o) => attr(o).utm_term },
  { label: "UTM Content", get: (o) => attr(o).utm_content },
  // Keyword / search term — verbatim from capture; blank when unavailable
  // (Google Ads keyword is not always exposed to the browser).
  { label: "Keyword", get: (o) => attr(o).keyword },
  { label: "Search Term", get: (o) => attr(o).search_term },
  // Campaign / ad-set / ad identifiers + Google ValueTrack signals.
  { label: "Campaign ID", get: (o) => attr(o).campaign_id },
  { label: "Ad Set ID", get: (o) => attr(o).adset_id },
  { label: "Ad ID", get: (o) => attr(o).ad_id },
  { label: "Network", get: (o) => attr(o).network },
  { label: "Match Type", get: (o) => attr(o).match_type },
  { label: "Device", get: (o) => attr(o).device },
  { label: "Placement", get: (o) => attr(o).placement },
  { label: "gclid", get: (o) => o.gclid },
  { label: "fbclid", get: (o) => o.fbclid },
  { label: "gad_source", get: (o) => attr(o).gad_source },
  // Landing pages — where the visitor landed (kept separate from source).
  { label: "First Landing Page", get: (o) => attr(o).first_landing_page_url },
  { label: "First Landing Page Path", get: (o) => attr(o).first_landing_page_path },
  { label: "First Landing Page Type", get: (o) => attr(o).first_landing_page_type },
  { label: "Last Landing Page", get: (o) => attr(o).last_landing_page_url },
  { label: "Last Landing Page Path", get: (o) => attr(o).last_landing_page_path },
  { label: "Last Landing Page Type", get: (o) => attr(o).last_landing_page_type },
  { label: "First Referrer", get: (o) => attr(o).first_referrer },
  { label: "Last Referrer", get: (o) => attr(o).last_referrer },
  { label: "Session ID", get: (o) => attr(o).session_id },
  { label: "Time to Payment (min)", get: (o) => attr(o).time_to_payment_minutes },
  { label: "Time First Visit to Order (min)", get: (o) => attr(o).time_first_visit_to_order_minutes },
  { label: "Sequence Stage", get: (o) => sequenceStage(o) },
  { label: "GHL Contact ID", get: (o) => o.ghl_contact_id },
  { label: "Last Activity", get: (o) => fmtDate(o.last_contacted_at) },
];

export function exportOrdersToCSV(
  orders: ExportableOrder[],
  filenamePrefix = "orders",
  // Canonical provider payment per order.id (gated + summed). Absent/unknown → 0.
  providerPaymentByOrderId?: Map<string, number>,
): void {
  const ctx: ExportCtx = {
    providerPayment: (o) => providerPaymentByOrderId?.get(str(o.id)) ?? 0,
  };
  const headers = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(",");
  const rows = orders.map((o) =>
    EXPORT_COLUMNS.map((c) => csvEscape(c.get(o, ctx))).join(",")
  );
  const csv = [headers, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  link.download = `${filenamePrefix}-${ts}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
