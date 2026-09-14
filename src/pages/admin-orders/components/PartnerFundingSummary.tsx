// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — the ADMIN-ONLY payment
// summary for a PARTNER-FUNDED order, mounted in the Payments tab in place of
// the direct-customer payment status / recovery actions / Stripe attempt log.
//
// A partner order has no customer PaymentIntent by design: the PARTNER paid
// PawTenant (wholesale) and the customer paid the partner. Labelling it
// "No Payment Received Yet" and offering Retry Payment Link / Discount
// Recovery Email to a partner's customer was the reported defect.
//
// Every number comes from ONE server function (partner_admin_order_finance),
// the same one the Partner Platform Finance tab reads, so the two never
// disagree. It is is_chat_admin()-gated server-side; a non-admin gets nothing.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface PartnerOrderFinance {
  order_id: string;
  confirmation_id: string;
  partner_id: string;
  partner_name: string;
  partner_reference: string | null;
  service: string;
  intake_method: string;
  clinical_state: string | null;
  billable_status: string;
  charge_cents: number;
  rate_card_version: number | null;
  provider_cost_cents: number;
  provider_cost_known: boolean;
  adjustments_cents: number;
  net_contribution_cents: number;
  invoice_status: string;
  invoice_number: string | null;
  invoice_payment_status: string | null;
  manual_paid_at: string | null;
  manual_paid_by: string | null;
  needs_reconciliation: boolean;
  reconciliation_reason: string | null;
  currency: string;
}

const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents ?? 0) / 100);

const INVOICE_LABELS: Record<string, string> = {
  uninvoiced: "Not yet invoiced",
  invoiced: "On an invoice",
  invoice_paid_unreconciled: "Invoice paid · order not yet marked paid",
  paid: "Marked paid",
  void: "Voided",
  credited: "Credited",
};

const BILLABLE_LABELS: Record<string, string> = {
  pending: "Awaiting clinical completion",
  billable: "Clinical work completed · billable",
  void: "Void",
  missing: "No financial snapshot",
};

function Row({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <p className={`text-sm font-bold tabular-nums text-right ${tone ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function PartnerFundingSummary({ orderId }: { orderId: string }) {
  const [fin, setFin] = useState<PartnerOrderFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void supabase.rpc("partner_admin_order_finance", { p_order_id: orderId }).then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError(err.message);
      setFin((data as PartnerOrderFinance | null) ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [orderId]);

  return (
    <div className="space-y-4" data-partner-funding-summary>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-100 flex-shrink-0">
            <i className="ri-building-line text-indigo-700 text-base"></i>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-indigo-900">Partner-funded order</p>
            <p className="text-xs text-indigo-800 mt-0.5">
              {fin ? `${fin.partner_name} pays the frozen partner charge for this order. The customer paid ${fin.partner_name}, not PawTenant — there is no customer payment to collect or recover here.`
                : "The partner pays the frozen partner charge for this order. There is no customer payment to collect or recover here."}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
          <i className="ri-file-list-3-line text-indigo-500"></i>
          Partner order economics (admin only)
        </p>
        {loading ? (
          <p className="py-4 text-sm text-gray-400">Loading…</p>
        ) : error ? (
          <p className="py-4 text-sm text-red-600">{error}</p>
        ) : !fin ? (
          <p className="py-4 text-sm text-gray-500">No partner finance snapshot was found for this order.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            <Row label="Partner brand" value={fin.partner_name} sub={fin.partner_reference ? `Partner reference ${fin.partner_reference}` : undefined} />
            <Row label="Frozen partner charge" value={money(fin.charge_cents, fin.currency)}
              sub={fin.rate_card_version ? `Rate card v${fin.rate_card_version} · frozen at acceptance` : "frozen at acceptance"} />
            <Row label="Provider cost"
              value={fin.provider_cost_known ? `− ${money(fin.provider_cost_cents, fin.currency)}` : "not yet established"}
              sub="from the provider payout ledger"
              tone={fin.provider_cost_known ? "text-gray-900" : "text-amber-700"} />
            <Row label="Adjustments" value={fin.adjustments_cents === 0 ? money(0, fin.currency) : money(fin.adjustments_cents, fin.currency)}
              sub="approved credits against this order's charge" />
            <Row label="Net partner contribution" value={money(fin.net_contribution_cents, fin.currency)}
              sub="charge − provider cost − adjustments" tone="text-emerald-700" />
            <Row label="Clinical / billable status" value={BILLABLE_LABELS[fin.billable_status] ?? fin.billable_status} />
            <Row label="Invoice status"
              value={INVOICE_LABELS[fin.invoice_status] ?? fin.invoice_status}
              sub={fin.invoice_number ? `${fin.invoice_number}${fin.invoice_payment_status ? ` · ${fin.invoice_payment_status}` : ""}` : undefined} />
            <Row label="Manually marked paid"
              value={fin.manual_paid_at ? "Yes" : "No"}
              sub={fin.manual_paid_at ? `${fin.manual_paid_by ?? "admin"} · ${new Date(fin.manual_paid_at).toLocaleString("en-US", { timeZone: "America/New_York" })} (New York)` : "Marked by an admin after the partner invoice is paid"} />
            {fin.needs_reconciliation && (
              <div className="pt-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                  <i className="ri-error-warning-line"></i>Needs financial reconciliation{fin.reconciliation_reason ? ` — ${fin.reconciliation_reason}` : ""}
                </span>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-400">
          Partner charges are invoiced and reconciled in Partner Platform → Finance. They are kept apart from direct-customer Stripe revenue and from provider payout accounting.
        </p>
      </div>
    </div>
  );
}
