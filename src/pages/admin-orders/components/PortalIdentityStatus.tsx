// PortalIdentityStatus — CUSTOMER-PORTAL-ORDER-IDENTITY-LINK-INTEGRITY-001
//
// Admin "Customer View" searches by email, so it happily renders an order and
// its documents even when the REAL authenticated customer cannot see either.
// That is exactly how PT-MQRIJKGN looked healthy in Admin while the customer
// got "No orders found".
//
// This panel answers the question the email preview cannot: does the
// authenticated portal show this order? Every judgement is made server-side by
// admin_order_portal_identity(), which evaluates the same normalized predicate
// the RLS policy uses — nothing here is inferred in the browser.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type IdentityStatus =
  | "linked"
  | "unlinked_repairable"
  | "conflicting_identity"
  | "no_auth_account"
  | "ambiguous_match"
  | "no_usable_email";

interface IdentityRow {
  normalized_order_email: string | null;
  order_user_id: string | null;
  candidate_user_id: string | null;
  candidate_count: number;
  linked_user_email: string | null;
  status: IdentityStatus;
  visible_to_customer_today: boolean;
}

const PRESENTATION: Record<IdentityStatus, { label: string; tone: string; blurb: string }> = {
  linked: {
    label: "Linked to the customer's account",
    tone: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blurb: "The authenticated portal loads this order by account ownership.",
  },
  unlinked_repairable: {
    label: "Not linked — safe to repair",
    tone: "bg-amber-50 border-amber-200 text-amber-800",
    blurb: "Exactly one verified account owns this order's email. Linking is a safe, single-click repair.",
  },
  conflicting_identity: {
    label: "Conflicting identity — engineering review",
    tone: "bg-red-50 border-red-200 text-red-800",
    blurb: "This order is linked to an account whose email does not match the order. It will NOT be changed automatically.",
  },
  no_auth_account: {
    label: "No customer account exists",
    tone: "bg-slate-50 border-slate-200 text-slate-700",
    blurb: "Nobody can sign in to see this order yet. It links itself the moment the customer creates or verifies an account.",
  },
  ambiguous_match: {
    label: "Ambiguous — multiple accounts match",
    tone: "bg-red-50 border-red-200 text-red-800",
    blurb: "More than one verified account owns this email. Repair is disabled; a human must decide.",
  },
  no_usable_email: {
    label: "Order has no usable email",
    tone: "bg-slate-50 border-slate-200 text-slate-700",
    blurb: "This order can never be matched to an account automatically.",
  },
};

export default function PortalIdentityStatus({
  orderId,
  confirmationId,
  onRepaired,
}: {
  orderId: string;
  confirmationId: string;
  onRepaired?: () => void;
}) {
  const [row, setRow] = useState<IdentityRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("admin_order_portal_identity", { p_order_id: orderId });
    if (error) { setErr(error.message); return; }
    setRow(data as IdentityRow);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const repair = async () => {
    setBusy(true);
    setResult(null);
    // The candidate is only ever a cross-check: the RPC re-resolves the real
    // owner from the order's own email and rejects a mismatch.
    const { data, error } = await supabase.rpc("admin_repair_order_portal_link", {
      p_order_id: orderId,
      p_expected_user: row?.candidate_user_id ?? null,
    });
    setBusy(false);
    setConfirming(false);
    if (error) { setResult(`Failed: ${error.message}`); return; }
    const res = data as { ok?: boolean; reason?: string };
    setResult(res?.ok ? "Linked." : `Refused: ${res?.reason ?? "unknown"}`);
    await load();
    if (res?.ok) onRepaired?.();
  };

  if (err) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4">
        <p className="text-xs font-semibold text-red-800">Portal identity status unavailable — {err}</p>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 mb-4">
        <p className="text-xs text-gray-500">Checking portal identity…</p>
      </div>
    );
  }

  const p = PRESENTATION[row.status] ?? PRESENTATION.no_usable_email;
  const canRepair = row.status === "unlinked_repairable";

  return (
    <div className={`rounded-xl border px-4 py-3 mb-4 ${p.tone}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">Portal identity status</p>
          <p className="text-sm font-extrabold mt-0.5">{p.label}</p>
          <p className="text-xs mt-1 opacity-90">{p.blurb}</p>
        </div>
        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
            row.visible_to_customer_today ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {row.visible_to_customer_today
            ? "Customer CAN see this order"
            : "Customer CANNOT see this order"}
        </span>
      </div>

      {/* UUIDs and email addresses must WRAP, never ellipsize: a half-shown
          user_id is worse than useless when an operator is deciding whether an
          identity conflict is real. `truncate` clipped 4 of 5 values at 390px. */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-[11px]">
        <div className="flex justify-between items-start gap-3 min-w-0">
          <dt className="opacity-70 flex-shrink-0">Order</dt>
          <dd className="font-mono break-all text-right">{confirmationId}</dd>
        </div>
        <div className="flex justify-between items-start gap-3 min-w-0">
          <dt className="opacity-70 flex-shrink-0">Normalized order email</dt>
          <dd className="font-mono break-all text-right">{row.normalized_order_email ?? "—"}</dd>
        </div>
        <div className="flex justify-between items-start gap-3 min-w-0">
          <dt className="opacity-70 flex-shrink-0">orders.user_id</dt>
          <dd className="font-mono break-all text-right">{row.order_user_id ?? "NULL"}</dd>
        </div>
        <div className="flex justify-between items-start gap-3 min-w-0">
          <dt className="opacity-70 flex-shrink-0">Matching auth user</dt>
          <dd className="font-mono break-all text-right">{row.candidate_user_id ?? "—"}</dd>
        </div>
        <div className="flex justify-between items-start gap-3 min-w-0">
          <dt className="opacity-70 flex-shrink-0">Verified accounts on this email</dt>
          <dd className="font-mono text-right">{row.candidate_count}</dd>
        </div>
        {row.status === "conflicting_identity" && (
          <div className="flex justify-between items-start gap-3 min-w-0">
            <dt className="opacity-70 flex-shrink-0">Linked account's email</dt>
            <dd className="font-mono break-all text-right">{row.linked_user_email ?? "—"}</dd>
          </div>
        )}
      </dl>

      {(canRepair || result) && (
        <div className="mt-3 pt-3 border-t border-current/15">
          {!confirming && canRepair && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
            >
              Repair Customer Portal Link
            </button>
          )}
          {confirming && (
            <div className="rounded-lg bg-white/70 border border-current/20 p-3">
              <p className="text-xs font-bold mb-1">Link this order to the verified customer account for this email?</p>
              <ul className="text-[11px] space-y-0.5 mb-2 opacity-90 break-all">
                <li>Order <span className="font-mono">{confirmationId}</span></li>
                <li>Email <span className="font-mono">{row.normalized_order_email}</span></li>
                <li>Account <span className="font-mono">{row.candidate_user_id}</span></li>
                <li>Current owner <span className="font-mono">{row.order_user_id ?? "NULL"}</span></li>
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void repair()}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy ? "Linking…" : "Confirm link"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {result && <p className="text-xs font-bold mt-2">{result}</p>}
        </div>
      )}
    </div>
  );
}
