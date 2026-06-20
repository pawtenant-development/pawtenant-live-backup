/**
 * StatePetRentBlog.tsx — shared template for the state-specific pet-rent blog
 * cluster (/blog/<state>-pet-rent-and-esa-letters). One template, many states:
 * each state passes a plain-string config so the chrome stays consistent while
 * the rent/market/law content stays unique per state.
 *
 * Reuses BlogProse chrome + the verified <PetRentSavingsMini> (which carries the
 * required estimate-only disclaimer + the /pet-rent-savings-calculator link).
 *
 * Compliance: estimate-only; pet-rent figures are estimates; ESA framed as
 * housing-focused, outcomes "decided individually," no guaranteed approval / fee
 * waiver. ESA and PSD kept separate. SEO title/description/canonical come from
 * CORE_PAGE_META via SEOManager + prerender.
 */

import { Link } from "react-router-dom";
import SharedNavbar from "./SharedNavbar";
import SharedFooter from "./SharedFooter";
import PetRentSavingsMini from "./PetRentSavingsMini";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  SectionHeading,
  Para,
  CheckList,
  BlogMeta,
  BlogJsonLd,
  BlogHero,
  BlogFaq,
  BlogKeepReading,
  BlogLegalDisclaimer,
  type BlogFaqItem,
} from "./BlogProse";

export interface StateResourceLink {
  to: string;
  icon: string;
  label: string;
  desc: string;
}

export interface StatePetRentBlogConfig {
  slug: string; // e.g. "california-pet-rent-and-esa-letters"
  state: string; // "California"
  title: string;
  description: string;
  heroImgPath: string; // "/assets/lifestyle/..."
  heroAlt: string;
  readMins: number;
  keywords: string;
  chips: string[];
  /** Quick-summary bullets (plain strings; the first phrase before a colon is bolded). */
  summary: string[];
  intro: string;
  rentHeading: string;
  rentParas: string[];
  lawHeading: string;
  lawParas: string[];
  /** Internal links to this state's existing ESA pages. */
  stateLinks: StateResourceLink[];
  faqs: BlogFaqItem[];
  keepReading: { to: string; icon: string; label: string }[];
}

/** Bold the lead phrase ("Label: rest") in a summary bullet. */
function SummaryBullet({ text }: { text: string }) {
  const idx = text.indexOf(":");
  if (idx === -1) return <>{text}</>;
  return (
    <>
      <strong className="text-gray-900">{text.slice(0, idx + 1)}</strong>
      {text.slice(idx + 1)}
    </>
  );
}

// General Fair Housing principles for an approved assistance animal — reused
// across states (not state-specific). Compliance-safe, no guarantees.
const apartmentCannot = [
  "Charge pet rent, a pet deposit, or pet fees for an approved assistance animal.",
  "Refuse based only on a no-pet policy, breed, size, or weight.",
  'Require you to "register" the animal or buy a certificate, ID card, or vest.',
  "Demand your specific diagnosis or full medical records.",
];

export default function StatePetRentBlog({ cfg }: { cfg: StatePetRentBlogConfig }) {
  const { withAttribution } = useAttributionParams();
  const canonical = `https://pawtenant.com/blog/${cfg.slug}`;
  const heroImg = `https://pawtenant.com${cfg.heroImgPath}`;
  const breadcrumbName = `${cfg.state} Pet Rent & ESA Letters`;
  const primaryStateLink = cfg.stateLinks[0];

  return (
    <main>
      <BlogMeta
        title={cfg.title}
        description={cfg.description}
        canonical={canonical}
        image={heroImg}
        keywords={cfg.keywords}
        published="2026-06-20"
      />
      <BlogJsonLd
        canonical={canonical}
        headline={cfg.title}
        description={cfg.description}
        image={heroImg}
        datePublished="2026-06-20"
        breadcrumbName={breadcrumbName}
        faqs={cfg.faqs}
        keywords={cfg.keywords}
      />

      <SharedNavbar />

      <BlogHero
        chips={cfg.chips}
        breadcrumbName={breadcrumbName}
        h1={`${cfg.state} Pet Rent and ESA Letters:`}
        h1Accent="What Renters Should Know"
        publishedLabel="Published June 2026"
        readMins={cfg.readMins}
        summaryItems={cfg.summary.map((s, i) => <SummaryBullet key={i} text={s} />)}
        image={cfg.heroImgPath}
        alt={cfg.heroAlt}
      />

      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <Para>{cfg.intro}</Para>

          <SectionHeading id="pet-rent-in-state">{cfg.rentHeading}</SectionHeading>
          {cfg.rentParas.map((p, i) => (
            <Para key={i}>{p}</Para>
          ))}

          <SectionHeading id="state-law">{cfg.lawHeading}</SectionHeading>
          {cfg.lawParas.map((p, i) => (
            <Para key={i}>{p}</Para>
          ))}
        </div>
      </article>

      {/* Calculator teaser (carries the required estimate-only disclaimer + calculator link) */}
      <PetRentSavingsMini
        className="bg-[#fafafa] border-y border-gray-100"
        heading={`Estimate ${cfg.state} pet rent over time`}
        copy="Enter a typical monthly pet-rent amount and number of pets to estimate the one-year total, then open the full calculator for 1, 2, and 5-year estimates — and what you may save if a housing accommodation request is approved."
      />

      <article className="bg-white pt-4 pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="apartment-cannot">
            What an apartment generally cannot do for an approved ESA
          </SectionHeading>
          <CheckList items={apartmentCannot} />
          <Para>
            These are general Fair Housing principles, not legal advice, and {cfg.state} and local
            rules can add protections. Each accommodation request is reviewed individually, and a
            housing-focused ESA letter supports but does not guarantee approval or any fee waiver.
          </Para>

          {/* State resource links (crawlable internal links) */}
          <SectionHeading id="state-guides">{cfg.state} ESA housing guides</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 my-5">
            {cfg.stateLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="group flex items-start gap-3 bg-[#fafafa] border border-gray-200 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all"
              >
                <i className={`${l.icon} text-orange-500 text-lg flex-shrink-0 mt-0.5`}></i>
                <span>
                  <span className="block text-sm font-semibold text-gray-900 leading-snug">{l.label}</span>
                  <span className="block text-[12px] text-gray-500 leading-relaxed">{l.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </article>

      <BlogFaq heading={`${cfg.state} pet rent & ESA letters: FAQ`} faqs={cfg.faqs} />

      {/* Bottom CTA */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Renting with your animal in {cfg.state}?
          </h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A {cfg.state}-licensed mental health professional reviews your situation and, if
            clinically appropriate, issues a verifiable, housing-focused ESA letter. Every
            accommodation request is decided individually — no outcome is guaranteed, and there is a
            refund if you do not qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start ESA assessment
            </Link>
            <Link
              to={primaryStateLink.to}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-home-heart-line"></i> {primaryStateLink.label}
            </Link>
          </div>
        </div>
      </section>

      <BlogKeepReading links={cfg.keepReading} />

      <BlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
