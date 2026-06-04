/**
 * SeoKit.tsx — lightweight, reusable building blocks for public AI-SEO /
 * answer-engine content pages.
 *
 * Added 2026-06-05 (PAWTENANT-AI-SEO-SEARCH-ENHANCEABILITY-PUBLIC-PAGES-TEST).
 *
 * Design notes:
 *  - Pure presentational + Tailwind + remixicon (ri-*) only. No new deps,
 *    no image imports, no network calls — safe for LCP/PageSpeed.
 *  - Answer-first: <AIAnswerBox> renders a clearly-marked direct answer near
 *    the top of a page so answer engines (ChatGPT, AI Overviews, Perplexity)
 *    can lift a concise, accurate response.
 *  - <JsonLd> centralizes structured-data injection so pages stay clean.
 *
 * These components carry NO business logic and touch NO checkout/payment/
 * admin/analytics code.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import type { FaqItem } from "@/lib/seoSchema";

/* ── JsonLd ──────────────────────────────────────────────────────────────── */
/** Injects a JSON-LD object as a <script type="application/ld+json">. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/* ── AIAnswerBox ─────────────────────────────────────────────────────────── */
/**
 * Direct-answer box. Place near the top of the page, right after the H1/hero.
 * `question` becomes a visible H2 so it matches a natural search query.
 */
export function AIAnswerBox({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-[#fdf6ee] p-6 sm:p-7">
      <div className="flex items-center gap-2 mb-3">
        <i className="ri-question-answer-line text-orange-500"></i>
        <span className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
          Quick answer
        </span>
      </div>
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2.5 leading-snug">
        {question}
      </h2>
      <div className="text-gray-700 text-sm sm:text-[15px] leading-relaxed space-y-3">
        {children}
      </div>
    </div>
  );
}

/* ── TrustBadgeRow ───────────────────────────────────────────────────────── */
export interface TrustBadge {
  icon: string;
  label: string;
}

export function TrustBadgeRow({
  badges,
  mobileCount,
}: {
  badges: TrustBadge[];
  /** If set, only the first N badges show on mobile; the rest appear from sm: up. Keeps the mobile hero compact. */
  mobileCount?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
      {badges.map((b, i) => {
        const hideOnMobile = mobileCount != null && i >= mobileCount;
        return (
          <span
            key={b.label}
            className={`${hideOnMobile ? "hidden sm:inline-flex" : "inline-flex"} items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700`}
          >
            <i className={`${b.icon} text-orange-500`}></i>
            {b.label}
          </span>
        );
      })}
    </div>
  );
}

/* ── ComparisonTable ─────────────────────────────────────────────────────── */
export interface ComparisonRow {
  criterion: string;
  /** What a legitimate / responsible service does for this criterion. */
  good: string;
}

/**
 * Neutral "what to look for" criteria table. Intentionally does NOT name or
 * rate competitors per-row (avoids copying competitor wording / unverifiable
 * claims). Each row states the criterion and what a responsible service does.
 */
export function ComparisonTable({
  caption,
  rows,
}: {
  caption?: string;
  rows: ComparisonRow[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {caption && (
        <div className="px-5 py-3 bg-[#fafafa] border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {caption}
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.criterion} className="px-5 py-4 sm:flex sm:gap-5">
            <div className="sm:w-64 sm:flex-shrink-0 text-sm font-bold text-gray-900 mb-1 sm:mb-0 flex items-start gap-2">
              <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
              <span>{r.criterion}</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed sm:flex-1">{r.good}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── SeoFaqSection ───────────────────────────────────────────────────────── */
/**
 * Accordion FAQ. Presentational only — the page is responsible for emitting
 * the matching FAQPage JSON-LD (via faqSchema + <JsonLd>) so schema and the
 * visible list stay in one source of truth on the page.
 */
export function SeoFaqSection({
  heading = "Frequently asked questions",
  eyebrow = "Common questions",
  faqs,
}: {
  heading?: string;
  eyebrow?: string;
  faqs: FaqItem[];
}) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8 sm:mb-10">
        <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
          {eyebrow}
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
          {heading}
        </h2>
      </div>
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <div key={faq.q} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 text-left cursor-pointer"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span
                className={`text-[13.5px] sm:text-sm font-semibold leading-snug ${
                  open === i ? "text-orange-500" : "text-gray-900"
                }`}
              >
                {faq.q}
              </span>
              <i
                className={`${open === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500 flex-shrink-0`}
              ></i>
            </button>
            {open === i && (
              <div className="px-5 sm:px-6 pb-4">
                <p className="text-gray-600 text-[13px] sm:text-sm leading-relaxed">{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── RelatedResources ────────────────────────────────────────────────────── */
export interface RelatedLink {
  to: string;
  title: string;
  desc: string;
}

export function RelatedResources({
  heading = "Keep reading",
  links,
}: {
  heading?: string;
  links: RelatedLink[];
}) {
  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">{heading}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
          >
            <div className="text-[14.5px] font-semibold text-gray-900 mb-1.5 leading-snug">
              {l.title}
            </div>
            <p className="text-[12.5px] text-gray-600 leading-relaxed">{l.desc}</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
              Read more <i className="ri-arrow-right-line" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── LastUpdated ─────────────────────────────────────────────────────────── */
/**
 * Reviewed / last-updated trust line. `date` is a human string passed by the
 * page (no Date.now() — keeps prerender deterministic).
 */
export function LastUpdated({
  date,
  reviewer = "PawTenant editorial team",
}: {
  date: string;
  reviewer?: string;
}) {
  return (
    <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
      <i className="ri-calendar-check-line"></i>
      Last reviewed {date} · {reviewer}
    </p>
  );
}

/* ── LifestyleImageSection ───────────────────────────────────────────────── */
export interface LifestyleSectionProps {
  /** Existing local optimized asset path (e.g. /assets/lifestyle/...). */
  image: string;
  alt: string;
  eyebrow?: string;
  heading: string;
  body: string;
  bullets?: string[];
  /** Put the image on the right (desktop). On mobile the image is always first. */
  reverse?: boolean;
  /** Section background override. */
  className?: string;
}

/**
 * Emotional / lifestyle split section — a real pet-owner / housing / telehealth
 * photo beside short supportive copy. Reuses existing optimized local assets
 * only (no new files, no remote/CDN). Image is lazy-loaded with a fixed
 * aspect ratio (no CLS) and `object-cover` so pets/people aren't cropped
 * awkwardly. On mobile the image renders FIRST so the emotional visual lands
 * within the first couple of screenfuls.
 */
export function LifestyleImageSection({
  image,
  alt,
  eyebrow,
  heading,
  body,
  bullets,
  reverse = false,
  className,
}: LifestyleSectionProps) {
  return (
    <section className={`py-12 sm:py-16 ${className || "bg-white"}`}>
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className={`order-1 ${reverse ? "lg:order-2" : "lg:order-1"}`}>
            <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
              <img
                src={image}
                alt={alt}
                width={1000}
                height={750}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
          <div className={`order-2 text-center lg:text-left ${reverse ? "lg:order-1" : "lg:order-2"}`}>
            {eyebrow && (
              <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
                {eyebrow}
              </span>
            )}
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">
              {heading}
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-4 max-w-xl mx-auto lg:mx-0">
              {body}
            </p>
            {bullets && bullets.length > 0 && (
              <ul className="space-y-2.5 text-left max-w-md mx-auto lg:mx-0">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── PsdCrossLink ────────────────────────────────────────────────────────── */
/**
 * Compact ESA→PSD cross-link banner. Keeps ESA pages ESA-focused while
 * surfacing the PSD path for the small subset who need it. Links to the
 * existing /psd-assessment and /all-about-service-dogs routes.
 *
 * Intentionally short (one slim card) — do NOT let PSD dominate an ESA page.
 * Compliance-safe: "different documentation", "for qualifying individuals",
 * no guarantee language.
 */
export function PsdCrossLink() {
  return (
    <div className="max-w-3xl mx-auto rounded-2xl border border-[#4A8472]/30 bg-[#4A8472]/[0.06] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="w-10 h-10 rounded-xl bg-[#4A8472]/15 text-[#4A8472] flex items-center justify-center flex-shrink-0">
          <i className="ri-shield-star-line text-xl"></i>
        </span>
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">
            Need PSD documentation instead?
          </h3>
          <p className="text-[13px] sm:text-sm text-gray-600 leading-relaxed mb-3">
            A Psychiatric Service Dog (PSD) is different from an emotional support animal — it
            involves disability-related task training and is for qualifying individuals. If a service
            dog fits your situation better, start there instead.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Link
              to="/psd-assessment"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#4A8472] hover:text-[#3F7061]"
            >
              <i className="ri-arrow-right-line"></i> Start PSD assessment
            </Link>
            <Link
              to="/all-about-service-dogs"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-[#4A8472]"
            >
              PSD vs ESA explained
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── EducationalDisclaimer ───────────────────────────────────────────────── */
export function EducationalDisclaimer() {
  return (
    <div className="flex items-start gap-3">
      <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
      <p className="text-xs text-gray-500 leading-relaxed">
        <strong className="text-gray-600">Educational information, not legal or medical advice.</strong>{" "}
        PawTenant connects you with licensed mental health providers. Whether an ESA or PSD is
        appropriate is decided by a licensed provider after a real evaluation — approval is never
        guaranteed, and a valid letter supports but does not guarantee a landlord&rsquo;s decision.
        For your specific situation, consult a qualified professional or your state agency.
      </p>
    </div>
  );
}
