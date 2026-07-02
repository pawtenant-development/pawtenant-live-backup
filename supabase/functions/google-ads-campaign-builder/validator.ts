// Google Ads Campaign Draft — schema + guardrail validator.
//
// Single source of truth for the campaign-draft shape Claude/admins produce and
// the guardrails PawTenant enforces before anything reaches the Google Ads API.
// A byte-identical copy lives at
// supabase/functions/google-ads-campaign-builder/validator.ts (Deno cannot
// import from src/, Vite cannot import from supabase/functions/). If you edit
// one, mirror the other.
//
// Hard rules (v1):
//   - New campaigns only. Never edits existing campaigns.
//   - status must be PAUSED. apply creates PAUSED campaigns only.
//   - Search only: no Display, no Search Partners (unless owner override flag).
//   - Broad match / AI Max blocked unless owner override flags are set.
//   - Final URLs must be canonical https://pawtenant.com (non-www).
//   - Competitor trademarks never appear in ad copy.

export const ALLOWED_CUSTOMER_ID = "2480853323";
export const ALLOWED_LOGIN_CUSTOMER_ID = "7629508384";
export const DEFAULT_MAX_DAILY_BUDGET_PKR = 10000;
export const CANONICAL_HOST = "pawtenant.com";

export type KeywordMatchType = "EXACT" | "PHRASE" | "BROAD";

export interface DraftKeyword {
  text: string;
  matchType: KeywordMatchType;
}

export interface DraftResponsiveSearchAd {
  headlines: string[];
  descriptions: string[];
  path1?: string;
  path2?: string;
}

export interface DraftAdGroup {
  name: string;
  finalUrls: string[];
  keywords: DraftKeyword[];
  negativeKeywords?: DraftKeyword[];
  responsiveSearchAds: DraftResponsiveSearchAd[];
}

export interface CampaignDraft {
  name: string;
  objective?: string;
  customerId: string;
  loginCustomerId?: string;
  status: string; // must be "PAUSED"
  dailyBudgetPkr: number;
  bidding?: {
    strategy?: string; // MAXIMIZE_CONVERSIONS | MAXIMIZE_CLICKS | TARGET_CPA
    targetCpaPkr?: number;
  };
  networks?: {
    googleSearch?: boolean;
    searchPartners?: boolean;
    displayNetwork?: boolean;
  };
  aiMax?: {
    enabled?: boolean;
    searchTermMatching?: boolean;
    textCustomization?: boolean;
    finalUrlExpansion?: boolean;
    urlInclusions?: string[];
  };
  locations?: string[];
  languages?: string[];
  adGroups?: DraftAdGroup[];
  campaignNegatives?: DraftKeyword[];
  labels?: string[];
  notes?: string;
  // Owner override flags — each unlocks exactly one guardrail and must be set
  // deliberately in the draft JSON by the owner.
  allowSearchPartners?: boolean;
  allowBroad?: boolean;
  allowAiMax?: boolean;
  ownerApprovedBudgetOverride?: boolean;
}

export interface DraftValidationSummary {
  campaignName: string;
  status: string;
  dailyBudgetPkr: number;
  budgetCapPkr: number;
  budgetOverride: boolean;
  biddingStrategy: string;
  networks: { googleSearch: boolean; searchPartners: boolean; displayNetwork: boolean };
  aiMaxEnabled: boolean;
  locations: string[];
  languages: string[];
  adGroupCount: number;
  keywordCount: number;
  negativeKeywordCount: number;
  rsaCount: number;
  matchTypesUsed: string[];
  finalUrls: string[];
  competitorKeywordCount: number;
}

export interface DraftValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: DraftValidationSummary | null;
}

// ── Guardrail word lists ──────────────────────────────────────────────────────

/** Competitor trademarks: never in ad copy; keywords only with warning + competitor-labelled campaign. */
export const COMPETITOR_TERMS = [
  "pettable",
  "wellness wag",
  "wellnesswag",
  "certapet",
  "us service animals",
  "usa service dogs",
  "esa doctors",
  "supportpets",
  "support pets",
];

/** Misleading/compliance-banned claims — rejected anywhere in ad copy or keywords. */
export const MISLEADING_CLAIMS = [
  "guaranteed approval",
  "approval guaranteed",
  "government-approved",
  "government approved",
  "official registry",
  "national registry",
  "official esa registry",
  "certified service dog",
  "service dog certification guaranteed",
  "avoid all fees guaranteed",
  "landlord guaranteed acceptance",
  "guaranteed acceptance",
  "fha approved",
  "hud approved",
];

/** US state slugs — used to reject legacy flat state URLs like /esa-letter-florida. */
const US_STATE_SLUGS = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new-hampshire", "new-jersey",
  "new-mexico", "new-york", "north-carolina", "north-dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode-island", "south-carolina",
  "south-dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west-virginia", "wisconsin", "wyoming", "washington-dc",
];

const FLAT_STATE_URL_RE = new RegExp(`^/(esa|psd)-letter-(${US_STATE_SLUGS.join("|")})(/|$)`, "i");

const ALLOWED_BIDDING_STRATEGIES = new Set(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "TARGET_CPA"]);
const ALLOWED_MATCH_TYPES = new Set(["EXACT", "PHRASE", "BROAD"]);

// Google Ads hard limits for RSAs
const RSA_HEADLINE_MAX_LEN = 30;
const RSA_DESCRIPTION_MAX_LEN = 90;
const RSA_PATH_MAX_LEN = 15;
const RSA_MIN_HEADLINES = 3;
const RSA_MAX_HEADLINES = 15;
const RSA_PREFERRED_HEADLINES = 8;
const RSA_MIN_DESCRIPTIONS = 2;
const RSA_MAX_DESCRIPTIONS = 4;

// Sanity caps so a malformed draft cannot fan out into a huge mutate
const MAX_AD_GROUPS = 20;
const MAX_KEYWORDS_PER_AD_GROUP = 100;
const MAX_RSAS_PER_AD_GROUP = 3;
const MAX_CAMPAIGN_NEGATIVES = 200;

function normalizeId(id: unknown): string {
  return String(id ?? "").replace(/[-\s]/g, "");
}

function containsTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function findBannedTerms(text: string, terms: string[]): string[] {
  return terms.filter((t) => containsTerm(text, t));
}

/** Validate a final URL against the canonical-origin guardrails. Returns error strings. */
function validateFinalUrl(url: string, context: string): string[] {
  const errors: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [`${context}: "${url}" is not a valid absolute URL.`];
  }
  if (parsed.protocol !== "https:") {
    errors.push(`${context}: "${url}" must use https.`);
  }
  if (parsed.hostname !== CANONICAL_HOST) {
    if (parsed.hostname === `www.${CANONICAL_HOST}`) {
      errors.push(`${context}: "${url}" uses www — canonical origin is https://${CANONICAL_HOST} (non-www).`);
    } else {
      errors.push(`${context}: "${url}" is not a PawTenant URL — only https://${CANONICAL_HOST} is allowed.`);
    }
  }
  const flatMatch = parsed.pathname.match(FLAT_STATE_URL_RE);
  if (flatMatch) {
    const canonical = parsed.pathname.replace(/^\/(esa|psd)-letter-/i, "/$1-letter/");
    errors.push(
      `${context}: "${parsed.pathname}" is a legacy flat state URL — use the canonical path "${canonical}" instead.`,
    );
  }
  return errors;
}

function validateKeyword(kw: DraftKeyword, context: string, errors: string[]): void {
  const text = (kw?.text ?? "").trim();
  if (!text) {
    errors.push(`${context}: keyword text is empty.`);
    return;
  }
  if (text.length > 80) errors.push(`${context}: keyword "${text.slice(0, 40)}…" exceeds 80 characters.`);
  if (text.split(/\s+/).length > 10) errors.push(`${context}: keyword "${text}" exceeds 10 words.`);
  const mt = String(kw?.matchType ?? "").toUpperCase();
  if (!ALLOWED_MATCH_TYPES.has(mt)) {
    errors.push(`${context}: keyword "${text}" has invalid matchType "${kw?.matchType}" (EXACT, PHRASE, or BROAD).`);
  }
}

/**
 * Parse raw JSON text into a draft. Throws with a readable message on bad JSON.
 */
export function parseDraftJson(jsonText: string): CampaignDraft {
  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Draft must be a JSON object.");
  }
  return parsed as CampaignDraft;
}

/**
 * Run every guardrail against a campaign draft. Pure function — no I/O.
 * errors → hard block (cannot save as passed / cannot apply).
 * warnings → allowed but surfaced for owner review.
 */
export function validateCampaignDraft(draft: CampaignDraft): DraftValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!draft || typeof draft !== "object") {
    return { valid: false, errors: ["Draft is not an object."], warnings: [], summary: null };
  }

  // ── Identity ────────────────────────────────────────────────────────────────
  const name = String(draft.name ?? "").trim();
  if (!name) errors.push("Campaign name is required.");
  if (name.length > 120) errors.push("Campaign name exceeds 120 characters.");

  const customerId = normalizeId(draft.customerId);
  if (customerId !== ALLOWED_CUSTOMER_ID) {
    errors.push(`customerId must be ${ALLOWED_CUSTOMER_ID} (PawTenant Google Ads account). Got "${draft.customerId ?? ""}".`);
  }
  if (draft.loginCustomerId !== undefined && normalizeId(draft.loginCustomerId) !== ALLOWED_LOGIN_CUSTOMER_ID) {
    errors.push(`loginCustomerId must be ${ALLOWED_LOGIN_CUSTOMER_ID} (PawTenant MCC). Got "${draft.loginCustomerId}".`);
  }

  // ── Rule 1–2: PAUSED only ───────────────────────────────────────────────────
  const status = String(draft.status ?? "").toUpperCase();
  if (status !== "PAUSED") {
    errors.push(`status must be "PAUSED" — enabled campaigns are never created by this tool. Got "${draft.status ?? ""}".`);
  }

  // ── Rules 3–4: networks ─────────────────────────────────────────────────────
  const networks = {
    googleSearch: draft.networks?.googleSearch !== false,
    searchPartners: draft.networks?.searchPartners === true,
    displayNetwork: draft.networks?.displayNetwork === true,
  };
  if (networks.displayNetwork) {
    errors.push("networks.displayNetwork must be false — Display campaigns/expansion are not allowed.");
  }
  if (networks.searchPartners && draft.allowSearchPartners !== true) {
    errors.push("networks.searchPartners is true — blocked unless owner sets allowSearchPartners=true in the draft.");
  } else if (networks.searchPartners) {
    warnings.push("Search Partners is enabled via owner override (allowSearchPartners=true).");
  }
  if (!networks.googleSearch) {
    errors.push("networks.googleSearch must be true — Search-only campaigns are the only supported type in v1.");
  }

  // ── Rules 6–7: AI Max ───────────────────────────────────────────────────────
  const aiMaxEnabled = draft.aiMax?.enabled === true;
  if (aiMaxEnabled) {
    if (draft.allowAiMax !== true) {
      errors.push("aiMax.enabled is true — blocked unless owner sets allowAiMax=true in the draft.");
    } else {
      warnings.push("AI Max is enabled via owner override (allowAiMax=true) — double-check settings in Google Ads before enabling the campaign.");
    }
    const inclusions = (draft.aiMax?.urlInclusions ?? []).filter((u) => typeof u === "string" && u.trim());
    if (inclusions.length === 0) {
      errors.push("AI Max requires explicit aiMax.urlInclusions — none provided.");
    }
    if (draft.aiMax?.finalUrlExpansion === true && inclusions.length === 0) {
      errors.push("aiMax.finalUrlExpansion requires aiMax.urlInclusions — final URL expansion without URL inclusions is blocked.");
    }
    for (const u of inclusions) {
      errors.push(...validateFinalUrl(u, "aiMax.urlInclusions"));
    }
  }

  // ── Rule 15: budget ─────────────────────────────────────────────────────────
  const budget = Number(draft.dailyBudgetPkr);
  const budgetOverride = draft.ownerApprovedBudgetOverride === true;
  if (!Number.isFinite(budget) || budget <= 0) {
    errors.push("dailyBudgetPkr must be a positive number (PKR per day).");
  } else if (budget > DEFAULT_MAX_DAILY_BUDGET_PKR && !budgetOverride) {
    errors.push(
      `dailyBudgetPkr ${budget.toLocaleString()} exceeds the PKR ${DEFAULT_MAX_DAILY_BUDGET_PKR.toLocaleString()}/day cap — blocked unless owner sets ownerApprovedBudgetOverride=true.`,
    );
  } else if (budget > DEFAULT_MAX_DAILY_BUDGET_PKR) {
    warnings.push(`Daily budget PKR ${budget.toLocaleString()} exceeds the default cap — owner budget override is set.`);
  }

  // ── Bidding ─────────────────────────────────────────────────────────────────
  const strategy = String(draft.bidding?.strategy ?? "MAXIMIZE_CONVERSIONS").toUpperCase();
  if (!ALLOWED_BIDDING_STRATEGIES.has(strategy)) {
    errors.push(`bidding.strategy "${draft.bidding?.strategy}" is not supported (MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, or TARGET_CPA).`);
  }
  if (strategy === "TARGET_CPA") {
    const cpa = Number(draft.bidding?.targetCpaPkr);
    if (!Number.isFinite(cpa) || cpa <= 0) {
      errors.push("bidding.strategy TARGET_CPA requires bidding.targetCpaPkr (positive PKR value).");
    } else {
      warnings.push(`Target CPA set to PKR ${cpa.toLocaleString()} — confirm this matches the approved guardrail (~PKR 30,240) before enabling.`);
    }
  }

  // ── Locations / languages (v1: US + English only, keeps geo mapping safe) ──
  const locations = (draft.locations ?? ["United States"]).map((l) => String(l).trim()).filter(Boolean);
  const languages = (draft.languages ?? ["English"]).map((l) => String(l).trim()).filter(Boolean);
  for (const loc of locations) {
    if (loc.toLowerCase() !== "united states") {
      errors.push(`locations: "${loc}" is not supported in v1 — only "United States".`);
    }
  }
  for (const lang of languages) {
    if (lang.toLowerCase() !== "english") {
      errors.push(`languages: "${lang}" is not supported in v1 — only "English".`);
    }
  }
  if (locations.length === 0) errors.push("At least one location is required (United States).");
  if (languages.length === 0) errors.push("At least one language is required (English).");

  // ── Competitor-test labelling context (rule 12) ─────────────────────────────
  const campaignLooksCompetitor = /competitor/i.test(name);

  // ── Ad groups (rules 5, 8–14) ───────────────────────────────────────────────
  const adGroups = Array.isArray(draft.adGroups) ? draft.adGroups : [];
  if (adGroups.length === 0) errors.push("At least 1 ad group is required.");
  if (adGroups.length > MAX_AD_GROUPS) errors.push(`Too many ad groups (${adGroups.length}) — max ${MAX_AD_GROUPS}.`);

  const matchTypesUsed = new Set<string>();
  const allFinalUrls: string[] = [];
  let keywordCount = 0;
  let negativeKeywordCount = 0;
  let rsaCount = 0;
  let competitorKeywordCount = 0;

  adGroups.forEach((ag, agIdx) => {
    const agName = String(ag?.name ?? "").trim();
    const agLabel = `Ad group ${agIdx + 1}${agName ? ` ("${agName}")` : ""}`;
    if (!agName) errors.push(`${agLabel}: name is required.`);

    const agLooksCompetitor = campaignLooksCompetitor || /competitor/i.test(agName);

    // Final URLs
    const finalUrls = Array.isArray(ag?.finalUrls) ? ag.finalUrls.filter((u) => typeof u === "string" && u.trim()) : [];
    if (finalUrls.length === 0) {
      errors.push(`${agLabel}: at least one valid final URL is required.`);
    }
    for (const url of finalUrls) {
      errors.push(...validateFinalUrl(url, `${agLabel} finalUrls`));
      allFinalUrls.push(url);
    }

    // Keywords
    const keywords = Array.isArray(ag?.keywords) ? ag.keywords : [];
    if (keywords.length === 0) errors.push(`${agLabel}: at least one keyword is required.`);
    if (keywords.length > MAX_KEYWORDS_PER_AD_GROUP) {
      errors.push(`${agLabel}: too many keywords (${keywords.length}) — max ${MAX_KEYWORDS_PER_AD_GROUP}.`);
    }
    keywordCount += keywords.length;

    keywords.forEach((kw) => {
      validateKeyword(kw, `${agLabel} keywords`, errors);
      const text = String(kw?.text ?? "");
      const mt = String(kw?.matchType ?? "").toUpperCase();
      if (ALLOWED_MATCH_TYPES.has(mt)) matchTypesUsed.add(mt);

      // Rule 5: broad match gate
      if (mt === "BROAD") {
        if (draft.allowBroad !== true) {
          errors.push(`${agLabel}: keyword "${text}" is BROAD match — blocked unless owner sets allowBroad=true in the draft.`);
        } else {
          warnings.push(`${agLabel}: BROAD match keyword "${text}" allowed via owner override (allowBroad=true).`);
        }
      }

      // Rules 11–12: competitor terms in keywords
      const competitorHits = findBannedTerms(text, COMPETITOR_TERMS);
      if (competitorHits.length > 0) {
        competitorKeywordCount++;
        if (agLooksCompetitor) {
          warnings.push(`${agLabel}: keyword "${text}" targets competitor term(s) [${competitorHits.join(", ")}] — allowed because this is a labelled competitor test. Never use these in ad copy.`);
        } else {
          errors.push(`${agLabel}: keyword "${text}" contains competitor term(s) [${competitorHits.join(", ")}] but the campaign/ad group is not clearly labelled as a competitor test (include "Competitor" in the name).`);
        }
      }

      // Rule 13: misleading claims even in keywords
      const claimHits = findBannedTerms(text, MISLEADING_CLAIMS);
      if (claimHits.length > 0) {
        errors.push(`${agLabel}: keyword "${text}" contains banned claim(s) [${claimHits.join(", ")}].`);
      }
    });

    // Negative keywords
    const negatives = Array.isArray(ag?.negativeKeywords) ? ag.negativeKeywords : [];
    negativeKeywordCount += negatives.length;
    negatives.forEach((kw) => validateKeyword(kw, `${agLabel} negativeKeywords`, errors));

    // RSAs (rule 14)
    const rsas = Array.isArray(ag?.responsiveSearchAds) ? ag.responsiveSearchAds : [];
    if (rsas.length === 0) errors.push(`${agLabel}: at least one responsive search ad is required.`);
    if (rsas.length > MAX_RSAS_PER_AD_GROUP) errors.push(`${agLabel}: too many RSAs (${rsas.length}) — max ${MAX_RSAS_PER_AD_GROUP}.`);
    rsaCount += rsas.length;

    rsas.forEach((rsa, rsaIdx) => {
      const rsaLabel = `${agLabel} RSA ${rsaIdx + 1}`;
      const headlines = Array.isArray(rsa?.headlines) ? rsa.headlines.filter((h) => typeof h === "string" && h.trim()) : [];
      const descriptions = Array.isArray(rsa?.descriptions) ? rsa.descriptions.filter((d) => typeof d === "string" && d.trim()) : [];

      if (headlines.length < RSA_MIN_HEADLINES) {
        errors.push(`${rsaLabel}: needs at least ${RSA_MIN_HEADLINES} headlines (has ${headlines.length}). Google Ads minimum.`);
      } else if (headlines.length < RSA_PREFERRED_HEADLINES) {
        warnings.push(`${rsaLabel}: has ${headlines.length} headlines — ${RSA_PREFERRED_HEADLINES}+ preferred for ad strength.`);
      }
      if (headlines.length > RSA_MAX_HEADLINES) errors.push(`${rsaLabel}: too many headlines (${headlines.length}) — max ${RSA_MAX_HEADLINES}.`);
      if (descriptions.length < RSA_MIN_DESCRIPTIONS) {
        errors.push(`${rsaLabel}: needs at least ${RSA_MIN_DESCRIPTIONS} descriptions (has ${descriptions.length}).`);
      }
      if (descriptions.length > RSA_MAX_DESCRIPTIONS) errors.push(`${rsaLabel}: too many descriptions (${descriptions.length}) — max ${RSA_MAX_DESCRIPTIONS}.`);

      headlines.forEach((h) => {
        if (h.length > RSA_HEADLINE_MAX_LEN) errors.push(`${rsaLabel}: headline "${h}" exceeds ${RSA_HEADLINE_MAX_LEN} characters (${h.length}).`);
      });
      descriptions.forEach((d) => {
        if (d.length > RSA_DESCRIPTION_MAX_LEN) errors.push(`${rsaLabel}: description "${d.slice(0, 50)}…" exceeds ${RSA_DESCRIPTION_MAX_LEN} characters (${d.length}).`);
      });
      for (const p of [rsa?.path1, rsa?.path2]) {
        if (p && String(p).length > RSA_PATH_MAX_LEN) errors.push(`${rsaLabel}: display path "${p}" exceeds ${RSA_PATH_MAX_LEN} characters.`);
      }

      // Rules 11 + 13: banned terms in ad copy — always errors
      const adCopy = [...headlines, ...descriptions, String(rsa?.path1 ?? ""), String(rsa?.path2 ?? "")];
      adCopy.forEach((textPiece) => {
        if (!textPiece) return;
        const competitorHits = findBannedTerms(textPiece, COMPETITOR_TERMS);
        if (competitorHits.length > 0) {
          errors.push(`${rsaLabel}: ad text "${textPiece}" contains competitor trademark(s) [${competitorHits.join(", ")}] — competitor names are never allowed in ad copy.`);
        }
        const claimHits = findBannedTerms(textPiece, MISLEADING_CLAIMS);
        if (claimHits.length > 0) {
          errors.push(`${rsaLabel}: ad text "${textPiece}" contains misleading claim(s) [${claimHits.join(", ")}].`);
        }
      });
    });
  });

  // ── Campaign-level negatives ────────────────────────────────────────────────
  const campaignNegatives = Array.isArray(draft.campaignNegatives) ? draft.campaignNegatives : [];
  if (campaignNegatives.length > MAX_CAMPAIGN_NEGATIVES) {
    errors.push(`Too many campaign negatives (${campaignNegatives.length}) — max ${MAX_CAMPAIGN_NEGATIVES}.`);
  }
  campaignNegatives.forEach((kw) => validateKeyword(kw, "campaignNegatives", errors));

  const summary: DraftValidationSummary = {
    campaignName: name,
    status,
    dailyBudgetPkr: Number.isFinite(budget) ? budget : 0,
    budgetCapPkr: DEFAULT_MAX_DAILY_BUDGET_PKR,
    budgetOverride,
    biddingStrategy: strategy,
    networks,
    aiMaxEnabled,
    locations,
    languages,
    adGroupCount: adGroups.length,
    keywordCount,
    negativeKeywordCount,
    rsaCount,
    matchTypesUsed: Array.from(matchTypesUsed),
    finalUrls: Array.from(new Set(allFinalUrls)),
    competitorKeywordCount,
  };

  return { valid: errors.length === 0, errors, warnings, summary };
}
