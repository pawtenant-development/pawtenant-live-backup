// PartnerPlatformWorkspace — PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// The dedicated Partner Platform workspace: one place for everything B2B —
// partner orders, wholesale finance, integration observability and the
// Stripe-like management surface (organizations, environments, API keys,
// webhooks, sandbox handoff).
//
// WHY A WORKSPACE INSIDE THE ADMIN SHELL
// The Admin Portal is a single-page shell (/admin-orders) whose left-nav
// items are ?tab= values — that is the canonical routing pattern for every
// admin surface (see /admin-chats, which redirects into a tab the same way).
// This workspace is the "partners" tab; /admin-partners redirects here so the
// memorable URL works too. Sub-tabs bind to ?ptab= with PUSH navigation so
// refresh, Back/forward and saved links all work.
//
// PARTNER SCOPE — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
// The workspace opens on "All partners". No organization is ever selected
// silently: the ONLY way a partner becomes selected is an explicit choice in
// the header (or the Settings table), which is written to the URL as
// ?partner=<id>, so a refresh or a shared link restores exactly that scope and
// nothing else. An unknown or stale id in the URL falls back to "All
// partners" rather than to the first row. Overview, Orders and Finance
// aggregate across every partner when nothing is selected; Integration and
// the per-partner Settings panels ask for a selection.
//
// Nothing here weakens a slice rule: partner orders still expose no customer
// contact or payment affordance, providers/customers still see none of this
// (RLS + is_chat_admin-gated RPCs server-side), and secrets appear exactly
// once at mint time.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../../../lib/supabaseClient";
import type { Order } from "../../types";
import PartnerOrdersTab from "../PartnerOrdersTab";
import PartnerOverviewTab from "./PartnerOverviewTab";
import PartnerFinanceTab from "./PartnerFinanceTab";
import PartnerIntegrationTab from "./PartnerIntegrationTab";
import PartnerSettingsTab from "./PartnerSettingsTab";
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — structured form.
import PartnerAdminOrderIntake from "./PartnerAdminOrderIntake";
import { PARTNER_ORG_COLUMNS, type PartnerOrg, orgStatusView, Badge, EmptyState } from "./shared";

export type PartnerPlatformSubTab = "overview" | "orders" | "finance" | "integration" | "settings";

const SUB_TABS: { key: PartnerPlatformSubTab; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "ri-dashboard-2-line" },
  { key: "orders", label: "Orders", icon: "ri-file-list-3-line" },
  { key: "finance", label: "Finance", icon: "ri-money-dollar-circle-line" },
  { key: "integration", label: "Integration", icon: "ri-plug-line" },
  { key: "settings", label: "Settings", icon: "ri-settings-3-line" },
];

/** The header option that means "every partner organization". */
export const ALL_PARTNERS_LABEL = "All partners";

function isSubTab(v: string | null): v is PartnerPlatformSubTab {
  return !!v && SUB_TABS.some((t) => t.key === v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PartnerPlatformWorkspaceProps {
  /** The canonical order-opening controller from page.tsx (no second modal). */
  onOpenOrder: (order: Order) => void;
  /** Projection shared with the retail list (PartnerOrdersTab needs it). */
  listColumns: string;
  /** Bumped by the parent after a mutation so lists refetch. */
  reloadToken?: number;
}

export default function PartnerPlatformWorkspace({
  onOpenOrder,
  listColumns,
  reloadToken = 0,
}: PartnerPlatformWorkspaceProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Sub-tab ⇄ URL binding (?ptab=). PUSH so Back/forward step through
  // sub-tab history; the state syncs FROM the URL so both directions work.
  const sub: PartnerPlatformSubTab = (() => {
    try {
      const v = new URLSearchParams(location.search).get("ptab");
      return isSubTab(v) ? v : "overview";
    } catch {
      return "overview";
    }
  })();

  const setSub = useCallback((next: PartnerPlatformSubTab) => {
    try {
      const params = new URLSearchParams(location.search);
      if (next === "overview") params.delete("ptab");
      else params.set("ptab", next);
      const qs = params.toString();
      navigate(`/admin-orders${qs ? `?${qs}` : ""}`);
    } catch { /* URL sync is a convenience; never block the switch */ }
  }, [location.search, navigate]);

  // ── Partner scope ⇄ URL binding (?partner=<id>). The URL is the ONLY memory
  // of a selection: nothing is kept in component state or storage, so a fresh
  // load without the parameter is always "All partners".
  const urlPartnerId: string | null = (() => {
    try {
      const v = new URLSearchParams(location.search).get("partner");
      return v && UUID_RE.test(v) ? v : null;
    } catch {
      return null;
    }
  })();

  const setSelectedId = useCallback((next: string | null) => {
    try {
      const params = new URLSearchParams(location.search);
      if (next) params.set("partner", next);
      else params.delete("partner");
      const qs = params.toString();
      navigate(`/admin-orders${qs ? `?${qs}` : ""}`, { replace: true });
    } catch { /* URL sync is a convenience; never block the switch */ }
  }, [location.search, navigate]);

  // ── Partner organizations (admin RLS read; full display projection). ──────
  const [orgs, setOrgs] = useState<PartnerOrg[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [orgReload, setOrgReload] = useState(0);
  const reloadOrgs = useCallback(() => setOrgReload((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("partner_organizations")
        .select(PARTNER_ORG_COLUMNS)
        .order("display_name");
      if (!cancelled) {
        setOrgs((data as unknown as PartnerOrg[]) ?? []);
        setOrgsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [orgReload]);

  const selectable = useMemo(() => orgs.filter((o) => o.status !== "terminated"), [orgs]);
  // Only an id that names a real, selectable organization counts. Anything
  // else — no parameter, an unknown id, an archived partner — is All partners.
  const selected = useMemo(
    () => (urlPartnerId ? selectable.find((o) => o.id === urlPartnerId) ?? null : null),
    [selectable, urlPartnerId],
  );

  const envBadge = selected ? orgStatusView(selected) : null;

  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the legacy PDF upload is
  // RETIRED. No button, no wizard, no intake table on this tab; the server
  // refuses the actions too (partner-manual-intake → 410). Historical records
  // are read-only under Settings → Legacy PDF intake history.
  const [intakeOpen, setIntakeOpen] = useState(false);       // structured form
  const [intakeReload, setIntakeReload] = useState(0);

  return (
    <div className="space-y-4">
      {/* ── Workspace header: identity + partner scope ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Partner Platform</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            B2B clinical fulfillment — partner orders, wholesale billing and API integration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {envBadge && <Badge label={envBadge.label} tone={envBadge.tone} />}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="hidden sm:inline text-xs font-medium text-gray-500">Partner</span>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              aria-label="Partner scope"
            >
              <option value="">{ALL_PARTNERS_LABEL}</option>
              {selectable.map((o) => (
                <option key={o.id} value={o.id}>{o.display_name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ── Sub-tab navigation (URL-addressable) ──────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200" role="tablist" aria-label="Partner Platform">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={sub === t.key}
            onClick={() => setSub(t.key)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors ${
              sub === t.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <i className={`${t.icon} text-base`}></i>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Active sub-tab ────────────────────────────────────────────────── */}
      {sub === "overview" && (
        <PartnerOverviewTab partner={selected} orgs={selectable} orgsLoaded={orgsLoaded} onGoTo={setSub} />
      )}
      {sub === "orders" && (
        <>
          <PartnerOrdersTab
            onOpenOrder={onOpenOrder}
            listColumns={listColumns}
            partnerId={selected?.id ?? null}
            reloadToken={reloadToken + intakeReload}
            headerAction={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIntakeOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <i className="ri-file-add-line"></i> New Partner Order
                </button>
              </div>
            }
          />
          <PartnerAdminOrderIntake
            open={intakeOpen}
            partners={orgs}
            preselect={selected}
            onClose={() => setIntakeOpen(false)}
            onOrderCreated={() => setIntakeReload((n) => n + 1)}
          />
        </>
      )}
      {sub === "finance" && <PartnerFinanceTab partners={orgs} selected={selected} />}
      {sub === "integration" && (
        selected
          ? <PartnerIntegrationTab partners={orgs} selected={selected} />
          : <EmptyState title="Select a partner" hint="API keys, webhooks and request history belong to one organization. Choose a partner in the header to view its integration." />
      )}
      {sub === "settings" && (
        <PartnerSettingsTab
          orgs={orgs}
          selected={selected}
          onSelect={setSelectedId}
          onOrgsChanged={reloadOrgs}
          onOpenOrderId={(orderId) => {
            void supabase.from("orders").select(listColumns).eq("order_origin", "partner").eq("id", orderId).maybeSingle()
              .then(({ data }) => { if (data) onOpenOrder(data as unknown as Order); });
          }}
        />
      )}
    </div>
  );
}
