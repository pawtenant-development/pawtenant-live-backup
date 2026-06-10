// Unified staff/provider role resolver for login + route-guard redirects.
//
// Single source of truth = public.doctor_profiles (keyed by auth user_id):
//   • is_admin && is_active  → "admin"     (PawTenant internal staff/admin)
//   • row exists, !is_admin, is_active !== false → "provider"
//   • row exists, is_active === false → "inactive"
//   • no row → "none"  (customer or account with no staff/provider profile)
//
// This is a self-read (RLS lets a user read their own doctor_profiles row — the
// same read provider-portal and admin-orders already do). It is used ONLY to
// decide post-login redirects and route-guard bounces; the authoritative admin
// gate stays the service-role check-admin-status edge function. Customers are
// never in doctor_profiles, so they always resolve to "none" and never reach a
// staff or provider surface.
import { supabase } from "./supabaseClient";

export type StaffRole = "admin" | "provider" | "inactive" | "none";

export async function resolveStaffRole(userId: string): Promise<StaffRole> {
  if (!userId) return "none";
  const { data, error } = await supabase
    .from("doctor_profiles")
    .select("is_admin, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return "none";
  const p = data as { is_admin: boolean | null; is_active: boolean | null };
  if (p.is_active === false) return "inactive";
  return p.is_admin === true ? "admin" : "provider";
}
