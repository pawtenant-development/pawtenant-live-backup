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
import IncomingCallBanner from "./components/IncomingCallBanner";
import BulkSMSModal from "./components/BulkSMSModal";
import BroadcastModal from "./components/BroadcastModal";
import CommunicationsPanel from "./components/CommunicationsPanel";
import SystemHealthTab from "./components/SystemHealthTab";

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
  role: string | null;
}

interface DoctorContact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  licensed_states: string[];
  is_active: boolean | null;
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
  letter_sent: "bg-[#e8f5f1] text-[#1a5c4f]",
  patient_notified: "bg-violet-100 text-violet-700",
  unassigned: "bg-gray-100 text-gray-500",
  thirty_day_reissue: "bg-orange-100 text-orange-700",
};

// ─── Role-based tab visibility ─────────────────────────────────────────────

type TabKey = "dashboard" | "orders" | "comms" | "customers" | "doctors" | "earnings" | "payments" | "team" | "audit" | "settings" | "health";

const ALL_TABS: TabKey[] = ["dashboard", "orders", "comms", "customers", "doctors", "earnings", "payments", "team", "audit", "settings", "health"];

function getVisibleTabs(role: string | null): TabKey[] {
  switch (role) {
    case "owner":
    case "admin_manager":
      return ALL_TABS;
    case "support":
      // Support: orders, customers, doctors, audit — no payments, earnings, team, settings
      return ["dashboard", "orders", "comms", "customers", "doctors", "audit", "health"];
    case "finance":
      // Finance: orders, customers, payments, earnings, audit — no team, settings, doctors
      return ["dashboard", "orders", "comms", "customers", "payments", "earnings", "audit", "health"];
    case "read_only":
      // Read-only: orders, customers, doctors, payments, audit — no team, settings, earnings
      return ["dashboard", "orders", "comms", "customers", "doctors", "payments", "audit", "health"];
    default:
      return ALL_TABS;
  }
}

// ─── Role badge helper ────────────────────────────────────────────────────────

function roleBadge(role: string | null) {
  const cfg: Record<string, { label: string; color: string }> = {
    owner:         { label: "Owner",     color: "bg-[#f3e8ff] text-[#7c3aed]" },
    admin_manager: { label: "Admin",     color: "bg-[#e8f5f1] text-[#1a5c4f]" },
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

// ─── Last-contacted badge helper ───────────────────────────────────────────
function fmtLastContacted(ts: string | null): { label: string; color: string } | null {
  if (!ts) return null;
  const diffMs   = Date.now() - new Date(ts).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60)    return { label: `${diffMins}m ago`,                  color: "bg-[#f0faf7] text-[#1a5c4f]" };
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)    return { label: `${diffHrs}h ago`,                    color: "bg-[#f0faf7] text-[#1a5c4f]" };
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

  // ── Advanced filters ──
  const [stateFilterAdv, setStateFilterAdv] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [selectedProviderFilter, setSelectedProviderFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [referredByFilter, setReferredByFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

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

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  const [sendingRecovery, setSendingRecovery] = useState<string | null>(null);
  const [recoveryMsg, setRecoveryMsg] = useState<Record<string, { ok: boolean; msg: string }>>({});

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
        });
      });
    return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [doctorContacts, doctorProfiles]);

  // ── States with at least one active licensed provider ───────────────────────
  const coveredStates = useMemo(() => {
    const covered = new Set<string>();
    assignableProviders.forEach((d) => {
      if (d.is_active === false) return;
      (d.licensed_states ?? []).forEach((state) => {
        // Support full name ("New York") → add abbr ("NY")
        const abbr = US_STATES.find((s) => s.name === state)?.abbr;
        if (abbr) covered.add(abbr);
        // Support abbr directly ("NY")
        if (state.length === 2) covered.add(state);
      });
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
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name"),
      supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, role").order("full_name"),
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

  // ── Silently refresh provider lists whenever user lands on Orders tab ───────
  // This ensures state edits made in the Providers tab are immediately reflected
  // in the assignment dropdowns without requiring a full page reload.
  useEffect(() => {
    if (activeTab !== "orders") return;
    Promise.all([
      supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name"),
      supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, role").order("full_name"),
    ]).then(([contactsRes, profilesRes]) => {
      if (contactsRes.data) setDoctorContacts(contactsRes.data as DoctorContact[]);
      if (profilesRes.data) setDoctorProfiles(profilesRes.data as DoctorProfile[]);
    }).catch(() => {/* silent — stale data is still usable */});
  }, [activeTab]);

  const handleDoctorCreated = (result: { full_name: string; email: string }) => {
    setShowCreateModal(false);
    setCreateSuccessMsg(`${result.full_name} (${result.email}) — provider added to the panel successfully.`);
    setTimeout(() => setCreateSuccessMsg(""), 7000);
    supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states").order("full_name")
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
    const matchDateFrom = !dateFrom || new Date(o.created_at) >= new Date(dateFrom);
    const matchDateTo = !dateTo || new Date(o.created_at) <= new Date(dateTo + "T23:59:59");
    const matchDuplicates = !showDuplicatesOnly || duplicateContactSet.has(o.email.toLowerCase()) || (!!o.phone && duplicateContactSet.has(o.phone.replace(/\D/g, "")));
    const q = search.toLowerCase();
    const matchSearch = !q ||
      o.confirmation_id.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      `${o.first_name ?? ""} ${o.last_name ?? ""}`.toLowerCase().includes(q) ||
      (o.state ?? "").toLowerCase().includes(q) ||
      (o.doctor_name ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").includes(q);
    return matchStatus && matchState && matchDoctor && matchSelectedProvider && matchPayment && matchRef && matchDateFrom && matchDateTo && matchSearch && matchDuplicates;
  }).filter((o) => {
    if (!hideRecentFollowup) return true;
    if (!o.sent_followup_at) return true;
    const age = Date.now() - new Date(o.sent_followup_at).getTime();
    return age > 7 * 24 * 60 * 60 * 1000;
  }).sort((a, b) => {
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    return sortOrder === "desc" ? tB - tA : tA - tB;
  });

  const activeFilterCount = [
    stateFilterAdv !== "all",
    doctorFilter !== "all",
    selectedProviderFilter !== "all",
    paymentFilter !== "all",
    referredByFilter !== "all",
    !!dateFrom,
    !!dateTo,
    showDuplicatesOnly,
  ].filter(Boolean).length;

  const clearAdvancedFilters = () => {
    setStateFilterAdv("all");
    setDoctorFilter("all");
    setSelectedProviderFilter("all");
    setPaymentFilter("all");
    setReferredByFilter("all");
    setDateFrom("");
    setDateTo("");
    setShowDuplicatesOnly(false);
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

  // ── Duplicate email + phone detection ────────────────────────────────────
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

  // ── Reference labels map ──────────────────────────────────────────────────────

  const REF_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    facebook:     { label: "Facebook",     icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50" },
    google_ads:   { label: "Google Ads",   icon: "ri-google-line",          color: "text-orange-600 bg-orange-50" },
    social_media: { label: "Social Media", icon: "ri-share-circle-line",    color: "text-pink-600 bg-pink-50" },
    seo:          { label: "SEO",          icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50" },
  };

  // ─── Main Page ────────────────────────────────────────────────────────────────

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
          .select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, role")
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

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Incoming Call Banner — always rendered, listens for real-time inbound calls */}
      <IncomingCallBanner
        orders={orders}
        onViewOrder={(order) => {
          openOrderDetail(order);
          setActiveTab("orders");
        }}
      />

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="cursor-pointer">
          <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant" className="h-10 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/admin-guide" className="whitespace-nowrap hidden md:flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#1a5c4f] transition-colors cursor-pointer">
            <i className="ri-book-2-line"></i> Runbook
          </Link>
          <Link to="/admin-doctors" className="whitespace-nowrap hidden md:flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#1a5c4f] transition-colors cursor-pointer">
            <i className="ri-stethoscope-line"></i> Providers
          </Link>

          {/* ── Live sync indicator ── */}
          {/* syncTick is read here to trigger re-render every 30s */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f0faf7] border border-[#b8ddd5] rounded-lg" title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString()}` : "Connecting…"}>
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1a5c4f] opacity-50"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1a5c4f]"></span>
            </span>
            <span className="text-xs font-semibold text-[#1a5c4f] whitespace-nowrap">
              {syncTick >= 0 && lastSyncedAt ? `Synced ${fmtSyncAge(lastSyncedAt)}` : "Live"}
            </span>
          </div>

          {adminProfile && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">{adminProfile.full_name}</span>
              {roleBadge(adminProfile.role ?? null)}
            </div>
          )}
          <button type="button" onClick={() => setShowBroadcast(true)} title="Broadcast Message"
            className="whitespace-nowrap flex items-center gap-1.5 text-sm text-white bg-[#1a5c4f] hover:bg-[#17504a] transition-colors cursor-pointer px-3 py-1.5 rounded-lg">
            <i className="ri-broadcast-line text-sm"></i>
            <span className="hidden md:inline text-xs font-bold">Broadcast</span>
          </button>
          <button type="button" onClick={() => setShowChangePassword(true)} title="Change Password"
            className="whitespace-nowrap flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1a5c4f] transition-colors cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-50">
            <i className="ri-lock-password-line"></i>
            <span className="hidden md:inline text-xs font-semibold">Password</span>
          </button>
          <button type="button" onClick={async () => { await supabase.auth.signOut(); navigate("/admin-login"); }}
            className="whitespace-nowrap flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition-colors cursor-pointer">
            <i className="ri-logout-box-line"></i><span className="hidden sm:inline"> Sign Out</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Sync with Stripe + refresh all orders"
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:text-[#1a5c4f] hover:border-[#1a5c4f] transition-colors cursor-pointer disabled:opacity-50"
          >
            <i className={`ri-refresh-line ${refreshing ? "animate-spin" : ""}`}></i>
            <span className="hidden sm:inline">{refreshing ? "Syncing..." : "Refresh"}</span>
          </button>
          {refreshSyncMsg && (
            <span className="hidden sm:flex text-xs font-semibold text-emerald-600 items-center gap-1">
              <i className="ri-checkbox-circle-fill"></i>{refreshSyncMsg}
            </span>
          )}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-1">Admin Portal</p>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <h1 className="text-2xl font-extrabold text-gray-900">
              {activeTab === "dashboard" ? "Dashboard" : "Dashboard"}
            </h1>
            <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 overflow-x-auto flex-nowrap max-w-full">
              {([
                { key: "dashboard" as TabKey, label: "Dashboard",      icon: "ri-dashboard-3-line",          badge: null },
                { key: "orders" as TabKey,    label: "Orders",         icon: "ri-file-list-3-line",          badge: totalUnassigned > 0 ? totalUnassigned : null },
                { key: "comms" as TabKey,     label: "Communications", icon: "ri-message-3-line",            badge: unreadCommsCount > 0 ? unreadCommsCount : null },
                { key: "customers" as TabKey, label: "Customers",      icon: "ri-group-line",                badge: null },
                { key: "doctors" as TabKey,   label: "Providers",      icon: "ri-stethoscope-line",          badge: null },
                { key: "earnings" as TabKey,  label: "Earnings",       icon: "ri-money-dollar-circle-line",  badge: null },
                { key: "payments" as TabKey,  label: "Payments",       icon: "ri-bank-card-line",            badge: null },
                { key: "team" as TabKey,      label: "Team",           icon: "ri-shield-keyhole-line",       badge: null },
                { key: "audit" as TabKey,     label: "Audit",          icon: "ri-list-check-2",              badge: null },
                { key: "settings" as TabKey,  label: "Settings",       icon: "ri-settings-3-line",           badge: null },
                { key: "health" as TabKey,    label: "Health",         icon: "ri-pulse-line",                badge: null },
              ].filter((tab) => getVisibleTabs(adminProfile?.role ?? null).includes(tab.key))).map((tab) => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeTab === tab.key ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:text-[#1a5c4f]"}`}>
                  <i className={tab.icon}></i>{tab.label}
                  {tab.badge !== null && (
                    <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === tab.key ? "bg-white/20 text-white" : "bg-amber-200 text-amber-800"}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Toasts */}
        {createSuccessMsg && (
          <div className="mb-4 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-3">
            <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base mt-0.5 flex-shrink-0"></i>
            <p className="text-sm text-[#1a5c4f] font-semibold">{createSuccessMsg}</p>
          </div>
        )}
        {bulkMsg && (
          <div className={`mb-4 rounded-xl px-4 py-3 flex items-start gap-3 border ${bulkMsg.includes("failed") ? "bg-amber-50 border-amber-200" : "bg-[#f0faf7] border-[#b8ddd5]"}`}>
            <i className={`text-base mt-0.5 flex-shrink-0 ${bulkMsg.includes("failed") ? "ri-error-warning-line text-amber-600" : "ri-checkbox-circle-fill text-[#1a5c4f]"}`}></i>
            <p className={`text-sm font-semibold ${bulkMsg.includes("failed") ? "text-amber-800" : "text-[#1a5c4f]"}`}>{bulkMsg}</p>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <AdminDashboard
            orders={orders}
            doctorContacts={doctorContacts}
            loading={loading}
            onTabChange={(tab) => setActiveTab(tab as TabKey)}
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
        {activeTab === "orders" && (
          <>
            {!loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
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
                    label: "Order (Under Review)",
                    value: orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded" && !o.refunded_at && !!o.payment_intent_id && o.status !== "lead" && (o.doctor_email || o.doctor_user_id) && o.doctor_status !== "patient_notified").length,
                    icon: "ri-time-line",
                    color: "text-violet-600",
                    filter: "under_review",
                  },
                  {
                    label: "Order (Completed)",
                    value: orders.filter((o) => o.doctor_status === "patient_notified").length,
                    icon: "ri-checkbox-circle-line",
                    color: "text-emerald-600",
                    filter: "completed",
                  },
                ].map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setStatusFilter(s.filter)}
                    className={`bg-white rounded-xl border p-4 text-left cursor-pointer transition-colors ${statusFilter === s.filter ? "border-[#1a5c4f] bg-[#f0faf7]" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] rounded-full flex-shrink-0">
                        <i className={`${s.icon} ${s.color} text-base`}></i>
                      </div>
                      <span className="text-xs text-gray-500 font-medium leading-tight">{s.label}</span>
                    </div>
                    <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  </button>
                ))}
              </div>
            )}

            {!loading && totalUnassigned > 0 && (
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
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-2 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { value: "all", label: "All" },
                  { value: "lead_unpaid", label: "Lead (Unpaid)" },
                  { value: "paid_unassigned", label: "Paid (Unassigned)" },
                  { value: "under_review", label: "Under Review" },
                  { value: "completed", label: "Order Completed" },
                  { value: "refunded", label: "Refunded" },
                  { value: "disputed", label: "Disputed" },
                  { value: "cancelled", label: "Cancelled" },
                ].map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
                    className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${statusFilter === opt.value ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:text-[#1a5c4f]"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:ml-3">
                {selectedOrders.size > 0 && (
                  <button type="button" onClick={() => setSelectedOrders(new Set())}
                    className="whitespace-nowrap flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer">
                    <i className="ri-close-line"></i>Clear ({selectedOrders.size})
                  </button>
                )}
                <div className="relative w-full sm:min-w-[200px] sm:w-auto">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, email, phone, ID..."
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]" />
                </div>
                <button type="button" onClick={() => setSortOrder((v) => v === "desc" ? "asc" : "desc")}
                  title={sortOrder === "desc" ? "Showing newest first — click for oldest first" : "Showing oldest first — click for newest first"}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                  <i className={sortOrder === "desc" ? "ri-sort-desc" : "ri-sort-asc"}></i>
                  {sortOrder === "desc" ? "Newest" : "Oldest"}
                </button>
                <button type="button" onClick={() => setShowAdvancedFilters((v) => !v)}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border cursor-pointer transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? "bg-[#1a5c4f] text-white border-[#1a5c4f]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  <i className="ri-filter-3-line"></i>
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDuplicatesOnly((v) => !v)}
                  title={`${duplicateCount} orders share an email or phone with another order`}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border cursor-pointer transition-colors ${showDuplicatesOnly ? "bg-amber-500 text-white border-amber-500" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
                >
                  <i className="ri-error-warning-line"></i>
                  Duplicates{duplicateCount > 0 ? ` (${duplicateCount})` : ""}
                </button>
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
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${hideRecentFollowup ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:text-[#1a5c4f]"}`}
                >
                  <i className={hideRecentFollowup ? "ri-eye-off-line" : "ri-filter-line"}></i>
                  {hideRecentFollowup ? "Hiding sent within 7d" : "Hide sent within 7 days"}
                </button>
                <span className="text-xs text-gray-400">
                  {orders.filter((o) => (!o.payment_intent_id || o.status === "lead") && o.sent_followup_at && Date.now() - new Date(o.sent_followup_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length} leads received follow-up in last 7d
                </span>
              </div>
            )}

            {/* ── Advanced filters ── */}
            {showAdvancedFilters && (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                  {/* State */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">State</label>
                    <div className="relative">
                      <select value={stateFilterAdv} onChange={(e) => setStateFilterAdv(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
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
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
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
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
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
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
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
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
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
                  {/* Date From */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">From Date</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer" />
                  </div>
                  {/* Date To */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">To Date</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer" />
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
                  <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f] block mb-3"></i>
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
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Table header */}
                <div className="hidden lg:grid grid-cols-[40px_1fr_1fr_80px_175px_160px_120px_90px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center justify-center">
                    <button type="button" onClick={toggleSelectAll}
                      className="whitespace-nowrap w-5 h-5 flex items-center justify-center rounded border-2 transition-colors cursor-pointer flex-shrink-0"
                      style={{ borderColor: allFilteredSelected ? "#1a5c4f" : "#d1d5db", backgroundColor: allFilteredSelected ? "#1a5c4f" : "white" }}>
                      {allFilteredSelected && <i className="ri-check-line text-white" style={{ fontSize: "10px" }}></i>}
                    </button>
                  </div>
                  <span>Patient</span>
                  <span>Order ID / Date</span>
                  <span>State</span>
                  <span>Status</span>
                  <span>Assign Provider</span>
                  <span>Docs / GHL</span>
                  <span>Actions</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {filtered.map((order) => {
                    const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
                    const isAssigned = !!(order.doctor_email || order.doctor_user_id);
                    const doctorStatus = isAssigned ? (order.doctor_status || "pending_review") : "unassigned";
                    const isAssigningThis = assigning === order.confirmation_id;
                    const msg = assignMsg[order.confirmation_id];
                    const isSelected = selectedOrders.has(order.confirmation_id);
                    const notesOpen = expandedNotes === order.confirmation_id;
                    const noteCount = orderNoteCounts[order.id] ?? 0;

                    return (
                      <div key={order.id} className={`transition-colors ${isSelected ? "bg-[#f0faf7]/60" : isPSDOrder(order) ? "hover:bg-amber-50/40 bg-amber-50/20" : "hover:bg-gray-50/50"} ${order.doctor_status === "thirty_day_reissue" ? "border-l-4 border-orange-500" : isPSDOrder(order) ? "border-l-4 border-amber-400" : ""}`}>
                        <div className="grid grid-cols-1 lg:grid-cols-[40px_1fr_1fr_80px_175px_160px_120px_90px] gap-3 px-5 py-4 items-start lg:items-center">
                          {/* Checkbox */}
                          <div className="hidden lg:flex items-center justify-center">
                            <button type="button" onClick={() => toggleSelectOrder(order.confirmation_id)}
                              className="whitespace-nowrap w-5 h-5 flex items-center justify-center rounded border-2 transition-colors cursor-pointer flex-shrink-0"
                              style={{ borderColor: isSelected ? "#1a5c4f" : "#d1d5db", backgroundColor: isSelected ? "#1a5c4f" : "white" }}>
                              {isSelected && <i className="ri-check-line text-white" style={{ fontSize: "10px" }}></i>}
                            </button>
                          </div>

                          {/* Patient — clickable to open detail */}
                          <button type="button" onClick={() => openOrderDetail(order)}
                            className="text-left group cursor-pointer">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-bold text-gray-900 truncate group-hover:text-[#1a5c4f] transition-colors">{fullName}</p>
                              {(unreadCommsMap[order.confirmation_id] ?? 0) > 0 && (
                                <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-orange-500 text-white text-[9px] font-extrabold rounded-full leading-none">
                                  {unreadCommsMap[order.confirmation_id]}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{order.email}</p>
                            {duplicateEmailSet.has(order.email.toLowerCase()) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-extrabold mt-0.5">
                                <i className="ri-error-warning-fill" style={{ fontSize: "9px" }}></i>DUPLICATE EMAIL
                              </span>
                            )}
                            {order.phone ? (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <i className="ri-phone-line text-gray-400"></i>{order.phone}
                              </p>
                            ) : (
                              <p className="text-xs text-orange-400 flex items-center gap-1 mt-0.5">
                                <i className="ri-phone-line"></i>No phone
                              </p>
                            )}
                            <span className="text-xs text-[#1a5c4f] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mt-0.5">
                              <i className="ri-external-link-line" style={{ fontSize: "10px" }}></i>View detail
                            </span>
                            {isContacted(order) && (() => {
                              const t = lastTouchTime(order);
                              const lc = t ? fmtLastContacted(new Date(t).toISOString()) : null;
                              return lc ? (<span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${lc.color}`}><i className="ri-phone-line" style={{ fontSize: "9px" }}></i>{lc.label}</span>) : null;
                            })()}
                            {order.sent_followup_at && (() => {
                              const diffMs = Date.now() - new Date(order.sent_followup_at).getTime();
                              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                              const label = diffDays === 0 ? "Follow-up: today" : diffDays === 1 ? "Follow-up: 1d ago" : `Follow-up: ${diffDays}d ago`;
                              const color = diffMs <= 7 * 24 * 60 * 60 * 1000 ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500";
                              return (<span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${color}`}><i className="ri-mail-check-line" style={{ fontSize: "9px" }}></i>{label}</span>);
                            })()}
                          </button>

                          {/* Order ID */}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-mono font-bold text-gray-700">{order.confirmation_id}</p>
                              {isPSDOrder(order) ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded text-[10px] font-extrabold">
                                  <i className="ri-service-line" style={{ fontSize: "9px" }}></i>PSD
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] border border-[#b8ddd5] rounded text-[10px] font-extrabold">
                                  <i className="ri-heart-line" style={{ fontSize: "9px" }}></i>ESA
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            {order.delivery_speed && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-400 border border-gray-200 rounded text-[10px] font-semibold mt-1">
                                <i className="ri-speed-line" style={{ fontSize: "9px" }}></i>{order.delivery_speed}
                              </span>
                            )}
                            {order.ghl_synced_at ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-semibold mt-1 ml-1" title={`Synced: ${new Date(order.ghl_synced_at).toLocaleString()}`}>
                                <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i> {fmtGhlSync(order.ghl_synced_at)}
                              </span>
                            ) : order.ghl_sync_error ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[10px] font-bold mt-1 ml-1" title={order.ghl_sync_error}>
                                <i className="ri-error-warning-line" style={{ fontSize: "9px" }}></i> GHL fail
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-400 border border-gray-200 rounded text-[10px] font-semibold mt-1 ml-1">
                                <i className="ri-time-line" style={{ fontSize: "9px" }}></i> GHL pending
                              </span>
                            )}
                          </div>

                          {/* State */}
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-gray-700">{US_STATES.find(s => s.abbr === order.state)?.name ?? order.state ?? "—"}</span>
                            {order.state && !coveredStates.has(order.state) && order.status !== "lead" && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[10px] font-bold whitespace-nowrap"
                                title={`No active provider licensed in ${US_STATES.find(s => s.abbr === order.state)?.name ?? order.state}`}
                              >
                                <i className="ri-error-warning-fill" style={{ fontSize: "9px" }}></i>
                                No Coverage
                              </span>
                            )}
                          </div>

                          {/* Status */}
                          <div className="flex flex-col gap-1.5">
                            {(() => {
                              const s = getOrderDisplayStatus(order);
                              return (
                                <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full w-fit ${s.color}`}>
                                  {s.label}
                                </span>
                              );
                            })()}
                            {/* Priority badge — only visible in admin portal, not providers */}
                            {isPriorityOrder(order) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-[#1a5c4f] text-white w-fit">
                                <i className="ri-vip-crown-2-line" style={{ fontSize: "9px" }}></i>(P) Priority
                              </span>
                            )}
                            {/* VIP badge — orders with add-on services */}
                            {Array.isArray(order.addon_services) && order.addon_services.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-amber-400 to-orange-400 text-white w-fit">
                                <i className="ri-vip-crown-fill" style={{ fontSize: "9px" }}></i>VIP
                                <span className="font-normal opacity-90">{order.addon_services.length} add-on{order.addon_services.length !== 1 ? "s" : ""}</span>
                              </span>
                            )}
                            {/* Fraud warning badge */}
                            {order.fraud_warning && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-red-700 text-white w-fit">
                                <i className="ri-spy-fill" style={{ fontSize: "9px" }}></i>FRAUD
                              </span>
                            )}
                            {/* Secondary doctor status detail — shown only when assigned */}
                            {isAssigned && order.doctor_status && order.doctor_status !== "patient_notified" && (
                              order.doctor_status === "thirty_day_reissue" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-extrabold bg-orange-500 text-white w-fit" style={{ animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }}>
                                  <i className="ri-time-fill" style={{ fontSize: "10px" }}></i>
                                  30-Day Reissue
                                </span>
                              ) : (
                                <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full w-fit ${DOCTOR_STATUS_COLOR[order.doctor_status] ?? "bg-gray-100 text-gray-500"}`}>
                                  {doctorStatusLabel(order.doctor_status, isAssigned)}
                                </span>
                              )
                            )}
                          </div>

                          {/* Assign Provider */}
                          <div className="space-y-1">
                            {(!order.payment_intent_id || order.status === "lead") ? (
                              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                  <i className="ri-lock-2-line text-gray-300 text-sm"></i>
                                </div>
                                <span className="text-xs text-gray-400 italic">Assigned after payment</span>
                              </div>
                            ) : (order.status === "refunded" || order.refunded_at) ? (
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                  <i className="ri-refund-line text-red-500 text-sm"></i>
                                </div>
                                <span className="text-xs text-red-600 font-semibold italic">Refunded — assignment disabled</span>
                              </div>
                            ) : order.doctor_status === "patient_notified" ? (
                              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                  <i className="ri-checkbox-circle-fill text-emerald-500 text-sm"></i>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-emerald-700 truncate">
                                    {order.doctor_name ?? "Provider"}
                                  </p>
                                  <p className="text-[10px] text-emerald-500">Completed — locked</p>
                                </div>
                              </div>
                            ) : (
                              <>
                                {order.doctor_name && !(pendingAssign?.confirmationId === order.confirmation_id) && (
                                  <p className="text-xs font-semibold text-[#1a5c4f] flex items-center gap-1 mb-1">
                                    <i className="ri-user-heart-line"></i>{order.doctor_name}
                                  </p>
                                )}
                                <div className="relative">
                                  <select
                                    value={
                                      pendingAssign?.confirmationId === order.confirmation_id
                                        ? pendingAssign.doctorEmail
                                        : (order.doctor_email ?? "")
                                    }
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        const doc = assignableProviders.find((d) => d.email === e.target.value);
                                        setPendingAssign({
                                          confirmationId: order.confirmation_id,
                                          doctorEmail: e.target.value,
                                          doctorName: doc?.full_name ?? e.target.value,
                                        });
                                      }
                                    }}
                                    disabled={isAssigningThis}
                                    className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer disabled:opacity-60"
                                  >
                                    <option value="" className="text-gray-800">— {order.doctor_name ? "Reassign" : "Assign"} Provider —</option>
                                    {assignableProviders
                                      .filter((d) => {
                                        if (d.is_active === false) return false;
                                        const stateName = US_STATES.find((s) => s.abbr === order.state)?.name ?? "";
                                        if (!stateName) return true;
                                        const states = d.licensed_states ?? [];
                                        return states.includes(stateName) || states.includes(order.state ?? "");
                                      })
                                      .map((doc) => (
                                        <option key={doc.id} value={doc.email} className="text-gray-800">{doc.full_name}</option>
                                      ))}
                                  </select>
                                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                                    {isAssigningThis
                                      ? <i className="ri-loader-4-line animate-spin"></i>
                                      : <i className="ri-arrow-down-s-line text-gray-400"></i>
                                    }
                                  </div>
                                </div>

                                {/* ── Inline confirm ── */}
                                {pendingAssign?.confirmationId === order.confirmation_id && (
                                  <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
                                    <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                      <i className="ri-error-warning-line text-amber-500"></i>
                                      Assign <span className="text-[#1a5c4f]">{pendingAssign.doctorName}</span>?
                                    </p>
                                    <p className="text-[11px] text-amber-700">
                                      The provider will be notified via email once confirmed.
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleAssign(pendingAssign.confirmationId, pendingAssign.doctorEmail);
                                          setPendingAssign(null);
                                        }}
                                        disabled={isAssigningThis}
                                        className="whitespace-nowrap flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-md hover:bg-[#17504a] cursor-pointer disabled:opacity-60 transition-colors"
                                      >
                                        {isAssigningThis
                                          ? <><i className="ri-loader-4-line animate-spin"></i>Assigning&hellip;</>
                                          : <><i className="ri-check-line"></i>Confirm &amp; Notify</>
                                        }
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPendingAssign(null)}
                                        className="whitespace-nowrap py-1.5 px-3 border border-gray-200 text-gray-500 text-xs font-semibold rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {msg && !(pendingAssign?.confirmationId === order.confirmation_id) && (
                                  <p className={`text-xs flex items-center gap-1 ${msg === "Assigned & notified" ? "text-[#1a5c4f]" : "text-red-500"}`}>
                                    <i className={msg === "Assigned & notified" ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{msg}
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {/* Docs / GHL */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {order.signed_letter_url && (
                                <a href={order.signed_letter_url} target="_blank" rel="noopener noreferrer"
                                  className="whitespace-nowrap inline-flex items-center gap-1 px-2 py-1.5 border border-[#1a5c4f]/30 rounded-lg text-xs text-[#1a5c4f] hover:bg-[#f0faf7] cursor-pointer">
                                  <i className="ri-shield-check-line"></i><span className="hidden lg:inline">Signed</span>
                                </a>
                              )}
                              {order.assessment_answers && (
                                <button
                                  type="button"
                                  onClick={() => setAssessmentIntakeOrder(order)}
                                  className="whitespace-nowrap inline-flex items-center gap-1 px-2 py-1.5 border border-orange-200 rounded-lg text-xs text-orange-600 hover:bg-orange-50 cursor-pointer transition-colors"
                                >
                                  <i className="ri-file-list-3-line"></i>
                                  <span className="hidden lg:inline">Intake</span>
                                </button>
                              )}
                              {!order.signed_letter_url && <span className="text-xs text-gray-300">—</span>}
                            </div>

                            {/* Email indicators */}
                            {order.email_log && order.email_log.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {order.email_log.map((entry, idx) => {
                                  const cfg = EMAIL_BADGE_CONFIG[entry.type];
                                  if (!cfg) return null;
                                  return (
                                    <span
                                      key={idx}
                                      title={`${cfg.short} email — ${entry.success ? "sent" : "failed"} at ${new Date(entry.sentAt).toLocaleString()}`}
                                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold ${entry.success ? cfg.color : "bg-red-50 text-red-500"}`}
                                    >
                                      <i className={entry.success ? cfg.icon : "ri-close-circle-line"} style={{ fontSize: "9px" }}></i>
                                      {cfg.short}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {!order.ghl_synced_at && (
                              <button type="button" onClick={() => handleGhlRefire(order.confirmation_id)} disabled={ghlRefiring === order.confirmation_id}
                                className="whitespace-nowrap inline-flex items-center gap-1 px-2 py-1.5 border border-amber-200 bg-amber-50 rounded-lg text-xs text-amber-700 border-amber-200 hover:bg-amber-100 cursor-pointer disabled:opacity-50 transition-colors">
                                {ghlRefiring === order.confirmation_id
                                  ? <><i className="ri-loader-4-line animate-spin"></i>Syncing...</>
                                  : <><i className="ri-refresh-line"></i>Re-fire GHL</>}
                              </button>
                            )}
                            {ghlReFireResult[order.confirmation_id] && (
                              <p className={`text-xs flex items-center gap-1 leading-tight ${ghlReFireResult[order.confirmation_id].ok ? "text-emerald-600" : "text-red-500"}`}>
                                <i className={ghlReFireResult[order.confirmation_id].ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                                <span className="break-all">{ghlReFireResult[order.confirmation_id].msg.slice(0, 80)}</span>
                              </p>
                            )}
                          </div>

                          {/* Actions column */}
                          <div className="hidden lg:flex flex-col gap-1.5">
                            <button type="button" onClick={() => openOrderDetail(order)}
                              className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f0faf7] text-[#1a5c4f] border border-[#b8ddd5] hover:bg-[#e0f2ec] transition-colors cursor-pointer">
                              <i className="ri-eye-line"></i>Detail
                              {(unreadCommsMap[order.confirmation_id] ?? 0) > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[9px] font-extrabold rounded-full leading-none">
                                  {unreadCommsMap[order.confirmation_id]}
                                </span>
                              )}
                            </button>
                            <button type="button" onClick={() => setExpandedNotes(notesOpen ? null : order.confirmation_id)}
                              className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${notesOpen ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}>
                              <i className="ri-sticky-note-line"></i>
                              Notes{noteCount > 0 && <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-extrabold ${notesOpen ? "bg-white/20 text-white" : "bg-amber-200 text-amber-800"}`}>{noteCount}</span>}
                            </button>
                            <button type="button" onClick={() => setShowStatusLog(order)}
                              className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                              <i className="ri-history-line"></i>History
                            </button>
                            {/* Send Discount Email button — Lead (Unpaid) orders only */}
                            {(!order.payment_intent_id || order.status === "lead") && (
                              <button
                                type="button"
                                onClick={() => openRecoveryModal(order)}
                                className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${recoveryMsg[order.confirmation_id]?.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-orange-500 text-white border-orange-500 hover:bg-orange-600"}`}
                              >
                                {recoveryMsg[order.confirmation_id]?.ok
                                  ? <><i className="ri-mail-check-line"></i>Sent!</>
                                  : <><i className="ri-coupon-3-line"></i>Send Discount</>
                                }
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline Notes Panel */}
                        {notesOpen && adminProfile && (
                          <OrderNotesPanel orderId={order.id} confirmationId={order.confirmation_id}
                            adminUserId={adminProfile.user_id} adminName={adminProfile.full_name}
                            onClose={() => setExpandedNotes(null)} />
                        )}

                        {/* Referred By badge — shown in order row */}
                        {order.referred_by && REF_LABELS[order.referred_by] && (
                          <div className="flex flex-col gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${REF_LABELS[order.referred_by].color}`}>
                              <i className={REF_LABELS[order.referred_by].icon} style={{ fontSize: "10px" }}></i>
                              {REF_LABELS[order.referred_by].label}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
        {activeTab === "settings" && <SettingsTab />}

        {/* ── SYSTEM HEALTH TAB ── */}
        {activeTab === "health" && <SystemHealthTab />}
      </div>

      {/* ── BULK ASSIGN BAR ── */}
      {selectedOrders.size > 0 && activeTab === "orders" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#1a5c4f] border-t border-[#17504a] px-6 py-4">
          <div className="max-w-7xl mx-auto space-y-2">
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
                    {/* Only show assign dropdown when there are assignable orders selected */}
                    {(() => {
                      const assignableCount = orders.filter((o) =>
                        selectedOrders.has(o.confirmation_id) &&
                        !!o.payment_intent_id &&
                        o.status !== "lead" &&
                        o.status !== "refunded" &&
                        !o.refunded_at &&
                        o.doctor_status !== "patient_notified"
                      ).length;
                      return assignableCount > 0 ? (
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
                            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-white text-[#1a5c4f] text-sm font-extrabold rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer transition-colors"
                          >
                            <i className="ri-user-received-line"></i>Assign {assignableCount} Order{assignableCount !== 1 ? "s" : ""}
                          </button>
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
                          className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#f0faf7] text-[#1a5c4f] text-sm font-extrabold rounded-lg hover:bg-white cursor-pointer transition-colors"
                        >
                          <i className="ri-message-3-line"></i>
                          Bulk SMS
                          <span className="bg-[#1a5c4f] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
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
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-white text-[#1a5c4f] text-sm font-extrabold rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer transition-colors"
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
                {(() => {
                  const leadOrders = orders.filter((o) => selectedOrders.has(o.confirmation_id) && (!o.payment_intent_id || o.status === "lead"));
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
              </div>

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
      {showBulkSMS && adminProfile && (        <BulkSMSModal
          orders={orders.filter((o) =>
            selectedOrders.has(o.confirmation_id) &&
            !!o.payment_intent_id &&
            !o.doctor_email &&
            !o.doctor_user_id &&
            o.doctor_status !== "patient_notified",
          )}
          adminName={adminProfile.full_name}
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
          onClose={() => setOrderDetail(null)} onOrderUpdated={handleOrderUpdated} onOrderDeleted={handleOrderDeleted} />
      )}
      {assessmentIntakeOrder && (
        <AssessmentIntakeModal
          order={assessmentIntakeOrder}
          onClose={() => setAssessmentIntakeOrder(null)}
        />
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
                  <div className="w-6 h-6 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                    <i className="ri-coupon-3-line text-[#1a5c4f] text-xs"></i>
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a5c4f] bg-white"
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
                            className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer"
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
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white"
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] resize-none bg-gray-50"
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
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${recoveryResult.ok ? "bg-[#f0faf7] border-[#b8ddd5] text-[#1a5c4f]" : "bg-red-50 border-red-200 text-red-700"}`}>
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
    </div>
  );
}
