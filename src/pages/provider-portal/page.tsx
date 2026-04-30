// Provider Portal — Main Page
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { normalizeStateListForDisplay } from "../../lib/usStates";
import ProviderOrderDetail from "./components/ProviderOrderDetail";
import ProviderEarnings from "./components/ProviderEarnings";
import ProviderLicensePanel from "./components/ProviderLicensePanel";
import ProviderProfilePanel from "./components/ProviderProfilePanel";

interface DoctorProfile {
  user_id: string;
  full_name: string;
  email: string | null;
  title: string | null;
  licensed_states: string[] | null;
  photo_url: string | null;
  is_active: boolean;
}

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  status: string;
  doctor_status: string | null;
  doctor_user_id: string | null;
  price: number | null;
  payment_intent_id: string | null;
  delivery_speed: string | null;
  selected_provider: string | null;
  assessment_answers: Record<string, unknown> | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  created_at: string;
  letter_type?: string | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
}

// ─── PSD order detection helper ──────────────────────────────────────────────
function isPSDOrder(order: Pick<Order, "letter_type" | "confirmation_id">): boolean {
  return order.letter_type === "psd" || order.confirmation_id.includes("-PSD");
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  confirmation_id: string | null;
  order_id?: string | null;
  created_at: string;
}

type TabKey = "orders" | "earnings" | "license" | "profile";
type StatusFilter = "all" | "new" | "in_progress" | "completed";

const DOCTOR_STATUS_LABEL: Record<string, string> = {
  pending_review: "New — Pending Review",
  in_review: "In Review",
  approved: "Approved",
  letter_sent: "Completed",
  patient_notified: "Completed",
  thirty_day_reissue: "30-Day Reissue",
};

const DOCTOR_STATUS_COLOR: Record<string, { badge: string; dot: string }> = {
  pending_review: { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  in_review: { badge: "bg-sky-100 text-sky-700", dot: "bg-sky-400" },
  approved: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  letter_sent: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  patient_notified: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  thirty_day_reissue: { badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
};

// ─── Helper: is this order cancelled or refunded (no work needed) ────────────
function isOrderInactive(order: Pick<Order, "status" | "refunded_at">): boolean {
  return order.status === "refunded" || !!order.refunded_at || order.status === "cancelled";
}

function statusMatchesFilter(doctorStatus: string | null, filter: StatusFilter, order: Order): boolean {
  if (filter === "all") return true;
  // Cancelled/refunded orders should never appear in active work queues
  if (filter === "new") return doctorStatus === "pending_review" && !isOrderInactive(order);
  if (filter === "in_progress") return (doctorStatus === "in_review" || doctorStatus === "approved" || doctorStatus === "thirty_day_reissue") && !isOrderInactive(order);
  if (filter === "completed") return doctorStatus === "patient_notified" || doctorStatus === "letter_sent";
  return true;
}

export default function ProviderPortalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);

  // New-case toast — auto-dismissed after 6s
  const [newCaseToast, setNewCaseToast] = useState<{ title: string; message: string; type?: "success" | "error" | "warning" } | null>(null);
  const toastTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = () => {
      setShowNotifications(false);
      setProfileDropdown(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Auth check
  useEffect(() => {
    const auth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Preserve the current URL (including ?order=) so the provider lands
        // right on the assigned case after logging in
        const returnUrl = window.location.pathname + window.location.search;
        navigate(`/provider-login?returnUrl=${encodeURIComponent(returnUrl)}`);
        return;
      }
      const { data: prof } = await supabase
        .from("doctor_profiles")
        .select("user_id, full_name, email, title, licensed_states, photo_url, is_active")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!prof) {
        const returnUrl = window.location.pathname + window.location.search;
        navigate(`/provider-login?returnUrl=${encodeURIComponent(returnUrl)}`);
        return;
      }
      if (prof.is_active === false) { await supabase.auth.signOut(); navigate("/provider-login"); return; }
      setProfile(prof as DoctorProfile);
      setLoading(false);
    };
    auth();
  }, [navigate]);

  const loadOrders = useCallback(async (showSpinner = true) => {
    if (!profile) return;
    if (showSpinner) setLoadingOrders(true);
    const { data } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, last_name, phone, state, status, doctor_status, doctor_user_id, price, payment_intent_id, delivery_speed, selected_provider, assessment_answers, letter_url, signed_letter_url, patient_notification_sent_at, created_at, letter_type, refunded_at, refund_amount, addon_services")
      .eq("doctor_user_id", profile.user_id)
      .order("created_at", { ascending: false });
    setOrders((data as Order[]) ?? []);
    if (showSpinner) setLoadingOrders(false);
  }, [profile]);

  const loadNotifications = useCallback(async () => {
    if (!profile) return;
    // Bell only shows new case assignments — not completion receipts or other system events
    const { data } = await supabase
      .from("doctor_notifications")
      .select("id, title, message, type, is_read, confirmation_id, created_at, order_id")
      .eq("doctor_user_id", profile.user_id)
      .eq("type", "case_assigned")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) { setNotifications([]); return; }

    // Filter out stale notifications whose linked order was deleted
    const orderIds = data
      .map((n: { order_id?: string }) => n.order_id)
      .filter(Boolean) as string[];

    let deletedOrderIds = new Set<string>();
    if (orderIds.length > 0) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .in("id", orderIds);
      const existingSet = new Set((existing ?? []).map((o: { id: string }) => o.id));
      deletedOrderIds = new Set(orderIds.filter((id) => !existingSet.has(id)));
    }

    const clean = (data as (Notification & { order_id?: string })[])
      .filter((n) => !n.order_id || !deletedOrderIds.has(n.order_id))
      .slice(0, 20);

    setNotifications(clean);
  }, [profile]);

  useEffect(() => {
    loadOrders(true); // show spinner on first load only
    loadNotifications();
  }, [loadOrders, loadNotifications]);

  // ── Polling fallback for critical status changes (refunds/cancellations) ──
  // Runs silently in the background — NO loading spinner, NO list flicker.
  // Real-time subscriptions catch most updates instantly; polling is a safety net.
  useEffect(() => {
    if (!profile) return;
    const interval = setInterval(() => {
      // Only poll when tab is visible — silent background refresh (showSpinner=false)
      if (document.visibilityState === "visible") {
        loadOrders(false);
      }
    }, 15000); // 15s is plenty — real-time handles instant updates
    return () => clearInterval(interval);
  }, [profile, loadOrders]);

  // ── Real-time subscriptions — fire the moment admin assigns/updates anything ──
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`provider-live-${profile.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `doctor_user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          const newOrder = payload.new as Order;
          setOrders((prev) => prev.some((o) => o.id === newOrder.id) ? prev : [newOrder, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `doctor_user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          const updated = payload.new as Order;
          const oldOrder = payload.old as Order;
          setOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
          setSelectedOrder((prev) => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);

          // Show toast for refund/cancellation status changes
          if (updated.status === "refunded" && oldOrder.status !== "refunded") {
            setNewCaseToast({
              title: "Order Refunded",
              message: `Order ${updated.confirmation_id} has been refunded. No further action needed.`,
              type: "warning"
            });
            if (toastTimerRef[0]) clearTimeout(toastTimerRef[0]);
            toastTimerRef[0] = setTimeout(() => setNewCaseToast(null), 8000);
          } else if (updated.status === "cancelled" && oldOrder.status !== "cancelled") {
            setNewCaseToast({
              title: "Order Cancelled",
              message: `Order ${updated.confirmation_id} has been cancelled by admin.`,
              type: "error"
            });
            if (toastTimerRef[0]) clearTimeout(toastTimerRef[0]);
            toastTimerRef[0] = setTimeout(() => setNewCaseToast(null), 8000);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "doctor_notifications",
          filter: `doctor_user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          loadNotifications();
          // Show in-page toast for new case assignments
          const notif = payload.new as Notification;
          if (notif.type === "case_assigned") {
            setNewCaseToast({ title: notif.title, message: notif.message, type: "success" });
            if (toastTimerRef[0]) clearTimeout(toastTimerRef[0]);
            toastTimerRef[0] = setTimeout(() => setNewCaseToast(null), 6000);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "doctor_notifications",
          filter: `doctor_user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          // Remove deleted notification from local state immediately
          const deleted = payload.old as { id: string };
          setNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
          filter: `doctor_user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          // Remove deleted order from state and close modal if it was open
          const deleted = payload.old as { id: string; confirmation_id?: string };
          setOrders((prev) => prev.filter((o) => o.id !== deleted.id));
          setSelectedOrder((prev) => (prev && prev.id === deleted.id ? null : prev));
          // Also purge any notifications tied to that order's confirmation_id
          if (deleted.confirmation_id) {
            setNotifications((prev) =>
              prev.filter((n) => n.confirmation_id !== deleted.confirmation_id)
            );
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, loadNotifications]);

  // Handle ?order=PT-XXXXX deep link from email + back button closing
  useEffect(() => {
    const orderId = searchParams.get("order");
    // If no order param in URL (e.g. back button was pressed), close the modal
    if (!orderId) {
      setSelectedOrder(null);
      return;
    }
    // Open the matching order when URL has ?order=
    if (orders.length > 0) {
      const found = orders.find((o) => o.confirmation_id === orderId);
      if (found) setSelectedOrder(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, searchParams]);

  const markNotificationsRead = async () => {
    if (!profile) return;
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    await supabase
      .from("doctor_notifications")
      .update({ is_read: true })
      .eq("doctor_user_id", profile.user_id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/provider-login");
  };

  const handleOrderUpdated = (updated: Partial<Order> & { id: string }) => {
    setOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
    if (selectedOrder?.id === updated.id) setSelectedOrder((prev) => prev ? { ...prev, ...updated } : null);
  };

  const handleOpenOrder = (order: Order) => {
    setSelectedOrder(order);
    setSearchParams({ order: order.confirmation_id });
  };

  const handleCloseOrder = () => {
    setSelectedOrder(null);
    setSearchParams({});
  };

  const filtered = orders.filter((o) => {
    if (!statusMatchesFilter(o.doctor_status, statusFilter, o)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ").toLowerCase();
      return (
        o.confirmation_id.toLowerCase().includes(q) ||
        name.includes(q) ||
        o.email.toLowerCase().includes(q) ||
        (o.state ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Order counts for tab badges — exclude cancelled/refunded from active queues
  const newCount = orders.filter((o) => o.doctor_status === "pending_review" && !isOrderInactive(o)).length;
  const inProgressCount = orders.filter((o) => (o.doctor_status === "in_review" || o.doctor_status === "approved") && !isOrderInactive(o)).length;
  const completedCount = orders.filter((o) => o.doctor_status === "letter_sent" || o.doctor_status === "patient_notified").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282]"></i>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "Doctor";
  const initials = profile?.full_name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) ?? "DR";

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link to="/" className="cursor-pointer">
            <img
              src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
              alt="PawTenant"
              className="h-9 w-auto object-contain"
            />
          </Link>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#e8f0f9] rounded-full">
            <div className="w-2 h-2 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#2c5282]"></div>
            </div>
            <span className="text-xs font-bold text-[#2c5282]">Provider Portal</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Notifications bell */}
          <div className="relative">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setShowNotifications((v) => !v); if (!showNotifications) markNotificationsRead(); setProfileDropdown(false); }}
              className="whitespace-nowrap relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors">
              <i className={`ri-notification-3-line text-base ${unreadCount > 0 ? "text-[#2c5282]" : ""}`}></i>
              {unreadCount > 0 && (
                <>
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-extrabold rounded-full z-10">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-400 animate-ping opacity-75"></span>
                </>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-2xl border border-gray-200 shadow-lg z-50 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-extrabold text-gray-900">New Assignments</p>
                  <span className="text-xs text-gray-400">{notifications.length} total</span>
                </div>
                {notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <i className="ri-notification-off-line text-2xl text-gray-300 block mb-2"></i>
                    <p className="text-xs text-gray-400">No notifications</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.map((n) => (
                      <div key={n.id}
                        className={`px-4 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${!n.is_read ? "bg-[#f8fdfc]" : ""}`}
                        onClick={() => {
                          if (n.confirmation_id) {
                            const order = orders.find((o) => o.confirmation_id === n.confirmation_id);
                            if (order) { handleOpenOrder(order); setShowNotifications(false); }
                          }
                        }}>
                        <div className="flex items-start gap-2.5">
                          {!n.is_read && <div className="w-2 h-2 rounded-full bg-[#2c5282] flex-shrink-0 mt-1.5"></div>}
                          {n.is_read && <div className="w-2 h-2 flex-shrink-0"></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900">{n.title}</p>
                            <p className="text-xs text-gray-500 leading-relaxed mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profile dropdown */}
          <div className="relative">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setProfileDropdown((v) => !v); setShowNotifications(false); }}
              className="whitespace-nowrap flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors">
              <div className="w-7 h-7 flex items-center justify-center bg-[#2c5282] text-white text-xs font-extrabold rounded-full">
                {initials}
              </div>
              <span className="hidden sm:block text-sm font-bold text-gray-700">{firstName}</span>
              <i className="ri-arrow-down-s-line text-gray-400 text-sm"></i>
            </button>
            {profileDropdown && (
              <div className="absolute right-0 top-11 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden py-1" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-900">{profile?.full_name}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                  {profile?.title && <p className="text-xs text-[#2c5282] font-semibold mt-0.5">{profile.title}</p>}
                </div>
                <div className="py-1">
                  {/* OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-A: dedupe
                      mixed legacy storage so "VA" + "Virginia" renders as one
                      "Virginia" entry. Provider-facing sidebar prefers the
                      full state name for readability. */}
                  {(() => {
                    const sidebarStates = normalizeStateListForDisplay(profile?.licensed_states ?? []);
                    if (sidebarStates.length === 0) return null;
                    return (
                      <div className="px-4 py-2">
                        <p className="text-xs text-gray-400 mb-1">Licensed States</p>
                        <p className="text-xs font-semibold text-gray-700">{sidebarStates.map((s) => s.label).join(", ")}</p>
                      </div>
                    );
                  })()}
                  <button type="button" onClick={handleSignOut}
                    className="whitespace-nowrap w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer transition-colors font-semibold">
                    <i className="ri-logout-box-line"></i>Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Toast Notifications ── */}
      {newCaseToast && (
        <div className="fixed bottom-6 right-6 z-[200] max-w-sm w-full">
          <div className={`${
            newCaseToast.type === "error" ? "bg-red-600" :
            newCaseToast.type === "warning" ? "bg-amber-500" :
            "bg-[#2c5282]"
          } text-white rounded-2xl shadow-lg overflow-hidden`}>
            <div className="px-5 py-4 flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-white/20 rounded-xl flex-shrink-0 mt-0.5">
                <i className={`${
                  newCaseToast.type === "error" ? "ri-close-circle-line" :
                  newCaseToast.type === "warning" ? "ri-refund-line" :
                  "ri-folder-received-line"
                } text-white text-base`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-white">{newCaseToast.title}</p>
                <p className="text-xs text-white/75 mt-0.5 leading-relaxed line-clamp-2">{newCaseToast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setNewCaseToast(null)}
                className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 cursor-pointer transition-colors flex-shrink-0"
              >
                <i className="ri-close-line text-white/70 text-sm"></i>
              </button>
            </div>
            <div className="h-1 bg-white/20">
              <div className="h-full bg-white/60 rounded-full" style={{ width: "100%", animation: "shrink 8s linear forwards" }}></div>
            </div>
          </div>
          <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome header */}
        <div className="mb-6">
          <p className="text-xs text-[#2c5282] font-bold uppercase tracking-widest mb-1">Welcome back</p>
          <h1 className="text-2xl font-extrabold text-gray-900">{profile?.full_name ?? "Provider"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {orders.length > 0
              ? `${orders.length} case${orders.length !== 1 ? "s" : ""} assigned · ${newCount > 0 ? `${newCount} new` : "none new"}`
              : "No cases assigned yet — check back soon."
            }
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Assigned", value: orders.length, icon: "ri-file-list-3-line", color: "text-gray-700", bg: "bg-gray-100" },
            { label: "New / Pending", value: newCount, icon: "ri-time-line", color: "text-amber-600", bg: "bg-amber-100" },
            { label: "In Progress", value: inProgressCount, icon: "ri-stethoscope-line", color: "text-sky-600", bg: "bg-sky-100" },
            { label: "Completed", value: completedCount, icon: "ri-checkbox-circle-line", color: "text-[#2c5282]", bg: "bg-[#e8f0f9]" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 flex items-center justify-center ${s.bg} rounded-lg flex-shrink-0`}>
                  <i className={`${s.icon} ${s.color} text-sm`}></i>
                </div>
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Main tabs */}
        <div className="flex items-center gap-1 bg-gray-100/70 rounded-xl p-1 mb-5 w-fit">
          {([
            { key: "orders" as TabKey, label: "My Cases", icon: "ri-folder-line" },
            { key: "earnings" as TabKey, label: "Earnings", icon: "ri-money-dollar-circle-line" },
            { key: "license" as TabKey, label: "My Licenses", icon: "ri-shield-check-line" },
            { key: "profile" as TabKey, label: "Profile", icon: "ri-user-settings-line" },
          ]).map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-extrabold transition-colors cursor-pointer ${activeTab === tab.key ? "bg-white text-[#2c5282]" : "text-gray-500 hover:text-gray-700"}`}>
              <i className={tab.icon}></i>{tab.label}
              {tab.key === "orders" && newCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-[10px] font-extrabold rounded-full">
                  {newCount > 9 ? "9+" : newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── ORDERS TAB ── */}
        {activeTab === "orders" && (
          <div>
            {/* Filters bar */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { value: "all", label: "All" },
                  { value: "new", label: `New${newCount > 0 ? ` (${newCount})` : ""}` },
                  { value: "in_progress", label: "In Progress" },
                  { value: "completed", label: "Completed" },
                ] as { value: StatusFilter; label: string }[]).map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${statusFilter === opt.value ? "bg-[#2c5282] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="relative sm:ml-auto w-full sm:w-64">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, state, order ID..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#2c5282]" />
              </div>
            </div>

            {/* Orders list */}
            {loadingOrders ? (
              <div className="flex items-center justify-center py-20">
                <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282]"></i>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                  <i className="ri-folder-open-line text-gray-400 text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-700 mb-1">
                  {orders.length === 0 ? "No cases assigned yet" : "No cases match your filters"}
                </p>
                <p className="text-xs text-gray-400">
                  {orders.length === 0
                    ? "When a case is assigned to you, it will appear here and you'll receive an email notification."
                    : "Try changing your filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((order) => {
                  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
                  const doctorStatus = order.doctor_status ?? "pending_review";
                  const statusConfig = DOCTOR_STATUS_COLOR[doctorStatus] ?? { badge: "bg-gray-100 text-gray-500", dot: "bg-gray-400" };
                  const isNew = doctorStatus === "pending_review";
                  const isLetterIssued = doctorStatus === "letter_sent" || doctorStatus === "patient_notified";
                  const isThirtyDay = doctorStatus === "thirty_day_reissue";
                  const isRefunded = order.status === "refunded" || !!order.refunded_at;
                  const isPSD = isPSDOrder(order);

                  return (
                    <div key={order.id}
                      className={`bg-white rounded-xl border p-5 transition-colors ${isRefunded ? "border-red-200 bg-red-50/30 opacity-80" : isPSD ? "border-amber-200" : isNew ? "border-amber-200" : isThirtyDay ? "border-orange-200" : isLetterIssued ? "border-[#b8cce4]" : "border-gray-200"}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 flex items-center justify-center rounded-full text-xs font-extrabold flex-shrink-0 ${isRefunded ? "bg-red-100 text-red-600" : isLetterIssued ? "bg-[#e8f0f9] text-[#2c5282]" : isPSD ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                            {fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <p className="text-sm font-extrabold text-gray-900">{fullName}</p>
                              {isNew && !isRefunded && (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-extrabold rounded-full uppercase tracking-wider">New</span>
                              )}
                              {isRefunded && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded-full text-[10px] font-extrabold">
                                  <i className="ri-refund-line" style={{ fontSize: "9px" }}></i>Refunded
                                </span>
                              )}
                              {isPSD ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-full text-[10px] font-extrabold">
                                  <i className="ri-service-line" style={{ fontSize: "9px" }}></i>PSD Letter
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-[#e8f0f9] text-[#2c5282] border border-[#b8cce4] rounded-full text-[10px] font-extrabold">
                                  <i className="ri-heart-line" style={{ fontSize: "9px" }}></i>ESA Letter
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-400 font-mono">{order.confirmation_id}</span>
                              <span className="text-gray-200 text-xs">·</span>
                              {order.state && <span className="text-xs text-gray-500 font-semibold">{order.state}</span>}
                              <span className="text-gray-200 text-xs">·</span>
                              <span className="text-xs text-gray-400 truncate max-w-[160px]">{order.email}</span>
                            </div>
                            {order.phone && (
                              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                <i className="ri-phone-line text-gray-300"></i>{order.phone}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-2 flex-shrink-0">
                          {isRefunded ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></div>
                              Refunded — Locked
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusConfig.badge}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} flex-shrink-0`}></div>
                              {DOCTOR_STATUS_LABEL[doctorStatus] ?? doctorStatus}
                            </span>
                          )}
                          <p className="hidden sm:block text-xs text-gray-400 text-right">
                            Assigned {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                          {isRefunded ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-500 text-xs font-bold rounded-xl cursor-not-allowed">
                              <i className="ri-lock-2-line"></i><span className="hidden sm:inline">Assignment Locked</span><span className="sm:hidden">Locked</span>
                            </div>
                          ) : (
                            <button type="button" onClick={() => handleOpenOrder(order)}
                              className={`whitespace-nowrap flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-xl cursor-pointer transition-colors ${isNew ? "bg-[#2c5282] text-white hover:bg-[#17504a]" : isThirtyDay ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                              {isNew ? <><i className="ri-eye-line"></i>View Case</> : isThirtyDay ? <><i className="ri-time-line"></i>Issue Letter</> : <><i className="ri-arrow-right-line"></i>Open</>}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EARNINGS TAB ── */}
        {activeTab === "earnings" && profile && (
          <ProviderEarnings userId={profile.user_id} />
        )}

        {/* ── LICENSE TAB ── */}
        {activeTab === "license" && profile && (
          <ProviderLicensePanel userId={profile.user_id} providerName={profile.full_name} />
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && profile && (
          <ProviderProfilePanel userId={profile.user_id} providerName={profile.full_name} />
        )}
      </div>

      {/* Order detail modal */}
      {selectedOrder && profile && (
        <ProviderOrderDetail
          order={selectedOrder}
          providerUserId={profile.user_id}
          providerName={profile.full_name}
          onClose={handleCloseOrder}
          onOrderUpdated={handleOrderUpdated}
        />
      )}
    </div>
  );
}
