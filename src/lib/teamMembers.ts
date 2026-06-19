import { supabase } from "./supabaseClient";

export interface TeamMember {
  id: string;
  /**
   * Permanent, human-readable 6-digit Employee ID (e.g. "000001").
   * Monotonic and NEVER reused — even after archive/delete. Internal use.
   */
  employee_code: string | null;
  user_id: string | null;
  legacy_doctor_profile_id: string | null;
  display_name: string | null;
  display_picture_url: string | null;
  cover_photo_url: string | null;
  department: string | null;
  title: string | null;
  authority_level: string | null;
  manager_id: string | null;
  workspace_email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Employee Master / HR profile fields (non-sensitive; self-readable via RLS).
  // Sensitive salary / HR notes live in employee_hr_private (admin-only) and are
  // intentionally NOT part of this type.
  personal_email: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  date_of_birth: string | null;
  joining_date: string | null;
  employment_type: string | null;
  employment_status: string | null;
  address: string | null;
  company_id: string | null;
  /** Company OS role hierarchy level (labeling only; does not grant access). */
  domain_role: string | null;
  /** Primary/default department (company_departments.id). Display + default;
   *  real access comes from team_member_department_roles assignments. */
  primary_department_id: string | null;
  /** Capability bundle key (lib/permissions.ts). */
  permission_bundle: string | null;
  // ── Offboarding / archive metadata (soft; row is never deleted) ───────────
  // Set by offboard_employee() / cleared by reactivate_employee(). When
  // employment_status = "offboarded" the member is archived: login is locked and
  // they are excluded from active lists + future payroll, but all history stays.
  offboarded_at: string | null;
  offboarded_by: string | null;
  offboarding_reason: string | null;
  login_locked_at: string | null;
  login_locked_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
}

/** True when an employee has been offboarded/archived (terminal, login-locked). */
export function isOffboarded(m: Pick<TeamMember, "employment_status" | "archived_at">): boolean {
  return (m.employment_status ?? "active") === "offboarded" || !!m.archived_at;
}

/** Company OS role hierarchy (labeling). owner = Boss/Owner/Super Admin. */
export const DOMAIN_ROLES = [
  "owner",
  "domain_owner",
  "sub_domain_owner",
  "team_coordinator",
  "user",
] as const;

export const DOMAIN_ROLE_LABEL: Record<string, string> = {
  owner: "Owner / Super Admin",
  domain_owner: "Domain Owner",
  sub_domain_owner: "Sub-Domain Owner",
  team_coordinator: "Team Coordinator",
  user: "User",
};

/** Allowed employee status / employment-type values (mirror DB check constraints). */
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contractor",
  "intern",
  "temporary",
] as const;
export const EMPLOYMENT_STATUSES = [
  "active",
  "inactive",
  "terminated",
  "on_leave",
] as const;

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contractor: "Contractor",
  intern: "Intern",
  temporary: "Temporary",
};
export const EMPLOYMENT_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
  on_leave: "On Leave",
  // Terminal archive state — set only via the Offboard flow, never the manual
  // status dropdown (so it always carries audit + login-lock + metadata).
  offboarded: "Offboarded",
};

/**
 * Fetch the current authenticated user's `team_members` row, if any.
 *
 * Returns `null` when:
 *   - there is no Supabase Auth session
 *   - the user has no row in `team_members`
 *   - RLS hides the row
 *   - the query errors (logged to console as a warning)
 *
 * Phase 1 is read-only and additive. Callers must handle the `null` case
 * (Company Home shows the "profile not set up" fallback).
 */
export async function fetchCurrentTeamMember(): Promise<TeamMember | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[team_members] fetchCurrentTeamMember error", error);
    return null;
  }

  return (data as TeamMember | null) ?? null;
}

/**
 * Current user's admin context from `doctor_profiles` (self-readable). Used by
 * the Company Portal to decide manager-level visibility. "Manager" here mirrors
 * the team_members / employee_hr_private RLS: is_admin AND role in
 * (owner, admin_manager) — so the richer reads the UI offers are actually
 * permitted by the database.
 */
export interface MyAdminContext {
  role: string | null;
  is_admin: boolean;
  isManager: boolean;
}

export async function fetchMyAdminContext(): Promise<MyAdminContext> {
  const empty: MyAdminContext = { role: null, is_admin: false, isManager: false };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return empty;
  const { data, error } = await supabase
    .from("doctor_profiles")
    .select("role, is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return empty;
  const role = (data as { role: string | null }).role ?? null;
  const is_admin = (data as { is_admin: boolean | null }).is_admin === true;
  const isManager = is_admin && (role === "owner" || role === "admin_manager");
  return { role, is_admin, isManager };
}

/**
 * Fetch one full team_members row by id. Returns the row only when RLS permits
 * (own row via self_read, or any row for owner/admin_manager via admin_read).
 * Used by the manager "View Profile" drawer. Salary / HR notes are NOT here —
 * they live in employee_hr_private (admin-only) and are not surfaced in the portal.
 */
export async function fetchTeamMemberById(id: string): Promise<TeamMember | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[team_members] fetchTeamMemberById error", error);
    return null;
  }
  return (data as TeamMember | null) ?? null;
}

/**
 * Fetch a manager's display info by team_members.id (one hop, name-only).
 * Returns `null` when no `managerId`, no auth session, or RLS blocks the row.
 */
export async function fetchManagerDisplay(
  managerId: string | null,
): Promise<{ id: string; display_name: string | null } | null> {
  if (!managerId) return null;

  const { data, error } = await supabase
    .from("team_members")
    .select("id, display_name")
    .eq("id", managerId)
    .maybeSingle();

  if (error) {
    console.warn("[team_members] fetchManagerDisplay error", error);
    return null;
  }

  return (data as { id: string; display_name: string | null } | null) ?? null;
}
