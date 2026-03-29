// BroadcastHistoryModal — History of all bulk email/SMS sends
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface BroadcastLog {
  id: string;
  sent_by: string;
  channel: "email" | "sms";
  audience_key: string | null;
  subject: string | null;
  message_preview: string | null;
  recipients_count: number;
  success_count: number;
  fail_count: number;
  excluded_count: number;
  is_test: boolean;
  test_email: string | null;
  created_at: string;
}

interface BroadcastHistoryModalProps {
  onClose: () => void;
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_paid: "All Paid Customers",
  completed: "Completed Orders",
  unassigned: "Paid · Unassigned",
  under_review: "Under Review",
  all_leads: "All Leads (Unpaid)",
  all_everyone: "Everyone",
  test: "Test Send",
  unknown: "Unknown",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function BroadcastHistoryModal({ onClose }: BroadcastHistoryModalProps) {
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<"all" | "email" | "sms">("all");
  const [showTests, setShowTests] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("broadcast_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data as BroadcastLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter((l) => {
    if (!showTests && l.is_test) return false;
    if (channelFilter !== "all" && l.channel !== channelFilter) return false;
    return true;
  });

  const totalSent = filteredLogs.filter((l) => !l.is_test).reduce((sum, l) => sum + l.success_count, 0);
  const totalFailed = filteredLogs.filter((l) => !l.is_test).reduce((sum, l) => sum + l.fail_count, 0);
  const totalBroadcasts = filteredLogs.filter((l) => !l.is_test).length;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 flex items-center justify-center bg-[#1a5c4f] rounded-xl flex-shrink-0">
            <i className="ri-history-line text-white text-lg"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-gray-900">Broadcast History</h2>
            <p className="text-xs text-gray-400">All bulk email &amp; SMS sends — who sent what, when, and to how many</p>
          </div>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Stats bar */}
        {!loading && filteredLogs.length > 0 && (
          <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
            {[
              { label: "Total Broadcasts", value: totalBroadcasts, icon: "ri-broadcast-line", color: "text-[#1a5c4f]" },
              { label: "Emails Delivered", value: totalSent.toLocaleString(), icon: "ri-checkbox-circle-line", color: "text-emerald-600" },
              { label: "Failed", value: totalFailed.toLocaleString(), icon: "ri-close-circle-line", color: totalFailed > 0 ? "text-red-500" : "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-200 flex-shrink-0">
                  <i className={`${s.icon} ${s.color} text-sm`}></i>
                </div>
                <div>
                  <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "email", "sms"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setChannelFilter(f)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${channelFilter === f ? "bg-white text-gray-900 border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
              >
                {f === "all" ? "All Channels" : f === "email" ? "Email" : "SMS"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTests((v) => !v)}
            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${showTests ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
          >
            <i className="ri-test-tube-line"></i>
            {showTests ? "Hiding Test Sends" : "Show Test Sends"}
          </button>
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="whitespace-nowrap ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50"
          >
            <i className={loading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
            Refresh
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                <i className="ri-history-line text-gray-300 text-xl"></i>
              </div>
              <p className="text-sm font-bold text-gray-600 mb-1">No broadcast history yet</p>
              <p className="text-xs text-gray-400">Sends will appear here once you use the Broadcast tool.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                const deliveryRate = log.recipients_count > 0
                  ? Math.round((log.success_count / log.recipients_count) * 100)
                  : 0;

                return (
                  <div
                    key={log.id}
                    className={`rounded-xl border overflow-hidden transition-all ${log.is_test ? "border-amber-200 bg-amber-50/30" : log.fail_count > 0 ? "border-red-100" : "border-gray-200"}`}
                  >
                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/80 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      {/* Channel icon */}
                      <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${log.channel === "email" ? "bg-[#e8f5f1]" : "bg-sky-50"}`}>
                        <i className={`${log.channel === "email" ? "ri-mail-send-line text-[#1a5c4f]" : "ri-chat-1-line text-sky-600"} text-base`}></i>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900 truncate">
                            {log.subject ?? "(No subject)"}
                          </p>
                          {log.is_test && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">TEST</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          By <strong className="text-gray-600">{log.sent_by}</strong>
                          {" · "}
                          {AUDIENCE_LABELS[log.audience_key ?? "unknown"] ?? log.audience_key ?? "Unknown segment"}
                          {" · "}
                          {fmt(log.created_at)}
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {log.is_test ? (
                          <div className="text-right">
                            <p className="text-sm font-extrabold text-amber-600">Test</p>
                            <p className="text-xs text-gray-400">{log.test_email}</p>
                          </div>
                        ) : (
                          <>
                            <div className="text-right">
                              <p className="text-sm font-extrabold text-[#1a5c4f]">{log.success_count.toLocaleString()}</p>
                              <p className="text-xs text-gray-400">delivered</p>
                            </div>
                            {log.fail_count > 0 && (
                              <div className="text-right">
                                <p className="text-sm font-extrabold text-red-500">{log.fail_count}</p>
                                <p className="text-xs text-gray-400">failed</p>
                              </div>
                            )}
                            <div className="text-right">
                              <p className="text-sm font-extrabold text-gray-700">{log.recipients_count.toLocaleString()}</p>
                              <p className="text-xs text-gray-400">total</p>
                            </div>
                          </>
                        )}
                        <i className={`text-gray-400 text-sm flex-shrink-0 ${isExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50 space-y-3 pt-3">
                        {/* Delivery rate bar */}
                        {!log.is_test && log.recipients_count > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-gray-600">Delivery Rate</span>
                              <span className={`text-xs font-extrabold ${deliveryRate >= 90 ? "text-emerald-600" : deliveryRate >= 70 ? "text-amber-600" : "text-red-500"}`}>
                                {deliveryRate}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${deliveryRate >= 90 ? "bg-emerald-500" : deliveryRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${deliveryRate}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {/* Details grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Sent By", value: log.sent_by },
                            { label: "Channel", value: log.channel === "email" ? "Email (Resend)" : "SMS (Twilio)" },
                            { label: "Audience", value: AUDIENCE_LABELS[log.audience_key ?? "unknown"] ?? log.audience_key ?? "—" },
                            { label: "Excluded", value: log.excluded_count > 0 ? `${log.excluded_count} manually excluded` : "None excluded" },
                          ].map((item) => (
                            <div key={item.label}>
                              <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                              <p className="text-xs font-semibold text-gray-700">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Message preview */}
                        {log.message_preview && (
                          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                            <p className="text-xs font-bold text-gray-500 mb-1">Message Preview</p>
                            <p className="text-xs text-gray-600 leading-relaxed italic">
                              &ldquo;{log.message_preview}{log.message_preview.length >= 200 ? "..." : ""}&rdquo;
                            </p>
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
