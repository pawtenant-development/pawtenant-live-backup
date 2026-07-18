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
  /**
   * Accent shade. "default" keeps the site-wide amber-orange used on every
   * existing page (unchanged). "bold" is the homepage CRO Apply-Now orange
   * (orange-500/600) — opt-in so no other route's sticky bar changes.
   */
  variant?: "default" | "bold";
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
 */
export default function MobileStickyApplyCTA({
  showAfterPx = 500,
  to = "/assessment",
  label = "Get Your ESA Letter — From $115",
  icon = "ri-file-text-line",
  variant = "default",
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      setVisible(y > showAfterPx);
    };
    // Run once on mount in case the page loaded with scroll restored.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfterPx]);

  // Inline styles for the dynamic transform/opacity so Tailwind's JIT
  // can't miss any of these utilities in production builds. The static
  // utilities (md:hidden, fixed, bottom-0, etc.) stay in className.
  // Accent shade. Default branch is character-for-character the original
  // amber-orange treatment, so every existing caller renders identically;
  // only the homepage opts into "bold" (Apply-Now orange-500).
  const accent =
    variant === "bold"
      ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20"
      : "bg-orange-400 hover:bg-orange-500 shadow-orange-400/20";

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-gray-200 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom,16px))]"
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
        tabIndex={visible ? 0 : -1}
        className={`whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 text-white font-bold text-sm rounded-md transition-colors cursor-pointer shadow-md ${accent}`}
      >
        <i className={icon}></i>
        {label}
      </Link>
    </div>
  );
}
