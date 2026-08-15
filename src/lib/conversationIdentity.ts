/**
 * conversationIdentity — client-side conversation identity + sanitisation.
 *
 * UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001
 *
 * ONE normalisation rule across the whole system. This file is the browser copy
 * of the rule that also exists as `public.pt_normalize_e164()` in SQL and
 * `_shared/ghlSms.ts:normalizeE164()` on the server. All three must agree —
 * `communications.contact_e164` is GENERATED from the SQL one, so a client that
 * normalises differently would look up threads that do not exist.
 *
 * `scripts/check-command-center-identity.mjs` asserts the three stay in sync.
 */

/** SMS limits used by the composer. Matches the Order Details composer. */
export const SMS_SOFT_LIMIT = 320;
export const SMS_SEGMENT_GSM = 160;
export const SMS_SEGMENT_UNICODE = 70;

/**
 * Normalise to E.164, or return "" when the input cannot be a dialable number.
 *
 * Mirrors `_shared/ghlSms.ts:normalizeE164` exactly:
 *   strip non-digits → a bare 10-digit number gets the US "1" → accept 11..15.
 *
 * This is what makes "(620) 253-9921", "620-253-9921", "6202539921" and
 * "+16202539921" all resolve to the SAME conversation.
 */
export function normalizeE164(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) digits = "1" + digits;
  if (digits.length < 11 || digits.length > 15) return "";
  return "+" + digits;
}

/** Human-readable US formatting. Display only — never a lookup key. */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const e164 = normalizeE164(raw);
  if (!e164) return String(raw ?? "—");
  if (e164.startsWith("+1") && e164.length === 12) {
    const d = e164.slice(2);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return e164;
}

/** Last four digits only. For logs, audit metadata and confirmation copy. */
export function maskPhone(raw: string | null | undefined): string {
  const e164 = normalizeE164(raw);
  const s = e164 || String(raw ?? "");
  return s.length >= 4 ? `***${s.slice(-4)}` : "***";
}

export type IdentityState = "linked" | "ambiguous" | "unknown";

/** Channel classification used by the unified thread renderer. */
export type ThreadChannel = "sms" | "call" | "email" | "chat" | "other";

export function channelOf(type: string): ThreadChannel {
  if (type === "sms_inbound" || type === "sms_outbound") return "sms";
  if (type === "call_inbound" || type === "call_outbound") return "call";
  if (type === "email") return "email";
  if (type === "chat") return "chat";
  return "other";
}

export function isInbound(type: string, direction: string | null): boolean {
  if (direction) return direction === "inbound";
  return type.endsWith("_inbound");
}

/**
 * Invisible characters that must never survive into rendered message text.
 *
 * Expressed as a CODE-POINT PREDICATE rather than a regex character class on
 * purpose: a character class needs literal escape sequences, which tooling
 * here repeatedly emitted as raw control BYTES instead. That made
 * this source register as a BINARY file: grep refused it and diffs were
 * unreadable. A predicate has no escape hazard and states intent in numbers.
 *
 * TAB (0x09), LF (0x0A) and CR (0x0D) are DELIBERATELY treated as safe: they
 * are real message content and the spec requires line breaks be preserved.
 *
 * The bidi ranges matter for more than tidiness. U+202A-U+202E and
 * U+2066-U+2069 reorder rendered text, so a URL inside an SMS can be made to
 * DISPLAY as a different domain than the one it actually points at.
 */
function isUnsafeInvisible(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return false; // real content
  if (cp < 0x20 || cp === 0x7f) return true;                   // C0 controls + DEL
  if (cp >= 0x202a && cp <= 0x202e) return true;               // bidi embedding/override
  if (cp >= 0x2066 && cp <= 0x2069) return true;               // bidi isolates
  return false;
}

/**
 * Render arbitrary provider text as HARMLESS TEXT.
 *
 * The Command Center displays message bodies a stranger typed into an SMS. This
 * returns a plain string with dangerous invisibles removed; callers render it
 * as a TEXT NODE (React `{value}`), never via `dangerouslySetInnerHTML`. React
 * escapes text children, so `<script>alert(1)</script>` in a body is displayed
 * as those literal characters — which is exactly what an operator needs to see
 * when triaging a suspicious message.
 *
 * Line breaks and Unicode are PRESERVED: the +16202539921 message contains a
 * typographic apostrophe (U+2019) and the fix must not mangle it.
 */
export function sanitizeMessageText(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .split("")
    .filter((ch) => !isUnsafeInvisible(ch.charCodeAt(0)))
    .join("")
    // Normalise CRLF so `whitespace-pre-wrap` does not render a doubled blank
    // line for every newline in a Windows-originated body.
    .replace(/\r\n/g, "\n");
}

/** Collapse to a single-line preview. The FULL body always stays available. */
export function toPreview(raw: string | null | undefined, max = 120): string {
  const text = sanitizeMessageText(raw).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

/**
 * Characters outside the GSM-03.38 basic set force the whole message into
 * UCS-2, where a segment is 70 characters rather than 160. Approximated as
 * "any code point above U+00FF, or the CJK/emoji planes" — exact GSM table
 * matching would need the full 128-entry table and the practical trigger in
 * customer replies is emoji and typographic punctuation.
 */
function hasNonGsmChar(text: string): boolean {
  for (const ch of text) if (ch.codePointAt(0)! > 0xff) return true;
  return false;
}

/**
 * SMS length accounting.
 *
 * Showing a flat "160" counter would understate the cost of a single emoji by
 * more than half, which is how a two-segment message gets sent believing it was
 * one.
 */
export function analyzeSms(text: string): {
  chars: number; segments: number; unicode: boolean; perSegment: number;
} {
  const unicode = hasNonGsmChar(text);
  const perSegment = unicode ? SMS_SEGMENT_UNICODE : SMS_SEGMENT_GSM;
  const chars = text.length;
  const segments = chars === 0 ? 0 : Math.ceil(chars / perSegment);
  return { chars, segments, unicode, perSegment };
}

/** Human label for a GHL sync state. `null` renders as "not evaluated". */
export function ghlSyncLabel(state: string | null | undefined): {
  label: string; cls: string; icon: string; title: string;
} {
  switch (state) {
    case "ghl_origin":
      return {
        label: "From GHL", cls: "bg-slate-100 text-slate-600", icon: "ri-arrow-left-down-line",
        title: "Arrived from (or was sent through) GHL. GHL already holds this event, so it is never pushed back — that would create a sync loop.",
      };
    case "synced":
      return {
        label: "Synced", cls: "bg-emerald-50 text-emerald-700", icon: "ri-check-double-line",
        title: "Mirrored into GHL exactly once, keyed on the provider event id.",
      };
    case "pending":
      return {
        label: "Sync pending", cls: "bg-amber-50 text-amber-700", icon: "ri-time-line",
        title: "Queued to mirror into GHL.",
      };
    case "failed":
      return {
        label: "Sync failed", cls: "bg-orange-100 text-orange-700", icon: "ri-error-warning-line",
        title: "GHL sync failed. The PawTenant record is intact and retryable — a failed sync never removes a communication.",
      };
    case "not_applicable":
      return {
        label: "N/A", cls: "bg-slate-50 text-slate-400", icon: "ri-subtract-line",
        title: "Channel GHL does not carry.",
      };
    default:
      return {
        label: "Not evaluated", cls: "bg-slate-50 text-slate-400", icon: "ri-question-line",
        title: "Predates GHL sync tracking, or has no per-event provider id to reconcile on.",
      };
  }
}
