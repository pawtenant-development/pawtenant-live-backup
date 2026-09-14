// Partner Portal → Accounts.
//
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// This organization's charges and invoices, and nothing else. Both reads are
// SECURITY DEFINER projections filtered by `current_partner_id()`:
//   * `partner_portal_orders()` — the frozen per-order charge and its billing
//     state (uninvoiced / invoiced / payment received / paid);
//   * `partner_portal_invoices()` — the invoices PawTenant has issued.
// Provider identity, provider pay, PawTenant margin and contribution are not
// in either projection — they cannot leak from a column never selected.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import PartnerPortalInvoices from "./PartnerPortalInvoices";

interface ChargeRow {
  order_id: string;
  confirmation_id: string;
  partner_reference: string | null;
  service: string;
  submitted_at: string | null;
  clinical_status: string | null;
  billing_status: string;
  invoice_number: string | null;
  partner_charge_cents: number | null;
  currency: string;
}

const NY_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "short", day: "2-digit",
});
const nyDate = (iso: string | null) => (iso ? NY_DATE.format(new Date(iso)) : "—");
const money = (cents: number | null, currency = "USD") =>
  cents === null || cents === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const BILLING_LABELS: Record<string, string> = {
  uninvoiced: "Not yet invoiced",
  invoiced: "Invoiced",
  invoice_paid_unreconciled: "Payment received",
  paid: "Paid",
  void: "Voided",
  credited: "Credited",
};
const humanise = (v: string | null) => (!v ? "—" : v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default function PartnerPortalAccounts() {
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc("partner_portal_orders", { p_limit: 500, p_offset: 0 });
    if (err) setError(err.message);
    setRows((data ?? []) as ChargeRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const sum = (pred: (r: ChargeRow) => boolean) =>
      rows.filter(pred).reduce((a, r) => a + (r.partner_charge_cents ?? 0), 0);
    const completed = (r: ChargeRow) => r.clinical_status === "clinical_work_completed";
    return {
      currency: rows[0]?.currency ?? "USD",
      inProgress: sum((r) => !completed(r) && r.clinical_status !== "cancelled"),
      uninvoiced: sum((r) => completed(r) && r.billing_status === "uninvoiced"),
      invoiced: sum((r) => r.billing_status === "invoiced"),
      paid: sum((r) => r.billing_status === "paid" || r.billing_status === "invoice_paid_unreconciled"),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Accounts</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          What your organization is charged per order, and the invoices PawTenant has issued. Charges are frozen at the rate in force when each order was submitted.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-partner-accounts-summary>
        <Stat label="In progress" value={money(totals.inProgress, totals.currency)} hint="not yet billable" />
        <Stat label="Completed · not yet invoiced" value={money(totals.uninvoiced, totals.currency)} />
        <Stat label="Invoiced · open" value={money(totals.invoiced, totals.currency)} />
        <Stat label="Paid" value={money(totals.paid, totals.currency)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-900">Charges by order</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5 font-semibold">PawTenant Order ID</th>
                <th className="px-4 py-2.5 font-semibold">Your reference</th>
                <th className="px-4 py-2.5 font-semibold">Service</th>
                <th className="px-4 py-2.5 font-semibold">Submitted</th>
                <th className="px-4 py-2.5 font-semibold">Charge</th>
                <th className="px-4 py-2.5 font-semibold">Billing</th>
                <th className="px-4 py-2.5 font-semibold">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No charges yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.order_id}>
                  <td className="px-4 py-2.5 font-mono text-[12.5px] font-semibold text-gray-900">{r.confirmation_id}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {r.partner_reference && !r.partner_reference.startsWith("portal-") ? r.partner_reference : "—"}
                  </td>
                  <td className="px-4 py-2.5 uppercase text-xs font-semibold text-gray-700">{r.service}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{nyDate(r.submitted_at)}</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{money(r.partner_charge_cents, r.currency)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{BILLING_LABELS[r.billing_status] ?? humanise(r.billing_status)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.invoice_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PartnerPortalInvoices />
    </div>
  );
}
