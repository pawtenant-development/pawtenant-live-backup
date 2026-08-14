import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Authoritative client identity ────────────────────────────────────────────
// QR-VERIFICATION-TRUSTED-CLIENT-IP-AND-RATE-LIMIT-HARDENING-001 (F6).
//
// The previous key was
//   x-forwarded-for.split(",")[0]  ||  cf-connecting-ip  ||  "unknown"
// i.e. the FIRST entry of a header the caller can write. Anyone could send a
// fresh X-Forwarded-For per request and mint an unlimited number of buckets.
//
// WHAT THE HOSTED TEST GATEWAY ACTUALLY DOES — measured, not assumed:
//   • CF-Connecting-IP: a request that supplies its own is REJECTED BY THE EDGE
//     with a Cloudflare 403 in ~150ms; it never reaches this isolate. The value
//     that arrives here is therefore written by the platform, and a caller has
//     no way to influence it without being blocked outright.
//   • X-Forwarded-For, X-Real-IP, True-Client-IP, Forwarded: all pass through to
//     the isolate carrying whatever the caller wrote. NONE of them is
//     trustworthy, and X-Forwarded-For's first entry is the least trustworthy
//     of all — it is pure caller input.
//
// So: cf-connecting-ip is the ONE platform-controlled value, and it is the only
// thing used for identity here. X-Forwarded-For is never parsed — not the first
// entry, not the last. "Parse the trusted proxy chain correctly" resolves, on
// this platform, to "do not use the chain at all": there is no trusted-proxy
// count to peel, and inventing one would be exactly the unfounded proxy trust
// this task forbids.
//
// FALLBACK. If cf-connecting-ip is absent or unparseable we do NOT fall back to
// a caller-supplied header — that would reinstate the bypass. Every such request
// shares ONE bucket. The tradeoff is deliberate and it fails CLOSED: a platform
// change that stopped setting the header would throttle verification for
// everyone rather than silently disable the limiter. That is the safe direction
// for a public endpoint, and it is loud enough to notice.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const NO_IDENTITY_BUCKET = "no-platform-identity";

/** Strict IPv4. Rejects leading zeros, out-of-range octets and any extra text. */
function isIpv4(s: string): boolean {
  const p = s.split(".");
  if (p.length !== 4) return false;
  return p.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255);
}

/** IPv6, including the `::` compressed form and IPv4-mapped tails. */
function isIpv6(s: string): boolean {
  if (!/^[0-9A-Fa-f:.]+$/.test(s)) return false;
  if ((s.match(/::/g) ?? []).length > 1) return false;
  const zone = s.split("%")[0];
  const parts = zone.split(":");
  if (parts.length < 3 || parts.length > 9) return false;
  let sawV4 = false;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === "") continue;                       // from `::`
    if (seg.includes(".")) {
      if (i !== parts.length - 1 || !isIpv4(seg)) return false;
      sawV4 = true;
      continue;
    }
    if (!/^[0-9A-Fa-f]{1,4}$/.test(seg)) return false;
  }
  return zone.includes("::") || parts.length === 8 || (sawV4 && parts.length === 7);
}

/**
 * The rate-limit key for this request.
 *
 * IPv6 is bucketed by its /64 PREFIX, not the full address: a residential IPv6
 * allocation hands the client a whole /64, so keying on the full address would
 * let one client rotate through 2^64 buckets — the same bypass as a forged
 * header, just supplied by the ISP. IPv4 is keyed whole.
 */
function clientIdentity(req: Request): string {
  const raw = req.headers.get("cf-connecting-ip");
  // Bound before any parsing. 45 chars is the longest valid textual IPv6
  // (IPv4-mapped form); anything longer is not an address and is not worth
  // examining. This also caps the work an over-long header can cause.
  if (!raw || raw.length > 45) return NO_IDENTITY_BUCKET;
  const v = raw.trim();
  if (!v) return NO_IDENTITY_BUCKET;

  if (isIpv4(v)) return `4:${v}`;
  if (isIpv6(v)) {
    const zone = v.split("%")[0].toLowerCase();
    // Expand to 8 groups so the /64 prefix is taken from the real first four.
    const [head, tail] = zone.includes("::")
      ? zone.split("::").map((s) => (s ? s.split(":") : []))
      : [zone.split(":"), []];
    const fill = Array(Math.max(0, 8 - head.length - tail.length)).fill("0");
    const groups = [...head, ...fill, ...tail].slice(0, 8);
    return `6:${groups.slice(0, 4).map((g) => (g || "0").padStart(4, "0")).join(":")}`;
  }
  return NO_IDENTITY_BUCKET;
}

// ── In-memory pre-check ──────────────────────────────────────────────────────
// Aligned to the SAME tumbling window as the durable counter
// (floor(now/window)*window). The old map used first-contact + 60s, which drifts
// out of phase with the database window and produced 429s at the START of a
// fresh window from a burst a minute earlier — noise that made the durable
// limiter's real behaviour unreadable during testing.
const rateLimitMap = new Map<string, { count: number; window: number }>();

function checkRateLimit(key: string): boolean {
  const window = Math.floor(Date.now() / RATE_WINDOW_MS);
  const entry = rateLimitMap.get(key);
  if (!entry || entry.window !== window) {
    rateLimitMap.set(key, { count: 1, window });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Periodic GC for rate limit map
setInterval(() => {
  const window = Math.floor(Date.now() / RATE_WINDOW_MS);
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.window !== window) rateLimitMap.delete(key);
  }
}, 120_000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// A verification answer is a point-in-time statement about a letter that can be
// revoked or superseded at any moment. Nothing may cache it — a landlord must
// never be shown a "valid" that was true yesterday.
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "X-Robots-Tag": "noindex, nofollow",
};

// ONE message for every failure mode — unknown token, unknown ID, malformed
// input, missing input, RPC error. Distinct messages would let a caller sort
// guesses into "wrong shape" vs "right shape, no record", which is the first
// step of enumeration.
const NOT_FOUND_MSG = "We could not verify this letter.";

// Salted, truncated hash of the identity key. The raw IP is never sent to the
// database or written anywhere — the bucket key only needs to be stable and
// collision-resistant, not reversible. Salt falls back to the project ref so a
// missing env var cannot silently collapse every caller into one bucket.
const RL_SALT = Deno.env.get("VERIFICATION_RATE_LIMIT_SALT") ?? SUPABASE_URL;
async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${RL_SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Strict allowlist of fields that may be returned to the public ─────────────
// provider_phone and provider_email are allowed ONLY as the consent-gated
// snapshot the RPC emits (PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001).
// They are read from letter_verifications.provider_professional_* — a value the
// provider typed into a dedicated professional field AND explicitly approved for
// publication — never from doctor_profiles.email/.phone, which are the login
// address and an unlabelled number. The RPC strips a null contact key entirely,
// so an unapproved provider yields no key and the page renders no row.
// No patient name, email, diagnosis, or any PHI is ever included.
const PUBLIC_ALLOWED_FIELDS = new Set([
  "found",
  "status",
  "letter_id",
  "issued_at",
  "expires_at",
  "state",
  "letter_type",
  "provider_name",
  "provider_title",
  "provider_npi",
  "provider_license",
  "provider_state_licenses",
  "message",
  // ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §12: document-version
  // state. All non-PII — a version number, a lifecycle label, a boolean and a
  // date. The NEWER verification ID is deliberately absent: verify_letter_id
  // does not return it, so a superseded ID can never be used to discover the
  // current one.
  "document_version",
  "document_state",
  "has_newer_version",
  "superseded_at",
  // QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · Stage 1.
  // `patient_name_masked` is a DERIVED string ("J••• S••••") built by
  // mask_person_name() — first initial plus bullets. The stored name is never
  // returned by any code path; the only way to learn anything more is to
  // already know the name and submit it to the name-match action, which answers
  // with a boolean.
  "is_demo",
  "patient_name_masked",
  "patient_name_checkable",
  // PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001. Present only when the
  // issuing provider approved that exact value for publication; the demo branch
  // of the RPC never emits either key.
  "provider_phone",
  "provider_email",
]);

// Deliberately NOT allowlisted, and worth naming so a future edit has to argue
// with this list rather than quietly add one: patient first/last name, email,
// phone, address, date of birth, diagnosis, intake answers, clinical notes,
// order id, confirmation id, price, payment status, storage paths, file URLs,
// the provider's login/recovery email, the legacy unlabelled doctor_profiles
// phone, any unapproved professional contact value, internal audit ids.

type PublicVerifyResult = {
  found: boolean;
  status?: "valid" | "revoked" | "expired" | "superseded" | "demo" | "not_found" | "rate_limited";
  is_demo?: boolean;
  patient_name_masked?: string | null;
  patient_name_checkable?: boolean;
  letter_id?: string;
  issued_at?: string;
  expires_at?: string | null;
  state?: string;
  letter_type?: string;
  provider_name?: string | null;
  provider_title?: string | null;
  provider_npi?: string | null;
  provider_license?: string | null;
  provider_state_licenses?: Record<string, string> | null;
  /** Consent-gated snapshot. Absent — not null — when unapproved, so the page renders no row. */
  provider_phone?: string;
  provider_email?: string;
  message?: string;
  document_version?: number;
  document_state?: "active" | "superseded" | "revoked" | "expired";
  has_newer_version?: boolean;
  superseded_at?: string | null;
};

/**
 * Strips any field not in PUBLIC_ALLOWED_FIELDS from the RPC result.
 * This is a defence-in-depth measure — the RPC itself no longer returns
 * phone/email, but this ensures nothing leaks even if the RPC is ever
 * modified without updating this function.
 */
function applyAllowlist(raw: Record<string, unknown>): PublicVerifyResult {
  const safe: Record<string, unknown> = {};
  for (const key of PUBLIC_ALLOWED_FIELDS) {
    if (key in raw) safe[key] = raw[key];
  }
  return safe as PublicVerifyResult;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // The ONE authoritative identity, used consistently by both limiter stages.
  // Never logged, never stored, never returned.
  const ip = clientIdentity(req);

  const rlClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Rate limit ───────────────────────────────────────────────────────────
  // In-memory first (free, catches a burst inside one isolate), then the
  // DURABLE counter. The in-memory map alone was not protection: Supabase
  // spreads requests across isolates and recycles them, so a measured 15
  // rapid requests all passed a declared 10/60s limit. The DB counter is the
  // one that actually holds.
  //
  // BOTH stages return BEFORE any audit write. A throttled caller must not be
  // able to drive audit_logs inserts — that would turn the limiter into an
  // amplifier instead of a brake.
  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ found: false, status: "rate_limited", message: "Too many requests. Please try again in a moment." }),
      { status: 429, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
    );
  }
  try {
    const { data: rl } = await rlClient.rpc("check_verification_rate_limit", {
      p_ip_hash: await hashIp(ip),
      p_limit: 10,
      p_window_seconds: 60,
    });
    if (rl && (rl as { allowed?: boolean }).allowed === false) {
      return new Response(
        JSON.stringify({ found: false, status: "rate_limited", message: "Too many requests. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    // A limiter outage must not take verification offline for landlords — the
    // in-memory check above still applies. Logged so the gap is visible.
    console.error("[verify-letter] durable rate limit unavailable:", e);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  // Two identifiers resolve the same record:
  //   • `token`     — the opaque 22-char base64url value encoded in the QR.
  //   • `letter_id` — the human Verification ID, used by the manual lookup form
  //                   and by the sample/QA QR codes. Every historical ID works.
  // `action: "name_match"` answers the privacy-safe patient-name check and
  // returns ONLY a boolean.
  let letterId = "";
  let token = "";
  let action = "verify";
  let nameInput = "";
  try {
    const body = await req.json() as {
      letter_id?: string; token?: string; action?: string; name?: string;
    };
    letterId = (body.letter_id ?? "").trim().toUpperCase();
    token = (body.token ?? "").trim();
    action = (body.action ?? "verify").trim();
    nameInput = (body.name ?? "").trim();
  } catch {
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: NOT_FOUND_MSG }),
      { status: 400, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
    );
  }

  // The token is fixed-shape; rejecting a malformed one before it reaches the
  // database keeps junk out of the query path without revealing whether any
  // particular well-formed token exists.
  if (token && !/^[A-Za-z0-9_-]{22}$/.test(token)) {
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: NOT_FOUND_MSG }),
      { status: 200, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
    );
  }

  if (!letterId && !token) {
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: NOT_FOUND_MSG }),
      { status: 200, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
    );
  }

  const supabase = rlClient;

  // ── Patient-name match ───────────────────────────────────────────────────
  // Returns { checked, matches } and nothing else — never the stored name, and
  // never any of the verification fields, so it cannot be used as a second
  // read path around the allowlist.
  if (action === "name_match") {
    const { data: nm, error: nmErr } = await supabase.rpc("verify_letter_name_match", {
      p_name: nameInput,
      p_token: token || null,
      p_letter_id: letterId || null,
    });
    if (nmErr) {
      console.error("[verify-letter] name_match RPC error:", nmErr.message);
      return new Response(
        JSON.stringify({ checked: false, matches: false, message: NOT_FOUND_MSG }),
        { status: 200, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
      );
    }
    const raw = (nm ?? {}) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        checked: raw.checked === true,
        matches: raw.matches === true,
        ...(typeof raw.message === "string" ? { message: raw.message } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
    );
  }

  const { data, error } = await supabase.rpc("verify_letter_public", {
    p_token: token || null,
    p_letter_id: letterId || null,
  });

  if (error) {
    console.error("[verify-letter] RPC error:", error.message);
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: NOT_FOUND_MSG }),
      { status: 200, headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" } }
    );
  }

  // Apply strict allowlist — strips any field not explicitly permitted
  const result = applyAllowlist(data as Record<string, unknown>);

  // Audit log — safe operational metadata only. Never store or log the raw
  // token, submitted identifier, patient/provider/clinical data, URLs, paths,
  // IP addresses, forwarded headers, or a fingerprint derived from them.
  //
  // Hits may record the server-resolved Verification ID and product. Misses
  // deliberately record no identifier, preserving response indistinguishability.
  try {
    const auditMetadata: Record<string, unknown> = {
      lookup_method: token ? "qr_token" : "manual_id",
      result: result.found ? (result.status ?? "found") : "not_found",
      ...(result.found ? {
        letter_id: result.letter_id ?? null,
        letter_type: result.letter_type ?? null,
        is_demo: result.is_demo === true,
      } : {}),
    };

    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_name: "Public verifier",
      actor_type: "system",
      actor_role: "public_endpoint",
      object_type: "letter_verification",
      object_id: result.letter_id ?? null,
      action: "landlord_verification_lookup",
      description: "Public verification lookup completed",
      source: "verify-letter",
      entity_type: "letter_verification",
      entity_id: result.letter_id ?? null,
      metadata: auditMetadata,
    });

    if (auditError) {
      console.error("[verify-letter] audit insert failed", { code: auditError.code });
    }
  } catch {
    // Verification availability is more important than audit availability.
    // The fixed message makes the failure observable without logging request data.
    console.error("[verify-letter] audit insert threw");
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, ...NO_STORE, "Content-Type": "application/json" },
  });
});
