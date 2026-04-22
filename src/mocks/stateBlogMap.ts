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
  // ── Tier 1 — High-traffic states with multiple dedicated posts ────────────
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
    stateSlug: "new-jersey",
    stateName: "New Jersey",
    descriptor: "Newark, Jersey City, Hoboken & NJ Law Against Discrimination",
    postSlugs: [
      "esa-new-jersey-newark-jersey-city-2026-guide",
      "esa-nyc-apartments-coop-rent-stabilized-2026-guide",
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
  // ── Tier 2 — Remaining 36 states with targeted city-specific posts ────────
  {
    stateSlug: "alabama",
    stateName: "Alabama",
    descriptor: "Birmingham, Huntsville & Alabama FHA ESA Housing Rights",
    postSlugs: [
      "esa-alabama-birmingham-huntsville-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "alaska",
    stateName: "Alaska",
    descriptor: "Anchorage, Fairbanks & Alaska ESA Housing Protections",
    postSlugs: [
      "esa-alaska-anchorage-2026-guide",
      "esa-remote-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "arkansas",
    stateName: "Arkansas",
    descriptor: "Little Rock, Fayetteville & Arkansas FHA ESA Rights",
    postSlugs: [
      "esa-arkansas-little-rock-fayetteville-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "connecticut",
    stateName: "Connecticut",
    descriptor: "Hartford, New Haven & Connecticut Fair Housing ESA Rights",
    postSlugs: [
      "esa-connecticut-hartford-new-haven-2026-guide",
      "esa-northeast-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "delaware",
    stateName: "Delaware",
    descriptor: "Wilmington, Dover & Delaware Fair Housing ESA Protections",
    postSlugs: [
      "esa-delaware-wilmington-dover-2026-guide",
      "esa-northeast-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "hawaii",
    stateName: "Hawaii",
    descriptor: "Honolulu, Maui & Hawaii HRS Chapter 515 ESA Rights",
    postSlugs: [
      "esa-hawaii-honolulu-maui-2026-guide",
      "esa-hawaii-hoa-condo-rights-2026",
    ],
  },
  {
    stateSlug: "idaho",
    stateName: "Idaho",
    descriptor: "Boise, Nampa & Idaho FHA ESA Housing Rights",
    postSlugs: [
      "esa-idaho-boise-nampa-2026-guide",
      "esa-northwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "indiana",
    stateName: "Indiana",
    descriptor: "Indianapolis, Fort Wayne & Indiana FHA ESA Housing Rights",
    postSlugs: [
      "esa-indiana-indianapolis-fort-wayne-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "iowa",
    stateName: "Iowa",
    descriptor: "Des Moines, Cedar Rapids & Iowa Civil Rights Act ESA Rights",
    postSlugs: [
      "esa-iowa-des-moines-cedar-rapids-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "kansas",
    stateName: "Kansas",
    descriptor: "Wichita, Overland Park & Kansas FHA ESA Housing Rights",
    postSlugs: [
      "esa-kansas-wichita-overland-park-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "kentucky",
    stateName: "Kentucky",
    descriptor: "Louisville, Lexington & Kentucky Civil Rights Act ESA Rights",
    postSlugs: [
      "esa-kentucky-louisville-lexington-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "louisiana",
    stateName: "Louisiana",
    descriptor: "New Orleans, Baton Rouge & Louisiana FHA ESA Housing Rights",
    postSlugs: [
      "esa-louisiana-new-orleans-baton-rouge-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "maine",
    stateName: "Maine",
    descriptor: "Portland, Bangor & Maine Human Rights Act ESA Protections",
    postSlugs: [
      "esa-maine-portland-bangor-2026-guide",
      "esa-northeast-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "massachusetts",
    stateName: "Massachusetts",
    descriptor: "Boston, Worcester & Massachusetts Chapter 151B ESA Rights",
    postSlugs: [
      "esa-massachusetts-boston-worcester-2026-guide",
      "esa-massachusetts-chapter-151b-landlord-guide-2026",
    ],
  },
  {
    stateSlug: "minnesota",
    stateName: "Minnesota",
    descriptor: "Minneapolis, St. Paul & Minnesota Human Rights Act ESA Rights",
    postSlugs: [
      "esa-minnesota-minneapolis-st-paul-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "mississippi",
    stateName: "Mississippi",
    descriptor: "Jackson, Gulfport & Mississippi FHA ESA Housing Rights",
    postSlugs: [
      "esa-mississippi-jackson-gulfport-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "missouri",
    stateName: "Missouri",
    descriptor: "Kansas City, St. Louis & Missouri FHA ESA Housing Rights",
    postSlugs: [
      "esa-missouri-kansas-city-st-louis-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "montana",
    stateName: "Montana",
    descriptor: "Billings, Missoula & Montana Human Rights Act ESA Protections",
    postSlugs: [
      "esa-montana-billings-missoula-2026-guide",
      "esa-northwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "nebraska",
    stateName: "Nebraska",
    descriptor: "Omaha, Lincoln & Nebraska FHA ESA Housing Rights",
    postSlugs: [
      "esa-nebraska-omaha-lincoln-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "nevada",
    stateName: "Nevada",
    descriptor: "Las Vegas, Reno & Nevada Fair Housing Law ESA Rights",
    postSlugs: [
      "esa-nevada-las-vegas-reno-2026-guide",
      "esa-nevada-hoa-condo-rights-2026",
    ],
  },
  {
    stateSlug: "new-hampshire",
    stateName: "New Hampshire",
    descriptor: "Manchester, Nashua & NH Law Against Discrimination ESA Rights",
    postSlugs: [
      "esa-new-hampshire-manchester-nashua-2026-guide",
      "esa-northeast-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "new-mexico",
    stateName: "New Mexico",
    descriptor: "Albuquerque, Santa Fe & New Mexico Human Rights Act ESA Rights",
    postSlugs: [
      "esa-new-mexico-albuquerque-santa-fe-2026-guide",
      "esa-southwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "north-carolina",
    stateName: "North Carolina",
    descriptor: "Charlotte, Raleigh, Durham & NC FHA ESA Housing Rights",
    postSlugs: [
      "esa-north-carolina-charlotte-raleigh-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "north-dakota",
    stateName: "North Dakota",
    descriptor: "Fargo, Bismarck & North Dakota FHA ESA Housing Rights",
    postSlugs: [
      "esa-north-dakota-fargo-bismarck-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "oklahoma",
    stateName: "Oklahoma",
    descriptor: "Oklahoma City, Tulsa & Oklahoma FHA ESA Housing Rights",
    postSlugs: [
      "esa-oklahoma-oklahoma-city-tulsa-2026-guide",
      "esa-southwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "oregon",
    stateName: "Oregon",
    descriptor: "Portland, Eugene & Oregon Fair Housing Act ESA Rights",
    postSlugs: [
      "esa-oregon-portland-eugene-2026-guide",
      "esa-oregon-landlord-tenant-act-esa-2026",
    ],
  },
  {
    stateSlug: "rhode-island",
    stateName: "Rhode Island",
    descriptor: "Providence, Warwick & Rhode Island Fair Housing ESA Rights",
    postSlugs: [
      "esa-rhode-island-providence-warwick-2026-guide",
      "esa-northeast-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "south-carolina",
    stateName: "South Carolina",
    descriptor: "Charleston, Columbia & South Carolina FHA ESA Housing Rights",
    postSlugs: [
      "esa-south-carolina-charleston-columbia-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "south-dakota",
    stateName: "South Dakota",
    descriptor: "Sioux Falls, Rapid City & South Dakota FHA ESA Housing Rights",
    postSlugs: [
      "esa-south-dakota-sioux-falls-rapid-city-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "tennessee",
    stateName: "Tennessee",
    descriptor: "Nashville, Memphis, Knoxville & Tennessee FHA ESA Rights",
    postSlugs: [
      "esa-tennessee-nashville-memphis-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "utah",
    stateName: "Utah",
    descriptor: "Salt Lake City, Provo & Utah Fair Housing Act ESA Rights",
    postSlugs: [
      "esa-utah-salt-lake-city-provo-2026-guide",
      "esa-utah-hoa-condo-rights-2026",
    ],
  },
  {
    stateSlug: "vermont",
    stateName: "Vermont",
    descriptor: "Burlington, Montpelier & Vermont Fair Housing ESA Protections",
    postSlugs: [
      "esa-vermont-burlington-montpelier-2026-guide",
      "esa-northeast-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "washington-dc",
    stateName: "Washington DC",
    descriptor: "DC Human Rights Act — Strongest ESA Housing Protections in the US",
    postSlugs: [
      "esa-washington-dc-human-rights-act-2026-guide",
      "esa-dc-condo-coop-rights-2026",
    ],
  },
  {
    stateSlug: "west-virginia",
    stateName: "West Virginia",
    descriptor: "Charleston, Huntington & West Virginia FHA ESA Housing Rights",
    postSlugs: [
      "esa-west-virginia-charleston-huntington-2026-guide",
      "esa-housing-rights-southeast-states-2026",
    ],
  },
  {
    stateSlug: "wisconsin",
    stateName: "Wisconsin",
    descriptor: "Milwaukee, Madison & Wisconsin Open Housing Law ESA Rights",
    postSlugs: [
      "esa-wisconsin-milwaukee-madison-2026-guide",
      "esa-midwest-states-housing-rights-2026",
    ],
  },
  {
    stateSlug: "wyoming",
    stateName: "Wyoming",
    descriptor: "Cheyenne, Casper & Wyoming FHA ESA Housing Rights",
    postSlugs: [
      "esa-wyoming-cheyenne-casper-2026-guide",
      "esa-northwest-states-housing-rights-2026",
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
