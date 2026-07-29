// OrderAuditTimeline — the order-level operational timeline.
//
// PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §13–§19.
//
// Answers, for ONE order: who assigned the provider, who reassigned or removed
// them, who initiated a refund, who marked it under review or complete, who
// texted or emailed the customer, who submitted the document, who requested a
// correction, and who approved and delivered it.
//
// Sources, merged and sorted newest-first:
//   • audit_logs        — the actor-attributed event record
//   • order_status_logs — legacy/trigger status transitions that predate
//                         record_order_status_action()
//
// Deliberately NOT here:
//   • message bodies — `communications` is authoritative (§19); an audit entry
//     links to it and shows channel/template/status only.
//   • fabricated actors — an event whose actor cannot be proven renders as
//     "Legacy event · actor unavailable" rather than being attributed to the
//     current assignee (§17).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ─── Categories ──────────────────────────────────────────────────────────────
type Category = "assignment" | "status" | "documents" | "refunds" | "communications" | "system";

const CATEGORY_META: Record<Category, { label: string; icon: string; chip: string; dot: string }> = {
  assignment:     { label: "Assignment",     icon: "ri-user-shared-line",  chip: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  status:         { label: "Status",         icon: "ri-refresh-line",      chip: "bg-sky-50 text-sky-700 border-sky-200",          dot: "bg-sky-500" },
  documents:      { label: "Documents",      icon: "ri-file-pdf-line",     chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  refunds:        { label: "Refunds",        icon: "ri-refund-2-line",     chip: "bg-orange-50 text-orange-700 border-orange-200",  dot: "bg-orange-500" },
  communications: { label: "Communications", icon: "ri-message-3-line",    chip: "bg-teal-50 text-teal-700 border-teal-200",        dot: "bg-teal-500" },
  system:         { label: "Payments / System", icon: "ri-settings-3-line", chip: "bg-gray-100 text-gray-600 border-gray-200",      dot: "bg-gray-400" },
};

/** Action → category. Falls back to audit_logs.category, then to system. */
const ACTION_CATEGORY: Record<string, Category> = {
  provider_assigned: "assignment",
  provider_reassigned: "assignment",
  provider_removed: "assignment",
  doctor_assigned: "assignment",
  doctor_reassigned: "assignment",
  order_marked_under_review: "status",
  order_marked_complete: "status",
  order_reopened: "status",
  order_status_updated: "status",
  status_changed: "status",
  manual_reopen_under_review: "status",
  provider_document_submitted: "documents",
  provider_document_resubmitted: "documents",
  document_correction_requested: "documents",
  document_approved: "documents",
  document_delivered: "documents",
  housing_form_completed: "documents",
  verification_issued: "documents",
  pdf_footer_injected: "documents",
  refund_initiated: "refunds",
  refund_issued: "refunds",
  refund_completed: "refunds",
  refund_failed: "refunds",
  partial_refund_initiated: "refunds",
  customer_email_sent: "communications",
  customer_sms_sent: "communications",
  provider_email_sent: "communications",
  provider_sms_sent: "communications",
  notification_suppressed_test_fixture: "communications",
};

const ACTION_TITLE: Record<string, string> = {
  provider_assigned: "Provider assigned",
  provider_reassigned: "Provider reassigned",
  provider_removed: "Provider removed",
  doctor_assigned: "Provider assigned",
  doctor_reassigned: "Provider reassigned",
  order_marked_under_review: "Marked under review",
  order_marked_complete: "Marked complete",
  order_reopened: "Order reopened",
  order_status_updated: "Status updated",
  status_changed: "Status changed",
  manual_reopen_under_review: "Moved back under review",
  provider_document_submitted: "Document submitted",
  provider_document_resubmitted: "Corrected document resubmitted",
  document_correction_requested: "Correction requested",
  document_approved: "Document approved",
  document_delivered: "Document delivered to customer",
  housing_form_completed: "Housing form completed",
  verification_issued: "Verification ID issued",
  pdf_footer_injected: "Verification stamp applied",
  refund_initiated: "Refund initiated",
  refund_issued: "Refund issued",
  refund_completed: "Refund completed",
  refund_failed: "Refund failed",
  customer_email_sent: "Email sent to customer",
  customer_sms_sent: "SMS sent to customer",
  provider_email_sent: "Email sent to provider",
  provider_sms_sent: "SMS sent to provider",
  notification_suppressed_test_fixture: "Notification suppressed (test fixture)",
};

// ─── Automated actors ────────────────────────────────────────────────────────
// An automated action must NEVER read as an employee action (§14). These are
// the legacy actor_name values written before actor_type existed.
const LEGACY_SYSTEM_NAMES = new Set([
  "system", "assessment_flow", "system (trigger)", "cron", "edge_function",
  "stripe_webhook", "auto-sequence", "qa", "admin_comms", "pawtenant system",
]);

type ActorType = "employee" | "admin" | "provider" | "customer" | "system" | "webhook";

interface TimelineEvent {
  id: string;
  at: string;
  action: string;
  category: Category;
  title: string;
  description: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorType: ActorType;
  /** True when the actor is genuinely unknown (legacy row, no proof). */
  actorUnknown: boolean;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  communicationId: string | null;
  documentId: string | null;
  refundReference: string | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  description: string | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_type: string | null;
  category: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  communication_id: string | null;
  document_id: string | null;
  refund_reference: string | null;
}

interface StatusRow {
  id: string;
  old_status: string | null;
  new_status: string | null;
  old_doctor_status: string | null;
  new_doctor_status: string | null;
  changed_by: string | null;
  changed_at: string;
}

/** Resolve the display actor WITHOUT inventing one. */
function resolveActor(name: string | null, type: string | null): {
  actorName: string | null; actorType: ActorType; actorUnknown: boolean;
} {
  const raw = (name ?? "").trim();
  const lower = raw.toLowerCase();

  if (type && ["employee", "admin", "provider", "customer", "system", "webhook"].includes(type)) {
    if (type === "system") return { actorName: raw || "PawTenant System", actorType: "system", actorUnknown: false };
    if (type === "webhook") return { actorName: raw || "Stripe Webhook", actorType: "webhook", actorUnknown: false };
    return { actorName: raw || null, actorType: type as ActorType, actorUnknown: !raw };
  }

  // Pre-attribution rows: infer ONLY the automated case, which is safe because
  // those names were literals written by the system itself. Anything else with
  // no name stays unknown rather than being guessed.
  if (!raw) return { actorName: null, actorType: "system", actorUnknown: true };
  if (LEGACY_SYSTEM_NAMES.has(lower) || lower.endsWith("_webhook") || lower.endsWith("_flow")) {
    return { actorName: "PawTenant System", actorType: "system", actorUnknown: false };
  }
  return { actorName: raw, actorType: "employee", actorUnknown: false };
}

function fmt(ts: string): string {
  const d = new Date(ts);
  if (isNaN(+d)) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function relative(ts: string): string {
  const d = new Date(ts).getTime();
  if (isNaN(d)) return "";
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return "";
}

/** Human sentence for the event, preferring the server-written description. */
function sentence(e: TimelineEvent): string {
  if (e.description) return e.description;
  const who = e.actorUnknown ? "Someone" : (e.actorName ?? "PawTenant System");
  return `${who} — ${e.title.toLowerCase()}`;
}

const FILTERS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assignment", label: "Assignment" },
  { key: "status", label: "Status" },
  { key: "documents", label: "Documents" },
  { key: "refunds", label: "Refunds" },
  { key: "communications", label: "Communications" },
  { key: "system", label: "Payments / System" },
];

interface Props {
  orderId: string;
  confirmationId: string;
  currentProviderName?: string | null;
  currentStatus?: string | null;
}

export default function OrderAuditTimeline({
  orderId, confirmationId, currentProviderName, currentStatus,
}: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);

    // audit_logs is matched on EITHER the new order_id column or the legacy
    // object_id = confirmation_id convention, so pre-existing rows still appear.
    const [auditRes, statusRes] = await Promise.all([
      supabase
        .from("audit_logs")
        .select("id, created_at, action, description, actor_name, actor_role, actor_type, category, old_values, new_values, metadata, communication_id, document_id, refund_reference")
        .or(`order_id.eq.${orderId},object_id.eq.${confirmationId}`)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("order_status_logs")
        .select("id, old_status, new_status, old_doctor_status, new_doctor_status, changed_by, changed_at")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: false })
        .limit(200),
    ]);

    const auditEvents: TimelineEvent[] = ((auditRes.data as AuditRow[]) ?? []).map((a) => {
      const actor = resolveActor(a.actor_name, a.actor_type);
      const category: Category =
        ACTION_CATEGORY[a.action] ??
        ((a.category && a.category in CATEGORY_META) ? (a.category as Category) : "system");
      return {
        id: `audit-${a.id}`,
        at: a.created_at,
        action: a.action,
        category,
        title: ACTION_TITLE[a.action] ?? a.action.replace(/_/g, " "),
        description: a.description,
        actorName: actor.actorName,
        actorRole: a.actor_role,
        actorType: actor.actorType,
        actorUnknown: actor.actorUnknown,
        oldValues: a.old_values,
        newValues: a.new_values,
        metadata: a.metadata,
        communicationId: a.communication_id,
        documentId: a.document_id,
        refundReference: a.refund_reference,
      };
    });

    const statusEvents: TimelineEvent[] = ((statusRes.data as StatusRow[]) ?? []).map((s) => {
      const actor = resolveActor(s.changed_by, null);
      const parts: string[] = [];
      if (s.old_status !== s.new_status && s.new_status) {
        parts.push(`${s.old_status ?? "—"} → ${s.new_status}`);
      }
      if (s.old_doctor_status !== s.new_doctor_status && s.new_doctor_status) {
        parts.push(`provider: ${s.old_doctor_status ?? "—"} → ${s.new_doctor_status}`);
      }
      return {
        id: `status-${s.id}`,
        at: s.changed_at,
        action: "status_changed",
        category: "status",
        title: "Status changed",
        description: `${actor.actorUnknown ? "Status change" : `${actor.actorName} changed the status`}${parts.length ? ` (${parts.join(" · ")})` : ""}`,
        actorName: actor.actorName,
        actorRole: null,
        actorType: actor.actorType,
        actorUnknown: actor.actorUnknown,
        oldValues: { status: s.old_status, doctor_status: s.old_doctor_status },
        newValues: { status: s.new_status, doctor_status: s.new_doctor_status },
        metadata: null,
        communicationId: null,
        documentId: null,
        refundReference: null,
      };
    });

    // Stable ordering for identical timestamps: newest first, then by id, so a
    // re-render never reshuffles two events written in the same transaction.
    const merged = [...auditEvents, ...statusEvents].sort((a, b) => {
      const d = new Date(b.at).getTime() - new Date(a.at).getTime();
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    setEvents(merged);
    setLoading(false);
  }, [orderId, confirmationId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    events.forEach((e) => { c[e.category] = (c[e.category] ?? 0) + 1; });
    return c;
  }, [events]);

  const lastHumanAction = useMemo(
    () => events.find((e) => (e.actorType === "employee" || e.actorType === "admin") && !e.actorUnknown),
    [events],
  );

  const filtered = filter === "all" ? events : events.filter((e) => e.category === filter);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header summary ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Total events" value={String(events.length)} icon="ri-list-check-2" />
        <SummaryCard
          label="Last activity"
          value={events[0] ? fmt(events[0].at) : "—"}
          sub={events[0] ? relative(events[0].at) : undefined}
          icon="ri-time-line"
        />
        <SummaryCard
          label="Last employee action"
          value={lastHumanAction?.actorName ?? "—"}
          sub={lastHumanAction ? lastHumanAction.title : "No attributed employee action"}
          icon="ri-user-line"
        />
        <SummaryCard
          label="Provider / status"
          value={currentProviderName?.trim() || "Unassigned"}
          sub={currentStatus ?? undefined}
          icon="ri-stethoscope-line"
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {FILTERS.map((f) => {
          const n = counts[f.key] ?? 0;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                active ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
              <span
                className={`text-[10px] px-1.5 rounded-full font-extrabold ${
                  active ? "bg-white/25 text-white" : "bg-white text-gray-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
            <i className="ri-list-check-2 text-gray-400 text-xl"></i>
          </div>
          <p className="text-sm font-bold text-gray-700">No events in this view</p>
          <p className="text-xs text-gray-400 mt-1">
            Actions on this order are recorded here as they happen.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ol className="divide-y divide-gray-100">
            {filtered.map((e) => {
              const meta = CATEGORY_META[e.category];
              const isOpen = expanded.has(e.id);
              const hasDetail = !!(e.oldValues || e.newValues || e.metadata);
              const isAutomated = e.actorType === "system" || e.actorType === "webhook";

              return (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    {/* Category icon */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${meta.chip}`}
                    >
                      <i className={`${meta.icon} text-sm`}></i>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900">{e.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5 break-words">{sentence(e)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] text-gray-400 whitespace-nowrap">{fmt(e.at)}</p>
                          {relative(e.at) && (
                            <p className="text-[10px] text-gray-300">{relative(e.at)}</p>
                          )}
                        </div>
                      </div>

                      {/* Actor + change summary */}
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        {e.actorUnknown ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                            <i className="ri-question-line text-[10px]"></i>
                            Legacy event · actor unavailable
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isAutomated
                                ? "bg-gray-100 text-gray-600 border-gray-200"
                                : "bg-[#e8f0f9] text-[#2c5282] border-[#b8cce4]"
                            }`}
                          >
                            <i className={`${isAutomated ? "ri-settings-3-line" : "ri-user-line"} text-[10px]`}></i>
                            {e.actorName}
                            {!isAutomated && e.actorRole && (
                              <span className="text-[10px] font-normal opacity-70">
                                · {e.actorRole.replace(/_/g, " ")}
                              </span>
                            )}
                          </span>
                        )}

                        <ChangeChip oldValues={e.oldValues} newValues={e.newValues} />
                        <LinkChip event={e} />

                        {hasDetail && (
                          <button
                            type="button"
                            onClick={() => toggle(e.id)}
                            className="whitespace-nowrap ml-auto text-[11px] font-bold text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-0.5"
                          >
                            {isOpen ? "Hide details" : "Details"}
                            <i className={isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
                          </button>
                        )}
                      </div>

                      {/* Technical detail — collapsed by default, never the default view */}
                      {isOpen && hasDetail && (
                        <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 overflow-x-auto">
                          <KeyValues title="Before" values={e.oldValues} />
                          <KeyValues title="After" values={e.newValues} accent />
                          <KeyValues title="Details" values={e.metadata} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Small presentational pieces ─────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <i className={`${icon} text-gray-400 text-sm`}></i>
        <span className="text-[11px] text-gray-500 font-semibold truncate">{label}</span>
      </div>
      <p className="text-sm font-extrabold text-gray-900 truncate" title={value}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 truncate" title={sub}>{sub}</p>}
    </div>
  );
}

/** old → new for the ONE field that actually changed, when it is obvious. */
function ChangeChip({
  oldValues, newValues,
}: { oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null }) {
  if (!newValues) return null;
  const keys = Object.keys(newValues).filter((k) => {
    const a = oldValues?.[k];
    const b = newValues[k];
    return b !== null && b !== undefined && String(a ?? "") !== String(b);
  });
  if (keys.length !== 1) return null;
  const k = keys[0];
  const before = oldValues?.[k];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-gray-50 text-gray-600 border border-gray-200 max-w-full truncate">
      {before !== null && before !== undefined && String(before) !== "" ? `${String(before)} → ` : ""}
      <strong className="font-bold text-gray-800">{String(newValues[k])}</strong>
    </span>
  );
}

/** Reference to the authoritative related record (§14 related-entity links). */
function LinkChip({ event }: { event: TimelineEvent }) {
  const items: { icon: string; text: string }[] = [];
  const md = event.metadata ?? {};

  if (event.communicationId) {
    const channel = typeof md.channel === "string" ? md.channel : "message";
    const recipient = typeof md.recipient_masked === "string" ? md.recipient_masked : null;
    const status = typeof md.delivery_status === "string" ? md.delivery_status : null;
    items.push({
      icon: channel === "sms" ? "ri-chat-1-line" : "ri-mail-line",
      text: [channel, recipient, status].filter(Boolean).join(" · "),
    });
  }
  if (event.refundReference) {
    items.push({ icon: "ri-refund-2-line", text: `refund ${event.refundReference}` });
  }
  if (event.documentId && typeof md.doc_type === "string") {
    const v = typeof md.document_version === "number" ? ` v${md.document_version}` : "";
    items.push({ icon: "ri-file-pdf-line", text: `${md.doc_type.replace(/_/g, " ")}${v}` });
  }
  if (typeof md.provider_name === "string" && md.provider_name) {
    items.push({ icon: "ri-stethoscope-line", text: md.provider_name });
  }

  if (items.length === 0) return null;
  return (
    <>
      {items.map((it, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-gray-500 border border-gray-200 max-w-[220px] truncate"
          title={it.text}
        >
          <i className={`${it.icon} text-[10px]`}></i>
          {it.text}
        </span>
      ))}
    </>
  );
}

function KeyValues({
  title, values, accent,
}: { title: string; values: Record<string, unknown> | null; accent?: boolean }) {
  if (!values || Object.keys(values).length === 0) return null;
  return (
    <div className="mb-1.5 last:mb-0">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
      <div className="space-y-0.5">
        {Object.entries(values).map(([k, v]) => (
          <div key={k} className="flex items-start gap-2">
            <span className="text-[11px] text-gray-400 w-40 flex-shrink-0 truncate">
              {k.replace(/_/g, " ")}
            </span>
            <span
              className={`text-[11px] font-mono break-all ${accent ? "text-[#3b6ea5] font-semibold" : "text-gray-600"}`}
            >
              {v === null || v === undefined
                ? "—"
                : typeof v === "object"
                  ? JSON.stringify(v)
                  : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
