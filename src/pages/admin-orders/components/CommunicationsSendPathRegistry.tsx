// CommunicationsSendPathRegistry — read-only reference of EVERY customer /
// provider / admin email + SMS the platform can send, with its category and
// real wiring status. This answers "the Templates list does not show every
// actual send" by surfacing the legacy hardcoded + not-yet-wired flows that
// have no editable template row.
//
// REFUND-EMAIL-MISSING (2026-06-23): added alongside the order_cancelled_refund
// template seed so operators can see, in one place, which sends are DB-editable
// (Active DB), which are live-but-hardcoded (Legacy), and which are inert.
//
// This component is PURELY PRESENTATIONAL — it renders a static const map.
// It does not read or write the email_templates table and does not affect any
// send path. Keep the data in sync with the edge functions when flows change.

type SendStatus = "active_db" | "wired" | "legacy" | "not_wired" | "external";

interface SendPath {
  flow: string;
  channel: "email" | "sms";
  recipient: "customer" | "provider" | "admin" | "internal";
  source: string;   // edge function / trigger
  status: SendStatus;
}

interface SendCategory {
  title: string;
  icon: string;
  paths: SendPath[];
}

const STATUS_META: Record<SendStatus, { label: string; chip: string; dot: string; tip: string }> = {
  active_db: {
    label: "Active DB",
    chip: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-600",
    tip: "A live Edge Function reads an editable email_templates row. Edits in this hub go live on the next send.",
  },
  wired: {
    label: "Wired",
    chip: "bg-amber-100 text-amber-700",
    dot: "bg-amber-600",
    tip: "Live send, but the body comes from admin input at send time (not a stored template).",
  },
  legacy: {
    label: "Legacy hardcoded",
    chip: "bg-gray-200 text-gray-700",
    dot: "bg-gray-500",
    tip: "Live send whose HTML/text is hardcoded inside the Edge Function. Not editable here yet.",
  },
  not_wired: {
    label: "Not wired",
    chip: "bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
    tip: "A template/preset exists but no Edge Function consumes it yet — editing it changes nothing live.",
  },
  external: {
    label: "External",
    chip: "bg-sky-100 text-sky-700",
    dot: "bg-sky-500",
    tip: "Sent by an external provider (e.g. Stripe receipts). Not controlled from this hub.",
  },
};

const REGISTRY: SendCategory[] = [
  {
    title: "Transactional (customer)",
    icon: "ri-mail-check-line text-[#3b6ea5]",
    paths: [
      { flow: "Order Confirmation", channel: "email", recipient: "customer", source: "resend-confirmation-email · order_confirmation", status: "active_db" },
      { flow: "Payment Receipt", channel: "email", recipient: "customer", source: "Stripe-issued receipt", status: "external" },
      { flow: "Provider Assigned", channel: "email", recipient: "customer", source: "assign-doctor (hardcoded)", status: "legacy" },
      { flow: "Letter Ready / Delivery", channel: "email", recipient: "customer", source: "notify-patient-letter · letter_delivery", status: "active_db" },
      { flow: "Order Under Review", channel: "email", recipient: "customer", source: "notify-order-status (hardcoded)", status: "legacy" },
      { flow: "Order Completed", channel: "email", recipient: "customer", source: "notify-order-status (hardcoded)", status: "legacy" },
      { flow: "Order Cancelled (status, no refund)", channel: "email", recipient: "customer", source: "notify-order-status (hardcoded)", status: "legacy" },
      { flow: "Additional Documentation Paid/Received", channel: "email", recipient: "customer", source: "create-additional-doc-invoice (hardcoded)", status: "legacy" },
      { flow: "Portal Welcome / Password Reset", channel: "email", recipient: "customer", source: "send-customer-password-reset (hardcoded)", status: "legacy" },
    ],
  },
  {
    title: "Refund / Cancellation",
    icon: "ri-refund-2-line text-rose-500",
    paths: [
      { flow: "Refund + Cancellation Notice", channel: "email", recipient: "customer", source: "Refund+Cancel → send-templated-email · order_cancelled_refund", status: "active_db" },
      { flow: "Refund + Cancellation Notice", channel: "sms", recipient: "customer", source: "Refund+Cancel → ghl-send-sms · sms_order_cancelled_refund", status: "active_db" },
      { flow: "Refund Issued (Payments tab path)", channel: "email", recipient: "customer", source: "notify-customer-refund (hardcoded)", status: "legacy" },
      { flow: "Refund Issued — admin alert", channel: "email", recipient: "admin", source: "notify-customer-refund (hardcoded, prefs-gated)", status: "legacy" },
    ],
  },
  {
    title: "Lead Recovery",
    icon: "ri-mail-send-line text-violet-500",
    paths: [
      { flow: "Abandoned Checkout 30-min (Complete Your ESA Letter)", channel: "email", recipient: "customer", source: "lead-followup-sequence · seq_30min", status: "active_db" },
      { flow: "Abandoned Checkout 24h (Still Thinking?)", channel: "email", recipient: "customer", source: "lead-followup-sequence · seq_24h", status: "active_db" },
      { flow: "Abandoned Checkout 3-day + $20 off (PAW20)", channel: "email", recipient: "customer", source: "lead-followup-sequence · seq_3day", status: "active_db" },
      { flow: "5-min Recovery SMS (PAW20)", channel: "sms", recipient: "customer", source: "lead-followup-sequence (hardcoded buildRecoverySms)", status: "legacy" },
      { flow: "Checkout Recovery (single)", channel: "email", recipient: "customer", source: "send-checkout-recovery · checkout_recovery", status: "active_db" },
      { flow: "Checkout Recovery + Discount", channel: "email", recipient: "customer", source: "send-checkout-recovery · checkout_recovery_discount", status: "active_db" },
      { flow: "48-Hour / 5-Day Sequence", channel: "email", recipient: "customer", source: "preset only — no sender yet", status: "not_wired" },
      { flow: "Consultation Window Offer", channel: "email", recipient: "customer", source: "preset only — no sender yet", status: "not_wired" },
    ],
  },
  {
    title: "Marketing",
    icon: "ri-megaphone-line text-amber-500",
    paths: [
      { flow: "ESA Renewal Reminder", channel: "email", recipient: "customer", source: "send-renewal-reminders (hardcoded)", status: "legacy" },
      { flow: "30-Day Letter Reissue", channel: "email", recipient: "customer", source: "notify-thirty-day-reissue (hardcoded)", status: "legacy" },
      { flow: "Review Request", channel: "email", recipient: "customer", source: "send-review-request · review_request", status: "active_db" },
      { flow: "PSD Upgrade Offer", channel: "email", recipient: "customer", source: "preset only — no auto sender", status: "not_wired" },
    ],
  },
  {
    title: "Broadcast",
    icon: "ri-broadcast-line text-violet-500",
    paths: [
      { flow: "Broadcast Promo / $50 Discount (email)", channel: "email", recipient: "customer", source: "broadcast-email (admin-composed)", status: "wired" },
      { flow: "Bulk SMS Broadcast", channel: "sms", recipient: "customer", source: "bulk-sms (admin-composed)", status: "wired" },
      { flow: "Manual SMS (Communication tab)", channel: "sms", recipient: "customer", source: "ghl-send-sms (admin / SMS template)", status: "wired" },
    ],
  },
  {
    title: "Provider",
    icon: "ri-stethoscope-line text-teal-600",
    paths: [
      { flow: "New Case Assigned", channel: "email", recipient: "provider", source: "assign-doctor (hardcoded)", status: "legacy" },
      { flow: "Additional Documentation Assigned", channel: "email", recipient: "provider", source: "assign-doctor (embedded, hardcoded)", status: "legacy" },
      { flow: "New ESA Order Link", channel: "email", recipient: "provider", source: "send-new-esa-order-link (hardcoded)", status: "legacy" },
      { flow: "Letter Submitted / Reopened (under review)", channel: "email", recipient: "provider", source: "provider-submit-letter / notify-order-status", status: "legacy" },
      { flow: "Application Follow-Up", channel: "email", recipient: "provider", source: "send-followup-email (hardcoded)", status: "legacy" },
      { flow: "Application Approved", channel: "email", recipient: "provider", source: "approve-provider-application (hardcoded)", status: "legacy" },
      { flow: "Recruitment Outreach", channel: "email", recipient: "provider", source: "send-provider-recruitment-email · provider_recruitment_outreach", status: "active_db" },
      { flow: "Final Onboarding Welcome", channel: "email", recipient: "provider", source: "provider_final_onboarding_welcome (template seeded)", status: "not_wired" },
      { flow: "Monthly Earnings Report", channel: "email", recipient: "provider", source: "send-monthly-business-report (hardcoded)", status: "legacy" },
      { flow: "Payout Reminder", channel: "email", recipient: "provider", source: "send-payout-reminder (hardcoded)", status: "legacy" },
      { flow: "License Change", channel: "email", recipient: "provider", source: "notify-license-change (hardcoded)", status: "legacy" },
    ],
  },
  {
    title: "Admin / Internal",
    icon: "ri-admin-line text-gray-500",
    paths: [
      { flow: "Order status admin alerts", channel: "email", recipient: "admin", source: "notify-order-status (hardcoded, prefs-gated)", status: "legacy" },
      { flow: "New Unpaid Lead / Resume", channel: "email", recipient: "admin", source: "get-resume-order (hardcoded, prefs-gated)", status: "legacy" },
      { flow: "Contact Form Submission", channel: "email", recipient: "admin", source: "contact-submit (hardcoded)", status: "legacy" },
      { flow: "Contact Form Reply", channel: "email", recipient: "customer", source: "contact-reply (hardcoded)", status: "legacy" },
      { flow: "Admin OTP", channel: "email", recipient: "admin", source: "send-admin-otp (hardcoded)", status: "legacy" },
      { flow: "Approval Request", channel: "email", recipient: "admin", source: "notify-approval-request (hardcoded)", status: "legacy" },
      { flow: "Generic Admin Email", channel: "email", recipient: "internal", source: "send-admin-email (admin-composed)", status: "wired" },
      { flow: "Template Test Send", channel: "email", recipient: "admin", source: "send-template-test (selected template)", status: "active_db" },
    ],
  },
];

import { useState } from "react";

export default function CommunicationsSendPathRegistry() {
  const [open, setOpen] = useState(false);

  const total = REGISTRY.reduce((n, c) => n + c.paths.length, 0);
  const counts = REGISTRY.flatMap((c) => c.paths).reduce<Record<SendStatus, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, { active_db: 0, wired: 0, legacy: 0, not_wired: 0, external: 0 });

  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <i className="ri-list-check-2 text-[#3b6ea5]"></i>
          All notification send paths
          <span className="px-1.5 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">{total}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>{counts.active_db} editable
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>{counts.legacy} legacy
          </span>
          <i className={`ri-arrow-down-s-line text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}></i>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1">
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-3">
            {(Object.keys(STATUS_META) as SendStatus[]).map((s) => (
              <span key={s} title={STATUS_META[s].tip}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_META[s].chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`}></span>
                {STATUS_META[s].label}
              </span>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">
            Best-known mapping of every send the platform can fire. <span className="font-semibold text-emerald-700">Active DB</span> rows
            are editable above; <span className="font-semibold text-gray-600">Legacy hardcoded</span> live inside their Edge Function and are
            not yet editable here.
          </p>

          <div className="space-y-4">
            {REGISTRY.map((cat) => (
              <div key={cat.title}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <i className={`text-xs ${cat.icon}`}></i>{cat.title}
                </p>
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  {cat.paths.map((p, i) => {
                    const meta = STATUS_META[p.status];
                    return (
                      <div key={`${p.flow}-${p.channel}-${i}`}
                        className={`flex items-center gap-3 px-3 py-2 ${i % 2 ? "bg-gray-50/60" : "bg-white"}`}>
                        <i className={`text-sm flex-shrink-0 ${p.channel === "sms" ? "ri-message-3-line text-violet-400" : "ri-mail-line text-[#9bb8d6]"}`}
                          title={p.channel.toUpperCase()}></i>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-gray-700 truncate">{p.flow}</p>
                          <p className="text-[10px] text-gray-400 truncate font-mono">{p.source}</p>
                        </div>
                        <span className="text-[10px] text-gray-400 capitalize hidden md:inline w-16 flex-shrink-0">{p.recipient}</span>
                        <span title={meta.tip}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${meta.chip}`}>
                          <span className={`w-1 h-1 rounded-full ${meta.dot}`}></span>{meta.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
