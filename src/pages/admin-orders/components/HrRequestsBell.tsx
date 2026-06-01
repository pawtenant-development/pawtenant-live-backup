// HrRequestsBell — top-bar bell for actionable Company OS HR requests.
// Reads pending attendance corrections, leave requests, and leave corrections
// via the admin-only get_admin_company_os_notifications() RPC (SECURITY DEFINER,
// owner/admin_manager + is_admin). Badge = pending count. Clicking a row opens
// the relevant admin tab. Polls on an interval + refreshes on open.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export interface HrNotification {
  id: string;
  source_type: "attendance_correction" | "leave_request" | "leave_correction" | string;
  source_id: string;
  employee_name: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  target_tab: string;
  priority: number;
}

interface HrRequestsBellProps {
  /** Switch the admin portal to a tab key (e.g. "attendance" | "team"). */
  onNavigate: (tab: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  attendance_correction: { icon: "ri-time-line", color: "text-amber-600", bg: "bg-amber-50" },
  leave_request: { icon: "ri-calendar-event-line", color: "text-[#3b6ea5]", bg: "bg-[#e8f0f9]" },
  leave_correction: { icon: "ri-edit-2-line", color: "text-violet-600", bg: "bg-violet-50" },
};

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

export default function HrRequestsBell({ onNavigate }: HrRequestsBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HrNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_admin_company_os_notifications");
    if (!error) setItems((data as HrNotification[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle() {
    setOpen((v) => {
      if (!v) load(); // refresh on open
      return !v;
    });
  }

  const count = items.length;

  function handleClick(n: HrNotification) {
    onNavigate(n.target_tab);
    setOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggle}
        className="whitespace-nowrap relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-[#3b6ea5] hover:bg-[#e8f0f9] transition-colors cursor-pointer"
        title="HR requests"
      >
        <i className="ri-user-follow-line text-lg"></i>
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-amber-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-2xl border border-gray-200 z-[200] overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
                <i className="ri-user-follow-line text-[#3b6ea5] text-sm"></i>
              </div>
              <p className="text-sm font-extrabold text-gray-900">HR Requests</p>
              {count > 0 && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-extrabold rounded-full">{count} pending</span>
              )}
            </div>
            <button type="button" onClick={load} title="Refresh"
              className="text-gray-400 hover:text-[#3b6ea5] cursor-pointer">
              <i className={`ri-refresh-line text-sm ${loading ? "animate-spin" : ""}`}></i>
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {count === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                  <i className="ri-check-double-line text-gray-400 text-xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-600">No pending HR requests</p>
                <p className="text-xs text-gray-400 mt-1">Attendance &amp; leave requests will appear here</p>
              </div>
            ) : (
              items.map((n) => {
                const cfg = TYPE_CONFIG[n.source_type] ?? { icon: "ri-notification-3-line", color: "text-gray-500", bg: "bg-gray-50" };
                return (
                  <div key={n.id} onClick={() => handleClick(n)}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 ${cfg.bg}`}>
                      <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{fmtTime(n.created_at)} · {n.status}</p>
                    </div>
                    <i className="ri-arrow-right-s-line text-gray-300 text-sm flex-shrink-0 mt-1"></i>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Pending admin action</span>
            <button type="button" onClick={() => { onNavigate("team"); setOpen(false); }}
              className="text-xs font-semibold text-[#3b6ea5] hover:underline cursor-pointer">
              Open HR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
