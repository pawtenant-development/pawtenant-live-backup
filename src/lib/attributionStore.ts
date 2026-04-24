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
 * ── MERGE RULES (LAST-TOUCH) ─────────────────────────────────────────────────
 * 1. Fresh URL campaign params OVERRIDE stale stored click IDs / UTMs.
 *    - URL utm_source  → clears stored gclid + fbclid (+derivs)
 *    - URL fbclid      → clears stored gclid + utm_*
 *    - URL gclid       → clears stored fbclid + utm_*
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

function ssDel(key: string): void {
  SS?.removeItem(key);
}

function lsGet(key: string): string | null {
  return LS?.getItem(key) || null;
}

function lsSet(key: string, value: string): void {
  LS?.setItem(key, value);
}

function lsDel(key: string): void {
  LS?.removeItem(key);
}

function clearBoth(key: string): boolean {
  const had = !!(ssGet(key) || lsGet(key));
  if (had) {
    ssDel(key);
    lsDel(key);
  }
  return had;
}

function generateSessionId(): string {
  // crypto.randomUUID() is available in all modern browsers
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalize a raw utm_source into a canonical channel string.
 * facebook / fb / instagram / ig / meta → "facebook_ads"
 * google                                  → "google_ads"
 * anything else                           → lowercased trimmed value
 */
function normalizeSource(source: string): string {
  const s = (source || "").toLowerCase().trim();
  if (!s) return "";
  if (s === "facebook" || s === "fb" || s === "instagram" || s === "ig" || s === "meta") {
    return "facebook_ads";
  }
  if (s === "google") return "google_ads";
  return s;
}

// ── Core: capture from URL params ────────────────────────────────────────────

/**
 * Called on every route change by UTMCapture in App.tsx.
 *
 * LAST-TOUCH priority: a fresh campaign touch in the URL OVERRIDES the
 * previously stored attribution from a different channel. Click IDs still
 * get stored, but stale ones from the prior touch are cleared out so
 * buildChannel / buildAttributionJson reflect the newest campaign source.
 */
export function captureFromUrl(search: string): void {
  const params = new URLSearchParams(search);
  const now = Date.now();
  const captured: Record<string, string> = {};
  const restored: Record<string, string> = {};
  const skipped: Record<string, string> = {};
  const cleared: string[] = [];

  const urlUtmSource = params.get("utm_source");
  const urlFbclid    = params.get("fbclid");
  const urlGclid     = params.get("gclid");

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

  // ── 2b. LAST-TOUCH override: clear stale attribution from OTHER channels ──
  //        Only runs when this URL itself carries a fresh campaign signal.
  if (urlUtmSource) {
    // Fresh utm_source wins over any previously stored click IDs.
    [KEYS.gclid, KEYS.fbclid, KEYS.fbc, KEYS.fbclid_ts, KEYS.gbraid, KEYS.wbraid].forEach((k) => {
      if (clearBoth(k)) cleared.push(k);
    });
  } else if (urlFbclid) {
    // Fresh fbclid wins over stale gclid and stale utm_*.
    [KEYS.gclid, KEYS.gbraid, KEYS.wbraid,
     KEYS.utm_source, KEYS.utm_medium, KEYS.utm_campaign, KEYS.utm_term, KEYS.utm_content].forEach((k) => {
      if (clearBoth(k)) cleared.push(k);
    });
    ssDel("utm_captured");
  } else if (urlGclid) {
    // Fresh gclid wins over stale fbclid and stale utm_*.
    [KEYS.fbclid, KEYS.fbc, KEYS.fbclid_ts,
     KEYS.utm_source, KEYS.utm_medium, KEYS.utm_campaign, KEYS.utm_term, KEYS.utm_content].forEach((k) => {
      if (clearBoth(k)) cleared.push(k);
    });
    ssDel("utm_captured");
  }

  // ── 3. fbclid — ALWAYS capture from URL; restore from LS if missing ───────
  if (urlFbclid) {
    ssSet(KEYS.fbclid, urlFbclid);
    lsSet(KEYS.fbclid, urlFbclid);
    const fbclidTs = String(now);
    ssSet(KEYS.fbclid_ts, fbclidTs);
    lsSet(KEYS.fbclid_ts, fbclidTs);
    const fbc = `fb.1.${fbclidTs}.${urlFbclid}`;
    ssSet(KEYS.fbc, fbc);
    lsSet(KEYS.fbc, fbc);
    captured.fbclid = urlFbclid;
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
  if (urlGclid) {
    ssSet(KEYS.gclid, urlGclid);
    lsSet(KEYS.gclid, urlGclid);
    captured.gclid = urlGclid;
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

  // ── 5. UTMs + ref ────────────────────────────────────────────────────────
  const utmFields: Array<[keyof AttributionData, string]> = [
    ["utm_source",   "utm_source"],
    ["utm_medium",   "utm_medium"],
    ["utm_campaign", "utm_campaign"],
    ["utm_term",     "utm_term"],
    ["utm_content",  "utm_content"],
  ];

  if (urlUtmSource) {
    // LAST-TOUCH: fresh utm_source in URL → OVERRIDE any previously stored UTMs.
    utmFields.forEach(([field, param]) => {
      const val = params.get(param);
      if (val) {
        const existing = ssGet(KEYS[field]);
        if (existing && existing !== val) {
          skipped[`${field}_overwrote`] = `replaced "${existing}" with "${val}"`;
        }
        ssSet(KEYS[field], val);
        captured[field] = val;
      }
    });
    // ref is still set-once
    const refVal = params.get("ref");
    if (refVal && !ssGet(KEYS.ref)) {
      ssSet(KEYS.ref, refVal);
      captured.ref = refVal;
    }
    ssSet("utm_captured", "1");
  } else if (!ssGet("utm_captured")) {
    // First-landing: capture everything that's in the URL.
    utmFields.forEach(([field, param]) => {
      const val = params.get(param);
      if (val) {
        ssSet(KEYS[field], val);
        captured[field] = val;
      }
    });
    const refVal = params.get("ref");
    if (refVal) {
      ssSet(KEYS.ref, refVal);
      captured.ref = refVal;
    }
    ssSet("utm_captured", "1");
  } else {
    // After first landing, no fresh utm_source in URL:
    // fill any still-missing UTMs (don't overwrite existing values).
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

  // ── Dev log ───────────────────────────────────────────────────────────────
  const hasActivity =
    Object.keys(captured).length > 0 ||
    Object.keys(restored).length > 0 ||
    Object.keys(skipped).length > 0 ||
    cleared.length > 0;
  if (hasActivity) {
    debugLog("captureFromUrl", {
      url: search || "(no params)",
      captured,
      restored,
      cleared: cleared.length ? cleared.join(", ") : "(none)",
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
    channel:       buildChannel(),
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
      const host = new URL(referrer).hostname.toLowerCase();
      if (host.includes("google") || host.includes("bing") || host.includes("yahoo")) return "Google Organic";
      if (host.includes("facebook") || host.includes("instagram")) return "Facebook Organic";
      return `Referral: ${host}`;
    } catch {
      return referrer;
    }
  }
  return "Direct";
}

// ── Build strict channel (canonical attribution) ──────────────────────────────
/**
 * Returns the canonical channel using a LAST-TOUCH priority.
 *
 * Priority:
 *   1. Current URL has utm_source →
 *        facebook/fb/instagram/ig/meta → "facebook_ads"
 *        google                         → "google_ads"
 *        otherwise                      → normalized utm_source (lowercased)
 *   2. Current URL has fbclid     → "facebook_ads"
 *   3. Current URL has gclid      → "google_ads"
 *   4. Stored attribution:
 *        stored fbclid            → "facebook_ads"
 *        stored gclid             → "google_ads"
 *        stored utm_source        → normalized source
 *   5. Referrer host:
 *        google|bing|yahoo        → "organic_search"
 *        facebook|instagram       → "social_organic"
 *   6. otherwise                  → "direct"
 */
export function buildChannel(): string {
  // ── 1–3. Current URL wins (last touch) ────────────────────────────────────
  const currentSearch = typeof window !== "undefined" ? window.location.search : "";
  if (currentSearch) {
    const p = new URLSearchParams(currentSearch);
    const urlUtm    = p.get("utm_source");
    const urlFbclid = p.get("fbclid");
    const urlGclid  = p.get("gclid");
    if (urlUtm) {
      const normalized = normalizeSource(urlUtm);
      if (normalized) return normalized;
    }
    if (urlFbclid) return "facebook_ads";
    if (urlGclid)  return "google_ads";
  }

  // ── 4. Stored attribution ─────────────────────────────────────────────────
  const data = getAttribution();
  const { gclid, fbclid, utm_source, referrer } = data;

  if (fbclid) return "facebook_ads";
  if (gclid)  return "google_ads";
  if (utm_source) {
    const normalized = normalizeSource(utm_source);
    if (normalized) return normalized;
  }

  // ── 5. Referrer ──────────────────────────────────────────────────────────
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      if (host.includes("google") || host.includes("bing") || host.includes("yahoo")) {
        return "organic_search";
      }
      if (host.includes("facebook") || host.includes("instagram")) {
        return "social_organic";
      }
    } catch {
      // fall through to direct
    }
  }

  // ── 6. Direct ────────────────────────────────────────────────────────────
  return "direct";
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
    console.log("channel:", buildChannel());
    console.groupEnd();
    return data;
  };
}
