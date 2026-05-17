// OrderDetailModal — Full case management view for admins
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import { isProviderEligibleForState } from "./providerEligibility";
import OrderNotesPanel from "./OrderNotesPanel";
import ApprovalRequestModal from "./ApprovalRequestModal";
import CommunicationTab from "./CommunicationTab";
import AttributionJourneyTab from "./AttributionJourneyTab";
import TrustpilotReviewPanel from "./TrustpilotReviewPanel";
import PSDAssessmentView from "./PSDAssessmentView";
import SharedNotesPanel from "../../../components/feature/SharedNotesPanel";
import PaymentHistoryTab from "./PaymentHistoryTab";
import { canDelete } from "../../../lib/adminPermissions";
import {
  LOGO_URL as ASSESSMENT_LOGO,
  STATE_NAMES,
  QUESTIONNAIRE_ITEMS,
  PetInfo,
  resolveLabel,
  formatDob,
  formatSubmitDate,
  buildPrintHTML,
} from "./assessmentUtils";

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  selected_provider: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  price: number | null;
  payment_intent_id: string | null;
  checkout_session_id?: string | null;
  payment_method: string | null;
  paid_at?: string | null;
  status: string;
  doctor_status: string | null;
  doctor_user_id: string | null;
  doctor_name: string | null;
  doctor_email: string | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  assessment_answers: Record<string, unknown> | null;
  created_at: string;
  ghl_synced_at: string | null;
  ghl_sync_error: string | null;
  ghl_contact_id?: string | null;
  email_log?: EmailLogEntry[] | null;
  referred_by: string | null;
  addon_services?: string[] | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
  dispute_id?: string | null;
  dispute_status?: string | null;
  fraud_warning?: boolean | null;
  letter_type?: string | null;
  coupon_code?: string | null;
  coupon_discount?: number | null;
  payment_failed_at?: string | null;
  payment_failure_reason?: string | null;
  letter_id?: string | null;
  letter_issue_date?: string | null;
  letter_expiry_date?: string | null;
  broadcast_opt_out?: boolean | null;
  last_broadcast_sent_at?: string | null;
  // OPS-ORDER-ARCHIVE-VOID-FLOW: optional sibling fields. Persisted via
  // order_status_logs/audit_logs; surfaced here only if present on the row.
  archived_at?: string | null;
  archive_reason?: string | null;
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

interface DoctorContact {
  id: string;
  full_name: string;
  email: string;
  licensed_states?: string[];
  is_active?: boolean | null;
  state_license_numbers?: Record<string, string> | null;
}

interface AdminProfile {
  user_id: string;
  full_name: string;
  role?: string | null;
}

interface OrderDetailModalProps {
  order: Order;
  doctorContacts: DoctorContact[];
  adminProfile: AdminProfile;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: Partial<Order> & { id: string }) => void;
  onOrderDeleted?: (orderId: string) => void;
  /** Full filtered/sorted order list for arrow-key navigation */
  allOrders?: Order[];
  /** Called when user navigates to a different order via arrow keys */
  onNavigate?: (order: Order) => void;
  /** Called when comms or notes tab is opened — clears the unread badge */
  onClearUnread?: (confirmationId: string) => void;
}

type Section = "overview" | "documents" | "assessment" | "notes" | "comms" | "payments" | "attribution";

// ─── PSD order detection — letter_type field OR confirmation ID prefix ────────
function isPSDOrder(order: Pick<Order, "letter_type" | "confirmation_id">): boolean {
  return order.letter_type === "psd" || order.confirmation_id.includes("-PSD");
}

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing",
  "under-review": "Under Review",
  completed: "Completed",
  cancelled: "Cancelled",
  lead: "Lead (Unpaid)",
  // OPS-ORDER-ARCHIVE-VOID-FLOW
  archived: "Archived / Voided",
};

const STATUS_COLOR: Record<string, string> = {
  processing: "bg-sky-100 text-sky-700",
  "under-review": "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
  lead: "bg-amber-100 text-amber-700",
  // OPS-ORDER-ARCHIVE-VOID-FLOW
  archived: "bg-gray-200 text-gray-700",
};

// ─── 4-stage display status helper ──────────────────────────────────────────
function getModalDisplayStatus(order: Order): { label: string; color: string } {
  // OPS-ORDER-ARCHIVE-VOID-FLOW: archived/voided takes precedence over lead
  // labels but stays below disputed/fraud/refunded so financial states still
  // show first if both apply.
  if (order.status === "archived") {
    return { label: "Archived / Voided", color: "bg-gray-200 text-gray-700" };
  }
  if (order.status === "disputed" || order.dispute_id) {
    return { label: "Disputed", color: "bg-red-100 text-red-700" };
  }
  if (order.fraud_warning) {
    return { label: "Fraud Warning", color: "bg-red-200 text-red-800" };
  }
  if (order.status === "refunded" || order.refunded_at) {
    return { label: "Refunded", color: "bg-red-100 text-red-600" };
  }
  if (order.doctor_status === "patient_notified") {
    return { label: "Order (Completed)", color: "bg-emerald-100 text-emerald-700" };
  }
  if (order.status === "lead" || !order.payment_intent_id) {
    return { label: "Lead (Unpaid)", color: "bg-amber-100 text-amber-700" };
  }
  // Rejected or manually unassigned — show as Paid (Unassigned) so it can be reassigned
  if (
    order.doctor_status === "provider_rejected" ||
    order.doctor_status === "unassigned" ||
    (!order.doctor_email && !order.doctor_user_id)
  ) {
    return { label: "Paid (Unassigned)", color: "bg-sky-100 text-sky-700" };
  }
  return { label: "Order (Under Review)", color: "bg-sky-100 text-sky-700" };
}

const DOCTOR_STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  in_review: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  letter_sent: "bg-[#dbeafe] text-[#3b6ea5]",
  patient_notified: "bg-violet-100 text-violet-700",
  provider_rejected: "bg-red-100 text-red-700",
  unassigned: "bg-sky-100 text-sky-700",
};

const EMAIL_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; failColor: string }> = {
  order_confirmation: { label: "Order Confirmation",   icon: "ri-mail-check-line",   color: "text-[#3b6ea5] bg-[#dbeafe] border-[#b8cce4]", failColor: "text-red-600 bg-red-50 border-red-200" },
  payment_receipt:   { label: "Payment Receipt",       icon: "ri-file-text-line",     color: "text-emerald-700 bg-emerald-50 border-emerald-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  internal_notification: { label: "Internal Notification (Admin)", icon: "ri-notification-3-line", color: "text-gray-600 bg-gray-50 border-gray-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  letter_ready:      { label: "Letter Ready",          icon: "ri-file-check-line",    color: "text-violet-700 bg-violet-50 border-violet-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  refund:            { label: "Refund Confirmation",   icon: "ri-refund-line",        color: "text-orange-700 bg-orange-50 border-orange-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  status_under_review: { label: "Status: Under Review",  icon: "ri-eye-line",          color: "text-sky-700 bg-sky-50 border-sky-200",  failColor: "text-red-600 bg-red-50 border-red-200" },
  status_completed:    { label: "Status: Completed (Paid)", icon: "ri-checkbox-circle-line", color: "text-emerald-700 bg-emerald-50 border-emerald-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  provider_assigned_provider: { label: "Provider Assignment Notice", icon: "ri-user-received-line", color: "text-[#3b6ea5] bg-[#e8f0f9] border-[#b8cce4]", failColor: "text-red-600 bg-red-50 border-red-200" },
  provider_assigned_customer: { label: "Provider Assigned (Patient)", icon: "ri-user-star-line", color: "text-sky-700 bg-sky-50 border-sky-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  provider_notification:      { label: "Provider Nudge",              icon: "ri-notification-3-line", color: "text-amber-700 bg-amber-50 border-amber-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  thirty_day_reminder:        { label: "30-Day Reissue Reminder",      icon: "ri-time-fill",           color: "text-orange-700 bg-orange-50 border-orange-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  status_cancelled:           { label: "Cancellation Notice",          icon: "ri-close-circle-line",   color: "text-red-700 bg-red-50 border-red-200",          failColor: "text-red-600 bg-red-50 border-red-200" },
  cancelled:                  { label: "Cancellation Notice",          icon: "ri-close-circle-line",   color: "text-red-700 bg-red-50 border-red-200",          failColor: "text-red-600 bg-red-50 border-red-200" },
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtEmailTime(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

interface OrderDocument {
  id: string;
  order_id: string;
  confirmation_id: string;
  label: string;
  doc_type: string;
  file_url: string;
  uploaded_by: string;
  uploaded_at: string;
  sent_to_customer: boolean;
  footer_injected?: boolean;
  processed_file_url?: string | null;
  footer_letter_id?: string | null;
  customer_visible: boolean;
  notes: string | null;
}

// ── Clean up document labels that come from raw filenames ────────────────────
// Strips .pdf/.PDF extension, removes trailing " Copy" duplicates, trims numbers
function cleanDocLabel(raw: string): string {
  let label = raw.trim();
  // Remove .pdf extension (case-insensitive)
  label = label.replace(/\.pdf$/i, "").trim();
  // Remove trailing " Copy" repeated any number of times (e.g. "Copy Copy Copy")
  label = label.replace(/(\s+Copy)+$/i, "").trim();
  // Remove trailing isolated numbers like " 1", " 2" that come from macOS duplicate naming
  label = label.replace(/\s+\d+$/, "").trim();
  return label || raw;
}

const DOC_TYPE_OPTIONS = [
  { value: "esa_letter", label: "ESA Letter" },
  { value: "housing_verification", label: "Housing Verification Letter" },
  { value: "landlord_form", label: "Landlord Form" },
  { value: "signed_letter", label: "Signed Letter" },
  { value: "other", label: "Other / Supporting Document" },
];

const US_STATES_MAP: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "Credit / Debit Card",
  klarna: "Klarna (Pay in 4)",
  qr: "QR Code / Mobile Pay",
};

const REF_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  // Short keys (legacy)
  facebook:     { label: "Facebook / Instagram Ads", icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50 border-blue-200" },
  google_ads:   { label: "Google Ads",   icon: "ri-google-line",          color: "text-orange-600 bg-orange-50 border-orange-200" },
  social_media: { label: "Social Media", icon: "ri-share-circle-line",    color: "text-pink-600 bg-pink-50 border-pink-200" },
  seo:          { label: "SEO",          icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  // Full string values stored in DB
  "Facebook / Instagram Ads": { label: "Facebook / Instagram Ads", icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50 border-blue-200" },
  "Google Ads":               { label: "Google Ads",               icon: "ri-google-line",          color: "text-orange-600 bg-orange-50 border-orange-200" },
  "Google Organic":           { label: "Google Organic (SEO)",     icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  "TikTok Ads":               { label: "TikTok Ads",               icon: "ri-tiktok-line",          color: "text-gray-900 bg-gray-100 border-gray-300" },
  "Instagram Ads":            { label: "Instagram Ads",            icon: "ri-instagram-line",       color: "text-pink-600 bg-pink-50 border-pink-200" },
  "YouTube Ads":              { label: "YouTube Ads",              icon: "ri-youtube-line",         color: "text-red-600 bg-red-50 border-red-200" },
  "Email Campaign":           { label: "Email Campaign",           icon: "ri-mail-send-line",       color: "text-violet-600 bg-violet-50 border-violet-200" },
  "Referral":                 { label: "Referral",                 icon: "ri-share-forward-line",   color: "text-teal-600 bg-teal-50 border-teal-200" },
  "Direct":                   { label: "Direct",                   icon: "ri-cursor-line",          color: "text-gray-600 bg-gray-50 border-gray-200" },
};

function resolveRefConfig(referredBy: string | null): { label: string; icon: string; color: string } | null {
  if (!referredBy) return null;
  if (REF_CONFIG[referredBy]) return REF_CONFIG[referredBy];
  // Fuzzy match: check if any key is contained in the value
  const lower = referredBy.toLowerCase();
  if (lower.includes("facebook") || lower.includes("instagram")) return REF_CONFIG["Facebook / Instagram Ads"];
  if (lower.includes("google") && lower.includes("organic")) return REF_CONFIG["Google Organic"];
  if (lower.includes("google")) return REF_CONFIG["Google Ads"];
  if (lower.includes("tiktok")) return REF_CONFIG["TikTok Ads"];
  if (lower.includes("youtube")) return REF_CONFIG["YouTube Ads"];
  if (lower.includes("email")) return REF_CONFIG["Email Campaign"];
  if (lower.includes("referral")) return REF_CONFIG["Referral"];
  if (lower.includes("seo") || lower.includes("organic")) return REF_CONFIG["Google Organic"];
  if (lower.includes("direct")) return REF_CONFIG["Direct"];
  // Unknown but has a value — show it as-is with a generic icon
  return { label: referredBy, icon: "ri-share-circle-line", color: "text-gray-600 bg-gray-50 border-gray-200" };
}

// ── Verification ID row — fetches status from letter_verifications ────────────
const VERIF_STATUS_BADGE: Record<string, string> = {
  valid:   "bg-emerald-100 text-emerald-700",
  revoked: "bg-red-100 text-red-600",
  expired: "bg-gray-100 text-gray-500",
};
const VERIF_STATUS_ICON: Record<string, string> = {
  valid:   "ri-shield-check-line",
  revoked: "ri-shield-cross-line",
  expired: "ri-time-line",
};

// ─── CopyFieldButton — small inline copy icon ────────────────────────────────
function CopyFieldButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    const fallback = () => {
      try {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* ignore */ }
    };
    if (navigator.clipboard && document.hasFocus()) {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(fallback);
    } else {
      fallback();
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      title="Copy"
      className="whitespace-nowrap flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-[#3b6ea5] cursor-pointer transition-colors"
    >
      <i className={copied ? "ri-checkbox-circle-line text-emerald-500" : "ri-file-copy-line"} style={{ fontSize: "12px" }}></i>
    </button>
  );
}

// ─── RetryPaymentButton ───────────────────────────────────────────────────────
const SUPABASE_URL_MODAL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY_MODAL = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

function RetryPaymentButton({ order }: { order: Order }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const handleSend = async () => {
    if (!order.email) return;
    setSending(true);
    setErr("");
    try {
      const res = await fetch(`${SUPABASE_URL_MODAL}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY_MODAL,
          Authorization: `Bearer ${SUPABASE_KEY_MODAL}`,
        },
        body: JSON.stringify({
          email: order.email,
          letterType: order.letter_type ?? "esa",
          confirmationId: order.confirmation_id,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setSent(true);
      } else {
        setErr(data.error ?? "Failed to send retry link.");
      }
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
        <i className="ri-checkbox-circle-fill text-emerald-500"></i>
        Retry payment link sent to {order.email}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-60"
      >
        {sending
          ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
          : <><i className="ri-send-plane-line"></i>Send Retry Payment Link</>}
      </button>
      {err && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><i className="ri-error-warning-line"></i>{err}</p>}
    </div>
  );
}

// ─── NotesTabMerged — Provider Notes + Internal Notes in one tab ─────────────
function NotesTabMerged({ orderId, confirmationId, adminUserId, adminName }: {
  orderId: string; confirmationId: string; adminUserId: string; adminName: string;
}) {
  // OPS-ORDER-MODAL-V2-LAYOUT: default to Internal Notes per owner request —
  // admin operations open Notes for internal context first; provider notes are
  // a deliberate switch.
  const [activeNoteTab, setActiveNoteTab] = useState<"provider" | "internal">("internal");
  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-0">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([
            { key: "provider" as const, label: "Provider Notes", icon: "ri-chat-3-line" },
            { key: "internal" as const, label: "Internal Notes", icon: "ri-sticky-note-line" },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveNoteTab(tab.key)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeNoteTab === tab.key ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
            >
              <i className={tab.icon}></i>{tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 ml-3">
          {activeNoteTab === "provider" ? "Shared between admin and provider" : "Admin-only internal notes"}
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeNoteTab === "provider" ? (
          <SharedNotesPanel
            orderId={orderId}
            confirmationId={confirmationId}
            currentUserId={adminUserId}
            currentUserName={adminName}
            currentUserRole="admin"
          />
        ) : (
          <OrderNotesPanel
            orderId={orderId}
            confirmationId={confirmationId}
            adminUserId={adminUserId}
            adminName={adminName}
            onClose={() => {}}
          />
        )}
      </div>
    </div>
  );
}

function VerificationIdRow({ orderId, letterId }: { orderId: string; letterId: string }) {
  const [status, setStatus] = useState<string>("valid");
  const [copied, setCopied] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState("");

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

  useEffect(() => {
    supabase
      .from("letter_verifications")
      .select("status")
      .eq("order_id", orderId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status) setStatus(data.status as string);
      });
  }, [orderId]);

  const handleCopy = () => {
    const copyFallback = () => {
      try {
        const el = document.createElement("textarea");
        el.value = letterId;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // silently fail
      }
    };

    if (navigator.clipboard && document.hasFocus()) {
      navigator.clipboard.writeText(letterId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(copyFallback);
    } else {
      copyFallback();
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    setRevokeMsg("");
    try {
      const token = await import("../../../lib/supabaseClient").then(m => m.getAdminToken());
      const res = await fetch(`${supabaseUrl}/functions/v1/revoke-letter-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId,
          letterId,
          reason: revokeReason.trim() || "Revoked by admin",
        }),
      });
      const result = await res.json() as { ok: boolean; revoked?: boolean; alreadyRevoked?: boolean; error?: string };
      if (result.ok) {
        setStatus("revoked");
        setShowRevokeConfirm(false);
        setRevokeReason("");
        setRevokeMsg(result.alreadyRevoked ? "Already revoked." : "Verification ID revoked successfully.");
      } else {
        setRevokeMsg(result.error ?? "Revoke failed — check edge function logs");
      }
    } catch {
      setRevokeMsg("Network error — please try again");
    }
    setRevoking(false);
    setTimeout(() => setRevokeMsg(""), 6000);
  };

  return (
    <div className="col-span-2 sm:col-span-3 md:col-span-4">
      <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
        <i className="ri-shield-check-line text-[#3b6ea5]"></i>
        Verification ID
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-mono font-bold px-3 py-1.5 rounded-lg select-all tracking-wider border ${status === "revoked" ? "text-red-600 bg-red-50 border-red-200 line-through opacity-70" : "text-[#3b6ea5] bg-[#e8f0f9] border-[#b8cce4]"}`}>
          {letterId}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${VERIF_STATUS_BADGE[status] ?? VERIF_STATUS_BADGE.valid}`}>
          <i className={VERIF_STATUS_ICON[status] ?? VERIF_STATUS_ICON.valid}></i>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="whitespace-nowrap inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#3b6ea5] cursor-pointer transition-colors"
        >
          <i className={copied ? "ri-checkbox-circle-line" : "ri-file-copy-line"}></i>
          {copied ? "Copied!" : "Copy"}
        </button>
        {/* Revoke button — only shown when status is valid */}
        {status !== "revoked" && (
          <button
            type="button"
            onClick={() => setShowRevokeConfirm(true)}
            className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-bold cursor-pointer transition-colors"
          >
            <i className="ri-shield-cross-line"></i>
            Revoke
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
        <i className="ri-information-line"></i>
        Public-safe ID — no PHI.{" "}
        <a
          href={`/verify/${letterId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#3b6ea5] font-semibold hover:underline cursor-pointer"
        >
          Preview verify page
        </a>
      </p>
      {revokeMsg && (
        <p className={`text-xs mt-1.5 flex items-center gap-1 font-semibold ${revokeMsg.includes("success") || revokeMsg.includes("Already") ? "text-[#3b6ea5]" : "text-red-600"}`}>
          <i className={revokeMsg.includes("success") || revokeMsg.includes("Already") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {revokeMsg}
        </p>
      )}

      {/* ── Revoke Confirm Dialog ── */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRevokeConfirm(false)}></div>
          <div className="relative bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-shield-cross-fill text-red-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Revoke Verification ID?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will immediately invalidate{" "}
                  <span className="font-mono font-bold text-gray-800">{letterId}</span>.
                  Anyone scanning or checking this ID will see it as <strong className="text-red-600">Revoked</strong>.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 space-y-1.5 text-xs text-red-700">
              <p className="flex items-center gap-1.5 font-semibold">
                <i className="ri-error-warning-fill"></i>
                This action cannot be undone from the admin panel.
              </p>
              <p className="flex items-center gap-1.5">
                <i className="ri-global-line"></i>
                The public verify page will immediately show this ID as revoked.
              </p>
              <p className="flex items-center gap-1.5">
                <i className="ri-file-damage-line"></i>
                The PDF footer stamp will still show the ID — only the online check is affected.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                Reason for revocation <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value.slice(0, 300))}
                rows={2}
                placeholder="e.g. Order cancelled and refunded, fraudulent order, customer requested..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-400 resize-none"
                autoFocus
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">{revokeReason.length}/300</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revoking}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                {revoking
                  ? <><i className="ri-loader-4-line animate-spin"></i>Revoking...</>
                  : <><i className="ri-shield-cross-line"></i>Yes, Revoke ID</>
                }
              </button>
              <button
                type="button"
                onClick={() => { setShowRevokeConfirm(false); setRevokeReason(""); }}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GHL Sync Log entry type ──────────────────────────────────────────────────
interface GhlSyncLogEntry {
  id: string;
  confirmation_id: string;
  event_type: string;
  status: "success" | "failed";
  ghl_status_code: number | null;
  error_message: string | null;
  attempts: number;
  triggered_by: string;
  payload_summary: Record<string, unknown> | null;
  created_at: string;
}

const GHL_EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  assessment_started:        { label: "Assessment Started",    color: "text-amber-700 bg-amber-50 border-amber-200",    icon: "ri-file-list-3-line" },
  payment_confirmed:         { label: "Payment Confirmed",     color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "ri-bank-card-line" },
  payment_confirmed_backfill:{ label: "Payment (Backfill)",    color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "ri-refresh-line" },
  doctor_assigned:           { label: "Provider Assigned",     color: "text-sky-700 bg-sky-50 border-sky-200",          icon: "ri-user-received-line" },
  order_completed:           { label: "Order Completed",       color: "text-violet-700 bg-violet-50 border-violet-200", icon: "ri-checkbox-circle-line" },
  order_cancelled:           { label: "Order Cancelled",       color: "text-red-700 bg-red-50 border-red-200",          icon: "ri-close-circle-line" },
  refund_issued:             { label: "Refund Issued",         color: "text-orange-700 bg-orange-50 border-orange-200", icon: "ri-refund-line" },
  letter_sent:               { label: "Letter Sent",           color: "text-violet-700 bg-violet-50 border-violet-200", icon: "ri-mail-check-line" },
};

function GhlSyncHistory({ confirmationId }: { confirmationId: string }) {
  const [logs, setLogs] = useState<GhlSyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ghl_sync_logs")
      .select("*")
      .eq("confirmation_id", confirmationId)
      .order("created_at", { ascending: false })
      .limit(20);
    setLogs((data as GhlSyncLogEntry[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmationId]);

  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="col-span-2 sm:col-span-3 md:col-span-4 mt-1">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-lg group-hover:bg-gray-200 transition-colors">
            <i className={`${expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-500 text-sm`}></i>
          </div>
          <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
            <i className="ri-history-line text-gray-400"></i>
            GHL Sync History
            {logs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                {logs.length}
              </span>
            )}
          </p>
        </button>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <div className="flex items-center gap-1.5">
              {successCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>{successCount} ok
                </span>
              )}
              {failedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                  <i className="ri-close-circle-fill" style={{ fontSize: "9px" }}></i>{failedCount} failed
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="whitespace-nowrap flex items-center gap-1 px-2 py-1 border border-gray-200 text-gray-400 text-[10px] font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
          >
            <i className={loading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Log entries */}
      {expanded && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <i className="ri-loader-4-line animate-spin text-gray-300 text-lg"></i>
            </div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-gray-400">No GHL sync history yet for this order.</p>
              <p className="text-[10px] text-gray-300 mt-1">Sync events will appear here after the first sync attempt.</p>
            </div>
          ) : (
            logs.map((log, idx) => {
              const evtCfg = GHL_EVENT_LABELS[log.event_type] ?? {
                label: log.event_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                color: "text-gray-600 bg-gray-50 border-gray-200",
                icon: "ri-refresh-line",
              };
              const isSuccess = log.status === "success";
              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${!isSuccess ? "bg-red-50/30" : idx === 0 ? "bg-[#f8fffe]" : ""}`}
                >
                  {/* Status icon */}
                  <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5 ${isSuccess ? "bg-emerald-100" : "bg-red-100"}`}>
                    <i className={`${isSuccess ? evtCfg.icon : "ri-error-warning-line"} ${isSuccess ? "text-emerald-600" : "text-red-500"} text-xs`}></i>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${evtCfg.color}`}>
                        {evtCfg.label}
                      </span>
                      {log.attempts > 1 && (
                        <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                          {log.attempts} attempts
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSuccess ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {isSuccess
                          ? <><i className="ri-checkbox-circle-fill" style={{ fontSize: "8px" }}></i>Success</>
                          : <><i className="ri-close-circle-fill" style={{ fontSize: "8px" }}></i>Failed</>
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[10px] text-gray-400">
                        {new Date(log.created_at).toLocaleString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                      </p>
                      {log.triggered_by && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="text-[10px] text-gray-400 capitalize">by {log.triggered_by}</span>
                        </>
                      )}
                      {log.ghl_status_code && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className={`text-[10px] font-mono font-semibold ${isSuccess ? "text-emerald-600" : "text-red-500"}`}>
                            HTTP {log.ghl_status_code}
                          </span>
                        </>
                      )}
                    </div>
                    {!isSuccess && log.error_message && (
                      <p className="text-[10px] text-red-500 mt-1 leading-relaxed italic truncate max-w-[320px]" title={log.error_message}>
                        {log.error_message.slice(0, 120)}{log.error_message.length > 120 ? "..." : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderDetailModal({
  order: initialOrder,
  doctorContacts,
  adminProfile,
  onClose,
  onOrderUpdated,
  onOrderDeleted,
  onClearUnread,
  allOrders = [],
  onNavigate,
}: OrderDetailModalProps) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [section, setSection] = useState<Section>("overview");
  const [assignEmail, setAssignEmail] = useState(order.doctor_email ?? "");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [ghlFiring, setGhlFiring] = useState(false);
  const [ghlMsg, setGhlMsg] = useState("");
  // OPS-ORDER-MODAL-OVERVIEW-CLEANUP: toggle for the collapsible CRM Details
  // panel that holds GHL Contact ID, Linked badge, Open in GHL, and Sync
  // History — moved out of the main Overview to reduce debug-screen clutter.
  const [showCrmDetails, setShowCrmDetails] = useState(false);
  // OPS-ORDER-MODAL-V2-LAYOUT: header "More" actions dropdown (Send Reset /
  // Upgrade / New Order / Provider View). Closes on outside click + escape.
  const [showHeaderMore, setShowHeaderMore] = useState(false);
  const headerMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showHeaderMore) return;
    function onClick(e: MouseEvent) {
      if (headerMoreRef.current && !headerMoreRef.current.contains(e.target as Node)) {
        setShowHeaderMore(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShowHeaderMore(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showHeaderMore]);
  // OPS-ORDER-MODAL-V2-LAYOUT: collapsed Admin Actions accordion in the right
  // operations rail. Default collapsed so admin actions don't dominate.
  const [showAdminActions, setShowAdminActions] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [confirmResending, setConfirmResending] = useState(false);
  const [confirmResendMsg, setConfirmResendMsg] = useState("");
  const [portalResetSending, setPortalResetSending] = useState(false);
  const [portalResetMsg, setPortalResetMsg] = useState("");
  const [discountSending, setDiscountSending] = useState(false);
  const [discountMsg, setDiscountMsg] = useState("");
  // CONSULTATION-INVITE-MANUAL — admin sends a branded consultation invite
  // email via the existing send-templated-email edge function. Cooldown is
  // a client-side guard read from `communications` so duplicate sends within
  // 24h require explicit confirmation. No new email infra.
  const [consultInviteSending, setConsultInviteSending] = useState(false);
  const [consultInviteMsg, setConsultInviteMsg] = useState("");
  const [consultLastSentAt, setConsultLastSentAt] = useState<string | null>(null);
  const [stripeIdInput, setStripeIdInput] = useState("");
  const [paymentSyncing, setPaymentSyncing] = useState(false);
  const [paymentSyncMsg, setPaymentSyncMsg] = useState("");
  const [paymentSyncOk, setPaymentSyncOk] = useState<boolean | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidMsg, setMarkPaidMsg] = useState("");
  const [showMarkPaidConfirm, setShowMarkPaidConfirm] = useState(false);

  // ── Multi-document state ──
  const [orderDocs, setOrderDocs] = useState<OrderDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [addDocForm, setAddDocForm] = useState({ url: "", label: "", docType: "other", notes: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [addDocMsg, setAddDocMsg] = useState("");
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllMsg, setSendAllMsg] = useState("");
  const [showAddDocForm, setShowAddDocForm] = useState(false);
  const [doctorMessage, setDoctorMessage] = useState("");

  // ── Provider docs guard — tracks whether at least one doc has been uploaded ──
  const [hasProviderDocs, setHasProviderDocs] = useState<boolean>(!!order.signed_letter_url);
  const [docCount, setDocCount] = useState<number>(order.signed_letter_url ? 1 : 0);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Keyboard shortcuts: Escape = close, ArrowLeft/ArrowRight = navigate ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (!onNavigate || allOrders.length === 0) return;

      const currentIdx = allOrders.findIndex((o) => o.id === order.id);
      if (currentIdx === -1) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = currentIdx - 1;
        if (prevIdx >= 0) onNavigate(allOrders[prevIdx]);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = currentIdx + 1;
        if (nextIdx < allOrders.length) onNavigate(allOrders[nextIdx]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNavigate, allOrders, order.id]);

  // Load provider doc count on mount so "Mark Letter Sent" gate is accurate
  useEffect(() => {
    supabase
      .from("order_documents")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .then(({ count }) => {
        const total = (count ?? 0) + (order.signed_letter_url ? 1 : 0);
        if (total > 0) {
          setHasProviderDocs(true);
          setDocCount(total);
        }
      });
  }, [order.id, order.signed_letter_url]);

  // CONSULTATION-INVITE-MANUAL — read the most recent consultation invite
  // send from `communications` so the action button shows cooldown state
  // and enforces a 24h guard. Activity is already logged by send-templated-email
  // via the shared logEmailComm helper; we just surface it.
  useEffect(() => {
    let cancelled = false;
    if (!order.confirmation_id) {
      setConsultLastSentAt(null);
      return;
    }
    supabase
      .from("communications")
      .select("created_at,status")
      .eq("confirmation_id", order.confirmation_id)
      .eq("slug", "consultation_window_offer")
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setConsultLastSentAt((data?.created_at as string | null) ?? null);
      });
    return () => { cancelled = true; };
  }, [order.confirmation_id]);

  // Keep in sync when orderDocs tab loads more docs
  useEffect(() => {
    if (orderDocs.length > 0) {
      setHasProviderDocs(true);
      const total = orderDocs.length + (order.signed_letter_url && !orderDocs.some((d) => d.file_url === order.signed_letter_url) ? 1 : 0);
      setDocCount(total);
    }
  }, [orderDocs, order.signed_letter_url]);

  const updateOrderField = useCallback(async (fields: Partial<Order>) => {
    const updated = { ...order, ...fields };
    setOrder(updated);
    onOrderUpdated({ id: order.id, ...fields });
  }, [order, onOrderUpdated]);

  const handleAssign = async () => {
    if (!assignEmail) return;
    setAssigning(true);
    setAssignMsg("");
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          doctorEmail: assignEmail,
          skipPaymentCheck: true,
        }),
      });
      const result = await res.json() as {
        ok?: boolean;
        error?: string;
        warning?: string;
        doctorName?: string;
        emailSent?: boolean;
        customerEmailSent?: boolean;
      };
      if (result.ok) {
        const dc = doctorContacts.find((d) => d.email.toLowerCase() === assignEmail.toLowerCase());
        const updates = {
          doctor_email: assignEmail,
          doctor_name: result.doctorName ?? dc?.full_name ?? null,
          doctor_status: "pending_review" as string,
        };
        updateOrderField(updates);
        if (result.emailSent) {
          setAssignMsg("Assigned — notification email sent to provider");
        } else {
          setAssignMsg("Assigned, but email delivery failed — check SMTP settings");
        }
      } else {
        setAssignMsg(result.error ?? result.warning ?? "Assignment failed");
      }
    } catch {
      setAssignMsg("Network error — please try again");
    }
    setAssigning(false);
    setTimeout(() => setAssignMsg(""), 6000);
  };

  const handleSetStatus = async (newStatus: string, newDoctorStatus?: string) => {
    setStatusUpdating(true);
    setStatusMsg("");
    const patch: Record<string, string> = {};
    if (newStatus) patch.status = newStatus;
    if (newDoctorStatus) patch.doctor_status = newDoctorStatus;
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (!error) {
      updateOrderField(patch as Partial<Order>);
      setStatusMsg("Status updated");

      // Fire status notification email for customer-facing status changes
      const statusForEmail = newStatus || order.status;
      if (statusForEmail === "under-review" || statusForEmail === "completed") {
        try {
          const token = await getAdminToken();
          fetch(`${supabaseUrl}/functions/v1/notify-order-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            // force=true for completed: ensures email fires even if patient_notification_sent_at is set
            // (covers cases where notify-patient-letter ran but email was never actually delivered)
            body: JSON.stringify({ confirmationId: order.confirmation_id, newStatus: statusForEmail, force: statusForEmail === "completed" }),
          }).catch(() => {});
        } catch {
          // Silently fail — status email is best-effort
        }
      }
    } else {
      setStatusMsg("Update failed — check RLS");
    }
    setStatusUpdating(false);
    setTimeout(() => setStatusMsg(""), 3000);
  };

  const handleGhlRefire = async () => {
    setGhlFiring(true);
    setGhlMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/backfill-order-ghl`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // apikey header is required by Supabase gateway even when verify_jwt=false
          "apikey": anonKey,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmationId: order.confirmation_id }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setGhlMsg(`Request failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
        setGhlFiring(false);
        setTimeout(() => setGhlMsg(""), 8000);
        return;
      }
      const result = await res.json() as {
        ok: boolean;
        message: string;
        phonePersisted?: string | null;
        contactUpsert?: { success: boolean; contactId: string | null; action: string };
      };
      setGhlMsg(result.message ?? (result.ok ? "GHL synced!" : "Sync failed"));
      if (result.ok) {
        updateOrderField({
          ghl_synced_at: new Date().toISOString(),
          ghl_sync_error: null,
          phone: result.phonePersisted ?? order.phone ?? null,
          ...(result.contactUpsert?.contactId ? { ghl_contact_id: result.contactUpsert.contactId } : {}),
        });
      }
    } catch {
      setGhlMsg("Network error — check console");
    }
    setGhlFiring(false);
    setTimeout(() => setGhlMsg(""), 8000);
  };

  const spawnReturningOrder = async (parentOrderId: string, action: "upgrade" | "repeat") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("Your admin session has expired. Please sign in again.");
        return;
      }
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-returning-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ parentOrderId, action }),
      });
      const result = (await res.json()) as { ok?: boolean; confirmationId?: string; error?: string };
      if (!res.ok || !result.ok || !result.confirmationId) {
        alert(`Could not start checkout: ${result.error ?? "unknown error"}`);
        return;
      }
      window.open(`/account/checkout?cid=${encodeURIComponent(result.confirmationId)}`, "_blank");
    } catch (err) {
      alert(`Could not start checkout: ${err instanceof Error ? err.message : "network error"}`);
    }
  };

  // CONSULTATION-INVITE-MANUAL — fire the seeded "consultation_window_offer"
  // template at the customer with a smart prefilled link back to
  // /consultation-request. Uses the existing send-templated-email edge
  // function (DB template + master layout + Resend + communications log).
  // 24h cooldown is a client-side soft guard: if a non-failed send exists
  // within the window, the admin sees a confirm prompt before re-sending.
  const handleSendConsultationInvite = async () => {
    if (consultInviteSending) return;
    if (!order.email) {
      setConsultInviteMsg("Customer email missing — cannot send invite.");
      setTimeout(() => setConsultInviteMsg(""), 6000);
      return;
    }

    // Cooldown soft guard — require explicit confirm if a recent send exists.
    if (consultLastSentAt) {
      const sentMs = new Date(consultLastSentAt).getTime();
      const ageMs = Date.now() - sentMs;
      if (Number.isFinite(ageMs) && ageMs < 24 * 60 * 60 * 1000) {
        const hours = Math.max(1, Math.round((24 * 60 * 60 * 1000 - ageMs) / 3_600_000));
        const ok = window.confirm(
          `A consultation invite was sent to ${order.email} within the last 24h ` +
          `(roughly ${hours}h ago). Send another one anyway?`,
        );
        if (!ok) return;
      }
    }

    setConsultInviteSending(true);
    setConsultInviteMsg("");
    try {
      const token = await getAdminToken();
      if (!token) {
        setConsultInviteMsg("Admin session expired — please sign in again.");
        setConsultInviteSending(false);
        setTimeout(() => setConsultInviteMsg(""), 8000);
        return;
      }

      // Build the smart prefilled link back to /consultation-request. The
      // page reads ?email=, ?order_id=, ?confirmation_number=, ?source=.
      const origin = (typeof window !== "undefined" && window.location?.origin)
        ? window.location.origin
        : "https://www.pawtenant.com";
      const params = new URLSearchParams();
      if (order.email) params.set("email", order.email);
      if (order.confirmation_id) params.set("confirmation_number", order.confirmation_id);
      if (order.id) params.set("order_id", order.id);
      params.set("source", "manual_recovery");
      const consultationUrl = `${origin}/consultation-request?${params.toString()}`;

      const customerName = (order.first_name ?? "").trim() || "there";
      const letterType = (order.letter_type ?? "ESA").toString().toUpperCase();

      const res = await fetch(`${supabaseUrl}/functions/v1/send-templated-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug: "consultation_window_offer",
          to: order.email,
          confirmationId: order.confirmation_id,
          vars: {
            name: customerName,
            letter_type: letterType,
            confirmation_number: order.confirmation_id ?? "",
            consultation_request_url: consultationUrl,
          },
        }),
      });
      const result = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        to?: string;
        error?: string;
      };

      if (res.ok && result.ok) {
        const sentAt = new Date().toISOString();
        setConsultLastSentAt(sentAt);
        const successText = `Consultation invite sent to ${result.to ?? order.email}`;
        setConsultInviteMsg(successText);
        // Mirror into orders.email_log for legacy timeline consumers. The
        // primary activity log already lives in `communications` (written
        // by send-templated-email). This is best-effort — failure is a
        // no-op so the admin still sees the success state.
        try {
          const existing = (order.email_log ?? []) as EmailLogEntry[];
          const next: EmailLogEntry[] = [
            ...existing,
            {
              type: "templated_consultation_window_offer",
              sentAt,
              to: result.to ?? order.email,
              success: true,
            },
          ];
          updateOrderField({ email_log: next });
        } catch { /* noop */ }
      } else {
        const errText = result.error ?? "Send failed — check edge function logs";
        setConsultInviteMsg(errText);
      }
    } catch (err) {
      setConsultInviteMsg(`Network error — ${err instanceof Error ? err.message : "please try again"}`);
    }
    setConsultInviteSending(false);
    setTimeout(() => setConsultInviteMsg(""), 8000);
  };

  const handleResendEmail = async () => {
    if (!order.signed_letter_url && docCount === 0) {
      setEmailMsg("No provider documents yet — provider must submit a letter first");
      setTimeout(() => setEmailMsg(""), 4000);
      return;
    }
    setEmailSending(true);
    setEmailMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-patient-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id, doctorMessage: doctorMessage.trim() || null }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      setEmailMsg(result.ok ? "Email sent to patient!" : (result.error ?? "Send failed"));
      if (result.ok) {
        updateOrderField({ patient_notification_sent_at: new Date().toISOString() });
      }
    } catch {
      setEmailMsg("Network error");
    }
    setEmailSending(false);
    setTimeout(() => setEmailMsg(""), 5000);
  };

  const handleSendDiscountEmail = async () => {
    setDiscountSending(true);
    setDiscountMsg("");
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          email: order.email,
          firstName: order.first_name ?? "",
          price: order.price,
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) {
        setDiscountMsg(`Discount/recovery email sent to ${order.email}`);
        // Refresh email log
        const { data: fresh } = await supabase.from("orders").select("email_log").eq("id", order.id).maybeSingle();
        if (fresh?.email_log) updateOrderField({ email_log: fresh.email_log as EmailLogEntry[] });
      } else {
        setDiscountMsg(result.error ?? "Send failed — check edge function logs");
      }
    } catch {
      setDiscountMsg("Network error — please try again");
    }
    setDiscountSending(false);
    setTimeout(() => setDiscountMsg(""), 6000);
  };

  const handleResendConfirmation = async () => {
    setConfirmResending(true);
    setConfirmResendMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/resend-confirmation-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id }),
      });
      const result = await res.json() as { ok?: boolean; emailSent?: boolean; error?: string; to?: string };
      if (result.ok && result.emailSent) {
        setConfirmResendMsg(`Confirmation email sent to ${result.to ?? order.email}`);
        // Refresh email log from DB
        const { data: updated } = await supabase
          .from("orders")
          .select("email_log")
          .eq("id", order.id)
          .maybeSingle();
        if (updated?.email_log) {
          updateOrderField({ email_log: updated.email_log as EmailLogEntry[] });
        }
      } else {
        setConfirmResendMsg(result.error ?? "Send failed — check SMTP config");
      }
    } catch {
      setConfirmResendMsg("Network error");
    }
    setConfirmResending(false);
    setTimeout(() => setConfirmResendMsg(""), 6000);
  };

  // Send the customer a branded reset/welcome link via the Resend-backed
  // edge function (bypasses Supabase /recover, which has been failing with
  // unexpected_failure on the SMTP layer).
  const handleSendPortalReset = async () => {
    if (!order.email) return;
    setPortalResetSending(true);
    setPortalResetMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/send-customer-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: order.email,
          first_name: order.first_name ?? "",
          action: "reset",
        }),
      });
      const result = await res.json() as { ok?: boolean; message?: string; error?: string; email_sent?: boolean };
      if (result.ok) {
        setPortalResetMsg(
          result.email_sent
            ? `Portal reset email sent to ${order.email}`
            : (result.message ?? `Reset link generated — email delivery may have failed`),
        );
      } else {
        setPortalResetMsg(result.error ?? "Failed to send portal reset");
      }
    } catch {
      setPortalResetMsg("Network error — please try again");
    }
    setPortalResetSending(false);
    setTimeout(() => setPortalResetMsg(""), 8000);
  };

  const loadOrderDocs = useCallback(async () => {
    setLoadingDocs(true);
    const { data } = await supabase
      .from("order_documents")
      .select("*")
      .eq("order_id", order.id)
      .order("uploaded_at", { ascending: true });
    setOrderDocs((data as OrderDocument[]) ?? []);
    setLoadingDocs(false);
  }, [order.id]);

  useEffect(() => {
    if (section === "documents") {
      loadOrderDocs();
    }
  }, [section, loadOrderDocs]);

  const handleAddDoc = async () => {
    if (!addDocForm.url.trim() || !addDocForm.label.trim()) {
      setAddDocMsg("URL and label are required.");
      setTimeout(() => setAddDocMsg(""), 3000);
      return;
    }
    setSavingDoc(true);
    const { error } = await supabase.from("order_documents").insert({
      order_id: order.id,
      confirmation_id: order.confirmation_id,
      label: addDocForm.label.trim(),
      doc_type: addDocForm.docType,
      file_url: addDocForm.url.trim(),
      notes: addDocForm.notes.trim() || null,
      uploaded_by: adminProfile.full_name,
      sent_to_customer: false,
      customer_visible: true,
    });
    setSavingDoc(false);
    if (!error) {
      setAddDocMsg("Document saved! It is now visible in the customer portal.");
      setAddDocForm({ url: "", label: "", docType: "other", notes: "" });
      setShowAddDocForm(false);
      loadOrderDocs();
    } else {
      setAddDocMsg(`Save failed: ${error.message}`);
    }
    setTimeout(() => setAddDocMsg(""), 5000);
  };

  const handleSendAllToCustomer = async () => {
    setSendingAll(true);
    setSendAllMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-patient-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id, doctorMessage: doctorMessage.trim() || null }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; docsEmailed?: number };
      setSendAllMsg(result.ok
        ? `Email sent! ${result.docsEmailed ?? 0} document(s) delivered to ${order.email}`
        : (result.error ?? "Send failed"));
      if (result.ok) {
        loadOrderDocs();
        updateOrderField({ patient_notification_sent_at: new Date().toISOString() });
      }
    } catch {
      setSendAllMsg("Network error");
    }
    setSendingAll(false);
    setTimeout(() => setSendAllMsg(""), 6000);
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!canDelete(adminProfile.role)) {
      return;
    }
    await supabase.from("order_documents").delete().eq("id", docId);
    loadOrderDocs();
  };

  const handleFixPayment = async () => {
    const trimmed = stripeIdInput.trim();
    if (!trimmed) return;

    // OPS-ORDER-PAYMENT-RELINK-DELETE-FK: validate prefix client-side. The Stripe
    // dashboard exposes both `pi_...` (PaymentIntent) and `ch_...` (Charge) IDs;
    // anything else is a typo and should not hit the edge function.
    const isCharge = trimmed.startsWith("ch_");
    const isPaymentIntent = trimmed.startsWith("pi_");
    if (!isCharge && !isPaymentIntent) {
      setPaymentSyncMsg(
        "Invalid Stripe ID — must start with pi_ (PaymentIntent) or ch_ (Charge).",
      );
      setPaymentSyncOk(false);
      setTimeout(() => setPaymentSyncMsg(""), 12000);
      return;
    }

    setPaymentSyncing(true);
    setPaymentSyncMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/fix-order-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          ...(isCharge ? { stripeChargeId: trimmed } : { stripePaymentIntentId: trimmed }),
        }),
      });
      const result = await res.json() as {
        ok?: boolean;
        message?: string;
        error?: string;
        paymentIntentId?: string;
        priceUpdated?: number;
        alreadySynced?: boolean;
        emailsTriggered?: boolean;
        // OPS-ORDER-PAYMENT-RELINK-DELETE-FK: edge function may return this when the
        // Stripe payment is already linked to a different order. We surface a clear
        // admin message instead of silently duplicating the linkage.
        alreadyLinkedToOrder?: { id: string; confirmation_id: string };
        resolvedPiId?: string;
      };
      if (result.ok) {
        const emailNote = result.emailsTriggered
          ? " Confirmation email sent to customer + internal notification triggered."
          : " Emails were already sent previously — no duplicates sent.";
        setPaymentSyncMsg((result.message ?? "Payment synced!") + emailNote);
        setPaymentSyncOk(true);
        if (result.paymentIntentId) {
          updateOrderField({
            payment_intent_id: result.paymentIntentId,
            price: result.priceUpdated ?? order.price,
            status: "processing",
            paid_at: new Date().toISOString(),
          });
        }
        setStripeIdInput("");
        // Refresh email log so the Emails Sent section updates
        try {
          const { data: fresh } = await supabase.from("orders").select("email_log").eq("id", order.id).maybeSingle();
          if (fresh?.email_log) updateOrderField({ email_log: fresh.email_log as EmailLogEntry[] });
        } catch { /* non-critical */ }
      } else if (result.alreadyLinkedToOrder) {
        const otherCid = result.alreadyLinkedToOrder.confirmation_id;
        setPaymentSyncMsg(
          `This Stripe payment${result.resolvedPiId ? ` (${result.resolvedPiId})` : ""} is already linked to order ${otherCid}. ` +
          "Refusing to duplicate. Resolve the original order first (refund, cancel, or unlink) before linking this payment elsewhere.",
        );
        setPaymentSyncOk(false);
      } else {
        setPaymentSyncMsg(result.error ?? "Sync failed — check Stripe ID and try again");
        setPaymentSyncOk(false);
      }
    } catch {
      setPaymentSyncMsg("Network error — please try again");
    }
    setPaymentSyncing(false);
    setTimeout(() => setPaymentSyncMsg(""), 12000);
  };

  const handleMarkAsPaid = async () => {
    setMarkingPaid(true);
    setMarkPaidMsg("");
    const paidAt = new Date().toISOString();
    const { error } = await supabase.from("orders").update({
      status: "processing",
      paid_at: paidAt,
    }).eq("id", order.id);
    if (!error) {
      // Write audit log
      try {
        await supabase.from("audit_logs").insert({
          action: "manual_mark_paid",
          entity_type: "order",
          entity_id: order.id,
          performed_by: adminProfile.user_id,
          details: {
            confirmation_id: order.confirmation_id,
            previous_status: order.status,
            new_status: "processing",
            note: "Admin manually marked as paid (no Stripe ID available)",
            admin_name: adminProfile.full_name,
            timestamp: paidAt,
          },
        });
      } catch { /* non-critical */ }
      // Write order status log
      try {
        await supabase.from("order_status_logs").insert({
          order_id: order.id,
          status: "processing",
          note: `[MANUAL OVERRIDE] Marked as paid by admin (${adminProfile.full_name}). No Stripe PI attached.`,
          created_at: paidAt,
        });
      } catch { /* non-critical */ }
      updateOrderField({ status: "processing", paid_at: paidAt });
      setMarkPaidMsg("Order marked as paid — status updated to Processing. Assign a provider when ready.");
      setShowMarkPaidConfirm(false);
    } else {
      setMarkPaidMsg(`Failed: ${error.message}`);
    }
    setMarkingPaid(false);
    setTimeout(() => setMarkPaidMsg(""), 8000);
  };

  const [markingUnpaid, setMarkingUnpaid] = useState(false);
  const [markUnpaidMsg, setMarkUnpaidMsg] = useState("");
  const [showMarkUnpaidConfirm, setShowMarkUnpaidConfirm] = useState(false);

  // ── Resend Stripe Webhook state ──
  const [resendingWebhook, setResendingWebhook] = useState(false);
  const [resendWebhookMsg, setResendWebhookMsg] = useState("");
  const [resendWebhookOk, setResendWebhookOk] = useState<boolean | null>(null);

  const handleMarkAsUnpaid = async () => {
    setMarkingUnpaid(true);
    setMarkUnpaidMsg("");
    const ts = new Date().toISOString();
    const { error } = await supabase.from("orders").update({
      status: "lead",
      payment_intent_id: null,
      paid_at: null,
      payment_failed_at: ts,
      payment_failure_reason: `Manually marked as unpaid/failed by admin (${adminProfile.full_name})`,
    }).eq("id", order.id);
    if (!error) {
      try {
        await supabase.from("audit_logs").insert({
          action: "manual_mark_unpaid",
          entity_type: "order",
          entity_id: order.id,
          performed_by: adminProfile.user_id,
          details: {
            confirmation_id: order.confirmation_id,
            previous_status: order.status,
            previous_pi: order.payment_intent_id,
            admin_name: adminProfile.full_name,
            timestamp: ts,
          },
        });
      } catch { /* non-critical */ }
      try {
        await supabase.from("order_status_logs").insert({
          order_id: order.id,
          status: "lead",
          note: `[MANUAL OVERRIDE] Marked as unpaid/failed by admin (${adminProfile.full_name}). PI cleared.`,
          created_at: ts,
        });
      } catch { /* non-critical */ }
      updateOrderField({ status: "lead", payment_intent_id: null, paid_at: null });
      setShowMarkUnpaidConfirm(false);
      setMarkUnpaidMsg("Order reverted to unpaid/lead status. Payment intent cleared.");
    } else {
      setMarkUnpaidMsg(`Failed: ${error.message}`);
    }
    setMarkingUnpaid(false);
    setTimeout(() => setMarkUnpaidMsg(""), 8000);
  };

  const handleResendWebhook = async () => {
    if (!order.payment_intent_id) return;
    setResendingWebhook(true);
    setResendWebhookMsg("");
    setResendWebhookOk(null);
    try {
      const token = await getAdminToken();
      // Use fix-order-payment to re-sync the Stripe payment intent and backfill checkout_session_id
      const res = await fetch(`${supabaseUrl}/functions/v1/fix-order-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          stripePaymentIntentId: order.payment_intent_id,
        }),
      });
      const result = await res.json() as { ok?: boolean; message?: string; error?: string; checkoutSessionId?: string; paymentIntentId?: string; priceUpdated?: number; alreadySynced?: boolean; emailsTriggered?: boolean };
      if (result.ok) {
        const note = result.alreadySynced ? " (already synced — no changes needed)" : "";
        setResendWebhookMsg((result.message ?? "Payment re-synced successfully.") + note);
        setResendWebhookOk(true);
        if (result.checkoutSessionId) {
          updateOrderField({ checkout_session_id: result.checkoutSessionId });
        }
        // Refresh email log + checkout_session_id from DB
        try {
          const { data: fresh } = await supabase.from("orders").select("email_log, checkout_session_id").eq("id", order.id).maybeSingle();
          if (fresh) {
            const patch: Partial<Order> = {};
            if (fresh.email_log) patch.email_log = fresh.email_log as EmailLogEntry[];
            if (fresh.checkout_session_id) patch.checkout_session_id = fresh.checkout_session_id as string;
            if (Object.keys(patch).length > 0) updateOrderField(patch);
          }
        } catch { /* non-critical */ }
      } else {
        setResendWebhookMsg(result.error ?? "Re-sync failed — check Stripe ID and try again");
        setResendWebhookOk(false);
      }
    } catch {
      setResendWebhookMsg("Network error — please try again");
      setResendWebhookOk(false);
    }
    setResendingWebhook(false);
    setTimeout(() => { setResendWebhookMsg(""); setResendWebhookOk(null); }, 12000);
  };

  const handleCancelOrder = async () => {
    setCancellingOrder(true);
    setCancelMsg("");
    try {
      const token = await getAdminToken();

      // If refund requested, process it first
      let refundAmount: number | undefined;
      let refundSkipped = false;
      let refundSkipReason = "";
      if (cancelWithRefund && order.payment_intent_id) {
        const refundRes = await fetch(`${supabaseUrl}/functions/v1/create-refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            // Pass paymentIntentId — the edge function resolves the charge automatically
            paymentIntentId: order.payment_intent_id,
            reason: "requested_by_customer",
            note: cancelNote.trim() || "Order cancelled by admin",
            confirmationId: order.confirmation_id,
          }),
        });
        const refundData = await refundRes.json() as { ok: boolean; error?: string; refund?: { amount: number }; refundAmountDollars?: number };
        if (!refundData.ok) {
          const errMsg = refundData.error ?? "Unknown error";
          // If it's a test/live mode mismatch, skip the refund but still cancel the order
          const isModeMismatch = errMsg.toLowerCase().includes("test mode") || errMsg.toLowerCase().includes("live mode");
          if (isModeMismatch) {
            refundSkipped = true;
            refundSkipReason = "Payment was made in test mode — Stripe refund skipped. Order will be cancelled without a refund.";
          } else {
            setCancelMsg(`Refund failed: ${errMsg}. Order not cancelled.`);
            setCancellingOrder(false);
            return;
          }
        } else {
          refundAmount = refundData.refundAmountDollars ?? (refundData.refund ? refundData.refund.amount / 100 : undefined);
        }
      }

      // Update order status to cancelled
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id);

      if (error) {
        setCancelMsg(`Failed to update order status: ${error.message}`);
        setCancellingOrder(false);
        return;
      }

      // Send cancellation email notification (best-effort)
      try {
        fetch(`${supabaseUrl}/functions/v1/notify-order-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            confirmationId: order.confirmation_id,
            newStatus: "cancelled",
            refunded: cancelWithRefund && !!order.payment_intent_id,
            refundAmount,
            cancelNote: cancelNote.trim() || undefined,
          }),
        }).catch(() => {});
      } catch {
        // Email is best-effort
      }

      // ── Fire GHL with Cancelled + Closed tags (fire-and-forget) ──────────
      try {
        fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            event: "order_cancelled",
            email: order.email,
            firstName: order.first_name ?? "",
            lastName: order.last_name ?? "",
            phone: order.phone ?? "",
            confirmationId: order.confirmation_id,
            letterType: order.letter_type ?? "",
            addonServices: order.addon_services ?? [],
            price: order.price ?? 0,
            tags: ["Cancelled", "Closed"],
            leadStatus: "Cancelled — Order Closed",
          }),
        }).catch(() => {});
      } catch {
        // GHL is best-effort
      }

      updateOrderField({ status: "cancelled" });
      setShowCancelConfirm(false);
      onOrderUpdated({ id: order.id, status: "cancelled" });
      let refundNote = "";
      if (refundSkipped) {
        refundNote = ` — Note: ${refundSkipReason}`;
      } else if (cancelWithRefund && order.payment_intent_id) {
        refundNote = refundAmount ? ` — $${refundAmount.toFixed(2)} refunded` : " — full refund issued";
      }
      setCancelMsg(`Order cancelled successfully${refundNote}. Customer notified by email.`);

      // ── Refresh email log so the cancellation email entry appears immediately ──
      try {
        const { data: fresh } = await supabase
          .from("orders")
          .select("email_log")
          .eq("id", order.id)
          .maybeSingle();
        if (fresh?.email_log) {
          updateOrderField({ email_log: fresh.email_log as EmailLogEntry[] });
        }
      } catch {
        // Non-critical — email log will refresh next time the Emails tab is opened
      }
    } catch {
      setCancelMsg("Unexpected error — please try again.");
    }
    setCancellingOrder(false);
    setTimeout(() => setCancelMsg(""), 8000);
  };

  // OPS-ORDER-ARCHIVE-VOID-FLOW: safer alternative to hard delete for real
  // operational orders (duplicate, rejected, abandoned, replaced). Keeps all
  // child rows intact (notes, comms, payment history, status logs) and only
  // updates orders.status to "archived". Resubmission unblock is handled
  // server-side in get-resume-order, which now ignores archived rows when
  // checking for an existing email.
  //
  // Side-effects intentionally avoided: no Stripe refund, no provider
  // assignment change, no customer email, no GHL fire. Pure DB state change
  // plus an audit/status log entry.
  const handleArchiveOrder = async () => {
    if (!canDelete(adminProfile.role)) {
      setArchiveMsg("Admin access required to archive/void orders.");
      return;
    }
    setArchivingOrder(true);
    setArchiveMsg("");
    const ts = new Date().toISOString();
    const reasonLabel = archiveReason || "Other";
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "archived" })
        .eq("id", order.id);
      if (error) {
        setArchiveMsg(`Archive failed: ${error.message}`);
        setArchivingOrder(false);
        return;
      }
      // Best-effort audit + status log writes. Both tables are write-only here
      // and unrelated to fulfillment, so failures should not block the archive.
      try {
        await supabase.from("order_status_logs").insert({
          order_id: order.id,
          status: "archived",
          note: `[ARCHIVE/VOID] Reason: ${reasonLabel}. Archived by admin (${adminProfile.full_name}). Previous status: ${order.status}.`,
          created_at: ts,
        });
      } catch { /* non-critical */ }
      try {
        await supabase.from("audit_logs").insert({
          action: "archive_order",
          entity_type: "order",
          entity_id: order.id,
          performed_by: adminProfile.user_id,
          details: {
            confirmation_id: order.confirmation_id,
            previous_status: order.status,
            archive_reason: reasonLabel,
            admin_name: adminProfile.full_name,
            timestamp: ts,
          },
        });
      } catch { /* non-critical */ }
      updateOrderField({ status: "archived" });
      onOrderUpdated({ id: order.id, status: "archived" });
      setShowArchiveConfirm(false);
      setArchiveReason("");
      setArchiveMsg("Order archived/voided. History preserved. Customer can resubmit with the same email.");
    } catch (err) {
      setArchiveMsg(err instanceof Error ? `Archive failed: ${err.message}` : "Archive failed: unexpected error");
    }
    setArchivingOrder(false);
    setTimeout(() => setArchiveMsg(""), 10000);
  };

  // OPS-ORDER-ARCHIVE-RESTORE: safety undo for accidental archive/void.
  // Restores orders.status to a sensible active state based on payment.
  // No Stripe, no email, no provider change, no GHL — pure DB state revert
  // plus a paired audit/status log entry.
  //
  // Status decision (kept minimal and conventional, mirroring handleMarkAsPaid /
  // handleMarkAsUnpaid in this same file):
  //   - has payment_intent_id OR paid_at → "processing"
  //     (matches handleMarkAsPaid which sets paid orders to "processing"; provider
  //      assignment / under-review transitions are owned by the assign-doctor flow,
  //      not by status restores. Restoring to "under-review" would imply a provider
  //      is engaged, which may not be true after an archive round-trip.)
  //   - otherwise → "lead"
  //     (matches handleMarkAsUnpaid which uses "lead" for unpaid orders.)
  const handleRestoreOrder = async () => {
    if (!canDelete(adminProfile.role)) {
      setRestoreMsg("Admin access required to restore orders.");
      return;
    }
    setRestoringOrder(true);
    setRestoreMsg("");
    const ts = new Date().toISOString();
    const isPaid = !!order.payment_intent_id || !!order.paid_at;
    const newStatus = isPaid ? "processing" : "lead";
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", order.id);
      if (error) {
        setRestoreMsg(`Restore failed: ${error.message}`);
        setRestoringOrder(false);
        return;
      }
      // Best-effort log writes — same pattern as handleArchiveOrder.
      try {
        await supabase.from("order_status_logs").insert({
          order_id: order.id,
          status: newStatus,
          note: `[RESTORE/REOPEN] Restored from archived by admin (${adminProfile.full_name}). New status: ${newStatus}.`,
          created_at: ts,
        });
      } catch { /* non-critical */ }
      try {
        await supabase.from("audit_logs").insert({
          action: "restore_order",
          entity_type: "order",
          entity_id: order.id,
          performed_by: adminProfile.user_id,
          details: {
            confirmation_id: order.confirmation_id,
            previous_status: "archived",
            new_status: newStatus,
            paid_at_restore: isPaid,
            admin_name: adminProfile.full_name,
            timestamp: ts,
          },
        });
      } catch { /* non-critical */ }
      updateOrderField({ status: newStatus });
      onOrderUpdated({ id: order.id, status: newStatus });
      setShowRestoreConfirm(false);
      setRestoreMsg(
        `Order restored to "${newStatus}". It is active again and may once more block same-email resubmission.`
      );
    } catch (err) {
      setRestoreMsg(err instanceof Error ? `Restore failed: ${err.message}` : "Restore failed: unexpected error");
    }
    setRestoringOrder(false);
    setTimeout(() => setRestoreMsg(""), 10000);
  };

  const handleDeleteOrder = async () => {
    if (!canDelete(adminProfile.role)) {
      setDeleteOrderMsg("Admin access required to permanently delete orders.");
      return;
    }
    setDeletingOrder(true);
    setDeleteOrderMsg("");
    try {
      // Clean up ALL related records first — must be in dependency order to avoid FK violations.
      // OPS-ORDER-PAYMENT-RELINK-DELETE-FK: capture child-delete errors instead of swallowing
      // them. Supabase returns errors as `{ error }` rather than throwing, so the prior
      // empty try/catch silently let RLS/permission failures pass through and the parent
      // delete then surfaced a vague raw FK error.
      const cleanups: Array<{ table: string; run: () => Promise<{ error?: { message: string } | null }> }> = [
        { table: "communications",      run: () => supabase.from("communications").delete().eq("order_id", order.id) },
        { table: "doctor_earnings",     run: () => supabase.from("doctor_earnings").delete().eq("order_id", order.id) },
        { table: "order_documents",     run: () => supabase.from("order_documents").delete().eq("order_id", order.id) },
        { table: "doctor_notes",        run: () => supabase.from("doctor_notes").delete().eq("order_id", order.id) },
        { table: "order_status_logs",   run: () => supabase.from("order_status_logs").delete().eq("order_id", order.id) },
        { table: "doctor_notifications",run: () => supabase.from("doctor_notifications").delete().eq("order_id", order.id) },
        { table: "shared_order_notes",  run: () => supabase.from("shared_order_notes").delete().eq("order_id", order.id) },
        { table: "letter_verifications",run: () => supabase.from("letter_verifications").delete().eq("order_id", order.id) },
        { table: "meta_events",         run: () => supabase.from("meta_events").delete().eq("order_id", order.id) },
        { table: "audit_logs",          run: () => supabase.from("audit_logs").delete().eq("object_id", order.confirmation_id) },
      ];

      const failedCleanups: string[] = [];
      for (const c of cleanups) {
        try {
          const res = await c.run();
          if (res?.error) {
            console.warn(`[deleteOrder] ${c.table} cleanup failed:`, res.error);
            failedCleanups.push(c.table);
          }
        } catch (err) {
          console.warn(`[deleteOrder] ${c.table} cleanup threw:`, err);
          failedCleanups.push(c.table);
        }
      }

      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) {
        // Pull the offending child table out of the FK constraint message so the admin
        // sees something actionable instead of a raw Postgres error. Common shape:
        //   `... violates foreign key constraint "x_y_fkey" on table "child_table"`
        const fkMatch = error.message.match(/on table "([^"]+)"/i);
        const blockingTable = fkMatch?.[1];
        if (blockingTable) {
          setDeleteOrderMsg(
            `Delete blocked by related records in "${blockingTable}". ` +
            (failedCleanups.length > 0
              ? `Cleanup also failed on: ${failedCleanups.join(", ")}. `
              : "") +
            "This is not a payment-status problem — extend the admin cleanup list or escalate.",
          );
        } else if (failedCleanups.length > 0) {
          setDeleteOrderMsg(
            `Delete failed: ${error.message}. Cleanup failed earlier on: ${failedCleanups.join(", ")}.`,
          );
        } else {
          setDeleteOrderMsg(`Delete failed: ${error.message}`);
        }
        setDeletingOrder(false);
        return;
      }

      // Check if this was the customer's only order — if so, delete their auth account too
      const { count: remainingOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .ilike("email", order.email);

      if ((remainingOrders ?? 0) === 0) {
        // No more orders for this email — delete auth account + write HIPAA audit log
        try {
          const token = await getAdminToken();
          const customerName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
          const delRes = await fetch(`${supabaseUrl}/functions/v1/delete-auth-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              email: order.email,
              entityType: "customer",
              entityName: `${customerName} (${order.email})`,
              reason: `Customer's last order (${order.confirmation_id}) deleted by admin. No remaining orders.`,
            }),
          });
          if (!delRes.ok) {
            const errBody = await delRes.json().catch(() => ({})) as { error?: string };
            console.error("[OrderDetailModal] delete-auth-user failed:", delRes.status, errBody?.error);
          }
        } catch (e) {
          console.error("[OrderDetailModal] delete-auth-user network error:", e);
        }
      }

      // Notify parent then close
      onOrderDeleted?.(order.id);
      onClose();
    } catch {
      setDeleteOrderMsg("Unexpected error — please try again.");
      setDeletingOrder(false);
    }
  };

  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
  const initials = fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const assessmentCount = order.assessment_answers ? Object.keys(order.assessment_answers).length : 0;

  // Filter doctors: active only + licensed in the order's state
  const orderStateCode = order.state ?? "";
  const orderStateName = US_STATES_MAP[orderStateCode] ?? orderStateCode ?? "";
  const eligibleDoctors = doctorContacts.filter((d) =>
    isProviderEligibleForState(d, orderStateCode)
  );

  // ── Remove Provider / Mark Unassigned state ──
  const [removingProvider, setRemovingProvider] = useState(false);
  const [removeProviderMsg, setRemoveProviderMsg] = useState("");
  const [showRemoveProviderConfirm, setShowRemoveProviderConfirm] = useState(false);

  // Resend provider email state
  const [resendingProvider, setResendingProvider] = useState(false);
  const [resendProviderMsg, setResendProviderMsg] = useState("");
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [showThirtyDayConfirm, setShowThirtyDayConfirm] = useState(false);
  const [thirtyDayLoading, setThirtyDayLoading] = useState(false);
  const [thirtyDayMsg, setThirtyDayMsg] = useState("");

  // ── Re-inject footer state ──
  const [reinjectingFooter, setReinjectingFooter] = useState(false);
  const [reinjectFooterMsg, setReinjectFooterMsg] = useState("");
  const [showDeleteOrderConfirm, setShowDeleteOrderConfirm] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [deleteOrderMsg, setDeleteOrderMsg] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // OPS-ORDER-ARCHIVE-VOID-FLOW: state for the safer archive/void flow.
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivingOrder, setArchivingOrder] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState("");
  const [archiveReason, setArchiveReason] = useState<string>("");

  // OPS-ORDER-ARCHIVE-RESTORE: state for the restore/reopen safety undo.
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoringOrder, setRestoringOrder] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  // ── Cancel Order state ──
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelWithRefund, setCancelWithRefund] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");

  // ── Role restriction state ──
  const isFinanceRole = adminProfile.role === "finance";
  const isSupportRole = adminProfile.role === "support";
  // Only owner / admin_manager may permanently delete orders / documents / remove providers.
  const canPerformDelete = canDelete(adminProfile.role);
  const [showRefundApproval, setShowRefundApproval] = useState(false);
  const [showDeleteApproval, setShowDeleteApproval] = useState(false);

  // States requiring 30-day official letter reissue
  const THIRTY_DAY_STATES = ["CA", "AR", "IA", "LA", "MT"];
  const isThirtyDayState = THIRTY_DAY_STATES.includes(order.state ?? "");
  const isCompletedOrder = order.status === "completed" && order.doctor_status === "patient_notified";

  const handleThirtyDayReissue = async () => {
    setThirtyDayLoading(true);
    setThirtyDayMsg("");
    const patch = {
      doctor_status: "thirty_day_reissue",
      status: "under-review",
    };
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (!error) {
      updateOrderField(patch as Partial<Order>);
      setShowThirtyDayConfirm(false);

      // 1 — In-portal push notification
      if (order.doctor_user_id) {
        await supabase.from("doctor_notifications").insert({
          doctor_user_id: order.doctor_user_id,
          title: "30-Day Period Completed",
          message: `Order ${order.confirmation_id}: The 30-day evaluation period is complete. Please issue the official letter for this patient.`,
          type: "thirty_day_reminder",
          confirmation_id: order.confirmation_id,
          order_id: order.id,
        });
      }

      // 2 — Email notification via edge function
      let emailSent = false;
      try {
        const token = await getAdminToken();
        const res = await fetch(`${supabaseUrl}/functions/v1/notify-thirty-day-reissue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ confirmationId: order.confirmation_id }),
        });
        const result = await res.json() as { ok?: boolean; emailSent?: boolean };
        emailSent = !!(result.ok && result.emailSent);
      } catch {
        // Email is best-effort — don't block the UI update
      }

      setThirtyDayMsg(
        emailSent
          ? "Order moved to 30-Day Reissue. Provider notified by email + portal."
          : "Order moved to 30-Day Reissue. Portal notification sent (email may have failed — check RESEND_API_KEY).",
      );
    } else {
      setThirtyDayMsg("Update failed — check permissions");
    }
    setThirtyDayLoading(false);
    setTimeout(() => setThirtyDayMsg(""), 8000);
  };

  // ── Re-inject / Generate + inject verification footer ────────────────────
  // If order has no letter_id: calls repair-order-letter-id which generates ID,
  // creates letter_verifications row, saves to orders, and stamps all docs.
  // If order already has letter_id: calls inject-pdf-footer directly on the doc.
  const handleReinjectFooter = async (doc: OrderDocument) => {
    setReinjectingFooter(true);
    setReinjectFooterMsg("");
    try {
      const token = await getAdminToken();

      // ── PATH A: No letter_id yet — generate ID + inject via repair function ──
      if (!order.letter_id) {
        const res = await fetch(`${supabaseUrl}/functions/v1/repair-order-letter-id`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ confirmationId: order.confirmation_id }),
        });
        const result = await res.json() as {
          ok?: boolean;
          error?: string;
          letterId?: string;
          documentsProcessed?: number;
          errors?: string[];
          message?: string;
        };
        if (result.ok && result.letterId) {
          setReinjectFooterMsg(
            `Verification ID generated (${result.letterId}) and stamped into ${result.documentsProcessed ?? 0} document(s)`
          );
          // Refresh local order state so VerificationIdRow appears immediately
          updateOrderField({ letter_id: result.letterId });
          loadOrderDocs();
        } else {
          setReinjectFooterMsg(result.error ?? result.message ?? "ID generation failed — check edge function logs");
        }
        setReinjectingFooter(false);
        setTimeout(() => setReinjectFooterMsg(""), 8000);
        return;
      }

      // ── PATH B: letter_id already exists — re-inject footer into this doc ──
      const res = await fetch(`${supabaseUrl}/functions/v1/inject-pdf-footer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          confirmationId: order.confirmation_id,
          documentId: doc.id,
          fileUrl: doc.file_url,
          letterId: order.letter_id,
          forceReInject: true,
        }),
      });
      const result = await res.json() as {
        ok?: boolean;
        error?: string;
        processedUrl?: string;
        injected?: boolean;
        reused?: boolean;
      };
      if (result.ok) {
        setReinjectFooterMsg(result.reused ? "Footer already present — no changes needed" : "Footer re-injected successfully!");
        loadOrderDocs();
      } else {
        setReinjectFooterMsg(result.error ?? "Re-injection failed");
      }
    } catch {
      setReinjectFooterMsg("Network error — please try again");
    }
    setReinjectingFooter(false);
    setTimeout(() => setReinjectFooterMsg(""), 8000);
  };

  // Email log state
  const [emailLogLoading, setEmailLogLoading] = useState(false);

  // ── Document visibility toggle ──
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null);

  const handleToggleVisibility = async (doc: OrderDocument) => {
    setTogglingVisibility(doc.id);
    const newVisibility = !doc.customer_visible;
    const { error } = await supabase
      .from("order_documents")
      .update({ customer_visible: newVisibility })
      .eq("id", doc.id);
    if (!error) {
      setOrderDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, customer_visible: newVisibility } : d));
    }
    setTogglingVisibility(null);
  };

  // ── Notify Patient (inline in Documents tab) ──
  const [notifyingPatient, setNotifyingPatient] = useState(false);
  const [notifyPatientMsg, setNotifyPatientMsg] = useState("");
  const [notifyPatientOk, setNotifyPatientOk] = useState<boolean | null>(null);

  // ── Test Email (Documents tab) ──
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailMsg, setTestEmailMsg] = useState("");
  const [testEmailOk, setTestEmailOk] = useState<boolean | null>(null);
  const [testEmailResendId, setTestEmailResendId] = useState<string | null>(null);

  const handleSendTestEmail = async () => {
    setSendingTestEmail(true);
    setTestEmailMsg("");
    setTestEmailOk(null);
    setTestEmailResendId(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-patient-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          doctorMessage: doctorMessage.trim() || null,
          testMode: true,
        }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; docsEmailed?: number; resendId?: string; messageId?: string };
      if (result.ok) {
        setTestEmailMsg(`Test email sent to ${order.email} — ${result.docsEmailed ?? 0} doc(s) included`);
        setTestEmailOk(true);
        const rid = result.resendId ?? result.messageId ?? null;
        setTestEmailResendId(rid);
      } else {
        setTestEmailMsg(result.error ?? "Test send failed — check edge function logs");
        setTestEmailOk(false);
      }
    } catch {
      setTestEmailMsg("Network error — please try again");
      setTestEmailOk(false);
    }
    setSendingTestEmail(false);
    setTimeout(() => { setTestEmailMsg(""); setTestEmailOk(null); setTestEmailResendId(null); }, 15000);
  };

  const handleNotifyPatientFromDocs = async () => {
    setNotifyingPatient(true);
    setNotifyPatientMsg("");
    setNotifyPatientOk(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-patient-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id, doctorMessage: doctorMessage.trim() || null }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; docsEmailed?: number };
      if (result.ok) {
        setNotifyPatientMsg(`Patient notified! ${result.docsEmailed ?? 0} document(s) sent to ${order.email}`);
        setNotifyPatientOk(true);
        updateOrderField({ patient_notification_sent_at: new Date().toISOString() });
        loadOrderDocs();
      } else {
        setNotifyPatientMsg(result.error ?? "Send failed — check edge function logs");
        setNotifyPatientOk(false);
      }
    } catch {
      setNotifyPatientMsg("Network error — please try again");
      setNotifyPatientOk(false);
    }
    setNotifyingPatient(false);
    setTimeout(() => { setNotifyPatientMsg(""); setNotifyPatientOk(null); }, 8000);
  };

  const handleRemoveProvider = async () => {
    setRemovingProvider(true);
    setRemoveProviderMsg("");
    const ts = new Date().toISOString();
    const { error } = await supabase
      .from("orders")
      .update({
        doctor_user_id: null,
        doctor_email: null,
        doctor_name: null,
        doctor_status: "unassigned",
        status: "processing",
      })
      .eq("id", order.id);

    if (!error) {
      // Log the action
      try {
        await supabase.from("order_status_logs").insert({
          order_id: order.id,
          confirmation_id: order.confirmation_id,
          old_doctor_status: order.doctor_status,
          new_doctor_status: "unassigned",
          old_status: order.status,
          new_status: "processing",
          changed_by: adminProfile.full_name,
          changed_at: ts,
        });
      } catch { /* non-critical */ }
      try {
        await supabase.from("audit_logs").insert({
          actor_name: adminProfile.full_name,
          actor_role: "admin",
          object_type: "order",
          object_id: order.confirmation_id,
          action: "provider_removed_by_admin",
          description: `Admin ${adminProfile.full_name} removed provider from order ${order.confirmation_id}. Order marked as Paid (Unassigned).`,
          metadata: {
            order_id: order.id,
            previous_doctor_email: order.doctor_email,
            previous_doctor_name: order.doctor_name,
            timestamp: ts,
          },
        });
      } catch { /* non-critical */ }

      updateOrderField({
        doctor_user_id: null,
        doctor_email: null,
        doctor_name: null,
        doctor_status: "unassigned",
        status: "processing",
      });
      setShowRemoveProviderConfirm(false);
      setRemoveProviderMsg("Provider removed. Order is now Paid (Unassigned) and ready to reassign.");
    } else {
      setRemoveProviderMsg(`Failed: ${error.message}`);
    }
    setRemovingProvider(false);
    setTimeout(() => setRemoveProviderMsg(""), 8000);
  };

  const handleResendProviderEmail = async () => {
    if (!order.doctor_email) return;
    setResendingProvider(true);
    setResendProviderMsg("");
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          doctorEmail: order.doctor_email,
          skipPaymentCheck: true,
        }),
      });
      const result = await res.json() as {
        ok?: boolean;
        error?: string;
        warning?: string;
        doctorName?: string;
        emailSent?: boolean;
      };
      if (result.ok) {
        if (result.emailSent) {
          setResendProviderMsg(`Notification resent to ${order.doctor_name ?? order.doctor_email}`);
          // Refresh email log
          const { data: fresh } = await supabase.from("orders").select("email_log").eq("id", order.id).maybeSingle();
          if (fresh?.email_log) updateOrderField({ email_log: fresh.email_log as EmailLogEntry[] });
        } else {
          setResendProviderMsg("Request sent but email delivery failed — check SMTP settings");
        }
      } else {
        setResendProviderMsg(result.error ?? result.warning ?? "Failed to resend");
      }
    } catch {
      setResendProviderMsg("Network error — please try again");
    }
    setResendingProvider(false);
    setTimeout(() => setResendProviderMsg(""), 7000);
  };

  const handleResetToUnderReview = async () => {
    setResetting(true);
    setResetMsg("");
    const patch = {
      doctor_status: "pending",
      letter_url: null,
      signed_letter_url: null,
      patient_notification_sent_at: null,
      status: "under-review",
    };
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (!error) {
      updateOrderField(patch as Partial<Order>);
      setHasProviderDocs(false);
      setDocCount(0);
      setShowResetConfirm(false);
      setResetMsg("Order reset — provider assignment kept, letter cleared");
    } else {
      setResetMsg("Reset failed — check permissions");
    }
    setResetting(false);
    setTimeout(() => setResetMsg(""), 6000);
  };

  const loadEmailLog = useCallback(async () => {
    setEmailLogLoading(true);
    const { data } = await supabase.from("orders").select("email_log").eq("id", order.id).maybeSingle();
    if (data?.email_log) updateOrderField({ email_log: data.email_log as EmailLogEntry[] });
    setEmailLogLoading(false);
  }, [order.id]);

  useEffect(() => {
    if (section === "emails" || section === "comms") loadEmailLog();
    if (section === "comms" || section === "notes") onClearUnread?.(order.confirmation_id);
  }, [section, loadEmailLog]);

  // OPS-PAYMENTS-TAB-REPAIR-TOOLS: Single source of truth for whether
  // the order is unpaid/unlinked and a repair tool would be useful.
  // Used by the compact warning card on Overview and by the full
  // repair panel rendered at the top of the Payments tab.
  const paymentRepairNeeded =
    !order.payment_intent_id &&
    order.status !== "refunded" &&
    !order.refunded_at &&
    order.doctor_status !== "patient_notified";

  // OPS-PAYMENTS-TAB-REPAIR-TOOLS: full Payment Not Linked repair
  // panel — Stripe ID input + Link Payment + Manual Override. Lives
  // here as a local render function so both the Overview compact
  // warning's "Fix in Payments tab" CTA and the Payments tab can
  // share the same UX without duplicating JSX. State (stripeIdInput,
  // paymentSyncing, etc.) and handlers (handleFixPayment, etc.) are
  // captured via closure.
  function renderPaymentRepairPanel() {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
            <i className="ri-error-warning-fill text-red-600 text-base"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold text-red-800">Payment Not Linked</p>
            <p className="text-xs text-red-600 mt-0.5">
              This order shows as &ldquo;Lead (Unpaid)&rdquo; because the Stripe payment wasn&apos;t written back to it. If the customer paid, paste the Stripe Charge ID (ch_...) or Payment Intent ID (pi_...) below to fix it instantly.
            </p>
            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 mt-2 flex items-start gap-1">
              <i className="ri-shield-check-line mt-0.5 flex-shrink-0"></i>
              <span>
                <strong>Verified via Stripe:</strong> the ID is looked up in Stripe and rejected unless the underlying payment is <code>succeeded</code>. Refuses to link if the same payment is already attached to another order.
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={stripeIdInput}
            onChange={(e) => setStripeIdInput(e.target.value)}
            placeholder="ch_3TEFTOGwm9wIWlgi0... or pi_..."
            className="flex-1 px-3 py-2.5 border border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-500 bg-white"
          />
          <button
            type="button"
            onClick={handleFixPayment}
            disabled={paymentSyncing || !stripeIdInput.trim()}
            className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {paymentSyncing
              ? <><i className="ri-loader-4-line animate-spin"></i>Syncing...</>
              : <><i className="ri-link-m"></i>Link Payment</>
            }
          </button>
        </div>
        {paymentSyncMsg && (
          <p className={`text-xs mt-2 flex items-center gap-1 ${paymentSyncMsg.toLowerCase().includes("fail") || paymentSyncMsg.toLowerCase().includes("error") ? "text-red-600" : "text-[#3b6ea5]"}`}>
            <i className="ri-information-line"></i>{paymentSyncMsg}
          </p>
        )}
        {/* ── Manual override when Stripe ID isn't available ── */}
        <div className="mt-3 pt-3 border-t border-red-200">
          <p className="text-xs text-red-600 font-bold mb-2 flex items-center gap-1">
            <i className="ri-settings-3-line"></i>No Stripe ID? Use Manual Override
          </p>
          <p className="text-[11px] text-red-700 bg-red-100/60 border border-red-200 rounded-md px-2 py-1 mb-2 flex items-start gap-1">
            <i className="ri-error-warning-line mt-0.5 flex-shrink-0"></i>
            <span><strong>DB-only:</strong> this does not verify or charge Stripe. Confirm payment in Stripe before using.</span>
          </p>
          {!showMarkPaidConfirm ? (
            <button
              type="button"
              onClick={() => setShowMarkPaidConfirm(true)}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-700 bg-red-100 hover:bg-red-200 rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              <i className="ri-checkbox-circle-line"></i>Mark as Paid (Manual Override)
            </button>
          ) : (
            <div className="bg-red-100 border border-red-300 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                <i className="ri-error-warning-fill"></i>Confirm Manual Override
              </p>
              <p className="text-xs text-red-700 leading-relaxed">
                This bypasses Stripe verification and forces the order to <strong>Processing</strong> status. Only use this if you&apos;ve confirmed payment in Stripe directly and the webhook failed. No refund will be recorded.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAsPaid}
                  disabled={markingPaid}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {markingPaid ? <><i className="ri-loader-4-line animate-spin"></i>Marking...</> : <><i className="ri-check-line"></i>Yes, Mark as Paid</>}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarkPaidConfirm(false)}
                  className="whitespace-nowrap px-3 py-1.5 text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {markPaidMsg && (
            <p className="text-xs mt-2 text-emerald-700 font-semibold flex items-center gap-1">
              <i className="ri-checkbox-circle-fill"></i>{markPaidMsg}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      {/* OPS-ORDER-MODAL-V2-LAYOUT: wider modal (~90vw, capped at 7xl) so the
          two-column operations workspace has room to breathe. Mobile keeps
          full width. */}
      <div className="relative bg-white rounded-2xl w-full max-w-[95vw] lg:max-w-[90vw] xl:max-w-7xl 2xl:max-w-[1440px] max-h-[94vh] flex flex-col overflow-hidden">

        {/* CONSULTATION-INVITE-MANUAL — top-of-modal banner mirrors the
            existing Send New ESA Order Link banner pattern. Auto-clears
            after 8s via the handler. */}
        {consultInviteMsg && (
          <div
            role="status"
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-bold ${
              consultInviteMsg.toLowerCase().includes("fail") || consultInviteMsg.toLowerCase().includes("error") || consultInviteMsg.toLowerCase().includes("missing") || consultInviteMsg.toLowerCase().includes("expired")
                ? "bg-red-50 text-red-800 border-b border-red-200"
                : "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
            }`}
          >
            <i className={
              consultInviteMsg.toLowerCase().includes("fail") || consultInviteMsg.toLowerCase().includes("error") || consultInviteMsg.toLowerCase().includes("missing") || consultInviteMsg.toLowerCase().includes("expired")
                ? "ri-error-warning-fill text-base"
                : "ri-calendar-check-fill text-base"
            }></i>
            <span className="flex-1">{consultInviteMsg}</span>
            <button
              type="button"
              onClick={() => setConsultInviteMsg("")}
              className="text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100">
          {/* Top row: avatar + name + status + actions + close */}
          <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 pb-3">
            <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-full text-[#3b6ea5] text-sm font-extrabold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-extrabold text-gray-900 leading-tight">{fullName}</h2>
                {/* Primary status */}
                {(() => {
                  const s = getModalDisplayStatus(order);
                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${s.color}`}>
                      {s.label}
                    </span>
                  );
                })()}
                {/* VIP or provider status badge */}
                {Array.isArray(order.addon_services) && order.addon_services.length > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-amber-400 to-orange-400 text-white">
                    <i className="ri-vip-crown-fill" style={{ fontSize: "10px" }}></i>VIP
                  </span>
                ) : (
                  order.doctor_status && order.doctor_status !== "patient_notified" && (
                    <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${DOCTOR_STATUS_COLOR[order.doctor_status] ?? "bg-gray-100 text-gray-500"}`}>
                      {order.doctor_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  )
                )}
                {/* Alert badges */}
                {(order.status === "disputed" || order.dispute_id) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-red-600 text-white">
                    <i className="ri-error-warning-fill" style={{ fontSize: "10px" }}></i>DISPUTE
                  </span>
                )}
                {order.fraud_warning && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-red-800 text-white">
                    <i className="ri-spy-fill" style={{ fontSize: "10px" }}></i>FRAUD
                  </span>
                )}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Preview as Customer.
                  Re-alignment to Revision 4: hidden on mobile (header at 390px
                  must fit avatar + name + status + Actions + close cleanly).
                  Customer View is still reachable on mobile via the More menu
                  below. */}
              <button
                type="button"
                onClick={() => {
                  const url = `/my-orders?preview_email=${encodeURIComponent(order.email)}`;
                  window.open(url, "_blank");
                }}
                title={`Preview ${order.email}'s customer portal`}
                className="hidden sm:flex whitespace-nowrap items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer"
              >
                <i className="ri-eye-line text-sm"></i>
                <span className="hidden sm:inline">Customer View</span>
              </button>
              {/* OPS-ORDER-MODAL-V2-LAYOUT: secondary header actions consolidated
                  into a single "More" dropdown so the header reads as Customer
                  View + More + utility cluster instead of a 5-button row.
                  All handlers preserved. */}
              <div className="relative" ref={headerMoreRef}>
                <button
                  type="button"
                  onClick={() => setShowHeaderMore((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={showHeaderMore}
                  title="More actions"
                  className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <i className="ri-more-2-fill text-sm"></i>
                  <span className="hidden sm:inline">More</span>
                  <i className={`ri-arrow-${showHeaderMore ? "up" : "down"}-s-line text-sm text-gray-400`}></i>
                </button>
                {showHeaderMore && (
                  <div role="menu" className="absolute right-0 mt-1.5 z-30 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMore(false); handleSendPortalReset(); }}
                      disabled={portalResetSending || !order.email}
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className={portalResetSending ? "ri-loader-4-line animate-spin" : "ri-key-line"}></i>
                      <span className="flex-1 text-left">{portalResetSending ? "Sending reset..." : "Send Portal Reset"}</span>
                    </button>

                    {/* CONSULTATION-INVITE-MANUAL — unpaid lead recovery. Only
                        surfaces on UNPAID, non-cancelled, non-archived orders
                        where a customer email is on file. Uses the existing
                        send-templated-email edge function + seeded
                        "consultation_window_offer" template. 24h cooldown is
                        a client-side soft guard read from `communications`. */}
                    {!order.payment_intent_id &&
                     !order.paid_at &&
                     order.status !== "cancelled" &&
                     order.status !== "archived" &&
                     order.status !== "refunded" && (
                      <button
                        type="button"
                        onClick={() => { setShowHeaderMore(false); void handleSendConsultationInvite(); }}
                        disabled={consultInviteSending || !order.email}
                        role="menuitem"
                        title={
                          !order.email
                            ? "Customer email missing"
                            : consultLastSentAt
                              ? `Last sent ${new Date(consultLastSentAt).toLocaleString()}`
                              : "Email a consultation invite to the customer"
                        }
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <i className={consultInviteSending ? "ri-loader-4-line animate-spin" : "ri-calendar-check-line"}></i>
                        <span className="flex-1 text-left">
                          {consultInviteSending
                            ? "Sending invite..."
                            : consultLastSentAt && (Date.now() - new Date(consultLastSentAt).getTime()) < 24 * 60 * 60 * 1000
                              ? "Resend Consultation Invite"
                              : "Send Consultation Invite"}
                        </span>
                        {consultLastSentAt && (Date.now() - new Date(consultLastSentAt).getTime()) < 24 * 60 * 60 * 1000 && (
                          <span className="text-[10px] text-gray-400 font-normal normal-case">sent &lt;24h</span>
                        )}
                      </button>
                    )}
                    {(order.payment_intent_id || order.paid_at) && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMore(false); spawnReturningOrder(order.id, "upgrade"); }}
                          role="menuitem"
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors"
                        >
                          <i className="ri-vip-crown-line"></i>
                          <span className="flex-1 text-left">Upgrade to Annual</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMore(false); spawnReturningOrder(order.id, "repeat"); }}
                          role="menuitem"
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 cursor-pointer transition-colors"
                        >
                          <i className="ri-add-circle-line"></i>
                          <span className="flex-1 text-left">Start New ESA Order</span>
                        </button>
                      </>
                    )}
                    {(order.doctor_email || order.doctor_user_id) && (
                      <a
                        href={`/provider-portal?order=${order.confirmation_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        onClick={() => setShowHeaderMore(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#3b6ea5] hover:bg-[#e8f0f9] cursor-pointer transition-colors"
                      >
                        <i className="ri-user-heart-line"></i>
                        <span className="flex-1 text-left">Open Provider View</span>
                        <i className="ri-external-link-line text-[10px] text-gray-400"></i>
                      </a>
                    )}

                    {/* Re-alignment to Revision 4: Customer View item shown
                        only on mobile (the header button is desktop-only). */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMore(false);
                        const url = `/my-orders?preview_email=${encodeURIComponent(order.email)}`;
                        window.open(url, "_blank");
                      }}
                      role="menuitem"
                      className="sm:hidden w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 cursor-pointer transition-colors"
                    >
                      <i className="ri-eye-line"></i>
                      <span className="flex-1 text-left">Customer View</span>
                      <i className="ri-external-link-line text-[10px] text-gray-400"></i>
                    </button>

                    {/* Re-alignment to Revision 4: Status & Lifecycle actions
                        moved from body Admin Actions card into header More
                        menu. Same handlers and confirmation modals that the
                        accordion used; only the entry point changes. */}
                    {!!order.payment_intent_id && (
                      <>
                        <div className="border-t border-gray-100 my-1" role="separator"></div>
                        <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</p>
                        {order.status !== "refunded" && !order.refunded_at && order.doctor_status !== "patient_notified" && order.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => { setShowHeaderMore(false); handleSetStatus("under-review", undefined); }}
                            disabled={statusUpdating || order.status === "under-review"}
                            role="menuitem"
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <i className="ri-eye-line"></i>
                            <span className="flex-1 text-left">{order.status === "under-review" ? "Already Under Review" : "Mark Under Review"}</span>
                          </button>
                        )}
                        {order.status !== "refunded" && !order.refunded_at && order.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => { setShowHeaderMore(false); handleSetStatus("completed", "patient_notified"); }}
                            disabled={statusUpdating || !hasProviderDocs || order.doctor_status === "patient_notified"}
                            role="menuitem"
                            title={!hasProviderDocs ? "Provider letter required first" : undefined}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <i className="ri-checkbox-circle-line"></i>
                            <span className="flex-1 text-left">{order.doctor_status === "patient_notified" ? "Already Delivered" : "Mark Delivered"}</span>
                            {!hasProviderDocs && order.doctor_status !== "patient_notified" && (
                              <span className="text-[10px] text-gray-400 font-normal normal-case">letter needed</span>
                            )}
                          </button>
                        )}
                      </>
                    )}

                    {/* Re-alignment to Revision 4: Danger zone in header More.
                        Restore is shown only when archived; Archive/Void shown
                        when not archived; Hard Delete gated on canPerformDelete. */}
                    <div className="border-t border-dashed border-gray-200 mt-1" role="separator"></div>
                    <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold text-red-400 uppercase tracking-widest">Danger zone</p>
                    {order.status === "archived" ? (
                      canPerformDelete && (
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMore(false); setShowRestoreConfirm(true); }}
                          role="menuitem"
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors"
                        >
                          <i className="ri-arrow-go-back-line"></i>
                          <span className="flex-1 text-left">Restore / Reopen Order</span>
                        </button>
                      )
                    ) : (
                      canPerformDelete && (
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMore(false); setShowArchiveConfirm(true); }}
                          role="menuitem"
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 cursor-pointer transition-colors"
                        >
                          <i className="ri-archive-line"></i>
                          <span className="flex-1 text-left">Archive / Void Order</span>
                        </button>
                      )
                    )}
                    {canPerformDelete && (
                      <button
                        type="button"
                        onClick={() => { setShowHeaderMore(false); setShowDeleteOrderConfirm(true); }}
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <i className="ri-delete-bin-line"></i>
                        <span className="flex-1 text-left">Hard Delete</span>
                        <span className="text-[10px] text-gray-400 font-normal">test only</span>
                      </button>
                    )}
                    {!canPerformDelete && (isFinanceRole || isSupportRole) && (
                      <button
                        type="button"
                        onClick={() => { setShowHeaderMore(false); setShowDeleteApproval(true); }}
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 cursor-pointer transition-colors"
                      >
                        <i className="ri-send-plane-line"></i>
                        <span className="flex-1 text-left">Request Delete Approval</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* OPS-ORDER-MODAL-OVERVIEW-CLEANUP: visual divider separates the
                  labelled action buttons (Customer View, Send Reset, Upgrade,
                  New Order, Provider View) from the icon-only utility cluster
                  (SMS, call, prev/next, close) so the header reads as two
                  discrete groups instead of one crowded row. */}
              <span aria-hidden="true" className="hidden sm:inline-block w-px h-5 bg-gray-200 mx-1"></span>
              {/* ORDER-DETAIL-MODAL-V2-PHASE7A: hide modal-header SMS/Call
                  icon-only buttons on mobile. The Comms tab already owns these
                  workflows on mobile; keeping a duplicate header pair created
                  the same Call/SMS quick-action duplication owners flagged. */}
              <button
                type="button"
                onClick={() => setSection("comms")}
                title={order.phone ? `SMS ${order.phone}` : "No phone on file"}
                className={`hidden sm:flex whitespace-nowrap w-8 h-8 items-center justify-center rounded-lg text-sm border transition-colors cursor-pointer ${order.phone ? "border-[#b8cce4] text-[#3b6ea5] hover:bg-[#e8f0f9]" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
              >
                <i className="ri-message-3-line"></i>
              </button>
              <button
                type="button"
                onClick={() => setSection("comms")}
                title={order.phone ? `Call ${order.phone}` : "No phone on file"}
                className={`hidden sm:flex whitespace-nowrap w-8 h-8 items-center justify-center rounded-lg text-sm border transition-colors cursor-pointer ${order.phone ? "border-sky-200 text-sky-600 hover:bg-sky-50" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
              >
                <i className="ri-phone-line"></i>
              </button>
              {/* Arrow navigation — only shown when there are multiple orders.
                  Re-alignment to Revision 4: hidden on mobile (nav cluster
                  takes too much room at 390px and orders list is still
                  reachable via close → admin orders page). */}
              {allOrders.length > 1 && (() => {
                const currentIdx = allOrders.findIndex((o) => o.id === order.id);
                const hasPrev = currentIdx > 0;
                const hasNext = currentIdx < allOrders.length - 1;
                return (
                  <div className="hidden sm:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => hasPrev && onNavigate?.(allOrders[currentIdx - 1])}
                      disabled={!hasPrev}
                      title="Previous order (← arrow key)"
                      className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-left-s-line text-base"></i>
                    </button>
                    <span className="text-[10px] text-gray-300 font-mono px-0.5 select-none">
                      {currentIdx + 1}/{allOrders.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => hasNext && onNavigate?.(allOrders[currentIdx + 1])}
                      disabled={!hasNext}
                      title="Next order (→ arrow key)"
                      className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-right-s-line text-base"></i>
                    </button>
                  </div>
                );
              })()}
              <button type="button" onClick={onClose}
                title="Close (Esc)"
                className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
          </div>

          {/* Broadcast Opt-Out badge — only shown when opted out, compact inline */}
          {order.broadcast_opt_out && (
            <div className="px-4 sm:px-6 pb-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-300 rounded-lg px-2.5 py-1" title="This customer unsubscribed from broadcast marketing emails via the unsubscribe link">
                <i className="ri-mail-forbid-line" style={{ fontSize: "11px" }}></i>
                Broadcast Opt-Out
              </span>
            </div>
          )}
        </div>

        {/* Section navigation — dropdown on mobile, pill tabs on desktop */}
        {(() => {
          const TABS: { key: Section; label: string; icon: string; badge: number | null; alert?: boolean }[] = [
            { key: "overview",   label: "Overview",                                     icon: "ri-layout-grid-line",  badge: null },
            { key: "payments",   label: "Payments",                                     icon: "ri-bank-card-line",    badge: null, alert: !order.payment_intent_id && !!order.payment_failure_reason },
            { key: "comms",      label: "Comms",                                        icon: "ri-message-3-line",    badge: order.email_log && order.email_log.length > 0 ? order.email_log.length : null },
            { key: "documents",  label: "Documents",                                    icon: "ri-file-pdf-line",     badge: docCount > 0 ? docCount : null },
            { key: "assessment", label: isPSDOrder(order) ? "PSD Eval" : "Assessment",  icon: "ri-questionnaire-line",badge: assessmentCount > 0 ? assessmentCount : null },
            { key: "notes",      label: "Notes",                                        icon: "ri-sticky-note-line",  badge: null },
            { key: "attribution",label: "Attribution / Journey",                        icon: "ri-compass-3-line",    badge: null },
          ];
          const activeTab = TABS.find((t) => t.key === section);
          return (
            <div className="border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              {/* Mobile: compact select dropdown */}
              <div className="flex sm:hidden items-center gap-2 px-4 py-2.5">
                <div className="w-7 h-7 flex items-center justify-center bg-[#3b6ea5] rounded-lg flex-shrink-0">
                  <i className={`${activeTab?.icon ?? "ri-layout-grid-line"} text-white text-sm`}></i>
                </div>
                <div className="relative flex-1">
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value as Section)}
                    className="w-full appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 text-sm font-bold text-gray-800 rounded-lg focus:outline-none focus:border-[#3b6ea5] cursor-pointer"
                  >
                    {TABS.map((tab) => (
                      <option key={tab.key} value={tab.key}>
                        {tab.label}{tab.badge !== null ? ` (${tab.badge})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                    <i className="ri-arrow-down-s-line text-gray-400 text-sm"></i>
                  </div>
                </div>
              </div>
              {/* Desktop: wrapped pill tabs */}
              <div className="hidden sm:flex items-center gap-1 px-4 py-2 flex-wrap">
                {TABS.map((tab) => (
                  <button key={tab.key} type="button" onClick={() => setSection(tab.key)}
                    className={`whitespace-nowrap relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${section === tab.key ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:bg-white hover:text-gray-800"}`}>
                    <i className={tab.icon}></i>
                    {tab.label}
                    {tab.badge !== null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${section === tab.key ? "bg-white/20 text-white" : "bg-[#dbeafe] text-[#3b6ea5]"}`}>
                        {tab.badge}
                      </span>
                    )}
                    {tab.alert && section !== tab.key && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full"></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── PAYMENTS ── */}
          {section === "payments" && (
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* OPS-PAYMENTS-TAB-REPAIR-TOOLS: full repair panel only on
                  Payments tab. Overview shows just a compact warning that
                  routes here, so this single instance owns the repair UX. */}
              {paymentRepairNeeded ? renderPaymentRepairPanel() : null}
              <PaymentHistoryTab
                order={order}
                supabaseUrl={supabaseUrl}
                anonKey={anonKey}
                onOrderUpdated={onOrderUpdated}
              />
            </div>
          )}

          {/* ── COMMUNICATIONS (includes email log) ── */}
          {section === "comms" && (
            <CommunicationTab
              orderId={order.id}
              confirmationId={order.confirmation_id}
              phone={order.phone ?? null}
              email={order.email}
              patientName={fullName}
              adminName={adminProfile.full_name}
              emailLog={order.email_log}
              hasDocuments={!!order.signed_letter_url}
              price={order.price}
              letterType={order.letter_type ?? null}
              state={order.state ?? null}
              doctorEmail={order.doctor_email ?? null}
              doctorName={order.doctor_name ?? null}
              onResendProviderEmail={handleResendProviderEmail}
              resendingProvider={resendingProvider}
              resendProviderMsg={resendProviderMsg}
              onLoadEmailLog={loadEmailLog}
              emailLogLoading={emailLogLoading}
            />
          )}

          {/* ── OVERVIEW ── */}
          {section === "overview" && (
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">

              {/* ── QUICK SUMMARY STRIP ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  {
                    label: "Payment",
                    value: order.payment_intent_id ? "Paid" : "Unpaid",
                    icon: "ri-bank-card-line",
                    color: order.payment_intent_id ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200",
                  },
                  {
                    label: "Provider",
                    value: order.doctor_name ?? (order.doctor_email ? order.doctor_email.split("@")[0] : "Unassigned"),
                    icon: "ri-user-heart-line",
                    color: order.doctor_name || order.doctor_email ? "text-[#3b6ea5] bg-[#e8f0f9] border-[#b8cce4]" : "text-gray-500 bg-gray-50 border-gray-200",
                  },
                  {
                    label: "Documents",
                    value: docCount > 0 ? `${docCount} uploaded` : "None yet",
                    icon: "ri-file-check-line",
                    color: docCount > 0 ? "text-violet-700 bg-violet-50 border-violet-200" : "text-gray-400 bg-gray-50 border-gray-200",
                  },
                  {
                    label: "Letter Sent",
                    value: order.patient_notification_sent_at ? new Date(order.patient_notification_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not sent",
                    icon: "ri-mail-check-line",
                    color: order.patient_notification_sent_at ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-gray-400 bg-gray-50 border-gray-200",
                  },
                ].map((stat) => (
                  <div key={stat.label} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${stat.color}`}>
                    <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/60 flex-shrink-0">
                      <i className={`${stat.icon} text-sm`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs opacity-70 leading-tight">{stat.label}</p>
                      <p className="text-xs font-bold truncate leading-tight">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* OPS-PAYMENTS-TAB-REPAIR-TOOLS: compact unpaid/unlinked
                  warning. The full repair panel (Stripe ID input + Link
                  Payment + Manual Override) lives on the Payments tab —
                  Overview just nudges the admin there to keep this view
                  focused on case status.
                  ORDER-DETAIL-MODAL-V2-PHASE7A: hide on mobile Overview per
                  owner spec — generic "Payment Not Linked" should not appear
                  in mobile Overview. The Payments tab still surfaces it with
                  full repair tooling. */}
              {paymentRepairNeeded && (
                <div className="hidden lg:flex bg-red-50 border border-red-200 rounded-xl p-4 items-start gap-3">
                  <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
                    <i className="ri-error-warning-fill text-red-600 text-base"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-red-800">Payment Not Linked</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      This order appears unpaid because the Stripe payment wasn&apos;t written back. If the customer already paid, repair tools live on the Payments tab.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection("payments")}
                    className="whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-bank-card-line"></i>
                    Fix in Payments tab
                  </button>
                </div>
              )}

              {/* OPS-ORDER-MODAL-V2-LAYOUT: two-column command center.
                  LEFT (col-span-2 on lg) = customer communications workspace.
                  RIGHT rail (col-span-1 on lg) = Order Details + Provider +
                  CRM Details + Admin Actions accordion + Review + Internal
                  Notes shortcut. Stacks vertically below lg. */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">

                {/* ── LEFT MAIN WORKSPACE — Customer Communications ── */}
                <div className="lg:col-span-2 space-y-4 sm:space-y-5 min-w-0">
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <i className="ri-chat-3-line text-[#3b6ea5]"></i>
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Customer Communications</p>
                      </div>
                      {/* ORDER-DETAIL-MODAL-V2-PHASE7A: hide SMS/Email/Call
                          mini-button row on mobile. Mobile-only Communications
                          tab/card handles these workflows; the row caused
                          duplicate quick-action UX vs the Comms tab itself. */}
                      <div className="hidden sm:flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSection("comms")}
                          title="Send SMS"
                          disabled={!order.phone}
                          className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${order.phone ? "border-[#b8cce4] text-[#3b6ea5] bg-white hover:bg-[#e8f0f9]" : "border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50"}`}
                        >
                          <i className="ri-message-3-line"></i>SMS
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection("comms")}
                          title="Email"
                          className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 cursor-pointer transition-colors"
                        >
                          <i className="ri-mail-send-line"></i>Email
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection("comms")}
                          title="Call"
                          disabled={!order.phone}
                          className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${order.phone ? "border-sky-200 text-sky-700 bg-white hover:bg-sky-50" : "border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50"}`}
                        >
                          <i className="ri-phone-line"></i>Call
                        </button>
                      </div>
                    </div>
                    {/* Inline Comms tab content — same handlers and data, surfaced in
                        Overview as the main operational workspace per owner request.
                        The dedicated Comms tab still exists for full history. */}
                    <div className="max-h-[60vh] overflow-y-auto">
                      <CommunicationTab
                        orderId={order.id}
                        confirmationId={order.confirmation_id}
                        phone={order.phone ?? null}
                        email={order.email}
                        patientName={fullName}
                        adminName={adminProfile.full_name}
                        emailLog={order.email_log}
                        hasDocuments={!!order.signed_letter_url}
                        price={order.price}
                        letterType={order.letter_type ?? null}
                        state={order.state ?? null}
                        doctorEmail={order.doctor_email ?? null}
                        doctorName={order.doctor_name ?? null}
                        onResendProviderEmail={handleResendProviderEmail}
                        resendingProvider={resendingProvider}
                        resendProviderMsg={resendProviderMsg}
                        onLoadEmailLog={loadEmailLog}
                        emailLogLoading={emailLogLoading}
                      />
                    </div>
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                      <p className="text-[11px] text-gray-500">Full timeline + send tools</p>
                      <button
                        type="button"
                        onClick={() => setSection("comms")}
                        className="text-xs font-bold text-[#3b6ea5] hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        Open Comms tab<i className="ri-arrow-right-s-line"></i>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── RIGHT OPERATIONS RAIL ── */}
                <div className="lg:col-span-1 space-y-3 sm:space-y-4 min-w-0">

              {/* OPS-ORDER-MODAL-OVERVIEW-CLEANUP: tightened padding + grid gaps so
                  Order Details no longer dominates the modal. Same fields, denser
                  presentation. */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-3.5 sm:p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2.5">Order Details</p>
                {/* 3-column layout */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-3">

                  {/* ── Column 1: Identity ── */}
                  <div className="space-y-2.5">
                    {/* Order ID */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Order ID</p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-mono font-semibold text-gray-700 truncate">{order.confirmation_id}</p>
                        <CopyFieldButton value={order.confirmation_id} />
                      </div>
                    </div>
                    {/* Email */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Email</p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-800 truncate">{order.email}</p>
                        <CopyFieldButton value={order.email} />
                      </div>
                    </div>
                    {/* Phone */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold ${order.phone ? "text-gray-800" : "text-gray-400"}`}>{order.phone ?? "—"}</p>
                        {order.phone && <CopyFieldButton value={order.phone} />}
                      </div>
                    </div>
                    {/* State */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">State</p>
                      <p className="text-sm font-semibold text-gray-800">{order.state ?? "—"}</p>
                    </div>
                  </div>

                  {/* ── Column 2: Payment ── */}
                  <div className="space-y-2.5">
                    {/* Price */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Payment Amount</p>
                      <p className={`text-sm font-semibold ${order.price != null ? "text-gray-800" : "text-gray-400"}`}>
                        {order.price != null ? `$${order.price}` : "—"}
                      </p>
                    </div>
                    {/* Plan */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Plan</p>
                      <p className={`text-sm font-semibold ${order.plan_type ? "text-gray-800" : "text-gray-400"}`}>{order.plan_type ?? "—"}</p>
                    </div>
                    {/* OPS-ORDER-MODAL-V2-LAYOUT: Method moved to Payments tab. */}
                    {/* Paid At */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Paid At</p>
                      <p className={`text-sm font-semibold ${(order as Order & { paid_at?: string | null }).paid_at ? "text-emerald-600" : "text-gray-400"}`}>
                        {(order as Order & { paid_at?: string | null }).paid_at ? fmt((order as Order & { paid_at?: string | null }).paid_at!) : "—"}
                      </p>
                    </div>
                    {/* OPS-ORDER-MODAL-V2-LAYOUT: Delivery Speed moved out of
                        Overview Order Details (still visible in Assessment + Payments). */}
                    {/* Payment Failure Reason — only when present */}
                    {order.payment_failure_reason && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Payment Failure</p>
                        <p className="text-sm font-semibold text-red-700 break-words">{order.payment_failure_reason}</p>
                        {order.payment_failed_at && (
                          <p className="text-[11px] text-red-500 mt-0.5">at {fmt(order.payment_failed_at)}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Column 3: Other ── */}
                  <div className="space-y-2.5">
                    {/* Date Created */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Date Created</p>
                      <p className="text-sm font-semibold text-gray-800">{fmt(order.created_at)}</p>
                    </div>
                    {/* Requested Provider */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Requested Provider</p>
                      <p className={`text-sm font-semibold ${order.selected_provider ? "text-[#3b6ea5]" : "text-gray-400"}`}>{order.selected_provider ?? "—"}</p>
                    </div>
                    {/* Payment status */}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Payment Status</p>
                      <p className={`text-sm font-semibold ${order.payment_intent_id ? "text-emerald-600" : "text-orange-500"}`}>
                        {order.payment_intent_id ? "Paid" : "No payment"}
                      </p>
                    </div>
                    {/* OPS-ORDER-MODAL-V2-LAYOUT: Patient Notified moved out of
                        Overview Order Details — visible in Comms tab + the Quick
                        Summary "Letter Sent" tile already shows this state. */}
                    {/* Coupon */}
                    {order.coupon_code && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Coupon Used</p>
                        <p className="text-sm font-mono font-semibold text-green-700">{order.coupon_code}</p>
                      </div>
                    )}
                    {order.coupon_discount != null && order.coupon_discount > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Coupon Discount</p>
                        <p className="text-sm font-bold text-green-600">-${order.coupon_discount}.00</p>
                      </div>
                    )}
                    {/* OPS-ORDER-MODAL-OVERVIEW-CLEANUP: duplicate Referred By
                        removed. The colored source badge below (using
                        resolveRefConfig) is the single source of truth. */}
                  </div>
                </div>

                {/* Remaining full-width items below the 3-col grid */}
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">

                  {/* OPS-ORDER-MODAL-OVERVIEW-CLEANUP: GHL Sync slimmed to a single
                      compact pill + Re-sync. Re-sync stays in Overview because it's
                      operationally important when an order's GHL state is out of date.
                      Contact ID, Linked badge, Open in GHL link, and Sync History
                      moved into the collapsible "CRM Details" panel below this grid
                      to keep Overview focused on customer/order state. */}
                  <div className="col-span-2 sm:col-span-3 md:col-span-4">
                    <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                      <i className="ri-refresh-line text-gray-400"></i>
                      GHL Sync
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                        order.ghl_synced_at
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : order.ghl_sync_error
                            ? "bg-red-50 border-red-200 text-red-600"
                            : "bg-amber-50 border-amber-200 text-amber-700"
                      }`}>
                        <i className={
                          order.ghl_synced_at
                            ? "ri-checkbox-circle-fill"
                            : order.ghl_sync_error
                              ? "ri-error-warning-fill"
                              : "ri-time-line"
                        }></i>
                        {order.ghl_synced_at
                          ? `Synced ${fmt(order.ghl_synced_at)}`
                          : order.ghl_sync_error
                            ? "Sync Failed"
                            : "Not synced yet"
                        }
                      </span>
                      <button
                        type="button"
                        onClick={handleGhlRefire}
                        disabled={ghlFiring}
                        className={`whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                          order.ghl_synced_at
                            ? "border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50"
                            : order.ghl_sync_error
                              ? "border-red-200 text-red-700 bg-white hover:bg-red-50"
                              : "border-amber-200 text-amber-700 bg-white hover:bg-amber-50"
                        }`}
                      >
                        {ghlFiring
                          ? <><i className="ri-loader-4-line animate-spin"></i>Syncing...</>
                          : <><i className="ri-refresh-line"></i>{order.ghl_synced_at ? "Re-sync" : order.ghl_sync_error ? "Retry" : "Sync"}</>
                        }
                      </button>
                    </div>
                    {ghlMsg && (
                      <p className={`text-xs mt-1.5 flex items-center gap-1 font-semibold ${ghlMsg.toLowerCase().includes("fail") || ghlMsg.toLowerCase().includes("error") ? "text-red-600" : "text-emerald-700"}`}>
                        <i className={ghlMsg.toLowerCase().includes("fail") || ghlMsg.toLowerCase().includes("error") ? "ri-error-warning-line" : "ri-checkbox-circle-fill"}></i>
                        {ghlMsg}
                      </p>
                    )}
                  </div>

                  {/* OPS-ORDER-MODAL-V2-LAYOUT: Stripe Payment Intent / Checkout
                      Session / Resend Webhook moved entirely to the Payments tab
                      (PaymentHistoryTab owns these). Overview is no longer the
                      place for raw Stripe references. */}

                  {/* ── Verification ID ── shown only when letter has been issued via the live provider-submit flow */}
                  {order.letter_id && (
                    <VerificationIdRow orderId={order.id} letterId={order.letter_id} />
                  )}

                  {/* ── Letter Validity Dates ── */}
                  {(order.letter_issue_date || order.letter_expiry_date) && (
                    <div className="col-span-2 sm:col-span-3 md:col-span-4">
                      <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                        <i className="ri-calendar-check-line text-[#3b6ea5]"></i>
                        Letter Validity Period
                      </p>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 bg-[#e8f0f9] border border-[#b8cce4] rounded-lg px-3 py-2">
                          <i className="ri-calendar-line text-[#3b6ea5] text-sm"></i>
                          <div>
                            <p className="text-xs text-gray-400 leading-tight">Issue Date</p>
                            <p className="text-sm font-bold text-gray-900">
                              {order.letter_issue_date
                                ? new Date(order.letter_issue_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <i className="ri-arrow-right-line text-gray-300"></i>
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <i className="ri-time-line text-amber-600 text-sm"></i>
                          <div>
                            <p className="text-xs text-gray-400 leading-tight">Expiry Date</p>
                            <p className="text-sm font-bold text-gray-900">
                              {order.letter_expiry_date
                                ? new Date(order.letter_expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                          <i className="ri-shield-check-line"></i>Valid 1 Year
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Referred By badge */}
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-gray-400 mb-0.5">Referred By</p>
                    {(() => {
                      const cfg = resolveRefConfig(order.referred_by);
                      return cfg ? (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>
                          <i className={cfg.icon}></i>
                          {cfg.label}
                        </span>
                      ) : (
                        <p className="text-sm font-semibold text-gray-400">Direct / Unknown</p>
                      );
                    })()}
                  </div>

                  {/* OPS-ORDER-MODAL-V2-LAYOUT: Broadcast opt-out status and Last
                      Broadcast Sent moved out of Overview's Order Details — these
                      are comms metadata and belong in the Comms tab where the
                      send/audience tooling lives. */}
                </div>
                {/* end full-width items grid */}

                {/* Add-on Services — shown when customer purchased extras */}
                {Array.isArray(order.addon_services) && order.addon_services.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 flex items-center justify-center bg-gradient-to-r from-amber-400 to-orange-400 rounded-lg flex-shrink-0">
                        <i className="ri-vip-crown-fill text-white" style={{ fontSize: "11px" }}></i>
                      </div>
                      <p className="text-xs font-extrabold text-orange-700 uppercase tracking-widest">VIP Add-on Services Purchased</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {order.addon_services.map((addon) => {
                        const ADDON_LABELS: Record<string, { label: string; icon: string; price: string }> = {
                          zoom_call: { label: "Private Zoom Call Session", icon: "ri-video-chat-line", price: "$40" },
                          physical_mail: { label: "Physical Letter via Certified Mail", icon: "ri-mail-send-line", price: "$50" },
                          landlord_letter: { label: "Verification Letter — Landlord", icon: "ri-building-line", price: "$30" },
                        };
                        const cfg = ADDON_LABELS[addon] ?? { label: addon, icon: "ri-star-line", price: "" };
                        return (
                          <span key={addon} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-700">
                            <i className={cfg.icon}></i>
                            {cfg.label}
                            {cfg.price && <span className="text-orange-500">{cfg.price}</span>}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs text-orange-500 mt-2 flex items-center gap-1">
                      <i className="ri-information-line"></i>
                      Provider will NOT see pricing — only service names are shown in the provider portal.
                    </p>
                  </div>
                )}

                {/* Refund details — shown when order was refunded */}
                {(order.status === "refunded" || order.refunded_at) && (
                  <div className="mt-4 pt-4 border-t border-red-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
                        <i className="ri-refund-line text-red-600" style={{ fontSize: "12px" }}></i>
                      </div>
                      <p className="text-xs font-extrabold text-red-600 uppercase tracking-widest">Refund Issued</p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {order.refund_amount != null && (
                        <div>
                          <p className="text-xs text-gray-400">Refund Amount</p>
                          <p className="text-sm font-bold text-red-600">${order.refund_amount}.00</p>
                        </div>
                      )}
                      {order.refunded_at && (
                        <div>
                          <p className="text-xs text-gray-400">Refunded At</p>
                          <p className="text-sm font-semibold text-gray-700">{fmt(order.refunded_at)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment failure banner — links to Payments tab */}
                {order.payment_failed_at && (
                  <div className="mt-4 pt-4 border-t border-red-200">
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0 mt-0.5">
                          <i className="ri-error-warning-line text-red-600 text-sm"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-red-800 mb-0.5">Payment Failed</p>
                          <p className="text-xs text-red-700 leading-relaxed">
                            {order.payment_failure_reason ?? "Payment was declined or failed."}
                          </p>
                          <p className="text-[10px] text-red-500 mt-1">
                            {new Date(order.payment_failed_at).toLocaleString()}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSection("payments")}
                            className="whitespace-nowrap mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 cursor-pointer transition-colors"
                          >
                            <i className="ri-bank-card-line"></i>View Payment Log &amp; Send Recovery
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* OPS-ORDER-MODAL-OVERVIEW-CLEANUP: removed the "View Payments &
                    Send Recovery Email" button for unpaid leads. Payments tab now
                    owns repair + recovery actions; the compact "Payment Not Linked"
                    warning at the top of Overview already routes there with
                    "Fix in Payments tab", so this duplicate CTA was redundant. */}

                {/* Dispute details — shown when order is disputed */}
                {(order.status === "disputed" || order.dispute_id) && (
                  <div className="mt-4 pt-4 border-t border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
                        <i className="ri-error-warning-fill text-red-600" style={{ fontSize: "12px" }}></i>
                      </div>
                      <p className="text-xs font-extrabold text-red-700 uppercase tracking-widest">Chargeback / Dispute Active</p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {order.dispute_id && (
                        <div>
                          <p className="text-xs text-gray-400">Dispute ID</p>
                          <p className="text-xs font-mono font-bold text-gray-700">{order.dispute_id}</p>
                        </div>
                      )}
                      {order.dispute_reason && (
                        <div>
                          <p className="text-xs text-gray-400">Reason</p>
                          <p className="text-sm font-semibold text-red-700 capitalize">{order.dispute_reason.replace(/_/g, " ")}</p>
                        </div>
                      )}
                      {order.dispute_status && (
                        <div>
                          <p className="text-xs text-gray-400">Status</p>
                          <p className="text-sm font-bold text-red-700 capitalize">{order.dispute_status.replace(/_/g, " ")}</p>
                        </div>
                      )}
                    </div>
                    <a
                      href="https://dashboard.stripe.com/disputes"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                    >
                      <i className="ri-external-link-line"></i>Respond in Stripe — 7 Day Deadline
                    </a>
                  </div>
                )}
              </div>

              {/* OPS-ORDER-MODAL-V2-LAYOUT (rev): CRM Details panel relocated to
                  the bottom of the right rail, below Internal Notes — see the
                  collapsed CRM & Sync card after the Internal Notes shortcut. */}

              {/* Assigned Provider */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Provider Assignment</p>

                {/* ── COMPLETED — locked ── */}
                {order.doctor_status === "patient_notified" ? (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
                      <i className="ri-checkbox-circle-fill text-emerald-600 text-base"></i>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-emerald-800">Order Completed — Assignment Locked</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        This order is complete and the letter was delivered. Provider reassignment is disabled for completed orders.
                        {order.doctor_name && (
                          <span className="block mt-1">Completed by: <strong>{order.doctor_name}</strong></span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : order.status === "refunded" || order.refunded_at ? (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
                      <i className="ri-refund-line text-red-600 text-base"></i>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-red-800">Refunded Order — Assignment Disabled</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        This order has been refunded. Provider assignment is not available for refunded orders.
                        {order.refund_amount != null && (
                          <span className="block mt-1">Refund amount: <strong>${order.refund_amount}.00</strong></span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : !order.payment_intent_id && order.status !== "processing" && order.status !== "under-review" && order.status !== "completed" ? (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                      <i className="ri-lock-2-line text-amber-600 text-base"></i>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-amber-800">Cannot Assign — Unpaid Lead</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Provider assignment is only available after payment is confirmed. Use the &ldquo;Link Payment&rdquo; tool above if the customer has already paid.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {order.doctor_name && (
                      // ORDER-DETAIL-MODAL-V2-PHASE7A (re-alignment fix):
                      // assigned-provider card now stacks vertically on mobile
                      // (flex-col) so Nudge / Remove no longer collide with
                      // long names or emails. Desktop (sm+) keeps the original
                      // horizontal layout: identity → spacer → action buttons.
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 flex items-center justify-center bg-white rounded-full flex-shrink-0">
                            <i className="ri-user-heart-line text-[#3b6ea5] text-base"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#3b6ea5] font-bold">Currently Assigned</p>
                            <p className="text-sm font-bold text-[#3b6ea5] break-words">{order.doctor_name}</p>
                            {order.doctor_email && (
                              <p className="text-xs text-[#3b6ea5]/70 break-all">{order.doctor_email}</p>
                            )}
                          </div>
                        </div>
                        {/* Action buttons row — full width on mobile (stack
                            below identity), inline on desktop. Each button
                            takes equal width on mobile so they fit cleanly
                            inside the card; on sm+ they shrink to content. */}
                        <div className="flex items-center gap-2 sm:flex-shrink-0">
                          {/* Nudge Provider button — only shows when a provider is assigned */}
                          <button
                            type="button"
                            onClick={handleResendProviderEmail}
                            disabled={resendingProvider}
                            title="Re-send the case notification email to the currently assigned provider"
                            className="whitespace-nowrap flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                          >
                            {resendingProvider
                              ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                              : <><i className="ri-notification-3-line"></i>Nudge Provider</>
                            }
                          </button>
                          {/* Remove Provider button */}
                          <button
                            type="button"
                            onClick={() => setShowRemoveProviderConfirm(true)}
                            title="Remove provider assignment and mark order as Paid (Unassigned)"
                            className="whitespace-nowrap flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                          >
                            <i className="ri-user-unfollow-line"></i>Remove
                          </button>
                        </div>
                      </div>
                    )}
                    {removeProviderMsg && (
                      <p className={`text-xs mb-2 flex items-center gap-1 font-semibold ${removeProviderMsg.includes("Unassigned") ? "text-[#3b6ea5]" : "text-red-600"}`}>
                        <i className={removeProviderMsg.includes("Unassigned") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                        {removeProviderMsg}
                      </p>
                    )}
                    {resendProviderMsg && (
                      <p className={`text-xs mb-2 flex items-center gap-1 font-semibold ${resendProviderMsg.includes("resent") ? "text-[#3b6ea5]" : "text-orange-600"}`}>
                        <i className={resendProviderMsg.includes("resent") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                        {resendProviderMsg}
                      </p>
                    )}
                    {eligibleDoctors.length === 0 && orderStateName && (
                      <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                        <i className="ri-alert-line text-amber-500 flex-shrink-0 mt-0.5"></i>
                        <p className="text-xs text-amber-700">No active providers licensed in <strong>{orderStateName}</strong>. Add licensed states in the Providers tab.</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <select value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)}
                          className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                          <option value="">— {order.doctor_name ? "Select to Reassign" : "Select Provider"} —</option>
                          {eligibleDoctors.map((doc) => <option key={doc.id} value={doc.email}>{doc.full_name}</option>)}
                        </select>
                        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                          <i className="ri-arrow-down-s-line text-gray-400 text-sm"></i>
                        </div>
                      </div>
                      <button type="button" onClick={handleAssign} disabled={assigning || !assignEmail}
                        className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                        {assigning ? <><i className="ri-loader-4-line animate-spin"></i>Assigning...</> : <><i className="ri-user-received-line"></i>{order.doctor_name ? "Reassign" : "Assign"}</>}
                      </button>
                    </div>
                    {eligibleDoctors.length < doctorContacts.filter(d => d.is_active !== false).length && orderStateName && (
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <i className="ri-filter-3-line"></i>
                        Showing {eligibleDoctors.length} of {doctorContacts.filter(d => d.is_active !== false).length} active providers licensed in {orderStateName}
                      </p>
                    )}
                    {assignMsg && (
                      <p className={`text-xs mt-2 flex items-center gap-1 ${assignMsg.includes("notified") ? "text-[#3b6ea5]" : "text-red-500"}`}>
                        <i className={assignMsg.includes("notified") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{assignMsg}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* OPS-ORDER-MODAL-V2-LAYOUT: Admin Actions wrapped in a collapsed
                  accordion so they no longer dominate the right rail by default.
                  All inner handlers, confirmation modals, and safety copy are
                  preserved unchanged inside.
                  ORDER-DETAIL-MODAL-V2-PHASE7A: hidden on mobile per owner spec.
                  Re-alignment to Revision 4: now hidden on desktop too — admin
                  actions live exclusively in the header More dropdown. The
                  accordion stays mounted (display:none) so the confirmation
                  modals it references (Archive, Restore, Hard Delete) remain
                  wired to existing state machinery; the More menu items below
                  drive that state directly. */}
              <div className="hidden bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdminActions((v) => !v)}
                  aria-expanded={showAdminActions}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <i className="ri-tools-line text-gray-400"></i>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Admin Actions</span>
                  </span>
                  <i className={`ri-arrow-${showAdminActions ? "up" : "down"}-s-line text-gray-400 text-base`}></i>
                </button>
                {showAdminActions && (
                <div className="p-4 border-t border-gray-100">

                {/* ── UNPAID LEAD — redirect to Payments tab ── */}
                {!order.payment_intent_id ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                        <i className="ri-lock-2-line text-amber-600 text-sm"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-amber-800 leading-relaxed">
                          <strong>Unpaid lead</strong> — all case management actions are locked until payment is confirmed.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSection("payments")}
                          className="whitespace-nowrap mt-2 inline-flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors"
                        >
                          <i className="ri-bank-card-line"></i>Go to Payments Tab — Send Recovery / Retry Link
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── PAID ORDER — full actions ── */
                  <div className="space-y-4">
                    {/* Group 1: Order management actions */}
                    {order.doctor_status !== "patient_notified" && order.status !== "refunded" && !order.refunded_at && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <i className="ri-settings-3-line"></i>Order Management
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Mark Under Review */}
                        <button
                          type="button"
                          disabled={statusUpdating}
                          onClick={() => handleSetStatus("under-review", undefined)}
                          className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50 ${order.status === "under-review" ? "bg-gray-100 border-gray-300 text-gray-500" : "border-sky-200 text-sky-700 bg-sky-50/40 hover:bg-sky-50"}`}
                        >
                          <i className="ri-eye-line"></i>Mark Under Review
                        </button>
                      </div>
                    </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-gray-100"></div>

                    {/* Group 2: Provider-completion-gated actions */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <i className="ri-lock-2-line"></i>
                        Delivery Actions
                        {!hasProviderDocs && <span className="text-gray-300 font-normal normal-case tracking-normal ml-1">— needs provider letter first</span>}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Mark Delivered — only when provider has docs */}
                        {(() => {
                          const canDeliver = hasProviderDocs;
                          const alreadyDone = order.doctor_status === "patient_notified";
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                disabled={statusUpdating || (!canDeliver && !alreadyDone)}
                                onClick={() => handleSetStatus("completed", "patient_notified")}
                                className={`whitespace-nowrap flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-semibold transition-colors ${
                                  alreadyDone
                                    ? "bg-gray-100 border-gray-300 text-gray-500 cursor-default"
                                    : canDeliver
                                      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                      : "border-gray-200 text-gray-300 cursor-not-allowed opacity-60"
                                } disabled:opacity-60`}
                              >
                                <i className="ri-checkbox-circle-line"></i>Mark Delivered
                                {!canDeliver && !alreadyDone && <i className="ri-lock-2-line text-xs ml-auto"></i>}
                              </button>
                              {!canDeliver && !alreadyDone && (
                                <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover:block pointer-events-none">
                                  <div className="bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-lg max-w-[220px] leading-relaxed shadow-lg">
                                    <i className="ri-lock-2-line mr-1"></i>Provider must upload completed letter first
                                    <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                      </div>
                    </div>

                    {(statusMsg || emailMsg || confirmResendMsg || resetMsg || portalResetMsg) && (
                      <p className={`text-xs flex items-center gap-1 ${(statusMsg + emailMsg + confirmResendMsg + resetMsg + portalResetMsg).toLowerCase().includes("fail") || (statusMsg + emailMsg + confirmResendMsg + resetMsg + portalResetMsg).toLowerCase().includes("error") ? "text-red-500" : "text-[#3b6ea5]"}`}>
                        <i className="ri-information-line"></i>{statusMsg || emailMsg || confirmResendMsg || resetMsg || portalResetMsg}
                      </p>
                    )}

                    {/* ── 30-Day Reissue (CA, AR, IA, LA, MT only) ── */}
                    {isCompletedOrder && isThirtyDayState && (
                      <div className="border-t border-dashed border-orange-200 mt-1 pt-3">
                        <p className="text-xs text-orange-500 mb-2 flex items-center gap-1 font-semibold">
                          <i className="ri-time-line"></i>30-Day Official Letter — {order.state}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowThirtyDayConfirm(true)}
                          disabled={thirtyDayLoading}
                          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 border border-orange-200 text-orange-700 hover:bg-orange-50 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <i className="ri-time-fill"></i>30-Day Period Completed — Request Official Letter
                        </button>
                        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                          <i className="ri-information-line"></i>
                          Moves order back to Under Review with a special note. Provider will be notified to issue the official letter.
                        </p>
                        {thirtyDayMsg && (
                          <p className={`text-xs mt-2 flex items-center gap-1 font-semibold ${thirtyDayMsg.includes("notified") ? "text-[#3b6ea5]" : "text-red-600"}`}>
                            <i className={thirtyDayMsg.includes("notified") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                            {thirtyDayMsg}
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Danger Zone: Reset to Under Review ── */}
                    {(order.doctor_status === "letter_sent" || order.doctor_status === "patient_notified" || order.doctor_status === "thirty_day_reissue") && (
                      <div className="border-t border-dashed border-red-200 mt-1 pt-3">
                        <p className="text-xs text-red-400 mb-2 flex items-center gap-1 font-semibold">
                          <i className="ri-error-warning-line"></i>Admin Rollback
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowResetConfirm(true)}
                          disabled={resetting}
                          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <i className="ri-arrow-go-back-line"></i>Reset to Under Review
                        </button>
                        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                          <i className="ri-information-line"></i>
                          Clears submitted letter &amp; resets provider status. Provider assignment is kept.
                        </p>
                      </div>
                    )}

                    {/* ── Mark as Unpaid / Revert to Lead — for chargebacks, accidental payments, etc. ── */}
                    {order.payment_intent_id && order.doctor_status !== "patient_notified" && order.status !== "refunded" && !order.refunded_at && order.status !== "cancelled" && (
                    <div className="border-t border-dashed border-amber-200 mt-1 pt-3">
                      <p className="text-xs text-amber-600 mb-2 flex items-center gap-1 font-semibold">
                        <i className="ri-arrow-go-back-line"></i>Revert to Lead
                      </p>
                      <p className="text-[11px] text-amber-800 bg-amber-100/60 border border-amber-200 rounded-md px-2 py-1 mb-2 flex items-start gap-1">
                        <i className="ri-error-warning-line mt-0.5 flex-shrink-0"></i>
                        <span><strong>DB-only:</strong> this clears the payment intent on the order but does NOT issue a Stripe refund. Handle Stripe refund or chargeback separately if required.</span>
                      </p>
                      {!showMarkUnpaidConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowMarkUnpaidConfirm(true)}
                          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                        >
                          <i className="ri-arrow-go-back-line"></i>Mark as Unpaid / Revert to Lead
                        </button>
                      ) : (
                        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                            <i className="ri-error-warning-fill"></i>Confirm Revert to Lead
                          </p>
                          <p className="text-xs text-amber-700 leading-relaxed">
                            This will clear the Stripe payment intent, set status back to <strong>Lead (Unpaid)</strong>, and remove the order from the provider queue. Use for chargebacks or accidental payments. <strong>No Stripe refund is issued</strong> — handle that separately in Stripe.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleMarkAsUnpaid}
                              disabled={markingUnpaid}
                              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer transition-colors"
                            >
                              {markingUnpaid ? <><i className="ri-loader-4-line animate-spin"></i>Reverting...</> : <><i className="ri-arrow-go-back-line"></i>Yes, Revert to Lead</>}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowMarkUnpaidConfirm(false)}
                              className="whitespace-nowrap px-3 py-1.5 text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <i className="ri-information-line"></i>
                        Clears payment intent and reverts to unpaid lead. Useful for chargebacks or accidental payments.
                      </p>
                      {markUnpaidMsg && (
                        <p className={`text-xs mt-2 flex items-center gap-1 font-semibold ${markUnpaidMsg.includes("reverted") || markUnpaidMsg.includes("unpaid") ? "text-amber-700" : "text-red-600"}`}>
                          <i className={markUnpaidMsg.includes("Failed") ? "ri-error-warning-line" : "ri-checkbox-circle-fill"}></i>
                          {markUnpaidMsg}
                        </p>
                      )}
                    </div>
                    )}

                    {/* ── Cancel Order — shown for all paid orders that aren't completed/refunded/already cancelled ── */}
                    {order.doctor_status !== "patient_notified" && order.status !== "refunded" && !order.refunded_at && order.status !== "cancelled" && (
                    <div className="border-t border-dashed border-orange-200 mt-1 pt-3">
                      <p className="text-xs text-orange-500 mb-2 flex items-center gap-1 font-semibold">
                        <i className="ri-close-circle-line"></i>Cancel Order
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 border border-orange-200 text-orange-700 hover:bg-orange-50 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                      >
                        <i className="ri-close-circle-line"></i>Cancel This Order
                      </button>
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <i className="ri-information-line"></i>
                        Marks order as cancelled and notifies the customer.
                        {order.payment_intent_id ? " Optionally issues a full Stripe refund." : ""}
                      </p>
                      {cancelMsg && (
                        <p className={`text-xs mt-2 flex items-center gap-1 font-semibold ${cancelMsg.includes("success") || cancelMsg.includes("cancelled") ? "text-[#3b6ea5]" : cancelMsg.includes("failed") || cancelMsg.includes("Failed") ? "text-red-600" : "text-[#3b6ea5]"}`}>
                          <i className={cancelMsg.includes("failed") || cancelMsg.includes("Failed") ? "ri-error-warning-line" : "ri-checkbox-circle-fill"}></i>
                          {cancelMsg}
                        </p>
                      )}
                    </div>
                    )}
                    {/* Already cancelled badge */}
                    {order.status === "cancelled" && (
                    <div className="border-t border-dashed border-gray-200 mt-1 pt-3">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                        <i className="ri-close-circle-fill text-gray-400"></i>
                        <span className="text-sm text-gray-500 font-semibold">Order already cancelled</span>
                      </div>
                    </div>
                    )}
                  </div>
                )}

              {/* OPS-ORDER-ARCHIVE-VOID-FLOW: Archive / Void — safer than hard delete.
                  Use for duplicate, rejected, abandoned, or replaced orders. Preserves
                  notes/comms/payment/provider history; unblocks customer resubmission
                  with the same email (server-side, in get-resume-order). */}
              <div className="bg-white rounded-xl border border-orange-200 p-4">
                <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <i className="ri-archive-line"></i>Archive / Void Order
                </p>
                {order.status === "archived" ? (
                  /* OPS-ORDER-ARCHIVE-RESTORE: Restore / Reopen safety undo. */
                  <>
                    <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-lg flex-shrink-0">
                        <i className="ri-archive-fill text-gray-600 text-sm"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-gray-700">This order is archived/voided.</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          History is preserved. Customer can resubmit with the same email.
                        </p>
                      </div>
                    </div>
                    {!canPerformDelete ? (
                      <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                        <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                          <i className="ri-lock-2-line text-orange-600 text-sm"></i>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-orange-800">Restore Restricted — Admin access required</p>
                          <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
                            Only Owner or Admin Manager can restore archived orders.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowRestoreConfirm(true)}
                          className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 border border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-sm font-bold cursor-pointer transition-colors"
                        >
                          <i className="ri-arrow-go-back-line"></i>Restore / Reopen Order
                        </button>
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed flex items-start gap-1">
                          <i className="ri-information-line mt-0.5 flex-shrink-0"></i>
                          <span>
                            Restoring makes this order active again. It may again block same-email resubmission depending on payment/status. No Stripe, no email, no provider change.
                          </span>
                        </p>
                        {restoreMsg && (
                          <p className={`text-xs mt-2 font-semibold flex items-center gap-1 ${restoreMsg.toLowerCase().startsWith("restore failed") || restoreMsg.toLowerCase().includes("required") ? "text-red-600" : "text-emerald-700"}`}>
                            <i className="ri-information-line"></i>{restoreMsg}
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : !canPerformDelete ? (
                  <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                      <i className="ri-lock-2-line text-orange-600 text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-orange-800">Archive Restricted — Admin access required</p>
                      <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
                        Only Owner or Admin Manager can archive/void orders.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowArchiveConfirm(true)}
                      className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 border border-orange-400 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg text-sm font-bold cursor-pointer transition-colors"
                    >
                      <i className="ri-archive-line"></i>Archive / Void Order
                    </button>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed flex items-start gap-1">
                      <i className="ri-information-line mt-0.5 flex-shrink-0"></i>
                      <span>
                        Use for duplicate, rejected, abandoned, or replaced orders. Preserves notes, comms, assessment, payment history, and audit trail. Removes this order from active workflows and lets the customer resubmit with the same email. No Stripe refund. No customer email. No provider change.
                      </span>
                    </p>
                    {archiveMsg && (
                      <p className={`text-xs mt-2 font-semibold flex items-center gap-1 ${archiveMsg.toLowerCase().startsWith("archive failed") || archiveMsg.toLowerCase().includes("required") ? "text-red-600" : "text-emerald-700"}`}>
                        <i className="ri-information-line"></i>{archiveMsg}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* ── Permanent Delete (test/garbage records only) ── */}
              <div className="bg-white rounded-xl border border-red-100 p-4">
                <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <i className="ri-skull-line"></i>Danger Zone — Hard Delete (test/garbage only)
                </p>
                {!canPerformDelete ? (
                  /* Non-admin role — locked delete. Finance/Support can request approval. */
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                        <i className="ri-lock-2-line text-orange-600 text-sm"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-orange-800">
                          Delete Restricted — Admin access required
                        </p>
                        <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
                          {isFinanceRole
                            ? "Finance users cannot permanently delete orders. You can request approval from an Owner or Admin Manager."
                            : isSupportRole
                            ? "Support users cannot permanently delete individual orders. You can request approval from an Owner or Admin Manager."
                            : "Only Owner or Admin Manager can permanently delete orders."}
                        </p>
                        {(isFinanceRole || isSupportRole) && (
                          <button
                            type="button"
                            onClick={() => setShowDeleteApproval(true)}
                            className="whitespace-nowrap mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors"
                          >
                            <i className="ri-send-plane-line"></i>Request Delete Approval
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* OPS-ORDER-ARCHIVE-VOID-FLOW: hard delete demoted to a secondary,
                        smaller button. Real operational orders should use Archive/Void
                        above; hard delete is reserved for true test/garbage records. */}
                    <button
                      type="button"
                      onClick={() => setShowDeleteOrderConfirm(true)}
                      className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <i className="ri-delete-bin-line"></i>Delete Permanently
                    </button>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed flex items-start gap-1">
                      <i className="ri-error-warning-line mt-0.5 flex-shrink-0"></i>
                      <span>
                        <strong>For test/garbage records only.</strong> Removes this order and all documents from the database. Cannot be undone. For real customer orders, use <strong>Archive / Void</strong> above instead — it preserves history and unblocks resubmission without losing data.
                      </span>
                    </p>
                    {deleteOrderMsg && (
                      <p className="text-xs mt-2 text-red-600 font-semibold flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>{deleteOrderMsg}
                      </p>
                    )}
                  </>
                )}
              </div>
                </div>
                )}
              </div>

              {/* ── TRUSTPILOT REVIEW REQUEST — completed orders only ──
                  ORDER-DETAIL-MODAL-V2-PHASE7A: hide on mobile Overview per
                  owner spec — review/Trustpilot belongs in the desktop right
                  rail only, mobile Overview stays essentials-only. */}
              {order.doctor_status === "patient_notified" && (
                <div className="hidden lg:block">
                  <TrustpilotReviewPanel
                    orderId={order.id}
                    confirmationId={order.confirmation_id}
                    email={order.email}
                    phone={order.phone ?? null}
                    firstName={order.first_name ?? null}
                    lastName={order.last_name ?? null}
                    supabaseUrl={supabaseUrl}
                    anonKey={anonKey}
                  />
                </div>
              )}

              {/* OPS-ORDER-MODAL-V2-LAYOUT: Internal Notes shortcut card. Default
                  Notes tab destination is Internal Notes (set in NotesTabMerged).
                  Full notes editor lives on the Notes tab; this card just points
                  the admin there in one click.
                  ORDER-DETAIL-MODAL-V2-PHASE7A: hide on mobile Overview — the
                  Notes tab still surfaces this directly. */}
              <div className="hidden lg:block bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <i className="ri-sticky-note-line text-gray-400"></i>Internal Notes
                  </p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                    <i className="ri-shield-user-line" style={{ fontSize: "9px" }}></i>Admin only
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-3">
                  Internal admin context for this order. Provider notes are a separate sub-tab.
                </p>
                <button
                  type="button"
                  onClick={() => setSection("notes")}
                  className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  <i className="ri-edit-2-line"></i>Open Notes (Internal)
                </button>
              </div>

              {/* OPS-ORDER-MODAL-V2-LAYOUT (rev): CRM & Sync panel — relocated to
                  the bottom of the right rail per owner mockup. Auto-expands when
                  there's a sync error so admin sees the issue without clicking.
                  ORDER-DETAIL-MODAL-V2-PHASE7A: hide on mobile Overview — CRM
                  & Sync is desktop-only per owner spec. */}
              <div className="hidden lg:block bg-white rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCrmDetails((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 rounded-xl transition-colors"
                  aria-expanded={showCrmDetails || !!order.ghl_sync_error}
                >
                  <span className="flex items-center gap-2">
                    <i className="ri-database-2-line text-gray-400"></i>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">CRM &amp; Sync</span>
                    {order.ghl_contact_id ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>Linked
                      </span>
                    ) : order.ghl_sync_error ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        <i className="ri-error-warning-fill" style={{ fontSize: "9px" }}></i>Sync error
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                        Not synced
                      </span>
                    )}
                  </span>
                  <i className={`ri-arrow-${(showCrmDetails || !!order.ghl_sync_error) ? "up" : "down"}-s-line text-gray-400 text-base`}></i>
                </button>
                {(showCrmDetails || !!order.ghl_sync_error) && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
                    {/* GHL Contact ID block — copy + Open in GHL preserved */}
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                        <i className="ri-contacts-line text-gray-400"></i>GHL Contact ID
                      </p>
                      {order.ghl_contact_id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-[#3b6ea5] bg-[#e8f0f9] border border-[#b8cce4] px-3 py-1.5 rounded-lg select-all tracking-wide">
                            {order.ghl_contact_id}
                          </span>
                          <CopyFieldButton value={order.ghl_contact_id} />
                          <a
                            href={`https://app.gohighlevel.com/contacts/${order.ghl_contact_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#3b6ea5] font-semibold hover:underline cursor-pointer"
                          >
                            <i className="ri-external-link-line text-xs"></i>Open in GHL
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-700">
                            <i className="ri-link-unlink-m" style={{ fontSize: "10px" }}></i>Not linked yet
                          </span>
                          <p className="text-xs text-gray-400">
                            Use the Sync row in Order Details to capture the contact ID automatically
                          </p>
                        </div>
                      )}
                    </div>
                    {/* GHL Sync History */}
                    <GhlSyncHistory confirmationId={order.confirmation_id} />
                  </div>
                )}
              </div>

                </div>
                {/* end RIGHT OPERATIONS RAIL */}
              </div>
              {/* end V2 two-column command center */}


            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {section === "documents" && (
            <div className="p-6 space-y-5">
              {/* Additional docs requested by customer */}
              {initialOrder.assessment_answers && (initialOrder.assessment_answers as Record<string, unknown>).additionalDocs && (() => {
                const req = (initialOrder.assessment_answers as Record<string, unknown>).additionalDocs as { types?: string[]; otherDescription?: string };
                const extraTypes = (req?.types ?? []).filter((t) => t !== "ESA Letter");
                if (extraTypes.length === 0) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                        <i className="ri-file-add-line text-amber-600 text-base"></i>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-1">Customer Requested Additional Documents</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {extraTypes.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                              <i className="ri-file-text-line text-xs"></i>{t}
                            </span>
                          ))}
                        </div>
                        {req?.otherDescription && (
                          <p className="text-xs text-amber-700 mt-1 italic">&ldquo;{req.otherDescription}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Action bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Letters &amp; Documents</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* ── Test Email button — fires notify-patient-letter and links to Resend ── */}
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={sendingTestEmail || orderDocs.length === 0}
                    title="Send a test version of the documents email to verify CSV and formatting in Resend"
                    className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {sendingTestEmail
                      ? <><i className="ri-loader-4-line animate-spin"></i>Sending Test...</>
                      : <><i className="ri-test-tube-line"></i>Send Test Email</>
                    }
                  </button>
                  {/* Re-inject All Footers — only available for orders that already have a verification ID from the live flow */}
                  {order.letter_id && orderDocs.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        setReinjectFooterMsg("");
                        setReinjectingFooter(true);
                        let injected = 0;
                        let failed = 0;
                        try {
                          const token = await getAdminToken();
                          for (const doc of orderDocs) {
                            const res = await fetch(`${supabaseUrl}/functions/v1/inject-pdf-footer`, {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({
                                orderId: order.id,
                                confirmationId: order.confirmation_id,
                                documentId: doc.id,
                                fileUrl: doc.file_url,
                                letterId: order.letter_id,
                                forceReInject: true,
                              }),
                            });
                            const result = await res.json() as { ok?: boolean };
                            if (result.ok) injected++; else failed++;
                          }
                          setReinjectFooterMsg(`${injected} document(s) updated${failed > 0 ? `, ${failed} failed` : ""}`);
                          loadOrderDocs();
                        } catch {
                          setReinjectFooterMsg("Network error during batch injection");
                        }
                        setReinjectingFooter(false);
                      }}
                      disabled={reinjectingFooter}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {reinjectingFooter
                        ? <><i className="ri-loader-4-line animate-spin"></i>Injecting...</>
                        : <><i className="ri-refresh-line"></i>Re-inject All Footers</>
                      }
                    </button>
                  )}
                  <button type="button" onClick={handleSendAllToCustomer} disabled={sendingAll}
                    className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                    {sendingAll ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-mail-send-line"></i>Send All to Customer</>}
                  </button>
                  <button type="button" onClick={() => setShowAddDocForm((v) => !v)}
                    className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-[#1a5c4f] text-[#3b6ea5] text-xs font-bold rounded-lg hover:bg-[#e8f0f9] cursor-pointer transition-colors">
                    <i className={showAddDocForm ? "ri-close-line" : "ri-add-line"}></i>
                    {showAddDocForm ? "Cancel" : "Add Document"}
                  </button>
                </div>
              </div>

              {/* Provider message */}
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
                <label className="block text-xs font-bold text-[#3b6ea5] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <i className="ri-message-3-line"></i>
                  Personal Message from Provider (Optional)
                </label>
                <textarea
                  value={doctorMessage}
                  onChange={(e) => setDoctorMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Add a short personal note from the provider — this will appear in the patient's email alongside their documents. E.g. 'It was a pleasure evaluating your case. Please don't hesitate to reach out with any questions.'"
                  className="w-full px-3 py-2.5 border border-[#b8cce4] rounded-lg text-sm bg-white focus:outline-none focus:border-[#3b6ea5] resize-none"
                />
                <p className="text-xs text-[#3b6ea5]/60 mt-1 text-right">{doctorMessage.length}/500</p>
              </div>

              {sendAllMsg && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${sendAllMsg.includes("sent") ? "bg-[#e8f0f9] border-[#b8cce4] text-[#3b6ea5]" : "bg-red-50 border-red-200 text-red-700"}`}>
                  <i className={sendAllMsg.includes("sent") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                  {sendAllMsg}
                </div>
              )}

              {/* Test email feedback */}
              {testEmailMsg && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${testEmailOk ? "bg-violet-50 border-violet-200 text-violet-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  <i className={testEmailOk ? "ri-test-tube-line" : "ri-error-warning-line"}></i>
                  <div className="flex-1">
                    <p>{testEmailMsg}</p>
                    {testEmailOk && (
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <a
                          href="https://resend.com/emails"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-violet-600 font-bold hover:underline cursor-pointer"
                        >
                          <i className="ri-external-link-line"></i>View in Resend Dashboard
                        </a>
                        {testEmailResendId && (
                          <span className="text-violet-500 font-mono text-[10px] bg-violet-100 px-2 py-0.5 rounded">
                            ID: {testEmailResendId}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Add document form */}
              {showAddDocForm && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Add New Document</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Document URL *</label>
                      <input type="url" value={addDocForm.url} onChange={(e) => setAddDocForm((f) => ({ ...f, url: e.target.value }))}
                        placeholder="https://storage.example.com/doc.pdf"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Document Label *</label>
                      <input type="text" value={addDocForm.label} onChange={(e) => setAddDocForm((f) => ({ ...f, label: e.target.value }))}
                        placeholder="e.g. Signed ESA Letter, Housing Verification..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Document Type</label>
                      <div className="relative">
                        <select value={addDocForm.docType} onChange={(e) => setAddDocForm((f) => ({ ...f, docType: e.target.value }))}
                          className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                          {DOC_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Internal Notes</label>
                      <input type="text" value={addDocForm.notes} onChange={(e) => setAddDocForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes for this document..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                    </div>
                  </div>
                  {addDocMsg && (
                    <p className={`text-xs flex items-center gap-1 ${addDocMsg.includes("saved") ? "text-[#3b6ea5]" : "text-red-500"}`}>
                      <i className={addDocMsg.includes("saved") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{addDocMsg}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleAddDoc} disabled={savingDoc}
                      className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer">
                        {savingDoc ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</> : <><i className="ri-save-line"></i>Save Document</>}
                    </button>
                  </div>
                </div>
              )}

              {loadingDocs ? (
                <div className="flex items-center justify-center py-8">
                  <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* order_documents (provider-uploaded letters + admin docs) */}
                  {orderDocs.map((doc) => {
                    const typeOpt = DOC_TYPE_OPTIONS.find((o) => o.value === doc.doc_type);
                    return (
                      <div key={doc.id} className={`bg-white rounded-xl border overflow-hidden ${!doc.customer_visible ? "opacity-70 border-dashed border-gray-300" : doc.sent_to_customer ? "border-[#b8cce4]" : "border-gray-200"}`}>
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${!doc.customer_visible ? "bg-gray-100" : doc.sent_to_customer ? "bg-[#dbeafe]" : "bg-violet-50"}`}>
                              <i className={`ri-file-check-line text-base ${!doc.customer_visible ? "text-gray-400" : doc.sent_to_customer ? "text-[#3b6ea5]" : "text-violet-500"}`}></i>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-gray-900 truncate">{cleanDocLabel(doc.label)}</p>
                                {!doc.customer_visible && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-semibold flex-shrink-0">
                                    <i className="ri-eye-off-line" style={{ fontSize: "9px" }}></i>Hidden
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-400">{typeOpt?.label ?? doc.doc_type}</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-xs text-gray-400">
                                  {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                                {doc.uploaded_by && (
                                  <>
                                    <span className="text-gray-300">·</span>
                                    <span className="text-xs text-gray-400">by {doc.uploaded_by}</span>
                                  </>
                                )}
                                {doc.sent_to_customer && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#dbeafe] text-[#3b6ea5] rounded-full text-xs font-semibold">
                                    <i className="ri-mail-check-line" style={{ fontSize: "9px" }}></i>Emailed
                                  </span>
                                )}
                                {doc.footer_injected && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold" title={`Verification footer injected — ID: ${doc.footer_letter_id ?? ""}`}>
                                    <i className="ri-shield-check-line" style={{ fontSize: "9px" }}></i>Verified Footer
                                  </span>
                                )}
                              </div>
                              {doc.notes && <p className="text-xs text-gray-400 italic mt-0.5 truncate">{doc.notes}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {/* Visibility toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleVisibility(doc)}
                              disabled={togglingVisibility === doc.id}
                              title={doc.customer_visible ? "Hide from customer portal (doc stays, customer can't see it)" : "Show in customer portal"}
                              className={`whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 border text-xs font-semibold rounded-lg cursor-pointer transition-colors disabled:opacity-50 ${
                                doc.customer_visible
                                  ? "border-gray-200 text-gray-500 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50"
                                  : "border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100"
                              }`}
                            >
                              {togglingVisibility === doc.id
                                ? <i className="ri-loader-4-line animate-spin"></i>
                                : <i className={doc.customer_visible ? "ri-eye-line" : "ri-eye-off-line"}></i>
                              }
                              {doc.customer_visible ? "Visible" : "Hidden"}
                            </button>
                            {/* Inject / Generate+Inject footer button — always visible */}
                            {(() => {
                              const needsGenerate = !order.letter_id;
                              const label = reinjectingFooter
                                ? "Processing..."
                                : needsGenerate
                                  ? "Generate ID & Stamp"
                                  : doc.footer_injected
                                    ? "Re-inject Footer"
                                    : "Inject Footer";
                              const icon = reinjectingFooter
                                ? "ri-loader-4-line animate-spin"
                                : needsGenerate
                                  ? "ri-shield-star-line"
                                  : doc.footer_injected
                                    ? "ri-refresh-line"
                                    : "ri-shield-check-line";
                              const title = needsGenerate
                                ? "Generate a new Verification ID and stamp it into all documents for this order"
                                : doc.footer_injected
                                  ? "Re-inject verification footer (force update)"
                                  : "Inject verification footer now";
                              const colorClass = needsGenerate
                                ? "border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100"
                                : "border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100";
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleReinjectFooter(doc)}
                                  disabled={reinjectingFooter}
                                  title={title}
                                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg cursor-pointer transition-colors disabled:opacity-50 ${colorClass}`}
                                >
                                  <i className={icon}></i>{label}
                                </button>
                              );
                            })()}
                            {/* Open button — always shows verified PDF when available, falls back to original */}
                            <a
                              href={doc.footer_injected && doc.processed_file_url ? doc.processed_file_url : doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={doc.footer_injected && doc.processed_file_url ? "Opens stamped PDF with verification footer" : "Opens original uploaded PDF (not yet stamped)"}
                              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${doc.footer_injected && doc.processed_file_url ? "bg-[#dbeafe] text-[#3b6ea5] hover:bg-[#d0ede6]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                            >
                              <i className={doc.footer_injected && doc.processed_file_url ? "ri-shield-check-line" : "ri-external-link-line"}></i>
                              {doc.footer_injected && doc.processed_file_url ? "Open Verified PDF" : "Open Original"}
                            </a>
                            {/* Show link to original if verified version exists */}
                            {doc.footer_injected && doc.processed_file_url && (
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                className="whitespace-nowrap flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                                title="Open original unprocessed PDF">
                                <i className="ri-file-line text-xs"></i>Original
                              </a>
                            )}
                            {canPerformDelete && (
                              <button type="button" onClick={() => handleDeleteDoc(doc.id)}
                                className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 cursor-pointer transition-colors">
                                <i className="ri-delete-bin-line text-sm"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Re-inject footer status message */}
                  {reinjectFooterMsg && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${reinjectFooterMsg.includes("success") || reinjectFooterMsg.includes("already") ? "bg-teal-50 border-teal-200 text-teal-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                      <i className={reinjectFooterMsg.includes("success") || reinjectFooterMsg.includes("already") ? "ri-shield-check-line" : "ri-error-warning-line"}></i>
                      {reinjectFooterMsg}
                      {/* One-click Notify Patient after footer injection */}
                      {(reinjectFooterMsg.includes("success") || reinjectFooterMsg.includes("stamped")) && (
                        <button
                          type="button"
                          onClick={handleNotifyPatientFromDocs}
                          disabled={notifyingPatient}
                          className="whitespace-nowrap ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          {notifyingPatient
                            ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                            : <><i className="ri-mail-send-line"></i>Notify Patient Now</>
                          }
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Notify Patient banner — always visible when docs exist and footer injected ── */}
                  {orderDocs.some((d) => d.footer_injected) && !reinjectFooterMsg && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl">
                      <div className="w-8 h-8 flex items-center justify-center bg-[#dbeafe] rounded-lg flex-shrink-0">
                        <i className="ri-mail-send-line text-[#3b6ea5] text-sm"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#3b6ea5]">Ready to send to patient</p>
                        <p className="text-xs text-[#3b6ea5]/70">
                          {order.patient_notification_sent_at
                            ? `Last sent ${new Date(order.patient_notification_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — click to resend`
                            : "Footer injected — notify the patient to download their verified letter"
                          }
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleNotifyPatientFromDocs}
                        disabled={notifyingPatient}
                        className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {notifyingPatient
                          ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                          : <><i className="ri-mail-send-line"></i>{order.patient_notification_sent_at ? "Resend" : "Notify Patient"}</>
                        }
                      </button>
                    </div>
                  )}

                  {/* Notify Patient feedback */}
                  {notifyPatientMsg && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${notifyPatientOk ? "bg-[#e8f0f9] border-[#b8cce4] text-[#3b6ea5]" : "bg-red-50 border-red-200 text-red-700"}`}>
                      <i className={notifyPatientOk ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                      {notifyPatientMsg}
                    </div>
                  )}

                  {/* Legacy signed_letter_url (from old flow) */}
                  {order.signed_letter_url && orderDocs.length === 0 && (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
                      <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                        <i className="ri-file-paper-line text-gray-300 text-xl"></i>
                      </div>
                      <p className="text-sm font-bold text-gray-600 mb-1">No documents yet</p>
                      <p className="text-xs text-gray-400">The provider will upload the signed ESA letter here. You can also add documents manually above.</p>
                    </div>
                  )}

                  {/* Email history lives in the Comms tab — single source of truth */}
                  <div className="mt-2 flex items-center justify-between gap-3 px-4 py-3 bg-[#f8fafc] border border-gray-100 rounded-xl">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
                        <i className="ri-chat-3-line text-[#3b6ea5] text-sm"></i>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        Email &amp; SMS history moved to the <strong className="text-gray-700">Comms</strong> tab.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSection("comms")}
                      className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-white cursor-pointer transition-colors"
                    >
                      <i className="ri-arrow-right-line"></i>Open Comms
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ASSESSMENT ── */}
          {section === "assessment" && (
            <div className="p-6 space-y-6">

              {/* Action bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  {isPSDOrder(order) ? "PSD Psychiatric Service Dog Evaluation" : "ESA Intake Form"}
                </p>
                {/* Download PDF — only for ESA orders with assessment data */}
                {!isPSDOrder(order) && order.assessment_answers && assessmentCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const html = buildPrintHTML(order);
                      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
                      const blobUrl = URL.createObjectURL(blob);
                      const w = window.open(blobUrl, "_blank");
                      if (w) {
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                      }
                    }}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors"
                  >
                    <i className="ri-download-line"></i>
                    Download PDF
                  </button>
                )}
              </div>

              {isPSDOrder(order) ? (
                <PSDAssessmentView
                  answers={order.assessment_answers}
                  orderInfo={{
                    firstName: order.first_name,
                    lastName: order.last_name,
                    email: order.email,
                    phone: order.phone,
                    state: order.state,
                    confirmationId: order.confirmation_id,
                    createdAt: order.created_at,
                  }}
                />
              ) : !order.assessment_answers || assessmentCount === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
                  <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                    <i className="ri-questionnaire-line text-gray-400 text-xl"></i>
                  </div>
                  <p className="text-sm font-bold text-gray-600 mb-1">No assessment data</p>
                  <p className="text-xs text-gray-400">Assessment answers haven&apos;t been recorded for this order.</p>
                </div>
              ) : (() => {
                const a = order.assessment_answers as Record<string, unknown>;
                const pets = (a.pets as PetInfo[]) ?? [];
                const dob = a.dob as string | undefined;
                const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";
                const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";

                return (
                  <div className="space-y-8">

                    {/* Branded form header */}
                    <div className="text-center bg-gray-50 rounded-2xl border border-gray-100 px-6 py-6">
                      <img src={ASSESSMENT_LOGO} alt="PawTenant" className="h-10 mx-auto mb-2 object-contain" />
                      <h2 className="text-xl font-extrabold text-orange-500 mb-1">PawTenant ESA Intake Form</h2>
                      <p className="text-xs text-gray-500 max-w-xs mx-auto">
                        Kindly provide as much accurate information as possible to enable the provider to approve your request.
                      </p>
                    </div>

                    {/* Section 1: Owner Info */}
                    <div>
                      <h3 className="text-sm font-extrabold text-orange-500 pb-2 border-b-2 border-orange-500 mb-4">
                        Pet and Owner Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
                        {[
                          { label: "Full Name", value: fullName },
                          { label: "State", value: stateName },
                          { label: "Email", value: order.email || "—" },
                          { label: "Phone", value: order.phone || "—" },
                          ...(dob ? [{ label: "Date of Birth", value: formatDob(dob) }] : []),
                          { label: "Order ID", value: order.confirmation_id },
                          { label: "Submitted", value: formatSubmitDate(order.created_at) },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-start gap-2">
                            <span className="text-xs text-gray-500 w-28 flex-shrink-0 mt-0.5">{label}:</span>
                            <span className="text-sm font-semibold text-gray-900 break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section 2: Pet Information */}
                    <div>
                      <h3 className="text-sm font-extrabold text-orange-500 pb-2 border-b-2 border-orange-500 mb-4">
                        Pet Information
                      </h3>
                      <p className="text-sm font-bold text-gray-700 mb-3">How many emotional support animals are you certifying today?</p>
                      {pets.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm min-w-[480px]">
                            <thead>
                              <tr className="bg-orange-50">
                                {["Pet Name", "Type", "Age", "Breed", "Weight"].map((h) => (
                                  <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-orange-600 uppercase tracking-wide border-b border-orange-100">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pets.map((pet, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                  <td className="px-4 py-2.5 text-gray-900 font-semibold border-b border-gray-100">{pet.name || "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.type || "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">
                                    {pet.age ? `${pet.age} yr${pet.age !== "1" ? "s" : ""}` : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.breed || "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">
                                    {pet.weight ? `${pet.weight} lbs` : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-400">No pet information recorded.</p>
                        </div>
                      )}
                    </div>

                    {/* Section 3: Questionnaire */}
                    <div>
                      <h3 className="text-sm font-extrabold text-orange-500 pb-2 border-b-2 border-orange-500 mb-4">
                        Mental Health Questionnaire
                      </h3>
                      <div className="space-y-5">
                        {QUESTIONNAIRE_ITEMS.map(({ label, key }, idx) => {
                          const val = a[key];
                          const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && (val as unknown[]).length === 0);
                          if (isEmpty) return null;
                          return (
                            <div key={key} className="flex gap-3">
                              <div className="w-6 h-6 flex items-center justify-center bg-orange-500 text-white text-xs font-bold rounded-full flex-shrink-0 mt-0.5">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-800 mb-1">{label}</p>
                                <p className="text-sm text-orange-600 font-semibold leading-relaxed">
                                  {resolveLabel(key, val)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer branding */}
                    <div className="border-t border-gray-100 pt-4 text-center">
                      <p className="text-xs text-gray-400">PawTenant &bull; Secure ESA Consultation Support &bull; pawtenant.com</p>
                    </div>

                  </div>
                );
              })()}

            </div>
          )}

          {/* ── NOTES (Provider Notes + Internal Notes merged) ── */}
          {section === "notes" && (
            <NotesTabMerged
              orderId={order.id}
              confirmationId={order.confirmation_id}
              adminUserId={adminProfile.user_id}
              adminName={adminProfile.full_name}
            />
          )}

          {/* ── ATTRIBUTION / JOURNEY ── */}
          {section === "attribution" && (
            <AttributionJourneyTab order={{
              id: order.id,
              confirmation_id: order.confirmation_id,
              created_at: order.created_at,
            }} />
          )}

          {/* ── EMAIL LOG TAB (kept for legacy — now merged into Comms) ── */}
          {section === ("emails" as string) && (
            <div className="p-6 space-y-5">

              {/* Header with refresh */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Email Delivery Log</p>
                  <p className="text-xs text-gray-400 mt-0.5">All emails sent to providers and patients for this order</p>
                </div>
                <button
                  type="button"
                  onClick={loadEmailLog}
                  disabled={emailLogLoading}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <i className={emailLogLoading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                  {emailLogLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {/* Stats bar */}
              {order.email_log && order.email_log.length > 0 && (() => {
                const total = order.email_log.length;
                const sent = order.email_log.filter((e) => e.success).length;
                const failed = total - sent;
                return (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Total Sent", value: total, icon: "ri-mail-line", color: "text-gray-700 bg-gray-100" },
                      { label: "Delivered", value: sent, icon: "ri-checkbox-circle-line", color: "text-emerald-700 bg-emerald-100" },
                      { label: "Failed", value: failed, icon: "ri-mail-close-line", color: failed > 0 ? "text-red-600 bg-red-100" : "text-gray-400 bg-gray-100" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className={`w-9 h-9 flex items-center justify-center rounded-lg ${s.color.split(" ")[1]} flex-shrink-0`}>
                          <i className={`${s.icon} ${s.color.split(" ")[0]} text-sm`}></i>
                        </div>
                        <div>
                          <p className={`text-xl font-extrabold ${s.color.split(" ")[0]}`}>{s.value}</p>
                          <p className="text-xs text-gray-400">{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Provider section */}
              {order.doctor_email && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 flex items-center justify-center bg-[#dbeafe] rounded-lg">
                        <i className="ri-user-received-line text-[#3b6ea5] text-sm"></i>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Provider Notifications</p>
                        <p className="text-xs text-gray-400">{order.doctor_name ?? order.doctor_email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResendProviderEmail}
                      disabled={resendingProvider}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {resendingProvider
                        ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                        : <><i className="ri-notification-3-line"></i>Resend Provider Email</>
                      }
                    </button>
                  </div>
                  {(() => {
                    const providerEmails = (order.email_log ?? []).filter((e) =>
                      e.to.toLowerCase() === order.doctor_email?.toLowerCase() ||
                      e.type === "provider_assigned_provider" ||
                      e.type === "provider_notification"
                    );
                    if (providerEmails.length === 0) {
                      return (
                        <div className="px-4 py-6 flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-full flex-shrink-0">
                            <i className="ri-mail-line text-gray-300 text-sm"></i>
                          </div>
                          <p className="text-xs text-gray-400">No provider emails logged yet.</p>
                        </div>
                      );
                    }
                    return providerEmails.map((entry, idx) => {
                      const cfg = EMAIL_TYPE_CONFIG[entry.type] ?? {
                        label: entry.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                        icon: "ri-mail-line",
                        color: "text-gray-600 bg-gray-50 border-gray-200",
                        failColor: "text-red-600 bg-red-50 border-red-200",
                      };
                      return (
                        <div key={idx} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${entry.success ? "" : "bg-red-50/40"}`}>
                          <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${entry.success ? "bg-[#dbeafe]" : "bg-red-100"}`}>
                            <i className={`${entry.success ? cfg.icon : "ri-mail-close-line"} ${entry.success ? "text-[#3b6ea5]" : "text-red-500"} text-sm`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900">{cfg.label}</p>
                            <p className="text-xs text-gray-400">{fmtEmailTime(entry.sentAt)}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${entry.success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                            {entry.success ? <><i className="ri-checkbox-circle-fill"></i>Sent</> : <><i className="ri-close-circle-fill"></i>Failed</>}
                          </span>
                        </div>
                      );
                    });
                  })()}
                  {resendProviderMsg && (
                    <div className={`px-4 py-2 border-t border-gray-100 flex items-center gap-1.5 text-xs font-semibold ${resendProviderMsg.includes("resent") ? "text-[#3b6ea5] bg-[#e8f0f9]" : "text-orange-700 bg-orange-50"}`}>
                      <i className={resendProviderMsg.includes("resent") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                      {resendProviderMsg}
                    </div>
                  )}
                </div>
              )}

              {/* Patient section */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-violet-100 rounded-lg">
                    <i className="ri-user-line text-violet-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Patient Emails</p>
                    <p className="text-xs text-gray-400">{order.email}</p>
                  </div>
                </div>
                {(() => {
                  const patientEmails = (order.email_log ?? []).filter((e) =>
                    e.to.toLowerCase() === order.email.toLowerCase() ||
                    e.type === "provider_assigned_customer" ||
                    e.type === "order_confirmation" ||
                    e.type === "letter_ready" ||
                    e.type === "payment_receipt" ||
                    e.type === "refund" ||
                    e.type === "status_under_review" ||
                    e.type === "status_completed"
                  );
                  if (patientEmails.length === 0) {
                    return (
                      <div className="px-4 py-6 flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-full flex-shrink-0">
                          <i className="ri-mail-line text-gray-300 text-sm"></i>
                        </div>
                        <p className="text-xs text-gray-400">No patient emails logged yet.</p>
                      </div>
                    );
                  }
                  return patientEmails.map((entry, idx) => {
                    const cfg = EMAIL_TYPE_CONFIG[entry.type] ?? {
                      label: entry.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                      icon: "ri-mail-line",
                      color: "text-gray-600 bg-gray-50 border-gray-200",
                      failColor: "text-red-600 bg-red-50 border-red-200",
                    };
                    return (
                      <div key={idx} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${entry.success ? "" : "bg-red-50/40"}`}>
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${entry.success ? "bg-violet-50" : "bg-red-100"}`}>
                          <i className={`${entry.success ? cfg.icon : "ri-mail-close-line"} ${entry.success ? "text-violet-600" : "text-red-500"} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900">{cfg.label}</p>
                          <p className="text-xs text-gray-400">{fmtEmailTime(entry.sentAt)}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${entry.success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                          {entry.success ? <><i className="ri-checkbox-circle-fill"></i>Sent</> : <><i className="ri-close-circle-fill"></i>Failed</>}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>

              {(!order.email_log || order.email_log.length === 0) && !emailLogLoading && (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
                  <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                    <i className="ri-mail-line text-gray-300 text-xl"></i>
                  </div>
                  <p className="text-sm font-bold text-gray-600 mb-1">No emails logged yet</p>
                  <p className="text-xs text-gray-400">Email activity for this order will appear here once emails are sent.</p>
                </div>
              )}

              {emailLogLoading && (
                <div className="flex items-center justify-center py-12">
                  <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
                </div>
              )}

            </div>
          )}

        </div>
      </div>

      {/* ── Delete Order Confirmation ── */}
      {/* OPS-ORDER-ARCHIVE-RESTORE: Restore / Reopen confirmation modal */}
      {showRestoreConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/50">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-emerald-100 rounded-xl flex-shrink-0">
                <i className="ri-arrow-go-back-fill text-emerald-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Restore / Reopen This Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Order <span className="font-mono text-gray-700">{order.confirmation_id}</span> will move out of Archived and become active again.
                </p>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 space-y-1 text-xs text-emerald-800">
              <p className="font-bold">{fullName}</p>
              <p>{order.email}</p>
              <p className="flex items-center gap-1">
                <i className="ri-arrow-right-line"></i>
                New status: <strong>{(order.payment_intent_id || order.paid_at) ? "Processing (paid)" : "Lead (Unpaid)"}</strong>
              </p>
              <p className="flex items-center gap-1"><i className="ri-shield-check-line"></i>Notes, comms, assessment, payment history untouched</p>
              <p className="flex items-center gap-1"><i className="ri-mail-forbid-line"></i>No Stripe · No customer email · No provider change</p>
              <p className="flex items-center gap-1"><i className="ri-error-warning-line"></i>May once more block same-email resubmission</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreOrder}
                disabled={restoringOrder}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoringOrder
                  ? <><i className="ri-loader-4-line animate-spin"></i>Restoring...</>
                  : <><i className="ri-arrow-go-back-line"></i>Yes, Restore / Reopen</>
                }
              </button>
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(false)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPS-ORDER-ARCHIVE-VOID-FLOW: Archive/Void confirmation modal */}
      {showArchiveConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/50">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-xl flex-shrink-0">
                <i className="ri-archive-fill text-orange-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Archive / Void This Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Order <span className="font-mono text-gray-700">{order.confirmation_id}</span> will be marked as archived/voided. History stays. Customer can resubmit with the same email.
                </p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 space-y-1 text-xs text-orange-800">
              <p className="font-bold">{fullName}</p>
              <p>{order.email}</p>
              <p className="flex items-center gap-1"><i className="ri-shield-check-line"></i>Notes, comms, assessment, payment history, audit trail preserved</p>
              <p className="flex items-center gap-1"><i className="ri-mail-forbid-line"></i>No Stripe refund · No customer email · No provider change</p>
              <p className="flex items-center gap-1"><i className="ri-user-add-line"></i>Customer can start a fresh order with the same email</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Reason</label>
              <select
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
              >
                <option value="">— Select a reason —</option>
                <option value="Duplicate / replacement assessment">Duplicate / replacement assessment</option>
                <option value="Customer resubmitted">Customer resubmitted</option>
                <option value="Test order">Test order</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleArchiveOrder}
                disabled={archivingOrder || !archiveReason}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {archivingOrder
                  ? <><i className="ri-loader-4-line animate-spin"></i>Archiving...</>
                  : <><i className="ri-archive-line"></i>Yes, Archive / Void</>
                }
              </button>
              <button
                type="button"
                onClick={() => { setShowArchiveConfirm(false); setArchiveReason(""); }}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteOrderConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/50">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-delete-bin-2-fill text-red-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Permanently Delete Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will <strong>permanently delete</strong> order <span className="font-mono text-gray-700">{order.confirmation_id}</span> and all its documents, notes, and status history. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 space-y-1 text-xs text-red-700">
              <p className="font-bold">{fullName}</p>
              <p>{order.email}</p>
              {order.payment_intent_id && <p className="flex items-center gap-1"><i className="ri-money-dollar-circle-line"></i>Paid order — payment record in Stripe will remain</p>}
              <p className="flex items-center gap-1"><i className="ri-file-shred-line"></i>All documents, notes, status logs &amp; earnings records will be deleted</p>
              <p className="flex items-center gap-1"><i className="ri-logout-box-r-line"></i>If this is their only order, their login account will also be deleted</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                Type <span className="font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                className="w-full px-3 py-2.5 border border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-500 bg-white"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteOrder}
                disabled={deletingOrder || deleteConfirmText !== "DELETE"}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingOrder
                  ? <><i className="ri-loader-4-line animate-spin"></i>Deleting...</>
                  : <><i className="ri-delete-bin-2-line"></i>Yes, Delete Permanently</>
                }
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteOrderConfirm(false); setDeleteConfirmText(""); }}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Order Confirmation ── */}
      {showCancelConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/50">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-xl flex-shrink-0">
                <i className="ri-close-circle-fill text-orange-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Cancel This Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Order <span className="font-mono text-gray-700">{order.confirmation_id}</span> for <strong>{fullName}</strong> will be marked as cancelled.
                </p>
              </div>
            </div>

            {/* Refund option — only for paid orders with a payment intent */}
            {order.payment_intent_id ? (
              isFinanceRole ? (
                /* Finance role — show locked refund option with approval request */
                <div className="flex items-start gap-3 rounded-xl p-3 mb-4 border border-orange-200 bg-orange-50">
                  <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                    <i className="ri-lock-2-line text-orange-600 text-sm"></i>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-orange-800">Refund Restricted — Finance Role</p>
                    <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
                      Finance users cannot issue refunds directly. You can request approval from an Owner or Admin Manager.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowCancelConfirm(false); setShowRefundApproval(true); }}
                      className="whitespace-nowrap mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors"
                    >
                      <i className="ri-send-plane-line"></i>Request Refund Approval
                    </button>
                  </div>
                </div>
              ) : (
              <div
                className={`flex items-start gap-3 rounded-xl p-3 mb-4 border cursor-pointer transition-colors ${cancelWithRefund ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
                onClick={() => setCancelWithRefund((v) => !v)}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${cancelWithRefund ? "bg-emerald-600 border-emerald-600" : "border-gray-400"}`}
                >
                  {cancelWithRefund && <i className="ri-check-line text-white" style={{ fontSize: "11px" }}></i>}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800">Issue Full Refund via Stripe</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {order.price != null ? `$${order.price.toFixed(2)}` : "Full amount"} will be refunded to the customer&apos;s original payment method. Takes 5-10 business days.
                  </p>
                </div>
              </div>
              )
            ) : (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <i className="ri-information-line text-amber-600 flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-amber-800">
                  No Stripe payment linked to this order — cancellation will update the status only. No refund will be issued.
                </p>
              </div>
            )}

            {/* Cancel note */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Internal Note (optional)</label>
              <textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value.slice(0, 300))}
                rows={2}
                placeholder="Reason for cancellation, e.g. customer requested via email..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none"
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">{cancelNote.length}/300</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
              <p className="text-xs text-amber-800 flex items-start gap-1 leading-relaxed">
                <i className="ri-information-line flex-shrink-0 mt-0.5"></i>
                A cancellation email will be sent to the customer at <strong>{order.email}</strong>.
                {cancelWithRefund && order.payment_intent_id ? " A full Stripe refund will also be processed." : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancellingOrder}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                {cancellingOrder
                  ? <><i className="ri-loader-4-line animate-spin"></i>{cancelWithRefund && order.payment_intent_id ? "Refunding & Cancelling..." : "Cancelling..."}</>
                  : <><i className="ri-close-circle-line"></i>{cancelWithRefund && order.payment_intent_id ? "Cancel & Refund" : "Cancel Order"}</>
                }
              </button>
              <button
                type="button"
                onClick={() => { setShowCancelConfirm(false); setCancelNote(""); setCancelWithRefund(false); }}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Keep Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset to Under Review Confirmation ── */}      {showResetConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-arrow-go-back-fill text-red-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Reset to Under Review?</p>
                <p className="text-xs text-gray-500 mt-1">
                  This will roll back the order to a pre-letter state. The submitted letter and delivery status will be cleared. The provider assignment will be kept.
                </p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 space-y-2">
              <p className="text-xs text-red-800 font-semibold flex items-center gap-1">
                <i className="ri-notification-3-line"></i>
                Provider will be notified of this change.
              </p>
              <p className="text-xs text-red-800 font-semibold flex items-center gap-1">
                <i className="ri-mail-send-line"></i>
                Patient will <strong>not</strong> be notified of this change.
              </p>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
              <i className="ri-information-line mr-1"></i>
              The patient will <strong>not</strong> be automatically notified of this reversal. Proceed only if the order needs correction.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  handleSetStatus("under-review", "in_review");
                }}
                disabled={resetting}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                <i className="ri-arrow-go-back-line"></i>Yes, Reset Order
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 30-Day Reissue Confirmation ── */}
      {showThirtyDayConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-xl flex-shrink-0">
                <i className="ri-time-fill text-orange-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">30-Day Period Completed?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will move the order back to <strong>Under Review</strong> and notify the assigned provider to issue the official letter. The order state is <strong>{order.state}</strong>.
                </p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 space-y-2">
              <p className="text-xs text-orange-800 font-semibold flex items-center gap-1.5">
                <i className="ri-notification-3-line"></i>
                In-portal notification: &ldquo;30-day period completed. Please issue the official letter.&rdquo;
              </p>
              <p className="text-xs text-orange-800 font-semibold flex items-center gap-1.5">
                <i className="ri-mail-send-line"></i>
                Email notification: 30-Day Reminder email will be sent to the assigned provider.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleThirtyDayReissue} disabled={thirtyDayLoading}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                {thirtyDayLoading ? <><i className="ri-loader-4-line animate-spin"></i>Processing...</> : <><i className="ri-time-fill"></i>Yes, Request Official Letter</>}
              </button>
              <button type="button" onClick={() => setShowThirtyDayConfirm(false)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Provider Confirmation ── */}
      {showRemoveProviderConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/50">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-user-unfollow-fill text-red-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Remove Provider Assignment?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will unassign <strong>{order.doctor_name ?? order.doctor_email}</strong> from order{" "}
                  <span className="font-mono text-gray-700">{order.confirmation_id}</span> and mark it as{" "}
                  <strong className="text-sky-700">Paid (Unassigned)</strong>.
                </p>
              </div>
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-4 space-y-1.5 text-xs text-sky-800">
              <p className="flex items-center gap-1.5 font-semibold">
                <i className="ri-information-line"></i>
                The order will be removed from the provider&apos;s portal immediately.
              </p>
              <p className="flex items-center gap-1.5">
                <i className="ri-user-add-line"></i>
                You can reassign it to any available provider afterwards.
              </p>
              <p className="flex items-center gap-1.5">
                <i className="ri-mail-close-line"></i>
                The provider will NOT be notified of this removal.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRemoveProvider}
                disabled={removingProvider}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                {removingProvider
                  ? <><i className="ri-loader-4-line animate-spin"></i>Removing...</>
                  : <><i className="ri-user-unfollow-line"></i>Yes, Remove Provider</>
                }
              </button>
              <button
                type="button"
                onClick={() => setShowRemoveProviderConfirm(false)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finance Refund Approval Request ── */}
      {showRefundApproval && (
        <ApprovalRequestModal
          actionType="refund"
          actionLabel="Issue Refund"
          actionDescription={`Request to issue a refund for order ${order.confirmation_id} (${[order.first_name, order.last_name].filter(Boolean).join(" ") || order.email}). As a Finance user, refunds require Owner or Admin Manager approval.`}
          payload={{
            confirmationId: order.confirmation_id,
            amount: order.price ?? undefined,
            refundType: "full",
          }}
          requesterName={adminProfile.full_name}
          requesterRole={adminProfile.role ?? "finance"}
          requesterUserId={adminProfile.user_id}
          onClose={() => setShowRefundApproval(false)}
        />
      )}

      {/* ── Finance Delete Approval Request ── */}
      {showDeleteApproval && (
        <ApprovalRequestModal
          actionType="bulk_delete"
          actionLabel="Delete Order"
          actionDescription={`Request to permanently delete order ${order.confirmation_id} for ${[order.first_name, order.last_name].filter(Boolean).join(" ") || order.email}. As a Finance user, order deletion requires Owner or Admin Manager approval.`}
          payload={{
            confirmationId: order.confirmation_id,
            orderIds: [order.id],
            orderCount: 1,
          }}
          requesterName={adminProfile.full_name}
          requesterRole={adminProfile.role ?? "finance"}
          requesterUserId={adminProfile.user_id}
          onClose={() => setShowDeleteApproval(false)}
        />
      )}

      {/* ── Reopen Confirmation Dialog ── */}
      {showReopenConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-xl flex-shrink-0">
                <i className="ri-error-warning-fill text-amber-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Reopen Completed Order?</p>
                <p className="text-xs text-gray-500 mt-1">
                  This order is marked as <strong className="text-emerald-700">Completed</strong> and the patient has been notified. Moving it back to &ldquo;Under Review&rdquo; will change the visible status.
                </p>
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
              <i className="ri-information-line mr-1"></i>
              The patient will <strong>not</strong> be notified of this reversal. Proceed only if the order needs correction.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReopenConfirm(false);
                  handleSetStatus("under-review", "in_review");
                }}
                disabled={statusUpdating}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                <i className="ri-arrow-go-back-line"></i>Yes, Reopen Order
              </button>
              <button
                type="button"
                onClick={() => setShowReopenConfirm(false)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
