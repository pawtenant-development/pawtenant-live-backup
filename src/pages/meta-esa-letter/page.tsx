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
// Order rule: the real-person / own-footage Short leads the carousel.
// AI-avatar / HeyGen-style testimonial reels follow it, never lead.
// Owner-confirmed: `_2sX3zf9qdk` (process walkthrough) is the real-person
// asset. The others are stylized testimonial reels and are kept for
// supporting variety but must not appear before the real-person card.
// To override a thumbnail, save a vertical JPG/WEBP into
// /public/assets/meta/shorts/ and set `thumb: "/assets/meta/shorts/<file>.jpg"`.
const SHORTS: Short[] = [
  {
    // /shorts/_2sX3zf9qdk — real-person process walkthrough Short.
    // Always first: real proof leads the carousel.
    id: "_2sX3zf9qdk",
    title: "A closer look at the process",
  },
  {
    id: "HpEBlaqhO7o",
    title: "“My landlord said no pets.”",
    // thumb: "/assets/meta/shorts/no-pets.jpg",
  },
  {
    id: "ouXRsTDrh3s",
    title: "“We almost lost Teddy.”",
    // thumb: "/assets/meta/shorts/teddy.jpg",
  },
  {
    id: "v4OpIlJZMeY",
    title: "“I have panic attacks.”",
    // thumb: "/assets/meta/shorts/panic-attacks.jpg",
  },
  {
    id: "tSr6-MCSx4w",
    title: "“This looked sketchy at first…”",
    thumb: "/assets/meta/shorts/thumb_v2_evelyn.jpg",
  },
];

// SEO / social-share meta. The page is `noindex, nofollow` for organic
// search (it is a paid Meta ad landing page), but title + description +
// Open Graph + Twitter Card meta still matter for the browser tab,
// social shares, and any internal link previews. Keywords are spread
// naturally: ESA letter, emotional support animal letter, housing
// accommodation, Licensed Mental Health Practitioner, Fair Housing Act,
// PSD letter, online ESA evaluation.
const META_TITLE =
  "ESA Letter Online for Housing | Licensed Practitioner Review | PawTenant";
const META_DESC =
  "Get an ESA letter online from a Licensed Mental Health Practitioner. Housing-focused emotional support animal documentation for Fair Housing Act accommodation. PSD letters also available.";
const META_KEYWORDS =
  "ESA letter online, emotional support animal letter, ESA letter for housing, Licensed Mental Health Practitioner, Fair Housing Act ESA, reasonable accommodation, psychiatric service dog letter, PSD letter, ESA evaluation online, ESA documentation, no-pet apartment ESA, ESA housing rights";
const META_OG_IMAGE =
  "https://www.pawtenant.com/assets/blog/fp-woman-dog-floor.jpg";

const ASSESSMENT_HREF = "/assessment";
const PSD_ASSESSMENT_HREF = "/psd-assessment";

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

// Why-people-seek-ESA cards. Bodies expanded with natural keyword spread
// (emotional support animal, ESA letter, ESA evaluation, Licensed Mental
// Health Practitioner, PSD letter) for SEO + reader clarity. Frames the
// clinical context for ESA documentation without overpromising therapeutic
// outcomes — the cards describe situations renters seek an evaluation for,
// not claims that an ESA will cure or treat any condition. A Licensed
// Mental Health Practitioner determines clinical eligibility.
const MENTAL_HEALTH_USES = [
  {
    title: "Anxiety and panic",
    body: "Many renters seek an ESA evaluation because their support animal helps with grounding during anxious or panic episodes at home. An emotional support animal letter, issued only when clinically appropriate, supports a reasonable accommodation request for housing.",
  },
  {
    title: "Depression",
    body: "For some renters managing depression, a support animal is part of daily routine, motivation, and meaningful connection. A Licensed Mental Health Practitioner reviews each case before issuing an ESA letter for housing documentation.",
  },
  {
    title: "PTSD and trauma",
    body: "Animals can offer steady presence and grounding during stress responses related to trauma or PTSD. A Licensed Mental Health Practitioner determines whether an ESA letter — distinct from a Psychiatric Service Dog (PSD) letter — is the right fit for your situation.",
  },
  {
    title: "Major life transitions",
    body: "Moving into a new apartment, loss, or chronic life stress are common moments when renters seek an ESA evaluation online. ESA documentation can support a calm, paper-based housing accommodation request during transitional periods.",
  },
];

// FHA-protected housing rights. Wording mirrors the page footer + FAQ.
// Bodies expanded with natural keyword spread (ESA letter, emotional
// support animal, Fair Housing Act, reasonable accommodation, ESA
// housing rights) for SEO + reader clarity. Do not invent new legal
// claims; these reflect federal Fair Housing Act reasonable-accommodation
// guidance. State and local laws may add more.
const HOUSING_RIGHTS = [
  {
    title: "Federal Fair Housing Act protection",
    body: "Landlords subject to the federal Fair Housing Act must consider reasonable accommodation requests for tenants with a qualifying emotional support animal. ESA housing rights apply broadly to rental properties, including apartments, condos, and many HOA communities — not just pet-friendly buildings.",
  },
  {
    title: "Even in no-pet buildings",
    body: "A qualifying ESA is not treated as a pet under the Fair Housing Act, so a no-pets clause is not, on its own, a valid reason to deny housing. With valid ESA documentation, a reasonable accommodation request may apply even in strict no-pet apartments.",
  },
  {
    title: "No pet rent or pet deposits",
    body: "Tenants with valid ESA documentation are typically not charged additional pet rent, pet deposits, or breed-based fees on covered rental units. ESA housing protections are about equal access — not about extra costs for the same housing other tenants receive.",
  },
  {
    title: "Documentation, not medical records",
    body: "A landlord may ask for the ESA letter itself, but cannot demand a specific diagnosis or your full medical history. PawTenant's ESA documentation is written to support a reasonable accommodation request while protecting your medical privacy.",
  },
];

// Compliance-honest guidance. These cards screen the page for the right
// fit before checkout: most eligible customers can be supported, and the
// boundaries are stated up front in positive language. We do not promise
// guaranteed approval, public access, or airline travel — those would be
// overpromises. Mirrors the language used in the page footer + FAQ.
type HonestLimit = {
  title: string;
  body: string;
  /** Optional supportive link rendered as an inline anchor inside the card body. */
  linkHref?: string;
  linkLabel?: string;
};

const HONEST_LIMITS: HonestLimit[] = [
  {
    title: "Most eligible customers can be supported.",
    body: "Final eligibility is determined by a Licensed Mental Health Practitioner after review. If you do not qualify, your payment is refunded — no risk to start.",
  },
  {
    title: "Need public-access support?",
    body: "A Psychiatric Service Dog (PSD) letter may be the better fit. ESA documentation is housing-focused; public-access rights are handled separately through trained service-dog needs.",
    linkHref: "/how-to-get-psd-letter",
    linkLabel: "See PSD letter guidance",
  },
  {
    title: "Built for housing, not airline travel.",
    body: "Under current US DOT rules, ESAs are no longer treated as service animals on flights. This documentation is purpose-built for housing accommodation requests.",
  },
  {
    title: "A real clinical review, every time.",
    body: "There is no shortcut — every letter is reviewed by a Licensed Mental Health Practitioner credentialed in your state.",
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

    // ensureMeta supports both `name=` (standard meta) and `property=`
    // (Open Graph). Pass useProperty=true for og:* tags. Each call
    // returns a restore function so cleanup walks the meta tree back
    // to whatever was rendered before this page mounted.
    const ensureMeta = (key: string, content: string, useProperty = false) => {
      const attr = useProperty ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute("content", prev);
      };
    };

    // Standard SEO meta. robots stays noindex/nofollow — this is a paid
    // Meta ad LP, intentionally out of the organic search index.
    const restoreRobots = ensureMeta("robots", "noindex, nofollow");
    const restoreDesc = ensureMeta("description", META_DESC);
    const restoreKw = ensureMeta("keywords", META_KEYWORDS);

    // Open Graph meta — drives Facebook/LinkedIn/Slack/iMessage link
    // previews even when the page is noindex.
    const restoreOgTitle = ensureMeta("og:title", META_TITLE, true);
    const restoreOgDesc = ensureMeta("og:description", META_DESC, true);
    const restoreOgType = ensureMeta("og:type", "website", true);
    const restoreOgImage = ensureMeta("og:image", META_OG_IMAGE, true);
    const restoreOgImageAlt = ensureMeta(
      "og:image:alt",
      "Person at home with their emotional support animal, completing an online ESA assessment",
      true,
    );

    // Twitter Card meta — drives the rich preview on Twitter/X shares.
    const restoreTwCard = ensureMeta("twitter:card", "summary_large_image");
    const restoreTwTitle = ensureMeta("twitter:title", META_TITLE);
    const restoreTwDesc = ensureMeta("twitter:description", META_DESC);
    const restoreTwImage = ensureMeta("twitter:image", META_OG_IMAGE);

    return () => {
      document.title = prevTitle;
      restoreRobots();
      restoreDesc();
      restoreKw();
      restoreOgTitle();
      restoreOgDesc();
      restoreOgType();
      restoreOgImage();
      restoreOgImageAlt();
      restoreTwCard();
      restoreTwTitle();
      restoreTwDesc();
      restoreTwImage();
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

        {/* SharedNavbar is fixed top-0 with h-16 (64px) on mobile and sm:h-20
            (80px) on tablet+. Hero top padding clears the navbar plus adds
            ~32px of breathing room so the green pill and the hero image
            never sit under the navbar. */}
        <div className="relative max-w-6xl mx-auto px-5 pt-24 md:pt-28 pb-14 md:pb-20 grid md:grid-cols-12 gap-10 md:gap-14 items-center">
          <div className="md:col-span-6">
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

            {/* Klarna "Pay in 4" hero badge — Klarna brand pink (#FFA8CD) on
                a white pill with a soft Klarna-pink shadow. Two-line layout
                keeps the value prop ("4 interest-free payments") on the
                first line and the compliance qualifier on the second line.
                Same K. emblem treatment used in the pricing trust panel
                below for visual consistency. */}
            <div className="mt-4 inline-flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-white border border-[#FFA8CD] shadow-[0_2px_8px_rgba(255,168,205,0.30)]">
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#FFA8CD] text-[#1A0A12] font-extrabold text-[11px] leading-none tracking-tight flex-shrink-0"
              >
                K.
              </span>
              <div className="text-left leading-tight">
                <div className="text-[11.5px] font-semibold text-slate-900">
                  Pay in 4 interest-free with{" "}
                  <span className="text-[#7A3F5F]">Klarna</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Where eligible at checkout · approval not guaranteed
                </div>
              </div>
            </div>

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

          {/* Warm hero photo — cover-style, both person + pet clearly visible.
              Switched from woman-with-dog-new-apartment.jpg (subjects at the
              left+right edges → portrait crop chopped both) to
              fp-woman-dog-floor.jpg (subjects mid-frame, happy, telehealth-
              coded, real not AI). Column widened from md:col-span-5 to
              md:col-span-6 so the image reads as a hero cover, not a tiny
              side image. Desktop aspect 5/4 (slightly taller landscape)
              instead of 4/5 (portrait) to better suit the source composition
              and keep both subjects intact. object-position: center keeps the
              dog and person framed during cover-crop. */}
          <div className="md:col-span-6">
            <div className="relative">
              {/* Soft warm glow behind image */}
              <div
                aria-hidden
                className="absolute -inset-3 rounded-3xl blur-2xl opacity-50 pointer-events-none"
                style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.15), transparent 70%)" }}
              />
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-[0_8px_28px_rgba(15,23,42,0.10)] bg-white">
                <img
                  src="/assets/blog/fp-woman-dog-floor.jpg"
                  alt="Person at home with their emotional support animal, completing an online ESA assessment on a laptop"
                  width={1200}
                  height={800}
                  loading="eager"
                  className="w-full h-auto block aspect-[4/3] md:aspect-[5/4] object-cover object-center"
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

      {/* ─────────── 2. WHAT YOU RECEIVE — answers "What do I get?" up-front.
          Replaces the prior italic transitions + emotional Story Opener;
          surfaces the four core trust pillars (Licensed practitioner, secure
          process, housing-focused documentation, verification support) right
          after the hero so skeptical Meta traffic sees the answer to "What
          do I actually receive?" before scrolling further. The deeper Trust
          Pillars section that used to sit lower in the page is removed —
          this section absorbs that role. */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-12 md:py-16">
          <div className="text-center max-w-2xl mx-auto mb-8 md:mb-10">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              What you receive
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              A clear, simple package — built around licensed care.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Everything you need for a housing accommodation request, with nothing oversold.
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

      {/* ─────────── 3. BUILT FOR REAL HOUSING SITUATIONS — was the emotional
          pain section, now reframed as a scannable housing-situations card
          grid. Same six situations, neutral header, no emotional storytelling.
          Added a tasteful housing-coded banner image above the cards to
          balance the page (lazy-loaded, fixed aspect to prevent CLS). */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Real housing situations
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Built for the situations renters actually face.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              ESA documentation may help in housing scenarios like these — when clinically appropriate.
            </p>
          </div>

          {/* Slim housing-coded banner — warm apartment scene with person + pet.
              Switched from fp-windowsill-dog.jpg (vertical-leaning composition
              whose face was being chopped by the 3/1 panoramic crop) to
              fp-woman-dog-couch.jpg, a natively landscape composition where
              both subjects span the full frame width and survive a wide
              center-crop intact. Desktop aspect also pulled back from 3/1
              (50% vertical crop) to 5/2 (40% vertical crop) so neither
              subject is clipped. Lazy-loaded; intrinsic dims set to prevent
              layout shift. */}
          <div className="max-w-4xl mx-auto mb-10 md:mb-12 rounded-2xl overflow-hidden border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
            <img
              src="/assets/blog/fp-woman-dog-couch.jpg"
              alt="Person at home on a couch with their pet — a calm housing scene"
              width={1200}
              height={480}
              loading="lazy"
              className="w-full h-auto block aspect-[16/9] md:aspect-[3/2] object-cover object-center"
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {STORY_CARDS.map((c) => (
              <CollapsibleCard
                key={c.title}
                title={c.title}
                body={c.body}
                iconBg="bg-orange-50 border border-orange-200 text-orange-600"
                iconSvg={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                }
                hoverClass="hover:border-orange-200 hover:shadow-[0_4px_14px_rgba(249,115,22,0.08)]"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 3b. WHEN PETS HELP WITH MENTAL HEALTH — emotional + clinical
          framing for why renters seek ESA documentation. Image-left + text-right
          on desktop, stacks on mobile. 4 cards below describe common situations.
          Compliance: cards describe situations renters present with, not
          claims that an ESA will treat or cure anything — that determination
          is the practitioner's. */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-center mb-10 md:mb-12">
            <div className="md:col-span-5 order-2 md:order-1">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
                <img
                  src="/assets/blog/fp-curly-woman-fun-dog.jpg"
                  alt="Person at home embracing their support animal — calm, supportive moment"
                  width={1200}
                  height={800}
                  loading="lazy"
                  className="w-full h-auto block aspect-[4/3] md:aspect-[4/5] object-cover object-center"
                />
              </div>
            </div>
            <div className="md:col-span-7 order-1 md:order-2 text-center md:text-left">
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Why renters seek ESA documentation
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
                When pets help with anxiety, depression, or PTSD.
              </h2>
              <p className="text-[15px] md:text-[16px] text-slate-600 leading-relaxed max-w-xl mx-auto md:mx-0">
                Renters often describe their support animal as part of how they cope at home. A Licensed Mental Health Practitioner determines whether an ESA letter is clinically appropriate for your situation — never an algorithm.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MENTAL_HEALTH_USES.map((c) => (
              <CollapsibleCard
                key={c.title}
                title={c.title}
                body={c.body}
                iconBg="bg-emerald-50 border border-emerald-200 text-emerald-700"
                iconSvg={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                }
                hoverClass="hover:border-emerald-200"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Shorts carousel relocated to just before the Final CTA. Earlier
          revisions placed it above the sample letter, but with the page
          now content-dense up front (What You Receive, housing situations,
          mental-health context, sample letter, housing rights, how-works,
          clear expectations, states, pricing, FAQ), the reels work better
          as a final emotional push right before the closing CTA. */}

      {/* ─────────── 5. SAMPLE LETTER + VERIFICATION PREVIEW — proof ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <div className="text-[12.5px] tracking-[0.14em] uppercase text-orange-600 font-semibold mb-3">
              Verifiable documentation.
            </div>
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-[#0E2A47] bg-[#0E2A47]/5 border border-[#0E2A47]/15 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0E2A47]" />
              What you actually receive
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Documentation from a Licensed Mental Health Practitioner — not a generic template.
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

      {/* ─────────── 5b. HOUSING RIGHTS YOU CAN RELY ON — FHA-protected trust
          section. Image-right + text-left (mirrors the mental-health section's
          image-left to give the page a left-right reading rhythm). 4 cards
          describe FHA reasonable-accommodation protections; do not invent
          new legal claims beyond what's in the page footer + FAQ. Warm
          off-white background to soften the legal tone. */}
      <section className="bg-[#FFFBF5] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-center mb-10 md:mb-12">
            <div className="md:col-span-6 text-center md:text-left">
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Fair Housing Act protections
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
                Housing rights you can rely on.
              </h2>
              <p className="text-[15px] md:text-[16px] text-slate-600 leading-relaxed max-w-xl mx-auto md:mx-0">
                When clinically appropriate, ESA documentation supports your right to request a reasonable accommodation under the federal Fair Housing Act — even in no-pet buildings.
              </p>
            </div>
            {/* Image switched from hands-typing-paperwork.jpg (natively 2.58
                panoramic — could not show both subjects at the desired 5/4
                container height without horizontal cropping) to
                fp-woman-jeans-living-room.jpg, a natively portrait-leaning
                housing-coded photo (woman + corgi puppy in a living room)
                where both subjects sit comfortably inside a 5/4 frame.
                Aspect now matches the How-PawTenant-Works section image
                (4/3 mobile, 5/4 desktop) so the two side-images read at
                similar visual weight. */}
            <div className="md:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
                <img
                  src="/assets/blog/fp-woman-jeans-living-room.jpg"
                  alt="Person at home in their living room with their support animal — a calm housing scene"
                  width={1200}
                  height={1500}
                  loading="lazy"
                  className="w-full h-auto block aspect-[4/3] md:aspect-[5/4] object-cover object-center"
                />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOUSING_RIGHTS.map((c) => (
              <CollapsibleCard
                key={c.title}
                title={c.title}
                body={c.body}
                iconBg="bg-emerald-50 border border-emerald-200 text-emerald-700"
                iconSvg={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
                  </svg>
                }
                hoverClass="hover:border-emerald-200"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 6. HOW PAWTENANT WORKS — process explainer.
          Desktop: image on the left + step list on the right (md:grid-cols-2).
          Mobile: image stacks on top of the steps list. Image is a calm
          telehealth-at-home scene that maps to Step 1 (Complete the
          assessment) and supports the "from your phone" message. */}
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

          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center mb-10 md:mb-12">
            {/* Supporting image — telehealth at home, lazy-loaded, fixed aspect */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
              <img
                src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
                alt="Person at home with their pet, completing an ESA assessment online"
                width={1200}
                height={900}
                loading="lazy"
                className="w-full h-auto block aspect-[4/3] md:aspect-[5/4] object-cover object-center"
              />
            </div>

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

      {/* ─────────── 7. CLEAR EXPECTATIONS — guiding compliance section.
          Surfaces honest, positive guidance up-front so cold Meta traffic
          can self-screen for the right fit before checkout. Cards use
          neutral slate tone (not orange) — this section is guidance, not
          a sales pitch. PSD card carries an inline link to the PSD route
          for users whose actual need is public-access support. */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              Know before you apply
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Clear expectations.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Honest guidance, so you can decide with confidence before you start.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            {HONEST_LIMITS.map((c) => (
              <div key={c.title} className="bg-white border border-slate-200 rounded-xl p-5 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold text-slate-900 mb-1 leading-snug">{c.title}</div>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{c.body}</p>
                    {c.linkHref && c.linkLabel && (
                      <Link
                        to={c.linkHref}
                        className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 transition"
                      >
                        {c.linkLabel}
                        <span aria-hidden>→</span>
                      </Link>
                    )}
                  </div>
                </div>
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

      {/* ─────────── 9. PRICING — ESA + PSD side-by-side.
          ESA Letter is the recommended option for this Meta LP audience
          (housing-focused). PSD Letter is presented as the alternative for
          users with trained psychiatric service dogs whose need is
          public-access / airline travel rather than housing accommodation.
          Both reviewed by a Licensed Mental Health Practitioner. PSD pricing
          mirrors the existing /faqs and /blog-post wording ("from $120"). */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Refund if you don't qualify
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 leading-[1.18] mb-3">
              Pick the right letter for you.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Both options reviewed by a Licensed Mental Health Practitioner. If you do not qualify after review, your payment is refunded.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-6">
            {/* ESA Letter card — recommended for the housing-focused Meta audience */}
            <div className="relative bg-white border-2 border-[#0E2A47] rounded-2xl p-7 md:p-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)] flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-emerald-600 text-white px-3 py-1 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                Recommended for housing
              </span>

              <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-2">ESA Letter — one-time</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">$110</div>
                <div className="text-xs text-slate-500">for 1 pet · valid 1 year</div>
              </div>
              <div className="text-xs text-slate-500 mb-3">
                Add additional pets at <span className="text-slate-900 font-medium">+$25 each</span>
              </div>

              {/* Klarna payment-method chip — Klarna brand pink/purple tints */}
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                <span className="text-[10px] text-slate-700">Pay later — where eligible</span>
              </div>

              <ul className="grid gap-3 mb-7 border-t border-slate-100 pt-5">
                {[
                  "Reviewed by a Licensed Mental Health Practitioner",
                  "Housing-focused ESA documentation when clinically appropriate",
                  "Provider's credentials and license details on the document",
                  "Verification ID with landlord verification support",
                  "Secure PDF delivery — typically within 24 hours",
                  "Refund if you do not qualify after review",
                  "Add additional pets at +$25 each",
                  "Flexible payment options including Klarna where eligible",
                ].map((feat) => (
                  <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                    <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                Check ESA Eligibility →
              </Link>
              <div className="text-center text-[11px] text-slate-500 mt-3">
                For renters seeking housing accommodation under the Fair Housing Act.
              </div>
            </div>

            {/* PSD Letter card — alternative for trained psychiatric service dogs */}
            <div className="relative bg-white border border-slate-200 rounded-2xl p-7 md:p-8 shadow-[0_2px_8px_rgba(15,23,42,0.05)] flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-slate-700 text-white px-3 py-1 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                For trained service dogs
              </span>

              <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-2">PSD Letter — one-time</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">From $120</div>
              </div>
              <div className="text-xs text-slate-500 mb-3">
                For 1 trained psychiatric service dog · <span className="text-slate-900 font-medium">+$20 per extra dog</span>
              </div>

              {/* Klarna payment-method chip — Klarna brand pink/purple tints */}
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                <span className="text-[10px] text-slate-700">Pay later — where eligible</span>
              </div>

              <ul className="grid gap-3 mb-7 border-t border-slate-100 pt-5">
                {[
                  "Reviewed by a Licensed Mental Health Practitioner",
                  "Psychiatric Service Dog (PSD) letter for trained service dogs",
                  "Supports housing accommodation requests under FHA",
                  "Eligible for air-travel documentation (DOT Service Animal form)",
                  "Provider's credentials and license details on the document",
                  "Secure PDF delivery — typically within 24 hours",
                  "Refund if you do not qualify after review",
                  "Flexible payment options including Klarna where eligible",
                ].map((feat) => (
                  <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                    <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={PSD_ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-[#0E2A47] hover:bg-[#091B30] text-white font-semibold text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(14,42,71,0.25)]"
              >
                Check PSD Eligibility →
              </Link>
              <div className="text-center text-[11px] text-slate-500 mt-3">
                For handlers of trained psychiatric service dogs.
              </div>
            </div>
          </div>

          {/* Klarna trust panel — branded with Klarna's iconic soft pink/purple
              palette (#FFA8CD light, #B8527F darker for text contrast on
              white). Display-only: actual Klarna eligibility is determined
              at checkout by Klarna's own logic; we never make Klarna's
              approval decision for them. The chip + word "Klarna" use the
              brand color; the body copy stays neutral. */}
          <div className="mt-2 max-w-2xl mx-auto bg-gradient-to-br from-[#FFF5FA] to-[#FFE9F1] border border-[#FFA8CD] rounded-xl p-5 flex items-start gap-3 shadow-[0_2px_12px_rgba(255,168,205,0.20)]">
            <span
              aria-hidden
              className="w-10 h-10 rounded-lg bg-[#FFA8CD] text-[#1A0A12] flex items-center justify-center flex-shrink-0 font-black text-lg leading-none tracking-tight shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            >
              K.
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-slate-900 leading-snug mb-1">
                Pay later with <span className="text-[#B8527F]">Klarna</span> — interest-free at checkout.
              </div>
              <div className="text-[12.5px] text-slate-600 leading-relaxed">
                Split your payment into installments where eligible. Eligibility is shown at checkout and is determined by Klarna — approval is not guaranteed.
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

      {/* ─────────── REAL STORIES — YouTube Shorts carousel.
          Now positioned just before the Final CTA as a last emotional push.
          The user has read pricing, FAQ, and all trust content above — the
          reels here serve as social proof "people like you who chose this"
          right before the closing assessment button. */}
      <MetaShortsCarousel />

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
 * Mobile-only collapsible card for content-dense card grids.
 *
 * Why: on a 375px mobile viewport the three card grids (housing situations,
 * mental-health context, housing rights) total 14 cards = lots of vertical
 * paint. Collapsing each card to its title on mobile lets users scan
 * quickly and tap to expand the bodies they care about.
 *
 * Behavior:
 *   - Mobile (<768px): card renders title row only. Tap to expand body.
 *     A "+" affordance rotates to "×" on open.
 *   - Desktop (≥768px): card always shows title + body (open=true), button
 *     is pointer-events-none, "+" affordance is hidden.
 *
 * Initial `open` is derived from window.matchMedia synchronously so there
 * is no flash-of-collapsed on desktop first paint. A media-query listener
 * keeps it synced across resize.
 */
function CollapsibleCard({
  title,
  body,
  iconBg,
  iconSvg,
  hoverClass,
}: {
  title: string;
  body: string;
  iconBg: string;
  iconSvg: React.ReactNode;
  hoverClass?: string;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setOpen(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-5 md:p-6 transition ${hoverClass ?? "hover:border-emerald-200"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-start gap-3 w-full text-left md:pointer-events-none md:cursor-default"
      >
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}
        >
          {iconSvg}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14.5px] md:text-[15px] font-semibold text-slate-900 leading-snug">
              {title}
            </span>
            <span
              aria-hidden
              className={`md:hidden flex-shrink-0 text-slate-500 text-xl leading-none transition-transform duration-200 ${open ? "rotate-45 text-emerald-600" : ""}`}
            >
              +
            </span>
          </div>
          {open && (
            <p className="text-[13px] text-slate-600 leading-relaxed mt-2">
              {body}
            </p>
          )}
        </div>
      </button>
    </div>
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
          {/* Prev / Next arrows — desktop only.
              On mobile the arrows previously overlapped the cards' play
              buttons / top-left "Short" pill at the snap-start position;
              hiding them on mobile resolves the overlap and the native
              swipe with snap-mandatory is sufficient for touch users. */}
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            aria-label="Scroll testimonials left"
            className="hidden md:flex absolute top-1/2 md:-left-3 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/95 backdrop-blur-sm border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 active:bg-slate-50 shadow-[0_4px_12px_rgba(15,23,42,0.10)] items-center justify-center transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            aria-label="Scroll testimonials right"
            className="hidden md:flex absolute top-1/2 md:-right-3 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/95 backdrop-blur-sm border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 active:bg-slate-50 shadow-[0_4px_12px_rgba(15,23,42,0.10)] items-center justify-center transition"
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
