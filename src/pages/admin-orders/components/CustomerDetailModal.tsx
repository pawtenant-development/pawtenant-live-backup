import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CustomerPortalPreview from "./CustomerPortalPreview";

interface OrderDocument {
  id: string;
  order_id: string;
  label: string;
  doc_type: string;
  file_url: string;
  uploaded_at: string;
  sent_to_customer: boolean;
  customer_visible: boolean;
}

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  selected_provider: string | null;
  price: number | null;
  status: string;
  doctor_status: string | null;
  doctor_name: string | null;
  doctor_email: string | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  assessment_answers: Record<string, unknown> | null;
  created_at: string;
  ghl_synced_at: string | null;
  ghl_sync_error: string | null;
  user_id: string | null;
  payment_intent_id: string | null;
  documents?: OrderDocument[];
}

interface DoctorNote {
  id: string;
  order_id: string;
  doctor_user_id: string;
  note: string;
  created_at: string;
}

interface DoctorNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  order_id: string;
  confirmation_id: string;
  created_at: string;
}

interface DoctorProfile {
  user_id: string;
  full_name: string;
}

interface CustomerDetailModalProps {
  email: string;
  fullName: string;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
  "under-review": "bg-sky-100 text-sky-700",
};

const DOCTOR_STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  in_review: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  letter_sent: "bg-[#e8f5f1] text-[#3b6ea5]",
  patient_notified: "bg-violet-100 text-violet-700",
  unassigned: "bg-gray-100 text-gray-500",
};

const NOTIF_ICON: Record<string, string> = {
  new_assignment: "ri-user-add-line",
  status_update: "ri-refresh-line",
  letter_ready: "ri-file-pdf-line",
  patient_notified: "ri-send-plane-line",
};

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function CustomerDetailModal({ email, fullName, onClose }: CustomerDetailModalProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [notes, setNotes] = useState<Record<string, DoctorNote[]>>({});
  const [notifications, setNotifications] = useState<Record<string, DoctorNotification[]>>({});
  const [doctorProfiles, setDoctorProfiles] = useState<DoctorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"notes" | "notifications" | "assessment" | "portal">("notes");
  const [portalStatus, setPortalStatus] = useState<"checking" | "exists" | "not_found">("checking");

  // Admin action states
  const [ghlFiring, setGhlFiring] = useState<string | null>(null);
  const [ghlMsg, setGhlMsg] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [emailSending, setEmailSending] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // Customer portal reset / welcome
  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; msg: string; link?: string } | null>(null);
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState<{ ok: boolean; msg: string; link?: string } | null>(null);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, first_name, last_name, phone, state, plan_type, delivery_speed, selected_provider, price, status, doctor_status, doctor_name, doctor_email, letter_url, signed_letter_url, patient_notification_sent_at, assessment_answers, created_at, ghl_synced_at, ghl_sync_error, user_id, payment_intent_id")
        .eq("email", email)
        .order("created_at", { ascending: false });

      const fetchedOrders = (ordersData as Order[]) ?? [];

      // Check portal status: any order with a user_id means the customer registered
      const hasPortal = fetchedOrders.some((o) => !!o.user_id);
      setPortalStatus(hasPortal ? "exists" : "not_found");

      if (fetchedOrders.length > 0) {
        setActiveOrderId(fetchedOrders[0].id);
        const orderIds = fetchedOrders.map((o) => o.id);

        const [notesRes, notifsRes, profilesRes, docsRes] = await Promise.all([
          supabase.from("doctor_notes").select("*").in("order_id", orderIds).order("created_at", { ascending: true }),
          supabase.from("doctor_notifications").select("*").in("order_id", orderIds).order("created_at", { ascending: false }),
          supabase.from("doctor_profiles").select("user_id, full_name"),
          supabase.from("order_documents").select("*").in("order_id", orderIds).order("uploaded_at", { ascending: true }),
        ]);

        const notesMap: Record<string, DoctorNote[]> = {};
        ((notesRes.data as DoctorNote[]) ?? []).forEach((n) => {
          if (!notesMap[n.order_id]) notesMap[n.order_id] = [];
          notesMap[n.order_id].push(n);
        });
        setNotes(notesMap);

        const notifMap: Record<string, DoctorNotification[]> = {};
        ((notifsRes.data as DoctorNotification[]) ?? []).forEach((n) => {
          if (!notifMap[n.order_id]) notifMap[n.order_id] = [];
          notifMap[n.order_id].push(n);
        });
        setNotifications(notifMap);

        setDoctorProfiles((profilesRes.data as DoctorProfile[]) ?? []);

        // Attach documents to their respective orders
        const docsMap = new Map<string, OrderDocument[]>();
        ((docsRes.data as (OrderDocument & { order_id: string })[]) ?? []).forEach((d) => {
          if (!docsMap.has(d.order_id)) docsMap.set(d.order_id, []);
          docsMap.get(d.order_id)!.push(d);
        });

        setOrders(fetchedOrders.map((o) => ({ ...o, documents: docsMap.get(o.id) ?? [] })));
      } else {
        setOrders([]);
      }

      setLoading(false);
    };
    load();
  }, [email]);

  const handleGhlRefire = async (order: Order) => {
    setGhlFiring(order.confirmation_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/backfill-order-ghl`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id }),
      });
      const result = await res.json() as { ok: boolean; message?: string };
      const msg = result.message ?? (result.ok ? "GHL synced!" : "Sync failed");
      setGhlMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: result.ok, msg } }));
      if (result.ok) {
        setOrders((prev) => prev.map((o) =>
          o.confirmation_id === order.confirmation_id
            ? { ...o, ghl_synced_at: new Date().toISOString(), ghl_sync_error: null }
            : o
        ));
      }
    } catch {
      setGhlMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: false, msg: "Network error" } }));
    }
    setGhlFiring(null);
    setTimeout(() => setGhlMsg((prev) => { const n = { ...prev }; delete n[order.confirmation_id]; return n; }), 5000);
  };

  const handleSendPortalReset = async () => {
    setResetSending(true);
    setResetMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const firstName = fullName.split(" ")[0] || "there";
      const res = await fetch(`${supabaseUrl}/functions/v1/send-customer-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, first_name: firstName, action: "reset" }),
      });
      const result = await res.json() as { ok: boolean; message?: string; error?: string; action_link?: string; account_created?: boolean; email_sent?: boolean };
      if (result.ok) {
        setResetMsg({ ok: true, msg: result.message ?? "Reset email sent!", link: result.email_sent ? undefined : result.action_link });
        if (result.account_created) setPortalStatus("exists");
      } else {
        setResetMsg({ ok: false, msg: result.error ?? "Failed to send reset email." });
      }
    } catch {
      setResetMsg({ ok: false, msg: "Network error — please try again." });
    }
    setResetSending(false);
  };

  const handleResendWelcomeEmail = async () => {
    setWelcomeSending(true);
    setWelcomeMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const firstName = fullName.split(" ")[0] || "there";
      const res = await fetch(`${supabaseUrl}/functions/v1/send-customer-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, first_name: firstName, action: "welcome" }),
      });
      const result = await res.json() as { ok: boolean; message?: string; error?: string; action_link?: string; account_created?: boolean; email_sent?: boolean };
      if (result.ok) {
        setWelcomeMsg({ ok: true, msg: result.message ?? "Welcome email sent!", link: result.email_sent ? undefined : result.action_link });
        if (result.account_created) setPortalStatus("exists");
      } else {
        setWelcomeMsg({ ok: false, msg: result.error ?? "Failed to send welcome email." });
      }
    } catch {
      setWelcomeMsg({ ok: false, msg: "Network error — please try again." });
    }
    setWelcomeSending(false);
  };

  const handleResendEmail = async (order: Order) => {
    if (!order.letter_url) {
      setEmailMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: false, msg: "No letter URL yet" } }));
      setTimeout(() => setEmailMsg((prev) => { const n = { ...prev }; delete n[order.confirmation_id]; return n; }), 4000);
      return;
    }
    setEmailSending(order.confirmation_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-patient-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      const msg = result.ok ? "Email sent!" : (result.error ?? "Send failed");
      setEmailMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: !!result.ok, msg } }));
      if (result.ok) {
        setOrders((prev) => prev.map((o) =>
          o.confirmation_id === order.confirmation_id
            ? { ...o, patient_notification_sent_at: new Date().toISOString() }
            : o
        ));
      }
    } catch {
      setEmailMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: false, msg: "Network error" } }));
    }
    setEmailSending(null);
    setTimeout(() => setEmailMsg((prev) => { const n = { ...prev }; delete n[order.confirmation_id]; return n; }), 5000);
  };

  const getDoctorName = (userId: string) =>
    doctorProfiles.find((p) => p.user_id === userId)?.full_name ?? "Provider";

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const activeNotes = activeOrderId ? (notes[activeOrderId] ?? []) : [];
  const activeNotifs = activeOrderId ? (notifications[activeOrderId] ?? []) : [];

  // Only count orders that were actually paid (have a payment_intent_id)
  const totalSpent = orders.filter((o) => !!o.payment_intent_id).reduce((s, o) => s + (o.price ?? 0), 0);
  const initials = fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center bg-[#e8f0f9] rounded-full text-[#3b6ea5] text-lg font-extrabold flex-shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-gray-900">{fullName}</h2>
                {/* Portal status badge */}
                {portalStatus === "exists" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-xs font-bold">
                    <i className="ri-user-follow-line" style={{ fontSize: "10px" }}></i>Portal Active
                  </span>
                ) : portalStatus === "not_found" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-bold">
                    <i className="ri-user-unfollow-line" style={{ fontSize: "10px" }}></i>No Portal
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-400">{email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 text-center">
              <div>
                <p className="text-lg font-extrabold text-gray-900">{orders.length}</p>
                <p className="text-xs text-gray-400">Orders</p>
              </div>
              <div className="w-px h-8 bg-gray-100"></div>
              <div>
                <p className="text-lg font-extrabold text-emerald-600">${totalSpent.toLocaleString()}</p>
                <p className="text-xs text-gray-400">Total Spent</p>
              </div>
              {orders.length > 1 && (
                <>
                  <div className="w-px h-8 bg-gray-100"></div>
                  <span className="px-2.5 py-1 bg-sky-50 text-sky-600 text-xs font-bold rounded-full">Repeat Customer</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i>
              <p className="text-sm text-gray-500">Loading case details...</p>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-sm text-gray-400">No orders found for this customer.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left sidebar */}
            <div className="w-60 flex-shrink-0 border-r border-gray-100 bg-gray-50/60 overflow-y-auto">
              <div className="px-3 py-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Cases ({orders.length})</p>
                <div className="space-y-1">
                  {orders.map((order) => {
                    const isActive = order.id === activeOrderId;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setActiveOrderId(order.id)}
                        className={`w-full text-left px-3 py-3 rounded-xl cursor-pointer transition-colors ${isActive ? "bg-white border border-gray-200" : "hover:bg-white/70"}`}
                      >
                        <p className="text-xs font-mono font-bold text-gray-700 truncate">{order.confirmation_id}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDateShort(order.created_at)}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-500"}`}>
                            {order.status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          {order.ghl_synced_at ? (
                            <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-semibold">
                              <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>GHL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-xs text-gray-400 font-semibold">
                              <i className="ri-time-line" style={{ fontSize: "9px" }}></i>GHL?
                            </span>
                          )}
                        </div>
                        {order.price != null && (
                          <p className="text-xs font-bold text-emerald-600 mt-1">${order.price}</p>
                        )}
                        {(notes[order.id]?.length ?? 0) > 0 && (
                          <p className="text-xs text-[#3b6ea5] mt-1 flex items-center gap-1">
                            <i className="ri-sticky-note-line"></i>{notes[order.id].length} note{notes[order.id].length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right panel */}
            {activeOrder && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">

                  {/* ── Quick Actions Bar ── */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mr-1">Actions</p>

                    {/* Only show Resend Letter Email when a letter actually exists and order was paid */}
                    {activeOrder.payment_intent_id && (activeOrder.letter_url || activeOrder.signed_letter_url) && (
                      <button
                        type="button"
                        onClick={() => handleResendEmail(activeOrder)}
                        disabled={emailSending === activeOrder.confirmation_id}
                        className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold rounded-lg hover:bg-violet-100 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {emailSending === activeOrder.confirmation_id
                          ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                          : <><i className="ri-mail-send-line"></i>Resend Letter Email</>}
                      </button>
                    )}

                    {!activeOrder.ghl_synced_at && (
                      <button
                        type="button"
                        onClick={() => handleGhlRefire(activeOrder)}
                        disabled={ghlFiring === activeOrder.confirmation_id}
                        className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {ghlFiring === activeOrder.confirmation_id
                          ? <><i className="ri-loader-4-line animate-spin"></i>Syncing...</>
                          : <><i className="ri-refresh-line"></i>Retry GHL Sync</>}
                      </button>
                    )}

                    {activeOrder.ghl_synced_at && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#e8f0f9] text-[#3b6ea5] text-xs font-semibold rounded-lg">
                        <i className="ri-checkbox-circle-fill text-[#3b6ea5]"></i>
                        GHL Synced {formatDateShort(activeOrder.ghl_synced_at)}
                      </span>
                    )}

                    {/* View as Customer — opens real portal pre-filtered to this customer */}
                    <a
                      href={`/my-orders?preview_email=${encodeURIComponent(email)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open customer portal view for ${email}`}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-orange-200 bg-orange-50 text-orange-700 text-xs font-semibold rounded-lg hover:bg-orange-100 cursor-pointer transition-colors"
                    >
                      <i className="ri-eye-line"></i>View as Customer
                    </a>

                    {/* Resend Portal Welcome Email — for customers who never received it */}
                    <button
                      type="button"
                      onClick={handleResendWelcomeEmail}
                      disabled={welcomeSending}
                      title="Re-sends the original portal welcome email with login instructions"
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-sky-200 bg-sky-50 text-sky-700 text-xs font-semibold rounded-lg hover:bg-sky-100 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {welcomeSending
                        ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                        : <><i className="ri-mail-open-line"></i>Resend Welcome Email</>}
                    </button>

                    {/* Send Portal Access / Password Reset */}
                    <button
                      type="button"
                      onClick={handleSendPortalReset}
                      disabled={resetSending}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {resetSending
                        ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                        : portalStatus === "not_found"
                          ? <><i className="ri-user-add-line"></i>Send Portal Access</>
                          : <><i className="ri-lock-password-line"></i>Send Password Reset</>}
                    </button>

                    {portalStatus === "not_found" && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/customer-login`)}
                        className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                      >
                        <i className="ri-link"></i>Copy Portal URL
                      </button>
                    )}

                    {/* Welcome email feedback */}
                    {welcomeMsg && (
                      <div className={`flex flex-col gap-1 ${welcomeMsg.ok ? "text-sky-700" : "text-red-500"}`}>
                        <p className="text-xs flex items-center gap-1">
                          <i className={welcomeMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                          {welcomeMsg.msg}
                        </p>
                        {welcomeMsg.link && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Fallback link:</span>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(welcomeMsg.link!); }}
                              className="whitespace-nowrap text-xs text-[#3b6ea5] underline cursor-pointer hover:text-[#2d5a8e]"
                            >
                              Copy link
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Portal reset feedback */}
                    {resetMsg && (
                      <div className={`flex flex-col gap-1 ${resetMsg.ok ? "text-emerald-700" : "text-red-500"}`}>
                        <p className="text-xs flex items-center gap-1">
                          <i className={resetMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                          {resetMsg.msg}
                        </p>
                        {resetMsg.link && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Fallback link:</span>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(resetMsg.link!); }}
                              className="whitespace-nowrap text-xs text-[#3b6ea5] underline cursor-pointer hover:text-[#2d5a8e]"
                            >
                              Copy link
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Feedback messages */}
                    {(emailMsg[activeOrder.confirmation_id] || ghlMsg[activeOrder.confirmation_id]) && (
                      <p className={`text-xs flex items-center gap-1 ${(emailMsg[activeOrder.confirmation_id]?.ok ?? ghlMsg[activeOrder.confirmation_id]?.ok) ? "text-[#3b6ea5]" : "text-red-500"}`}>
                        <i className={`${(emailMsg[activeOrder.confirmation_id]?.ok ?? ghlMsg[activeOrder.confirmation_id]?.ok) ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}`}></i>
                        {emailMsg[activeOrder.confirmation_id]?.msg ?? ghlMsg[activeOrder.confirmation_id]?.msg}
                      </p>
                    )}
                  </div>

                  {/* Order summary */}
                  <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-5">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Confirmation ID</p>
                        <p className="text-sm font-mono font-bold text-gray-800">{activeOrder.confirmation_id}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[activeOrder.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {activeOrder.status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        {activeOrder.doctor_status && (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${DOCTOR_STATUS_COLOR[activeOrder.doctor_status] ?? "bg-gray-100 text-gray-500"}`}>
                            {activeOrder.doctor_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {[
                        { label: "Date", value: formatDateShort(activeOrder.created_at) },
                        { label: "State", value: activeOrder.state ?? "—" },
                        { label: "Plan", value: activeOrder.plan_type ?? "—" },
                        { label: "Amount", value: activeOrder.price != null ? `$${activeOrder.price}` : "—" },
                        { label: "Provider Type", value: activeOrder.selected_provider ?? "—" },
                        { label: "Delivery", value: activeOrder.delivery_speed ?? "—" },
                        { label: "Phone", value: activeOrder.phone ?? "—" },
                        {
                          label: "GHL Sync",
                          value: activeOrder.ghl_synced_at
                            ? `Synced ${formatDateShort(activeOrder.ghl_synced_at)}`
                            : activeOrder.ghl_sync_error
                            ? "Failed"
                            : "Pending",
                          highlight: activeOrder.ghl_synced_at
                            ? "text-emerald-600"
                            : activeOrder.ghl_sync_error
                            ? "text-red-500"
                            : "text-amber-500",
                        },
                        {
                          label: "Patient Notified",
                          value: activeOrder.patient_notification_sent_at ? formatDateShort(activeOrder.patient_notification_sent_at) : "Not sent",
                          highlight: activeOrder.patient_notification_sent_at ? "text-emerald-600" : "text-gray-400",
                        },
                        {
                          label: "Portal Account",
                          value: portalStatus === "exists" ? "Registered" : "Not registered",
                          highlight: portalStatus === "exists" ? "text-emerald-600" : "text-gray-400",
                        },
                      ].map((item) => (
                        <div key={item.label}>
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`text-sm font-semibold text-gray-800 truncate ${("highlight" in item && item.highlight) ? item.highlight : ""}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Assigned Doctor */}
                  {activeOrder.doctor_name && (
                    <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4 mb-5 flex items-center gap-3">
                      <div className="w-9 h-9 flex items-center justify-center bg-white rounded-full flex-shrink-0">
                        <i className="ri-user-heart-line text-[#3b6ea5] text-base"></i>
                      </div>
                      <div>
                        <p className="text-xs text-[#3b6ea5] font-bold">Assigned Provider</p>
                        <p className="text-sm font-bold text-[#3b6ea5]">{activeOrder.doctor_name}</p>
                        {activeOrder.doctor_email && <p className="text-xs text-[#3b6ea5]/70">{activeOrder.doctor_email}</p>}
                      </div>
                      {activeOrder.patient_notification_sent_at && (
                        <div className="ml-auto text-right">
                          <p className="text-xs text-[#3b6ea5]/60">Patient notified</p>
                          <p className="text-xs font-semibold text-[#3b6ea5]">{formatDateShort(activeOrder.patient_notification_sent_at)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Letter History — shows provider-uploaded documents only (no auto-generated template) */}
                  {(activeOrder.signed_letter_url || (activeOrder.documents && activeOrder.documents.length > 0)) && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Letter History</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Provider-uploaded documents from order_documents table */}
                        {(activeOrder.documents ?? [])
                          .filter((d) => d.customer_visible !== false)
                          .map((doc) => (
                            <a
                              key={doc.id}
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl text-sm font-semibold text-[#3b6ea5] hover:bg-[#e0f2ec] cursor-pointer transition-colors"
                            >
                              <i className="ri-file-check-line text-base"></i>
                              {doc.label}
                              <i className="ri-external-link-line text-[#3b6ea5]/40 text-xs"></i>
                            </a>
                          ))}
                        {/* Legacy signed_letter_url (direct upload from old provider flow) */}
                        {activeOrder.signed_letter_url && !(activeOrder.documents ?? []).some((d) => d.file_url === activeOrder.signed_letter_url) && (
                          <a
                            href={activeOrder.signed_letter_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl text-sm font-semibold text-[#3b6ea5] hover:bg-[#e0f2ec] cursor-pointer transition-colors"
                          >
                            <i className="ri-shield-check-line text-base"></i>
                            Signed Letter
                            <i className="ri-external-link-line text-[#3b6ea5]/40 text-xs"></i>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section tabs */}
                  <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 mb-4 w-fit">
                    {([
                      { key: "notes", label: "Case Notes", icon: "ri-sticky-note-line", count: activeNotes.length },
                      { key: "notifications", label: "Doctor Comms", icon: "ri-notification-3-line", count: activeNotifs.length },
                      { key: "assessment", label: "Assessment", icon: "ri-questionnaire-line", count: null },
                      { key: "portal", label: "Portal View", icon: "ri-computer-line", count: null },
                    ] as { key: "notes" | "notifications" | "assessment" | "portal"; label: string; icon: string; count: number | null }[]).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveSection(tab.key)}
                        className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeSection === tab.key ? "bg-white text-gray-900 border border-gray-200" : "text-gray-500 hover:bg-white/60"}`}
                      >
                        <i className={tab.icon}></i>
                        {tab.label}
                        {tab.count !== null && tab.count > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === tab.key ? "bg-[#3b6ea5] text-white" : "bg-gray-200 text-gray-600"}`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Case Notes */}
                  {activeSection === "notes" && (
                    <div>
                      {activeNotes.length === 0 ? (
                        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                          <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-2">
                            <i className="ri-sticky-note-line text-gray-400 text-lg"></i>
                          </div>
                          <p className="text-sm text-gray-400 font-medium">No case notes yet</p>
                          <p className="text-xs text-gray-300 mt-1">Notes are added by the assigned provider during case review.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeNotes.map((note) => (
                            <div key={note.id} className="bg-white border border-gray-100 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-full flex-shrink-0">
                                    <i className="ri-user-heart-line text-[#3b6ea5] text-xs"></i>
                                  </div>
                                  <p className="text-xs font-bold text-gray-700">{getDoctorName(note.doctor_user_id)}</p>
                                </div>
                                <p className="text-xs text-gray-400">{formatDate(note.created_at)}</p>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.note}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Doctor Notifications */}
                  {activeSection === "notifications" && (
                    <div>
                      {activeNotifs.length === 0 ? (
                        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                          <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-2">
                            <i className="ri-notification-3-line text-gray-400 text-lg"></i>
                          </div>
                          <p className="text-sm text-gray-400 font-medium">No communications logged</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activeNotifs.map((notif) => {
                            const icon = NOTIF_ICON[notif.type] ?? "ri-notification-3-line";
                            return (
                              <div key={notif.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${notif.is_read ? "bg-white border-gray-100" : "bg-[#e8f0f9] border-[#b8cce4]"}`}>
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 ${notif.is_read ? "bg-gray-100" : "bg-[#3b6ea5]/10"}`}>
                                  <i className={`${icon} ${notif.is_read ? "text-gray-400" : "text-[#3b6ea5]"} text-sm`}></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-bold text-gray-800">{notif.title}</p>
                                    <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(notif.created_at)}</p>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">{notif.message}</p>
                                  {!notif.is_read && (
                                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-[#3b6ea5] text-white text-xs font-bold rounded">Unread</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assessment Answers */}
                  {activeSection === "assessment" && (
                    <div>
                      {!activeOrder.assessment_answers || Object.keys(activeOrder.assessment_answers).length === 0 ? (
                        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                          <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-2">
                            <i className="ri-questionnaire-line text-gray-400 text-lg"></i>
                          </div>
                          <p className="text-sm text-gray-400 font-medium">No assessment data available</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(activeOrder.assessment_answers).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
                              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <i className="ri-question-line text-gray-400 text-sm"></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-500 mb-0.5">
                                  {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                </p>
                                <p className="text-sm text-gray-800">
                                  {Array.isArray(value)
                                    ? (value as unknown[]).join(", ")
                                    : typeof value === "object" && value !== null
                                    ? JSON.stringify(value)
                                    : String(value ?? "—")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Portal View */}
                  {activeSection === "portal" && (
                    <CustomerPortalPreview orders={orders} userEmail={email} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
