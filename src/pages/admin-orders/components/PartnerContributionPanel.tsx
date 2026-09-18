// PartnerContributionPanel — PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//                            PARTNER-CONTRIBUTION-ACCOUNTS-001
//
// Accounts › Partner Contribution: the per-event detail behind the single
// "Partner Contribution" step in the Financial Overview. One row per RECOGNISED
// partner charge (the clinical_work_completed billable event minted by
// tg_partner_billable_on_completion), with the frozen partner charge, the
// canonical provider payout for that order, approved partner credits, and the
// resulting net retained contribution:
//
//   Net Partner Contribution = recognised partner charge − provider payout − approved credits
//
// WHAT CHANGED IN -ACCOUNTS-001
//   This panel no longer fetches or totals anything itself. The Accounts shell
//   (PaymentsTab) makes ONE call to get_partner_contribution_summary for the
//   shared accountsFrom/accountsTo range, de-duplicates it, and hands the rows
//   plus the reduced totals to BOTH this panel and the Overview bridge. That is
//   what makes the Overview figure, the Estimated P&L line, this section's
//   total and the CSV export reconcile exactly rather than by coincidence.
//
// WHAT THIS PANEL STILL DOES NOT DO (by design)
//   * It never reads Stripe. Partner charges are invoiced offline: they are
//     never added to Gross Charged, never attract a Stripe fee, and are never
//     counted as direct-customer revenue.
//   * It never recomputes an amount: every figure is the frozen ledger value,
//     stamped with the rate-card version in force when the order was created,
//     so changing a partner's CURRENT rate cannot restate a closed period.
//   * It never mounts outside the admin Accounts view, and it never applies a
//     partner filter — these are company-wide figures.

import { useMemo } from "react";
import {
  centsToUsd, groupPartnerTotals, visiblePartnerRows,
  type PartnerContributionRow, type PartnerContributionTotals,
} from "../../../lib/partnerContribution";

interface Props {
  /** Inclusive YYYY-MM-DD business (America/New_York) dates from the Accounts period. */
  from: string;
  to: string;
  rangeLabel: string;
  /** Canonical rows, already de-duplicated by the Accounts shell. */
  rows: PartnerContributionRow[];
  /** The ONE reduction of those rows — the same object the Overview step uses. */
  totals: PartnerContributionTotals;
  loading?: boolean;
  error?: string;
  includeTest: boolean;
  onIncludeTestChange: (next: boolean) => void;
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsToUsd(cents));

// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — the ORDER's
// own billing state leads.
//
// This badge used to read the INVOICE's payment status, so a paid invoice made
// every order on it read "Paid" — including orders no one had reconciled yet.
// That is precisely the distinction the task exists to draw: Stripe paying an
// invoice moves its orders to `invoice_paid_unreconciled`, and only an admin,
// order by order, makes one `paid`. The invoice status remains the fallback for
// rows written before per-order reconciliation existed.
function invoiceBadge(r: PartnerContributionRow): { label: string; cls: string } {
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

export default function PartnerContributionPanel({
  from, to, rangeLabel, rows, totals, loading = false, error = "", includeTest, onIncludeTestChange,
}: Props) {
  const visible = useMemo(() => visiblePartnerRows(rows, includeTest), [rows, includeTest]);
  const testCount = useMemo(() => visiblePartnerRows(rows, true).filter((r) => r.is_test).length, [rows]);
  const byPartner = useMemo(() => groupPartnerTotals(rows, includeTest), [rows, includeTest]);

  const exportCsv = () => {
    const head = ["partner", "pawtenant_order", "partner_reference", "service", "intake", "recognized_date_ny", "partner_charge", "provider_payout", "partner_credits", "net_contribution", "billing_status", "invoice", "payment_status", "is_test"];
    const lines = visible.map((r) => [r.partner_name, r.confirmation_id, r.partner_order_id ?? "", r.service, r.intake_method, r.recognized_date_ny,
      centsToUsd(r.charge_cents).toFixed(2), centsToUsd(r.provider_payout_cents).toFixed(2), centsToUsd(r.credit_cents).toFixed(2), centsToUsd(r.net_contribution_cents).toFixed(2),
      r.billable_status ?? "", r.invoice_number ?? "", r.invoice_payment_status ?? "", r.is_test ? "yes" : "no"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    // The section total, so this file reconciles to the Overview and to the
    // Accounts P&L export without the reader re-adding the rows.
    const totalRow = ["TOTAL", "", "", "", "", `${from} to ${to}`,
      centsToUsd(totals.grossContributionCents).toFixed(2),
      centsToUsd(totals.providerCompensationCents).toFixed(2),
      centsToUsd(totals.creditsCents).toFixed(2),
      centsToUsd(totals.netContributionCents).toFixed(2), "", "", "", ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    const blob = new Blob([[head.join(","), ...lines, totalRow].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `partner-contribution-${from}-to-${to}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <i className="ri-building-2-line text-indigo-600"></i> Partner Contribution
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            B2B fulfilment economics for {rangeLabel} (America/New_York). Partner charges are invoiced offline: they are <strong>never</strong> added to Gross Charged and <strong>never</strong> charged a Stripe fee. The net figure below is the <strong>Partner Contribution</strong> step in the Financial Overview — one dataset, one total.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {testCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={includeTest} onChange={(e) => onIncludeTestChange(e.target.checked)} /> Include {testCount} test row{testCount === 1 ? "" : "s"}
            </label>
          )}
          <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <i className="ri-download-2-line mr-1"></i>CSV
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">{error}</p>}
      {!error && !totals.componentsReconcile && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 mb-3">
          <i className="ri-error-warning-line mr-1"></i>
          Recognised revenue less provider compensation and credits does not equal the recorded net contribution. The figures are shown exactly as stored — review the partner finance ledger before relying on this period.
        </p>
      )}
      {loading ? (
        <p className="text-sm text-gray-500 py-6 text-center"><i className="ri-loader-4-line animate-spin mr-1"></i>Loading partner contribution…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-4">
            {[
              { label: "Gross partner revenue", value: totals.grossContributionCents, hint: `${visible.length} recognised charge${visible.length === 1 ? "" : "s"}` },
              { label: "Partner provider cost", value: -totals.providerCompensationCents, hint: "deducted here only" },
              { label: "Credits / reversals", value: totals.creditsCents, hint: "append-only credit events" },
              { label: "Net retained contribution", value: totals.netContributionCents, hint: "revenue − provider cost − credits", strong: true },
              { label: "Invoiced", value: totals.invoicedCents, hint: "issued invoices" },
              { label: "Collected", value: totals.collectedCents, hint: "paid invoices" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border px-3 py-2 ${c.strong ? "border-indigo-200 bg-indigo-50/50" : "border-gray-200 bg-gray-50"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{c.label}</p>
                <p className={`mt-1 tabular-nums font-bold ${c.strong ? "text-xl text-indigo-900" : "text-lg text-gray-900"} ${c.value < 0 ? "text-rose-700" : ""}`}>{usd(c.value)}</p>
                <p className="text-[10px] text-gray-500">{c.hint}</p>
              </div>
            ))}
          </div>

          {/* How a partner order becomes contribution — the recognition rule,
              stated once, where an operator reading the numbers will see it. */}
          <p className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
            <i className="ri-information-line mr-1"></i>
            A partner charge is recognised the moment the clinical work is completed. An order that is still pending, in review, or cancelled <em>before</em> completion has no charge and contributes nothing. An order cancelled <em>after</em> completion keeps the contribution it earned — the billable event, invoice and provider earning are append-only history and are never erased. Corrections are made by adding a credit event, never by deleting a charge.
          </p>

          {byPartner.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead><tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3">Partner</th><th className="py-1.5 pr-3 text-right">Orders</th><th className="py-1.5 pr-3 text-right">Charges</th><th className="py-1.5 pr-3 text-right">Provider payout</th><th className="py-1.5 pr-3 text-right">Credits</th><th className="py-1.5 pr-3 text-right">Net contribution</th>
                </tr></thead>
                <tbody>{byPartner.map((p) => (
                  <tr key={p.partner_id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-medium text-gray-900 max-w-[220px] truncate" title={p.name}>{p.name}</td><td className="py-1.5 pr-3 text-right tabular-nums">{p.orders}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{usd(p.grossCents)}</td><td className="py-1.5 pr-3 text-right tabular-nums text-rose-700">−{usd(p.providerCents)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{usd(p.creditsCents)}</td><td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{usd(p.netCents)}</td>
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
                    <td className="py-2 pr-3"><span className="inline-flex max-w-[180px] truncate items-center rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200" title={r.partner_name}>{r.partner_name}</span>{r.is_test && <span className="ml-1 text-[10px] text-gray-400">test</span>}</td>
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
