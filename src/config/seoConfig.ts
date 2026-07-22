/**
 * Centralized SEO metadata. Source of truth for page titles, descriptions,
 * and canonical URL construction. Consumed by SEOManager on every route
 * change so that each page emits its own self-referencing canonical and
 * unique title/description.
 */

// ── 2026-05-21 SEO-DOMAIN-CANONICAL ─────────────────────────────────────────
// Single source of truth for the canonical host.
//
// PawTenant historically lived on both `pawtenant.com` (non-www, used by the
// original WordPress site and registered with Google Search Console) and
// `www.pawtenant.com` (used by an earlier Vercel deployment of the React
// build). Two indexable hosts splits link equity, creates duplicate-canonical
// reports in SEO tools, and produces the "Canonical defined multiple times"
// warning when the per-page JSX meta and the prerendered <head> disagree.
//
// We have now standardized on `https://pawtenant.com` (NON-WWW) as the only
// canonical and indexable host. The 301 redirect from www.* → non-www lives in
// `vercel.json`; everything that consumes BASE_URL (SEOManager runtime
// canonicals, scripts/prerender-seo.mjs build-time canonicals, all og:url
// fields) inherits the host from this constant. Do not hardcode the host
// anywhere else in the SEO pipeline — import BASE_URL instead.
export const BASE_URL = "https://pawtenant.com";

export interface SEOEntry {
  title: string;
  description: string;
  keywords?: string;
}

// ── Core static pages ────────────────────────────────────────────────────────
export const CORE_PAGE_META: Record<string, SEOEntry> = {
  "/": {
    title: "ESA Letter Online | Licensed Provider Evaluation | PawTenant",
    description:
      "Get a real, housing-focused ESA letter through a licensed provider evaluation — verifiable letter, transparent pricing, and a refund if you don't qualify.",
  },
  "/assessment": {
    title: "Apply for Your ESA Letter | Start Your Evaluation | PawTenant",
    description:
      "Begin your ESA letter application in minutes. Answer a short questionnaire, connect with a licensed LMHP, and receive your ESA letter fast.",
  },
  "/how-to-get-esa-letter": {
    title: "How to Get an ESA Letter | Step-by-Step Licensed Evaluation",
    description:
      "How to get an ESA letter step by step: a licensed provider evaluation, a verifiable housing-focused letter, and a refund if you don't qualify.",
      keywords: 
      "How to get ESA letter,Get esa letter,Get ESA letter online ,How to get ESA letter online",
  },
  "/housing-rights-esa": {
    title: "ESA Housing Rights Explained | Fair Housing Act | PawTenant",
    description:
      "Understand your housing rights with an emotional support animal. Learn how the Fair Housing Act protects ESA owners and keeps you and your pet together.",
  },
  "/esa-letter-cost": {
    title: "ESA Letter Cost: Online Evaluation Pricing & What's Included",
    description:
      "ESA letter cost explained: transparent pricing for a licensed provider evaluation, what's included, and a refund if you don't qualify.",
  },
  "/pet-rent-savings-calculator": {
    title: "Pet Rent Savings Calculator | Estimate ESA Housing Savings",
    description:
      "Estimate how monthly pet rent and one-time pet fees can add up over 1, 2, and 5 years. See potential savings if your ESA housing accommodation request is approved.",
  },
  // ── Provider directory + curated provider profiles ─────────────────────────
  // AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001. Unique title/description
  // per provider; verified facts only; no approximate state counts; no "Dr.".
  "/our-providers": {
    title: "Our Providers | Licensed ESA Evaluation Professionals | PawTenant",
    description:
      "Meet PawTenant's licensed mental health providers. Each conducts individual telehealth evaluations, including emotional support animal (ESA) assessments, in the states where they are licensed.",
  },
  "/doctors/robert-staaf": {
    title: "Robert Staaf, LCSW | ESA Evaluations | PawTenant",
    description:
      "Robert Staaf is a Licensed Clinical Social Worker (LCSW) providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/doctors/michelle-lafferty": {
    title: "Michelle Lafferty, LCSW | ESA Evaluations | PawTenant",
    description:
      "Michelle Lafferty is a Licensed Clinical Social Worker (LCSW) providing individual telehealth ESA evaluations through PawTenant.",
  },
  "/doctors/lytara-garcia": {
    title: "Lytara Garcia, LCSW | ESA Evaluations | PawTenant",
    description:
      "Lytara Garcia is a Licensed Clinical Social Worker (LCSW) providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/doctors/stephanie-white": {
    title: "Stephanie White, LCSW | ESA Evaluations | PawTenant",
    description:
      "Stephanie White is a Licensed Clinical Social Worker (LCSW) providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/doctors/eve-rosno": {
    title: "Eve Rosno, Licensed Psychologist | ESA Evaluations | PawTenant",
    description:
      "Eve Rosno is a licensed psychologist providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/doctors/henry-smith": {
    title: "Henry Smith, LCSW | ESA Evaluations | PawTenant",
    description:
      "Henry Smith is a Licensed Clinical Social Worker (LCSW) providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/doctors/chad-cunningham": {
    title: "Chad Cunningham, LPC | ESA Evaluations | PawTenant",
    description:
      "Chad Cunningham is a Licensed Professional Counselor (LPC) providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/doctors/karla-delgado": {
    title: "Karla Delgado, LMFT | ESA Evaluations | PawTenant",
    description:
      "Karla Delgado is a Licensed Marriage and Family Therapist (LMFT) providing individual telehealth ESA evaluations through PawTenant. NPI-verified.",
  },
  "/explore-esa-letters-all-states": {
    title: "ESA Letter by State | All 50 US States | PawTenant",
    description:
      "Find ESA letter requirements for your state. PawTenant connects you with licensed professionals in all 50 US states. Know your rights and get your letter today.",
  },
  // ── ESA laws / compliance content pages (informational, indexable) ─────────
  "/esa-laws": {
    title: "ESA Laws & ESA Letter Requirements Explained | PawTenant",
    description:
      "Understand ESA laws and what a valid ESA letter requires. Learn how the Fair Housing Act protects emotional support animal owners — and what an ESA letter can and cannot do.",
  },
  "/are-online-esa-letters-legit": {
    title: "Real ESA Letters: How to Verify an Online Provider | PawTenant",
    description:
      "How to tell if an online ESA letter is real: a licensed provider evaluation, a named provider, and a verifiable letter — and how to avoid fake registrations.",
  },
  "/california-esa-letter-30-day-rule": {
    title: "California ESA Letter & the 30-Day Rule (AB 468) | PawTenant",
    description:
      "California's AB 468 requires a 30-day provider relationship and a clinical evaluation before an ESA letter is issued. Learn what the law requires and how to comply.",
  },
  "/iowa-esa-letter-housing-rules": {
    title: "Iowa ESA Letter & Housing Rules (§ 216.8B) | PawTenant",
    description:
      "Iowa protects assistance animals in housing under Code § 216.8B, with 2024 documentation standards (SF 2268). Learn what an Iowa landlord can ask and what the law requires.",
  },
  "/florida-esa-letter-housing-rules": {
    title: "Florida ESA Letter & Housing Rules (§ 760.27) | PawTenant",
    description:
      "Florida Statute 760.27 sets the rules for ESA documentation in housing — who can write it and what a landlord can ask. Learn how to stay compliant in Florida.",
  },
  "/landlord-denied-esa-letter": {
    title: "Landlord Denied Your ESA? Next Steps & Denial Support | PawTenant",
    description:
      "Landlord denied your ESA? Calm next steps, your options, and how a licensed provider letter with landlord-ready support can help. Refund if you don't qualify.",
  },
  // ── AI-SEO answer-library pages (high-intent ESA queries) ──────────────────
  "/best-online-esa-letter-service": {
    title: "Best Online ESA Letter Services: How to Choose a Real Provider",
    description:
      "How to choose a real online ESA letter service: licensed provider evaluation, transparent pricing, verifiable letters, and housing-focused support.",
  },
  "/how-to-get-esa-letter-online": {
    title: "How to Get an ESA Letter Online | Licensed Provider Evaluation",
    description:
      "Get an ESA letter online via a licensed provider evaluation: a fast telehealth assessment, a verifiable letter for housing, and a refund if you don't qualify.",
  },
  "/esa-letter-for-landlord": {
    title: "ESA Letter for Landlords: Housing Request Guide | PawTenant",
    description:
      "Use an ESA letter with your landlord: housing-focused documentation from a licensed provider, what to send, and how landlords can verify it.",
  },
  "/esa-pet-rent-deposit": {
    title: "ESA Pet Rent & Deposit Guide: What Landlords Can Charge",
    description:
      "Learn when ESA pet rent, deposits, and fees may be removed, what landlords can still ask, and how PawTenant supports housing ESA documentation.",
  },
  "/how-to-verify-esa-letter": {
    title: "How to Verify an ESA Letter Online | Real ESA Letter Guide",
    description:
      "Learn how to verify an ESA letter, check licensed provider details, avoid fake ESA registrations, and use PawTenant's housing documentation support.",
  },
  "/esa-psd-registry-vs-letter": {
    title: "ESA & PSD Registry vs Letter: What Landlords Actually Need | PawTenant",
    description:
      "Learn the difference between ESA or PSD registries, certificates, ID cards, and provider-reviewed housing documentation. PawTenant helps with ESA and PSD letter support.",
  },
  "/is-pawtenant-legit": {
    title: "Is PawTenant Legit? How the ESA Letter Service Works",
    description:
      "Is PawTenant legit? PawTenant connects you with licensed providers for ESA letters, with transparent pricing, verifiable letters, and a refund if you don't qualify.",
  },
  // ── Landlord ESA objection / documentation SEO batch (long-tail housing intent) ──
  "/can-landlord-reject-esa-letter": {
    title: "Can a Landlord Reject an ESA Letter? Your Housing Rights",
    description:
      "Can a landlord reject an ESA letter? When a housing provider may deny a reasonable-accommodation request, when they generally can't, and how to respond.",
  },
  "/what-documents-can-landlord-ask-for-esa": {
    title: "What Documents Can a Landlord Ask For an ESA?",
    description:
      "What documents can a landlord ask for an ESA letter? What a housing provider can reasonably request, what they can't ask, and how to keep medical details private.",
  },
  "/esa-letter-vs-pet-policy": {
    title: "ESA Letter vs Pet Policy: Does a No-Pet Rule Apply?",
    description:
      "ESA letter vs pet policy: does a no-pet policy apply to an emotional support animal, can apartments charge pet rent for an ESA, and how accommodation requests work.",
  },
  "/how-to-respond-to-esa-letter-denial": {
    title: "How to Respond if Your Landlord Denies Your ESA Letter",
    description:
      "How to respond if a landlord denies your ESA letter or says it's fake: calm steps, what to send, verification, and landlord denial support. Refund if you don't qualify.",
  },
  // ── ESA letter validity / verification SEO batch (long-tail validity intent) ──
  "/what-makes-esa-letter-valid": {
    title: "What Makes an ESA Letter Valid for Housing?",
    description:
      "What makes an ESA letter valid for housing: a licensed provider evaluation, what must be included, whether online letters count, and how a landlord checks it.",
  },
  "/landlord-says-esa-letter-is-fake": {
    title: "Landlord Says My ESA Letter Is Fake — What to Do",
    description:
      "Landlord says your ESA letter is fake? How to prove it's genuine, the warning signs of an actually-fake letter, and how to respond with verification and support.",
  },
  "/esa-letter-verification-id": {
    title: "ESA Letter Verification ID: What It Is & Why It Helps",
    description:
      "What an ESA letter verification ID is, whether ESA letters need one, and how a landlord uses it to confirm a letter is genuine without seeing your medical details.",
  },
  // ── ESA housing SEO batch (apartments / accommodation request / landlord checklist) ──
  "/esa-letter-for-apartments": {
    title: "ESA Letter for Apartments | Housing Accommodation Guide",
    description:
      "How an ESA letter works for apartment renters: a licensed provider evaluation, what to send your property manager, pet fees, verification, and denial support.",
  },
  "/esa-accommodation-request-letter": {
    title: "ESA Accommodation Request Letter | What to Send Your Landlord",
    description:
      "Write a clear ESA reasonable-accommodation request letter for housing: what to include, a simple template, and how it pairs with your licensed provider's ESA letter.",
  },
  "/landlord-esa-documentation-checklist": {
    title: "Landlord ESA Documentation Checklist | What to Review",
    description:
      "A clear checklist for landlords reviewing ESA documentation: what you can reasonably request, what you can't ask, and how to verify a letter without seeing medical details.",
  },
  // ── State apartment ESA SEO batch (apartment-renter housing intent by state) ──
  "/california-esa-letter-for-apartments": {
    title: "California ESA Letter for Apartments | Renter Housing Guide",
    description:
      "ESA letters for California apartments: how AB 468's 30-day rule, a licensed provider evaluation, and a verifiable letter support your housing accommodation request.",
  },
  "/texas-esa-letter-for-apartments": {
    title: "Texas ESA Letter for Apartments | Renter Housing Guide",
    description:
      "ESA letters for Texas apartments: how a licensed provider evaluation and a verifiable letter support a reasonable-accommodation request with large property managers.",
  },
  "/florida-esa-letter-for-apartments": {
    title: "Florida ESA Letter for Apartments | Renter Housing Guide",
    description:
      "ESA letters for Florida apartments and condos: how Statute 760.27, a licensed provider evaluation, and a verifiable letter support your housing accommodation request.",
  },
  "/new-york-esa-letter-for-apartments": {
    title: "New York ESA Letter for Apartments | Renter Housing Guide",
    description:
      "ESA letters for New York apartments, co-ops, and condos: how a licensed provider evaluation and a verifiable letter support your reasonable-accommodation request.",
  },
  // ── PSD AEO content batch (PSD conversion + AI-answer pages) ──────────────────
  "/psychiatric-service-dog-letter-online": {
    title: "Psychiatric Service Dog Letter Online | Licensed Provider | PawTenant",
    description:
      "Get a psychiatric service dog (PSD) letter online through a licensed mental health provider evaluation. Learn who qualifies, how it differs from an ESA, and the secure online process.",
  },
  "/psd-letter-for-apartments": {
    title: "PSD Letter for Apartments and Housing Requests | PawTenant",
    description:
      "How a psychiatric service dog (PSD) letter supports an apartment or housing request: what a landlord can ask, Fair Housing framing, and when an ESA letter fits better.",
  },
  "/psd-letter-requirements": {
    title: "PSD Letter Requirements: What You Need to Know | PawTenant",
    description:
      "PSD letter requirements explained: a qualifying psychiatric disability, a task-trained dog, a licensed provider evaluation, and what documentation can and can't do.",
  },
  "/esa-vs-psd-letter": {
    title: "ESA Letter vs PSD Letter: What's the Difference? | PawTenant",
    description:
      "ESA letter vs PSD letter compared: emotional support animal vs psychiatric service dog, what each covers for housing, the task-training rule, and how to choose.",
  },
  "/can-a-landlord-deny-a-psd-letter": {
    title: "Can a Landlord Deny a PSD Letter? | PawTenant",
    description:
      "Can a landlord deny a psychiatric service dog letter? What a landlord can verify, the limited reasons a request can be denied, and the calm steps to take if it is.",
  },
  "/do-you-need-a-psd-letter-for-a-service-dog": {
    title: "Do You Need a PSD Letter for a Psychiatric Service Dog? | PawTenant",
    description:
      "Do you need a PSD letter for a psychiatric service dog? Service dogs aren't certified by online registries, but documentation from a licensed provider can help in housing.",
  },
  "/are-esa-letters-still-valid-after-hud-change": {
    title: "Are ESA Letters Still Valid After the 2026 HUD Change? | PawTenant",
    description:
      "What the 2026 HUD enforcement change means for emotional support animals in housing — what changed, what didn't, ESA vs trained PSD, and how a licensed, state-aware evaluation can help. Approval is not guaranteed.",
  },
  "/all-about-service-dogs": {
    title: "Psychiatric Service Dog Letter Online 2026 — PSD Letter vs ESA Letter | PawTenant",
    description:
      "Get a psychiatric service dog letter (PSD letter) online from licensed mental health professionals. Learn the difference between a PSD letter and an ESA letter, and find out if you qualify. Fast, legal, HIPAA compliant.",
  },
  "/how-to-get-psd-letter": {
    title: "PSD Letter Guide: Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "How to get a PSD letter (psychiatric service dog) through a licensed provider evaluation. Learn how a PSD differs from an ESA and whether you may qualify.",
  },
  "/about-us": {
    title: "About PawTenant | Our Network of Licensed Professionals",
    description:
      "Meet the network of licensed mental health providers at PawTenant. We prioritize clinical integrity and legal compliance to ensure your ESA is 100% valid in USA.",
  },
  "/no-risk-guarantee": {
    title: "PawTenant No-Risk Guarantee | ESA Letter Refund",
    description:
      "If a licensed provider determines you don't qualify, you get a full refund. Housing-denial refund requests are reviewed under PawTenant's Refund Policy.",
  },
  "/faqs": {
    title: "ESA FAQs 2026: Emotional Support Animal Questions Answered | PawTenant",
    description:
      "Answers to every ESA question — letters, housing rights, college dorms, airline travel, and more. Expert guidance from PawTenant's licensed mental health professionals.",
  },
  "/college-pet-policy": {
    title: "ESA Letter for College Students 2026: Dorm Rights & University Policies | PawTenant",
    description:
      "Get an ESA letter for your college dorm in 2026. Federal law protects your right to keep an ESA in university housing. Same-day letters from licensed professionals at PawTenant.",
  },
  "/airline-pet-policy": {
    title: "Airline ESA & Pet Policy 2026: Can You Fly with an ESA? | PawTenant",
    description:
      "Can you fly with an ESA in 2026? Updated airline ESA policies for Delta, United, American, Southwest & more. Learn about Psychiatric Service Dog (PSD) letter for air travel.",
  },
  "/service-animal-vs-esa": {
    title: "Service Animal vs ESA vs Therapy Dog: Key Differences 2026 | PawTenant",
    description:
      "What's the difference between a service animal, therapy dog, and ESA? Full comparison of legal rights, training, airline access, and housing protections in 2026.",
  },
  "/blog": {
    title: "ESA Letter Blog | Guides, Laws & Tips | PawTenant",
    description:
      "Explore expert guides on ESA letters, emotional support animal laws, and tenant rights. Stay informed with PawTenant's blog, your trusted ESA resource.",
  },
  "/blog/2026-hud-esa-guidelines": {
    title: "2026 HUD ESA Guidelines: Is Your ESA Letter Still Valid?",
    description:
      "HUD's 2026 ESA enforcement memo may change how untrained emotional support animals are handled in federal housing complaints. Learn what changed, what rights may remain, and how PSD documentation differs.",
  },
  // ── California ESA/PSD content cluster — PSD-training blog post ──────────────
  "/blog/how-to-train-psychiatric-service-dog-tasks": {
    title: "How to Train a Psychiatric Service Dog: Recognized Tasks & Requirements",
    description:
      "A step-by-step legal and training guide to Psychiatric Service Dogs under the ADA — what tasks qualify, how self-training legally works, the public-access standard, and what documentation can and can't do.",
  },
  // ── California ESA/PSD content cluster — /states/* regional guides ───────────
  "/states/california-esa-psd-guide": {
    title: "California ESA & PSD Legal Guide: AB 468 & Housing Protections | PawTenant",
    description:
      "California's AB 468 30-day ESA rule, how emotional support animals and Psychiatric Service Dogs differ, what landlords and HOAs can and can't do, and what a compliant ESA or PSD letter needs.",
  },
  "/states/los-angeles-esa-landlord-guide": {
    title: "Los Angeles Landlord ESA Rules: RSO & AB 468 | PawTenant",
    description:
      "How Los Angeles tenant protections — the Rent Stabilization Ordinance and Just Cause Ordinance — layer on top of California's AB 468 ESA requirements, from no-pet policies to pet fees and eviction.",
  },
  "/states/san-francisco-hoa-psd-guide": {
    title: "San Francisco HOA Restrictions & PSD Accommodations | PawTenant",
    description:
      "How the Davis-Stirling Act, FEHA, and the ADA limit San Francisco HOA pet policies — breed bans, weight caps, and fees — when a resident has a task-trained Psychiatric Service Dog.",
  },
  "/states/san-diego-telehealth-guide": {
    title: "San Diego Telehealth ESA Guidelines Under AB 468 | PawTenant",
    description:
      "How California's AB 468 applies to remote ESA evaluations for San Diego residents — California licensure, the 30-day relationship rule, mandatory letter disclosures, and how to verify a provider.",
  },
  // ── Texas ESA/PSD content cluster ───────────────────────────────────────────
  "/states/texas-esa-psd-guide": {
    title: "Texas ESA & PSD Housing Laws: Fair Housing Act & 2026 HUD Shift | PawTenant",
    description:
      "A complete guide to Emotional Support Animals and Psychiatric Service Dogs under Texas and federal law — no state waiting period, the May 2026 HUD enforcement shift, Texas fee exemptions, and misrepresentation penalties.",
  },
  "/blog/texas-service-animal-laws-penalties": {
    title: "Texas Service Animal Laws & Penalties for Misrepresentation | PawTenant",
    description:
      "What Texas law says about service animals vs emotional support animals — the ADA-style task standard, the strengthened HB 4164 misrepresentation penalty (up to $1,000 + community service), and what a business or landlord may ask.",
  },
  // ── Core ESA-letter blog cluster (how-to / what-is / requirements) ──────────
  "/blog/how-to-get-an-esa-letter-online": {
    title: "How to Get an ESA Letter Online in 2026: Step-by-Step Guide",
    description:
      "A step-by-step guide to getting a legitimate ESA letter online in 2026 — who qualifies, the licensed-provider evaluation, cost, timing, your housing rights, and how to avoid scam registries.",
  },
  "/blog/what-is-an-esa-letter": {
    title: "What Is an ESA Letter? 2026 Legal Requirements & Guide",
    description:
      "What an ESA letter is in 2026, what a valid letter must contain, who can write one, and what protections it still gives you after HUD's 2026 enforcement change and under state laws.",
  },
  "/blog/esa-letter-requirements": {
    title: "ESA Letter Requirements: What Must Be Included to Be Valid in 2026",
    description:
      "The 10 elements a valid ESA letter must contain to be accepted by landlords — plus what makes a letter invalid, state-specific rules, and what changed after HUD's 2025–2026 policy shifts.",
  },
  // ── Pet-rent blog cluster ─────────────────────────────────────────────────
  "/blog/pet-rent-explained": {
    title: "Pet Rent Explained: What Renters Should Know About Monthly Pet Fees",
    description:
      "What pet rent is, how it differs from a pet deposit and pet fee, how much it can add up to over time, and how housing-focused ESA documentation fits in.",
  },
  "/blog/apartment-pet-rent-and-esa-letters": {
    title: "Apartment Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How apartment pet rent works, when an approved emotional support animal may not be charged pet fees, and how to make a housing accommodation request the right way.",
  },
  "/blog/pet-deposit-vs-pet-rent": {
    title: "Pet Deposit vs. Pet Rent: What Is the Difference?",
    description:
      "Pet deposit, pet rent, and pet fee compared — what each one is, whether it is refundable, how they add up, and how approved ESA documentation changes the picture.",
  },
  // ── State pet-rent blog cluster ───────────────────────────────────────────
  "/blog/california-pet-rent-and-esa-letters": {
    title: "California Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in California's high-cost rental markets, the state's AB 468 ESA rule, and when an approved emotional support animal may not be charged pet fees.",
  },
  "/blog/new-york-pet-rent-and-esa-letters": {
    title: "New York Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in New York's expensive rental market, co-op and condo board review, and when an approved emotional support animal may not be charged pet fees.",
  },
  "/blog/florida-pet-rent-and-esa-letters": {
    title: "Florida Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Florida apartments and condos, the state's Statute 760.27 ESA rule, and when an approved emotional support animal may not be charged pet fees.",
  },
  "/blog/texas-pet-rent-and-esa-letters": {
    title: "Texas Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Texas apartments and large corporate-managed buildings, and when an approved emotional support animal may not be charged pet fees.",
  },
  "/blog/washington-pet-rent-and-esa-letters": {
    title: "Washington Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Washington's high-cost Seattle-area rental market, the state's assistance-animal protections, and when an approved ESA may not be charged pet fees.",
  },
  "/blog/colorado-pet-rent-and-esa-letters": {
    title: "Colorado Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Colorado's Denver-area rental market, the state's assistance-animal protections, and when an approved ESA may not be charged pet fees.",
  },
  // ── PSD blog cluster ───────────────────────────────────────────────────────
  "/blog/psychiatric-service-dog-letter-explained": {
    title: "Psychiatric Service Dog Letters Explained: What They Are & When They Help",
    description:
      "A plain-English guide to psychiatric service dog (PSD) letters — what they are, who qualifies, how they differ from an ESA, and when the documentation actually helps.",
  },
  "/blog/psd-letter-vs-service-dog-certificate": {
    title: "PSD Letter vs Service Dog Certificate: What's Actually Useful?",
    description:
      "PSD letter vs service dog certificate compared: why online certificates and registrations carry no legal weight, and what documentation from a licensed provider actually does.",
  },
  "/blog/psd-letter-for-anxiety": {
    title: "Can You Get a PSD Letter for Anxiety?",
    description:
      "Can anxiety qualify for a psychiatric service dog letter? It can — but only if it rises to a disability level and your dog performs trained tasks. Here's how it works.",
  },
  "/blog/psychiatric-service-dog-housing-rights": {
    title: "Psychiatric Service Dog Housing Rights: What Renters Should Know",
    description:
      "Psychiatric service dog housing rights explained for renters: Fair Housing Act protections, what a landlord can ask, no pet fees for assistance animals, and how to request.",
  },
  // ── PSD/ESA condition content cluster — anxiety/depression qualification ─────
  "/blog/can-anxiety-qualify-you-for-a-psd": {
    title: "Can Anxiety Qualify You for a Psychiatric Service Dog?",
    description:
      "Anxiety can qualify you for a psychiatric service dog — but only if it rises to a disability and a dog is individually trained to perform tasks. How PSDs differ from ESAs, plus the ADA, housing, and air-travel rules.",
  },
  "/blog/can-depression-qualify-psychiatric-service-dog": {
    title: "Can Depression Qualify You for a Psychiatric Service Dog?",
    description:
      "Depression can qualify you for a psychiatric service dog when it rises to a disability and a dog is individually trained to perform tasks. Trained-task examples, the ADA standard, documentation, housing, and travel.",
  },
  "/blog/can-depression-qualify-you-for-an-esa": {
    title: "Can Depression Qualify You for an ESA?",
    description:
      "Depression can qualify you for an emotional support animal when a licensed professional confirms it substantially limits a major life activity. Qualifying symptoms, ESA letter requirements, ESA vs service animal, and HUD's May 2026 change.",
  },
  // ── Travel-anxiety / major-event ESA content cluster ───────────────────────
  "/travel-anxiety-esa-letter": {
    title: "ESA Letters for Travel Anxiety & Temporary Housing | PawTenant",
    description:
      "Travel anxiety, crowded airports, and temporary housing during busy travel seasons can be hard. Learn how an emotional support animal may help emotionally — and what an ESA letter can and cannot do.",
  },
  "/blog/emotional-support-animal-travel-anxiety": {
    title: "Can an Emotional Support Animal Help With Travel Anxiety? | PawTenant",
    description:
      "How an emotional support animal may ease travel anxiety on flights, road trips, and in crowds — plus the legal limits: ESAs center on housing, not airline or stadium access.",
  },
  "/blog/temporary-housing-emotional-support-animal": {
    title: "ESA in Temporary Housing & Extended Stays: What to Know | PawTenant",
    description:
      "Can you have an emotional support animal in temporary housing, extended stays, or short-term rentals? What the Fair Housing Act covers, how landlord policies differ, and the documentation basics.",
  },
  "/blog/crowds-travel-stress-emotional-support-animal": {
    title: "Crowds, Travel Stress & Emotional Support Animals | PawTenant",
    description:
      "Crowded airports, packed public transport, and sensory overload can overwhelm anyone. How an emotional support animal may help you stay grounded — and why an ESA is not public-venue access.",
  },
  "/contact-us": {
    title: "Contact PawTenant | ESA Letter Support — Email & Phone Help",
    description:
      "Contact PawTenant for ESA letter support. Call (409) 965-5885, email hello@pawtenant.com, or use our form. Mon–Fri 7am–6pm CT. Same-day ESA letter help from licensed professionals.",
  },
  "/renew-esa-letter": {
    title: "Renew Your ESA Letter in 2026 — Fast & FHA-Compliant | PawTenant",
    description:
      "ESA letters expire after 12 months. Renew your emotional support animal letter with a licensed therapist in 2026. Fast delivery and a refund if you don't qualify. From $115.",
  },
  "/join-our-network": {
    title: "Join PawTenant's Licensed Provider Network | PawTenant",
    description:
      "Apply to join PawTenant's network of licensed mental health providers reviewing ESA and PSD documentation requests. Flexible case acceptance, structured intake, and full admin support.",
  },
  "/psd-assessment": {
    title: "Psychiatric Service Dog Letter Online — ADA Compliant PSD Letter | PawTenant",
    description:
      "Get a legitimate Psychiatric Service Dog (PSD) letter from a licensed mental health professional. ADA compliant, HIPAA secure, delivered within 24 hours. Start your free PSD assessment.",
  },
  "/resource-center": {
    title: "ESA & PSD Resource Center 2026 — Complete Guide Hub | PawTenant",
    description:
      "PawTenant's complete ESA and PSD resource hub — guides, state-specific laws, blog posts, housing rights, travel policies, and mental health resources. Everything you need to know about ESA letters and PSD letters in 2026.",
  },
  "/esa-letter-verification": {
    title: "ESA Letter Verification for Landlords | PawTenant",
    description:
      "Landlords and property managers: verify a PawTenant ESA letter in seconds. Privacy-safe verification confirms provider license status without exposing medical information.",
  },
  "/sitemap": {
    title: "Sitemap | PawTenant",
    description:
      "Full sitemap of PawTenant — browse ESA letter guides, state pages, housing rights, PSD resources, blog posts, and more.",
  },
  "/everything-you-need-to-know-about-obtaining-an-esa-letter-online": {
    title: "Everything You Need to Know About Obtaining an ESA Letter Online | PawTenant",
    description:
      "The complete 2026 guide to obtaining a legitimate ESA letter online. Learn who qualifies, how online evaluations work with licensed mental health professionals, what makes a letter housing-valid, and how to spot sketchy ESA websites.",
  },
  "/privacy-policy": {
    title: "Privacy Policy | PawTenant",
    description:
      "Read PawTenant's privacy policy. We protect your personal health information under HIPAA and explain how we collect, use, and safeguard your data.",
  },
  "/terms-of-use": {
    title: "Terms of Use | PawTenant",
    description:
      "PawTenant's terms of use. Understand the terms and conditions that apply when using our ESA letter services and website.",
  },
  "/refund-policy": {
    title: "Refund Policy | PawTenant",
    description:
      "PawTenant's Refund Policy: a full refund if a licensed provider determines you don't qualify, plus an evidence-based review for housing-denial claims. Read the full terms.",
  },
};

// ── Per-state ESA letter meta (copied from state-esa/page.tsx) ───────────────
// Each state page canonical: /esa-letter/:state
export const ESA_STATE_META: Record<string, SEOEntry> = {
  alabama: {
    title: "ESA Letter Alabama | Licensed LMHP | PawTenant",
    description:
      "Get a legitimate ESA letter in Alabama from a state-licensed mental health professional. Protect your housing rights under the Fair Housing Act.",
  },
  alaska: {
    title: "ESA Letter Alaska | Valid for Housing | PawTenant",
    description:
      "Need an ESA letter in Alaska? Connect with a licensed LMHP and receive valid ESA documentation for housing. HIPAA-secure, fully compliant with Alaska law.",
  },
  arizona: {
    title: "ESA Letter Arizona | Licensed Professionals | PawTenant",
    description:
      "Get a legitimate ESA letter in Arizona. Our licensed mental health professionals evaluate your needs and issue housing-compliant ESA documentation fast.",
  },
  arkansas: {
    title: "ESA Letter Arkansas | 30-Day Rule Explained | PawTenant",
    description:
      "Arkansas requires a 30-day provider relationship before an ESA letter can be issued. PawTenant connects you with licensed Arkansas LMHPs.",
  },
  california: {
    title: "ESA Letter California | CA-Licensed Therapists | PawTenant",
    description:
      "Get a legitimate ESA letter in California from a state-licensed therapist. California law requires a 30-day relationship. PawTenant ensures full compliance.",
  },
  colorado: {
    title: "ESA Letter Colorado | Valid for Housing | PawTenant",
    description:
      "Get a legitimate ESA letter in Colorado from a licensed mental health professional. No waiting period. Housing-compliant documentation delivered digitally.",
  },
  connecticut: {
    title: "ESA Letter Connecticut | Licensed LMHP | PawTenant",
    description:
      "Need an ESA letter in Connecticut? PawTenant connects you with state-licensed professionals for a proper evaluation. Receive valid ESA letter fast.",
  },
  delaware: {
    title: "ESA Letter Delaware | Housing-Compliant | PawTenant",
    description:
      "Get your ESA letter in Delaware from a licensed mental health professional. PawTenant ensures your documentation is FHA-compliant.",
  },
  florida: {
    title: "ESA Letter Florida | Legitimate & Legal | PawTenant",
    description:
      "Get a legitimate ESA letter in Florida from a an LMHP. Florida penalizes fake ESA letters. PawTenant ensures every letter is issued through a proper evaluation.",
  },
  georgia: {
    title: "ESA Letter Georgia | Licensed Therapists | PawTenant",
    description:
      "Need an ESA letter in Georgia? Connect with a state-licensed mental health professional through PawTenant. Valid for housing under the Fair Housing Act.",
  },
  hawaii: {
    title: "ESA Letter Hawaii | Valid Housing Documentation | PawTenant",
    description:
      "Get a legitimate ESA letter in Hawaii from a licensed LMHP. PawTenant provides housing-compliant ESA documentation valid across all Hawaii housing types.",
  },
  idaho: {
    title: "ESA Letter Idaho | Licensed Professionals | PawTenant",
    description:
      "Receive your ESA letter in Idaho from a state-licensed mental health professional. PawTenant ensures full FHA compliance so landlord recognizes your letter.",
  },
  illinois: {
    title: "ESA Letter Illinois | Verify Your LMHP | PawTenant",
    description:
      "landlords may verify your LMHP's license before accepting an ESA letter in Illinois. PawTenant only works with fully verifiable, state-licensed professionals.",
  },
  indiana: {
    title: "ESA Letter Indiana | Fast & Compliant | PawTenant",
    description:
      "Get ESA letter in Indiana from a licensed mental health professional. PawTenant's process is fast, HIPAA-secure, and fully compliant with Indiana housing law.",
  },
  iowa: {
    title: "ESA Letter Iowa | 30-Day Rule | Licensed LMHP | PawTenant",
    description:
      "Iowa requires a 30-day relationship with your LMHP before issuing an ESA letter. PawTenant helps you start the process early so it takes short time.",
  },
  kansas: {
    title: "ESA Letter Kansas | Housing Rights | PawTenant",
    description:
      "Get a legitimate ESA letter in Kansas from a licensed professional. PawTenant ensures your ESA documentation protects your housing rights.",
  },
  kentucky: {
    title: "ESA Letter Kentucky | Licensed & Legitimate | PawTenant",
    description:
      "Need an ESA letter in Kentucky? PawTenant connects you with a state-licensed LMHP for a thorough evaluation and delivers your ESA letter digitally.",
  },
  louisiana: {
    title: "ESA Letter Louisiana | Protect Your Housing Rights | PawTenant",
    description:
      "Get a legitimate ESA letter in Louisiana. PawTenant works with licensed Louisiana mental health professionals to issue FHA-compliant documentation.",
  },
  maine: {
    title: "ESA Letter Maine | Valid for Housing | PawTenant",
    description:
      "Get your ESA letter in Maine from a licensed mental health professional. PawTenant ensures your letter meets FHA standards so landlords accept it statewide.",
  },
  maryland: {
    title: "ESA Letter Maryland | Licensed Therapists | PawTenant",
    description:
      "Get your ESA letter in Maryland from a state-licensed LMHP. PawTenant's housing-compliant ESA letter protects you from unfair pet fees and no-pet policies.",
  },
  massachusetts: {
    title: "ESA Letter Massachusetts | Legitimate & Fast | PawTenant",
    description:
      "Need an ESA letter in Massachusetts? PawTenant connects you with licensed MA mental health professionals for a compliant evaluation.",
  },
  michigan: {
    title: "ESA Letter Michigan | Licensed LMHP | PawTenant",
    description:
      "Get a legitimate ESA letter in Michigan from an LMHP. PawTenant provides fast, housing-compliant ESA documentation valid across all of Michigan.",
  },
  minnesota: {
    title: "ESA Letter Minnesota | Housing Compliant | PawTenant",
    description:
      "Receive a legitimate ESA letter in Minnesota from a state-licensed LMHP. PawTenant ensures full compliance with FHA so your ESA letter is accepted easily.",
  },
  mississippi: {
    title: "ESA Letter Mississippi | Valid for Housing | PawTenant",
    description:
      "Get your ESA letter in Mississippi from a licensed mental health professional. PawTenant delivers HIPAA-secure, FHA-compliant documentation. Apply online.",
  },
  missouri: {
    title: "ESA Letter Missouri | Licensed Professionals | PawTenant",
    description:
      "Need an ESA letter in Missouri? PawTenant connects you with state-licensed LMHPs for evaluation and fast digital delivery. Housing-compliant and FHA-valid.",
  },
  montana: {
    title: "ESA Letter Montana | Legitimate & Compliant | PawTenant",
    description:
      "Get a legitimate ESA letter in Montana from a licensed LMHP. PawTenant ensures your letter protects your housing rights under the Fair Housing Act statewide.",
  },
  nebraska: {
    title: "ESA Letter Nebraska | Housing Rights | PawTenant",
    description:
      "Receive a legitimate ESA letter in Nebraska from a licensed professional. PawTenant's process is compliant with Nebraska and federal housing requirements.",
  },
  nevada: {
    title: "ESA Letter Nevada | Licensed LMHP | PawTenant",
    description:
      "Get your ESA letter in Nevada from a state-licensed mental health professional. PawTenant ensures FHA-compliant letter so landlords accept it easily.",
  },
  "new-hampshire": {
    title: "ESA Letter New Hampshire | Fast & Legitimate | PawTenant",
    description:
      "Need an ESA letter in New Hampshire? PawTenant connects you with a licensed NH LMHP for a proper evaluation. Receive ESA letter within 24–48 hours.",
  },
  "new-jersey": {
    title: "ESA Letter New Jersey | Verify Your Provider | PawTenant",
    description:
      "Landlords may verify your provider's license before accepting an ESA letter in New Jersey. PawTenant only uses verifiable, state-licensed NJ professionals.",
  },
  "new-mexico": {
    title: "ESA Letter New Mexico | Licensed Therapists | PawTenant",
    description:
      "Get a legitimate ESA letter in New Mexico from an LMHP. PawTenant provides housing-compliant ESA letter that protects your rights as a tenant in NM.",
  },
  "new-york": {
    title: "ESA Letter New York | Licensed NY Therapist | PawTenant",
    description:
      "New York landlords are encouraged to verify LMHP license status. PawTenant works only with verifiable NY-licensed professionals. Get your ESA letter today.",
  },
  "north-carolina": {
    title: "ESA Letter North Carolina | Housing Compliant | PawTenant",
    description:
      "Get a legitimate ESA letter in North Carolina from an LMHP. PawTenant ensures FHA-compliant documentation so you can live with your ESA easily.",
  },
  "north-dakota": {
    title: "ESA Letter North Dakota | Legitimate & Fast | PawTenant",
    description:
      "Receive a legitimate ESA letter in North Dakota from a licensed mental health professional. PawTenant delivers housing-compliant ESA letter. Apply now.",
  },
  ohio: {
    title: "ESA Letter Ohio | Licensed LMHP | PawTenant",
    description:
      "Get your ESA letter in Ohio from a state-licensed LMHP. PawTenant ensures your letter is FHA-compliant and accepted by Ohio landlords. Apply today.",
  },
  oklahoma: {
    title: "ESA Letter Oklahoma | Valid for Housing | PawTenant",
    description:
      "Get a legitimate ESA letter in Oklahoma from a licensed LMHP. PawTenant follows FHA and Oklahoma law to issue ESA letter. Apply online in minutes.",
  },
  oregon: {
    title: "ESA Letter Oregon | Licensed Professionals | PawTenant",
    description:
      "Need an ESA letter in Oregon? PawTenant connects you with a state-licensed LMHP for a proper evaluation. Receive valid, FHA-compliant ESA documentation.",
  },
  pennsylvania: {
    title: "ESA Letter Pennsylvania | Licensed Therapists | PawTenant",
    description:
      "Get a legitimate ESA letter in Pennsylvania from an LMHP. PawTenant delivers housing-compliant documentation accepted by PA landlords. Apply now.",
  },
  "rhode-island": {
    title: "ESA Letter Rhode Island | Fast & Compliant | PawTenant",
    description:
      "Receive your ESA letter in Rhode Island from a state-licensed LMHP. PawTenant ensures fully compliant ESA letter that protects your housing rights in RI.",
  },
  "south-carolina": {
    title: "ESA Letter South Carolina | Housing Rights | PawTenant",
    description:
      "Get a legitimate ESA letter in South Carolina from a licensed mental health professional. PawTenant ensures FHA-compliant documentation.",
  },
  "south-dakota": {
    title: "ESA Letter South Dakota | Licensed LMHP | PawTenant",
    description:
      "Need an ESA letter in South Dakota? PawTenant connects you with a licensed SD professional for a proper evaluation. Apply now.",
  },
  tennessee: {
    title: "ESA Letter Tennessee | Legitimate & Legal | PawTenant",
    description:
      "Get a legitimate ESA letter in Tennessee from a licensed LMHP. PawTenant ensures your letter meets FHA standards so you can live with your ESA easily.",
  },
  texas: {
    title: "ESA Letter Texas | TX-Licensed Professionals | PawTenant",
    description:
      "Get a legitimate ESA letter in Texas from a state-licensed mental health professional. No waiting period in TX. Housing-compliant and digitally delivered.",
  },
  utah: {
    title: "ESA Letter Utah | Valid for Housing | PawTenant",
    description:
      "Receive a legitimate ESA letter in Utah from a licensed LMHP. PawTenant ensures your documentation is fully FHA-compliant and accepted by Utah landlords.",
  },
  vermont: {
    title: "ESA Letter Vermont | Licensed & Compliant | PawTenant",
    description:
      "Get your ESA letter in Vermont from a state-licensed mental health professional. PawTenant delivers ESA documentation fast and securely. Apply today.",
  },
  virginia: {
    title: "ESA Letter Virginia | Licensed Therapists | PawTenant",
    description:
      "Need an ESA letter in Virginia? PawTenant connects you with a licensed VA LMHP. Receive valid, FHA-compliant ESA documentation within 24–48 hours.",
  },
  washington: {
    title: "ESA Letter Washington State | Licensed LMHP | PawTenant",
    description:
      "Get a legitimate ESA letter in Washington State. PawTenant works with licensed WA mental health professionals to issue FHA-compliant documentation.",
  },
  "washington-dc": {
    title: "ESA Letter Washington DC | Housing Compliant | PawTenant",
    description:
      "Get a legitimate ESA letter in Washington DC from a licensed LMHP. PawTenant ensures full FHA compliance so your ESA letter is accepted easily. Apply now.",
  },
  "west-virginia": {
    title: "ESA Letter West Virginia | Fast & Legitimate | PawTenant",
    description:
      "Receive your ESA letter in West Virginia from a licensed LMHP. PawTenant ensures FHA-compliant ESA documentation delivered digitally. Apply today.",
  },
  wisconsin: {
    title: "ESA Letter Wisconsin | Licensed Professionals | PawTenant",
    description:
      "Get a legitimate ESA letter in Wisconsin from a licensed LMHP. PawTenant delivers fast, housing-compliant ESA letter accepted statewide. Apply now.",
  },
  wyoming: {
    title: "ESA Letter Wyoming | Valid for Housing | PawTenant",
    description:
      "Need an ESA letter in Wyoming? PawTenant connects you with a state-licensed professional for a proper evaluation. FHA-compliant ESA letter delivered fast.",
  },
};

// ── PSD state meta: formulaic per state (matches state-psd/page.tsx logic) ───
// Human-readable state name lookup (from ESA slug list) for PSD title format.
const STATE_DISPLAY_NAMES: Record<string, string> = {
  alabama: "Alabama",
  alaska: "Alaska",
  arizona: "Arizona",
  arkansas: "Arkansas",
  california: "California",
  colorado: "Colorado",
  connecticut: "Connecticut",
  delaware: "Delaware",
  florida: "Florida",
  georgia: "Georgia",
  hawaii: "Hawaii",
  idaho: "Idaho",
  illinois: "Illinois",
  indiana: "Indiana",
  iowa: "Iowa",
  kansas: "Kansas",
  kentucky: "Kentucky",
  louisiana: "Louisiana",
  maine: "Maine",
  maryland: "Maryland",
  massachusetts: "Massachusetts",
  michigan: "Michigan",
  minnesota: "Minnesota",
  mississippi: "Mississippi",
  missouri: "Missouri",
  montana: "Montana",
  nebraska: "Nebraska",
  nevada: "Nevada",
  "new-hampshire": "New Hampshire",
  "new-jersey": "New Jersey",
  "new-mexico": "New Mexico",
  "new-york": "New York",
  "north-carolina": "North Carolina",
  "north-dakota": "North Dakota",
  ohio: "Ohio",
  oklahoma: "Oklahoma",
  oregon: "Oregon",
  pennsylvania: "Pennsylvania",
  "rhode-island": "Rhode Island",
  "south-carolina": "South Carolina",
  "south-dakota": "South Dakota",
  tennessee: "Tennessee",
  texas: "Texas",
  utah: "Utah",
  vermont: "Vermont",
  virginia: "Virginia",
  washington: "Washington",
  "washington-dc": "Washington DC",
  "west-virginia": "West Virginia",
  wisconsin: "Wisconsin",
  wyoming: "Wyoming",
};

// Differentiated prerender meta for the feature PSD states. Each carries a
// state-specific hook so the static <head> is unique per page. Compliance: no
// "guaranteed", "instant", "certified/registered", "same-day", or "100%
// money-back" language — a PSD letter documents a licensed provider evaluation.
const PSD_STATE_META_OVERRIDES: Record<string, SEOEntry> = {
  california: {
    title: "PSD Letter in California | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in California via a licensed provider evaluation. How a PSD differs from an ESA, Unruh Act & FEHA context, refund if you don't qualify.",
  },
  texas: {
    title: "PSD Letter in Texas | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Texas via a licensed provider evaluation. How a PSD differs from an ESA, why TX penalizes fake service animals, refund if you don't qualify.",
  },
  florida: {
    title: "PSD Letter in Florida | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Florida via a licensed provider evaluation. PSD vs ESA, Statute 413.08 & 760.27 context, refund if you don't qualify.",
  },
  "new-york": {
    title: "PSD Letter in New York | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in New York via a licensed provider evaluation. PSD vs ESA, NYS & NYC Human Rights Law context, refund if you don't qualify.",
  },
  "north-carolina": {
    title: "PSD Letter in North Carolina | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in North Carolina via a licensed provider evaluation. PSD vs ESA, NC service-animal law context, refund if you don't qualify.",
  },
  pennsylvania: {
    title: "PSD Letter in Pennsylvania | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Pennsylvania via a licensed provider evaluation. PSD vs ESA, PA Human Relations Act context, refund if you don't qualify.",
  },
  ohio: {
    title: "PSD Letter in Ohio | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Ohio via a licensed provider evaluation. PSD vs ESA, Ohio Civil Rights Act context, refund if you don't qualify.",
  },
  georgia: {
    title: "PSD Letter in Georgia | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Georgia via a licensed provider evaluation. How a PSD differs from an ESA and what the letter can and can't do. Refund if you don't qualify.",
  },
  illinois: {
    title: "PSD Letter in Illinois | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Illinois via a licensed provider evaluation. PSD vs ESA, Illinois Human Rights Act context, refund if you don't qualify.",
  },
  arizona: {
    title: "PSD Letter in Arizona | Psychiatric Service Dog Evaluation | PawTenant",
    description:
      "Psychiatric Service Dog (PSD) documentation in Arizona via a licensed provider evaluation. PSD vs ESA, why AZ penalizes fake service animals, refund if you don't qualify.",
  },
};

function buildPSDEntry(slug: string): SEOEntry | null {
  if (PSD_STATE_META_OVERRIDES[slug]) return PSD_STATE_META_OVERRIDES[slug];
  const name = STATE_DISPLAY_NAMES[slug];
  if (!name) return null;
  return {
    title: `PSD Letter in ${name} | Psychiatric Service Dog Evaluation | PawTenant`,
    description: `Psychiatric Service Dog (PSD) documentation in ${name} through a licensed provider evaluation. Learn how a PSD differs from an ESA and what the letter can and can't do. Refund if you don't qualify.`,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function extractSegment(pathname: string, prefix: string): string | null {
  const normalized = normalizePath(pathname);
  if (!normalized.startsWith(prefix)) return null;
  const tail = normalized.slice(prefix.length).replace(/^\/+/, "");
  if (!tail || tail.includes("/")) return null;
  return tail.toLowerCase();
}

/**
 * Resolve the SEO entry for a pathname. Returns null if the pathname is a
 * dynamic route not covered here (page component should set its own).
 */
export function getSEO(pathname: string): SEOEntry | null {
  const path = normalizePath(pathname);

  if (CORE_PAGE_META[path]) return CORE_PAGE_META[path];

  const esaSlug = extractSegment(path, "/esa-letter");
  if (esaSlug && ESA_STATE_META[esaSlug]) return ESA_STATE_META[esaSlug];

  const psdSlug = extractSegment(path, "/psd-letter");
  if (psdSlug) return buildPSDEntry(psdSlug);

  return null;
}

/**
 * Build a self-referencing canonical URL for a pathname.
 * Normalizes trailing slash and always uses the production BASE_URL.
 */
export function buildCanonical(pathname: string): string {
  return `${BASE_URL}${normalizePath(pathname)}`;
}
