/**
 * ConsultationRequestsPanel — admin tab for the Consultation Slot Recovery
 * Funnel. Reads + updates public.consultation_requests rows.
 *
 * V1 scope (deliberately lightweight — see CLAUDE.md non-goals):
 *   - list newest first, with status filter chips + free-text search
 *   - inline status flip (single-select)
 *   - drawer-style detail row with linked-order shortcut
 *   - 30s background polling (same posture as ContactRequestsTab)
 *
 * Out of scope for V1:
 *   - assignee picker (assigned_to stays nullable; UI just shows the value)
 *   - bulk actions
 *   - real-time provider calendar
 *   - automated outbound SMS
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const STATUS_OPTIONS = [
  "new",
  "attempted_contact",
  "scheduled",
  "spoke_with_customer",
  "converted_paid",
  "no_answer",
  "closed",
] as const;
type Status = typeof STATUS_OPTIONS[number];

const STATUS_STYLES: Record<Status, { label: string; color: string; icon: string }> = {
  new: {
    label: "New",
    color: "bg-amber-50 text-amber-800 border border-amber-200",
    icon: "ri-mail-unread-line",
  },
  attempted_contact: {
    label: "Attempted",
    color: "bg-sky-50 text-sky-700 border border-sky-200",
    icon: "ri-phone-line",
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-violet-50 text-violet-700 border border-violet-200",
    icon: "ri-calendar-check-line",
  },
  spoke_with_customer: {
    label: "Spoke",
    color: "bg-[#e8f0f9] text-[#3b6ea5] border border-[#c9dcf0]",
    icon: "ri-chat-check-line",
  },
  converted_paid: {
    label: "Converted",
    color: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: "ri-checkbox-circle-line",
  },
  no_answer: {
    label: "No Answer",
    color: "bg-gray-100 text-gray-600 border border-gray-200",
    icon: "ri-volume-mute-line",
  },
  closed: {
    label: "Closed",
    color: "bg-slate-100 text-slate-500 border border-slate-200",
    icon: "ri-close-circle-line",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  email_recovery:    "Email recovery",
  checkout_prompt:   "Checkout prompt",
  assessment_prompt: "Assessment prompt",
  manual:            "Manual",
  direct_link:       "Direct link",
};

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning:   "Morning (8am – 12pm)",
  midday:    "Midday (12pm – 2pm)",
  afternoon: "Afternoon (2pm – 5pm)",
  evening:   "Evening (5pm – 8pm)",
  any:       "Anytime",
};

interface ConsultationRequest {
  id: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  confirmation_number: string | null;
  customer_email: string;
  customer_phone: string | null;
  customer_name: string | null;
  preferred_day: string | null;
  preferred_time_window: string | null;
  timezone: string | null;
  preferred_contact_method: string | null;
  notes: string | null;
  source_context: string;
  status: Status;
  assigned_to: string | null;
  linked_visitor_session_id: string | null;
  converted_order_paid_at: string | null;
  internal_notes: string | null;
}

type StatusFilter = "all" | "open" | Status;

const POLL_INTERVAL_MS = 30_000;

function fmtAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "—";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtPreferredDay(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

interface ConsultationRequestsPanelProps {
  /**
   * Optional — when provided, the "Open order" button on a linked row
   * will call this with the order_id and let the parent (admin-orders/page)
   * surface the existing OrderDetailModal. When omitted, the button falls
   * back to a deep link.
   */
  onOpenOrder?: (orderId: string) => void;
}

export default function ConsultationRequestsPanel({
  onOpenOrder,
}: ConsultationRequestsPanelProps = {}) {
  const [items, setItems] = useState<ConsultationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  // Tracks the most recently copied value so the icon can briefly flip to a
  // checkmark. Single-slot state — copying a different value clears the
  // previous "copied" indicator immediately.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyValue = useCallback(async (value: string, key: string) => {
    if (!value) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== "undefined") {
        // Fallback for ancient browsers / restricted contexts.
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? null : cur));
      }, 1400);
    } catch {
      /* clipboard blocked — silent no-op */
    }
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const { data, error: qErr } = await supabase
        .from("consultation_requests")
        .select(
          "id, created_at, updated_at, order_id, confirmation_number, customer_email, customer_phone, customer_name, preferred_day, preferred_time_window, timezone, preferred_contact_method, notes, source_context, status, assigned_to, linked_visitor_session_id, converted_order_paid_at, internal_notes",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (!mountedRef.current) return;
      if (qErr) {
        setError(qErr.message);
        return;
      }
      const rows = (data ?? []) as ConsultationRequest[];
      setItems((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(rows);
        return prevJson === nextJson ? prev : rows;
      });
      setError(null);
    } catch (e) {
      if (mountedRef.current) {
        setError((e as Error)?.message ?? "Failed to load consultation requests");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      void load(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Keep internal-note draft in sync with selection.
  useEffect(() => {
    const selected = items.find((r) => r.id === selectedId);
    setInternalNoteDraft(selected?.internal_notes ?? "");
  }, [selectedId, items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((row) => {
      // Status filter — "open" = anything not closed/converted.
      if (statusFilter !== "all") {
        if (statusFilter === "open") {
          if (row.status === "closed" || row.status === "converted_paid") return false;
        } else if (row.status !== statusFilter) {
          return false;
        }
      }
      if (!term) return true;
      const haystack = [
        row.customer_email,
        row.customer_phone ?? "",
        row.customer_name ?? "",
        row.confirmation_number ?? "",
        row.notes ?? "",
        row.internal_notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search, statusFilter]);

  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = {
      all: items.length,
      open: 0,
      new: 0,
      attempted_contact: 0,
      scheduled: 0,
      spoke_with_customer: 0,
      converted_paid: 0,
      no_answer: 0,
      closed: 0,
    };
    for (const r of items) {
      out[r.status] += 1;
      if (r.status !== "closed" && r.status !== "converted_paid") out.open += 1;
    }
    return out;
  }, [items]);

  const updateStatus = useCallback(
    async (id: string, next: Status) => {
      if (savingId) return;
      setSavingId(id);
      try {
        const patch: Partial<ConsultationRequest> = { status: next };
        if (next === "converted_paid") {
          patch.converted_order_paid_at = new Date().toISOString();
        }
        const { error: upErr } = await supabase
          .from("consultation_requests")
          .update(patch)
          .eq("id", id);
        if (upErr) throw new Error(upErr.message);
        // Optimistic local update so the UI doesn't wait for the next poll.
        setItems((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: next,
                  updated_at: new Date().toISOString(),
                  converted_order_paid_at:
                    next === "converted_paid"
                      ? new Date().toISOString()
                      : r.converted_order_paid_at,
                }
              : r,
          ),
        );
      } catch (e) {
        setError((e as Error)?.message ?? "Failed to update status");
      } finally {
        setSavingId(null);
      }
    },
    [savingId],
  );

  const saveInternalNotes = useCallback(
    async (id: string) => {
      if (savingId) return;
      setSavingId(id);
      try {
        const trimmed = internalNoteDraft.trim() || null;
        const { error: upErr } = await supabase
          .from("consultation_requests")
          .update({ internal_notes: trimmed })
          .eq("id", id);
        if (upErr) throw new Error(upErr.message);
        setItems((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, internal_notes: trimmed, updated_at: new Date().toISOString() }
              : r,
          ),
        );
      } catch (e) {
        setError((e as Error)?.message ?? "Failed to save internal notes");
      } finally {
        setSavingId(null);
      }
    },
    [internalNoteDraft, savingId],
  );

  const FILTER_CHIPS: { value: StatusFilter; label: string }[] = [
    { value: "open", label: `Open (${counts.open})` },
    { value: "new", label: `New (${counts.new})` },
    { value: "attempted_contact", label: `Attempted (${counts.attempted_contact})` },
    { value: "scheduled", label: `Scheduled (${counts.scheduled})` },
    { value: "spoke_with_customer", label: `Spoke (${counts.spoke_with_customer})` },
    { value: "no_answer", label: `No Answer (${counts.no_answer})` },
    { value: "converted_paid", label: `Converted (${counts.converted_paid})` },
    { value: "closed", label: `Closed (${counts.closed})` },
    { value: "all", label: `All (${counts.all})` },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header + actions */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">
            Consultation Recovery Funnel
          </p>
          <h2 className="text-base font-semibold text-gray-900">
            Consultation Requests
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Inbound preferred-window requests from unpaid leads. Reach out, log
            outcomes, and move them through the funnel.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {refreshing && (
            <span className="text-xs text-gray-400 inline-flex items-center gap-1">
              <i className="ri-loader-4-line animate-spin"></i> refreshing
            </span>
          )}
          <button
            type="button"
            onClick={() => void load(true)}
            className="whitespace-nowrap text-sm px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 inline-flex items-center gap-1.5"
          >
            <i className="ri-refresh-line"></i> Refresh
          </button>
        </div>
      </div>

      {/* Filter + search */}
      <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {FILTER_CHIPS.map((chip) => {
            const active = statusFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setStatusFilter(chip.value)}
                className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  active
                    ? "bg-[#3b6ea5] text-white"
                    : "text-gray-500 hover:text-[#3b6ea5] hover:bg-gray-50"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, confirmation, notes…"
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
          />
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-12 text-center text-sm text-gray-400">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <p className="mt-2">Loading consultation requests…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4 text-sm text-red-700 flex items-start gap-2">
          <i className="ri-error-warning-line mt-0.5"></i>
          <div>
            <p className="font-semibold">Could not load consultation requests.</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-12 text-center">
          <i className="ri-calendar-2-line text-3xl text-gray-300"></i>
          <p className="mt-3 text-sm font-semibold text-gray-700">
            No consultation requests in this view
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Customers can submit one at /consultation-request, or you can link
            them from the recovery email template.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="hidden md:grid md:grid-cols-12 px-4 py-2 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            <div className="col-span-3">Customer</div>
            <div className="col-span-2">Preferred</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-2">Linked Order</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Age</div>
          </div>

          <ul className="divide-y divide-gray-100">
            {filtered.map((row) => {
              const isOpen = selectedId === row.id;
              const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.new;
              return (
                <li key={row.id} className="px-4 py-3">
                  {/*
                    Row toggle: <div role="button"> instead of <button> so we
                    can nest real <button> copy actions inside (nested
                    buttons are invalid HTML). Keyboard parity preserved via
                    onKeyDown for Enter / Space.
                  */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(isOpen ? null : row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(isOpen ? null : row.id);
                      }
                    }}
                    aria-expanded={isOpen}
                    className="w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6ea5]/40 rounded-md"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-start">
                      <div className="md:col-span-3 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {row.customer_name || row.customer_email}
                        </p>
                        <p className="text-xs text-gray-500 truncate flex items-center gap-1 flex-wrap">
                          <span className="truncate">{row.customer_email}</span>
                          <CopyChip
                            value={row.customer_email}
                            label="email"
                            copyKey={`${row.id}:email`}
                            copiedKey={copiedKey}
                            onCopy={copyValue}
                          />
                          {row.customer_phone && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="truncate">{row.customer_phone}</span>
                              <CopyChip
                                value={row.customer_phone}
                                label="phone"
                                copyKey={`${row.id}:phone`}
                                copiedKey={copiedKey}
                                onCopy={copyValue}
                              />
                            </>
                          )}
                        </p>
                      </div>
                      <div className="md:col-span-2 min-w-0">
                        <p className="text-xs text-gray-700">
                          {fmtPreferredDay(row.preferred_day)}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {TIME_WINDOW_LABELS[row.preferred_time_window ?? ""] ?? "—"}
                          {row.timezone ? ` · ${row.timezone}` : ""}
                        </p>
                      </div>
                      <div className="md:col-span-2 min-w-0">
                        <p className="text-xs text-gray-700">
                          {SOURCE_LABELS[row.source_context] ?? row.source_context}
                        </p>
                        <p className="text-[11px] text-gray-400 capitalize">
                          {row.preferred_contact_method ?? "—"}
                        </p>
                      </div>
                      <div className="md:col-span-2 min-w-0">
                        {row.confirmation_number || row.order_id ? (
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-xs font-mono text-gray-700 truncate">
                              {row.confirmation_number ??
                                `${(row.order_id ?? "").slice(0, 8)}…`}
                            </p>
                            <CopyChip
                              value={row.confirmation_number ?? row.order_id ?? ""}
                              label={row.confirmation_number ? "order ID" : "order UUID"}
                              copyKey={`${row.id}:order`}
                              copiedKey={copiedKey}
                              onCopy={copyValue}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No linked order</p>
                        )}
                        {row.linked_visitor_session_id && (
                          <p className="text-[11px] text-gray-400 truncate">
                            Session {row.linked_visitor_session_id.slice(0, 8)}…
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${style.color}`}
                        >
                          <i className={style.icon}></i>
                          {style.label}
                        </span>
                      </div>
                      <div className="md:col-span-1 md:text-right">
                        <span className="text-[11px] text-gray-400">
                          {fmtAge(row.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 flex flex-col gap-3">
                      {row.notes && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                            Customer notes
                          </p>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">
                            {row.notes}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Status
                        </label>
                        <select
                          value={row.status}
                          onChange={(e) =>
                            void updateStatus(row.id, e.target.value as Status)
                          }
                          disabled={savingId === row.id}
                          className="text-xs border border-gray-200 rounded-md bg-white px-2 py-1.5 focus:outline-none focus:border-[#3b6ea5] cursor-pointer disabled:opacity-60"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_STYLES[s].label}
                            </option>
                          ))}
                        </select>
                        {(row.confirmation_number || row.order_id) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (row.order_id && onOpenOrder) {
                                onOpenOrder(row.order_id);
                              } else if (row.confirmation_number) {
                                window.location.href = `/admin-orders?tab=orders&q=${encodeURIComponent(row.confirmation_number)}`;
                              }
                            }}
                            className="whitespace-nowrap text-xs px-2.5 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 inline-flex items-center gap-1.5"
                          >
                            <i className="ri-external-link-line"></i>
                            Open linked order
                          </button>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                          Internal notes (admin-only)
                        </p>
                        <textarea
                          rows={3}
                          value={internalNoteDraft}
                          onChange={(e) => setInternalNoteDraft(e.target.value)}
                          placeholder="Log what happened on this call / outreach attempt…"
                          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:border-[#3b6ea5] resize-none"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setInternalNoteDraft(row.internal_notes ?? "")
                            }
                            className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveInternalNotes(row.id)}
                            disabled={
                              savingId === row.id ||
                              (internalNoteDraft.trim() || null) ===
                                (row.internal_notes ?? null)
                            }
                            className="whitespace-nowrap text-xs px-3 py-1.5 rounded-md bg-[#3b6ea5] text-white hover:bg-[#2e5a87] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            {savingId === row.id ? (
                              <>
                                <i className="ri-loader-4-line animate-spin"></i>
                                Saving…
                              </>
                            ) : (
                              <>
                                <i className="ri-save-line"></i>
                                Save note
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Tiny icon-only copy action used inline next to a value. Stops click /
// keyboard propagation so it never toggles the row-detail drawer it's
// nested inside. Briefly flips to a check + emerald tint after a
// successful copy.
interface CopyChipProps {
  value: string;
  label: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void;
}

function CopyChip({ value, label, copyKey, copiedKey, onCopy }: CopyChipProps) {
  if (!value) return null;
  const isCopied = copiedKey === copyKey;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCopy(value, copyKey);
      }}
      onKeyDown={(e) => {
        // Prevent the parent role="button" row from toggling on Enter/Space.
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      title={isCopied ? `${label} copied` : `Copy ${label}`}
      aria-label={isCopied ? `${label} copied` : `Copy ${label}`}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[11px] cursor-pointer transition-colors flex-shrink-0 ${
        isCopied
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-gray-200 bg-white text-gray-400 hover:text-[#3b6ea5] hover:border-[#c9dcf0] hover:bg-[#f4f8fc]"
      }`}
    >
      <i className={isCopied ? "ri-check-line" : "ri-file-copy-line"}></i>
    </button>
  );
}
