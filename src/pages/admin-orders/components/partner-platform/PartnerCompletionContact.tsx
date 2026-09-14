// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — the partner's completion
// notification contact (Settings → Notifications & contacts).
//
// When clinical work on one of the partner's orders is completed, ONLY this
// address is emailed — with the PawTenant order id, the partner's reference,
// the status and the portal path. Never the customer. Leaving it empty sends
// nothing (API partners rely on signed webhooks instead).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { type PartnerOrg, Notice } from "./shared";

export default function PartnerCompletionContact({ partner }: { partner: PartnerOrg | null }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (partnerId: string) => {
    const { data } = await supabase
      .from("partner_organizations")
      .select("completion_notification_email")
      .eq("id", partnerId)
      .maybeSingle();
    const current = (data as { completion_notification_email?: string | null } | null)?.completion_notification_email ?? "";
    setValue(current);
    setSaved(current);
  }, []);

  useEffect(() => {
    if (partner) void load(partner.id);
    else { setValue(""); setSaved(null); }
  }, [partner, load]);

  const save = async () => {
    if (!partner) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { error: err } = await supabase.rpc("partner_admin_set_completion_contact", {
      p_partner_id: partner.id,
      p_email: value.trim() || null,
    });
    if (err) {
      setError(err.message.includes("invalid_email") ? "Enter a valid email address." : err.message);
    } else {
      setSaved(value.trim());
      setNotice(value.trim() ? "Completion notifications will go to this contact." : "Completion notifications are off for this partner.");
    }
    setBusy(false);
  };

  if (!partner) return <p className="text-sm text-gray-500">Select a partner first.</p>;

  return (
    <div>
      <Notice notice={notice} error={error} />
      <p className="mb-3 text-xs text-gray-500">
        When a provider completes the clinical work on one of {partner.display_name}&apos;s orders, this
        address receives a short notice: the order id, {partner.display_name}&apos;s own reference, the
        status and a link to the partner portal. It never includes customer details, questionnaire
        content, provider identity or pricing — and the customer is never emailed by PawTenant.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-gray-600">Completion notification email</span>
          <input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="orders@partner.example"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || (saved ?? "") === value.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save contact"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        {saved ? `Currently: ${saved}` : "Currently: no completion notifications for this partner."}
      </p>
    </div>
  );
}
