/*
 * 2026-05-24 visual-storytelling pass.
 *
 * Minimal section-to-section bridge used between the major homepage
 * journey sections (Steps → Benefits → Trust → Provider → Sample
 * → Pricing). Renders as a slim ~52px band so it feels like a
 * transition, not a section. Mobile-tight by default.
 *
 * Optional `to` label shows what comes next. Number/total puts the
 * connector in a "step N of total" rhythm so the journey feels
 * intentional. Background color is `bg` so the calling page can
 * match it to the section above (avoids a hard color seam).
 */

export default function JourneyConnector({
  to,
  number,
  total,
  bg = "bg-white",
}: {
  to: string;
  number: number;
  total: number;
  bg?: string;
}) {
  return (
    <div
      aria-hidden
      className={`relative ${bg} py-3 sm:py-4`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 flex flex-col items-center gap-1.5">
        {/* progress dots */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i + 1 < number ? "w-2 bg-[#4A8472]" : i + 1 === number ? "w-5 bg-[#4A8472]" : "w-2 bg-slate-200"
              }`}
            />
          ))}
        </div>
        {/* label + chevron */}
        <div className="flex items-center gap-1.5 text-[10.5px] sm:text-[11px] uppercase tracking-[0.14em] font-semibold text-slate-500">
          <span>Next</span>
          <i className="ri-arrow-down-s-line text-[#4A8472] text-[16px] leading-none -my-1"></i>
          <span className="text-slate-700 normal-case tracking-normal font-semibold">{to}</span>
        </div>
      </div>
    </div>
  );
}
