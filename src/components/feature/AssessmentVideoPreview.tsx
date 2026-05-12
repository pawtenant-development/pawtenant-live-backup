import { Link } from "react-router-dom";

interface AssessmentVideoPreviewProps {
  /** Optional eyebrow label above the headline. */
  eyebrow?: string;
  /** Section heading; pass empty string to omit. */
  heading?: string;
  /** Sub-headline / supporting copy. */
  subheading?: string;
  /** Override outer background classes. Defaults to neutral surface. */
  className?: string;
  /** Show the green "Start Your Assessment" CTA below the player. */
  showCTA?: boolean;
  /** Tighter top/bottom padding for above-the-fold contexts. */
  compact?: boolean;
  /** Hide the grid on mobile (clip cards only show on md+). Default false. */
  desktopOnly?: boolean;
}

/**
 * Supabase Storage path for the four mobile-screen recordings of the real
 * PawTenant assessment UI. These are short (6-19s each), 384x832 portrait,
 * 0.7-1.4 MB each. Public bucket — no auth needed.
 */
const SUPABASE_PUBLIC =
  "https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets/assessment-ui";

const CLIPS = [
  { src: `${SUPABASE_PUBLIC}/assessment_clip_1.mp4`, step: "01", label: "Quick intake" },
  { src: `${SUPABASE_PUBLIC}/assessment_clip_2.mp4`, step: "02", label: "Mental-health screening" },
  { src: `${SUPABASE_PUBLIC}/assessment_clip_3.mp4`, step: "03", label: "Pet & housing details" },
  { src: `${SUPABASE_PUBLIC}/assessment_clip_4.mp4`, step: "04", label: "Review & confirm" },
];

/**
 * Phone-style frame around one short assessment-UI clip.
 *
 * Source clips are 384x832 portrait, so the card mirrors that aspect with a
 * subtle phone-style bezel rather than a desktop browser chrome.
 *
 * Videos use preload="metadata" + lazy-load loading hint — only a few KB
 * of headers are fetched per clip on initial page paint. Real bytes stream
 * only when the autoplay actually kicks in once the section is on screen,
 * making this safe to mount eagerly even when 4 cards are rendered.
 */
function ClipCard({
  src,
  step,
  label,
}: {
  src: string;
  step: string;
  label: string;
}) {
  return (
    <div className="group">
      {/* Phone-style frame matching the 384x832 source aspect (~9:19.5) */}
      <div className="relative mx-auto w-full max-w-[200px] aspect-[9/19.5] rounded-[28px] bg-slate-900 ring-1 ring-slate-800 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.45)] overflow-hidden">
        {/* Soft top notch — purely decorative, mimics a phone */}
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-slate-700/80 z-10"
        />
        {/* Video well */}
        <div className="absolute inset-[5px] rounded-[22px] overflow-hidden bg-slate-100">
          {/* Static fallback behind the video — keeps the card looking
              friendly even on the rare slow-network frame before metadata
              arrives. The play glyph is decorative; the video autoplays. */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#f0faf7] to-[#e8f5f1]">
            <span className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-white text-[#1a5c4f] shadow-sm">
              <i className="ri-play-line text-xl" aria-hidden />
            </span>
          </div>
          <video
            className="absolute inset-0 w-full h-full object-cover bg-slate-100"
            src={src}
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
            // @ts-expect-error — `loading` is widely supported on <video> in modern engines
            loading="lazy"
            aria-label={`Step ${step} of the PawTenant online assessment — silent preview`}
          />
          {/* Subtle gradient at bottom for label legibility */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 via-black/15 to-transparent pointer-events-none"
          />
        </div>
        {/* Step pill */}
        <div className="absolute top-3 left-3 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 backdrop-blur ring-1 ring-slate-200 text-[10px] font-extrabold tracking-[0.18em] text-slate-700 uppercase">
            Step {step}
          </span>
        </div>
      </div>
      {/* Caption */}
      <p className="text-center mt-3 text-[12px] md:text-[13px] font-semibold text-slate-700">
        {label}
      </p>
    </div>
  );
}

export default function AssessmentVideoPreview({
  eyebrow = "See It In Action",
  heading = "Inside the Online Assessment",
  subheading = "Four short, narration-free clips from the same PawTenant assessment used by every client. No audio, no surprises — just the screens you'll see.",
  className = "",
  showCTA = true,
  compact = false,
  desktopOnly = false,
}: AssessmentVideoPreviewProps) {
  return (
    <section
      className={`${compact ? "py-10 md:py-14" : "py-14 md:py-20"} ${className || "bg-[#f8faf9]"}`}
    >
      <div className="max-w-6xl mx-auto px-5 md:px-6">
        {(eyebrow || heading || subheading) && (
          <div className="text-center mb-8 md:mb-12">
            {eyebrow && (
              <span className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
                {eyebrow}
              </span>
            )}
            {heading && (
              <h2 className="text-2xl md:text-[1.7rem] font-extrabold text-gray-900 mb-3 tracking-tight">
                {heading}
              </h2>
            )}
            {subheading && (
              <p className="text-gray-500 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
                {subheading}
              </p>
            )}
          </div>
        )}

        {/* Clip grid — 2x2 on tablet, 4-in-a-row on desktop, 2x2 on mobile too unless desktopOnly */}
        <div
          className={`${desktopOnly ? "hidden md:grid" : "grid"} grid-cols-2 md:grid-cols-4 gap-5 md:gap-7`}
        >
          {CLIPS.map((c) => (
            <ClipCard key={c.step} src={c.src} step={c.step} label={c.label} />
          ))}
        </div>

        {/* Trust strip */}
        <div className="mt-8 md:mt-10 flex items-center justify-center gap-3">
          <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-[#e8f5f1] text-[#1a5c4f] flex-shrink-0">
            <i className="ri-lock-line text-sm" aria-hidden />
          </span>
          <p className="text-[12px] md:text-xs text-slate-600 leading-snug max-w-xl text-center">
            Real assessment UI · HIPAA-secure · No health data visible in this preview.
          </p>
        </div>

        {showCTA && (
          <div className="mt-7 flex flex-col items-center gap-2">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-[#1a5c4f] text-white text-sm font-bold rounded-md hover:bg-[#164d42] transition-colors cursor-pointer"
            >
              <i className="ri-play-circle-line"></i>
              Start Your Assessment
            </Link>
            <p className="text-xs text-gray-500">Takes about 5 minutes — no payment to start.</p>
          </div>
        )}
      </div>
    </section>
  );
}
