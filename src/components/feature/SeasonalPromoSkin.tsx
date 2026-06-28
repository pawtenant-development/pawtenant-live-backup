import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  SEASONAL_PROMO,
  getSeasonalPhase,
  getCountdownTargetMs,
  type SeasonalPhase,
} from "../../config/seasonalPromo";

/**
 * Seasonal Independence Day "skin" — temporary, easily removable, NOT a popup,
 * NOT a full-width ribbon. Isolated, gated pieces (all driven by ONE config +
 * date gate in src/config/seasonalPromo.ts):
 *
 *   1. <SeasonalLogoFlag />   — tilted, gently-waving SVG flag on the logo
 *      (SharedNavbar; site-wide).
 *   2. <SeasonalApplyAccent /> + useSeasonalActive() — a subtle patriotic
 *      "shine + star" treatment on the navbar "Apply Now" CTAs (SharedNavbar).
 *   3. <SeasonalHeroPromo placement="desktop|mobile" /> (default export) — the
 *      premium frosted-navy "event capsule" inside the HOMEPAGE hero
 *      (desktop: above the scroll cue; mobile: below the Full Refund line).
 *   4. <SeasonalPromoBar /> — the same capsule on OTHER public pages, pinned
 *      under the navbar (absolute → scrolls away; never on the homepage, never
 *      on excluded/internal routes).
 *
 * Why an SVG flag (not 🇺🇸): Windows has no flag-emoji glyphs, so the emoji
 * renders as the bare letters "US". The SVG renders crisply on every OS.
 *
 * Phase gate: before Jul 1 → countdown to unlock · Jul 1–5 → countdown to end ·
 * after Jul 5 → everything hides. Disable everything: enabled:false in the
 * config. Hydration-safe (client-only `mounted` gate).
 */

// US flag palette — kept local so it never leaks into the brand theme; brand
// orange stays the primary CTA color.
const FLAG_RED = "#C0354B";
const FLAG_BLUE = "#3C3B6E";
const STAR_GOLD = "#E3B341";
const CAPSULE_NAVY = "rgba(11,15,34,0.82)";

// Sensitive routes where the skin must NEVER appear. Path-prefix match.
const EXCLUDED_PREFIXES = [
  "/assessment",
  "/psd-assessment",
  "/account", // /account/checkout (customer checkout / portal)
  "/my-orders",
  "/customer-login",
  "/admin", // all /admin* incl. /admin-login
  "/provider", // /provider-login + /provider-portal
  "/reset-password",
  "/go-live",
  "/company",
  "/verify",
  "/r/",
  "/consultation-request",
];

function isExcluded(pathname: string): boolean {
  const p = (pathname || "").toLowerCase();
  // thank-you pages live under the assessment prefixes (already excluded) but
  // guard the literal substring too in case of any standalone variant.
  if (p.includes("thank-you") || p.includes("thankyou")) return true;
  return EXCLUDED_PREFIXES.some((pre) => p.startsWith(pre));
}

function fmtCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d}d ${pad(h)}h ${pad(m)}m`;
}

/** Shared client-only gate. */
function useSeasonalState() {
  const { pathname } = useLocation();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<SeasonalPhase>("off");

  useEffect(() => {
    setMounted(true);
    setPhase(getSeasonalPhase());
    const id = window.setInterval(() => setPhase(getSeasonalPhase()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const excluded = isExcluded(pathname);
  const active = mounted && phase !== "off" && !excluded;
  return { active, phase, excluded, mounted, pathname };
}

/** Tiny boolean hook for SharedNavbar's Apply Now treatment. */
export function useSeasonalActive(): boolean {
  return useSeasonalState().active;
}

/* ────────────────────────────────────────────────────────────────────────────
 * A small, crisp US flag drawn in SVG (no emoji — see note above).
 * ──────────────────────────────────────────────────────────────────────────── */
function FlagMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 30 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="3.1" cy="3" r="1.7" fill={STAR_GOLD} />
      <rect x="2.4" y="3" width="1.6" height="23" rx="0.8" fill="#A7AEBD" />
      <g className="spk-flag">
        <rect x="3.8" y="3" width="21.5" height="13.6" rx="1.4" fill="#FBFBFD" />
        <rect x="3.8" y="4.74" width="21.5" height="1.94" fill={FLAG_RED} />
        <rect x="3.8" y="8.62" width="21.5" height="1.94" fill={FLAG_RED} />
        <rect x="3.8" y="12.5" width="21.5" height="1.94" fill={FLAG_RED} />
        <rect x="3.8" y="14.66" width="21.5" height="1.94" fill={FLAG_RED} />
        <rect x="3.8" y="3" width="9.8" height="7.3" rx="0.5" fill={FLAG_BLUE} />
        <circle cx="6" cy="5" r="0.64" fill="#fff" />
        <circle cx="8.7" cy="5" r="0.64" fill="#fff" />
        <circle cx="11.3" cy="5" r="0.64" fill="#fff" />
        <circle cx="7.35" cy="7.45" r="0.64" fill="#fff" />
        <circle cx="10.0" cy="7.45" r="0.64" fill="#fff" />
      </g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Logo flag — slightly larger + tilted, planted at the logo's top-right corner.
 * Zero-width anchor so it never shifts the navbar layout. Decorative.
 * ──────────────────────────────────────────────────────────────────────────── */
export function SeasonalLogoFlag() {
  const { active } = useSeasonalState();
  if (!active) return null;
  return (
    <span aria-hidden="true" className="relative -ml-2 inline-block w-0 select-none">
      <style>{`
        @keyframes spk-wave{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
        .spk-flag{transform-origin:4px 9px;animation:spk-wave 3.2s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.spk-flag{animation:none}}
      `}</style>
      <FlagMark className="absolute -left-1.5 -top-[21px] h-[27px] w-auto origin-bottom-left -rotate-[13deg] drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)]" />
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Apply Now seasonal accent — a subtle gold "shine" sweep behind the label.
 * Mounted inside the navbar's orange Apply Now CTAs (which get relative
 * overflow-hidden + a faint gold ring when seasonal). Premium, not busy.
 * ──────────────────────────────────────────────────────────────────────────── */
export function SeasonalApplyAccent() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
      <style>{`
        @keyframes spk-shine{0%{transform:translateX(-130%)}55%,100%{transform:translateX(150%)}}
        .spk-shine{position:absolute;inset:0;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.55) 50%,transparent 62%);animation:spk-shine 4.8s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.spk-shine{animation:none;display:none}}
      `}</style>
      <span className="spk-shine" />
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The capsule pill (shared content for hero + bar placements).
 * size "lg" = homepage hero · "md" = under-navbar bar on other pages.
 * ──────────────────────────────────────────────────────────────────────────── */
function PromoPill({ phase, size }: { phase: SeasonalPhase; size: "lg" | "md" }) {
  const [nowMs, setNowMs] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const copyCode = useCallback(() => {
    try {
      navigator.clipboard
        ?.writeText(SEASONAL_PROMO.code)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  const isDuring = phase === "during";
  const remaining = fmtCountdown(getCountdownTargetMs(phase) - (nowMs || Date.now()));
  const datePhrase = isDuring ? "ends July 5" : "unlocks July 1";

  const lg = size === "lg";
  // Both placements now sit at the hero bottom (homepage hero + other pages'
  // hero), so the capsule is unconstrained → 40px, legible. Mobile uses tight
  // gaps + a trimmed layout so $40 off · JULY40 · timer · Start always fits
  // with no overflow (see mobile line below).
  const pillH = lg ? "h-10" : "h-9";
  const pillPad = lg ? "px-3.5 sm:px-5" : "px-3 sm:px-4";
  const pillGap = "gap-1.5 sm:gap-3.5"; // tight on mobile to prevent cutoff
  const textSize = lg ? "text-[13px]" : "text-[12.5px]";
  const mTextSize = "text-[12px]";

  const starBurst = (
    <span aria-hidden="true" className="relative hidden h-4 w-[22px] flex-shrink-0 sm:inline-block">
      <span className="absolute left-0 top-[2px] text-[12px] leading-none" style={{ color: STAR_GOLD }}>★</span>
      <span className="absolute left-[10px] top-0 text-[9px] leading-none" style={{ color: "#fff" }}>✦</span>
      <span className="absolute left-[7px] top-[9px] text-[8px] leading-none" style={{ color: FLAG_RED }}>★</span>
    </span>
  );

  const codeChip = (
    <button
      type="button"
      onClick={copyCode}
      title={`Copy code ${SEASONAL_PROMO.code}`}
      className={`group inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-dashed px-2 py-[2px] align-middle text-[11.5px] font-extrabold tracking-[0.14em] transition-colors ${
        copied
          ? "border-transparent bg-emerald-500 text-white"
          : "border-white/35 bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {copied ? "COPIED" : SEASONAL_PROMO.code}
      {/* copy icon hidden on mobile so the JULY40 chip never gets squeezed */}
      <i
        className={`${copied ? "ri-check-line" : "ri-file-copy-line opacity-60 group-hover:opacity-100"} hidden text-[11px] leading-none sm:inline-block`}
        aria-hidden="true"
      ></i>
    </button>
  );

  const countdownPill = (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-[3px] text-[11.5px] font-semibold tabular-nums text-white/90 ring-1 ring-white/10"
      title={isDuring ? "Time remaining" : "Until it unlocks"}
    >
      <i className="ri-time-line text-[12px] leading-none" style={{ color: STAR_GOLD }} aria-hidden="true"></i>
      {remaining}
    </span>
  );

  const cta = (
    <Link
      to={SEASONAL_PROMO.ctaHref}
      className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-orange-500 px-3.5 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.45)] transition-colors hover:bg-orange-600"
    >
      <span className="hidden sm:inline">Start evaluation</span>
      <span className="sm:hidden">Start</span>
      <i className="ri-arrow-right-line text-sm leading-none" aria-hidden="true"></i>
    </Link>
  );

  return (
    <div className="relative max-w-[94vw]">
      {/* soft festive glow (box stays inside the pill → never adds h-scroll) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(70% 140% at 50% 50%, rgba(227,179,65,0.30), rgba(60,59,110,0.22) 55%, transparent 78%)",
        }}
      />
      <div
        className={`pointer-events-auto flex items-center overflow-hidden rounded-full ring-1 ring-white/15 backdrop-blur-md ${pillH} ${pillPad} ${pillGap}`}
        style={{
          background: CAPSULE_NAVY,
          boxShadow: "0 12px 34px -14px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {starBurst}

        {/* Desktop / tablet line */}
        <span className={`hidden items-center gap-2 truncate leading-none text-white/85 sm:flex ${textSize}`}>
          <span className="font-semibold text-white">{SEASONAL_PROMO.eventName} offer</span>
          <span className="text-white/30">·</span>
          <span className="whitespace-nowrap">{datePhrase}</span>
          <span className="text-white/30">·</span>
          <span className="whitespace-nowrap font-extrabold text-white">$40 off</span>
          <span>with</span>
          {codeChip}
        </span>

        {/* Mobile line (condensed) — $40 off · JULY40, then timer + Start sit
            beside it as pill-row siblings. Tight gap, no decorative stars and no
            copy icon on mobile so nothing is clipped. */}
        <span className={`flex flex-shrink-0 items-center gap-1.5 leading-none text-white/85 sm:hidden ${mTextSize}`}>
          <span className="whitespace-nowrap font-extrabold text-white">$40 off</span>
          {codeChip}
        </span>

        {countdownPill}
        {cta}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hero promo (default export) — homepage hero placement (see HeroSection).
 * ──────────────────────────────────────────────────────────────────────────── */
export default function SeasonalHeroPromo({
  placement = "desktop",
}: {
  placement?: "desktop" | "mobile";
}) {
  const { active, phase } = useSeasonalState();
  if (!active) return null;

  const wrapperClass =
    placement === "desktop"
      ? "pointer-events-none absolute inset-x-0 bottom-[4.5rem] z-10 hidden justify-center px-4 sm:flex"
      : "pointer-events-none flex justify-center sm:hidden";

  return (
    <div className={wrapperClass}>
      <PromoPill phase={phase} size="lg" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Promo bar — the capsule on OTHER public pages, pinned under the navbar.
 * Absolute → scrolls away. Never on the homepage (hero handles it) or excluded
 * routes. Mounted once at the App shell level.
 * ──────────────────────────────────────────────────────────────────────────── */
// The bar also stays OFF the homepage (the hero handles it) and off the state /
// PSD-state pages (those page designs are intentionally left untouched — note
// the trailing slash so the hyphenated guide pages like /esa-letter-cost and
// /esa-letter-for-apartments are NOT excluded).
const BAR_EXCLUDED_PREFIXES = ["/esa-letter/", "/psd-letter/"];
const MIN_HERO_HEIGHT = 360; // below this we assume there's no real hero → hide
const HERO_BOTTOM_GAP = 18; // px above the hero's bottom edge

/**
 * SeasonalPromoBar — the capsule on OTHER public pages. Instead of pinning it
 * under the navbar (which looked detached), it MEASURES the page's hero
 * <section> and positions the capsule near the hero's BOTTOM, centered, so it
 * feels integrated with the hero and scrolls naturally with the page. Absolute
 * in the document (not fixed). Renders nothing when there's no real hero, on
 * the homepage (its hero handles the capsule), or on excluded / state routes.
 */
export function SeasonalPromoBar() {
  const { active, phase, pathname } = useSeasonalState();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState<number | null>(null);

  const p = (pathname || "").toLowerCase();
  const excluded =
    !active || p === "/" || BAR_EXCLUDED_PREFIXES.some((pre) => p.startsWith(pre));

  useEffect(() => {
    if (excluded) {
      setTop(null);
      return;
    }
    let ro: ResizeObserver | null = null;

    const measure = () => {
      const hero = document.querySelector("section");
      if (!hero) {
        setTop(null);
        return;
      }
      const rect = hero.getBoundingClientRect();
      if (rect.height < MIN_HERO_HEIGHT) {
        setTop(null);
        return;
      }
      const sy = window.scrollY || document.documentElement.scrollTop || 0;
      const heroBottomDoc = rect.bottom + sy;
      // Correct for any positioned ancestor (offsetParent) so the document-space
      // target maps to the right CSS `top`. Usually offsetParent is <body> at 0.
      const op = wrapRef.current?.offsetParent as HTMLElement | null;
      const opTopDoc = op ? op.getBoundingClientRect().top + sy : 0;
      const capsuleH =
        wrapRef.current?.firstElementChild?.getBoundingClientRect().height || 40;
      setTop(Math.round(heroBottomDoc - opTopDoc - capsuleH - HERO_BOTTOM_GAP));
    };

    measure();
    // Re-measure as the hero settles (images/fonts) and on resize.
    const t1 = window.setTimeout(measure, 300);
    const t2 = window.setTimeout(measure, 1200);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    const hero = document.querySelector("section");
    if (hero && "ResizeObserver" in window) {
      ro = new ResizeObserver(measure);
      ro.observe(hero);
    }
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
      ro?.disconnect();
    };
  }, [excluded, pathname]);

  if (excluded || top === null) return null;

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-x-0 z-[40] flex justify-center px-3"
      style={{ top }}
    >
      <PromoPill phase={phase} size="lg" />
    </div>
  );
}
