// Safe sample campaign-draft templates for the Google Ads Campaign Builder.
// All templates: PAUSED, exact/phrase only, no broad, no AI Max, no Display,
// no Search Partners, canonical pawtenant.com URLs, no competitor names in ad
// copy (competitor names appear ONLY as keywords in the labelled competitor test).

import type { CampaignDraft } from "./googleAdsCampaignDraft";

export interface CampaignTemplate {
  key: string;
  label: string;
  description: string;
  draft: CampaignDraft;
}

const BASE = {
  objective: "leads",
  customerId: "2480853323",
  loginCustomerId: "7629508384",
  status: "PAUSED",
  bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
  networks: { googleSearch: true, searchPartners: false, displayNetwork: false },
  aiMax: { enabled: false, searchTermMatching: false, textCustomization: false, finalUrlExpansion: false, urlInclusions: [] as string[] },
  locations: ["United States"],
  languages: ["English"],
  labels: ["CLAUDE_DRAFT", "OWNER_REVIEW_REQUIRED"],
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: "esa-registry-competitor-test",
    label: "ESA Registry Competitor Test",
    description: "Competitor keywords (exact/phrase) → registry-vs-letter trust page. PKR 8,000/day. Competitor names in keywords only, never ad copy.",
    draft: {
      ...BASE,
      name: "Search - Competitor Test - ESA Registry",
      dailyBudgetPkr: 8000,
      adGroups: [
        {
          name: "Competitor - ESA Providers",
          finalUrls: ["https://pawtenant.com/esa-psd-registry-vs-letter"],
          keywords: [
            { text: "pettable esa letter", matchType: "EXACT" },
            { text: "pettable reviews", matchType: "PHRASE" },
            { text: "wellness wag esa letter", matchType: "EXACT" },
            { text: "certapet esa letter", matchType: "EXACT" },
            { text: "us service animals esa letter", matchType: "PHRASE" },
            { text: "esa registry vs esa letter", matchType: "PHRASE" },
          ],
          negativeKeywords: [
            { text: "free", matchType: "PHRASE" },
            { text: "jobs", matchType: "PHRASE" },
          ],
          responsiveSearchAds: [
            {
              headlines: [
                "ESA Letter vs ESA Registry",
                "Real Letters, Real Providers",
                "Skip Fake ESA Registries",
                "Licensed Provider ESA Letters",
                "ESA Letter For Housing",
                "Compare Before You Buy",
                "Housing-Ready ESA Letter",
                "Fast, Legitimate ESA Letters",
              ],
              descriptions: [
                "Registries and ID cards are not ESA letters. Get a real letter from a licensed provider.",
                "Landlords look for provider letters, not registry certificates. See the difference.",
                "Simple online process with licensed providers. Clear pricing, no hidden fees.",
              ],
              path1: "esa-letter",
              path2: "registry",
            },
          ],
        },
      ],
      campaignNegatives: [
        { text: "free esa letter", matchType: "PHRASE" },
        { text: "esa letter template", matchType: "PHRASE" },
      ],
      notes: "Competitor test — competitor names in keywords only. Ad copy is brand-neutral by design.",
    },
  },
  {
    key: "psd-housing-test",
    label: "PSD Housing Test",
    description: "PSD letter intent keywords (exact/phrase) → PSD guide pages. PKR 8,000/day.",
    draft: {
      ...BASE,
      name: "Search - PSD Housing Test",
      dailyBudgetPkr: 8000,
      adGroups: [
        {
          name: "PSD Letter - How To Get",
          finalUrls: ["https://pawtenant.com/how-to-get-psd-letter"],
          keywords: [
            { text: "how to get a psd letter", matchType: "EXACT" },
            { text: "psd letter", matchType: "EXACT" },
            { text: "psychiatric service dog letter", matchType: "PHRASE" },
            { text: "psd letter for housing", matchType: "PHRASE" },
          ],
          negativeKeywords: [{ text: "free", matchType: "PHRASE" }],
          responsiveSearchAds: [
            {
              headlines: [
                "Psychiatric Service Dog Letter",
                "PSD Letter From Licensed Pros",
                "Get Your PSD Letter Online",
                "PSD Letter For Housing",
                "Talk To A Licensed Provider",
                "Simple Online PSD Process",
                "Clear Pricing, No Surprises",
                "Housing Documentation Help",
              ],
              descriptions: [
                "Work with a licensed provider to see if a psychiatric service dog letter fits your needs.",
                "Straightforward online process and support at every step. Start your evaluation today.",
                "Transparent pricing and licensed providers. No registries, no gimmicks.",
              ],
              path1: "psd-letter",
              path2: "housing",
            },
          ],
        },
        {
          name: "PSD Letter - Online",
          finalUrls: ["https://pawtenant.com/psychiatric-service-dog-letter-online"],
          keywords: [
            { text: "psychiatric service dog letter online", matchType: "EXACT" },
            { text: "psd letter online", matchType: "EXACT" },
            { text: "online psychiatric service dog evaluation", matchType: "PHRASE" },
          ],
          negativeKeywords: [{ text: "free", matchType: "PHRASE" }],
          responsiveSearchAds: [
            {
              headlines: [
                "PSD Letter Online",
                "Licensed Provider Evaluation",
                "Psychiatric Service Dog Letter",
                "Online PSD Evaluation",
                "Fast, Legitimate Process",
                "Support From Real Providers",
                "Simple 3-Step Process",
                "Start Your PSD Evaluation",
              ],
              descriptions: [
                "Complete your psychiatric service dog evaluation online with a licensed provider.",
                "Clear pricing and real provider reviews. See if a PSD letter is right for you.",
              ],
              path1: "psd-letter",
              path2: "online",
            },
          ],
        },
      ],
      campaignNegatives: [
        { text: "free psd letter", matchType: "PHRASE" },
        { text: "psd letter template", matchType: "PHRASE" },
      ],
      notes: "PSD housing intent test — exact/phrase only.",
    },
  },
  {
    key: "esa-housing-expansion-test",
    label: "ESA Housing Expansion Test",
    description: "ESA housing long-tail keywords (exact/phrase) → apartment/landlord/how-to pages. PKR 10,000/day. AI Max off.",
    draft: {
      ...BASE,
      name: "Search - ESA Housing Expansion Test",
      dailyBudgetPkr: 10000,
      adGroups: [
        {
          name: "ESA Letter - Apartments",
          finalUrls: ["https://pawtenant.com/esa-letter-for-apartments"],
          keywords: [
            { text: "esa letter for apartment", matchType: "EXACT" },
            { text: "esa letter for apartments", matchType: "EXACT" },
            { text: "emotional support animal letter for apartment", matchType: "PHRASE" },
          ],
          negativeKeywords: [{ text: "free", matchType: "PHRASE" }],
          responsiveSearchAds: [
            {
              headlines: [
                "ESA Letter For Apartments",
                "Keep Your Pet In Your Rental",
                "Licensed Provider ESA Letters",
                "Housing-Ready Documentation",
                "ESA Letter From Real Providers",
                "Simple Online ESA Process",
                "Clear Pricing, Fast Turnaround",
                "Start Your ESA Evaluation",
              ],
              descriptions: [
                "Get an ESA letter from a licensed provider for your apartment. Simple online process.",
                "Housing-focused ESA letters written by licensed providers. Transparent pricing.",
                "See if you qualify for an emotional support animal letter. Start online today.",
              ],
              path1: "esa-letter",
              path2: "apartments",
            },
          ],
        },
        {
          name: "ESA Letter - Landlord",
          finalUrls: ["https://pawtenant.com/esa-letter-for-landlord"],
          keywords: [
            { text: "esa letter for landlord", matchType: "EXACT" },
            { text: "esa letter landlord", matchType: "PHRASE" },
            { text: "emotional support animal letter for landlord", matchType: "PHRASE" },
          ],
          negativeKeywords: [{ text: "free", matchType: "PHRASE" }],
          responsiveSearchAds: [
            {
              headlines: [
                "ESA Letter For Your Landlord",
                "Documentation Landlords Review",
                "Licensed Provider ESA Letters",
                "ESA Letter For Housing",
                "Simple Online Evaluation",
                "Real Providers, Real Letters",
                "Fast, Legitimate ESA Letters",
                "Start Your Evaluation Today",
              ],
              descriptions: [
                "An ESA letter from a licensed provider — the documentation landlords actually review.",
                "Simple online process with licensed providers. Clear pricing and support throughout.",
              ],
              path1: "esa-letter",
              path2: "landlord",
            },
          ],
        },
        {
          name: "ESA Letter - How To Get Online",
          finalUrls: ["https://pawtenant.com/how-to-get-esa-letter-online"],
          keywords: [
            { text: "how to get an esa letter online", matchType: "EXACT" },
            { text: "how to get esa letter", matchType: "EXACT" },
            { text: "get emotional support animal letter online", matchType: "PHRASE" },
          ],
          negativeKeywords: [{ text: "free", matchType: "PHRASE" }],
          responsiveSearchAds: [
            {
              headlines: [
                "How To Get An ESA Letter",
                "ESA Letters Online, Done Right",
                "Licensed Provider Evaluations",
                "Simple 3-Step ESA Process",
                "ESA Letter For Housing",
                "Talk To A Licensed Provider",
                "Clear Pricing, No Surprises",
                "Start Your ESA Evaluation",
              ],
              descriptions: [
                "Learn how the ESA letter process works and start your evaluation with a licensed provider.",
                "Straightforward online steps, licensed providers, and transparent pricing.",
              ],
              path1: "esa-letter",
              path2: "online",
            },
          ],
        },
      ],
      campaignNegatives: [
        { text: "free esa letter", matchType: "PHRASE" },
        { text: "esa letter template", matchType: "PHRASE" },
        { text: "esa registration", matchType: "PHRASE" },
      ],
      notes: "ESA housing expansion test — exact/phrase only, AI Max disabled by default.",
    },
  },
];

/** Pretty-printed JSON for the editor textarea. */
export function templateJson(template: CampaignTemplate): string {
  return JSON.stringify(template.draft, null, 2);
}
