/**
 * staffAccess — the browser's view of Company OS authority.
 *
 * PAWTENANT-SEO-EDITOR-RBAC-AND-ADMIN-ESCALATION-HARDENING-001
 *
 * WHY THIS FILE EXISTS
 * Until this task, the admin UI decided what you could see by reading
 * doctor_profiles.role / is_admin / custom_tab_access straight out of the
 * browser — columns the signed-in account could WRITE. A provider could grant
 * themselves any tab, and any customer could insert themselves an admin profile.
 *
 * Authority now lives in private.staff_authority, which no browser role can read
 * or write. The only way to see it is `current_staff_access()`, which returns
 * the CALLER'S own access and nothing else, and the only way to change it is
 * `admin_set_staff_access()`, which verifies the caller is an owner or admin
 * manager before it does anything.
 *
 * Hiding a nav item is NOT the security boundary — every endpoint and every RLS
 * policy re-checks — but the nav and the backend now read the same table, so
 * they can no longer disagree about who may do what.
 */

import { supabase } from "@/lib/supabaseClient";

export type StaffRole = "owner" | "admin_manager" | "support" | "finance" | "read_only" | "provider";

export interface StaffAccess {
  /** null when the signed-in user is not staff at all (customer, or revoked). */
  accessRole: StaffRole | null;
  /** Explicit tab override. null means "use the role defaults". */
  tabAccess: string[] | null;
  /** Any staff role except `provider`. Matches check_is_admin() exactly. */
  isAdmin: boolean;
  /** owner / admin_manager only. Matches is_admin_level() exactly. */
  isAdminLevel: boolean;
}

export const NO_STAFF_ACCESS: StaffAccess = {
  accessRole: null,
  tabAccess: null,
  isAdmin: false,
  isAdminLevel: false,
};

/** `custom_tab_access` is stored as jsonb, so it arrives as an array or as null. */
function toTabArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return null;
}

/**
 * The signed-in user's effective access, resolved BY THE SERVER.
 *
 * Returns NO_STAFF_ACCESS on any failure. Failing closed matters here: a
 * transient network error must not be the reason a nav item appears.
 */
export async function fetchStaffAccess(): Promise<StaffAccess> {
  try {
    const { data, error } = await supabase.rpc("current_staff_access");
    if (error || !data) return NO_STAFF_ACCESS;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return NO_STAFF_ACCESS;
    return {
      accessRole: (row.access_role ?? null) as StaffRole | null,
      tabAccess: toTabArray(row.tab_access),
      isAdmin: row.is_admin === true,
      isAdminLevel: row.is_admin_level === true,
    };
  } catch {
    return NO_STAFF_ACCESS;
  }
}

/**
 * Grant or change a team member's access.
 *
 * The ONLY write path. It cannot be called for yourself, it refuses a caller who
 * is not an owner or admin manager, and it writes the authority table and the
 * doctor_profiles mirror in one transaction so they cannot drift.
 */
export async function setStaffAccess(opts: {
  userId: string;
  accessRole: StaffRole;
  tabAccess?: string[] | null;
  revoke?: boolean;
  // One shape rather than a discriminated union: this project sets
  // strictNullChecks:false, where `{ok:true} | {ok:false; error:string}` does
  // not narrow on `result.ok`, and every call site would fail to compile.
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("admin_set_staff_access", {
    p_user_id: opts.userId,
    p_access_role: opts.accessRole,
    p_tab_access: opts.tabAccess ?? null,
    p_revoke: opts.revoke ?? false,
  });
  if (error) {
    // The RPC's own messages are written for an operator, so surface them rather
    // than replacing them with something vaguer.
    const message = /staff_access_no_self_change/.test(error.message)
      ? "You cannot change your own access. Ask another owner or admin manager."
      : /staff_access_forbidden/.test(error.message)
        ? "Only an owner or admin manager can change staff access."
        : error.message;
    return { ok: false, error: message };
  }
  return data ? { ok: true } : { ok: false, error: "No response from the access service." };
}

/** The tab key for the SEO Editor, in the same vocabulary as every other tab. */
export const SEO_EDITOR_TAB = "seo_editor";

/**
 * Role defaults, mirroring ROLE_DEFAULT_TABS in TeamTab and getVisibleTabs() in
 * admin-orders/page.tsx. Kept here too so a surface that has no access to those
 * (the standalone /admin-seo-editor route) resolves visibility identically.
 */
const ROLE_DEFAULT_SEO_EDITOR: ReadonlySet<StaffRole> = new Set<StaffRole>(["owner", "admin_manager"]);

/**
 * May this user open the SEO Editor workbench?
 *
 * An owner or admin manager always can, with no seo_editor_accounts row and no
 * explicit tab grant — that is owner decision #1. Anyone else needs the
 * `seo_editor` tab in their explicit override.
 */
export function canUseSeoEditor(access: StaffAccess): boolean {
  if (!access.accessRole) return false;
  if (access.tabAccess && access.tabAccess.length > 0) {
    return access.tabAccess.includes(SEO_EDITOR_TAB);
  }
  return ROLE_DEFAULT_SEO_EDITOR.has(access.accessRole);
}

/**
 * May this user approve, publish or roll back?
 *
 * Owner / admin manager only. A team member with the SEO Editor tab drafts and
 * submits; they never approve their own work.
 */
export function canApproveSeoContent(access: StaffAccess): boolean {
  return access.isAdminLevel;
}
