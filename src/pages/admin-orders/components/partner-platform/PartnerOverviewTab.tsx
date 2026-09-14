// PartnerOverviewTab — PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// The non-technical owner's dashboard: how much partner work is in the
// building, what needs attention, and what is owed.
//
// SCOPE — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
// `partner` is null for "All partners" (the default) and every number below
// then aggregates every organization; with a partner selected every number
// narrows to that organization. There is no "first partner" default.
//
// ONE PREDICATE. The Partner orders / Completed / Needs action counts go
// through `partnerOrderScope`, the same builder the Orders sub-tab's list and
// total use, and they count the FULL scope server-side — not the eight recent
// rows shown underneath. A card can therefore never disagree with the list it
// opens.
//
// EVIDENCE DISCIPLINE — every figure is derived from authoritative data:
//   * Documents ready keys on minted `partner_document_releases` rows.
//   * Unbilled amount = charge events that sit on no line of a non-void invoice.
//   * Outstanding invoices = issued / partially paid with a balance.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import type { PartnerPlatformSubTab } from "./PartnerPlatformWorkspace";
import { type PartnerOrg, orgStatusView, money, Badge, EmptyState } from "./shared";
import {
  PARTNER_WORKFLOW_PREDICATES,
  applyPartnerScope,
  countPartnerOrders,
  partnerOrdersFilters,
} from "../../partnerOrderScope";
import { applyListPredicates } from "../../orderFacetCounts";

interface RecentOrderRow {
  id: string;
  confirmation_id: string;
  partner_id: string | null;
  partner_order_id: string | null;
  letter_type: string | null;
  status: string | null;
  doctor_status: string | null;
  doctor_email: string | null;
  paid_at: string | null;
  created_at: string;
}

interface EventRow { id: string; event_kind: string; amount_cents: number; partner_id: string }
interface LineRow { billable_event_id: string; invoice_id: string }
interface AgingRow { id: string; partner_id: string; status: string; balance_cents: number }

interface Counts {
  total: number | null;
  completed: number | null;
  needsAction: number | null;
  documentsReady: number | null;
}

function StatCard({ label, value, sub, tone = "text-gray-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

const n = (v: number | null) => (v === null ? "—" : String(v));

export default function PartnerOverviewTab({
  partner, orgs, orgsLoaded, onGoTo,
}: {
  /** null = All partners. */
  partner: PartnerOrg | null;
  /** Every selectable organization, for names and the all-partners card. */
  orgs: PartnerOrg[];
  orgsLoaded: boolean;
  onGoTo: (tab: PartnerPlatformSubTab) => void;
}) {
  const [counts, setCounts] = useState<Counts>({ total: null, completed: null, needsAction: null, documentsReady: null });
  const [recent, setRecent] = useState<RecentOrderRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [invoices, setInvoices] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const partnerId = partner?.id ?? null;

  const load = useCallback(async (pid: string | null) => {
    setLoading(true);
    setError("");
    try {
      // The recent rows use the SAME funnel (origin + partner scope) as the
      // counts and the Orders list — partnerId travels inside the filters.
      const recentQuery = applyListPredicates(
        supabase.from("orders")
          .select("id, confirmation_id, partner_id, partner_order_id, letter_type, status, doctor_status, doctor_email, paid_at, created_at"),
        partnerOrdersFilters(pid),
        "all",
      ).order("created_at", { ascending: false }).limit(8);
      const releasesQuery = applyPartnerScope(
        supabase.from("partner_document_releases").select("id", { count: "exact", head: true }),
        pid,
      );
      const [total, completed, needsAction, rel, ro, ev, ln, inv] = await Promise.all([
        countPartnerOrders(pid),
        countPartnerOrders(pid, PARTNER_WORKFLOW_PREDICATES.completed),
        countPartnerOrders(pid, PARTNER_WORKFLOW_PREDICATES.needsAction),
        releasesQuery,
        recentQuery,
        applyPartnerScope(supabase.from("partner_billable_events").select("id, event_kind, amount_cents, partner_id"), pid).limit(1000),
        supabase.from("partner_invoice_lines").select("billable_event_id, invoice_id").limit(2000),
        applyPartnerScope(supabase.from("partner_invoice_aging").select("id, partner_id, status, balance_cents"), pid).limit(500),
      ]);
      const firstErr = [rel, ro, ev, ln, inv].find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
      setCounts({ total, completed, needsAction, documentsReady: rel.count ?? 0 });
      setRecent((ro.data as unknown as RecentOrderRow[]) ?? []);
      setEvents((ev.data as EventRow[]) ?? []);
      setLines((ln.data as LineRow[]) ?? []);
      setInvoices((inv.data as AgingRow[]) ?? []);
    } catch (e) {
      console.error("[partner-overview] load failed:", e);
      setError("Could not load the partner overview (admin access required).");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orgsLoaded) void load(partnerId);
  }, [partnerId, orgsLoaded, load]);

  // Unbilled = charge events that sit on no line of a NON-void invoice.
  const unbilledCents = useMemo(() => {
    const nonVoid = new Set(invoices.filter((i) => i.status !== "void").map((i) => i.id));
    const billed = new Set(lines.filter((l) => nonVoid.has(l.invoice_id)).map((l) => l.billable_event_id));
    return events.filter((e) => e.event_kind === "charge" && !billed.has(e.id))
      .reduce((acc, e) => acc + e.amount_cents, 0);
  }, [events, lines, invoices]);

  const outstanding = useMemo(
    () => invoices.filter((i) => (i.status === "issued" || i.status === "partially_paid") && i.balance_cents > 0),
    [invoices],
  );

  const orgName = useCallback(
    (id: string | null) => orgs.find((o) => o.id === id)?.display_name ?? "—",
    [orgs],
  );

  if (!orgsLoaded) {
    return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">Loading…</div>;
  }
  if (orgs.length === 0) {
    return (
      <EmptyState
        title="No partner organizations yet"
        hint="Create the first partner under Settings → Partner organizations."
      />
    );
  }

  const st = partner ? orgStatusView(partner) : null;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* ── Status cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-partner-overview-scope={partnerId ?? "all"}>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Partner</p>
          <p className="mt-1 truncate text-lg font-bold text-gray-900">{partner ? partner.display_name : "All partners"}</p>
          <div className="mt-1">
            {st
              ? <Badge label={st.label} tone={st.tone} />
              : <span className="text-xs text-gray-500">{orgs.length} organization{orgs.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <StatCard
          label="Partner orders"
          value={loading && counts.total === null ? "…" : n(counts.total)}
          sub={`${n(counts.completed)} completed · ${n(counts.needsAction)} need action`}
        />
        <StatCard
          label="Documents ready"
          value={n(counts.documentsReady)}
          sub="releases minted for partner retrieval"
        />
        <StatCard
          label="Unbilled amount"
          value={money(unbilledCents)}
          sub="completed work not yet on an invoice"
          tone={unbilledCents > 0 ? "text-amber-700" : "text-gray-900"}
        />
        <StatCard
          label="Outstanding invoices"
          value={String(outstanding.length)}
          sub={money(outstanding.reduce((a, i) => a + i.balance_cents, 0)) + " open balance"}
          tone={outstanding.length > 0 ? "text-amber-700" : "text-gray-900"}
        />
        <StatCard
          label="Needs action"
          value={n(counts.needsAction)}
          sub="unassigned, or a document awaiting review"
          tone={(counts.needsAction ?? 0) > 0 ? "text-amber-700" : "text-gray-900"}
        />
      </div>

      {/* ── Recent partner orders ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Recent partner orders</h3>
          <button
            type="button"
            onClick={() => onGoTo("orders")}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Open Orders →
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyState title="No partner orders yet" hint="Orders appear here once one is created with New Partner Order or received through the partner API." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2 font-medium">Order</th>
                  {!partner && <th className="px-4 py-2 font-medium">Partner</th>}
                  <th className="px-4 py-2 font-medium">Partner ref</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Clinical state</th>
                  <th className="px-4 py-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map((o) => (
                  <tr key={o.id} tabIndex={0} role="link" onClick={() => onGoTo("orders")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGoTo("orders"); } }}
                    className="cursor-pointer hover:bg-indigo-50/40 focus:outline-none focus-visible:bg-indigo-50/60">
                    <td className="px-4 py-2 font-mono text-xs">{o.confirmation_id}</td>
                    {!partner && <td className="px-4 py-2 text-xs text-gray-700">{orgName(o.partner_id)}</td>}
                    <td className="px-4 py-2 font-mono text-xs">
                      {o.partner_order_id && !o.partner_order_id.startsWith("portal-") ? o.partner_order_id : "—"}
                    </td>
                    <td className="px-4 py-2 uppercase">{o.letter_type ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">
                      {o.status === "cancelled" ? "Cancelled"
                        : o.doctor_status === "patient_notified" ? "Completed"
                        : o.doctor_status === "pending_admin_approval" ? "Document ready — needs review"
                        : o.doctor_email ? "With provider"
                        : o.paid_at ? "Ready for assignment" : "Received"}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
