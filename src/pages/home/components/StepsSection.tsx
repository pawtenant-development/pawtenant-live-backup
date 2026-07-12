import { useAttributionParams } from "@/hooks/useAttributionParams";

/**
 * StepsSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 * 3 steps with large circular illustrated icons (owner reference: Pettable),
 * "3-minute assessment" wording, honest "approval is never automatic" line.
 * H2 wording preserved verbatim for SEO: "Get Your ESA Letter in 3 Simple Steps".
 * Section ID #how-it-works preserved (in-page anchors deep-link here).
 * Icons are inline SVGs (self-contained — avoids regenerating the self-hosted
 * Remix Icon subset). Compliance-safe copy: "reviewed by a licensed provider",
 * "if approved", "refund if you don't qualify" — no guaranteed-approval,
 * government-approved, or registry claims.
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-24 h-24 mx-auto mb-5">
      {/* soft organic blob behind the ring */}
      <div
        aria-hidden
        className="absolute bg-[#FDF0E3]"
        style={{ inset: "10px -6px -4px 10px", borderRadius: "58% 42% 55% 45%/50% 58% 42% 50%" }}
      />
      <div className="relative w-24 h-24 rounded-full bg-white border-[1.5px] border-[#231F1A] flex items-center justify-center text-[#231F1A]">
        {children}
      </div>
    </div>
  );
}

const steps = [
  {
    num: 1,
    title: "3-minute assessment",
    text: "Answer a few questions about your ESA needs. Free to start — you only pay if you choose to continue.",
    meta: "≈ 3 minutes",
    metaIcon: "ri-time-line",
    icon: (
      <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 13.5h6M9 17h3.5" />
        <circle cx="16.5" cy="17.5" r="3.4" fill="#EDF4F0" stroke="#3F7061" />
        <path d="M15.1 17.5l1 1 1.8-1.9" stroke="#3F7061" />
      </svg>
    ),
  },
  {
    num: 2,
    title: "Licensed clinician review",
    text: "A provider licensed in your state evaluates your case. This is a real clinical review — approval is never automatic.",
    meta: "Licensed in your state",
    metaIcon: "ri-shield-check-line",
    icon: (
      <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="9" r="3.4" />
        <path d="M5.5 20c.9-3.2 3.4-4.8 6.5-4.8s5.6 1.6 6.5 4.8" />
        <path d="M17.5 5.5l1.2-1.2M19.5 9h1.7" stroke="#3F7061" />
      </svg>
    ),
  },
  {
    num: 3,
    title: "Receive your verifiable letter",
    text: "If approved, your signed PDF arrives — within 24 hours in most states — ready to hand to your landlord.",
    meta: "QR-verifiable PDF",
    metaIcon: "ri-qr-code-line",
    icon: (
      <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3.5h9l3.5 3.5v13.5h-12.5V3.5z" />
        <path d="M15 3.5V7h3.5" />
        <path d="M9 12h6M9 15h6" />
        <circle cx="12" cy="19.2" r="2.6" fill="#EDF4F0" stroke="#3F7061" />
        <path d="M11 19.2l.8.8 1.4-1.5" stroke="#3F7061" />
      </svg>
    ),
  },
];

export default function StepsSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="how-it-works" className="py-14 sm:py-20 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-10 sm:mb-12">
          <p className="text-[#6B6359] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
            Simple Process
          </p>
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight"
            style={FONT_DISPLAY}
          >
            Get Your ESA Letter in 3 Simple Steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {steps.map((s) => (
            <div
              key={s.num}
              className="relative bg-white border border-[#EAE3D7] rounded-2xl px-6 py-8 sm:px-8 sm:py-9 text-center shadow-[0_1px_2px_rgba(35,31,26,0.05),0_10px_30px_-14px_rgba(35,31,26,0.14)]"
            >
              <div className="relative">
                <span
                  className="absolute left-1/2 -translate-x-[60px] -top-1 z-10 w-7 h-7 rounded-full bg-[#3F7061] text-white text-[13.5px] font-bold flex items-center justify-center"
                  style={FONT_DISPLAY}
                  aria-hidden
                >
                  {s.num}
                </span>
                <StepIcon>{s.icon}</StepIcon>
              </div>
              <h3 className="text-[17.5px] font-extrabold text-[#231F1A] mb-2">{s.title}</h3>
              <p className="text-sm text-[#6B6359] leading-relaxed max-w-[280px] mx-auto">{s.text}</p>
              <p className="inline-flex items-center gap-1.5 mt-3.5 text-xs font-extrabold text-[#3F7061]">
                <i className={s.metaIcon} aria-hidden></i>
                {s.meta}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-9 sm:mt-10">
          <a
            href={withAttribution("/assessment")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 text-white font-extrabold text-base rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-lg shadow-orange-500/25"
          >
            Check If You Qualify
            <i className="ri-arrow-right-line" aria-hidden></i>
          </a>
          <p className="text-[#6B6359] text-[13px] font-semibold mt-3 flex items-center justify-center gap-1.5">
            <i className="ri-checkbox-circle-fill text-[#4A8472]" aria-hidden></i>
            Full refund if you don&rsquo;t qualify
          </p>
        </div>
      </div>
    </section>
  );
}
