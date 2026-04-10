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

const AUDIENCE_ICONS: Record<string, string> = {
  all_paid: "ri-money-dollar-circle-line",
  completed: "ri-checkbox-circle-line",
  unassigned: "ri-user-unfollow-line",
  under_review: "ri-time-line",
  all_leads: "ri-user-follow-line",
  all_everyone: "ri-group-line",
  test: "ri-test-tube-line",
  unknown: "ri-question-line",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return fmt(ts);
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

  const realBroadcasts = filteredLogs.filter((l) => !l.is_test);
  const totalSent = realBroadcasts.reduce((sum, l) => sum + l.success_count, 0);
  const totalFailed = realBroadcasts.reduce((sum, l) => sum + l.fail_count, 0);
  const totalBroadcasts = realBroadcasts.length;
  const overallDeliveryRate = (totalSent + totalFailed) > 0
    ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
    : 0;

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
        {!loading && realBroadcasts.length > 0 && (
          <div className="grid grid-cols-4 gap-0 border-b border-gray-100 flex-shrink-0 divide-x divide-gray-100">
            {[
              {
                label: "Total Broadcasts",
                value: totalBroadcasts,
                icon: "ri-broadcast-line",
                color: "text-[#1a5c4f]",
                bg: "bg-[#f0faf7]",
              },
              {
                label: "Emails Delivered",
                value: totalSent.toLocaleString(),
                icon: "ri-checkbox-circle-line",
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "Failed",
                value: totalFailed.toLocaleString(),
                icon: "ri-close-circle-line",
                color: totalFailed > 0 ? "text-red-500" : "text-gray-400",
                bg: totalFailed > 0 ? "bg-red-50" : "bg-gray-50",
              },
              {
                label: "Delivery Rate",
                value: `${overallDeliveryRate}%`,
                icon: "ri-bar-chart-line",
                color: overallDeliveryRate >= 90 ? "text-emerald-600" : overallDeliveryRate >= 70 ? "text-amber-600" : "text-red-500",
                bg: overallDeliveryRate >= 90 ? "bg-emerald-50" : overallDeliveryRate >= 70 ? "bg-amber-50" : "bg-red-50",
              },
            ].map((s) => (
              <div key={s.label} className={`flex items-center gap-3 px-5 py-3.5 ${s.bg}`}>
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-white/60 flex-shrink-0">
                  <i className={`${s.icon} ${s.color} text-sm`}></i>
                </div>
                <div>
                  <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 flex-shrink-0 flex-wrap bg-gray-50/50">
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{filteredLogs.length} record{filteredLogs.length !== 1 ? "s" : ""}</span>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50"
            >
              <i className={loading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
              Refresh
            </button>
          </div>
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
                const audienceIcon = AUDIENCE_ICONS[log.audience_key ?? "unknown"] ?? "ri-question-line";

                return (
                  <div
                    key={log.id}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      log.is_test
                        ? "border-amber-200 bg-amber-50/30"
                        : log.fail_count > 0
                          ? "border-red-100"
                          : "border-gray-200"
                    }`}
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
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-500 font-semibold">{log.sent_by}</span>
                          <span className="text-gray-300">·</span>
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <i className={`${audienceIcon} text-xs`}></i>
                            {AUDIENCE_LABELS[log.audience_key ?? "unknown"] ?? log.audience_key ?? "Unknown"}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-gray-400" title={fmt(log.created_at)}>{fmtRelative(log.created_at)}</span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {log.is_test ? (
                          <div className="text-right">
                            <p className="text-sm font-extrabold text-amber-600">Test</p>
                            <p className="text-xs text-gray-400 truncate max-w-[120px]">{log.test_email}</p>
                          </div>
                        ) : (
                          <>
                            {/* Delivery rate pill */}
                            <div className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                              deliveryRate >= 90
                                ? "bg-emerald-100 text-emerald-700"
                                : deliveryRate >= 70
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-600"
                            }`}>
                              <i className="ri-bar-chart-line" style={{ fontSize: "10px" }}></i>
                              {deliveryRate}%
                            </div>
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
                              <p className="text-sm font-extrabold text-gray-600">{log.recipients_count.toLocaleString()}</p>
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
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-gray-600">Delivery Rate</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400">{log.success_count} delivered · {log.fail_count} failed · {log.recipients_count} total</span>
                                <span className={`text-xs font-extrabold ${deliveryRate >= 90 ? "text-emerald-600" : deliveryRate >= 70 ? "text-amber-600" : "text-red-500"}`}>
                                  {deliveryRate}%
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${deliveryRate >= 90 ? "bg-emerald-500" : deliveryRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${deliveryRate}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {/* Details grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Sent By", value: log.sent_by, icon: "ri-user-line" },
                            { label: "Channel", value: log.channel === "email" ? "Email (Resend)" : "SMS (Twilio)", icon: log.channel === "email" ? "ri-mail-line" : "ri-chat-1-line" },
                            { label: "Audience", value: AUDIENCE_LABELS[log.audience_key ?? "unknown"] ?? log.audience_key ?? "—", icon: audienceIcon },
                            { label: "Excluded", value: log.excluded_count > 0 ? `${log.excluded_count} excluded` : "None excluded", icon: "ri-user-forbid-line" },
                          ].map((item) => (
                            <div key={item.label} className="bg-white rounded-lg border border-gray-100 px-3 py-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <i className={`${item.icon} text-gray-400 text-xs`}></i>
                                <p className="text-xs text-gray-400">{item.label}</p>
                              </div>
                              <p className="text-xs font-semibold text-gray-700">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Sent at */}
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <i className="ri-time-line"></i>
                          <span>Sent {fmt(log.created_at)}</span>
                        </div>

                        {/* Message preview */}
                        {log.message_preview && (
                          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                            <p className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                              <i className="ri-file-text-line"></i>Message Preview
                            </p>
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
