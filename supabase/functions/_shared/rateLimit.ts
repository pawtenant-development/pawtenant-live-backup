// _shared/rateLimit.ts
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §I
//
// Narrow rate limiting for the resume-credential endpoints. One helper, so
// every endpoint throttles the same way and the guard has one call pattern.
//
// PRIVACY MODEL
//   • The subject (an IP, an admin user id, a confirmation reference) is NEVER
//     sent to the database in the clear. We send HMAC-SHA256(subject, pepper).
//   • A plain sha256 would be inadequate: the IPv4 space is ~2^32, so a table
//     dump would be trivially reversible by brute force. The pepper is a
//     server-side secret that never leaves the function environment, so the
//     stored key is not reversible without it.
//   • Retention is bounded — rows carry `expires_at` and are purged on write.
//   • Raw tokens are NEVER used as a subject. Where a token needs throttling we
//     use its sha256 digest, which is already the only form the DB ever sees.

export type RateLimitScope = "exchange" | "request_new_link" | "issue_admin" | "bridge";

/**
 * Documented limits. Chosen so a genuine customer never trips them:
 * a real recovery click is one exchange, plus maybe a refresh or two.
 */
export const RESUME_RATE_LIMITS: Record<
  RateLimitScope,
  { windowSeconds: number; maxAttempts: number }
> = {
  // IP-keyed default. Deliberately GENEROUS.
  //
  // Mobile carriers and corporate networks put thousands of unrelated users
  // behind one CGNAT address, so a tight per-IP limit locks out real customers
  // long before it inconveniences an attacker. And it buys little: a resume
  // token is 256 bits of CSPRNG entropy, so online guessing is infeasible at
  // any rate. This bucket exists to bound resource abuse, not to be the lock.
  // The meaningful limits are the per-subject ones passed explicitly below.
  exchange: { windowSeconds: 600, maxAttempts: 60 },
  request_new_link: { windowSeconds: 900, maxAttempts: 30 },
  // Authenticated staff doing bulk lead recovery legitimately click a lot.
  issue_admin: { windowSeconds: 600, maxAttempts: 60 },
  // The SMS click bridge — one hop per click.
  bridge: { windowSeconds: 600, maxAttempts: 20 },
};

/**
 * Per-subject overrides — the buckets that actually carry the security weight,
 * because they are keyed on a specific token or order reference rather than on
 * a shared network address, and so cannot punish an innocent bystander.
 */
export const RESUME_SUBJECT_LIMITS = {
  /** One single-use token. A genuine click uses it once. */
  perToken: { windowSeconds: 600, maxAttempts: 10 },
  /**
   * One confirmation reference. This is the bucket that bounds the residual
   * existence / paid-state oracle on a known order number.
   */
  perConfirmationRef: { windowSeconds: 900, maxAttempts: 5 },
} as const;

/**
 * The pepper. `RESUME_RATE_LIMIT_PEPPER` when set; otherwise derived from the
 * service-role key, which is already a deployment secret of equal sensitivity.
 * Falls back to a constant ONLY in a misconfigured environment — in that case
 * the limiter still functions, it just loses reversal resistance.
 */
function pepper(): string {
  return (
    Deno.env.get("RESUME_RATE_LIMIT_PEPPER") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "pawtenant-resume-rate-limit"
  );
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Best-effort client IP. Supabase sits behind a proxy, so the left-most
 * x-forwarded-for entry is the caller. Never logged, never stored raw.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

interface RateLimitClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
}

/**
 * Consume one unit of budget.
 *
 * Returns TRUE when the caller may proceed, FALSE when it must be throttled.
 *
 * FAILS OPEN on infrastructure error, deliberately: a limiter outage must not
 * take down a customer's ability to resume their own paid-for order. The
 * credential itself (256-bit, single-use, expiring) remains the actual security
 * boundary — the limiter is defence in depth, not the lock.
 */
export async function consumeRateLimit(
  admin: RateLimitClient,
  scope: RateLimitScope,
  subject: string,
  /** Override the scope default — used for the per-token / per-reference buckets. */
  limits?: { windowSeconds: number; maxAttempts: number },
): Promise<boolean> {
  try {
    const { windowSeconds, maxAttempts } = limits ?? RESUME_RATE_LIMITS[scope];
    const bucketKey = await hmacSha256Hex(pepper(), `${scope}:${subject}`);
    const { data, error } = await admin.rpc("consume_resume_rate_limit", {
      p_bucket_key: bucketKey,
      p_scope: scope,
      p_window_seconds: windowSeconds,
      p_max_attempts: maxAttempts,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
