/**
 * CommunicationsHub — Phase A shell.
 *
 * One umbrella view that hosts the future six communications sub-areas:
 *   1. Live Visitors  (FUNCTIONAL — wired to LiveVisitorsPanel)
 *   2. Chats          (placeholder — existing sidebar "Chats" tab remains active)
 *   3. Emails         (placeholder — existing "Contacts" tab remains active)
 *   4. SMS / Calls    (placeholder)
 *   5. Templates      (placeholder)
 *   6. Settings / Automation (placeholder)
 *
 * URL contract:
 *   /admin-orders?tab=communications&sub=<live|chats|emails|sms|templates|settings>
 *
 * Behavior:
 *   - The sub-tab is read from the URL and written back on click.
 *   - If sub is missing or unknown, defaults to "live".
 *   - Sub-tab strip is read-only style today (no badges yet).
 *
 * Out of scope for Phase A/B (deliberately not implemented here):
 *   - moving Chats / Contacts / Comms bodies into this hub
 *   - hiding the old sidebar entries
 *   - role-based sub-tab visibility (all six sub-tabs render for any admin)
 *   - sounds, notifications, realtime, drawers, visitor actions
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LiveVisitorsPanel from "./LiveVisitorsPanel";
import ChatsTab from "./ChatsTab";
import ContactRequestsTab from "./ContactRequestsTab";
import CommunicationsPanel from "./CommunicationsPanel";
import ConsultationRequestsPanel from "./ConsultationRequestsPanel";
import BroadcastModal from "./BroadcastModal";
import BroadcastHistoryModal from "./BroadcastHistoryModal";
import { canAccessBroadcast } from "../../../lib/adminPermissions";
import CommunicationsTemplatesPanel, {
  RecoverySequencePanel,
} from "./CommunicationsTemplatesPanel";
import AdminNotificationPrefsPanel from "./AdminNotificationPrefsPanel";
import AiSupportCenterPanel from "./AiSupportCenterPanel";
import CommandCenterPanel from "./commandCenter/CommandCenterPanel";
import { useAiSupportPendingCount } from "../../../hooks/useAiSupportPendingCount";
import { useCurrentAdminRole } from "../../../hooks/useCurrentAdminRole";
import { getAdminIdentity, type AdminIdentity } from "../../../lib/adminIdentity";

// Reuse CommunicationsPanel's prop shape so the hub never drifts from
// what the underlying panel expects. Both fields are optional; the SMS
// sub-tab degrades to an empty orders list if a parent forgets to pass
// them (single source of truth is admin-orders/page.tsx today).
type CommunicationsPanelProps = ComponentProps<typeof CommunicationsPanel>;
type HubOrders = CommunicationsPanelProps["orders"];
type HubOnViewOrder = CommunicationsPanelProps["onViewOrder"];

type SubKey = "inbox" | "live" | "chats" | "emails" | "sms" | "ai" | "consultations" | "templates" | "settings";

const SUB_KEYS: SubKey[] = ["inbox", "live", "chats", "emails", "sms", "ai", "consultations", "templates", "settings"];
const DEFAULT_SUB: SubKey = "live";

// Phase G2 — basic-access sub-tabs available to support / finance /
// read_only roles by default. Templates + Settings stay restricted to
// owner / admin_manager unless explicitly granted via custom_tab_access.
// Consultations is included in the basic set so the care team (support
// role) can work the consultation recovery funnel without extra grants.
const BASIC_SUBS: SubKey[] = ["inbox", "live", "chats", "emails", "sms", "ai", "consultations"];

const SUB_CONFIG: { key: SubKey; label: string; icon: string }[] = [
  { key: "inbox",         label: "Command Center",        icon: "ri-layout-grid-line" },
  { key: "live",          label: "Live Visitors",         icon: "ri-pulse-line" },
  { key: "chats",         label: "Chats",                 icon: "ri-chat-3-line" },
  { key: "emails",        label: "Emails",                icon: "ri-mail-line" },
  { key: "sms",           label: "SMS / Calls",           icon: "ri-message-3-line" },
  { key: "ai",            label: "AI Support",            icon: "ri-robot-2-line" },
  { key: "consultations", label: "Consultations",         icon: "ri-calendar-check-line" },
  { key: "templates",     label: "Templates",             icon: "ri-file-list-3-line" },
  { key: "settings",      label: "Settings & Automation", icon: "ri-settings-3-line" },
];

function isSubKey(v: string | null): v is SubKey {
  return !!v && (SUB_KEYS as string[]).includes(v);
}

/**
 * Sub-tab access gate.
 *
 *   Resolution rules (in order):
 *
 *   1. EXPLICIT (restrictive) — if doctor_profiles.custom_tab_access
 *      contains ANY "communications_<sub>" entry the user sees ONLY those
 *      sub-tabs, regardless of role. This lets the TeamTab modal say
 *      "Ayeshaa gets ONLY Chats + Live Visitors inside Communications"
 *      without affecting any other admin.
 *
 *   2. ROLE DEFAULT (no explicit child grants):
 *        owner / admin_manager       → all sub-tabs
 *        support / read_only / finance → BASIC_SUBS (live, chats, emails,
 *                                        sms, consultations)
 *        unknown role                → BASIC_SUBS (safe default)
 *
 *   Implications:
 *     - Owner with no child grants keeps full access (no regression).
 *     - Setting even one child grant on an owner restricts them — this is
 *       intentional; admins can carve out scoped views.
 *     - A child grant always implies the parent "communications" tab is
 *       visible — that logic lives in page.tsx getVisibleTabs().
 *
 * Canonical order is preserved by filtering SUB_KEYS at the end.
 */
function getVisibleSubKeys(
  role: string | null | undefined,
  customTabAccess?: readonly string[] | null,
): SubKey[] {
  const explicit: SubKey[] = [];
  if (customTabAccess) {
    for (const key of customTabAccess) {
      if (!key.startsWith("communications_")) continue;
      const sub = key.slice("communications_".length);
      if ((SUB_KEYS as readonly string[]).includes(sub)) {
        explicit.push(sub as SubKey);
      }
    }
  }

  if (explicit.length > 0) {
    const set = new Set<SubKey>(explicit);
    return SUB_KEYS.filter((k) => set.has(k));
  }

  switch (role) {
    case "owner":
    case "admin_manager":
      return SUB_KEYS.slice();
    case "support":
    case "read_only":
    case "finance":
      return BASIC_SUBS.slice();
    default:
      return BASIC_SUBS.slice();
  }
}

function ComingSoonPanel({
  title,
  pointer,
}: {
  title: string;
  pointer: string;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-12 text-center">
        <i className="ri-tools-line text-3xl text-gray-300" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-500">Coming soon.</p>
        <p className="mt-1 text-xs text-gray-400">{pointer}</p>
      </div>
    </div>
  );
}

interface CommunicationsHubProps {
  /**
   * Phase E — orders list piped through from admin-orders/page.tsx so the
   * embedded CommunicationsPanel (mounted in the SMS / Calls sub-tab)
   * can render per-row "view order" links exactly like the legacy Comms
   * tab does. Optional so the hub still renders safely if a future caller
   * mounts it without orders context.
   */
  orders?: HubOrders;
  /**
   * Phase E — same passthrough for the "view order" click handler. The
   * legacy Comms tab points this at openOrderDetail + setActiveTab("orders").
   */
  onViewOrder?: HubOnViewOrder;
  /**
   * Phase G2 — doctor_profiles.custom_tab_access piped from admin-orders.
   * Used by getVisibleSubKeys() to widen sub-tab access for selected
   * users via "communications_<sub>" prefix entries. null when the
   * caller doesn't have the value yet — falls back to role-default
   * gating only.
   */
  customTabAccess?: readonly string[] | null;
}

export default function CommunicationsHub({
  orders,
  onViewOrder,
  customTabAccess,
}: CommunicationsHubProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  // Phase D — surface the admin role so embedded ContactRequestsTab can
  // gate its metadata column the same way it does today on the standalone
  // /admin-orders?tab=contacts surface. Hook is read-once on mount; role
  // changes are rare and the parent shell re-mounts on auth changes.
  const { role: adminRole } = useCurrentAdminRole();

  // AI Support draft queue badge — count of AI notifications that still need a
  // human (draft_pending / escalated / send_error …). Draft-only rollout: this
  // is purely a review indicator; nothing is auto-sent to visitors.
  const { count: aiPendingCount } = useAiSupportPendingCount();

  // Phase F — admin identity (name + email) for Broadcast modal. Same
  // cached helper ChatsTab already uses. No new RPCs, no new fetches
  // beyond what the rest of the admin app already performs.
  const [adminIdentity, setAdminIdentity] = useState<AdminIdentity | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getAdminIdentity();
        if (!cancelled) setAdminIdentity(id);
      } catch {
        if (!cancelled) setAdminIdentity({ id: null, email: null, name: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Phase F — which SMS / Calls action modal is open. Only one at a time.
  // Modals render INSIDE the sms sub-tab body but use fixed-positioned
  // backdrops, so visual stacking is unaffected by where they mount.
  const [smsModal, setSmsModal] = useState<"none" | "broadcast" | "history">("none");
  const closeSmsModal = useCallback(() => setSmsModal("none"), []);

  // Phase G2 — compute which sub-tabs the current admin may see. Re-runs
  // whenever role or customTabAccess change.
  const visibleSubs = useMemo<SubKey[]>(
    () => getVisibleSubKeys(adminRole, customTabAccess ?? null),
    [adminRole, customTabAccess],
  );

  // Read the active sub-tab from the URL on every render so external
  // navigations (e.g. a header link) take effect immediately.
  const activeSub = useMemo<SubKey>(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("sub");
    return isSubKey(raw) ? raw : DEFAULT_SUB;
  }, [location.search]);

  // If the URL is missing ?sub=, normalize it once so links/bookmarks are
  // stable. Done in an effect (not during render) so we don't replace
  // mid-render and break router state. Phase G2 — defaults to the first
  // sub the user is actually allowed to see (not always "live"), so a
  // future selective-access user lands somewhere they can actually use.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!isSubKey(params.get("sub")) && visibleSubs.length > 0) {
      params.set("tab", "communications");
      params.set("sub", visibleSubs[0]);
      navigate(`/admin-orders?${params.toString()}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase G2 — sub-tab access gate. If the URL points at a sub the
  // current admin is not allowed to see (e.g. they typed ?sub=templates
  // manually or followed a stale link), redirect to their first allowed
  // sub. Empty visibleSubs means the role has zero comms access — should
  // never happen in practice since the top-level gate already requires
  // role mapping, but defensive: no-op so the hub doesn't navigate-loop.
  useEffect(() => {
    if (visibleSubs.length === 0) return;
    if (visibleSubs.includes(activeSub)) return;
    const params = new URLSearchParams(location.search);
    params.set("tab", "communications");
    params.set("sub", visibleSubs[0]);
    navigate(`/admin-orders?${params.toString()}`, { replace: true });
  }, [activeSub, visibleSubs, location.search, navigate]);

  const setSub = useCallback((next: SubKey) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", "communications");
    params.set("sub", next);
    navigate(`/admin-orders?${params.toString()}`, { replace: false });
  }, [location.search, navigate]);

  // Local input state so keyboard / pointer events still feel snappy even
  // if router updates are batched.
  const [localActive, setLocalActive] = useState<SubKey>(activeSub);
  useEffect(() => { setLocalActive(activeSub); }, [activeSub]);

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-tab strip — Phase G2 filters out sub-tabs the current admin
          isn't permitted to see. SUB_CONFIG order is preserved. */}
      <div className="bg-white rounded-lg border border-gray-200 px-2 py-1 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {SUB_CONFIG.filter((s) => visibleSubs.includes(s.key)).map((s) => {
            const isActive = s.key === localActive;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setLocalActive(s.key);
                  setSub(s.key);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#1e3a5f] text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <i className={s.icon} />
                <span>{s.label}</span>
                {s.key === "ai" && aiPendingCount > 0 && (
                  <span
                    className={`ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold ${
                      isActive ? "bg-white/25 text-white" : "bg-red-500 text-white"
                    }`}
                    title={`${aiPendingCount} AI draft${aiPendingCount === 1 ? "" : "s"} need review`}
                  >
                    {aiPendingCount > 99 ? "99+" : aiPendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab body */}
      <div>
        {/* Command Center — unified comms triage inbox (chat/SMS/call/email
            queue + AI draft review + needs-review counts). Draft-only rollout:
            every send is a human click (chat via post_agent_chat_message; SMS
            via ai-send-support-reply which is not deployed in LIVE → inert).
            No auto-send; write actions gated by isAdminLevel + RLS. */}
        {localActive === "inbox" && <CommandCenterPanel />}

        {localActive === "live" && <LiveVisitorsPanel />}

        {/* Phase C — mount existing ChatsTab verbatim. Old sidebar "Chats"
            entry remains live as a parallel path. ChatsTab's polling,
            sounds, desktop notifs, unread handling, and assignment logic
            all flow through AdminChatProvider mounted at App.tsx level
            and are NOT affected by where ChatsTab renders. */}
        {localActive === "chats" && <ChatsTab />}

        {/* Phase D — mount existing ContactRequestsTab verbatim. Same
            adminRole prop pattern used by admin-orders/page.tsx for the
            standalone /admin-orders?tab=contacts surface. Old sidebar
            "Contacts" entry remains live as a parallel path. */}
        {localActive === "emails" && <ContactRequestsTab adminRole={adminRole} />}

        {/* Phase E + F — SMS / Calls sub-tab.
            Phase E mounted the existing CommunicationsPanel unmodified
              (defaults to its inner "sms_calls" tab).
            Phase F adds Send Broadcast + Broadcast History action
              buttons above the panel. Bulk SMS is intentionally NOT
              surfaced here — it depends on row-selection context from
              the Orders table (selectedOrders set + lead filter) which
              the hub does not own. The Orders tab continues to be the
              only entry point for Bulk SMS.
            All sends still flow through the existing modals' explicit
              admin click + confirmation — no automatic sends. */}
        {localActive === "sms" && (
          <div className="flex flex-col gap-4">
            {/* Broadcast actions are owner/admin_manager only — support /
                finance / read_only can use SMS/Calls but not broadcast. */}
            {canAccessBroadcast(adminRole) && (
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                  SMS / Calls actions
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Send a broadcast to all eligible customers, or review past broadcasts. Bulk SMS to selected leads stays on the Orders tab where the row selection lives.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSmsModal("broadcast")}
                  disabled={!adminIdentity?.name}
                  className="text-sm px-3 py-1.5 rounded-md bg-[#1e3a5f] text-white hover:bg-[#173049] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  title={!adminIdentity?.name ? "Loading admin identity…" : "Open Broadcast composer"}
                >
                  <i className="ri-megaphone-line" />
                  Send Broadcast
                </button>
                <button
                  type="button"
                  onClick={() => setSmsModal("history")}
                  className="text-sm px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 inline-flex items-center gap-1.5"
                  title="Open Broadcast History"
                >
                  <i className="ri-history-line" />
                  Broadcast History
                </button>
              </div>
            </div>
            )}

            <CommunicationsPanel
              orders={orders ?? []}
              onViewOrder={onViewOrder ?? (() => { /* no-op when not provided */ })}
            />

            {smsModal === "broadcast" && adminIdentity?.name && (
              <BroadcastModal
                orders={orders ?? []}
                adminName={adminIdentity.name}
                adminEmail={adminIdentity.email ?? ""}
                adminRole={adminRole ?? null}
                onClose={closeSmsModal}
              />
            )}
            {smsModal === "history" && (
              <BroadcastHistoryModal onClose={closeSmsModal} />
            )}
          </div>
        )}

        {/* AI Support Center — draft-only AI live-chat review. Staff review AI
            drafts and manage the chat/SMS blacklists; owner/admin controls the
            chat reply mode (Off / Draft / Auto — Auto is confirmation-gated)
            and the SMS auto-send toggle (kept OFF). No automatic
            customer-visible sends happen from this panel; the only manual send
            path is the human "Approve & send to chat" action, which uses the
            existing post_agent_chat_message agent path. */}
        {localActive === "ai" && <AiSupportCenterPanel />}

        {/* Consultation Slot Recovery Funnel (V1) — admin-side surface for
            unpaid lead recovery via /consultation-request submissions.
            Standalone panel, no shared state required. */}
        {localActive === "consultations" && <ConsultationRequestsPanel />}

        {/* Phase G — mount the shared CommunicationsTemplatesPanel that
            was extracted from SettingsTab. Same email_templates table,
            same channel split, same edit/save/delete logic, same
            placeholders. The legacy Settings tab still renders the
            exact same component, so admins have two parallel access
            paths during the hub rollout. */}
        {localActive === "templates" && <CommunicationsTemplatesPanel />}

        {/* Phase H — mount comms-related settings panels that are
            already extracted into their own modules / already exported
            from CommunicationsTemplatesPanel.tsx.
              - AdminNotificationPrefsPanel: standalone file, prop-less.
              - RecoverySequencePanel: named export from
                CommunicationsTemplatesPanel.tsx (exported during the
                Phase G hotfix); prop-less.
            Legacy SettingsTab still renders both at their existing
            AccordionSections — both surfaces edit the same DB rows.
            Other in-Settings automation panels (AutomationStatusPanel,
            ManualSequenceRunPanel, SequenceManagementPanel,
            NotificationRoutingTestPanel) require a proper dependency
            audit before being moved or re-exported — deferred to a
            Phase H2 follow-up to avoid repeating the Phase G regression. */}
        {localActive === "settings" && (
          <div className="flex flex-col gap-5">
            <section className="bg-white rounded-lg border border-gray-200 px-5 py-5">
              <div className="mb-4">
                <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">
                  Admin Notifications
                </p>
                <h2 className="text-base font-semibold text-gray-900">Admin Notification Preferences</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure which events trigger admin alerts. Same controls as the legacy Settings tab — both surfaces edit the same preferences.
                </p>
              </div>
              <AdminNotificationPrefsPanel />
            </section>

            <section className="bg-white rounded-lg border border-gray-200 px-5 py-5">
              <div className="mb-4">
                <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">
                  Recovery Automation
                </p>
                <h2 className="text-base font-semibold text-gray-900">Recovery Sequence</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Lead recovery email controls. Toggles the same automation switches as the legacy Settings tab — no automatic sends are triggered by viewing this page.
                </p>
              </div>
              <RecoverySequencePanel />
            </section>

            <p className="text-xs text-gray-400">
              More automation surfaces (lead-followup sequence management, GHL sync settings, notification routing test) remain in the legacy Settings tab for now. They will migrate in a focused follow-up after a dependency audit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
