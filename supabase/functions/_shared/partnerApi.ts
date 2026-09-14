// _shared/partnerApi.ts
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 -- transport, authentication,
// canonicalisation and error vocabulary for the partner intake API.
//
// Zeek/PawTenant SUPPLIES this API; the partner is the client. The partner
// never receives a Supabase service_role key, a database credential, or direct
// table access -- they get a key id + secret and these endpoints.
//
// THE FAIL-CLOSED ORDER OF OPERATIONS (this ordering is the security model):
//   1. reject non-TLS
//   2. reject oversized bodies BEFORE parsing
//   3. authenticate the credential (verified inside the database)
//   4. rate-limit
//   5. only THEN read or write anything clinical
// The function runs with verify_jwt=false because the partner presents an API
// key rather than a Supabase JWT, exactly like stripe-webhook and the ghl-*
// functions. That makes step 3 the ONLY thing standing in front of PHI, so it
// happens before any order, assessment or customer row is touched.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PARTNER_API_VERSION = "v1";
export const PARTNER_ASSESSMENT_SCHEMA_VERSION = "partner.assessment.v1";

// ── Slice 7: the canonical partner PSD contract ─────────────────────────────
// A partner PSD order must be submitted under THIS versioned contract, which
// is the retail 'psd_v1' clinical question catalog verbatim. The generic
// vocabulary of partner.assessment.v1 (primaryConcern, symptomDescription,
// durationOfSymptoms, …) carries no clinical equivalence and is NEVER mapped
// into clinical answers.
export const PARTNER_PSD_SCHEMA_VERSION = "partner.assessment.psd.v1";
/** The canonical retail version partner PSD answers are normalized onto. */
export const PSD_TARGET_ASSESSMENT_VERSION = "psd_v1";

/** Hard ceiling applied before parsing. Per-credential limits may be lower. */
export const ABSOLUTE_MAX_PAYLOAD_BYTES = 256 * 1024;

// ── Error vocabulary ────────────────────────────────────────────────────────
// Stable, documented, machine-readable codes. Deliberately coarse: a partner
// integrator needs to know what to fix, and an attacker must learn nothing
// about our schema, our SQL or another partner's data.

export const PARTNER_ERRORS = {
  tls_required:            { status: 400, message: "Requests must be made over TLS." },
  unauthenticated:         { status: 401, message: "Missing or invalid partner credentials." },
  credential_revoked:      { status: 401, message: "Missing or invalid partner credentials." },
  forbidden_scope:         { status: 403, message: "This credential is not permitted to perform that operation." },
  partner_not_active:      { status: 403, message: "This partner account is not permitted to transact." },
  rate_limited:            { status: 429, message: "Too many requests. Retry after the window resets." },
  payload_too_large:       { status: 413, message: "Request body exceeds the permitted size." },
  malformed_json:          { status: 400, message: "Request body is not valid JSON." },
  schema_violation:        { status: 422, message: "Request body does not match the documented schema." },
  idempotency_key_required:{ status: 400, message: "An Idempotency-Key header is required." },
  idempotency_conflict:    { status: 409, message: "This Idempotency-Key was already used with a different payload." },
  partner_order_id_required:{status: 422, message: "partner_order_id is required." },
  partner_order_conflict:  { status: 409, message: "This partner_order_id already exists with different content." },
  payment_not_paid:        { status: 422, message: "Orders may only be submitted once payment status is 'paid'." },
  service_unsupported:     { status: 422, message: "The requested service is not enabled for this partner." },
  state_unsupported:       { status: 422, message: "The customer's state is not currently serviceable." },
  no_provider_coverage:    { status: 422, message: "No licensed provider is currently available for that state." },
  consent_missing:         { status: 422, message: "Required consent evidence is missing." },
  assessment_incomplete:   { status: 422, message: "Required assessment information is missing." },
  assessment_schema_unsupported: { status: 422, message: "The declared assessment schema version is not supported for this service." },
  payment_credentials_rejected: { status: 422, message: "Payment card data must never be transmitted. Request rejected." },
  not_found:               { status: 404, message: "No such partner order." },
  method_not_allowed:      { status: 405, message: "Method not allowed for this route." },
  internal_error:          { status: 500, message: "The request could not be processed." },
  // ── Slice 8 ──────────────────────────────────────────────────────────────
  document_not_ready:      { status: 409, message: "The clinical document for this order has not been approved and released yet. Retry after an order.document_ready webhook or a later status poll." },
  revision_locked:         { status: 409, message: "This order can no longer be revised through the API (a provider has been assigned, or the order is completed or cancelled). Contact partner support for an administrative clinical review." },
  revision_unsupported_for_service: { status: 422, message: "API revisions are supported for canonical-contract (PSD) submissions only. Contact partner support to revise this order." },
} as const;

export type PartnerErrorCode = keyof typeof PARTNER_ERRORS;

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-partner-key-id, x-partner-secret, x-partner-environment, idempotency-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export interface PartnerErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
  request_id: string;
}

/**
 * Structured error response. Carries NO PHI, no SQL text and no internal
 * identifiers -- only the stable code, a fixed human message, and optional
 * FIELD NAMES (never field values) so an integrator can find the problem.
 */
export function partnerError(
  code: PartnerErrorCode,
  requestId: string,
  details?: Record<string, string[]>,
): Response {
  const spec = PARTNER_ERRORS[code];
  const body: PartnerErrorBody = {
    error: { code, message: spec.message, ...(details ? { details } : {}) },
    request_id: requestId,
  };
  return new Response(JSON.stringify(body), {
    status: spec.status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function partnerJson(payload: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}

// ── Client identity ─────────────────────────────────────────────────────────
// Reproduces the measured decision from verify-letter: on this platform
// cf-connecting-ip is the ONLY header the caller cannot write (a request that
// supplies its own is rejected at the edge). X-Forwarded-For and friends pass
// through carrying whatever the caller wrote, so they are never parsed.

const NO_IDENTITY_BUCKET = "no-platform-identity";

function isIpv4(s: string): boolean {
  const p = s.split(".");
  if (p.length !== 4) return false;
  return p.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255);
}

/** The platform-attested caller IP, or null. Never caller-supplied. */
export function trustedClientIp(req: Request): string | null {
  const raw = req.headers.get("cf-connecting-ip");
  if (!raw || raw.length > 45) return null;
  const v = raw.trim();
  return v ? v : null;
}

/** Rate-limit bucket key. IPv6 is bucketed by /64 so a client cannot rotate. */
export function clientIdentity(req: Request): string {
  const v = trustedClientIp(req);
  if (!v) return NO_IDENTITY_BUCKET;
  if (isIpv4(v)) return `4:${v}`;
  if (/^[0-9A-Fa-f:.]+$/.test(v) && v.includes(":")) {
    const zone = v.split("%")[0].toLowerCase();
    const [head, tail] = zone.includes("::")
      ? zone.split("::").map((s) => (s ? s.split(":") : []))
      : [zone.split(":"), []];
    const fill = Array(Math.max(0, 8 - head.length - tail.length)).fill("0");
    const groups = [...head, ...fill, ...tail].slice(0, 8);
    return `6:${groups.slice(0, 4).map((g) => (g || "0").padStart(4, "0")).join(":")}`;
  }
  return NO_IDENTITY_BUCKET;
}

// ── Hashing / canonicalisation ──────────────────────────────────────────────

/**
 * Deterministic JSON canonicalisation: object keys sorted recursively, arrays
 * order-preserved. Two semantically identical payloads therefore produce the
 * same hash regardless of key order, so a partner re-serialising the same order
 * is treated as a retry rather than a conflict.
 */
export function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = canonicalise(src[k]);
    return out;
  }
  return value;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function canonicalPayloadHash(payload: unknown): Promise<string> {
  return await sha256Hex(JSON.stringify(canonicalise(payload)));
}

// ── Authentication ──────────────────────────────────────────────────────────

export interface PartnerIdentity {
  partnerId: string;
  partnerSlug: string;
  partnerStatus: string;
  productionEnabled: boolean;
  scopes: string[];
  rateLimitPerMinute: number;
  maxPayloadBytes: number;
  credentialId: string;
  environment: string;
}

export type AuthResult =
  | { ok: true; identity: PartnerIdentity }
  | { ok: false; code: PartnerErrorCode };

/**
 * Authenticate the caller.
 *
 * The secret is NEVER compared in this isolate and never logged: it is passed
 * to partner_verify_api_credential(), which compares a digest inside the
 * database (the verify_payout_cron_secret pattern) and returns only the
 * partner's scope. A failed attempt yields a single opaque `unauthenticated`
 * so a caller cannot distinguish "no such key" from "wrong secret" from
 * "revoked" from "IP not allowed".
 *
 * Credentials are accepted ONLY from headers. A secret in a query string would
 * land in access logs, proxy logs and browser history, so query parameters are
 * not read at all.
 */
export async function authenticatePartner(
  req: Request,
  admin: SupabaseClient,
): Promise<AuthResult> {
  const keyId = req.headers.get("x-partner-key-id")?.trim();
  const secret = req.headers.get("x-partner-secret")?.trim();
  const environment = (req.headers.get("x-partner-environment")?.trim() || "sandbox").toLowerCase();

  if (!keyId || !secret) return { ok: false, code: "unauthenticated" };
  if (environment !== "sandbox" && environment !== "production") {
    return { ok: false, code: "unauthenticated" };
  }
  // Bound the work an over-long header can cause before touching the database.
  if (keyId.length > 128 || secret.length > 512) return { ok: false, code: "unauthenticated" };

  const { data, error } = await admin.rpc("partner_verify_api_credential", {
    p_key_id: keyId,
    p_secret: secret,
    p_environment: environment,
    p_client_ip: trustedClientIp(req),
  });

  // A database failure must NOT be reported as an auth failure with detail, and
  // must never fall through to "allow".
  if (error) return { ok: false, code: "unauthenticated" };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, code: "unauthenticated" };

  return {
    ok: true,
    identity: {
      partnerId: row.partner_id,
      partnerSlug: row.partner_slug,
      partnerStatus: row.partner_status,
      productionEnabled: row.production_enabled,
      scopes: row.scopes ?? [],
      rateLimitPerMinute: row.rate_limit_per_minute ?? 60,
      maxPayloadBytes: Math.min(row.max_payload_bytes ?? 65536, ABSOLUTE_MAX_PAYLOAD_BYTES),
      credentialId: row.credential_id,
      environment,
    },
  };
}

export function hasScope(identity: PartnerIdentity, scope: string): boolean {
  return identity.scopes.includes(scope);
}

// ── Rate limiting ───────────────────────────────────────────────────────────

/**
 * Durable, per-credential fixed-window limiter. The subject is hashed with a
 * server-side pepper before it reaches the database, so a table dump does not
 * reveal partner key ids or caller IPs.
 *
 * Fails CLOSED on error: if the limiter cannot be consulted we refuse rather
 * than admit unbounded traffic to a clinical intake endpoint.
 */
export async function enforceRateLimit(
  admin: SupabaseClient,
  subject: string,
  scope: string,
  maxPerMinute: number,
): Promise<boolean> {
  try {
    const pepper = Deno.env.get("PARTNER_API_RATE_PEPPER") ?? "";
    const subjectHash = await sha256Hex(`${pepper}:${scope}:${subject}`);

    // ONE atomic statement. An INSERT ... ON CONFLICT DO UPDATE that returns the
    // post-increment count cannot lose a concurrent request the way a
    // read-then-write pair can, so two simultaneous calls can never both see
    // "1 of 60" and both proceed.
    const { data, error } = await admin.rpc("partner_bump_rate_limit", {
      p_subject_hash: subjectHash,
      p_scope: scope,
      p_window_seconds: 60,
    });
    if (error) return false;
    const attempts = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(attempts)) return false;
    return attempts <= maxPerMinute;
  } catch {
    return false;
  }
}

// ── Admin client ────────────────────────────────────────────────────────────

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false }, db: { schema: "public" } },
  );
}

/** Client bound to the private schema (credentials, idempotency, throttles). */
export function privateClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false }, db: { schema: "private" } },
  );
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** TLS check. Supabase terminates TLS at the edge, so this reads the scheme. */
export function isSecureRequest(req: Request): boolean {
  try {
    const proto = req.headers.get("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}
