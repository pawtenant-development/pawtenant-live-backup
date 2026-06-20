// Blog article — /blog/apartment-pet-rent-and-esa-letters
//
// "Apartment Pet Rent and ESA Letters: What Renters Should Know"
// Apartment renters → ESA housing accommodation request → pet-rent calculator.
//
// Compliance: estimate-only; "may not apply / decided individually / no
// guarantee." ESA framed as housing-focused; ESA vs PSD kept separate. The
// embedded <PetRentSavingsMini> carries the required estimate-only disclaimer
// + the /pet-rent-savings-calculator link. SEO title/description/canonical come
// from CORE_PAGE_META via SEOManager + prerender.

import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import PetRentSavingsMini from "../../components/feature/PetRentSavingsMini";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  inlineLink,
  SectionHeading,
  SubHeading,
  Para,
  CheckList,
  BlogMeta,
  BlogJsonLd,
  BlogHero,
  BlogFaq,
  BlogKeepReading,
  BlogLegalDisclaimer,
  type BlogFaqItem,
} from "../../components/feature/BlogProse";

const CANONICAL = "https://pawtenant.com/blog/apartment-pet-rent-and-esa-letters";
const TITLE = "Apartment Pet Rent and ESA Letters: What Renters Should Know";
const DESC =
  "How apartment pet rent works, when an approved emotional support animal may not be charged pet fees, and how to make a housing accommodation request the right way.";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/esa-owner-dog-apartment.jpg";
const KEYWORDS =
  "apartment pet rent, esa pet rent, emotional support animal pet rent, can landlord charge pet rent for esa, apartment pet fees, esa letter for apartments, do esa animals pay pet rent";

const faqs: BlogFaqItem[] = [
  {
    q: "Does an approved ESA pay pet rent in an apartment?",
    a: "Often not. Approved emotional support animals are generally not treated as pets, so apartments usually cannot charge pet rent, pet deposits, or pet fees for them. But this is not automatic — the housing provider reviews each reasonable-accommodation request individually, and a letter does not guarantee approval or a fee waiver. You can still be held responsible for any actual damage the animal causes.",
  },
  {
    q: "Can an apartment charge pet rent for an emotional support animal?",
    a: "For an ordinary pet, yes. For an approved assistance animal, generally no — pet-specific charges typically do not apply once a reasonable-accommodation request is approved. Until a request is made and approved, a property may continue to apply its standard pet policy. Each situation is decided individually under the Fair Housing Act.",
  },
  {
    q: "What documentation do I send my apartment?",
    a: "Typically a short written reasonable-accommodation request plus a housing-focused ESA letter from a provider licensed in your state. The letter should name the provider, their license type and state, and be verifiable. You generally do not need to share your diagnosis or full medical records — only documentation that reasonably supports the need.",
  },
  {
    q: "Can my apartment deny my ESA accommodation request?",
    a: "In limited situations, yes — for example if the specific animal would be a direct threat to others' safety or cause substantial damage that cannot be reduced, or if the documentation does not reasonably support the need. An apartment generally cannot deny based only on a no-pet policy, breed, size, or weight. If you are denied, there are calm next steps and denial support.",
  },
  {
    q: "How much could apartment pet rent cost me over time?",
    a: "It depends on the monthly amount and number of pets. At $50/month for one pet, that is $600 a year and $3,000 over five years, before any one-time deposit or fee. Our pet rent savings calculator estimates 1, 2, and 5-year totals so you can see what the charges add up to. The figures are estimates only.",
  },
  {
    q: "Is an apartment ESA the same as a service dog?",
    a: "No. An emotional support animal is covered for housing under the Fair Housing Act and provides comfort. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is a separate category with different documentation. This article is about ESA housing documentation, not PSD or public-access rights.",
  },
];

export default function BlogApartmentPetRentEsaLettersPage() {
  const { withAttribution } = useAttributionParams();

  return (
    <main>
      <BlogMeta
        title={TITLE}
        description={DESC}
        canonical={CANONICAL}
        image={HERO_IMG}
        keywords={KEYWORDS}
        published="2026-06-20"
      />
      <BlogJsonLd
        canonical={CANONICAL}
        headline={TITLE}
        description={DESC}
        image={HERO_IMG}
        datePublished="2026-06-20"
        breadcrumbName="Apartment Pet Rent and ESA Letters"
        faqs={faqs}
        keywords={KEYWORDS}
      />

      <SharedNavbar />

      <BlogHero
        chips={["Apartment Pet Rent", "ESA Housing", "Fair Housing Act", "Accommodation Request"]}
        breadcrumbName="Apartment Pet Rent & ESA Letters"
        h1="Apartment Pet Rent and ESA Letters:"
        h1Accent="What Renters Should Know"
        publishedLabel="Published June 2026"
        readMins={7}
        summaryItems={[
          <><strong className="text-gray-900">Apartment pet rent</strong> is a recurring monthly charge for living with a pet — often charged per animal.</>,
          <><strong className="text-gray-900">Approved ESAs are different:</strong> an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees.</>,
          <><strong className="text-gray-900">Not automatic:</strong> you make a reasonable-accommodation request, the apartment reviews it individually, and no outcome is guaranteed.</>,
          <><strong className="text-gray-900">What to send:</strong> a short written request plus a verifiable, housing-focused ESA letter from a provider licensed in your state.</>,
        ]}
        image="/assets/lifestyle/esa-owner-dog-apartment.jpg"
        alt="A renter relaxing in an apartment with their emotional support dog"
      />

      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <Para>
            Apartment pet rent is one of the quietest ways a lease gets more expensive. A modest
            monthly charge — often <em>per pet</em> — can total thousands of dollars over a few years.
            This guide explains how apartment pet rent works, when an{" "}
            <Link to="/esa-letter-for-apartments" className={inlineLink}>approved emotional support animal</Link>{" "}
            may not be charged those fees, and how to make a housing accommodation request the right
            way.
          </Para>

          {/* Direct answer callout */}
          <div className="my-6 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2 flex items-center gap-2">
              <i className="ri-question-answer-line"></i> Quick answer
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              For an ordinary pet, an apartment can charge monthly pet rent. For an{" "}
              <strong className="text-gray-800">approved emotional support animal</strong>, pet rent,
              pet deposits, and pet fees generally <strong className="text-gray-800">do not apply</strong> —
              because an approved assistance animal is not treated as a pet. This is decided{" "}
              <strong className="text-gray-800">individually</strong> by the housing provider, and a
              letter does not guarantee approval or any fee waiver.
            </p>
          </div>

          <SectionHeading id="how-apartment-pet-rent-works">How apartment pet rent works</SectionHeading>
          <Para>
            Pet rent is a recurring monthly amount on top of base rent. Larger corporate-managed
            buildings often charge it, sometimes alongside a one-time pet deposit or non-refundable
            pet fee. Many properties charge per pet, so two animals can double the monthly cost. For a
            full breakdown of the different charges, see{" "}
            <Link to="/blog/pet-deposit-vs-pet-rent" className={inlineLink}>pet deposit vs. pet rent</Link>{" "}
            and our overview of{" "}
            <Link to="/blog/pet-rent-explained" className={inlineLink}>pet rent explained</Link>.
          </Para>

          <SectionHeading id="esa-and-pet-rent">Where an approved ESA changes the math</SectionHeading>
          <Para>
            An emotional support animal is not legally treated the same as a pet for housing. With a
            housing-focused ESA letter from a licensed provider, a renter can request a reasonable
            accommodation under the Fair Housing Act. When that request is approved, the apartment
            generally <strong className="text-gray-800">cannot charge pet rent, a pet deposit, or pet
            fees</strong> for the assistance animal.
          </Para>
          <Para>
            That said, the protections have limits. The request is reviewed individually; a valid
            letter <strong className="text-gray-800">supports but does not guarantee</strong> approval;
            and you remain responsible for any actual damage. See{" "}
            <Link to="/esa-pet-rent-deposit" className={inlineLink}>ESA pet rent &amp; deposits</Link>{" "}
            for how fees are handled, and{" "}
            <Link to="/landlord-esa-documentation-checklist" className={inlineLink}>the landlord ESA documentation checklist</Link>{" "}
            for how an approved animal differs from a pet under your lease.
          </Para>

          <SectionHeading id="how-to-request">How to request an apartment accommodation</SectionHeading>
          <Para>
            If a licensed provider determines an ESA is clinically appropriate for you, the request
            itself is straightforward:
          </Para>
          <CheckList
            items={[
              "Put it in writing — a short reasonable-accommodation request to your leasing office or property manager.",
              <>Include a verifiable, housing-focused ESA letter from a provider licensed in your state — see <Link to="/esa-letter-for-landlord" className={inlineLink}>what to send your landlord</Link>.</>,
              "Keep copies of everything — your request, the letter, and any responses.",
              "Be ready for an individual review — the apartment may ask for documentation that reasonably supports the need, but generally cannot demand your diagnosis or full medical records.",
            ]}
          />
          <Para>
            Before you decide, it helps to see what apartment pet rent would otherwise cost you over
            time:
          </Para>
        </div>
      </article>

      {/* Calculator teaser (carries the required estimate-only disclaimer + calculator link) */}
      <PetRentSavingsMini
        className="bg-[#fafafa] border-y border-gray-100"
        heading="How much could apartment pet rent cost over time?"
        copy="Estimate the one-year total for your monthly pet rent, then open the full calculator for 1, 2, and 5-year estimates — and what you may save if a housing accommodation request is approved."
      />

      <article className="bg-white pt-4 pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SubHeading>What an apartment generally cannot do for an approved ESA</SubHeading>
          <CheckList
            items={[
              "Charge pet rent, a pet deposit, or pet fees for an approved assistance animal.",
              "Refuse based only on a no-pet policy, breed, size, or weight.",
              "Require you to \"register\" the animal or buy a certificate, ID card, or vest.",
              "Demand your specific diagnosis or full medical records.",
            ]}
          />
          <Para>
            These are general Fair Housing principles, not legal advice, and state and local rules can
            add protections. If a valid request is pushed back, see{" "}
            <Link to="/landlord-denied-esa-letter" className={inlineLink}>what to do if a landlord denies your ESA</Link>.
          </Para>
        </div>
      </article>

      <BlogFaq heading="Apartment pet rent &amp; ESA letters: FAQ" faqs={faqs} />

      {/* Bottom CTA */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Renting an apartment with your animal?
          </h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed mental health professional reviews your situation and, if clinically
            appropriate, issues a verifiable, housing-focused ESA letter for your apartment. Every
            request is decided individually — no outcome is guaranteed, and there is a refund if you
            do not qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start ESA assessment
            </Link>
            <Link
              to="/esa-letter-for-apartments"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-home-heart-line"></i> ESA letter for apartments
            </Link>
          </div>
        </div>
      </section>

      <BlogKeepReading
        links={[
          { to: "/pet-rent-savings-calculator", icon: "ri-calculator-line", label: "Pet rent savings calculator" },
          { to: "/esa-letter-for-apartments", icon: "ri-home-heart-line", label: "ESA letter for apartments" },
          { to: "/esa-pet-rent-deposit", icon: "ri-money-dollar-circle-line", label: "ESA pet rent & deposits" },
          { to: "/esa-letter-for-landlord", icon: "ri-mail-send-line", label: "Sending an ESA letter to your landlord" },
          { to: "/blog/pet-rent-explained", icon: "ri-article-line", label: "Pet rent explained" },
          { to: "/esa-letter-cost", icon: "ri-price-tag-3-line", label: "ESA letter cost" },
        ]}
      />

      <BlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
