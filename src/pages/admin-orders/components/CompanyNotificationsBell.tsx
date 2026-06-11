// CompanyNotificationsBell — grouped admin notification bell.
// Replaces the old flat NotificationsBell + HrRequestsBell pair with one bell
// backed by the get_company_notifications() RPC (SECURITY DEFINER, is_admin
// gated; the Approvals group is owner/admin_manager only). Read state is
// durable per user/group in company_notification_reads via
// mark_company_notifications_read() — works across devices, unlike the old
// localStorage read set. Single RPC poll (45s + on open): no per-event
// realtime fan-out, so no request flooding.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export interface CompanyNotification {
  group_key: string;
  entity_type: string;
  entity_id: string;
  title: string;
  preview: string;
  created_at: string;
  target_tab: string;
  is_unread: boolean;
}

interface CompanyNotificationsBellProps {
  /** Switch the admin portal to a tab key (e.g. "comms" | "team" | "attendance"). */
  onNavigate: (tab: string) => void;
  /** Open the Orders tab with a status card filter applied. */
  onOrdersFilter: (filter: string) => void;
}

const GROUP_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; category: string }> = {
  sms:             { label: "New SMS",              icon: "ri-message-3-fill",      color: "text-violet-600",  bg: "bg-violet-50",  category: "Communications" },
  call:            { label: "Incoming calls",       icon: "ri-phone-fill",          color: "text-sky-600",     bg: "bg-sky-50",     category: "Communications" },
  email:           { label: "Customer emails",      icon: "ri-mail-line",           color: "text-teal-600",    bg: "bg-teal-50",    category: "Communications" },
  consultation:    { label: "Consultation bookings", icon: "ri-calendar-check-line", color: "text-[#3b6ea5]",   bg: "bg-[#e8f0f9]",  category: "Orders & Bookings" },
  order_paid:      { label: "New paid orders",      icon: "ri-secure-payment-line", color: "text-[#1a5c4f]",   bg: "bg-[#f0faf7]",  category: "Orders & Bookings" },
  order_completed: { label: "Completed orders",     icon: "ri-checkbox-circle-line", color: "text-emerald-600", bg: "bg-emerald-50", category: "Orders & Bookings" },
  approval:        { label: "Approvals required",   icon: "ri-shield-check-line",   color: "text-amber-600",   bg: "bg-amber-50",   category: "Approvals" },
};

const CATEGORY_ORDER = ["Approvals", "Communications", "Orders & Bookings"];

function fmtTime(ts: string): string {
  const d = new Date(ts);
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CompanyNotificationsBell({ onNavigate, onOrdersFilter }: CompanyNotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CompanyNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_company_notifications");
    if (!error) setRows((data as CompanyNotification[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 45000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markGroupRead = useCallback(async (groupKey: string) => {
    setRows((prev) => prev.map((r) => r.group_key === groupKey ? { ...r, is_unread: false } : r));
    await supabase.rpc("mark_company_notifications_read", { p_group_key: groupKey }).then(() => {}, () => {});
  }, []);

  const markAllRead = useCallback(async () => {
    setRows((prev) => prev.map((r) => ({ ...r, is_unread: false })));
    await supabase.rpc("mark_company_notifications_read", { p_group_key: null }).then(() => {}, () => {});
  }, []);

  const navigateForGroup = useCallback((groupKey: string, targetTab: string) => {
    markGroupRead(groupKey);
    setOpen(false);
    if (groupKey === "order_paid") onOrdersFilter("paid_unassigned");
    else if (groupKey === "order_completed") onOrdersFilter("completed");
    else onNavigate(targetTab);
  }, [markGroupRead, onNavigate, onOrdersFilter]);

  const unreadTotal = rows.filter((r) => r.is_unread).length;

  // Group rows by group_key, keep newest-first inside each group
  const groups = Object.keys(GROUP_CONFIG)
    .map((key) => {
      const items = rows
        .filter((r) => r.group_key === key)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { key, items, unread: items.filter((i) => i.is_unread).length };
    })
    .filter((g) => g.items.length > 0);

  const categories = CATEGORY_ORDER
    .map((cat) => ({ cat, groups: groups.filter((g) => GROUP_CONFIG[g.key].category === cat) }))
    .filter((c) => c.groups.length > 0);

  function toggle() {
    setOpen((v) => {
      if (!v) load(); // refresh on open
      return !v;
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label={unreadTotal > 0 ? `Notifications — ${unreadTotal} unread` : "Notifications"}
        className={`whitespace-nowrap relative w-10 h-10 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
          unreadTotal > 0
            ? "border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-100 ring-2 ring-orange-100"
            : "border-slate-200 bg-white text-slate-500 hover:text-[#1a5c4f] hover:border-[#3b6ea5]"
        }`}
      >
        <i className={`text-xl ${unreadTotal > 0 ? "ri-notification-3-fill" : "ri-notification-3-line"}`}></i>
        {unreadTotal > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-orange-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center leading-none ring-2 ring-white">
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(380px,calc(100vw-24px))] bg-white rounded-2xl border border-gray-200 z-[200] overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#f0faf7] to-white">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center bg-[#1a5c4f] rounded-lg flex-shrink-0">
                <i className="ri-notification-3-fill text-white text-sm"></i>
              </div>
              <p className="text-sm font-extrabold text-gray-900">Notifications</p>
              {unreadTotal > 0 && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-extrabold rounded-full">{unreadTotal} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadTotal > 0 && (
                <button type="button" onClick={markAllRead}
                  className="whitespace-nowrap text-xs font-semibold text-[#1a5c4f] hover:underline cursor-pointer">
                  Mark all read
                </button>
              )}
              <button type="button" onClick={load} title="Refresh"
                className="text-gray-400 hover:text-[#1a5c4f] cursor-pointer">
                <i className={`ri-refresh-line text-sm ${loading ? "animate-spin" : ""}`}></i>
              </button>
            </div>
          </div>

          {/* Grouped list */}
          <div className="max-h-[440px] overflow-y-auto">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                  <i className="ri-notification-off-line text-gray-400 text-xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-600">All caught up</p>
                <p className="text-xs text-gray-400 mt-1">New messages, orders, bookings and approvals will appear here</p>
              </div>
            ) : (
              categories.map(({ cat, groups: catGroups }) => (
                <div key={cat}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">{cat}</p>
                  {catGroups.map((g) => {
                    const cfg = GROUP_CONFIG[g.key];
                    const latest = g.items[0];
                    const isExpanded = expanded === g.key;
                    return (
                      <div key={g.key} className="border-b border-gray-50 last:border-b-0">
                        {/* Group summary row */}
                        <div
                          onClick={() => navigateForGroup(g.key, latest.target_tab)}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${g.unread > 0 ? "bg-[#fafffe]" : ""}`}
                        >
                          <div className={`w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 ${cfg.bg}`}>
                            <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-bold truncate ${g.unread > 0 ? "text-gray-900" : "text-gray-600"}`}>
                                {g.unread > 0 ? `${g.unread} ` : ""}{cfg.label}
                              </p>
                              {g.unread > 0 && (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[9px] font-extrabold rounded-full flex-shrink-0">{g.unread}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-1">{latest.preview}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{fmtTime(latest.created_at)} · {g.items.length} item{g.items.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : g.key); }}
                              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-pointer"
                              title={isExpanded ? "Collapse" : "Show items"}
                            >
                              <i className={`ri-arrow-${isExpanded ? "up" : "down"}-s-line text-sm`}></i>
                            </button>
                            {g.unread > 0 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); markGroupRead(g.key); }}
                                className="whitespace-nowrap text-[9px] font-semibold text-gray-400 hover:text-[#1a5c4f] cursor-pointer"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded items */}
                        {isExpanded && (
                          <div className="bg-gray-50/60 divide-y divide-gray-100">
                            {g.items.map((item) => (
                              <div
                                key={`${item.group_key}-${item.entity_type}-${item.entity_id}`}
                                onClick={() => navigateForGroup(item.group_key, item.target_tab)}
                                className="flex items-start gap-2.5 pl-[60px] pr-4 py-2 cursor-pointer hover:bg-gray-100/70 transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[11px] font-semibold truncate ${item.is_unread ? "text-gray-800" : "text-gray-500"}`}>{item.title}</p>
                                  <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{item.preview}</p>
                                  <p className="text-[9px] text-gray-400 mt-0.5">{fmtTime(item.created_at)}</p>
                                </div>
                                {item.is_unread && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5"></span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <p className="text-[10px] text-gray-400 text-center">
              Grouped by type · refreshes every 45s
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
