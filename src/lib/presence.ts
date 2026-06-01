import { supabase } from "./supabaseClient";

// Employee presence (Company OS). Green/orange/red is computed server-side in
// get_team_presence(): red = not clocked in, orange = clocked in & away,
// green = clocked in & available. Providers are excluded unless they are team_members.

export type AwayStatus = "available" | "away" | "break" | "lunch" | "washroom";
export type PresenceColor = "green" | "orange" | "red";

export interface PresenceRow {
  team_member_id: string;
  display_name: string;
  employee_code: string | null;
  display_picture_url: string | null;
  title: string | null;
  department: string | null;
  is_clocked_in: boolean;
  away_status: AwayStatus;
  away_reason: string | null;
  presence: PresenceColor;
  status_updated_at: string | null;
}

export const AWAY_OPTIONS: { value: AwayStatus; label: string; icon: string }[] = [
  { value: "available", label: "Available / Back", icon: "ri-checkbox-circle-line" },
  { value: "away", label: "Away", icon: "ri-walk-line" },
  { value: "break", label: "Break", icon: "ri-cup-line" },
  { value: "lunch", label: "Lunch", icon: "ri-restaurant-line" },
  { value: "washroom", label: "Washroom", icon: "ri-drop-line" },
];

export const PRESENCE_DOT: Record<PresenceColor, string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-red-400",
};

export const AWAY_LABEL: Record<AwayStatus, string> = {
  available: "Available",
  away: "Away",
  break: "On Break",
  lunch: "At Lunch",
  washroom: "Washroom",
};

// Roster with computed presence. Returns [] on error (never throws to the UI).
export async function fetchTeamPresence(): Promise<PresenceRow[]> {
  const { data, error } = await supabase.rpc("get_team_presence");
  if (error || !data) return [];
  return data as PresenceRow[];
}

// Current user sets their OWN away/available status. Returns true on success.
export async function setMyPresence(status: AwayStatus, reason?: string | null): Promise<boolean> {
  const { error } = await supabase.rpc("set_my_presence", {
    p_status: status,
    p_reason: reason ?? null,
  });
  return !error;
}

// The caller's own presence row (self-read via RLS ep_self_read). Returns null
// when no presence row exists yet (defaults to "available") or on error.
export interface MyPresence {
  status: AwayStatus;
  away_reason: string | null;
  updated_at: string | null;
}

export async function fetchMyPresence(teamMemberId: string): Promise<MyPresence | null> {
  const { data, error } = await supabase
    .from("employee_presence")
    .select("status, away_reason, updated_at")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (error) {
    console.warn("[presence] fetchMyPresence error", error);
    return null;
  }
  return (data as MyPresence | null) ?? null;
}

// Resolve the current user's own team_member id (null if they are not a team member).
export async function getMyTeamMemberId(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", uid)
    .eq("is_active", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
