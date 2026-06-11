// AdminSidebar — Fixed vertical navigation with collapsible icon-only mode
import { useAdminChat } from "../../../context/AdminChatContext";

type TabKey =
  | "dashboard" | "orders" | "analytics" | "communications" | "comms" | "chats" | "contacts" | "customers" | "doctors"
  | "earnings" | "payments" | "team" | "attendance" | "shifts" | "audit" | "settings" | "health";

interface AdminSidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  visibleTabs: TabKey[];
  totalUnassigned: number;
  unreadCommsCount: number;
  unreadContactsCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const TAB_CONFIG: { key: TabKey; label: string; icon: string }[] = [
  { key: "dashboard",     label: "Dashboard",     icon: "ri-dashboard-3-line" },
  { key: "orders",        label: "Orders",        icon: "ri-file-list-3-line" },
  { key: "analytics",     label: "Analytics",     icon: "ri-bar-chart-2-line" },
  // Phase I — legacy "Comms", "Chats", "Contacts" entries removed from
  // the sidebar. The keys remain valid in TabKey + getVisibleTabs so
  // direct ?tab=chats / ?tab=contacts / ?tab=comms URLs continue to
  // resolve (page.tsx then redirects them into the Communications Hub
  // via a normalizer effect). Render branches for the legacy tabs are
  // intentionally preserved so any redirect race or bookmark detour
  // never lands the admin on a blank page.
  { key: "communications",label: "Communications",icon: "ri-radar-line" },
  { key: "customers", label: "Customers",      icon: "ri-group-line" },
  { key: "doctors",   label: "Providers",      icon: "ri-stethoscope-line" },
  { key: "earnings",  label: "Earnings",       icon: "ri-money-dollar-circle-line" },
  { key: "payments",  label: "Payments",       icon: "ri-bank-card-line" },
  { key: "team",      label: "Team",           icon: "ri-shield-keyhole-line" },
  { key: "attendance",label: "Attendance",     icon: "ri-time-line" },
  { key: "shifts",    label: "Shifts",         icon: "ri-calendar-schedule-line" },
  { key: "audit",     label: "Audit",          icon: "ri-list-check-2" },
  { key: "settings",  label: "Settings",       icon: "ri-settings-3-line" },
  { key: "health",    label: "Health",         icon: "ri-pulse-line" },
];

// Primary tabs shown in the mobile bottom bar (most used).
// Phase I — "comms" replaced with the new umbrella "communications".
const MOBILE_PRIMARY_TABS: TabKey[] = ["dashboard", "orders", "communications", "customers", "doctors"];

export default function AdminSidebar({
  activeTab,
  onTabChange,
  visibleTabs,
  totalUnassigned,
  unreadCommsCount,
  unreadContactsCount,
  collapsed,
  onToggleCollapse,
}: AdminSidebarProps) {
  // Phase J — unified Communications badge.
  // Sums unread chat messages (visitor → admin, from the AdminChatContext
  // sessions array) + unread contact-form submissions (status="new").
  // Deliberately EXCLUDES the legacy unreadCommsCount (SMS / call ambient
  // activity) and the Live Visitors active-count — both are too noisy
  // for a red badge per spec.
  //
  // The hook is safe to call here: AdminChatProvider wraps every admin
  // route in App.tsx (public site uses <AdminChatGate>, admin subdomain
  // uses <AdminChatProvider enabled>).
  const adminChatCtx = useAdminChat();
  const unreadChatsCount = (adminChatCtx?.sessions ?? []).reduce(
    (acc, s) => acc + (s?.unread_count ?? 0),
    0,
  );
  // Legacy "comms" / "contacts" branches preserved so any future
  // re-enable of those entries in TAB_CONFIG continues to render badges
  // correctly. They are no-ops while Phase I keeps those entries hidden.
  const getBadge = (key: TabKey): number => {
    if (key === "orders" && totalUnassigned > 0) return totalUnassigned;
    if (key === "communications") {
      return unreadChatsCount + (unreadContactsCount ?? 0);
    }
    if (key === "comms" && unreadCommsCount > 0) return unreadCommsCount;
    if (key === "contacts" && (unreadContactsCount ?? 0) > 0)
      return unreadContactsCount ?? 0;
    return 0;
  };

  const mobilePrimaryItems = TAB_CONFIG.filter(
    (t) => MOBILE_PRIMARY_TABS.includes(t.key) && visibleTabs.includes(t.key)
  );
  // "More" items = everything not in primary
  const mobileMoreItems = TAB_CONFIG.filter(
    (t) => !MOBILE_PRIMARY_TABS.includes(t.key) && visibleTabs.includes(t.key)
  );

  // ── Grouped desktop nav (HR + Accounts) ─────────────────────────────────
  // Child tab keys keep their original values so URLs / ?tab= params and the
  // page.tsx tab router are unchanged. Groups only restructure the sidebar.
  const cfgByKey = (k: TabKey) => TAB_CONFIG.find((t) => t.key === k);
  const HR_CHILDREN: TabKey[] = ["team", "attendance", "shifts"];
  const ACCOUNTS_CHILDREN: TabKey[] = ["earnings", "payments"];
  const GROUPED = new Set<TabKey>([...HR_CHILDREN, ...ACCOUNTS_CHILDREN]);
  const GROUPS: { key: "hr" | "accounts"; label: string; icon: string; children: TabKey[] }[] = [
    { key: "hr", label: "HR", icon: "ri-team-line", children: HR_CHILDREN },
    { key: "accounts", label: "Accounts", icon: "ri-wallet-3-line", children: ACCOUNTS_CHILDREN },
  ];
  // Desktop order: ungrouped top-levels, with the two group blocks slotted in.
  const DESKTOP_ORDER: (TabKey | "group:hr" | "group:accounts")[] = [
    "dashboard", "orders", "analytics", "communications", "customers", "doctors",
    "group:hr", "group:accounts", "audit", "settings", "health",
  ];

  const isChildActive = (children: TabKey[]) => children.some((c) => c === activeTab);

  // A group starts expanded when one of its children is the active tab; the
  // admin can also toggle it open/closed manually.
  const [manualGroups, setManualGroups] = useState<Record<string, boolean>>({});
  const groupOpen = (g: { key: string; children: TabKey[] }) =>
    manualGroups[g.key] ?? isChildActive(g.children);

  const renderNavButton = (
    tab: { key: TabKey; label: string; icon: string },
    isChild: boolean,
  ) => {
    const badge = getBadge(tab.key);
    const isActive = activeTab === tab.key;
    return (
      <button
        key={tab.key}
        type="button"
        onClick={() => onTabChange(tab.key)}
        title={collapsed ? tab.label : undefined}
        className={`whitespace-nowrap w-full flex items-center rounded-lg transition-colors cursor-pointer relative overflow-hidden ${
          isActive
            ? "bg-[#3b6ea5] text-white font-semibold"
            : "text-white/50 hover:bg-white/10 hover:text-white font-medium"
        }`}
        style={{
          padding: collapsed ? "5px 0" : isChild ? "4px 11px 4px 26px" : "5px 11px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: collapsed ? 0 : 11,
        }}
      >
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <i className={`${tab.icon} ${isChild ? "text-sm" : "text-base"}`}></i>
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-sm truncate">{tab.label}</span>
            {badge > 0 && (
              <span className={`flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold ${
                isActive ? "bg-white/20 text-white" : "bg-amber-400 text-white"
              }`}>{badge}</span>
            )}
          </>
        )}
        {collapsed && badge > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full border-2 border-[#1e3a5f] flex-shrink-0"></span>
        )}
      </button>
    );
  };

  const renderGroup = (g: { key: "hr" | "accounts"; label: string; icon: string; children: TabKey[] }) => {
    const children = g.children.map(cfgByKey).filter((c): c is { key: TabKey; label: string; icon: string } => !!c && visibleTabs.includes(c.key));
    if (children.length === 0) return null;
    // Collapsed (icon-only) sidebar: render children as flat icons, no header.
    if (collapsed) return <div key={g.key}>{children.map((c) => renderNavButton(c, false))}</div>;

    const childActive = isChildActive(g.children);
    const expanded = groupOpen(g);
    return (
      <div key={g.key}>
        <button
          type="button"
          onClick={() => {
            const next = !expanded;
            setManualGroups((m) => ({ ...m, [g.key]: next }));
            // Opening the group and not already on one of its children → jump to first child.
            if (next && !childActive && children[0]) onTabChange(children[0].key);
          }}
          className={`whitespace-nowrap w-full flex items-center rounded-lg transition-colors cursor-pointer ${
            childActive ? "text-white font-semibold" : "text-white/50 hover:bg-white/10 hover:text-white font-medium"
          }`}
          style={{ padding: "5px 11px", gap: 11 }}
        >
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <i className={`${g.icon} text-base`}></i>
          </div>
          <span className="flex-1 text-left text-sm truncate">{g.label}</span>
          <i className={`ri-arrow-down-s-line text-base flex-shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}></i>
        </button>
        {expanded && <div className="mt-0.5 space-y-0.5">{children.map((c) => renderNavButton(c, true))}</div>}
      </div>
    );
  };

  return (
    <>
      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-14 bottom-0 bg-[#1e3a5f] z-40 overflow-hidden"
        style={{ width: collapsed ? 52 : 188, transition: "width 200ms ease" }}
      >
        {/* Header row: label + toggle button */}
        <div
          className={`flex items-center border-b border-white/10 h-10 flex-shrink-0 ${
            collapsed ? "justify-center" : "justify-between px-4"
          }`}
        >
          {!collapsed && (
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold select-none">
              Navigation
            </p>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
          >
            <i
              className={`text-base ${
                collapsed ? "ri-menu-unfold-line" : "ri-menu-fold-line"
              }`}
            ></i>
          </button>
        </div>

        {/* Nav items */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-0.5"
          style={{ padding: collapsed ? "7px 5px" : "7px 9px" }}
        >
          {DESKTOP_ORDER.map((entry) => {
            if (entry === "group:hr") return renderGroup(GROUPS[0]);
            if (entry === "group:accounts") return renderGroup(GROUPS[1]);
            // Plain top-level tab — only if visible and not a grouped child.
            const tab = cfgByKey(entry as TabKey);
            if (!tab || GROUPED.has(tab.key) || !visibleTabs.includes(tab.key)) return null;
            return renderNavButton(tab, false);
          })}
        </nav>

        {/* Footer */}
        <div
          className="border-t border-white/10 flex items-center flex-shrink-0"
          style={{
            height: 34,
            padding: collapsed ? "0 0" : "0 14px",
            justifyContent: collapsed ? "center" : "flex-start",
            overflow: "hidden",
          }}
        >
          {collapsed ? (
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-shield-check-line text-white/20 text-base"></i>
            </div>
          ) : (
            <p className="text-[10px] text-white/20 uppercase tracking-widest font-bold select-none truncate">
              PawTenant Admin
            </p>
          )}
        </div>
      </aside>

      {/* ── MOBILE BOTTOM NAV ───────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 safe-area-pb">
        <div className="flex items-stretch">
          {mobilePrimaryItems.map((tab) => {
            const badge = getBadge(tab.key);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 cursor-pointer transition-colors relative ${
                  isActive ? "text-[#3b6ea5]" : "text-slate-400"
                }`}
              >
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <i className={`${tab.icon} text-xl`}></i>
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-amber-400 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold leading-none">{tab.label}</span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#3b6ea5] rounded-full"></span>
                )}
              </button>
            );
          })}

          {/* "More" button — opens a sheet with remaining tabs */}
          {mobileMoreItems.filter((t) => visibleTabs.includes(t.key)).length > 0 && (
            <MobileMoreMenu
              items={mobileMoreItems}
              activeTab={activeTab}
              onTabChange={onTabChange}
              getBadge={getBadge}
            />
          )}
        </div>
      </nav>
    </>
  );
}

// ── Mobile "More" sheet ──────────────────────────────────────────────────────
import { useState } from "react";

function MobileMoreMenu({
  items,
  activeTab,
  onTabChange,
  getBadge,
}: {
  items: { key: TabKey; label: string; icon: string }[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  getBadge: (key: TabKey) => number;
}) {
  const [open, setOpen] = useState(false);
  const isMoreActive = items.some((t) => t.key === activeTab);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 cursor-pointer transition-colors relative ${
          isMoreActive ? "text-[#3b6ea5]" : "text-slate-400"
        }`}
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <i className="ri-more-2-fill text-xl"></i>
        </div>
        <span className="text-[9px] font-bold leading-none">More</span>
        {isMoreActive && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#3b6ea5] rounded-full"></span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          ></div>
          <div className="relative bg-white rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="text-sm font-extrabold text-slate-900">More Options</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 cursor-pointer"
              >
                <i className="ri-close-line text-base"></i>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-0 divide-x divide-y divide-slate-100">
              {items.map((tab) => {
                const badge = getBadge(tab.key);
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => { onTabChange(tab.key); setOpen(false); }}
                    className={`flex flex-col items-center justify-center gap-2 py-5 cursor-pointer transition-colors ${
                      isActive ? "bg-[#e8f0f9] text-[#3b6ea5]" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center bg-slate-100 rounded-xl">
                      <i className={`${tab.icon} text-lg ${isActive ? "text-[#3b6ea5]" : "text-slate-500"}`}></i>
                      {badge > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-amber-400 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center">
                          {badge}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="h-6 bg-white"></div>
          </div>
        </div>
      )}
    </>
  );
}
