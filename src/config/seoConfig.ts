/**
 * Centralized SEO metadata. Source of truth for page titles, descriptions,
 * and canonical URL construction. Consumed by SEOManager on every route
 * change so that each page emits its own self-referencing canonical and
 * unique title/description.
 */

export const BASE_URL = "https://www.pawtenant.com";

export interface SEOEntry {
  title: string;
  description: string;
}

// ── Core static pages ────────────────────────────────────────────────────────
export const CORE_PAGE_META: Record<string, SEOEntry> = {
  "/": {
    title: "Legitimate ESA Letter Online | Licensed Professionals",
    description:
      "Get a legitimate ESA letter from licensed mental health professionals. Valid in all US states. HIPAA-secure, same-day delivery, 100% money-back guarantee.",
  },
  "/assessment": {
    title: "Apply for Your ESA Letter | Start Your Evaluation | PawTenant",
    description:
      "Begin your ESA letter application in minutes. Answer a short questionnaire, connect with a licensed LMHP, and receive your ESA letter fast.",
  },
  "/how-to-get-esa-letter": {
    title: "How to Get an ESA Letter | Step-by-Step Guide | PawTenant",
    description:
      "Learn how to get a legitimate ESA letter from a licensed professional. Follow our simple step-by-step process and receive your letter within 24 hours.",
  },
  "/housing-rights-esa": {
    title: "ESA Housing Rights Explained | Fair Housing Act | PawTenant",
    description:
      "Understand your housing rights with an emotional support animal. Learn how the Fair Housing Act protects ESA owners and keeps you and your pet together.",
  },
  "/esa-letter-cost": {
    title: "Affordable ESA Letter | Legitimate & Fast | PawTenant",
    description:
      "Get an affordable ESA letter without sacrificing legitimacy. Licensed professionals issue your letter within 24 hours. Protect your housing rights at a fair price.",
  },
  "/explore-esa-letters-all-states": {
    title: "ESA Letter by State | All 50 US States | PawTenant",
    description:
      "Find ESA letter requirements for your state. PawTenant connects you with licensed professionals in all 50 US states. Know your rights and get your letter today.",
  },
  "/all-about-service-dogs": {
    title: "Psychiatric Service Dog Letter Online 2026 — PSD Letter vs ESA Letter | PawTenant",
    description:
      "Get a psychiatric service dog letter (PSD letter) online from licensed mental health professionals. Learn the difference between a PSD letter and an ESA letter, and find out if you qualify. Fast, legal, HIPAA compliant.",
  },
  "/how-to-get-psd-letter": {
    title: "How to Get a Psychiatric Service Dog Letter | PawTenant",
    description:
      "Get a legitimate Psychiatric Service Dog (PSD) letter from a licensed LMHP. Speak 1-on-1 with a qualified professional and receive your PSD letter in 24 hours.",
  },
  "/about-us": {
    title: "About PawTenant | Our Network of Licensed Professionals",
    description:
      "Meet the network of licensed mental health providers at PawTenant. We prioritize clinical integrity and legal compliance to ensure your ESA is 100% valid in USA.",
  },
  "/no-risk-guarantee": {
    title: "PawTenant No-Risk Guarantee | 100% Money-Back ESA Letter Promise",
    description:
      "PawTenant's 100% money-back guarantee on every ESA letter. If you don't qualify or your landlord unlawfully denies your letter, you get a full refund — no questions asked.",
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
  "/contact-us": {
    title: "Contact PawTenant | ESA Letter Support — Email & Phone Help",
    description:
      "Contact PawTenant for ESA letter support. Call (409) 965-5885, email hello@pawtenant.com, or use our form. Mon–Fri 7am–6pm CT. Same-day ESA letter help from licensed professionals.",
  },
  "/renew-esa-letter": {
    title: "Renew Your ESA Letter in 2026 — Fast & FHA-Compliant | PawTenant",
    description:
      "ESA letters expire after 12 months. Renew your emotional support animal letter with a licensed therapist in 2026. Same-day delivery, 100% money-back guarantee. From $99.",
  },
  "/join-our-network": {
    title: "Join Our Licensed Therapist Network — Write ESA Letters & Earn | PawTenant",
    description:
      "Licensed mental health professionals: join PawTenant's LMHP network and help clients get their ESA letters. Flexible hours, competitive weekly pay, telehealth-ready. Apply in 5 minutes.",
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
  "/ESA-letter-verification": {
    title: "ESA Letter Verification for Landlords | PawTenant",
    description:
      "Landlords and property managers: verify a PawTenant ESA letter in seconds. Privacy-safe verification confirms provider license status without exposing medical information.",
  },
  "/verifiable-esa-letters": {
    title: "Verifiable ESA Letters | Landlord-Ready Documentation | PawTenant",
    description:
      "PawTenant ESA letters are fully verifiable by landlords. Each letter includes an LMHP license number and a secure verification link — no medical information exposed.",
  },
  "/sitemap": {
    title: "Sitemap | PawTenant",
    description:
      "Full sitemap of PawTenant — browse ESA letter guides, state pages, housing rights, PSD resources, blog posts, and more.",
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

function buildPSDEntry(slug: string): SEOEntry | null {
  const name = STATE_DISPLAY_NAMES[slug];
  if (!name) return null;
  return {
    title: `PSD Letter ${name} 2026 — Psychiatric Service Dog Letter | PawTenant`,
    description: `Need a PSD letter in ${name}? PawTenant connects you with ${name}-licensed mental health professionals for Psychiatric Service Dog documentation. ADA compliant, same-day delivery, 100% money-back guarantee. ${name} PSD rights explained.`,
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
