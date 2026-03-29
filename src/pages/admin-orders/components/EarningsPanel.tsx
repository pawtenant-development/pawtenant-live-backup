import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import StateBreakdownChart from "./StateBreakdownChart";

interface Earning {
  id: string;
  doctor_user_id: string;
  doctor_name: string | null;
  doctor_email: string | null;
  order_id: string | null;
  confirmation_id: string | null;
  patient_name: string | null;
  patient_state: string | null;
  order_amount: number | null;
  doctor_amount: number | null;
  status: string;
  paid_at: string | null;
  notes: string | null;
  payment_reference: string | null;
  created_at: string;
}

interface DoctorProfile {
  user_id: string;
  full_name: string;
  email: string | null;
  per_order_rate: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-[#e8f5f1] text-[#1a5c4f] border-[#b8ddd5]",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const LAST_REMINDER_KEY = "pawtenant_last_payout_reminder";

function EarningRow({
  earning,
  selected,
  onToggleSelect,
  onUpdated,
  orderRefunded,
}: {
  earning: Earning;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdated: (updated: Earning) => void;
  orderRefunded?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(earning.doctor_amount ?? ""));
  const [notes, setNotes] = useState(earning.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [payRef, setPayRef] = useState("");

  const handleSave = async () => {
    setSaving(true);
    const amtNum = amount ? parseInt(amount, 10) : null;
    const { error } = await supabase
      .from("doctor_earnings")
      .update({ doctor_amount: amtNum, notes })
      .eq("id", earning.id);
    setSaving(false);
    if (!error) {
      onUpdated({ ...earning, doctor_amount: amtNum, notes });
      setEditing(false);
    }
  };

  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("doctor_earnings")
      .update({ status: "paid", paid_at: now, payment_reference: payRef.trim() || null })
      .eq("id", earning.id);
    setMarkingPaid(false);
    if (!error) {
      onUpdated({ ...earning, status: "paid", paid_at: now, payment_reference: payRef.trim() || null });
      setShowPayConfirm(false);
      setPayRef("");
    }
  };

  const handleMarkPending = async () => {
    const { error } = await supabase
      .from("doctor_earnings")
      .update({ status: "pending", paid_at: null, payment_reference: null })
      .eq("id", earning.id);
    if (!error) onUpdated({ ...earning, status: "pending", paid_at: null, payment_reference: null });
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${earning.status === "paid" ? "border-[#b8ddd5] bg-[#f8fdfc]" : selected ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start gap-3 px-5 py-4">
        {/* Checkbox — only for pending */}
        {earning.status === "pending" && (
          <div className="flex-shrink-0 pt-0.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(earning.id)}
              className="w-4 h-4 rounded border-gray-300 accent-[#1a5c4f] cursor-pointer"
            />
          </div>
        )}
        {earning.status !== "pending" && <div className="w-4 flex-shrink-0" />}

        <div className="flex-shrink-0">
          <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full">
            <i className="ri-stethoscope-line text-gray-500 text-sm"></i>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-gray-900">{earning.doctor_name ?? "Unknown Doctor"}</p>
              <p className="text-xs text-gray-400">{earning.doctor_email ?? ""}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {orderRefunded && (
                <span
                  title="The customer was refunded AFTER the letter was issued. The provider's earnings are PROTECTED and should still be paid."
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-orange-50 text-orange-700 border-orange-300 cursor-help"
                >
                  <i className="ri-refund-line" style={{ fontSize: "10px" }}></i>Refunded — Provider Still Paid
                </span>
              )}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_STYLES[earning.status] ?? STATUS_STYLES.pending}`}>
                <i className={earning.status === "paid" ? "ri-checkbox-circle-fill" : earning.status === "cancelled" ? "ri-close-circle-line" : "ri-time-line"}></i>
                {earning.status.charAt(0).toUpperCase() + earning.status.slice(1)}
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <i className="ri-hashtag text-gray-400"></i>
              <span className="font-mono font-semibold text-gray-700">{earning.confirmation_id ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <i className="ri-user-line text-gray-400"></i>
              <span>{earning.patient_name ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <i className="ri-map-pin-2-line text-gray-400"></i>
              <span>{earning.patient_state ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <i className="ri-price-tag-3-line text-gray-400"></i>
              <span>Order: <strong className="text-gray-700">${earning.order_amount ?? "—"}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <i className="ri-money-dollar-circle-line text-[#1a5c4f]"></i>
              <span className={`font-bold ${earning.doctor_amount != null ? "text-[#1a5c4f]" : "text-gray-400"}`}>
                Doctor gets: {earning.doctor_amount != null ? `$${earning.doctor_amount}` : "Not set"}
              </span>
            </div>
          </div>
          {/* Paid info with reference */}
          {earning.status === "paid" && earning.paid_at && (
            <p className="mt-1.5 text-xs text-[#1a5c4f] flex items-center gap-1.5 flex-wrap">
              <i className="ri-checkbox-circle-fill"></i>
              <span>Paid on {new Date(earning.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              {earning.payment_reference && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f5f1] border border-[#b8ddd5] rounded-full font-semibold">
                  <i className="ri-bank-card-line text-xs"></i>
                  {earning.payment_reference}
                </span>
              )}
            </p>
          )}
          {earning.notes && !editing && (
            <p className="mt-1.5 text-xs text-gray-500 italic">&quot;{earning.notes}&quot;</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
        {!editing && !showPayConfirm && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="whitespace-nowrap flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-[#1a5c4f] cursor-pointer transition-colors"
            >
              <i className="ri-edit-line"></i> {earning.doctor_amount != null ? "Edit Amount" : "Set Amount"}
            </button>
            {earning.status === "pending" && (
              <button
                type="button"
                onClick={() => { if (earning.doctor_amount != null) setShowPayConfirm(true); }}
                disabled={earning.doctor_amount == null}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-40 cursor-pointer"
              >
                <i className="ri-checkbox-circle-line"></i>
                Mark as Paid
              </button>
            )}
            {earning.status === "paid" && (
              <button
                type="button"
                onClick={handleMarkPending}
                className="whitespace-nowrap flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer transition-colors"
              >
                <i className="ri-arrow-go-back-line"></i> Revert to Pending
              </button>
            )}
            {earning.doctor_amount == null && earning.status === "pending" && (
              <span className="text-xs text-orange-500 flex items-center gap-1">
                <i className="ri-alert-line"></i> Set amount before marking paid
              </span>
            )}
          </div>
        )}

        {/* Pay confirmation inline form */}
        {showPayConfirm && (
          <div className="flex items-center gap-3 flex-wrap w-full">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-bank-card-line text-[#1a5c4f] text-sm"></i>
              </div>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleMarkPaid(); if (e.key === "Escape") { setShowPayConfirm(false); setPayRef(""); } }}
                placeholder='Payment method/ref — e.g. "Zelle", "Check #1234" (optional)'
                className="flex-1 px-3 py-1.5 border border-[#b8ddd5] rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMarkPaid}
                disabled={markingPaid}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-60 cursor-pointer"
              >
                {markingPaid ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-checkbox-circle-line"></i>}
                Confirm Payment
              </button>
              <button
                type="button"
                onClick={() => { setShowPayConfirm(false); setPayRef(""); }}
                className="whitespace-nowrap text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Edit amount + notes */}
        {editing && (
          <div className="flex items-center gap-3 flex-wrap w-full">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 font-semibold whitespace-nowrap">Doctor payout: $</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#1a5c4f]"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)..."
                className="flex-1 min-w-[160px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-[#17504a] disabled:opacity-60"
              >
                {saving ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-save-line"></i>}
                Save
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setAmount(String(earning.doctor_amount ?? "")); setNotes(earning.notes ?? ""); }}
                className="whitespace-nowrap text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function exportToCSV(rows: Earning[], filename: string) {
  const headers = ["Confirmation ID", "Doctor", "Patient Name", "State", "Order Amount", "Doctor Amount", "Status", "Paid Date", "Payment Reference", "Notes"];
  const escape = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csvRows = rows.map((e) => [
    e.confirmation_id,
    e.doctor_name,
    e.patient_name,
    e.patient_state,
    e.order_amount,
    e.doctor_amount,
    e.status,
    e.paid_at ? new Date(e.paid_at).toLocaleDateString("en-US") : "",
    e.payment_reference,
    e.notes,
  ].map(escape).join(","));
  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EarningsPanel() {
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [refundedOrderIds, setRefundedOrderIds] = useState<Set<string>>(new Set());
  const [refundedConfirmIds, setRefundedConfirmIds] = useState<Set<string>>(new Set());
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarkingPaid, setBulkMarkingPaid] = useState(false);
  const [bulkPayRef, setBulkPayRef] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  // Payout reminder
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [lastReminderSent, setLastReminderSent] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LAST_REMINDER_KEY);
    if (stored) setLastReminderSent(stored);
  }, []);

  const loadEarnings = useCallback(async () => {
    const [earningsRes, profilesRes, completedOrdersRes] = await Promise.all([
      supabase.from("doctor_earnings").select("*").order("created_at", { ascending: false }),
      supabase
        .from("doctor_profiles")
        .select("user_id, full_name, email, per_order_rate")
        .order("full_name"),
      supabase
        .from("orders")
        .select("id, confirmation_id, status, refunded_at")
        .eq("doctor_status", "patient_notified"),
    ]);

    const allEarnings = (earningsRes.data as Earning[]) ?? [];
    const profileList = (profilesRes.data as DoctorProfile[]) ?? [];

    // Build set of completed order IDs and confirmation IDs
    type CompletedOrderRow = { id: string; confirmation_id: string; status: string; refunded_at: string | null };
    const completedRows = (completedOrdersRes.data ?? []) as CompletedOrderRow[];
    const completedOrderIds = new Set(completedRows.map((o) => o.id));
    const completedConfirmIds = new Set(completedRows.map((o) => o.confirmation_id));

    // Track which of those completed orders were later refunded → provider still gets paid
    const newRefundedOrderIds = new Set(completedRows.filter((o) => o.status === "refunded" || !!o.refunded_at).map((o) => o.id));
    const newRefundedConfirmIds = new Set(completedRows.filter((o) => o.status === "refunded" || !!o.refunded_at).map((o) => o.confirmation_id));
    setRefundedOrderIds(newRefundedOrderIds);
    setRefundedConfirmIds(newRefundedConfirmIds);

    // Only show earnings for completed orders (letter delivered)
    const completedEarnings = allEarnings.filter((e) => {
      // If no order reference, keep it (manually created)
      if (!e.order_id && !e.confirmation_id) return true;
      if (e.order_id && completedOrderIds.has(e.order_id)) return true;
      if (e.confirmation_id && completedConfirmIds.has(e.confirmation_id)) return true;
      return false;
    });

    // Auto-populate null doctor_amount from provider's default rate
    const toUpdate = completedEarnings.filter(
      (e) => e.doctor_amount == null && e.status === "pending"
    );
    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map((e) => {
          const rate = profileList.find((p) => p.user_id === e.doctor_user_id)?.per_order_rate;
          if (rate != null) {
            return supabase
              .from("doctor_earnings")
              .update({ doctor_amount: rate })
              .eq("id", e.id);
          }
          return Promise.resolve();
        })
      );
      // Reload with updated amounts
      const { data: refreshed } = await supabase
        .from("doctor_earnings")
        .select("*")
        .in("id", toUpdate.map((e) => e.id));
      if (refreshed) {
        refreshed.forEach((updated) => {
          const idx = completedEarnings.findIndex((e) => e.id === (updated as Earning).id);
          if (idx !== -1) completedEarnings[idx] = updated as Earning;
        });
      }
    }

    setEarnings(completedEarnings);
    setDoctors(profileList);
    setLoading(false);
  }, []);

  useEffect(() => { loadEarnings(); }, [loadEarnings]);

  const handleUpdated = (updated: Earning) => {
    setEarnings((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    if (updated.status === "paid") {
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(updated.id); return next; });
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = earnings.filter((e) => {
    if (filterDoctor !== "all" && e.doctor_user_id !== filterDoctor) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (e.doctor_name ?? "").toLowerCase().includes(q) ||
        (e.confirmation_id ?? "").toLowerCase().includes(q) ||
        (e.patient_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingSelectable = filtered.filter((e) => e.status === "pending" && e.doctor_amount != null);
  const allPendingSelected = pendingSelectable.length > 0 && pendingSelectable.every((e) => selectedIds.has(e.id));

  const handleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingSelectable.map((e) => e.id)));
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedIds.size === 0) return;
    setBulkMarkingPaid(true);
    setBulkSuccess(null);
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("doctor_earnings")
      .update({ status: "paid", paid_at: now, payment_reference: bulkPayRef.trim() || null })
      .in("id", ids);
    setBulkMarkingPaid(false);
    if (!error) {
      setEarnings((prev) =>
        prev.map((e) => selectedIds.has(e.id) ? { ...e, status: "paid", paid_at: now, payment_reference: bulkPayRef.trim() || null } : e)
      );
      setBulkSuccess(`${ids.length} record${ids.length !== 1 ? "s" : ""} marked as paid${bulkPayRef.trim() ? ` via ${bulkPayRef.trim()}` : ""}`);
      setSelectedIds(new Set());
      setBulkPayRef("");
      setTimeout(() => setBulkSuccess(null), 5000);
    }
  };

  const handleSendReminder = async () => {
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-payout-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const result = await res.json() as { ok?: boolean; message?: string; totalUnpaid?: number; providersCount?: number };
      if (res.ok && result.ok) {
        const now = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
        localStorage.setItem(LAST_REMINDER_KEY, now);
        setLastReminderSent(now);
        setReminderResult({ ok: true, message: result.message ?? `Reminder sent — ${result.providersCount} providers, $${result.totalUnpaid} total` });
      } else {
        setReminderResult({ ok: false, message: (result as { error?: string }).error ?? "Failed to send reminder" });
      }
    } catch {
      setReminderResult({ ok: false, message: "Network error — could not send reminder" });
    } finally {
      setSendingReminder(false);
      setTimeout(() => setReminderResult(null), 6000);
    }
  };

  const totalPending = earnings.filter((e) => e.status === "pending").reduce((sum, e) => sum + (e.doctor_amount ?? 0), 0);
  const totalPaid = earnings.filter((e) => e.status === "paid").reduce((sum, e) => sum + (e.doctor_amount ?? 0), 0);
  const pendingCount = earnings.filter((e) => e.status === "pending").length;
  const unsetCount = earnings.filter((e) => e.doctor_amount == null && e.status === "pending").length;
  const selectedTotalAmount = earnings.filter((e) => selectedIds.has(e.id)).reduce((sum, e) => sum + (e.doctor_amount ?? 0), 0);

  return (
    <div>
      {/* Summary stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Cases", value: earnings.length, icon: "ri-file-list-3-line", color: "text-gray-700" },
            { label: "Pending Payout", value: `$${totalPending}`, subtext: `${pendingCount} case${pendingCount !== 1 ? "s" : ""}`, icon: "ri-time-line", color: "text-amber-600" },
            { label: "Total Paid Out", value: `$${totalPaid}`, icon: "ri-checkbox-circle-fill", color: "text-[#1a5c4f]" },
            { label: "Amount Unset", value: unsetCount, subtext: unsetCount > 0 ? "Need attention" : "All set", icon: "ri-alert-line", color: unsetCount > 0 ? "text-orange-500" : "text-gray-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${s.icon} ${s.color} text-base`}></i>
                </div>
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
              {"subtext" in s && s.subtext && <p className="text-xs text-gray-400 mt-0.5">{s.subtext}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Filters + filtered CSV export */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {filterStatus !== "paid" && pendingSelectable.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer mr-1">
              <input
                type="checkbox"
                checked={allPendingSelected}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-gray-300 accent-[#1a5c4f] cursor-pointer"
              />
              <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">Select All</span>
            </label>
          )}
          {[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "paid", label: "Paid" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setFilterStatus(opt.value); setSelectedIds(new Set()); }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${filterStatus === opt.value ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {opt.label}
            </button>
          ))}
          <select
            value={filterDoctor}
            onChange={(e) => { setFilterDoctor(e.target.value); setSelectedIds(new Set()); }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#1a5c4f] cursor-pointer"
          >
            <option value="all">All Doctors</option>
            {doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search doctor, patient, order ID..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
            />
          </div>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => exportToCSV(filtered, `earnings-export-${new Date().toISOString().slice(0, 10)}.csv`)}
              title="Export current view to CSV"
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-[#1a5c4f] rounded-lg cursor-pointer transition-colors"
            >
              <i className="ri-file-excel-2-line"></i> CSV
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-checkbox-multiple-line text-amber-600 text-sm"></i>
              </div>
              <span className="text-sm font-bold text-amber-800">
                {selectedIds.size} record{selectedIds.size !== 1 ? "s" : ""} selected
                {selectedTotalAmount > 0 && <span className="ml-2 text-amber-600">— ${selectedTotalAmount} total</span>}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedIds(new Set()); setBulkPayRef(""); }}
              className="whitespace-nowrap text-xs font-semibold text-amber-700 hover:text-amber-900 cursor-pointer"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-bank-card-line text-amber-600 text-sm"></i>
              </div>
              <input
                type="text"
                value={bulkPayRef}
                onChange={(e) => setBulkPayRef(e.target.value)}
                placeholder='Payment method/ref — e.g. "Zelle", "Check #5678" (optional)'
                className="flex-1 px-3 py-1.5 border border-amber-200 rounded-lg text-xs focus:outline-none focus:border-amber-400 bg-white"
              />
            </div>
            <button
              type="button"
              onClick={handleBulkMarkPaid}
              disabled={bulkMarkingPaid}
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
            >
              {bulkMarkingPaid
                ? <><i className="ri-loader-4-line animate-spin"></i> Processing...</>
                : <><i className="ri-checkbox-circle-line"></i> Mark {selectedIds.size} as Paid</>}
            </button>
          </div>
        </div>
      )}

      {/* Bulk success toast */}
      {bulkSuccess && (
        <div className="bg-[#e8f5f1] border border-[#b8ddd5] rounded-xl px-5 py-3 mb-4 flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-sm"></i>
          </div>
          <span className="text-sm font-bold text-[#1a5c4f]">{bulkSuccess}</span>
        </div>
      )}

      {/* Earnings list */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
            <i className="ri-money-dollar-circle-line text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-bold text-gray-700 mb-1">
            {earnings.length === 0 ? "No earnings records yet" : "No records match filters"}
          </p>
          <p className="text-xs text-gray-400">
            {earnings.length === 0
              ? "Records are created automatically when a doctor sends a case for patient review."
              : "Try changing your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {filtered.map((e) => (
            <EarningRow
              key={e.id}
              earning={e}
              selected={selectedIds.has(e.id)}
              onToggleSelect={handleToggleSelect}
              onUpdated={handleUpdated}
              orderRefunded={
                (!!e.order_id && refundedOrderIds.has(e.order_id)) ||
                (!!e.confirmation_id && refundedConfirmIds.has(e.confirmation_id))
              }
            />
          ))}
        </div>
      )}

      {/* ─── Analytics & Tools (pinned to bottom) ─────────────────────────────── */}
      {!loading && (
        <>
          {/* Payout Reminder Banner */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-mail-send-line text-[#1a5c4f] text-sm"></i>
                </div>
                <p className="text-sm font-bold text-gray-900">Payout Reminder Email</p>
              </div>
              <p className="text-xs text-gray-500 ml-7">
                Sends a full breakdown to <strong>pawtenant@gmail.com</strong> + GHL. Auto-scheduled on the 1st &amp; 15th of each month.
              </p>
              {lastReminderSent && (
                <p className="text-xs text-gray-400 ml-7 mt-0.5 flex items-center gap-1">
                  <i className="ri-history-line"></i> Last sent: {lastReminderSent}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={sendingReminder}
                className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
              >
                {sendingReminder
                  ? <><i className="ri-loader-4-line animate-spin"></i> Sending...</>
                  : <><i className="ri-mail-send-line"></i> Send Reminder Now</>}
              </button>
              {reminderResult && (
                <p className={`text-xs font-semibold flex items-center gap-1 ${reminderResult.ok ? "text-[#1a5c4f]" : "text-red-500"}`}>
                  <i className={reminderResult.ok ? "ri-checkbox-circle-fill" : "ri-close-circle-line"}></i>
                  {reminderResult.message}
                </p>
              )}
            </div>
          </div>

          {/* Per-doctor summary with individual CSV export */}
          {doctors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">By Doctor</p>
                <button
                  type="button"
                  onClick={() => exportToCSV(earnings, "all-earnings.csv")}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-[#1a5c4f] rounded-lg cursor-pointer transition-colors"
                >
                  <i className="ri-download-2-line"></i> Export All CSV
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {doctors.map((doc) => {
                  const docEarnings = earnings.filter((e) => e.doctor_user_id === doc.user_id);
                  const docPending = docEarnings.filter((e) => e.status === "pending").reduce((s, e) => s + (e.doctor_amount ?? 0), 0);
                  const docPaid = docEarnings.filter((e) => e.status === "paid").reduce((s, e) => s + (e.doctor_amount ?? 0), 0);
                  return (
                    <div key={doc.user_id} className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{doc.full_name}</p>
                        <p className="text-xs text-gray-400">{docEarnings.length} case{docEarnings.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-amber-600 font-bold">${docPending} pending</p>
                          <p className="text-xs text-[#1a5c4f] font-semibold">${docPaid} paid</p>
                        </div>
                        <button
                          type="button"
                          title="Export this provider's earnings to CSV"
                          onClick={() => exportToCSV(docEarnings, `earnings-${doc.full_name.replace(/\s+/g, "-").toLowerCase()}.csv`)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-[#1a5c4f] hover:border-[#1a5c4f] hover:bg-[#f0faf7] cursor-pointer transition-colors flex-shrink-0"
                        >
                          <i className="ri-download-2-line text-xs"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Orders by State chart */}
          <div className="mb-5">
            <StateBreakdownChart />
          </div>
        </>
      )}
    </div>
  );
}
