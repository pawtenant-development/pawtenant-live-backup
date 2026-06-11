import { supabase } from "./supabaseClient";

// Company OS org structure — departments + many-to-many department role
// assignments (COS Phase: SAAS-ORG-STRUCTURE).
//
// Access model recap:
//   • Global Owner = doctor_profiles.role='owner' (never a per-department level).
//   • Department-scoped levels: domain_owner → sub_domain_owner →
//     team_coordinator → user (+ viewer/approver helper levels).
//   • One employee can hold roles in MANY departments at once; removing one
//     assignment never touches the others (partial-unique on active rows).
//   • Enforcement is server-side (RLS + SECURITY DEFINER helpers); these
//     helpers are thin typed wrappers.

export interface CompanyDepartment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const DEPARTMENT_ROLE_LEVELS = [
  "domain_owner",
  "sub_domain_owner",
  "team_coordinator",
  "user",
  "viewer",
  "approver",
] as const;
export type DepartmentRoleLevel = (typeof DEPARTMENT_ROLE_LEVELS)[number];

export const DEPARTMENT_ROLE_LABEL: Record<string, string> = {
  domain_owner: "Domain Owner",
  sub_domain_owner: "Sub-Domain Owner",
  team_coordinator: "Team Coordinator",
  user: "User",
  viewer: "Viewer",
  approver: "Approver",
};

export interface DepartmentRoleAssignment {
  id: string;
  team_member_id: string;
  department_id: string;
  role_level: string;
  sub_domain: string | null;
  permission_bundle: string | null;
  can_manage_people: boolean;
  can_manage_permissions: boolean;
  can_view_salary: boolean;
  can_request_bonus: boolean;
  can_approve_bonus: boolean;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

/** Human label for the delegation flags on an assignment (for chips/summaries). */
export function assignmentFlagLabels(a: DepartmentRoleAssignment): string[] {
  const out: string[] = [];
  if (a.can_manage_people) out.push("People");
  if (a.can_manage_permissions) out.push("Permissions");
  if (a.can_view_salary) out.push("Salary");
  if (a.can_request_bonus) out.push("Request bonus");
  if (a.can_approve_bonus) out.push("Approve bonus");
  return out;
}

/** All departments (active first). Readable by any signed-in employee. */
export async function fetchDepartments(includeInactive = false): Promise<CompanyDepartment[]> {
  let q = supabase.from("company_departments").select("*").order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    console.warn("[companyOs] fetchDepartments error", error);
    return [];
  }
  return (data as CompanyDepartment[] | null) ?? [];
}

/** Create a department (owner/admin_manager RLS). Returns error message or null. */
export async function createDepartment(
  input: { code: string; name: string; description?: string | null; parent_department_id?: string | null; sort_order?: number },
): Promise<string | null> {
  const code = input.code.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code || !input.name.trim()) return "Code and name are required.";
  const { error } = await supabase.from("company_departments").insert({
    code,
    name: input.name.trim(),
    description: input.description ?? null,
    parent_department_id: input.parent_department_id ?? null,
    sort_order: input.sort_order ?? 500,
  });
  return error ? error.message : null;
}

/** Update a department (rename / activate / deactivate). Owner/admin_manager RLS. */
export async function updateDepartment(
  id: string,
  patch: Partial<Pick<CompanyDepartment, "name" | "description" | "is_active" | "sort_order" | "parent_department_id">>,
): Promise<string | null> {
  const { error } = await supabase.from("company_departments").update(patch).eq("id", id);
  return error ? error.message : null;
}

/** ACTIVE department assignments for one employee (RLS: self / dept manager / admin). */
export async function fetchMemberDepartmentRoles(teamMemberId: string): Promise<DepartmentRoleAssignment[]> {
  const { data, error } = await supabase
    .from("team_member_department_roles")
    .select("*")
    .eq("team_member_id", teamMemberId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[companyOs] fetchMemberDepartmentRoles error", error);
    return [];
  }
  return (data as DepartmentRoleAssignment[] | null) ?? [];
}

/** The calling employee's own active assignments (drives portal/coordinator UI). */
export async function fetchMyDepartmentRoles(): Promise<DepartmentRoleAssignment[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) return [];
  const { data, error } = await supabase
    .from("team_member_department_roles")
    .select("*")
    .eq("is_active", true);
  if (error) {
    console.warn("[companyOs] fetchMyDepartmentRoles error", error);
    return [];
  }
  // RLS already scopes; managers also receive their department's rows, so
  // filter to own rows client-side via the member id present on each row is
  // not possible without the caller's id — callers that need strictly-own
  // rows should pass through fetchMemberDepartmentRoles(currentMemberId).
  return (data as DepartmentRoleAssignment[] | null) ?? [];
}

export interface AssignDepartmentRoleInput {
  team_member_id: string;
  department_id: string;
  role_level: DepartmentRoleLevel | string;
  sub_domain?: string | null;
  can_manage_people?: boolean;
  can_manage_permissions?: boolean;
  can_view_salary?: boolean;
  can_request_bonus?: boolean;
  can_approve_bonus?: boolean;
}

/** Assign (or replace) a department role. RLS enforces delegation limits. */
export async function assignDepartmentRole(input: AssignDepartmentRoleInput): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const assignedBy = sessionData?.session?.user?.id ?? null;
  const { error } = await supabase.from("team_member_department_roles").insert({
    team_member_id: input.team_member_id,
    department_id: input.department_id,
    role_level: input.role_level,
    sub_domain: input.sub_domain ?? null,
    can_manage_people: input.can_manage_people ?? false,
    can_manage_permissions: input.can_manage_permissions ?? false,
    can_view_salary: input.can_view_salary ?? false,
    can_request_bonus: input.can_request_bonus ?? false,
    can_approve_bonus: input.can_approve_bonus ?? false,
    assigned_by: assignedBy,
  });
  return error ? error.message : null;
}

/** Update flags / role level on an existing active assignment. */
export async function updateDepartmentRole(
  assignmentId: string,
  patch: Partial<Pick<DepartmentRoleAssignment,
    "role_level" | "sub_domain" | "can_manage_people" | "can_manage_permissions"
    | "can_view_salary" | "can_request_bonus" | "can_approve_bonus">>,
): Promise<string | null> {
  const { error } = await supabase
    .from("team_member_department_roles")
    .update(patch)
    .eq("id", assignmentId);
  return error ? error.message : null;
}

/**
 * End a department assignment (soft: is_active=false + ends_at=today). The
 * employee's OTHER department assignments are untouched — this is the
 * "remove HR from Asim, keep Operations" lever.
 */
export async function endDepartmentRole(assignmentId: string): Promise<string | null> {
  const { error } = await supabase
    .from("team_member_department_roles")
    .update({ is_active: false, ends_at: new Date().toISOString().slice(0, 10) })
    .eq("id", assignmentId);
  return error ? error.message : null;
}

/** Members of departments the caller coordinates (SECURITY DEFINER RPC). */
export interface MyDepartmentMember {
  team_member_id: string;
  display_name: string | null;
  employee_code: string | null;
  department_id: string | null;
  department_name: string | null;
  role_level: string | null;
}

export async function fetchMyDepartmentMembers(): Promise<MyDepartmentMember[]> {
  const { data, error } = await supabase.rpc("get_my_department_members");
  if (error) {
    console.warn("[companyOs] get_my_department_members error", error);
    return [];
  }
  return (data ?? []) as MyDepartmentMember[];
}
