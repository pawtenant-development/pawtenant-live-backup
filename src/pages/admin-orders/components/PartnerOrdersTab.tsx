// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — slice 3.
//
// The segregated Partner Orders workspace.
//
// WHY THIS IS A SEPARATE SURFACE RATHER THAN A FILTER ON THE RETAIL GRID
// A partner order is wholesale fulfillment work, not a retail sale. Almost
// every column the retail grid exists to show — price, Stripe state, coupon,
// refund, sequence stage, GHL sync, attribution — is either NULL or meaningless
// for a partner order, and several of them would be actively WRONG (a partner
// order rendered in a "$0 / unpaid" cell reads as a lost sale). So this surface
// shows the columns that are true for fulfillment work and nothing else.
//
// WHAT IT REUSES (nothing here is a second implementation):
//   * applyListPredicates / fetchListScopeTotal from orderFacetCounts.ts — the
//     SAME predicate builder the retail list uses, so the total and the rows
//     cannot disagree. Origin segregation is structural, not a chip.
//   * ORDERS_LIST_COLUMNS + the deterministic (basis, created_at, id) ordering.
//   * The caller's openOrderDetail controller and the existing OrderDetailModal.
//     No second modal, no second URL handler.
//
// WHAT IT DELIBERATELY DOES NOT DO
//   * No customer-contact affordance of any kind (no SMS, email, GHL retry,
//     checkout recovery, resend). Those actions target the PARTNER'S customer,
//     and the partner owns that relationship. The functions themselves are
//     gated in a later slice; this surface simply never offers them.
//   * No wholesale fee, provider earning or margin. Partner finance is admin-
//     only and arrives in its own slice.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  applyListPredicates,
  fetchListScopeTotal,
  type FacetFilters,
} from "../orderFacetCounts";
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — the ONE partner-order
// predicate, shared with the Overview cards so a card count IS this list.
import { partnerOrdersFilters } from "../partnerOrderScope";
import type { Order } from "../types";
// ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001-CLOSURE — the same ESA-only gate
// public.order_workflow_state() applies, so this mirror cannot drift from the
// server classifier that partner_clinical_state() composes.
import { thirtyDayMarkersApply } from "../../../lib/serviceFamily";

/** Page size. Matches the retail list so paging behaviour is familiar. */
const PARTNER_PAGE_SIZE = 50;

export interface PartnerOrganizationOption {
  id: string;
  slug: string;
  display_name: string;
}

// How the partner order arrived. PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-
// ASSESSMENT-002 added a THIRD method: an order typed into the structured form.
// Before this map, anything that was not the literal string "manual" fell
// through to "api", so every portal order was mislabelled API in Admin Orders.
const INTAKE_METHOD_LABELS: Record<string, string> = {
  api: "api",
  manual: "pdf",
  partner_portal_manual: "portal",
};

interface PartnerOrdersTabProps {
  /** The canonical order-opening controller from page.tsx. */
  onOpenOrder: (order: Order) => void;
  /** Projection shared with the retail list. */
  listColumns: string;
  /** Bumped by the parent after a mutation so the list refetches. */
  reloadToken?: number;
  /** PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001 — header action slot
   *  (the workspace mounts the admin-only "New Partner Order" button here). */
  headerAction?: ReactNode;
  /** Workspace partner scope (URL ?partner=); null = every partner. */
  partnerId?: string | null;
}

type WorkflowValue =
  | "all" | "received" | "ready_for_assignment" | "provider_review"
  | "consultation_required" | "document_ready" | "clinical_work_completed"
  | "correction_required" | "cancelled";

const WORKFLOW_OPTIONS: { value: WorkflowValue; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "received", label: "Received" },
  { value: "ready_for_assignment", label: "Ready for assignment" },
  { value: "provider_review", label: "Provider review" },
  { value: "consultation_required", label: "Consultation required" },
  { value: "document_ready", label: "Document ready" },
  { value: "clinical_work_completed", label: "Clinical work completed" },
  { value: "correction_required", label: "Correction required" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * The partner workflow state for a row.
 *
 * Mirrors public.partner_clinical_state(orders) exactly. It is derived on the
 * client for DISPLAY only; every count and every filter on this screen is
 * computed server-side by the shared predicate builder, so this function can
 * never be the reason a number disagrees with a list.
 */
export function partnerWorkflowState(o: Order): WorkflowValue {
  if (o.status === "cancelled") return "cancelled";
  if (o.doctor_status === "patient_notified") return "clinical_work_completed";
  if (o.doctor_status === "pending_admin_approval") return "document_ready";
  // ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001-CLOSURE — `correction_required`
  // exists ONLY because of the 30-day official-letter rule, and
  // public.partner_clinical_state() reaches it by composing
  // public.order_workflow_state(), whose 30-day arm is now ESA-only. Without the
  // same gate here the client mirror would claim `correction_required` for a
  // non-ESA partner order carrying a stale marker while the server said
  // `provider_review` — exactly the drift this function's contract forbids.
  if (thirtyDayMarkersApply(o)
      && o.official_letter_reopened_at && !o.official_letter_final_completed_at) return "correction_required";
  if (o.doctor_user_id || o.doctor_email) {
    return o.additional_documentation_required && o.additional_documentation_status !== "completed"
      ? "consultation_required"
      : "provider_review";
  }
  if (o.paid_at) return "ready_for_assignment";
  return "received";
}

const WORKFLOW_TONE: Record<WorkflowValue, string> = {
  all: "bg-gray-100 text-gray-700 ring-gray-200",
  received: "bg-slate-100 text-slate-700 ring-slate-200",
  ready_for_assignment: "bg-amber-50 text-amber-800 ring-amber-200",
  provider_review: "bg-blue-50 text-blue-700 ring-blue-200",
  consultation_required: "bg-purple-50 text-purple-700 ring-purple-200",
  document_ready: "bg-teal-50 text-teal-700 ring-teal-200",
  clinical_work_completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  correction_required: "bg-orange-50 text-orange-800 ring-orange-200",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-200",
};

function workflowLabel(v: WorkflowValue): string {
  return WORKFLOW_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/** Compact relative age, e.g. "3h", "2d". */
function ageLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function fullName(o: Order): string {
  return [o.first_name, o.last_name].filter(Boolean).join(" ") || "—";
}

export default function PartnerOrdersTab({
  onOpenOrder,
  listColumns,
  reloadToken = 0,
  headerAction,
  partnerId = null,
}: PartnerOrdersTabProps) {
  const [partners, setPartners] = useState<PartnerOrganizationOption[]>([]);
  // The partner scope is the WORKSPACE header's choice (URL ?partner=), never a
  // second selector here: null = All partners.
  const partnerFilter = partnerId ?? "all";
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowValue>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: filters are collapsed by
  // default; the toggle shows how many are active while collapsed.
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

  const [rows, setRows] = useState<Order[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const requestRef = useRef(0);

  // Debounce the search so the rows and the total fire on the same keystroke
  // boundary rather than chasing each other.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Partner list for the chip + the Partner filter. Reads only the display
  // identity — never a credential, never an internal-only field.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("partner_organizations")
        .select("id, slug, display_name")
        .order("display_name");
      if (!cancelled && data) setPartners(data as PartnerOrganizationOption[]);
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * THE filter set for this workspace.
   *
   * orderOrigin is pinned to "partner". Every consumer of this object — the row
   * query and the scope total — therefore shares one origin predicate, which is
   * what makes count-to-list parity structural rather than a convention.
   */
  const filters = useMemo<FacetFilters>(() => partnerOrdersFilters(partnerId, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    state: stateFilter,
    assignedProvider: assignmentFilter === "unassigned" ? "unassigned" : "all",
    search: search || undefined,
  }), [partnerId, dateFrom, dateTo, stateFilter, assignmentFilter, search]);

  /**
   * Filters the shared builder cannot express, applied on top of the SAME
   * query object — never by filtering rows in the browser, which is how a list
   * and its total drift apart.
   */
  const applyPartnerOnlyPredicates = useCallback(<T,>(q: T): T => {
    let out = q as unknown as ReturnType<ReturnType<typeof supabase.from>["select"]>;
    if (serviceFilter !== "all") out = out.eq("letter_type", serviceFilter);
    if (assignmentFilter === "assigned") out = out.not("doctor_email", "is", null);
    return out as unknown as T;
  }, [serviceFilter, assignmentFilter]);

  const queryKey = useMemo(
    () => JSON.stringify([filters, serviceFilter, assignmentFilter, workflowFilter, reloadToken]),
    [filters, serviceFilter, assignmentFilter, workflowFilter, reloadToken],
  );

  const fetchPage = useCallback(async (pageIndex: number): Promise<Order[]> => {
    const from = pageIndex * PARTNER_PAGE_SIZE;
    const base = applyPartnerOnlyPredicates(
      applyListPredicates(supabase.from("orders").select(listColumns), filters, "all"),
    );
    // Deterministic ordering — without the (created_at, id) tie-breakers two
    // rows sharing a timestamp can swap pages and produce a duplicate on one
    // page and a missing row on the next.
    const { data, error: err } = await base
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PARTNER_PAGE_SIZE - 1);
    if (err) throw err;
    return (data as unknown as Order[]) ?? [];
  }, [applyPartnerOnlyPredicates, filters, listColumns]);

  useEffect(() => {
    const token = ++requestRef.current;
    pageRef.current = 0;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [page, scopeTotal] = await Promise.all([
          fetchPage(0),
          fetchListScopeTotal(
            filters,
            "all",
          ).then(async (t) => {
            // The shared helper cannot see the partner-only predicates, so when
            // one is active we re-count through the SAME predicate chain the
            // rows used. A total produced any other way would be a second
            // implementation, and second implementations drift.
            if (serviceFilter === "all" && assignmentFilter !== "assigned") return t;
            const { count } = await applyPartnerOnlyPredicates(
              applyListPredicates(
                supabase.from("orders").select("id", { count: "exact", head: true }),
                filters,
                "all",
              ),
            );
            return count ?? null;
          }),
        ]);
        if (token !== requestRef.current) return;
        setRows(page);
        setTotal(scopeTotal);
        setHasMore(page.length === PARTNER_PAGE_SIZE);
      } catch (e) {
        if (token !== requestRef.current) return;
        console.error("[partner-orders] list query failed:", e);
        setError("Could not load partner orders.");
        setRows([]);
        setTotal(null);
        setHasMore(false);
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const loadMore = useCallback(async () => {
    const token = requestRef.current;
    try {
      const next = pageRef.current + 1;
      const page = await fetchPage(next);
      if (token !== requestRef.current) return;
      pageRef.current = next;
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PARTNER_PAGE_SIZE);
    } catch (e) {
      console.error("[partner-orders] load-more failed:", e);
    }
  }, [fetchPage]);

  // Workflow status is derived from columns the server already returned, so it
  // is applied to the fetched page rather than as a WHERE clause. The visible
  // count is labelled accordingly — it never claims to be a dataset total.
  const visibleRows = useMemo(
    () => (workflowFilter === "all" ? rows : rows.filter((o) => partnerWorkflowState(o) === workflowFilter)),
    [rows, workflowFilter],
  );

  const partnerName = useCallback((o: Order): string => {
    const p = partners.find((x) => x.id === o.partner_id);
    return p?.display_name ?? "Partner";
  }, [partners]);

  const states = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((o) => { if (o.state) s.add(o.state); });
    return Array.from(s).sort();
  }, [rows]);

  const resetFilters = () => {
    setServiceFilter("all"); setWorkflowFilter("all");
    setAssignmentFilter("all"); setStateFilter("all");
    setDateFrom(""); setDateTo(""); setSearchInput("");
  };

  const activeFilterCount = [ serviceFilter !== "all", workflowFilter !== "all",
    assignmentFilter !== "all", stateFilter !== "all", Boolean(dateFrom) || Boolean(dateTo),
    Boolean(search),
  ].filter(Boolean).length;
  const filtersActive = activeFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Partner Orders</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Wholesale clinical fulfillment. The partner owns customer payment, support and communication.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
            Partner funded
          </span>
          <span className="tabular-nums">
            {total === null ? "—" : `${total} order${total === 1 ? "" : "s"}`}
          </span>
          {headerAction}
        </div>
      </div>

      {/* ── Filters (collapsible, collapsed by default) ────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="partner-orders-filters"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <i className="ri-filter-3-line"></i>
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilterCount}</span>
            )}
            <i className={`ri-arrow-down-s-line transition-transform ${filtersOpen ? "rotate-180" : ""}`}></i>
          </button>
          {filtersActive && (
            <button
              type="button" onClick={resetFilters}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
        </div>
        {filtersOpen && (
        <div id="partner-orders-filters" className="border-t border-gray-100 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2 lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Search</span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Confirmation ID, partner order ID, name, email, phone"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Service</span>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="all">ESA and PSD</option>
              <option value="esa">ESA</option>
              <option value="psd">PSD</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Workflow status</span>
            <select
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value as WorkflowValue)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {WORKFLOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Provider</span>
            <select
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="all">Any assignment</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">State</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="all">All states</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">From</span>
              <input
                type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">To</span>
              <input
                type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </label>
          </div>
        </div>

        {workflowFilter !== "all" && (
          <p className="mt-3 text-xs text-gray-500">
            Workflow status filters the loaded rows ({visibleRows.length} of {rows.length} shown).
          </p>
        )}
        </div>
        )}
      </div>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading && rows.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          Loading partner orders…
        </div>
      )}

      {!loading && !error && visibleRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-gray-900">No partner orders</p>
          <p className="mt-1 text-sm text-gray-500">
            {filtersActive
              ? "No partner order matches these filters."
              : "Partner orders appear here once a partner submits through the fulfillment API or an admin creates one from the partner's paid-order PDF."}
          </p>
        </div>
      )}

      {visibleRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Partner</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.map((o) => {
                const wf = partnerWorkflowState(o);
                return (
                  <tr
                    key={o.id}
                    onClick={() => onOpenOrder(o)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenOrder(o); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open order ${o.confirmation_id}`}
                    className="cursor-pointer transition-colors hover:bg-indigo-50/40 focus:outline-none focus-visible:bg-indigo-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-gray-900">{fullName(o)}</div>
                      <div className="mt-0.5 font-mono text-xs text-gray-500">{o.confirmation_id}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                        {partnerName(o)}
                      </span>
                      <div className="mt-1 font-mono text-[11px] text-gray-500">
                        {o.partner_order_id ?? "—"}
                        <span className="ml-1 rounded bg-gray-100 px-1 font-sans text-[10px] uppercase tracking-wide text-gray-500">
                          {INTAKE_METHOD_LABELS[o.partner_intake_method ?? "api"] ?? "api"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-700">
                        {(o.letter_type ?? "esa")}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${WORKFLOW_TONE[wf]}`}>
                        {workflowLabel(wf)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700">
                      {o.doctor_name || o.doctor_email || (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700">{o.state ?? "—"}</td>
                    <td className="px-4 py-3 align-top text-gray-600">
                      {o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-gray-600">
                      {ageLabel(o.last_meaningful_activity_at ?? o.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && workflowFilter === "all" && (
        <div className="flex justify-center">
          <button
            type="button" onClick={() => void loadMore()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Load more
          </button>
        </div>
      )}

      {/* PARTNER-PLATFORM-ADMIN-WORKSPACE-001: the Slice 7 finance surface and
          the Slice 8 integration surface moved to their own sub-tabs of the
          Partner Platform workspace (Finance / Integration). This list is now
          purely the Orders experience — no stacked panels below it. */}
    </div>
  );
}
