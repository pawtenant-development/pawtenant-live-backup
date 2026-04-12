// ApprovalNotificationBell — shown in navbar for restricted users (support, finance, read_only)
// Subscribes to their own approval_requests in real-time and shows a badge + toast when
// an owner/admin approves or rejects their request.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface ApprovalUpdate {
  id: string;
  action_label: string;
  action_type: string;
  status: "approved" | "rejected";
  reviewed_by_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  seen: boolean;
}

interface ApprovalNotificationBellProps {
  userId: string;
  userName: string;
}

const ACTION_ICONS: Record<string, string> = {
  bulk_delete: "ri-delete-bin-2-line",
  bulk_assign: "ri-user-received-line",
  bulk_sms: "ri-message-3-line",
  broadcast: "ri-broadcast-line",
  refund: "ri-refund-2-line",
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

export default function ApprovalNotificationBell({ userId, userName }: ApprovalNotificationBellProps) {
  const [updates, setUpdates] = useState<ApprovalUpdate[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ApprovalUpdate | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load resolved requests for this user
  const loadUpdates = useCallback(async () => {
    const { data } = await supabase
      .from("approval_requests")
      .select("id, action_label, action_type, status, reviewed_by_name, review_note, reviewed_at")
      .eq("requester_id", userId)
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(20);

    if (!data) return;

    // Merge with existing — preserve seen state
    setUpdates((prev) => {
      const seenMap = new Map(prev.map((u) => [u.id, u.seen]));
      return (data as Omit<ApprovalUpdate, "seen">[]).map((d) => ({
        ...d,
        seen: seenMap.get(d.id) ?? false,
      }));
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadUpdates();
  }, [loadUpdates, userId]);

  // Real-time subscription — watch for status changes on this user's requests
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`approval-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "approval_requests",
          filter: `requester_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            action_label: string;
            action_type: string;
            status: string;
            reviewed_by_name: string | null;
            review_note: string | null;
            reviewed_at: string | null;
          };

          if (updated.status !== "approved" && updated.status !== "rejected") return;

          const newUpdate: ApprovalUpdate = {
            id: updated.id,
            action_label: updated.action_label,
            action_type: updated.action_type,
            status: updated.status as "approved" | "rejected",
            reviewed_by_name: updated.reviewed_by_name,
            review_note: updated.review_note,
            reviewed_at: updated.reviewed_at,
            seen: false,
          };

          // Add/update in list
          setUpdates((prev) => {
            const exists = prev.find((u) => u.id === newUpdate.id);
            if (exists) {
              return prev.map((u) => u.id === newUpdate.id ? { ...newUpdate, seen: false } : u);
            }
            return [newUpdate, ...prev];
          });

          // Show toast
          setToast(newUpdate);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 6000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [userId]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unseenCount = updates.filter((u) => !u.seen).length;

  const markAllSeen = () => {
    setUpdates((prev) => prev.map((u) => ({ ...u, seen: true })));
  };

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) markAllSeen();
  };

  if (!userId) return null;

  return (
    <>
      {/* Bell button */}
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={handleOpen}
          title="My approval request updates"
          className="whitespace-nowrap relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition-colors"
        >
          <i className="ri-notification-3-line text-base"></i>
          {unseenCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-extrabold rounded-full">
              {unseenCount > 9 ? "9+" : unseenCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-gray-200 overflow-hidden z-[200]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <i className="ri-notification-3-line text-[#1a5c4f] text-sm"></i>
                <p className="text-xs font-extrabold text-gray-800">My Request Updates</p>
              </div>
              <p className="text-xs text-gray-400">{userName}</p>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {updates.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-2">
                    <i className="ri-notification-off-line text-gray-300 text-lg"></i>
                  </div>
                  <p className="text-xs text-gray-400">No updates yet</p>
                  <p className="text-xs text-gray-300 mt-0.5">You&apos;ll be notified here when your requests are reviewed</p>
                </div>
              ) : (
                updates.map((u) => (
                  <div key={u.id} className={`px-4 py-3 ${!u.seen ? "bg-amber-50/40" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5 ${u.status === "approved" ? "bg-[#e8f5f1]" : "bg-red-100"}`}>
                        <i className={`${ACTION_ICONS[u.action_type] ?? "ri-lock-line"} ${u.status === "approved" ? "text-[#1a5c4f]" : "text-red-600"} text-xs`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${u.status === "approved" ? "bg-[#e8f5f1] text-[#1a5c4f]" : "bg-red-100 text-red-700"}`}>
                            <i className={u.status === "approved" ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"} style={{ fontSize: "9px" }}></i>
                            {u.status === "approved" ? "Approved" : "Rejected"}
                          </span>
                          {!u.seen && (
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0"></span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-gray-800 mt-0.5 truncate">{u.action_label}</p>
                        {u.reviewed_by_name && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            by <strong>{u.reviewed_by_name}</strong>
                            {u.reviewed_at && <span> · {fmt(u.reviewed_at)}</span>}
                          </p>
                        )}
                        {u.review_note && (
                          <p className="text-xs text-gray-500 italic mt-0.5 line-clamp-2">&ldquo;{u.review_note}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {updates.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400 text-center">
                  Showing last {updates.length} resolved request{updates.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[400] flex items-start gap-3 px-4 py-3.5 rounded-2xl max-w-sm w-full border ${toast.status === "approved" ? "bg-[#f0faf7] border-[#b8ddd5]" : "bg-red-50 border-red-200"}`}
          style={{ animation: "slideInUp 0.3s ease-out" }}>
          <div className={`w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 ${toast.status === "approved" ? "bg-[#e8f5f1]" : "bg-red-100"}`}>
            <i className={`${toast.status === "approved" ? "ri-checkbox-circle-fill text-[#1a5c4f]" : "ri-close-circle-fill text-red-600"} text-base`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-extrabold ${toast.status === "approved" ? "text-[#1a5c4f]" : "text-red-800"}`}>
              Request {toast.status === "approved" ? "Approved!" : "Rejected"}
            </p>
            <p className="text-xs text-gray-600 mt-0.5 truncate">{toast.action_label}</p>
            {toast.reviewed_by_name && (
              <p className="text-xs text-gray-400 mt-0.5">
                by {toast.reviewed_by_name}
                {toast.review_note && <span> · &ldquo;{toast.review_note}&rdquo;</span>}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setToast(null)}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0">
            <i className="ri-close-line text-sm"></i>
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
