import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  buildAccountsReconciliation,
  type AccountsReconciliation,
  type BridgeSection,
  type ReconRpcPayload,
} from "../../../lib/accountsReconciliation";
import { resolutionToClassification, type ChargePayoutResolution } from "../../../lib/companyExpenses";

// ── Accounts › Stripe ↔ Orders Reconciliation ───────────────────────────────
// Read-only bridge between the two Accounts money bases:
//   • the company summary cards (STRIPE CASH BASIS — succeeded charges and
//     refunds by Stripe event date), and
//   • the Channel Contribution section (ORDER BASIS — orders paid in range).
// It joins the live Stripe charge list (already fetched by PaymentsTab)
// against get_accounts_reconciliation and itemizes every difference: add-on
// documentation payments, cross-month refunds, charged-vs-price differences,
// boundary charges, and provider-payout basis differences. Any residual the
// bridge cannot explain is surfaced in amber — never hidden.

interface ChargeLike {
  payment_intent: string | null;
  amount: number;
  status: string;
  refunded: boolean;
  amount_refunded: number;
}

/** What the bridge learned, lifted up so the Accounts header + Reconciliation
 *  section can use the SAME canonical numbers instead of recomputing them. */
export interface BridgeResult {
  loading: boolean;
  error: string;
  /** null until the bridge has both the Stripe dataset and the RPC payload. */
  fullyExplained: boolean | null;
  /** Order-basis totals straight from get_accounts_reconciliation. */
  orderBasis: {
    paidOrders: number | null;
    gross: number | null;
    refunds: number | null;
    net: number | null;
    provider: number | null;
  } | null;
  /** Count of add-on document payments in range (charges with no order row). */
  addonCount: number | null;
  /** Gross USD of those add-on payments — the "unallocated additional-
   *  documentation revenue" the channel view must never absorb. */
  addonGrossUsd: number | null;
}

interface Props {
  from: string;
  to: string;
  rangeLabel: string;
  summary: { total_revenue: number; total_refunded: number; charge_count?: number } | undefined;
  charges: ChargeLike[] | undefined;
  resolutionMap: Record<string, ChargePayoutResolution>;
  /** Reports the bridge verdict + order-basis totals to the Accounts shell. */
  onResult?: (r: BridgeResult) => void;
}

const fmtUsd = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (n: number) =>
  `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AccountsReconciliationBridge({ from, to, rangeLabel, summary, charges, resolutionMap, onResult }: Props) {
  const [rpc, setRpc] = useState<ReconRpcPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.rpc("get_accounts_reconciliation", { p_from: from, p_to: to });
    if (err) setError(err.message || "Failed to load reconciliation");
    else setRpc(data as unknown as ReconRpcPayload);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const recon: AccountsReconciliation | null = useMemo(() => {
    if (!rpc || !summary || !charges) return null;
    return buildAccountsReconciliation({
      charges: charges.map((c) => ({
        payment_intent: c.payment_intent,
        amount: c.amount,
        status: c.status,
        providerDeductedUsd: resolutionToClassification(
          c.payment_intent ? resolutionMap[c.payment_intent] : undefined,
          c.refunded || c.amount_refunded > 0,
        ).deducted,
      })),
      stripeRefundsUsd: summary.total_refunded,
      rpc,
    });
  }, [rpc, summary, charges, resolutionMap]);

  // Lift the verdict + order-basis totals so the header badge and the
  // Reconciliation section read the SAME numbers this panel renders.
  useEffect(() => {
    if (!onResult) return;
    const ob = rpc?.order_basis;
    onResult({
      loading,
      error,
      fullyExplained: recon ? recon.fullyExplained : null,
      orderBasis: ob
        ? {
            paidOrders: ob.paid_orders ?? null,
            gross: ob.gross_usd ?? null,
            refunds: ob.refund_usd ?? null,
            net: ob.net_usd ?? null,
            provider: ob.provider_usd ?? null,
          }
        : null,
      addonCount: rpc?.addon_payments ? rpc.addon_payments.length : null,
      addonGrossUsd: rpc?.addon_payments
        ? Math.round(rpc.addon_payments.reduce((s, a) => s + (a.amount_usd || 0), 0) * 100) / 100
        : null,
    });
  }, [onResult, loading, error, recon, rpc]);

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-scales-3-line text-[#3b6ea5]"></i>Stripe ↔ Orders Reconciliation
            {recon && (
              recon.fullyExplained ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <i className="ri-checkbox-circle-line mr-0.5"></i>Fully explained
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <i className="ri-error-warning-line mr-0.5"></i>Unexplained residual
                </span>
              )
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            The summary cards above count <span className="font-semibold">Stripe payments settled</span> in {rangeLabel} (cash basis);
            Channel Contribution below counts <span className="font-semibold">orders paid</span> in the same range (order basis).
            This bridge itemizes every difference between the two, so both sets of figures tie out.
          </p>
        </div>
        {recon && (
          <button
            type="button"
            onClick={() => setShowDetail((s) => !s)}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            <i className={showDetail ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
            {showDetail ? "Hide bridge detail" : "Show bridge detail"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-gray-500">
          <i className="ri-loader-4-line animate-spin text-xl block mb-2 text-[#3b6ea5]"></i>Loading reconciliation…
        </div>
      ) : error ? (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          <i className="ri-error-warning-line"></i> {error}
        </div>
      ) : !recon ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg">
          Waiting for the Stripe dataset…
        </div>
      ) : (
        <>
          {/* Tie-out tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <TieOutTile
              label="Paid Orders"
              icon="ri-shopping-bag-3-line"
              stripeValue={`${recon.gross.startCount ?? 0} charges`}
              orderValue={`${recon.gross.orderBasisCount ?? 0} orders`}
              deltaText={countDeltaText(recon.gross)}
              ok={(recon.gross.residualCount ?? 0) === 0}
            />
            <TieOutTile
              label="Net Revenue"
              icon="ri-money-dollar-circle-line"
              stripeValue={fmtUsd(recon.net.stripeUsd)}
              orderValue={fmtUsd(recon.net.orderBasisUsd)}
              deltaText={`Δ ${fmtSigned(recon.net.deltaUsd)}`}
              ok={Math.abs(recon.gross.residualUsd) <= 0.01 && Math.abs(recon.refunds.residualUsd) <= 0.01}
            />
            <TieOutTile
              label="Provider Payments"
              icon="ri-stethoscope-line"
              stripeValue={fmtUsd(recon.provider.startUsd)}
              orderValue={fmtUsd(recon.provider.orderBasisUsd)}
              deltaText={`Δ ${fmtSigned(recon.provider.orderBasisUsd - recon.provider.startUsd)}`}
              ok={Math.abs(recon.provider.residualUsd) <= 0.01}
            />
          </div>

          {/* Additional-documentation payments — audited cause of the cash-vs-order
              gap (correction addendum §3). These are real Stripe payments with
              their own payment intent and NO primary order row, so they are
              included in the Stripe cash basis but excluded from the order /
              channel universe. They carry no valid acquisition attribution and
              are NEVER forced into a channel or hidden inside Unknown — they
              stay a truthful, separate reconciliation category. */}
          {rpc && rpc.addon_payments && rpc.addon_payments.length > 0 && (
            <div className="mt-2.5 px-3 py-2.5 bg-[#eef4fa] border border-[#d6e4f0] rounded-xl">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-[#3b6ea5]">
                  <i className="ri-file-add-line mr-1"></i>
                  Unallocated additional-documentation revenue — {rangeLabel}
                </span>
                <span className="text-xs font-extrabold text-[#3b6ea5] tabular-nums">
                  {rpc.addon_payments.length} payment{rpc.addon_payments.length === 1 ? "" : "s"} · {fmtUsd(rpc.addon_payments.reduce((s, a) => s + (a.amount_usd || 0), 0))}
                </span>
              </div>
              <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                Counted in the Stripe cash basis above; excluded from the paid-order universe that Channel
                Contribution uses. Reconciliation effect: the gross bridge subtracts this amount on the way
                from Stripe gross to order-basis gross. Not attributed to any acquisition channel — there is
                no valid attribution signal for an add-on purchase, so it is reported here instead of
                being mixed into Unknown orders.
              </p>
            </div>
          )}

          {/* Bridge detail */}
          {showDetail && (
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
              <BridgeTable
                title="Gross revenue"
                startLabel="Stripe gross (settled charges)"
                endLabel="Order-basis gross"
                section={recon.gross}
                showCounts
              />
              <BridgeTable
                title="Refunds"
                startLabel="Stripe refunds (by refund date)"
                endLabel="Order-basis refunds"
                section={recon.refunds}
              />
              <BridgeTable
                title="Provider payments"
                startLabel="Stripe-basis deductions"
                endLabel="Order-basis provider payments"
                section={recon.provider}
              />
            </div>
          )}

          <p className="mt-3 text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-2">
            <i className="ri-information-line mr-1"></i>
            Neither basis is wrong — Stripe answers “how much money moved in this range”, orders answer “what did the
            orders we sold in this range earn”. Additional-document payments are real revenue but are not orders, so they
            appear only on the Stripe side. Stripe fees remain a company-level figure and are never split per order or channel.
          </p>
        </>
      )}
    </div>
  );
}

function countDeltaText(gross: BridgeSection): string {
  const stripeN = gross.startCount ?? 0;
  const orderN = gross.orderBasisCount ?? 0;
  const d = orderN - stripeN;
  if (d === 0) return "Δ 0";
  return `Δ ${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

function TieOutTile({ label, icon, stripeValue, orderValue, deltaText, ok }: {
  label: string;
  icon: string;
  stripeValue: string;
  orderValue: string;
  deltaText: string;
  ok: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
          <i className={`${icon} text-[#3b6ea5] text-sm`}></i>{label}
        </span>
        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${ok
          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
          : "text-amber-700 bg-amber-50 border-amber-200"}`}>
          {deltaText}{ok ? " · explained" : " · check detail"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Stripe basis</p>
          <p className="text-sm font-extrabold text-gray-900 tabular-nums">{stripeValue}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Order basis</p>
          <p className="text-sm font-extrabold text-gray-900 tabular-nums">{orderValue}</p>
        </div>
      </div>
    </div>
  );
}

function BridgeTable({ title, startLabel, endLabel, section, showCounts }: {
  title: string;
  startLabel: string;
  endLabel: string;
  section: BridgeSection;
  showCounts?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const activeLines = section.lines.filter((l) => Math.abs(l.amountUsd) > 0.005 || (l.count ?? 0) > 0);
  const residualBad = Math.abs(section.residualUsd) > 0.01 || (section.residualCount ?? 0) !== 0;
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wider">{title}</p>
      </div>
      <div className="text-xs divide-y divide-gray-50">
        <BridgeRow label={startLabel} amount={section.startUsd} count={showCounts ? section.startCount : null} strong />
        {activeLines.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-gray-400">No differences in this range.</div>
        )}
        {activeLines.map((l) => (
          <div key={l.key}>
            <button
              type="button"
              onClick={() => setOpenKey((k) => (k === l.key ? null : l.key))}
              disabled={l.items.length === 0}
              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left ${l.items.length > 0 ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
            >
              <span className="text-gray-600 flex items-center gap-1 min-w-0">
                {l.items.length > 0 && (
                  <i className={`${openKey === l.key ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"} text-gray-300 shrink-0`}></i>
                )}
                <span className="truncate">{l.label}</span>
                {showCounts && l.count != null && l.count > 0 && (
                  <span className="shrink-0 text-[10px] text-gray-400 font-semibold">×{l.count}</span>
                )}
              </span>
              <span className={`shrink-0 tabular-nums font-semibold ${l.amountUsd < 0 ? "text-rose-500" : l.amountUsd > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                {fmtSigned(l.amountUsd)}
              </span>
            </button>
            {openKey === l.key && l.items.length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {l.items.map((it, i) => (
                  <span key={`${it.id}-${i}`} className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                    {it.id} · {fmtUsd(it.amountUsd)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <BridgeRow label={endLabel} amount={section.orderBasisUsd} count={showCounts ? section.orderBasisCount : null} strong accent />
        {residualBad && (
          <div className="px-3 py-1.5 flex items-center justify-between gap-2 bg-amber-50/60">
            <span className="text-amber-700 font-semibold">
              <i className="ri-error-warning-line mr-1"></i>Unexplained residual
              {showCounts && (section.residualCount ?? 0) !== 0 ? ` (${section.residualCount} orders)` : ""}
            </span>
            <span className="tabular-nums font-bold text-amber-700">{fmtSigned(section.residualUsd)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BridgeRow({ label, amount, count, strong, accent }: {
  label: string;
  amount: number;
  count?: number | null;
  strong?: boolean;
  accent?: boolean;
}): ReactNode {
  return (
    <div className={`px-3 py-2 flex items-center justify-between gap-2 ${accent ? "bg-[#3b6ea5]/5" : ""}`}>
      <span className={`${strong ? "font-bold" : ""} ${accent ? "text-[#3b6ea5]" : "text-gray-700"} flex items-center gap-1`}>
        {label}
        {count != null && <span className="text-[10px] text-gray-400 font-semibold">×{count}</span>}
      </span>
      <span className={`tabular-nums ${strong ? "font-extrabold" : "font-semibold"} ${accent ? "text-[#3b6ea5]" : "text-gray-900"}`}>
        {fmtUsd(amount)}
      </span>
    </div>
  );
}
