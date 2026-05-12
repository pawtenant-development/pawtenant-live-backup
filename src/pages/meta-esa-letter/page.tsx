import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";

type Short = {
  /** YouTube video ID (from /shorts/<id>) */
  id: string;
  /** Caption / title shown under the card */
  title: string;
  /**
   * Optional local override for the thumbnail.
   * If you drop a JPG/WEBP at /public/assets/meta/shorts/<filename>.jpg
   * and reference it here, it will be used instead of YouTube's CDN thumb.
   */
  thumb?: string;
};

// YouTube Shorts testimonial reels.
// To override a thumbnail, save a vertical JPG/WEBP into
// /public/assets/meta/shorts/ and set `thumb: "/assets/meta/shorts/<file>.jpg"`.
const SHORTS: Short[] = [
  {
    // /shorts/_2sX3zf9qdk — process walkthrough Short.
    id: "_2sX3zf9qdk",
    title: "A closer look at the process",
  },
  {
    id: "tSr6-MCSx4w",
    title: "“This looked sketchy at first…”",
    thumb: "/assets/meta/shorts/thumb_v2_evelyn.jpg",
  },
  {
    id: "HpEBlaqhO7o",
    title: "“My landlord said no pets.”",
    // thumb: "/assets/meta/shorts/no-pets.jpg",
  },
  {
    id: "v4OpIlJZMeY",
    title: "“I have panic attacks.”",
    // thumb: "/assets/meta/shorts/panic-attacks.jpg",
  },
  {
    id: "ouXRsTDrh3s",
    title: "“We almost lost Teddy.”",
    // thumb: "/assets/meta/shorts/teddy.jpg",
  },
];

const META_TITLE = "Keep Your Emotional Support Animal With You | PawTenant";
const META_DESC =
  "Connect with a licensed mental health professional for an ESA evaluation and receive housing-focused documentation when clinically appropriate.";

const ASSESSMENT_HREF = "/assessment";

const STATES = [
  "California",
  "Texas",
  "Florida",
  "New York",
  "Illinois",
  "Pennsylvania",
  "Georgia",
  "North Carolina",
  "Ohio",
  "Arizona",
];

// Story → emotional pain. Reused from prior version, refined wording.
const STORY_CARDS = [
  {
    title: "No-pet apartments",
    body: "Many leases ban pets outright. A reasonable accommodation request can change that conversation.",
  },
  {
    title: "Pet rent and pet deposits",
    body: "Tenants with qualifying ESA documentation are typically not charged pet rent or pet deposits.",
  },
  {
    title: "Breed and size restrictions",
    body: "Breed and size limits often don't apply to qualifying Emotional Support Animals under federal housing law.",
  },
  {
    title: "Fear of rehoming your animal",
    body: "Real documentation can help you advocate to keep your support animal with you when housing matters.",
  },
  {
    title: "Moving into a new apartment",
    body: "Starting a lease is stressful enough. Documentation gives you a calm, paper-based way to ask.",
  },
  {
    title: "Real letter, not a fake certificate",
    body: "Documentation is reviewed and issued by a licensed mental health professional — not a $5 online certificate.",
  },
];

const HOW_STEPS = [
  {
    n: 1,
    title: "Complete the assessment",
    body: "A confidential clinical questionnaire. About 5 minutes on your phone.",
  },
  {
    n: 2,
    title: "Licensed professional review",
    body: "A provider licensed in your state evaluates your case. Typically within 24 hours.",
  },
  {
    n: 3,
    title: "Receive ESA documentation if clinically approved",
    body: "When clinically appropriate, you receive housing-focused ESA documentation as a PDF.",
  },
  {
    n: 4,
    title: "Use it for housing accommodation requests",
    body: "Share your documentation with your landlord as part of a reasonable accommodation request.",
  },
];

const TRUST_PILLARS = [
  {
    icon: "shield",
    title: "Licensed mental health professionals",
    body: "Every reviewing provider holds an active license in your state.",
  },
  {
    icon: "lock",
    title: "Secure private process",
    body: "Your information is handled in alignment with HIPAA-aligned data standards.",
  },
  {
    icon: "home",
    title: "Fair Housing focused documentation",
    body: "Documentation is written for housing accommodation context, not generic templates.",
  },
  {
    icon: "badge",
    title: "Verification support when needed",
    body: "If your landlord asks, your documentation can be verified through proper channels.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Can an ESA letter help with housing?",
    a: "An ESA letter from a licensed mental health professional may support a reasonable accommodation request under the Fair Housing Act. Whether a specific landlord grants the accommodation depends on the property type, applicable law, and the landlord's review process.",
  },
  {
    q: "Is this accepted by landlords?",
    a: "Most landlords subject to the Fair Housing Act are required to consider reasonable accommodation requests. Our documentation is written to align with FHA standards and includes the provider's license details for verification.",
  },
  {
    q: "How fast can I start?",
    a: "You can begin the assessment in about five minutes. Most assessments are reviewed within 24 hours, and documentation is delivered as a PDF when a licensed provider determines it's clinically appropriate.",
  },
  {
    q: "Is my information private?",
    a: "Yes. Your assessment is confidential and handled in alignment with HIPAA-aligned data standards. Diagnosis and clinical detail are never shared on any verification page or with your landlord.",
  },
  {
    q: "Are flexible payment options available?",
    a: "At checkout you may see flexible payment options including Klarna where eligible. Availability depends on your eligibility at checkout and is not guaranteed. We don't change the underlying clinical review process.",
  },
];

export default function MetaEsaLetterPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = META_TITLE;

    const ensureMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute("content", prev);
      };
    };

    const restoreRobots = ensureMeta("robots", "noindex, nofollow");
    const restoreDesc = ensureMeta("description", META_DESC);

    return () => {
      document.title = prevTitle;
      restoreRobots();
      restoreDesc();
    };
  }, []);

  return (
    <main className="bg-[#FAFAFA] text-slate-900 antialiased">
      <SharedNavbar />

      {/* ─────────── 1. HERO — warm emotional, Meta-friendly ─────────── */}
      <section className="relative bg-gradient-to-b from-[#FFF7ED] via-white to-[#FAFAFA] border-b border-slate-200 overflow-hidden">
        {/* Layered warm radial gradients for depth */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 10%, rgba(249,115,22,0.10) 0%, transparent 55%), radial-gradient(ellipse at 10% 90%, rgba(16,185,129,0.06) 0%, transparent 50%)",
          }}
        />
        {/* Soft top emerald wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(255,237,213,0.9) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-14 md:pb-20 grid md:grid-cols-12 gap-10 md:gap-14 items-center">
          <div className="md:col-span-7">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              ESA evaluation for housing
            </span>
            <h1 className="text-[28px] sm:text-[32px] md:text-[40px] lg:text-[44px] leading-[1.12] font-bold tracking-tight text-slate-900 mb-4">
              Keep Your Emotional Support Animal With You
            </h1>
            <p className="text-[16px] md:text-[17px] leading-relaxed text-slate-600 mb-7 max-w-xl">
              Connect with a licensed mental health professional for an ESA evaluation and receive housing documentation when clinically appropriate.
            </p>

            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] md:text-[16px] px-7 py-4 rounded-md transition w-full sm:w-auto shadow-[0_4px_12px_rgba(249,115,22,0.3)]"
            >
              Start Your ESA Evaluation
              <span aria-hidden>→</span>
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <CheckDot /> Licensed professionals
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckDot /> Secure process
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckDot /> Housing-focused ESA letters
              </span>
            </div>
          </div>

          {/* Warm hero photo + supporting collage strip */}
          <div className="md:col-span-5">
            <div className="relative">
              {/* Soft warm glow behind image */}
              <div
                aria-hidden
                className="absolute -inset-3 rounded-3xl blur-2xl opacity-50 pointer-events-none"
                style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.15), transparent 70%)" }}
              />
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-[0_8px_28px_rgba(15,23,42,0.10)] bg-white">
                <img
                  src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                  alt="Person at home with their emotional support animal"
                  width={1600}
                  height={1067}
                  loading="eager"
                  className="w-full h-auto block aspect-[4/5] object-cover"
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4">
                  <div className="text-white text-[13px] font-medium leading-snug">
                    Housing-focused ESA documentation, when clinically appropriate.
                  </div>
                </div>
              </div>

              {/* Floating reassurance pill */}
              <div className="hidden md:flex absolute -bottom-5 -left-5 items-center gap-2.5 bg-white border border-slate-200 rounded-full pl-2.5 pr-4 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.10)]">
                <span className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] text-slate-500">Refund if you don't qualify</div>
                  <div className="text-[12.5px] font-semibold text-slate-900">No risk to start</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 1b. EMOTIONAL TRANSITION (subtle) ─────────── */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-12 text-center">
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed italic">
            For many renters, pets are family. ESA documentation can help when housing rules collide with that reality.
          </p>
        </div>
      </section>

      {/* ─────────── 2. STORY OPENER — emotional, warm, image-supported ─────────── */}
      <section className="bg-[#FFFBF5] border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20 grid md:grid-cols-12 gap-10 md:gap-14 items-center">
          {/* Image left on desktop */}
          <div className="md:col-span-5 order-2 md:order-1">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
              <img
                src="/assets/lifestyle/senior-with-pet-home.jpg"
                alt="Person at home with their support animal — calm domestic moment"
                width={1600}
                height={1067}
                loading="lazy"
                className="w-full h-auto block aspect-[4/3] object-cover"
              />
            </div>
          </div>

          <div className="md:col-span-7 order-1 md:order-2 text-center md:text-left">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Real housing stress, real support
            </span>
            <h2 className="text-2xl md:text-[32px] font-bold tracking-tight text-slate-900 mb-4 leading-[1.2]">
              Your pet is more than a pet.
            </h2>
            <p className="text-[15.5px] md:text-[16.5px] text-slate-600 leading-relaxed max-w-xl">
              For thousands of renters, a no-pet policy isn't just an inconvenience — it's a real fear of losing the animal who helps them through anxiety, depression, or hard transitions. ESA documentation can support a reasonable accommodation request when clinically appropriate.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────── 2b. EMOTIONAL TRANSITION ─────────── */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-12 text-center">
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed italic">
            Housing stress can feel overwhelming — especially when your animal is part of how you cope.
          </p>
        </div>
      </section>

      {/* ─────────── 3. EMOTIONAL PAIN — story-driven cards ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Sound familiar?
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              These are the stories we hear every week. Documentation may help — when clinically appropriate.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {STORY_CARDS.map((c) => (
              <div key={c.title} className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 transition hover:border-orange-200 hover:shadow-[0_4px_14px_rgba(249,115,22,0.08)]">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900 mb-1.5 leading-snug">{c.title}</div>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{c.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 3b. EMOTIONAL TRANSITION ─────────── */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-12 text-center">
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed italic">
            Most people come to PawTenant after trying confusing or untrustworthy ESA websites.
          </p>
        </div>
      </section>

      {/* ─────────── 4. SAMPLE LETTER + VERIFICATION PREVIEW — proof ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <div className="text-[12.5px] tracking-[0.14em] uppercase text-orange-600 font-semibold mb-3">
              Real documentation. Real providers.
            </div>
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-[#0E2A47] bg-[#0E2A47]/5 border border-[#0E2A47]/15 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0E2A47]" />
              What you actually receive
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              A real letter from a real provider — not a generic template.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Your documentation includes provider details and housing-focused information commonly requested for ESA accommodation requests.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 items-start">
            {/* Sample letter mock */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-[0_2px_8px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                </div>
                <div className="font-mono text-[10px] text-slate-500">esa-letter-sample.pdf</div>
                <div className="w-8" />
              </div>
              <div className="bg-white p-3 md:p-4">
                <img
                  src="/images/checkout/esa-sample-letter.svg"
                  alt="Sample PawTenant ESA letter showing provider credentials and housing-accommodation language. Names and details are placeholders."
                  width={800}
                  height={1035}
                  loading="lazy"
                  className="w-full h-auto block"
                />
              </div>
              <div className="text-center text-[10px] text-slate-400 py-2 px-3 bg-white border-t border-slate-100">
                Sample template · placeholder names · housing-accommodation language only.
              </div>
            </div>

            {/* Verification preview mock */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">pawtenant.com/verify</div>
                  <div className="w-6" />
                </div>
                <img
                  src="/assets/ui/verification-cropped.png"
                  alt="PawTenant verification result confirming a letter ID is authentic. Shows letter type, state, issue and expiration dates, issuing provider, NPI, and license. No patient health information is displayed."
                  width={820}
                  height={1110}
                  loading="lazy"
                  className="w-full h-auto block"
                />
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <div className="text-[11.5px] text-slate-600 leading-relaxed">
                    Verification confirms <span className="text-slate-900 font-medium">authenticity only</span>. No patient health information is displayed.
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-emerald-900 leading-snug mb-0.5">If your landlord asks, you have answers.</div>
                  <div className="text-[12.5px] text-emerald-800/85 leading-relaxed">
                    Documentation includes the provider's credentials and license details, and can be verified through proper channels when required.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 5. REAL STORIES — YouTube Shorts carousel ─────────── */}
      <MetaShortsCarousel />

      {/* ─────────── 5b. EMOTIONAL TRANSITION ─────────── */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-12 text-center">
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed italic">
            Behind every story is a simple, supportive process — designed around real care.
          </p>
        </div>
      </section>

      {/* ─────────── 6. HOW PAWTENANT WORKS — explainer/doodle placeholder ─────────── */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              How PawTenant Works
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              A simple, four-step process — designed to be supportive and clinically rigorous.
            </p>
          </div>

          <div className="max-w-2xl mx-auto mb-10 md:mb-12">
            <ol className="space-y-4">
              {HOW_STEPS.map((s) => (
                <li key={s.n} className="flex gap-4 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 md:p-5">
                  <div className="w-9 h-9 rounded-full bg-[#0E2A47] text-white flex items-center justify-center text-[14px] font-semibold flex-shrink-0">
                    {s.n}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold text-slate-900 mb-0.5 leading-snug">{s.title}</div>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="text-center">
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] md:text-[15px] px-6 py-3 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── 7. TRUST PILLARS ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Trust &amp; care
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              A clinical process you can rely on.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Every step is built around licensed care and respectful privacy.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_PILLARS.map((p) => (
              <div key={p.title} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-emerald-200 transition">
                <span className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-4">
                  {p.icon === "shield" && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  )}
                  {p.icon === "lock" && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                  {p.icon === "home" && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
                    </svg>
                  )}
                  {p.icon === "badge" && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="8" r="6" />
                      <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
                    </svg>
                  )}
                </span>
                <div className="text-[14.5px] font-semibold text-slate-900 mb-1 leading-snug">{p.title}</div>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 8. POPULAR STATES ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              ESA Letter Support Across All 50 States
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Our licensed providers can evaluate your situation and provide ESA documentation when clinically appropriate — in compliance with Fair Housing guidelines.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 max-w-4xl mx-auto mb-7">
            {STATES.map((s) => (
              <div
                key={s}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[13px] font-medium"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{s}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-[12.5px] text-slate-500 leading-relaxed max-w-xl mx-auto">
            Requirements may vary by state, but ESA housing rights are federally protected under the Fair Housing Act.
          </p>
        </div>
      </section>

      {/* ─────────── 9. PRICING + KLARNA TRUST NOTE (display only) ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Refund if you don't qualify
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 leading-[1.18]">
              One simple price.
            </h2>
          </div>

          <div className="relative max-w-md mx-auto bg-white border-2 border-[#0E2A47] rounded-2xl p-7 md:p-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-emerald-600 text-white px-3 py-1 rounded-full shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Recommended
            </span>

            <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-2">Documentation — one-time</div>
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">$110</div>
              <div className="text-xs text-slate-500">for 1 pet · valid 1 year</div>
            </div>
            <div className="text-xs text-slate-500 mb-6">
              Add additional pets at <span className="text-slate-900 font-medium">+$25 each</span>
            </div>

            <ul className="grid gap-3 mb-7 border-t border-slate-100 pt-5">
              {[
                "Reviewed by a licensed mental health professional",
                "Housing-focused ESA documentation",
                "Provider's credentials and license details on document",
                "PDF delivery, typically within 24 hours",
              ].map((feat) => (
                <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                  <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <Link
              to={ASSESSMENT_HREF}
              className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Check Your Eligibility →
            </Link>
            <div className="text-center text-[11px] text-slate-500 mt-3">
              If you don't qualify after review, your payment is refunded.
            </div>
          </div>

          {/* Small Klarna / payment-flexibility trust note (display only) */}
          <div className="mt-6 max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <span className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] text-slate-700 leading-relaxed">
                Flexible payment options may be available at checkout, including <span className="font-medium text-slate-900">Klarna</span> where eligible.
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed mt-1">
                Eligibility shown at checkout. Approval is not guaranteed.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 10. FAQ ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-16 md:py-20">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-8 text-center leading-[1.18]">
            Common questions.
          </h2>
          <div className="space-y-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={item.q}
                open={i === 0}
                className="group rounded-lg px-4 py-3 border border-slate-200 bg-white"
              >
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                  <span className="text-[13.5px] font-semibold text-slate-900 leading-snug">{item.q}</span>
                  <span aria-hidden className="text-[18px] leading-none flex-shrink-0 transition-transform duration-200 text-[#0E2A47] group-open:rotate-45 group-open:text-emerald-600">+</span>
                </summary>
                <div className="text-[12.5px] text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-100">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 11. FINAL CTA ─────────── */}
      <section className="relative bg-gradient-to-b from-[#0E2A47] to-[#091B30] text-white overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ background: "radial-gradient(circle at 50% 0%, #ffffff 0%, transparent 60%)" }}
        />
        <div className="relative max-w-3xl mx-auto px-5 py-20 md:py-28 text-center">
          <h2 className="text-2xl md:text-[28px] font-bold tracking-tight leading-tight mb-3">
            See If You Qualify Today
          </h2>
          <p className="text-[14px] text-slate-300 leading-relaxed mb-6 max-w-xl mx-auto">
            Reviewed by a licensed mental health professional in your state. ESA documentation issued only when clinically appropriate. Refund if you don't qualify.
          </p>
          <Link
            to={ASSESSMENT_HREF}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] md:text-[16px] px-8 py-4 rounded-md transition w-full sm:w-auto shadow-[0_4px_16px_rgba(249,115,22,0.35)]"
          >
            Start Your ESA Evaluation
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}

function CheckDot() {
  return (
    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

/**
 * Lite YouTube Shorts carousel.
 *
 * Each card is a vertical 9:16 thumbnail (lazy <img>) with a play overlay.
 * On click, the thumbnail is swapped for a real YouTube <iframe> only for
 * that card — so the page stays light until the user actually engages.
 *
 * Layout uses native CSS scroll-snap (no carousel package). On mobile the
 * user swipes the row; on desktop they can also use the floating arrows.
 */
function MetaShortsCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Track which Shorts have been activated (iframe mounted).
  const [activated, setActivated] = useState<Record<string, boolean>>({});

  const activate = (id: string) => {
    setActivated((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Approximate card width incl. gap; matches Tailwind w-[260px] + gap-4.
    const card = el.querySelector("[data-short-card]") as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : 280;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className="relative bg-gradient-to-b from-[#FFFBF5] to-[#FFF7ED] border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-5 py-12 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-10">
          <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Real stories from pet owners
          </span>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
            Real Stories From Pet Owners
          </h2>
          <p className="text-[14.5px] md:text-[15px] text-slate-600 leading-relaxed">
            See how PawTenant helped people navigate housing and ESA evaluations online.
          </p>
        </div>

        <div className="relative">
          {/* Prev / Next arrows — visible on every viewport.
              Mobile users can swipe OR tap the arrows. Buttons are smaller
              on mobile to avoid crowding the cards, and hover-elevate to
              the regular size on md+. */}
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            aria-label="Scroll testimonials left"
            className="flex absolute top-1/2 left-1 md:-left-3 -translate-y-1/2 z-10 w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/95 backdrop-blur-sm border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 active:bg-slate-50 shadow-[0_4px_12px_rgba(15,23,42,0.10)] items-center justify-center transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            aria-label="Scroll testimonials right"
            className="flex absolute top-1/2 right-1 md:-right-3 -translate-y-1/2 z-10 w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/95 backdrop-blur-sm border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 active:bg-slate-50 shadow-[0_4px_12px_rgba(15,23,42,0.10)] items-center justify-center transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Scroll snap row.
              `snap-x snap-mandatory` gives swipe-friendly mobile UX.
              Padding-right ensures the last card has breathing room and that
              users can see a "peek" of the next card on desktop. */}
          <div
            ref={scrollerRef}
            className="flex gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-3 -mx-5 px-5 md:mx-0 md:px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            role="region"
            aria-label="Customer testimonial reels"
          >
            {SHORTS.map((s) => (
              <ShortCard
                key={s.id}
                short={s}
                isActive={!!activated[s.id]}
                onActivate={() => activate(s.id)}
              />
            ))}
            {/* Trailing spacer so last card can snap to start with peek */}
            <div className="shrink-0 w-3 md:w-6" aria-hidden />
          </div>
        </div>

        <div className="mt-7 md:mt-9 text-center">
          <Link
            to={ASSESSMENT_HREF}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] md:text-[15px] px-6 py-3 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
          >
            Start Your ESA Evaluation
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ShortCard({
  short,
  isActive,
  onActivate,
}: {
  short: Short;
  isActive: boolean;
  onActivate: () => void;
}) {
  // Prefer a local thumbnail if provided (drop a JPG into
  // /public/assets/meta/shorts/). If the local file isn't there, fall back
  // to YouTube's maxresdefault.jpg, which on Shorts returns the
  // creator-uploaded custom thumbnail if one was set in YT Studio.
  // The <img onError> chain below downgrades gracefully when needed.
  const thumbSrc =
    short.thumb || `https://i.ytimg.com/vi/${short.id}/maxresdefault.jpg`;
  const embedSrc = `https://www.youtube.com/embed/${short.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
  const watchUrl = `https://www.youtube.com/shorts/${short.id}`;

  return (
    <div
      data-short-card
      className="snap-start shrink-0 w-[240px] sm:w-[260px] md:w-[280px]"
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.10)]">
        {isActive ? (
          <iframe
            src={embedSrc}
            title={short.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={onActivate}
            aria-label={`Play customer story: ${short.title}`}
            className="group absolute inset-0 w-full h-full block"
          >
            {/* Thumbnail. width/height set to prevent layout shift. */}
            <img
              src={thumbSrc}
              alt={short.title}
              width={480}
              height={854}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover transition group-hover:scale-[1.02]"
              onError={(e) => {
                // Fallback chain:
                //   local thumb (if set) -> maxresdefault -> hqdefault -> mqdefault
                // YouTube's maxresdefault.jpg is missing on some Shorts, and
                // creator-uploaded local files may not exist yet — degrade quietly.
                const img = e.currentTarget as HTMLImageElement;
                const tried = img.dataset.fallbackStep || "0";
                const next = (parseInt(tried, 10) || 0) + 1;
                img.dataset.fallbackStep = String(next);
                if (next === 1) {
                  img.src = `https://i.ytimg.com/vi/${short.id}/maxresdefault.jpg`;
                } else if (next === 2) {
                  img.src = `https://i.ytimg.com/vi/${short.id}/hqdefault.jpg`;
                } else if (next === 3) {
                  img.src = `https://i.ytimg.com/vi/${short.id}/mqdefault.jpg`;
                }
              }}
            />
            {/* Soft bottom gradient for legibility of the play affordance */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0"
            />
            {/* Play badge */}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-14 h-14 rounded-full bg-white/95 backdrop-blur-sm shadow-lg flex items-center justify-center transition group-hover:scale-110">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-orange-500 ml-0.5" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            {/* Top-left "Shorts" pill */}
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase bg-white/90 backdrop-blur-sm text-slate-800 px-2 py-1 rounded-full">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Short
            </span>
          </button>
        )}
      </div>

      <div className="mt-3 px-1">
        <div className="text-[13.5px] md:text-[14px] font-semibold text-slate-900 leading-snug">
          {short.title}
        </div>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-1 text-[11.5px] text-slate-500 hover:text-orange-600 transition"
        >
          Watch on YouTube
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
      </div>
    </div>
  );
}
