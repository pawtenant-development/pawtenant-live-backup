/**
 * aiReferral — canonical AI answer-engine referral hosts, shared by the
 * attribution CAPTURE layer (attributionStore.buildChannel / buildFullSource).
 *
 * Why this exists
 * ───────────────
 * AI answer engines (ChatGPT, Claude, Gemini, Perplexity, ...) are a real and
 * high-converting acquisition channel for PawTenant, but they frequently
 * arrive with ONLY a document.referrer and no utm_source / click ID. Before
 * this, buildChannel() had no AI branch, so such visits collapsed into
 * "direct" — under-counting the AI channel.
 *
 * The read-side classifier (acquisitionClassifier.ts) already has a rich AI
 * label map for display; this is the minimal host list the capture layer
 * needs so the PERSISTED channel (visitor_sessions.channel /
 * attribution_json.channel) records the AI source. The returned host token is
 * one that canonicalChannelToLabel() already maps to the correct label.
 *
 * This never overrides a real paid click ID — callers only consult it after
 * gclid/fbclid checks (see buildChannel precedence).
 */

export const AI_REFERRAL_HOSTS: readonly string[] = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "claude.ai",
  "perplexity.ai",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "poe.com",
  "you.com",
  "phind.com",
];

function hostFromReferrer(referrer: string | null | undefined): string {
  const r = (referrer ?? "").trim();
  if (!r) return "";
  try {
    return new URL(/^https?:\/\//i.test(r) ? r : `https://${r}`).hostname.toLowerCase();
  } catch {
    return r.toLowerCase().replace(/^https?:\/\//i, "").split("/")[0];
  }
}

/**
 * Returns the canonical AI host token (e.g. "chatgpt.com") when the referrer
 * is a known AI answer engine, otherwise null. Matches the exact host and any
 * subdomain of it (e.g. "www.perplexity.ai") but never a bare "google.com"
 * (gemini/bard are matched by their full host, not by ".google.com").
 */
export function detectAiChannelFromReferrer(referrer: string | null | undefined): string | null {
  const host = hostFromReferrer(referrer);
  if (!host) return null;
  return AI_REFERRAL_HOSTS.find((h) => host === h || host.endsWith(`.${h}`)) ?? null;
}
