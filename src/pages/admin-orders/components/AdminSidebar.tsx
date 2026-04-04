// AdminSidebar — Fixed vertical navigation with collapsible icon-only mode
type TabKey =
  | "dashboard" | "orders" | "analytics" | "comms" | "customers" | "doctors"
  | "earnings" | "payments" | "team" | "audit" | "settings" | "health";

interface AdminSidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  visibleTabs: TabKey[];
  totalUnassigned: number;
  unreadCommsCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const TAB_CONFIG: { key: TabKey; label: string; icon: string }[] = [
  { key: "dashboard",  label: "Dashboard",  icon: "ri-dashboard-3-line" },
  { key: "orders",     label: "Orders",     icon: "ri-file-list-3-line" },
  { key: "analytics",  label: "Analytics",  icon: "ri-bar-chart-2-line" },
  { key: "comms",      label: "Comms",      icon: "ri-message-3-line" },
  { key: "customers", label: "Customers",      icon: "ri-group-line" },
  { key: "doctors",   label: "Providers",      icon: "ri-stethoscope-line" },
  { key: "earnings",  label: "Earnings",       icon: "ri-money-dollar-circle-line" },
  { key: "payments",  label: "Payments",       icon: "ri-bank-card-line" },
  { key: "team",      label: "Team",           icon: "ri-shield-keyhole-line" },
  { key: "audit",     label: "Audit",          icon: "ri-list-check-2" },
  { key: "settings",  label: "Settings",       icon: "ri-settings-3-line" },
  { key: "health",    label: "Health",         icon: "ri-pulse-line" },
];

// Primary tabs shown in the mobile bottom bar (most used)
const MOBILE_PRIMARY_TABS: TabKey[] = ["dashboard", "orders", "comms", "customers", "doctors"];

export default function AdminSidebar({
  activeTab,
  onTabChange,
  visibleTabs,
  totalUnassigned,
  unreadCommsCount,
  collapsed,
  onToggleCollapse,
}: AdminSidebarProps) {
  const getBadge = (key: TabKey): number => {
    if (key === "orders" && totalUnassigned > 0) return totalUnassigned;
    if (key === "comms" && unreadCommsCount > 0) return unreadCommsCount;
    return 0;
  };

  const visibleItems = TAB_CONFIG.filter((t) => visibleTabs.includes(t.key));
  const mobilePrimaryItems = TAB_CONFIG.filter(
    (t) => MOBILE_PRIMARY_TABS.includes(t.key) && visibleTabs.includes(t.key)
  );
  // "More" items = everything not in primary
  const mobileMoreItems = TAB_CONFIG.filter(
    (t) => !MOBILE_PRIMARY_TABS.includes(t.key) && visibleTabs.includes(t.key)
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-14 bottom-0 bg-white border-r border-gray-100 z-40 overflow-hidden"
        style={{ width: collapsed ? 56 : 220, transition: "width 200ms ease" }}
      >
        {/* Header row: label + toggle button */}
        <div
          className={`flex items-center border-b border-gray-100 h-11 flex-shrink-0 ${
            collapsed ? "justify-center" : "justify-between px-4"
          }`}
        >
          {!collapsed && (
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold select-none">
              Navigation
            </p>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1a5c4f] hover:bg-[#f0faf7] transition-colors cursor-pointer flex-shrink-0"
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
          className="flex-1 overflow-y-auto overflow-x-hidden py-2.5 space-y-0.5"
          style={{ padding: collapsed ? "10px 6px" : "10px 12px" }}
        >
          {visibleItems.map((tab) => {
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
                    ? "bg-[#1a5c4f] text-white font-semibold"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-medium"
                }`}
                style={{
                  padding: collapsed ? "9px 0" : "9px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: collapsed ? 0 : 12,
                }}
              >
                {/* Icon */}
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className={`${tab.icon} text-base`}></i>
                </div>

                {/* Label + badge — only when expanded */}
                {!collapsed && (
                  <>
                    <span
                      className="flex-1 text-left text-sm truncate"
                      style={{ opacity: collapsed ? 0 : 1, transition: "opacity 150ms ease" }}
                    >
                      {tab.label}
                    </span>
                    {badge > 0 && (
                      <span
                        className={`flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-extrabold ${
                          isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </>
                )}

                {/* Collapsed badge dot */}
                {collapsed && badge > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full border-2 border-white flex-shrink-0"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="border-t border-gray-100 flex items-center flex-shrink-0"
          style={{
            height: 44,
            padding: collapsed ? "0 0" : "0 16px",
            justifyContent: collapsed ? "center" : "flex-start",
            overflow: "hidden",
          }}
        >
          {collapsed ? (
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-shield-check-line text-gray-200 text-base"></i>
            </div>
          ) : (
            <p className="text-[10px] text-gray-300 uppercase tracking-widest font-bold select-none truncate">
              PawTenant Admin
            </p>
          )}
        </div>
      </aside>

      {/* ── MOBILE BOTTOM NAV ───────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb">
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
                  isActive ? "text-[#1a5c4f]" : "text-gray-400"
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
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#1a5c4f] rounded-full"></span>
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
          isMoreActive ? "text-[#1a5c4f]" : "text-gray-400"
        }`}
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <i className="ri-more-2-fill text-xl"></i>
        </div>
        <span className="text-[9px] font-bold leading-none">More</span>
        {isMoreActive && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#1a5c4f] rounded-full"></span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          ></div>
          <div className="relative bg-white rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-extrabold text-gray-900">More Options</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 cursor-pointer"
              >
                <i className="ri-close-line text-base"></i>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-0 divide-x divide-y divide-gray-100">
              {items.map((tab) => {
                const badge = getBadge(tab.key);
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => { onTabChange(tab.key); setOpen(false); }}
                    className={`flex flex-col items-center justify-center gap-2 py-5 cursor-pointer transition-colors ${
                      isActive ? "bg-[#f0faf7] text-[#1a5c4f]" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gray-100 rounded-xl">
                      <i className={`${tab.icon} text-lg ${isActive ? "text-[#1a5c4f]" : "text-gray-500"}`}></i>
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
