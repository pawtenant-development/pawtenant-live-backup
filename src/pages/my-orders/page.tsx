import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import ContactSupportWidget from "./components/ContactSupportWidget";

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
  plan_type: string | null;
  delivery_speed: string | null;
  price: number | null;
  status: string;
  doctor_status: string | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  letter_type: string | null;
  additional_documents_requested: { types?: string[]; otherDescription?: string } | null;
  created_at: string;
  documents?: OrderDocument[];
}

function isPSDOrder(order: Order): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

// Derive a friendly display status from both order.status and doctor_status
function getDisplayStatus(order: Order): {
  label: string; color: string; icon: string; bgGradient: string; step: number;
} {
  const s = order.status;
  const ds = order.doctor_status;

  if (s === "cancelled") return { label: "Cancelled", color: "bg-red-100 text-red-700", icon: "ri-close-circle-line", bgGradient: "from-red-50 to-rose-50", step: -1 };
  if (s === "refunded" || (order as Order & { refunded_at?: string | null }).refunded_at) return { label: "Refunded", color: "bg-red-100 text-red-600", icon: "ri-refund-line", bgGradient: "from-red-50 to-rose-50", step: -1 };
  // Completed ONLY when provider has notified patient — payment alone is NOT completion
  if (ds === "patient_notified") return { label: "Completed", color: "bg-green-100 text-green-700", icon: "ri-checkbox-circle-fill", bgGradient: "from-green-50 to-emerald-50", step: 3 };
  // letter_sent is an INTERNAL status (provider uploaded, admin not yet sent) — customer sees "Under Review" still
  if (ds === "letter_sent") return { label: "Under Review", color: "bg-sky-100 text-sky-700", icon: "ri-stethoscope-line", bgGradient: "from-sky-50 to-blue-50", step: 1 };
  if (ds === "in_review" || ds === "approved") return { label: "Under Review", color: "bg-sky-100 text-sky-700", icon: "ri-stethoscope-line", bgGradient: "from-sky-50 to-blue-50", step: 1 };
  if (ds === "pending_review" || s === "under-review") return { label: "Assigned to Provider", color: "bg-violet-100 text-violet-700", icon: "ri-user-received-line", bgGradient: "from-violet-50 to-purple-50", step: 1 };
  // Payment received but provider work not started yet
  if (s === "completed" || s === "paid" || s === "processing") return { label: "Payment Confirmed", color: "bg-amber-100 text-amber-700", icon: "ri-loader-4-line", bgGradient: "from-amber-50 to-orange-50", step: 0 };
  return { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: "ri-loader-4-line", bgGradient: "from-amber-50 to-orange-50", step: 0 };
}

const DOC_TYPE_LABEL: Record<string, string> = {
  esa_letter: "ESA Letter",
  housing_verification: "Housing Verification Letter",
  landlord_form: "Landlord Form",
  signed_letter: "Signed Letter",
  other: "Supporting Document",
};

const DOC_TYPE_ICON: Record<string, string> = {
  esa_letter: "ri-file-text-line",
  housing_verification: "ri-home-smile-line",
  landlord_form: "ri-building-line",
  signed_letter: "ri-shield-check-line",
  other: "ri-file-line",
};

function getDaysUntilRenewal(createdAt: string): number {
  const created = new Date(createdAt);
  const renewDate = new Date(created);
  renewDate.setFullYear(renewDate.getFullYear() + 1);
  const now = new Date();
  return Math.max(0, Math.ceil((renewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function OrderStatusTimeline({ order }: { order: Order }) {
  const displayStatus = getDisplayStatus(order);
  const stepIndex = displayStatus.step;

  const steps = [
    { key: "paid", label: "Payment Confirmed", icon: "ri-checkbox-circle-fill" },
    { key: "assigned", label: "Provider Assigned", icon: "ri-user-received-line" },
    { key: "letter", label: "Letter Issued", icon: "ri-file-shield-line" },
    { key: "delivered", label: "Documents Delivered", icon: "ri-mail-check-line" },
  ];

  const getStepState = (idx: number) => {
    if (order.status === "cancelled") return "inactive";
    if (order.status === "refunded" || (order as Order & { refunded_at?: string | null }).refunded_at) return "inactive";
    if (order.doctor_status === "patient_notified") return "done";
    if (idx < stepIndex) return "done";
    if (idx === stepIndex) return "active";
    return "inactive";
  };

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const state = getStepState(idx);
        const done = state === "done" || (idx === 0 && (order.status === "completed" || order.status === "paid" || order.status === "processing" || order.doctor_status != null));
        const active = state === "active";
        return (
          <div key={step.key} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${done ? "bg-orange-500 text-white" : active ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-400"}`}>
                <i className={`${step.icon} ${active ? "animate-pulse" : ""}`}></i>
              </div>
              <p className={`text-center mt-1 max-w-[60px] leading-tight ${done ? "text-orange-500" : active ? "text-amber-600" : "text-gray-400"}`} style={{ fontSize: "10px", fontWeight: 600 }}>
                {step.label}
              </p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mt-4 ${idx < stepIndex ? "bg-orange-400" : "bg-gray-200"}`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocumentsSection({ order }: { order: Order }) {
  const providerCompleted = order.doctor_status === "patient_notified";

  const allDocs: Array<{ label: string; doc_type: string; file_url: string; uploaded_at?: string; isLegacy?: boolean }> = [];

  if (providerCompleted) {
    if (order.signed_letter_url) {
      const matchingDoc = order.documents?.find(
        (d) => d.file_url === order.signed_letter_url && d.footer_injected && d.processed_file_url
      );
      const serveUrl = matchingDoc?.processed_file_url ?? order.signed_letter_url;
      const docLabel = isPSDOrder(order) ? "Signed PSD Letter" : "Signed ESA Letter";
      allDocs.push({ label: docLabel, doc_type: "signed_letter", file_url: serveUrl, isLegacy: true });
    }
  }

  if (providerCompleted && order.documents) {
    order.documents.filter((d) => d.customer_visible && d.file_url !== order.signed_letter_url).forEach((d) => {
      const serveUrl = (d.footer_injected && d.processed_file_url) ? d.processed_file_url : d.file_url;
      allDocs.push({ label: d.label, doc_type: d.doc_type, file_url: serveUrl, uploaded_at: d.uploaded_at });
    });
  }

  if (allDocs.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 flex items-center justify-center bg-orange-50 rounded-md flex-shrink-0">
          <i className="ri-folder-open-line text-orange-500 text-sm"></i>
        </div>
        <p className="text-sm font-extrabold text-gray-900">My Documents</p>
        <span className="text-xs font-bold px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full">{allDocs.length}</span>
      </div>
        <div className="space-y-2">
        {allDocs.map((doc, idx) => {
          const icon = DOC_TYPE_ICON[doc.doc_type] ?? "ri-file-line";
          const typeLabel = DOC_TYPE_LABEL[doc.doc_type] ?? "Document";
          return (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-orange-200 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                  <i className={`${icon} text-orange-500 text-base`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{doc.label}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {typeLabel}{doc.uploaded_at ? ` · ${new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2.5 pl-12">
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                  <i className="ri-eye-line"></i>View
                </a>
                <a href={doc.file_url} download
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors">
                  <i className="ri-download-line"></i>Download
                </a>
              </div>
            </div>
          );
        })}
        </div>
    </div>
  );
}

function OrderCard({ order, userEmail, onContactSupport }: { order: Order; userEmail: string; onContactSupport: () => void }) {
  const displayStatus = getDisplayStatus(order);
  const deliveryLabel = order.delivery_speed === "24hours" || order.delivery_speed === "24h"
    ? "Within 24 hours"
    : "Within 2–3 business days";
  const formattedDate = new Date(order.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const hasDocuments = !!order.signed_letter_url || (order.documents && order.documents.length > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Status ribbon */}
      <div className={`bg-gradient-to-r ${displayStatus.bgGradient} px-4 sm:px-5 py-3 border-b border-gray-100`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 gap-x-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${displayStatus.color}`}>
              <i className={`${displayStatus.icon} ${order.status === "processing" && !order.doctor_status ? "animate-spin" : ""}`}></i>
              {displayStatus.label}
            </span>
            {isPSDOrder(order) ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                <i className="ri-service-line text-xs"></i>PSD Letter
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
                <i className="ri-heart-line text-xs"></i>ESA Letter
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-900 text-white font-mono tracking-wide">
              <i className="ri-hashtag text-gray-400 text-[10px]"></i>{order.confirmation_id}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-gray-500 font-medium">{new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
            <button
              type="button"
              onClick={onContactSupport}
              className="whitespace-nowrap inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-orange-500 transition-colors cursor-pointer"
            >
              <i className="ri-question-line"></i>Help
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        {/* Progress timeline */}
        <div className="mb-5">
          <OrderStatusTimeline order={order} />
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
          {order.selected_provider && (
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                <i className="ri-stethoscope-line text-orange-500 text-sm"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">Provider</p>
                <p className="text-xs font-semibold text-gray-800 leading-snug truncate">{order.selected_provider}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
              <i className="ri-map-pin-line text-orange-500 text-sm"></i>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">State</p>
              <p className="text-xs font-semibold text-gray-800">{order.state ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
              <i className="ri-price-tag-3-line text-orange-500 text-sm"></i>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Plan</p>
              <p className="text-xs font-semibold text-gray-800">{order.plan_type ?? "One-Time"}</p>
              {order.price && <p className="text-xs text-gray-500">${order.price}.00</p>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
              <i className="ri-timer-flash-line text-orange-500 text-sm"></i>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Delivery</p>
              <p className="text-xs font-semibold text-gray-800">
                {order.delivery_speed === "24hours" || order.delivery_speed === "24h" ? "Within 24 hrs" : "2–3 business days"}
              </p>
            </div>
          </div>
        </div>

        {/* Refunded message */}
        {(order.status === "refunded" || (order as Order & { refunded_at?: string | null }).refunded_at) && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-start gap-2 mb-4">
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

        {/* Cancelled message */}
        {order.status === "cancelled" && !(order as Order & { refunded_at?: string | null }).refunded_at && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-start gap-2 mb-4">
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

        {/* Status-specific messages */}
        {order.doctor_status !== "patient_notified" && order.status !== "refunded" && !(order as Order & { refunded_at?: string | null }).refunded_at && order.status !== "cancelled" && (
          <div className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 mb-4 ${
            order.doctor_status === "letter_sent"
              ? "bg-[#FFF7ED] border border-orange-200 text-orange-700"
              : order.doctor_status === "in_review" || order.doctor_status === "approved"
              ? "bg-sky-50 border border-sky-200 text-sky-700"
              : order.doctor_status === "pending_review"
              ? "bg-violet-50 border border-violet-200 text-violet-700"
              : "bg-amber-50 border border-amber-200 text-amber-700"
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

        {order.doctor_status === "patient_notified" && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700 flex items-center gap-2 mb-4">
            <i className="ri-checkbox-circle-fill flex-shrink-0"></i>
            Your documents were sent to <strong>{userEmail}</strong>. Download them below.
          </div>
        )}

        {/* Documents section */}
        <DocumentsSection order={order} />

        {/* Landlord Verification Badge — shown when letter is delivered */}
        {order.doctor_status === "patient_notified" && (
          <div className="mt-4 bg-[#FFF7ED] border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
              <i className="ri-shield-check-line text-white text-base"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-orange-600 mb-0.5">Your letter is landlord-verifiable</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Your ESA letter includes a unique <strong>Verification ID</strong> and QR code. Landlords can instantly confirm its authenticity at{" "}
                <a href="/ESA-letter-verification" className="underline underline-offset-2 font-bold hover:text-orange-600 cursor-pointer">pawtenant.com/ESA-letter-verification</a>{" "}
                — zero health info disclosed.
              </p>
              <a
                href="/ESA-letter-verification"
                className="whitespace-nowrap mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-qr-code-line"></i>See how verification works
                <i className="ri-arrow-right-s-line"></i>
              </a>
            </div>
          </div>
        )}

        {/* Additional docs requested indicator */}
        {order.additional_documents_requested && (order.additional_documents_requested.types ?? []).filter((t) => t !== "ESA Letter").length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
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
      </div>
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
      <div className={`rounded-xl border overflow-hidden ${isUrgent ? "border-orange-300 bg-orange-50" : isPSD ? "border-amber-200 bg-amber-50" : "border-orange-200 bg-[#FFF7ED]"}`}>
        <div className="px-5 py-4 flex items-start gap-4">
          <div className={`w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 ${isUrgent ? "bg-orange-100" : isPSD ? "bg-amber-100" : "bg-orange-100"}`}>
            <i className={`text-lg ${isUrgent ? "ri-alarm-warning-line text-orange-500" : isPSD ? "ri-service-line text-amber-600" : "ri-shield-check-line text-orange-500"}`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-extrabold ${isUrgent ? "text-orange-800" : isPSD ? "text-amber-800" : "text-orange-700"}`}>
              {isUrgent ? `Your ${isPSD ? "PSD" : "ESA"} coverage renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `Your ${isPSD ? "PSD" : "ESA"} coverage is active`}
            </p>
            <p className={`text-xs mt-0.5 ${isUrgent ? "text-orange-700" : isPSD ? "text-amber-700" : "text-orange-600"}`}>
              Annual renewal on <strong>{renewalDate}</strong>
            </p>
            {isUrgent && (
              <a href={renewUrl}
                className="whitespace-nowrap mt-3 inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer">
                <i className="ri-refresh-line"></i>Renew Now
              </a>
            )}
          </div>
          {!isUrgent && (
            <div className="text-right flex-shrink-0">
              <p className={`text-2xl font-extrabold ${isPSD ? "text-amber-700" : "text-orange-500"}`}>{daysLeft}</p>
              <p className={`text-xs font-semibold ${isPSD ? "text-amber-600" : "text-orange-400"}`}>days left</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // One-time plan renewal card
  if (isPSD) {
    return (
      <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
        <div className="bg-amber-600 px-5 py-3 flex items-center gap-2">
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
              <p className="text-xl font-extrabold text-gray-900">$100<span className="text-sm font-semibold text-gray-500">.00</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Same-day turnaround available</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-300 relative">
              <span className="absolute -top-2 left-3 bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap">BEST VALUE</span>
              <p className="text-xs font-bold text-amber-800 mb-0.5">Annual Subscription</p>
              <p className="text-xl font-extrabold text-amber-700">$99<span className="text-sm font-semibold">/yr</span></p>
              <p className="text-xs text-amber-700 mt-0.5">Auto-renews · Full ADA coverage</p>
            </div>
          </div>
          <a href={renewUrl}
            className="whitespace-nowrap w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-amber-600 text-white font-extrabold text-sm rounded-lg hover:bg-amber-700 transition-colors cursor-pointer">
            <i className="ri-refresh-line"></i>Renew My PSD Letter
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-white overflow-hidden">
      <div className="bg-orange-500 px-5 py-3 flex items-center gap-2">
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
            <p className="text-xl font-extrabold text-gray-900">$90<span className="text-sm font-semibold text-gray-500">.00</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Same-day turnaround available</p>
          </div>
          <div className="bg-[#FFF7ED] rounded-lg p-3 border border-orange-300 relative">
            <span className="absolute -top-2 left-3 bg-orange-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap">BEST VALUE</span>
            <p className="text-xs font-bold text-orange-700 mb-0.5">Subscribe &amp; Save</p>
            <p className="text-xl font-extrabold text-orange-500">$100<span className="text-sm font-semibold">/yr</span></p>
            <p className="text-xs text-orange-600 mt-0.5">Auto-renews · Never lose coverage</p>
          </div>
        </div>
        <a href={renewUrl}
          className="whitespace-nowrap w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-orange-500 text-white font-extrabold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer">
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
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/customer-login"); return; }
      setUserEmail(user.email ?? "");
      setUserName(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "");

      // Fetch orders
      const { data: ordersData } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      const loadedOrders = (ordersData as Order[]) ?? [];

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
      } else {
        setOrders([]);
      }
      setLoading(false);
    };
    load();
  }, [navigate]);

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
                ? { ...o, ...updated }
                : o
            )
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userEmail]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/customer-login");
  };

  const completedOrders = orders.filter((o) => o.doctor_status === "patient_notified");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-sm text-gray-500 font-medium">{userEmail}</span>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="whitespace-nowrap hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <i className="ri-customer-service-2-line text-orange-500"></i>Support
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-1">Customer Portal</p>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {userName ? `Welcome back, ${userName.charAt(0).toUpperCase() + userName.slice(1)}` : "My Orders"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">View your orders, download documents, and manage your ESA coverage.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <i className="ri-loader-4-line animate-spin text-3xl text-orange-400 block mb-3"></i>
              <p className="text-sm text-gray-500">Loading your orders...</p>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-4">
              <i className="ri-file-list-3-line text-orange-400 text-3xl"></i>
            </div>
            <h2 className="text-base font-bold text-gray-800 mb-2">No orders found</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              No orders are linked to your account yet. If you made a purchase, make sure you used the same email address.
            </p>
            <Link to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer">
              <i className="ri-file-text-line"></i>Get Your ESA Letter
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} userEmail={userEmail} onContactSupport={() => setSupportOpen(true)} />
              ))}
            </div>

            {/* Renewal Section */}
            {completedOrders.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-7 h-7 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
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
            <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
              <i className="ri-customer-service-2-line text-orange-500 text-base"></i>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Need help with your order?</p>
              <p className="text-xs text-gray-500">Our team typically responds within 1 hour.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="tel:+14099655885" className="whitespace-nowrap inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-orange-500 transition-colors cursor-pointer">
              <i className="ri-phone-line text-orange-500"></i>(409) 965-5885
            </a>
            <a href="mailto:hello@pawtenant.com" className="whitespace-nowrap inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-orange-500 transition-colors cursor-pointer">
              <i className="ri-mail-line text-orange-500"></i>Email Us
            </a>
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-message-3-line"></i>Send a Message
            </button>
          </div>
        </div>

        {/* ── California AB 468 / 30-Day Notice Box ── */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="bg-amber-100 px-5 py-3 flex items-center gap-2 border-b border-amber-200">
            <div className="w-6 h-6 flex items-center justify-center bg-amber-500 rounded-full flex-shrink-0">
              <i className="ri-scales-3-line text-white text-xs"></i>
            </div>
            <p className="text-sm font-extrabold text-amber-900">California Residents — Important Legal Notice</p>
            <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">AB 468 Law</span>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
              <i className="ri-information-line text-amber-600"></i>
              30-Day Relationship Requirement for ESA Letters
            </p>
            <p className="text-sm text-amber-800 leading-relaxed mb-3">
              California law (AB 468, effective January 1, 2022) requires that any licensed mental health professional (LMHP) issuing an ESA letter must have established a <strong>client-provider relationship of at least 30 days</strong> prior to issuing the letter. This applies specifically to ESA letters for <strong>dogs</strong>.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              {[
                { icon: "ri-calendar-check-line", title: "Two Consultations Required", desc: "Your evaluation will involve an initial consultation followed by a follow-up after the 30-day period." },
                { icon: "ri-shield-check-line", title: "Still Fully Guaranteed", desc: "Our 100% money-back guarantee still applies if you don't qualify or your landlord rejects your letter after a HUD complaint." },
                { icon: "ri-file-text-line", title: "Legally Compliant Letter", desc: "Your ESA letter will be fully compliant with AB 468, making it recognized by California landlords and housing providers." },
                { icon: "ri-time-line", title: "Plan Ahead", desc: "Because of this requirement, California residents should plan for a 30+ day timeline from initial consultation to letter issuance." },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2.5 bg-white/70 rounded-xl p-3 border border-amber-200">
                  <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5">
                    <i className={`${item.icon} text-amber-600 text-sm`}></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-900 mb-0.5">{item.title}</p>
                    <p className="text-xs text-amber-700 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Other affected states:</strong> Arkansas, Iowa, Louisiana, and Montana have similar requirements. If you reside in these states, the same 30-day notice applies.{" "}
              <a href="mailto:hello@pawtenant.com" className="text-amber-800 font-semibold underline underline-offset-2 cursor-pointer hover:text-amber-900">Contact us</a> if you have questions about your state&apos;s requirements.
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
            <span className="flex items-center gap-1"><i className="ri-award-line text-orange-400"></i> Licensed Professionals</span>
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
        userName={userName}
        orders={orders}
        externalOpen={supportOpen}
        onExternalClose={() => setSupportOpen(false)}
      />
    </div>
  );
}
