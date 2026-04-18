// Admin Orders + Doctor Management — PawTenant
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import CreateDoctorModal from "./components/CreateDoctorModal";
import EarningsPanel from "./components/EarningsPanel";
import CustomersTab from "./components/CustomersTab";
import TeamTab from "./components/TeamTab";
import PaymentsTab from "./components/PaymentsTab";
import ChangePasswordModal from "./components/ChangePasswordModal";
import OrderNotesPanel from "./components/OrderNotesPanel";
import OrderStatusLogModal from "./components/OrderStatusLogModal";
import OrderDetailModal from "./components/OrderDetailModal";
import DoctorsTab from "./components/DoctorsTab";
import AuditLogTab from "./components/AuditLogTab";
import SettingsTab from "./components/SettingsTab";
import LeadActionsModal from "./components/LeadActionsModal";
import AssessmentIntakeModal from "./components/AssessmentIntakeModal";
import AdminDashboard from "./components/AdminDashboard";
import AnalyticsTab from "./components/AnalyticsTab";
import IncomingCallBanner from "./components/IncomingCallBanner";
import BulkSMSModal from "./components/BulkSMSModal";
import BroadcastModal from "./components/BroadcastModal";
import CommunicationsPanel from "./components/CommunicationsPanel";
import SystemHealthTab from "./components/SystemHealthTab";
import OrderCard from "./components/OrderCard";
import AdminSidebar from "./components/AdminSidebar";
import NotificationsBell from "./components/NotificationsBell";
import ApprovalRequestModal from "./components/ApprovalRequestModal";
import ApprovalsInbox from "./components/ApprovalsInbox";
import ApprovalNotificationBell from "./components/ApprovalNotificationBell";
import FinanceOrdersGate from "./components/FinanceOrdersGate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoctorProfile {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_admin: boolean;
  is_active: boolean;
  licensed_states: string[] | null;
  state_license_numbers?: Record<string, string> | null;
  role: string | null;
  custom_tab_access: string[] | null;
}

interface DoctorContact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  licensed_states: string[];
  is_active: boolean | null;
  /** Keys are 2-letter state abbrs (e.g. "TX"). Used as fallback eligibility check. */
  state_license_numbers?: Record<string, string> | null;
}

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  selected_provider: string | null;
  price: number | null;
  payment_intent_id: string | null;
  payment_method: string | null;
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
  last_contacted_at: string | null;
  email_log?: { type: string; sentAt: string; to: string; success: boolean }[] | null;
  referred_by: string | null;
  sent_followup_at?: string | null;
  addon_services?: string[] | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
  dispute_id?: string | null;
  dispute_status?: string | null;
  dispute_reason?: string | null;
  dispute_created_at?: string | null;
  fraud_warning?: boolean | null;
  fraud_warning_at?: string | null;
  subscription_status?: string | null;
  letter_type?: string | null;
  payment_failure_reason?: string | null;
  payment_failed_at?: string | null;
  seq_30min_sent_at?: string | null;
  seq_24h_sent_at?: string | null;
  seq_3day_sent_at?: string | null;
  followup_opt_out?: boolean | null;
  seq_opted_out_at?: string | null;
  broadcast_opt_out?: boolean | null;
  last_broadcast_sent_at?: string | null;
  source_system?: string | null;
  historical_import?: boolean | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const US_STATES: { name: string; abbr: string }[] = [
  { name: "Alabama", abbr: "AL" }, { name: "Alaska", abbr: "AK" },
  { name: "Arizona", abbr: "AZ" }, { name: "Arkansas", abbr: "AR" },
  { name: "California", abbr: "CA" }, { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" }, { name: "Delaware", abbr: "DE" },
  { name: "Florida", abbr: "FL" }, { name: "Georgia", abbr: "GA" },
  { name: "Hawaii", abbr: "HI" }, { name: "Idaho", abbr: "ID" },
  { name: "Illinois", abbr: "IL" }, { name: "Indiana", abbr: "IN" },
  { name: "Iowa", abbr: "IA" }, { name: "Kansas", abbr: "KS" },
  { name: "Kentucky", abbr: "KY" }, { name: "Louisiana", abbr: "LA" },
  { name: "Maine", abbr: "ME" }, { name: "Maryland", abbr: "MD" },
  { name: "Massachusetts", abbr: "MA" }, { name: "Michigan", abbr: "MI" },
  { name: "Minnesota", abbr: "MN" }, { name: "Mississippi", abbr: "MS" },
  { name: "Missouri", abbr: "MO" }, { name: "Montana", abbr: "MT" },
  { name: "Nebraska", abbr: "NE" }, { name: "Nevada", abbr: "NV" },
  { name: "New Hampshire", abbr: "NH" }, { name: "New Jersey", abbr: "NJ" },
  { name: "New Mexico", abbr: "NM" }, { name: "New York", abbr: "NY" },
  { name: "North Carolina", abbr: "NC" }, { name: "North Dakota", abbr: "ND" },
  { name: "Ohio", abbr: "OH" }, { name: "Oklahoma", abbr: "OK" },
  { name: "Oregon", abbr: "OR" }, { name: "Pennsylvania", abbr: "PA" },
  { name: "Rhode Island", abbr: "RI" }, { name: "South Carolina", abbr: "SC" },
  { name: "South Dakota", abbr: "SD" }, { name: "Tennessee", abbr: "TN" },
  { name: "Texas", abbr: "TX" }, { name: "Utah", abbr: "UT" },
  { name: "Vermont", abbr: "VT" }, { name: "Virginia", abbr: "VA" },
  { name: "Washington", abbr: "WA" }, { name: "West Virginia", abbr: "WV" },
  { name: "Wisconsin", abbr: "WI" }, { name: "Wyoming", abbr: "WY" },
  { name: "Washington DC", abbr: "DC" },
];

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing",
  "under-review": "Under Review",
  completed: "Completed (Paid)",
  cancelled: "Cancelled",
  lead: "Lead (Unpaid)",
};

// ─── Traffic source derivation (mirrors AdminDashboard logic) ─────────────────
function deriveTrafficSource(order: Pick<Order, "utm_source" | "utm_medium" | "gclid" | "fbclid" | "referred_by"> & { utm_source?: string | null; utm_medium?: string | null; gclid?: string | null; fbclid?: string | null }): string {
  const utmSrc = ((order as Order & { utm_source?: string | null }).utm_source ?? "").toLowerCase();
  const utmMed = ((order as Order & { utm_medium?: string | null }).utm_medium ?? "").toLowerCase();
  const gclid = (order as Order & { gclid?: string | null }).gclid ?? "";
  const fbclid = (order as Order & { fbclid?: string | null }).fbclid ?? "";
  const referred = (order.referred_by ?? "").toLowerCase();

  if (gclid) return "Google Ads";
  if (utmSrc === "google" && ["cpc", "paid", "ppc", "paidsearch"].includes(utmMed)) return "Google Ads";
  if (fbclid) return "Facebook / Instagram";
  if (utmSrc === "facebook") return "Facebook";
  if (utmSrc === "instagram") return "Instagram";
  if (utmSrc === "tiktok") return "TikTok";
  if (utmSrc === "google" || utmMed === "organic") return "Google Organic";
  if (referred.includes("google")) return "Google";
  if (referred.includes("tiktok")) return "TikTok";
  if (referred.includes("facebook") || referred.includes("instagram")) return "Facebook";
  if (referred.includes("seo") || referred.includes("organic")) return "Google Organic";
  if (referred && referred !== "direct" && referred !== "unknown") return referred;
  return "Direct / Unknown";
}

// ─── PSD order detection helper — checks letter_type OR confirmation ID prefix ──
function isPSDOrder(order: Pick<Order, "letter_type" | "confirmation_id">): boolean {
  return order.letter_type === "psd" || order.confirmation_id.includes("-PSD");
}

// ─── Priority order detection — payment > $130 (admin/support eyes only) ─────
function isPriorityOrder(order: Pick<Order, "price">): boolean {
  return (order.price ?? 0) > 130;
}

// ─── Combined order status — maps payment + doctor state to 4-stage user-facing labels ──

function getOrderDisplayStatus(order: Order) {
  // Disputed — chargeback filed
  if (order.status === "disputed" || order.dispute_id) {
    return { label: "Disputed", color: "bg-red-100 text-red-700" };
  }
  // Fraud warning
  if (order.fraud_warning) {
    return { label: "Fraud Warning", color: "bg-red-200 text-red-800" };
  }
  // Refunded
  if (order.status === "refunded" || order.refunded_at) {
    return { label: "Refunded", color: "bg-red-100 text-red-600" };
  }
  // Stage 4 — letter delivered
  if (order.doctor_status === "patient_notified") {
    return { label: "Order (Completed)", color: "bg-emerald-100 text-emerald-700" };
  }
  // Stage 1 — no confirmed payment
  const isLead = order.status === "lead" || !order.payment_intent_id;
  if (isLead) {
    return { label: "Lead (Unpaid)", color: "bg-amber-100 text-amber-700" };
  }
  // Stage 2 — paid but no provider assigned yet
  if (!order.doctor_email && !order.doctor_user_id) {
    return { label: "Paid (Unassigned)", color: "bg-sky-100 text-sky-700" };
  }
  // Stage 3 — paid and assigned, in progress
  return { label: "Order (Under Review)", color: "bg-sky-100 text-sky-700" };
}

const DOCTOR_STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  in_review: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  letter_sent: "bg-[#dbeafe] text-[#3b6ea5]",
  patient_notified: "bg-violet-100 text-violet-700",
  unassigned: "bg-gray-100 text-gray-500",
  thirty_day_reissue: "bg-orange-100 text-orange-700",
};

// ─── Role-based tab visibility ─────────────────────────────────────────────

type TabKey = "dashboard" | "orders" | "analytics" | "comms" | "customers" | "doctors" | "earnings" | "payments" | "team" | "audit" | "settings" | "health";

const ALL_TABS: TabKey[] = ["dashboard", "orders", "analytics", "comms", "customers", "doctors", "earnings", "payments", "team", "audit", "settings", "health"];

function getVisibleTabs(role: string | null, customTabAccess?: string[] | null): TabKey[] {
  // Custom tab access overrides role defaults — use it if set
  if (customTabAccess && customTabAccess.length > 0) {
    return ALL_TABS.filter((t) => customTabAccess.includes(t));
  }
  switch (role) {
    case "owner":
    case "admin_manager":
      return ALL_TABS;
    case "support":
      return ["dashboard", "orders", "analytics", "comms", "customers", "doctors", "audit", "health"];
    case "finance":
      return ["dashboard", "orders", "analytics", "comms", "customers", "payments", "earnings", "audit", "health"];
    case "read_only":
      return ["dashboard", "orders", "analytics", "comms", "customers", "doctors", "payments", "audit", "health"];
    default:
      return ALL_TABS;
  }
}

// ─── Role badge helper ────────────────────────────────────────────────────────

function roleBadge(role: string | null) {
  const cfg: Record<string, { label: string; color: string }> = {
    owner:         { label: "Owner",     color: "bg-[#f3e8ff] text-[#7c3aed]" },
    admin_manager: { label: "Admin",     color: "bg-[#dbeafe] text-[#3b6ea5]" },
    support:       { label: "Support",   color: "bg-cyan-100 text-cyan-700" },
    finance:       { label: "Finance",   color: "bg-emerald-100 text-emerald-700" },
    read_only:     { label: "Read Only", color: "bg-gray-100 text-gray-500" },
    provider:      { label: "Provider",  color: "bg-amber-100 text-amber-700" },
  };
  const r = cfg[role ?? ""] ?? cfg.admin_manager;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${r.color}`}>
      {r.label}
    </span>
  );
}

// ─── GHL sync time formatter ──────────────────────────────────────────────────

function doctorStatusLabel(status: string | null, isAssigned: boolean): string {
  if (!isAssigned) return "Unassigned";
  if (!status) return "Pending Review";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtGhlSync(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtSyncAge(ts: Date | null): string {
  if (!ts) return "—";
  const secs = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Last-contacted badge helper ───────────────────────────────────────────
function fmtLastContacted(ts: string | null): { label: string; color: string } | null {
  if (!ts) return null;
  const diffMs   = Date.now() - new Date(ts).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60)    return { label: `${diffMins}m ago`,                  color: "bg-[#e8f0f9] text-[#3b6ea5]" };
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)    return { label: `${diffHrs}h ago`,                    color: "bg-[#e8f0f9] text-[#3b6ea5]" };
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 3)    return { label: `${diffDays}d ago`,                   color: "bg-amber-50 text-amber-700"   };
  return               { label: `${diffDays}d ago`,                          color: "bg-red-50 text-red-500"       };
}

// ─── Reference labels map ──────────────────────────────────────────────────────

const REF_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  facebook:     { label: "Facebook",     icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50" },
  google_ads:   { label: "Google Ads",   icon: "ri-google-line",          color: "text-orange-600 bg-orange-50" },
  social_media: { label: "Social Media", icon: "ri-share-circle-line",    color: "text-pink-600 bg-pink-50" },
  seo:          { label: "SEO",          icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50" },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [doctorContacts, setDoctorContacts] = useState<DoctorContact[]>([]);
  const [doctorProfiles, setDoctorProfiles] = useState<DoctorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSyncMsg, setRefreshSyncMsg] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Hidden source filter — only settable from dashboard, not shown in filter UI
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  // ── Advanced filters ──
  const [stateFilterAdv, setStateFilterAdv] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [selectedProviderFilter, setSelectedProviderFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [referredByFilter, setReferredByFilter] = useState("all");
  const [sequenceFilter, setSequenceFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showNonGhlOnly, setShowNonGhlOnly] = useState(false);

  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignMsg, setAssignMsg] = useState<Record<string, string>>({});
  const [adminProfile, setAdminProfile] = useState<DoctorProfile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState("");
  const [ghlRefiring, setGhlRefiring] = useState<string | null>(null);
  const [ghlReFireResult, setGhlReFireResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [showChangePassword, setShowChangePassword] = useState(false);

  // ── New feature state ──
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [showStatusLog, setShowStatusLog] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);

  // ── Unread comms tracking ──────────────────────────────────────────────────
  const [lastViewedMap, setLastViewedMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("pw_order_last_viewed");
      return raw ? JSON.parse(raw) as Record<string, number> : {};
    } catch { return {}; }
  });
  const [unreadCommsMap, setUnreadCommsMap] = useState<Record<string, number>>({});
  const [assessmentIntakeOrder, setAssessmentIntakeOrder] = useState<Order | null>(null);
  const [bulkDoctorEmail, setBulkDoctorEmail] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [orderNoteCounts, setOrderNoteCounts] = useState<Record<string, number>>({});
  const [showBulkSMS, setShowBulkSMS] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [hideRecentFollowup, setHideRecentFollowup] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<{ confirmationId: string; doctorEmail: string; doctorName: string } | null>(null);
  const [showLeadActionsModal, setShowLeadActionsModal] = useState(false);

  // ── Bulk delete state (owner/admin_manager only) ──
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteMsg, setBulkDeleteMsg] = useState("");
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");

  // ── Bulk stop sequence state ──
  const [bulkStoppingSequence, setBulkStoppingSequence] = useState(false);

  // ── Bulk GHL sync state ──
  const [bulkGhlSyncing, setBulkGhlSyncing] = useState(false);
  const [bulkGhlSyncProgress, setBulkGhlSyncProgress] = useState({ done: 0, total: 0, success: 0, fail: 0 });
  const [bulkGhlSyncDone, setBulkGhlSyncDone] = useState(false);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  // ── Sidebar collapse (persisted) ─────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("pw_sidebar_collapsed") === "true"; } catch { return false; }
  });

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("pw_sidebar_collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const [sendingRecovery, setSendingRecovery] = useState<string | null>(null);
  const [recoveryMsg, setRecoveryMsg] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [sendingRecoveryDirect, setSendingRecoveryDirect] = useState<string | null>(null);

  // ── Recovery email modal state ──
  const [recoveryModal, setRecoveryModal] = useState<Order | null>(null);
  const [recoveryDiscount, setRecoveryDiscount] = useState("");
  const [recoveryDiscountType, setRecoveryDiscountType] = useState<"percent" | "fixed">("percent");
  const [recoveryDiscountValue, setRecoveryDiscountValue] = useState("");
  const [recoveryCustomMsg, setRecoveryCustomMsg] = useState("");
  const [recoverySending, setRecoverySending] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const NON_PROVIDER_ROLES = new Set(["owner", "admin_manager", "support", "finance", "read_only"]);

  // ── Merged assignable provider list (doctorContacts + provider-role doctorProfiles) ──
  const assignableProviders = useMemo<DoctorContact[]>(() => {
    const result: DoctorContact[] = doctorContacts.filter((d) => d.is_active !== false);
    doctorProfiles
      .filter((p) =>
        p.is_active !== false &&
        !NON_PROVIDER_ROLES.has(p.role ?? "") &&
        !result.some((c) => c.email.toLowerCase() === (p.email ?? "").toLowerCase())
      )
      .forEach((p) => {
        result.push({
          id: p.id,
          full_name: p.full_name,
          email: p.email ?? "",
          phone: p.phone,
          licensed_states: p.licensed_states ?? [],
          is_active: p.is_active,
          state_license_numbers: p.state_license_numbers ?? null,
        });
      });
    return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [doctorContacts, doctorProfiles]);

  // ── States with at least one active licensed provider ───────────────────────
  const coveredStates = useMemo(() => {
    const covered = new Set<string>();
    assignableProviders.forEach((d) => {
      if (d.is_active === false) return;
      // From licensed_states array
      (d.licensed_states ?? []).forEach((state) => {
        // Support full name ("New York") → add abbr ("NY")
        const abbr = US_STATES.find((s) => s.name === state)?.abbr;
        if (abbr) covered.add(abbr);
        // Support abbr directly ("NY")
        if (state.length === 2) covered.add(state.toUpperCase());
      });
      // Also include states from state_license_numbers keys (safety net)
      if (d.state_license_numbers) {
        Object.keys(d.state_license_numbers).forEach((abbr) => {
          if (abbr.length === 2) covered.add(abbr.toUpperCase());
        });
      }
    });
    return covered;
  }, [assignableProviders]);

  // ── Real-time subscription for new/updated orders ─────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("admin-orders-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as Order;
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            // Always prepend — filtered sort will place it correctly
            return [newOrder, ...prev];
          });
          setLastSyncedAt(new Date());
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new as Order;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
          setLastSyncedAt(new Date());
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Real-time subscription for new inbound SMS/calls → bump comms badge ──
  useEffect(() => {
    const channel = supabase
      .channel("admin-comms-inbound")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communications" }, (payload) => {
        const entry = payload.new as { direction: string };
        if (entry.direction === "inbound") {
          setUnreadCommsCount((c) => c + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Track whether any modal is open (used to pause background refresh) ──
  const anyModalOpenRef = useRef(false);
  useEffect(() => {
    anyModalOpenRef.current = !!(
      orderDetail ||
      showCreateModal ||
      showChangePassword ||
      showBulkSMS ||
      showBroadcast ||
      showBulkConfirm ||
      showLeadActionsModal ||
      recoveryModal
    );
  }, [orderDetail, showCreateModal, showChangePassword, showBulkSMS, showBroadcast, showBulkConfirm, showLeadActionsModal, recoveryModal]);

  const loadOrderData = useCallback(async () => {
    const [ordersRes, contactsRes, profilesRes] = await Promise.all([
      supabase.from("orders").select("id,confirmation_id,email,first_name,last_name,phone,state,selected_provider,plan_type,delivery_speed,status,doctor_status,doctor_email,doctor_name,doctor_user_id,payment_intent_id,checkout_session_id,payment_method,price,created_at,letter_url,signed_letter_url,patient_notification_sent_at,email_log,refunded_at,refund_amount,letter_type,dispute_id,dispute_status,dispute_reason,dispute_created_at,fraud_warning,fraud_warning_at,subscription_status,coupon_code,coupon_discount,paid_at,payment_failure_reason,payment_failed_at,referred_by,addon_services,ghl_synced_at,ghl_sync_error,ghl_contact_id,last_contacted_at,assessment_answers,sent_followup_at,seq_30min_sent_at,seq_24h_sent_at,seq_3day_sent_at,followup_opt_out,seq_opted_out_at,letter_id,broadcast_opt_out,last_broadcast_sent_at,source_system,historical_import").order("created_at", { ascending: false }),
      supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name"),
      supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, state_license_numbers, role").order("full_name"),
    ]);
    const loadedOrders = (ordersRes.data as Order[]) ?? [];
    setOrders(loadedOrders);
    setDoctorContacts((contactsRes.data as DoctorContact[]) ?? []);
    setDoctorProfiles((profilesRes.data as DoctorProfile[]) ?? []);
    setLastSyncedAt(new Date());

    if (loadedOrders.length > 0) {
      const { data: notesData } = await supabase
        .from("doctor_notes")
        .select("order_id")
        .in("order_id", loadedOrders.map((o) => o.id));
      if (notesData) {
        const counts: Record<string, number> = {};
        (notesData as { order_id: string }[]).forEach((n) => {
          counts[n.order_id] = (counts[n.order_id] ?? 0) + 1;
        });
        setOrderNoteCounts(counts);
      }
    }
  }, []);

  // ── Auto-refresh every 30s: display tick + background data re-fetch ───────
  // Realtime handles instant pushes; this is the safety-net full re-fetch.
  // Skips if a modal is open so nothing is pulled out from under the user.
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncTick((t) => t + 1);          // refresh "Synced X ago" display
      if (!anyModalOpenRef.current) {
        loadOrderData();                  // silent background re-fetch
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadOrderData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshSyncMsg("");
    try {
      // Step 1 — call Stripe sync to fix any orders missing payment_intent_id
      const syncRes = await fetch(`${supabaseUrl}/functions/v1/sync-unpaid-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const syncData = await syncRes.json() as { ok?: boolean; synced?: number; total?: number; message?: string };
      if (syncData.ok && typeof syncData.synced === "number" && syncData.synced > 0) {
        setRefreshSyncMsg(`Stripe sync: ${syncData.synced} of ${syncData.total} unpaid order(s) updated`);
        setTimeout(() => setRefreshSyncMsg(""), 8000);
      }
    } catch {
      // Stripe sync is best-effort — never block the refresh
    }
    // Step 2 — reload from Supabase with the now-updated data
    await loadOrderData();
    setRefreshing(false);
  }, [loadOrderData, supabaseUrl]);

  const handleAssign = useCallback(async (confirmationId: string, doctorEmail: string | null) => {
    if (!doctorEmail) return;
    setAssigning(confirmationId);
    const dc = doctorContacts.find((d) => d.email.toLowerCase() === doctorEmail.toLowerCase());
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ confirmationId, doctorEmail }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; doctorName?: string };
      if (result.ok) {
        setOrders((prev) => prev.map((o) => o.confirmation_id === confirmationId
          ? { ...o, doctor_name: result.doctorName ?? dc?.full_name ?? null, doctor_email: doctorEmail, doctor_status: "pending_review" }
          : o));
        setAssignMsg((prev) => ({ ...prev, [confirmationId]: "Assigned & notified" }));
        setTimeout(() => setAssignMsg((prev) => { const n = { ...prev }; delete n[confirmationId]; return n; }), 3000);
      } else {
        setAssignMsg((prev) => ({ ...prev, [confirmationId]: result.error ?? "Failed" }));
      }
    } catch {
      setAssignMsg((prev) => ({ ...prev, [confirmationId]: "Network error" }));
    }
    setAssigning(null);
  }, [supabaseUrl, anonKey, doctorContacts]);

  const handleGhlRefire = useCallback(async (confirmationId: string) => {
    setGhlRefiring(confirmationId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/backfill-order-ghl`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmationId }),
      });
      const result = await res.json() as { ok: boolean; message: string; phonePersisted?: string | null };
      const msg = result.message ?? (result.ok ? "GHL re-fired successfully" : "GHL re-fire failed");
      setGhlReFireResult((prev) => ({ ...prev, [confirmationId]: { ok: result.ok, msg } }));
      if (result.ok) {
        setOrders((prev) => prev.map((o) =>
          o.confirmation_id === confirmationId
            ? { ...o, ghl_synced_at: new Date().toISOString(), ghl_sync_error: null, phone: result.phonePersisted ?? o.phone }
            : o
        ));
      }
      setTimeout(() => setGhlReFireResult((prev) => { const n = { ...prev }; delete n[confirmationId]; return n; }), 8000);
    } catch {
      setGhlReFireResult((prev) => ({ ...prev, [confirmationId]: { ok: false, msg: "Network error" } }));
    }
    setGhlRefiring(null);
  }, [supabaseUrl]);

  const handleOrderDeleted = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setOrderDetail(null);
  }, []);

  const handleOrderUpdated = useCallback((updated: Partial<Order> & { id: string }) => {
    setOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
    setOrderDetail((prev) => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
  }, []);

  // ── Fetch unread communications count per order ────────────────────────────
  useEffect(() => {
    if (!adminProfile) return;
    const fetchUnread = async () => {
      const { data } = await supabase
        .from("communications")
        .select("confirmation_id, created_at");
      if (!data) return;
      const counts: Record<string, number> = {};
      for (const comm of data) {
        const cid = comm.confirmation_id as string | null;
        if (!cid) continue;
        const lastSeen = lastViewedMap[cid] ?? 0;
        if (new Date(comm.created_at as string).getTime() > lastSeen) {
          counts[cid] = (counts[cid] ?? 0) + 1;
        }
      }
      setUnreadCommsMap(counts);
    };
    fetchUnread();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminProfile]);

  // ── Open order detail and mark communications as read ─────────────────────
  const openOrderDetail = useCallback((order: Order) => {
    const now = Date.now();
    const updated = { ...lastViewedMap, [order.confirmation_id]: now };
    setLastViewedMap(updated);
    try { localStorage.setItem("pw_order_last_viewed", JSON.stringify(updated)); } catch { /* ignore */ }
    setUnreadCommsMap((prev) => ({ ...prev, [order.confirmation_id]: 0 }));
    setOrderDetail(order);
  }, [lastViewedMap]);

  const handleDoctorStatesSaved = (id: string, states: string[]) => {
    setDoctorContacts((prev) => prev.map((d) => d.id === id ? { ...d, licensed_states: states } : d));
  };

  const handleToggleActive = (id: string, active: boolean) => {
    setDoctorProfiles((prev) => prev.map((p) => p.id === id ? { ...p, is_active: active } : p));
  };

  // ── Unread inbound comms badge ────────────────────────────────────────────
  useEffect(() => {
    const lastSeen = parseInt(localStorage.getItem("pw_comms_last_viewed") ?? "0", 10);
    const lastSeenTs = new Date(lastSeen || 0).toISOString();
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .gt("created_at", lastSeenTs)
      .then(({ count }) => { if ((count ?? 0) > 0) setUnreadCommsCount(count ?? 0); });
  }, []);

  // Clear badge when user opens Comms tab
  useEffect(() => {
    if (activeTab === "comms") {
      setUnreadCommsCount(0);
      try { localStorage.setItem("pw_comms_last_viewed", String(Date.now())); } catch { /* ignore */ }
    }
  }, [activeTab]);

  // ── Audit log: record every Settings tab access ───────────────────────────
  useEffect(() => {
    if (activeTab !== "settings" || !adminProfile) return;
    supabase.from("audit_logs").insert({
      actor_id: adminProfile.user_id,
      actor_name: adminProfile.full_name,
      object_type: "settings_tab",
      object_id: "settings",
      action: "settings_tab_viewed",
      description: `Settings tab accessed by ${adminProfile.full_name} (${adminProfile.role ?? "admin"})`,
      new_values: {
        role: adminProfile.role,
        email: adminProfile.email,
        timestamp: new Date().toISOString(),
      },
      metadata: { tab: "settings", accessedAt: new Date().toISOString() },
    }).then(({ error }) => {
      if (error) console.warn("[AUDIT] Failed to log Settings tab access:", error.message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Silently refresh provider lists whenever user lands on Orders tab ───────
  // This ensures state edits made in the Providers tab are immediately reflected
  // in the assignment dropdowns without requiring a full page reload.
  useEffect(() => {
    if (activeTab !== "orders") return;
    Promise.all([
      supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name"),
      supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, state_license_numbers, role").order("full_name"),
    ]).then(([contactsRes, profilesRes]) => {
      if (contactsRes.data) setDoctorContacts(contactsRes.data as DoctorContact[]);
      if (profilesRes.data) setDoctorProfiles(profilesRes.data as DoctorProfile[]);
    }).catch(() => {/* silent — stale data is still usable */});
  }, [activeTab]);

  const handleDoctorCreated = (result: { full_name: string; email: string }) => {
    setShowCreateModal(false);
    setCreateSuccessMsg(`${result.full_name} (${result.email}) — provider added to the panel successfully.`);
    setTimeout(() => setCreateSuccessMsg(""), 7000);
    supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, state_license_numbers").order("full_name")
      .then(({ data }) => { if (data) setDoctorProfiles(data as DoctorProfile[]); });
    supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name")
      .then(({ data }) => { if (data) setDoctorContacts(data as DoctorContact[]); });
  };

  const handleBulkAssign = useCallback(async () => {
    if (!bulkDoctorEmail || selectedOrders.size === 0) return;
    setBulkAssigning(true);
    setShowBulkConfirm(false);
    setBulkMsg("");
    // Only assign orders that are paid, not refunded, and not completed
    const assignableIds = Array.from(selectedOrders).filter((cid) => {
      const o = orders.find((x) => x.confirmation_id === cid);
      return o &&
        !!o.payment_intent_id &&
        o.status !== "lead" &&
        o.status !== "refunded" &&
        !o.refunded_at &&
        o.doctor_status !== "patient_notified";
    });
    const skippedCount = selectedOrders.size - assignableIds.length;
    let successCount = 0;
    let failCount = 0;
    await Promise.all(
      assignableIds.map(async (confirmationId) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
            body: JSON.stringify({ confirmationId, doctorEmail: bulkDoctorEmail }),
          });
          const result = await res.json() as { ok?: boolean; doctorName?: string };
          if (result.ok) {
            successCount++;
            const dc = doctorContacts.find((d) => d.email.toLowerCase() === bulkDoctorEmail.toLowerCase());
            setOrders((prev) => prev.map((o) =>
              o.confirmation_id === confirmationId
                ? { ...o, doctor_name: result.doctorName ?? dc?.full_name ?? null, doctor_email: bulkDoctorEmail, doctor_status: "pending_review" }
                : o
            ));
          } else { failCount++; }
        } catch { failCount++; }
      })
    );
    setBulkAssigning(false);
    setSelectedOrders(new Set());
    setBulkDoctorEmail("");
    const skippedNote = skippedCount > 0 ? ` (${skippedCount} skipped — unpaid, refunded, or completed)` : "";
    setBulkMsg(failCount === 0
      ? `${successCount} order${successCount !== 1 ? "s" : ""} assigned successfully${skippedNote}`
      : `${successCount} assigned, ${failCount} failed${skippedNote}`
    );
    setTimeout(() => setBulkMsg(""), 6000);
  }, [bulkDoctorEmail, selectedOrders, orders, supabaseUrl, anonKey, doctorContacts]);

  // ── Bulk delete handler (owner/admin_manager only) ───────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (selectedOrders.size === 0) return;
    setBulkDeleting(true);
    setBulkDeleteMsg("");
    const ids = Array.from(selectedOrders);
    let successCount = 0;
    let failCount = 0;

    for (const confirmationId of ids) {
      const o = orders.find((x) => x.confirmation_id === confirmationId);
      if (!o) continue;
      try {
        // Clean up related records first
        await supabase.from("doctor_earnings").delete().eq("order_id", o.id);
        await supabase.from("order_documents").delete().eq("order_id", o.id);
        await supabase.from("doctor_notes").delete().eq("order_id", o.id);
        await supabase.from("order_status_logs").delete().eq("order_id", o.id);
        await supabase.from("doctor_notifications").delete().eq("order_id", o.id);
        const { error } = await supabase.from("orders").delete().eq("id", o.id);
        if (error) { failCount++; } else { successCount++; }
      } catch { failCount++; }
    }

    setOrders((prev) => prev.filter((o) => !selectedOrders.has(o.confirmation_id)));
    setSelectedOrders(new Set());
    setShowBulkDeleteConfirm(false);
    setBulkDeleteConfirmText("");
    setBulkDeleting(false);
    setBulkDeleteMsg(failCount === 0
      ? `${successCount} order${successCount !== 1 ? "s" : ""} permanently deleted.`
      : `${successCount} deleted, ${failCount} failed.`
    );
    setTimeout(() => setBulkDeleteMsg(""), 8000);
  }, [selectedOrders, orders]);

  // ── Toggle follow-up opt-out ─────────────────────────────────────────────
  const handleToggleOptOut = useCallback(async (order: Order) => {
    const newVal = !order.followup_opt_out;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    await fetch(`${supabaseUrl}/functions/v1/lead-followup-sequence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: newVal ? "opt_out" : "opt_in", orderId: order.id }),
    });
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, followup_opt_out: newVal, seq_opted_out_at: newVal ? new Date().toISOString() : null } : o));
  }, [supabaseUrl]);

  // ── Bulk stop sequence for selected unpaid leads ─────────────────────────
  const handleBulkStopSequence = useCallback(async () => {
    setBulkStoppingSequence(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    // Only opt-out leads that are unpaid and not already opted out
    const eligibleOrders = orders.filter((o) =>
      selectedOrders.has(o.confirmation_id) &&
      (!o.payment_intent_id || o.status === "lead") &&
      !o.followup_opt_out
    );
    await Promise.all(
      eligibleOrders.map((o) =>
        fetch(`${supabaseUrl}/functions/v1/lead-followup-sequence`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "opt_out", orderId: o.id }),
        }).catch(() => null)
      )
    );
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        eligibleOrders.some((e) => e.id === o.id)
          ? { ...o, followup_opt_out: true, seq_opted_out_at: now }
          : o
      )
    );
    setBulkStoppingSequence(false);
    setBulkMsg(`Sequence stopped for ${eligibleOrders.length} lead${eligibleOrders.length !== 1 ? "s" : ""}`);
    setTimeout(() => setBulkMsg(""), 5000);
  }, [orders, selectedOrders, supabaseUrl]);

  // ── Bulk GHL sync for selected orders ───────────────────────────────────
  const handleBulkGhlSync = useCallback(async () => {
    const targets = orders.filter((o) => selectedOrders.has(o.confirmation_id));
    if (targets.length === 0) return;
    setBulkGhlSyncing(true);
    setBulkGhlSyncDone(false);
    setBulkGhlSyncProgress({ done: 0, total: targets.length, success: 0, fail: 0 });

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? anonKey;

    let success = 0;
    let fail = 0;

    for (const order of targets) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/backfill-order-ghl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ confirmationId: order.confirmation_id }),
        });
        const result = await res.json() as { ok: boolean };
        if (result.ok) {
          success++;
          setOrders((prev) => prev.map((o) =>
            o.confirmation_id === order.confirmation_id
              ? { ...o, ghl_synced_at: new Date().toISOString(), ghl_sync_error: null }
              : o
          ));
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
      setBulkGhlSyncProgress((prev) => ({ ...prev, done: prev.done + 1, success, fail }));
    }

    setBulkGhlSyncing(false);
    setBulkGhlSyncDone(true);
    setBulkMsg(fail === 0
      ? `GHL sync complete — ${success} order${success !== 1 ? "s" : ""} synced successfully`
      : `GHL sync: ${success} synced, ${fail} failed — check GHL_WEBHOOK_URL in Supabase Secrets`
    );
    setTimeout(() => {
      setBulkGhlSyncDone(false);
      setBulkGhlSyncProgress({ done: 0, total: 0, success: 0, fail: 0 });
      setBulkMsg("");
    }, 8000);
  }, [orders, selectedOrders, supabaseUrl, anonKey]);

  // ── One-click recovery for payment-failed cards ──────────────────────────
  const handleSendRecoveryDirect = useCallback(async (order: Order) => {
    setSendingRecoveryDirect(order.confirmation_id);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ confirmationId: order.confirmation_id, email: order.email, firstName: order.first_name ?? "", price: order.price }),
      });
      const result = await res.json() as { ok: boolean; error?: string; message?: string };
      const msg = result.ok ? "Recovery email sent!" : (result.error ?? "Failed to send");
      setRecoveryMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: result.ok, msg } }));
    } catch {
      setRecoveryMsg((prev) => ({ ...prev, [order.confirmation_id]: { ok: false, msg: "Network error" } }));
    }
    setSendingRecoveryDirect(null);
  }, [supabaseUrl, anonKey]);

  // ── Recovery email modal helpers ─────────────────────────────────────────
  const openRecoveryModal = useCallback((order: Order) => {
    setRecoveryModal(order);
    setRecoveryDiscount("");
    setRecoveryDiscountType("percent");
    setRecoveryDiscountValue("");
    setRecoveryCustomMsg("");
    setRecoveryResult(null);
  }, []);

  const handleSendRecovery = useCallback(async () => {
    if (!recoveryModal) return;
    setRecoverySending(true);
    setRecoveryResult(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          confirmationId: recoveryModal.confirmation_id,
          discountCode: recoveryDiscount.trim() || undefined,
          discountType: recoveryDiscountType,
          discountValue: recoveryDiscountValue ? parseFloat(recoveryDiscountValue) : undefined,
          customMessage: recoveryCustomMsg.trim() || undefined,
        }),
      });
      const result = await res.json() as { ok: boolean; message?: string; error?: string };
      const msg = result.message ?? (result.ok ? "Recovery email sent successfully!" : (result.error ?? "Failed to send"));
      setRecoveryResult({ ok: result.ok, msg });
      if (result.ok) {
        setRecoveryMsg((prev) => ({ ...prev, [recoveryModal.confirmation_id]: { ok: true, msg } }));
      }
    } catch {
      setRecoveryResult({ ok: false, msg: "Network error — please try again" });
    }
    setRecoverySending(false);
  }, [recoveryModal, recoveryDiscount, recoveryDiscountType, recoveryDiscountValue, recoveryCustomMsg, supabaseUrl, anonKey]);

  const selectedProviders = Array.from(new Set(orders.map((o) => o.selected_provider).filter(Boolean))) as string[];

  // ── Duplicate email + phone detection (must be before `filtered`) ─────────
  const duplicateEmailSet = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      const key = o.email.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return new Set(
      Object.entries(counts).filter(([, c]) => c > 1).map(([e]) => e)
    );
  }, [orders]);

  // Combined set: any email OR normalised phone that appears on 2+ orders
  const duplicateContactSet = useMemo(() => {
    const emailCounts: Record<string, number> = {};
    const phoneCounts: Record<string, number> = {};
    orders.forEach((o) => {
      const ek = o.email.toLowerCase();
      emailCounts[ek] = (emailCounts[ek] ?? 0) + 1;
      if (o.phone) {
        const pk = o.phone.replace(/\D/g, "");
        if (pk.length >= 7) phoneCounts[pk] = (phoneCounts[pk] ?? 0) + 1;
      }
    });
    const dupeEmails = new Set(Object.entries(emailCounts).filter(([, c]) => c > 1).map(([k]) => k));
    const dupePhones = new Set(Object.entries(phoneCounts).filter(([, c]) => c > 1).map(([k]) => k));
    return new Set([...dupeEmails, ...dupePhones]);
  }, [orders]);

  const duplicateCount = useMemo(() => {
    return orders.filter(
      (o) => duplicateContactSet.has(o.email.toLowerCase()) ||
             (!!o.phone && duplicateContactSet.has(o.phone.replace(/\D/g, "")))
    ).length;
  }, [orders, duplicateContactSet]);

  // ── Last-contacted filter ────────────────────────────────────────────────
  const isContacted = (o: Order) =>
    !!o.last_contacted_at || (Array.isArray(o.email_log) && o.email_log.length > 0);

  const lastTouchTime = (o: Order): number => {
    const ts: number[] = [];
    if (o.last_contacted_at) ts.push(new Date(o.last_contacted_at).getTime());
    if (Array.isArray(o.email_log) && o.email_log.length > 0) {
      const emailTs = o.email_log
        .map((e) => { try { return new Date(e.sentAt).getTime(); } catch { return 0; } })
        .filter(Boolean);
      if (emailTs.length) ts.push(Math.max(...emailTs));
    }
    return ts.length ? Math.max(...ts) : 0;
  };

  const filtered = orders.filter((o) => {
    let matchStatus = true;
    if (statusFilter === "all") {
      matchStatus = true;
    } else if (statusFilter === "lead_unpaid") {
      matchStatus = !o.payment_intent_id || o.status === "lead";
    } else if (statusFilter === "paid_unassigned") {
      matchStatus = !!o.payment_intent_id && o.status !== "lead" && o.status !== "refunded" && !o.refunded_at && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified";
    } else if (statusFilter === "under_review") {
      matchStatus = !!o.payment_intent_id && o.status !== "lead" && o.status !== "refunded" && !o.refunded_at && (!!o.doctor_email || !!o.doctor_user_id) && o.doctor_status !== "patient_notified";
    } else if (statusFilter === "completed") {
      matchStatus = o.doctor_status === "patient_notified";
    } else if (statusFilter === "refunded") {
      matchStatus = o.status === "refunded" || !!o.refunded_at;
    } else if (statusFilter === "disputed") {
      matchStatus = o.status === "disputed" || !!o.dispute_id;
    } else if (statusFilter === "cancelled") {
      matchStatus = o.status === "cancelled";
    } else if (statusFilter === "payment_failed") {
      matchStatus = !!(o.payment_failure_reason && (o.status === "lead" || !o.payment_intent_id));
    } else {
      matchStatus = o.status === statusFilter || o.doctor_status === statusFilter;
    }
    const matchState = stateFilterAdv === "all" || (o.state ?? "") === stateFilterAdv;
    const matchDoctor = doctorFilter === "all"
      || (doctorFilter === "unassigned" && !o.doctor_email && !o.doctor_user_id)
      || o.doctor_email?.toLowerCase() === doctorFilter.toLowerCase();
    const matchSelectedProvider = selectedProviderFilter === "all" || (o.selected_provider ?? "") === selectedProviderFilter;
    const matchPayment = paymentFilter === "all"
      || (paymentFilter === "paid" && !!o.payment_intent_id)
      || (paymentFilter === "unpaid" && !o.payment_intent_id);
    const matchRef = referredByFilter === "all"
      || (referredByFilter === "none" ? !o.referred_by : o.referred_by === referredByFilter);
    // Sequence filter — only applies to leads (unpaid)
    let matchSequence = true;
    if (sequenceFilter !== "all") {
      const isLead = !o.payment_intent_id || o.status === "lead";
      if (sequenceFilter === "no_sequence") {
        matchSequence = isLead && !o.seq_30min_sent_at && !o.seq_24h_sent_at && !o.seq_3day_sent_at && !o.followup_opt_out;
      } else if (sequenceFilter === "30min_sent") {
        matchSequence = isLead && !!o.seq_30min_sent_at && !o.seq_24h_sent_at && !o.seq_3day_sent_at;
      } else if (sequenceFilter === "24h_sent") {
        matchSequence = isLead && !!o.seq_24h_sent_at && !o.seq_3day_sent_at;
      } else if (sequenceFilter === "3day_sent") {
        matchSequence = isLead && !!o.seq_3day_sent_at;
      } else if (sequenceFilter === "opted_out") {
        matchSequence = isLead && !!o.followup_opt_out;
      }
    }
    const matchDateFrom = !dateFrom || new Date(o.created_at) >= new Date(dateFrom);
    const matchDateTo = !dateTo || new Date(o.created_at) <= new Date(dateTo + "T23:59:59");
    const matchDuplicates = !showDuplicatesOnly || duplicateContactSet.has(o.email.toLowerCase()) || (!!o.phone && duplicateContactSet.has(o.phone.replace(/\D/g, "")));
    const matchNonGhl = !showNonGhlOnly || !o.ghl_synced_at;
    let matchSource = true;
    if (sourceFilter) {
      const derivedSrc = deriveTrafficSource(o);
      if (sourceFilter === "Direct / Unknown") matchSource = derivedSrc === "Direct / Unknown";
      else if (sourceFilter === "Facebook") matchSource = derivedSrc === "Facebook / Instagram" || derivedSrc === "Facebook" || derivedSrc === "Instagram";
      else if (sourceFilter === "Google Ads") matchSource = derivedSrc === "Google Ads";
      else if (sourceFilter === "Google Organic") matchSource = derivedSrc === "Google Organic" || derivedSrc === "Google";
      else if (sourceFilter === "TikTok") matchSource = derivedSrc === "TikTok";
      else matchSource = derivedSrc === sourceFilter;
    }
    const q = search.toLowerCase();
    const matchSearch = !q ||
      o.confirmation_id.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      `${o.first_name ?? ""} ${o.last_name ?? ""}`.toLowerCase().includes(q) ||
      (o.state ?? "").toLowerCase().includes(q) ||
      (o.doctor_name ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").includes(q) ||
      (o.ghl_contact_id ?? "").toLowerCase().includes(q);
    return matchStatus && matchState && matchDoctor && matchSelectedProvider && matchPayment && matchRef && matchSequence && matchDateFrom && matchDateTo && matchSearch && matchDuplicates && matchNonGhl && matchSource;
  }).filter((o) => {
    if (!hideRecentFollowup) return true;
    if (!o.sent_followup_at) return true;
    const age = Date.now() - new Date(o.sent_followup_at).getTime();
    return age > 7 * 24 * 60 * 60 * 1000;
  }).sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (tA === tB) {
      return sortOrder === "desc"
        ? (b.id ?? "").localeCompare(a.id ?? "")
        : (a.id ?? "").localeCompare(b.id ?? "");
    }
    return sortOrder === "desc" ? tB - tA : tA - tB;
  });

  // ── Pagination: slice filtered to visibleCount ───────────────────────────
  const visibleOrders = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const activeFilterCount = [
    stateFilterAdv !== "all",
    doctorFilter !== "all",
    selectedProviderFilter !== "all",
    paymentFilter !== "all",
    referredByFilter !== "all",
    sequenceFilter !== "all",
    !!dateFrom,
    !!dateTo,
    showDuplicatesOnly,
  ].filter(Boolean).length;

  // Reset pagination when filters/search change
  useEffect(() => { setVisibleCount(50); }, [search, statusFilter, stateFilterAdv, doctorFilter, selectedProviderFilter, paymentFilter, referredByFilter, sequenceFilter, dateFrom, dateTo, showDuplicatesOnly, showNonGhlOnly, hideRecentFollowup, sortOrder, sourceFilter]);

  const clearAdvancedFilters = () => {
    setStateFilterAdv("all");
    setDoctorFilter("all");
    setSelectedProviderFilter("all");
    setPaymentFilter("all");
    setReferredByFilter("all");
    setSequenceFilter("all");
    setDateFrom("");
    setDateTo("");
    setShowDuplicatesOnly(false);
    setSourceFilter(null);
  };

  const totalUnassigned = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded" && !o.refunded_at && !!o.payment_intent_id && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified").length;
  const unlinkedStates = Array.from(
    new Set(
      orders
        .filter((o) => !o.doctor_email && !o.doctor_user_id && o.state && !!o.payment_intent_id && !coveredStates.has(o.state))
        .map((o) => o.state as string)
    )
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selectedOrders.has(o.confirmation_id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedOrders((prev) => {
        const next = new Set(prev);
        filtered.forEach((o) => next.delete(o.confirmation_id));
        return next;
      });
    } else {
      setSelectedOrders((prev) => {
        const next = new Set(prev);
        filtered.forEach((o) => next.add(o.confirmation_id));
        return next;
      });
    }
  };

  const toggleSelectOrder = (confirmationId: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(confirmationId)) next.delete(confirmationId);
      else next.add(confirmationId);
      return next;
    });
  };

  const EMAIL_BADGE_CONFIG: Record<string, { short: string; icon: string; color: string }> = {
    letter_ready: { short: "Letter",  icon: "ri-file-check-line",   color: "bg-violet-50 text-violet-700" },
    refund:       { short: "Refund",  icon: "ri-refund-line",        color: "bg-orange-50 text-orange-700" },
  };

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) { navigate("/admin-login?reason=session_expired"); return; }

        let adminCheck: { ok: boolean; is_admin: boolean; full_name?: string; user_id?: string } = { ok: false, is_admin: false };
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/check-admin-status`, {
            method: "GET",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          adminCheck = await res.json() as typeof adminCheck;
        } catch {
          navigate("/admin-login?reason=session_expired"); return;
        }
        if (!adminCheck.ok || !adminCheck.is_admin) { navigate("/admin-login?reason=unauthorized"); return; }

        const { data: prof } = await supabase.from("doctor_profiles")
          .select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, role, custom_tab_access")
          .eq("user_id", session.user.id).maybeSingle();

        const adminProfileData: DoctorProfile = prof as DoctorProfile ?? {
          id: "",
          user_id: session.user.id,
          full_name: adminCheck.full_name ?? "Admin",
          title: null,
          email: session.user.email ?? null,
          phone: null,
          is_admin: true,
          is_active: true,
          licensed_states: null,
          role: null,
        };
        setAdminProfile(adminProfileData);

        await loadOrderData();
        setLoading(false);
      } catch {
        // Network error (e.g. token refresh failed) — send back to login
        navigate("/admin-login?reason=session_expired");
      }
    };
    load();
  }, [navigate, supabaseUrl, loadOrderData]);

  // ── Finance Orders tab access state ──
  // Finance users must request approval before seeing the full orders list
  const [financeOrdersAccessGranted, setFinanceOrdersAccessGranted] = useState(false);

  // ── Approval request state ──
  const [showApprovalRequest, setShowApprovalRequest] = useState<{
    actionType: "bulk_delete" | "bulk_assign" | "bulk_sms" | "broadcast";
    actionLabel: string;
    actionDescription: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const [showApprovalsInbox, setShowApprovalsInbox] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  // ── Load pending approval count for owners/admins ──
  useEffect(() => {
    if (!adminProfile) return;
    const isReviewer = adminProfile.role === "owner" || adminProfile.role === "admin_manager" || adminProfile.is_admin;
    if (!isReviewer) return;

    const fetchCount = async () => {
      const { count } = await supabase
        .from("approval_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingApprovalCount(count ?? 0);
    };
    fetchCount();

    // Real-time subscription for new approval requests
    const channel = supabase
      .channel("approval-count-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approval_requests" }, () => {
        fetchCount();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approval_requests" }, () => {
        fetchCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [adminProfile]);

  // ── Handle approved action execution ──
  const handleApproveAction = useCallback(async (request: { action_type: string; action_payload: Record<string, unknown>; requester_id?: string }) => {
    const payload = request.action_payload;

    // ── orders_tab_access: grant Finance user session access ──
    if (request.action_type === "orders_tab_access") {
      // If the requester is the currently logged-in Finance user, grant access immediately
      if (adminProfile && request.requester_id === adminProfile.user_id) {
        setFinanceOrdersAccessGranted(true);
      }
      // The ApprovalsInbox already handles the bell notification to the requester
      return;
    }

    if (request.action_type === "bulk_delete") {
      const orderIds = (payload.orderIds as string[]) ?? [];
      let successCount = 0;
      let failCount = 0;
      for (const confirmationId of orderIds) {
        const o = orders.find((x) => x.confirmation_id === confirmationId);
        if (!o) continue;
        try {
          await supabase.from("doctor_earnings").delete().eq("order_id", o.id);
          await supabase.from("order_documents").delete().eq("order_id", o.id);
          await supabase.from("doctor_notes").delete().eq("order_id", o.id);
          await supabase.from("order_status_logs").delete().eq("order_id", o.id);
          await supabase.from("doctor_notifications").delete().eq("order_id", o.id);
          const { error } = await supabase.from("orders").delete().eq("id", o.id);
          if (error) { failCount++; } else { successCount++; }
        } catch { failCount++; }
      }
      setOrders((prev) => prev.filter((o) => !orderIds.includes(o.confirmation_id)));
      setSelectedOrders(new Set());
      setBulkDeleteMsg(failCount === 0
        ? `${successCount} order${successCount !== 1 ? "s" : ""} permanently deleted (approved by admin).`
        : `${successCount} deleted, ${failCount} failed.`
      );
      setTimeout(() => setBulkDeleteMsg(""), 8000);
    }

    if (request.action_type === "bulk_assign") {
      const doctorEmail = payload.doctorEmail as string;
      const orderIds = (payload.orderIds as string[]) ?? [];
      let successCount = 0;
      let failCount = 0;
      await Promise.all(
        orderIds.map(async (confirmationId) => {
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
              body: JSON.stringify({ confirmationId, doctorEmail }),
            });
            const result = await res.json() as { ok?: boolean; doctorName?: string };
            if (result.ok) {
              successCount++;
              const dc = doctorContacts.find((d) => d.email.toLowerCase() === doctorEmail.toLowerCase());
              setOrders((prev) => prev.map((o) =>
                o.confirmation_id === confirmationId
                  ? { ...o, doctor_name: result.doctorName ?? dc?.full_name ?? null, doctor_email: doctorEmail, doctor_status: "pending_review" }
                  : o
              ));
            } else { failCount++; }
          } catch { failCount++; }
        })
      );
      setSelectedOrders(new Set());
      setBulkMsg(failCount === 0
        ? `${successCount} order${successCount !== 1 ? "s" : ""} assigned (approved by admin).`
        : `${successCount} assigned, ${failCount} failed.`
      );
      setTimeout(() => setBulkMsg(""), 6000);
    }
  }, [orders, supabaseUrl, anonKey, doctorContacts]);

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      {/* Incoming Call Banner — always rendered, listens for real-time inbound calls */}
      <IncomingCallBanner
        orders={orders}
        onViewOrder={(order) => {
          openOrderDetail(order);
          setActiveTab("orders");
        }}
      />

      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 px-3 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="cursor-pointer flex-shrink-0">
          <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant" className="h-8 sm:h-10 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Desktop-only extras */}
          <Link to="/admin-guide" className="whitespace-nowrap hidden lg:flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#3b6ea5] transition-colors cursor-pointer">
            <i className="ri-book-2-line"></i> Runbook
          </Link>
          <Link to="/admin-doctors" className="whitespace-nowrap hidden lg:flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#3b6ea5] transition-colors cursor-pointer">
            <i className="ri-stethoscope-line"></i> Providers
          </Link>

          {/* Sync indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-[#e8f0f9] border border-[#b8cce4] rounded-lg" title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString()}` : "Connecting…"}>
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b6ea5] opacity-50"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3b6ea5]"></span>
            </span>
            <span className="text-xs font-semibold text-[#3b6ea5] whitespace-nowrap">
              {syncTick >= 0 && lastSyncedAt ? `Synced ${fmtSyncAge(lastSyncedAt)}` : "Live"}
            </span>
          </div>

          {/* Name/role — hidden on smallest screens */}
          {adminProfile && (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">{adminProfile.full_name}</span>
              {roleBadge(adminProfile.role ?? null)}
            </div>
          )}

          {/* Approvals inbox button — only for owner/admin_manager */}
          {adminProfile && (adminProfile.role === "owner" || adminProfile.role === "admin_manager" || adminProfile.is_admin) && (
            <button
              type="button"
              onClick={() => setShowApprovalsInbox(true)}
              title="Approvals Inbox"
              className="relative whitespace-nowrap flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer px-2 sm:px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:text-[#3b6ea5] hover:border-[#3b6ea5] hover:bg-[#e8f0f9]"
            >
              <i className="ri-shield-check-line text-sm"></i>
              <span className="hidden sm:inline text-xs font-bold">Approvals</span>
              {pendingApprovalCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-extrabold rounded-full">
                  {pendingApprovalCount > 9 ? "9+" : pendingApprovalCount}
                </span>
              )}
            </button>
          )}

          <NotificationsBell
            onViewOrder={(confirmationId) => {
              const order = orders.find((o) => o.confirmation_id === confirmationId);
              if (order) { openOrderDetail(order); setActiveTab("orders"); }
            }}
          />

          {/* Approval notification bell — only for restricted roles */}
          {adminProfile && (
            adminProfile.role === "support" ||
            adminProfile.role === "finance" ||
            adminProfile.role === "read_only"
          ) && (
            <ApprovalNotificationBell
              userId={adminProfile.user_id}
              userName={adminProfile.full_name}
            />
          )}

          {/* Broadcast button — hidden for Finance role entirely */}
          {adminProfile?.role !== "finance" && (
            <button type="button" onClick={() => setShowBroadcast(true)}
              title={adminProfile?.role === "support" ? "Broadcast (requires approval)" : "Broadcast Message"}
              className={`whitespace-nowrap flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer px-2 sm:px-3 py-1.5 rounded-lg text-sm ${adminProfile?.role === "support" ? "text-slate-500 bg-slate-100 hover:bg-slate-200" : "text-white bg-[#3b6ea5] hover:bg-[#2d5a8e]"}`}>
              <i className={`text-sm ${adminProfile?.role === "support" ? "ri-lock-line" : "ri-broadcast-line"}`}></i>
              <span className="hidden sm:inline text-xs font-bold">Broadcast</span>
            </button>
          )}

          <button type="button" onClick={() => setShowChangePassword(true)} title="Change Password"
            className="whitespace-nowrap hidden sm:flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#3b6ea5] transition-colors cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-50">
            <i className="ri-lock-password-line"></i>
            <span className="hidden md:inline text-xs font-semibold">Password</span>
          </button>

          <button type="button" onClick={async () => { await supabase.auth.signOut(); navigate("/admin-login"); }}
            className="whitespace-nowrap flex items-center gap-1 sm:gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors cursor-pointer">
            <i className="ri-logout-box-line"></i>
            <span className="hidden sm:inline text-xs">Sign Out</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Sync with Stripe + refresh all orders"
            className="whitespace-nowrap flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:text-[#3b6ea5] hover:border-[#3b6ea5] transition-colors cursor-pointer disabled:opacity-50"
          >
            <i className={`ri-refresh-line ${refreshing ? "animate-spin" : ""}`}></i>
            <span className="hidden sm:inline">{refreshing ? "Syncing..." : "Refresh"}</span>
          </button>
          {refreshSyncMsg && (
            <span className="hidden md:flex text-xs font-semibold text-[#3b6ea5] items-center gap-1">
              <i className="ri-checkbox-circle-fill"></i>{refreshSyncMsg}
            </span>
          )}
        </div>
      </nav>

      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        visibleTabs={getVisibleTabs(adminProfile?.role ?? null, adminProfile?.custom_tab_access)}
        totalUnassigned={totalUnassigned}
        unreadCommsCount={unreadCommsCount}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
      />
      <div className={`${sidebarCollapsed ? "lg:ml-14" : "lg:ml-[220px]"} px-3 sm:px-4 md:px-6 py-5 sm:py-8 pb-24 lg:pb-8 transition-[margin] duration-200`}>
        {/* Header */}
        <div className="mb-5">
          <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-1">Admin Portal</p>
          <h1 className="text-xl font-extrabold text-slate-900 capitalize">
            {activeTab === "dashboard" ? "Dashboard" :
             activeTab === "orders" ? "Orders" :
             activeTab === "analytics" ? "Analytics" :
             activeTab === "comms" ? "Communications" :
             activeTab === "customers" ? "Customers" :
             activeTab === "doctors" ? "Providers" :
             activeTab === "earnings" ? "Earnings" :
             activeTab === "payments" ? "Payments" :
             activeTab === "team" ? "Team" :
             activeTab === "audit" ? "Audit Log" :
             activeTab === "settings" ? "Settings" : "System Health"}
          </h1>
        </div>

        {/* Toasts */}
        {createSuccessMsg && (
          <div className="mb-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-start gap-3">
            <i className="ri-checkbox-circle-fill text-[#3b6ea5] text-base mt-0.5 flex-shrink-0"></i>
            <p className="text-sm text-[#3b6ea5] font-semibold">{createSuccessMsg}</p>
          </div>
        )}
        {bulkMsg && (
          <div className={`mb-4 rounded-xl px-4 py-3 flex items-start gap-3 border ${bulkMsg.includes("failed") ? "bg-amber-50 border-amber-200" : "bg-[#e8f0f9] border-[#b8cce4]"}`}>
            <i className={`text-base mt-0.5 flex-shrink-0 ${bulkMsg.includes("failed") ? "ri-error-warning-line text-amber-600" : "ri-checkbox-circle-fill text-[#3b6ea5]"}`}></i>
            <p className={`text-sm font-semibold ${bulkMsg.includes("failed") ? "text-amber-800" : "text-[#3b6ea5]"}`}>{bulkMsg}</p>
          </div>
        )}
        {bulkDeleteMsg && (
          <div className={`mb-4 rounded-xl px-4 py-3 flex items-start gap-3 border ${bulkDeleteMsg.includes("failed") ? "bg-red-50 border-red-200" : "bg-[#e8f0f9] border-[#b8cce4]"}`}>
            <i className={`text-base mt-0.5 flex-shrink-0 ${bulkDeleteMsg.includes("failed") ? "ri-error-warning-line text-red-600" : "ri-delete-bin-2-fill text-[#3b6ea5]"}`}></i>
            <p className={`text-sm font-semibold ${bulkDeleteMsg.includes("failed") ? "text-red-700" : "text-[#3b6ea5]"}`}>{bulkDeleteMsg}</p>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <AdminDashboard
            orders={orders}
            doctorContacts={doctorContacts}
            loading={loading}
            onTabChange={(tab, filters) => {
              setActiveTab(tab as TabKey);
              if (filters?.statusFilter) setStatusFilter(filters.statusFilter);
              if (filters?.sourceFilter !== undefined) setSourceFilter(filters.sourceFilter);
            }}
          />
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "analytics" && (
          <AnalyticsTab
            orders={orders}
            onViewOrder={(order) => {
              openOrderDetail(order);
              setActiveTab("orders");
            }}
          />
        )}

        {/* ── COMMUNICATIONS TAB ── */}
        {activeTab === "comms" && (
          <div>
            <div className="mb-5">
              <h2 className="text-base font-extrabold text-gray-900">All Communications</h2>
              <p className="text-xs text-gray-500 mt-0.5">Real-time feed of every SMS and call sent or received across all orders.</p>
            </div>
            <CommunicationsPanel
              orders={orders}
              onViewOrder={(order) => {
                openOrderDetail(order);
                setActiveTab("orders");
              }}
            />
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {activeTab === "orders" && adminProfile?.role === "finance" && !financeOrdersAccessGranted ? (
          <FinanceOrdersGate
            adminName={adminProfile.full_name}
            adminUserId={adminProfile.user_id}
            onAccessGranted={() => setFinanceOrdersAccessGranted(true)}
          />
        ) : activeTab === "orders" && (
          <>
            {!loading && (
              <div className="bg-white rounded-xl border border-slate-200 mb-4 divide-y divide-slate-100 sm:divide-y-0 sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:divide-x sm:divide-slate-100 overflow-hidden">
                {[
                  {
                    label: "Lead (Unpaid)",
                    value: orders.filter((o) => o.status !== "cancelled" && (!o.payment_intent_id || o.status === "lead")).length,
                    icon: "ri-user-follow-line",
                    color: "text-amber-600",
                    filter: "lead_unpaid",
                  },
                  {
                    label: "Paid (Unassigned)",
                    value: orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded" && !o.refunded_at && !!o.payment_intent_id && o.status !== "lead" && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified").length,
                    icon: "ri-user-unfollow-line",
                    color: "text-sky-600",
                    filter: "paid_unassigned",
                  },
                  {
                    label: "Under Review",
                    value: orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded" && !o.refunded_at && !!o.payment_intent_id && o.status !== "lead" && (o.doctor_email || o.doctor_user_id) && o.doctor_status !== "patient_notified").length,
                    icon: "ri-time-line",
                    color: "text-violet-600",
                    filter: "under_review",
                  },
                  {
                    label: "Completed",
                    value: orders.filter((o) => o.doctor_status === "patient_notified").length,
                    icon: "ri-checkbox-circle-line",
                    color: "text-emerald-600",
                    filter: "completed",
                  },
                  {
                    label: "Payment Failed",
                    value: orders.filter((o) => !!(o.payment_failure_reason) && (o.status === "lead" || !o.payment_intent_id)).length,
                    icon: "ri-bank-card-line",
                    color: "text-red-500",
                    filter: "payment_failed",
                  },
                ].map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setStatusFilter(s.filter)}
                    className={`flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors w-full ${statusFilter === s.filter ? "bg-[#e8f0f9]" : "hover:bg-slate-50"}`}
                  >
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${statusFilter === s.filter ? "bg-[#3b6ea5]/10" : "bg-slate-100"}`}>
                      <i className={`${s.icon} ${s.color} text-sm`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-500 font-medium leading-none truncate">{s.label}</p>
                      <p className={`text-xl font-extrabold leading-tight ${s.color}`}>{s.value}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Source filter banner — only visible when redirected from dashboard */}
            {sourceFilter && (
              <div className="mb-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 flex items-center justify-center bg-[#3b6ea5]/10 rounded-lg flex-shrink-0">
                  <i className="ri-filter-line text-[#3b6ea5] text-sm"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#3b6ea5]">
                    Filtered by Lead Source: <span className="font-extrabold">{sourceFilter}</span>
                  </p>
                  <p className="text-[10px] text-[#3b6ea5]/60 mt-0.5">Showing orders from this traffic channel only</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceFilter(null)}
                  className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors flex-shrink-0"
                >
                  <i className="ri-close-line"></i>Clear Filter
                </button>
              </div>
            )}

            {!loading && totalUnassigned > 0 && !sourceFilter && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <i className="ri-time-line text-amber-600 text-base mt-0.5 flex-shrink-0"></i>
                <div>
                  <p className="text-xs font-bold text-amber-800">
                    {totalUnassigned} paid order{totalUnassigned !== 1 ? "s" : ""} waiting for provider assignment
                  </p>
                  {unlinkedStates.length > 0 && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      States needing coverage: <strong>{unlinkedStates.map(abbr => US_STATES.find(s => s.abbr === abbr)?.name ?? abbr).join(", ")}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Primary filter bar ── */}
            <div className="bg-white rounded-xl border border-gray-200 mb-2 overflow-hidden">
              {/* Top row: status tabs — scrollable on mobile */}
              <div className="flex items-center gap-1 px-3 pt-2.5 pb-2 border-b border-gray-100 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
                {[
                  { value: "all", label: "All" },
                  { value: "lead_unpaid", label: "Lead (Unpaid)" },
                  { value: "paid_unassigned", label: "Paid (Unassigned)" },
                  { value: "under_review", label: "Under Review" },
                  { value: "completed", label: "Completed" },
                  { value: "refunded", label: "Refunded" },
                  { value: "disputed", label: "Disputed" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "payment_failed", label: "Payment Failed" },
                ].map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
                    className={`whitespace-nowrap flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${statusFilter === opt.value ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:text-[#3b6ea5] hover:bg-gray-50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Bottom row: search + tools — stacks on mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
                {/* Search row */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {selectedOrders.size > 0 && (
                    <button type="button" onClick={() => setSelectedOrders(new Set())}
                      className="whitespace-nowrap flex items-center gap-1 px-2 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer flex-shrink-0">
                      <i className="ri-close-line"></i>{selectedOrders.size}
                    </button>
                  )}
                  <div className="relative flex-1 min-w-0">
                    <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                      placeholder="Name, email, phone, order ID, GHL contact ID..."
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                  </div>
                </div>
                {/* Tool buttons row */}
                <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                  <button type="button" onClick={() => setSortOrder((v) => v === "desc" ? "asc" : "desc")}
                    title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
                    className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <i className={sortOrder === "desc" ? "ri-sort-desc" : "ri-sort-asc"}></i>
                    <span className="hidden sm:inline">{sortOrder === "desc" ? "Newest" : "Oldest"}</span>
                  </button>
                  <div className="w-px h-4 bg-gray-200 flex-shrink-0"></div>
                  <button type="button" onClick={() => setShowAdvancedFilters((v) => !v)}
                    className={`whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? "bg-[#3b6ea5] text-white border-[#1a5c4f]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                  >
                    <i className="ri-filter-3-line"></i>
                    <span className="hidden sm:inline">Filters</span>{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDuplicatesOnly((v) => !v)}
                    title={`${duplicateCount} orders share an email or phone`}
                    className={`whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${showDuplicatesOnly ? "bg-amber-500 text-white border-amber-500" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}
                  >
                    <i className="ri-error-warning-line"></i>
                    <span className="hidden sm:inline">Dupes</span>{duplicateCount > 0 ? ` (${duplicateCount})` : ""}
                  </button>
                  {(() => {
                    const nonGhlCount = orders.filter((o) => !o.ghl_synced_at).length;
                    return (
                      <button
                        type="button"
                        onClick={() => setShowNonGhlOnly((v) => !v)}
                        title={`${nonGhlCount} orders not synced to GHL`}
                        className={`whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${showNonGhlOnly ? "bg-amber-600 text-white border-amber-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      >
                        <i className="ri-radar-line"></i>
                        <span className="hidden sm:inline">No GHL</span>{nonGhlCount > 0 ? ` (${nonGhlCount})` : ""}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>



            {/* ── Follow-up sent filter (leads only) ── */}
            {statusFilter === "lead_unpaid" && (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-2.5 mb-2 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                  <i className="ri-mail-send-line"></i> Follow-up Email:
                </span>
                <button
                  type="button"
                  onClick={() => setHideRecentFollowup((v) => !v)}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${hideRecentFollowup ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:text-[#3b6ea5]"}`}
                >
                  <i className={hideRecentFollowup ? "ri-eye-off-line" : "ri-filter-line"}></i>
                  {hideRecentFollowup ? "Hiding sent within 7d" : "Hide sent within 7 days"}
                </button>
                <span className="text-xs text-gray-400">
                  {orders.filter((o) => (!o.payment_intent_id || o.status === "lead") && o.sent_followup_at && Date.now() - new Date(o.sent_followup_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length} leads received follow-up in last 7d
                </span>
              </div>
            )}

            {/* ── Sequence quick-filter chip bar (always visible on orders tab) ── */}
            {!loading && (() => {
              const leads = orders.filter((o) => !o.payment_intent_id || o.status === "lead");
              const counts = {
                all: leads.length,
                no_sequence: leads.filter((o) => !o.seq_30min_sent_at && !o.seq_24h_sent_at && !o.seq_3day_sent_at && !o.followup_opt_out).length,
                "30min_sent": leads.filter((o) => !!o.seq_30min_sent_at && !o.seq_24h_sent_at && !o.seq_3day_sent_at).length,
                "24h_sent": leads.filter((o) => !!o.seq_24h_sent_at && !o.seq_3day_sent_at).length,
                "3day_sent": leads.filter((o) => !!o.seq_3day_sent_at).length,
                opted_out: leads.filter((o) => !!o.followup_opt_out).length,
              };
              const chips: { value: string; label: string; icon: string; activeColor: string; count: number }[] = [
                { value: "all",          label: "All Leads",      icon: "ri-group-line",          activeColor: "bg-gray-700 text-white border-gray-700",          count: counts.all },
                { value: "no_sequence",  label: "Not Started",    icon: "ri-time-line",            activeColor: "bg-gray-500 text-white border-gray-500",          count: counts.no_sequence },
                { value: "30min_sent",   label: "30min Sent",     icon: "ri-mail-check-line",      activeColor: "bg-sky-600 text-white border-sky-600",            count: counts["30min_sent"] },
                { value: "24h_sent",     label: "24h Sent",       icon: "ri-mail-send-line",       activeColor: "bg-amber-500 text-white border-amber-500",        count: counts["24h_sent"] },
                { value: "3day_sent",    label: "3-Day Sent",     icon: "ri-gift-line",            activeColor: "bg-violet-600 text-white border-violet-600",      count: counts["3day_sent"] },
                { value: "opted_out",    label: "Opted Out",      icon: "ri-forbid-line",          activeColor: "bg-red-500 text-white border-red-500",            count: counts.opted_out },
              ];
              return (
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <i className="ri-mail-send-line text-[#3b6ea5] text-sm"></i>
                    </div>
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Sequence Stage</span>
                    {sequenceFilter !== "all" && (
                      <button
                        type="button"
                        onClick={() => setSequenceFilter("all")}
                        className="whitespace-nowrap ml-auto flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                      >
                        <i className="ri-close-line"></i>Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {chips.map((chip) => (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setSequenceFilter(chip.value)}
                        className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          sequenceFilter === chip.value
                            ? chip.activeColor
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                        }`}
                      >
                        <i className={chip.icon}></i>
                        {chip.label}
                        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold ${
                          sequenceFilter === chip.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                        }`}>
                          {chip.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Advanced filters ── */}
            {showAdvancedFilters && (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                  {/* State */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">State</label>
                    <div className="relative">
                      <select value={stateFilterAdv} onChange={(e) => setStateFilterAdv(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                        <option value="all">All States</option>
                        {US_STATES.map((s) => <option key={s.abbr} value={s.abbr}>{s.abbr}</option>)}
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* Assigned Provider */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Assigned Provider</label>
                    <div className="relative">
                      <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                        <option value="all">All Providers</option>
                        <option value="unassigned">Unassigned</option>
                        {assignableProviders.map((d) => <option key={d.id} value={d.email}>{d.full_name}</option>)}
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* Selected Provider */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                    Requested Provider
                    <span title="Shows providers that customers selected via a referral/doctor landing page link. Useful for finding orders where a specific provider was preferred by the patient." className="cursor-help">
                      <i className="ri-information-line text-gray-400 text-xs"></i>
                    </span>
                  </label>
                    <div className="relative">
                      <select value={selectedProviderFilter} onChange={(e) => setSelectedProviderFilter(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                        <option value="all">Any</option>
                        {selectedProviders.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* Payment */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Payment</label>
                    <div className="relative">
                      <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                        <option value="all">All</option>
                        <option value="paid">Paid</option>
                        <option value="unpaid">No Payment</option>
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* Referred By */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Traffic Source</label>
                    <div className="relative">
                      <select value={referredByFilter} onChange={(e) => setReferredByFilter(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                        <option value="all">All Sources</option>
                        <option value="facebook">Facebook</option>
                        <option value="google_ads">Google Ads</option>
                        <option value="social_media">Social Media</option>
                        <option value="seo">SEO</option>
                        <option value="none">Direct / Unknown</option>
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* Sequence Status */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                      Sequence Status
                      <span title="Filter leads by their follow-up sequence stage. Only applies to unpaid leads." className="cursor-help">
                        <i className="ri-information-line text-gray-400 text-xs"></i>
                      </span>
                    </label>
                    <div className="relative">
                      <select value={sequenceFilter} onChange={(e) => setSequenceFilter(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                        <option value="all">All Sequences</option>
                        <option value="no_sequence">No Sequence Sent</option>
                        <option value="30min_sent">30min Email Sent</option>
                        <option value="24h_sent">24h Email Sent</option>
                        <option value="3day_sent">3-Day Email Sent</option>
                        <option value="opted_out">Opted Out</option>
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* Date From */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">From Date</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer" />
                  </div>
                  {/* Date To */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">To Date</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer" />
                      {activeFilterCount > 0 && (
                        <button type="button" onClick={clearAdvancedFilters}
                          className="whitespace-nowrap flex items-center gap-1.5 px-2.5 py-2 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                          <i className="ri-arrow-left-line"></i>Go Back
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Showing <strong>{filtered.length}</strong> of <strong>{orders.length}</strong> orders
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i>
                  <p className="text-sm text-gray-500">Loading all orders...</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                  <i className="ri-file-search-line text-gray-400 text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-700">No orders match your filters</p>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearAdvancedFilters}
                    className="whitespace-nowrap mt-3 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg cursor-pointer hover:bg-gray-200">
                    Clear Advanced Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Select All + count bar */}
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${allFilteredSelected ? "bg-[#3b6ea5] border-[#1a5c4f]" : "border-gray-300 group-hover:border-[#1a5c4f]"}`}>
                        {allFilteredSelected && <i className="ri-check-line text-white" style={{ fontSize: "11px" }}></i>}
                      </div>
                      <span className="text-xs font-bold text-gray-600 group-hover:text-[#3b6ea5] transition-colors">
                        {allFilteredSelected ? "Deselect All" : "Select All"}
                      </span>
                    </button>
                    {selectedOrders.size > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#3b6ea5] text-white rounded-full text-xs font-bold">
                        <i className="ri-checkbox-multiple-line" style={{ fontSize: "10px" }}></i>
                        {selectedOrders.size} selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">{filtered.length}</span>
                    <span>of</span>
                    <span className="font-semibold text-gray-700">{orders.length}</span>
                    <span>orders</span>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearAdvancedFilters}
                        className="whitespace-nowrap flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 hover:text-[#3b6ea5] rounded-lg text-xs font-semibold cursor-pointer transition-colors ml-1"
                      >
                        <i className="ri-close-line"></i>Clear filters
                      </button>
                    )}
                  </div>
                </div>

                {/* ── DESKTOP: bordered table with header ─────────────────── */}
                {(() => {
                  // Group visibleOrders by calendar date for ribbon separators
                  const getDateKey = (ts: string) => {
                    const d = new Date(ts);
                    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                  };
                  const getDateLabel = (ts: string) => {
                    const d = new Date(ts);
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(today.getDate() - 1);
                    const isToday = d.toDateString() === today.toDateString();
                    const isYesterday = d.toDateString() === yesterday.toDateString();
                    if (isToday) return "Today";
                    if (isYesterday) return "Yesterday";
                    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                  };

                  // Build grouped structure: [{dateKey, dateLabel, orders[]}]
                  const groups: { dateKey: string; dateLabel: string; orders: Order[] }[] = [];
                  visibleOrders.forEach((order) => {
                    const dk = getDateKey(order.created_at);
                    const last = groups[groups.length - 1];
                    if (last && last.dateKey === dk) {
                      last.orders.push(order);
                    } else {
                      groups.push({ dateKey: dk, dateLabel: getDateLabel(order.created_at), orders: [order] });
                    }
                  });

                  const orderCardProps = (order: Order) => ({
                    order,
                    isExpanded: expandedCardId === order.id,
                    onToggleExpand: () => setExpandedCardId((prev) => prev === order.id ? null : order.id),
                    isSelected: selectedOrders.has(order.confirmation_id),
                    onToggleSelect: () => toggleSelectOrder(order.confirmation_id),
                    notesOpen: expandedNotes === order.confirmation_id,
                    onToggleNotes: () => setExpandedNotes(expandedNotes === order.confirmation_id ? null : order.confirmation_id),
                    assignableProviders,
                    pendingAssign,
                    onSetPendingAssign: setPendingAssign,
                    onCancelPendingAssign: () => setPendingAssign(null),
                    onConfirmAssign: handleAssign,
                    assigning,
                    assignMsg,
                    ghlRefiring,
                    onGhlRefire: handleGhlRefire,
                    ghlReFireResult,
                    recoveryMsg,
                    onOpenRecovery: openRecoveryModal,
                    onSendRecoveryDirect: handleSendRecoveryDirect,
                    sendingRecoveryDirect,
                    unreadCommsMap,
                    noteCount: orderNoteCounts[order.id] ?? 0,
                    adminProfile,
                    onOpenDetail: openOrderDetail,
                    onOpenStatusLog: (o: Order) => setShowStatusLog(o),
                    onOpenAssessmentIntake: (o: Order) => setAssessmentIntakeOrder(o),
                    onToggleOptOut: handleToggleOptOut,
                    coveredStates,
                    duplicateEmailSet,
                    US_STATES,
                  });

                  return (
                    <>
                      {/* DESKTOP */}
                      <div className="hidden lg:block space-y-3">
                        {groups.map((group) => (
                          <div key={group.dateKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            {/* Date ribbon */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
                              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                <i className="ri-calendar-line text-[#3b6ea5] text-xs"></i>
                              </div>
                              <span className="text-xs font-extrabold text-[#3b6ea5] tracking-wide">{group.dateLabel}</span>
                              <div className="flex-1 h-px bg-[#d0ede6]"></div>
                              <span className="text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                {group.orders.length} order{group.orders.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            {/* Column header — only on first group or always */}
                            <div className="flex items-center gap-0 px-4 py-2 bg-gray-50/60 border-b border-gray-100">
                              <div className="w-9 flex-shrink-0"></div>
                              <div className="flex-1 min-w-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name</div>
                              <div className="w-[140px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Order ID</div>
                              <div className="w-[80px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">State</div>
                              <div className="w-[120px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Activity</div>
                              <div className="w-[150px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</div>
                              <div className="w-[100px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sequence</div>
                              <div className="w-[110px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Provider</div>
                              <div className="w-[80px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Time</div>
                              <div className="w-[80px] flex-shrink-0 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Actions</div>
                            </div>
                            {/* Rows */}
                            <div className="divide-y divide-gray-100">
                              {group.orders.map((order) => (
                                <OrderCard key={order.id} {...orderCardProps(order)} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* MOBILE */}
                      <div className="lg:hidden space-y-4">
                        {groups.map((group) => (
                          <div key={group.dateKey}>
                            {/* Date ribbon */}
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                <i className="ri-calendar-line text-[#3b6ea5] text-xs"></i>
                              </div>
                              <span className="text-xs font-extrabold text-[#3b6ea5]">{group.dateLabel}</span>
                              <div className="flex-1 h-px bg-[#d0ede6]"></div>
                              <span className="text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                {group.orders.length}
                              </span>
                            </div>
                            <div className="space-y-3">
                              {group.orders.map((order) => (
                                <OrderCard key={order.id} {...orderCardProps(order)} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}

                {/* ── Load More ─────────────────────────────────────────── */}
                {hasMore && (
                  <div className="flex flex-col items-center gap-2 pt-4 pb-2">
                    <p className="text-xs text-gray-400">
                      Showing <strong className="text-gray-700">{visibleOrders.length}</strong> of <strong className="text-gray-700">{filtered.length}</strong> orders
                    </p>
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + 50)}
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 cursor-pointer transition-colors"
                    >
                      <i className="ri-arrow-down-line"></i>Load 50 More
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* GHL reference */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                  <i className="ri-radar-line text-amber-600 text-base"></i>
                </div>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">GHL Webhook URLs</p>
              </div>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-bold text-gray-600 mb-1">Main Webhook (Paid Orders)</p>
                  <p className="font-mono text-xs text-gray-700 break-all select-all">https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/6feb660d-6ee0-4a71-a2c0-732264440592</p>
                  <p className="text-[10px] text-amber-600 mt-1 font-semibold">⚠ Set this as GHL_WEBHOOK_URL in Supabase Edge Function Secrets</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-bold text-gray-600 mb-1">Network Webhook (Join Our Network)</p>
                  <p className="font-mono text-xs text-gray-700 break-all select-all">https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/cfdc1278-5813-46c9-901e-39165cf0f1f3</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── CUSTOMERS TAB ── */}
        {activeTab === "customers" && <CustomersTab />}

        {/* ── DOCTORS TAB ── */}
        {activeTab === "doctors" && <DoctorsTab onProviderAdded={loadOrderData} />}

        {/* ── EARNINGS TAB ── */}
        {activeTab === "earnings" && (
          <div>
            <div className="mb-6">
              <h2 className="text-base font-extrabold text-gray-900">Doctor Earnings &amp; Payouts</h2>
              <p className="text-xs text-gray-500 mt-0.5">Track completed cases, set payout amounts, and mark payments sent.</p>
            </div>
            <EarningsPanel />
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {activeTab === "payments" && <PaymentsTab />}

        {/* ── TEAM TAB ── */}
        {activeTab === "team" && <TeamTab />}

        {/* ── AUDIT LOG TAB ── */}
        {activeTab === "audit" && (
          <div>
            <div className="mb-5">
              <h2 className="text-base font-extrabold text-gray-900">System Audit Log</h2>
              <p className="text-xs text-gray-500 mt-0.5">All actions logged across orders, payments, GHL syncs, staff changes, and refunds.</p>
            </div>
            <AuditLogTab />
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && <SettingsTab adminRole={adminProfile?.role ?? null} />}

        {/* ── SYSTEM HEALTH TAB ── */}
        {activeTab === "health" && <SystemHealthTab />}
      </div>

      {/* ── BULK ASSIGN BAR ── */}
      {selectedOrders.size > 0 && activeTab === "orders" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#3b6ea5] border-t border-[#17504a] px-3 sm:px-6 py-3 sm:py-4 pb-[calc(0.75rem+56px)] lg:pb-4">
          <div className={`${sidebarCollapsed ? "lg:ml-14" : "lg:ml-[220px]"} space-y-2 transition-[margin] duration-200`}>
            {/* Lead warning strip */}
            {(() => {
              const nonAssignableCount = orders.filter((o) =>
                selectedOrders.has(o.confirmation_id) && (
                  !o.payment_intent_id ||
                  o.status === "lead" ||
                  o.status === "refunded" ||
                  !!o.refunded_at ||
                  o.doctor_status === "patient_notified"
                )
              ).length;
              const assignableCount = selectedOrders.size - nonAssignableCount;
              return nonAssignableCount > 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/20 border border-amber-400/40 rounded-lg">
                  <i className="ri-error-warning-line text-amber-300 flex-shrink-0"></i>
                  <p className="text-xs font-bold text-amber-200">
                    {nonAssignableCount} order{nonAssignableCount !== 1 ? "s" : ""} cannot be assigned (unpaid, refunded, or completed).{" "}
                    {assignableCount > 0 ? (
                      <span className="text-white">Only the {assignableCount} eligible order{assignableCount !== 1 ? "s" : ""} will be assigned.</span>
                    ) : (
                      <span className="text-white">No eligible orders selected — assignment is disabled.</span>
                    )}
                  </p>
                </div>
              ) : null;
            })()}

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 flex items-center justify-center bg-white/10 rounded-full">
                  <i className="ri-checkbox-multiple-line text-white text-sm"></i>
                </div>
                <span className="text-white font-bold text-sm">
                  {selectedOrders.size} order{selectedOrders.size !== 1 ? "s" : ""} selected
                </span>
              </div>

              <div className="flex items-center gap-3 flex-1 flex-wrap">
                {!showBulkConfirm ? (
                  <>
                    {/* Assign dropdown — blocked for read_only */}
                    {(() => {
                      const assignableCount = orders.filter((o) =>
                        selectedOrders.has(o.confirmation_id) &&
                        !!o.payment_intent_id &&
                        o.status !== "lead" &&
                        o.status !== "refunded" &&
                        !o.refunded_at &&
                        o.doctor_status !== "patient_notified"
                      ).length;
                      const isReadOnly = adminProfile?.role === "read_only";
                      return assignableCount > 0 ? (
                        <>
                          {isReadOnly ? (
                            /* read_only: show locked assign button that triggers approval request */
                            <button
                              type="button"
                              onClick={() => setShowApprovalRequest({
                                actionType: "bulk_assign",
                                actionLabel: "Bulk Provider Assignment",
                                actionDescription: `Request to assign ${assignableCount} eligible order${assignableCount !== 1 ? "s" : ""} to a provider. As a Read Only user, this requires Owner or Admin Manager approval.`,
                                payload: {
                                  orderIds: Array.from(selectedOrders),
                                  orderCount: selectedOrders.size,
                                  assignableCount,
                                },
                              })}
                              className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-white/10 border border-white/30 text-white/60 text-sm font-bold rounded-lg cursor-pointer hover:bg-white/20 transition-colors"
                            >
                              <i className="ri-lock-line"></i>
                              Assign (Restricted)
                              <span className="text-xs bg-white/20 text-white/70 px-1.5 py-0.5 rounded-full">{assignableCount}</span>
                            </button>
                          ) : (
                            <>
                              <div className="relative min-w-[200px]">
                                <select
                                  value={bulkDoctorEmail}
                                  onChange={(e) => setBulkDoctorEmail(e.target.value)}
                                  className="w-full appearance-none pl-3 pr-8 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/60 cursor-pointer"
                                >
                                  <option value="" className="text-gray-800">— Assign Provider to All —</option>
                                  {assignableProviders
                                    .filter((d) => d.is_active !== false)
                                    .map((doc) => (
                                      <option key={doc.id} value={doc.email} className="text-gray-800">{doc.full_name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                                  <i className="ri-arrow-down-s-line text-white text-sm"></i>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => { if (bulkDoctorEmail) setShowBulkConfirm(true); }}
                                disabled={!bulkDoctorEmail || bulkAssigning}
                                className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-white text-[#3b6ea5] text-sm font-extrabold rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <i className="ri-user-received-line"></i>Assign {assignableCount} Order{assignableCount !== 1 ? "s" : ""}
                              </button>
                            </>
                          )}
                        </>
                      ) : null;
                    })()}
                    {(() => {
                      const paidUnassigned = orders.filter((o) =>
                        selectedOrders.has(o.confirmation_id) &&
                        !!o.payment_intent_id &&
                        !o.doctor_email &&
                        !o.doctor_user_id &&
                        o.doctor_status !== "patient_notified",
                      );
                      return paidUnassigned.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowBulkSMS(true)}
                          title={adminProfile?.role === "support" ? "Bulk SMS (view restrictions)" : "Send bulk SMS to unassigned paid orders"}
                          className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-lg cursor-pointer transition-colors ${adminProfile?.role === "support" ? "bg-white/10 text-white/50 border border-white/20 hover:bg-white/20" : "bg-[#e8f0f9] text-[#3b6ea5] hover:bg-white"}`}
                        >
                          <i className={adminProfile?.role === "support" ? "ri-lock-line" : "ri-message-3-line"}></i>
                          Bulk SMS
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${adminProfile?.role === "support" ? "bg-white/20 text-white/60" : "bg-[#3b6ea5] text-white"}`}>
                            {paidUnassigned.length}
                          </span>
                        </button>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    {(() => {
                      const assignableCount = orders.filter((o) =>
                        selectedOrders.has(o.confirmation_id) &&
                        !!o.payment_intent_id &&
                        o.status !== "lead" &&
                        o.status !== "refunded" &&
                        !o.refunded_at &&
                        o.doctor_status !== "patient_notified"
                      ).length;
                      const skippedCount = selectedOrders.size - assignableCount;
                      return (
                        <div className="bg-white/10 border border-white/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
                          <i className="ri-error-warning-line text-amber-300 text-base"></i>
                          <span className="text-sm text-white font-semibold">
                            Assign{" "}
                            <strong className="text-amber-300">
                              {assignableProviders.find((d) => d.email === bulkDoctorEmail)?.full_name ?? bulkDoctorEmail}
                            </strong>{" "}
                            to <strong>{assignableCount}</strong> eligible order{assignableCount !== 1 ? "s" : ""}
                            {skippedCount > 0 && <span className="text-amber-300"> · {skippedCount} skipped</span>}?
                          </span>
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={handleBulkAssign}
                      disabled={bulkAssigning}
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-white text-[#3b6ea5] text-sm font-extrabold rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {bulkAssigning
                        ? <><i className="ri-loader-4-line animate-spin"></i>Assigning&hellip;</>
                        : <><i className="ri-check-double-line"></i>Yes, Confirm &amp; Notify</>
                      }
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkConfirm(false)}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 text-white/70 hover:text-white text-sm font-semibold cursor-pointer transition-colors"
                    >
                      <i className="ri-arrow-left-line"></i>Go Back
                    </button>
                  </div>
                )}
                {/* ── Bulk Stop Sequence — only for unpaid leads with active sequences ── */}
                {(() => {
                  const eligibleLeads = orders.filter((o) =>
                    selectedOrders.has(o.confirmation_id) &&
                    (!o.payment_intent_id || o.status === "lead") &&
                    !o.followup_opt_out &&
                    (o.seq_30min_sent_at || o.seq_24h_sent_at || o.seq_3day_sent_at)
                  );
                  const notStartedLeads = orders.filter((o) =>
                    selectedOrders.has(o.confirmation_id) &&
                    (!o.payment_intent_id || o.status === "lead") &&
                    !o.followup_opt_out &&
                    !o.seq_30min_sent_at && !o.seq_24h_sent_at && !o.seq_3day_sent_at
                  );
                  const totalOptable = eligibleLeads.length + notStartedLeads.length;
                  return totalOptable > 0 ? (
                    <button
                      type="button"
                      onClick={handleBulkStopSequence}
                      disabled={bulkStoppingSequence}
                      title="Stop automated follow-up emails for selected unpaid leads. Paid orders stop automatically — this is for manually opting out leads who asked to stop."
                      className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30 text-sm font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {bulkStoppingSequence
                        ? <><i className="ri-loader-4-line animate-spin"></i>Stopping...</>
                        : <><i className="ri-forbid-line"></i>Stop Sequence</>
                      }
                      <span className="bg-red-400/30 text-red-100 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {totalOptable}
                      </span>
                    </button>
                  ) : null;
                })()}
                {(() => {
                  const leadOrders = orders.filter((o) => selectedOrders.has(o.confirmation_id) && o.status === "lead");
                  return leadOrders.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowLeadActionsModal(true)}
                      className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-amber-400 text-amber-900 text-sm font-extrabold rounded-lg hover:bg-amber-300 cursor-pointer transition-colors"
                    >
                      <i className="ri-user-follow-line"></i>Lead Actions
                      <span className="bg-amber-900/20 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {leadOrders.length}
                      </span>
                    </button>
                  ) : null;
                })()}
                {/* ── Bulk GHL Sync — beside Stop Sequence ── */}
                {!bulkGhlSyncDone ? (
                  <button
                    type="button"
                    onClick={handleBulkGhlSync}
                    disabled={bulkGhlSyncing}
                    title="Push all selected orders to GHL CRM"
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-amber-400/20 border border-amber-400/40 text-amber-200 hover:bg-amber-400/30 text-sm font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {bulkGhlSyncing ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        GHL {bulkGhlSyncProgress.done}/{bulkGhlSyncProgress.total}
                      </>
                    ) : (
                      <>
                        <i className="ri-radar-line"></i>
                        Sync GHL
                        <span className="bg-amber-400/30 text-amber-100 text-xs font-bold px-1.5 py-0.5 rounded-full">
                          {selectedOrders.size}
                        </span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white">
                    <i className={bulkGhlSyncProgress.fail === 0 ? "ri-checkbox-circle-fill text-emerald-300" : "ri-error-warning-line text-amber-300"}></i>
                    {bulkGhlSyncProgress.fail === 0
                      ? `${bulkGhlSyncProgress.success} synced to GHL`
                      : `${bulkGhlSyncProgress.success} ok · ${bulkGhlSyncProgress.fail} failed`}
                  </div>
                )}
              </div>

              {/* Bulk Delete — role-gated */}
              {(() => {
                const canDelete = adminProfile?.role === "owner" || adminProfile?.role === "admin_manager" || adminProfile?.is_admin;
                const isRestrictedDelete = adminProfile?.role === "support" || adminProfile?.role === "finance";

                if (canDelete) {
                  return (
                    <button
                      type="button"
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30 text-sm font-bold rounded-lg cursor-pointer transition-colors"
                    >
                      <i className="ri-delete-bin-2-line"></i>
                      Delete ({selectedOrders.size})
                    </button>
                  );
                }

                if (isRestrictedDelete) {
                  return (
                    <button
                      type="button"
                      onClick={() => setShowApprovalRequest({
                        actionType: "bulk_delete",
                        actionLabel: "Bulk Order Deletion",
                        actionDescription: `Request to permanently delete ${selectedOrders.size} selected order${selectedOrders.size !== 1 ? "s" : ""}. As a ${adminProfile?.role === "support" ? "Support" : "Finance"} user, this requires Owner or Admin Manager approval.`,
                        payload: {
                          orderIds: Array.from(selectedOrders),
                          orderCount: selectedOrders.size,
                        },
                      })}
                      title="Request approval to delete orders"
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 bg-white/10 border border-white/30 text-white/60 text-sm font-bold rounded-lg cursor-pointer hover:bg-white/20 transition-colors"
                    >
                      <i className="ri-lock-line"></i>
                      Delete (Restricted)
                    </button>
                  );
                }

                return null;
              })()}

              <button
                type="button"
                onClick={() => { setSelectedOrders(new Set()); setBulkDoctorEmail(""); setShowBulkConfirm(false); }}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2.5 text-white/70 hover:text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                <i className="ri-close-line"></i>Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showLeadActionsModal && (
        <LeadActionsModal
          leads={orders.filter((o) => selectedOrders.has(o.confirmation_id) && o.status === "lead")}
          onClose={() => setShowLeadActionsModal(false)}
        />
      )}
      {showBulkSMS && adminProfile && (
        <BulkSMSModal
          orders={orders.filter((o) =>
            selectedOrders.has(o.confirmation_id) &&
            !!o.payment_intent_id &&
            !o.doctor_email &&
            !o.doctor_user_id &&
            o.doctor_status !== "patient_notified",
          )}
          adminName={adminProfile.full_name}
          adminRole={adminProfile.role ?? null}
          onClose={() => setShowBulkSMS(false)}
        />
      )}
      {showCreateModal && (
        <CreateDoctorModal onClose={() => setShowCreateModal(false)} onCreated={handleDoctorCreated} />
      )}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {showBroadcast && adminProfile && (
        <BroadcastModal
          orders={orders}
          adminName={adminProfile.full_name}
          adminEmail={adminProfile.email ?? ""}
          adminRole={adminProfile.role ?? null}
          onClose={() => setShowBroadcast(false)}
        />
      )}
      {showStatusLog && (
        <OrderStatusLogModal orderId={showStatusLog.id} confirmationId={showStatusLog.confirmation_id}
          currentStatus={showStatusLog.status} currentDoctorStatus={showStatusLog.doctor_status}
          createdAt={showStatusLog.created_at} onClose={() => setShowStatusLog(null)} />
      )}
      {orderDetail && adminProfile && (
        <OrderDetailModal order={orderDetail} doctorContacts={assignableProviders} adminProfile={adminProfile}
          onClose={() => setOrderDetail(null)} onOrderUpdated={handleOrderUpdated} onOrderDeleted={handleOrderDeleted}
          allOrders={filtered}
          onNavigate={(order) => openOrderDetail(order)}
          onClearUnread={(cid) => {
            const now = Date.now();
            const updated = { ...lastViewedMap, [cid]: now };
            setLastViewedMap(updated);
            try { localStorage.setItem("pw_order_last_viewed", JSON.stringify(updated)); } catch { /* ignore */ }
            setUnreadCommsMap((prev) => ({ ...prev, [cid]: 0 }));
          }}
        />
      )}
      {assessmentIntakeOrder && (
        <AssessmentIntakeModal
          order={assessmentIntakeOrder}
          onClose={() => setAssessmentIntakeOrder(null)}
        />
      )}

      {/* ── Bulk Delete Confirmation Modal (owner/admin only) ── */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowBulkDeleteConfirm(false); setBulkDeleteConfirmText(""); }}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="w-11 h-11 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-delete-bin-2-fill text-red-600 text-xl"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Permanently Delete {selectedOrders.size} Order{selectedOrders.size !== 1 ? "s" : ""}?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will <strong>permanently delete</strong> all selected orders and their documents, notes, and status history. <strong>This cannot be undone.</strong>
                </p>
              </div>
            </div>
            <div className="px-6 pb-2">
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 space-y-1 text-xs text-red-700">
                <p className="font-bold flex items-center gap-1"><i className="ri-error-warning-fill"></i>{selectedOrders.size} order{selectedOrders.size !== 1 ? "s" : ""} selected for deletion</p>
                <p className="flex items-center gap-1"><i className="ri-file-shred-line"></i>All documents, notes, status logs &amp; earnings records will be deleted</p>
                <p className="flex items-center gap-1"><i className="ri-bank-card-line"></i>Stripe payment records are NOT affected — only the local DB records</p>
                <p className="flex items-center gap-1"><i className="ri-shield-keyhole-line"></i>Only owner/admin accounts can perform bulk deletion</p>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  Type <span className="font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={bulkDeleteConfirmText}
                  onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE here"
                  className="w-full px-3 py-2.5 border border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-500 bg-white"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2 pb-6">
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting || bulkDeleteConfirmText !== "DELETE"}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDeleting
                    ? <><i className="ri-loader-4-line animate-spin"></i>Deleting...</>
                    : <><i className="ri-delete-bin-2-line"></i>Yes, Delete {selectedOrders.size} Order{selectedOrders.size !== 1 ? "s" : ""}</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBulkDeleteConfirm(false); setBulkDeleteConfirmText(""); }}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Recovery Email Modal ── */}
      {recoveryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRecoveryModal(null)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-xl flex-shrink-0">
                <i className="ri-mail-send-line text-orange-500 text-lg"></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-extrabold text-gray-900">Abandoned Checkout Recovery Email</h3>
                <p className="text-xs text-gray-400 truncate">
                  {recoveryModal.first_name ? `${recoveryModal.first_name} · ` : ""}{recoveryModal.email}
                </p>
              </div>
              <button type="button" onClick={() => setRecoveryModal(null)}
                className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
              {/* Order info */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">Order ID</p>
                  <p className="text-xs font-mono font-bold text-gray-700">{recoveryModal.confirmation_id}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">State</p>
                  <p className="text-xs font-semibold text-gray-700">{recoveryModal.state ?? "—"}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">Amount</p>
                  <p className="text-xs font-bold text-orange-600">{recoveryModal.price != null ? `$${recoveryModal.price}` : "—"}</p>
                </div>
              </div>

              {/* Discount offer */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-[#dbeafe] rounded-lg flex-shrink-0">
                    <i className="ri-coupon-3-line text-[#3b6ea5] text-xs"></i>
                  </div>
                  <p className="text-xs font-bold text-gray-700">Discount / Promo Code (Optional)</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Promo Code</label>
                    <input
                      type="text"
                      value={recoveryDiscount}
                      onChange={(e) => setRecoveryDiscount(e.target.value.toUpperCase())}
                      placeholder="e.g. SAVE10, WELCOME20"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#3b6ea5] bg-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Leave blank to send without a discount offer</p>
                  </div>
                  {recoveryDiscount.trim() && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Discount Type</label>
                        <div className="relative">
                          <select
                            value={recoveryDiscountType}
                            onChange={(e) => setRecoveryDiscountType(e.target.value as "percent" | "fixed")}
                            className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer"
                          >
                            <option value="percent">Percentage (%)</option>
                            <option value="fixed">Fixed Amount ($)</option>
                          </select>
                          <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          {recoveryDiscountType === "percent" ? "Discount %" : "Discount $"}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={recoveryDiscountType === "percent" ? "100" : undefined}
                          value={recoveryDiscountValue}
                          onChange={(e) => setRecoveryDiscountValue(e.target.value)}
                          placeholder={recoveryDiscountType === "percent" ? "10" : "15"}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom message */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                    <i className="ri-message-3-line text-gray-500 text-xs"></i>
                  </div>
                  <p className="text-xs font-bold text-gray-700">Custom Message (Optional)</p>
                </div>
                <textarea
                  value={recoveryCustomMsg}
                  onChange={(e) => setRecoveryCustomMsg(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Add a personal note to include in the email, e.g. 'We noticed you didn\'t complete — happy to answer any questions!'"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3b6ea5] resize-none bg-gray-50"
                />
                <p className="text-xs text-gray-400 text-right mt-0.5">{recoveryCustomMsg.length}/300</p>
              </div>

              {/* Email preview note */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <i className="ri-information-line text-orange-500 flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-orange-700 leading-relaxed">
                  The email will include the assessment status, a &ldquo;Complete My Payment&rdquo; button
                  {recoveryDiscount.trim() ? <>, and a <strong>highlighted {recoveryDiscount.toUpperCase()} promo code</strong></> : null}.
                  {" "}The link will take them back to checkout with their answers pre-filled.
                </p>
              </div>

              {/* Result */}
              {recoveryResult && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${recoveryResult.ok ? "bg-[#e8f0f9] border-[#b8cce4] text-[#3b6ea5]" : "bg-red-50 border-red-200 text-red-700"}`}>
                  <i className={recoveryResult.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                  {recoveryResult.msg}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSendRecovery}
                  disabled={recoverySending || !!(recoveryResult?.ok)}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {recoverySending
                    ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                    : recoveryResult?.ok
                      ? <><i className="ri-checkbox-circle-fill"></i>Email Sent!</>
                      : <><i className="ri-mail-send-line"></i>Send Recovery Email{recoveryDiscount.trim() ? " + Discount" : ""}</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryModal(null)}
                  className="whitespace-nowrap px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Approval Request Modal ── */}
      {showApprovalRequest && adminProfile && (
        <ApprovalRequestModal
          actionType={showApprovalRequest.actionType}
          actionLabel={showApprovalRequest.actionLabel}
          actionDescription={showApprovalRequest.actionDescription}
          payload={showApprovalRequest.payload}
          requesterName={adminProfile.full_name}
          requesterRole={adminProfile.role ?? "support"}
          requesterUserId={adminProfile.user_id}
          onClose={() => setShowApprovalRequest(null)}
        />
      )}

      {/* ── Approvals Inbox (owner/admin only) ── */}
      {showApprovalsInbox && adminProfile && (
        <ApprovalsInbox
          reviewerName={adminProfile.full_name}
          reviewerRole={adminProfile.role ?? "admin_manager"}
          reviewerId={adminProfile.user_id}
          onApproveAction={handleApproveAction}
          onClose={() => { setShowApprovalsInbox(false); setPendingApprovalCount(0); }}
        />
      )}
    </div>
  );
}
