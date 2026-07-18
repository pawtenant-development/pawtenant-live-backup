import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import ContactSupportWidget from "./components/ContactSupportWidget";
import AdditionalDocRequest, { canRequestAdditionalDoc } from "./components/AdditionalDocRequest";
import RaDocumentUpload, { showRaDocumentUpload } from "./components/RaDocumentUpload";
import OrderOverviewCard from "./components/OrderOverviewCard";
import LetterDeliveryCard from "./components/LetterDeliveryCard";
import ProviderInfoCard from "./components/ProviderInfoCard";
import AssessmentCard from "./components/AssessmentCard";
import PreferredContactCard from "./components/PreferredContactCard";
import PsdUpsellCard from "./components/PsdUpsellCard";
import PortalSocialSection from "./components/PortalSocialSection";
import GoogleReviewCard from "./components/GoogleReviewCard";
import CustomerPortalHeader from "./components/CustomerPortalHeader";
import OrderSwitcher from "./components/OrderSwitcher";
import SelectedOrderHeader from "./components/SelectedOrderHeader";
import { isAnnual as isAnnualOrder } from "./components/orderDisplay";
import OrderLifecycle from "./components/OrderLifecycle";
import UnpaidBookingCard from "./components/UnpaidBookingCard";
import LockedFeaturePreviews from "./components/LockedFeaturePreviews";
import MyDocumentsCard from "./components/MyDocumentsCard";
import NeedHelpCard from "./components/NeedHelpCard";
import CustomerPortalSection from "./components/CustomerPortalSection";
import { isUnpaidLead, isPaidOrder, isTerminalOrder } from "@/lib/bookingProgress";
import { isRefundTerminal, isOperationallyCancelled, isPartialRefund } from "@/lib/orderClassification";
import { resolveAccountGreeting, type NameUserLike } from "@/lib/customerName";
import { trackCustomerPortalViewed } from "@/lib/trackEvent";

interface OrderDocument {
  id: string;
  label: string;
  doc_type: string;
  file_url: string;
  processed_file_url: string | null;
  footer_injected: boolean;
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
  state: string | null;
  selected_provider: string | null;
  doctor_user_id?: string | null;
  doctor_name?: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  price: number | null;
  payment_intent_id: string | null;
  status: string;
  doctor_status: string | null;
  // Authoritative "patient-notification email sent" timestamp. The portal only
  // claims documents were emailed (vs merely "ready") when this is set.
  patient_notification_sent_at?: string | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  letter_id?: string | null;
  letter_type: string | null;
  additional_documents_requested: { types?: string[]; otherDescription?: string } | null;
  // RA bundle (PACKAGE-RA-LETTER-BUNDLE-001)
  package_key?: string | null;
  package_display_name?: string | null;
  billing_plan?: string | null;
  includes_reasonable_accommodation_letter?: boolean | null;
  additional_documentation_status?: string | null;
  // Portal guidance (CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001)
  user_id?: string | null;
  phone?: string | null;
  refunded_at?: string | null;
  assessment_answers?: Record<string, unknown> | null;
  preferred_provider_contact_date?: string | null;
  preferred_provider_contact_window?: string | null;
  preferred_provider_contact_note?: string | null;
  preferred_provider_contact_timezone?: string | null;
  created_at: string;
  documents?: OrderDocument[];
}

function isPSDOrder(order: Order): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

function ReturningCustomerActions({ orderId, showUpgrade = false, showRepeat = false, title }: { orderId: string; showUpgrade?: boolean; showRepeat?: boolean; title?: string }) {
  const [busy, setBusy] = useState<"upgrade" | "repeat" | null>(null);
  const [err, setErr] = useState("");
  if (!showUpgrade && !showRepeat) return null;

  const spawn = async (action: "upgrade" | "repeat") => {
    setBusy(action);
    setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setErr("Your session has expired — please sign in again.");
        setBusy(null);
        return;
      }
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-returning-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ parentOrderId: orderId, action }),
      });
      const result = (await res.json()) as { ok?: boolean; confirmationId?: string; error?: string };
      if (!res.ok || !result.ok || !result.confirmationId) {
        setErr(result.error ?? "Could not start checkout. Please try again.");
        setBusy(null);
        return;
      }
      window.location.href = `/account/checkout?cid=${encodeURIComponent(result.confirmationId)}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 bg-gradient-to-r from-[#e8f0f9] to-white border border-[#e8f0f9] rounded-xl px-4 py-3">
      <p className="text-xs font-extrabold text-[#1e3a5f] uppercase tracking-wide mb-2">{title ?? "Next steps"}</p>
      <div className="flex flex-wrap gap-2">
        {showUpgrade && (
          <button
            type="button"
            onClick={() => spawn("upgrade")}
            disabled={busy !== null}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer transition-colors"
          >
            {busy === "upgrade" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-vip-crown-line"></i>}
            Upgrade to Annual Subscription
          </button>
        )}
        {showRepeat && (
          <button
            type="button"
            onClick={() => spawn("repeat")}
            disabled={busy !== null}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#e2e8f0] text-[#5F6B7A] text-xs font-bold rounded-lg hover:bg-[#ffffff] hover:text-[#3b6ea5] disabled:opacity-60 cursor-pointer transition-colors"
          >
            {busy === "repeat" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-add-circle-line"></i>}
            Buy Another ESA
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><i className="ri-error-warning-line"></i>{err}</p>}
    </div>
  );
}

// Derive a friendly display status from both order.status and doctor_status
function getDisplayStatus(order: Order): {
  label: string; color: string; icon: string; bgGradient: string; step: number;
} {
  const s = order.status;
  const ds = order.doctor_status;
  const isPaid = !!(order as Order & { payment_intent_id?: string | null }).payment_intent_id;

  // Warm-clinical palette (CUSTOMER-PORTAL-PROVIDER-PROFILE-ACCOUNT-HUB-FINAL-REDESIGN-001):
  // green=completed · review-blue=under review · amber=pending/payment · warm-neutral=assigned.
  // The selected-order header uses a single calm warm-raised gradient for all statuses.
  const WARM = "from-[#ffffff] to-white";
  if (isOperationallyCancelled(order)) return { label: "Cancelled", color: "bg-[#f1f5f9] text-[#475569]", icon: "ri-close-circle-line", bgGradient: WARM, step: -1 };
  // PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: only a FULL refund ends the
  // order. A partial refund must fall through to the real operational status so
  // the customer keeps their lifecycle, their letter and their documents.
  if (isRefundTerminal(order)) return { label: "Refunded", color: "bg-[#f1f5f9] text-[#475569]", icon: "ri-refund-line", bgGradient: WARM, step: -1 };

  // CRITICAL: check payment FIRST — unpaid leads must never show provider statuses
  if (!isPaid || s === "lead") return { label: "Pending Payment", color: "bg-[#FFFBEB] text-[#B45309]", icon: "ri-time-line", bgGradient: WARM, step: -1 };

  // Completed ONLY when provider has notified patient
  if (ds === "patient_notified") return { label: "Completed", color: "bg-[#ECFDF5] text-[#059669]", icon: "ri-checkbox-circle-fill", bgGradient: WARM, step: 3 };
  // 30-day reissue — customer sees "Under Review"
  if (ds === "thirty_day_reissue") return { label: "Under Review", color: "bg-[#EFF6FF] text-[#2563EB]", icon: "ri-stethoscope-line", bgGradient: WARM, step: 2 };
  // letter_sent is INTERNAL — customer sees "Under Review"
  if (ds === "letter_sent") return { label: "Under Review", color: "bg-[#EFF6FF] text-[#2563EB]", icon: "ri-stethoscope-line", bgGradient: WARM, step: 2 };
  if (ds === "in_review" || ds === "approved") return { label: "Under Review", color: "bg-[#EFF6FF] text-[#2563EB]", icon: "ri-stethoscope-line", bgGradient: WARM, step: 2 };
  if (ds === "pending_review" || s === "under-review") return { label: "Assigned to Provider", color: "bg-[#eef2f7] text-[#475569]", icon: "ri-user-received-line", bgGradient: WARM, step: 1 };
  // Paid but no provider yet
  if (s === "completed" || s === "paid" || s === "processing") return { label: "Payment Confirmed", color: "bg-[#FFFBEB] text-[#B45309]", icon: "ri-loader-4-line", bgGradient: WARM, step: 0 };
  return { label: "Payment Confirmed", color: "bg-[#FFFBEB] text-[#B45309]", icon: "ri-loader-4-line", bgGradient: WARM, step: 0 };
}

function getDaysUntilRenewal(createdAt: string): number {
  const created = new Date(createdAt);
  const renewDate = new Date(created);
  renewDate.setFullYear(renewDate.getFullYear() + 1);
  const now = new Date();
  return Math.max(0, Math.ceil((renewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

// Two-column grid class tokens (kept as literal strings so Tailwind's JIT emits
// them). The right-hand column starts at the top of the grid (aligned with the
// lifecycle/overview) and spans both main rows so it stays on the right on desktop.
const TWO_COL_GRID =
  "mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-6 lg:items-start";
const COL_MAIN_TOP = "lg:col-start-1 lg:row-start-1 space-y-4 min-w-0";
const COL_SIDE = "lg:col-start-2 lg:row-start-1 lg:row-span-2 space-y-4 min-w-0";
const COL_MAIN_BOTTOM = "lg:col-start-1 lg:row-start-2 space-y-4 min-w-0";

function OrderCard({
  order,
  onContactSupport,
  addonSuccessOrder,
  layout = "two-col",
}: {
  order: Order;
  onContactSupport: () => void;
  addonSuccessOrder?: string | null;
  // "two-col" = dedicated right-hand Documents column (single-order view).
  // "single" = stacked one column (used beside the multi-order switcher rail),
  // Documents still surfacing right after the Housing workflow.
  layout?: "two-col" | "single";
}) {
  const isLead = isUnpaidLead(order) && !isTerminalOrder(order);
  // Only a FULL refund shows the "your order has been refunded" message. A
  // partial refund keeps the order live and gets its own informational notice.
  const isRefunded = isRefundTerminal(order);
  const isCancelled = isOperationallyCancelled(order) && !isRefunded;
  const isPartialRefunded = isPartialRefund(order) && !isRefunded && !isCancelled;
  const delivered = order.doctor_status === "patient_notified" || !!order.letter_id;
  // Landlord-verifiable card is ESA-specific copy; PSD verification IDs still show
  // inline on the My Documents letter row.
  const showVerify = delivered && !isPSDOrder(order);

  // ── Main column, TOP: booking → progress → overview → provider → letter →
  //    Housing Accommodation workflow. (Documents come right after this on mobile.) ──
  const mainTop = (
    <>
      {isLead && (
        <UnpaidBookingCard
          order={order}
          onReviewAssessment={() =>
            document.getElementById("portal-my-assessment")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
      )}

      <OrderLifecycle order={order} />

      <OrderOverviewCard order={order} />

      {isLead && <LockedFeaturePreviews order={order} />}

      {isRefunded && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-start gap-2">
          <i className="ri-refund-line flex-shrink-0 mt-0.5"></i>
          <div>
            <p className="font-bold mb-0.5">Your order has been refunded.</p>
            <p>The refund should appear on your original payment method within <strong>5–10 business days</strong>. If you have questions, please contact our support team.</p>
            <button
              type="button"
              onClick={onContactSupport}
              className="whitespace-nowrap mt-2 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <i className="ri-customer-service-2-line"></i>Contact Support
            </button>
          </div>
        </div>
      )}

      {/* Partial refund — the order is NOT over. Calm, factual, and explicit
          that the letter is still coming, so the customer is never told their
          order ended when only a billing adjustment was made. */}
      {isPartialRefunded && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 text-xs text-[#92400E] flex items-start gap-2">
          <i className="ri-refund-line flex-shrink-0 mt-0.5"></i>
          <div>
            <p className="font-bold mb-0.5">A partial refund was issued on this order.</p>
            <p>
              Your order is still active and is being processed as normal — this was a billing
              adjustment only. The refunded amount should appear on your original payment method
              within <strong>5–10 business days</strong>.
            </p>
            <button
              type="button"
              onClick={onContactSupport}
              className="whitespace-nowrap mt-2 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <i className="ri-customer-service-2-line"></i>Contact Support
            </button>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-start gap-2">
          <i className="ri-close-circle-line flex-shrink-0 mt-0.5"></i>
          <div>
            <p className="font-bold mb-0.5">This order has been cancelled.</p>
            <p>If you believe this is an error or need assistance, please contact our support team.</p>
            <button
              type="button"
              onClick={onContactSupport}
              className="whitespace-nowrap mt-2 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <i className="ri-customer-service-2-line"></i>Contact Support
            </button>
          </div>
        </div>
      )}

      {/* Status-specific messages — PAID orders only. An unpaid lead's
          doctor_status can read "pending_review" from an unassigned default, so
          gating on isPaidOrder prevents a false "assigned to provider" message. */}
      {isPaidOrder(order) && order.doctor_status !== "patient_notified" && !isRefunded && !isCancelled && (
        <div className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 ${
          order.doctor_status === "letter_sent"
            ? "bg-[#e8f0f9] border border-[#dbe4f0] text-[#B45309]"
            : order.doctor_status === "in_review" || order.doctor_status === "approved"
            ? "bg-[#EFF6FF] border border-[#DBEAFE] text-[#2563EB]"
            : order.doctor_status === "pending_review"
            ? "bg-[#ffffff] border border-[#e2e8f0] text-[#475569]"
            : "bg-[#FFFBEB] border border-[#dbe4f0] text-[#B45309]"
        }`}>
          <i className={`flex-shrink-0 mt-0.5 ${
            order.doctor_status === "letter_sent" ? "ri-file-shield-line" :
            order.doctor_status === "in_review" ? "ri-stethoscope-line" :
            order.doctor_status === "pending_review" ? "ri-user-received-line" :
            "ri-time-line"
          }`}></i>
          <div className="flex-1">
            <span>
              {order.doctor_status === "letter_sent"
                ? "Your evaluation is nearing completion. You'll receive an email once your documents are ready to download."
                : order.doctor_status === "in_review" || order.doctor_status === "approved"
                ? "Your provider is actively reviewing your case. You'll receive an email as soon as your documents are ready."
                : order.doctor_status === "pending_review"
                ? "Your case has been assigned to a licensed provider and is awaiting initial review. You'll receive an email once your evaluation begins."
                : (
                    <>
                      <strong>Your payment was received — your case is being queued for provider assignment.</strong>
                      {" "}A licensed {isPSDOrder(order) ? "healthcare" : "mental health"} provider will be assigned to your case{" "}
                      {order.delivery_speed === "24hours" || order.delivery_speed === "24h"
                        ? "within a few hours."
                        : "within 1 business day."
                      }
                      {" "}Once assigned, your {isPSDOrder(order) ? "PSD" : "ESA"} letter will be ready{" "}
                      {order.delivery_speed === "24hours" || order.delivery_speed === "24h"
                        ? "within 24 hours."
                        : "within 2–3 business days."
                      }
                      {" "}You'll receive an email notification when your provider is assigned.
                    </>
                  )
              }
            </span>
            <button
              type="button"
              onClick={onContactSupport}
              className="whitespace-nowrap mt-2 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <i className="ri-customer-service-2-line"></i>Have a question? Contact support
            </button>
          </div>
        </div>
      )}

      {/* Assigned provider */}
      <ProviderInfoCard order={order} />

      {/* Where your letter will appear (pre-delivery placeholder) */}
      <LetterDeliveryCard order={order} />

      {/* Housing Accommodation workflow: combo (included) upload, OR the standard
          $70 add-on (mutually exclusive). The completed form itself is a My
          Documents deliverable, not duplicated here. */}
      {showRaDocumentUpload(order) && <RaDocumentUpload order={order} />}
      {!showRaDocumentUpload(order) && canRequestAdditionalDoc(order) && (
        <AdditionalDocRequest
          order={order}
          highlightSuccess={
            !!addonSuccessOrder &&
            addonSuccessOrder.toUpperCase() === (order.confirmation_id ?? "").toUpperCase()
          }
        />
      )}

      {order.doctor_status === "patient_notified" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700 flex items-center gap-2">
          <i className="ri-checkbox-circle-fill flex-shrink-0"></i>
          {/* Delivery recipient is the ORDER's email — never the authenticated
              viewer/admin session (Admin Customer View previews another customer).
              Only claim it was emailed when patient_notification_sent_at proves the
              delivery email actually went out; otherwise just say it's ready. */}
          <span>
            {order.email && order.patient_notification_sent_at ? (
              <>Your documents were sent to <strong>{order.email}</strong> and are ready in <strong>My Documents</strong>.</>
            ) : (
              <>Your documents are ready in <strong>My Documents</strong>.</>
            )}
          </span>
        </div>
      )}
    </>
  );

  // ── Right column: My Documents → Verification → Need Help ──
  const rightCol = (
    <>
      <MyDocumentsCard order={order} />

      {showVerify && (
        <CustomerPortalSection title="Verification" icon="ri-shield-check-line" tone="blue">
          <p className="text-xs text-gray-600 leading-relaxed">
            Your ESA letter includes a unique <strong>Verification ID</strong> and QR code. Landlords can instantly
            confirm its authenticity at{" "}
            <a href="/esa-letter-verification" className="underline underline-offset-2 font-bold text-[#3b6ea5] hover:text-[#1e3a5f] cursor-pointer">pawtenant.com/esa-letter-verification</a>{" "}
            — zero health info disclosed.
          </p>
          <a
            href="/esa-letter-verification"
            className="whitespace-nowrap mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-[#3b6ea5] hover:text-[#1e3a5f] transition-colors cursor-pointer"
          >
            <i className="ri-qr-code-line"></i>See how verification works
            <i className="ri-arrow-right-s-line"></i>
          </a>
        </CustomerPortalSection>
      )}

      <NeedHelpCard onContactSupport={onContactSupport} />
    </>
  );

  // ── Main column, BOTTOM: submitted assessment → contact time → next steps ──
  const mainBottom = (
    <>
      {/* Your submitted assessment (view / download) */}
      <div id="portal-my-assessment">
        <AssessmentCard order={order} />
      </div>

      {/* Preferred provider contact time (optional) */}
      <PreferredContactCard order={order} />

      {/* Next steps — one-time ESA orders can upgrade to annual; annual orders show nothing.
          "Buy Another ESA" lives at the account level, not in the selected order. */}
      {order.payment_intent_id && !isPSDOrder(order) && !isAnnualOrder(order) && (
        <ReturningCustomerActions orderId={order.id} showUpgrade title="Next steps" />
      )}

      {/* Additional docs requested indicator */}
      {order.additional_documents_requested && (order.additional_documents_requested.types ?? []).filter((t) => t !== "ESA Letter").length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
          <i className="ri-file-add-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
          <div>
            <p className="text-xs font-bold text-amber-800 mb-1">Additional documents requested</p>
            <div className="flex flex-wrap gap-1.5">
              {(order.additional_documents_requested.types ?? [])
                .filter((t) => t !== "ESA Letter")
                .map((t) => (
                  <span key={t} className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">{t}</span>
                ))}
            </div>
            <p className="text-xs text-amber-600 mt-1">Our team will coordinate these with your provider. Check your email for updates.</p>
          </div>
        </div>
      )}
    </>
  );

  // Single-column (beside the multi-order switcher): stack top → documents →
  // bottom, so Documents still land right after the Housing workflow.
  if (layout === "single") {
    return (
      <div className="mt-4 space-y-4 min-w-0">
        {mainTop}
        {rightCol}
        {mainBottom}
      </div>
    );
  }

  // Two-column (single-order view): dedicated right-hand Documents column.
  return (
    <div className={TWO_COL_GRID}>
      <div className={COL_MAIN_TOP}>{mainTop}</div>
      <div className={COL_SIDE}>{rightCol}</div>
      <div className={COL_MAIN_BOTTOM}>{mainBottom}</div>
    </div>
  );
}

function RenewCard({ order, userEmail }: { order: Order; userEmail: string }) {
  const isPSD = isPSDOrder(order);
  const isSubscription = order.plan_type?.toLowerCase().includes("subscription");
  const daysLeft = isSubscription ? getDaysUntilRenewal(order.created_at) : 0;
  const renewalDate = (() => {
    const d = new Date(order.created_at);
    d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  })();
  const renewUrl = isPSD
    ? `/psd-assessment?renew=1&email=${encodeURIComponent(userEmail)}&state=${encodeURIComponent(order.state ?? "")}`
    : `/assessment?renew=1&email=${encodeURIComponent(userEmail)}&state=${encodeURIComponent(order.state ?? "")}`;

  if (isSubscription) {
    const isUrgent = daysLeft <= 30;
    return (
      <div className={`rounded-xl border overflow-hidden ${isUrgent ? "border-[#dbe4f0] bg-[#e8f0f9]" : "border-[#dbe4f0] bg-white"}`}>
        <div className="px-5 py-4 flex items-start gap-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 bg-[#e8f0f9]">
            <i className={`text-lg text-[#3b6ea5] ${isUrgent ? "ri-alarm-warning-line" : "ri-shield-check-line"}`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-[#1e3a5f]">
              {isUrgent ? `Your ${isPSD ? "PSD" : "ESA"} coverage renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `Your ${isPSD ? "PSD" : "ESA"} coverage is active`}
            </p>
            <p className="text-xs mt-0.5 text-slate-600">
              Annual renewal on <strong>{renewalDate}</strong>
            </p>
            {isUrgent && (
              <a href={renewUrl}
                className="whitespace-nowrap mt-3 inline-flex items-center gap-2 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer">
                <i className="ri-refresh-line"></i>Renew Now
              </a>
            )}
          </div>
          {!isUrgent && (
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-extrabold text-[#3b6ea5]">{daysLeft}</p>
              <p className="text-xs font-semibold text-[#6f97c2]">days left</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // One-time plan renewal card
  if (isPSD) {
    return (
      <div className="rounded-xl border border-[#dbe4f0] bg-white overflow-hidden">
        <div className="bg-[#3b6ea5] px-5 py-3 flex items-center gap-2">
          <i className="ri-service-line text-white text-sm"></i>
          <p className="text-sm font-extrabold text-white">Renew Your PSD Letter</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            PSD letters are typically valid for <strong>12 months</strong>. Your dog&apos;s ADA public access rights depend on keeping your letter current.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs font-bold text-gray-800 mb-0.5">One-Time Renewal</p>
              <p className="text-xl font-extrabold text-gray-900">$129<span className="text-sm font-semibold text-gray-500">.00</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Same-day turnaround available</p>
            </div>
            <div className="bg-[#e8f0f9] rounded-lg p-3 border border-[#dbe4f0] relative">
              <span className="absolute -top-2 left-3 bg-[#3b6ea5] text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap">BEST VALUE</span>
              <p className="text-xs font-bold text-[#1e3a5f] mb-0.5">Annual Subscription</p>
              <p className="text-xl font-extrabold text-[#3b6ea5]">$115<span className="text-sm font-semibold">/yr</span></p>
              <p className="text-xs text-[#3b6ea5] mt-0.5">Auto-renews · Full ADA coverage</p>
            </div>
          </div>
          <a href={renewUrl}
            className="whitespace-nowrap w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#3b6ea5] text-white font-extrabold text-sm rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer">
            <i className="ri-refresh-line"></i>Renew My PSD Letter
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#dbe4f0] bg-white overflow-hidden">
      <div className="bg-[#3b6ea5] px-5 py-3 flex items-center gap-2">
        <i className="ri-refresh-line text-white text-sm"></i>
        <p className="text-sm font-extrabold text-white">Renew Your ESA Coverage</p>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-700 leading-relaxed mb-4">
          ESA letters are typically valid for <strong>12 months</strong>. Keep your coverage active to stay protected.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-xs font-bold text-gray-800 mb-0.5">One-Time Renewal</p>
            <p className="text-xl font-extrabold text-gray-900">$129<span className="text-sm font-semibold text-gray-500">.00</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Same-day turnaround available</p>
          </div>
          <div className="bg-[#ffffff] rounded-lg p-3 border border-[#dbe4f0] relative">
            <span className="absolute -top-2 left-3 bg-[#3b6ea5] text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap">BEST VALUE</span>
            <p className="text-xs font-bold text-[#B45309] mb-0.5">Subscribe &amp; Save</p>
            <p className="text-xl font-extrabold text-[#3b6ea5]">$115<span className="text-sm font-semibold">/yr</span></p>
            <p className="text-xs text-[#1e3a5f] mt-0.5">Auto-renews · Never lose coverage</p>
          </div>
        </div>
        <a href={renewUrl}
          className="whitespace-nowrap w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#3b6ea5] text-white font-extrabold text-sm rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer">
          <i className="ri-refresh-line"></i>Renew My ESA Letter
        </a>
      </div>
    </div>
  );
}

export default function MyOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  // Authenticated user's metadata — a name source (NEVER the email). Kept so the
  // account greeting + selected-order name resolve without deriving from email.
  const [authMeta, setAuthMeta] = useState<Record<string, unknown> | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [searchParams] = useSearchParams();
  // Add-on (Additional Documentation) checkout return: ?addon=success|cancelled&order=CID
  const addonParam = searchParams.get("addon");
  const addonSuccessOrder = addonParam === "success" ? searchParams.get("order") : null;
  const addonCancelledOrder = addonParam === "cancelled" ? searchParams.get("order") : null;
  const [addonBannerDismissed, setAddonBannerDismissed] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [allAdminOrders, setAllAdminOrders] = useState<Order[]>([]);
  const [adminStatusFilter, setAdminStatusFilter] = useState<string>("all");

  // Focus a specific order when arrived via ?order=CID (booking CTA, assurance
  // "View My Customer Portal", or add-on return). Runs once after orders load;
  // never overrides a manual switcher choice.
  // (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001)
  useEffect(() => {
    const focus = searchParams.get("order");
    if (!focus || selectedOrderId || orders.length === 0) return;
    const match = orders.find((o) => (o.confirmation_id ?? "").toUpperCase() === focus.toUpperCase());
    if (match) setSelectedOrderId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const loadOrdersForEmail = async (email: string) => {
    setSearchLoading(true);
    try {
      // LIVE hotfix 2026-05-15: trim + case-insensitive substring match so
      // whitespace / casing drift on either side of the email comparison
      // doesn't hide a paid customer's order. Strict client-side equality
      // filter on lower(trim()) prevents accidentally leaking another
      // customer's order whose address merely contains this substring.
      const needle = (email ?? "").trim().toLowerCase();
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .ilike("email", `%${needle}%`)
        .order("created_at", { ascending: false });

      if (ordersErr) {
        console.error("[my-orders] loadOrdersForEmail orders query failed:", ordersErr);
      }

      const loadedOrders = (((ordersData as Order[]) ?? []).filter(
        (o) => (o.email ?? "").trim().toLowerCase() === needle,
      ));

      if (loadedOrders.length > 0) {
        const orderIds = loadedOrders.map((o) => o.id);
        const { data: docsData } = await supabase
          .from("order_documents")
          .select("id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, order_id")
          .in("order_id", orderIds)
          .eq("customer_visible", true)
          .order("uploaded_at", { ascending: true });

        const docsByOrderId = new Map<string, OrderDocument[]>();
        ((docsData as OrderDocument[]) ?? []).forEach((doc) => {
          const key = (doc as OrderDocument & { order_id: string }).order_id;
          if (!docsByOrderId.has(key)) docsByOrderId.set(key, []);
          docsByOrderId.get(key)!.push(doc);
        });

        const ordersWithDocs = loadedOrders.map((o) => ({
          ...o,
          documents: docsByOrderId.get(o.id) ?? [],
        }));
        setOrders(ordersWithDocs);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error("[my-orders] loadOrdersForEmail threw:", err);
      setOrders([]);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    // LIVE hotfix 2026-05-15 (rev 2):
    //   * The admin-preview branch previously did fire-and-forget
    //     loadOrdersForEmail() then early-returned, so the outer
    //     `loading` state stayed true forever and Customer View just
    //     showed an infinite spinner.
    //   * Any throw in the regular-customer branch (transient RLS error,
    //     network blip, dropped doctor_profiles query) also stranded the
    //     outer loading state. Customers saw an infinite spinner that
    //     eventually rendered "No orders found" once stale state cleared.
    //   * The entire load() is now wrapped in try/finally so setLoading
    //     ALWAYS clears. The admin-preview branch awaits the email loader
    //     and the loader exposes an admin-aware option to ALSO set the
    //     outer loading flag (vs. only the searchLoading flag).
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate("/customer-login"); return; }
        setUserEmail(user.email ?? "");
        // Do NOT derive a name from the email. Keep only real metadata; the
        // authoritative display name is resolved from the order / metadata later.
        setAuthMeta((user.user_metadata as Record<string, unknown> | undefined) ?? null);
        setUserName((user.user_metadata?.full_name as string | undefined) ?? "");

        // Check if admin
        const { data: profile } = await supabase
          .from("doctor_profiles")
          .select("is_admin, full_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile?.is_admin) {
          setIsAdminPreview(true);
          setUserName(profile.full_name ?? "Admin");
          // Auto-load preview_email from URL param (e.g. from "Customer View" button in order detail)
          const urlPreviewEmail = searchParams.get("preview_email");
          if (urlPreviewEmail) {
            setSearchEmail(urlPreviewEmail);
            setSearchInput(urlPreviewEmail);
            // Await so the outer try/finally clears `loading` only after
            // the preview load actually finishes (or throws).
            await loadOrdersForEmail(urlPreviewEmail);
            return;
          }
          // Admin: load all orders by default (no email filter)
          const { data: ordersData, error: ordersErr } = await supabase
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(50);

          if (ordersErr) {
            console.error("[my-orders] admin orders query failed:", ordersErr);
          }

          const loadedOrders = (ordersData as Order[]) ?? [];

          if (loadedOrders.length > 0) {
            const orderIds = loadedOrders.map((o) => o.id);
            const { data: docsData } = await supabase
              .from("order_documents")
              .select("id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, order_id")
              .in("order_id", orderIds)
              .eq("customer_visible", true)
              .order("uploaded_at", { ascending: true });

            const docsByOrderId = new Map<string, OrderDocument[]>();
            ((docsData as OrderDocument[]) ?? []).forEach((doc) => {
              const key = (doc as OrderDocument & { order_id: string }).order_id;
              if (!docsByOrderId.has(key)) docsByOrderId.set(key, []);
              docsByOrderId.get(key)!.push(doc);
            });

            const ordersWithDocs = loadedOrders.map((o) => ({
              ...o,
              documents: docsByOrderId.get(o.id) ?? [],
            }));
            setOrders(ordersWithDocs);
            setAllAdminOrders(ordersWithDocs);
          } else {
            setOrders([]);
            setAllAdminOrders([]);
          }
          return;
        }

        // Regular customer: fetch their own orders.
        // LIVE hotfix 2026-05-15: normalize the email comparison so paid
        // orders with leading/trailing whitespace or mixed casing on
        // orders.email still surface to the right logged-in customer.
        // Server widens via ilike '%email%'; client strictly filters by
        // lower(trim()) so no other customer's order can ever leak in.
        const needle = (user.email ?? "").trim().toLowerCase();
        const { data: ordersData, error: ordersErr } = await supabase
          .from("orders")
          .select("*")
          .ilike("email", `%${needle}%`)
          .order("created_at", { ascending: false });

        if (ordersErr) {
          console.error("[my-orders] customer orders query failed:", ordersErr);
        }

        const loadedOrders = (((ordersData as Order[]) ?? []).filter(
          (o) => (o.email ?? "").trim().toLowerCase() === needle,
        ));

        // Fetch all documents for these orders
        if (loadedOrders.length > 0) {
          const orderIds = loadedOrders.map((o) => o.id);
          const { data: docsData } = await supabase
            .from("order_documents")
            .select("id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, order_id")
            .in("order_id", orderIds)
            .eq("customer_visible", true)
            .order("uploaded_at", { ascending: true });

          const docsByOrderId = new Map<string, OrderDocument[]>();
          ((docsData as OrderDocument[]) ?? []).forEach((doc) => {
            const key = (doc as OrderDocument & { order_id: string }).order_id;
            if (!docsByOrderId.has(key)) docsByOrderId.set(key, []);
            docsByOrderId.get(key)!.push(doc);
          });

          const ordersWithDocs = loadedOrders.map((o) => ({
            ...o,
            documents: docsByOrderId.get(o.id) ?? [],
          }));
          setOrders(ordersWithDocs);
          // Funnel: the authenticated customer's own portal rendered. One
          // event per order per portal load (deduped inside the helper).
          // Not fired for the admin-preview branch above.
          for (const o of ordersWithDocs) {
            if (o.confirmation_id) {
              try { trackCustomerPortalViewed(o.confirmation_id); } catch { /* analytics never blocks */ }
            }
          }
        } else {
          setOrders([]);
        }
      } catch (err) {
        console.error("[my-orders] load() threw:", err);
      } finally {
        // ALWAYS clear loading — every branch, including admin preview
        // early-return and any thrown error, lands here.
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  // Refetch a single order's customer-visible documents and merge them in.
  // The realtime `orders` UPDATE below only carries the changed order row (which
  // has no `documents`), so a document the provider adds on an already-open portal
  // — a newly delivered letter or a completed Housing Accommodation form — would
  // otherwise stay invisible until a full reload. Re-pulling order_documents on the
  // status change closes that gap (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001).
  const refetchOrderDocuments = useCallback(async (orderId: string) => {
    const { data: docsData } = await supabase
      .from("order_documents")
      .select("id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, order_id")
      .eq("order_id", orderId)
      .eq("customer_visible", true)
      .order("uploaded_at", { ascending: true });
    const docs = (docsData as OrderDocument[]) ?? [];
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === orderId);
      if (idx === -1) return prev; // not an order we're showing — no-op
      const next = prev.slice();
      next[idx] = { ...next[idx], documents: docs };
      return next;
    });
  }, []);

  // ── Real-time: update order status the moment admin/provider changes something ──
  useEffect(() => {
    if (!userEmail) return;
    const channel = supabase
      .channel("customer-orders-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new as Order;
          setOrders((prev) =>
            prev.map((o) =>
              o.id === updated.id
                ? { ...o, ...updated } // orders row has no `documents` — preserved
                : o
            )
          );
          // Pull the order's documents so a just-delivered letter / completed
          // housing form appears live (no-op if it isn't one of ours).
          void refetchOrderDocuments(updated.id);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userEmail, refetchOrderDocuments]);

  const handleAdminSearch = async () => {
    const q = searchInput.trim();
    if (!q) return;

    // Detect search type: order ID (starts with PT-), email (has @), or name
    const isOrderId = q.toUpperCase().startsWith("PT-") || /^[A-Z]{2}-[A-Z0-9]+$/i.test(q);
    const isEmail = q.includes("@");

    if (isEmail) {
      setSearchEmail(q);
      await loadOrdersForEmail(q);
      return;
    }

    // Search by order ID or name in the already-loaded allAdminOrders first
    if (allAdminOrders.length > 0) {
      const lower = q.toLowerCase();
      const filtered = allAdminOrders.filter((o) => {
        const fullName = `${o.first_name ?? ""} ${o.last_name ?? ""}`.toLowerCase();
        return (
          o.confirmation_id.toLowerCase().includes(lower) ||
          fullName.includes(lower) ||
          o.email.toLowerCase().includes(lower)
        );
      });
      if (filtered.length > 0) {
        setSearchEmail(q);
        setOrders(filtered);
        return;
      }
    }

    // Fallback: DB search by confirmation_id or name
    setSearchLoading(true);
    setSearchEmail(q);
    try {
      let query = supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50);
      if (isOrderId) {
        query = query.ilike("confirmation_id", `%${q}%`);
      } else {
        // Search by first_name or last_name
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
      }
      const { data: ordersData } = await query;
      const loadedOrders = (ordersData as Order[]) ?? [];
      if (loadedOrders.length > 0) {
        const orderIds = loadedOrders.map((o) => o.id);
        const { data: docsData } = await supabase
          .from("order_documents")
          .select("id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, order_id")
          .in("order_id", orderIds)
          .eq("customer_visible", true);
        const docsByOrderId = new Map<string, OrderDocument[]>();
        ((docsData as OrderDocument[]) ?? []).forEach((doc) => {
          const key = (doc as OrderDocument & { order_id: string }).order_id;
          if (!docsByOrderId.has(key)) docsByOrderId.set(key, []);
          docsByOrderId.get(key)!.push(doc);
        });
        setOrders(loadedOrders.map((o) => ({ ...o, documents: docsByOrderId.get(o.id) ?? [] })));
      } else {
        setOrders([]);
      }
    } catch { /* ignore */ }
    setSearchLoading(false);
  };

  // Admin status filter — applied on top of current orders list
  const filteredOrders = isAdminPreview && adminStatusFilter !== "all"
    ? orders.filter((o) => {
        const ds = getDisplayStatus(o).label.toLowerCase();
        const filter = adminStatusFilter.toLowerCase();
        if (filter === "pending payment") return ds === "pending payment";
        if (filter === "payment confirmed") return ds === "payment confirmed";
        if (filter === "assigned to provider") return ds === "assigned to provider";
        if (filter === "under review") return ds === "under review";
        if (filter === "completed") return ds === "completed";
        if (filter === "cancelled") return ds === "cancelled";
        if (filter === "refunded") return ds === "refunded";
        return true;
      })
    : orders;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/customer-login");
  };

  const completedOrders = orders.filter((o) => o.doctor_status === "patient_notified");
  // Portal cross-sell / review visibility (CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001).
  // PSD upsell only for customers with a paid ESA letter and NO PSD order.
  const hasPaidEsa = orders.some((o) => !!o.payment_intent_id && !isPSDOrder(o) && o.status !== "refunded" && o.status !== "cancelled");
  const hasAnyPsd = orders.some((o) => isPSDOrder(o));
  const showPsdUpsell = !isAdminPreview && hasPaidEsa && !hasAnyPsd;
  const hasDelivered = completedOrders.length > 0;
  // Account-hub selection (CUSTOMER-PORTAL-ACCOUNT-HUB-REDESIGN-001): show ONE order's
  // full detail at a time. Falls back to the first (most recent) order — no effect
  // needed, so a changing list can't strand an invalid selection.
  const selectedOrder = filteredOrders.find((o) => o.id === selectedOrderId) ?? filteredOrders[0] ?? null;
  const latestPaidEsa = orders.find((o) => !!o.payment_intent_id && !isPSDOrder(o) && o.status !== "refunded" && o.status !== "cancelled") ?? null;

  // Authoritative, order-safe personalization (never derived from the email).
  // In admin "Customer View" the viewer is NOT the customer, so pass no viewer
  // identity — the greeting + order name then come from the previewed customer's
  // own orders, and the admin's name never leaks in.
  const viewerUser: NameUserLike | null = isAdminPreview ? null : { email: userEmail, user_metadata: authMeta ?? undefined };
  const accountGreeting = resolveAccountGreeting(filteredOrders, null, viewerUser);
  const supportName = isAdminPreview ? userName : (accountGreeting.fullName ?? userName);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="/assets/brand/pawtenant-logo-black-02.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-sm text-gray-500 font-medium">{userEmail}</span>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="whitespace-nowrap hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-[#3b6ea5] transition-colors cursor-pointer"
          >
            <i className="ri-customer-service-2-line text-[#3b6ea5]"></i>Support
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="whitespace-nowrap flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors cursor-pointer"
          >
            <i className="ri-logout-box-line"></i>Sign Out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Account header (name / email / status summary / support) */}
        <CustomerPortalHeader
          greeting={accountGreeting}
          userEmail={userEmail}
          orders={orders}
          onContactSupport={() => setSupportOpen(true)}
        />

        {/* ── Admin Preview Banner ── */}
        {isAdminPreview && (
          <div className="mb-6 bg-amber-50 border border-amber-300 rounded-2xl overflow-hidden">
            <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center bg-white/20 rounded-lg flex-shrink-0">
                <i className="ri-eye-line text-white text-sm"></i>
              </div>
              <p className="text-sm font-extrabold text-white">Admin Preview Mode — Customer Portal View</p>
              <a
                href="/admin-orders"
                className="whitespace-nowrap ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-line"></i>Back to Admin Portal
              </a>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                You are viewing the <strong>customer portal</strong> as an admin. This shows exactly what customers see — their order statuses, documents, and notifications. Use the search below to preview any customer&apos;s portal by their email.
              </p>

              {/* Search + Status Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdminSearch(); }}
                    placeholder="Search by email, order ID (PT-...), or name"
                    className="w-full pl-9 pr-4 py-2.5 border border-amber-300 rounded-xl text-sm bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                {/* Status filter */}
                <div className="relative">
                  <select
                    value={adminStatusFilter}
                    onChange={(e) => setAdminStatusFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2.5 border border-amber-300 rounded-xl text-sm bg-white focus:outline-none focus:border-amber-500 cursor-pointer font-semibold text-amber-800"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending payment">Pending Payment</option>
                    <option value="payment confirmed">Payment Confirmed</option>
                    <option value="assigned to provider">Assigned to Provider</option>
                    <option value="under review">Under Review</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="refunded">Refunded</option>
                  </select>
                  <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none text-sm"></i>
                </div>
                <button
                  type="button"
                  onClick={handleAdminSearch}
                  disabled={searchLoading || !searchInput.trim()}
                  className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {searchLoading ? <><i className="ri-loader-4-line animate-spin"></i>Loading...</> : <><i className="ri-search-line"></i>Search</>}
                </button>
                {searchEmail && (
                  <button
                    type="button"
                    onClick={async () => {
                      setSearchEmail("");
                      setSearchInput("");
                      setSearchLoading(true);
                      const { data: ordersData } = await supabase
                        .from("orders")
                        .select("*")
                        .order("created_at", { ascending: false })
                        .limit(50);
                      const loadedOrders = (ordersData as Order[]) ?? [];
                      if (loadedOrders.length > 0) {
                        const orderIds = loadedOrders.map((o) => o.id);
                        const { data: docsData } = await supabase
                          .from("order_documents")
                          .select("id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, order_id")
                          .in("order_id", orderIds)
                          .eq("customer_visible", true)
                          .order("uploaded_at", { ascending: true });
                        const docsByOrderId = new Map<string, OrderDocument[]>();
                        ((docsData as OrderDocument[]) ?? []).forEach((doc) => {
                          const key = (doc as OrderDocument & { order_id: string }).order_id;
                          if (!docsByOrderId.has(key)) docsByOrderId.set(key, []);
                          docsByOrderId.get(key)!.push(doc);
                        });
                        setOrders(loadedOrders.map((o) => ({ ...o, documents: docsByOrderId.get(o.id) ?? [] })));
                      } else {
                        setOrders([]);
                      }
                      setSearchLoading(false);
                    }}
                    className="whitespace-nowrap flex items-center gap-1 px-3 py-2.5 border border-amber-300 text-amber-700 text-sm font-semibold rounded-xl hover:bg-amber-100 cursor-pointer transition-colors"
                  >
                    <i className="ri-close-line"></i>Clear
                  </button>
                )}
              </div>

              {/* Status legend */}
              <div className="bg-white/70 rounded-xl border border-amber-200 p-3">
                <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                  <i className="ri-information-line"></i>Customer-visible status mapping
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { admin: "processing / paid", customer: "Payment Confirmed", color: "bg-amber-50 text-[#B45309]" },
                    { admin: "pending_review / under-review", customer: "Assigned to Provider", color: "bg-[#eef2f7] text-[#475569]" },
                    { admin: "in_review / approved / letter_sent", customer: "Under Review", color: "bg-[#EFF6FF] text-[#2563EB]" },
                    { admin: "patient_notified", customer: "Completed", color: "bg-[#ECFDF5] text-[#059669]" },
                  ].map((item) => (
                    <div key={item.admin} className="space-y-1">
                      <p className="text-[10px] text-gray-400 font-semibold">Admin sees:</p>
                      <p className="text-[10px] text-gray-600 font-mono leading-tight">{item.admin}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-1">Customer sees:</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${item.color}`}>{item.customer}</span>
                    </div>
                  ))}
                </div>
              </div>

              {searchEmail && (
                <div className="flex items-center gap-2 text-sm text-amber-800 font-semibold flex-wrap">
                  <i className="ri-user-search-line"></i>
                  Results for: <span className="font-mono bg-amber-100 px-2 py-0.5 rounded">{searchEmail}</span>
                  <span className="text-amber-600 font-normal">
                    ({filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
                    {adminStatusFilter !== "all" ? ` · filtered: ${adminStatusFilter}` : ""})
                  </span>
                </div>
              )}
              {!searchEmail && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <i className="ri-list-check-2"></i>
                  Showing latest 50 orders. Search by email, order ID, or name. Use status filter to narrow down.
                  {adminStatusFilter !== "all" && (
                    <span className="ml-1 font-bold">· Filtered: {adminStatusFilter} ({filteredOrders.length} shown)</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <i className="ri-loader-4-line animate-spin text-3xl text-[#6f97c2] block mb-3"></i>
              <p className="text-sm text-gray-500">Loading your orders...</p>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-[#e8f0f9] rounded-full mx-auto mb-4">
              <i className="ri-file-list-3-line text-[#6f97c2] text-3xl"></i>
            </div>
            {isAdminPreview && searchEmail ? (
              <>
                <h2 className="text-base font-bold text-gray-800 mb-2">No portal-visible orders for this customer</h2>
                <p className="text-sm text-gray-500 mb-2 max-w-sm mx-auto">
                  No orders are linked to <span className="font-semibold text-gray-700">{searchEmail}</span>.
                </p>
                <p className="text-xs text-gray-400 mb-6 max-w-sm mx-auto">
                  Check that the order email matches the customer's auth email exactly (case + whitespace) on the order detail page.
                </p>
              </>
            ) : isAdminPreview ? (
              <>
                <h2 className="text-base font-bold text-gray-800 mb-2">No orders in the system yet</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                  Use the search above to preview any customer's portal by email, order ID, or name.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-gray-800 mb-2">No orders found</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                  No orders are linked to your account yet. If you made a purchase, make sure you used the same email address.
                </p>
                <Link to="/assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-[#3b6ea5] text-white font-bold text-sm rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer">
                  <i className="ri-file-text-line"></i>Get Your ESA Letter
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Additional Documentation checkout return banner */}
            {addonSuccessOrder && !addonBannerDismissed && (
              <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                <i className="ri-checkbox-circle-fill text-emerald-600 mt-0.5"></i>
                <div className="text-xs text-emerald-800 leading-relaxed flex-1">
                  <p className="font-bold mb-0.5">Payment received — thank you!</p>
                  <p>We're confirming your additional documentation payment{addonSuccessOrder ? ` for order ${addonSuccessOrder}` : ""} and reopening your case for provider review. Please reply to our confirmation email with the form you need completed.</p>
                </div>
                <button type="button" onClick={() => setAddonBannerDismissed(true)} className="text-emerald-500 hover:text-emerald-700"><i className="ri-close-line"></i></button>
              </div>
            )}
            {addonCancelledOrder && !addonBannerDismissed && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                <i className="ri-information-line text-amber-600 mt-0.5"></i>
                <div className="text-xs text-amber-800 leading-relaxed flex-1">
                  <p className="font-bold mb-0.5">Payment not completed.</p>
                  <p>Your additional documentation payment was cancelled. You can start it again from your order below whenever you're ready.</p>
                </div>
                <button type="button" onClick={() => setAddonBannerDismissed(true)} className="text-amber-500 hover:text-amber-700"><i className="ri-close-line"></i></button>
              </div>
            )}
            {/* Account hub — order switcher (left) + selected order detail (right).
                Only the SELECTED order renders full detail; the rest are compact
                list items, so full dashboards no longer stack. */}
            <div className={filteredOrders.length > 1 ? "grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start" : ""}>
              {filteredOrders.length > 1 && (
                <div className="lg:sticky lg:top-20">
                  <OrderSwitcher
                    orders={filteredOrders}
                    selectedId={selectedOrder?.id ?? null}
                    onSelect={setSelectedOrderId}
                    getStatus={(o) => getDisplayStatus(o as unknown as Order)}
                  />
                </div>
              )}
              <div className="min-w-0">
                {selectedOrder && (
                  <>
                    <SelectedOrderHeader
                      order={selectedOrder}
                      status={getDisplayStatus(selectedOrder)}
                      onContactSupport={() => setSupportOpen(true)}
                      user={viewerUser}
                    />
                    <OrderCard
                      order={selectedOrder}
                      onContactSupport={() => setSupportOpen(true)}
                      addonSuccessOrder={addonSuccessOrder}
                      layout={filteredOrders.length > 1 ? "single" : "two-col"}
                    />
                  </>
                )}
              </div>
            </div>

            {/* PSD cross-sell — ESA customers who have not bought PSD (account-level, once) */}
            {showPsdUpsell && (
              <div className="mt-6">
                <PsdUpsellCard />
              </div>
            )}

            {/* Account-level "buy another" — secondary, not inside the selected order */}
            {!isAdminPreview && latestPaidEsa && (
              <div className="mt-4">
                <ReturningCustomerActions orderId={latestPaidEsa.id} showRepeat title="Add another letter" />
              </div>
            )}

            {/* Renewal Section */}
            {completedOrders.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-7 h-7 flex items-center justify-center bg-[#3b6ea5] rounded-lg flex-shrink-0">
                    <i className="ri-refresh-line text-white text-sm"></i>
                  </div>
                  <h2 className="text-base font-extrabold text-gray-900">Coverage Renewal</h2>
                </div>
                <div className="space-y-3">
                  {completedOrders.map((order) => (
                    <RenewCard key={`renew-${order.id}`} order={order} userEmail={userEmail} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Help strip */}
        <div className="mt-10 bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
              <i className="ri-customer-service-2-line text-[#3b6ea5] text-base"></i>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Need help with your order?</p>
              <p className="text-xs text-gray-500">Our team typically responds within 1 hour.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="tel:+14099655885" className="whitespace-nowrap inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-[#3b6ea5] transition-colors cursor-pointer">
              <i className="ri-phone-line text-[#3b6ea5]"></i>(409) 965-5885
            </a>
            <a href="mailto:hello@pawtenant.com" className="whitespace-nowrap inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-[#3b6ea5] transition-colors cursor-pointer">
              <i className="ri-mail-line text-[#3b6ea5]"></i>Email Us
            </a>
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer"
            >
              <i className="ri-message-3-line"></i>Send a Message
            </button>
          </div>
        </div>

        {/* Review CTA (subtle pre-delivery, stronger after completion) */}
        <GoogleReviewCard delivered={hasDelivered} />

        {/* Follow PawTenant on social */}
        <PortalSocialSection />

        {/* ── California AB 468 / 30-Day Notice Box ── */}
        <div className="mt-6 bg-[#f8fafc] border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-[#e8f0f9] px-5 py-3 flex items-center gap-2 border-b border-slate-200">
            <div className="w-6 h-6 flex items-center justify-center bg-[#3b6ea5] rounded-full flex-shrink-0">
              <i className="ri-scales-3-line text-white text-xs"></i>
            </div>
            <p className="text-sm font-extrabold text-[#1e3a5f]">California Residents — Important Legal Notice</p>
            <span className="ml-auto text-xs font-bold text-[#3b6ea5] bg-white px-2 py-0.5 rounded-full whitespace-nowrap">AB 468 Law</span>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
              <i className="ri-information-line text-[#3b6ea5]"></i>
              30-Day Relationship Requirement for ESA Letters
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              California law (AB 468, effective January 1, 2022) requires that any licensed mental health professional (LMHP) issuing an ESA letter must have established a <strong>client-provider relationship of at least 30 days</strong> prior to issuing the letter. This applies specifically to ESA letters for <strong>dogs</strong>.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              {[
                { icon: "ri-calendar-check-line", title: "Two Consultations Required", desc: "Your evaluation will involve an initial consultation followed by a follow-up after the 30-day period." },
                { icon: "ri-shield-check-line", title: "Still Fully Guaranteed", desc: "Our 100% money-back guarantee still applies if you don't qualify or your landlord rejects your letter after a HUD complaint." },
                { icon: "ri-file-text-line", title: "Legally Compliant Letter", desc: "Your ESA letter will be fully compliant with AB 468, making it recognized by California landlords and housing providers." },
                { icon: "ri-time-line", title: "Plan Ahead", desc: "Because of this requirement, California residents should plan for a 30+ day timeline from initial consultation to letter issuance." },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2.5 bg-white rounded-xl p-3 border border-slate-200">
                  <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0 mt-0.5">
                    <i className={`${item.icon} text-[#3b6ea5] text-sm`}></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1e3a5f] mb-0.5">{item.title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              <strong>Other affected states:</strong> Arkansas, Iowa, Louisiana, and Montana have similar requirements. If you reside in these states, the same 30-day notice applies.{" "}
              <a href="mailto:hello@pawtenant.com" className="text-[#3b6ea5] font-semibold underline underline-offset-2 cursor-pointer hover:text-[#1e3a5f]">Contact us</a> if you have questions about your state&apos;s requirements.
            </p>
          </div>
        </div>

        {/* ── Bottom Terms & Privacy Links ── */}
        <div className="mt-6 pb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-1 flex-wrap justify-center text-xs text-gray-400">
            <span className="flex items-center gap-1"><i className="ri-shield-check-line text-green-500"></i> HIPAA Compliant</span>
            <span className="mx-2 text-gray-200">|</span>
            <span className="flex items-center gap-1"><i className="ri-lock-line text-green-500"></i> 256-bit SSL</span>
            <span className="mx-2 text-gray-200">|</span>
            <span className="flex items-center gap-1"><i className="ri-award-line text-[#6f97c2]"></i> Licensed Professionals</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Link to="/terms-of-use" className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors cursor-pointer">Terms of Use</Link>
            <span className="text-gray-300 text-xs">·</span>
            <Link to="/privacy-policy" className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors cursor-pointer">Privacy Policy</Link>
            <span className="text-gray-300 text-xs">·</span>
            <a href="mailto:hello@pawtenant.com" className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors cursor-pointer">hello@pawtenant.com</a>
          </div>
          <p className="text-xs text-gray-300 text-center">© {new Date().getFullYear()} PawTenant (HyperSpace Solutions LLC). All rights reserved.</p>
        </div>
      </div>

      {/* Floating support widget */}
      <ContactSupportWidget
        userEmail={userEmail}
        userName={supportName}
        orders={orders}
        externalOpen={supportOpen}
        onExternalClose={() => setSupportOpen(false)}
      />
    </div>
  );
}
