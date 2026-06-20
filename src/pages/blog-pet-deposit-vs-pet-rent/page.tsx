// Blog article — /blog/pet-deposit-vs-pet-rent
//
// "Pet Deposit vs. Pet Rent: What Is the Difference?"
// Fee-comparison intent → pet-rent calculator → ESA housing documentation.
//
// Compliance: estimate-only; ESA framed as housing-focused, outcomes decided
// individually, no guaranteed waiver. ESA vs PSD kept separate. The embedded
// <PetRentSavingsMini> carries the required estimate-only disclaimer + the
// /pet-rent-savings-calculator link. SEO title/description/canonical come from
// CORE_PAGE_META via SEOManager + prerender.

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

const CANONICAL = "https://pawtenant.com/blog/pet-deposit-vs-pet-rent";
const TITLE = "Pet Deposit vs. Pet Rent: What Is the Difference?";
const DESC =
  "Pet deposit, pet rent, and pet fee compared — what each one is, whether it is refundable, how they add up, and how approved ESA documentation changes the picture.";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg";
const KEYWORDS =
  "pet deposit vs pet rent, pet rent vs pet deposit, pet deposit, pet fee vs pet rent, is pet rent refundable, difference between pet rent and pet deposit, pet fees apartment";

const compareRows = [
  {
    feature: "What it is",
    deposit: "A one-time, refundable security amount held against pet damage",
    rent: "A recurring monthly charge added to your base rent",
  },
  {
    feature: "When you pay",
    deposit: "Once, at move-in",
    rent: "Every month, for as long as you have the pet",
  },
  {
    feature: "Refundable?",
    deposit: "Often yes — minus documented pet-related damage",
    rent: "Generally no — it is treated as rent, not a deposit",
  },
  {
    feature: "Typical range",
    deposit: "About $200–$500 one-time",
    rent: "About $10–$75 per month, sometimes per pet",
  },
  {
    feature: "Adds up to",
    deposit: "A fixed one-time amount",
    rent: "Hundreds to thousands over a multi-year lease",
  },
];

const faqs: BlogFaqItem[] = [
  {
    q: "What is the difference between pet rent and a pet deposit?",
    a: "A pet deposit is a one-time, usually refundable amount held against pet damage and returned at move-out minus any documented damage. Pet rent is a recurring monthly charge added to your base rent that you pay for as long as you have the pet, and it is generally not refundable. Many leases include both, plus a separate one-time pet fee.",
  },
  {
    q: "Is a pet deposit refundable but pet rent is not?",
    a: "Usually, yes. A pet deposit is often refundable minus documented pet-related damage, similar to a security deposit. Pet rent is treated as ongoing rent, so it is generally not refundable. A one-time pet fee is typically non-refundable as well. Your lease language is what ultimately controls each charge.",
  },
  {
    q: "What is a pet fee, and how is it different?",
    a: "A pet fee is a one-time, usually non-refundable charge at move-in — different from a refundable deposit and different from monthly pet rent. Some properties charge a pet fee instead of a deposit, some charge both, and many also add monthly pet rent on top. Always separate the three on your lease.",
  },
  {
    q: "Which costs more over time — pet rent or a pet deposit?",
    a: "Over a multi-year lease, pet rent almost always costs more because it repeats every month, while a deposit or fee is a fixed one-time amount. For example, $50/month in pet rent is $600 a year and $3,000 over five years, far more than a typical one-time deposit. Our pet rent savings calculator estimates the totals — the figures are estimates only.",
  },
  {
    q: "Do these fees apply to an approved emotional support animal?",
    a: "Often not. Approved emotional support animals are generally not treated as pets, so pet rent, pet deposits, and pet fees usually do not apply once a reasonable-accommodation request is approved. This is decided individually by the housing provider, and a letter does not guarantee approval or a fee waiver. You can still be responsible for any actual damage the animal causes.",
  },
  {
    q: "Can a landlord charge both a pet deposit and pet rent?",
    a: "For an ordinary pet, yes — many leases include a one-time deposit or fee plus monthly pet rent, subject to state and local deposit limits. For an approved assistance animal, pet-specific charges generally do not apply once an accommodation request is approved. Each situation is reviewed individually.",
  },
];

export default function BlogPetDepositVsPetRentPage() {
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
        breadcrumbName="Pet Deposit vs. Pet Rent"
        faqs={faqs}
        keywords={KEYWORDS}
      />

      <SharedNavbar />

      <BlogHero
        chips={["Pet Deposit", "Pet Rent", "Pet Fees", "Renter Costs"]}
        breadcrumbName="Pet Deposit vs. Pet Rent"
        h1="Pet Deposit vs. Pet Rent:"
        h1Accent="What Is the Difference?"
        publishedLabel="Published June 2026"
        readMins={6}
        summaryItems={[
          <><strong className="text-gray-900">Pet deposit:</strong> one-time, often refundable minus pet damage.</>,
          <><strong className="text-gray-900">Pet rent:</strong> recurring monthly charge, generally not refundable.</>,
          <><strong className="text-gray-900">Pet fee:</strong> one-time, usually non-refundable.</>,
          <><strong className="text-gray-900">Over time</strong>, monthly pet rent usually costs the most — and approved ESAs are generally not charged any of the three (decided individually, never guaranteed).</>,
        ]}
        image="/assets/lifestyle/person-paperwork-with-dog.jpg"
        alt="A renter reviewing lease paperwork at home with their dog beside them"
      />

      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <Para>
            &ldquo;Pet deposit,&rdquo; &ldquo;pet rent,&rdquo; and &ldquo;pet fee&rdquo; sound
            interchangeable, but they are three different charges — and the difference can be hundreds
            or thousands of dollars over a lease. Here is what each one means, whether you get it back,
            and how housing-focused{" "}
            <Link to="/esa-letter-cost" className={inlineLink}>ESA documentation</Link> fits in.
          </Para>

          {/* Direct answer callout */}
          <div className="my-6 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2 flex items-center gap-2">
              <i className="ri-question-answer-line"></i> Quick answer
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A <strong className="text-gray-800">pet deposit</strong> is a one-time, usually
              refundable amount held against damage. <strong className="text-gray-800">Pet rent</strong>{" "}
              is a recurring monthly charge that is generally not refundable. A{" "}
              <strong className="text-gray-800">pet fee</strong> is a one-time, usually non-refundable
              charge. Over a multi-year lease, monthly pet rent typically costs the most.
            </p>
          </div>

          <SectionHeading id="side-by-side">Pet deposit vs. pet rent, side by side</SectionHeading>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[24%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[38%]">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-safe-2-line text-orange-500"></i> Pet deposit</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[38%]">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-2-line text-orange-500"></i> Pet rent</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.deposit}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.rent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3 my-5">
            {compareRows.map((row) => (
              <div key={row.feature} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">{row.feature}</p>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-semibold text-gray-700">Pet deposit:</span> {row.deposit}</p>
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-semibold text-gray-700">Pet rent:</span> {row.rent}</p>
                </div>
              </div>
            ))}
          </div>

          <SectionHeading id="refundable">Refundable vs. non-refundable</SectionHeading>
          <Para>
            The biggest practical difference is whether you get the money back. A{" "}
            <strong className="text-gray-800">pet deposit</strong> behaves like a security deposit —
            often refundable at move-out minus documented pet-related damage. <strong className="text-gray-800">Pet
            rent</strong> and a one-time <strong className="text-gray-800">pet fee</strong> are
            generally not refundable. To protect a refundable deposit, document your pet&apos;s
            move-in condition in writing.
          </Para>

          <SectionHeading id="adds-up">How the charges add up</SectionHeading>
          <Para>
            A one-time deposit or fee is a fixed number. Pet rent keeps going. That is why, over a
            multi-year lease, monthly pet rent usually becomes the largest pet-related cost. Estimate
            your own totals below:
          </Para>
        </div>
      </article>

      {/* Calculator teaser (carries the required estimate-only disclaimer + calculator link) */}
      <PetRentSavingsMini
        className="bg-[#fafafa] border-y border-gray-100"
        heading="See how pet rent and deposits add up"
        copy="Enter your monthly pet rent and number of pets to estimate the one-year total, then open the full calculator to compare 1, 2, and 5-year estimates."
      />

      <article className="bg-white pt-4 pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="esa">How approved ESA documentation changes the picture</SectionHeading>
          <Para>
            An emotional support animal is not legally treated the same as a pet for housing. With a
            housing-focused ESA letter from a licensed provider, a renter can make a reasonable
            accommodation request under the Fair Housing Act. When that request is approved, the
            assistance animal is generally{" "}
            <strong className="text-gray-800">not charged a pet deposit, pet rent, or pet fees</strong> —
            because it is not classified as a pet.
          </Para>
          <Para>
            As always, the request is reviewed individually, a letter{" "}
            <strong className="text-gray-800">does not guarantee</strong> approval or a fee waiver, and
            you remain responsible for any actual damage. Learn more in{" "}
            <Link to="/esa-pet-rent-deposit" className={inlineLink}>ESA pet rent &amp; deposits</Link>{" "}
            and{" "}
            <Link to="/blog/apartment-pet-rent-and-esa-letters" className={inlineLink}>apartment pet rent and ESA letters</Link>.
          </Para>

          <SubHeading>Quick checklist before you sign a pet lease</SubHeading>
          <CheckList
            items={[
              "Separate the three charges on the lease: pet deposit, pet rent, and pet fee.",
              "Confirm which deposit is refundable, and document move-in condition.",
              "Check whether pet rent is charged per pet.",
              <>If a licensed provider determines an ESA is clinically appropriate, housing-focused documentation may support a request where pet-specific charges do not apply — see <Link to="/esa-letter-for-apartments" className={inlineLink}>ESA letter for apartments</Link>.</>,
            ]}
          />
        </div>
      </article>

      <BlogFaq heading="Pet deposit vs. pet rent: FAQ" faqs={faqs} />

      {/* Bottom CTA */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Curious whether an ESA could apply to you?
          </h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed mental health professional reviews your situation and, if clinically
            appropriate, issues a verifiable, housing-focused ESA letter. Every accommodation request
            is decided individually — no outcome is guaranteed, and there is a refund if you do not
            qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start ESA assessment
            </Link>
            <Link
              to="/pet-rent-savings-calculator"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-calculator-line"></i> Open the pet rent calculator
            </Link>
          </div>
        </div>
      </section>

      <BlogKeepReading
        links={[
          { to: "/pet-rent-savings-calculator", icon: "ri-calculator-line", label: "Pet rent savings calculator" },
          { to: "/blog/pet-rent-explained", icon: "ri-article-line", label: "Pet rent explained" },
          { to: "/blog/apartment-pet-rent-and-esa-letters", icon: "ri-building-line", label: "Apartment pet rent & ESA letters" },
          { to: "/esa-pet-rent-deposit", icon: "ri-money-dollar-circle-line", label: "ESA pet rent & deposits" },
          { to: "/esa-letter-for-landlord", icon: "ri-mail-send-line", label: "ESA letter for your landlord" },
          { to: "/esa-letter-cost", icon: "ri-price-tag-3-line", label: "ESA letter cost" },
        ]}
      />

      <BlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
