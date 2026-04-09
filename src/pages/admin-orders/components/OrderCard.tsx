// OrderCard — Mobile card + Desktop table row (expandable)
import { useState } from "react";
import OrderNotesPanel from "./OrderNotesPanel";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Order {
  id: string; confirmation_id: string; email: string; phone: string | null;
  first_name: string | null; last_name: string | null; state: string | null;
  plan_type: string | null; delivery_speed: string | null; selected_provider: string | null;
  price: number | null; payment_intent_id: string | null; payment_method: string | null;
  status: string; doctor_status: string | null; doctor_user_id: string | null;
  doctor_name: string | null; doctor_email: string | null; letter_url: string | null;
  signed_letter_url: string | null; patient_notification_sent_at: string | null;
  assessment_answers: Record<string, unknown> | null; created_at: string;
  ghl_synced_at: string | null; ghl_sync_error: string | null; last_contacted_at: string | null;
  email_log?: { type: string; sentAt: string; to: string; success: boolean }[] | null;
  referred_by: string | null; sent_followup_at?: string | null; addon_services?: string[] | null;
  refunded_at?: string | null; refund_amount?: number | null; dispute_id?: string | null;
  dispute_status?: string | null; dispute_reason?: string | null; dispute_created_at?: string | null;
  fraud_warning?: boolean | null; fraud_warning_at?: string | null;
  subscription_status?: string | null; letter_type?: string | null;
  payment_failure_reason?: string | null; payment_failed_at?: string | null;
  seq_30min_sent_at?: string | null; seq_24h_sent_at?: string | null; seq_3day_sent_at?: string | null;
  followup_opt_out?: boolean | null; seq_opted_out_at?: string | null;
}

export interface DoctorContact {
  id: string; full_name: string; email: string; phone: string | null;
  licensed_states: string[]; is_active: boolean | null;
}

interface AdminProfile { id: string; user_id: string; full_name: string; email: string | null; role: string | null; }
interface PendingAssign { confirmationId: string; doctorEmail: string; doctorName: string; }

export interface OrderCardProps {
  order: Order; isExpanded: boolean; onToggleExpand: () => void;
  isSelected: boolean; onToggleSelect: () => void;
  notesOpen: boolean; onToggleNotes: () => void;
  assignableProviders: DoctorContact[]; pendingAssign: PendingAssign | null;
  onSetPendingAssign: (pa: PendingAssign) => void; onCancelPendingAssign: () => void;
  onConfirmAssign: (cid: string, email: string) => void;
  assigning: string | null; assignMsg: Record<string, string>;
  ghlRefiring: string | null; onGhlRefire: (cid: string) => void;
  ghlReFireResult: Record<string, { ok: boolean; msg: string }>;
  recoveryMsg: Record<string, { ok: boolean; msg: string }>; onOpenRecovery: (order: Order) => void;
  onSendRecoveryDirect?: (order: Order) => void; sendingRecoveryDirect?: string | null;
  unreadCommsMap: Record<string, number>; noteCount: number; adminProfile: AdminProfile | null;
  onOpenDetail: (order: Order) => void; onOpenStatusLog: (order: Order) => void;
  onOpenAssessmentIntake: (order: Order) => void;
  onToggleOptOut?: (order: Order) => void;
  coveredStates: Set<string>; duplicateEmailSet: Set<string>;
  US_STATES: { name: string; abbr: string }[];
}

// ─── Referral source config ───────────────────────────────────────────────────
const REF_BADGE: Record<string, { label: string; icon: string; color: string }> = {
  "Facebook / Instagram Ads": { label: "Facebook",  icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50 border-blue-200" },
  "Google Ads":               { label: "Google",    icon: "ri-google-line",          color: "text-orange-600 bg-orange-50 border-orange-200" },
  "Google Organic":           { label: "Organic",   icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  "TikTok Ads":               { label: "TikTok",    icon: "ri-tiktok-line",          color: "text-gray-900 bg-gray-100 border-gray-300" },
  "Instagram Ads":            { label: "Instagram", icon: "ri-instagram-line",       color: "text-pink-600 bg-pink-50 border-pink-200" },
  "Twitter / X":              { label: "Twitter/X", icon: "ri-twitter-x-line",       color: "text-gray-800 bg-gray-100 border-gray-300" },
  "YouTube Ads":              { label: "YouTube",   icon: "ri-youtube-line",         color: "text-red-600 bg-red-50 border-red-200" },
  "Email Campaign":           { label: "Email",     icon: "ri-mail-send-line",       color: "text-violet-600 bg-violet-50 border-violet-200" },
  "Referral":                 { label: "Referral",  icon: "ri-share-forward-line",   color: "text-teal-600 bg-teal-50 border-teal-200" },
  "Direct":                   { label: "Direct",    icon: "ri-cursor-line",          color: "text-gray-600 bg-gray-50 border-gray-200" },
  // Legacy short keys
  facebook:     { label: "Facebook",  icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50 border-blue-200" },
  google_ads:   { label: "Google",    icon: "ri-google-line",          color: "text-orange-600 bg-orange-50 border-orange-200" },
  social_media: { label: "Social",    icon: "ri-share-circle-line",    color: "text-pink-600 bg-pink-50 border-pink-200" },
  seo:          { label: "Organic",   icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
};

function resolveRefBadge(referredBy: string | null): { label: string; icon: string; color: string } | null {
  if (!referredBy) return null;
  if (REF_BADGE[referredBy]) return REF_BADGE[referredBy];
  const lower = referredBy.toLowerCase();
  if (lower.includes("facebook") || lower.includes("instagram")) return REF_BADGE["Facebook / Instagram Ads"];
  if (lower.includes("google") && lower.includes("organic")) return REF_BADGE["Google Organic"];
  if (lower.includes("google")) return REF_BADGE["Google Ads"];
  if (lower.includes("tiktok")) return REF_BADGE["TikTok Ads"];
  if (lower.includes("twitter") || lower.includes("/ x")) return REF_BADGE["Twitter / X"];
  if (lower.includes("youtube")) return REF_BADGE["YouTube Ads"];
  if (lower.includes("email")) return REF_BADGE["Email Campaign"];
  if (lower.includes("referral")) return REF_BADGE["Referral"];
  if (lower.includes("seo") || lower.includes("organic")) return REF_BADGE["Google Organic"];
  if (lower.includes("direct")) return REF_BADGE["Direct"];
  return { label: referredBy.slice(0, 10), icon: "ri-share-circle-line", color: "text-gray-600 bg-gray-50 border-gray-200" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isPSDOrder(o: Pick<Order, "letter_type" | "confirmation_id">) {
  return o.letter_type === "psd" || o.confirmation_id.includes("-PSD");
}
function isPriorityOrder(o: Pick<Order, "price">) { return (o.price ?? 0) > 130; }

function getOrderDisplayStatus(o: Order): { label: string; color: string } {
  if (o.status === "disputed" || o.dispute_id) return { label: "Disputed", color: "bg-red-100 text-red-700" };
  if (o.fraud_warning) return { label: "Fraud Warning", color: "bg-red-200 text-red-800" };
  if (o.status === "refunded" || o.refunded_at) return { label: "Refunded", color: "bg-red-100 text-red-600" };
  if (o.doctor_status === "patient_notified" || o.doctor_status === "completed") return { label: "Completed", color: "bg-emerald-100 text-emerald-700" };
  if (o.status === "lead" || !o.payment_intent_id) {
    if (o.payment_failure_reason) return { label: "Payment Failed", color: "bg-red-100 text-red-700" };
    return { label: "Lead (Unpaid)", color: "bg-amber-100 text-amber-700" };
  }
  // Rejected or manually unassigned — show as Paid · Unassigned so it can be reassigned
  if (
    o.doctor_status === "provider_rejected" ||
    o.doctor_status === "unassigned" ||
    (!o.doctor_email && !o.doctor_user_id)
  ) {
    return { label: "Paid · Unassigned", color: "bg-sky-100 text-sky-700" };
  }
  return { label: "Under Review", color: "bg-violet-100 text-violet-700" };
}

function getLastActivity(o: Order) {
  const c: { ts: number; channel: string }[] = [];
  if (o.last_contacted_at) c.push({ ts: new Date(o.last_contacted_at).getTime(), channel: "SMS/Call" });
  if (o.patient_notification_sent_at) c.push({ ts: new Date(o.patient_notification_sent_at).getTime(), channel: "Letter" });
  if (o.sent_followup_at) c.push({ ts: new Date(o.sent_followup_at).getTime(), channel: "Follow-up" });
  if (Array.isArray(o.email_log)) o.email_log.forEach((e) => { try { const t = new Date(e.sentAt).getTime(); if (!isNaN(t)) c.push({ ts: t, channel: "Email" }); } catch { /**/ } });
  if (!c.length) return { label: "No contact", fullLabel: "Never contacted", color: "text-gray-300", bgColor: "bg-gray-50 border-gray-100", dotColor: "bg-gray-200", icon: "ri-chat-off-line", hasActivity: false };
  const latest = c.reduce((a, b) => a.ts > b.ts ? a : b);
  const mins = Math.floor((Date.now() - latest.ts) / 60000);
  const hrs = Math.floor(mins / 60); const days = Math.floor(hrs / 24);
  const label = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : days === 1 ? "1 day ago" : `${days}d ago`;
  const color = days >= 7 ? "text-red-600" : days >= 3 ? "text-orange-700" : days >= 1 ? "text-amber-700" : "text-emerald-700";
  const bgColor = days >= 7 ? "bg-red-50 border-red-200" : days >= 3 ? "bg-orange-50 border-orange-200" : days >= 1 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200";
  const dotColor = days >= 7 ? "bg-red-400" : days >= 3 ? "bg-orange-400" : days >= 1 ? "bg-amber-400" : "bg-emerald-400";
  return { label, fullLabel: `${latest.channel} · ${label}`, color, bgColor, dotColor, icon: "ri-time-line", hasActivity: true };
}

function fmtGhlSync(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}
function fmtRelative(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d < 7 ? `${d}d ago` : new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDate(ts: string) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }); }

function getSeqStatus(o: Order): { label: string; color: string; icon: string } | null {
  if (!o.seq_30min_sent_at && !o.seq_24h_sent_at && !o.seq_3day_sent_at) return null;
  if (o.followup_opt_out) return { label: "Opted Out", color: "bg-gray-100 text-gray-400", icon: "ri-mail-forbid-line" };
  if (o.seq_3day_sent_at) return { label: "3-day sent", color: "bg-violet-100 text-violet-700", icon: "ri-coupon-3-line" };
  if (o.seq_24h_sent_at) return { label: "24h sent", color: "bg-amber-100 text-amber-700", icon: "ri-time-line" };
  if (o.seq_30min_sent_at) return { label: "30min sent", color: "bg-sky-100 text-sky-700", icon: "ri-mail-send-line" };
  return null;
}
function doctorStatusLabel(s: string | null, assigned: boolean) {
  if (!assigned) return "Unassigned"; if (!s) return "Pending";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
const DOCTOR_STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700", in_review: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700", letter_sent: "bg-[#e8f5f1] text-[#1a5c4f]",
  patient_notified: "bg-violet-100 text-violet-700", unassigned: "bg-gray-100 text-gray-500",
  thirty_day_reissue: "bg-orange-100 text-orange-700",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderCard({
  order, isExpanded, onToggleExpand, isSelected, onToggleSelect,
  notesOpen, onToggleNotes, assignableProviders, pendingAssign,
  onSetPendingAssign, onCancelPendingAssign, onConfirmAssign,
  assigning, assignMsg, ghlRefiring, onGhlRefire, ghlReFireResult,
  recoveryMsg, onOpenRecovery, onSendRecoveryDirect, sendingRecoveryDirect, unreadCommsMap, noteCount, adminProfile,
  onOpenDetail, onOpenStatusLog, onOpenAssessmentIntake,
  onToggleOptOut,
  coveredStates, duplicateEmailSet, US_STATES,
}: OrderCardProps) {
  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
  const initials = fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const isPSD = isPSDOrder(order);
  const isPriority = isPriorityOrder(order);
  const displayStatus = getOrderDisplayStatus(order);
  const lastActivity = getLastActivity(order);
  const isAssigned = !!(order.doctor_email || order.doctor_user_id);
  const stateName = US_STATES.find((s) => s.abbr === order.state)?.name ?? order.state ?? "—";
  const isAssigningThis = assigning === order.confirmation_id;
  const msg = assignMsg[order.confirmation_id];
  const unreadComms = unreadCommsMap[order.confirmation_id] ?? 0;
  const isPendingThisAssign = pendingAssign?.confirmationId === order.confirmation_id;
  const isLead = order.status === "lead" || !order.payment_intent_id;
  const seqStatus = getSeqStatus(order);
  const isRefunded = order.status === "refunded" || !!order.refunded_at;
  const isCompleted = order.doctor_status === "patient_notified" || order.doctor_status === "completed";
  const showAssignSection = !isLead && !isRefunded && !isCompleted;
  const showRecovery = isLead;
  const showGhlRefire = !order.ghl_synced_at;
  const hasPaymentFailure = !!(order.payment_failure_reason && isLead);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const borderAccent = hasPaymentFailure
    ? "border-l-4 border-l-red-400"
    : order.doctor_status === "thirty_day_reissue"
    ? "border-l-4 border-l-orange-400"
    : isPSD
    ? "border-l-4 border-l-amber-400"
    : "";

  // ── GHL Call handler ──────────────────────────────────────────────────────
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleGhlCall = async (e: React.MouseEvent) => {
    stop(e);
    if (!order.phone) return;
    setCalling(true);
    setCallMsg(null);
    try {
      // Use the authenticated session token — NOT the anon key
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      if (!token) {
        setCallMsg({ ok: false, msg: "Not authenticated — please log in again" });
        setCalling(false);
        return;
      }
      const res = await fetch(`${supabaseUrl}/functions/v1/make-outbound-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          toPhone: order.phone,
          orderId: order.id,
          confirmationId: order.confirmation_id,
          sentBy: "Admin",
        }),
      });
      const data = await res.json() as { ok: boolean; sid?: string; status?: string; message?: string; error?: string };
      setCallMsg({ ok: data.ok, msg: data.ok ? `Call initiated — ${data.status ?? "connecting"}` : (data.error ?? "Call failed") });
      setTimeout(() => setCallMsg(null), 6000);
    } catch {
      setCallMsg({ ok: false, msg: "Network error — please try again" });
      setTimeout(() => setCallMsg(null), 4000);
    }
    setCalling(false);
  };

  // ── Shared expanded details panel (used by both mobile and desktop) ─────────
  const ExpandedDetails = () => (
    <div className="space-y-4">
      {/* Payment failure alert banner + one-click recovery */}
      {hasPaymentFailure && (
        <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-bank-card-line text-red-500 text-sm"></i>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-red-700 mb-0.5">Payment Failed</p>
              <p className="text-xs text-red-600 leading-relaxed">{order.payment_failure_reason}</p>
              {order.payment_failed_at && (
                <p className="text-[10px] text-red-400 mt-0.5">{fmtRelative(order.payment_failed_at)}</p>
              )}
            </div>
          </div>
          {/* One-click recovery CTA */}
          <div className="border-t border-red-200 px-3 py-2 flex items-center justify-between gap-2 bg-red-100/40">
            <p className="text-[10px] text-red-500 leading-tight">
              Send a recovery email with a direct checkout link
            </p>
            {onSendRecoveryDirect && (
              <button
                type="button"
                onClick={(e) => { stop(e); onSendRecoveryDirect(order); }}
                disabled={sendingRecoveryDirect === order.confirmation_id || recoveryMsg[order.confirmation_id]?.ok}
                className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition-colors disabled:opacity-60 flex-shrink-0 ${
                  recoveryMsg[order.confirmation_id]?.ok
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                }`}
              >
                {sendingRecoveryDirect === order.confirmation_id
                  ? <><i className="ri-loader-4-line animate-spin"></i>Sending…</>
                  : recoveryMsg[order.confirmation_id]?.ok
                  ? <><i className="ri-mail-check-line"></i>Sent!</>
                  : <><i className="ri-mail-send-line"></i>Send Recovery Email</>
                }
              </button>
            )}
          </div>
        </div>
      )}
      {/* Contact */}
      <div className="flex flex-wrap gap-3">
        <a href={`mailto:${order.email}`} onClick={stop}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#1a5c4f] transition-colors">
          <i className="ri-mail-line text-gray-400 text-xs"></i>{order.email}
        </a>
        {order.phone
          ? <a href={`tel:${order.phone}`} onClick={stop} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#1a5c4f] transition-colors">
              <i className="ri-phone-line text-gray-400 text-xs"></i>{order.phone}
            </a>
          : <span className="flex items-center gap-1.5 text-xs text-orange-400"><i className="ri-phone-line text-xs"></i>No phone</span>
        }
      </div>
      {/* Meta chips */}
      <div className="flex flex-wrap gap-1.5">
        {order.ghl_synced_at
          ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-semibold"><i className="ri-checkbox-circle-fill text-xs"></i>GHL {fmtGhlSync(order.ghl_synced_at)}</span>
          : order.ghl_sync_error
          ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-semibold"><i className="ri-error-warning-line text-xs"></i>GHL fail</span>
          : <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-400 rounded-lg text-[10px] font-semibold"><i className="ri-time-line text-xs"></i>GHL pending</span>
        }
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${lastActivity.bgColor} ${lastActivity.color}`}>
          <i className={`${lastActivity.icon} text-xs`}></i>
          {lastActivity.hasActivity ? `Last: ${lastActivity.fullLabel}` : "No contact yet"}
        </span>
        {isAssigned && order.doctor_status && (
          <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-semibold ${DOCTOR_STATUS_COLOR[order.doctor_status] ?? "bg-gray-100 text-gray-500"}`}>
            <i className="ri-stethoscope-line text-xs mr-1"></i>{doctorStatusLabel(order.doctor_status, isAssigned)}
          </span>
        )}
        {order.doctor_name && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#f0faf7] text-[#1a5c4f] rounded-lg text-[10px] font-semibold">
            <i className="ri-user-heart-line text-xs"></i>{order.doctor_name}
          </span>
        )}
        {order.state && !coveredStates.has(order.state) && !isLead && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">
            <i className="ri-error-warning-fill text-xs"></i>No Coverage
          </span>
        )}
        {Array.isArray(order.addon_services) && order.addon_services.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-extrabold">
            <i className="ri-vip-crown-fill text-xs"></i>VIP · {order.addon_services.length} add-on
          </span>
        )}
        {order.assessment_answers && (
          <button type="button" onClick={(e) => { stop(e); onOpenAssessmentIntake(order); }}
            className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-semibold cursor-pointer hover:bg-orange-100 transition-colors">
            <i className="ri-file-list-3-line text-xs"></i>Intake
          </button>
        )}
        {/* Sequence status chip */}
        {seqStatus && (
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${seqStatus.color}`}>
            <i className={`${seqStatus.icon} text-xs`}></i>{seqStatus.label}
          </span>
        )}
        {/* Opt-out toggle — only for leads */}
        {isLead && (order.seq_30min_sent_at || order.seq_24h_sent_at || order.seq_3day_sent_at) && onToggleOptOut && (
          <button
            type="button"
            onClick={(e) => { stop(e); onToggleOptOut(order); }}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
              order.followup_opt_out
                ? "bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700"
                : "bg-red-50 text-red-600 hover:bg-red-100"
            }`}
            title={order.followup_opt_out ? "Re-enable automated follow-ups" : "Stop automated follow-ups for this lead"}
          >
            <i className={`text-xs ${order.followup_opt_out ? "ri-mail-check-line" : "ri-mail-forbid-line"}`}></i>
            {order.followup_opt_out ? "Re-enable Sequence" : "Stop Sequence"}
          </button>
        )}
      </div>
      {/* Assign (if applicable) */}
      {showAssignSection && (
        <div className="space-y-2">
          <div className="relative">
            <select
              value={isPendingThisAssign ? pendingAssign!.doctorEmail : (order.doctor_email ?? "")}
              onChange={(e) => { if (e.target.value) { const doc = assignableProviders.find((d) => d.email === e.target.value); onSetPendingAssign({ confirmationId: order.confirmation_id, doctorEmail: e.target.value, doctorName: doc?.full_name ?? e.target.value }); } }}
              disabled={isAssigningThis} onClick={stop}
              className="w-full sm:w-64 appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer disabled:opacity-60">
              <option value="">— {order.doctor_name ? "Reassign" : "Assign"} Provider —</option>
              {assignableProviders.filter((d) => { if (d.is_active === false) return false; const sName = US_STATES.find((s) => s.abbr === order.state)?.name ?? ""; const sAbbr = order.state ?? ""; const states = d.licensed_states ?? []; return !sAbbr || states.includes(sAbbr) || states.includes(sName) || states.some((st) => US_STATES.find((u) => u.name === st)?.abbr === sAbbr); }).map((doc) => (
                <option key={doc.id} value={doc.email}>{doc.full_name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
              {isAssigningThis ? <i className="ri-loader-4-line animate-spin text-gray-400 text-sm"></i> : <i className="ri-arrow-down-s-line text-gray-400 text-sm"></i>}
            </div>
          </div>
          {isPendingThisAssign && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={(e) => { stop(e); onConfirmAssign(pendingAssign!.confirmationId, pendingAssign!.doctorEmail); onCancelPendingAssign(); }} disabled={isAssigningThis}
                className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60 transition-colors">
                {isAssigningThis ? <><i className="ri-loader-4-line animate-spin"></i>Assigning…</> : <><i className="ri-check-line"></i>Confirm · {pendingAssign!.doctorName}</>}
              </button>
              <button type="button" onClick={(e) => { stop(e); onCancelPendingAssign(); }} className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">Cancel</button>
            </div>
          )}
          {msg && !isPendingThisAssign && (
            <p className={`text-xs flex items-center gap-1 ${msg === "Assigned & notified" ? "text-[#1a5c4f]" : "text-red-500"}`}>
              <i className={msg === "Assigned & notified" ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{msg}
            </p>
          )}
        </div>
      )}
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={(e) => { stop(e); onOpenDetail(order); }}
          className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-[#17504a] transition-colors">
          <i className="ri-eye-line"></i>View Details
          {unreadComms > 0 && <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[9px] font-extrabold rounded-full">{unreadComms}</span>}
        </button>
        {isAssigned && (
          <a href={`/provider-portal?order=${order.confirmation_id}`} target="_blank" rel="noopener noreferrer" onClick={stop}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-[#b8ddd5] bg-[#f0faf7] text-[#1a5c4f] hover:bg-[#e0f2ec] rounded-lg cursor-pointer transition-colors">
            <i className="ri-external-link-line"></i>Provider View
          </a>
        )}
        {/* GHL Call button */}
        {order.phone && (
          <button
            type="button"
            onClick={handleGhlCall}
            disabled={calling}
            title={`Call ${order.phone} via GHL`}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
          >
            {calling
              ? <><i className="ri-loader-4-line animate-spin"></i>Calling…</>
              : <><i className="ri-phone-line"></i>Call via GHL</>
            }
          </button>
        )}
      </div>
      {callMsg && (
        <p className={`text-xs flex items-center gap-1 ${callMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
          <i className={callMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {callMsg.msg}
        </p>
      )}
      {ghlReFireResult[order.confirmation_id] && (
        <p className={`text-xs flex items-center gap-1 ${ghlReFireResult[order.confirmation_id].ok ? "text-emerald-600" : "text-red-500"}`}>
          <i className={ghlReFireResult[order.confirmation_id].ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {ghlReFireResult[order.confirmation_id].msg.slice(0, 80)}
        </p>
      )}
      {notesOpen && adminProfile && (
        <div onClick={stop}>
          <OrderNotesPanel orderId={order.id} confirmationId={order.confirmation_id}
            adminUserId={adminProfile.user_id} adminName={adminProfile.full_name} onClose={onToggleNotes} />
        </div>
      )}
    </div>
  );

  // ─── Expand animation wrapper ─────────────────────────────────────────────
  const expandStyle = { display: "grid" as const, gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 240ms ease" };

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE CARD LAYOUT  (< lg — unchanged)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={`lg:hidden bg-white rounded-xl border border-gray-100 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-200 group cursor-pointer ${borderAccent}`} onClick={onToggleExpand}>
        {/* Payment failed inline banner on collapsed card */}
        {hasPaymentFailure && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-0">
            <i className="ri-bank-card-line text-red-500 text-xs flex-shrink-0"></i>
            <p className="text-[10px] font-bold text-red-600 truncate">
              Payment Failed: {order.payment_failure_reason}
            </p>
          </div>
        )}
        {/* Collapsed header */}
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="hidden sm:flex items-center flex-shrink-0" onClick={stop}>
            <button type="button" onClick={onToggleSelect}
              className="w-4 h-4 flex items-center justify-center rounded border-2 transition-colors cursor-pointer flex-shrink-0"
              style={{ borderColor: isSelected ? "#1a5c4f" : "#d1d5db", backgroundColor: isSelected ? "#1a5c4f" : "white" }}>
              {isSelected && <i className="ri-check-line text-white" style={{ fontSize: "8px" }}></i>}
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-gray-900 truncate group-hover:text-[#1a5c4f] transition-colors">{fullName}</p>
              {unreadComms > 0 && <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[9px] font-extrabold rounded-full">{unreadComms}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400">{stateName}</span>
              {isPSD ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-extrabold">PSD</span>
                     : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] rounded text-[10px] font-extrabold">ESA</span>}
              {isPriority && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#1a5c4f] text-white rounded text-[10px] font-extrabold"><i className="ri-vip-crown-2-line" style={{ fontSize: "8px" }}></i>P</span>}
              {duplicateEmailSet.has(order.email.toLowerCase()) && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-extrabold">DUP</span>}
              {(() => {
                const ref = resolveRefBadge(order.referred_by);
                return ref ? (
                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-extrabold ${ref.color}`} title={`Source: ${ref.label}`}>
                    <i className={`${ref.icon}`} style={{ fontSize: "8px" }}></i>
                    {ref.label}
                  </span>
                ) : null;
              })()}
              <span className={`sm:hidden inline-flex items-center gap-0.5 text-[10px] font-semibold ${lastActivity.color}`}><i className={lastActivity.icon} style={{ fontSize: "9px" }}></i>{lastActivity.label}</span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end text-right flex-shrink-0">
            <p className="text-[11px] font-mono text-gray-500">{order.confirmation_id}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(order.created_at)}</p>
            <div className={`flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${lastActivity.bgColor} ${lastActivity.color}`} title={lastActivity.fullLabel}>
              <i className={`${lastActivity.icon}`} style={{ fontSize: "9px" }}></i><span>{lastActivity.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex flex-col items-end gap-0.5">
              <span className={`whitespace-nowrap inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${displayStatus.color}`}>
                {hasPaymentFailure && <i className="ri-bank-card-line text-[10px]"></i>}
                {displayStatus.label}
              </span>
              {hasPaymentFailure && (
                <>
                  <p className="text-[9px] font-semibold text-red-500 leading-tight text-right max-w-[130px] truncate" title={order.payment_failure_reason ?? ""}>
                    {order.payment_failure_reason}
                  </p>
                  {order.payment_failed_at && (
                    <p className="text-[9px] text-red-400 leading-tight flex items-center gap-0.5">
                      <i className="ri-time-line" style={{ fontSize: "8px" }}></i>
                      {fmtRelative(order.payment_failed_at)}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="w-5 h-5 flex items-center justify-center text-gray-300 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
              <i className="ri-arrow-right-s-line text-base"></i>
            </div>
          </div>
        </div>
        {/* Mobile expanded */}
        <div style={expandStyle}><div className="overflow-hidden"><div className="border-t border-gray-50 px-4 pb-5 pt-4" onClick={stop}><ExpandedDetails /></div></div></div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          DESKTOP TABLE ROW LAYOUT  (lg+ only)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={`hidden lg:flex flex-col ${isExpanded ? "bg-gray-50/40" : "bg-white hover:bg-gray-50/60"} transition-colors cursor-pointer ${borderAccent}`} onClick={onToggleExpand}>
        {/* Main row */}
        <div className="flex items-center gap-0 px-4 py-3 min-h-[56px]">
          {/* Checkbox — w-9 */}
          <div className="w-9 flex-shrink-0 flex items-center" onClick={stop}>
            <button type="button" onClick={onToggleSelect}
              className="w-4 h-4 flex items-center justify-center rounded border-2 transition-colors cursor-pointer"
              style={{ borderColor: isSelected ? "#1a5c4f" : "#d1d5db", backgroundColor: isSelected ? "#1a5c4f" : "white" }}>
              {isSelected && <i className="ri-check-line text-white" style={{ fontSize: "8px" }}></i>}
            </button>
          </div>

          {/* Customer — flex-1 */}
          <div className="flex-1 min-w-0 flex items-center gap-2.5 pr-4">
            <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-[#f0faf7] rounded-full text-[#1a5c4f] text-[10px] font-extrabold border border-[#d0ede6]">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
                {unreadComms > 0 && <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 bg-orange-500 text-white text-[8px] font-extrabold rounded-full">{unreadComms}</span>}
              </div>
              <p className="text-[10px] text-gray-400 truncate mt-0.5 max-w-[180px]">{order.email}</p>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {isPSD ? <span className="text-[9px] font-extrabold px-1 py-0.5 bg-amber-100 text-amber-700 rounded">PSD</span>
                       : <span className="text-[9px] font-extrabold px-1 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] rounded">ESA</span>}
                {isPriority && <span className="text-[9px] font-extrabold px-1 py-0.5 bg-[#1a5c4f] text-white rounded">VIP</span>}
                {duplicateEmailSet.has(order.email.toLowerCase()) && <span className="text-[9px] font-extrabold px-1 py-0.5 bg-amber-100 text-amber-700 rounded">DUP</span>}
                {(() => {
                  const ref = resolveRefBadge(order.referred_by);
                  return ref ? (
                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${ref.color}`} title={`Source: ${ref.label}`}>
                      <i className={`${ref.icon}`} style={{ fontSize: "8px" }}></i>
                      {ref.label}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

          {/* Order ID + Date — w-[140px] */}
          <div className="w-[140px] flex-shrink-0 pr-4">
            <p className="text-[11px] font-mono text-gray-600 font-semibold truncate">{order.confirmation_id}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(order.created_at)}</p>
          </div>

          {/* State — w-[64px] */}
          <div className="w-[64px] flex-shrink-0 pr-4">
            <span className="text-xs font-semibold text-gray-700">{order.state ?? "—"}</span>
            {order.state && !coveredStates.has(order.state) && !isLead && (
              <i className="ri-error-warning-fill text-red-400 text-xs ml-1" title="No provider coverage"></i>
            )}
          </div>

          {/* Last Activity — w-[120px] */}
          <div className="w-[120px] flex-shrink-0 pr-4" title={lastActivity.fullLabel}>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lastActivity.dotColor}`}></div>
              <span className={`text-[11px] font-medium truncate ${lastActivity.hasActivity ? "text-gray-500" : "text-gray-300"}`}>
                {lastActivity.hasActivity ? lastActivity.label : "—"}
              </span>
            </div>
            {lastActivity.hasActivity && (
              <p className="text-[9px] text-gray-300 mt-0.5 pl-3 leading-none truncate">
                {lastActivity.fullLabel.split(" · ")[0]}
              </p>
            )}
          </div>

          {/* Status — w-[150px] */}
          <div className="w-[150px] flex-shrink-0 pr-4">
            <span className={`whitespace-nowrap inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${displayStatus.color}`}>
              {hasPaymentFailure && <i className="ri-bank-card-line text-[10px]"></i>}
              {displayStatus.label}
            </span>
            {hasPaymentFailure && (
              <div className="mt-1 space-y-0.5">
                <p className="text-[9px] font-semibold text-red-500 leading-tight truncate max-w-[130px]" title={order.payment_failure_reason ?? ""}>
                  {order.payment_failure_reason}
                </p>
                {order.payment_failed_at && (
                  <p className="text-[9px] text-red-400 leading-tight flex items-center gap-0.5">
                    <i className="ri-time-line" style={{ fontSize: "8px" }}></i>
                    {fmtRelative(order.payment_failed_at)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Sequence Status — w-[100px] */}
          <div className="w-[100px] flex-shrink-0 pr-4">
            {isLead && seqStatus ? (
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold ${seqStatus.color}`}>
                <i className={`${seqStatus.icon} text-[9px]`}></i>
                {seqStatus.label}
              </span>
            ) : isLead ? (
              <span className="text-[10px] text-gray-300 italic">No seq</span>
            ) : (
              <span className="text-[10px] text-gray-300 italic">—</span>
            )}
          </div>

          {/* Provider — w-[110px] */}
          <div className="w-[110px] flex-shrink-0 pr-4">
            {order.doctor_name
              ? <span className="inline-flex items-center gap-1 text-[10px] text-[#1a5c4f] font-semibold truncate max-w-full" title={order.doctor_name}>
                  <i className="ri-user-heart-line flex-shrink-0"></i>
                  <span className="truncate">{order.doctor_name.split(" ")[0]}</span>
                </span>
              : <span className="text-[10px] text-gray-300 italic">—</span>
            }
            <div className="mt-0.5">
              {order.ghl_synced_at
                ? <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600"><i className="ri-checkbox-circle-fill"></i>GHL</span>
                : <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-300"><i className="ri-time-line"></i>GHL pending</span>
              }
            </div>
          </div>

          {/* Pets — w-[60px] */}
          <div className="w-[60px] flex-shrink-0 pr-4">
            {(() => {
              const pets = (order.assessment_answers as Record<string, unknown> | null)?.pets;
              const count = Array.isArray(pets) ? pets.length : null;
              return count != null && count > 0 ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${count > 1 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                  <i className="ri-heart-line" style={{ fontSize: "9px" }}></i>
                  {count}
                </span>
              ) : (
                <span className="text-[10px] text-gray-300 italic">—</span>
              );
            })()}
          </div>

          {/* Time (Delivery Speed) — w-[80px] */}
          <div className="w-[80px] flex-shrink-0 pr-4">
            {order.delivery_speed
              ? <span className="text-xs text-gray-600 font-medium leading-tight">{order.delivery_speed}</span>
              : <span className="text-[10px] text-gray-300 italic">—</span>
            }
          </div>

          {/* Quick actions — w-[110px] */}
          <div className="w-[110px] flex-shrink-0 flex items-center gap-1 flex-wrap" onClick={stop}>
            <button type="button" title="View Details" onClick={(e) => { stop(e); onOpenDetail(order); }}
              className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1a5c4f] hover:bg-[#f0faf7] transition-colors cursor-pointer text-sm">
              <i className="ri-eye-line"></i>
            </button>
            {/* GHL Call button */}
            {order.phone && (
              <button
                type="button"
                title={`Call ${order.phone} via GHL`}
                onClick={handleGhlCall}
                disabled={calling}
                className={`whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer text-sm ${callMsg?.ok ? "text-emerald-600 bg-emerald-50" : "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"} disabled:opacity-50`}
              >
                {calling ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-phone-line"></i>}
              </button>
            )}
            {/* Preview Provider Portal - Admin Preview Mode */}
            {isAssigned && (
              <a 
                href={`/admin/provider-preview?order=${order.confirmation_id}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                onClick={stop}
                title="Preview Provider Portal (Admin View)"
                className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-[#1a5c4f] hover:bg-[#f0faf7] transition-colors cursor-pointer text-sm"
              >
                <i className="ri-external-link-line"></i>
              </a>
            )}
          </div>

          {/* Expand arrow — w-8 */}
          <div className="w-8 flex-shrink-0 flex items-center justify-center text-gray-300">
            <i className="ri-arrow-down-s-line text-base transition-transform duration-200" style={{ display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}></i>
          </div>
        </div>

        {/* Desktop expanded panel */}
        <div style={expandStyle}>
          <div className="overflow-hidden">
            <div className="mx-4 mb-3 bg-white border border-gray-100 rounded-xl px-5 py-4" onClick={stop}>
              <ExpandedDetails />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
