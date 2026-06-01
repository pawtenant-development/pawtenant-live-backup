/**
 * Company OS — Permission bundle foundation (COS-045 Phase 1).
 *
 * This module defines the *capability* layer of the Company OS RBAC story.
 *
 * Two-axis design (Doc 02 / COS-045 plan):
 *   1. Operational RBAC               — doctor_profiles.role + is_admin
 *      (login, admin portal access, getVisibleTabs, edge-function role
 *      checks). Owned by the existing system. NOT touched in Phase 1.
 *   2. Capability layer (this module) — team_members.permission_bundle
 *      + permission_addons[] + permission_removed[]. Decides "can this
 *      employee do <X>?" at the action level.
 *
 * Phase 1 ships the resolver and the data columns. NOTHING reads it yet —
 * tab visibility, role checks, and RLS all stay exactly as before. Phase 2
 * (separate task) will swap role-literal checks for hasPermission() one
 * site at a time, behind a feature flag.
 *
 * The bundle map is *the* single source of truth. Do not invent new bundle
 * names without adding them to BundleKey + BUNDLE_KEYS at the same time.
 */

/**
 * Atomic capability flags. Stable identifiers — never repurpose. Keys are
 * `domain.action`, lowercase, dot-separated. Add new keys here as features
 * land.
 *
 * `team.delete_owner` is a hard-fenced key that only the `founder` bundle
 * may carry; the resolver strips it from anyone else even if added via
 * `permission_addons`.
 */
export type PermissionKey =
  // orders
  | "orders.view"
  | "orders.edit"
  | "orders.delete"
  | "orders.assign_provider"
  | "orders.bulk_actions"
  // chats
  | "chats.view"
  | "chats.reply"
  | "chats.claim"
  | "chats.reassign"
  | "chats.resolve"
  | "chats.reopen"
  // contacts
  | "contacts.view"
  | "contacts.reply"
  // customers
  | "customers.view"
  | "customers.edit"
  // providers
  | "providers.view"
  | "providers.edit"
  | "providers.approve"
  | "providers.payouts.view"
  | "providers.payouts.process"
  // refunds (two-step approval — see Doc 10 / COS-030)
  | "refunds.request"
  | "refunds.approve"
  | "refunds.process"
  // finance / payments
  | "finance.view"
  | "finance.process"
  | "payments.view"
  | "payments.process"
  | "earnings.view"
  | "earnings.process"
  // documents / verification
  | "documents.view"
  | "documents.verify"
  // comms
  | "comms.view"
  | "comms.send"
  | "comms.broadcast"
  // team / HR
  | "team.view"
  | "team.manage"
  | "team.delete_owner" // hard-fenced — founder bundle only
  // settings
  | "settings.view"
  | "settings.manage"
  // audit
  | "audit.view"
  // health / runbook
  | "health.view"
  | "health.alerts.manage"
  // commissions (future — see COS-031)
  | "commissions.view"
  | "commissions.approve";

/**
 * Named permission bundles. Stored as plain text in
 * `team_members.permission_bundle`. Keep this list in sync with the
 * BUNDLE_KEYS map below.
 *
 * `provider` is an explicit empty bundle so future code can confidently
 * say "if bundle === 'provider' deny all admin keys" — providers do not
 * use team_members today, but the placeholder is reserved.
 */
export type BundleKey =
  | "founder"
  | "admin_manager"
  | "support"
  | "sales"
  | "operations"
  | "finance"
  | "provider_management"
  | "read_only"
  | "provider";

/** Hard-fenced permission keys — only the listed bundles may carry them. */
const HARD_FENCED: ReadonlyMap<PermissionKey, ReadonlySet<BundleKey>> = new Map([
  ["team.delete_owner", new Set<BundleKey>(["founder"])],
]);

/**
 * The full set of permission keys. Used to materialise the `founder`
 * bundle (which carries everything except hard fences that don't apply,
 * which today is none — `team.delete_owner` IS a founder fence).
 */
const ALL_KEYS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  "orders.view",
  "orders.edit",
  "orders.delete",
  "orders.assign_provider",
  "orders.bulk_actions",
  "chats.view",
  "chats.reply",
  "chats.claim",
  "chats.reassign",
  "chats.resolve",
  "chats.reopen",
  "contacts.view",
  "contacts.reply",
  "customers.view",
  "customers.edit",
  "providers.view",
  "providers.edit",
  "providers.approve",
  "providers.payouts.view",
  "providers.payouts.process",
  "refunds.request",
  "refunds.approve",
  "refunds.process",
  "finance.view",
  "finance.process",
  "payments.view",
  "payments.process",
  "earnings.view",
  "earnings.process",
  "documents.view",
  "documents.verify",
  "comms.view",
  "comms.send",
  "comms.broadcast",
  "team.view",
  "team.manage",
  "team.delete_owner",
  "settings.view",
  "settings.manage",
  "audit.view",
  "health.view",
  "health.alerts.manage",
  "commissions.view",
  "commissions.approve",
]);

/**
 * Bundle → capabilities map. Single source of truth.
 *
 * Founder owns everything. Admin Manager owns everything except the
 * owner-only delete fence. Each line-of-business bundle is intentionally
 * narrow.
 */
export const BUNDLE_KEYS: Readonly<Record<BundleKey, ReadonlySet<PermissionKey>>> = {
  founder: ALL_KEYS,

  admin_manager: new Set<PermissionKey>([
    ...Array.from(ALL_KEYS).filter((k) => k !== "team.delete_owner"),
  ]),

  support: new Set<PermissionKey>([
    "orders.view",
    "orders.edit",
    "orders.assign_provider",
    "chats.view",
    "chats.reply",
    "chats.claim",
    "contacts.view",
    "contacts.reply",
    "customers.view",
    "comms.view",
    "comms.send",
    "audit.view",
  ]),

  // analytics.* keys arrive in a later phase; sales sees the same comms +
  // customer surface as today via the comms.view / customers.view keys.
  sales: new Set<PermissionKey>([
    "orders.view",
    "orders.edit",
    "chats.view",
    "chats.reply",
    "contacts.view",
    "contacts.reply",
    "customers.view",
    "comms.view",
    "comms.send",
  ]),

  operations: new Set<PermissionKey>([
    "orders.view",
    "orders.edit",
    "orders.assign_provider",
    "providers.view",
    "providers.edit",
    "documents.view",
    "documents.verify",
    "health.view",
    "audit.view",
  ]),

  finance: new Set<PermissionKey>([
    "payments.view",
    "payments.process",
    "refunds.request",
    "refunds.approve",
    "refunds.process",
    "earnings.view",
    "earnings.process",
    "finance.view",
    "finance.process",
    "audit.view",
  ]),

  provider_management: new Set<PermissionKey>([
    "providers.view",
    "providers.edit",
    "providers.approve",
    "providers.payouts.view",
    "providers.payouts.process",
    "documents.verify",
    "audit.view",
  ]),

  read_only: new Set<PermissionKey>([
    "orders.view",
    "chats.view",
    "contacts.view",
    "customers.view",
    "comms.view",
    "audit.view",
    "health.view",
  ]),

  // Providers do not use the admin capability layer. Empty bundle is
  // intentional and explicit.
  provider: new Set<PermissionKey>(),
};

/** Minimal shape this module needs from a team_members row. */
export interface PermissionMember {
  permission_bundle: BundleKey | string | null;
  permission_addons: string[] | null;
  permission_removed: string[] | null;
}

/**
 * Resolve a member's effective capability set.
 *
 * Order of operations:
 *   1. Start from BUNDLE_KEYS[bundle] (empty if bundle is unknown / null).
 *   2. Subtract permission_removed[].
 *   3. Add permission_addons[].
 *   4. Strip hard-fenced keys whose bundle is not in their allow-list,
 *      regardless of addons. `team.delete_owner` for non-founder is the
 *      canonical case.
 *
 * Unknown / malformed strings in addons / removed are silently ignored —
 * defence in depth so a typo can't grant unintended power.
 */
export function getEffectivePermissions(
  member: PermissionMember | null | undefined,
): ReadonlySet<PermissionKey> {
  if (!member) return new Set<PermissionKey>();

  const bundle = (member.permission_bundle ?? "") as BundleKey;
  const baseSet = BUNDLE_KEYS[bundle] ?? new Set<PermissionKey>();
  const result = new Set<PermissionKey>(baseSet);

  // 2. Subtract removed[]
  for (const key of member.permission_removed ?? []) {
    if (typeof key === "string" && (result as Set<PermissionKey>).has(key as PermissionKey)) {
      result.delete(key as PermissionKey);
    }
  }

  // 3. Add addons[] — only if the string is a known PermissionKey.
  for (const key of member.permission_addons ?? []) {
    if (typeof key === "string" && ALL_KEYS.has(key as PermissionKey)) {
      result.add(key as PermissionKey);
    }
  }

  // 4. Hard fences — strip any fenced key whose bundle isn't allowed,
  //    even if it was added via addons.
  for (const [fencedKey, allowedBundles] of HARD_FENCED) {
    if (result.has(fencedKey) && !allowedBundles.has(bundle)) {
      result.delete(fencedKey);
    }
  }

  return result;
}

/**
 * Convenience predicate. Returns false for null/undefined members and for
 * unknown keys.
 */
export function hasPermission(
  member: PermissionMember | null | undefined,
  key: PermissionKey,
): boolean {
  return getEffectivePermissions(member).has(key);
}

/**
 * Type guard for a string that is a known BundleKey. Useful when reading
 * `team_members.permission_bundle` from the DB before passing to the
 * resolver.
 */
export function isBundleKey(value: unknown): value is BundleKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BUNDLE_KEYS, value)
  );
}

/**
 * Sorted list of all known bundle keys. Useful for admin UI dropdowns
 * later. Excludes `provider` if `includeProvider=false`, since providers
 * don't use the admin capability layer.
 */
export function listBundleKeys(includeProvider = false): BundleKey[] {
  const keys = Object.keys(BUNDLE_KEYS) as BundleKey[];
  return includeProvider ? keys : keys.filter((k) => k !== "provider");
}
