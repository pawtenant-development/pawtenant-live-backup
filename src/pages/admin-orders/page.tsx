// Admin Orders + Doctor Management — PawTenant
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
// ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 — only the newest
// aggregate request may publish. Extracted so the out-of-order case is
// unit-testable (an inline ref inside a 200KB component cannot be exercised).
// ADMIN-ORDERS-KPI-CARD-LIST-PARITY-AND-MONTH-SEMANTICS-001: the canonical
// America/New_York month boundary — never the operator's browser timezone.
// ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §7/§8 — the visible business clock and the
// America/New_York day grouping share this one module. There is no second
// timezone implementation on this page.
import {
  currentBusinessMonth,
  businessIsoDate,
  businessDayGroupLabel,
} from "../../lib/businessTime";
import { useBusinessDayKey } from "../../hooks/useBusinessClock";
import BusinessClock from "../../components/admin/BusinessClock";
import { createRequestGuard, runLatest } from "../../lib/latestRequestGuard";
import { supabase, getAdminToken } from "../../lib/supabaseClient";
import { resolveStaffRole } from "../../lib/staffAuth";
import { canAccessApprovals } from "../../lib/adminPermissions";
// Phase K3 — shared normalized classifier so the Orders filter, the
// AdminDashboard aggregation, and the OrderCard pill all use the same
// label taxonomy.
import { classifyOrder, ACQUISITION_LABELS } from "../../lib/acquisitionClassifier";
import CreateDoctorModal from "./components/CreateDoctorModal";
import EarningsPanel from "./components/EarningsPanel";
import CustomersTab from "./components/CustomersTab";
import ChatsTab from "./components/ChatsTab";
import ContactRequestsTab from "./components/ContactRequestsTab";
import TeamTab from "./components/TeamTab";
import AttendanceTab from "./components/AttendanceTab";
import ShiftsTab from "./components/ShiftsTab";
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
// ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — canonical lifecycle date model.
import {
  orderComparator,
  orderGroupingIso,
  matchesBasisDateRange,
  isOrderDateBasis,
  ORDER_DATE_BASES,
  ORDER_DATE_BASIS_LABEL,
  ORDER_DATE_BASIS_HINT,
  ORDER_DATE_BASIS_COLUMN,
  type OrderDateBasis,
} from "../../lib/orderLifecycle";
import { exportOrdersToCSV, type ExportableOrder } from "../../lib/exportOrders";
import { fetchProviderPaymentsForExport } from "../../lib/providerPaymentExport";
// ADMIN-ORDERS-EXPORT-PACKAGE-ADDONS-001 — currently-valid child-row add-on
// entitlements (paid RA add-on, paid/included Additional Pet) for the CSV's
// "Package / Add-ons" column. Batched, never per-row.
import { fetchAddonEntitlementsForExport } from "../../lib/orderAddonEntitlements";
import {
  fetchOrderFacetCounts,
  filteredTotalFor,
  type FacetCounts,
  // ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001 — the five
  // operational cards and their per-card stage-entry basis. The counts come from
  // the SAME predicate builder as the list total, which is what makes
  // count-to-list parity structural rather than asserted.
  fetchKpiCardCounts,
  KPI_CARD_KEYS,
  KPI_CARD_LABEL,
  // ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001 — one window builder shared by the
  // card count and the list the card opens.
  KPI_CARD_KIND,
  kpiCardWindow,
  type KpiCardKey,
  type KpiCardCounts,
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001 — the row read borrows the SAME
  // predicate builder the counts use. There is no second definition of what a
  // bucket, a filter or a date basis means anywhere in this feature.
  applyListPredicates,
  isDefaultScopeEligible,
  defaultScopeCutoffIso,
  fetchListScopeTotal,
  DEFAULT_SCOPE_DAYS,
  type FacetFilters,
  // ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001 — the six Sequence
  // Status chips inside Filters. Their counts are narrow server COUNT(head)
  // queries built from the SAME predicate the list rows are selected with; the
  // loaded-row `orders.filter(...)` counts the external strip used are gone.
  fetchSequenceFacetCounts,
  emptySequenceFacetCounts,
  SEQUENCE_FACET_KEYS,
  SEQUENCE_FACET_LABEL,
  type SequenceFacetCounts,
} from "./orderFacetCounts";
// ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9 — the banner's SOLE data source is the
// period-event RPC imported below.
//
// lib/adminOrdersMonthlyKpis.ts (get_admin_orders_monthly_kpis) is deliberately
// no longer imported here: it served the queue-DEPTH half of the old dual-mode
// banner, and mixing depth with period events in one row of cards is precisely
// what this task removed. The RPC and its module are left in place for any other
// consumer; the Orders banner must keep exactly ONE KPI source.
//
// The banner remains a DIFFERENT universe from the filter-aware list counts
// (orderFacetCounts) — never merge the two.
// MONTH-END-...-LIVE-ROLLOUT-001 §C — event-based KPI counts while a custom
// range is active.
import {
  fetchAdminOrdersRangeEventKpis,
  type AdminOrdersRangeEventKpis,
} from "../../lib/adminOrdersRangeKpis";
import { exportMetaAudienceToCSV, type MetaAudienceOrder, type MetaAudienceMode } from "../../lib/exportMetaAudience";
import BulkSMSModal from "./components/BulkSMSModal";
import BroadcastModal from "./components/BroadcastModal";
import CommunicationsPanel from "./components/CommunicationsPanel";
import SystemHealthTab from "./components/SystemHealthTab";
import OrderCard from "./components/OrderCard";
import {
  isRefundedBucket,
  isCancelled,
  isPaidUnassigned,
  isUnderReview,
  isPendingDelivery,
  isAssignable,
  EXCLUDE_FULL_REFUND_OR,
  EXCLUDE_REFUNDED_AT_OR,
} from "@/lib/orderClassification";
import AdminSidebar from "./components/AdminSidebar";
import CompanyNotificationsBell from "./components/CompanyNotificationsBell";
import ApprovalRequestModal from "./components/ApprovalRequestModal";
import ApprovalsInbox from "./components/ApprovalsInbox";
import ApprovalNotificationBell from "./components/ApprovalNotificationBell";
import AdminProfileMenu from "./components/AdminProfileMenu";
import EmployeePresenceBar from "./components/EmployeePresenceBar";
import FinanceOrdersGate from "./components/FinanceOrdersGate";
import CommunicationsHub from "./components/CommunicationsHub";
import type {
  Order,
  DoctorProfile,
  DoctorContact,
  AttributionSnapshot,
} from "./types";
// Package/RA classification for the Orders list chips + filters
// (ORDERS-RA-COMBO-CHIP-FILTER-001). Explicit-fields-only; never price.
import { classifyOrderPackage, matchesPackageFilter, type PackageFilterKey } from "./orderPackage";
import { notify as desktopNotify } from "../../lib/desktopNotify";
import { getSoundPrefs } from "../../lib/soundPrefs";

// ADMIN-ORDERS-SERVER-BACKED-LOADING-001 — the Orders LIST is server-paged.
//
// What this replaced: every load walked the ENTIRE orders table into the
// browser in 250-row pages, and a setInterval re-walked it every 30 seconds.
// That is the visible "2049 orders loading" cycle, and it grew with the table.
//
// The contract now:
//   • The list asks the server for ONE page at a time, with every filter, the
//     status tab and the search term applied SERVER-side, through the single
//     predicate builder in orderFacetCounts.ts (never a second copy).
//   • The default view is bounded to the DEFAULT SCOPE — the last 60 days plus
//     every still-actionable paid order regardless of age (§2, §17). Measured
//     on TEST: 120 rows instead of 609.
//   • Searching, choosing a tab, opening a filter or setting a date range drops
//     that window and queries the COMPLETE dataset (§3, §4).
//   • Nothing polls. Realtime pushes and explicit Refresh are the only
//     refreshers, so the loading state never restarts under the operator (§8, §9).
//
// ADMIN-ORDERS-DATASET-FLICKER-P0-001 is PRESERVED, not undone: page reads are
// still deterministic (basis DESC, created_at DESC, id DESC), still deduplicated
// by order id, and a newer request still invalidates an older one so a stale
// response can never overwrite newer rows or flicker the list back (§10, §13).
const ORDERS_PAGE_SIZE = 100;
// Runaway backstop for any multi-page sweep — far above any real page count.
const ORDERS_MAX_PAGES = 400;

// The whole-table snapshot (Dashboard / Analytics / Communications) is a
// DIFFERENT dataset from the Orders list and is read in bigger pages, because
// it is fetched once on demand rather than per interaction.
const SNAPSHOT_PAGE_SIZE = 250;

// Tabs whose surfaces genuinely aggregate the WHOLE orders table. The Orders
// tab is deliberately absent — that is the entire point of the change. Loading
// the snapshot is what the old architecture did unconditionally, on a timer.
const SNAPSHOT_TABS = new Set(["dashboard", "analytics", "communications", "comms"]);

// ── The whole-table FACTS projection ────────────────────────────────────────
//
// A handful of Orders-tab surfaces are genuinely whole-table questions and
// always were: how many duplicate contacts exist, how many orders never synced
// to GHL, which requested-provider values are selectable, which states have
// paid orders but no licensed provider.
//
// Server-paging the list would have quietly re-pointed all of them at the
// current 100-row page — they would not have errored, they would just have
// reported small confident wrong numbers. So instead of changing what they
// mean, this narrow projection preserves it: ~15 small columns instead of the
// ~90-column list projection, fetched ONCE per session instead of every 30
// seconds. Same answers, a fraction of the bytes, and nothing on a timer.
const ORDER_FACTS_COLUMNS =
  "id,confirmation_id,email,phone,state,status,doctor_status,doctor_email," +
  "doctor_user_id,payment_intent_id,selected_provider,ghl_synced_at," +
  "refund_status,refunded_at,sent_followup_at,source_system,historical_import";

// COS-042 Phase A — Shared column projection for the Orders list query and
// the direct-lookup query. Keeping these in sync guarantees that an order
// fetched via direct lookup can be opened in OrderDetailModal with the same
// fields as a row from the loaded list.
const ORDERS_LIST_COLUMNS =
  "id,confirmation_id,email,first_name,last_name,phone,state," +
  "selected_provider,plan_type,delivery_speed,status,doctor_status," +
  "doctor_email,doctor_name,doctor_user_id,payment_intent_id," +
  "checkout_session_id,payment_method,price,created_at,letter_url," +
  "signed_letter_url,patient_notification_sent_at,email_log,refunded_at," +
  "refund_amount,refund_status,letter_type,dispute_id,dispute_status,dispute_reason," +
  "dispute_created_at,fraud_warning,fraud_warning_at,subscription_status," +
  "coupon_code,coupon_discount,paid_at,payment_failure_reason," +
  "payment_failed_at,referred_by,addon_services,ghl_synced_at," +
  "ghl_sync_error,ghl_contact_id,last_contacted_at,assessment_answers,assessment_progress," +
  "sent_followup_at,seq_30min_sent_at,seq_24h_sent_at,seq_3day_sent_at," +
  "followup_opt_out,seq_opted_out_at,letter_id,broadcast_opt_out," +
  "last_broadcast_sent_at,source_system,historical_import," +
  "utm_source,utm_medium,utm_campaign,gclid,fbclid," +
  // Package / RA-bundle identity (ORDERS-RA-COMBO-CHIP-FILTER-001) — drives the
  // Orders list package chips + filters. Explicit saved identity only; never price.
  "package_key,package_display_name,includes_reasonable_accommodation_letter," +
  "additional_documentation_required,additional_documentation_status," +
  // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — canonical lifecycle dates.
  // last_meaningful_activity_at is the DEFAULT sort key; the rest drive the
  // payment-vs-workflow split and the immutable/latest date pairs. See
  // src/lib/orderLifecycle.ts.
  "last_meaningful_activity_at,last_meaningful_activity_type,last_payment_at," +
  "first_completed_at,last_completed_at,last_reopened_at," +
  // MONTH-END-...-001 §D/§E — lifecycle ENTRY timestamps (trigger-maintained),
  // required by the under_review_entered / pending_delivery_entered date bases.
  "last_under_review_entered_at,last_pending_delivery_entered_at,last_cancelled_at," +
  "official_letter_reopened_at,official_letter_final_completed_at," +
  // Phase K2 — first / last touch attribution snapshots (jsonb) from the
  // analytics_phase1 migration. These carry referrer, landing_url, channel,
  // and the full UTM / click-id set so the acquisition classifier can detect
  // AI referrals, dark social, and organic sources at the Order level.
  // Display-only — analytics math + attribution capture remain unchanged.
  "first_touch_json,last_touch_json";

// Anchored, so a string that merely CONTAINS a uuid is not treated as one.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Types ────────────────────────────────────────────────────────────────────
// Order / DoctorProfile / DoctorContact / AttributionSnapshot are now
// imported from ./types (canonical shapes). Local interfaces removed to
// stop the duplicate-Order vs Order TypeScript mismatches that fired
// every time page.tsx passed an order to a non-frozen child component.

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

// ─── Traffic source derivation — STRICT hierarchy, no twitter/x, no weak referrer parsing
function deriveTrafficSource(order: Pick<Order, "utm_source" | "utm_medium" | "gclid" | "fbclid" | "referred_by"> & { utm_source?: string | null; utm_medium?: string | null; gclid?: string | null; fbclid?: string | null }): string {
  const utmSrc = ((order as Order & { utm_source?: string | null }).utm_source ?? "").toLowerCase();
  const gclid = (order as Order & { gclid?: string | null }).gclid ?? "";
  const fbclid = (order as Order & { fbclid?: string | null }).fbclid ?? "";

  // 1. gclid → Google Ads
  if (gclid) return "Google Ads";
  // 2. fbclid → Facebook Ads
  if (fbclid) return "Facebook / Instagram";
  // 3. utm_source → use utm_source (lowercased, display-capped)
  if (utmSrc) {
    if (utmSrc === "facebook") return "Facebook";
    if (utmSrc === "instagram") return "Instagram";
    if (utmSrc === "google") return "Google Organic";
    if (utmSrc === "tiktok") return "TikTok";
    return utmSrc;
  }
  // 4. Referrer classification happens client-side and is stored in attribution_json.
  //    At the order level we do NOT guess from weak referred_by strings.
  // 5. Default
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

// Legacy / imported (WordPress) orders. Excluded from CURRENT operational counts
// (unpaid leads, sequence stages) so old imports don't inflate today's pipeline.
// They are never deleted and still appear in the list / dedicated legacy views.
function isLegacyOrder(order: Pick<Order, "source_system" | "historical_import">): boolean {
  return order.source_system === "wordpress_legacy" || order.historical_import === true;
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
  // REFUND-ONLY-OPERATIONAL: a fully refunded order (full Stripe refund),
  // Refund + Cancel ('cancelled') or a legacy 'refunded' status reads as
  // terminal here. An active *partial* Refund Only keeps its operational
  // status (handled by the stages below) and shows refund info separately.
  if (isRefundedBucket(order)) {
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

type TabKey = "dashboard" | "orders" | "analytics" | "communications" | "comms" | "chats" | "contacts" | "customers" | "doctors" | "earnings" | "payments" | "team" | "attendance" | "shifts" | "audit" | "settings" | "health";

// Phase A note: "communications" is the new umbrella hub. Old "comms" / "chats"
// / "contacts" stay intact so this rollout is purely additive. Hiding them
// happens in a later phase only after the hub has been validated.
const ALL_TABS: TabKey[] = ["dashboard", "orders", "analytics", "communications", "comms", "chats", "contacts", "customers", "doctors", "earnings", "payments", "team", "attendance", "shifts", "audit", "settings", "health"];

function getVisibleTabs(role: string | null, customTabAccess?: string[] | null): TabKey[] {
  // ── Canonical permission model ──────────────────────────────────────────
  //   effective_tabs = explicit user override (if any top-level keys are set)
  //                  : role default
  //
  // Two normalization rules keep older / partial data working:
  //
  //   1. Legacy umbrella keys — "comms" / "chats" / "contacts" no longer
  //      render in the sidebar (Phase I migrated them under one
  //      "communications" umbrella). When they appear inside a saved
  //      override they are treated as the umbrella so the user still sees
  //      the Communications Hub.
  //
  //   2. Sub-tab grants — entries with the "communications_" prefix (e.g.
  //      "communications_templates") only widen / restrict Communications
  //      Hub sub-tab access via CommunicationsHub.getVisibleSubKeys(). They
  //      do NOT flip the top-level override mode by themselves, but they
  //      DO imply the parent "communications" tab is visible so the user
  //      can reach the sub they were granted.

  // Owner is a full-access role: navigation is governed purely by role and
  // NEVER by custom_tab_access. This guarantees the owner always sees every
  // tab (including Dashboard) and can never be locked out by a stray override
  // saved on their account. (See ADMIN-NAV-OWNER-ACCESS-LIVE-HOTFIX-001.)
  if (role === "owner") {
    return ALL_TABS;
  }

  const raw = customTabAccess ?? [];

  // Strip sub-tab grants from the top-level comparison.
  const topLevelRaw = raw.filter((k) => !k.startsWith("communications_"));

  // Implicit Communications visibility — either via legacy keys or via
  // any communications_<sub> child grant.
  const hasLegacyComms = topLevelRaw.some(
    (k) => k === "comms" || k === "chats" || k === "contacts",
  );
  const hasCommsChild = raw.some((k) => k.startsWith("communications_"));

  // Build the effective top-level override list:
  //   - drop legacy keys that no longer render in the new sidebar
  //   - inject "communications" when implied by legacy / child grants
  const overrideSet = new Set<string>(
    topLevelRaw.filter(
      (k) => k !== "comms" && k !== "chats" && k !== "contacts",
    ),
  );
  if (hasLegacyComms || hasCommsChild) {
    overrideSet.add("communications");
  }
  const topLevelOverrides = Array.from(overrideSet);

  if (topLevelOverrides.length > 0) {
    // Dashboard is the landing view and is never a restrictable tab (it is
    // always available via isTabVisible). Keep it in the nav even when a
    // custom override list omits it, so no role/override can ever hide the
    // Dashboard link. (See ADMIN-NAV-OWNER-ACCESS-LIVE-HOTFIX-001.)
    return ALL_TABS.filter((t) => t === "dashboard" || topLevelOverrides.includes(t));
  }
  switch (role) {
    case "owner":
    case "admin_manager":
      return ALL_TABS;
    case "support":
      // Communications top-level so support roles can reach the hub's basic
      // sub-tabs (Live / Chats / Emails / SMS / Consultations). Restricted
      // sub-tabs (Templates / Settings & Automation) are gated inside
      // CommunicationsHub via getVisibleSubKeys(). Legacy comms/chats/contacts
      // keys preserved in TabKey + render branches for bookmark resilience;
      // the umbrella is what actually renders in the sidebar.
      return ["dashboard", "orders", "analytics", "communications", "comms", "chats", "contacts", "customers", "doctors", "audit", "health"];
    case "finance":
      return ["dashboard", "orders", "analytics", "communications", "comms", "chats", "contacts", "customers", "payments", "earnings", "audit", "health"];
    case "read_only":
      return ["dashboard", "orders", "analytics", "communications", "comms", "chats", "contacts", "customers", "doctors", "payments", "audit", "health"];
    default:
      // Attendance + Shifts (Company OS) are restricted to owner / admin_manager.
      return ALL_TABS.filter((t) => t !== "attendance" && t !== "shifts");
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

/**
 * The KPI card carried in the URL, or null.
 *
 * ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001 §13 — used to SEED
 * state on the very first render. Adopting the URL in an effect instead let the
 * URL-writer effect run first on mount, see state (null) disagree with the URL,
 * and "correct" the URL by deleting ?kpi= — so a direct load or a Back never
 * restored the selected card. Seeding removes the disagreement entirely.
 */
function readKpiParam(search: string): KpiCardKey | null {
  try {
    const raw = new URLSearchParams(search).get("kpi");
    return raw && (KPI_CARD_KEYS as string[]).includes(raw) ? (raw as KpiCardKey) : null;
  } catch {
    return null;
  }
}

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Tab state is bound to the ?tab= query param in both directions so the chat
  // notification banner (which navigates to /admin-orders?tab=chats) reliably
  // switches the UI, and a hard refresh on ?tab=chats still opens Chats.
  const [activeTab, setActiveTabState] = useState<TabKey>(() => {
    try {
      const t = new URLSearchParams(location.search).get("tab");
      return t && (ALL_TABS as string[]).includes(t) ? (t as TabKey) : "dashboard";
    } catch {
      return "dashboard";
    }
  });

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("tab");
    const next: TabKey =
      t && (ALL_TABS as string[]).includes(t) ? (t as TabKey) : "dashboard";
    setActiveTabState((prev) => (prev === next ? prev : next));
  }, [location.search]);

  // ── ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §12 — obsolete KPI URL state ───────
  //
  // Audit result: this page reads ONLY `tab`, `sub`, `thread` and `view` from the
  // query string — no KPI card, status or date parameter was ever read or
  // written, so no stale link can silently re-apply a hidden filter today.
  //
  // This sanitiser exists so that stays true. If any of these keys ever appears
  // (an old bookmark, a link pasted from a previous build, a future regression),
  // it is stripped on arrival with a REPLACE navigation — no history entry, no
  // reload — before it can be interpreted. Every legitimate parameter is
  // preserved untouched.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // `kpi` is NOT in this list: ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-
    // PARITY-001 makes it the LEGITIMATE parameter carrying the selected card.
    // Left in place it silently stripped ?kpi= the instant the card wrote it, so
    // every selection deselected itself on the next tick and no card could ever
    // appear active. Only genuinely dead parameters belong here.
    const OBSOLETE_KPI_PARAMS = ["activeKpi", "kpiFilter", "card", "monthScoped", "kpiRange"];
    const stripped = OBSOLETE_KPI_PARAMS.filter((k) => params.has(k));
    if (stripped.length === 0) return;
    stripped.forEach((k) => params.delete(k));
    const qs = params.toString();
    navigate(`/admin-orders${qs ? `?${qs}` : ""}`, { replace: true });
  }, [location.search, navigate]);

  const setActiveTab = useCallback(
    (t: TabKey) => {
      setActiveTabState(t);
      const params = new URLSearchParams(location.search);
      if (t === "dashboard") params.delete("tab");
      else params.set("tab", t);
      const qs = params.toString();
      navigate(`/admin-orders${qs ? `?${qs}` : ""}`, { replace: true });
    },
    [location.search, navigate],
  );
  // ── The WHOLE-TABLE snapshot ───────────────────────────────────────────────
  //
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001 §snapshot. This is NOT the Orders
  // list any more — `orderRows` below is. This array exists solely for the
  // surfaces that genuinely aggregate every order:
  //
  //   AdminDashboard (charts), AnalyticsTab (MERGE-FROZEN — its whole-table
  //   maths must not change), CommunicationsHub / CommunicationsPanel and
  //   IncomingCallBanner (comms → order resolution).
  //
  // Narrowing this to a page would not have thrown; it would have silently
  // recomputed those dashboards against 100 rows and reported confident wrong
  // numbers. So it keeps its exact old meaning — and instead stops being
  // loaded eagerly on every visit and every 30 seconds. It is now fetched ONCE,
  // on demand, only when a tab that needs it is opened (SNAPSHOT_TABS).
  const [orders, setOrders] = useState<Order[]>([]);
  // ── ADMIN-ORDERS-DATASET-FLICKER-P0-001 — dataset stability guards ─────────
  // loadSeqRef = one monotonic id per refresh cycle. Every async write (rows,
  // counts, loading, error, refreshing) checks isLatest() so a stale or
  // superseded cycle can never overwrite newer state.
  const loadSeqRef = useRef(0);
  // Mirrors ordersReady for reads INSIDE the stable loadOrderData callback.
  const ordersReadyRef = useRef(false);
  // Whether the whole-table snapshot has been requested this session, so
  // switching between Dashboard and Analytics does not refetch it.
  const snapshotRequestedRef = useRef(false);
  // Flips true only once the FIRST complete snapshot has committed. Global
  // counts (total, Dupes, No-GHL) show placeholders until then, so a partial
  // page-1 count is never presented as final.
  const [ordersReady, setOrdersReady] = useState(false);
  // True while a full snapshot is being rebuilt in the background AFTER a
  // completed snapshot is already on screen — drives a subtle "Refreshing"
  // chip and never clears or resets the visible list.
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);

  // ── THE ORDERS LIST — server-paged (ADMIN-ORDERS-SERVER-BACKED-LOADING-001) ──
  //
  // `orderRows` holds only the pages fetched for the CURRENT query. Appending a
  // page never re-reads the earlier ones, and changing the query never appends
  // onto the previous query's rows — the old rows stay on screen, marked
  // refreshing, until the new first page lands and replaces them atomically.
  // That is how §12 (keep the page during a pending request) and §13 (never
  // flicker back to stale data) hold at the same time.
  const [orderRows, setOrderRows] = useState<Order[]>([]);
  // First page of a NEW query is in flight. Appending a further page does not
  // set this, so "Load more" can never blank the list.
  const [orderRowsLoading, setOrderRowsLoading] = useState(true);
  const [orderRowsAppending, setOrderRowsAppending] = useState(false);
  const [orderRowsHasMore, setOrderRowsHasMore] = useState(false);
  // Server-side count of everything the CURRENT list query matches, including
  // the rows not yet paged in. Never derived from what is loaded.
  const [orderRowsTotal, setOrderRowsTotal] = useState<number | null>(null);
  const [orderRowsError, setOrderRowsError] = useState(false);
  // Operator escape hatch out of the 60-day default window. Purely additive:
  // any search / filter / tab already drops the window on its own.
  const [showAllOrders, setShowAllOrders] = useState(false);
  // Only the newest list request may publish (same discipline as the counts).
  const orderRowsGuard = useRef(createRequestGuard()).current;
  // How many pages of the current query have been requested.
  const orderPageRef = useRef(0);

  // ── ONE updater for BOTH datasets ─────────────────────────────────────────
  //
  // There are now two arrays holding orders: the server-paged list the operator
  // is looking at, and the whole-table snapshot the dashboards aggregate. Every
  // mutation — assign, refund, delete, opt-out, bulk action, realtime push —
  // has to reach both, or the row on screen silently disagrees with the row in
  // the database.
  //
  // Routing every mutation through here is what makes that structural instead
  // of something each of the fourteen call sites has to remember. Applying the
  // SAME transform to both keeps them consistent by construction; a row absent
  // from one array is simply not matched there.
  // The narrow whole-table projection (see ORDER_FACTS_COLUMNS). Typed as
  // Order[] because every consumer is an existing Order predicate; only the
  // columns those predicates actually read are selected.
  const [orderFacts, setOrderFacts] = useState<Order[]>([]);
  const [orderFactsReady, setOrderFactsReady] = useState(false);

  const mutateOrders = useCallback((fn: (prev: Order[]) => Order[]) => {
    setOrders(fn);
    setOrderRows(fn);
    setOrderFacts(fn);
  }, []);
  const [doctorContacts, setDoctorContacts] = useState<DoctorContact[]>([]);
  const [doctorProfiles, setDoctorProfiles] = useState<DoctorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  // True when the PRIMARY orders fetch failed and we have nothing to show —
  // drives a retry affordance instead of a misleading "No orders" empty state.
  const [ordersError, setOrdersError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSyncMsg, setRefreshSyncMsg] = useState("");
  const [search, setSearch] = useState("");
  // §11 — the SERVER search term. The input stays instant; the query waits for
  // the operator to stop typing. The client-side row predicate reads this same
  // debounced value, never the raw input: if it read the raw one it would hide
  // rows the current server page legitimately contains and the list would blink
  // empty between keystrokes.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => { window.clearTimeout(t); };
  }, [search]);
  // Seeded from ?kpi= so a direct load lands on the card's tab immediately,
  // with no intermediate "All" frame.
  const [statusFilter, setStatusFilter] = useState<string>(
    () => readKpiParam(window.location.search) ?? "all",
  );
  // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — ONE date basis drives the list
  // sort, the day ribbons, the From/To filter AND the KPI cards. Sorting by
  // latest activity while silently filtering by created_at is the exact
  // ambiguity this removes. Default "activity", so a June lead that pays in July
  // surfaces the moment the payment webhook lands; "created" keeps acquisition
  // cohort work available. Persisted per operator.
  const [dateBasis, setDateBasis] = useState<OrderDateBasis>(() => {
    try {
      // ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 — the DEFAULT is
      // now Created date, newest first. Only the FALLBACK changed: a saved
      // per-operator choice still wins, so an explicit selection is never
      // silently reset. Direction is already descending everywhere (fetchPage
      // orders <basis> DESC, created_at DESC, id DESC), so "newest first" needs
      // no separate flag.
      const saved = localStorage.getItem("adminOrdersDateBasis");
      return isOrderDateBasis(saved) ? saved : "created";
    } catch { return "created"; }
  });
  const dateBasisRef = useRef<OrderDateBasis>(dateBasis);
  useEffect(() => {
    dateBasisRef.current = dateBasis;
    try { localStorage.setItem("adminOrdersDateBasis", dateBasis); } catch { /* private mode */ }
  }, [dateBasis]);
  // Hidden source filter — only settable from dashboard, not shown in filter UI
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // Package / RA filter (ORDERS-RA-COMBO-CHIP-FILTER-001).
  const [packageFilter, setPackageFilter] = useState<PackageFilterKey>("all");
  // Order IDs (orders.id) with a PAID standalone Additional-Documentation add-on
  // request. Fetched from order_additional_documentation_requests — a child
  // table, NOT joined into the list query. Drives the "RA Add-on" category.
  const [raAddonOrderIds, setRaAddonOrderIds] = useState<Set<string>>(new Set());
  // ORDER-ADDITIONAL-PET-FINAL-TEST-CLOSURE-001 §1 — order_id → Additional Pet
  // request status, for the Orders-list chip. Same shape as raAddonOrderIds: a
  // child-table fetch that is deliberately NOT joined into the list query, so
  // the dataset-stability contract (ADMIN-ORDERS-DATASET-FLICKER-P0-001) is
  // untouched and the list can never flicker or re-sort because of it.
  const [additionalPetStatusById, setAdditionalPetStatusById] = useState<Map<string, string>>(new Map());
  // (visibleCount is gone: pagination is server-side. A filter change resets
  // the list to page 0 via listQueryKey, not via a client slice counter.)

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

  // ── Orders KPI card counts — server-side FACETED over the active filter set ──
  // ADMIN-ORDERS-FILTER-COUNT-PARTIAL-REFUND-STRIPE-ACCOUNTING-001: the KPI row is
  // filter-aware. Counts come from narrow COUNT(head) queries that apply the SAME
  // non-status filters as the list and facet by lifecycle bucket, so every card
  // reconciles with the filtered "X of Y" total (see orderFacetCounts.ts). The
  // effect lives below, after the remaining filter states are declared. Does NOT
  // touch the loader/pagination/polling.
  const [facetCounts, setFacetCounts] = useState<FacetCounts>({
    universeTotal: null,
    buckets: { lead_unpaid: null, paid_unassigned: null, under_review: null, pending_delivery: null, completed: null, refunded: null, disputed: null, cancelled: null, payment_failed: null, archived: null },
    blockedClientFilters: [],
    error: false,
  });

  // ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001 — the six Sequence
  // Status chip counts (lead-scoped, faceted on every filter EXCEPT the sequence
  // selection itself). Server-authoritative; never derived from `orderRows`.
  const [sequenceFacetCounts, setSequenceFacetCounts] =
    useState<SequenceFacetCounts>(emptySequenceFacetCounts);

  // ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §8 — the CURRENT America/New_York
  // business date ("YYYY-MM-DD"). Referentially stable all day and flipped by a
  // timer armed on the exact next New York midnight, so the Today/Yesterday
  // ribbons roll over on their own without a page refresh — and never at the
  // operator's local midnight.
  const businessDayKey = useBusinessDayKey();

  // ── Upper banner — PERIOD EVENTS (America/New_York) ────────────────────────
  // ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001. Server-authoritative
  // aggregate from get_admin_orders_monthly_kpis(). Its effect intentionally has
  // NO filter/basis/pagination dependencies — the banner answers "what happened
  // this month?" and must stay perfectly still while the operator searches,
  // switches status/package/sequence filters, flips Date Basis or pages the list.
  // Reloaded on mount, on an explicit Refresh, on a local mutation, and — since
  // ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001 — on EXTERNAL change
  // too (see scheduleAggregateInvalidation).
  // ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9/§10/§11 — ONE KPI CONTRACT.
  //
  // The banner previously ran TWO universes with two different meanings and
  // switched between them at runtime:
  //   • monthlyKpis — four "now" queue-DEPTH cards + one monthly Completed, and
  //   • rangeKpis   — five period-EVENT cards, activated by dateFrom/dateTo.
  // Because a KPI card CLICK set dateFrom/dateTo, clicking a card flipped the
  // whole banner into the other universe: all five cards changed their label,
  // their timeframe AND their value. That is the "cards flicker and switch
  // values" the owner reported — not a race (runLatest already ordered the
  // responses), but two semantics fighting over one row of cards.
  //
  // Now there is exactly ONE semantics — PERIOD EVENTS — over exactly ONE
  // normalized America/New_York window:
  //   • no explicit date filter → the CURRENT New York calendar month
  //   • explicit From/To        → that range, same five event metrics
  // Nothing else can change the window: the cards are display-only (§B), and
  // search / status / package / sequence / Date Basis / pagination are not
  // inputs to it.
  const kpiMonth = useMemo(
    // businessDayKey is a dependency so the default window rolls into the next
    // month at NEW YORK midnight, not at the operator's local midnight.
    () => currentBusinessMonth(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessDayKey],
  );
  const kpiRangeExplicit = Boolean(dateFrom || dateTo);
  // THE normalized range key. Two primitive strings — never a Date object, which
  // would be a new identity on every render and re-fire the effect forever.
  const kpiFrom = kpiRangeExplicit ? (dateFrom || undefined) : kpiMonth.from;
  const kpiTo = kpiRangeExplicit ? (dateTo || undefined) : kpiMonth.toInclusive;

  // Which card is currently selected, or null. This is the ONE piece of KPI
  // state; everything else about a selected card is derived from it, so it
  // cannot leave residue behind when cleared (§8 toggle-off, §13 URL).
  const [activeKpi, setActiveKpi] = useState<KpiCardKey | null>(() => readKpiParam(window.location.search));

  const [kpiCounts, setKpiCounts] = useState<KpiCardCounts | null>(null);
  const [kpiCountsLoading, setKpiCountsLoading] = useState(true);
  const [monthlyKpiReloadToken, setMonthlyKpiReloadToken] = useState(0);
  // The "never blink after the first load" rule that monthlyKpiLoadedRef used to
  // enforce is now expressed directly at the render site as
  // `firstLoad = periodKpisLoading && periodKpis == null` — the skeleton is tied
  // to the ABSENCE of numbers rather than to a separate ref that could drift out
  // of sync with them. The loading flag itself stays truthful so the heading can
  // show a subtle "updating…" while a new window loads.
  //
  // Guarded by a monotonic generation rather than an effect-cleanup boolean. The
  // banner is also refetched by MUTATIONS (see invalidateOrderAggregates) and by
  // EXTERNAL change (scheduleAggregateInvalidation), and those requests start
  // OUTSIDE this effect, so a cleanup flag could not have ordered them against
  // each other. Only the newest request may publish.
  const kpiCountGuard = useRef(createRequestGuard()).current;

  // ── ONE authoritative invalidation for every order mutation ────────────────
  // The reported bug: after assigning a Paid (Unassigned) order the top KPI
  // stayed stale until a manual refresh. Cause — monthlyKpiReloadToken was bumped
  // ONLY by handleRefresh, and the faceted counts were keyed exclusively on
  // FILTER state, so no mutation invalidated either aggregate. Mutations updated
  // the row array and nothing else, leaving rows and counts describing different
  // worlds.
  //
  // Every mutation now calls this instead of hand-picking what to refresh, so a
  // future mutation cannot forget one aggregate. The visible row is already
  // patched optimistically by the caller (deterministic — we know the new
  // status), and the server aggregates reconcile behind it.
  //
  // Which tab a notification asked the modal to land on. Cleared when the modal
  // closes so a later manual open goes back to Overview.
  const [orderDetailSection, setOrderDetailSection] = useState<"overview" | "documents" | "comms" | undefined>(undefined);
  const [aggregateReloadToken, setAggregateReloadToken] = useState(0);
  const invalidateOrderAggregates = useCallback(() => {
    setMonthlyKpiReloadToken((t) => t + 1);
    setAggregateReloadToken((t) => t + 1);
  }, []);

  // ── EXTERNAL change invalidation (coalesced) ───────────────────────────────
  // ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001.
  //
  // The reported symptom: the banner read "Under Review 3 / Pending Delivery 0"
  // while the Under Review tab listed 6 rows and an order sat in Pending
  // Delivery. The COUNTS were never wrong — the banner was simply OLD. Rows are
  // pushed by realtime and re-fetched every 30s, but the aggregates were
  // invalidated only by a mutation made IN THIS TAB. Work done anywhere else — a
  // provider submitting a letter from the provider portal, a new paid order, a
  // second admin acting — moved the rows and left both aggregates frozen at
  // whatever they were when the tab was opened. On a long-lived admin session
  // the banner drifts arbitrarily far from the list.
  //
  // COALESCED, not debounced-per-event: a realtime burst (bulk assign, webhook
  // storm) must cost at most ONE aggregate refresh per window, never one per
  // row. The first event schedules the refresh and every event inside the window
  // is absorbed by the in-flight timer, so there is no runaway polling. Ordering
  // is already safe — both aggregates commit through a monotonic request guard,
  // so a slow earlier response can never overwrite a newer one.
  const externalInvalidateTimerRef = useRef<number | null>(null);
  const scheduleAggregateInvalidation = useCallback(() => {
    if (externalInvalidateTimerRef.current !== null) return; // already scheduled
    externalInvalidateTimerRef.current = window.setTimeout(() => {
      externalInvalidateTimerRef.current = null;
      invalidateOrderAggregates();
    }, 2500);
  }, [invalidateOrderAggregates]);
  useEffect(() => () => {
    if (externalInvalidateTimerRef.current !== null) {
      window.clearTimeout(externalInvalidateTimerRef.current);
      externalInvalidateTimerRef.current = null;
    }
  }, []);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // ADMIN-ORDERS-CONTROL-CONSOLIDATION-001 §11 — the Filters panel is now the
  // one place the Orders controls live, including the exports, so it has to
  // close the way an operator expects a menu to close. It previously had
  // NEITHER behaviour: only re-clicking the Filters button dismissed it.
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!showAdvancedFilters) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAdvancedFilters(false);
        filtersButtonRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      // The toggle button owns its own click; closing here too would reopen it.
      if (filtersButtonRef.current?.contains(t)) return;
      if (filtersPanelRef.current?.contains(t)) return;
      setShowAdvancedFilters(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [showAdvancedFilters]);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showNonGhlOnly, setShowNonGhlOnly] = useState(false);

  // ── THE EFFECTIVE DATE WINDOW (count-to-list parity, §10) ─────────────────
  //
  // When a KPI card is selected, the list is windowed on THAT CARD'S stage-entry
  // column over the active New York range — the identical (basis, from, to) the
  // card's own count was computed with. When no card is selected, the operator's
  // own Date Basis and explicit range apply and nothing is imposed.
  //
  // Derived, never stored. That is the whole trick: clearing `activeKpi` removes
  // the card's window instantly and completely, so there is no hidden date state
  // to leak into the Filters badge and nothing to "clean up" on toggle-off.
  //
  // ADMIN-ORDERS-ACCOUNTS-MONTH-END-LIFECYCLE-DATE-INTEGRITY-002 — the effective
  // basis is the DISPLAY basis too, not only the filter basis. It was previously
  // applied to the row predicate and the card counts while the SORT, the day
  // ribbons and the CSV all still read the operator's raw `dateBasis`. With the
  // Completed card active and the operator's basis on Created/First paid, August
  // completions were correctly selected and then filed under JULY ribbons — the
  // "July groups inside the August Completed view" defect. One basis drives the
  // predicate, the count, the sort, the ribbons and the export, or they drift.
  //
  // ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001 — the window now comes from
  // kpiCardWindow(), the SAME function fetchKpiCardCounts() calls. Previously
  // both sides independently built (basis, kpiFrom, kpiTo); that is parity by
  // coincidence and it hid a real defect: OPERATIONAL queues were date-gated, so
  // an order that entered Pending Delivery in July vanished from the card on
  // August 1 while still sitting in the queue. Queues are current inventory
  // across ALL dates; only Completed is a period event.
  const kpiWindow = activeKpi ? kpiCardWindow(activeKpi, { from: kpiFrom, to: kpiTo }) : null;
  const effDateBasis: OrderDateBasis = kpiWindow ? kpiWindow.dateBasis : dateBasis;
  const effDateFrom = kpiWindow ? kpiWindow.dateFrom : (dateFrom || undefined);
  const effDateTo = kpiWindow ? kpiWindow.dateTo : (dateTo || undefined);
  // Whether the ACTIVE card is a work queue (all dates) or a period event. Drives
  // the banner copy, so the words on screen can never claim a period the rows
  // were not actually filtered by.
  const activeKpiKind = activeKpi ? KPI_CARD_KIND[activeKpi] : null;
  // The one label every surface names the active date by. Derived from the same
  // `effDateBasis`, so the words on screen can never describe a different column
  // than the rows were selected, sorted and grouped on.
  const effDateBasisLabel = ORDER_DATE_BASIS_LABEL[effDateBasis];

  // Faceted KPI/count recompute — reacts to every active NON-STATUS filter
  // (statusFilter is deliberately excluded so the cards keep faceting one universe
  // when the user switches status tabs). Debounced; narrow COUNT queries only;
  // the loader/pagination/polling is untouched.
  //
  // It reads the EFFECTIVE window, so when a card is active
  // `filteredTotalFor(statusFilter, facetCounts)` recomputes that card's bucket
  // on that card's basis and range — i.e. the list total IS the card count, by
  // construction rather than by coincidence.
  // ── THE ONE ACTIVE FILTER SET ─────────────────────────────────────────────
  //
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001. The faceted status counts, the KPI
  // cards and (new) the ROW query all read this same object. Three surfaces
  // that must agree, built in one place — so a filter cannot reach the rows
  // without also reaching the numbers that describe them.
  //
  // `search` is the DEBOUNCED term, so all three fire on the same keystroke
  // boundary instead of the counts and the rows chasing each other.
  const listFilters = useMemo<FacetFilters>(() => ({
    dateBasis: effDateBasis, dateFrom: effDateFrom, dateTo: effDateTo,
    payment: paymentFilter,
    state: stateFilterAdv,
    referredBy: referredByFilter,
    assignedProvider: doctorFilter,
    requestedProvider: selectedProviderFilter,
    sequence: sequenceFilter,
    search: debouncedSearch,
    nonGhl: showNonGhlOnly,
    source: sourceFilter ?? undefined,
    packageFilter,
    duplicatesOnly: showDuplicatesOnly,
  }), [
    effDateBasis, effDateFrom, effDateTo, paymentFilter, stateFilterAdv,
    referredByFilter, doctorFilter, selectedProviderFilter, sequenceFilter,
    debouncedSearch, showNonGhlOnly, sourceFilter, packageFilter, showDuplicatesOnly,
  ]);

  const facetGuard = useRef(createRequestGuard()).current;
  useEffect(() => {
    const t = window.setTimeout(() => {
      void runLatest(facetGuard, () => fetchOrderFacetCounts(listFilters), setFacetCounts);
    }, 500);
    return () => { window.clearTimeout(t); };
    // aggregateReloadToken is what makes the status-tab counts react to a
    // MUTATION and not only to a filter change.
  }, [listFilters, aggregateReloadToken, facetGuard]);




  // ── THE ORDERS LIST QUERY (ADMIN-ORDERS-SERVER-BACKED-LOADING-001) ─────────
  //
  // Recomputed daily rather than per render: a cutoff that moved every render
  // would change the query key on every render and never settle.
  const defaultScopeCutoff = useMemo(
    () => defaultScopeCutoffIso(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessDayKey],
  );

  // The 60-day window narrows the list ONLY in the untouched default view. A
  // KPI card imposes its own range, and every filter / tab / search already
  // disqualifies it inside isDefaultScopeEligible — this is belt and braces so
  // a future card cannot silently inherit the window.
  const defaultScopeActive =
    !showAllOrders && !activeKpi && isDefaultScopeEligible(listFilters, statusFilter);

  // Fetch ONE page. Every WHERE clause comes from applyListPredicates; only the
  // projection, the ordering and the window are decided here.
  const fetchOrdersPage = useCallback(async (pageIndex: number) => {
    const from = pageIndex * ORDERS_PAGE_SIZE;
    const asc = sortOrder === "asc";
    // §6/§12 deterministic ordering: <basis>, created_at, id. The two
    // tie-breakers are what make offset paging safe — without them two rows
    // sharing a timestamp can swap pages and produce a duplicate on one page
    // and a missing row on the next.
    const base = applyListPredicates(
      supabase.from("orders").select(ORDERS_LIST_COLUMNS),
      listFilters,
      statusFilter,
      { defaultScopeCutoff: defaultScopeActive ? defaultScopeCutoff : null },
    );
    const ordered = effDateBasis === "created"
      ? base.order("created_at", { ascending: asc })
      : base
          .order(ORDER_DATE_BASIS_COLUMN[effDateBasis], { ascending: asc, nullsFirst: false })
          .order("created_at", { ascending: asc });
    const { data, error } = await ordered
      .order("id", { ascending: asc })
      .range(from, from + ORDERS_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = ((data as unknown as Order[]) ?? []);
    return { rows, full: rows.length === ORDERS_PAGE_SIZE };
  }, [listFilters, statusFilter, defaultScopeActive, defaultScopeCutoff, effDateBasis, sortOrder]);

  // ONE key for "which query am I looking at". Changing it resets to page 0;
  // appending a page does not touch it.
  const listQueryKey = useMemo(
    () => JSON.stringify([listFilters, statusFilter, effDateBasis, sortOrder, defaultScopeActive]),
    [listFilters, statusFilter, effDateBasis, sortOrder, defaultScopeActive],
  );

  // ── The five KPI card counts ───────────────────────────────────────────────
  //
  // One narrow server COUNT per card, each on ITS OWN stage-entry basis over the
  // active New York window, built by the SAME applyNonStatusFilters/applyBucket
  // pair the list total uses (see orderFacetCounts.ts). Never derived from the
  // browser's loaded rows.
  //
  // Deliberately independent of `statusFilter` and `activeKpi`: selecting a card
  // must not change what any card says, or the numbers would move under the
  // operator's cursor — the flicker this task exists to remove.
  useEffect(() => {
    // Values already on screen stay there while the next window loads; the
    // skeleton is first-load only. Never reset the counts to null/zero here.
    setKpiCountsLoading(true);
    const t = window.setTimeout(() => {
      void runLatest(
        kpiCountGuard,
        () => fetchKpiCardCounts({
          payment: paymentFilter,
          state: stateFilterAdv,
          referredBy: referredByFilter,
          assignedProvider: doctorFilter,
          requestedProvider: selectedProviderFilter,
          sequence: sequenceFilter,
          search: debouncedSearch,
          nonGhl: showNonGhlOnly,
          source: sourceFilter ?? undefined,
          packageFilter,
          duplicatesOnly: showDuplicatesOnly,
        }, { from: kpiFrom, to: kpiTo }),
        (c) => { setKpiCounts(c); setKpiCountsLoading(false); },
        () => setKpiCountsLoading(false),
      );
    }, 300);
    return () => { window.clearTimeout(t); };
    // `listQueryKey` is a dependency for a reason that is easy to mistake for a
    // bug. The cards deliberately do NOT depend on activeKpi/statusFilter — what
    // a card counts must not change when you select one. But the LIST re-reads
    // whenever that key changes, and if the cards do not re-read at the same
    // moment they end up describing an OLDER world than the rows beside them.
    //
    // That is exactly the reported evidence: Under Review 2 against a list of
    // "1 of 1". `orders` is not in this project's realtime publication and there
    // is no polling loop, so nothing else would ever reconcile them — clicking a
    // card refreshed the rows and left the numbers frozen at page-load values.
    //
    // Recomputing here cannot cause flicker: fetchKpiCardCounts ignores
    // activeKpi and statusFilter, so the same inputs return the same numbers
    // unless the underlying DATA actually moved.
  }, [listQueryKey, kpiFrom, kpiTo, paymentFilter, stateFilterAdv, referredByFilter, doctorFilter, selectedProviderFilter, sequenceFilter, debouncedSearch, showNonGhlOnly, sourceFilter, packageFilter, showDuplicatesOnly, monthlyKpiReloadToken, aggregateReloadToken, kpiCountGuard]);

  // First page of the CURRENT query. The previous query's rows deliberately
  // stay on screen (flagged loading) until this resolves, then are REPLACED —
  // never appended to, so results can never mix two queries (§12, §13).
  useEffect(() => {
    orderPageRef.current = 0;
    setOrderRowsLoading(true);
    setOrderRowsError(false);
    void runLatest(
      orderRowsGuard,
      async () => {
        const [page, total] = await Promise.all([
          fetchOrdersPage(0),
          fetchListScopeTotal(listFilters, statusFilter, {
            defaultScopeCutoff: defaultScopeActive ? defaultScopeCutoff : null,
          }),
        ]);
        return { page, total };
      },
      ({ page, total }) => {
        setOrderRows(page.rows);
        setOrderRowsHasMore(page.full);
        setOrderRowsTotal(total);
        setOrderRowsLoading(false);
        setOrdersReady(true);
        ordersReadyRef.current = true;
        setLastSyncedAt(new Date());
      },
      (err) => {
        console.error("[admin-orders] list query failed:", err);
        setOrderRowsError(true);
        setOrderRowsLoading(false);
      },
    );
    // listQueryKey collapses every input above into one primitive; the
    // individual values are read through the stable fetchOrdersPage callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQueryKey, aggregateReloadToken, orderRowsGuard]);

  // Mirrors listQueryKey for reads inside the async load-more closure, so a
  // page that resolves after the operator changed the query is discarded
  // instead of appended to a list it does not belong to.
  const listQueryKeyRef = useRef(listQueryKey);
  useEffect(() => { listQueryKeyRef.current = listQueryKey; }, [listQueryKey]);

  // "Load more" — appends the NEXT page of the SAME query. Never clears the
  // list, never resets the loading state, and a page that arrives after the
  // query changed is dropped.
  const loadMoreOrders = useCallback(() => {
    if (orderRowsAppending || orderRowsLoading || !orderRowsHasMore) return;
    if (orderPageRef.current + 1 >= ORDERS_MAX_PAGES) return;
    const next = orderPageRef.current + 1;
    const keyAtRequest = listQueryKey;
    setOrderRowsAppending(true);
    void (async () => {
      try {
        const { rows, full } = await fetchOrdersPage(next);
        if (keyAtRequest !== listQueryKeyRef.current) return; // query moved on
        orderPageRef.current = next;
        setOrderRows((prev) => {
          // Dedupe by order id: a row inserted between two page reads can
          // otherwise appear on both.
          const seen = new Set(prev.map((o) => o.id));
          return [...prev, ...rows.filter((r) => r && r.id && !seen.has(r.id))];
        });
        setOrderRowsHasMore(full);
      } catch (e) {
        console.error("[admin-orders] load-more failed:", e);
      } finally {
        setOrderRowsAppending(false);
      }
    })();
  }, [orderRowsAppending, orderRowsLoading, orderRowsHasMore, listQueryKey, fetchOrdersPage]);

  // ── EXPORTS read the COMPLETE matching dataset ────────────────────────────
  //
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001 §export. Both exports used to run
  // `.range(0, 9999)` with NO predicates and filter in the browser, which meant
  // two silent defects: the 10,000th order was the hard ceiling, and the work
  // scaled with the table rather than with the selection.
  //
  // They now page through exactly what the CURRENT filters match, server-side,
  // through the same predicate builder as the list — and deliberately WITHOUT
  // the 60-day default window, so an export is never quietly truncated to the
  // default view the operator happened to be looking at.
  const fetchAllMatchingOrders = useCallback(async (): Promise<Order[]> => {
    const acc: Order[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < ORDERS_MAX_PAGES; page++) {
      const from = page * SNAPSHOT_PAGE_SIZE;
      const base = applyListPredicates(
        supabase.from("orders").select(ORDERS_LIST_COLUMNS),
        listFilters,
        statusFilter,
        { defaultScopeCutoff: null },
      );
      const { data, error } = await base
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + SNAPSHOT_PAGE_SIZE - 1);
      if (error) throw error;
      const chunk = ((data as unknown as Order[]) ?? []);
      for (const o of chunk) {
        if (o && o.id && !seen.has(o.id)) { seen.add(o.id); acc.push(o); }
      }
      if (chunk.length < SNAPSHOT_PAGE_SIZE) break;
    }
    return acc;
  }, [listFilters, statusFilter]);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(""); // export error surface (avoids silent bad CSV)
  // Meta Custom Audience export (identifiers-only, paid clients) — see lib/exportMetaAudience.ts
  const [audienceExporting, setAudienceExporting] = useState(false);
  const [audienceMsg, setAudienceMsg] = useState("");

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

  // ── THE SEQUENCE CHIP COUNTS ───────────────────────────────────────────────
  //
  // ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001.
  //
  // Six narrow server COUNT(head) queries in one parallel batch, built by
  // `applySequenceFilter` — the SAME predicate `applyListPredicates` uses to
  // select the rows. Deliberately NOT keyed on `statusFilter`: sequence outreach
  // is lead-scoped, so the chips must keep describing the lead universe when the
  // operator is looking at the Completed tab (the behaviour the external strip
  // had, and the reason it was never tab-scoped).
  //
  // `hideRecentFollowup` narrows the LIST client-side and cannot be expressed in
  // this predicate, so it is declared BLOCKED rather than silently ignored — an
  // unavailable count renders as unavailable, never as a number the list would
  // contradict.
  //
  // Debounced + guarded by `runLatest`, so a slow earlier response can never
  // overwrite the counts for newer filters.
  const sequenceCountGuard = useRef(createRequestGuard()).current;
  useEffect(() => {
    const t = window.setTimeout(() => {
      void runLatest(
        sequenceCountGuard,
        () => fetchSequenceFacetCounts(
          listFilters,
          hideRecentFollowup ? ["Hide sent within 7 days"] : [],
        ),
        setSequenceFacetCounts,
      );
    }, 500);
    return () => { window.clearTimeout(t); };
    // aggregateReloadToken is what makes the chips react to a MUTATION (e.g. a
    // bulk Stop Sequence) and not only to a filter change.
  }, [listFilters, hideRecentFollowup, aggregateReloadToken, sequenceCountGuard]);

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

  // Timestamp of the last successful data load / realtime push. Retained for
  // the 30s background-refresh cadence; the top-bar "Synced X ago" chip that
  // used to render it has been removed.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);
  const [unreadContactsCount, setUnreadContactsCount] = useState(0);

  // Poll contact_submissions for "new" count to badge the sidebar.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { count, error: qErr } = await supabase
          .from("contact_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "new");
        if (!cancelled && !qErr) {
          setUnreadContactsCount(count ?? 0);
        }
      } catch {
        // silent
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
    // Legacy doctor_contacts have no portal account → always assignment-ready.
    const result: DoctorContact[] = doctorContacts
      .filter((d) => d.is_active !== false)
      .map((d) => ({ ...d, assignment_ready: true }));
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
          // PROVIDER-ASSIGNMENT-READINESS: a portal provider is assignment-ready
          // only after they have accessed the provider portal at least once.
          user_id: p.user_id,
          portal_first_accessed_at: p.portal_first_accessed_at ?? null,
          assignment_ready: p.portal_first_accessed_at != null,
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

  // ── Privacy-safe order change signal ──────────────────────────────────────
  // `orders` contains customer data and is deliberately not streamed to the
  // LIVE admin browser. A one-row, admin-readable signal carries only a revision,
  // order id, event type, and paid-transition bit. Any signal refreshes the
  // current server-paged list and every authoritative aggregate through the
  // existing coalesced invalidation path; no whole-table polling is introduced.
  useEffect(() => {
    const handleSignal = (_payload: { new: Record<string, unknown> }) => {
      setLastSyncedAt(new Date());
      scheduleAggregateInvalidation();
    };

    const channel = supabase
      .channel("admin-order-change-signal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_order_change_signal" },
        handleSignal,
      )
      .subscribe((status) => {
        // Postgres Changes does not replay gaps after a sleeping browser.
        // Reconcile once on every initial subscription/reconnection.
        if (status === "SUBSCRIBED") {
          setLastSyncedAt(new Date());
          scheduleAggregateInvalidation();
        }
      });

    const reconcileWhenActive = () => {
      if (document.visibilityState === "visible") {
        setLastSyncedAt(new Date());
        scheduleAggregateInvalidation();
      }
    };
    window.addEventListener("focus", reconcileWhenActive);
    window.addEventListener("online", reconcileWhenActive);
    document.addEventListener("visibilitychange", reconcileWhenActive);

    return () => {
      window.removeEventListener("focus", reconcileWhenActive);
      window.removeEventListener("online", reconcileWhenActive);
      document.removeEventListener("visibilitychange", reconcileWhenActive);
      void supabase.removeChannel(channel);
    };
  }, [scheduleAggregateInvalidation]);

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

  // 2026-04-25: allSettled so one failing query (e.g. 522 from pool
  // saturation) doesn't unwind the whole admin boot into an infinite loader.
  const loadOrderData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const isLatest = () => seq === loadSeqRef.current;
    // Whether a complete snapshot is already on screen. If so, this cycle is a
    // background refresh: keep the current list + counts visible until commit
    // and skip the fast page-1 paint (which would reset a completed list).
    const hadSnapshot = ordersReadyRef.current;

    if (isLatest()) setOrdersRefreshing(true);

    // ── Small side tables (assignable providers) — cheap, refreshed each cycle
    try {
      const [contactsSettled, profilesSettled] = await Promise.allSettled([
        supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name"),
        supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, state_license_numbers, role, portal_first_accessed_at").order("full_name"),
      ]);
      if (isLatest()) {
        if (contactsSettled.status === "fulfilled" && !contactsSettled.value.error) {
          setDoctorContacts((contactsSettled.value.data as DoctorContact[]) ?? []);
        } else {
          console.error(
            "[admin-orders] doctor_contacts query failed:",
            contactsSettled.status === "rejected" ? contactsSettled.reason : contactsSettled.value.error,
          );
        }
        if (profilesSettled.status === "fulfilled" && !profilesSettled.value.error) {
          setDoctorProfiles((profilesSettled.value.data as DoctorProfile[]) ?? []);
        } else {
          console.error(
            "[admin-orders] doctor_profiles query failed:",
            profilesSettled.status === "rejected" ? profilesSettled.reason : profilesSettled.value.error,
          );
        }
      }
    } catch (metaErr) {
      console.error("[admin-orders] contacts/profiles load failed:", metaErr);
    }

    if (!isLatest()) return;

    // ── The WHOLE-TABLE snapshot — ON DEMAND ONLY ─────────────────────────────
    //
    // ADMIN-ORDERS-SERVER-BACKED-LOADING-001. This sweep used to run on every
    // visit and again every 30 seconds, for every operator, whether or not
    // anything on screen needed it. It is what the "2049 orders loading" cycle
    // actually was.
    //
    // It now runs only when a tab that genuinely aggregates the whole table has
    // been opened (SNAPSHOT_TABS), and only once per session unless the
    // operator presses Refresh. The Orders LIST never triggers it — the list is
    // server-paged and asks for exactly the page it is showing.
    if (!snapshotRequestedRef.current) {
      if (isLatest()) setOrdersRefreshing(false);
      return;
    }

    // Pages accumulate into `acc` (deduped by id via `seen`) — never written to
    // React state page by page. The whole snapshot commits once, atomically.
    const acc: Order[] = [];
    const seen = new Set<string>();
    const appendChunk = (chunk: Order[]) => {
      // Dedupe by stable order primary key after every page.
      for (const o of chunk) {
        if (o && o.id && !seen.has(o.id)) { seen.add(o.id); acc.push(o); }
      }
    };
    // Server-side page ordering matches the ACTIVE sort basis so page N always
    // contains the rows the client would place at position N — pagination and
    // the committed snapshot can never disagree. Read through the ref so the
    // loader callback identity (and therefore the flicker architecture) is
    // unchanged by a basis flip. Backed by orders_last_meaningful_activity_idx.
    const basis = dateBasisRef.current;
    const fetchPage = (page: number) => {
      const from = page * SNAPSHOT_PAGE_SIZE;
      // §12 deterministic ordering: <basis> DESC, created_at DESC, id DESC. The
      // two tie-breakers are what keep pagination stable — without them two rows
      // sharing a timestamp can swap between pages and produce a duplicate on
      // one page and a missing row on the next.
      // Both arms stay ONE bounded statement with the canonical page window —
      // the list projection is never read without .range() (COS dataset-stability
      // invariant) and the window expression stays literal for the guard.
      return basis === "created"
        ? supabase.from("orders").select(ORDERS_LIST_COLUMNS)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + SNAPSHOT_PAGE_SIZE - 1)
        : supabase.from("orders").select(ORDERS_LIST_COLUMNS)
            .order(ORDER_DATE_BASIS_COLUMN[basis], { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + SNAPSHOT_PAGE_SIZE - 1);
    };

    // Sort exactly once, then commit rows + readiness + freshness together.
    // React 19 batches these async setStates into ONE render, so the rows and
    // every derived count (total, Dupes, No-GHL) update from the SAME completed,
    // deduplicated snapshot — never from a partial page.
    const commitSnapshot = () => {
      const snapshot = acc.slice().sort(orderComparator(basis));
      ordersReadyRef.current = true;
      setOrders(snapshot);
      setOrdersReady(true);
      setLastSyncedAt(new Date());
      setOrdersRefreshing(false);

      // Secondary, non-blocking: per-order note-count badges. Chunked so the id
      // list never overflows the request URI, guarded, replaced in one write.
      void (async () => {
        if (snapshot.length === 0) { if (isLatest()) setOrderNoteCounts({}); return; }
        try {
          const counts: Record<string, number> = {};
          for (let i = 0; i < snapshot.length; i += ORDERS_PAGE_SIZE) {
            if (!isLatest()) return;
            const ids = snapshot.slice(i, i + ORDERS_PAGE_SIZE).map((o) => o.id);
            const { data, error } = await supabase.from("doctor_notes").select("order_id").in("order_id", ids);
            if (error) { console.error("[admin-orders] doctor_notes query failed:", error); continue; }
            ((data as { order_id: string }[] | null) ?? []).forEach((n) => {
              counts[n.order_id] = (counts[n.order_id] ?? 0) + 1;
            });
          }
          if (isLatest()) setOrderNoteCounts(counts);
        } catch (notesErr) {
          console.error("[admin-orders] doctor_notes query failed:", notesErr);
        }
      })();
    };

    // Page 1 (index 0) is awaited: on the very first load it paints instantly,
    // and it tells us whether a background backfill is needed. Any error keeps
    // whatever is already on screen (previous snapshot, or the boot loader).
    let firstRes;
    try {
      firstRes = await fetchPage(0);
    } catch (pageErr) {
      console.error("[admin-orders] orders page 1 fetch threw:", pageErr);
      if (isLatest()) setOrdersRefreshing(false);
      return;
    }
    if (!isLatest()) return;
    if (firstRes.error) {
      console.error("[admin-orders] orders page 1 fetch failed:", firstRes.error);
      if (isLatest()) setOrdersRefreshing(false);
      return;
    }
    appendChunk((firstRes.data as unknown as Order[]) ?? []);
    const firstLen = ((firstRes.data as unknown as Order[]) ?? []).length;

    // Very first load ONLY: paint page 1 immediately so rows appear fast.
    // Counts stay gated (ordersReady=false) so no partial total is shown, and a
    // background refresh (hadSnapshot=true) never resets a completed list here.
    if (!hadSnapshot && isLatest()) {
      setOrders(acc.slice());
    }

    // Whole table fit in one page → commit the complete snapshot now.
    if (firstLen < SNAPSHOT_PAGE_SIZE) {
      if (isLatest()) commitSnapshot();
      return;
    }

    // Otherwise backfill pages 2..N in the BACKGROUND so page 1 stays instantly
    // interactive and (on a refresh) the previous completed snapshot stays
    // visible until this loop finishes and commits atomically. A newer cycle
    // invalidates this loop immediately via isLatest(), so stale page loops and
    // stale responses can never append twice or overwrite newer state.
    void (async () => {
      try {
        for (let page = 1; page < ORDERS_MAX_PAGES; page++) {
          if (!isLatest()) return;
          let res;
          try {
            res = await fetchPage(page);
          } catch (pageErr) {
            console.error("[admin-orders] orders backfill page threw:", pageErr);
            if (isLatest()) setOrdersRefreshing(false);
            return;
          }
          if (!isLatest()) return;
          if (res.error) {
            console.error("[admin-orders] orders backfill page failed:", res.error);
            // Keep the previous completed snapshot; never commit a partial one.
            if (isLatest()) setOrdersRefreshing(false);
            return;
          }
          appendChunk((res.data as unknown as Order[]) ?? []);
          if (((res.data as unknown as Order[]) ?? []).length < SNAPSHOT_PAGE_SIZE) break;
        }
        if (isLatest()) commitSnapshot();
      } catch (loopErr) {
        console.error("[admin-orders] orders backfill loop failed:", loopErr);
        if (isLatest()) setOrdersRefreshing(false);
      }
    })();
  }, []);

  // ── NO RECURRING FULL-LIST REFRESH ────────────────────────────────────────
  //
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001 §8/§9. There was a setInterval here
  // that re-walked the ENTIRE orders table every 30 seconds. That is what made
  // the list restart its loading state under the operator, and it got slower
  // with every order the business took.
  //
  // What replaces it, deliberately, is nothing on a timer:
  //   • Realtime postgres_changes already patches individual rows instantly.
  //   • Every mutation calls invalidateOrderAggregates(), which re-runs the
  //     list query and the counts for the CURRENT view only.
  //   • The operator's own Refresh button does a full re-pull on demand.
  //
  // Do not reintroduce a polling loop here — the dataset-stability guard fails
  // the build if a setInterval reappears around the list or the snapshot.

  // ── The whole-table FACTS projection — once, narrow, never polled ─────────
  //
  // Feeds the Orders-tab aggregates that were always whole-table questions
  // (duplicates, No-GHL, requested-provider options, uncovered states, and the
  // Paid-Unassigned total). Read in pages so a growing table can never produce
  // one enormous request.
  //
  // LIVE ADAPTATION — the promoted TEST effect keyed this on `refreshNonce`, a
  // counter that does not exist in this file and whose only writer over there
  // was the Refresh button. LIVE already has ONE authoritative invalidation
  // token for "an aggregate is now stale": `aggregateReloadToken`, bumped by
  // invalidateOrderAggregates() on every mutation and, coalesced, by external
  // realtime change. This projection IS one of those aggregates — totalUnassigned
  // below is computed from it — so it belongs on that token rather than on a
  // second, redundant counter. Keying it here is also what keeps Paid
  // (Unassigned) from going stale after an assignment, which is the exact defect
  // invalidateOrderAggregates was introduced to fix.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const acc: Order[] = [];
      try {
        for (let page = 0; page < ORDERS_MAX_PAGES; page++) {
          if (cancelled) return;
          const from = page * SNAPSHOT_PAGE_SIZE;
          const { data, error } = await supabase
            .from("orders")
            .select(ORDER_FACTS_COLUMNS)
            .order("id", { ascending: false })
            .range(from, from + SNAPSHOT_PAGE_SIZE - 1);
          if (error) throw error;
          const chunk = (data as unknown as Order[]) ?? [];
          acc.push(...chunk);
          if (chunk.length < SNAPSHOT_PAGE_SIZE) break;
        }
        if (cancelled) return;
        setOrderFacts(acc);
        setOrderFactsReady(true);
      } catch (e) {
        console.error("[admin-orders] order facts projection failed:", e);
        // Leave the previous facts in place; the badges keep their last known
        // values rather than flipping to a confident zero.
        if (!cancelled) setOrderFactsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [aggregateReloadToken]);

  // ── The whole-table snapshot loads ON DEMAND ──────────────────────────────
  // Opening Dashboard / Analytics / Communications is what asks for it, once
  // per session. The Orders tab never does.
  useEffect(() => {
    if (!SNAPSHOT_TABS.has(activeTab)) return;
    if (snapshotRequestedRef.current) return;
    snapshotRequestedRef.current = true;
    void loadOrderData();
  }, [activeTab, loadOrderData]);

  // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — a basis change alters the SERVER
  // page order, so re-page once. The already-loaded snapshot re-sorts client-side
  // immediately (no blank list), and the loader's own monotonic sequence guard
  // (loadSeqRef) invalidates any in-flight pages from the previous basis. Skips
  // the first run so mount still loads exactly once.
  // (A basis change no longer re-sweeps anything: the LIST re-queries through
  // listQueryKey, which already carries the basis, and the whole-table snapshot
  // is basis-independent — Dashboard and Analytics do their own aggregation.
  // The old effect here re-walked the entire table on every basis flip.)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshSyncMsg("");
    // The monthly banner is deliberately inert to filters, so an explicit
    // Refresh is the operator's way to re-pull it.
    //
    // Goes through the ONE authoritative invalidation rather than bumping the
    // monthly token by hand: that re-pulls the monthly banner exactly as before
    // AND re-reads the faceted counts and the whole-table facts projection,
    // which is what the operator means by "Refresh". Bumping only the monthly
    // token would have left the Dupes / No-GHL / Paid-Unassigned figures showing
    // whatever they said before the button was pressed.
    invalidateOrderAggregates();
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
  }, [loadOrderData, supabaseUrl, invalidateOrderAggregates]);

  const handleAssign = useCallback(async (confirmationId: string, doctorEmail: string | null) => {
    if (!doctorEmail) return;
    setAssigning(confirmationId);
    const dc = doctorContacts.find((d) => d.email.toLowerCase() === doctorEmail.toLowerCase());
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAdminToken()}` },
        body: JSON.stringify({ confirmationId, doctorEmail }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; doctorName?: string };
      if (result.ok) {
        mutateOrders((prev) => prev.map((o) => o.confirmation_id === confirmationId
          ? { ...o, doctor_name: result.doctorName ?? dc?.full_name ?? null, doctor_email: doctorEmail, doctor_status: "pending_review" }
          : o));
        setAssignMsg((prev) => ({ ...prev, [confirmationId]: "Assigned & notified" }));
        // The row patch above is optimistic and deterministic (we know the new
        // assignment); this reconciles Paid (Unassigned) / Under Review and the
        // status-tab counts against the server WITHOUT a manual refresh.
        invalidateOrderAggregates();
        setTimeout(() => setAssignMsg((prev) => { const n = { ...prev }; delete n[confirmationId]; return n; }), 3000);
      } else {
        setAssignMsg((prev) => ({ ...prev, [confirmationId]: result.error ?? "Failed" }));
      }
    } catch {
      setAssignMsg((prev) => ({ ...prev, [confirmationId]: "Network error" }));
    }
    setAssigning(null);
  }, [supabaseUrl, doctorContacts, invalidateOrderAggregates]);

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
        mutateOrders((prev) => prev.map((o) =>
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
    mutateOrders((prev) => prev.filter((o) => o.id !== orderId));
    setOrderDetail(null);
    invalidateOrderAggregates();
  }, [invalidateOrderAggregates]);

  const handleOrderUpdated = useCallback((updated: Partial<Order> & { id: string }) => {
    mutateOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
    setOrderDetail((prev) => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
    // This is the single funnel for EVERY OrderDetailModal mutation (approve,
    // needs-correction, mark under review, mark completed/delivered, refund,
    // payment fix). Invalidating here means no individual handler has to
    // remember to, which is how the KPI went stale in the first place.
    if (
      "status" in updated || "doctor_status" in updated || "doctor_email" in updated
      || "doctor_user_id" in updated || "payment_intent_id" in updated
      || "refunded_at" in updated || "refund_status" in updated || "paid_at" in updated
    ) {
      invalidateOrderAggregates();
    }
  }, [invalidateOrderAggregates]);

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

  // ── Fetch PAID standalone Additional-Documentation add-on requests ──────────
  // ORDERS-RA-COMBO-CHIP-FILTER-001. A standalone RA add-on is a paid child row
  // in order_additional_documentation_requests referencing the parent order — it
  // is NEVER a package_key and never a separate order. This set of parent order
  // ids drives the "RA Add-on" chip + filter. Read-only; no PII surfaced.
  useEffect(() => {
    if (!adminProfile) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("order_additional_documentation_requests")
        .select("order_id, status")
        .eq("status", "paid");
      if (!alive || !data) return;
      setRaAddonOrderIds(new Set(data.map((r) => r.order_id as string).filter(Boolean)));
    })();
    return () => { alive = false; };
  }, [adminProfile]);

  // ORDER-ADDITIONAL-PET-FINAL-TEST-CLOSURE-001 §1 — Additional Pet chip source.
  // Selects ONLY (order_id, status, created_at): no amount, no Stripe id, no
  // refund value, so nothing financial can reach the list. Newest row wins when
  // an order has had more than one request over time.
  useEffect(() => {
    if (!adminProfile) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("order_additional_pet_requests")
        .select("order_id, status, created_at")
        .order("created_at", { ascending: true });
      if (!alive || !data) return;
      const m = new Map<string, string>();
      for (const r of data) {
        const oid = r.order_id as string | null;
        if (oid) m.set(oid, r.status as string);
      }
      setAdditionalPetStatusById(m);
    })();
    return () => { alive = false; };
  }, [adminProfile]);

  // ── Open order detail and mark communications as read ─────────────────────
  // For "which order is behind this id" lookups (notification deep links, bell
  // destinations, bulk result reconciliation). The whole-table snapshot when it
  // happens to be loaded, otherwise the rows currently on screen. NEITHER is
  // authoritative: handleDirectLookup is the canonical resolver, and every
  // caller that can miss falls back to it.
  const lookupPool = orders.length > 0 ? orders : orderRows;

  const openOrderDetail = useCallback((order: Order) => {
    const now = Date.now();
    const updated = { ...lastViewedMap, [order.confirmation_id]: now };
    setLastViewedMap(updated);
    try { localStorage.setItem("pw_order_last_viewed", JSON.stringify(updated)); } catch { /* ignore */ }
    setUnreadCommsMap((prev) => ({ ...prev, [order.confirmation_id]: 0 }));
    setOrderDetail(order);
  }, [lastViewedMap]);

  // ── Open an order by PRIMARY KEY, loaded or not ───────────────────────────
  //
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001 §13/§18. Notification and bell
  // destinations resolve an order by exact id. That used to be a guaranteed hit
  // because the whole table sat in the browser; with the list server-paged the
  // order is usually NOT loaded, and the old "fall back to the Orders tab" path
  // would have become the normal outcome — a deep link that quietly stops
  // opening anything.
  //
  // So a miss now READS THAT ONE ROW instead of giving up. Still resolution by
  // exact primary key, still never a guess, and it opens through the same
  // openOrderDetail controller as every other surface.
  const openOrderById = useCallback(async (
    orderId: string,
    modalTab?: "overview" | "documents" | "comms",
  ) => {
    const local = lookupPool.find((o) => o.id === orderId);
    if (local) {
      if (modalTab) setOrderDetailSection(modalTab);
      openOrderDetail(local);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDERS_LIST_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as Order | null;
      if (!row) { setActiveTab("orders"); return; }
      if (modalTab) setOrderDetailSection(modalTab);
      openOrderDetail(row);
    } catch (e) {
      console.error("[admin-orders] open-by-id lookup failed:", e);
      setActiveTab("orders");
    }
  }, [lookupPool, openOrderDetail, setActiveTab]);

  // ── Resolve ONE order from an operator-supplied reference ─────────────────
  //
  // COMMAND-CENTER-OPEN-EXACT-ORDER-001. Command Center's "Open order" hands us
  // either a confirmation id or an orders.id and expects THAT order's modal.
  //
  // LIVE ADAPTATION — the promoted TEST patch called this resolver but never
  // brought it across, which is the `handleDirectLookup is not defined` crash.
  // Rebuilt here against LIVE's own controllers rather than by importing TEST's
  // COS-042 unified-search architecture:
  //
  //   * A UUID is already the orders primary key, so it is delegated to
  //     openOrderById above instead of growing a second implementation of the
  //     same resolution (local-pool hit, else one exact single-row read).
  //   * Anything else is a confirmation id, matched by EXACT equality — never a
  //     prefix, a fragment or a LIKE. Confirmation ids are stored upper-case and
  //     contain no % or _ characters, so upper-casing the input is the whole of
  //     the case-insensitivity and cannot widen the match.
  //   * A miss FAILS CLOSED: no modal, no "nearest" row, no guess. The caller
  //     has already put the operator on the Orders tab, so there is nothing
  //     further to do and nothing misleading left on screen.
  //
  // Deliberately carries NO lookup state. TEST's lookupLoading / lookupError /
  // lookupResults exist to drive a "Search DB" button and a multi-match pick
  // list; LIVE has neither surface and this resolver has exactly one caller, so
  // that state would be unreachable and unrendered.
  const handleDirectLookup = useCallback(async (rawInput: string) => {
    const raw = rawInput.trim();
    if (!raw) return;

    if (UUID_REGEX.test(raw)) {
      await openOrderById(raw);
      return;
    }

    const exact = raw.toUpperCase();
    try {
      const local = lookupPool.find(
        (o) => (o.confirmation_id ?? "").toUpperCase() === exact,
      );
      if (local) { openOrderDetail(local); return; }

      const { data, error } = await supabase
        .from("orders")
        .select(ORDERS_LIST_COLUMNS)
        .eq("confirmation_id", exact)
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as Order | null;
      if (!row) {
        console.warn("[admin-orders] no order matches the requested reference");
        return;
      }
      openOrderDetail(row);
    } catch (e) {
      console.error("[admin-orders] direct lookup failed:", e);
    }
  }, [lookupPool, openOrderById, openOrderDetail]);

  // ── COMMAND-CENTER-OPEN-EXACT-ORDER-001 — durable ?order= deep link ────────
  //
  // Routes the parameter through handleDirectLookup so there is exactly one
  // order-opening implementation and one "not found" path. It never guesses.
  //
  // `resolvedOrderParamRef` makes this fire once per distinct value, so a
  // re-render (or a poll) cannot reopen a modal the operator just closed, while
  // back/forward to a DIFFERENT order still works.
  const resolvedOrderParamRef = useRef<string | null>(null);
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get("order");
    if (!ref) { resolvedOrderParamRef.current = null; return; }
    if (resolvedOrderParamRef.current === ref) return;
    resolvedOrderParamRef.current = ref;
    setActiveTabState("orders");
    void handleDirectLookup(ref);
  }, [location.search, handleDirectLookup]);

  // Closing the modal drops ?order= so the link is not "sticky" — otherwise the
  // next render would immediately reopen what was just dismissed.
  const clearOrderParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("order")) return;
    params.delete("order");
    resolvedOrderParamRef.current = null;
    const qs = params.toString();
    navigate(`/admin-orders${qs ? `?${qs}` : ""}`, { replace: true });
  }, [location.search, navigate]);

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
      supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, state_license_numbers, role, portal_first_accessed_at").order("full_name"),
    ]).then(([contactsRes, profilesRes]) => {
      if (contactsRes.data) setDoctorContacts(contactsRes.data as DoctorContact[]);
      if (profilesRes.data) setDoctorProfiles(profilesRes.data as DoctorProfile[]);
    }).catch(() => {/* silent — stale data is still usable */});
  }, [activeTab]);

  const handleDoctorCreated = (result: { full_name: string; email: string }) => {
    setShowCreateModal(false);
    setCreateSuccessMsg(`${result.full_name} (${result.email}) — provider added to the panel successfully.`);
    setTimeout(() => setCreateSuccessMsg(""), 7000);
    supabase.from("doctor_profiles").select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, state_license_numbers, portal_first_accessed_at").order("full_name")
      .then(({ data }) => { if (data) setDoctorProfiles(data as DoctorProfile[]); });
    supabase.from("doctor_contacts").select("id, full_name, email, phone, licensed_states, is_active").order("full_name")
      .then(({ data }) => { if (data) setDoctorContacts(data as DoctorContact[]); });
  };

  const handleBulkAssign = useCallback(async () => {
    if (!bulkDoctorEmail || selectedOrders.size === 0) return;
    setBulkAssigning(true);
    setShowBulkConfirm(false);
    setBulkMsg("");
    // Only assign orders that are paid, not refunded/cancelled, and not completed
    // (active partial Refund Only stays assignable — see orderClassification).
    const assignableIds = Array.from(selectedOrders).filter((cid) => {
      const o = lookupPool.find((x) => x.confirmation_id === cid);
      return o ? isAssignable(o) : false;
    });
    const skippedCount = selectedOrders.size - assignableIds.length;
    let successCount = 0;
    let failCount = 0;
    await Promise.all(
      assignableIds.map(async (confirmationId) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAdminToken()}` },
            body: JSON.stringify({ confirmationId, doctorEmail: bulkDoctorEmail }),
          });
          const result = await res.json() as { ok?: boolean; doctorName?: string };
          if (result.ok) {
            successCount++;
            const dc = doctorContacts.find((d) => d.email.toLowerCase() === bulkDoctorEmail.toLowerCase());
            mutateOrders((prev) => prev.map((o) =>
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
  }, [bulkDoctorEmail, selectedOrders, orders, supabaseUrl, doctorContacts]);

  // ── Bulk delete handler (owner/admin_manager only) ───────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (selectedOrders.size === 0) return;
    setBulkDeleting(true);
    setBulkDeleteMsg("");
    const ids = Array.from(selectedOrders);
    let successCount = 0;
    let failCount = 0;

    for (const confirmationId of ids) {
      const o = lookupPool.find((x) => x.confirmation_id === confirmationId);
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

    mutateOrders((prev) => prev.filter((o) => !selectedOrders.has(o.confirmation_id)));
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
    mutateOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, followup_opt_out: newVal, seq_opted_out_at: newVal ? new Date().toISOString() : null } : o));
  }, [supabaseUrl]);

  // ── Bulk stop sequence for selected unpaid leads ─────────────────────────
  const handleBulkStopSequence = useCallback(async () => {
    setBulkStoppingSequence(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    // Only opt-out leads that are unpaid and not already opted out
    const eligibleOrders = orderRows.filter((o) =>
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
    mutateOrders((prev) =>
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
    const targets = orderRows.filter((o) => selectedOrders.has(o.confirmation_id));
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
          mutateOrders((prev) => prev.map((o) =>
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

  const selectedProviders = Array.from(new Set(orderFacts.map((o) => o.selected_provider).filter(Boolean))) as string[];

  // ── Duplicate email + phone detection (must be before `filtered`) ─────────
  const duplicateEmailSet = useMemo(() => {
    const counts: Record<string, number> = {};
    orderFacts.forEach((o) => {
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
    orderFacts.forEach((o) => {
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
    return orderFacts.filter(
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

  const orderMatchesFilters = useCallback((o: Order): boolean => {
    let matchStatus = true;
    if (statusFilter === "all") {
      matchStatus = true;
    } else if (statusFilter === "lead_unpaid") {
      matchStatus = !o.payment_intent_id || o.status === "lead";
    } else if (statusFilter === "paid_unassigned") {
      matchStatus = isPaidUnassigned(o);
    } else if (statusFilter === "under_review") {
      matchStatus = isUnderReview(o);
    } else if (statusFilter === "pending_delivery") {
      // Must be explicit. The `else` fallback below compares statusFilter to
      // o.status / o.doctor_status, and the row-level value is
      // "pending_admin_approval" — so a Pending Delivery tab that fell through
      // would silently match ZERO orders.
      matchStatus = isPendingDelivery(o);
    } else if (statusFilter === "completed") {
      matchStatus = o.doctor_status === "patient_notified";
    } else if (statusFilter === "refunded") {
      matchStatus = isRefundedBucket(o);
    } else if (statusFilter === "disputed") {
      matchStatus = o.status === "disputed" || !!o.dispute_id;
    } else if (statusFilter === "cancelled") {
      matchStatus = isCancelled(o);
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
    // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — the From/To bounds apply to the
    // ACTIVE date basis, never silently to created_at while the list is sorted by
    // activity. Same helper the server facet counts mirror, so rows and card
    // counts always measure the same date.
    // ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001 §10 — the
    // EFFECTIVE window. With a KPI card active this is that card's stage-entry
    // basis over the active New York range: the same (basis, from, to) triple
    // the card counted with, so the rows shown are exactly the rows counted.
    const matchDateBasis = matchesBasisDateRange(o, effDateBasis, effDateFrom, effDateTo);
    const matchDuplicates = !showDuplicatesOnly || duplicateContactSet.has(o.email.toLowerCase()) || (!!o.phone && duplicateContactSet.has(o.phone.replace(/\D/g, "")));
    const matchNonGhl = !showNonGhlOnly || !o.ghl_synced_at;
    let matchSource = true;
    if (sourceFilter) {
      // Phase K3 — single normalized classifier owns Order filtering AND
      // the AdminDashboard aggregation AND the OrderCard pill, so all
      // three surfaces always agree. Legacy filter aliases ("Facebook",
      // "Google", "Facebook / Instagram") still match — kept for any
      // dashboard handoff (setActiveTab + sourceFilter) using older
      // string values.
      const label = classifyOrder(o).label;
      if (sourceFilter === "Facebook") {
        matchSource = label === "Facebook Paid" || label === "Facebook Organic" || label === "Instagram";
      } else if (sourceFilter === "Facebook / Instagram") {
        matchSource = label === "Facebook Paid" || label === "Facebook Organic" || label === "Instagram";
      } else if (sourceFilter === "Google") {
        matchSource = label === "Google Ads" || label === "Google Organic";
      } else {
        matchSource = label === sourceFilter;
      }
    }
    // Package / RA filter (ORDERS-RA-COMBO-CHIP-FILTER-001). Classified from
    // explicit saved identity fields + the paid standalone add-on overlay —
    // never price. Unknown records never leak into the ESA/PSD filters.
    const matchPackage = packageFilter === "all" ||
      matchesPackageFilter(
        classifyOrderPackage(o, { hasPaidStandaloneAddon: raAddonOrderIds.has(o.id) }),
        packageFilter,
      );
    // The DEBOUNCED term — the same one the server page was fetched with. Using
    // the raw input here would hide rows the current page legitimately holds
    // while the operator is still typing.
    const q = debouncedSearch.toLowerCase();
    const matchSearch = !q ||
      o.confirmation_id.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      `${o.first_name ?? ""} ${o.last_name ?? ""}`.toLowerCase().includes(q) ||
      (o.state ?? "").toLowerCase().includes(q) ||
      (o.doctor_name ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").includes(q) ||
      (o.ghl_contact_id ?? "").toLowerCase().includes(q);
    return matchStatus && matchState && matchDoctor && matchSelectedProvider && matchPayment && matchRef && matchSequence && matchDateBasis && matchSearch && matchDuplicates && matchNonGhl && matchSource && matchPackage;
  }, [
    statusFilter,
    stateFilterAdv,
    doctorFilter,
    selectedProviderFilter,
    paymentFilter,
    referredByFilter,
    sequenceFilter,
    // §10 — the EFFECTIVE window (KPI card basis+range when a card is active),
    // not the raw operator state, so the rows always match the card count.
    effDateBasis,
    effDateFrom,
    effDateTo,
    showDuplicatesOnly,
    showNonGhlOnly,
    sourceFilter,
    packageFilter,
    raAddonOrderIds,
    debouncedSearch,
    duplicateContactSet,
  ]);

  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001 — the rows are the SERVER page.
  //
  // `orderMatchesFilters` still runs over them, unchanged and deliberately so:
  // for every filter the server can express, the two agree exactly and this
  // removes nothing (it is a free consistency check between the SQL predicate
  // and the TypeScript one). For the three the server cannot express — traffic
  // source, package and duplicates — it is what actually applies them, exactly
  // as it always did.
  const filtered = orderRows.filter(orderMatchesFilters).filter((o) => {
    if (!hideRecentFollowup) return true;
    if (!o.sent_followup_at) return true;
    const age = Date.now() - new Date(o.sent_followup_at).getTime();
    return age > 7 * 24 * 60 * 60 * 1000;
  // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — the DISPLAY sort. Uses the same
  // canonical comparator as the server page ordering, so flipping the basis
  // re-orders instantly without waiting for the refetch. `desc` is newest-first
  // on the ACTIVE basis.
  // ...-LIFECYCLE-DATE-INTEGRITY-002 — the ACTIVE basis is the EFFECTIVE one. A
  // list selected on `last_completed_at` but sorted on `created_at` emits one day
  // ribbon per row and dates every group by the wrong event.
  }).sort((a, b) => {
    const cmp = orderComparator(effDateBasis)(a, b);
    return sortOrder === "desc" ? cmp : -cmp;
  });

  // CSV export of the FULL matching set (re-queries beyond the loaded list).
  const exportFilteredAll = useCallback(async () => {
    setExporting(true);
    setExportMsg("");
    try {
      const all = await fetchAllMatchingOrders();
      const matched = all.filter(orderMatchesFilters).filter((o) => {
        if (!hideRecentFollowup) return true;
        if (!o.sent_followup_at) return true;
        const age = Date.now() - new Date(o.sent_followup_at).getTime();
        return age > 7 * 24 * 60 * 60 * 1000;
      // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 §CSV — the export must be the
      // SAME date universe AND the same order as the visible list. `orderMatchesFilters`
      // is already basis-aware (it calls matchesBasisDateRange with the active
      // dateBasis), so the row SET already matched; only the ORDER differed. The
      // server read stays created_at-ordered (it is just a bounded bulk fetch);
      // the exported ordering is the canonical basis comparator.
      // ...-LIFECYCLE-DATE-INTEGRITY-002 — on the EFFECTIVE basis, so an export
      // taken with a KPI card active is ordered and stamped with the same column
      // the card counted, the rows were selected on and the ribbons grouped by.
      }).sort(orderComparator(effDateBasis));
      // Both overlays are fetched BEFORE any file is written, and both throw on a
      // query error, so a failure cancels the export instead of emitting a CSV
      // with an all-zero provider column or an under-reported add-on column.
      const [providerPayments, addonEntitlements] = await Promise.all([
        fetchProviderPaymentsForExport(matched as unknown as ExportableOrder[]),
        fetchAddonEntitlementsForExport(matched as unknown as ExportableOrder[]),
      ]);
      exportOrdersToCSV(
        matched as unknown as ExportableOrder[],
        `pawtenant-orders-export-filtered-${effDateBasis}`,
        providerPayments,
        addonEntitlements,
        // Stamped into every row so a downstream reader can never mistake which
        // date the export was filtered and ordered on.
        ORDER_DATE_BASIS_LABEL[effDateBasis],
      );
    } catch (e) {
      console.error("[exportFilteredAll] failed", e);
      setExportMsg("Export cancelled — provider earnings or add-on entitlements could not be loaded. Please retry.");
    } finally {
      setExporting(false);
    }
    // `effDateBasis` is load-bearing here: it picks the export ORDER and the
    // stamped Date Basis column. Omitting it would freeze the export on
    // whichever basis was active when this callback was first created.
  }, [orderMatchesFilters, hideRecentFollowup, effDateBasis, fetchAllMatchingOrders]);

  // Export the SELECTED orders (stable confirmation-id selection, full loaded
  // snapshot — never the paginated view) as a rich CSV, enriched with the canonical
  // provider payment per order. Fetches provider earnings first; on failure the
  // export is cancelled rather than emitting a misleading all-zero provider column.
  const exportSelected = useCallback(async () => {
    const selected = orderRows.filter((o) => selectedOrders.has(o.confirmation_id));
    if (selected.length === 0) return;
    setExporting(true);
    setExportMsg("");
    try {
      const [providerPayments, addonEntitlements] = await Promise.all([
        fetchProviderPaymentsForExport(selected as unknown as ExportableOrder[]),
        fetchAddonEntitlementsForExport(selected as unknown as ExportableOrder[]),
      ]);
      exportOrdersToCSV(
        selected as unknown as ExportableOrder[],
        "pawtenant-orders-export-selected",
        providerPayments,
        addonEntitlements,
      );
    } catch (e) {
      console.error("[exportSelected] failed", e);
      setExportMsg("Export cancelled — provider earnings or add-on entitlements could not be loaded. Please retry.");
    } finally {
      setExporting(false);
    }
  }, [orders, selectedOrders]);

  // Meta Custom Audience export — identifiers-only, paid clients.
  // LIVE adaptation: the orders list query loads the full matching set into
  // `orders`, and `filtered` already applies the current admin filters, so we
  // export straight from `filtered` (no extra re-query). exportMetaAudienceToCSV
  // restricts to paid (or paid+refunded) and dedupes by email/phone.
  // Privacy: never includes order/payment/service/attribution fields.
  const exportMetaAudience = useCallback(async (mode: MetaAudienceMode) => {
    setAudienceExporting(true);
    setAudienceMsg("");
    try {
      const all = await fetchAllMatchingOrders();
      const matched = all.filter(orderMatchesFilters);
      const count = exportMetaAudienceToCSV(matched as unknown as MetaAudienceOrder[], mode);
      setAudienceMsg(count > 0 ? `Exported ${count} contact${count === 1 ? "" : "s"}` : "No matching contacts");
      setTimeout(() => setAudienceMsg(""), 6000);
    } catch (e) {
      console.error("[exportMetaAudience] failed", e);
      setAudienceMsg("Export failed — see console");
      setTimeout(() => setAudienceMsg(""), 6000);
    } finally {
      setAudienceExporting(false);
    }
  }, [orderMatchesFilters, fetchAllMatchingOrders]);

  // ── Pagination is SERVER-side ─────────────────────────────────────────────
  // Every loaded row is rendered; there is no client slice any more, because
  // the browser only ever holds the pages it asked for. "More" is a fact about
  // the SERVER (was the last page full?), never about how much of a loaded
  // array is currently being shown.
  const visibleOrders = filtered;
  const hasMore = orderRowsHasMore;

  // Server-authoritative filtered total for the "X of Y" display — reconciles with
  // the faceted KPI counts and never depends on how many rows are loaded. Falls
  // back to the client-side filtered length only when the server count is
  // unavailable: still loading, a client-only filter is active (traffic source /
  // package / duplicates), or hideRecentFollowup narrows the list further.
  const clientOnlyCountActive = facetCounts.blockedClientFilters.length > 0 || hideRecentFollowup;
  // While the 60-day default scope is narrowing the list, the authoritative "Y"
  // is the count of what THAT query matches — not the all-time facet total,
  // which would claim 609 while 120 rows exist to page through. The KPI cards
  // and the status-tab counts stay full-dataset either way (§15).
  const serverFilteredTotal = clientOnlyCountActive
    ? null
    : (defaultScopeActive ? orderRowsTotal : filteredTotalFor(statusFilter, facetCounts));
  const filteredTotalDisplay = serverFilteredTotal ?? filtered.length;

  // ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §15 — the Filters badge counts ONLY
  // filters the operator can see and can clear.
  //
  // It deliberately excludes: the active status tab (its own visible control),
  // the KPI window (display-only, not a filter), pagination, sorting, the
  // default New York month, and every internal query key.
  //
  // The From/To pair now counts as ONE "Date range" rather than two. Previously
  // it counted 2 — and because clicking a month-scoped KPI card SET both halves,
  // the operator saw "Filters (2)" for a range they never chose and could not
  // see. The card click is gone (§B); collapsing the pair to one keeps the badge
  // matching what the Filters panel actually shows as a single control.
  const activeFilterCount = [
    stateFilterAdv !== "all",
    doctorFilter !== "all",
    selectedProviderFilter !== "all",
    paymentFilter !== "all",
    referredByFilter !== "all",
    sequenceFilter !== "all",
    !!dateFrom || !!dateTo,
    showDuplicatesOnly,
  ].filter(Boolean).length;

  // Reset pagination when filters/search change
  // ...-LIFECYCLE-DATE-INTEGRITY-002 — keyed on the EFFECTIVE window, so selecting
  // or clearing a KPI card resets pagination the same way an explicit basis or
  // range change does. Without it a card click could leave page 2+ of the PREVIOUS
  // window's rows on screen under the new window's totals.
  // (No pagination-reset effect: listQueryKey already collapses every one of
  // these inputs, and changing it restarts the server query at page 0.)

  // ── KPI card selection (§8 click, toggle-off, All; §13 URL) ───────────────
  //
  // `activeKpi` is the ONLY state a card writes. Its status tab and its date
  // window are DERIVED from it, so clearing it removes every trace at once —
  // the operator can never be trapped in a selected card, and no invisible
  // date/basis residue survives (the failure mode of the previous contract).
  // Mirrors activeKpi for reads inside the URL-adoption effect below, so that
  // effect can compare without taking activeKpi as a dependency (which would
  // make it fight the writer effect).
  const activeKpiRef = useRef<KpiCardKey | null>(activeKpi);
  useEffect(() => { activeKpiRef.current = activeKpi; }, [activeKpi]);

  const applyKpiSelection = useCallback((key: KpiCardKey | null) => {
    setActiveKpi(key);
    // The card's tab IS its bucket, so the highlighted tab always matches the
    // rows. Deselecting returns to All.
    setStatusFilter(key ?? "all");
  }, []);

  const onKpiCardClick = useCallback((key: KpiCardKey) => {
    // Clicking the ACTIVE card deselects it (§8).
    applyKpiSelection(activeKpi === key ? null : key);
  }, [activeKpi, applyKpiSelection]);

  // A manual status-tab click owns the status outright: it clears the KPI card
  // (and with it the card's imposed window) but PRESERVES an explicitly chosen
  // custom range, which lives in dateFrom/dateTo and was never KPI-owned (§9).
  const onStatusTabClick = useCallback((value: string) => {
    setActiveKpi(null);
    setStatusFilter(value);
  }, []);

  // §13 — the selected card is reflected in the URL so a direct reload and
  // browser back/forward restore the exact same card and list. Written with
  // `replace` for the initial normalisation and `push` for real selections, so
  // Back steps through the operator's own choices.
  const kpiUrlSyncedRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const current = params.get("kpi");
    const want = activeKpi ?? null;
    if (current === want) return;
    if (want) params.set("kpi", want); else params.delete("kpi");
    const qs = params.toString();
    navigate(`/admin-orders${qs ? `?${qs}` : ""}`, { replace: !kpiUrlSyncedRef.current });
    kpiUrlSyncedRef.current = true;
    // location.search is intentionally NOT a dependency: this effect WRITES the
    // url from state. The read direction is the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKpi, navigate]);

  // Read direction: adopt ?kpi= from the URL (direct load, back/forward).
  //
  // Guarded on the ref rather than on state so this effect and the writer above
  // cannot ping-pong: it only acts when the URL genuinely disagrees with the
  // card we are showing. A manually chosen status tab (no ?kpi= at all) is left
  // alone — only a card we were actually displaying gets reset to All.
  useEffect(() => {
    const raw = new URLSearchParams(location.search).get("kpi");
    const next = raw && (KPI_CARD_KEYS as string[]).includes(raw) ? (raw as KpiCardKey) : null;
    if (next === activeKpiRef.current) return;
    activeKpiRef.current = next;
    setActiveKpi(next);
    setStatusFilter(next ?? "all");
  }, [location.search]);

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

  const totalUnassigned = orderFacts.filter(isPaidUnassigned).length;
  const unlinkedStates = Array.from(
    new Set(
      orderFacts
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
    // 2026-04-25: setLoading(false) MUST run in every path. Previously a
    // thrown error (e.g. doctor_profiles 522 during pool saturation) hit the
    // outer catch and redirected to login OR left the shell stuck spinning.
    // Now auth failures bounce, data failures log+continue, and a finally
    // block guarantees the loader drops so every tab can render its own
    // error state instead of the whole page hanging.
    const load = async () => {
      try {
        const sessionRes = await supabase.auth.getSession().catch(() => null);
        if (!sessionRes || sessionRes.error || !sessionRes.data.session) {
          navigate("/admin-login?reason=session_expired");
          return;
        }
        const session = sessionRes.data.session;

        let adminCheck: { ok: boolean; is_admin: boolean; full_name?: string; user_id?: string } = { ok: false, is_admin: false };
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/check-admin-status`, {
            method: "GET",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          adminCheck = await res.json() as typeof adminCheck;
        } catch {
          navigate("/admin-login?reason=session_expired");
          return;
        }
        if (!adminCheck.ok || !adminCheck.is_admin) {
          // Authenticated but not an admin — providers are routed to
          // their own portal; anyone else to the unified sign-in (denied).
          const role = await resolveStaffRole(session.user.id);
          if (role === "provider") { navigate("/provider-portal"); return; }
          navigate("/admin-login?reason=unauthorized");
          return;
        }

        let adminProfileData: DoctorProfile;
        try {
          const { data: prof } = await supabase.from("doctor_profiles")
            .select("id, user_id, full_name, title, email, phone, is_admin, is_active, licensed_states, role, custom_tab_access")
            .eq("user_id", session.user.id).maybeSingle();

          adminProfileData = (prof as DoctorProfile) ?? {
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
        } catch (profErr) {
          console.error("[admin-orders] doctor_profiles self-lookup failed, using minimal profile:", profErr);
          adminProfileData = {
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
        }
        setAdminProfile(adminProfileData);

        try {
          // 2026-06-06 ADMIN-ORDERS-ZERO-ORDERS: await loadOrderData — it now
          // resolves as soon as the PRIMARY orders query completes (provider
          // rosters + note counts run fire-and-forget inside it), so the loader
          // drops with REAL orders in hand and never flashes an empty list.
          // The previous 8s race dropped the loader before orders arrived,
          // which made the Orders tab show "No orders match your filters".
          await loadOrderData();
        } catch (dataErr) {
          console.error("[admin-orders] initial data load failed (shell will still render):", dataErr);
        }
      } catch (bootErr) {
        // Unexpected boot error — log and continue. Do NOT auto-bounce to
        // login here: a redirect loop on a transient upstream fault is worse
        // than a partial shell that lets the user see what's wrong.
        console.error("[admin-orders] boot error (continuing with partial shell):", bootErr);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate, supabaseUrl, loadOrderData]);

  // ── Phase I — legacy comms URL normalizer ───────────────────────────────
  // Old sidebar entries (Comms, Chats, Contacts) are hidden in Phase I but
  // their TabKey + render branches remain so bookmarks and stale internal
  // links don't 404. This effect detects a legacy ?tab= value and rewrites
  // the URL to the equivalent Communications Hub sub-tab. Runs BEFORE the
  // enforce-tab-access effect so legacy URLs never bounce to dashboard.
  //
  // Mapping:
  //   ?tab=chats    → ?tab=communications&sub=chats
  //   ?tab=contacts → ?tab=communications&sub=emails
  //   ?tab=comms    → ?tab=communications&sub=sms
  useEffect(() => {
    const legacyToSub: Partial<Record<TabKey, "chats" | "emails" | "sms">> = {
      chats:    "chats",
      contacts: "emails",
      comms:    "sms",
    };
    const targetSub = legacyToSub[activeTab];
    if (!targetSub) return;
    const params = new URLSearchParams(location.search);
    params.set("tab", "communications");
    params.set("sub", targetSub);
    navigate(`/admin-orders?${params.toString()}`, { replace: true });
    setActiveTabState("communications");
  }, [activeTab, location.search, navigate]);

  // ── Enforce tab access from URL ─────────────────────────────────────────
  // Direct URL access (e.g. /admin-orders?tab=chats) must be blocked if the
  // user's role/custom_tab_access does not include that tab. Dashboard is
  // always allowed as the safe fallback.
  useEffect(() => {
    if (!adminProfile) return;
    const visible = getVisibleTabs(adminProfile.role ?? null, adminProfile.custom_tab_access);
    if (activeTab === "dashboard") return;
    if (!visible.includes(activeTab)) {
      const fallback: TabKey = visible[0] ?? "dashboard";
      const params = new URLSearchParams(location.search);
      if (fallback === "dashboard") params.delete("tab");
      else params.set("tab", fallback);
      const qs = params.toString();
      navigate(`/admin-orders${qs ? `?${qs}` : ""}`, { replace: true });
      setActiveTabState(fallback);
    }
  }, [adminProfile, activeTab, location.search, navigate]);

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
    const isReviewer = canAccessApprovals(adminProfile.role, adminProfile.is_admin);
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
        const o = lookupPool.find((x) => x.confirmation_id === confirmationId);
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
      mutateOrders((prev) => prev.filter((o) => !orderIds.includes(o.confirmation_id)));
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
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAdminToken()}` },
              body: JSON.stringify({ confirmationId, doctorEmail }),
            });
            const result = await res.json() as { ok?: boolean; doctorName?: string };
            if (result.ok) {
              successCount++;
              const dc = doctorContacts.find((d) => d.email.toLowerCase() === doctorEmail.toLowerCase());
              mutateOrders((prev) => prev.map((o) =>
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

  // Synchronous visible-tabs list used for both the sidebar and render-side
  // guarding. Until the admin profile loads we render an EMPTY list — that
  // collapses the sidebar to Dashboard only (always allowed by isTabVisible)
  // so non-admin / restricted users never see a brief flash of tabs they
  // shouldn't have. The auth effect bounces non-admins to /admin-login if
  // their adminProfile resolves to a non-admin role anyway.
  const visibleTabsForRender: TabKey[] = adminProfile
    ? getVisibleTabs(adminProfile.role ?? null, adminProfile.custom_tab_access)
    : [];
  const isTabVisible = (tab: TabKey) => tab === "dashboard" || visibleTabsForRender.includes(tab);

  // Dev-only permission resolution trace. Helps the operator confirm role
  // defaults vs. explicit overrides without sprinkling logs across files.
  // Kept behind import.meta.env.DEV so it never ships in production builds.
  if (import.meta.env.DEV && adminProfile) {
    // eslint-disable-next-line no-console
    console.debug("[admin-perms]", {
      user_id: adminProfile.user_id,
      email: adminProfile.email,
      role: adminProfile.role,
      raw_custom_tab_access: adminProfile.custom_tab_access,
      effective_top_level_tabs: visibleTabsForRender,
    });
  }

  // ── Protected-route auth gate (no admin-UI flash) ───────────────────────────
  // adminProfile is set ONLY after the auth effect confirms an authorized admin
  // (the effect bounces no-session → /admin-login?reason=session_expired,
  // providers → /provider-portal, and non-admins → ?reason=unauthorized). Until
  // then we render a NEUTRAL shell only — never the admin navbar/sidebar/orders
  // UI — so opening /admin-orders logged-out (or as a provider/customer) shows a
  // plain "Checking workspace access…" screen and redirects, with no flash of
  // protected admin content on direct load, refresh, or browser back.
  if (!adminProfile) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5]"></i>
          <p className="text-sm font-semibold text-slate-500">Checking workspace access…</p>
        </div>
      </div>
    );
  }

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
        {/* Left cluster: logo + team presence. Presence is left-aligned by
            request, kept beside the logo and away from the right-hand action
            controls (notifications / refresh / profile). */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/" className="cursor-pointer flex-shrink-0">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
              alt="PawTenant" className="h-8 sm:h-10 w-auto object-contain" />
          </Link>
          <EmployeePresenceBar />
          {/* ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §7 — the shared business clock.
              This navbar is the Admin Portal's ONE top header (Orders, Accounts,
              Analytics and Communications are tabs of this page), so mounting it
              here puts it on every admin surface at once. Kept in the LEFT
              cluster so it never crowds notifications / Refresh / profile. */}
          <BusinessClock />
        </div>

        {/* Right cluster: notifications · refresh · profile. The blue "Synced
            X ago" chip was removed — the 30s background refresh + realtime
            subscriptions still run silently. Name/role live in the profile
            dropdown header; Manager Approvals moved to Team tab → Manager Tools. */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Grouped notification bell — communications / orders / bookings /
              approvals (incl. HR requests). Supersedes the old flat
              NotificationsBell + HrRequestsBell pair. */}
          <CompanyNotificationsBell
            onNavigate={(tab) => setActiveTab(tab as TabKey)}
            onOrdersFilter={(filter) => { setStatusFilter(filter); setActiveTab("orders"); }}
            onOpenApprovals={() => setShowApprovalsInbox(true)}
            // Open the ONE order on the right tab instead of switching to a
            // filtered list. Resolution is by exact primary key, so there is no
            // ambiguity to guess at. The current Orders filters/search are left
            // untouched: this sets the modal only, never the list state.
            onOpenOrder={(orderId, modalTab) => {
              // Resolution is by exact primary key, and a row that is not in the
              // current page is READ rather than given up on (§13/§18). The
              // Orders filters/search are left untouched: this sets the modal
              // only, never the list state.
              void openOrderById(orderId, modalTab);
            }}
            // ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-...-001 — deep-link to ONE
            // inbound customer email. The destination is Communications →
            // Emails, which mounts ContactRequestsTab: the legacy standalone
            // "Contacts" tab no longer renders in the sidebar for most roles,
            // so ?tab=contacts was being normalised away and the click landed
            // on Command Center. URL FIRST, then the tab state: mounting the
            // hub before the link has landed lets its mount-time URL normalizer
            // replace the whole deep link.
            onOpenContactSubmission={(submissionId) => {
              const params = new URLSearchParams(location.search);
              params.set("tab", "communications");
              params.set("sub", "emails");
              params.set("submission", submissionId);
              navigate(`/admin-orders?${params.toString()}`, { replace: false });
              setActiveTabState("communications");
            }}
            // COMMAND-CENTER-NOTIFICATION-ROUTING-001 — SMS and call rows deep
            // link to the Command Center thread that owns this communication.
            // Same URL-FIRST ordering as the email arm above: the hub's
            // mount-time "normalize missing ?sub=" effect would otherwise fire
            // against the pre-navigation URL and drop the selection.
            onOpenConversation={(communicationId) => {
              if (!communicationId) return false;
              const params = new URLSearchParams(location.search);
              params.set("tab", "communications");
              params.set("sub", "inbox");
              params.delete("view");
              params.delete("thread");
              params.set("comm", communicationId);
              navigate(`/admin-orders?${params.toString()}`, { replace: false });
              setActiveTabState("communications");
              return true;
            }}
            onOpenCommandCenter={() => {
              const params = new URLSearchParams(location.search);
              params.set("tab", "communications");
              params.set("sub", "inbox");
              params.delete("view");
              params.delete("thread");
              params.delete("comm");
              navigate(`/admin-orders?${params.toString()}`, { replace: false });
              setActiveTabState("communications");
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

          {/* Broadcast now lives in the Communications tab.
              Password + Sign Out moved into the profile dropdown (AdminProfileMenu). */}

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

          <AdminProfileMenu
            name={adminProfile?.full_name ?? adminProfile?.email ?? "Admin"}
            role={adminProfile?.role ?? null}
            onChangePassword={() => setShowChangePassword(true)}
            onSignOut={async () => { await supabase.auth.signOut(); navigate("/admin-login"); }}
          />
        </div>
      </nav>

      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        visibleTabs={visibleTabsForRender}
        totalUnassigned={totalUnassigned}
        unreadCommsCount={unreadCommsCount}
        unreadContactsCount={unreadContactsCount}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
      />
      <div className={`${sidebarCollapsed ? "lg:ml-[52px]" : "lg:ml-[188px]"} px-3 sm:px-4 md:px-6 py-5 sm:py-8 pb-24 lg:pb-8 transition-[margin] duration-200`}>
        {/* Header */}
        <div className="mb-5">
          <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-1">Admin Portal</p>
          <h1 className="text-xl font-extrabold text-slate-900 capitalize">
            {activeTab === "dashboard" ? "Dashboard" :
             activeTab === "orders" ? "Orders" :
             activeTab === "analytics" ? "Analytics" :
             activeTab === "communications" ? "Communications" :
             activeTab === "comms" ? "Communications" :
             activeTab === "chats" ? "Chats" :
             activeTab === "contacts" ? "Contacts" :
             activeTab === "customers" ? "Customers" :
             activeTab === "doctors" ? "Providers" :
             activeTab === "earnings" ? "Earnings" :
             activeTab === "payments" ? "Payments" :
             activeTab === "team" ? "Team" :
             activeTab === "attendance" ? "Attendance" :
             activeTab === "shifts" ? "Shifts" :
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
              // AnalyticsTab is a frozen mega-file with its own local Order
              // shape; the callback param is typed as AnalyticsTab's local
              // Order. Cast to the canonical ./types Order at the boundary
              // — same runtime row, just a structural-compat shim.
              openOrderDetail(order as unknown as Order);
              setActiveTab("orders");
            }}
          />
        )}

        {/* ── COMMUNICATIONS HUB ──────────────────────────────────────
             Phase A — umbrella surface with sub-tabs.
             Phase B — Live Visitors functional.
             Phase C — Chats sub-tab mounts existing ChatsTab.
             Phase D — Emails sub-tab mounts existing ContactRequestsTab.
             Phase E — SMS / Calls sub-tab mounts existing CommunicationsPanel
                       (orders + onViewOrder piped through). Old Comms / Chats
                       / Contacts sidebar entries all remain intact. */}
        {activeTab === "communications" && (
          <CommunicationsHub
            orders={orders}
            onViewOrder={(order) => {
              openOrderDetail(order);
              setActiveTab("orders");
            }}
            customTabAccess={adminProfile?.custom_tab_access ?? null}
          />
        )}

        {/* ── LEGACY COMMUNICATIONS TAB ── */}
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
              <>
              {/* ── OPERATIONS OVERVIEW banner ────────────────────────────────
                  ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001.
                  Five CLICKABLE operational cards; each is a current-state queue
                  windowed on its own stage-entry date. Clicking one selects its
                  status tab and applies exactly the window it counted, so the
                  list total always equals the number on the card. */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1.5 px-0.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Operations overview</span>
                {/* ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001 §3 — the period
                    applies to COMPLETED ONLY. The four queue cards are current
                    workload across every date. Naming the period unqualified
                    made a date-gated queue reading 0 indistinguishable from an
                    empty desk, which is exactly what was reported. */}
                <span className="text-[11px] font-semibold text-gray-500">
                  {/* Worded WITHOUT a "(" straight after the word: the runtime
                      -identifier guard reads `queues (` as a call to an
                      undeclared `queues()` and fails the build. That guard
                      exists because a real undeclared identifier crashed direct
                      lookup, so the copy bends, not the guard. */}
                  · queues — Paid, Under Review, Pending Delivery: now, all dates
                </span>
                <span className="text-[11px] font-semibold text-gray-500">
                  · Lead + Completed: {kpiRangeExplicit
                    ? `${dateFrom || "start"} → ${dateTo || "today"}`
                    : `${kpiMonth.from} – ${kpiMonth.toInclusive}`}
                </span>
                <span className="text-[10px] font-semibold text-gray-400">· America/New_York</span>
                {/* A refresh in flight over EXISTING numbers: the values below
                    stay put (never flash to zero or "—"); this is the only
                    signal that a newer window is loading. */}
                {kpiCountsLoading && kpiCounts && (
                  <span className="text-[10px] font-semibold text-gray-400 animate-pulse">· updating…</span>
                )}
                <i
                  className="ri-information-line text-gray-300 hover:text-gray-400 text-sm cursor-help"
                  tabIndex={0}
                  role="img"
                  aria-label="Paid (Unassigned), Under Review and Pending Delivery are WORK QUEUES: they count every order in that queue right now, across all dates, so an order that entered the queue in an earlier month still counts while it is unresolved. The date range does not apply to them. Lead (Unpaid) and Completed are PERIOD counts scoped to the selected business period in America/New_York, each on its own timestamp: Lead counts unpaid leads CREATED in the period, Completed counts orders COMPLETED in it. With no date filter that period is the current New York calendar month. Click a card to filter the list to exactly those orders — the list total always equals the number on the card. Click the same card again, or click All, to clear it."
                  title="Queues (Paid Unassigned, Under Review, Pending Delivery) = what is in them NOW, all dates. Lead = unpaid leads created in the selected period; Completed = completed in it (America/New_York). Click a card to see exactly those orders — the list total equals the card."
                ></i>
              </div>
              {/* EXACTLY five permanent workflow cards — Lead (Unpaid), Paid
                  (Unassigned), Under Review, Pending Delivery, Completed. 1 col
                  on phones, 2 on small tablets, 5 from lg up so nothing is ever
                  clipped. Values are server-authoritative COUNT queries — never
                  derived from the browser's loaded rows.

                  COUNT-TO-LIST PARITY IS STRUCTURAL: fetchKpiCardCounts() builds
                  each count with the SAME applyNonStatusFilters/applyBucket pair
                  that produces the list total, and clicking a card applies that
                  card's own basis + the active window. The two cannot drift. */}
              <div className="bg-white rounded-xl border border-slate-200 mb-4 divide-y divide-slate-100 sm:divide-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:divide-x sm:divide-slate-100 overflow-hidden">
                {[
                  { key: "lead_unpaid" as KpiCardKey, icon: "ri-user-follow-line", color: "text-amber-600" },
                  { key: "paid_unassigned" as KpiCardKey, icon: "ri-user-unfollow-line", color: "text-sky-600" },
                  { key: "under_review" as KpiCardKey, icon: "ri-time-line", color: "text-violet-600" },
                  { key: "pending_delivery" as KpiCardKey, icon: "ri-inbox-unarchive-line", color: "text-teal-600" },
                  { key: "completed" as KpiCardKey, icon: "ri-checkbox-circle-line", color: "text-emerald-600" },
                  // The permanent banner is EXACTLY these five workflow queues.
                  // "Payment Failed" is a PAYMENT state, not a workflow state; it
                  // survives as a status-filter tab. Do not re-add it, nor cards
                  // for Reopened / Refunded / Cancelled / Disputed.
                ].map((s) => {
                  const label = KPI_CARD_LABEL[s.key];
                  const value = kpiCounts?.counts[s.key] ?? null;
                  const active = activeKpi === s.key;
                  // The skeleton is FIRST LOAD only. Once real numbers exist they
                  // stay on screen while a new window loads (the heading shows
                  // "updating…"), so selecting a card, hitting Refresh or a 30s
                  // background poll can never blank the banner.
                  const firstLoad = kpiCountsLoading && kpiCounts == null;
                  return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onKpiCardClick(s.key)}
                    title={active
                      ? `Showing ${label} — click again to clear`
                      : `Show the ${label} orders counted here`}
                    className={`flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors w-full ${active ? "bg-[#e8f0f9]" : "hover:bg-slate-50"}`}
                  >
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${active ? "bg-[#3b6ea5]/10" : "bg-slate-100"}`}>
                      <i className={`${s.icon} ${s.color} text-sm`} aria-hidden="true"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-500 font-medium leading-none truncate">
                        {label}
                        {active && <span className="text-[#3b6ea5] font-bold"> · selected</span>}
                      </p>
                      {firstLoad ? (
                        <span className="mt-1 block h-5 w-10 rounded bg-slate-200 animate-pulse" aria-label={`${label} loading`}></span>
                      ) : (
                        // "—" means the count genuinely failed or is unavailable
                        // for the active client-only filter — never a fabricated 0.
                        <p className={`text-xl font-extrabold leading-tight ${s.color}`}>{value == null ? "—" : value}</p>
                      )}
                    </div>
                  </button>
                  );
                })}
              </div>
              {/* §15 — with a card active, state the FULL result across every
                  date group. Today is only one group inside the window, so the
                  operator must not compare the card to the Today ribbon alone. */}
              {activeKpi && (
                <div className="mb-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 flex items-center justify-center bg-[#3b6ea5]/10 rounded-lg flex-shrink-0">
                    <i className="ri-filter-line text-[#3b6ea5] text-sm" aria-hidden="true"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#3b6ea5]">
                      {kpiCounts?.counts[activeKpi] == null ? "—" : kpiCounts.counts[activeKpi]}
                      {" "}{KPI_CARD_LABEL[activeKpi]} order
                      {/* ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001 §3 — the copy is
                          derived from the card KIND, so it cannot claim a period
                          the rows were not filtered by. A work queue is current
                          inventory across every date; only Completed is scoped to
                          the selected business period. The old text labelled BOTH
                          as "in <month>", which is precisely how a queue card
                          reading 0 looked like an empty desk instead of a
                          date-gated one. */}
                      {kpiCounts?.counts[activeKpi] === 1 ? "" : "s"}{" "}
                      {activeKpiKind === "operational"
                        ? "in this queue right now — all dates"
                        /* Both EVENT cards are period-scoped, but on different
                           events: Lead counts ARRIVALS (created_at), Completed
                           counts COMPLETIONS (last_completed_at). Naming the
                           wrong verb would describe a window the rows were not
                           actually selected by. */
                        : `${activeKpi === "lead_unpaid" ? "created" : "completed"} in ${kpiRangeExplicit
                            ? `${dateFrom || "start"} – ${dateTo || "today"}`
                            : `${kpiMonth.from} – ${kpiMonth.toInclusive}`}`}
                    </p>
                    {/* ...-LIFECYCLE-DATE-INTEGRITY-002 — name the column the whole
                        view is measured on. The count, the rows, the day ribbons
                        and the CSV all read this one date, so the operator can
                        read a group heading as that event and not guess. */}
                    <p className="text-[10px] text-[#3b6ea5]/70 mt-0.5">
                      {activeKpiKind === "operational"
                        ? <>Current workload — the date range above is not applied, so older unresolved orders stay visible. Sorted and grouped by {effDateBasisLabel} · America/New_York.</>
                        : <>Counted, listed, grouped and exported by {effDateBasisLabel} · America/New_York. Across all date groups below — &ldquo;Today&rdquo; is only one of them.</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyKpiSelection(null)}
                    className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors flex-shrink-0"
                  >
                    <i className="ri-close-line" aria-hidden="true"></i>Clear
                  </button>
                </div>
              )}
              {/* ADMIN-ORDERS-LIFECYCLE-UI-FINAL-CORRECTIONS-001 §2 — the four
                  workflow cards stand alone. NO standalone "Payment Failed"
                  summary chip and no explanatory paragraph beneath them; failed
                  payments remain reachable through the existing "Payment Failed"
                  status-filter tab and Order Details. */}
              </>
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
                  { value: "pending_delivery", label: "Pending Delivery" },
                  { value: "completed", label: "Completed" },
                  { value: "refunded", label: "Refunded" },
                  { value: "disputed", label: "Disputed" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "payment_failed", label: "Payment Failed" },
                ].map((opt) => (
                  // §9 — a manual tab click owns the status: it clears any active KPI card
                  // (and with it the card's imposed date window), while PRESERVING an
                  // explicitly chosen custom range. "All" therefore clears the card, the
                  // KPI status and the KPI month in one action.
                  <button key={opt.value} type="button" onClick={() => onStatusTabClick(opt.value)}
                    className={`whitespace-nowrap flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${statusFilter === opt.value ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:text-[#3b6ea5] hover:bg-gray-50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Package / RA filter pills (ORDERS-RA-COMBO-CHIP-FILTER-001) —
                  classify by explicit saved package identity, never price. */}
              <div className="flex items-center gap-1 px-3 pt-2 pb-2 border-b border-gray-100 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
                <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider pr-1">
                  <i className="ri-price-tag-3-line text-xs"></i>Package
                </span>
                {[
                  { value: "all", label: "All" },
                  { value: "esa", label: "ESA" },
                  { value: "psd", label: "PSD" },
                  { value: "esa_ra", label: "ESA + RA" },
                  { value: "psd_ra", label: "PSD + RA" },
                  { value: "all_ra", label: "All RA" },
                  { value: "ra_addon", label: "RA Add-on" },
                ].map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setPackageFilter(opt.value as PackageFilterKey)}
                    className={`whitespace-nowrap flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${packageFilter === opt.value ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:text-[#3b6ea5] hover:bg-gray-50"}`}
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
                  <button type="button" ref={filtersButtonRef}
                    aria-expanded={showAdvancedFilters}
                    aria-controls="orders-filters-panel"
                    onClick={() => setShowAdvancedFilters((v) => !v)}
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
                    <span className="hidden sm:inline">Dupes</span>{orderFactsReady ? (duplicateCount > 0 ? ` (${duplicateCount})` : "") : " (…)"}
                  </button>
                  {(() => {
                    const nonGhlCount = orderFacts.filter((o) => !o.ghl_synced_at).length;
                    return (
                      <button
                        type="button"
                        onClick={() => setShowNonGhlOnly((v) => !v)}
                        title={`${nonGhlCount} orders not synced to GHL`}
                        className={`whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${showNonGhlOnly ? "bg-amber-600 text-white border-amber-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      >
                        <i className="ri-radar-line"></i>
                        <span className="hidden sm:inline">No GHL</span>{orderFactsReady ? (nonGhlCount > 0 ? ` (${nonGhlCount})` : "") : " (…)"}
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
                  {orderFacts.filter((o) => !isLegacyOrder(o) && (!o.payment_intent_id || o.status === "lead") && o.sent_followup_at && Date.now() - new Date(o.sent_followup_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length} leads received follow-up in last 7d
                </span>
              </div>
            )}

            {/* ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001 — the
                external "Sequence Stage" chip strip stood HERE. It is gone, not
                moved: its counts were computed from the loaded rows, so they
                could not survive server-backed paging. The one counted Sequence
                Status group now lives inside the Filters panel below. */}

            {/* ── Advanced filters ── */}
            {showAdvancedFilters && (
              <div id="orders-filters-panel" ref={filtersPanelRef} role="group" aria-label="Order filters and exports"
                className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-4">
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
                  {/* Phase K3 — Traffic Source dropdown now drives the
                       normalized sourceFilter against classifyOrder().label.
                       The legacy referredByFilter state remains for any
                       internal callers (CSV export, future analytics) but
                       is no longer surfaced in this dropdown. */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Traffic Source</label>
                    <div className="relative">
                      <select
                        value={sourceFilter ?? "all"}
                        onChange={(e) => setSourceFilter(e.target.value === "all" ? null : e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer"
                      >
                        <option value="all">All Sources</option>
                        {ACQUISITION_LABELS.map((label) => (
                          <option key={label} value={label}>{label}</option>
                        ))}
                      </select>
                      <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                    </div>
                  </div>
                  {/* ── Sequence Status — ONE counted chip group, inside Filters ──
                      ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001.

                      This replaces TWO controls that were both bound to
                      `sequenceFilter`: an external "Sequence Stage" strip whose
                      counts were `orders.filter(...)` over the loaded page, and a
                      count-less <select> here. Once the list became server-paged
                      the strip's numbers described ~100 rows while claiming to
                      describe the dataset — the exact "small confident wrong
                      number" this codebase refuses elsewhere.

                      The counts now come from `fetchSequenceFacetCounts`, which
                      reuses `applySequenceFilter` — the same predicate that
                      SELECTS the rows. Faceted semantics: every other active
                      filter applies, the sequence selection itself does not, so
                      picking one chip never zeroes the other five.

                      Spans the grid because six labelled+counted chips are wider
                      than a one-column select; `flex-wrap` keeps it responsive. */}
                  <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-7">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                      Sequence Status
                      <span title="Filter leads by their follow-up sequence stage. Only applies to unpaid leads. Counts are server-side across every matching lead, and honour the other filters above." className="cursor-help">
                        <i className="ri-information-line text-gray-400 text-xs"></i>
                      </span>
                      {sequenceFilter !== "all" && (
                        <button
                          type="button"
                          onClick={() => setSequenceFilter("all")}
                          className="whitespace-nowrap ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:text-[#3b6ea5] text-[11px] font-bold cursor-pointer transition-colors"
                        >
                          <i className="ri-close-line"></i>
                          {SEQUENCE_FACET_LABEL[sequenceFilter as keyof typeof SEQUENCE_FACET_LABEL] ?? sequenceFilter}
                        </button>
                      )}
                    </label>
                    <div
                      className="flex items-center gap-2 flex-wrap"
                      role="group"
                      aria-label="Sequence status filter"
                    >
                      {SEQUENCE_FACET_KEYS.map((key) => {
                        const count = sequenceFacetCounts.counts[key];
                        const selected = sequenceFilter === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSequenceFilter(key)}
                            aria-pressed={selected}
                            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                              selected
                                ? "bg-[#3b6ea5] text-white border-[#1a5c4f]"
                                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                            }`}
                          >
                            {SEQUENCE_FACET_LABEL[key]}
                            <span
                              title={count === null ? "Count unavailable for this filter combination" : undefined}
                              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold ${
                                selected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {count === null ? "—" : count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Never a silently-incomplete number: when the server cannot
                        represent an active client-only condition the chips show
                        "—" and say why. */}
                    {sequenceFacetCounts.blockedClientFilters.length > 0 ? (
                      <p className="mt-1.5 text-[10px] font-semibold text-amber-700">
                        Lead counts unavailable while the {sequenceFacetCounts.blockedClientFilters.join(" + ")} filter
                        {sequenceFacetCounts.blockedClientFilters.length > 1 ? "s are" : " is"} active — {sequenceFacetCounts.blockedClientFilters.length > 1 ? "they" : "it"} can&apos;t be applied server-side yet. Filtering still works.
                      </p>
                    ) : sequenceFacetCounts.error ? (
                      <p className="mt-1.5 text-[10px] font-semibold text-amber-700">
                        Lead counts could not be loaded. Filtering still works.
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-gray-400">
                        Counted across every matching unpaid lead, server-side — not just the rows on screen. Independent of the status tab above.
                      </p>
                    )}
                  </div>
                  {/* ── Date Basis — ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001.
                      Moved OUT of its standalone row above the list and INTO
                      Filters, directly above the From/To range it governs: the
                      basis is what those two dates MEAN, so separating them made
                      the range ambiguous. Spans the full grid width because it is
                      a lens over every other filter, not a peer of them.
                      Drives the LIST ONLY — never the monthly banner. */}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                      Date Basis
                      <span
                        title={`Sorting, day groups and the From/To range all use ${ORDER_DATE_BASIS_LABEL[dateBasis]} — ${ORDER_DATE_BASIS_HINT[dateBasis]}. The monthly cards above are unaffected.`}
                        className="cursor-help"
                      >
                        <i className="ri-information-line text-gray-400 text-xs"></i>
                      </span>
                    </label>
                    <div
                      className="inline-flex flex-wrap bg-gray-100 rounded-lg p-0.5 gap-0.5"
                      role="group"
                      aria-label={`Date basis: ${ORDER_DATE_BASIS_LABEL[dateBasis]}. Sorting, day groups and the From/To range all use it. ${ORDER_DATE_BASIS_HINT[dateBasis]}`}
                    >
                      {ORDER_DATE_BASES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setDateBasis(b)}
                          aria-pressed={dateBasis === b}
                          title={ORDER_DATE_BASIS_HINT[b]}
                          className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                            dateBasis === b
                              ? "bg-white text-[#1a5c4f] shadow-sm"
                              : "text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          {ORDER_DATE_BASIS_LABEL[b]}
                        </button>
                      ))}
                    </div>
                    {/* ...-LIFECYCLE-DATE-INTEGRITY-002 — a selected KPI card windows
                        the list on ITS OWN stage-entry column. Say so, rather than
                        leaving this control claiming a basis the list is not using;
                        the operator's choice is kept and resumes when the card is
                        cleared. */}
                    {activeKpi && effDateBasis !== dateBasis ? (
                      <p className="mt-1.5 text-[10px] font-semibold text-[#3b6ea5]">
                        The {KPI_CARD_LABEL[activeKpi]} card is active — the list, day groups and export
                        currently use {effDateBasisLabel}. Clear the card to return to {ORDER_DATE_BASIS_LABEL[dateBasis]}.
                      </p>
                    ) : null}
                  </div>
                  {/* Date From */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5" title={ORDER_DATE_BASIS_HINT[effDateBasis]}>From — {effDateBasisLabel}</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer" />
                  </div>
                  {/* Date To */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5" title={ORDER_DATE_BASIS_HINT[effDateBasis]}>To — {effDateBasisLabel}</label>
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
                {/* ── EXPORTS ────────────────────────────────────────────
                    ADMIN-ORDERS-CONTROL-CONSOLIDATION-001 §9. Exports live in
                    the same panel as the filters because they obey those
                    filters — but behind a rule and their own heading, because
                    an export WRITES A FILE and a filter does not. They must
                    never read as one more checkbox.

                    §8 — each one pages the COMPLETE matching server-side set
                    (fetchAllMatchingOrders), not the loaded page and not the
                    60-day default window. */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <i className="ri-download-2-line text-gray-400 text-sm"></i>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Export</span>
                    <span className="text-xs text-gray-400">— uses the filters above, across every matching order</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* ── The general Orders CSV ─────────────────────────────
                        ADMIN-ORDERS-EXPORT-PACKAGE-ADDONS-001. `exportFilteredAll`
                        has existed since the provider-net work but was never
                        mounted, so the only reachable rich CSV was "Export
                        Selected" — which is, by definition, limited to rows the
                        operator had loaded and ticked. This button is that
                        callback's UI: it pages the COMPLETE matching server-side
                        set through the same predicate builder as the list
                        (fetchAllMatchingOrders, with the default window dropped),
                        so the file contains every matching order, not a page. */}
                    <button
                      type="button"
                      onClick={exportFilteredAll}
                      disabled={exporting}
                      title="Download the full Orders CSV for every order matching the filters above — not just the rows on screen. Includes Package / Add-ons, provider payment and attribution columns."
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#345f8f] cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <i className={exporting ? "ri-loader-4-line animate-spin" : "ri-file-excel-2-line"}></i>
                      {exporting ? "Exporting…" : "Orders CSV — All Matching"}
                    </button>
                    {exportMsg && (
                      <span className="text-xs font-semibold text-red-600">{exportMsg}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => exportMetaAudience("paid")}
                      disabled={audienceExporting}
                      title="Download an identifiers-only CSV (email, phone, name, state, country, DOB/year/age) of PAID clients for a Meta Custom Audience. No health/ESA/order data included. Respects current filters."
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#345f8f] cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <i className={audienceExporting ? "ri-loader-4-line animate-spin" : "ri-contacts-book-2-line"}></i>
                      Meta Audience — Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => exportMetaAudience("paid_or_refunded")}
                      disabled={audienceExporting}
                      title="Same identifiers-only Meta audience export, including refunded clients as well as paid."
                      className="whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <i className="ri-add-line"></i>Meta Audience — Paid + Refunded
                    </button>
                    {audienceMsg && (
                      <span className="text-xs font-semibold text-emerald-600">{audienceMsg}</span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-400 mt-2">
                  {ordersReady
                    ? <>Showing <strong>{visibleOrders.length}</strong> of <strong>{filteredTotalDisplay}</strong> orders</>
                    : <>Loading orders…</>}
                </p>
              </div>
            )}

            {/* ── The default scope, stated plainly ──────────────────────
                ADMIN-ORDERS-SERVER-BACKED-LOADING-001 §1/§2. A narrowed
                list that does not say it is narrowed is a list the operator
                will eventually be misled by, so the window is always
                visible and always one click to leave. Searching or applying
                any filter already drops it automatically (§3, §4). */}
            {defaultScopeActive && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#e8f0f9] border border-[#b8cce4] text-[#3b6ea5] font-semibold">
                  <i className="ri-focus-3-line"></i>
                  Last {DEFAULT_SCOPE_DAYS} days + all open work
                </span>
                <span>Older completed orders are excluded — searching or filtering looks at every order.</span>
                <button
                  type="button"
                  onClick={() => setShowAllOrders(true)}
                  className="whitespace-nowrap font-bold text-[#3b6ea5] hover:underline cursor-pointer"
                >
                  Show all orders
                </button>
              </div>
            )}
            {showAllOrders && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>Showing every order, oldest included.</span>
                <button
                  type="button"
                  onClick={() => setShowAllOrders(false)}
                  className="whitespace-nowrap font-bold text-[#3b6ea5] hover:underline cursor-pointer"
                >
                  Back to last {DEFAULT_SCOPE_DAYS} days
                </button>
              </div>
            )}

            {orderRowsLoading && orderRows.length === 0 ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i>
                  <p className="text-sm text-gray-500">Loading orders…</p>
                </div>
              </div>
            ) : ordersError && orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-red-200 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center bg-red-50 rounded-full mx-auto mb-3">
                  <i className="ri-wifi-off-line text-red-400 text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-700">Couldn’t load orders</p>
                <p className="text-xs text-gray-500 mt-1">The orders list failed to load. Your data is safe — this is a connection issue.</p>
                <button type="button"
                  onClick={() => { setOrdersError(false); setLoading(true); loadOrderData().finally(() => setLoading(false)); }}
                  className="whitespace-nowrap mt-3 px-4 py-2 bg-[#3b6ea5] text-white text-sm font-semibold rounded-lg cursor-pointer hover:bg-[#33608f]">
                  Retry
                </button>
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
                    {/* ADMIN-ORDERS-CONTROL-CONSOLIDATION-001 §2 — the Meta
                        Audience exports moved OUT of this strip and into the
                        Filters panel, where the filters they obey already live.
                        Only their result message still surfaces here. */}
                    {audienceMsg && (
                      <span className="hidden sm:inline font-semibold text-emerald-600">{audienceMsg}</span>
                    )}
                    {ordersReady ? (
                      <>
                        <span className="font-semibold text-gray-700">{visibleOrders.length}</span>
                        <span>of</span>
                        <span className="font-semibold text-gray-700">{filteredTotalDisplay}</span>
                        <span>orders</span>
                        {ordersRefreshing && (
                          <span className="inline-flex items-center gap-1 text-[#3b6ea5]" title="Refreshing order data — the list stays live while it updates">
                            <i className="ri-loader-4-line animate-spin"></i>Refreshing
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <i className="ri-loader-4-line animate-spin"></i>Loading totals…
                      </span>
                    )}
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

                {/* ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001 §5 — this notice
                    belongs to the LIST total, not the banner. The four cards above
                    are monthly and server-authoritative, so a client-only filter
                    can no longer make them unavailable; what it does affect is the
                    filter-aware "X of Y" below. */}
                {facetCounts.blockedClientFilters.length > 0 && (
                  <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    The filtered total falls back to the loaded rows while the {facetCounts.blockedClientFilters.join(" + ")} filter{facetCounts.blockedClientFilters.length > 1 ? "s are" : " is"} active — {facetCounts.blockedClientFilters.length > 1 ? "they" : "it"} can&apos;t be applied server-side yet. The four monthly cards above are unaffected.
                  </div>
                )}

                {/* ── DESKTOP: bordered table with header ─────────────────── */}
                {(() => {
                  // Group visibleOrders by BUSINESS (America/New_York) calendar
                  // date for the ribbon separators.
                  //
                  // ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §8 — this previously read
                  // the OPERATOR'S BROWSER day (`getFullYear/getMonth/getDate`
                  // and `toDateString()`). From Karachi that is ~9 hours ahead of
                  // New York, so between 09:00 and 18:00 PKT every order the
                  // business calls "today" was filed under "Yesterday".
                  //
                  // The grouping TIMESTAMP is the EFFECTIVE basis value — the same
                  // one the rows were SELECTED and SORTED on (a ribbon keyed on a
                  // different date than the sort emits one ribbon per row, and
                  // dates each heading by an event the operator did not ask for).
                  // ...-LIFECYCLE-DATE-INTEGRITY-002 moved this off the operator's
                  // raw basis; before that, August completions selected by the
                  // Completed card were filed under July Created/First-paid days.
                  //
                  // `businessDayKey` is threaded through so the ribbons re-render
                  // exactly at New York midnight — "Today" rolls over on its own,
                  // with no page refresh, and Pakistan's midnight does nothing.
                  const getDateKey = (ts: string) => businessIsoDate(new Date(ts));
                  const getDateLabel = (ts: string) => businessDayGroupLabel(ts, businessDayKey);

                  // Build grouped structure: [{dateKey, dateLabel, orders[]}]
                  // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — the day ribbons
                  // MUST group by the SAME date the list is sorted on, otherwise a
                  // list ordered by latest activity would emit one ribbon per row.
                  const groups: { dateKey: string; dateLabel: string; orders: Order[] }[] = [];
                  visibleOrders.forEach((order) => {
                    const groupIso = orderGroupingIso(order, effDateBasis) ?? order.created_at;
                    const dk = getDateKey(groupIso);
                    const last = groups[groups.length - 1];
                    if (last && last.dateKey === dk) {
                      last.orders.push(order);
                    } else {
                      groups.push({ dateKey: dk, dateLabel: getDateLabel(groupIso), orders: [order] });
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
                    raAddonOrderIds,
                    additionalPetStatus: additionalPetStatusById.get(order.id) ?? null,
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
                              {/* Communication recency — distinct from the LIFECYCLE
                                  activity shown in the Status column. */}
                              <div className="w-[120px] flex-shrink-0 pr-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Contact</div>
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
                      Showing <strong className="text-gray-700">{visibleOrders.length}</strong> of <strong className="text-gray-700">{filteredTotalDisplay}</strong> orders
                    </p>
                    <button
                      type="button"
                      onClick={loadMoreOrders}
                      disabled={orderRowsAppending}
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                    >
                      <i className={orderRowsAppending ? "ri-loader-4-line animate-spin" : "ri-arrow-down-line"}></i>
                      {orderRowsAppending ? "Loading…" : `Load ${ORDERS_PAGE_SIZE} More`}
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

        {/* ── CHATS / CONTACTS / CUSTOMERS ── */}
        {activeTab === "chats" && isTabVisible("chats") && <ChatsTab />}

        {activeTab === "contacts" && isTabVisible("contacts") && (
          <ContactRequestsTab
            adminRole={adminProfile?.role ?? null}
            focusSubmissionId={new URLSearchParams(location.search).get("submission")}
          />
        )}

        {activeTab === "customers" && isTabVisible("customers") && <CustomersTab />}

        {/* ── DOCTORS TAB (Providers — roster + Recruitment sub-tab) ── */}
        {activeTab === "doctors" && isTabVisible("doctors") && <DoctorsTab onProviderAdded={loadOrderData} adminProfile={adminProfile} />}

        {/* ── EARNINGS TAB ── */}
        {activeTab === "earnings" && isTabVisible("earnings") && (
          <div>
            <div className="mb-6">
              <h2 className="text-base font-extrabold text-gray-900">Provider Earnings &amp; Payouts</h2>
              <p className="text-xs text-gray-500 mt-0.5">Track completed cases, set payout amounts, and mark payments sent.</p>
            </div>
            <EarningsPanel />
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {activeTab === "payments" && isTabVisible("payments") && <PaymentsTab />}

        {/* ── TEAM TAB ── */}
        {activeTab === "team" && isTabVisible("team") && (
          <TeamTab
            canSeeApprovals={!!adminProfile && canAccessApprovals(adminProfile.role, adminProfile.is_admin)}
            pendingApprovalCount={pendingApprovalCount}
            onOpenApprovals={() => setShowApprovalsInbox(true)}
          />
        )}

        {/* ── ATTENDANCE TAB (Company OS) ── */}
        {activeTab === "attendance" && isTabVisible("attendance") && <AttendanceTab />}

        {/* ── SHIFTS TAB (Company OS) ── */}
        {activeTab === "shifts" && isTabVisible("shifts") && <ShiftsTab />}

        {/* ── AUDIT LOG TAB ── */}
        {activeTab === "audit" && isTabVisible("audit") && (
          <div>
            <div className="mb-5">
              <h2 className="text-base font-extrabold text-gray-900">System Audit Log</h2>
              <p className="text-xs text-gray-500 mt-0.5">All actions logged across orders, payments, GHL syncs, staff changes, and refunds.</p>
            </div>
            <AuditLogTab />
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && isTabVisible("settings") && <SettingsTab adminRole={adminProfile?.role ?? null} />}

        {/* ── SYSTEM HEALTH TAB ── */}
        {activeTab === "health" && isTabVisible("health") && <SystemHealthTab />}
      </div>

      {/* ── BULK ASSIGN BAR ── */}
      {selectedOrders.size > 0 && activeTab === "orders" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#3b6ea5] border-t border-[#17504a] px-3 sm:px-6 py-3 sm:py-4 pb-[calc(0.75rem+56px)] lg:pb-4">
          <div className={`${sidebarCollapsed ? "lg:ml-[52px]" : "lg:ml-[188px]"} space-y-2 transition-[margin] duration-200`}>
            {/* Lead warning strip */}
            {(() => {
              const nonAssignableCount = orderRows.filter((o) =>
                selectedOrders.has(o.confirmation_id) && !isAssignable(o)
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
                      const assignableCount = orderRows.filter((o) =>
                        selectedOrders.has(o.confirmation_id) && isAssignable(o)
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
                      const paidUnassigned = orderRows.filter((o) =>
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
                      const assignableCount = orderRows.filter((o) =>
                        selectedOrders.has(o.confirmation_id) && isAssignable(o)
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
                  const eligibleLeads = orderRows.filter((o) =>
                    selectedOrders.has(o.confirmation_id) &&
                    (!o.payment_intent_id || o.status === "lead") &&
                    !o.followup_opt_out &&
                    (o.seq_30min_sent_at || o.seq_24h_sent_at || o.seq_3day_sent_at)
                  );
                  const notStartedLeads = orderRows.filter((o) =>
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
                  const leadOrders = orderRows.filter((o) => selectedOrders.has(o.confirmation_id) && o.status === "lead");
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
                {/* Export the SELECTED orders (stable confirmation-id selection) as a
                    rich CSV, enriched with the canonical provider payment per order.
                    Fetches provider earnings first; on failure the export is cancelled
                    rather than emitting a misleading all-zero provider column. */}
                <button
                  type="button"
                  disabled={exporting}
                  onClick={async () => {
                    // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 §CSV — the export
                    // carries the SAME date basis as the visible list: the rows are
                    // ordered by the canonical basis comparator, the filename names
                    // the basis, and every row is stamped with the Date Basis column
                    // so a downstream reader can never mistake which date the export
                    // was ordered on.
                    // ...-LIFECYCLE-DATE-INTEGRITY-002 — on the EFFECTIVE basis, so
                    // an export taken with a KPI card active is ordered and stamped
                    // with the same column the card counted, the rows were selected
                    // on and the day ribbons grouped by.
                    const selected = orders
                      .filter((o) => selectedOrders.has(o.confirmation_id))
                      .sort(orderComparator(effDateBasis));
                    if (selected.length === 0) return;
                    setExporting(true);
                    setExportMsg("");
                    try {
                      const [providerPayments, addonEntitlements] = await Promise.all([
                        fetchProviderPaymentsForExport(selected as unknown as ExportableOrder[]),
                        fetchAddonEntitlementsForExport(selected as unknown as ExportableOrder[]),
                      ]);
                      exportOrdersToCSV(
                        selected as unknown as ExportableOrder[],
                        `pawtenant-orders-export-selected-${effDateBasis}`,
                        providerPayments,
                        addonEntitlements,
                        ORDER_DATE_BASIS_LABEL[effDateBasis],
                      );
                    } catch (e) {
                      console.error("[exportSelected] failed", e);
                      setExportMsg("Export cancelled — provider earnings or add-on entitlements could not be loaded. Please retry.");
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <i className={exporting ? "ri-loader-4-line animate-spin" : "ri-download-2-line"}></i>
                  {exporting ? "Exporting…" : "Export Selected CSV"}
                </button>
                {exportMsg ? (
                  <span className="self-center text-xs font-semibold text-red-600">{exportMsg}</span>
                ) : null}
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
          leads={orderRows.filter((o) => selectedOrders.has(o.confirmation_id) && o.status === "lead")}
          onClose={() => setShowLeadActionsModal(false)}
        />
      )}
      {showBulkSMS && adminProfile && (
        <BulkSMSModal
          orders={orderRows.filter((o) =>
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
        <OrderDetailModal
          // `key` forces a fresh mount per (order, tab) so the seeded section
          // actually applies when the operator clicks a second notification while
          // a modal is already open.
          key={`${orderDetail.id}:${orderDetailSection ?? "overview"}`}
          order={orderDetail} doctorContacts={assignableProviders} adminProfile={adminProfile}
          onClose={() => { setOrderDetail(null); setOrderDetailSection(undefined); clearOrderParam(); }}
          onOrderUpdated={handleOrderUpdated} onOrderDeleted={handleOrderDeleted}
          allOrders={filtered}
          initialSection={orderDetailSection}
          // OrderDetailModal is a frozen mega-file with its own local Order
          // shape; cast at the callback boundary to the canonical ./types Order.
          onNavigate={(order) => openOrderDetail(order as unknown as Order)}
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
          onNavigate={(tab) => setActiveTab(tab as TabKey)}
        />
      )}
    </div>
  );
}
