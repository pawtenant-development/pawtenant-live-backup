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
 * Standard tooltip/disabled label to surface next to gated buttons.
 * Kept consistent across Team/Chats/Contacts/Orders tabs.
 */
export const ADMIN_REQUIRED_LABEL = "Admin access required";
