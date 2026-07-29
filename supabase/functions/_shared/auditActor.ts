// auditActor — resolve WHO is performing a server action, from the request.
//
// PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §16.
//
// The rule this module exists to enforce: audit attribution is derived from the
// caller's JWT, never from a field in the request body. Several admin endpoints
// previously accepted a `sentBy` STRING and wrote it straight into the record —
// a forgeable actor name that also made an automated send indistinguishable
// from a human one.
//
// A caller presenting no user token, the anon key, or the service-role key is
// recorded honestly as an AUTOMATED actor. It is never attributed to a person,
// and it is never guessed from the order's current assignee.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ActorType = "employee" | "admin" | "provider" | "customer" | "system" | "webhook";

export interface AuditActor {
  /** auth.users.id, or null for an automated actor. */
  id: string | null;
  /** Display name snapshotted at the time of the action. */
  name: string;
  /** doctor_profiles.role, or a synthetic role for automated actors. */
  role: string;
  type: ActorType;
  /** True when a real authenticated person was resolved. */
  isHuman: boolean;
}

export const SYSTEM_ACTOR: AuditActor = {
  id: null,
  name: "PawTenant System",
  role: "system",
  type: "system",
  isHuman: false,
};

export function webhookActor(name = "Stripe Webhook"): AuditActor {
  return { id: null, name, role: "system", type: "webhook", isHuman: false };
}

/**
 * Resolve the acting user from the Authorization header.
 *
 * `client` must be a SERVICE-ROLE client — auth.getUser(token) is used to
 * validate the presented JWT, and doctor_profiles is read to snapshot the
 * display name and role.
 */
export async function resolveAuditActor(
  req: Request,
  client: ReturnType<typeof createClient>,
): Promise<AuditActor> {
  const header = req.headers.get("Authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // A machine key is an automated caller, not a person.
  if (!bearer || (anonKey && bearer === anonKey) || (serviceKey && bearer === serviceKey)) {
    return SYSTEM_ACTOR;
  }

  try {
    const { data, error } = await client.auth.getUser(bearer);
    const user = data?.user;
    if (error || !user) return SYSTEM_ACTOR;

    const { data: prof } = await client
      .from("doctor_profiles")
      .select("full_name, role, is_admin, is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    const p = prof as
      | { full_name?: string; role?: string; is_admin?: boolean; is_active?: boolean }
      | null;

    // Someone with an auth account but no staff/provider profile is a CUSTOMER.
    if (!p) {
      return {
        id: user.id,
        name: user.email ?? "Customer",
        role: "customer",
        type: "customer",
        isHuman: true,
      };
    }

    const isAdmin = p.is_admin === true;
    return {
      id: user.id,
      name: (p.full_name ?? "").trim() || user.email || "Employee",
      role: (p.role ?? "").trim() || (isAdmin ? "admin" : "provider"),
      type: isAdmin ? "employee" : "provider",
      isHuman: true,
    };
  } catch {
    return SYSTEM_ACTOR;
  }
}

/** Last 4 digits only — an audit trail never needs a full phone number. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

/** j•••@example.com — enough to identify the recipient without storing it. */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "•••";
  return `${e[0]}•••${e.slice(at)}`;
}
