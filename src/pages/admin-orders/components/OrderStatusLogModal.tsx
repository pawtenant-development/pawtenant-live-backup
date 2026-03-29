import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface StatusLog {
  id: string;
  old_status: string | null;
  new_status: string | null;
  old_doctor_status: string | null;
  new_doctor_status: string | null;
  changed_by: string;
  changed_at: string;
}

interface OrderStatusLogModalProps {
  orderId: string;
  confirmationId: string;
  currentStatus: string;
  currentDoctorStatus: string | null;
  createdAt: string;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  processing: "bg-gray-100 text-gray-600",
  "under-review": "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
  pending_review: "bg-amber-100 text-amber-700",
  in_review: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  letter_sent: "bg-[#e8f5f1] text-[#1a5c4f]",
  patient_notified: "bg-violet-100 text-violet-700",
  unassigned: "bg-gray-100 text-gray-400",
};

function StatusBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-300 text-xs">—</span>;
  const label = value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[value] ?? "bg-gray-100 text-gray-600"}`}>
      {label}
    </span>
  );
}

function Arrow() {
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <i className="ri-arrow-right-line text-gray-400 text-xs"></i>
    </div>
  );
}

export default function OrderStatusLogModal({
  orderId,
  confirmationId,
  currentStatus,
  currentDoctorStatus,
  createdAt,
  onClose,
}: OrderStatusLogModalProps) {
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("order_status_logs")
        .select("*")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: true });
      setLogs((data as StatusLog[]) ?? []);
      setLoading(false);
    };
    fetchLogs();
  }, [orderId]);

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-0.5">Status History</p>
            <h2 className="text-base font-extrabold text-gray-900">Order {confirmationId}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Timeline */}
        <div className="px-6 py-5 max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-200"></div>

              <div className="space-y-4">
                {/* Order created */}
                <div className="flex gap-4 items-start">
                  <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] border-2 border-[#1a5c4f] rounded-full flex-shrink-0 z-10">
                    <i className="ri-file-add-line text-[#1a5c4f]" style={{ fontSize: "11px" }}></i>
                  </div>
                  <div className="pt-0.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-bold text-gray-800">Order Created</span>
                      <StatusBadge value="processing" />
                    </div>
                    <p className="text-xs text-gray-400">{formatTime(createdAt)}</p>
                  </div>
                </div>

                {/* Status change logs */}
                {logs.length === 0 ? (
                  <div className="flex gap-4 items-start">
                    <div className="w-7 h-7 flex items-center justify-center bg-gray-100 border-2 border-gray-300 rounded-full flex-shrink-0 z-10">
                      <i className="ri-time-line text-gray-400" style={{ fontSize: "11px" }}></i>
                    </div>
                    <div className="pt-0.5 flex-1">
                      <p className="text-sm text-gray-500 italic">No status changes recorded yet.</p>
                      <p className="text-xs text-gray-400 mt-0.5">Changes after this will appear here automatically.</p>
                    </div>
                  </div>
                ) : (
                  logs.map((log, idx) => {
                    const hasOrderChange = log.old_status !== log.new_status;
                    const hasDoctorChange = log.old_doctor_status !== log.new_doctor_status;
                    return (
                      <div key={log.id} className="flex gap-4 items-start">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 z-10 border-2 ${idx === logs.length - 1 ? "bg-[#1a5c4f] border-[#1a5c4f]" : "bg-white border-gray-300"}`}>
                          <i className={`ri-refresh-line ${idx === logs.length - 1 ? "text-white" : "text-gray-400"}`} style={{ fontSize: "11px" }}></i>
                        </div>
                        <div className="pt-0.5 flex-1 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            {hasOrderChange && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-gray-500">Order:</span>
                                <StatusBadge value={log.old_status} />
                                <Arrow />
                                <StatusBadge value={log.new_status} />
                              </div>
                            )}
                            {hasDoctorChange && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-gray-500">Provider:</span>
                                <StatusBadge value={log.old_doctor_status} />
                                <Arrow />
                                <StatusBadge value={log.new_doctor_status} />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400">{formatTime(log.changed_at)}</p>
                            {log.changed_by !== "system" && (
                              <span className="text-xs text-gray-400">· by {log.changed_by}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Current state */}
                <div className="flex gap-4 items-start">
                  <div className="w-7 h-7 flex items-center justify-center bg-emerald-500 border-2 border-emerald-500 rounded-full flex-shrink-0 z-10">
                    <i className="ri-map-pin-fill text-white" style={{ fontSize: "11px" }}></i>
                  </div>
                  <div className="pt-0.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-bold text-gray-800">Current State</span>
                      <StatusBadge value={currentStatus} />
                      {currentDoctorStatus && <StatusBadge value={currentDoctorStatus} />}
                    </div>
                    <p className="text-xs text-gray-400">Now</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap px-4 py-2 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
