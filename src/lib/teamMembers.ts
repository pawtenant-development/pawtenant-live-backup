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
}

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
