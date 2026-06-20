// Blog article — /blog/pet-rent-explained
//
// "Pet Rent Explained: What Renters Should Know About Monthly Pet Fees"
// Top-of-funnel informational → pet-rent calculator → ESA housing pages.
//
// Compliance: estimate-only language; pet-rent figures are estimates. ESA
// documentation framed as "housing-focused," outcomes "decided individually,"
// no guaranteed approval / fee waiver. ESA and PSD kept separate. The embedded
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

const CANONICAL = "https://pawtenant.com/blog/pet-rent-explained";
const TITLE = "Pet Rent Explained: What Renters Should Know About Monthly Pet Fees";
const DESC =
  "What pet rent is, how it differs from a pet deposit and pet fee, how much it can add up to over time, and how housing-focused ESA documentation fits in.";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg";
const KEYWORDS =
  "pet rent, what is pet rent, monthly pet rent, pet rent vs pet deposit, pet fees apartment, pet rent explained, how much is pet rent, pet rent calculator";

const feeTypes = [
  {
    type: "Pet rent",
    when: "Charged every month, on top of base rent",
    refundable: "No — it is ongoing rent, not a deposit",
    typical: "About $10–$75 per month, sometimes per pet",
  },
  {
    type: "Pet deposit",
    when: "One-time, at move-in",
    refundable: "Often refundable, minus any pet-related damage",
    typical: "About $200–$500 one-time",
  },
  {
    type: "Pet fee",
    when: "One-time, at move-in",
    refundable: "Usually non-refundable",
    typical: "About $100–$500 one-time",
  },
];

const faqs: BlogFaqItem[] = [
  {
    q: "What is pet rent?",
    a: "Pet rent is a recurring monthly charge some housing providers add on top of your base rent for living with a pet. Unlike a one-time pet deposit or pet fee, it repeats every month for as long as you have the pet, so it can add up to a significant amount over a lease term.",
  },
  {
    q: "How much is pet rent on average?",
    a: "It varies widely by market and property, but monthly pet rent commonly falls somewhere around $10 to $75 per pet. High-cost rental markets and larger corporate-managed buildings tend to sit at the higher end. Always check your specific lease, because some properties also charge a separate one-time pet deposit or pet fee.",
  },
  {
    q: "Is pet rent refundable?",
    a: "Generally no. Pet rent is treated as ongoing rent, not a deposit, so it is typically not refundable. A pet deposit, by contrast, is often refundable minus any documented pet-related damage. A one-time pet fee is usually non-refundable. Your lease language controls which applies.",
  },
  {
    q: "Is it legal for a landlord to charge pet rent?",
    a: "In most places, yes — for a pet. Charging monthly pet rent, a pet deposit, or a pet fee for an ordinary pet is generally allowed, subject to state and local limits. The picture can be different for an approved assistance animal: approved emotional support animals are often not treated the same as pets, so pet-specific charges may not apply — but each accommodation request is reviewed individually and outcomes are never guaranteed.",
  },
  {
    q: "Does an ESA letter remove pet rent?",
    a: "It can support a request to have pet-specific charges waived, but it does not automatically remove them. A housing-focused ESA letter from a licensed provider supports a reasonable-accommodation request under the Fair Housing Act. The housing provider must consider that request, and approved assistance animals are often exempt from pet rent and pet deposits — but the decision is made individually, and a letter does not guarantee approval or any fee waiver.",
  },
  {
    q: "How can I estimate what pet rent will cost me?",
    a: "Multiply your monthly pet rent by the number of pets charged, then by 12 for a yearly total, and add any one-time pet deposit or fee. Our pet rent savings calculator does this for 1, 2, and 5 years so you can see how the charges add up over a lease. The figures are estimates only.",
  },
];

export default function BlogPetRentExplainedPage() {
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
        breadcrumbName="Pet Rent Explained"
        faqs={faqs}
        keywords={KEYWORDS}
      />

      <SharedNavbar />

      <BlogHero
        chips={["Pet Rent", "Monthly Pet Fees", "Renter Costs", "ESA Housing"]}
        breadcrumbName="Pet Rent Explained"
        h1="Pet Rent Explained:"
        h1Accent="What Renters Should Know About Monthly Pet Fees"
        publishedLabel="Published June 2026"
        readMins={7}
        summaryItems={[
          <><strong className="text-gray-900">Pet rent</strong> is a recurring monthly charge on top of base rent — it is not a deposit and is generally not refundable.</>,
          <><strong className="text-gray-900">Three charges to know:</strong> monthly pet rent, a one-time pet deposit (often refundable), and a one-time pet fee (usually non-refundable).</>,
          <><strong className="text-gray-900">It adds up:</strong> even modest monthly pet rent can total hundreds to thousands of dollars over a multi-year lease.</>,
          <><strong className="text-gray-900">ESA angle:</strong> approved assistance animals are often not charged pet rent or pet deposits — but each housing accommodation request is reviewed individually and is never guaranteed.</>,
        ]}
        image="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
        alt="A renter moving into a new apartment with her dog, reviewing the lease"
      />

      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <Para>
            If you rent with a pet, you have probably seen an extra line on your lease: pet rent. It
            is one of the most common — and most misunderstood — charges renters face. This guide
            explains what pet rent is, how it is different from a pet deposit and a pet fee, how much
            it can add up to over time, and where housing-focused{" "}
            <Link to="/esa-letter-cost" className={inlineLink}>ESA documentation</Link> fits in.
          </Para>

          <SectionHeading id="what-is-pet-rent">What is pet rent?</SectionHeading>
          <Para>
            <strong className="text-gray-800">Pet rent is a recurring monthly charge</strong> some
            housing providers add to your base rent for living with a pet. Unlike a one-time deposit
            or fee, it repeats every month for as long as the pet lives with you. Many properties
            charge it <em>per pet</em>, so two pets can mean double the monthly amount.
          </Para>
          <Para>
            Because it is ongoing, pet rent is the charge that adds up the most over a lease — and
            it is generally not refundable, since it is treated as rent rather than a deposit.
          </Para>

          <SectionHeading id="rent-vs-deposit-vs-fee">Pet rent vs. pet deposit vs. pet fee</SectionHeading>
          <Para>
            These three terms are often used loosely, but they mean different things. Here is how they
            compare:
          </Para>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[22%]">Charge</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[28%]">When it is charged</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[28%]">Refundable?</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[22%]">Typical range</th>
                </tr>
              </thead>
              <tbody>
                {feeTypes.map((row, i) => (
                  <tr key={row.type} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-800 align-top">{row.type}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.when}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.refundable}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.typical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3 my-5">
            {feeTypes.map((row) => (
              <div key={row.type} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">
                  {row.type}
                </p>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-semibold text-gray-700">When:</span> {row.when}</p>
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-semibold text-gray-700">Refundable:</span> {row.refundable}</p>
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-semibold text-gray-700">Typical:</span> {row.typical}</p>
                </div>
              </div>
            ))}
          </div>
          <Para>
            Want the full breakdown? See our deeper guide on{" "}
            <Link to="/blog/pet-deposit-vs-pet-rent" className={inlineLink}>pet deposit vs. pet rent</Link>.
            The ranges above are general estimates — your lease controls the exact amounts.
          </Para>

          <SectionHeading id="how-it-adds-up">How much does pet rent add up to?</SectionHeading>
          <Para>
            Pet rent looks small month to month, but it compounds. At{" "}
            <strong className="text-gray-800">$50/month</strong>, that is{" "}
            <strong className="text-gray-800">$600 a year</strong> — and{" "}
            <strong className="text-gray-800">$3,000 over a five-year stay</strong>, before any
            one-time deposit or fee. Use the estimator below to see your own numbers:
          </Para>
        </div>
      </article>

      {/* Calculator teaser (carries the required estimate-only disclaimer + calculator link) */}
      <PetRentSavingsMini
        className="bg-[#fafafa] border-y border-gray-100"
        heading="Estimate what pet rent could cost you"
        copy="Enter a typical monthly pet-rent amount and number of pets to see the one-year total, then open the full calculator for 1, 2, and 5-year estimates."
      />

      <article className="bg-white pt-4 pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="is-pet-rent-legal">Is it legal for a landlord to charge pet rent?</SectionHeading>
          <Para>
            For an ordinary pet, charging pet rent, a pet deposit, or a pet fee is{" "}
            <strong className="text-gray-800">generally allowed</strong>, subject to state and local
            limits on deposits. There is usually no cap specifically on monthly pet rent. The picture
            can change for an <strong className="text-gray-800">approved assistance animal</strong>,
            which is covered next.
          </Para>

          <SectionHeading id="esa-angle">How pet rent works with ESA housing documentation</SectionHeading>
          <Para>
            An emotional support animal (ESA) is not legally treated the same as a pet for housing.
            With a housing-focused ESA letter from a licensed provider, a renter can make a{" "}
            <Link to="/esa-letter-for-apartments" className={inlineLink}>reasonable-accommodation request</Link>{" "}
            under the Fair Housing Act. When such a request is approved, the assistance animal is
            often <strong className="text-gray-800">not charged pet rent, a pet deposit, or pet fees</strong> —
            because it is not classified as a pet.
          </Para>
          <Para>
            Two important caveats: each request is{" "}
            <strong className="text-gray-800">reviewed individually</strong> by the housing provider,
            and a letter <strong className="text-gray-800">does not guarantee</strong> approval, a fee
            waiver, or any specific outcome. You can also still be held responsible for any actual
            damage your animal causes. For the details, see{" "}
            <Link to="/esa-pet-rent-deposit" className={inlineLink}>ESA pet rent &amp; deposits</Link>{" "}
            and our guide to{" "}
            <Link to="/esa-letter-for-landlord" className={inlineLink}>sending an ESA letter to your landlord</Link>.
          </Para>
          <Para>
            An ESA is also different from a psychiatric service dog (PSD). PSD documentation involves
            disability-related task training and is a separate path — it is not covered here.
          </Para>

          <SubHeading>Ways renters try to reduce pet costs</SubHeading>
          <CheckList
            items={[
              "Read the lease carefully — separate the monthly pet rent from any one-time deposit or fee, and note whether charges are per pet.",
              "Ask whether the pet deposit is refundable, and get the move-in pet condition documented in writing.",
              "Compare buildings — pet-rent amounts vary widely between properties in the same area.",
              <>If a licensed provider determines an ESA is clinically appropriate for you, housing-focused documentation may support a request where pet-specific charges do not apply — see <Link to="/esa-letter-cost" className={inlineLink}>ESA letter cost</Link>.</>,
            ]}
          />
        </div>
      </article>

      <BlogFaq heading="Pet rent: frequently asked questions" faqs={faqs} />

      {/* Bottom CTA */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Wondering if an ESA could fit your situation?
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
          { to: "/blog/pet-deposit-vs-pet-rent", icon: "ri-scales-3-line", label: "Pet deposit vs. pet rent" },
          { to: "/blog/apartment-pet-rent-and-esa-letters", icon: "ri-building-line", label: "Apartment pet rent & ESA letters" },
          { to: "/esa-pet-rent-deposit", icon: "ri-money-dollar-circle-line", label: "ESA pet rent & deposits" },
          { to: "/esa-letter-for-apartments", icon: "ri-home-heart-line", label: "ESA letter for apartments" },
          { to: "/esa-letter-cost", icon: "ri-price-tag-3-line", label: "ESA letter cost" },
        ]}
      />

      <BlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
