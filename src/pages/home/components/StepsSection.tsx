import { useAttributionParams } from "@/hooks/useAttributionParams";

/*
 * 2026-05-24 visual-storytelling pass.
 *
 * Replaced the three plain icon+text boxes with three real visual cards
 * that LOOK like the artifact each step produces:
 *
 *   Step 1: a styled "assessment question" card (form mockup, HTML/CSS only).
 *   Step 2: a styled "provider review" card with a verified badge and a
 *           progress bar so the user can imagine the review actually
 *           happening to them.
 *   Step 3: a real ESA-letter sample preview (the existing
 *           /images/checkout/esa-sample-letter.svg) inside a thin browser
 *           chrome frame, plus a tiny "Verification ID" chip beneath.
 *
 * H1/H2 wording untouched. Section ID #how-it-works preserved (HeroSection
 * deep-links to this anchor).
 */

export default function StepsSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="how-it-works" className="py-12 sm:py-20 bg-slate-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-[#4A8472] text-[12px] sm:text-sm font-semibold tracking-widest uppercase mb-2">Simple Process</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Get Your <span className="text-orange-500">ESA Letter</span> in 3 Simple Steps
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto text-[13.5px] sm:text-sm leading-relaxed">
            A streamlined path from quick assessment to a landlord-ready letter — no waiting rooms, no in-person visits.
          </p>
        </div>

        {/* Steps — 3 visual cards. Mobile: stack with vertical connector
            dot-and-arrow. Desktop: 3-up grid with a soft horizontal
            connector line behind the row. */}
        <div className="relative">
          {/* Desktop connector line — sits behind the card row */}
          <div
            aria-hidden
            className="hidden md:block absolute top-1/2 left-12 right-12 h-px bg-gradient-to-r from-[#4A8472]/0 via-[#4A8472]/35 to-[#4A8472]/0 pointer-events-none"
          />

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 relative">
            {/* ────────────── STEP 1 ────────────── */}
            <li className="relative">
              <StepCard number={1} title="Complete the Assessment" subtitle="≈ 5 minutes · confidential">
                {/* Visual: stylized assessment-question card */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-left">
                  <div className="text-[10px] uppercase tracking-wider text-[#4A8472] font-bold mb-1.5">
                    Question 3 of 12
                  </div>
                  <div className="text-[12.5px] font-semibold text-gray-900 leading-snug mb-2.5">
                    In the last 2 weeks, how often have you felt anxious in your home?
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Not at all", picked: false },
                      { label: "Several days", picked: true },
                      { label: "More than half the days", picked: false },
                    ].map((opt) => (
                      <div
                        key={opt.label}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[11.5px] ${
                          opt.picked
                            ? "border-[#4A8472] bg-[#4A8472]/8 text-gray-900 font-semibold"
                            : "border-slate-200 bg-white text-gray-600"
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            opt.picked ? "border-[#4A8472] bg-[#4A8472]" : "border-slate-300 bg-white"
                          }`}
                        >
                          {opt.picked && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        {opt.label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full w-1/4 bg-[#4A8472] rounded-full" />
                  </div>
                </div>
              </StepCard>
              {/* Mobile vertical connector chevron under card */}
              <MobileConnector />
            </li>

            {/* ────────────── STEP 2 ────────────── */}
            <li className="relative">
              <StepCard number={2} title="Provider Review" subtitle="Licensed in your state · ≈ 24 hours">
                {/* Visual: provider review card with status pill.
                    Avatar + name are intentionally placeholder (initials
                    monogram, generic "Sample" label) — this is a UI
                    mockup of what the review flow looks like, not a
                    representation of a real provider on the team. Real
                    provider photos are reserved for captioned-by-name
                    surfaces (DoctorsSection, ProviderCard, etc.) per
                    public/assets/README.md. */}
                <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-left">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      aria-hidden
                      className="w-9 h-9 rounded-full bg-[#4A8472] flex items-center justify-center flex-shrink-0 border border-[#3a6a5b]/30 shadow-[0_1px_2px_rgba(74,132,114,0.25)]"
                    >
                      <span className="text-white text-[10.5px] font-bold tracking-wider">
                        LP
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-gray-900 leading-tight truncate">
                        Your Licensed Provider
                      </div>
                      <div className="text-[10.5px] text-gray-500 leading-tight">
                        Licensed Mental Health Professional
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9.5px] font-bold uppercase tracking-wider flex-shrink-0">
                      <i className="ri-shield-check-line text-emerald-500 text-[10px]"></i>
                      Verified
                    </span>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <ChecklistRow label="Assessment received" done />
                    <ChecklistRow label="Clinical review" done />
                    <ChecklistRow label="Eligibility decision" inProgress />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                    <i className="ri-time-line text-[#4A8472]"></i>
                    Reviewing now · typically within 24h
                  </div>
                </div>
              </StepCard>
              <MobileConnector />
            </li>

            {/* ────────────── STEP 3 ────────────── */}
            <li className="relative">
              <StepCard number={3} title="Receive Your ESA Letter" subtitle="Secure PDF · landlord-ready">
                {/* Visual: real sample letter in a browser-chrome frame */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-left">
                  <div className="flex items-center justify-between bg-slate-50 px-2 py-1.5 border-b border-slate-200">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                    <div className="font-mono text-[9px] text-slate-500">esa-letter.pdf</div>
                    <div className="w-6" />
                  </div>
                  <div className="bg-white p-2 max-h-[150px] overflow-hidden">
                    <img
                      src="/images/checkout/esa-sample-letter.svg"
                      alt="Sample ESA letter delivered as a secure PDF"
                      width={800}
                      height={1035}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-auto block"
                    />
                  </div>
                  <div className="bg-emerald-50 border-t border-emerald-200 px-2.5 py-1.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white flex-shrink-0">
                      <i className="ri-check-line text-[10px]"></i>
                    </span>
                    <div className="font-mono text-[9.5px] text-emerald-900 truncate">
                      Verification ID: PT-2026-184429
                    </div>
                  </div>
                </div>
              </StepCard>
            </li>
          </ol>
        </div>

        <div className="text-center mt-10 sm:mt-12">
          <a
            href={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.30)] sm:shadow-none"
          >
            Start Your ESA Letter Online
            <i className="ri-arrow-right-line"></i>
          </a>
          <p className="text-[12px] text-gray-500 mt-3">
            ≈ 5 minutes · 100% refund if you don't qualify after review.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Sub-components (file-local) ───────────────────── */

function StepCard({
  number,
  title,
  subtitle,
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-10 bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.07)] transition-shadow h-full flex flex-col">
      {/* Number badge floats above card */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#4A8472] text-white text-[12px] font-bold flex-shrink-0">
          {number}
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-gray-900 leading-tight">{title}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{subtitle}</div>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ChecklistRow({
  label,
  done,
  inProgress,
}: {
  label: string;
  done?: boolean;
  inProgress?: boolean;
}) {
  const styles = done
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : inProgress
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-slate-50 border-slate-200 text-slate-600";
  const icon = done ? "ri-check-line text-emerald-600" : inProgress ? "ri-loader-4-line text-amber-600 animate-spin" : "ri-circle-line text-slate-400";
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded border text-[11px] ${styles}`}>
      <i className={`${icon} text-[12px]`} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function MobileConnector() {
  return (
    <div
      aria-hidden
      className="md:hidden flex flex-col items-center justify-center mt-3 mb-1 text-[#4A8472]"
    >
      <i className="ri-arrow-down-s-line text-2xl leading-none -my-2"></i>
    </div>
  );
}
