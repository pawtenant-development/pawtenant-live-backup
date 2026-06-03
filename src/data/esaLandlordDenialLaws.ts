/**
 * esaLandlordDenialLaws.ts
 * -----------------------------------------------------------------------------
 * Reusable, state-by-state guidance for renters whose landlord denied or pushed
 * back on an emotional support animal (ESA) reasonable-accommodation request.
 *
 * EDUCATIONAL INFORMATION ONLY — NOT LEGAL ADVICE. Facts vary case-by-case.
 *
 * Sourcing approach:
 *  - Baseline for every state + DC = the federal Fair Housing Act (FHA) and HUD
 *    FHEO assistance-animal guidance (which treats ESAs as "assistance animals,"
 *    distinct from ADA service animals).
 *  - A small set of high-priority states adds careful, widely-documented
 *    state-specific notes that are already reflected in PawTenant's reviewed
 *    state content (e.g. California AB 468, Florida § 760.27, Arkansas's
 *    provider-relationship rule).
 *  - Where a state has no clearly-verified ESA-specific housing statute, we keep
 *    the FHA baseline and point users to the state ESA guide / state agency
 *    rather than inventing state law.
 *
 * `detailLevel`:
 *  - "detailed"  → has a tailored, state-aware summary (the priority states).
 *  - "baseline"  → FHA baseline; state-specific layer may vary (see state guide).
 */

export interface LandlordDenialStateLaw {
  /** Matches the slug used by /esa-letter/<slug> guides (src/mocks/states.ts). */
  slug: string;
  stateName: string;
  abbreviation: string;
  /** Governing framework shown in the rules table. */
  stateLawName: string;
  /** HUD region / state civil-rights or fair-housing enforcement agency. */
  enforcementAgency: string;
  /** Can a blanket no-pets policy alone justify denial? */
  blanketNoPetsDenial: string;
  /** What a housing provider may reasonably ask for. */
  landlordCanAskFor: string[];
  /** What a housing provider generally cannot do. */
  landlordCannotDo: string[];
  /** Pet fee / deposit / pet rent treatment for an assistance animal. */
  petFeePetRentRule: string;
  /** One concrete, non-adversarial next step. */
  practicalNextStep: string;
  /** Internal link to the full state ESA guide. */
  stateGuidePath: string;
  /** Short, scannable summary for the selected-state card. */
  shortSummary: string;
  detailLevel: "detailed" | "baseline";
}

/** slug | name | abbreviation — aligned with src/mocks/states.ts so every
 *  stateGuidePath resolves to a real /esa-letter/<slug> page. */
const STATE_INDEX: ReadonlyArray<readonly [string, string, string]> = [
  ["alabama", "Alabama", "AL"], ["alaska", "Alaska", "AK"], ["arizona", "Arizona", "AZ"],
  ["arkansas", "Arkansas", "AR"], ["california", "California", "CA"], ["colorado", "Colorado", "CO"],
  ["connecticut", "Connecticut", "CT"], ["delaware", "Delaware", "DE"], ["florida", "Florida", "FL"],
  ["georgia", "Georgia", "GA"], ["hawaii", "Hawaii", "HI"], ["idaho", "Idaho", "ID"],
  ["illinois", "Illinois", "IL"], ["indiana", "Indiana", "IN"], ["iowa", "Iowa", "IA"],
  ["kansas", "Kansas", "KS"], ["kentucky", "Kentucky", "KY"], ["louisiana", "Louisiana", "LA"],
  ["maine", "Maine", "ME"], ["maryland", "Maryland", "MD"], ["massachusetts", "Massachusetts", "MA"],
  ["michigan", "Michigan", "MI"], ["minnesota", "Minnesota", "MN"], ["mississippi", "Mississippi", "MS"],
  ["missouri", "Missouri", "MO"], ["montana", "Montana", "MT"], ["nebraska", "Nebraska", "NE"],
  ["nevada", "Nevada", "NV"], ["new-hampshire", "New Hampshire", "NH"], ["new-jersey", "New Jersey", "NJ"],
  ["new-mexico", "New Mexico", "NM"], ["new-york", "New York", "NY"], ["north-carolina", "North Carolina", "NC"],
  ["north-dakota", "North Dakota", "ND"], ["ohio", "Ohio", "OH"], ["oklahoma", "Oklahoma", "OK"],
  ["oregon", "Oregon", "OR"], ["pennsylvania", "Pennsylvania", "PA"], ["rhode-island", "Rhode Island", "RI"],
  ["south-carolina", "South Carolina", "SC"], ["south-dakota", "South Dakota", "SD"], ["tennessee", "Tennessee", "TN"],
  ["texas", "Texas", "TX"], ["utah", "Utah", "UT"], ["vermont", "Vermont", "VT"],
  ["virginia", "Virginia", "VA"], ["washington", "Washington", "WA"], ["washington-dc", "Washington DC", "DC"],
  ["west-virginia", "West Virginia", "WV"], ["wisconsin", "Wisconsin", "WI"], ["wyoming", "Wyoming", "WY"],
];

const FHA_AGENCY =
  "U.S. Dept. of Housing & Urban Development (HUD) — Office of Fair Housing & Equal Opportunity (FHEO)";

const FHA_NO_PETS =
  "A no-pets policy by itself is generally not enough to deny a valid reasonable-accommodation request for an assistance animal under the Fair Housing Act.";

const FHA_CAN_ASK: string[] = [
  "Reliable documentation of a disability and the disability-related need for the animal — when that need is not obvious or already known.",
  "That you follow the same general application, lease, and conduct rules as everyone else.",
];

const FHA_CANNOT_DO: string[] = [
  "Charge pet fees, pet deposits, or pet rent for an assistance animal.",
  "Apply breed, size, or weight limits that only exist for ordinary pets.",
  "Require detailed medical records or a specific diagnosis.",
  "Deny the request solely because the property has a no-pets policy.",
];

const FHA_FEE_RULE =
  "No pet fees, pet deposits, or pet rent for an assistance animal. You still remain responsible for any actual damage the animal causes.";

const FHA_NEXT_STEP =
  "Respond calmly in writing, confirm your documentation is complete and from a licensed provider, and ask the housing provider to reconsider under the Fair Housing Act. If needed, contact HUD or your local fair housing agency.";

function baseline(slug: string, stateName: string, abbreviation: string): LandlordDenialStateLaw {
  return {
    slug,
    stateName,
    abbreviation,
    stateLawName: "Federal Fair Housing Act (FHA)",
    enforcementAgency: FHA_AGENCY,
    blanketNoPetsDenial: FHA_NO_PETS,
    landlordCanAskFor: [...FHA_CAN_ASK],
    landlordCannotDo: [...FHA_CANNOT_DO],
    petFeePetRentRule: FHA_FEE_RULE,
    practicalNextStep: FHA_NEXT_STEP,
    stateGuidePath: `/esa-letter/${slug}`,
    shortSummary: `${stateName} follows the federal Fair Housing Act for assistance animals in housing. State-specific documentation rules may also apply — see the ${stateName} ESA guide for details.`,
    detailLevel: "baseline",
  };
}

/**
 * Careful, state-aware overrides for high-priority states. Only verified,
 * widely-documented points are stated specifically; everything else stays on the
 * FHA baseline. We deliberately avoid citing statute numbers we cannot verify.
 */
const OVERRIDES: Record<string, Partial<LandlordDenialStateLaw>> = {
  california: {
    stateLawName: "Federal Fair Housing Act + California AB 468",
    enforcementAgency: "California Civil Rights Department (CRD) and HUD/FHEO",
    landlordCanAskFor: [
      ...FHA_CAN_ASK,
      "Documentation issued after at least a 30-day client relationship and a real clinical evaluation, consistent with California AB 468.",
    ],
    practicalNextStep:
      "Make sure your ESA documentation meets California's AB 468 standards (a 30-day provider relationship and a genuine evaluation), then respond in writing and ask your landlord to reconsider under the Fair Housing Act.",
    shortSummary:
      "California protects assistance animals in housing under the federal Fair Housing Act. Under AB 468, ESA documentation must follow a 30-day provider relationship and a real clinical evaluation — instantly-issued letters are a red flag.",
    detailLevel: "detailed",
  },
  florida: {
    stateLawName: "Federal Fair Housing Act + Florida Statute § 760.27",
    enforcementAgency: "Florida Commission on Human Relations and HUD/FHEO",
    landlordCanAskFor: [
      ...FHA_CAN_ASK,
      "Information reasonably supporting the disability-related need, as outlined in Florida Statute § 760.27, when the disability is not readily apparent.",
    ],
    shortSummary:
      "Florida Statute § 760.27 sets who may provide ESA documentation and what a housing provider may reasonably request, alongside federal Fair Housing Act protections. Florida also penalizes knowingly fraudulent ESA information.",
    practicalNextStep:
      "Confirm your documentation meets Florida § 760.27 (issued by an appropriate licensed provider with personal knowledge of your need), respond in writing, and ask your landlord to reconsider under the Fair Housing Act.",
    detailLevel: "detailed",
  },
  arkansas: {
    stateLawName: "Federal Fair Housing Act + Arkansas ESA documentation law",
    enforcementAgency: "Arkansas Fair Housing Commission and HUD/FHEO",
    landlordCanAskFor: [
      ...FHA_CAN_ASK,
      "Documentation from a provider with an established relationship — Arkansas law generally expects a provider relationship (commonly cited as about 30 days) before an ESA letter is issued.",
    ],
    shortSummary:
      "Arkansas follows the federal Fair Housing Act and expects ESA documentation to come from a provider with an established relationship (commonly cited as about 30 days). Instantly-issued letters can be challenged.",
    detailLevel: "detailed",
  },
  texas: {
    stateLawName: "Federal Fair Housing Act (Texas)",
    enforcementAgency: "Texas Workforce Commission — Civil Rights Division and HUD/FHEO",
    shortSummary:
      "Texas relies on the federal Fair Housing Act for assistance animals in housing. Texas separately penalizes misrepresenting a pet as a service animal — that rule is about trained service animals, not your FHA housing accommodation for an ESA.",
    detailLevel: "detailed",
  },
  "new-york": {
    stateLawName: "Federal Fair Housing Act + New York State & NYC Human Rights Laws",
    enforcementAgency: "NY State Division of Human Rights / NYC Commission on Human Rights and HUD/FHEO",
    shortSummary:
      "New York renters are protected by the federal Fair Housing Act and by the New York State and NYC Human Rights Laws, which also require reasonable accommodations for assistance animals in housing.",
    detailLevel: "detailed",
  },
  tennessee: {
    stateLawName: "Federal Fair Housing Act (Tennessee)",
    enforcementAgency: "Tennessee Human Rights Commission and HUD/FHEO",
    landlordCanAskFor: [
      ...FHA_CAN_ASK,
      "Reliable documentation from a licensed provider — Tennessee specifically addresses knowingly misrepresenting a need for an assistance animal.",
    ],
    shortSummary:
      "Tennessee follows the federal Fair Housing Act for assistance animals in housing and addresses knowingly misrepresenting an ESA need. Genuine documentation from a licensed provider is what matters.",
    detailLevel: "detailed",
  },
  missouri: {
    stateLawName: "Federal Fair Housing Act + Missouri ESA documentation provisions",
    enforcementAgency: "Missouri Commission on Human Rights and HUD/FHEO",
    landlordCanAskFor: [
      ...FHA_CAN_ASK,
      "Reliable documentation from a licensed provider — Missouri has provisions addressing ESA documentation and misrepresentation in housing.",
    ],
    shortSummary:
      "Missouri follows the federal Fair Housing Act and has provisions addressing ESA documentation and misrepresentation in housing. A valid letter comes from a licensed provider after a real evaluation.",
    detailLevel: "detailed",
  },
  "new-hampshire": {
    stateLawName: "Federal Fair Housing Act + New Hampshire ESA provisions",
    enforcementAgency: "New Hampshire Commission for Human Rights and HUD/FHEO",
    shortSummary:
      "New Hampshire protects assistance animals in housing under the federal Fair Housing Act, alongside state provisions addressing ESA documentation and misrepresentation. Reliable provider documentation is key.",
    detailLevel: "detailed",
  },
  "south-dakota": {
    stateLawName: "Federal Fair Housing Act (South Dakota)",
    enforcementAgency: "South Dakota Division of Human Rights and HUD/FHEO",
    shortSummary:
      "South Dakota follows the federal Fair Housing Act for assistance animals in housing. State-specific documentation rules may apply — see the South Dakota ESA guide for details.",
    detailLevel: "detailed",
  },
};

export const ESA_LANDLORD_DENIAL_LAWS: LandlordDenialStateLaw[] = STATE_INDEX.map(
  ([slug, name, abbr]) => {
    const base = baseline(slug, name, abbr);
    const override = OVERRIDES[slug];
    return override ? { ...base, ...override } : base;
  },
);

export const getLandlordDenialLawBySlug = (
  slug: string,
): LandlordDenialStateLaw | undefined =>
  ESA_LANDLORD_DENIAL_LAWS.find((s) => s.slug === slug);

/** Slugs that have a tailored, state-aware summary (priority states). */
export const DETAILED_DENIAL_STATES: string[] = ESA_LANDLORD_DENIAL_LAWS.filter(
  (s) => s.detailLevel === "detailed",
).map((s) => s.slug);
