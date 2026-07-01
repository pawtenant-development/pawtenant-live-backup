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
    | "primary_department_id"
    | "permission_bundle"
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

export interface CreateEmployeeInput {
  display_name: string;
  workspace_email?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  primary_department_id?: string | null;
  domain_role?: string | null;
  employment_type?: string | null;
  employment_status?: string | null;
  joining_date?: string | null;
  employee_code?: string | null;
  base_salary?: number | null;
  hr_notes?: string | null;
}

export type CreateEmployeeResult =
  | { ok: true; id: string; linkedStaffEmail: string | null }
  | { ok: false; error: string; duplicateId?: string };

/**
 * Create a new Employee Master record (team_members) from the HR directory.
 *  • Duplicate guard: an existing team member with the same work/personal email
 *    is returned as `duplicateId` so the UI opens that profile instead.
 *  • Staff link: if a doctor_profiles admin/staff account exists for the email,
 *    the new employee row is linked via user_id (one person, one identity).
 *  • employee_code auto-generates via the team_members_employee_code_assign
 *    trigger when left blank; the audit trigger logs employee_created.
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const workEmail = (input.workspace_email ?? "").trim().toLowerCase() || null;
  const persEmail = (input.personal_email ?? "").trim().toLowerCase() || null;
  const name = input.display_name.trim();
  if (!name) return { ok: false, error: "Full name is required." };

  // Duplicate check across both email columns (either email matching either column).
  const emails = [workEmail, persEmail].filter(Boolean) as string[];
  if (emails.length > 0) {
    const list = emails.map((e) => `"${e}"`).join(",");
    const { data: dupes } = await supabase
      .from("team_members")
      .select("id, display_name, workspace_email, personal_email")
      .or(`workspace_email.in.(${list}),personal_email.in.(${list})`)
      .limit(1);
    if (dupes && dupes.length > 0) {
      return {
        ok: false,
        error: `An employee profile already exists for this email (${dupes[0].display_name ?? "unnamed"}).`,
        duplicateId: dupes[0].id as string,
      };
    }
  }

  // Link to an existing staff/admin account by email, if one exists.
  let linkedUserId: string | null = null;
  let linkedStaffEmail: string | null = null;
  if (emails.length > 0) {
    const { data: staff } = await supabase
      .from("doctor_profiles")
      .select("user_id, email")
      .in("email", emails)
      .limit(1);
    if (staff && staff.length > 0) {
      linkedUserId = (staff[0].user_id as string) ?? null;
      linkedStaffEmail = (staff[0].email as string) ?? null;
      if (linkedUserId) {
        // Same auth user may already have an employee profile under another email.
        const { data: byUser } = await supabase
          .from("team_members")
          .select("id, display_name")
          .eq("user_id", linkedUserId)
          .limit(1);
        if (byUser && byUser.length > 0) {
          return {
            ok: false,
            error: `This staff account is already linked to employee profile "${byUser[0].display_name ?? "unnamed"}".`,
            duplicateId: byUser[0].id as string,
          };
        }
      }
    }
  }

  const code = (input.employee_code ?? "").trim();
  const { data: inserted, error } = await supabase
    .from("team_members")
    .insert({
      display_name: name,
      workspace_email: workEmail,
      personal_email: persEmail,
      phone: (input.phone ?? "").trim() || null,
      title: (input.title ?? "").trim() || null,
      department: input.department ?? null,
      primary_department_id: input.primary_department_id ?? null,
      domain_role: input.domain_role ?? null,
      employment_type: input.employment_type ?? null,
      employment_status: input.employment_status ?? "active",
      joining_date: input.joining_date ?? null,
      // Blank → BEFORE INSERT trigger assigns the next 6-digit code.
      ...(code ? { employee_code: code } : {}),
      user_id: linkedUserId,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? "Insert failed." };

  if (input.base_salary != null || (input.hr_notes ?? "").trim()) {
    await supabase.from("employee_hr_private").upsert(
      {
        team_member_id: inserted.id as string,
        base_salary: input.base_salary ?? null,
        salary_currency: "PKR",
        hr_notes: (input.hr_notes ?? "").trim() || null,
      },
      { onConflict: "team_member_id" },
    );
  }

  return { ok: true, id: inserted.id as string, linkedStaffEmail };
}

/**
 * Ensure a team_members employee profile exists for a staff account created
 * via Roles & Access (Invite Member). Links by email/user_id; never duplicates.
 * Returns the team_member id, or null if it could not be created.
 */
export async function ensureEmployeeForStaff(params: {
  email: string;
  full_name: string;
  title?: string | null;
}): Promise<{ id: string; created: boolean } | null> {
  const email = params.email.trim().toLowerCase();
  if (!email) return null;

  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  const userId = (profile?.user_id as string | undefined) ?? null;

  // Already linked by user_id or by either email column?
  if (userId) {
    const { data: byUser } = await supabase
      .from("team_members").select("id").eq("user_id", userId).limit(1);
    if (byUser && byUser.length > 0) return { id: byUser[0].id as string, created: false };
  }
  const { data: byEmail } = await supabase
    .from("team_members")
    .select("id, user_id")
    .or(`workspace_email.eq."${email}",personal_email.eq."${email}"`)
    .limit(1);
  if (byEmail && byEmail.length > 0) {
    const row = byEmail[0];
    if (!row.user_id && userId) {
      await supabase.from("team_members").update({ user_id: userId }).eq("id", row.id as string);
    }
    return { id: row.id as string, created: false };
  }

  const { data: inserted, error } = await supabase
    .from("team_members")
    .insert({
      display_name: params.full_name.trim() || email,
      workspace_email: email,
      title: (params.title ?? "").trim() || null,
      employment_status: "active",
      user_id: userId,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !inserted) return null;
  return { id: inserted.id as string, created: true };
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

/**
 * Offboard / archive an employee via the SECURITY DEFINER RPC. The server:
 *   • blocks the owner account and double-offboarding,
 *   • sets employment_status='offboarded' + is_active=false (+ archive metadata),
 *   • locks app-side login (team_members + any linked doctor_profiles),
 *   • writes an audit_logs entry.
 * No row is deleted; history is preserved. Returns error message or null.
 */
export async function offboardEmployee(
  teamMemberId: string,
  reason: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("offboard_employee", {
    p_team_member_id: teamMemberId,
    p_reason: reason,
  });
  return error ? error.message : null;
}

/** Reactivate / re-hire an offboarded employee (reverses offboard_employee). */
export async function reactivateEmployee(teamMemberId: string): Promise<string | null> {
  const { error } = await supabase.rpc("reactivate_employee", {
    p_team_member_id: teamMemberId,
  });
  return error ? error.message : null;
}
