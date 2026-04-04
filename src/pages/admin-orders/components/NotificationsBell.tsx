// NotificationsBell — Real-time admin notifications dropdown
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface Notification {
  id: string;
  type: "new_order" | "payment_failed" | "inbound_sms" | "inbound_call" | "dispute" | "refund" | "system";
  title: string;
  body: string;
  orderId?: string;
  confirmationId?: string;
  customerName?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsBellProps {
  onViewOrder?: (confirmationId: string) => void;
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TYPE_CONFIG: Record<Notification["type"], { icon: string; color: string; bg: string; dot: string }> = {
  new_order:      { icon: "ri-file-add-line",        color: "text-[#1a5c4f]",   bg: "bg-[#f0faf7]",   dot: "bg-[#1a5c4f]" },
  payment_failed: { icon: "ri-bank-card-line",        color: "text-red-600",     bg: "bg-red-50",      dot: "bg-red-500" },
  inbound_sms:    { icon: "ri-message-3-fill",        color: "text-violet-600",  bg: "bg-violet-50",   dot: "bg-violet-500" },
  inbound_call:   { icon: "ri-phone-fill",             color: "text-sky-600",     bg: "bg-sky-50",      dot: "bg-sky-500" },
  dispute:        { icon: "ri-error-warning-line",    color: "text-red-700",     bg: "bg-red-50",      dot: "bg-red-600" },
  refund:         { icon: "ri-refund-line",           color: "text-orange-600",  bg: "bg-orange-50",   dot: "bg-orange-500" },
  system:         { icon: "ri-settings-3-line",       color: "text-gray-500",    bg: "bg-gray-50",     dot: "bg-gray-400" },
};

const STORAGE_KEY = "pw_admin_notifications";
const READ_KEY = "pw_admin_notifications_read";

function loadStored(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Notification[]) : [];
  } catch { return []; }
}

function loadReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveStored(notifs: Notification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 50))); } catch { /* ignore */ }
}

function saveReadSet(ids: Set<string>) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

export default function NotificationsBell({ onViewOrder }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(() => loadStored());
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadSet());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  // ── Close on outside click ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Add notification helper ────────────────────────────────────────────
  const addNotification = useCallback((notif: Omit<Notification, "read">) => {
    setNotifications((prev) => {
      if (prev.some((n) => n.id === notif.id)) return prev;
      const updated = [{ ...notif, read: false }, ...prev].slice(0, 50);
      saveStored(updated);
      return updated;
    });
  }, []);

  // ── Real-time: new orders ──────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("notif-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as {
          id: string; confirmation_id: string; first_name?: string; last_name?: string;
          email: string; state?: string; payment_intent_id?: string; created_at: string;
        };
        const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
        addNotification({
          id: `order-${o.id}`,
          type: "new_order",
          title: "New Order",
          body: `${name} started an application${o.state ? ` from ${o.state}` : ""}`,
          orderId: o.id,
          confirmationId: o.confirmation_id,
          customerName: name,
          createdAt: o.created_at,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [addNotification]);

  // ── Real-time: payment failures ────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("notif-payment-fail")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as {
          id: string; confirmation_id: string; first_name?: string; last_name?: string;
          email: string; payment_failure_reason?: string; payment_failed_at?: string; created_at: string;
        };
        if (!o.payment_failure_reason) return;
        const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
        addNotification({
          id: `payment-fail-${o.id}-${o.payment_failed_at ?? Date.now()}`,
          type: "payment_failed",
          title: "Payment Failed",
          body: `${name} — ${o.payment_failure_reason}`,
          orderId: o.id,
          confirmationId: o.confirmation_id,
          customerName: name,
          createdAt: o.payment_failed_at ?? new Date().toISOString(),
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [addNotification]);

  // ── Real-time: inbound SMS/calls ───────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("notif-comms")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communications" }, (payload) => {
        const c = payload.new as {
          id: string; type: string; direction: string; body?: string;
          phone_from?: string; confirmation_id?: string; created_at: string;
        };
        if (c.direction !== "inbound") return;
        const isCall = c.type === "call_inbound";
        addNotification({
          id: `comm-${c.id}`,
          type: isCall ? "inbound_call" : "inbound_sms",
          title: isCall ? "Incoming Call" : "Incoming SMS",
          body: isCall
            ? `Call from ${c.phone_from ?? "unknown"}${c.confirmation_id ? ` · ${c.confirmation_id}` : ""}`
            : `${c.body?.slice(0, 80) ?? "New message"}${c.confirmation_id ? ` · ${c.confirmation_id}` : ""}`,
          confirmationId: c.confirmation_id,
          createdAt: c.created_at,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [addNotification]);

  // ── Real-time: disputes ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("notif-disputes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as {
          id: string; confirmation_id: string; first_name?: string; last_name?: string;
          email: string; dispute_id?: string; dispute_reason?: string; dispute_created_at?: string; created_at: string;
        };
        if (!o.dispute_id) return;
        const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
        addNotification({
          id: `dispute-${o.dispute_id}`,
          type: "dispute",
          title: "Chargeback / Dispute",
          body: `${name} — ${o.dispute_reason ?? "Dispute filed"}`,
          orderId: o.id,
          confirmationId: o.confirmation_id,
          customerName: name,
          createdAt: o.dispute_created_at ?? new Date().toISOString(),
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [addNotification]);

  const markAllRead = () => {
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    saveReadSet(allIds);
  };

  const markRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadSet(next);
      return next;
    });
  };

  const clearAll = () => {
    setNotifications([]);
    setReadIds(new Set());
    saveStored([]);
    saveReadSet(new Set());
  };

  const handleNotifClick = (notif: Notification) => {
    markRead(notif.id);
    if (notif.confirmationId && onViewOrder) {
      onViewOrder(notif.confirmationId);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="whitespace-nowrap relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-[#1a5c4f] hover:bg-[#f0faf7] transition-colors cursor-pointer"
        title="Notifications"
      >
        <i className="ri-notification-3-line text-lg"></i>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-2xl border border-gray-200 z-[200] overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] rounded-lg flex-shrink-0">
                <i className="ri-notification-3-line text-[#1a5c4f] text-sm"></i>
              </div>
              <p className="text-sm font-extrabold text-gray-900">Notifications</p>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-extrabold rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead}
                  className="whitespace-nowrap text-xs font-semibold text-[#1a5c4f] hover:underline cursor-pointer">
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button type="button" onClick={clearAll}
                  className="whitespace-nowrap text-xs font-semibold text-gray-400 hover:text-red-500 cursor-pointer">
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                  <i className="ri-notification-off-line text-gray-400 text-xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-600">No notifications yet</p>
                <p className="text-xs text-gray-400 mt-1">New orders, messages, and alerts will appear here</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const cfg = TYPE_CONFIG[notif.type];
                const isUnread = !readIds.has(notif.id);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${isUnread ? "bg-[#fafffe]" : ""}`}
                  >
                    {/* Icon */}
                    <div className={`w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 ${cfg.bg}`}>
                      <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold truncate ${isUnread ? "text-gray-900" : "text-gray-600"}`}>
                          {notif.title}
                        </p>
                        {isUnread && (
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}></span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{fmtTime(notif.createdAt)}</p>
                    </div>
                    {/* Unread dot */}
                    {notif.confirmationId && (
                      <div className="flex-shrink-0 mt-1">
                        <i className="ri-arrow-right-s-line text-gray-300 text-sm"></i>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <p className="text-[10px] text-gray-400 text-center">
                Showing last {notifications.length} notification{notifications.length !== 1 ? "s" : ""} · Real-time updates
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
