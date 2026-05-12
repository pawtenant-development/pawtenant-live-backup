import { CSSProperties } from "react";

interface SampleLetterCardProps {
  /** Visual size preset.
   *  - "default": same chrome as Step 3 checkout
   *  - "compact": smaller corner radius/shadow for tighter contexts */
  size?: "default" | "compact";
  /** Override alt text. Defaults to a privacy-safe description. */
  alt?: string;
  /** Force eager loading (e.g. above-the-fold landing pages). */
  eager?: boolean;
  /** Show the small "Sample" pill in the corner. Default true. */
  showSampleBadge?: boolean;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Optional inline style on the outer wrapper. */
  style?: CSSProperties;
}

/**
 * Canonical sample-letter visual used everywhere on the marketing site.
 * Single source: /images/checkout/esa-sample-letter.svg (same file Step 3
 * checkout uses). Wrapper styling matches Step 3 for consistency.
 *
 * Use this anywhere the user sees a representative ESA letter image so the
 * brand experience stays consistent end-to-end.
 */
export default function SampleLetterCard({
  size = "default",
  alt = "Sample PawTenant ESA letter showing verification ID, patient info, and licensed provider signature. Names and details are placeholders.",
  eager = false,
  showSampleBadge = true,
  className = "",
  style,
}: SampleLetterCardProps) {
  const radius = size === "compact" ? "rounded-xl" : "rounded-2xl";
  const shadow =
    size === "compact"
      ? "shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]"
      : "shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)]";

  return (
    <div
      className={`relative ${radius} overflow-hidden ${shadow} ring-1 ring-slate-200 bg-white ${className}`}
      style={style}
    >
      <img
        src="/images/checkout/esa-sample-letter.svg"
        alt={alt}
        width={800}
        height={1035}
        className="w-full h-auto block"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
      {showSampleBadge && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[9px] font-semibold tracking-[0.24em] text-slate-500 uppercase">
          Sample
        </div>
      )}
    </div>
  );
}
