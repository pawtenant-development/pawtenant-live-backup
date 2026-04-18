// ApprovalRequestModal — shown when a restricted user tries a gated action
// Submits an approval request to owners/admins and shows pending state
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export interface ApprovalActionPayload {
  // For bulk_delete
  orderIds?: string[];
  orderCount?: number;
  // For bulk_assign
  doctorEmail?: string;
  doctorName?: string;
  assignableCount?: number;
  // For bulk_sms
  recipientCount?: number;
  message?: string;
  // For broadcast
  channel?: string;
  audience?: string;
  subject?: string;
  // For refund
  confirmationId?: string;
  chargeId?: string;
  amount?: number;
  refundType?: string;
  // Generic
  [key: string]: unknown;
}

interface ApprovalRequestModalProps {
  actionType: "bulk_delete" | "bulk_assign" | "bulk_sms" | "broadcast" | "bulk_email" | "refund" | "orders_tab_access";
  actionLabel: string;
  actionDescription: string;
  payload: ApprovalActionPayload;
  requesterName: string;
  requesterRole: string;
  requesterUserId: string;
  onClose: () => void;
}

const ACTION_ICONS: Record<string, string> = {
  bulk_delete: "ri-delete-bin-2-line",
  bulk_assign: "ri-user-received-line",
  bulk_sms: "ri-message-3-line",
  broadcast: "ri-broadcast-line",
  bulk_email: "ri-mail-send-line",
  refund: "ri-refund-2-line",
  orders_tab_access: "ri-file-list-3-line",
};

const ACTION_COLORS: Record<string, { bg: string; icon: string; badge: string }> = {
  bulk_delete: { bg: "bg-red-100", icon: "text-red-600", badge: "bg-red-100 text-red-700" },
  bulk_assign: { bg: "bg-amber-100", icon: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
  bulk_sms: { bg: "bg-sky-100", icon: "text-sky-600", badge: "bg-sky-100 text-sky-700" },
  broadcast: { bg: "bg-violet-100", icon: "text-violet-600", badge: "bg-violet-100 text-violet-700" },
  bulk_email: { bg: "bg-emerald-100", icon: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700" },
  refund: { bg: "bg-orange-100", icon: "text-orange-600", badge: "bg-orange-100 text-orange-700" },
  orders_tab_access: { bg: "bg-[#e8f0f9]", icon: "text-[#3b6ea5]", badge: "bg-[#e8f0f9] text-[#3b6ea5]" },
};

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export default function ApprovalRequestModal({
  actionType,
  actionLabel,
  actionDescription,
  payload,
  requesterName,
  requesterRole,
  requesterUserId,
  onClose,
}: ApprovalRequestModalProps) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const colors = ACTION_COLORS[actionType] ?? ACTION_COLORS.bulk_sms;
  const icon = ACTION_ICONS[actionType] ?? "ri-lock-line";

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const trimmedNote = note.trim() || null;
      const { data: inserted, error: insertErr } = await supabase.from("approval_requests").insert({
        requester_id: requesterUserId,
        requester_name: requesterName,
        requester_role: requesterRole,
        action_type: actionType,
        action_label: actionLabel,
        action_payload: {
          ...payload,
          requester_note: trimmedNote,
          requested_at: new Date().toISOString(),
        },
        status: "pending",
      }).select("id").maybeSingle();

      if (insertErr) throw insertErr;

      // Fire email notification to owners/admins (best-effort, non-blocking)
      try {
        fetch(`${SUPABASE_URL}/functions/v1/notify-approval-request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            requestId: (inserted as { id?: string } | null)?.id ?? null,
            requesterName,
            requesterRole,
            actionType,
            actionLabel,
            actionDescription,
            payload,
            note: trimmedNote,
          }),
        }).catch(() => {
          // Silently fail — email is best-effort
        });
      } catch {
        // Non-critical
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className={`w-10 h-10 flex items-center justify-center ${colors.bg} rounded-xl flex-shrink-0`}>
            <i className={`${icon} ${colors.icon} text-lg`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-extrabold text-gray-900">Request Approval</h3>
            <p className="text-xs text-gray-400 mt-0.5">This action requires Owner or Admin Manager approval</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {submitted ? (
            /* ── Success state ── */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 flex items-center justify-center bg-[#e8f0f9] rounded-full mx-auto">
                <i className="ri-checkbox-circle-fill text-[#3b6ea5] text-3xl"></i>
              </div>
              <div>
                <p className="text-base font-extrabold text-gray-900">Request Submitted!</p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  Your request has been sent to the Owner and Admin Manager for review. They&apos;ve also been notified by email. You&apos;ll be notified once it&apos;s approved or rejected.
                </p>
              </div>
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 text-left space-y-1.5">
                <div className="flex items-center gap-2">
                  <i className="ri-time-line text-[#3b6ea5] text-xs flex-shrink-0"></i>
                  <p className="text-xs text-[#3b6ea5] font-semibold">Pending review by Owner / Admin Manager</p>
                </div>
                <div className="flex items-center gap-2">
                  <i className="ri-mail-send-line text-[#3b6ea5] text-xs flex-shrink-0"></i>
                  <p className="text-xs text-[#3b6ea5]">Email notification sent to all owners &amp; admins</p>
                </div>
                <div className="flex items-center gap-2">
                  <i className="ri-notification-3-line text-[#3b6ea5] text-xs flex-shrink-0"></i>
                  <p className="text-xs text-[#3b6ea5]">They&apos;ll also see it in their Approvals inbox (bell icon)</p>
                </div>
              </div>
              <button type="button" onClick={onClose}
                className="whitespace-nowrap px-6 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors">
                Got it — Close
              </button>
            </div>
          ) : (
            <>
              {/* Action summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold ${colors.badge}`}>
                    <i className={`${icon} text-xs`}></i>
                    {actionLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{actionDescription}</p>

                {/* Payload details */}
                <div className="pt-2 border-t border-gray-200 space-y-1">
                  {payload.orderCount !== undefined && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-file-list-3-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Orders:</span>
                      <span className="font-bold text-gray-700">{payload.orderCount}</span>
                    </div>
                  )}
                  {payload.doctorName && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-stethoscope-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Provider:</span>
                      <span className="font-bold text-gray-700">{payload.doctorName}</span>
                    </div>
                  )}
                  {payload.assignableCount !== undefined && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-user-received-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Eligible orders:</span>
                      <span className="font-bold text-gray-700">{payload.assignableCount}</span>
                    </div>
                  )}
                  {payload.recipientCount !== undefined && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-group-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Recipients:</span>
                      <span className="font-bold text-gray-700">{payload.recipientCount}</span>
                    </div>
                  )}
                  {payload.channel && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-broadcast-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Channel:</span>
                      <span className="font-bold text-gray-700 capitalize">{payload.channel}</span>
                    </div>
                  )}
                  {payload.audience && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-focus-3-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Audience:</span>
                      <span className="font-bold text-gray-700">{payload.audience}</span>
                    </div>
                  )}
                  {payload.subject && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-mail-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Subject:</span>
                      <span className="font-bold text-gray-700 truncate max-w-[200px]">{payload.subject}</span>
                    </div>
                  )}
                  {payload.confirmationId && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-hashtag text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Order ID:</span>
                      <span className="font-bold text-gray-700 font-mono">{payload.confirmationId}</span>
                    </div>
                  )}
                  {payload.amount !== undefined && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-money-dollar-circle-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Amount:</span>
                      <span className="font-bold text-gray-700">${payload.amount}</span>
                    </div>
                  )}
                  {payload.refundType && (
                    <div className="flex items-center gap-2 text-xs">
                      <i className="ri-refund-2-line text-gray-400 flex-shrink-0"></i>
                      <span className="text-gray-500">Type:</span>
                      <span className="font-bold text-gray-700 capitalize">{payload.refundType} refund</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Requester info */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full flex-shrink-0 text-xs font-extrabold text-gray-600">
                  {requesterName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-700">{requesterName}</p>
                  <p className="text-xs text-gray-400 capitalize">{requesterRole.replace(/_/g, " ")} role</p>
                </div>
              </div>

              {/* Optional note */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  Add a note for the reviewer <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={3}
                  placeholder="e.g. Customer requested urgent refund, or this is a test batch..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3b6ea5] resize-none"
                />
                <p className="text-xs text-gray-400 text-right mt-0.5">{note.length}/300</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                  <i className="ri-error-warning-line flex-shrink-0"></i>
                  {error}
                </div>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <i className="ri-information-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-amber-800 leading-relaxed">
                  The Owner and Admin Manager will be <strong>notified by email</strong> and will also see this request in their <strong>Approvals inbox</strong>. If approved, the action will be performed automatically. If rejected, you&apos;ll be notified.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="whitespace-nowrap flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                  {submitting
                    ? <><i className="ri-loader-4-line animate-spin"></i>Submitting...</>
                    : <><i className="ri-send-plane-line"></i>Submit for Approval</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
