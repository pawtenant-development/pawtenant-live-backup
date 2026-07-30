// ADMIN-ORDER-PENDING-DELIVERY-REOPEN-NOTIFICATIONS-REALTIME-001 §4
//
// Admin control for `provider_document_approval_gate_enabled` — the "Employee
// Letter Quality Check".
//
// This panel is a REMOTE CONTROL, not the enforcement point. The gate is
// enforced inside auto_deliver_order_document(), which re-checks it on every
// call, and authorisation lives in set_provider_approval_gate(), which raises
// insufficient_privilege unless is_chat_admin(). A user who hides this panel in
// devtools, or who calls the RPC directly, gains nothing.
//
// The read is deliberately fail-CLOSED in the same direction as the server: any
// error renders as "enabled", because showing "off" when we could not confirm it
// would tell an operator that letters are auto-delivering when they may not be.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function LetterQualityCheckPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("is_provider_approval_gate_enabled");
    // Unknown => assume ON, matching the server's fail-closed reader.
    setEnabled(error ? true : data !== false);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const apply = async (next: boolean) => {
    setSaving(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("set_provider_approval_gate", { p_enabled: next });
    if (error) {
      // The RPC raises insufficient_privilege for non-owner staff; surface that
      // as a permission problem rather than a generic failure.
      const denied = /insufficient|not authorised|permission/i.test(error.message);
      setMsg({
        ok: false,
        text: denied
          ? "Only an owner or admin manager can change this setting."
          : `Could not save: ${error.message}`,
      });
      setSaving(false);
      return;
    }
    const res = (data ?? {}) as { enabled?: boolean };
    setEnabled(res.enabled ?? next);
    setMsg({
      ok: true,
      text: next
        ? "Employee approval is now required before any letter reaches a customer."
        : "Letters are now delivered automatically. Documents already awaiting review were NOT released.",
    });
    setConfirmingDisable(false);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-gray-500">
        <i className="ri-loader-4-line animate-spin"></i>Loading current setting…
      </div>
    );
  }

  const isOn = enabled === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 py-4 bg-white border border-gray-200 rounded-xl">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">Employee Letter Quality Check</p>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                isOn ? "bg-teal-50 text-teal-700 border border-teal-200" : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {isOn ? "On" : "Off"}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            When enabled, provider-submitted letters require employee approval before customer delivery.
          </p>
        </div>

        {/* Enabling is safe and immediate. DISABLING removes a customer-facing
            safety check, so it asks first — an accidental click here would start
            auto-delivering unreviewed letters. */}
        {isOn ? (
          confirmingDisable ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setConfirmingDisable(false)}
                disabled={saving}
                className="whitespace-nowrap px-3 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void apply(false)}
                disabled={saving}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                {saving ? <><i className="ri-loader-4-line animate-spin"></i>Turning off…</> : <>Yes, turn off</>}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDisable(true)}
              disabled={saving}
              className="whitespace-nowrap flex-shrink-0 px-4 py-2 border border-amber-200 text-amber-700 bg-amber-50 text-xs font-bold rounded-lg hover:bg-amber-100 cursor-pointer transition-colors disabled:opacity-50"
            >
              Turn off
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => void apply(true)}
            disabled={saving}
            className="whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors disabled:opacity-50"
          >
            {saving ? <><i className="ri-loader-4-line animate-spin"></i>Turning on…</> : <><i className="ri-shield-check-line"></i>Turn on</>}
          </button>
        )}
      </div>

      {confirmingDisable && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800">
          <i className="ri-alert-line mt-0.5"></i>
          <span>
            Turning this off means the next letter a provider submits goes straight to the customer with no
            employee review. Letters already waiting for approval stay where they are — they are not released.
          </span>
        </div>
      )}

      {!isOn && !confirmingDisable && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800">
          <i className="ri-alert-line mt-0.5"></i>
          <span>
            Provider letters are being delivered to customers automatically, with no employee review. Each
            automatic delivery is recorded in the order&apos;s audit timeline.
          </span>
        </div>
      )}

      {msg && (
        <div
          className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${
            msg.ok ? "bg-[#e8f0f9] border-[#b8cce4] text-[#3b6ea5]" : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <i className={msg.ok ? "ri-checkbox-circle-fill mt-0.5" : "ri-error-warning-line mt-0.5"}></i>
          {msg.text}
        </div>
      )}
    </div>
  );
}
