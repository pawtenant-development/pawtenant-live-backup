/**
 * attributionStore.ts — Centralized attribution persistence layer.
 *
 * ── DATA MODEL ────────────────────────────────────────────────────────────────
 * {
 *   // Ad click IDs
 *   fbclid:         string | null   — Facebook/Instagram click ID
 *   gclid:          string | null   — Google Ads click ID
 *   fbc:            string | null   — fb.1.{ts}.{fbclid} — Meta CAPI fbc param
 *   fbclid_ts:      string | null   — ms timestamp when fbclid was first seen
 *
 *   // UTM params
 *   utm_source:     string | null
 *   utm_medium:     string | null
 *   utm_campaign:   string | null
 *   utm_term:       string | null
 *   utm_content:    string | null
 *
 *   // Custom ref
 *   ref:            string | null   — ?ref= custom label (any string)
 *
 *   // Landing context
 *   landing_url:    string | null   — first URL the user landed on
 *   referrer:       string | null   — document.referrer on first load
 *   first_seen_at:  string | null   — ISO timestamp of first session
 *
 *   // Session identity
 *   session_id:     string          — random UUID per browser session
 *
 *   // Order context (set after order creation)
 *   confirmation_id: string | null
 *   coupon_code:     string | null
 *   selected_state:  string | null
 * }
 *
 * ── STORAGE STRATEGY ─────────────────────────────────────────────────────────
 * sessionStorage: all fields — survives SPA navigation, cleared on tab close
 * localStorage:   fbclid, fbclid_ts, fbc, first_seen_at, session_id only
 *                 — survives tab close for CAPI dedup on return visits
 *
 * ── MERGE RULES ──────────────────────────────────────────────────────────────
 * 1. URL params always win over stored values (user just clicked a new ad)
 * 2. Existing non-empty stored values are NEVER overwritten with empty/null
 * 3. fbclid is special: also persisted to localStorage for cross-session survival
 * 4. landing_url, referrer, first_seen_at: only set ONCE (first landing)
 * 5. session_id: generated once per browser session, never changes
 *
 * ── DEV LOGGING ──────────────────────────────────────────────────────────────
 * All capture/restore/merge operations log to console in DEV mode only.
 * Set localStorage.debug_attribution = "1" to enable in production.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SS = typeof sessionStorage !== "undefined" ? sessionStorage : null;
const LS = typeof localStorage !== "undefined" ? localStorage : null;

const IS_DEV = import.meta.env.DEV;

function debugLog(action: string, data: Record<string, unknown>): void {
  const forceDebug = LS?.getItem("debug_attribution") === "1";
  if (!IS_DEV && !forceDebug) return;
  console.groupCollapsed(`[Attribution] ${action}`);
  console.table(data);
  console.groupEnd();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttributionData {
  // Ad click IDs — Meta
  fbclid: string | null;
  fbc: string | null;
  fbclid_ts: string | null;

  // Ad click IDs — Google
  gclid: string | null;
  gbraid: string | null;   // Google web-to-app (privacy-safe)
  wbraid: string | null;   // Google app-to-web (privacy-safe)

  // Ad click IDs — Microsoft Ads
  msclkid: string | null;

  // Ad click IDs — TikTok
  ttclid: string | null;

  // UTM params
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;

  // Custom ref
  ref: string | null;

  // Landing context
  landing_url: string | null;
  referrer: string | null;
  first_seen_at: string | null;

  // Session identity
  session_id: string;

  // Order context (populated after order creation)
  confirmation_id: string | null;
  coupon_code: string | null;
  selected_state: string | null;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const KEYS: Record<keyof AttributionData, string> = {
  fbclid:          "fbclid",
  fbc:             "fbc",
  fbclid_ts:       "fbclid_ts",
  gclid:           "gclid",
  gbraid:          "gbraid",
  wbraid:          "wbraid",
  msclkid:         "msclkid",
  ttclid:          "ttclid",
  utm_source:      "utm_source",
  utm_medium:      "utm_medium",
  utm_campaign:    "utm_campaign",
  utm_term:        "utm_term",
  utm_content:     "utm_content",
  ref:             "esa_referred_by",
  landing_url:     "landing_url",
  referrer:        "referrer",
  first_seen_at:   "first_seen_at",
  session_id:      "session_id",
  confirmation_id: "confirmation_id",
  coupon_code:     "coupon_code",
  selected_state:  "selected_state",
};

// Fields that are also persisted to localStorage (survive tab close)
const LS_KEYS: Set<keyof AttributionData> = new Set([
  "fbclid",
  "fbc",
  "fbclid_ts",
  "msclkid",
  "ttclid",
  "gbraid",
  "wbraid",
  "first_seen_at",
  "session_id",
]);

// Fields that are only set ONCE (first landing) — never overwritten
const ONCE_KEYS: Set<keyof AttributionData> = new Set([
  "landing_url",
  "referrer",
  "first_seen_at",
  "session_id",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function ssGet(key: string): string | null {
  return SS?.getItem(key) || null;
}

function ssSet(key: string, value: string): void {
  SS?.setItem(key, value);
}

function lsGet(key: string): string | null {
  return LS?.getItem(key) || null;
}

function lsSet(key: string, value: string): void {
  LS?.setItem(key, value);
}

function generateSessionId(): string {
  // crypto.randomUUID() is available in all modern browsers
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Core: capture from URL params ────────────────────────────────────────────

/**
 * Called on every route change by UTMCapture in App.tsx.
 * Merges URL params into sessionStorage/localStorage without overwriting
 * existing valid values (except fbclid which always wins from URL).
 */
export function captureFromUrl(search: string): void {
  const params = new URLSearchParams(search);
  const now = Date.now();
  const captured: Record<string, string> = {};
  const restored: Record<string, string> = {};
  const skipped: Record<string, string> = {};

  // ── 1. Session ID — generate once, never change ───────────────────────────
  const existingSessionId = ssGet(KEYS.session_id) || lsGet(KEYS.session_id);
  if (!existingSessionId) {
    const newId = generateSessionId();
    ssSet(KEYS.session_id, newId);
    lsSet(KEYS.session_id, newId);
    captured.session_id = newId;
  }

  // ── 2. first_seen_at — set once, never overwrite ──────────────────────────
  if (!ssGet(KEYS.first_seen_at) && !lsGet(KEYS.first_seen_at)) {
    const ts = new Date(now).toISOString();
    ssSet(KEYS.first_seen_at, ts);
    lsSet(KEYS.first_seen_at, ts);
    captured.first_seen_at = ts;
  } else if (!ssGet(KEYS.first_seen_at)) {
    // Restore from localStorage (returning visitor)
    const stored = lsGet(KEYS.first_seen_at)!;
    ssSet(KEYS.first_seen_at, stored);
    restored.first_seen_at = stored;
  }

  // ── 3. fbclid — ALWAYS capture from URL; restore from LS if missing ───────
  const fbclidFromUrl = params.get("fbclid");
  if (fbclidFromUrl) {
    ssSet(KEYS.fbclid, fbclidFromUrl);
    lsSet(KEYS.fbclid, fbclidFromUrl);
    const fbclidTs = String(now);
    ssSet(KEYS.fbclid_ts, fbclidTs);
    lsSet(KEYS.fbclid_ts, fbclidTs);
    const fbc = `fb.1.${fbclidTs}.${fbclidFromUrl}`;
    ssSet(KEYS.fbc, fbc);
    lsSet(KEYS.fbc, fbc);
    captured.fbclid = fbclidFromUrl;
    captured.fbc = fbc;
  } else {
    // Restore fbclid from localStorage if not in sessionStorage
    const storedFbclid = ssGet(KEYS.fbclid) || lsGet(KEYS.fbclid);
    if (storedFbclid && !ssGet(KEYS.fbclid)) {
      ssSet(KEYS.fbclid, storedFbclid);
      const storedTs = lsGet(KEYS.fbclid_ts) || String(now);
      ssSet(KEYS.fbclid_ts, storedTs);
      const storedFbc = lsGet(KEYS.fbc) || `fb.1.${storedTs}.${storedFbclid}`;
      ssSet(KEYS.fbc, storedFbc);
      restored.fbclid = storedFbclid;
      restored.fbc = storedFbc;
    }
  }

  // ── 4. gclid / gbraid / wbraid — Google click IDs ────────────────────────
  const gclidFromUrl = params.get("gclid");
  if (gclidFromUrl) {
    ssSet(KEYS.gclid, gclidFromUrl);
    lsSet(KEYS.gclid, gclidFromUrl);
    captured.gclid = gclidFromUrl;
  } else if (!ssGet(KEYS.gclid)) {
    const stored = lsGet(KEYS.gclid);
    if (stored) { ssSet(KEYS.gclid, stored); restored.gclid = stored; }
  }

  const gbraidFromUrl = params.get("gbraid");
  if (gbraidFromUrl) {
    ssSet(KEYS.gbraid, gbraidFromUrl);
    lsSet(KEYS.gbraid, gbraidFromUrl);
    captured.gbraid = gbraidFromUrl;
  } else if (!ssGet(KEYS.gbraid)) {
    const stored = lsGet(KEYS.gbraid);
    if (stored) { ssSet(KEYS.gbraid, stored); restored.gbraid = stored; }
  }

  const wbraidFromUrl = params.get("wbraid");
  if (wbraidFromUrl) {
    ssSet(KEYS.wbraid, wbraidFromUrl);
    lsSet(KEYS.wbraid, wbraidFromUrl);
    captured.wbraid = wbraidFromUrl;
  } else if (!ssGet(KEYS.wbraid)) {
    const stored = lsGet(KEYS.wbraid);
    if (stored) { ssSet(KEYS.wbraid, stored); restored.wbraid = stored; }
  }

  // ── 4b. msclkid — Microsoft Ads click ID ─────────────────────────────────
  const msclkidFromUrl = params.get("msclkid");
  if (msclkidFromUrl) {
    ssSet(KEYS.msclkid, msclkidFromUrl);
    lsSet(KEYS.msclkid, msclkidFromUrl);
    captured.msclkid = msclkidFromUrl;
  } else if (!ssGet(KEYS.msclkid)) {
    const stored = lsGet(KEYS.msclkid);
    if (stored) { ssSet(KEYS.msclkid, stored); restored.msclkid = stored; }
  }

  // ── 4c. ttclid — TikTok click ID ─────────────────────────────────────────
  const ttclidFromUrl = params.get("ttclid");
  if (ttclidFromUrl) {
    ssSet(KEYS.ttclid, ttclidFromUrl);
    lsSet(KEYS.ttclid, ttclidFromUrl);
    captured.ttclid = ttclidFromUrl;
  } else if (!ssGet(KEYS.ttclid)) {
    const stored = lsGet(KEYS.ttclid);
    if (stored) { ssSet(KEYS.ttclid, stored); restored.ttclid = stored; }
  }

  // ── 5. UTMs + ref — only capture on first landing (utm_captured flag) ─────
  if (!ssGet("utm_captured")) {
    const utmFields: Array<[keyof AttributionData, string]> = [
      ["utm_source",   "utm_source"],
      ["utm_medium",   "utm_medium"],
      ["utm_campaign", "utm_campaign"],
      ["utm_term",     "utm_term"],
      ["utm_content",  "utm_content"],
      ["ref",          "ref"],
    ];

    utmFields.forEach(([field, param]) => {
      const val = params.get(param);
      if (val) {
        ssSet(KEYS[field], val);
        captured[field] = val;
      }
    });

    // landing_url and referrer — set once
    if (!ssGet(KEYS.landing_url)) {
      const url = typeof window !== "undefined" ? window.location.href : "";
      ssSet(KEYS.landing_url, url);
      captured.landing_url = url;
    }
    if (!ssGet(KEYS.referrer)) {
      const ref = typeof document !== "undefined" ? document.referrer : "";
      ssSet(KEYS.referrer, ref);
      if (ref) captured.referrer = ref;
    }

    ssSet("utm_captured", "1");
  } else {
    // After first landing: still capture UTMs if they appear in URL (ad retargeting)
    const utmFields: Array<[keyof AttributionData, string]> = [
      ["utm_source",   "utm_source"],
      ["utm_medium",   "utm_medium"],
      ["utm_campaign", "utm_campaign"],
      ["utm_term",     "utm_term"],
      ["utm_content",  "utm_content"],
    ];
    utmFields.forEach(([field, param]) => {
      const val = params.get(param);
      const existing = ssGet(KEYS[field]);
      if (val && !existing) {
        ssSet(KEYS[field], val);
        captured[field] = val;
      } else if (val && existing && val !== existing) {
        skipped[field] = `kept "${existing}", ignored "${val}"`;
      }
    });
  }

  // ── Dev log ───────────────────────────────────────────────────────────────
  const hasActivity = Object.keys(captured).length > 0 || Object.keys(restored).length > 0;
  if (hasActivity) {
    debugLog("captureFromUrl", {
      url: search || "(no params)",
      captured,
      restored,
      skipped,
    });
  }
}

// ── Core: read full attribution snapshot ─────────────────────────────────────

/**
 * Returns the full attribution data object from sessionStorage + localStorage.
 * Safe to call anywhere — never throws.
 */
export function getAttribution(): AttributionData {
  const get = (key: keyof AttributionData): string | null => {
    const ssVal = ssGet(KEYS[key]);
    if (ssVal) return ssVal;
    // Fallback to localStorage for durable fields
    if (LS_KEYS.has(key)) return lsGet(KEYS[key]);
    return null;
  };

  const sessionId = get("session_id") || generateSessionId();

  const data: AttributionData = {
    fbclid:          get("fbclid"),
    fbc:             get("fbc"),
    fbclid_ts:       get("fbclid_ts"),
    gclid:           get("gclid"),
    gbraid:          get("gbraid"),
    wbraid:          get("wbraid"),
    msclkid:         get("msclkid"),
    ttclid:          get("ttclid"),
    utm_source:      get("utm_source"),
    utm_medium:      get("utm_medium"),
    utm_campaign:    get("utm_campaign"),
    utm_term:        get("utm_term"),
    utm_content:     get("utm_content"),
    ref:             get("ref"),
    landing_url:     get("landing_url"),
    referrer:        get("referrer"),
    first_seen_at:   get("first_seen_at"),
    session_id:      sessionId,
    confirmation_id: get("confirmation_id"),
    coupon_code:     get("coupon_code"),
    selected_state:  get("selected_state"),
  };

  return data;
}

// ── Setters for order-context fields ─────────────────────────────────────────

/** Call after order/confirmation ID is generated */
export function setConfirmationId(id: string): void {
  if (!id) return;
  ssSet(KEYS.confirmation_id, id);
  debugLog("setConfirmationId", { confirmation_id: id });
}

/** Call when a coupon is applied */
export function setCouponCode(code: string): void {
  if (!code) return;
  ssSet(KEYS.coupon_code, code);
  debugLog("setCouponCode", { coupon_code: code });
}

/** Call when user selects a state */
export function setSelectedState(state: string): void {
  if (!state) return;
  ssSet(KEYS.selected_state, state);
  debugLog("setSelectedState", { selected_state: state });
}

// ── Build attribution_json for backend payloads ───────────────────────────────

/**
 * Returns a clean attribution_json object ready to be stored in the DB.
 * Strips null values to keep the JSON compact.
 * Adds a captured_stage label for debugging.
 */
export function buildAttributionJson(stage: string): Record<string, unknown> {
  const data = getAttribution();

  const json: Record<string, unknown> = {
    session_id:    data.session_id,
    first_seen_at: data.first_seen_at,
    captured_stage: stage,
    captured_at:   new Date().toISOString(),
  };

  // Only include non-null fields
  const fields: Array<keyof AttributionData> = [
    "fbclid", "fbc", "fbclid_ts",
    "gclid", "gbraid", "wbraid",
    "msclkid", "ttclid",
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "landing_url", "referrer",
    "confirmation_id", "coupon_code", "selected_state",
  ];

  fields.forEach((key) => {
    if (data[key] !== null && data[key] !== undefined) {
      json[key] = data[key];
    }
  });

  debugLog(`buildAttributionJson [${stage}]`, json);

  return json;
}

// ── Build human-readable fullSource label ─────────────────────────────────────

export function buildFullSource(): string {
  const data = getAttribution();
  const { ref, gclid, gbraid, wbraid, fbclid, msclkid, ttclid, utm_source, utm_medium, referrer } = data;

  if (ref) return ref;
  if (gclid || gbraid || wbraid) return "Google Ads";
  if (fbclid) return "Facebook / Instagram Ads";
  if (msclkid) return "Microsoft Ads";
  if (ttclid) return "TikTok Ads";
  if (utm_source && utm_medium) return `${utm_source} / ${utm_medium}`;
  if (utm_source) return utm_source;
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host.includes("google")) return "Google Organic";
      if (host.includes("bing")) return "Bing Organic";
      if (host.includes("facebook") || host.includes("instagram")) return "Facebook Organic";
      if (host.includes("tiktok")) return "TikTok";
      if (host.includes("twitter") || host.includes("t.co")) return "Twitter / X";
      if (host.includes("youtube")) return "YouTube";
      if (host.includes("linkedin")) return "LinkedIn";
      return `Referral: ${host}`;
    } catch {
      return referrer;
    }
  }
  return "Direct";
}

// ── Build URL query string for link attribution ───────────────────────────────

/**
 * Returns a query string with all attribution params for appending to links.
 * Only includes params that have values.
 */
export function buildAttributionQueryString(existingQuery?: string): string {
  const data = getAttribution();
  const merged = new URLSearchParams(existingQuery ?? "");

  const linkFields: Array<[string, string | null]> = [
    ["fbclid",   data.fbclid],
    ["gclid",    data.gclid],
    ["gbraid",   data.gbraid],
    ["wbraid",   data.wbraid],
    ["msclkid",  data.msclkid],
    ["ttclid",   data.ttclid],
    ["utm_source",   data.utm_source],
    ["utm_medium",   data.utm_medium],
    ["utm_campaign", data.utm_campaign],
    ["utm_term",     data.utm_term],
    ["utm_content",  data.utm_content],
    ["ref",      data.ref],
  ];

  linkFields.forEach(([key, value]) => {
    if (value && !merged.has(key)) {
      merged.set(key, value);
    }
  });

  const str = merged.toString();
  return str ? `?${str}` : "";
}

/**
 * Appends attribution params to a path string.
 * Skips external URLs, tel:, mailto:.
 */
export function appendAttribution(path: string): string {
  if (!path || path.startsWith("http") || path.startsWith("tel:") || path.startsWith("mailto:")) {
    return path;
  }
  const [basePath, existingQuery] = path.split("?");
  const qs = buildAttributionQueryString(existingQuery);
  return qs ? `${basePath}${qs}` : basePath;
}

// ── Debug: dump full state ────────────────────────────────────────────────────

/** Call from browser console: window.__dumpAttribution() */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__dumpAttribution = () => {
    const data = getAttribution();
    console.group("[Attribution] Full State Dump");
    console.table(data);
    console.log("attribution_json (step2_lead):", buildAttributionJson("step2_lead"));
    console.log("fullSource:", buildFullSource());
    console.groupEnd();
    return data;
  };
}
