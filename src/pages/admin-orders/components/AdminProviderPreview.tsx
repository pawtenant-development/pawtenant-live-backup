// AdminProviderPreview — Read-only preview of provider portal for admins
// Lets admins see exactly what the assigned provider sees before refunding/cancelling
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import ProviderOrderDetail from "../../provider-portal/components/ProviderOrderDetail";

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
  doctor_name: string | null;
  doctor_email: string | null;
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
  addon_services?: string[] | null;
}

// Wrapper component that provides the order data to ProviderOrderDetail
export default function AdminProviderPreview() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const confirmationId = searchParams.get("order");

  // Check admin auth and load order
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin-login");
        return;
      }

      // Verify user is admin
      const { data: profile } = await supabase
        .from("doctor_profiles")
        .select("is_admin, role, full_name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const adminCheck = profile?.is_admin === true || ["owner", "admin_manager"].includes(profile?.role ?? "");
      setIsAdmin(adminCheck);

      if (!adminCheck) {
        setError("Access denied — admin only");
        setLoading(false);
        return;
      }

      if (!confirmationId) {
        setError("No order specified. Use ?order=PT-XXXXX");
        setLoading(false);
        return;
      }

      // Load the order with all fields ProviderOrderDetail needs
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select(`
          id, confirmation_id, email, first_name, last_name, phone, state,
          status, doctor_status, doctor_user_id, doctor_name, doctor_email,
          price, payment_intent_id, delivery_speed, selected_provider,
          assessment_answers, letter_url, signed_letter_url,
          patient_notification_sent_at, created_at, letter_type,
          refunded_at, refund_amount, addon_services
        `)
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      if (orderErr || !orderData) {
        setError(orderErr?.message ?? "Order not found");
        setLoading(false);
        return;
      }

      setOrder(orderData as Order);
      setLoading(false);
    };

    init();
  }, [confirmationId, navigate]);

  const handleClose = () => {
    // Go back to admin orders, preserving any filters
    navigate("/admin-orders");
  };

  const handleOrderUpdated = (updated: Partial<Order> & { id: string }) => {
    // In preview mode, we don't actually update — just refresh the local state
    setOrder((prev) => prev ? { ...prev, ...updated } : null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f] block mb-3"></i>
          <p className="text-sm text-gray-500">Loading provider preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-red-100 rounded-full mx-auto mb-4">
            <i className="ri-error-warning-line text-red-600 text-2xl"></i>
          </div>
          <h2 className="text-lg font-extrabold text-gray-900 mb-2">Preview Unavailable</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/admin-orders")}
            className="whitespace-nowrap px-6 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors"
          >
            Back to Admin Orders
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-4">
            <i className="ri-file-search-line text-gray-400 text-2xl"></i>
          </div>
          <h2 className="text-lg font-extrabold text-gray-900 mb-2">Order Not Found</h2>
          <p className="text-sm text-gray-500 mb-6">Could not find order {confirmationId}</p>
          <button
            type="button"
            onClick={() => navigate("/admin-orders")}
            className="whitespace-nowrap px-6 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors"
          >
            Back to Admin Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Admin Preview Banner */}
      <div className="bg-amber-500 text-white px-4 py-3 sticky top-0 z-[200]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-white/20 rounded-lg flex-shrink-0">
              <i className="ri-eye-line text-white"></i>
            </div>
            <div>
              <p className="text-sm font-extrabold">Admin Preview Mode</p>
              <p className="text-xs text-white/80">
                Viewing as: {order.doctor_name ?? "Unassigned Provider"} 
                {order.doctor_email && <span className="opacity-75"> ({order.doctor_email})</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Assignment Status Badge */}
            {order.doctor_status ? (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                order.doctor_status === "pending_review" ? "bg-amber-100 text-amber-800" :
                order.doctor_status === "in_review" ? "bg-sky-100 text-sky-800" :
                order.doctor_status === "letter_sent" || order.doctor_status === "patient_notified" ? "bg-emerald-100 text-emerald-800" :
                "bg-gray-100 text-gray-700"
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  order.doctor_status === "pending_review" ? "bg-amber-500" :
                  order.doctor_status === "in_review" ? "bg-sky-500" :
                  order.doctor_status === "letter_sent" || order.doctor_status === "patient_notified" ? "bg-emerald-500" :
                  "bg-gray-400"
                }`}></div>
                Provider: {order.doctor_status.replace(/_/g, " ")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                <i className="ri-error-warning-line"></i>
                Not Assigned
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              <i className="ri-close-line"></i>Close Preview
            </button>
          </div>
        </div>
      </div>

      {/* Provider Portal Simulation */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 flex items-center justify-center bg-[#f0faf7] rounded-lg">
                <i className="ri-user-line text-[#1a5c4f]"></i>
              </div>
              <span className="text-xs text-gray-500 font-medium">Assigned Provider</span>
            </div>
            <p className="text-sm font-bold text-gray-900">{order.doctor_name ?? "—"}</p>
            <p className="text-xs text-gray-400 truncate">{order.doctor_email ?? "Not assigned"}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg">
                <i className="ri-time-line text-amber-600"></i>
              </div>
              <span className="text-xs text-gray-500 font-medium">Current Status</span>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {order.doctor_status ? order.doctor_status.replace(/_/g, " ") : "Not started"}
            </p>
            <p className="text-xs text-gray-400">
              {order.doctor_status === "pending_review" ? "Provider has not opened yet" :
               order.doctor_status === "in_review" ? "Provider is actively reviewing" :
               order.doctor_status === "letter_sent" ? "Letter submitted, patient not notified" :
               order.doctor_status === "patient_notified" ? "Complete — patient notified" :
               "Awaiting assignment"}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 flex items-center justify-center bg-red-50 rounded-lg">
                <i className="ri-refund-line text-red-500"></i>
              </div>
              <span className="text-xs text-gray-500 font-medium">Refund Safety Check</span>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {order.doctor_status === "patient_notified" || order.doctor_status === "letter_sent" ? (
                <span className="text-red-600">⚠️ Work Completed</span>
              ) : order.doctor_status === "in_review" ? (
                <span className="text-amber-600">⚠️ In Progress</span>
              ) : (
                <span className="text-emerald-600">✓ Safe to Refund</span>
              )}
            </p>
            <p className="text-xs text-gray-400">
              {order.doctor_status === "patient_notified" || order.doctor_status === "letter_sent" ? 
                "Provider has submitted work — earnings preserved" :
                order.doctor_status === "in_review" ? 
                "Provider has started — confirm before refunding" :
                "No provider work recorded yet"}
            </p>
          </div>
        </div>

        {/* The actual ProviderOrderDetail component */}
        <div className="relative">
          {/* Read-only overlay indicator */}
          <div className="absolute top-4 right-4 z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/80 text-white text-xs font-bold rounded-full backdrop-blur-sm">
              <i className="ri-lock-line"></i>Read-Only Preview
            </span>
          </div>

          <ProviderOrderDetail
            order={order}
            providerUserId={order.doctor_user_id ?? "preview-mode"}
            providerName={order.doctor_name ?? "Provider Preview"}
            onClose={handleClose}
            onOrderUpdated={handleOrderUpdated}
          />
        </div>
      </div>
    </div>
  );
}