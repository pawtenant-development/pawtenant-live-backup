/**
 * AIAssistantTrustCard.tsx — "Having a hard time deciding?" trust/validation card.
 *
 * Lets a visitor hand the CURRENT PawTenant page to an AI assistant (ChatGPT,
 * Claude, Perplexity, or Gemini) with a page-specific prompt asking the
 * assistant to review the page and explain whether PawTenant may be a good
 * option — then nudges them into the right evaluation flow.
 *
 * Lightweight: pure React + Tailwind + small inline-SVG brand marks (no logo
 * packages, no external images, no new deps).
 *
 * Analytics: each AI button fires a dedicated `ai_assistant_prompt_click` event
 * via the existing trackEvent helper (fire-and-forget; never throws or blocks).
 * Params: assistant, page_path, service_type, prompt_type (prefilled_link |
 * copy_prompt), destination_host, cta_location, plus clipboard_status for
 * Gemini. The Start Evaluation CTAs keep their existing cta_click event.
 *
 * Prompts always use the CLEAN canonical pawtenant.com URL (never UTM params)
 * so the assistant fetches the real public page.
 *
 * Platform link behaviour (browser-verified 2026-06-28):
 *   - ChatGPT     https://chatgpt.com/?q=...     → opens, prefills composer
 *   - Claude      https://claude.ai/new?q=...    → opens, prefills composer
 *   - Perplexity  https://www.perplexity.ai/?q=  → opens, runs the query
 *   - Gemini      https://gemini.google.com/app  → does NOT accept a prefill
 *                 param, so we COPY the prompt to the clipboard and open a
 *                 blank Gemini chat with a "paste it in" hint. Never a broken
 *                 prefilled link. (Copilot/Grok intentionally omitted.)
 * AI links open in a new tab with rel="noopener noreferrer".
 *
 * Compliance (do NOT weaken):
 *   - AI does NOT determine ESA/PSD qualification — only a licensed provider can.
 *   - No "guaranteed approval", no eviction-prevention claims.
 *   - ESA and PSD are kept distinct (driven by serviceType).
 *   - Soft "may be a good option" / "helps explain" framing only.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { trackCtaClick, trackEvent } from "@/lib/trackEvent";

/** Canonical, non-www origin — matches seoConfig. Used inside AI prompts only. */
const CANONICAL_ORIGIN = "https://pawtenant.com";

/** Stable location label sent with every AI-assistant click event. */
const CTA_LOCATION = "ai_assistant_trust_card";

/** Dedicated analytics event for AI assistant button clicks. */
const AI_CLICK_EVENT = "ai_assistant_prompt_click";

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

/* ───────────────────────── Brand marks (inline SVG) ─────────────────────────
   Small, lightweight, monochrome marks that inherit the chip's accent colour
   via `currentColor`. Simplified brand-style glyphs (no official logo files,
   no external assets) so each button reads as the right assistant. */

/** OpenAI / ChatGPT — hexagonal "core" mark. */
function ChatGPTMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2.7l8 4.65v9.3L12 21.3l-8-4.65v-9.3z" />
      <circle cx="12" cy="12" r="3.15" />
    </svg>
  );
}

/** Anthropic / Claude — radial sunburst. */
const CLAUDE_RAYS = Array.from({ length: 11 }, (_, i) => {
  const a = (i / 11) * Math.PI * 2 - Math.PI / 2;
  const inner = 2.5;
  const outer = i % 2 === 0 ? 9 : 7;
  return {
    x1: 12 + Math.cos(a) * inner,
    y1: 12 + Math.sin(a) * inner,
    x2: 12 + Math.cos(a) * outer,
    y2: 12 + Math.sin(a) * outer,
  };
});
function ClaudeMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        {CLAUDE_RAYS.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
        ))}
      </g>
    </svg>
  );
}

/** Perplexity — geometric "answer engine" mark. */
function PerplexityMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4v17.2" />
      <path d="M4.7 8.2 12 12l7.3-3.8M19.3 15.8 12 12l-7.3 3.8" />
    </svg>
  );
}

/** Google Gemini — four-point sparkle. */
function GeminiMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 2c.6 5.3 4.4 9.1 9.7 9.7-5.3.6-9.1 4.4-9.7 9.7-.6-5.3-4.4-9.1-9.7-9.7C7.6 11.1 11.4 7.3 12 2z" />
    </svg>
  );
}

type AIMode = "link" | "copy";

interface AIPlatform {
  key: string;
  /** Button text, e.g. "Ask ChatGPT" / "Open Gemini". */
  label: string;
  /** Inline brand mark component. */
  Mark: () => JSX.Element;
  /** Brand accent colour for the icon glyph. */
  accent: string;
  /** Soft brand-tinted chip background behind the icon. */
  chipBg: string;
  /** "link" = open a prefilled URL; "copy" = copy prompt then open a blank chat. */
  mode: AIMode;
  /** Destination host, sent with analytics (e.g. "chatgpt.com"). */
  host: string;
  /** For mode === "link": builds the prefilled-prompt URL. */
  build?: (q: string) => string;
  /** For mode === "copy": the plain destination opened in a new tab. */
  openUrl?: string;
}

/**
 * Brand accent colours are applied via inline style (Tailwind can't safelist
 * arbitrary hex), keeping the buttons light/white with a visible brand-tinted
 * icon chip. ChatGPT/Claude/Perplexity prefill; Gemini copies + opens.
 */
const PLATFORMS: AIPlatform[] = [
  {
    key: "chatgpt",
    label: "Ask ChatGPT",
    Mark: ChatGPTMark,
    accent: "#0D8F6F",
    chipBg: "#E6F5F0",
    mode: "link",
    host: "chatgpt.com",
    build: (q) => `https://chatgpt.com/?q=${q}`,
  },
  {
    key: "claude",
    label: "Ask Claude",
    Mark: ClaudeMark,
    accent: "#C8643F",
    chipBg: "#FBEDE6",
    mode: "link",
    host: "claude.ai",
    build: (q) => `https://claude.ai/new?q=${q}`,
  },
  {
    key: "perplexity",
    label: "Ask Perplexity",
    Mark: PerplexityMark,
    accent: "#1F7A86",
    chipBg: "#E4F0F2",
    mode: "link",
    host: "www.perplexity.ai",
    build: (q) => `https://www.perplexity.ai/?q=${q}`,
  },
  {
    key: "gemini",
    label: "Open Gemini",
    Mark: GeminiMark,
    accent: "#3B6CF6",
    chipBg: "#E8F0FE",
    mode: "copy",
    host: "gemini.google.com",
    openUrl: "https://gemini.google.com/app",
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

  // Transient "Prompt copied" hint shown after the Gemini button is used.
  const [copiedHint, setCopiedHint] = useState(false);

  /** Best-effort current path for analytics; falls back to the canonical prop. */
  function currentPath(): string {
    try {
      if (typeof window !== "undefined" && window.location && window.location.pathname) {
        return window.location.pathname;
      }
    } catch {
      /* fall through */
    }
    return pageUrl;
  }

  /**
   * Dedicated per-assistant click event. One event name, queryable by
   * `assistant` + `page_path` so we can count clicks by assistant and page.
   * Fire-and-forget — never throws or blocks the button.
   */
  function trackAssistantClick(
    assistant: string,
    promptType: "prefilled_link" | "copy_prompt",
    destinationHost: string,
    clipboardStatus?: "copied" | "fallback" | "failed",
  ) {
    try {
      trackEvent(AI_CLICK_EVENT, {
        assistant,
        page_path: currentPath(),
        service_type: serviceType,
        prompt_type: promptType,
        destination_host: destinationHost,
        cta_location: CTA_LOCATION,
        topic,
        canonical_url: canonicalUrl,
        ...(clipboardStatus ? { clipboard_status: clipboardStatus } : {}),
      });
    } catch {
      /* ignore — analytics must never break the button */
    }
  }

  /** CTA (Start Evaluation) tracking — kept as the existing cta_click event. */
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

  /** Legacy clipboard fallback for browsers without async clipboard / secure ctx. */
  function legacyCopy(text: string): boolean {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  function flashCopied() {
    setCopiedHint(true);
    window.setTimeout(() => setCopiedHint(false), 4000);
  }

  /**
   * Gemini has no reliable prefill URL, so: copy the prompt, then open a blank
   * Gemini chat. The window is opened synchronously (inside the click gesture)
   * so a popup blocker never fires; clipboard write is attempted alongside and
   * never blocks the open. If copy fails, we still open Gemini (no broken UX).
   *
   * The click event is fired as part of the same gesture (right after the open)
   * and carries the resolved clipboard_status (copied | fallback | failed).
   */
  function handleGeminiClick(openUrl: string, host: string) {
    try {
      window.open(openUrl, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore — opening must never throw to the user */
    }

    const settle = (status: "copied" | "fallback" | "failed") => {
      if (status !== "failed") flashCopied();
      trackAssistantClick("gemini", "copy_prompt", host, status);
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(prompt)
          .then(() => settle("copied"))
          .catch(() => settle(legacyCopy(prompt) ? "fallback" : "failed"));
      } else {
        settle(legacyCopy(prompt) ? "fallback" : "failed");
      }
    } catch {
      settle("failed");
    }
  }

  const buttonClass =
    "group flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 ring-1 ring-gray-200/90 shadow-sm hover:shadow-md hover:ring-gray-300 transition-all cursor-pointer text-left";

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

            {/* AI assistant buttons — light/white with brand-tinted icon chips.
                4-up on desktop, 2-up on mobile; no horizontal overflow. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {PLATFORMS.map((p) => {
                const chip = (
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: p.chipBg, color: p.accent }}
                  >
                    <p.Mark />
                  </span>
                );
                const text = (
                  <span className="min-w-0 flex-1 text-[13px] font-bold text-gray-900 leading-tight">
                    {p.label}
                  </span>
                );

                if (p.mode === "copy") {
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleGeminiClick(p.openUrl as string, p.host)}
                      aria-label={`Copy this page's prompt and open Gemini in a new tab to review this PawTenant page about ${topic}`}
                      className={buttonClass}
                    >
                      {chip}
                      {text}
                    </button>
                  );
                }

                return (
                  <a
                    key={p.key}
                    href={(p.build as (q: string) => string)(q)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAssistantClick(p.key, "prefilled_link", p.host)}
                    aria-label={`${p.label} to review this PawTenant page about ${topic} (opens in a new tab)`}
                    className={buttonClass}
                  >
                    {chip}
                    {text}
                  </a>
                );
              })}
            </div>

            {/* Gemini copy hint (transient, polite for screen readers) */}
            <div className="min-h-[20px]" role="status" aria-live="polite">
              {copiedHint && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[12px] font-semibold text-teal-700 ring-1 ring-teal-100">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                  Prompt copied — paste it into Gemini.
                </span>
              )}
            </div>

            {/* Primary + optional secondary CTA */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3 mt-5">
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
