// ── PSD STATE DATA ──────────────────────────────────────────────────────────
// Source of truth for the /psd-letter/<slug> state pages (state-psd/page.tsx).
//
// COMPLIANCE (PSD pages — read before editing):
// A Psychiatric Service Dog (PSD) is DIFFERENT from an Emotional Support Animal
// (ESA). These pages must keep the two separate and must NOT say or imply:
//   • guaranteed approval / guaranteed public-access acceptance / instant approval
//   • "ADA-certified", "registered", or "certified" service dog
//   • airline / hotel / stadium / Airbnb acceptance guarantees
//   • that documentation alone trains, certifies, or registers a dog
//   • that a PSD letter replaces task training
// Safe framing only: a licensed provider evaluation, PSD documentation, a
// provider recommendation IF clinically appropriate, public access that depends
// on the dog's task training + behavior + applicable law, and NO guarantee of
// acceptance by any third party. There is no official U.S. service-dog registry.

export interface StatePSDData {
  slug: string;
  name: string;
  abbreviation: string;
  introText: string;
  lawsSummary: string;
  lawsBullets: string[];
  advantages: { title: string; desc: string }[];
  /** What a PSD letter / PSD documentation CAN do. */
  whatItCan: string[];
  /** What a PSD letter / PSD documentation CANNOT do (compliance guardrails). */
  whatItCannot: string[];
  faqs: { q: string; a: string }[];
}

// Shared, compliant "can / cannot" copy. Federal (ADA/FHA) so it reads the same
// nationwide; only the state name varies.
const psdCanDo = (name: string): string[] => [
  `Document a licensed provider's evaluation of a psychiatric disability for a ${name} resident.`,
  "Support a Fair Housing Act reasonable-accommodation request so a housing provider may waive pet fees, deposits, or a no-pet rule for the dog.",
  "State, in writing, that a licensed mental-health professional recommends a psychiatric service dog when it is clinically appropriate for you.",
  "Be part of your records if a housing provider asks for documentation of a disability-related need.",
];

const psdCannotDo = (name: string): string[] => [
  "Train, certify, or register your dog. There is no official U.S. service-dog registry, and a PSD must be individually trained to perform tasks.",
  `Guarantee acceptance by any landlord, airline, hotel, business, or other third party in ${name}.`,
  "Grant public access on its own. Access depends on your dog's task training, behavior, and applicable law — not on paperwork.",
  "Replace task training, or the ADA requirement that a service dog be house-trained and under the handler's control.",
];

// The four conversational / AI-answer questions every PSD state page must carry.
const coreFaqs = (name: string): { q: string; a: string }[] => [
  {
    q: `Can I get a PSD letter online in ${name}?`,
    a: `You can begin a licensed provider evaluation online. A ${name}-licensed mental-health professional reviews your situation by telehealth and, only if a psychiatric service dog is clinically appropriate, provides PSD documentation. Documentation is never promised in advance — it depends on the evaluation.`,
  },
  {
    q: `Is a PSD letter the same as an ESA letter in ${name}?`,
    a: "No. An emotional support animal provides comfort through companionship and is generally a housing-only accommodation. A psychiatric service dog is individually trained to perform specific tasks and is a separate category under the ADA. An ESA letter and PSD documentation are not interchangeable.",
  },
  {
    q: `Do I need a licensed provider for PSD documentation in ${name}?`,
    a: `Yes. Legitimate PSD documentation reflects an evaluation by a mental-health professional licensed in ${name}. Be cautious of any website offering instant "registration," "certification," or an ID card — those have no legal standing on their own.`,
  },
  {
    q: "Does a PSD letter train or certify my dog?",
    a: "No. A PSD letter documents a provider's evaluation of your need. It does not train, certify, or register your dog. Under the ADA your dog must be individually trained to perform tasks and remain under your control — that training is separate from, and not replaced by, the documentation.",
  },
];

// Compliant default builder used for the ~40 non-feature states. `extraLaw`
// adds a single state-law sentence inside the laws summary.
const buildBasicPSD = (
  name: string,
  slug: string,
  abbreviation: string,
  extraLaw?: string,
): StatePSDData => ({
  slug,
  name,
  abbreviation,
  introText: `${name} residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our licensed mental-health professionals evaluate whether a PSD is clinically appropriate for you and, when it is, provide PSD documentation.`,
  lawsSummary: `${name} follows the federal Americans with Disabilities Act (ADA) and Fair Housing Act (FHA) for psychiatric service dogs. ${
    extraLaw ||
    "Under the ADA, a properly task-trained, well-behaved PSD may accompany its handler in most places open to the public, and under the FHA a housing provider generally must consider a reasonable-accommodation request for a PSD."
  } Documentation records a licensed provider's evaluation — it does not train, certify, or register your dog.`,
  lawsBullets: [
    `The federal ADA and Fair Housing Act apply to PSD handlers in ${name}.`,
    "Under the FHA, a housing provider generally cannot charge pet fees or deposits for a service dog and must consider a reasonable-accommodation request.",
    "Under the ADA, a task-trained, well-behaved PSD may accompany its handler in most public places — access depends on training and behavior, not paperwork.",
    "A PSD must be individually trained to perform specific tasks that help with a psychiatric disability.",
    "A PSD letter documents a licensed provider's evaluation; it is not a registration, certificate, or ID card.",
    "No documentation can guarantee approval by every landlord, airline, or business.",
  ],
  advantages: [
    {
      title: "Licensed Provider Evaluation",
      desc: `A ${name}-licensed mental-health professional reviews whether a psychiatric service dog is clinically appropriate for you before any documentation is issued.`,
    },
    {
      title: "Housing Accommodation Support",
      desc: `Under the Fair Housing Act, a housing provider in ${name} generally must consider a reasonable-accommodation request for a PSD and typically cannot charge pet fees for it.`,
    },
    {
      title: "Task-Based Support",
      desc: "A PSD is trained to perform specific tasks — such as interrupting panic, grounding, or deep pressure therapy — that help with a psychiatric disability.",
    },
  ],
  whatItCan: psdCanDo(name),
  whatItCannot: psdCannotDo(name),
  faqs: coreFaqs(name),
});

export const usPSDStates: StatePSDData[] = [
  buildBasicPSD("Alabama", "alabama", "AL"),
  buildBasicPSD("Alaska", "alaska", "AK"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "arizona",
    name: "Arizona",
    abbreviation: "AZ",
    introText:
      "Arizona residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Arizona-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Arizona follows the federal Americans with Disabilities Act (ADA) and Fair Housing Act (FHA), alongside Arizona's own service-animal statute (A.R.S. § 11-1024). Arizona law also makes it unlawful to fraudulently misrepresent an animal as a service animal — which is exactly why a genuine licensed provider evaluation matters. Documentation records that evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to PSD handlers throughout Arizona.",
      "Arizona's service-animal law (A.R.S. § 11-1024) recognizes task-trained service dogs and addresses public-accommodation access.",
      "Arizona law penalizes fraudulently misrepresenting a pet as a service animal — a real evaluation protects you.",
      "Under the FHA, an Arizona housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; documentation is not a registration or certificate.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "Arizona-Licensed Evaluation", desc: "An Arizona-licensed mental-health professional decides whether a psychiatric service dog is clinically appropriate before any documentation is issued — important in a state that penalizes service-animal misrepresentation." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, Arizona housing providers — from Phoenix and Tucson apartments to HOAs — generally must consider a reasonable-accommodation request for a PSD and typically cannot charge pet fees." },
      { title: "Task-Based Support", desc: "An Arizona PSD is trained to perform specific tasks such as deep pressure therapy, grounding, or interrupting panic — the trained tasks are what distinguish a PSD from an ESA." },
    ],
    whatItCan: psdCanDo("Arizona"),
    whatItCannot: psdCannotDo("Arizona"),
    faqs: [
      ...coreFaqs("Arizona"),
      { q: "Does Arizona penalize fake service dogs?", a: "Yes. Arizona law (A.R.S. § 11-1024) makes it unlawful to fraudulently misrepresent a pet as a service animal. That is one reason a legitimate licensed provider evaluation — not an instant online 'registration' — matters in Arizona." },
      { q: "What psychiatric conditions are commonly evaluated for a PSD in Arizona?", a: "A licensed provider may consider conditions such as PTSD, panic disorder, severe anxiety, depression, or OCD. Qualification depends entirely on the individual evaluation — no condition is an automatic approval." },
    ],
  },
  buildBasicPSD("Arkansas", "arkansas", "AR"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "california",
    name: "California",
    abbreviation: "CA",
    introText:
      "California residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our California-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation under a strong state civil-rights framework.",
    lawsSummary:
      "California PSD handlers are covered by the federal ADA and Fair Housing Act, plus California's Unruh Civil Rights Act and the Fair Employment and Housing Act (FEHA). California's AB 468 (2022) sets standards for emotional-support-animal documentation and requires a genuine provider relationship for ESA letters — a useful reminder that legitimate mental-health documentation in California always comes from a licensed provider, never an instant online registry. Documentation records a licensed provider's evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to California PSD handlers, alongside the Unruh Civil Rights Act and FEHA.",
      "California's Unruh Act addresses access to business establishments for service-dog handlers.",
      "AB 468 (2022) governs ESA documentation and requires a real provider relationship — California consistently rejects instant, no-evaluation paperwork.",
      "Under the FHA and FEHA, a California housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; public access depends on training and behavior, not on a letter.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "Strong State Civil-Rights Framework", desc: "California's Unruh Act and FEHA reinforce federal ADA and FHA protections, giving California PSD handlers one of the most developed civil-rights frameworks in the country." },
      { title: "California-Licensed Evaluation", desc: "A California-licensed mental-health professional evaluates whether a PSD is clinically appropriate — consistent with California's emphasis (including AB 468) on genuine provider relationships over instant online paperwork." },
      { title: "Housing Accommodation Support", desc: "Under the FHA and FEHA, California housing providers — from LA and SF high-rises to suburban HOAs — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
    ],
    whatItCan: psdCanDo("California"),
    whatItCannot: psdCannotDo("California"),
    faqs: [
      ...coreFaqs("California"),
      { q: "Does California's AB 468 apply to PSD letters?", a: "AB 468 specifically governs emotional-support-animal documentation and requires a real provider relationship. The broader point applies to PSDs too: California expects legitimate mental-health documentation to come from a licensed provider after an evaluation — not from an instant online registry." },
      { q: "Does California's Unruh Act guarantee my PSD entry everywhere?", a: "No. The Unruh Civil Rights Act addresses access for service-dog handlers, but actual access still depends on your dog being task-trained, well-behaved, and under control. No law or document guarantees acceptance by every business." },
    ],
  },
  buildBasicPSD("Colorado", "colorado", "CO", "Colorado's Anti-Discrimination Act (CADA) reinforces the federal ADA and FHA for service-dog handlers statewide."),
  buildBasicPSD("Connecticut", "connecticut", "CT"),
  buildBasicPSD("Delaware", "delaware", "DE"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "florida",
    name: "Florida",
    abbreviation: "FL",
    introText:
      "Florida residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Florida-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Florida follows the federal ADA and Fair Housing Act, alongside Florida Statute 413.08 (service-animal public access) and Florida Statute 760.27 (housing documentation, which requires information from a practitioner with personal knowledge). Florida also makes it a criminal offense to misrepresent a pet as a service animal — so a genuine licensed evaluation is essential. Documentation records that evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to Florida PSD handlers, alongside Florida Statutes 413.08 and 760.27.",
      "Florida Statute 760.27 expects housing documentation to come from a practitioner with personal knowledge of the patient — not an instant online form.",
      "Florida Statute 413.08 makes misrepresenting a pet as a service animal a criminal offense; a real evaluation protects you.",
      "Under the FHA, a Florida housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; documentation is not a registration or certificate.",
      "No documentation can guarantee acceptance by every landlord, condo board, airline, or business.",
    ],
    advantages: [
      { title: "Florida-Licensed, Personal-Knowledge Evaluation", desc: "A Florida-licensed mental-health professional evaluates whether a PSD is clinically appropriate — consistent with Statute 760.27's expectation of a practitioner with personal knowledge of the patient." },
      { title: "Condo & HOA Housing Support", desc: "Under the FHA, Florida housing providers — including the condo and HOA boards common in Miami, Tampa, and Orlando — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
      { title: "Task-Based Support", desc: "A Florida PSD is trained to perform specific tasks such as deep pressure therapy, grounding, or interrupting panic — the trained tasks are what set a PSD apart from an ESA." },
    ],
    whatItCan: psdCanDo("Florida"),
    whatItCannot: psdCannotDo("Florida"),
    faqs: [
      ...coreFaqs("Florida"),
      { q: "Does Florida penalize fake service dogs?", a: "Yes. Florida Statute 413.08 makes it a criminal offense (a second-degree misdemeanor) to knowingly misrepresent a pet as a service animal. That is why a legitimate Florida-licensed evaluation matters far more than any instant online 'registration.'" },
      { q: "What does Florida Statute 760.27 require for housing?", a: "For ESA/assistance-animal housing documentation, Florida expects supporting information from a licensed practitioner who has personal knowledge of the patient. The same principle of a genuine provider relationship applies to legitimate PSD documentation." },
    ],
  },
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "georgia",
    name: "Georgia",
    abbreviation: "GA",
    introText:
      "Georgia residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Georgia-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Georgia follows the federal ADA and Fair Housing Act, alongside Georgia's service-animal access law (O.C.G.A. § 30-4-2). Public access for a PSD comes from the ADA and depends on the dog being task-trained and well-behaved. Documentation records a licensed provider's evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to PSD handlers throughout Georgia.",
      "Georgia's service-animal law (O.C.G.A. § 30-4-2) recognizes task-trained service dogs in public accommodations.",
      "Under the FHA, a Georgia housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform specific psychiatric tasks.",
      "A PSD letter documents an evaluation; it is not a registration, certificate, or ID card.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "Georgia-Licensed Evaluation", desc: "A Georgia-licensed mental-health professional reviews whether a psychiatric service dog is clinically appropriate before any documentation is issued." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, Georgia housing providers — from Atlanta apartments to suburban HOAs — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
      { title: "Task-Based Support", desc: "A Georgia PSD is trained to perform specific tasks such as grounding, deep pressure therapy, or interrupting panic — the trained tasks distinguish a PSD from an ESA." },
    ],
    whatItCan: psdCanDo("Georgia"),
    whatItCannot: psdCannotDo("Georgia"),
    faqs: [
      ...coreFaqs("Georgia"),
      { q: "Does a PSD have public-access rights in Georgia?", a: "Under the ADA, a task-trained, well-behaved PSD may accompany its handler in most places open to the public in Georgia. Access depends on the dog's training and behavior — not on carrying a letter, ID, or vest." },
    ],
  },
  buildBasicPSD("Hawaii", "hawaii", "HI"),
  buildBasicPSD("Idaho", "idaho", "ID"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "illinois",
    name: "Illinois",
    abbreviation: "IL",
    introText:
      "Illinois residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Illinois-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Illinois follows the federal ADA and Fair Housing Act, alongside the Illinois Human Rights Act and the Illinois Service Animal Access Act (720 ILCS 630). Illinois also penalizes misrepresenting a pet as a service animal — a reminder that genuine documentation comes from a licensed provider, not an instant registry. Documentation records that evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to Illinois PSD handlers, alongside the Illinois Human Rights Act.",
      "The Illinois Service Animal Access Act (720 ILCS 630) addresses access for task-trained service dogs in public accommodations.",
      "Illinois penalizes knowingly misrepresenting a pet as a service animal — a real evaluation protects you.",
      "Under the FHA, an Illinois housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; documentation is not a registration or certificate.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "Illinois Human Rights Act Reinforcement", desc: "The Illinois Human Rights Act reinforces federal ADA and FHA protections for service-dog handlers in housing and public accommodations statewide." },
      { title: "Illinois-Licensed Evaluation", desc: "An Illinois-licensed mental-health professional evaluates whether a PSD is clinically appropriate — important in a state that penalizes service-animal misrepresentation." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, Illinois housing providers — from Chicago high-rises to suburban HOAs — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
    ],
    whatItCan: psdCanDo("Illinois"),
    whatItCannot: psdCannotDo("Illinois"),
    faqs: [
      ...coreFaqs("Illinois"),
      { q: "Does Illinois penalize fake service dogs?", a: "Yes. Illinois law penalizes knowingly misrepresenting a pet as a service animal. A legitimate Illinois-licensed provider evaluation — not an instant online 'certification' — is the proper basis for PSD documentation." },
    ],
  },
  buildBasicPSD("Indiana", "indiana", "IN"),
  buildBasicPSD("Iowa", "iowa", "IA"),
  buildBasicPSD("Kansas", "kansas", "KS"),
  buildBasicPSD("Kentucky", "kentucky", "KY"),
  buildBasicPSD("Louisiana", "louisiana", "LA"),
  buildBasicPSD("Maine", "maine", "ME"),
  buildBasicPSD("Maryland", "maryland", "MD"),
  buildBasicPSD("Massachusetts", "massachusetts", "MA", "Massachusetts Chapter 151B reinforces the federal ADA and FHA for service-dog handlers in housing and public accommodations."),
  buildBasicPSD("Michigan", "michigan", "MI"),
  buildBasicPSD("Minnesota", "minnesota", "MN"),
  buildBasicPSD("Mississippi", "mississippi", "MS"),
  buildBasicPSD("Missouri", "missouri", "MO"),
  buildBasicPSD("Montana", "montana", "MT"),
  buildBasicPSD("Nebraska", "nebraska", "NE"),
  buildBasicPSD("Nevada", "nevada", "NV"),
  buildBasicPSD("New Hampshire", "new-hampshire", "NH"),
  buildBasicPSD("New Jersey", "new-jersey", "NJ", "The New Jersey Law Against Discrimination (LAD) reinforces the federal ADA and FHA for service-dog handlers statewide."),
  buildBasicPSD("New Mexico", "new-mexico", "NM"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "new-york",
    name: "New York",
    abbreviation: "NY",
    introText:
      "New York residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our New York-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation under a layered set of state and city protections.",
    lawsSummary:
      "New York PSD handlers are covered by the federal ADA and Fair Housing Act, the New York State Human Rights Law, and — for residents of the five boroughs — the New York City Human Rights Law, one of the broadest civil-rights laws in the country. New York Civil Rights Law § 47 also addresses service-dog access. Documentation records a licensed provider's evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply statewide, alongside the New York State Human Rights Law.",
      "New York City residents also have the New York City Human Rights Law, among the broadest such laws in the US.",
      "New York Civil Rights Law § 47 addresses access for task-trained service dogs.",
      "Under the FHA and state law, a New York housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD — including co-ops and condos, subject to the usual review.",
      "A PSD must be individually trained to perform tasks; public access depends on training and behavior, not on paperwork.",
      "No documentation can guarantee acceptance by every landlord, board, airline, or business.",
    ],
    advantages: [
      { title: "Layered State + City Protections", desc: "New York PSD handlers benefit from the federal ADA/FHA, the NYS Human Rights Law, and — in the five boroughs — the NYC Human Rights Law, one of the strongest civil-rights frameworks in the nation." },
      { title: "Co-op & Condo Housing Support", desc: "Under the FHA and state law, New York housing providers — including the co-op and condo boards common in NYC — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
      { title: "New York-Licensed Evaluation", desc: "A New York-licensed mental-health professional evaluates whether a PSD is clinically appropriate before any documentation is issued." },
    ],
    whatItCan: psdCanDo("New York"),
    whatItCannot: psdCannotDo("New York"),
    faqs: [
      ...coreFaqs("New York"),
      { q: "Do New York City's laws give my PSD extra protection?", a: "New York City residents are covered by the NYC Human Rights Law in addition to state and federal law. It is one of the broadest civil-rights laws in the country, but actual public access still depends on your dog being task-trained, well-behaved, and under control." },
      { q: "Can a New York co-op or condo board reject my PSD?", a: "Under the FHA and New York law, boards generally must consider a reasonable-accommodation request for a PSD and typically cannot charge pet fees for it. A board may still review a request through its normal process — no document guarantees automatic approval." },
    ],
  },
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "north-carolina",
    name: "North Carolina",
    abbreviation: "NC",
    introText:
      "North Carolina residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our North Carolina-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "North Carolina follows the federal ADA and Fair Housing Act, alongside North Carolina's service-animal access law (N.C.G.S. § 168-4.2). North Carolina also penalizes disguising a pet as a service animal — so a genuine licensed evaluation matters. Documentation records that evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to PSD handlers throughout North Carolina.",
      "North Carolina's service-animal law (N.C.G.S. § 168-4.2) addresses access for task-trained service dogs.",
      "North Carolina penalizes misrepresenting a pet as a service animal — a real evaluation protects you.",
      "Under the FHA, a North Carolina housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform specific psychiatric tasks.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "North Carolina-Licensed Evaluation", desc: "A North Carolina-licensed mental-health professional reviews whether a PSD is clinically appropriate — important in a state that penalizes service-animal misrepresentation." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, North Carolina housing providers — from Charlotte and Raleigh apartments to suburban HOAs — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
      { title: "Task-Based Support", desc: "A North Carolina PSD is trained to perform specific tasks such as deep pressure therapy, grounding, or interrupting panic — the trained tasks distinguish a PSD from an ESA." },
    ],
    whatItCan: psdCanDo("North Carolina"),
    whatItCannot: psdCannotDo("North Carolina"),
    faqs: [
      ...coreFaqs("North Carolina"),
      { q: "Does North Carolina penalize fake service dogs?", a: "Yes. North Carolina law penalizes disguising or misrepresenting a pet as a service animal. A legitimate North Carolina-licensed provider evaluation is the proper basis for PSD documentation — instant online 'registrations' have no legal standing." },
    ],
  },
  buildBasicPSD("North Dakota", "north-dakota", "ND"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "ohio",
    name: "Ohio",
    abbreviation: "OH",
    introText:
      "Ohio residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Ohio-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Ohio follows the federal ADA and Fair Housing Act, alongside the Ohio Civil Rights Act (O.R.C. Chapter 4112), which reinforces protections in housing and public accommodations. Ohio law (O.R.C. § 955.43) also addresses service dogs and penalizes misrepresenting an animal as an assistance dog. Documentation records a licensed provider's evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to Ohio PSD handlers, alongside the Ohio Civil Rights Act (O.R.C. 4112).",
      "Ohio recognizes task-trained service dogs as distinct from emotional support animals.",
      "Ohio law (O.R.C. § 955.43) penalizes misrepresenting an animal as an assistance dog — a real evaluation protects you.",
      "Under the FHA, an Ohio housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; documentation is not a registration or certificate.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "Ohio Civil Rights Act Reinforcement", desc: "The Ohio Civil Rights Act (O.R.C. 4112) reinforces federal ADA and FHA protections for service-dog handlers in housing and public accommodations statewide." },
      { title: "Ohio-Licensed Evaluation", desc: "An Ohio-licensed mental-health professional evaluates whether a PSD is clinically appropriate before any documentation is issued." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, Ohio housing providers — from Columbus and Cleveland apartments to suburban HOAs — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
    ],
    whatItCan: psdCanDo("Ohio"),
    whatItCannot: psdCannotDo("Ohio"),
    faqs: [
      ...coreFaqs("Ohio"),
      { q: "Does Ohio recognize Psychiatric Service Dogs separately from ESAs?", a: "Yes. Ohio follows the ADA distinction: a task-trained PSD is a service dog with public-access potential, while an emotional support animal is generally a housing-only accommodation. The two are separate categories." },
      { q: "Does Ohio penalize fake service dogs?", a: "Ohio law (O.R.C. § 955.43) addresses misrepresenting an animal as an assistance dog. A legitimate Ohio-licensed provider evaluation is the proper basis for PSD documentation." },
    ],
  },
  buildBasicPSD("Oklahoma", "oklahoma", "OK"),
  buildBasicPSD("Oregon", "oregon", "OR", "The Oregon Fair Housing Act and ORS Chapter 90 reinforce the federal ADA and FHA for service-dog handlers in housing."),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "pennsylvania",
    name: "Pennsylvania",
    abbreviation: "PA",
    introText:
      "Pennsylvania residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Pennsylvania-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Pennsylvania follows the federal ADA and Fair Housing Act, alongside the Pennsylvania Human Relations Act (PHRA), which reinforces protections in housing and public accommodations. Philadelphia residents also have the city's Fair Practices Ordinance. Documentation records a licensed provider's evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to Pennsylvania PSD handlers, alongside the Pennsylvania Human Relations Act (PHRA).",
      "Philadelphia residents also have the city's Fair Practices Ordinance reinforcing service-dog protections.",
      "Under the ADA, a task-trained, well-behaved PSD may accompany its handler in most public places — access depends on training and behavior.",
      "Under the FHA, a Pennsylvania housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; documentation is not a registration or certificate.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "PHRA Reinforcement", desc: "The Pennsylvania Human Relations Act reinforces federal ADA and FHA protections for service-dog handlers in housing and public accommodations statewide." },
      { title: "Pennsylvania-Licensed Evaluation", desc: "A Pennsylvania-licensed mental-health professional reviews whether a PSD is clinically appropriate before any documentation is issued." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, Pennsylvania housing providers — from Philadelphia and Pittsburgh apartments to suburban HOAs — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
    ],
    whatItCan: psdCanDo("Pennsylvania"),
    whatItCannot: psdCannotDo("Pennsylvania"),
    faqs: [
      ...coreFaqs("Pennsylvania"),
      { q: "Does the Pennsylvania Human Relations Act help PSD handlers?", a: "Yes. The PHRA reinforces federal ADA and FHA protections in housing and public accommodations. Actual public access for a PSD still depends on the dog being task-trained and well-behaved." },
    ],
  },
  buildBasicPSD("Rhode Island", "rhode-island", "RI"),
  buildBasicPSD("South Carolina", "south-carolina", "SC"),
  buildBasicPSD("South Dakota", "south-dakota", "SD"),
  buildBasicPSD("Tennessee", "tennessee", "TN"),
  // ── FEATURE STATE ──────────────────────────────────────────────────────────
  {
    slug: "texas",
    name: "Texas",
    abbreviation: "TX",
    introText:
      "Texas residents who may qualify for a Psychiatric Service Dog (PSD) can start with a licensed provider evaluation through PawTenant. A PSD is different from an emotional support animal — it is individually trained to perform tasks that help with a psychiatric disability. Our Texas-licensed mental-health professionals evaluate whether a PSD is clinically appropriate and, when it is, provide PSD documentation.",
    lawsSummary:
      "Texas follows the federal ADA and Fair Housing Act, alongside the Texas Human Resources Code Chapter 121, which addresses service-animal access. Texas also makes it an offense to represent that an animal is a service animal when it is not (Tex. Hum. Res. Code § 121.006) — so a genuine licensed evaluation matters. Documentation records that evaluation; it does not train, certify, or register your dog.",
    lawsBullets: [
      "The federal ADA and FHA apply to PSD handlers throughout Texas.",
      "The Texas Human Resources Code Chapter 121 addresses access for task-trained service dogs.",
      "Texas penalizes misrepresenting a pet as a service animal (Tex. Hum. Res. Code § 121.006) — a real evaluation protects you.",
      "Under the FHA, a Texas housing provider generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD.",
      "A PSD must be individually trained to perform tasks; documentation is not a registration or certificate.",
      "No documentation can guarantee acceptance by every landlord, airline, or business.",
    ],
    advantages: [
      { title: "Texas-Licensed Evaluation", desc: "A Texas-licensed mental-health professional reviews whether a PSD is clinically appropriate — important in a state that penalizes service-animal misrepresentation." },
      { title: "Housing Accommodation Support", desc: "Under the FHA, Texas housing providers — including the large corporate property managers common in Houston, Dallas-Fort Worth, Austin, and San Antonio — generally must consider a reasonable-accommodation request and typically cannot charge pet fees for a PSD." },
      { title: "Task-Based Support", desc: "A Texas PSD is trained to perform specific tasks such as deep pressure therapy, grounding, or interrupting panic — the trained tasks distinguish a PSD from an ESA." },
    ],
    whatItCan: psdCanDo("Texas"),
    whatItCannot: psdCannotDo("Texas"),
    faqs: [
      ...coreFaqs("Texas"),
      { q: "Does Texas penalize fake service dogs?", a: "Yes. Texas Human Resources Code § 121.006 makes it an offense to represent that an animal is a specially trained service animal when it is not. A legitimate Texas-licensed evaluation is the proper basis for PSD documentation — instant online 'registrations' are not." },
    ],
  },
  buildBasicPSD("Utah", "utah", "UT"),
  buildBasicPSD("Vermont", "vermont", "VT"),
  buildBasicPSD("Virginia", "virginia", "VA"),
  buildBasicPSD("Washington", "washington", "WA", "The Washington Law Against Discrimination (RCW 49.60) is one of the broadest state civil-rights laws in the country and reinforces the federal ADA and FHA for service-dog handlers."),
  buildBasicPSD("Washington DC", "washington-dc", "DC", "The DC Human Rights Act reinforces the federal ADA and FHA for service-dog handlers in housing and public accommodations."),
  buildBasicPSD("West Virginia", "west-virginia", "WV"),
  buildBasicPSD("Wisconsin", "wisconsin", "WI"),
  buildBasicPSD("Wyoming", "wyoming", "WY"),
];

export const getPSDStateBySlug = (slug: string): StatePSDData | undefined =>
  usPSDStates.find((s) => s.slug === slug.toLowerCase());
