import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  /** Pixel scroll distance before the sticky CTA fades in. Default 500 — past the home hero CTA. */
  showAfterPx?: number;
  /** Destination — defaults to the assessment entry. */
  to?: string;
  /** Button label. */
  label?: string;
  /** Optional remix-icon class for the leading icon. */
  icon?: string;
  /** Fired when the bar's link is clicked (analytics). Never blocks navigation. */
  onClick?: () => void;
  /**
   * ESA-HOUSING-LANDING-PAGE-CRO-001 — opt-in consent safety. DEFAULT FALSE, so
   * every page that mounted this component before today keeps byte-identical
   * behaviour.
   *
   * When true:
   *   • the bar drops to z-[9990], BELOW CookieBanner's expanded card
   *     (z-[9999]) and below its collapsed pill (z-[9998]); and
   *   • the bar stays hidden until the visitor has actually decided consent,
   *     or the banner has collapsed itself to the pill — which CookieBanner
   *     already anchors at bottom-[calc(88px + safe-area)] precisely so a
   *     ~77px bottom bar can sit under it.
   *
   * Together those mean this bar can never sit on top of the Accept / Reject
   * controls, which would be a dark pattern as well as a consent defect.
   */
  consentSafe?: boolean;
  /**
   * When > 0, hide the bar once the viewport bottom comes within this many
   * pixels of the document bottom, so the bar stops covering the page's own
   * final CTA and footer. DEFAULT 0 = off (previous behaviour).
   */
  hideNearBottomPx?: number;
}
// CookieBanner's own storage contract. Kept as literals rather than imported so
// this component never pulls the (lazy-loaded) banner into a page's bundle.
const CONSENT_KEY = "cookie_consent";
const BANNER_COLLAPSED_KEY = "cookie_banner_collapsed";

function consentSettled(): boolean {
  try {
    if (localStorage.getItem(CONSENT_KEY)) return true;
  } catch {
    /* storage blocked → fall through */
  }
  try {
    if (sessionStorage.getItem(BANNER_COLLAPSED_KEY) === "1") return true;
  } catch {
    /* storage blocked → fall through */
  }
  return false;
}

/**
 * MobileStickyApplyCTA — bottom-fixed "Apply now" bar shown only on small
 * viewports (md:hidden) AFTER the user has scrolled past the hero. This
 * keeps the first viewport calm (only one CTA visible above the fold) while
 * still keeping a persistent conversion path once the hero CTA scrolls out.
 *
 * Pure client-side: no SSR concern in this Vite SPA, but `visible` defaults
 * to false so SSR/snapshot tools that pre-render also start hidden — they
 * won't flash the CTA on first paint.
 *
 * The bar is `position: fixed`, so it is out of flow and can never contribute
 * layout shift; it only ever fades/translates.
 */
export default function MobileStickyApplyCTA({
  showAfterPx = 500,
  to = "/assessment",
  label = "Get Your ESA Letter — From $115",
  icon = "ri-file-text-line",
  onClick,
  consentSafe = false,
  hideNearBottomPx = 0,
}: Props) {
  const [scrolledPast, setScrolledPast] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);
  // Starts true when the feature is off so the default render path is
  // unchanged for every existing caller.
  const [consentOk, setConsentOk] = useState(!consentSafe);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      setScrolledPast(y > showAfterPx);
      if (hideNearBottomPx > 0) {
        const remaining = document.documentElement.scrollHeight - (y + window.innerHeight);
        setNearBottom(remaining <= hideNearBottomPx);
      }
    };
    // Run once on mount in case the page loaded with scroll restored.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [showAfterPx, hideNearBottomPx]);

  // CookieBanner writes its decision straight to storage with no event, so the
  // only portable way to notice is a light poll. It stops itself the moment
  // consent settles, and never runs at all when consentSafe is off.
  useEffect(() => {
    if (!consentSafe || consentOk) return;
    if (consentSettled()) {
      setConsentOk(true);
      return;
    }
    const id = window.setInterval(() => {
      if (consentSettled()) {
        setConsentOk(true);
        window.clearInterval(id);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [consentSafe, consentOk]);

  const visible = scrolledPast && consentOk && !nearBottom;

  // Inline styles for the dynamic transform/opacity so Tailwind's JIT
  // can't miss any of these utilities in production builds. The static
  // utilities (md:hidden, fixed, bottom-0, etc.) stay in className.
  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 ${
        consentSafe ? "z-[9990]" : "z-[9999]"
      } bg-white border-t border-gray-200 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom,16px))]`}
      style={{
        transition: "opacity 200ms ease-out, transform 200ms ease-out",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(100%)",
        pointerEvents: visible ? "auto" : "none",
      }}
      aria-hidden={!visible}
    >
      <Link
        to={to}
        onClick={onClick}
        tabIndex={visible ? 0 : -1}
        className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-md shadow-orange-500/20"
      >
        <i className={icon} aria-hidden></i>
        {label}
      </Link>
    </div>
  );
}