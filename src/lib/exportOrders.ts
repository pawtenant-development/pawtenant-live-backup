// Admin Orders CSV export helper.
// Column order is explicit and stable so the CSV never leaks unexpected fields
// and so downstream spreadsheets keep a predictable shape.

export interface ExportableOrder {
  [key: string]: unknown;
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
function paymentStatus(o: ExportableOrder): string {
  if (o.refunded_at) return "Refunded";
  if (o.paid_at) return "Paid";
  if (o.payment_failed_at) return "Failed";
  return "Unpaid";
}

// Derived: recovery sequence stage — mirrors the Orders page sequence logic.
function sequenceStage(o: ExportableOrder): string {
  if (o.followup_opt_out || o.seq_opted_out_at) return "Opted Out";
  if (o.seq_3day_sent_at) return "3-Day Sent";
  if (o.seq_24h_sent_at) return "24h Sent";
  if (o.seq_30min_sent_at) return "30min Sent";
  return "Not Started";
}

function refundDisputeStatus(o: ExportableOrder): string {
  const parts: string[] = [];
  if (o.refunded_at) parts.push("Refunded");
  if (o.dispute_status) parts.push(`Dispute: ${str(o.dispute_status)}`);
  if (o.fraud_warning) parts.push("Fraud Warning");
  return parts.join(" | ");
}

// label : value accessor. Order here is the column order in the CSV.
const EXPORT_COLUMNS: { label: string; get: (o: ExportableOrder) => unknown }[] = [
  { label: "First Name", get: (o) => o.first_name },
  { label: "Last Name", get: (o) => o.last_name },
  { label: "Full Name", get: (o) => `${str(o.first_name)} ${str(o.last_name)}`.trim() },
  { label: "Email", get: (o) => o.email },
  { label: "Phone", get: (o) => o.phone },
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
  { label: "Refund / Dispute", get: (o) => refundDisputeStatus(o) },
  { label: "Order Status", get: (o) => o.status },
  { label: "Provider Status", get: (o) => o.doctor_status },
  { label: "Assigned Provider", get: (o) => o.doctor_name },
  { label: "Requested Provider (ID)", get: (o) => o.selected_provider },
  { label: "State", get: (o) => o.state },
  { label: "Service Type", get: (o) => serviceType(o) },
  { label: "Plan Type", get: (o) => o.plan_type },
  { label: "Delivery Speed", get: (o) => o.delivery_speed },
  { label: "Traffic Source", get: (o) => o.referred_by },
  { label: "UTM Source", get: (o) => o.utm_source },
  { label: "UTM Medium", get: (o) => o.utm_medium },
  { label: "UTM Campaign", get: (o) => o.utm_campaign },
  { label: "gclid", get: (o) => o.gclid },
  { label: "fbclid", get: (o) => o.fbclid },
  { label: "Sequence Stage", get: (o) => sequenceStage(o) },
  { label: "GHL Contact ID", get: (o) => o.ghl_contact_id },
  { label: "Last Activity", get: (o) => fmtDate(o.last_contacted_at) },
];

export function exportOrdersToCSV(orders: ExportableOrder[], filenamePrefix = "orders"): void {
  const headers = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(",");
  const rows = orders.map((o) =>
    EXPORT_COLUMNS.map((c) => csvEscape(c.get(o))).join(",")
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
