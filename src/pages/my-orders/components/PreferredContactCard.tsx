// PreferredContactCard — OPTIONAL "preferred provider contact time" preference.
// CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001.
//
// Saves via the scoped `save-contact-preference` edge function (writes only the
// preferred_provider_contact_* columns on the caller's own order). The assigned
// provider sees it read-only in their portal.
//
// Compliance: this is a PREFERENCE, never a scheduled/guaranteed call. Copy avoids
// "provider will call at this time" / "guaranteed call" / "appointment confirmed".

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

const WINDOWS: Array<{ value: string; label: string }> = [
  { value: "morning", label: "Morning (8am–12pm)" },
  { value: "afternoon", label: "Afternoon (12pm–5pm)" },
  { value: "evening", label: "Evening (5pm–8pm)" },
  { value: "any", label: "Any time is fine" },
];

export interface ContactPrefOrder {
  id: string;
  status: string;
  doctor_status?: string | null;
  payment_intent_id?: string | null;
  refunded_at?: string | null;
  preferred_provider_contact_date?: string | null;
  preferred_provider_contact_window?: string | null;
  preferred_provider_contact_note?: string | null;
  preferred_provider_contact_timezone?: string | null;
}

function detectTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export default function PreferredContactCard({ order }: { order: ContactPrefOrder }) {
  const [date, setDate] = useState(order.preferred_provider_contact_date ?? "");
  const [windowVal, setWindowVal] = useState(order.preferred_provider_contact_window ?? "");
  const [note, setNote] = useState(order.preferred_provider_contact_note ?? "");
  const [saving, setSaving] = useState(false);
  const [savedTz, setSavedTz] = useState(order.preferred_provider_contact_timezone ?? "");
  const [saved, setSaved] = useState(
    !!(order.preferred_provider_contact_window || order.preferred_provider_contact_date || order.preferred_provider_contact_note)
  );
  const [error, setError] = useState("");

  const isPaid = !!order.payment_intent_id;
  const closed = order.status === "cancelled" || order.status === "refunded" || !!order.refunded_at
    || order.doctor_status === "patient_notified";
  if (!isPaid || closed) return null;

  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  async function save() {
    if (!date && !windowVal && !note.trim()) {
      setError("Choose a time window, date, or add a note first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Your session has expired — please sign in again.");
      const tz = detectTz();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/save-contact-preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: order.id,
          date: date || null,
          window: windowVal || null,
          note: note.trim() || null,
          timezone: tz || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error ?? `Save failed (HTTP ${res.status})`);
      setSavedTz(tz);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your preference.");
    } finally {
      setSaving(false);
    }
  }

  const windowLabel = WINDOWS.find((w) => w.value === windowVal)?.label;

  return (
    <div className="mt-4 rounded-xl border border-[#e2e8f0] bg-[#ffffff] p-4">
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <p className="text-sm font-bold text-[#172033] flex items-center gap-1.5">
          <i className="ri-calendar-schedule-line text-[#3b6ea5]"></i>Preferred contact time
          <span className="text-[10px] font-bold text-[#64748b] bg-[#eef2f7] px-1.5 py-0.5 rounded-full">Optional</span>
        </p>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669]">
            <i className="ri-check-line"></i>Preference saved
          </span>
        )}
      </div>
      <p className="text-[12px] text-[#5F6B7A] leading-relaxed mb-3">
        If your provider needs to reach you, let them know when you're usually available. We'll share this with your
        provider to help coordinate review timing. <span className="font-semibold">Your review can continue even if you
        don't choose a time</span> — this isn't a scheduled appointment.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-bold text-[#172033] mb-1">Best time of day</label>
          <select
            value={windowVal}
            onChange={(e) => { setWindowVal(e.target.value); setSaved(false); }}
            className="w-full px-3 py-2 text-xs bg-white border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#3b6ea5] cursor-pointer"
          >
            <option value="">Select a time window…</option>
            {WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-[#172033] mb-1">Preferred date (optional)</label>
          <input
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => { setDate(e.target.value); setSaved(false); }}
            className="w-full px-3 py-2 text-xs bg-white border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#3b6ea5]"
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-[11px] font-bold text-[#172033] mb-1">Anything else? (optional)</label>
        <textarea
          value={note}
          maxLength={300}
          rows={2}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="e.g. Please text before calling, or weekends work best."
          className="w-full px-3 py-2 text-xs bg-white border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#3b6ea5] resize-none"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer transition-colors"
        >
          {saving ? <><i className="ri-loader-4-line animate-spin"></i>Saving…</> : <><i className="ri-save-3-line"></i>{saved ? "Update preference" : "Save preference"}</>}
        </button>
        {saved && (windowLabel || date) && (
          <span className="text-[11px] text-[#5F6B7A]">
            {windowLabel ?? ""}{windowLabel && date ? " · " : ""}{date || ""}{savedTz ? ` · ${savedTz}` : ""}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><i className="ri-error-warning-line"></i>{error}</p>}
    </div>
  );
}
