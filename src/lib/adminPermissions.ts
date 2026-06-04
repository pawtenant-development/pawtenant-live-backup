// Role-based permission helpers for the Admin Portal.
//
// Tab access alone is NOT enough for destructive or team-management actions.
// These helpers gate those at the UI layer so the same rule is easy to apply
// across the codebase. Roles come from doctor_profiles.role.
//
// Admin-level roles (owner, admin_manager) may:
//   - delete orders / provider records / chat sessions / contact submissions
//   - edit team member roles / tab access
//   - deactivate / remove team members
//   - invite new team members
//
// Non-admin roles (support, finance, read_only) may only perform non-destructive
// workflow actions in the tabs they can see (reply, assign, resolve, mark viewed).

export type AdminRole =
  | "owner"
  | "admin_manager"
  | "support"
  | "finance"
  | "read_only"
  | "provider"
  | string
  | null
  | undefined;

const ADMIN_ROLES = new Set(["owner", "admin_manager"]);

/** True for owner / admin_manager. The only roles allowed to delete records. */
export function canDelete(role: AdminRole): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

/** True for owner / admin_manager. Used to gate team-member CRUD. */
export function canManageTeam(role: AdminRole): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

/** True for owner only. Some actions (delete owner, assign owner role) are reserved. */
export function isOwner(role: AdminRole): boolean {
  return role === "owner";
}

/** Generic admin-level check (owner or admin_manager). */
export function isAdminLevel(role: AdminRole): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

/**
 * True for the roles allowed to send broadcasts (owner / admin_manager).
 *
 * NOTE: the canonical role set in doctor_profiles.role has no separate
 * "manager" / "operations manager" role — admin_manager IS the manager
 * tier. Support / finance / read_only are intentionally excluded here, so
 * the Broadcast entry point is hidden from them (the modal itself still
 * keeps its internal support-approval flow, it's just no longer surfaced).
 */
export function canAccessBroadcast(role: AdminRole): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

/**
 * True for the roles allowed to review approval requests
 * (owner / admin_manager, plus anyone flagged is_admin). Mirrors the
 * existing reviewer check used for the pending-approval count + inbox.
 */
export function canAccessApprovals(role: AdminRole, isAdmin?: boolean | null): boolean {
  return (!!role && ADMIN_ROLES.has(role)) || !!isAdmin;
}

/**
 * Standard tooltip/disabled label to surface next to gated buttons.
 * Kept consistent across Team/Chats/Contacts/Orders tabs.
 */
export const ADMIN_REQUIRED_LABEL = "Admin access required";

// ───────────────────────────────────────────────────────────────────────────
// UNIFIED CAPABILITY LAYER (COS-046 — operational RBAC unification)
// ───────────────────────────────────────────────────────────────────────────
//
// One named-capability vocabulary for the Admin Portal, so tab visibility and
// sensitive ACTIONS are checked against the SAME map instead of scattered
// `role === "owner" || role === "admin_manager" || role === "finance"` literals.
//
// Two facts kept this a SMALL, safe refactor (not a data-model change):
//   • Tab VISIBILITY stays owned by getVisibleTabs(role, custom_tab_access) in
//     admin-orders/page.tsx (doctor_profiles.role + custom_tab_access). This
//     module maps each visible tab → its `<area>.view` capability via
//     TAB_VIEW_CAPABILITY, so view-capabilities are consistent with the nav by
//     construction.
//   • Sensitive ACTIONS are role-derived. The atomic predicates below are the
//     single definition; resolveCapabilities() composes them into a capability
//     set, and `can()` checks it. The role rules exactly mirror the behaviour
//     that already existed (zero behaviour change) — owner/admin_manager for
//     admin/team/shift/attendance/settings; owner/admin_manager/finance for the
//     Accounts books/expenses/payroll tier (matching is_accounts_admin() RLS).
//
// Backend stays the real enforcement (RLS + security-definer RPCs). This layer
// is UI clarity/consistency only. The deeper team_members.permission_bundle
// capability system in lib/permissions.ts (COS-045 Phase 1) is a separate,
// not-yet-wired future layer and is intentionally NOT touched here.

export type Capability =
  | "admin.dashboard.view"
  | "orders.view"
  | "orders.manage"
  | "analytics.view"
  | "communications.view"
  | "communications.send"
  | "customers.view"
  | "providers.view"
  | "providers.manage"
  | "hr.team.view"
  | "hr.team.manage"
  | "hr.attendance.view"
  | "hr.attendance.manage"
  | "hr.shifts.view"
  | "hr.shifts.manage"
  | "accounts.earnings.view"
  | "accounts.payments.view"
  | "accounts.payments.manage"
  | "accounts.expenses.manage"
  | "accounts.books.close"
  | "accounts.payroll.send"
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  | "health.view"
  | "company.portal.view"
  | "company.self_service.use";

// Roles that may manage the Accounts books/expenses/payroll tier. Mirrors the
// is_accounts_admin() RLS gate (owner/admin_manager/finance) used by the salary
// RPCs + close/reopen accounting-period RPCs.
const ACCOUNTS_MANAGE_ROLES = new Set(["owner", "admin_manager", "finance"]);

// ── Atomic action predicates (single definition for each sensitive action) ──
/** Close / reopen / update monthly books snapshots. owner/admin_manager/finance. */
export function canCloseBooks(role: AdminRole): boolean {
  return !!role && ACCOUNTS_MANAGE_ROLES.has(role);
}
/** Add / edit / delete company expenses. owner/admin_manager/finance. */
export function canManageExpenses(role: AdminRole): boolean {
  return !!role && ACCOUNTS_MANAGE_ROLES.has(role);
}
/** Send the monthly payroll summary email. owner/admin_manager/finance. */
export function canSendPayroll(role: AdminRole): boolean {
  return !!role && ACCOUNTS_MANAGE_ROLES.has(role);
}
/** Bulk-delete payment/charge rows. owner/admin_manager only. */
export function canBulkManagePayments(role: AdminRole): boolean {
  return isAdminLevel(role);
}
/** Manage shifts (assign / edit templates). owner/admin_manager only. */
export function canManageShifts(role: AdminRole): boolean {
  return isAdminLevel(role);
}
/** Manage attendance (corrections / adjustments). owner/admin_manager only. */
export function canManageAttendance(role: AdminRole): boolean {
  return isAdminLevel(role);
}
/** Manage settings. owner/admin_manager only. */
export function canManageSettings(role: AdminRole): boolean {
  return isAdminLevel(role);
}
/** Manage providers (edit / approve). owner/admin_manager only. */
export function canManageProviders(role: AdminRole): boolean {
  return isAdminLevel(role);
}

/**
 * Tab key → its `<area>.view` capability. The single map tying the operational
 * nav (getVisibleTabs / AdminSidebar TAB_CONFIG) to the capability vocabulary.
 * Legacy comms aliases collapse onto communications.view.
 */
export const TAB_VIEW_CAPABILITY: Readonly<Record<string, Capability>> = {
  dashboard: "admin.dashboard.view",
  orders: "orders.view",
  analytics: "analytics.view",
  communications: "communications.view",
  comms: "communications.view",
  chats: "communications.view",
  contacts: "communications.view",
  customers: "customers.view",
  doctors: "providers.view",
  earnings: "accounts.earnings.view",
  payments: "accounts.payments.view",
  team: "hr.team.view",
  attendance: "hr.attendance.view",
  shifts: "hr.shifts.view",
  audit: "audit.view",
  settings: "settings.view",
  health: "health.view",
};

/** Inputs the resolver needs about the current admin/team-member session. */
export interface CapabilityContext {
  role: AdminRole;
  isAdmin?: boolean | null;
  /** Tabs from getVisibleTabs(role, custom_tab_access). Drives `*.view` caps. */
  visibleTabs?: readonly string[];
  /** True when the user has a /company portal identity (team_member). */
  isTeamMember?: boolean;
}

/**
 * Resolve the current user's effective operational capabilities.
 *
 *   1. `*.view` capabilities come from visibleTabs (so they always agree with
 *      the rendered sidebar / route gate).
 *   2. Action capabilities come from the atomic predicates above (role-derived).
 *   3. Portal capabilities for any signed-in team member.
 *
 * Action capabilities do NOT require visibleTabs, so a component holding only
 * `role` can still call `can({ role }, "accounts.books.close")`.
 */
export function resolveCapabilities(ctx: CapabilityContext): Set<Capability> {
  const caps = new Set<Capability>();
  const role = ctx.role ?? null;

  // 1. View capabilities — derived from the operational tab gate.
  for (const t of ctx.visibleTabs ?? []) {
    const c = TAB_VIEW_CAPABILITY[t];
    if (c) caps.add(c);
  }
  caps.add("admin.dashboard.view"); // dashboard is always reachable

  // 2. Action capabilities — role-derived, mirroring existing checks.
  if (isAdminLevel(role)) {
    caps.add("orders.manage");
    caps.add("providers.manage");
    caps.add("accounts.payments.manage");
    caps.add("hr.team.manage");
    caps.add("hr.attendance.manage");
    caps.add("hr.shifts.manage");
    caps.add("settings.manage");
  }
  if (canAccessBroadcast(role)) caps.add("communications.send");
  if (canCloseBooks(role)) caps.add("accounts.books.close");
  if (canManageExpenses(role)) caps.add("accounts.expenses.manage");
  if (canSendPayroll(role)) caps.add("accounts.payroll.send");

  // 3. Company portal / self-service — any signed-in team member.
  if (ctx.isTeamMember || !!role) {
    caps.add("company.portal.view");
    caps.add("company.self_service.use");
  }

  return caps;
}

/**
 * The single capability check. Accepts either a prebuilt capability Set or a
 * CapabilityContext (resolved on the fly). For action-only checks a context of
 * just `{ role }` is sufficient.
 */
export function can(
  ctxOrCaps: CapabilityContext | ReadonlySet<Capability>,
  capability: Capability,
): boolean {
  const caps =
    ctxOrCaps instanceof Set
      ? (ctxOrCaps as ReadonlySet<Capability>)
      : resolveCapabilities(ctxOrCaps as CapabilityContext);
  return caps.has(capability);
}
