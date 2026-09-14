// Partner Portal → Billing.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// The partner's OWN invoices and nothing else, from
// `partner_portal_invoices()` (filtered by `current_partner_id()`).
// PawTenant's provider costs, margin and contribution are not in the
// projection — only what this organization owes and has paid.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface PortalInvoice {
  invoice_id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  amount_paid_cents: number;
  hosted_invoice_url: string | null;
  order_count: number;
}

const NY_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "short", day: "2-digit",
});
const nyDate = (iso: string | null) => (iso ? NY_DATE.format(new Date(iso)) : "—");
const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  issued: "bg-amber-50 text-amber-700 border-amber-200",
  partially_paid: "bg-sky-50 text-sky-700 border-sky-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function PartnerPortalInvoices() {
  const [rows, setRows] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc("partner_portal_invoices");
    if (err) setError(err.message);
    setRows((data ?? []) as PortalInvoice[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900">Billing</h2>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        Invoices PawTenant has issued to your organization.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Invoice</th>
                <th className="px-4 py-2.5 font-semibold">Orders</th>
                <th className="px-4 py-2.5 font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">Issued</th>
                <th className="px-4 py-2.5 font-semibold">Due</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Paid</th>
                <th className="px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No invoices yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.invoice_id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-mono text-[12.5px] font-semibold text-gray-900">{r.invoice_number}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.order_count}</td>
                  <td className="px-4 py-2.5 text-gray-900 font-semibold whitespace-nowrap">{money(r.total_cents, r.currency)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{nyDate(r.issued_at)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{nyDate(r.due_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                      STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {r.paid_at ? `${money(r.amount_paid_cents, r.currency)} · ${nyDate(r.paid_at)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.hosted_invoice_url && (
                      <a href={r.hosted_invoice_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-gray-700 hover:text-gray-900 underline">
                        View invoice
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
