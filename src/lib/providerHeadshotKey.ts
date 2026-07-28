// src/lib/providerHeadshotKey.ts
//
// PROVIDER-HEADSHOT-OBJECT-KEY-DEIDENTIFICATION-001
//
// The SINGLE source of truth for provider-headshot storage object keys.
//
// THE DEFECT THIS REPLACES
// Both upload paths built the object key from the provider's email address:
//     email.replace(/[^a-z0-9]/gi, "_") + "." + ext
// so `someone@gmail.com` became `someone_gmail_com.jpg`. Because
// `provider-headshots` is a PUBLIC bucket, that key appeared verbatim in public
// page markup, in every browser network request, and — worse — the bucket's
// storage SELECT policy let an anonymous caller LIST the bucket and enumerate
// every provider's email address, including providers who were never published.
//
// The old scheme also wrote to a FIXED path with upsert:true, so replacing a
// photo reused the same URL and correctness depended on cache invalidation.
//
// THE STANDARD
//     provider-headshots/<provider_uuid>/<version_uuid>.<ext>
//
// - provider_uuid  a non-PII internal identifier (approved_providers.id,
//                  doctor_profiles.id, or doctor_contacts.id)
// - version_uuid   fresh per upload, so every replacement gets a NEW immutable
//                  URL and no cache invalidation is required
// - ext            derived from the validated MIME type, never from the
//                  caller-supplied filename
//
// Nothing derived from an email address, a person's name, a phone number, or
// any caller-supplied path may appear in a key. The key is always generated
// here; a caller never supplies a complete object path.

/** MIME types the provider-headshots bucket accepts, mapped to a canonical extension. */
const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg", // non-standard alias browsers still send; normalised to jpeg
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The bucket's configured limit (5 MB). */
export const MAX_HEADSHOT_BYTES = 5 * 1024 * 1024;

export const PROVIDER_HEADSHOT_BUCKET = "provider-headshots";

/** Canonical content type to store, given a browser-supplied MIME type. */
export function normalizeHeadshotContentType(mime: string | null | undefined): string | null {
  const m = (mime ?? "").trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[m]) return null;
  // The bucket rejects the non-standard "image/jpg" alias.
  return m === "image/jpg" ? "image/jpeg" : m;
}

/** Canonical file extension for a validated MIME type, or null if unsupported. */
export function headshotExtensionForType(mime: string | null | undefined): string | null {
  const m = (mime ?? "").trim().toLowerCase();
  return ALLOWED_IMAGE_TYPES[m] ?? null;
}

export interface HeadshotValidationFailure {
  ok: false;
  reason: "unsupported_type" | "too_large" | "empty" | "bad_provider_id";
  message: string;
}

export interface HeadshotKeyResult {
  ok: true;
  /** Object key relative to the bucket. */
  key: string;
  /** Content type to store. */
  contentType: string;
  extension: string;
}

export type HeadshotKeyOutcome = HeadshotKeyResult | HeadshotValidationFailure;

// This repo compiles with `strictNullChecks: false` (tsconfig.app.json), under
// which TypeScript does NOT narrow a discriminated union by its boolean literal
// discriminant. These explicit type predicates give callers reliable narrowing
// regardless of that setting — do not replace them with a bare `if (!x.ok)`.
export function isHeadshotKeyFailure(r: HeadshotKeyOutcome): r is HeadshotValidationFailure {
  return r.ok === false;
}
export function isHeadshotKeySuccess(r: HeadshotKeyOutcome): r is HeadshotKeyResult {
  return r.ok === true;
}

/** RFC-4122 UUID shape. Provider ids must match this — never an email or name. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): boolean {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** crypto.randomUUID with a narrow fallback for older runtimes. */
function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback: RFC-4122 v4 from getRandomValues.
  const b = new Uint8Array(16);
  (c ?? ({ getRandomValues: () => b } as unknown as Crypto)).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Build a neutral, versioned object key for a provider headshot.
 *
 * `providerId` MUST be an internal UUID. Passing an email, a name, or any
 * caller-supplied path is rejected — that rejection is the guard rail that
 * stops the original defect from reappearing.
 */
export function buildProviderHeadshotKey(
  providerId: string,
  mimeType: string | null | undefined,
  byteSize: number,
): HeadshotKeyOutcome {
  const id = (providerId ?? "").trim();
  if (!isUuid(id)) {
    return {
      ok: false,
      reason: "bad_provider_id",
      message: "Provider id must be an internal UUID. Emails and names must never key a headshot.",
    };
  }
  const ext = headshotExtensionForType(mimeType);
  const contentType = normalizeHeadshotContentType(mimeType);
  if (!ext || !contentType) {
    return {
      ok: false,
      reason: "unsupported_type",
      message: "Unsupported image type. Allowed: JPEG, PNG, WebP, GIF.",
    };
  }
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return { ok: false, reason: "empty", message: "The selected file is empty." };
  }
  if (byteSize > MAX_HEADSHOT_BYTES) {
    return { ok: false, reason: "too_large", message: "Image must be 5 MB or smaller." };
  }

  return {
    ok: true,
    key: `${id.toLowerCase()}/${newUuid()}.${ext}`,
    contentType,
    extension: ext,
  };
}

/**
 * True when a storage key looks like it was derived from an email address.
 * Used by the blocking guard and as a defensive runtime assertion.
 */
export function looksLikeEmailDerivedKey(key: string): boolean {
  const k = (key ?? "").toLowerCase();
  if (k.includes("@")) return true;
  // someone_gmail_com.jpg / first_last_yahoo_com.png / name_domain_co.png
  return /_[a-z0-9-]+_(com|net|org|co|io|us|uk|ca)\b/.test(k);
}

/** A key is well formed iff it is `<uuid>/<uuid>.<ext>` and carries no PII. */
export function isNeutralHeadshotKey(key: string): boolean {
  const k = (key ?? "").trim();
  const m = k.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp|gif)$/i);
  if (!m) return false;
  return isUuid(m[1]) && isUuid(m[2]) && !looksLikeEmailDerivedKey(k);
}
