// PartnerContributionPanel — PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// Accounts › Partner Contribution: a SEPARATELY reconcilable view of B2B
// fulfilment economics. One row per RECOGNISED partner charge (the
// clinical_work_completed billable event minted by tg_partner_billable_on_completion),
// with the frozen partner charge, the canonical provider payout for that
// order, approved partner credits, and the resulting net contribution:
//
//   Net Partner Contribution = recognised partner charge − provider payout − approved partner credits
//
// WHAT THIS PANEL DOES NOT DO (by design)
//   * It never reads Stripe and never changes the company bridge (Gross
//     Charged, Refunds, Net Revenue, Provider Payments, Stripe Fees,
//     Company Expenses, Operating Net), Channel Contribution, Marketing or
//     closed periods. Partner charges are invoiced offline; they are not
//     Stripe sales and are not direct-customer revenue.
//   * It never recomputes an amount: every figure is the frozen ledger value
//     returned by get_partner_contribution_summary(p_from, p_to), which is
//     is_chat_admin-gated and uses America/New_York calendar dates.
//   * It never mounts outside the admin Accounts view.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface ContributionRow {
  event_id: string;
  partner_id: string;
  partner_name: string;
  partner_slug: string;
  order_id: string;
  confirmation_id: string;
  partner_order_id: string | null;
  service: string;
  intake_method: string;
  is_test: boolean;
  recognized_at: string;
  recognized_date_ny: string;
  charge_cents: number;
  credit_cents: number;
  provider_payout_cents: number;
  net_contribution_cents: number;
  billable_status: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoice_payment_status: string | null;
}

interface Props {
  /** Inclusive YYYY-MM-DD business (America/New_York) dates from the Accounts period. */
  from: string;
  to: string;
  rangeLabel: string;
  reloadSignal?: number;
}

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — the ORDER's
// own billing state leads.
//
// This badge used to read the INVOICE's payment status, so a paid invoice made
// every order on it read "Paid" — including orders no one had reconciled yet.
// That is precisely the distinction the task exists to draw: Stripe paying an
// invoice moves its orders to `invoice_paid_unreconciled`, and only an admin,
// order by order, makes one `paid`. The invoice status remains the fallback for
// rows written before per-order reconciliation existed.
function invoiceBadge(r: ContributionRow): { label: string; cls: string } {
  if (r.invoice_status === "paid") return { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (r.invoice_status === "invoice_paid_unreconciled") {
    return { label: "Payment received · to reconcile", cls: "bg-sky-50 text-sky-700 ring-sky-200" };
  }
  if (r.invoice_status === "credited") return { label: "Credited", cls: "bg-violet-50 text-violet-700 ring-violet-200" };
  if (r.invoice_payment_status === "paid") return { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (r.invoice_payment_status === "partially_paid") return { label: "Partially paid", cls: "bg-amber-50 text-amber-800 ring-amber-200" };
  if (r.invoice_payment_status === "issued" || r.invoice_payment_status === "overdue") return { label: `Invoiced ${r.invoice_number ?? ""}`.trim(), cls: "bg-blue-50 text-blue-700 ring-blue-200" };
  if (r.invoice_payment_status === "draft") return { label: "Draft invoice", cls: "bg-gray-100 text-gray-600 ring-gray-300" };
  if (r.invoice_status === "void") return { label: "Void", cls: "bg-gray-100 text-gray-500 ring-gray-300" };
  return { label: "Billable · not invoiced", cls: "bg-amber-50 text-amber-800 ring-amber-200" };
}

export default function PartnerContributionPanel({ from, to, rangeLabel, reloadSignal = 0 }: Props) {
  const [rows, setRows] = useState<ContributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void (async () => {
      const { data, error: err } = await supabase.rpc("get_partner_contribution_summary", { p_from: from, p_to: to });
      if (cancelled) return;
      if (err) { setError("Partner Contribution could not be loaded (admin access required)."); setRows([]); }
      else setRows((data as ContributionRow[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [from, to, reloadSignal]);

  const visible = useMemo(() => rows.filter((r) => includeTest || !r.is_test), [rows, includeTest]);
  const testCount = rows.length - rows.filter((r) => !r.is_test).length;

  const totals = useMemo(() => visible.reduce((t, r) => ({
    charge: t.charge + r.charge_cents,
    credits: t.credits + r.credit_cents,
    payout: t.payout + r.provider_payout_cents,
    net: t.net + r.net_contribution_cents,
    invoiced: t.invoiced + (r.invoice_payment_status && r.invoice_payment_status !== "draft" ? r.charge_cents + r.credit_cents : 0),
    paid: t.paid + (r.invoice_payment_status === "paid" ? r.charge_cents + r.credit_cents : 0),
  }), { charge: 0, credits: 0, payout: 0, net: 0, invoiced: 0, paid: 0 }), [visible]);

  const byPartner = useMemo(() => {
    const m = new Map<string, { name: string; orders: number; charge: number; payout: number; credits: number; net: number }>();
    for (const r of visible) {
      const e = m.get(r.partner_id) ?? { name: r.partner_name, orders: 0, charge: 0, payout: 0, credits: 0, net: 0 };
      e.orders++; e.charge += r.charge_cents; e.payout += r.provider_payout_cents; e.credits += r.credit_cents; e.net += r.net_contribution_cents;
      m.set(r.partner_id, e);
    }
    return Array.from(m.values()).sort((a, b) => b.net - a.net);
  }, [visible]);

  const exportCsv = () => {
    const head = ["partner", "pawtenant_order", "partner_reference", "service", "intake", "recognized_date_ny", "partner_charge", "provider_payout", "partner_credits", "net_contribution", "billing_status", "invoice", "payment_status", "is_test"];
    const lines = visible.map((r) => [r.partner_name, r.confirmation_id, r.partner_order_id ?? "", r.service, r.intake_method, r.recognized_date_ny,
      (r.charge_cents / 100).toFixed(2), (r.provider_payout_cents / 100).toFixed(2), (r.credit_cents / 100).toFixed(2), (r.net_contribution_cents / 100).toFixed(2),
      r.billable_status ?? "", r.invoice_number ?? "", r.invoice_payment_status ?? "", r.is_test ? "yes" : "no"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `partner-contribution-${from}-to-${to}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <i className="ri-building-2-line text-indigo-600"></i> Partner Contribution
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            B2B fulfilment economics for {rangeLabel} (America/New_York). Kept <strong>separate</strong> from Stripe sales, Channel Contribution and Operating Net — partner charges are invoiced offline and are not direct-customer revenue.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {testCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Include {testCount} test row{testCount === 1 ? "" : "s"}
            </label>
          )}
          <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <i className="ri-download-2-line mr-1"></i>CSV
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500 py-6 text-center"><i className="ri-loader-4-line animate-spin mr-1"></i>Loading partner contribution…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-4">
            {[
              { label: "Recognised partner charges", value: totals.charge, hint: `${visible.length} completed order${visible.length === 1 ? "" : "s"}` },
              { label: "Provider payout", value: -totals.payout, hint: "canonical earnings ledger" },
              { label: "Partner credits", value: totals.credits, hint: "approved credits" },
              { label: "Net Partner Contribution", value: totals.net, hint: "charge − payout − credits", strong: true },
              { label: "Invoiced", value: totals.invoiced, hint: "issued invoices" },
              { label: "Collected", value: totals.paid, hint: "paid invoices" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border px-3 py-2 ${c.strong ? "border-indigo-200 bg-indigo-50/50" : "border-gray-200 bg-gray-50"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{c.label}</p>
                <p className={`mt-1 tabular-nums font-bold ${c.strong ? "text-xl text-indigo-900" : "text-lg text-gray-900"} ${c.value < 0 ? "text-rose-700" : ""}`}>{usd(c.value)}</p>
                <p className="text-[10px] text-gray-500">{c.hint}</p>
              </div>
            ))}
          </div>

          {byPartner.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead><tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3">Partner</th><th className="py-1.5 pr-3 text-right">Orders</th><th className="py-1.5 pr-3 text-right">Charges</th><th className="py-1.5 pr-3 text-right">Provider payout</th><th className="py-1.5 pr-3 text-right">Credits</th><th className="py-1.5 pr-3 text-right">Net contribution</th>
                </tr></thead>
                <tbody>{byPartner.map((p) => (
                  <tr key={p.name} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-medium text-gray-900">{p.name}</td><td className="py-1.5 pr-3 text-right tabular-nums">{p.orders}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{usd(p.charge)}</td><td className="py-1.5 pr-3 text-right tabular-nums text-rose-700">−{usd(p.payout)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{usd(p.credits)}</td><td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{usd(p.net)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">No partner charges were recognised in this period. A charge is recognised when a partner order's clinical work is completed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-xs">
                <thead><tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Partner</th><th className="py-2 pr-3">PawTenant order</th><th className="py-2 pr-3">Partner ref</th><th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Completed (NY)</th><th className="py-2 pr-3 text-right">Charge</th><th className="py-2 pr-3 text-right">Provider payout</th><th className="py-2 pr-3 text-right">Credits</th>
                  <th className="py-2 pr-3 text-right">Net</th><th className="py-2 pr-3">Billing</th>
                </tr></thead>
                <tbody>{visible.map((r) => { const b = invoiceBadge(r); return (
                  <tr key={r.event_id} className="border-b border-gray-100">
                    <td className="py-2 pr-3"><span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">{r.partner_name}</span>{r.is_test && <span className="ml-1 text-[10px] text-gray-400">test</span>}</td>
                    <td className="py-2 pr-3 font-mono">{r.confirmation_id}</td>
                    <td className="py-2 pr-3 font-mono text-gray-600">{r.partner_order_id ?? "—"} <span className="text-[10px] uppercase text-gray-400">{r.intake_method}</span></td>
                    <td className="py-2 pr-3 uppercase">{r.service}</td>
                    <td className="py-2 pr-3 text-gray-600">{r.recognized_date_ny}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{usd(r.charge_cents)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-rose-700">−{usd(r.provider_payout_cents)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{usd(r.credit_cents)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">{usd(r.net_contribution_cents)}</td>
                    <td className="py-2 pr-3"><span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${b.cls}`}>{b.label}</span></td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
