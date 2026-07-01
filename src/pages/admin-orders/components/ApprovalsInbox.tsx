// ApprovalsInbox — Owner/Admin panel to review and act on pending approval requests
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { logAudit } from "../../../lib/auditLogger";

interface ApprovalRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_role: string;
  action_type: string;
  action_label: string;
  action_payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface ApprovalsInboxProps {
  reviewerName: string;
  reviewerRole: string;
  reviewerId: string;
  onApproveAction: (request: ApprovalRequest) => Promise<void>;
  onClose: () => void;
  /** Optional deep-link into an admin tab (e.g. "team" | "attendance"). */
  onNavigate?: (tab: string) => void;
}

// HR requests (leave / attendance / leave corrections) live in their own tables,
// not approval_requests — the notification bell counts them under "Approvals
// required", so the inbox must show them too. Sourced from the same manager-gated
// RPC the bell uses; decisions go through the existing review_* RPCs.
interface HrApprovalItem {
  id: string;
  source_type: string; // attendance_correction | leave_request | leave_correction
  source_id: string;
  employee_name: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  target_tab: string;
}

const HR_SOURCE_CONFIG: Record<string, { icon: string; bg: string; iconColor: string; label: string; objectType: "leave" | "attendance" }> = {
  leave_request:         { icon: "ri-calendar-event-line", bg: "bg-teal-50",  iconColor: "text-teal-600",  label: "Leave request",         objectType: "leave" },
  leave_correction:      { icon: "ri-calendar-2-line",     bg: "bg-cyan-50",  iconColor: "text-cyan-600",  label: "Leave correction",      objectType: "leave" },
  attendance_correction: { icon: "ri-time-line",           bg: "bg-indigo-50", iconColor: "text-indigo-600", label: "Attendance correction", objectType: "attendance" },
};

const HR_REVIEW_RPC: Record<string, { fn: string; decisionParam: "p_status" | "p_decision" }> = {
  leave_request:         { fn: "review_employee_leave_request",        decisionParam: "p_status" },
  leave_correction:      { fn: "review_leave_correction_request",      decisionParam: "p_decision" },
  attendance_correction: { fn: "review_attendance_correction_request", decisionParam: "p_decision" },
};

const ACTION_ICONS: Record<string, string> = {
  bulk_delete: "ri-delete-bin-2-line",
  bulk_assign: "ri-user-received-line",
  bulk_sms: "ri-message-3-line",
  broadcast: "ri-broadcast-line",
  refund: "ri-refund-2-line",
  compensation_adjustment: "ri-hand-coin-line",
};

const ACTION_COLORS: Record<string, { bg: string; icon: string; badge: string; badgePending: string }> = {
  bulk_delete: { bg: "bg-red-50", icon: "text-red-600", badge: "bg-red-100 text-red-700", badgePending: "bg-red-50 text-red-600 border border-red-200" },
  bulk_assign: { bg: "bg-amber-50", icon: "text-amber-600", badge: "bg-amber-100 text-amber-700", badgePending: "bg-amber-50 text-amber-600 border border-amber-200" },
  bulk_sms: { bg: "bg-sky-50", icon: "text-sky-600", badge: "bg-sky-100 text-sky-700", badgePending: "bg-sky-50 text-sky-600 border border-sky-200" },
  broadcast: { bg: "bg-violet-50", icon: "text-violet-600", badge: "bg-violet-100 text-violet-700", badgePending: "bg-violet-50 text-violet-600 border border-violet-200" },
  refund: { bg: "bg-orange-50", icon: "text-orange-600", badge: "bg-orange-100 text-orange-700", badgePending: "bg-orange-50 text-orange-600 border border-orange-200" },
  compensation_adjustment: { bg: "bg-emerald-50", icon: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700", badgePending: "bg-emerald-50 text-emerald-600 border border-emerald-200" },
};

function fmt(ts: string) {
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ApprovalsInbox({
  reviewerName,
  reviewerRole,
  reviewerId,
  onApproveAction,
  onClose,
  onNavigate,
}: ApprovalsInboxProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [showRejectNote, setShowRejectNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [hrItems, setHrItems] = useState<HrApprovalItem[]>([]);
  const [hrRejectNote, setHrRejectNote] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const [{ data }, hrRes] = await Promise.all([
      supabase
        .from("approval_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      // Manager-gated RPC; support-role admins get an auth error → empty section.
      supabase.rpc("get_admin_company_os_notifications"),
    ]);
    setRequests((data as ApprovalRequest[]) ?? []);
    setHrItems(hrRes.error ? [] : ((hrRes.data as HrApprovalItem[] | null) ?? []).filter((i) => i.status === "pending"));
    setLoading(false);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleHrDecision = async (item: HrApprovalItem, decision: "approved" | "rejected", note?: string) => {
    const rpc = HR_REVIEW_RPC[item.source_type];
    if (!rpc) return;
    setProcessingId(item.id);
    setActionError(null);
    const { error } = await supabase.rpc(rpc.fn, {
      p_request_id: item.source_id,
      [rpc.decisionParam]: decision,
      p_manager_note: note?.trim() || null,
    });
    if (error) {
      setActionError(error.message);
      setProcessingId(null);
      return;
    }
    const cfg = HR_SOURCE_CONFIG[item.source_type];
    await logAudit({
      actor_id: reviewerId,
      actor_name: reviewerName,
      actor_role: reviewerRole,
      object_type: cfg?.objectType ?? "staff",
      object_id: item.source_id,
      action: `${item.source_type}_${decision}`,
      description: `${decision === "approved" ? "Approved" : "Rejected"} ${cfg?.label.toLowerCase() ?? item.source_type} — ${item.employee_name}${note?.trim() ? ` · Note: ${note.trim()}` : ""}`,
      new_values: { decision, source_type: item.source_type, employee_name: item.employee_name, message: item.message },
    });
    setHrItems((prev) => prev.filter((i) => i.id !== item.id));
    setHrRejectNote(null);
    setProcessingId(null);
  };

  // Real-time subscription for new requests
  useEffect(() => {
    const channel = supabase
      .channel("approval-requests-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approval_requests" }, () => {
        loadRequests();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approval_requests" }, () => {
        loadRequests();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadRequests]);

  // ── Session access state: tracks which finance users have been granted orders tab access ──
  const [sessionAccessGranted, setSessionAccessGranted] = useState<Set<string>>(new Set());

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

  // Notify the requester via doctor_notifications table (bell) + email
  const notifyRequester = async (request: ApprovalRequest, decision: "approved" | "rejected", note?: string) => {
    try {
      // In-app bell notification
      await supabase.from("doctor_notifications").insert({
        doctor_user_id: request.requester_id,
        title: decision === "approved"
          ? `✅ Request Approved — ${request.action_label}`
          : `❌ Request Rejected — ${request.action_label}`,
        message: decision === "approved"
          ? `Your request for "${request.action_label}" was approved by ${reviewerName}. ${request.action_type === "orders_tab_access" ? "Refresh the page to access the Orders tab." : "The action has been executed."}`
          : `Your request for "${request.action_label}" was rejected by ${reviewerName}.${note ? ` Reason: ${note}` : ""}`,
        type: decision === "approved" ? "approval_granted" : "approval_rejected",
        confirmation_id: null,
        order_id: null,
      });
    } catch {
      // Non-critical
    }

    // Email notification (best-effort via edge function)
    // Pass requester_id for reliable ID-based email lookup instead of name-matching
    try {
      fetch(`${supabaseUrl}/functions/v1/notify-approval-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          notifyRequester: true,
          requesterId: request.requester_id,
          requesterName: request.requester_name,
          requesterRole: request.requester_role,
          actionLabel: request.action_label,
          actionType: request.action_type,
          decision,
          reviewerName,
          note: note ?? null,
        }),
      }).catch(() => {});
    } catch {
      // Non-critical
    }
  };

  const handleApprove = async (request: ApprovalRequest) => {
    setProcessingId(request.id);
    setActionError(null);

    // Compensation adjustments are decided by a server-side RPC that enforces
    // reviewer authorization + the self-review fence and updates the adjustment
    // row, this approval_requests mirror, and the audit log atomically. If the
    // backend refuses, surface the error and leave the request pending.
    if (request.action_type === "compensation_adjustment") {
      const adjId = request.action_payload?.adjustment_id as string | undefined;
      const { error } = await supabase.rpc("review_compensation_adjustment", {
        p_adjustment_id: adjId ?? null,
        p_decision: "approved",
        p_note: null,
      });
      if (error) {
        setActionError(error.message);
        setProcessingId(null);
        return;
      }
    }

    try {
      await supabase.from("approval_requests").update({
        status: "approved",
        reviewed_by: reviewerId,
        reviewed_by_name: reviewerName,
        reviewed_at: new Date().toISOString(),
      }).eq("id", request.id);

      await logAudit({
        actor_id: reviewerId,
        actor_name: reviewerName,
        actor_role: reviewerRole,
        object_type: "staff",
        object_id: request.id,
        action: "approval_granted",
        description: `Approved "${request.action_label}" request from ${request.requester_name} (${request.requester_role})`,
        new_values: {
          decision: "approved",
          action_type: request.action_type,
          action_label: request.action_label,
          requester_name: request.requester_name,
          requester_role: request.requester_role,
          requester_id: request.requester_id,
        },
        metadata: {
          approval_request_id: request.id,
          reviewer_id: reviewerId,
          reviewer_name: reviewerName,
          reviewer_role: reviewerRole,
          requester_id: request.requester_id,
          requester_name: request.requester_name,
          requester_role: request.requester_role,
          action_type: request.action_type,
          action_label: request.action_label,
          action_payload: request.action_payload,
          decided_at: new Date().toISOString(),
        },
      });

      // For orders_tab_access: grant session access + notify requester via bell
      if (request.action_type === "orders_tab_access") {
        setSessionAccessGranted((prev) => new Set([...prev, request.requester_id]));
      }

      // Notify requester of decision
      await notifyRequester(request, "approved");

      // Execute the approved action
      await onApproveAction(request);

      setRequests((prev) => prev.map((r) => r.id === request.id
        ? { ...r, status: "approved", reviewed_by_name: reviewerName, reviewed_at: new Date().toISOString() }
        : r
      ));
    } catch {
      // Silent fail — DB update may still have succeeded
    }
    setProcessingId(null);
  };

  const handleReject = async (request: ApprovalRequest) => {
    setProcessingId(request.id);
    setActionError(null);
    const note = rejectNotes[request.id] ?? "";

    // See handleApprove — compensation decisions go through the RPC.
    if (request.action_type === "compensation_adjustment") {
      const adjId = request.action_payload?.adjustment_id as string | undefined;
      const { error } = await supabase.rpc("review_compensation_adjustment", {
        p_adjustment_id: adjId ?? null,
        p_decision: "rejected",
        p_note: note.trim() || null,
      });
      if (error) {
        setActionError(error.message);
        setProcessingId(null);
        return;
      }
    }

    try {
      await supabase.from("approval_requests").update({
        status: "rejected",
        reviewed_by: reviewerId,
        reviewed_by_name: reviewerName,
        review_note: note.trim() || null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", request.id);

      await logAudit({
        actor_id: reviewerId,
        actor_name: reviewerName,
        actor_role: reviewerRole,
        object_type: "staff",
        object_id: request.id,
        action: "approval_rejected",
        description: `Rejected "${request.action_label}" request from ${request.requester_name} (${request.requester_role})${note ? ` — Reason: ${note}` : ""}`,
        new_values: {
          decision: "rejected",
          action_type: request.action_type,
          action_label: request.action_label,
          requester_name: request.requester_name,
          requester_role: request.requester_role,
          requester_id: request.requester_id,
          rejection_note: note.trim() || null,
        },
        metadata: {
          approval_request_id: request.id,
          reviewer_id: reviewerId,
          reviewer_name: reviewerName,
          reviewer_role: reviewerRole,
          requester_id: request.requester_id,
          requester_name: request.requester_name,
          requester_role: request.requester_role,
          action_type: request.action_type,
          action_label: request.action_label,
          action_payload: request.action_payload,
          rejection_note: note.trim() || null,
          decided_at: new Date().toISOString(),
        },
      });

      // Notify requester of rejection
      await notifyRequester(request, "rejected", note.trim() || undefined);

      setRequests((prev) => prev.map((r) => r.id === request.id
        ? { ...r, status: "rejected", reviewed_by_name: reviewerName, review_note: note || null, reviewed_at: new Date().toISOString() }
        : r
      ));
      setShowRejectNote(null);
    } catch {
      // Silent fail
    }
    setProcessingId(null);
  };

  const displayed = requests.filter((r) => filter === "pending" ? r.status === "pending" : true);
  const pendingCount = requests.filter((r) => r.status === "pending").length + hrItems.length;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0">
            <i className="ri-shield-check-line text-[#3b6ea5] text-lg"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-gray-900">Approvals Inbox</h2>
            <p className="text-xs text-gray-400">Review and act on restricted action requests from team members</p>
          </div>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-extrabold rounded-full">
              <i className="ri-time-line text-xs"></i>
              {pendingCount} pending
            </span>
          )}
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-6 py-2.5 border-b border-gray-100 flex-shrink-0">
          {(["pending", "all"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer capitalize ${filter === f ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              {f === "pending" ? `Pending (${pendingCount})` : `All (${requests.length})`}
            </button>
          ))}
        </div>

        {/* Action error (e.g. backend refused a compensation decision) */}
        {actionError && (
          <div className="px-6 py-2 border-b border-rose-100 bg-rose-50 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-rose-700">
              <i className="ri-error-warning-line mr-1"></i>{actionError}
            </p>
            <button type="button" onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-rose-600 cursor-pointer"><i className="ri-close-line"></i></button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* HR requests (leave / attendance) — counted by the notification bell
              under "Approvals required"; decisions run the same review RPCs as
              the Team / Attendance tabs. */}
          {!loading && hrItems.length > 0 && (
            <div className="border-b border-gray-100">
              <p className="px-6 pt-3 pb-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                HR Requests — Leave &amp; Attendance
              </p>
              <div className="divide-y divide-gray-50">
                {hrItems.map((item) => {
                  const cfg = HR_SOURCE_CONFIG[item.source_type] ?? HR_SOURCE_CONFIG.leave_request;
                  const isProcessing = processingId === item.id;
                  const showingNote = hrRejectNote === item.id;
                  return (
                    <div key={item.id} className="px-6 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 flex items-center justify-center ${cfg.bg} rounded-xl flex-shrink-0 mt-0.5`}>
                          <i className={`${cfg.icon} ${cfg.iconColor} text-base`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-gray-100 text-gray-700">{cfg.label}</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold rounded-full">
                              <i className="ri-time-line text-xs"></i>Pending
                            </span>
                            <span className="text-xs text-gray-400">{fmt(item.created_at)}</span>
                          </div>
                          <p className="text-xs text-gray-700 font-semibold mt-1">{item.employee_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.message}</p>
                        </div>
                        {onNavigate && (
                          <button type="button"
                            onClick={() => { onNavigate(item.target_tab); onClose(); }}
                            title="Open in tab for full details"
                            className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-[#3b6ea5] hover:bg-gray-50 rounded-lg cursor-pointer flex-shrink-0">
                            <i className="ri-external-link-line"></i>Open
                          </button>
                        )}
                      </div>
                      <div className="mt-2.5 ml-12 space-y-2">
                        {showingNote ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectNotes[item.id] ?? ""}
                              onChange={(e) => setRejectNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Reason for rejection (optional)..."
                              className="flex-1 px-3 py-2 border border-red-300 rounded-lg text-xs focus:outline-none focus:border-red-500"
                              autoFocus
                            />
                            <button type="button" disabled={isProcessing}
                              onClick={() => handleHrDecision(item, "rejected", rejectNotes[item.id])}
                              className="whitespace-nowrap flex items-center gap-1 px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50">
                              {isProcessing ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-close-line"></i>}
                              Reject
                            </button>
                            <button type="button" onClick={() => setHrRejectNote(null)}
                              className="whitespace-nowrap px-2 py-2 text-gray-400 hover:text-gray-600 cursor-pointer text-xs">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button type="button" disabled={isProcessing}
                              onClick={() => handleHrDecision(item, "approved")}
                              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#14493f] cursor-pointer disabled:opacity-50 transition-colors">
                              {isProcessing
                                ? <><i className="ri-loader-4-line animate-spin"></i>Processing...</>
                                : <><i className="ri-checkbox-circle-line"></i>Approve</>
                              }
                            </button>
                            <button type="button" disabled={isProcessing} onClick={() => setHrRejectNote(item.id)}
                              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 bg-red-50 text-xs font-bold rounded-lg hover:bg-red-100 cursor-pointer disabled:opacity-50 transition-colors">
                              <i className="ri-close-circle-line"></i>Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
            </div>
          ) : displayed.length === 0 && hrItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 flex items-center justify-center bg-[#e8f0f9] rounded-full mb-3">
                <i className="ri-checkbox-circle-line text-[#3b6ea5] text-2xl"></i>
              </div>
              <p className="text-sm font-bold text-gray-700">
                {filter === "pending" ? "No pending requests" : "No requests yet"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {filter === "pending"
                  ? "All caught up! Restricted action requests from team members will appear here."
                  : "Approval requests from team members will appear here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {displayed.map((req) => {
                const colors = ACTION_COLORS[req.action_type] ?? ACTION_COLORS.bulk_sms;
                const icon = ACTION_ICONS[req.action_type] ?? "ri-lock-line";
                const payload = req.action_payload;
                const isPending = req.status === "pending";
                const isProcessing = processingId === req.id;
                const showingRejectNote = showRejectNote === req.id;

                return (
                  <div key={req.id} className={`px-6 py-4 ${!isPending ? "opacity-70" : ""}`}>
                    {/* Top row */}
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 flex items-center justify-center ${colors.bg} rounded-xl flex-shrink-0 mt-0.5`}>
                        <i className={`${icon} ${colors.icon} text-base`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold ${colors.badge}`}>
                            {req.action_label}
                          </span>
                          {/* Status badge */}
                          {req.status === "pending" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold rounded-full">
                              <i className="ri-time-line text-xs"></i>Pending
                            </span>
                          )}
                          {req.status === "approved" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] border border-[#b8cce4] text-xs font-bold rounded-full">
                              <i className="ri-checkbox-circle-fill text-xs"></i>Approved
                            </span>
                          )}
                          {req.status === "rejected" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-full">
                              <i className="ri-close-circle-fill text-xs"></i>Rejected
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{fmt(req.created_at)}</span>
                        </div>

                        {/* Requester */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0 text-[10px] font-extrabold text-gray-500">
                            {req.requester_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{req.requester_name}</span>
                          <span className="text-xs text-gray-400 capitalize">({req.requester_role.replace(/_/g, " ")})</span>
                        </div>

                        {/* Finance orders_tab_access context card */}
                        {req.action_type === "orders_tab_access" && (
                          <div className="mt-2 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 space-y-2">
                            <p className="text-xs font-extrabold text-[#3b6ea5] flex items-center gap-1.5">
                              <i className="ri-file-list-3-line text-sm"></i>
                              Orders Tab Access Request — Finance Role
                            </p>
                            <p className="text-xs text-[#2d5a8e] leading-relaxed">
                              <strong>{req.requester_name}</strong> (Finance) is requesting access to the full Orders tab. Finance users are restricted from the Orders tab by default for data security.
                            </p>
                            <div className="pt-2 border-t border-[#b8cce4] space-y-1">
                              <p className="text-[10px] font-bold text-[#3b6ea5] uppercase tracking-widest">If approved, they will be able to:</p>
                              {["View all orders and order details", "See provider assignments and status", "Access order documents and assessment data"].map((item) => (
                                <div key={item} className="flex items-center gap-1.5">
                                  <i className="ri-checkbox-circle-line text-[#3b6ea5] text-xs flex-shrink-0"></i>
                                  <p className="text-xs text-[#2d5a8e]">{item}</p>
                                </div>
                              ))}
                              <p className="text-[10px] font-bold text-[#3b6ea5] uppercase tracking-widest mt-2">They will still NOT be able to:</p>
                              {["Issue refunds (requires separate approval)", "Delete orders (requires separate approval)", "Send bulk broadcasts"].map((item) => (
                                <div key={item} className="flex items-center gap-1.5">
                                  <i className="ri-close-circle-line text-red-400 text-xs flex-shrink-0"></i>
                                  <p className="text-xs text-gray-500">{item}</p>
                                </div>
                              ))}
                            </div>
                            {sessionAccessGranted.has(req.requester_id) && (
                              <div className="flex items-center gap-1.5 pt-1 border-t border-[#b8cce4]">
                                <i className="ri-checkbox-circle-fill text-emerald-600 text-sm"></i>
                                <p className="text-xs font-bold text-emerald-700">Session access granted — {req.requester_name} has been notified via bell to refresh.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Payload details */}
                        <div className="mt-2 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 space-y-1">
                          {payload.employeeName !== undefined && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-user-line text-gray-400 flex-shrink-0"></i>
                              For <span className="font-semibold">{(payload.employeeName as string) ?? "employee"}</span>
                              {payload.periodMonth !== undefined && (
                                <span> · {new Date(`${(payload.periodMonth as string).slice(0, 7)}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                              )}
                            </p>
                          )}
                          {payload.amountPkr !== undefined && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-money-dollar-circle-line text-gray-400 flex-shrink-0"></i>
                              {payload.compType ? <span className="capitalize font-semibold">{payload.compType as string}</span> : "Amount"}:&nbsp;
                              <span className="font-semibold">PKR {Math.round(Number(payload.amountPkr) || 0).toLocaleString("en-US")}</span>
                            </p>
                          )}
                          {payload.orderCount !== undefined && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-file-list-3-line text-gray-400 flex-shrink-0"></i>
                              <span className="font-semibold">{payload.orderCount as number}</span> orders selected for deletion
                            </p>
                          )}
                          {payload.doctorName && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-stethoscope-line text-gray-400 flex-shrink-0"></i>
                              Assign to <span className="font-semibold">{payload.doctorName as string}</span>
                              {payload.assignableCount !== undefined && <span> ({payload.assignableCount as number} eligible orders)</span>}
                            </p>
                          )}
                          {payload.recipientCount !== undefined && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-group-line text-gray-400 flex-shrink-0"></i>
                              <span className="font-semibold">{payload.recipientCount as number}</span> recipients
                              {payload.channel && <span> via {payload.channel as string}</span>}
                            </p>
                          )}
                          {payload.audience && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-focus-3-line text-gray-400 flex-shrink-0"></i>
                              Audience: <span className="font-semibold">{payload.audience as string}</span>
                            </p>
                          )}
                          {payload.subject && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-mail-line text-gray-400 flex-shrink-0"></i>
                              Subject: <span className="font-semibold truncate max-w-[280px]">{payload.subject as string}</span>
                            </p>
                          )}
                          {payload.message && (
                            <p className="text-xs text-gray-600 flex items-start gap-1.5">
                              <i className="ri-message-3-line text-gray-400 flex-shrink-0 mt-0.5"></i>
                              <span className="line-clamp-2 italic">&ldquo;{(payload.message as string).slice(0, 120)}{(payload.message as string).length > 120 ? "..." : ""}&rdquo;</span>
                            </p>
                          )}
                          {payload.confirmationId && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-hashtag text-gray-400 flex-shrink-0"></i>
                              Order: <span className="font-semibold font-mono">{payload.confirmationId as string}</span>
                            </p>
                          )}
                          {payload.amount !== undefined && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-money-dollar-circle-line text-gray-400 flex-shrink-0"></i>
                              Amount: <span className="font-semibold">${payload.amount as number}</span>
                            </p>
                          )}
                          {payload.refundType && (
                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                              <i className="ri-refund-2-line text-gray-400 flex-shrink-0"></i>
                              Type: <span className="font-semibold capitalize">{payload.refundType as string} refund</span>
                            </p>
                          )}
                          {payload.requester_note && (
                            <p className="text-xs text-amber-700 flex items-start gap-1.5 pt-1 border-t border-gray-200 mt-1">
                              <i className="ri-sticky-note-line text-amber-500 flex-shrink-0 mt-0.5"></i>
                              <span className="italic">{payload.requester_note as string}</span>
                            </p>
                          )}
                        </div>

                        {/* Reviewed info */}
                        {!isPending && req.reviewed_by_name && (
                          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                            <i className="ri-user-follow-line flex-shrink-0"></i>
                            {req.status === "approved" ? "Approved" : "Rejected"} by <strong>{req.reviewed_by_name}</strong>
                            {req.reviewed_at && <span> · {fmt(req.reviewed_at)}</span>}
                            {req.review_note && <span> · &ldquo;{req.review_note}&rdquo;</span>}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons — only for pending */}
                    {isPending && (
                      <div className="mt-3 ml-12 space-y-2">
                        {/* Reject note input */}
                        {showingRejectNote && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectNotes[req.id] ?? ""}
                              onChange={(e) => setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                              placeholder="Reason for rejection (optional)..."
                              className="flex-1 px-3 py-2 border border-red-300 rounded-lg text-xs focus:outline-none focus:border-red-500"
                              autoFocus
                            />
                            <button type="button" onClick={() => handleReject(req)} disabled={isProcessing}
                              className="whitespace-nowrap flex items-center gap-1 px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50">
                              {isProcessing ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-close-line"></i>}
                              Reject
                            </button>
                            <button type="button" onClick={() => setShowRejectNote(null)}
                              className="whitespace-nowrap px-2 py-2 text-gray-400 hover:text-gray-600 cursor-pointer text-xs">
                              Cancel
                            </button>
                          </div>
                        )}

                        {!showingRejectNote && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => handleApprove(req)} disabled={isProcessing}
                              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer disabled:opacity-50 transition-colors">
                              {isProcessing
                                ? <><i className="ri-loader-4-line animate-spin"></i>Processing...</>
                                : <><i className="ri-checkbox-circle-line"></i>Approve &amp; Execute</>
                              }
                            </button>
                            <button type="button" onClick={() => setShowRejectNote(req.id)} disabled={isProcessing}
                              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 bg-red-50 text-xs font-bold rounded-lg hover:bg-red-100 cursor-pointer disabled:opacity-50 transition-colors">
                              <i className="ri-close-circle-line"></i>Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
