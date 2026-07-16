// CustomerPortalHeader — account-level header for the customer portal hub
// (CUSTOMER-PORTAL-ACCOUNT-HUB-REDESIGN-001). Shows the customer's name/email,
// a compact status summary across ALL their orders, and a support CTA.

import { OrderLike, isPSD } from "./orderDisplay";
import type { AccountGreeting } from "@/lib/customerName";
import { isRefundedBucket } from "@/lib/orderClassification";

interface HeaderOrder extends OrderLike {
  doctor_status?: string | null;
  status?: string;
  refunded_at?: string | null;
  // Required by the canonical classifier — partial vs full refund.
  refund_status?: string | null;
  refund_amount?: number | null;
}

export default function CustomerPortalHeader({
  greeting,
  userEmail,
  orders,
  onContactSupport,
}: {
  // Resolved account greeting (never derived from the email address).
  greeting: AccountGreeting;
  userEmail: string;
  orders: HeaderOrder[];
  onContactSupport: () => void;
}) {
  const total = orders.length;
  const completed = orders.filter((o) => o.doctor_status === "patient_notified").length;
  // A partially-refunded order is still in progress and must be counted.
  const active = orders.filter(
    (o) => !!o.payment_intent_id && o.doctor_status !== "patient_notified"
      && !isRefundedBucket(o),
  ).length;
  const pendingPayment = orders.filter((o) => !o.payment_intent_id && o.status !== "cancelled").length;

  // "Welcome back, John" when a real first name resolved; neutral "Welcome back"
  // otherwise. Name is authoritative (order/profile/intake/auth) — never the email.
  const greetingText = greeting.isFallback || !greeting.firstName
    ? "Welcome back"
    : `Welcome back, ${greeting.firstName}`;
  const avatarChar = (greeting.firstName || userEmail || "?").charAt(0).toUpperCase();

  const stats: Array<{ label: string; value: number; icon: string; tint: string }> = [
    { label: "Total orders", value: total, icon: "ri-file-list-3-line", tint: "text-[#5F6B7A] bg-[#eef2f7]" },
    { label: "In progress", value: active, icon: "ri-loader-4-line", tint: "text-[#2563EB] bg-[#EFF6FF]" },
    { label: "Completed letters", value: completed, icon: "ri-checkbox-circle-line", tint: "text-[#059669] bg-[#ECFDF5]" },
  ];
  if (pendingPayment > 0) {
    stats.push({ label: "Pending payment", value: pendingPayment, icon: "ri-time-line", tint: "text-[#B45309] bg-[#FFFBEB]" });
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden mb-6">
      <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-[#3b6ea5] text-white text-lg font-extrabold flex-shrink-0">
            {avatarChar}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-[#3b6ea5] font-bold uppercase tracking-widest">Customer Account</p>
            <h1 className="text-xl font-extrabold text-[#172033] leading-tight truncate">{greetingText}</h1>
            {userEmail && <p className="text-xs text-[#5F6B7A] truncate flex items-center gap-1"><i className="ri-mail-line"></i>{userEmail}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onContactSupport}
          className="whitespace-nowrap self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:border-[#dbe4f0] hover:text-[#1e3a5f] transition-colors cursor-pointer flex-shrink-0"
        >
          <i className="ri-customer-service-2-line text-[#3b6ea5]"></i>Get support
        </button>
      </div>
      {total > 0 && (
        <div className="border-t border-gray-100 px-5 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${s.tint}`}>
                <i className={`${s.icon} text-sm`}></i>
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-gray-900 leading-none">{s.value}</p>
                <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export so callers don't import isPSD from two places by mistake.
export { isPSD };
