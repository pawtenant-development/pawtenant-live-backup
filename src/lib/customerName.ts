// customerName — the SINGLE shared customer display-name resolver for the portal
// (CUSTOMER-PORTAL-NAME-PERSONALIZATION-FINAL-GATE-001).
//
// One place to answer "what name do we show this customer?" so no component
// invents conflicting logic. Names are NEVER derived from the email address
// (cool_human227@yahoo.com must never become "Cool Human"). Display-only
// normalization (trim + collapse whitespace, preserve capitalization); no DB
// mutation. An email accidentally stored in a name field is treated as no name.
//
// Precedence (per task §3):
//   1. Name saved directly on the order (first_name/last_name)
//   2. Customer profile associated with the authenticated account (if any)
//   3. That order's submitted intake/assessment answers
//   4. Auth-user metadata (full_name/name)
//   5. Safe fallback "Your Account" (email shown separately, never as a name)

export type NameSource = "order" | "profile" | "intake" | "auth_metadata" | "fallback";

export interface ResolvedName {
  fullName: string;
  firstName: string;
  source: NameSource;
  isFallback: boolean;
}

export interface NameOrderLike {
  first_name?: string | null;
  last_name?: string | null;
  assessment_answers?: Record<string, unknown> | null;
}
export interface NameProfileLike {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}
export interface NameUserLike {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export const NAME_FALLBACK = "Your Account";

/** Normalize a raw name value for DISPLAY: collapse whitespace, trim, keep
 *  capitalization. Returns null for blank OR email-looking values (an email
 *  accidentally stored as a name must never render as a name). */
export function cleanNamePart(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes("@")) return null; // email accidentally stored in a name field
  return t;
}

function combine(first: unknown, last: unknown): string | null {
  const f = cleanNamePart(first);
  const l = cleanNamePart(last);
  const full = [f, l].filter(Boolean).join(" ");
  return full || null;
}

function firstToken(full: string): string {
  return full.split(" ")[0] || full;
}

function asResolved(full: string | null, source: NameSource): ResolvedName | null {
  if (!full) return null;
  return { fullName: full, firstName: firstToken(full), source, isFallback: false };
}

/**
 * Resolve the display name for a single order (order-safe: this order's own name
 * first). Pure — no I/O. Pass `user` only when the viewer IS the order's customer
 * (never in admin "Customer View", to avoid the admin's metadata leaking onto a
 * nameless order).
 */
export function resolveCustomerDisplayName(
  order?: NameOrderLike | null,
  customerProfile?: NameProfileLike | null,
  user?: NameUserLike | null,
): ResolvedName {
  // 1) Name saved directly on the order.
  const fromOrder = asResolved(combine(order?.first_name, order?.last_name), "order");
  if (fromOrder) return fromOrder;

  // 2) Customer profile associated with the authenticated account (if provided).
  if (customerProfile) {
    const p = cleanNamePart(customerProfile.full_name) ?? combine(customerProfile.first_name, customerProfile.last_name);
    const r = asResolved(p, "profile");
    if (r) return r;
  }

  // 3) That order's submitted intake / assessment answers.
  const a = (order?.assessment_answers ?? {}) as Record<string, unknown>;
  const intake =
    cleanNamePart(a.fullName) ??
    cleanNamePart(a.name) ??
    combine(a.firstName, a.lastName) ??
    combine(a.first_name, a.last_name);
  const rIntake = asResolved(intake, "intake");
  if (rIntake) return rIntake;

  // 4) Auth-user metadata.
  const m = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const authName = cleanNamePart(m.full_name) ?? cleanNamePart(m.name) ?? combine(m.first_name, m.last_name);
  const rAuth = asResolved(authName, "auth_metadata");
  if (rAuth) return rAuth;

  // 5) Safe fallback. NEVER derive a name from the email local part.
  return { fullName: NAME_FALLBACK, firstName: NAME_FALLBACK, source: "fallback", isFallback: true };
}

export interface AccountGreeting {
  firstName?: string;
  fullName?: string;
  isFallback: boolean;
}

/**
 * Account-level greeting name. A customer may have several orders:
 *  - if their orders resolve to ONE first name (same person) → use it;
 *  - else fall back to the authenticated identity (profile / auth metadata);
 *  - else a neutral greeting (no name).
 * Order names are resolved order-scoped (order + intake only) so admin
 * "Customer View" greets the previewed customer — pass user = null in preview so
 * the admin's own metadata is never used.
 */
export function resolveAccountGreeting(
  orders?: NameOrderLike[] | null,
  customerProfile?: NameProfileLike | null,
  user?: NameUserLike | null,
): AccountGreeting {
  const resolved = (orders ?? [])
    .map((o) => resolveCustomerDisplayName(o, null, null)) // order-scoped, no viewer metadata
    .filter((r) => !r.isFallback);
  const distinctFirst = Array.from(new Set(resolved.map((r) => r.firstName.toLowerCase())));
  if (resolved.length > 0 && distinctFirst.length === 1) {
    return { firstName: resolved[0].firstName, fullName: resolved[0].fullName, isFallback: false };
  }
  // Orders disagree (or none) → authenticated identity.
  const identity = resolveCustomerDisplayName(null, customerProfile, user);
  if (!identity.isFallback) return { firstName: identity.firstName, fullName: identity.fullName, isFallback: false };
  return { isFallback: true };
}
