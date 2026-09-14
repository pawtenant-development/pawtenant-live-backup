// partnerRoles — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// FIRST RELEASE: exactly one partner role, "Partner user".
//
// The database keeps its two legacy values (`partner_admin`, `partner_staff`;
// check constraint on public.partner_users.role, no migration in this task).
// Nothing gates on the distinction — no RPC, no RLS policy, no edge function
// and no UI branch reads `current_partner_role()` for anything but a label —
// so both values are the SAME effective role. New memberships are written
// with FIRST_RELEASE_PARTNER_ROLE; existing rows keep whichever value they
// have and are displayed identically. Tenant isolation is unchanged: it comes
// from `partner_users.partner_id` via `current_partner_id()`, never from role.

export const FIRST_RELEASE_PARTNER_ROLE = "partner_admin" as const;

/** Every legacy value the column accepts. Both mean "Partner user". */
export const LEGACY_PARTNER_ROLE_VALUES = ["partner_admin", "partner_staff"] as const;

export const PARTNER_USER_ROLE_LABEL = "Partner user";

/** The one label every partner membership is shown with, whatever the stored value. */
export function partnerRoleLabel(_role: string | null | undefined): string {
  return PARTNER_USER_ROLE_LABEL;
}
