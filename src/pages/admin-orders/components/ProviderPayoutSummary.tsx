// ProviderPayoutSummary — RA-PAYOUT-DISPLAY-001
//
// Shows what the assigned provider is owed for ONE order, inline in the
// Overview → Order Details grid.
//
// READ-ONLY. This component never writes to `doctor_earnings`. The owner's
// manual payout audit is in progress, so the ledger is authoritative and
// untouchable; this is a reader that must faithfully report it and nothing more.
//
// THE BUG THIS EXISTS TO PREVENT
// ------------------------------
// A superseded or duplicate earning is CANCELLED, not deleted, so one order can
// carry several cancelled rows next to the single live row. Summing every row
// showed a payout that was never owed:
//
//   PT-PSDRQPYL11K → base $30 (paid) + base $30 (cancelled) + base $30
//                    (cancelled) + additional_documentation $30 (paid)
//                    naive total $120 · true total $60
//   PT-MQNHH9W3    → base $25 (cancelled) + base $25 (paid) +
//                    additional_documentation $25 (paid)
//                    naive total $75 · true total $50
//
// Payout is money-facing, so cancelled rows are excluded TWICE — once in the
// query, once again before summing. If a refactor drops one filter the other
// still holds. See the matching pair in PaymentHistoryTab.tsx.
//
// PAYOUT IS NEVER DERIVED FROM FILE COUNT. It is the sum of ledger rows. Three
// uploaded files on one RA service is still exactly one RA earning, so this
// component cannot multiply a payout by counting documents — it never sees them.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface EarningRow {
  id: string;
  earning_type: string | null;
  doctor_amount: number | null;
  status: string | null;
}

export default function ProviderPayoutSummary({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<EarningRow[] | null>(null);

  const load = useCallback(async () => {
    // DEFENCE 1 OF 2 — never load a void row.
    const { data } = await supabase
      .from("doctor_earnings")
      .select("id, earning_type, doctor_amount, status")
      .eq("order_id", orderId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    setRows((data as EarningRow[]) ?? []);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Still loading — render nothing rather than flashing "Not recorded", which
  // would read as a definite "this provider is owed nothing".
  if (rows === null) return null;

  // DEFENCE 2 OF 2 — re-filter in memory in case the query filter is ever lost.
  // Written as an explicit literal comparison (not a Set lookup) so both a human
  // reader and check-provider-payout-display.mjs can see the defence directly.
  const live = rows.filter((r) => (r.status ?? "").toLowerCase() !== "cancelled");

  if (live.length === 0) {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Provider Payout</p>
        <p className="text-sm font-semibold text-gray-400">Not recorded</p>
      </div>
    );
  }

  // RA and paid Additional Documentation are separate ledger concepts but one
  // line to an operator: both are "the extra RA work". Everything else (legacy
  // rows carry a null earning_type) is the base order payout.
  const isExtra = (t: string | null) => t === "additional_documentation" || t === "ra_completion";
  const baseRows = live.filter((r) => !isExtra(r.earning_type));
  const extraRows = live.filter((r) => isExtra(r.earning_type));

  const sum = (list: EarningRow[]) =>
    list.reduce((acc, r) => acc + (typeof r.doctor_amount === "number" ? r.doctor_amount : 0), 0);

  const baseTotal = sum(baseRows);
  const extraTotal = sum(extraRows);
  const total = baseTotal + extraTotal;

  // An active earning with no amount yet is NOT $0 — the rate simply has not
  // been set. Showing "$0" would misreport a real debt as nothing owed.
  const rateUnset = live.some((r) => r.doctor_amount == null);
  const showBreakdown = baseRows.length > 0 && extraRows.length > 0;

  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">Provider Payout</p>
      {rateUnset && total === 0 ? (
        <p className="text-sm font-semibold text-amber-600">Rate not set</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-violet-700">${total}</p>
          {showBreakdown && (
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
              Base ${baseTotal} · Add’l Doc ${extraTotal}
              {rateUnset ? " · rate pending" : ""}
            </p>
          )}
          {!showBreakdown && rateUnset && (
            <p className="text-[11px] text-amber-600 mt-0.5 leading-snug">Some rates pending</p>
          )}
        </>
      )}
    </div>
  );
}
