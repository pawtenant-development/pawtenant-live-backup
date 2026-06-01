import { supabase } from "./supabaseClient";
import type { TeamMember } from "./teamMembers";

// Admin-only Employee Master / HR data access. team_members holds non-sensitive
// HR fields (admin RLS for read-all + update). employee_hr_private holds
// sensitive salary / HR notes (admin-only RLS, no employee self-read).
// These helpers are used ONLY from the admin Workstation (Team tab).

export interface EmployeeHrPrivate {
  team_member_id: string;
  base_salary: number | null;
  salary_currency: string | null;
  payment_method: string | null;
  payroll_notes: string | null;
  hr_notes: string | null;
}

/** Master HR fields an admin may edit on team_members (excludes system fields). */
export type EmployeeMasterPatch = Partial<
  Pick<
    TeamMember,
    | "display_name"
    | "workspace_email"
    | "personal_email"
    | "phone"
    | "emergency_contact_name"
    | "emergency_contact_phone"
    | "date_of_birth"
    | "joining_date"
    | "employment_type"
    | "employment_status"
    | "department"
    | "title"
    | "authority_level"
    | "domain_role"
    | "manager_id"
    | "address"
  >
>;

export type HrPrivatePatch = Partial<Omit<EmployeeHrPrivate, "team_member_id">>;

/** All employees (admin read-all via RLS). Returns [] on error. */
export async function fetchAllEmployees(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) {
    console.warn("[employeeHr] fetchAllEmployees error", error);
    return [];
  }
  return (data as TeamMember[] | null) ?? [];
}

/** Sensitive HR/payroll record for one employee (admin-only). null if none/blocked. */
export async function fetchHrPrivate(teamMemberId: string): Promise<EmployeeHrPrivate | null> {
  const { data, error } = await supabase
    .from("employee_hr_private")
    .select("team_member_id, base_salary, salary_currency, payment_method, payroll_notes, hr_notes")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (error) {
    console.warn("[employeeHr] fetchHrPrivate error", error);
    return null;
  }
  return (data as EmployeeHrPrivate | null) ?? null;
}

/** Update master HR fields on team_members (admin RLS). Returns error message or null. */
export async function saveEmployeeMaster(
  teamMemberId: string,
  patch: EmployeeMasterPatch,
): Promise<string | null> {
  const { error } = await supabase
    .from("team_members")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", teamMemberId);
  return error ? error.message : null;
}

/** Upsert the sensitive HR/payroll record (admin RLS). Returns error message or null. */
export async function saveHrPrivate(
  teamMemberId: string,
  patch: HrPrivatePatch,
): Promise<string | null> {
  const { error } = await supabase
    .from("employee_hr_private")
    .upsert({ team_member_id: teamMemberId, ...patch }, { onConflict: "team_member_id" });
  return error ? error.message : null;
}
