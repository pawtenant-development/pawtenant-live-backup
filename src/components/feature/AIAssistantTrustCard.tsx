/**
 * AIAssistantTrustCard.tsx — "Having a hard time deciding?" trust/validation card.
 *
 * Lets a visitor hand the CURRENT PawTenant page to their favorite AI assistant
 * (ChatGPT, Claude, Perplexity) with a pre-filled, page-specific prompt asking
 * the assistant to review the page and explain whether PawTenant may be a good
 * option — then nudges them into the right evaluation flow.
 *
 * Lightweight: pure React + Tailwind + remixicon (ri-*). No new deps, no network
 * calls of its own. Click tracking is fire-and-forget via the existing
 * trackCtaClick helper (never throws, never blocks).
 *
 * AI links open in a new tab with rel="noopener noreferrer".
 *
 * Prompts always use the CLEAN canonical pawtenant.com URL (never UTM params)
 * so the assistant fetches the real public page.
 *
 * Platforms: only assistants whose public URL reliably PREFILLS the prompt are
 * included. Verified working (browser-tested 2026-06-28):
 *   - ChatGPT     https://chatgpt.com/?q=...     → prefills composer
 *   - Claude      https://claude.ai/new?q=...    → prefills composer
 *   - Perplexity  https://www.perplexity.ai/?q=  → runs the query
 * Deliberately SKIPPED (open a blank chat / strip the param → would be broken
 * buttons): Google Gemini, Microsoft Copilot, Grok.
 *
 * Compliance (do NOT weaken):
 *   - AI does NOT determine ESA/PSD qualification — only a licensed provider can.
 *   - No "guaranteed approval", no eviction-prevention claims.
 *   - ESA and PSD are kept distinct (driven by serviceType).
 *   - Soft "may be a good option" / "helps explain" framing only.
 */

import { Link } from "react-router-dom";
import { trackCtaClick } from "@/lib/trackEvent";

/** Canonical, non-www origin — matches seoConfig. Used inside AI prompts only. */
const CANONICAL_ORIGIN = "https://pawtenant.com";

export type AIAssistantServiceType = "esa" | "psd" | "comparison" | "general";

export interface AIAssistantTrustCardProps {
  /** Canonical page path (e.g. "/" or "/esa-letter-for-apartments") or a full URL. */
  pageUrl: string;
  /** Short human label for the page subject — used for accessible labels + analytics. */
  topic: string;
  /** Controls which compliant prompt template is used. Defaults to "general". */
  serviceType?: AIAssistantServiceType;
  /** Where the primary orange CTA routes (pass through withAttribution()). */
  ctaHref: string;
  /** Primary CTA label. Defaults to "Start Evaluation". */
  ctaLabel?: string;
  /** Optional second CTA (e.g. comparison page: ESA + PSD evaluations). */
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
  /** Headline override. */
  heading?: string;
  /** Subtext override. */
  subcopy?: string;
  /** Section background override (defaults to a light band). */
  className?: string;
}

/** Build the clean canonical URL used inside the AI prompt (never UTM). */
function toCanonicalUrl(pageUrl: string): string {
  if (/^https?:\/\//i.test(pageUrl)) return pageUrl;
  const path = pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`;
  return path === "/" ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${path}`;
}

/**
 * Compliant prompt templates. Each asks the assistant to review THIS page and
 * explain whether PawTenant "may be a good option" — never to decide
 * qualification or guarantee any outcome. ESA and PSD stay distinct.
 */
function buildPrompt(serviceType: AIAssistantServiceType, url: string): string {
  switch (serviceType) {
    case "esa":
      return `Using this PawTenant page, explain how PawTenant helps renters understand ESA letters for housing and whether it may be a good option: ${url}`;
    case "psd":
      return `Using this PawTenant page, explain what a psychiatric service dog letter is and when PawTenant may be a good option: ${url}`;
    case "comparison":
      return `Using this PawTenant page, explain the difference between an ESA letter and a PSD letter and when each may apply: ${url}`;
    case "general":
    default:
      return `Using this PawTenant page, explain whether PawTenant may be a good option for getting an ESA letter online for housing: ${url}`;
  }
}

interface AIPlatform {
  key: string;
  /** Button text, e.g. "Ask ChatGPT". */
  label: string;
  /** remixicon glyph (present in the subset). */
  icon: string;
  /** Brand accent colour for the icon glyph. */
  accent: string;
  /** Soft brand-tinted chip background behind the icon. */
  chipBg: string;
  /** Builder for the prefilled-prompt URL. */
  build: (q: string) => string;
}

/**
 * Only the three platforms whose ?q= URL reliably prefills the prompt. Brand
 * accent colours are applied via inline style (Tailwind can't safelist arbitrary
 * hex), keeping the buttons light/white with a visible brand-tinted icon chip.
 */
const PLATFORMS: AIPlatform[] = [
  {
    key: "chatgpt",
    label: "Ask ChatGPT",
    icon: "ri-openai-line",
    accent: "#0D8F6F",
    chipBg: "#E6F5F0",
    build: (q) => `https://chatgpt.com/?q=${q}`,
  },
  {
    key: "claude",
    label: "Ask Claude",
    icon: "ri-sparkling-2-line",
    accent: "#C8643F",
    chipBg: "#FBEDE6",
    build: (q) => `https://claude.ai/new?q=${q}`,
  },
  {
    key: "perplexity",
    label: "Ask Perplexity",
    icon: "ri-search-eye-line",
    accent: "#1F7A86",
    chipBg: "#E4F0F2",
    build: (q) => `https://www.perplexity.ai/?q=${q}`,
  },
];

export default function AIAssistantTrustCard({
  pageUrl,
  topic,
  serviceType = "general",
  ctaHref,
  ctaLabel = "Start Evaluation",
  secondaryCtaHref,
  secondaryCtaLabel,
  heading = "Having a hard time deciding?",
  subcopy = "Ask your favorite AI assistant to review this page, or start your PawTenant evaluation to see whether an ESA or PSD letter may be right for your housing needs.",
  className,
}: AIAssistantTrustCardProps) {
  const canonicalUrl = toCanonicalUrl(pageUrl);
  const prompt = buildPrompt(serviceType, canonicalUrl);
  const q = encodeURIComponent(prompt);

  function handleAiClick(key: string) {
    // Fire-and-forget; trackCtaClick never throws or blocks navigation.
    try {
      trackCtaClick(`ai_assistant_${key}`, {
        topic,
        service_type: serviceType,
        canonical_url: canonicalUrl,
      });
    } catch {
      /* ignore — analytics must never break the link */
    }
  }

  return (
    <section className={`py-12 sm:py-16 ${className || "bg-[#fafafa]"}`}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-white via-[#f1faf9] to-[#fff4ec] p-6 sm:p-9 shadow-[0_20px_50px_-28px_rgba(15,44,51,0.35)] ring-1 ring-teal-100/80">
          {/* Soft, light decorative accents (clipped by overflow-hidden) */}
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-teal-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-orange-200/25 blur-3xl" />

          <div className="relative">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 ring-1 ring-teal-100 mb-4">
              <i className="ri-robot-line text-teal-600 text-sm" aria-hidden="true"></i>
              <span className="text-[11px] font-bold uppercase tracking-widest text-teal-700">
                Ask an AI assistant
              </span>
            </div>

            {/* Headline + subtext */}
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-2.5">
              {heading}
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed max-w-xl mb-6">
              {subcopy}
            </p>

            {/* AI assistant buttons — light/white with brand-tinted icon chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PLATFORMS.map((p) => (
                <a
                  key={p.key}
                  href={p.build(q)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleAiClick(p.key)}
                  aria-label={`${p.label} to review this PawTenant page about ${topic} (opens in a new tab)`}
                  className="group flex items-center gap-3 rounded-xl bg-white px-3.5 py-3 ring-1 ring-gray-200/90 shadow-sm hover:shadow-md hover:ring-gray-300 transition-all cursor-pointer"
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: p.chipBg, color: p.accent }}
                  >
                    <i className={`${p.icon} text-lg`} aria-hidden="true"></i>
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-bold text-gray-900 leading-tight">
                    {p.label}
                  </span>
                  <i
                    className="ri-external-link-line text-gray-300 text-xs group-hover:text-gray-500 transition-colors"
                    aria-hidden="true"
                  ></i>
                </a>
              ))}
            </div>

            {/* Primary + optional secondary CTA */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3 mt-6">
              <Link
                to={ctaHref}
                onClick={() => handleAiClick("start_evaluation")}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_6px_18px_rgba(249,115,22,0.30)]"
              >
                <i className="ri-stethoscope-line" aria-hidden="true"></i>
                {ctaLabel}
              </Link>
              {secondaryCtaHref && secondaryCtaLabel && (
                <Link
                  to={secondaryCtaHref}
                  onClick={() => handleAiClick("start_evaluation_secondary")}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-bold text-gray-800 ring-1 ring-gray-200 hover:ring-gray-300 hover:text-gray-900 transition-colors cursor-pointer"
                >
                  <i className="ri-stethoscope-line text-teal-600" aria-hidden="true"></i>
                  {secondaryCtaLabel}
                </Link>
              )}
            </div>

            {/* Compliance note */}
            <p className="mt-5 flex items-start gap-1.5 text-[12px] leading-relaxed text-gray-500">
              <i className="ri-shield-check-line mt-0.5 flex-shrink-0 text-teal-500" aria-hidden="true"></i>
              <span>
                An AI assistant can help explain what is on this page, but it cannot determine
                whether you qualify. Only a licensed mental health professional can decide that
                after a provider review.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
