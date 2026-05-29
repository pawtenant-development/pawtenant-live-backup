import { supabase } from "./supabaseClient";

/**
 * Admin-side shift-assignment helpers (COS-051).
 *
 * Read + create + soft-end of `employee_shift_assignments` rows.
 * Operational RBAC is enforced server-side by `esa_admin_all`,
 * `team_members_admin_read`, and `shift_templates_authenticated_read`.
 * Non-admin callers will see empty results / write rejections from RLS.
 *
 * "Soft end" means setting `effective_to` to a past or current PKT date
 * — historical rows are preserved per the COS-051 brief.
 */

export interface ShiftTemplateLite {
  id: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  timezone: string | null;
  grace_minutes: number | null;
  is_active: boolean;
}

export interface TeamMemberLite {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  is_active: boolean;
}

export interface ShiftAssignment {
  id: string;
  team_member_id: string;
  shift_template_id: string;
  weekly_off_days: number[] | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  member: TeamMemberLite | null;
  shift: ShiftTemplateLite | null;
}

interface RawAssignmentRow {
  id: string;
  team_member_id: string;
  shift_template_id: string;
  weekly_off_days: number[] | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch active shift_templates (for the assignment form). Any
 * authenticated user can read; non-admin callers won't reach this UI
 * but the call is still safe.
 */
export async function fetchActiveShiftTemplates(): Promise<ShiftTemplateLite[]> {
  const { data, error } = await supabase
    .from("shift_templates")
    .select("id, name, description, start_time, end_time, timezone, grace_minutes, is_active")
    .eq("is_active", true)
    .order("start_time", { ascending: true });

  if (error) {
    console.warn("[shiftsAdmin] fetchActiveShiftTemplates error", error);
    return [];
  }

  return (data as ShiftTemplateLite[] | null) ?? [];
}

/**
 * Fetch all employee_shift_assignments rows (capped at 200 — mirrors
 * the COS-038 ORDERS_INITIAL_LIMIT discipline). Joins to team_members
 * and shift_templates done in JS to avoid PostgREST FK-cache surprises.
 */
export async function fetchShiftAssignments(): Promise<ShiftAssignment[]> {
  const { data, error } = await supabase
    .from("employee_shift_assignments")
    .select(
      "id, team_member_id, shift_template_id, weekly_off_days, effective_from, effective_to, notes, created_at, updated_at",
    )
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[shiftsAdmin] fetchShiftAssignments error", error);
    return [];
  }

  const rows = (data as RawAssignmentRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const memberIds = Array.from(
    new Set(rows.map((r) => r.team_member_id).filter(Boolean)),
  );
  const templateIds = Array.from(
    new Set(rows.map((r) => r.shift_template_id).filter(Boolean)),
  );

  const memberPromise = memberIds.length
    ? supabase
        .from("team_members")
        .select("id, display_name, employee_code, is_active")
        .in("id", memberIds)
    : Promise.resolve({ data: [] as TeamMemberLite[], error: null });

  const templatePromise = templateIds.length
    ? supabase
        .from("shift_templates")
        .select("id, name, description, start_time, end_time, timezone, grace_minutes, is_active")
        .in("id", templateIds)
    : Promise.resolve({ data: [] as ShiftTemplateLite[], error: null });

  const [memberRes, templateRes] = await Promise.all([memberPromise, templatePromise]);

  if (memberRes.error) {
    console.warn("[shiftsAdmin] fetchShiftAssignments members error", memberRes.error);
  }
  if (templateRes.error) {
    console.warn("[shiftsAdmin] fetchShiftAssignments templates error", templateRes.error);
  }

  const memberById = new Map<string, TeamMemberLite>();
  for (const m of (memberRes.data as TeamMemberLite[] | null) ?? []) memberById.set(m.id, m);

  const templateById = new Map<string, ShiftTemplateLite>();
  for (const t of (templateRes.data as ShiftTemplateLite[] | null) ?? []) templateById.set(t.id, t);

  return rows.map((r) => ({
    ...r,
    member: memberById.get(r.team_member_id) ?? null,
    shift: templateById.get(r.shift_template_id) ?? null,
  }));
}

export interface CreateAssignmentInput {
  teamMemberId: string;
  shiftTemplateId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  weeklyOffDays?: number[];
  notes?: string | null;
}

/**
 * Insert a new employee_shift_assignment row. Returns `{ id }` on success
 * or `{ error }` describing the failure (with friendly hints for the
 * `esa_effective_range_chk` constraint).
 */
export async function createShiftAssignment(
  input: CreateAssignmentInput,
): Promise<{ id: string } | { error: string }> {
  const payload: Record<string, unknown> = {
    team_member_id: input.teamMemberId,
    shift_template_id: input.shiftTemplateId,
    effective_from: input.effectiveFrom,
    weekly_off_days: input.weeklyOffDays ?? [],
  };
  if (input.effectiveTo) payload.effective_to = input.effectiveTo;
  if (input.notes != null && input.notes.trim() !== "") payload.notes = input.notes.trim();

  const { data, error } = await supabase
    .from("employee_shift_assignments")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.warn("[shiftsAdmin] createShiftAssignment error", error);
    if (error.message?.includes("esa_effective_range_chk")) {
      return { error: "Effective end date must be on or after the start date." };
    }
    if (error.message?.includes("esa_off_days_dow_chk")) {
      return { error: "Weekly off-days must be values 0–6 (Sun–Sat)." };
    }
    return { error: error.message || "Could not create assignment." };
  }

  return { id: (data as { id: string }).id };
}

/**
 * Soft-end an assignment by setting `effective_to`. Default is today PKT.
 * Historical rows are preserved per the COS-051 brief — this never
 * deletes a row.
 */
export async function endShiftAssignment(
  id: string,
  endDatePkt: string,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from("employee_shift_assignments")
    .update({ effective_to: endDatePkt })
    .eq("id", id);

  if (error) {
    console.warn("[shiftsAdmin] endShiftAssignment error", error);
    if (error.message?.includes("esa_effective_range_chk")) {
      return { error: "End date must be on or after the assignment's start date." };
    }
    return { error: error.message || "Could not end assignment." };
  }
  return { ok: true };
}

/**
 * Helper: classify an assignment for display purposes against today PKT.
 *
 *   `pending` = effective_from > today (scheduled to start later)
 *   `ended`   = effective_to is set AND effective_to <= today
 *               (an assignment whose end date is today is treated as
 *               ended for admin UI purposes — clicking "End Now" sets
 *               effective_to to today and the row should immediately
 *               move out of Active)
 *   `active`  = effective_from <= today AND
 *               (effective_to is null OR effective_to > today)
 */
export function classifyAssignment(
  a: ShiftAssignment,
  todayPkt: string,
): "active" | "ended" | "pending" {
  if (a.effective_from > todayPkt) return "pending";
  if (a.effective_to && a.effective_to <= todayPkt) return "ended";
  return "active";
}

export const DOW_LABELS: { value: number; short: string; long: string }[] = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
];

export function formatOffDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return "—";
  const sorted = [...days].sort((a, b) => a - b);
  return sorted
    .map((d) => DOW_LABELS.find((x) => x.value === d)?.short ?? String(d))
    .join(", ");
}

// ─── Shift TEMPLATE management (COS-SHIFT-TIMING) ────────────────────────────
// Create / edit shift templates so admins never need raw SQL. Writes go through
// the shift_templates_admin_write RLS policy (admin/owner only). crosses_midnight
// is DERIVED from the times so admins don't have to reason about overnight flags.

export interface ShiftTemplateFull {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean | null;
  grace_minutes: number | null;
  is_active: boolean;
}

export interface ShiftTemplateInput {
  name: string;
  description?: string | null;
  timezone?: string | null;
  start_time: string; // 'HH:MM'
  end_time: string;   // 'HH:MM'
  grace_minutes?: number;
  is_active?: boolean;
}

const DEFAULT_SHIFT_TZ = "Asia/Karachi";

/** Overnight when the end time is at or before the start time (e.g. 20:00 → 04:00). */
export function computeCrossesMidnight(start: string, end: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return toMin(end) <= toMin(start);
}

/** All templates (active first), for the management list. */
export async function fetchAllShiftTemplates(): Promise<ShiftTemplateFull[]> {
  const { data, error } = await supabase
    .from("shift_templates")
    .select("id, name, description, timezone, start_time, end_time, crosses_midnight, grace_minutes, is_active")
    .order("is_active", { ascending: false })
    .order("start_time", { ascending: true });
  if (error) {
    console.warn("[shiftsAdmin] fetchAllShiftTemplates error", error);
    return [];
  }
  return (data as ShiftTemplateFull[] | null) ?? [];
}

function buildTemplatePayload(
  input: ShiftTemplateInput,
): { payload: Record<string, unknown> } | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Shift name is required." };
  if (!input.start_time || !input.end_time) return { error: "Start and end time are required." };
  return {
    payload: {
      name,
      description: input.description?.trim() || null,
      timezone: input.timezone?.trim() || DEFAULT_SHIFT_TZ,
      start_time: input.start_time,
      end_time: input.end_time,
      // NOTE: crosses_midnight is a GENERATED column in the DB
      // (GENERATED ALWAYS AS (end_time <= start_time) STORED) — it must NOT be
      // sent in insert/update payloads or Postgres rejects the write. The DB
      // derives it; computeCrossesMidnight() is used only for the UI preview/badge.
      grace_minutes: Number.isFinite(input.grace_minutes) ? input.grace_minutes : 0,
      is_active: input.is_active ?? true,
    },
  };
}

export async function createShiftTemplate(
  input: ShiftTemplateInput,
): Promise<{ id: string } | { error: string }> {
  const built = buildTemplatePayload(input);
  if ("error" in built) return built;
  const { data, error } = await supabase
    .from("shift_templates")
    .insert(built.payload)
    .select("id")
    .single();
  if (error) {
    console.warn("[shiftsAdmin] createShiftTemplate error", error);
    return { error: error.message || "Could not create shift." };
  }
  return { id: (data as { id: string }).id };
}

export async function updateShiftTemplate(
  id: string,
  input: ShiftTemplateInput,
): Promise<{ ok: true } | { error: string }> {
  const built = buildTemplatePayload(input);
  if ("error" in built) return built;
  const { error } = await supabase
    .from("shift_templates")
    .update(built.payload)
    .eq("id", id);
  if (error) {
    console.warn("[shiftsAdmin] updateShiftTemplate error", error);
    return { error: error.message || "Could not update shift." };
  }
  return { ok: true };
}
