/**
 * statePetRentBlogs.ts — per-state config for the state pet-rent blog cluster
 * rendered by <StatePetRentBlog>. Plain data (no JSX) so it stays a .ts file.
 *
 * Compliance: estimate-only; pet-rent ranges are general estimates; ESA framed
 * as housing-focused with outcomes decided individually and never guaranteed;
 * ESA and PSD kept separate. State-law notes are general educational context,
 * not legal advice.
 */

import type { StatePetRentBlogConfig } from "../components/feature/StatePetRentBlog";

const COMMON_KEEP_READING = [
  { to: "/pet-rent-savings-calculator", icon: "ri-calculator-line", label: "Pet rent savings calculator" },
  { to: "/blog/apartment-pet-rent-and-esa-letters", icon: "ri-building-line", label: "Apartment pet rent & ESA letters" },
  { to: "/esa-pet-rent-deposit", icon: "ri-money-dollar-circle-line", label: "ESA pet rent & deposits" },
  { to: "/esa-letter-for-apartments", icon: "ri-home-heart-line", label: "ESA letter for apartments" },
  { to: "/blog/pet-deposit-vs-pet-rent", icon: "ri-scales-3-line", label: "Pet deposit vs. pet rent" },
  { to: "/esa-letter-cost", icon: "ri-price-tag-3-line", label: "ESA letter cost" },
];

export const statePetRentBlogs: Record<string, StatePetRentBlogConfig> = {
  "california-pet-rent-and-esa-letters": {
    slug: "california-pet-rent-and-esa-letters",
    state: "California",
    title: "California Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in California's high-cost rental markets, the state's AB 468 ESA rule, and when an approved emotional support animal may not be charged pet fees.",
    heroImgPath: "/assets/lifestyle/esa-golden-retriever-home.jpg",
    heroAlt: "A renter at home in California with their emotional support dog",
    readMins: 7,
    keywords:
      "california pet rent, california pet rent esa, pet rent los angeles, pet rent san francisco, esa letter california pet rent, AB 468 esa, california emotional support animal pet rent",
    chips: ["California", "Pet Rent", "AB 468", "ESA Housing"],
    summary: [
      "High rents: California's priciest metros — Los Angeles, San Francisco, and San Diego — also tend to have higher pet rent.",
      "Pet rent adds up: even modest monthly pet rent can total thousands over a multi-year California lease.",
      "AB 468: California requires a 30-day client-provider relationship before an ESA letter can be issued.",
      "Approved ESAs: an approved emotional support animal is generally not charged pet rent or deposits — decided individually, never guaranteed.",
    ],
    intro:
      "California has some of the highest rents in the country, and pet rent often rides on top. This guide explains how pet rent works in California's rental markets, the state's specific ESA rule (AB 468), and when an approved emotional support animal may not be charged pet-specific fees.",
    rentHeading: "Pet rent in California's rental markets",
    rentParas: [
      "Across high-cost California metros — Los Angeles, San Francisco, San Diego, San Jose, and Sacramento — many properties charge monthly pet rent on top of an already high base rent, sometimes per pet, and often alongside a one-time pet deposit or non-refundable pet fee. Over a multi-year lease, the monthly portion is usually the largest pet-related cost.",
      "Because California rents are high, the dollar impact of pet rent tends to be larger here than in lower-cost states — which is exactly why it is worth estimating before you sign.",
    ],
    lawHeading: "California's ESA rule: AB 468 and housing protections",
    lawParas: [
      "California adds its own requirements on top of the federal Fair Housing Act. Under AB 468, a provider must have an established client-provider relationship of at least 30 days before issuing an ESA letter, and the letter must come from a mental health professional licensed in California. The law is designed to ensure letters reflect a genuine evaluation rather than an instant online purchase.",
      "California's Fair Employment and Housing Act (FEHA) also protects assistance animals in housing. When a reasonable-accommodation request is approved, an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees — but each request is reviewed individually, and a letter does not guarantee approval or a fee waiver.",
    ],
    stateLinks: [
      { to: "/california-esa-letter-for-apartments", icon: "ri-building-line", label: "California ESA letter for apartments", desc: "How apartment ESA housing requests work in California." },
      { to: "/esa-letter/california", icon: "ri-map-pin-line", label: "California ESA letter", desc: "California ESA documentation overview and state rules." },
      { to: "/california-esa-letter-30-day-rule", icon: "ri-calendar-check-line", label: "California 30-day rule (AB 468)", desc: "Why California requires a 30-day provider relationship." },
    ],
    faqs: [
      {
        q: "Does an approved ESA pay pet rent in California?",
        a: "Generally not. Under California's FEHA and the federal Fair Housing Act, an approved emotional support animal is usually not treated as a pet, so pet rent, pet deposits, and pet fees typically do not apply once a reasonable-accommodation request is approved. The decision is made individually by the housing provider, and a letter does not guarantee approval or a fee waiver.",
      },
      {
        q: "What is California's AB 468 rule for ESA letters?",
        a: "AB 468 requires that a California ESA letter come from a mental health professional licensed in California who has held a client-provider relationship of at least 30 days before issuing the letter. The law is meant to ensure the letter reflects a genuine evaluation. Plan ahead, because the 30-day requirement can extend the timeline.",
      },
      {
        q: "How much is pet rent in Los Angeles or San Francisco?",
        a: "It varies widely by building, but monthly pet rent in high-cost California metros commonly falls somewhere in the tens of dollars per pet, sometimes more, and is often charged alongside a one-time deposit or fee. Because base rents are high, the total pet-related cost over a lease can be significant. Our pet rent savings calculator estimates the 1, 2, and 5-year totals — the figures are estimates only.",
      },
      {
        q: "Can a California landlord charge a pet deposit for an emotional support animal?",
        a: "For an ordinary pet, yes, subject to California's security-deposit limits. For an approved assistance animal, pet-specific deposits and fees generally do not apply once an accommodation request is approved. You can still be held responsible for any actual damage the animal causes.",
      },
      {
        q: "Do I need a California-licensed provider for my ESA letter?",
        a: "Yes. To comply with California law, your ESA letter should come from a mental health professional licensed in California, and AB 468 adds the 30-day relationship requirement. Using an in-state, licensed provider is what makes the documentation appropriate for a California housing request.",
      },
    ],
    keepReading: COMMON_KEEP_READING,
  },

  "new-york-pet-rent-and-esa-letters": {
    slug: "new-york-pet-rent-and-esa-letters",
    state: "New York",
    title: "New York Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in New York's expensive rental market, co-op and condo board review, and when an approved emotional support animal may not be charged pet fees.",
    heroImgPath: "/assets/lifestyle/esa-cat-apartment-window.jpg",
    heroAlt: "An emotional support cat by the window of a New York apartment",
    readMins: 7,
    keywords:
      "new york pet rent, nyc pet rent, pet rent esa new york, esa letter new york pet rent, co-op esa pet rent, new york emotional support animal pet rent",
    chips: ["New York", "Pet Rent", "Co-ops & Condos", "ESA Housing"],
    summary: [
      "High rents: New York City has some of the highest rents in the country, so pet charges sting more here.",
      "Co-ops & condos: many NYC buildings route accommodation requests through a managing agent or board.",
      "Strong laws: NYS and NYC Human Rights Laws add protections on top of the federal Fair Housing Act.",
      "Approved ESAs: an approved emotional support animal is generally not charged pet rent or deposits — decided individually, never guaranteed.",
    ],
    intro:
      "New York renters face some of the highest housing costs in the country, and pet rent or pet fees can add to the squeeze. This guide explains how pet rent works in New York, how co-op and condo review affects accommodation requests, and when an approved emotional support animal may not be charged those fees.",
    rentHeading: "Pet rent in New York's rental market",
    rentParas: [
      "In New York City and other high-cost areas, properties commonly charge monthly pet rent, a one-time pet fee, or a pet deposit — sometimes per pet. In larger buildings, co-ops, and condos, pet policies may also be set by a board or managing agent. Because base rents are high, the cumulative pet-related cost over a lease can be substantial.",
      "The monthly pet-rent portion is usually the largest pet cost over time, which is why it is worth estimating before you commit to a lease.",
    ],
    lawHeading: "New York's housing protections and board review",
    lawParas: [
      "New York layers the New York State Human Rights Law and, in the city, the New York City Human Rights Law on top of the federal Fair Housing Act — and these state and local protections are often read broadly. An ESA letter should come from a provider licensed in New York and be verifiable.",
      "Many co-ops, condos, and rent-stabilized buildings route accommodation requests through a managing agent or board. When a reasonable-accommodation request is approved, an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees — but each request is reviewed individually, and a letter does not guarantee approval or a fee waiver.",
    ],
    stateLinks: [
      { to: "/new-york-esa-letter-for-apartments", icon: "ri-building-line", label: "New York ESA letter for apartments", desc: "Apartment, co-op, and condo ESA requests in New York." },
      { to: "/esa-letter/new-york", icon: "ri-map-pin-line", label: "New York ESA letter", desc: "New York ESA documentation overview and state rules." },
    ],
    faqs: [
      {
        q: "Does an approved ESA pay pet rent in New York?",
        a: "Generally not. Under the New York State and New York City Human Rights Laws and the federal Fair Housing Act, an approved emotional support animal is usually not treated as a pet, so pet rent, pet deposits, and pet fees typically do not apply once a reasonable-accommodation request is approved. The decision is made individually, and a letter does not guarantee approval or a fee waiver.",
      },
      {
        q: "How do co-op and condo boards handle ESA requests in NYC?",
        a: "Many co-ops, condos, and larger rental buildings route reasonable-accommodation requests through a managing agent or board. The board must still consider a valid request under fair housing law, but the review can take longer. A clearly verifiable ESA letter from a New York-licensed provider helps the process move smoothly.",
      },
      {
        q: "How much is pet rent in New York City?",
        a: "It varies by building, but monthly pet rent in NYC commonly runs in the tens of dollars per pet, sometimes more, and may be charged alongside a one-time fee or deposit. Because base rents are high, the total pet-related cost over a lease can be significant. Our pet rent savings calculator estimates the totals — the figures are estimates only.",
      },
      {
        q: "Can a New York landlord charge a pet deposit for an emotional support animal?",
        a: "For an ordinary pet, a property may charge a pet deposit or fee, subject to New York's deposit rules. For an approved assistance animal, those pet-specific charges generally do not apply once an accommodation request is approved. You remain responsible for any actual damage the animal causes.",
      },
      {
        q: "Do I need a New York-licensed provider for my ESA letter?",
        a: "Yes. Your ESA letter should come from a mental health professional licensed in New York and should be verifiable. An in-state, licensed provider is what makes the documentation appropriate for a New York housing request, including co-op and condo board review.",
      },
    ],
    keepReading: COMMON_KEEP_READING,
  },

  "florida-pet-rent-and-esa-letters": {
    slug: "florida-pet-rent-and-esa-letters",
    state: "Florida",
    title: "Florida Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Florida apartments and condos, the state's Statute 760.27 ESA rule, and when an approved emotional support animal may not be charged pet fees.",
    heroImgPath: "/assets/lifestyle/esa-owner-hugging-dog-home.jpg",
    heroAlt: "A renter hugging their emotional support dog at home in Florida",
    readMins: 7,
    keywords:
      "florida pet rent, pet rent esa florida, esa letter florida pet rent, florida 760.27 esa, condo pet rent florida, florida emotional support animal pet rent",
    chips: ["Florida", "Pet Rent", "Statute 760.27", "Condos & HOAs"],
    summary: [
      "Growing markets: Miami, Orlando, Tampa, and Jacksonville have seen rising rents and pet charges.",
      "Condos & HOAs: many Florida communities route pet and accommodation rules through a board.",
      "Statute 760.27: Florida requires information from a licensed practitioner with personal knowledge of the need.",
      "Approved ESAs: an approved emotional support animal is generally not charged pet rent or deposits — decided individually, never guaranteed.",
    ],
    intro:
      "Florida's rental and condo markets have grown fast, and pet rent and pet fees have come along with them. This guide explains how pet rent works in Florida, the state's specific ESA documentation rule (Statute 760.27), and when an approved emotional support animal may not be charged those fees.",
    rentHeading: "Pet rent in Florida apartments and condos",
    rentParas: [
      "In Miami, Orlando, Tampa, Jacksonville, and other growing Florida markets, apartments commonly charge monthly pet rent plus a one-time pet fee or deposit, sometimes per pet. In condos and HOA communities, pet rules and fees may also be set by a board or association. Over a multi-year lease, the recurring monthly portion is usually the largest pet-related cost.",
      "Because Florida rents have risen in recent years, the cumulative impact of pet rent can be meaningful — worth estimating before you sign.",
    ],
    lawHeading: "Florida's ESA rule: Statute 760.27",
    lawParas: [
      "Florida adds its own requirements on top of the federal Fair Housing Act. Under Florida Statute 760.27, supporting information for an ESA should come from a health care practitioner who has personal knowledge of the person's disability-related need — not an internet-only questionnaire site. The letter should come from a provider licensed in Florida.",
      "When a reasonable-accommodation request is approved, an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees — including in many condo and HOA settings. Each request is reviewed individually, however, and a letter does not guarantee approval or a fee waiver.",
    ],
    stateLinks: [
      { to: "/florida-esa-letter-for-apartments", icon: "ri-building-line", label: "Florida ESA letter for apartments", desc: "Apartment and condo ESA requests in Florida." },
      { to: "/esa-letter/florida", icon: "ri-map-pin-line", label: "Florida ESA letter", desc: "Florida ESA documentation overview and state rules." },
      { to: "/florida-esa-letter-housing-rules", icon: "ri-government-line", label: "Florida ESA housing rules (760.27)", desc: "How Statute 760.27 governs ESA documentation." },
    ],
    faqs: [
      {
        q: "Does an approved ESA pay pet rent in Florida?",
        a: "Generally not. Under the federal Fair Housing Act and Florida law, an approved emotional support animal is usually not treated as a pet, so pet rent, pet deposits, and pet fees typically do not apply once a reasonable-accommodation request is approved — including in many condo and HOA settings. The decision is made individually, and a letter does not guarantee approval or a fee waiver.",
      },
      {
        q: "What does Florida Statute 760.27 require for an ESA letter?",
        a: "Florida Statute 760.27 expects supporting information from a health care practitioner who has personal knowledge of the person's disability-related need, rather than an anonymous online questionnaire. Using a Florida-licensed provider who conducts a genuine evaluation is what makes the documentation appropriate for a Florida housing request.",
      },
      {
        q: "How do Florida condos and HOAs handle ESA requests?",
        a: "Many Florida condos and HOA communities set pet rules through a board or association, but they must still consider a valid reasonable-accommodation request under fair housing law. A verifiable ESA letter from a Florida-licensed provider helps the board review your request without unnecessary delay.",
      },
      {
        q: "How much is pet rent in Florida?",
        a: "It varies by property, but monthly pet rent in Florida markets commonly runs in the tens of dollars per pet, often alongside a one-time fee or deposit. Our pet rent savings calculator estimates the 1, 2, and 5-year totals so you can see how it adds up. The figures are estimates only.",
      },
      {
        q: "Do I need a Florida-licensed provider for my ESA letter?",
        a: "Yes. To align with Florida Statute 760.27, your ESA letter should come from a practitioner licensed in Florida who has genuine knowledge of your need. An in-state, licensed provider is what makes the documentation appropriate for a Florida housing request.",
      },
    ],
    keepReading: COMMON_KEEP_READING,
  },

  "texas-pet-rent-and-esa-letters": {
    slug: "texas-pet-rent-and-esa-letters",
    state: "Texas",
    title: "Texas Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Texas apartments and large corporate-managed buildings, and when an approved emotional support animal may not be charged pet fees.",
    heroImgPath: "/assets/lifestyle/esa-owner-dog-apartment.jpg",
    heroAlt: "A renter with their emotional support dog in a Texas apartment",
    readMins: 7,
    keywords:
      "texas pet rent, pet rent esa texas, esa letter texas pet rent, pet rent houston, pet rent dallas, pet rent austin, texas emotional support animal pet rent",
    chips: ["Texas", "Pet Rent", "Corporate Apartments", "ESA Housing"],
    summary: [
      "Big metros: Houston, Dallas–Fort Worth, Austin, and San Antonio have large apartment markets with common pet charges.",
      "Corporate managers: large property-management companies frequently charge monthly pet rent, often per pet.",
      "No special wait: Texas has no state ESA pre-relationship waiting period — the federal Fair Housing Act governs.",
      "Approved ESAs: an approved emotional support animal is generally not charged pet rent or deposits — decided individually, never guaranteed.",
    ],
    intro:
      "Texas has some of the largest apartment markets in the country, and pet rent is common — especially in big corporate-managed communities. This guide explains how pet rent works in Texas, how an approved emotional support animal is treated, and how to make a housing accommodation request the right way.",
    rentHeading: "Pet rent in Texas apartments",
    rentParas: [
      "In Houston, Dallas–Fort Worth, Austin, and San Antonio, large corporate property-management companies commonly charge monthly pet rent, frequently per pet, plus a one-time pet fee or deposit. Across a multi-year lease, the recurring monthly portion is usually the largest pet-related cost.",
      "Because Texas has so many professionally managed communities, pet rent is widespread here — making it worth estimating the total before you sign.",
    ],
    lawHeading: "How Texas handles ESA housing requests",
    lawParas: [
      "Texas does not add a special state ESA pre-relationship waiting period — ESA housing requests are governed by the federal Fair Housing Act. Your ESA letter should come from a mental health professional licensed in Texas and be verifiable, since large property managers often confirm provider licensure.",
      "When a reasonable-accommodation request is approved, an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees. Each request is reviewed individually, however, and a letter does not guarantee approval or a fee waiver. (Note: Texas penalizes misrepresenting a pet as a trained service animal — a separate issue from a genuine ESA housing accommodation.)",
    ],
    stateLinks: [
      { to: "/texas-esa-letter-for-apartments", icon: "ri-building-line", label: "Texas ESA letter for apartments", desc: "Apartment ESA requests in Texas and large property managers." },
      { to: "/esa-letter/texas", icon: "ri-map-pin-line", label: "Texas ESA letter", desc: "Texas ESA documentation overview and state context." },
    ],
    faqs: [
      {
        q: "Does an approved ESA pay pet rent in Texas?",
        a: "Generally not. Under the federal Fair Housing Act, an approved emotional support animal is usually not treated as a pet, so pet rent, pet deposits, and pet fees typically do not apply once a reasonable-accommodation request is approved — including in large corporate-managed communities. The decision is made individually, and a letter does not guarantee approval or a fee waiver.",
      },
      {
        q: "Does Texas have a waiting period for ESA letters?",
        a: "No. Unlike California's AB 468, Texas does not impose a state ESA pre-relationship waiting period. ESA housing requests are governed by the federal Fair Housing Act. Your letter should still come from a provider licensed in Texas after a genuine evaluation.",
      },
      {
        q: "How much is pet rent in Houston, Dallas, or Austin?",
        a: "It varies by community, but monthly pet rent in major Texas metros commonly runs in the tens of dollars per pet, often alongside a one-time fee or deposit — and large corporate managers frequently charge it. Our pet rent savings calculator estimates the totals over 1, 2, and 5 years. The figures are estimates only.",
      },
      {
        q: "Will a Texas property manager verify my ESA letter?",
        a: "Often, yes. Large Texas property-management companies commonly confirm that the provider is licensed and that the letter is authentic. A verifiable ESA letter from a Texas-licensed provider makes that review faster and reduces the chance of pushback.",
      },
      {
        q: "Do I need a Texas-licensed provider for my ESA letter?",
        a: "Yes. Your ESA letter should come from a mental health professional licensed in Texas and be verifiable. An in-state, licensed provider is what makes the documentation appropriate for a Texas housing request.",
      },
    ],
    keepReading: COMMON_KEEP_READING,
  },

  "washington-pet-rent-and-esa-letters": {
    slug: "washington-pet-rent-and-esa-letters",
    state: "Washington",
    title: "Washington Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Washington's high-cost Seattle-area rental market, the state's assistance-animal protections, and when an approved ESA may not be charged pet fees.",
    heroImgPath: "/assets/lifestyle/owner-with-dog-laptop.jpg",
    heroAlt: "A renter working at home with their emotional support dog in Washington",
    readMins: 6,
    keywords:
      "washington pet rent, pet rent esa washington, esa letter washington pet rent, pet rent seattle, washington emotional support animal pet rent, washington assistance animal",
    chips: ["Washington", "Pet Rent", "Seattle Metro", "ESA Housing"],
    summary: [
      "High rents: Seattle, Bellevue, and Tacoma have high rents where pet charges add up quickly.",
      "State protections: Washington's Law Against Discrimination protects assistance animals in housing.",
      "Reliable documentation: a housing provider may request reliable documentation of the need.",
      "Approved ESAs: an approved emotional support animal is generally not charged pet rent or deposits — decided individually, never guaranteed.",
    ],
    intro:
      "Washington's Seattle-area rental market is among the most expensive in the country, and pet rent can add a meaningful amount to a lease. This guide explains how pet rent works in Washington, the state's assistance-animal housing protections, and when an approved emotional support animal may not be charged those fees.",
    rentHeading: "Pet rent in Washington's rental market",
    rentParas: [
      "In Seattle, Bellevue, Redmond, and Tacoma, many properties charge monthly pet rent on top of high base rents, often alongside a one-time pet fee or deposit and sometimes per pet. Over a multi-year lease, the recurring monthly portion is usually the largest pet-related cost.",
      "Because Washington rents are high, the dollar impact of pet rent tends to be larger here — worth estimating before you sign a lease.",
    ],
    lawHeading: "Washington's assistance-animal housing protections",
    lawParas: [
      "Washington adds protections on top of the federal Fair Housing Act through the Washington Law Against Discrimination. A housing provider may request reliable documentation that the animal is needed because of a disability when the need is not obvious, but cannot demand your full medical records. Your ESA letter should come from a provider licensed in Washington and be verifiable.",
      "When a reasonable-accommodation request is approved, an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees. Each request is reviewed individually, and a letter does not guarantee approval or a fee waiver. (Washington also penalizes misrepresenting a pet as a service animal — a separate issue from a genuine ESA housing accommodation.)",
    ],
    stateLinks: [
      { to: "/esa-letter/washington", icon: "ri-map-pin-line", label: "Washington ESA letter", desc: "Washington ESA documentation overview and state context." },
      { to: "/esa-letter-for-apartments", icon: "ri-building-line", label: "ESA letter for apartments", desc: "How apartment ESA housing requests work." },
    ],
    faqs: [
      {
        q: "Does an approved ESA pay pet rent in Washington?",
        a: "Generally not. Under the federal Fair Housing Act and the Washington Law Against Discrimination, an approved emotional support animal is usually not treated as a pet, so pet rent, pet deposits, and pet fees typically do not apply once a reasonable-accommodation request is approved. The decision is made individually, and a letter does not guarantee approval or a fee waiver.",
      },
      {
        q: "What documentation can a Washington landlord ask for?",
        a: "When the disability-related need is not obvious, a Washington housing provider may request reliable documentation that the animal is needed because of a disability — such as a letter from a licensed provider. They cannot demand your full medical records or your specific diagnosis. Verification confirms authenticity, not clinical detail.",
      },
      {
        q: "How much is pet rent in Seattle?",
        a: "It varies by building, but monthly pet rent in the Seattle area commonly runs in the tens of dollars per pet, often alongside a one-time fee or deposit. Because base rents are high, the total over a lease can be significant. Our pet rent savings calculator estimates the 1, 2, and 5-year totals — the figures are estimates only.",
      },
      {
        q: "Do I need a Washington-licensed provider for my ESA letter?",
        a: "Yes. Your ESA letter should come from a mental health professional licensed in Washington and be verifiable. An in-state, licensed provider is what makes the documentation appropriate for a Washington housing request.",
      },
    ],
    keepReading: COMMON_KEEP_READING,
  },

  "colorado-pet-rent-and-esa-letters": {
    slug: "colorado-pet-rent-and-esa-letters",
    state: "Colorado",
    title: "Colorado Pet Rent and ESA Letters: What Renters Should Know",
    description:
      "How pet rent works in Colorado's Denver-area rental market, the state's assistance-animal protections, and when an approved ESA may not be charged pet fees.",
    heroImgPath: "/assets/lifestyle/senior-with-pet-home.jpg",
    heroAlt: "A renter at home in Colorado with their emotional support animal",
    readMins: 6,
    keywords:
      "colorado pet rent, pet rent esa colorado, esa letter colorado pet rent, pet rent denver, colorado emotional support animal pet rent, colorado assistance animal",
    chips: ["Colorado", "Pet Rent", "Denver Metro", "ESA Housing"],
    summary: [
      "Rising rents: Denver, Boulder, Colorado Springs, and Fort Collins have seen strong rent growth.",
      "State protections: Colorado law protects assistance animals in housing and penalizes misrepresentation.",
      "Provider knowledge: documentation should come from a provider with knowledge of your need.",
      "Approved ESAs: an approved emotional support animal is generally not charged pet rent or deposits — decided individually, never guaranteed.",
    ],
    intro:
      "Colorado's Front Range rental market has grown quickly, and pet rent is a common add-on. This guide explains how pet rent works in Colorado, the state's assistance-animal housing protections, and when an approved emotional support animal may not be charged those fees.",
    rentHeading: "Pet rent in Colorado's rental market",
    rentParas: [
      "In Denver, Boulder, Colorado Springs, and Fort Collins, many properties charge monthly pet rent on top of base rent, often alongside a one-time pet fee or deposit and sometimes per pet. Over a multi-year lease, the recurring monthly portion is usually the largest pet-related cost.",
      "With Colorado rents climbing in recent years, the cumulative impact of pet rent can be meaningful — worth estimating before you sign.",
    ],
    lawHeading: "Colorado's assistance-animal housing protections",
    lawParas: [
      "Colorado adds protections on top of the federal Fair Housing Act. State law addresses assistance animals in housing and penalizes intentionally misrepresenting an animal as a service animal. Documentation supporting an ESA should come from a provider who has knowledge of your disability-related need and is licensed in Colorado.",
      "When a reasonable-accommodation request is approved, an approved emotional support animal is generally not charged pet rent, a pet deposit, or pet fees. Each request is reviewed individually, however, and a letter does not guarantee approval or a fee waiver.",
    ],
    stateLinks: [
      { to: "/esa-letter/colorado", icon: "ri-map-pin-line", label: "Colorado ESA letter", desc: "Colorado ESA documentation overview and state context." },
      { to: "/esa-letter-for-apartments", icon: "ri-building-line", label: "ESA letter for apartments", desc: "How apartment ESA housing requests work." },
    ],
    faqs: [
      {
        q: "Does an approved ESA pay pet rent in Colorado?",
        a: "Generally not. Under the federal Fair Housing Act and Colorado law, an approved emotional support animal is usually not treated as a pet, so pet rent, pet deposits, and pet fees typically do not apply once a reasonable-accommodation request is approved. The decision is made individually, and a letter does not guarantee approval or a fee waiver.",
      },
      {
        q: "What does Colorado require for ESA documentation?",
        a: "Documentation supporting an ESA should come from a provider who has knowledge of your disability-related need and is licensed in Colorado, rather than an anonymous online questionnaire. Colorado law also penalizes intentionally misrepresenting an animal as a service animal — a separate issue from a genuine ESA housing accommodation.",
      },
      {
        q: "How much is pet rent in Denver?",
        a: "It varies by property, but monthly pet rent in the Denver area commonly runs in the tens of dollars per pet, often alongside a one-time fee or deposit. Our pet rent savings calculator estimates the 1, 2, and 5-year totals so you can see how it adds up. The figures are estimates only.",
      },
      {
        q: "Do I need a Colorado-licensed provider for my ESA letter?",
        a: "Yes. Your ESA letter should come from a mental health professional licensed in Colorado who has knowledge of your need, and it should be verifiable. An in-state, licensed provider is what makes the documentation appropriate for a Colorado housing request.",
      },
    ],
    keepReading: COMMON_KEEP_READING,
  },
};
