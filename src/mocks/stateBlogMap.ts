// Maps each state slug → array of blog post slugs specifically about that state.
// Used by: /blog/state/:state pages and the blog-post sidebar "More [State] Guides" widget.
// Order matters — most important/comprehensive guides listed first.

export interface StateBlogEntry {
  stateSlug: string;
  stateName: string;
  postSlugs: string[];
  /** Short descriptor for SEO meta titles */
  descriptor: string;
}

export const STATE_BLOG_MAP: StateBlogEntry[] = [
  {
    stateSlug: "new-york",
    stateName: "New York",
    descriptor: "NYC Co-ops, Rent-Stabilized & Statewide ESA Housing Rights",
    postSlugs: [
      "new-york-esa-letter-apartment-2026",
      "new-york-esa-laws-housing-protections",
      "esa-new-york-2026-update",
      "psd-new-york-2026-guide",
      "esa-nyc-apartments-coop-rent-stabilized-2026-guide",
    ],
  },
  {
    stateSlug: "florida",
    stateName: "Florida",
    descriptor: "Miami, Fort Lauderdale, South Florida & Statewide ESA Law",
    postSlugs: [
      "florida-esa-letter-renters-2026",
      "florida-esa-laws-what-landlords-can-ask-for",
      "esa-florida-2026-update",
      "psd-florida-2026-guide",
      "esa-south-florida-miami-fort-lauderdale-2026-guide",
    ],
  },
  {
    stateSlug: "new-jersey",
    stateName: "New Jersey",
    descriptor: "Newark, Jersey City, Hoboken & NJ Law Against Discrimination",
    postSlugs: [
      "esa-new-jersey-newark-jersey-city-2026-guide",
      "esa-nyc-apartments-coop-rent-stabilized-2026-guide",
    ],
  },
  {
    stateSlug: "california",
    stateName: "California",
    descriptor: "AB 468, Los Angeles, San Francisco & Statewide ESA Law",
    postSlugs: [
      "esa-california-ab468-landlord-letter-requirements",
      "esa-california-2026-update",
      "esa-california-ab468-one-year-on",
      "esa-california-hoa-condo-rights",
      "psd-california-2026-guide",
    ],
  },
  {
    stateSlug: "texas",
    stateName: "Texas",
    descriptor: "Houston, Dallas, Austin & Texas FHA Housing Protections",
    postSlugs: [
      "esa-texas-2026-guide",
      "psd-texas-2026-guide",
    ],
  },
  {
    stateSlug: "illinois",
    stateName: "Illinois",
    descriptor: "Chicago Apartments, ILHRA & City Human Rights Ordinance",
    postSlugs: [
      "esa-illinois-chicago-2026-guide",
    ],
  },
  {
    stateSlug: "pennsylvania",
    stateName: "Pennsylvania",
    descriptor: "Philadelphia, Pittsburgh & PHRA Housing Rights",
    postSlugs: [
      "esa-pennsylvania-philadelphia-pittsburgh-2026-guide",
    ],
  },
  {
    stateSlug: "ohio",
    stateName: "Ohio",
    descriptor: "Columbus, Cleveland, Cincinnati & Ohio Civil Rights Act",
    postSlugs: [
      "esa-ohio-2026-guide",
    ],
  },
  {
    stateSlug: "georgia",
    stateName: "Georgia",
    descriptor: "Atlanta, Savannah & Georgia Fair Housing Act",
    postSlugs: [
      "esa-georgia-atlanta-2026-guide",
    ],
  },
  {
    stateSlug: "michigan",
    stateName: "Michigan",
    descriptor: "Detroit, Grand Rapids & Elliott-Larsen Civil Rights Act",
    postSlugs: [
      "esa-michigan-detroit-grand-rapids-2026-guide",
    ],
  },
  {
    stateSlug: "washington",
    stateName: "Washington",
    descriptor: "Seattle, Bellevue, Tacoma & WLAD Protections",
    postSlugs: [
      "esa-washington-state-2026-guide",
    ],
  },
  {
    stateSlug: "arizona",
    stateName: "Arizona",
    descriptor: "Phoenix, Tucson, Scottsdale & Arizona Fair Housing Act",
    postSlugs: [
      "esa-arizona-phoenix-tucson-2026-guide",
    ],
  },
  {
    stateSlug: "virginia",
    stateName: "Virginia",
    descriptor: "Northern VA, Richmond, Hampton Roads & Virginia Human Rights Act",
    postSlugs: [
      "esa-virginia-northern-va-richmond-2026-guide",
    ],
  },
  {
    stateSlug: "colorado",
    stateName: "Colorado",
    descriptor: "Denver, Boulder, Colorado Springs & CADA Protections",
    postSlugs: [
      "esa-colorado-denver-2026-guide",
    ],
  },
  {
    stateSlug: "maryland",
    stateName: "Maryland",
    descriptor: "Baltimore, Montgomery County & MFEPA Housing Rights",
    postSlugs: [
      "esa-maryland-baltimore-2026-guide",
    ],
  },
];

/** Lookup a state entry by its slug */
export function getStateBlogEntry(stateSlug: string): StateBlogEntry | undefined {
  return STATE_BLOG_MAP.find((e) => e.stateSlug === stateSlug);
}

/** Detect which state (if any) a blog post slug belongs to */
export function detectStateFromSlug(postSlug: string): StateBlogEntry | undefined {
  return STATE_BLOG_MAP.find((e) => e.postSlugs.includes(postSlug));
}
