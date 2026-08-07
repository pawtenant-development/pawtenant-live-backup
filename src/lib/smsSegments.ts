// smsSegments — GSM-7 vs UCS-2 encoding detection and segment counting.
//
// ADMIN-AUDIT-ACTOR-ATTRIBUTION-AND-COMMS-COMPOSER-UX-001.
//
// Why this exists: the Admin SMS composer used to hard-truncate at 320
// characters with `.slice(0, 320)` — silently, mid-word, with no indication
// that the operator's message had been cut. Operators need to see the real
// cost of what they are typing instead, which means the actual carrier rules:
//
//   * GSM-7 (the default alphabet): 160 chars in a single message, 153 per
//     part once it splits, because the multipart header eats 7 characters.
//   * UCS-2 (anything outside GSM-7 — a curly quote, an emoji, an accent):
//     70 chars single, 67 per part. ONE such character re-encodes the WHOLE
//     message, which is why a pasted “smart quote” can double the send cost.
//   * A handful of GSM-7 characters (^ { } [ ] ~ \ | and the euro sign) are
//     in the extension table and cost TWO septets each.

/** GSM 03.38 basic character set. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** GSM 03.38 extension table — each of these costs two septets. */
const GSM7_EXTENDED = "^{}\\[~]|€";

const GSM7_BASIC_SET = new Set(GSM7_BASIC.split(""));
const GSM7_EXTENDED_SET = new Set(GSM7_EXTENDED.split(""));

export type SmsEncoding = "GSM-7" | "Unicode";

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  /** Characters as the operator sees them (code points, so an emoji is 1). */
  characters: number;
  /** Billable units: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Units still available before another segment is added. */
  remainingInSegment: number;
  /** The first character that forced Unicode, when it did. */
  unicodeTrigger: string | null;
}

export function analyzeSms(raw: string): SmsSegmentInfo {
  const text = raw ?? "";
  const chars = Array.from(text);

  let unicodeTrigger: string | null = null;
  let septets = 0;
  for (const ch of chars) {
    if (GSM7_BASIC_SET.has(ch)) {
      septets += 1;
    } else if (GSM7_EXTENDED_SET.has(ch)) {
      septets += 2;
    } else if (unicodeTrigger === null) {
      unicodeTrigger = ch;
    }
  }

  const isUnicode = unicodeTrigger !== null;
  // UCS-2 bills per UTF-16 code unit, so an astral emoji counts as 2.
  const units = isUnicode ? text.length : septets;

  const single = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;

  let segments: number;
  let remainingInSegment: number;
  if (units === 0) {
    segments = 0;
    remainingInSegment = single;
  } else if (units <= single) {
    segments = 1;
    remainingInSegment = single - units;
  } else {
    segments = Math.ceil(units / multi);
    remainingInSegment = segments * multi - units;
  }

  return {
    encoding: isUnicode ? "Unicode" : "GSM-7",
    characters: chars.length,
    units,
    segments,
    remainingInSegment,
    unicodeTrigger,
  };
}

/** Operator-facing summary, e.g. "412/1600 · 3 SMS · GSM-7". */
export function describeSms(raw: string, max: number): string {
  const info = analyzeSms(raw);
  const parts = [`${info.characters}/${max}`];
  if (info.segments > 0) parts.push(`${info.segments} SMS`);
  parts.push(info.encoding);
  return parts.join(" · ");
}
