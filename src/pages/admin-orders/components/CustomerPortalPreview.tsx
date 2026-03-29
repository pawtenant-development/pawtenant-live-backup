// CustomerPortalPreview — Read-only replica of what the customer sees in /my-orders
import { useMemo } from "react";

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
  state: string | null;
  selected_provider: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  price: number | null;
  status: string;
  doctor_status: string | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  additional_documents_requested: { types?: string[]; otherDescription?: string } | null;
  created_at: string;
  documents?: OrderDocument[];
}

interface CustomerPortalPreviewProps {
  orders: Order[];
  userEmail: string;
}

// ── Helpers (mirrors my-orders logic) ────────────────────────────────────────

function getDisplayStatus(order: Order): {
  label: string; color: string; icon: string; bgGradient: string; step: number;
} {
  const s = order.status;
  const ds = order.doctor_status;
  if (s === "cancelled") return { label: "Cancelled", color: "bg-red-100 text-red-700", icon: "ri-close-circle-line", bgGradient: "from-red-50 to-rose-50", step: -1 };
  if (ds === "patient_notified") return { label: "Completed", color: "bg-green-100 text-green-700", icon: "ri-checkbox-circle-fill", bgGradient: "from-green-50 to-emerald-50", step: 3 };
  if (ds === "letter_sent") return { label: "Under Review", color: "bg-sky-100 text-sky-700", icon: "ri-stethoscope-line", bgGradient: "from-sky-50 to-blue-50", step: 1 };
  if (ds === "in_review" || ds === "approved") return { label: "Under Review", color: "bg-sky-100 text-sky-700", icon: "ri-stethoscope-line", bgGradient: "from-sky-50 to-blue-50", step: 1 };
  if (ds === "pending_review" || s === "under-review") return { label: "Assigned to Provider", color: "bg-violet-100 text-violet-700", icon: "ri-user-received-line", bgGradient: "from-violet-50 to-purple-50", step: 1 };
  return { label: "Payment Confirmed", color: "bg-amber-100 text-amber-700", icon: "ri-loader-4-line", bgGradient: "from-amber-50 to-orange-50", step: 0 };
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

// ── Sub-components ────────────────────────────────────────────────────────────

function PortalTimeline({ order }: { order: Order }) {
  const display = getDisplayStatus(order);
  const stepIndex = display.step;
  const steps = [
    { key: "paid", label: "Payment Confirmed", icon: "ri-checkbox-circle-fill" },
    { key: "assigned", label: "Provider Assigned", icon: "ri-user-received-line" },
    { key: "letter", label: "Letter Issued", icon: "ri-file-shield-line" },
    { key: "delivered", label: "Documents Delivered", icon: "ri-mail-check-line" },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const cancelled = order.status === "cancelled";
        const allDone = order.doctor_status === "patient_notified";
        const done = !cancelled && (allDone || (idx === 0 && (order.status === "completed" || order.status === "paid" || order.status === "processing" || !!order.doctor_status)) || idx < stepIndex);
        const active = !cancelled && !allDone && idx === stepIndex;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${done ? "bg-[#1a5c4f] text-white" : active ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-400"}`}>
                <i className={`${step.icon} ${active ? "animate-pulse" : ""}`}></i>
              </div>
              <p className={`text-center mt-1 whitespace-nowrap ${done ? "text-[#1a5c4f]" : active ? "text-amber-600" : "text-gray-400"}`} style={{ fontSize: "9px", fontWeight: 600 }}>
                {step.label}
              </p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${idx < stepIndex ? "bg-[#1a5c4f]" : "bg-gray-200"}`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortalDocuments({ order }: { order: Order }) {
  const providerCompleted = order.doctor_status === "patient_notified";
  const allDocs: Array<{ label: string; doc_type: string; file_url: string; uploaded_at?: string }> = [];

  if (providerCompleted) {
    // Only show provider-submitted documents — never the auto-generated template (letter_url)
    if (order.signed_letter_url) allDocs.push({ label: "Signed ESA Letter", doc_type: "signed_letter", file_url: order.signed_letter_url });
    (order.documents ?? []).filter((d) => d.customer_visible).forEach((d) => {
      allDocs.push({ label: d.label, doc_type: d.doc_type, file_url: d.file_url, uploaded_at: d.uploaded_at });
    });
  }

  if (allDocs.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 flex items-center justify-center bg-[#f0faf7] rounded flex-shrink-0">
          <i className="ri-folder-open-line text-[#1a5c4f] text-xs"></i>
        </div>
        <p className="text-xs font-extrabold text-gray-900">My Documents</p>
        <span className="text-xs font-bold px-1.5 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] rounded-full">{allDocs.length}</span>
      </div>
      <div className="space-y-1.5">
        {allDocs.map((doc, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] rounded flex-shrink-0">
              <i className={`${DOC_TYPE_ICON[doc.doc_type] ?? "ri-file-line"} text-[#1a5c4f] text-xs`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">{doc.label}</p>
              <p className="text-xs text-gray-400">{DOC_TYPE_LABEL[doc.doc_type] ?? "Document"}</p>
            </div>
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
              className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors">
              <i className="ri-external-link-line"></i>Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalOrderCard({ order, userEmail }: { order: Order; userEmail: string }) {
  const display = getDisplayStatus(order);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Status ribbon */}
      <div className={`bg-gradient-to-r ${display.bgGradient} px-4 py-2.5 border-b border-gray-100`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${display.color}`}>
              <i className={display.icon}></i>
              {display.label}
            </span>
            <span className="text-xs text-gray-400 font-mono">{order.confirmation_id}</span>
          </div>
          <span className="text-xs text-gray-500">
            {new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          </span>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Timeline */}
        <div className="mb-4">
          <PortalTimeline order={order} />
        </div>

        {/* Details */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          {order.state && (
            <div className="flex items-start gap-1.5">
              <div className="w-6 h-6 flex items-center justify-center bg-orange-50 rounded flex-shrink-0">
                <i className="ri-map-pin-line text-orange-500 text-xs"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">State</p>
                <p className="text-xs font-semibold text-gray-800">{order.state}</p>
              </div>
            </div>
          )}
          {order.plan_type && (
            <div className="flex items-start gap-1.5">
              <div className="w-6 h-6 flex items-center justify-center bg-orange-50 rounded flex-shrink-0">
                <i className="ri-price-tag-3-line text-orange-500 text-xs"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">Plan</p>
                <p className="text-xs font-semibold text-gray-800">{order.plan_type}</p>
              </div>
            </div>
          )}
          {order.price != null && (
            <div className="flex items-start gap-1.5">
              <div className="w-6 h-6 flex items-center justify-center bg-orange-50 rounded flex-shrink-0">
                <i className="ri-money-dollar-circle-line text-orange-500 text-xs"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">Amount</p>
                <p className="text-xs font-semibold text-gray-800">${order.price}</p>
              </div>
            </div>
          )}
        </div>

        {/* Status message banner */}
        {order.doctor_status !== "patient_notified" && (
          <div className={`rounded-lg px-3 py-2.5 text-xs flex items-start gap-2 mb-3 ${
            order.doctor_status === "letter_sent" ? "bg-sky-50 border border-sky-200 text-sky-700" :
            order.doctor_status === "in_review" || order.doctor_status === "approved" ? "bg-sky-50 border border-sky-200 text-sky-700" :
            order.doctor_status === "pending_review" ? "bg-violet-50 border border-violet-200 text-violet-700" :
            "bg-amber-50 border border-amber-200 text-amber-700"
          }`}>
            <i className={`flex-shrink-0 mt-0.5 ${
              order.doctor_status === "letter_sent" ? "ri-stethoscope-line" :
              order.doctor_status === "in_review" ? "ri-stethoscope-line" :
              order.doctor_status === "pending_review" ? "ri-user-received-line" :
              "ri-time-line"
            }`}></i>
            <span>
              {order.doctor_status === "letter_sent" ? "Your evaluation is nearing completion. You'll receive an email once your documents are ready." :
               order.doctor_status === "in_review" || order.doctor_status === "approved" ? "Your provider is actively reviewing your case. You\'ll receive an email when documents are ready." :
               order.doctor_status === "pending_review" ? "Your case has been assigned to a licensed provider and is awaiting initial review." :
               "Your payment was received — your case is being queued for provider assignment."}
            </span>
          </div>
        )}

        {order.doctor_status === "patient_notified" && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-700 flex items-center gap-2 mb-3">
            <i className="ri-checkbox-circle-fill flex-shrink-0"></i>
            Your documents were sent to <strong>{userEmail}</strong>. Download them below.
          </div>
        )}

        {/* Documents */}
        <PortalDocuments order={order} />
      </div>
    </div>
  );
}

function PortalRenewCard({ order }: { order: Order }) {
  const isSubscription = order.plan_type?.toLowerCase().includes("subscription");
  const renewUrl = `/assessment?renew=1&email=${encodeURIComponent(order.email)}&state=${encodeURIComponent(order.state ?? "")}`;

  if (isSubscription) {
    const renewDate = new Date(order.created_at);
    renewDate.setFullYear(renewDate.getFullYear() + 1);
    const daysLeft = Math.max(0, Math.ceil((renewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const isUrgent = daysLeft <= 30;
    return (
      <div className={`rounded-xl border overflow-hidden ${isUrgent ? "border-orange-300 bg-orange-50" : "border-green-200 bg-[#f0faf7]"}`}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 ${isUrgent ? "bg-orange-100" : "bg-green-100"}`}>
            <i className={`text-sm ${isUrgent ? "ri-alarm-warning-line text-orange-500" : "ri-shield-check-line text-green-600"}`}></i>
          </div>
          <div className="flex-1">
            <p className={`text-xs font-extrabold ${isUrgent ? "text-orange-800" : "text-green-800"}`}>
              {isUrgent ? `Coverage renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Coverage is active"}
            </p>
            <p className={`text-xs mt-0.5 ${isUrgent ? "text-orange-700" : "text-green-700"}`}>
              Renewal on <strong>{renewDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>
            </p>
          </div>
          {!isUrgent && (
            <div className="text-right">
              <p className="text-xl font-extrabold text-green-700">{daysLeft}</p>
              <p className="text-xs text-green-600 font-semibold">days left</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-[#1a5c4f] px-4 py-2.5 flex items-center gap-2">
        <i className="ri-refresh-line text-white text-sm"></i>
        <p className="text-xs font-extrabold text-white">Renew Your ESA Coverage</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-600 mb-3">ESA letters are typically valid for 12 months. Keep your coverage active.</p>
        <a href={renewUrl}
          className="whitespace-nowrap w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a5c4f] text-white font-extrabold text-xs rounded-lg hover:bg-[#17504a] transition-colors cursor-pointer">
          <i className="ri-refresh-line"></i>Renew My ESA Letter
        </a>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CustomerPortalPreview({ orders, userEmail }: CustomerPortalPreviewProps) {
  const completedOrders = useMemo(() => orders.filter((o) => o.doctor_status === "patient_notified"), [orders]);
  const firstName = useMemo(() => {
    const name = orders[0]?.first_name;
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : userEmail.split("@")[0];
  }, [orders, userEmail]);

  return (
    <div>
      {/* Admin banner */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
        <i className="ri-eye-line text-amber-600 text-sm flex-shrink-0"></i>
        <p className="text-xs text-amber-800 font-semibold">
          <strong>Admin Preview</strong> — This is exactly what {firstName} sees when they log into their customer portal.
        </p>
      </div>

      {/* Portal shell */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        {/* Simulated navbar */}
        <div className="bg-white border-b border-gray-100 px-4 h-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-16 h-5 bg-gray-200 rounded animate-none"></div>
            <span className="text-xs font-bold text-gray-400 italic">[PawTenant Logo]</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 truncate max-w-[180px]">{userEmail}</span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <i className="ri-logout-box-line"></i>Sign Out
            </span>
          </div>
        </div>

        <div className="p-4">
          {/* Portal header */}
          <div className="mb-5">
            <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-1">Customer Portal</p>
            <h2 className="text-base font-extrabold text-gray-900">Welcome back, {firstName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">View your orders, download documents, and manage your ESA coverage.</p>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="w-12 h-12 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-3">
                <i className="ri-file-list-3-line text-orange-400 text-xl"></i>
              </div>
              <p className="text-sm font-bold text-gray-700">No orders found</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {orders.map((order) => (
                  <PortalOrderCard key={order.id} order={order} userEmail={userEmail} />
                ))}
              </div>

              {completedOrders.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 flex items-center justify-center bg-[#1a5c4f] rounded flex-shrink-0">
                      <i className="ri-refresh-line text-white text-xs"></i>
                    </div>
                    <h3 className="text-sm font-extrabold text-gray-900">Coverage Renewal</h3>
                  </div>
                  <div className="space-y-3">
                    {completedOrders.map((o) => (
                      <PortalRenewCard key={`renew-${o.id}`} order={o} />
                    ))}
                  </div>
                </div>
              )}

              {/* Help strip */}
              <div className="mt-5 bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-orange-50 rounded flex-shrink-0">
                    <i className="ri-customer-service-2-line text-orange-500 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Need help?</p>
                    <p className="text-xs text-gray-500">We typically respond within 1 hour.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                    <i className="ri-phone-line text-orange-500"></i>(409) 965-5885
                  </span>
                  <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                    <i className="ri-mail-line text-orange-500"></i>hello@pawtenant.com
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
