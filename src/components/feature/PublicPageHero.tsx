/**
 * PublicPageHero.tsx
 *
 * LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
 *
 * The shared CENTERED hero for public marketing/SEO routes. Fixing one primitive
 * is deliberately preferred over editing dozens of routes independently.
 *
 * Typography is locked to the homepage hero: "Source Serif 4" at font-semibold,
 * same responsive step scale, same centered rhythm as the homepage and
 * /esa-letter-housing.
 *
 * VARIANTS
 *   "light" — tinted band, dark text. Default for informational/commercial pages.
 *   "image" — FULL-BLEED background photograph + controlled gradient overlay and
 *             centered light text. Used where the brief requires the image to
 *             fill the hero (the two landlord pages).
 *
 * SCOPE — public marketing routes ONLY. Never Admin, Customer Portal, Provider
 * Portal, auth, checkout, or legal pages, where centered marketing styling is
 * inappropriate.
 *
 * ANTI-DUPLICATION: `backgroundImage` and the copy are always supplied by the
 * caller. Two pages passing the same image is a guard failure — see
 * scripts/check-public-conversion-pages.mjs, which asserts the two landlord
 * heroes share neither an image nor an H1.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const HEADING_FONT = '"Source Serif 4", Georgia, "Times New Roman", serif';

export interface PublicHeroCta {
  label: string;
  /** Internal path — attribution params are appended automatically. */
  href: string;
  /** Renders as the solid primary button. Exactly one CTA should set this. */
  primary?: boolean;
  icon?: string;
}

export interface PublicPageHeroProps {
  variant?: "light" | "image";
  /** Small uppercase label above the H1. */
  eyebrow?: string;
  /** The H1. Every page must pass its own — never share hero copy between pages. */
  heading: ReactNode;
  /** Supporting paragraph under the H1. */
  subheading?: ReactNode;
  ctas?: PublicHeroCta[];
  /** Short reassurance items rendered as a centered trust row. */
  trustPoints?: string[];
  /** Required for variant="image". Must be unique per page. */
  backgroundImage?: string;
  /** Overlay strength for variant="image". Default "medium". */
  overlay?: "medium" | "strong";
  /** Extra centered content below the CTAs (e.g. an inline verification form). */
  children?: ReactNode;
  className?: string;
}

export default function PublicPageHero({
  variant = "light",
  eyebrow,
  heading,
  subheading,
  ctas = [],
  trustPoints = [],
  backgroundImage,
  overlay = "medium",
  children,
  className = "",
}: PublicPageHeroProps) {
  const { withAttribution } = useAttributionParams();
  const isImage = variant === "image" && !!backgroundImage;

  const headingColor = isImage ? "text-white" : "text-[#231F1A]";
  const subColor = isImage ? "text-gray-100" : "text-[#6B6359]";
  const eyebrowColor = isImage ? "text-orange-300" : "text-[#4A8472]";
  const trustColor = isImage ? "text-white/90" : "text-[#6B6359]";

  return (
    <section
      className={`relative isolate overflow-hidden ${
        isImage ? "" : "bg-[#FDFBF7] border-b border-orange-100/60"
      } ${className}`}
    >
      {/* Full-bleed background image + controlled overlay. The overlay is what
          keeps the centered copy readable — it is not decorative. */}
      {isImage && (
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <img
            src={backgroundImage}
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <div
            className={`absolute inset-0 ${
              overlay === "strong"
                ? "bg-gradient-to-b from-gray-900/85 via-gray-900/78 to-gray-900/88"
                : "bg-gradient-to-b from-gray-900/72 via-gray-900/64 to-gray-900/78"
            }`}
          />
        </div>
      )}

      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-6 pt-28 pb-14 sm:pt-32 sm:pb-20 md:pt-36 md:pb-24">
        {/* Centered column. max-w keeps line length readable at 1440/1920. */}
        <div className="max-w-3xl mx-auto text-center">
          {eyebrow && (
            <p
              className={`text-[11px] sm:text-xs font-extrabold tracking-widest uppercase mb-3 ${eyebrowColor}`}
            >
              {eyebrow}
            </p>
          )}

          <h1
            className={`text-[30px] leading-[1.18] sm:text-[40px] sm:leading-[1.15] lg:text-[52px] lg:leading-[1.12] font-semibold mb-4 sm:mb-5 ${headingColor}`}
            style={{ fontFamily: HEADING_FONT }}
          >
            {heading}
          </h1>

          {subheading && (
            <p
              className={`text-[15px] sm:text-[17px] leading-relaxed max-w-2xl mx-auto ${subColor}`}
            >
              {subheading}
            </p>
          )}

          {ctas.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-7">
              {ctas.map((c) => (
                <Link
                  key={`${c.label}-${c.href}`}
                  to={withAttribution(c.href)}
                  className={
                    c.primary
                      ? "whitespace-nowrap inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-extrabold text-[15px] rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-lg shadow-orange-500/25"
                      : isImage
                        ? "whitespace-nowrap inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/10 border border-white/35 backdrop-blur-sm text-white font-bold text-[15px] rounded-md hover:bg-white/20 transition-colors cursor-pointer"
                        : "whitespace-nowrap inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white border border-gray-300 text-gray-900 font-bold text-[15px] rounded-md hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                  }
                >
                  {c.icon && <i className={c.icon} aria-hidden="true"></i>}
                  {c.label}
                </Link>
              ))}
            </div>
          )}

          {trustPoints.length > 0 && (
            <ul
              className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-6 text-[13px] font-semibold ${trustColor}`}
            >
              {trustPoints.map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <i
                    className={`ri-checkbox-circle-fill ${isImage ? "text-emerald-300" : "text-[#4A8472]"}`}
                    aria-hidden="true"
                  ></i>
                  {t}
                </li>
              ))}
            </ul>
          )}

          {children && <div className="mt-8">{children}</div>}
        </div>
      </div>
    </section>
  );
}
