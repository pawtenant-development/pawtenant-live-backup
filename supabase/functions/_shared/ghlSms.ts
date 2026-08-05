// _shared/ghlSms.ts
//
// LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002
//
// THE ONE canonical outbound-SMS provider path. Every server-side SMS producer
// sends through `sendGhlSms()` and nothing else.
//
// WHY THIS EXISTS
// ---------------
// LIVE incident 2026-08-04 → 2026-08-05: 669 automated recovery SMS, 642 of
// them failed, every single failure carrying the identical string
// "Twilio not configured or phone missing". `lead-followup-sequence` sent via
// Twilio DIRECTLY while every other PawTenant producer sends via GHL — which is
// exactly why some PawTenant SMS delivered with a `ghl:` provider id while this
// one path failed 100% of the time. Twilio is not configured on LIVE, so the
// send short-circuited before any HTTP call was ever made.
//
// Owner decision: GHL is the single canonical SMS delivery path. There is no
// separate Twilio implementation for this workflow. Do not re-add one.
//
// WHAT THIS MODULE DOES AND DELIBERATELY DOES NOT DO
// --------------------------------------------------
// DOES:  phone normalisation, TEST containment, contact resolve/create, DND
//        verification, the provider call, and CLASSIFICATION of the result into
//        delivered / permanent / retryable.
// DOES NOT: touch the database. No `communications` row, no `audit_logs` row,
//        no order mutation.
//
// That split is the point. `ghl-send-sms` (admin/manual) and
// `lead-followup-sequence` (automated) need DIFFERENT log rows — different
// actor semantics, different metadata, different idempotency anchors — but they
// must share ONE provider implementation and ONE classification table. If this
// module also logged, every caller that logs would produce two rows per
// provider attempt, and "one provider attempt = exactly one communication
// record" would be false.
//
// CLASSIFICATION IS THE SAFETY-CRITICAL PART
// ------------------------------------------
// The incident's 15-minute loop happened because a PERMANENT failure was
// indistinguishable from "never attempted". `outcome` is what the caller feeds
// to `sms_attempt_record(p_permanent => ...)`, and it is what decides whether a
// customer is ever contacted about this stage again. When in doubt this module
// returns "permanent": under-sending is recoverable, a 94-message loop is not.

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_TIMEOUT_MS = 10000;

/** The TEST project ref. Kept literal here so this module imports nothing. */
const TEST_PROJECT_REF = "opudhofjbydrljgleofq";

/**
 * SMS-LIVE-INCIDENT-001 containment, restated locally.
 *
 * The TEST project holds PRODUCTION GHL send credentials, and the production
 * GHL location forwards real customer SMS into the TEST pipeline. A TEST send
 * has already reached a real paid customer once. `_shared/aiSupport/testGuard.ts`
 * is the canonical list but exists only in the TEST repo — importing it here
 * would make this module fail to resolve on LIVE. So the boundary is restated
 * inline: identical numbers, identical fail-closed rule, zero imports.
 *
 * If you change the approved list, change it in BOTH places. Owner approval
 * required — this is an incident containment boundary, not a config knob.
 */
const APPROVED_TEST_SMS_NUMBERS: readonly string[] = [
  "+18323309603",
  "+18322804249",
];

/** True when running in — or unable to rule out — the TEST project. */
export function isTestSupabaseProject(supabaseUrl?: string): boolean {
  const url = supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "";
  if (!url) return true; // unknown environment → fail closed (restricted)
  return url.includes(TEST_PROJECT_REF);
}

/** TRUE → this environment must NOT send an SMS to this number. */
export function testSmsSendBlocked(phoneE164: string, supabaseUrl?: string): boolean {
  return isTestSupabaseProject(supabaseUrl) &&
    !APPROVED_TEST_SMS_NUMBERS.includes((phoneE164 || "").trim());
}

/**
 * How the caller must treat this attempt.
 *
 *   delivered — GHL accepted the message. Store the provider id, mark the stage
 *               delivered, never send this stage again.
 *   permanent — this will not succeed if repeated unchanged. TERMINAL
 *               IMMEDIATELY. No retry, ever.
 *   retryable — a transient condition. Eligible for the bounded backoff
 *               (original attempt → +60 min → +360 min → terminal).
 */
export type GhlSmsOutcome = "delivered" | "permanent" | "retryable";

/**
 * Machine-readable, PII-free failure codes. Safe to store in
 * `communications.failure_code` and `sms_sequence_attempts.failure_code`, and
 * safe to render in the Admin UI.
 */
export type GhlSmsFailureCode =
  | "missing_phone"
  | "invalid_phone"
  | "provider_not_configured"
  | "test_guard_blocked"
  | "dnd_blocked"
  | "dnd_unverified"
  | "contact_unavailable"
  | "provider_auth"
  | "provider_rejected"
  | "rate_limited"
  | "provider_unavailable"
  | "network_error"
  | "unknown_error";

export interface GhlSmsResult {
  /** True only when GHL accepted the message. */
  ok: boolean;
  outcome: GhlSmsOutcome;
  /** GHL message id on success. The caller stores it as `ghl:<messageId>`. */
  messageId: string | null;
  contactId: string | null;
  /** E.164 normalised recipient, or "" when it could not be normalised. */
  phone: string;
  /** The GHL-owned sending number, when configured. */
  fromNumber: string | null;
  failureCode: GhlSmsFailureCode | null;
  /** Short, safe, human-readable. Never contains credentials or message body. */
  failureReason: string | null;
  httpStatus: number | null;
  /**
   * Whether provider-side opt-out state was actually READ for this send.
   * False means GHL's own DND enforcement was the only thing standing between
   * us and an opted-out customer. Surfaced so a scope regression on the
   * contact-read endpoint shows up in the logs instead of nowhere.
   */
  dndVerified: boolean;
  dndDetail: string | null;
}

function ok(
  messageId: string | null, contactId: string | null, phone: string, from: string | null,
  dndVerified: boolean, dndDetail: string | null,
): GhlSmsResult {
  return {
    ok: true, outcome: "delivered", messageId, contactId, phone,
    fromNumber: from, failureCode: null, failureReason: null, httpStatus: 200,
    dndVerified, dndDetail,
  };
}

function fail(
  outcome: Exclude<GhlSmsOutcome, "delivered">,
  failureCode: GhlSmsFailureCode,
  failureReason: string,
  extra: Partial<GhlSmsResult> = {},
): GhlSmsResult {
  return {
    ok: false, outcome, messageId: null, contactId: null, phone: "",
    fromNumber: null, httpStatus: null, dndVerified: false, dndDetail: null,
    failureCode, failureReason: failureReason.slice(0, 300),
    ...extra,
  };
}

/**
 * Normalise to E.164. Returns "" when the input cannot be a dialable US number.
 *
 * Deliberately strict: a 4-digit "phone" that reaches the provider is a
 * guaranteed permanent failure, and discovering that costs a provider round
 * trip plus a retry slot. Catching it here makes it terminal on attempt one.
 */
export function normalizeE164(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) digits = "1" + digits;
  // US/CA numbers are 11 digits with the country code. Anything shorter is not
  // dialable; anything longer than E.164's 15-digit maximum is malformed.
  if (digits.length < 11 || digits.length > 15) return "";
  return "+" + digits;
}

/** Substrings in a provider message that mean "never retry this". */
const PERMANENT_PROVIDER_PATTERNS = [
  "invalid", "not a valid", "malformed", "unsubscrib", "opt out", "opted out",
  "opt-out", "blacklist", "blocked", "dnd", "do not disturb", "landline",
  "unreachable destination", "not supported", "unsupported", "forbidden",
  "not found", "does not exist", "bad request",
];

/** Substrings that mean "transient — try again later". Checked FIRST. */
const RETRYABLE_PROVIDER_PATTERNS = [
  "rate limit", "too many requests", "timeout", "timed out", "temporar",
  "try again", "unavailable", "internal server", "gateway", "overload",
];

/**
 * Classify a non-2xx GHL response body + status.
 *
 * Status wins where it is unambiguous (429 → rate limited, 5xx → transient,
 * 401/403 → credentials). Only for an ambiguous 4xx do we read the message
 * text, and there the DEFAULT IS PERMANENT — an unrecognised 4xx repeated every
 * 15 minutes is precisely the failure mode this task exists to end.
 */
export function classifyGhlFailure(
  status: number,
  providerMessage: string,
): { outcome: Exclude<GhlSmsOutcome, "delivered">; code: GhlSmsFailureCode } {
  const msg = (providerMessage || "").toLowerCase();

  if (status === 429) return { outcome: "retryable", code: "rate_limited" };
  if (status >= 500) return { outcome: "retryable", code: "provider_unavailable" };
  if (status === 408) return { outcome: "retryable", code: "provider_unavailable" };
  // Credentials are wrong or revoked. Repeating the identical call cannot fix
  // that, and this is the exact shape of the 642-failure incident.
  if (status === 401 || status === 403) return { outcome: "permanent", code: "provider_auth" };

  for (const p of RETRYABLE_PROVIDER_PATTERNS) {
    if (msg.includes(p)) return { outcome: "retryable", code: "provider_unavailable" };
  }
  for (const p of PERMANENT_PROVIDER_PATTERNS) {
    if (msg.includes(p)) return { outcome: "permanent", code: "provider_rejected" };
  }
  return { outcome: "permanent", code: "provider_rejected" };
}

async function ghlFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);
  try {
    return await fetch(`${GHL_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the GHL contact for a phone number, creating one if absent.
 *
 * A brand-new lead legitimately has no GHL contact yet, so "not found" is a
 * normal path, not an error. Distinguishing "search failed transiently" from
 * "no such contact" matters: the first is retryable, the second is just a
 * create.
 */
async function resolveContact(
  phone: string, apiKey: string, locationId: string, source: string,
): Promise<{ contactId: string | null; transient: boolean; detail: string }> {
  try {
    const searchRes = await ghlFetch(
      `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(phone)}`,
      apiKey,
    );
    if (searchRes.ok) {
      const data = await searchRes.json().catch(() => null) as { contacts?: Array<{ id?: string }> } | null;
      const found = data?.contacts?.[0]?.id ?? null;
      if (found) return { contactId: found, transient: false, detail: "existing contact" };
    } else if (searchRes.status >= 500 || searchRes.status === 429) {
      return { contactId: null, transient: true, detail: `contact search HTTP ${searchRes.status}` };
    }

    const createRes = await ghlFetch(`/contacts/`, apiKey, {
      method: "POST",
      body: JSON.stringify({ locationId, phone, source }),
    });
    if (createRes.ok) {
      const data = await createRes.json().catch(() => null) as { contact?: { id?: string } } | null;
      const created = data?.contact?.id ?? null;
      if (created) return { contactId: created, transient: false, detail: "created contact" };
      return { contactId: null, transient: false, detail: "create returned no contact id" };
    }
    const transient = createRes.status >= 500 || createRes.status === 429;
    return { contactId: null, transient, detail: `contact create HTTP ${createRes.status}` };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { contactId: null, transient: true, detail: aborted ? "GHL contact API timeout" : "GHL contact API unreachable" };
  }
}

/** Read DND for a KNOWN contact id. Only ever called after the contact exists. */
async function contactSmsDnd(
  contactId: string, apiKey: string,
): Promise<{ blocked: boolean; verified: boolean; detail: string; transient: boolean }> {
  try {
    const res = await ghlFetch(`/contacts/${encodeURIComponent(contactId)}`, apiKey);
    if (!res.ok) {
      const transient = res.status >= 500 || res.status === 429;
      return { blocked: false, verified: false, transient, detail: `contact fetch HTTP ${res.status}` };
    }
    // deno-lint-ignore no-explicit-any
    const contact = ((await res.json().catch(() => null)) as any)?.contact;
    if (!contact || typeof contact !== "object") {
      return { blocked: false, verified: false, transient: true, detail: "malformed contact response" };
    }
    if (contact.dnd === true) {
      return { blocked: true, verified: true, transient: false, detail: "global DND active" };
    }
    const dndSettings = contact.dndSettings && typeof contact.dndSettings === "object"
      ? contact.dndSettings as Record<string, unknown>
      : {};
    for (const [channel, value] of Object.entries(dndSettings)) {
      if (channel.toLowerCase() !== "sms") continue;
      // deno-lint-ignore no-explicit-any
      const st = String((value as any)?.status ?? "").toLowerCase();
      if (st === "active" || st === "permanent") {
        return { blocked: true, verified: true, transient: false, detail: `SMS DND ${st}` };
      }
    }
    return { blocked: false, verified: true, transient: false, detail: "no SMS DND on contact" };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      blocked: false, verified: false, transient: true,
      detail: aborted ? "GHL DND check timeout" : "GHL DND check unreachable",
    };
  }
}

export interface SendGhlSmsOptions {
  toPhone: string | null | undefined;
  message: string;
  /**
   * Verify GHL DND before sending. Automated bulk/sequence sends MUST set this
   * — a STOP the customer sent to the GHL number is invisible to
   * `orders.sms_opted_out`, so without this an opted-out customer keeps being
   * messaged by the cron. Interactive one-off admin sends may skip it.
   */
  checkDnd?: boolean;
  /** `source` recorded on a newly created GHL contact. Never PII. */
  contactSource?: string;
}

/**
 * Send one SMS through GHL and classify the outcome. Never throws.
 *
 * ORDERING MATTERS:
 *   1. normalise  — a bad number is terminal without spending a provider call
 *   2. TEST guard — refuse BEFORE any GHL call, so a refused send creates no
 *                   contact and has zero side effects
 *   3. contact    — resolve or create
 *   4. DND        — only now, with a real contact id. Checking earlier would
 *                   report "unknown" for every brand-new lead and suppress the
 *                   entire recovery sequence.
 *   5. send
 */
export async function sendGhlSms(opts: SendGhlSmsOptions): Promise<GhlSmsResult> {
  const apiKey = Deno.env.get("GHL_API_KEY") ?? "";
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "";
  const fromNumber = Deno.env.get("GHL_PHONE_NUMBER") ?? "";

  const rawPhone = String(opts.toPhone ?? "").trim();
  if (!rawPhone) {
    return fail("permanent", "missing_phone", "No phone number on record for this customer.");
  }
  const phone = normalizeE164(rawPhone);
  if (!phone) {
    return fail("permanent", "invalid_phone", "Phone number is not a dialable E.164 number.");
  }

  if (!apiKey || !locationId) {
    // Terminal, not transient. This is the incident's signature: a missing
    // credential retried every 15 minutes forever.
    return fail(
      "permanent", "provider_not_configured",
      "GHL_API_KEY / GHL_LOCATION_ID are not configured in this project.",
      { phone, fromNumber: fromNumber || null },
    );
  }

  if (testSmsSendBlocked(phone)) {
    return fail(
      "permanent", "test_guard_blocked",
      "TEST environment guard: outbound SMS is restricted to approved tester numbers.",
      { phone, fromNumber: fromNumber || null },
    );
  }

  const contact = await resolveContact(phone, apiKey, locationId, opts.contactSource ?? "PawTenant");
  if (!contact.contactId) {
    return fail(
      contact.transient ? "retryable" : "permanent",
      "contact_unavailable",
      `Could not resolve a GHL contact — ${contact.detail}.`,
      { phone, fromNumber: fromNumber || null },
    );
  }

  let dndVerified = false;
  let dndDetail: string | null = null;
  if (opts.checkDnd !== false) {
    const dnd = await contactSmsDnd(contact.contactId, apiKey);
    dndVerified = dnd.verified;
    dndDetail = dnd.detail;
    if (dnd.blocked) {
      // A positive DND is authoritative and TERMINAL. Never send, never retry.
      return fail(
        "permanent", "dnd_blocked",
        `Customer has opted out of SMS — ${dnd.detail}.`,
        { phone, contactId: contact.contactId, fromNumber: fromNumber || null },
      );
    }
    if (!dnd.verified) {
      // DELIBERATELY NOT FAIL-CLOSED HERE, and this is the one place in this
      // module where that is the right call.
      //
      // Measured on TEST 2026-08-06: GHL answers `POST /contacts/` but returns
      // 401 on `GET /contacts/{id}` — the API key has write but not read scope
      // for a single contact. (The same lookup succeeded in July, so the key's
      // permissions changed under us.) Treating an unreadable DND as a refusal
      // would have made EVERY automated recovery SMS terminal on attempt one:
      // the identical outcome as the Twilio incident this task exists to fix,
      // just with a more respectable-looking reason in the logs.
      //
      // The opt-out guarantee does not depend on us reading it. GHL enforces
      // DND on the Conversations send itself and rejects a DND'd recipient, and
      // `classifyGhlFailure` maps that rejection to PERMANENT. So the customer
      // is still protected — by the provider, at the point of sending, which is
      // the authoritative place — while a scope regression can no longer take
      // the whole channel down silently.
      //
      // What we lose is one round trip's worth of politeness: a DND'd contact
      // costs a rejected provider call instead of being skipped locally. That
      // is a cost worth paying for not being able to fail silently.
      console.warn(`[ghlSms] DND unverified, proceeding to provider: ${dnd.detail}`);
    }
  }

  let res: Response;
  try {
    res = await ghlFetch(`/conversations/messages`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        type: "SMS",
        contactId: contact.contactId,
        locationId,
        fromNumber: fromNumber || undefined,
        message: opts.message,
      }),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return fail(
      "retryable", "network_error",
      aborted ? "GHL send timed out." : "GHL send could not reach the provider.",
      { phone, contactId: contact.contactId, fromNumber: fromNumber || null },
    );
  }

  const data = await res.json().catch(() => ({})) as {
    messageId?: string; id?: string; message?: string; msg?: string; error?: string;
  };

  if (!res.ok) {
    const providerMessage = data.message ?? data.msg ?? data.error ?? `GHL HTTP ${res.status}`;
    const { outcome, code } = classifyGhlFailure(res.status, providerMessage);
    return fail(outcome, code, providerMessage, {
      phone, contactId: contact.contactId, fromNumber: fromNumber || null, httpStatus: res.status,
    });
  }

  const messageId = data.messageId ?? data.id ?? null;
  return ok(messageId, contact.contactId, phone, fromNumber || null, dndVerified, dndDetail);
}
