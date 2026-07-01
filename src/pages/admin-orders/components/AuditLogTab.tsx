// AuditLogTab — Universal system audit log
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface AuditLog {
  id: string;
  actor_name: string;
  actor_role: string | null;
  object_type: string;
  object_id: string | null;
  action: string;
  description: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface StatusLog {
  id: string;
  old_status: string | null;
  new_status: string | null;
  old_doctor_status: string | null;
  new_doctor_status: string | null;
  changed_by: string;
  changed_at: string;
  order_id: string;
  orders: { confirmation_id: string } | null;
}

interface UnifiedEntry {
  id: string;
  source: "audit" | "status";
  actor: string;
  actor_role?: string | null;
  object_type: string;
  object_id?: string | null;
  action: string;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  timestamp: string;
}

const TYPE_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  order:      { color: "bg-emerald-100 text-emerald-700", icon: "ri-file-list-3-line",       label: "Order" },
  payment:    { color: "bg-teal-100 text-teal-700",       icon: "ri-bank-card-line",          label: "Payment" },
  refund:     { color: "bg-orange-100 text-orange-700",   icon: "ri-refund-2-line",            label: "Refund" },
  doctor:     { color: "bg-[#e8f5f1] text-[#3b6ea5]",    icon: "ri-stethoscope-line",        label: "Doctor" },
  staff:      { color: "bg-slate-100 text-slate-600",     icon: "ri-team-line",               label: "Staff" },
  ghl_sync:   { color: "bg-amber-100 text-amber-700",     icon: "ri-radar-line",              label: "GHL Sync" },
  customer:   { color: "bg-rose-100 text-rose-600",       icon: "ri-group-line",              label: "Customer" },
  letter:     { color: "bg-lime-100 text-lime-700",       icon: "ri-file-pdf-line",           label: "Letter" },
  system:     { color: "bg-gray-100 text-gray-500",       icon: "ri-settings-3-line",        label: "System" },
  status:     { color: "bg-sky-50 text-sky-700",          icon: "ri-refresh-line",            label: "Status Change" },
  sequence:   { color: "bg-violet-100 text-violet-700",   icon: "ri-mail-send-line",          label: "Lead Sequence" },
  provider:   { color: "bg-purple-100 text-purple-700",   icon: "ri-user-shared-line",        label: "Provider" },
  chat:       { color: "bg-cyan-100 text-cyan-700",       icon: "ri-chat-3-line",             label: "Chat" },
  contact:    { color: "bg-teal-100 text-teal-700",       icon: "ri-mail-open-line",          label: "Contact" },
  template:   { color: "bg-fuchsia-100 text-fuchsia-700", icon: "ri-file-text-line",          label: "Template" },
  approval:   { color: "bg-amber-100 text-amber-700",     icon: "ri-shield-check-line",       label: "Approval" },
  leave:      { color: "bg-emerald-100 text-emerald-700", icon: "ri-calendar-event-line",     label: "Leave" },
  attendance: { color: "bg-indigo-100 text-indigo-700",   icon: "ri-time-line",               label: "Attendance" },
};

const ACTION_FRIENDLY: Record<string, string> = {
  ghl_sync_success:      "GHL sync succeeded",
  ghl_sync_failed:       "GHL sync failed",
  refund_created:        "Refund issued",
  refund_failed:         "Refund failed",
  status_changed:        "Status changed",
  role_changed:          "Role updated",
  active_toggled:        "Account status changed",
  doctor_assigned:       "Doctor assigned",
  doctor_reassigned:     "Doctor reassigned",
  order_status_updated:  "Order status updated",
  seq_30min_sent:        "5-min follow-up sent",
  seq_24h_sent:          "24-hour follow-up sent",
  seq_3day_sent:         "3-day follow-up + $20 discount sent",
  seq_run_complete:      "Sequence run completed",
  seq_unsubscribed:      "Lead unsubscribed from sequence",
  approval_granted:      "Approval request approved",
  approval_rejected:     "Approval request rejected",
  // Company OS admin operations
  staff_invited:                       "Team member invited",
  employee_created:                    "Employee created",
  employee_profile_changed:            "Employee profile updated",
  employee_role_changed:               "Employee role changed",
  employee_offboarded:                 "Employee offboarded / archived",
  employee_reactivated:                "Employee reactivated",
  employee_linked_to_staff:            "Employee linked to staff login",
  employee_profile_auto_created:       "Employee profile auto-created (invite)",
  salary_set:                          "Salary set",
  salary_changed:                      "Salary changed",
  department_role_assigned:            "Department role assigned",
  department_role_changed:             "Department role changed",
  department_role_removed:             "Department role removed",
  leave_request_approved:              "Leave request approved",
  leave_request_rejected:              "Leave request rejected",
  leave_correction_approved:           "Leave correction approved",
  leave_correction_rejected:           "Leave correction rejected",
  attendance_correction_approved:      "Attendance correction approved",
  attendance_correction_rejected:      "Attendance correction rejected",
  chat_sessions_bulk_resolved:         "Chats bulk-resolved",
  contact_submission_archived:         "Contact submission archived",
  contact_submissions_bulk_archived:   "Contact submissions bulk-archived",
  contact_submissions_bulk_resolved:   "Contact submissions bulk-resolved",
  provider_internal_doc_uploaded:      "Internal provider document uploaded",
  provider_internal_doc_downloaded:    "Internal provider document downloaded",
  provider_internal_doc_archived:      "Internal provider document archived",
  provider_bank_details_saved:         "Provider bank details saved",
  provider_bank_details_revealed:      "Provider bank details viewed",
};

// Human-vs-system split: system events come from webhooks, cron, triggers and
// the assessment flow client logger — real admin actions carry a person's name.
const SYSTEM_ACTOR_NAMES = new Set(["system", "assessment_flow", "system (trigger)", "cron", "edge_function", "stripe_webhook", "auto-sequence", "qa"]);
function isSystemEntry(e: UnifiedEntry): boolean {
  const actor = (e.actor ?? "").trim().toLowerCase();
  return actor === "" || SYSTEM_ACTOR_NAMES.has(actor) || actor.endsWith("_webhook") || actor.endsWith("_flow");
}

const ACTION_DECISION_STYLE: Record<string, { dot: string; label: string }> = {
  approval_granted:  { dot: "bg-emerald-500", label: "Approved" },
  approval_rejected: { dot: "bg-red-500",     label: "Rejected" },
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const LIMIT = 50;

export default function AuditLogTab() {
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<"all" | "human" | "system">("all");
  const [actorFilter, setActorFilter] = useState("all");

  const fetchAuditLogs = useCallback(async (offsetVal: number, append: boolean) => {
    if (!append) setLoading(true); else setLoadingMore(true);

    const [auditRes, statusRes] = await Promise.all([
      supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offsetVal, offsetVal + LIMIT - 1),
      offsetVal === 0
        ? supabase
            .from("order_status_logs")
            .select("id, old_status, new_status, old_doctor_status, new_doctor_status, changed_by, changed_at, order_id, orders(confirmation_id)")
            .order("changed_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
    ]);

    const auditEntries: UnifiedEntry[] = ((auditRes.data as AuditLog[]) ?? []).map((a) => ({
      id: `audit-${a.id}`,
      source: "audit",
      actor: a.actor_name,
      actor_role: a.actor_role,
      object_type: a.object_type,
      object_id: a.object_id,
      action: a.action,
      description: a.description,
      old_values: a.old_values,
      new_values: a.new_values,
      timestamp: a.created_at,
    }));

    const statusEntries: UnifiedEntry[] = offsetVal === 0
      ? ((statusRes.data as StatusLog[]) ?? []).map((s) => {
          const desc: string[] = [];
          if (s.old_status !== s.new_status && s.new_status) {
            desc.push(`Order: ${s.old_status ?? "—"} → ${s.new_status}`);
          }
          if (s.old_doctor_status !== s.new_doctor_status && s.new_doctor_status) {
            desc.push(`Provider: ${s.old_doctor_status ?? "—"} → ${s.new_doctor_status}`);
          }
          return {
            id: `status-${s.id}`,
            source: "status",
            actor: s.changed_by === "system" ? "System (Trigger)" : s.changed_by,
            object_type: "status",
            object_id: s.orders?.confirmation_id ?? s.order_id,
            action: "status_changed",
            description: desc.join(" · ") || "Status updated",
            old_values: { status: s.old_status, doctor_status: s.old_doctor_status },
            new_values: { status: s.new_status, doctor_status: s.new_doctor_status },
            timestamp: s.changed_at,
          };
        })
      : [];

    // Merge and sort
    const allNew = [...auditEntries, ...statusEntries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (append) {
      setEntries((prev) => [...prev, ...allNew]);
    } else {
      setEntries(allNew);
    }

    setHasMore((auditRes.data?.length ?? 0) >= LIMIT);
    if (!append) setLoading(false); else setLoadingMore(false);
  }, []);

  useEffect(() => { fetchAuditLogs(0, false); }, [fetchAuditLogs]);

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchAuditLogs(newOffset, true);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const uniqueTypes = ["all", ...Array.from(new Set(entries.map((e) => e.object_type)))];
  const humanActors = Array.from(new Set(entries.filter((e) => !isSystemEntry(e)).map((e) => e.actor))).sort();

  const filtered = entries.filter((e) => {
    const matchType = typeFilter === "all" || e.object_type === typeFilter;
    const matchSource =
      sourceFilter === "all" ||
      (sourceFilter === "human" ? !isSystemEntry(e) : isSystemEntry(e));
    const matchActor = actorFilter === "all" || e.actor === actorFilter;
    const matchDate = !dateFrom || new Date(e.timestamp) >= new Date(dateFrom);
    const q = search.toLowerCase();
    const matchSearch = !q ||
      e.actor.toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q) ||
      (e.object_id ?? "").toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q);
    return matchType && matchSource && matchActor && matchDate && matchSearch;
  });

  const todayCount = entries.filter((e) => new Date(e.timestamp).toDateString() === new Date().toDateString()).length;
  const ghlErrors = entries.filter((e) => e.action === "ghl_sync_failed").length;
  const refunds = entries.filter((e) => e.action === "refund_created").length;
  const approvalDecisions = entries.filter((e) => e.action === "approval_granted" || e.action === "approval_rejected").length;

  return (
    <div>
      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Events Today", value: todayCount, icon: "ri-calendar-check-line", color: "text-gray-700" },
            { label: "Total Logged", value: entries.length, icon: "ri-list-check-2", color: "text-[#3b6ea5]" },
            { label: "GHL Sync Errors", value: ghlErrors, icon: "ri-radar-line", color: "text-amber-600" },
            { label: "Refunds Issued", value: refunds, icon: "ri-refund-2-line", color: "text-orange-500" },
            { label: "Approval Decisions", value: approvalDecisions, icon: "ri-shield-check-line", color: "text-slate-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${s.icon} ${s.color} text-base`}></i>
                </div>
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-4 flex flex-col gap-3">
        {/* Human vs system split — admin activity is the interesting signal;
            webhook/cron noise stays reachable under System events. */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
            {([
              { key: "all",    label: "All events" },
              { key: "human",  label: "Admin actions" },
              { key: "system", label: "System events" },
            ] as { key: "all" | "human" | "system"; label: string }[]).map((s) => (
              <button key={s.key} type="button" onClick={() => setSourceFilter(s.key)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${sourceFilter === s.key ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {s.key === "human" && <i className="ri-user-line mr-1"></i>}
                {s.key === "system" && <i className="ri-settings-3-line mr-1"></i>}
                {s.label}
              </button>
            ))}
          </div>
          <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 focus:outline-none focus:border-[#3b6ea5] cursor-pointer bg-white">
            <option value="all">All actors</option>
            {humanActors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {uniqueTypes.slice(0, 8).map((t) => {
            const style = TYPE_STYLE[t];
            return (
              <button key={t} type="button" onClick={() => setTypeFilter(t)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer capitalize ${typeFilter === t ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "all" ? "All Events" : (style?.label ?? t)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] cursor-pointer" />
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, action, ID..."
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] w-48" />
          </div>
        </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i>
            <p className="text-sm text-gray-500">Loading audit log...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
            <i className="ri-list-check-2 text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-bold text-gray-700">No audit events found</p>
          <p className="text-xs text-gray-400 mt-1">Events are logged as actions are taken — check back as the system is used.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[140px_1fr_1fr_150px_160px_40px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Type</span>
            <span>Action / Description</span>
            <span>Object ID</span>
            <span>Actor</span>
            <span>Timestamp</span>
            <span></span>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((entry) => {
              const style = TYPE_STYLE[entry.object_type] ?? TYPE_STYLE.system;
              const isOpen = expanded.has(entry.id);
              const hasDetail = !!(entry.old_values || entry.new_values);
              const friendlyAction = ACTION_FRIENDLY[entry.action] ?? entry.action.replace(/_/g, " ");

              return (
                <div key={entry.id}>
                  <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_150px_160px_40px] gap-2 md:gap-3 px-5 py-3 items-center hover:bg-gray-50/40 transition-colors">
                    {/* Type badge */}
                    <div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${style.color}`}>
                        <i className={`${style.icon} text-xs`}></i>
                        {style.label}
                      </span>
                    </div>

                    {/* Action */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 capitalize">{friendlyAction}</p>
                        {ACTION_DECISION_STYLE[entry.action] && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            entry.action === "approval_granted"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-600 border border-red-200"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ACTION_DECISION_STYLE[entry.action].dot}`}></span>
                            {ACTION_DECISION_STYLE[entry.action].label}
                          </span>
                        )}
                      </div>
                      {entry.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{entry.description}</p>
                      )}
                    </div>

                    {/* Object ID */}
                    <div className="hidden md:block">
                      {entry.object_id ? (
                        <span className="font-mono text-xs text-gray-600 truncate block max-w-[160px]" title={entry.object_id}>
                          {entry.object_id.length > 20 ? `${entry.object_id.slice(0, 20)}…` : entry.object_id}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </div>

                    {/* Actor */}
                    <div className="hidden md:flex items-center gap-2">
                      <div className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                        <i className="ri-user-line text-gray-500 text-xs"></i>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700 truncate max-w-[100px]">{entry.actor}</p>
                        {entry.actor_role && (
                          <p className="text-xs text-gray-400 capitalize">{entry.actor_role.replace(/_/g, " ")}</p>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="hidden md:block text-xs text-gray-400">{fmt(entry.timestamp)}</div>

                    {/* Expand */}
                    <div className="hidden md:flex items-center justify-center">
                      {hasDetail && (
                        <button type="button" onClick={() => toggleExpand(entry.id)}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer transition-colors text-gray-400">
                          {isOpen
                            ? <i className="ri-arrow-up-s-line text-sm"></i>
                            : <i className="ri-arrow-down-s-line text-sm"></i>
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && hasDetail && (
                    <div className="border-t border-gray-50 bg-gray-50/60 px-5 py-3">
                      <div className="grid grid-cols-2 gap-4">
                        {entry.old_values && Object.keys(entry.old_values).length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Before</p>
                            <div className="space-y-1">
                              {Object.entries(entry.old_values).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 w-28 flex-shrink-0">{k.replace(/_/g, " ")}</span>
                                  <span className="text-xs text-gray-600 font-mono truncate">{String(v ?? "—")}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {entry.new_values && Object.keys(entry.new_values).length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-[#3b6ea5] uppercase tracking-widest mb-2">After</p>
                            <div className="space-y-1">
                              {Object.entries(entry.new_values).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 w-28 flex-shrink-0">{k.replace(/_/g, " ")}</span>
                                  <span className="text-xs text-[#3b6ea5] font-mono font-semibold truncate">{String(v ?? "—")}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-center">
              <button type="button" onClick={handleLoadMore} disabled={loadingMore}
                className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors disabled:opacity-50">
                {loadingMore ? <><i className="ri-loader-4-line animate-spin"></i>Loading...</> : <><i className="ri-arrow-down-line"></i>Load More Events</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
