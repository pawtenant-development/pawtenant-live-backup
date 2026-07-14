/**
 * attributionMacros — pure, dependency-free helpers that reject
 * un-interpolated advertising URL macros at the attribution CAPTURE boundary.
 *
 * Why this exists
 * ───────────────
 * Meta dynamic URL params ({{site_source_name}}, {{campaign.name}},
 * {{adset.name}}, {{ad.name}}, {{placement}}) and Google Ads ValueTrack
 * ({keyword}, {campaignid}, {adgroupid}, {matchtype}, ...) are only expanded
 * by the ad platform when the click is actually served by that platform.
 * The same URL template pasted into a GHL funnel, an email link, or an
 * organic post reaches the site UN-EXPANDED. Stored verbatim, the literal
 * placeholder poisons utm_source / keyword / campaign attribution and the
 * derived channel — this is exactly how the literal string
 * "{{site_source_name}}" leaked into visitor_sessions.channel and order
 * attribution.
 *
 * The read-side classifier already null-guards one specific literal; these
 * helpers move the protection to the WRITE boundary so no un-expanded macro
 * is ever persisted in the first place, for ANY field.
 *
 * IMPORTANT: click identifiers (gclid / gbraid / wbraid / fbclid / msclkid /
 * ttclid) are opaque tokens, never macros — they must NOT be passed through
 * these helpers.
 */

// A value is treated as an unresolved macro ONLY when the ENTIRE trimmed
// value is a single placeholder token. We deliberately do NOT reject values
// that merely contain braces somewhere (e.g. an accidental encoded JSON
// blob), so real user/campaign values are preserved.
const META_MACRO = /^\{\{[^{}]*\}\}$/; //  {{site_source_name}}, {{campaign.name}}
const VALUETRACK_MACRO = /^\{[a-z0-9_.:+-]+\}$/i; //  {keyword}, {campaignid}, {ifmobile:x}

/** True when the whole value is an un-expanded Meta/Google URL macro. */
export function isUnresolvedMacro(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  return META_MACRO.test(v) || VALUETRACK_MACRO.test(v);
}

/**
 * Returns the value when it is a real (non-macro) value, otherwise null.
 * Use at capture time before storing utm_* / keyword / campaign / ad params
 * / ref. Never use on click identifiers.
 */
export function sanitizeMacroValue(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return isUnresolvedMacro(v) ? null : v;
}
