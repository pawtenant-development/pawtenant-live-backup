// scripts/check-attribution-provenance.mjs
//
// ATTRIBUTION-SOURCE-IMMUTABILITY-001 — guard suite.
//
// Root incident (LIVE PT-MT1GWHXX): an organic-first lead re-opened a clean,
// manually-shared provider link; stale gclid/gbraid restored from
// localStorage were stamped into a new "google_ads" last-touch, copied into
// the previously-empty flat orders.gclid/gbraid by the lead upsert, and the
// Admin source badge flipped to Google Ads.
//
// This guard proves the canonical contract:
//   1.  First-touch source is immutable after capture.
//   2.  The primary Admin badge classifies from first-touch acquisition.
//   3.  A later touch is surfaced separately, never as the primary source.
//   4.  A clean shared provider link cannot become Paid Search.
//   5.  Internal/direct navigation cannot inherit stale click IDs into a touch.
//   6.  A direct return cannot inherit stale click IDs.
//   7.  Email/SMS resume-style links (no click params) cannot become paid.
//   8.  Email-based unpaid-order reuse cannot overwrite the original source
//       (server-side first_touch stickiness + click-ID provenance gate).
//   9.  A genuine fresh gclid in the current URL still creates a paid later
//       touch (and conversion evidence).
//   10. A genuine later paid touch does not replace the primary badge.
//   11. Conversion-upload evidence paths remain intact (uploader untouched).
//   12. Unknown click-ID provenance fails closed everywhere.
//   13. ESA and PSD flows share the same fixed path.
//   14. No raw click-ID values are logged server-side.
//
// HOW IT TESTS: the real src/lib modules are BUNDLED (esbuild, already a vite
// dependency) and EXECUTED against stubbed browser storage — behavior, not
// text. Server-side rules are asserted structurally on comment-stripped
// source (string-stripped for must-NOT scans), per the guard rules in the
// project memory.
//
// Usage:
//   node scripts/check-attribution-provenance.mjs              → run checks
//   node scripts/check-attribution-provenance.mjs --self-test  → additionally
//     plant the 9 negative controls in TEMP COPIES (never the real files) and
//     require every corresponding check to FAIL against the planted copy.
//
// CRLF: all file reads flow through readSource(), which normalizes \r\n → \n
// at the single read point so anchors and mutations behave identically on
// core.autocrlf checkouts.

import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SELF_TEST = process.argv.includes("--self-test");

// ── Single-point source reader (CRLF-normalized) ────────────────────────────
function readSource(absPath) {
  return readFileSync(absPath, "utf8").replace(/\r\n/g, "\n");
}

// Strip JS/TS comments, preserving string literals.
function stripComments(src) {
  return src.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m, str) => (str !== undefined ? str : ""),
  );
}

// Strip comments AND string literals (for must-NOT scans).
function stripCommentsAndStrings(src) {
  return src.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m, str) => (str !== undefined ? "__STR__" : ""),
  );
}

const normWs = (s) => s.replace(/\s+/g, " ");

// ── Browser-storage stubs ───────────────────────────────────────────────────
class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const env = {
  ss: new MemStorage(),
  ls: new MemStorage(),
  loc: { href: "https://pawtenant.com/", search: "", origin: "https://pawtenant.com" },
  referrer: "",
};

function installGlobals() {
  globalThis.sessionStorage = env.ss;
  globalThis.localStorage = env.ls;
  globalThis.window = {
    get location() { return env.loc; },
  };
  globalThis.document = {
    get referrer() { return env.referrer; },
  };
}

/** Simulate opening a NEW TAB at `href` (sessionStorage cleared; localStorage kept). */
function newTab(href, referrer) {
  env.ss.clear();
  const u = new URL(href);
  env.loc = { href, search: u.search, origin: u.origin };
  env.referrer = referrer ?? "";
}

/** Simulate a brand-new browser (both storages cleared). */
function newBrowser() {
  env.ls.clear();
}

// ── Bundle the real libs and import them ────────────────────────────────────
let bundleSeq = 0;
async function bundleLibs(srcDir) {
  const tmp = mkdtempSync(join(tmpdir(), "attr-prov-"));
  const entry = join(tmp, "entry.mjs");
  const storePath = join(srcDir, "attributionStore.ts").replace(/\\/g, "/");
  const classifierPath = join(srcDir, "acquisitionClassifier.ts").replace(/\\/g, "/");
  const resolverPath = join(srcDir, "attributionResolver.ts").replace(/\\/g, "/");
  writeFileSync(
    entry,
    `export * as store from ${JSON.stringify(storePath)};\n` +
    `export * as classifier from ${JSON.stringify(classifierPath)};\n` +
    `export * as resolver from ${JSON.stringify(resolverPath)};\n`,
  );
  const out = join(tmp, `bundle-${++bundleSeq}.mjs`);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: out,
    logLevel: "silent",
    define: { "import.meta.env.DEV": "false" },
  });
  installGlobals();
  const mod = await import(pathToFileURL(out).href + `?v=${bundleSeq}`);
  return { mod, tmp };
}

// ── Check registry ──────────────────────────────────────────────────────────
const failures = [];
let checksRun = 0;
function check(name, cond, detail) {
  checksRun++;
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// ── Behavioral checks against the bundled libs ─────────────────────────────
// Returns the list of failed check names (empty = all good).
async function runBehavioralChecks(srcDir) {
  const before = failures.length;
  const { mod, tmp } = await bundleLibs(srcDir);
  const { store, classifier, resolver } = mod;

  try {
    // ── Scenario chain A: organic first → stale IDs → clean shared link ───
    newBrowser();

    // A1. Organic first visit (google referrer, clean provider URL).
    newTab("https://pawtenant.com/doctors/robert-staaf", "https://www.google.com/");
    store.captureFromUrl("");
    check("A1 organic channel", store.buildChannel() === "organic_search",
      `got ${store.buildChannel()}`);
    check("A1 organic fullSource", store.buildFullSource() === "Google Organic",
      `got ${store.buildFullSource()}`);
    const ft0 = store.getOrInitFirstTouch();
    check("A1 first touch organic", ft0 && ft0.channel === "organic_search" && !ft0.gclid);

    // A2. Later, a page load carrying fresh Google click IDs (real ad click).
    newTab(
      "https://pawtenant.com/esa-letter?gclid=TESTGCLIDFRESH1&gbraid=TESTGBRAIDFRESH1",
      "https://www.google.com/",
    );
    store.captureFromUrl("?gclid=TESTGCLIDFRESH1&gbraid=TESTGBRAIDFRESH1");
    check("A2 fresh paid channel", store.buildChannel() === "google_ads",
      `got ${store.buildChannel()}`);
    const ltFresh = store.getLastTouch();
    check("A2 fresh lastTouch keeps gclid", ltFresh && ltFresh.gclid === "TESTGCLIDFRESH1");
    check("A2 provenance url", ltFresh && ltFresh.click_provenance && ltFresh.click_provenance.gclid === "url");
    // GUARD 1: first touch is immutable — the paid visit must NOT rewrite it.
    const ftAfterPaid = store.getFirstTouch();
    check("A2 first touch immutable", ftAfterPaid && ftAfterPaid.channel === "organic_search" && !ftAfterPaid.gclid,
      "paid visit rewrote the first touch");

    // A3. NEW TAB, clean manually-shared provider link (no params, no referrer).
    //     Stale IDs sit in localStorage. This is the PT-MT1GWHXX shape.
    newTab("https://pawtenant.com/doctors/cassandra-enriquez", "");
    store.captureFromUrl("");
    check("A3 clean shared link not paid", store.buildChannel() !== "google_ads",
      `channel ${store.buildChannel()} inherited stale click IDs`);
    check("A3 fullSource not Google Ads", store.buildFullSource() !== "Google Ads");
    const ltShared = store.getLastTouch();
    check("A3 lastTouch excludes stale gclid", ltShared && !ltShared.gclid && !ltShared.gbraid,
      "stale storage-restored click IDs leaked into the last touch");
    check("A3 lastTouch channel non-paid", ltShared && ltShared.channel !== "google_ads");
    check("A3 provenance recorded as storage",
      ltShared && ltShared.click_provenance && ltShared.click_provenance.gclid === "storage");
    const aj = store.buildAttributionJson("step2_lead");
    check("A3 attribution_json no stale top-level gclid", !("gclid" in aj) && !("gbraid" in aj),
      "unproven stale click ID exported to attribution_json");
    check("A3 attribution_json first_touch intact",
      aj.first_touch && aj.first_touch.channel === "organic_search");

    // A4. Link decoration must never carry click IDs (share-contamination vector).
    const qs = store.buildAttributionQueryString();
    check("A4 links carry no click IDs",
      !/(^|[?&])(gclid|gbraid|wbraid|fbclid|msclkid|ttclid)=/.test(qs),
      `decorated query ${qs}`);

    // A5. Resume-style link (credential param only) — still not paid.
    newTab("https://pawtenant.com/assessment?resume=PT-TEST1234", "");
    store.captureFromUrl("?resume=PT-TEST1234");
    check("A5 resume link not paid", store.buildChannel() !== "google_ads");
    const ltResume = store.getLastTouch();
    check("A5 resume lastTouch no click IDs", ltResume && !ltResume.gclid && !ltResume.gbraid);

    // ── A6: an ID sitting in storage with NO provenance marker at all ────
    // This is the LEGACY shape: storage written by a pre-fix bundle, or by the
    // index.html inline capture that runs before React boots. captureFromUrl's
    // restore branch never runs for it (sessionStorage is already populated),
    // so NO marker is written and the FAIL-CLOSED default is the only thing
    // standing between a stale ID and a fabricated paid touch.
    newBrowser();
    newTab("https://pawtenant.com/doctors/some-provider", "");
    env.ss.setItem("gclid", "LEGACYNOMARKERGCLID1");
    check("A6 unmarked stored id fails closed to storage",
      store.getClickIdProvenance("gclid") === "storage",
      `provenance resolved to ${store.getClickIdProvenance("gclid")} instead of storage`);
    check("A6 unmarked stored id does not make the channel paid",
      store.buildChannel() !== "google_ads",
      `channel ${store.buildChannel()} trusted an unmarked stored click ID`);
    check("A6 unmarked stored id does not make fullSource paid",
      store.buildFullSource() !== "Google Ads");
    const ltUnmarked = store.getLastTouch();
    check("A6 unmarked stored id excluded from the last touch",
      ltUnmarked && !ltUnmarked.gclid,
      "an unmarked stored click ID leaked into the last touch");
    const ajUnmarked = store.buildAttributionJson("step2_lead");
    check("A6 unmarked stored id excluded from attribution_json",
      !("gclid" in ajUnmarked),
      "an unmarked stored click ID was exported as conversion evidence");

    // ── Scenario chain B: fresh URL click IDs on a brand-new browser ──────
    newBrowser();
    newTab("https://pawtenant.com/esa-letter?gclid=TESTGCLIDNEW22", "https://www.google.com/");
    store.captureFromUrl("?gclid=TESTGCLIDNEW22");
    const ajFresh = store.buildAttributionJson("step2_lead");
    check("B1 fresh gclid kept in attribution_json", ajFresh.gclid === "TESTGCLIDNEW22",
      "a genuine fresh click ID was dropped (conversion evidence lost)");

    // ── Read-side: the PT-MT1GWHXX order shape ────────────────────────────
    const contaminatedOrder = {
      referred_by: "Google Organic",
      utm_source: null,
      gclid: "STALECONTAMINATEDGCLID",           // later-filled flat column
      fbclid: null,
      first_touch_json: {
        channel: "organic_search", fullSource: "Google Organic",
        referrer: "https://www.google.com/",
        landing_url: "https://pawtenant.com/doctors/robert-staaf",
        gclid: null, gbraid: null, captured_at: "2026-08-20T11:54:55.247Z",
      },
      last_touch_json: {
        channel: "google_ads", fullSource: "Google Ads",
        referrer: null,
        landing_url: "https://pawtenant.com/doctors/cassandra-enriquez",
        gclid: "STALECONTAMINATEDGCLID", gbraid: "STALECONTAMINATEDGBRAID",
        captured_at: "2026-08-20T19:01:52.251Z",
        // legacy touch: NO click_provenance map
      },
    };
    const cls = classifier.classifyOrder(contaminatedOrder);
    check("R1 primary badge = first touch", cls.label === "Google Organic",
      `primary classified as ${cls.label}`);
    const later = classifier.resolveLaterTouch(contaminatedOrder);
    check("R2 later touch exists", !!later);
    check("R3 later touch not paid without provenance",
      later && later.classification.label !== "Google Ads",
      `later touch classified as ${later && later.classification.label}`);
    check("R4 later touch flags suppressed click IDs", later && later.click_ids_suppressed === true);
    const res = resolver.resolveOrderAttribution(contaminatedOrder);
    check("R5 resolver primary source", res.traffic_source_final === "Google Organic",
      `resolver source ${res.traffic_source_final}`);
    check("R6 resolver later touch separate field",
      res.last_touch_source_final !== "Google Ads" && res.last_touch_source_final !== "",
      `later source ${res.last_touch_source_final}`);
    check("R7 resolver suppression flag", res.last_touch_click_ids_suppressed === "yes");

    // Genuine later paid touch (proven provenance) — shown, but never primary.
    const genuineReacq = {
      ...contaminatedOrder,
      last_touch_json: {
        ...contaminatedOrder.last_touch_json,
        gclid: "FRESHPAIDGCLID33", gbraid: null,
        click_provenance: { gclid: "url" },
        provenance_version: 1,
      },
    };
    const later2 = classifier.resolveLaterTouch(genuineReacq);
    check("R8 genuine later paid touch preserved",
      later2 && later2.classification.label === "Google Ads",
      `got ${later2 && later2.classification.label}`);
    const cls2 = classifier.classifyOrder(genuineReacq);
    check("R9 genuine later paid touch never replaces primary", cls2.label === "Google Organic");

    // Legacy order (no first touch): creation-time flat gclid still = paid.
    const legacyPaid = { gclid: "LEGACYGCLID77", referred_by: null, first_touch_json: null, last_touch_json: null };
    check("R10 legacy flat-gclid order stays Google Ads",
      classifier.classifyOrder(legacyPaid).label === "Google Ads");

    // ── R11: genuine AD-FIRST order (first touch carries the click) ───────
    const adFirst = {
      referred_by: null, gclid: "ADFIRSTGCLID88",
      first_touch_json: {
        channel: "google_ads", fullSource: "Google Ads",
        gclid: "ADFIRSTGCLID88", landing_url: "https://pawtenant.com/esa-letter",
        captured_at: "2026-08-01T00:00:00.000Z",
        click_provenance: { gclid: "url" }, provenance_version: 1,
      },
      last_touch_json: null,
    };
    check("R11 genuine ad-first order stays Google Ads",
      classifier.classifyOrder(adFirst).label === "Google Ads",
      `got ${classifier.classifyOrder(adFirst).label}`);

    // ── R12: ABSENT provenance map must fail closed (never "url") ─────────
    const absentProv = {
      referred_by: null, gclid: null,
      first_touch_json: {
        channel: "organic_search", referrer: "https://www.google.com/",
        landing_url: "https://pawtenant.com/doctors/x", captured_at: "2026-08-01T00:00:00.000Z",
      },
      last_touch_json: {
        channel: "google_ads", gclid: "NOPROVENANCEGCLID99",
        landing_url: "https://pawtenant.com/doctors/y", captured_at: "2026-08-02T00:00:00.000Z",
        // deliberately NO click_provenance key at all
      },
    };
    const absentLater = classifier.resolveLaterTouch(absentProv);
    check("R12 absent provenance fails closed (later touch not paid)",
      absentLater && absentLater.classification.label !== "Google Ads",
      `absent-provenance touch classified ${absentLater && absentLater.classification.label}`);
    check("R12b absent provenance flagged as suppressed",
      absentLater && absentLater.click_ids_suppressed === true);
    check("R12c absent provenance never becomes the primary source",
      classifier.classifyOrder(absentProv).label === "Google Organic",
      `primary ${classifier.classifyOrder(absentProv).label}`);

    // ── R13: Admin LIST badge and DETAIL tab agree (same classifier call) ─
    // OrderCard builds inputs via buildOrderAcquisitionInputs; the Journey tab
    // calls classifyOrder. Both must yield the same label for the same row.
    for (const [name, row] of [["contaminated", contaminatedOrder], ["adFirst", adFirst], ["legacy", legacyPaid]]) {
      const listLabel = classifier.classifyAcquisition(classifier.buildOrderAcquisitionInputs(row)).label;
      const detailLabel = classifier.classifyOrder(row).label;
      check(`R13 list/detail agree (${name})`, listLabel === detailLabel,
        `list=${listLabel} detail=${detailLabel}`);
    }

    // ── R14: CSV original-source field agrees with the Admin UI label ─────
    // The CSV reads resolver.traffic_source_final; the pill reads the
    // classifier label. They must describe the SAME acquisition.
    const LABEL_TO_SOURCE = {
      "Google Ads": "Google Ads", "Google Organic": "Google Organic",
      "Facebook Paid": "Meta Ads", "Direct / Unknown": "Direct",
    };
    for (const [name, row] of [["contaminated", contaminatedOrder], ["adFirst", adFirst], ["legacy", legacyPaid]]) {
      const uiLabel = classifier.classifyOrder(row).label;
      const csvSource = resolver.resolveOrderAttribution(row).traffic_source_final;
      const expected = LABEL_TO_SOURCE[uiLabel] ?? uiLabel;
      check(`R14 CSV source == UI badge (${name})`, csvSource === expected,
        `ui=${uiLabel} csv=${csvSource}`);
    }

    // ── R15: no RAW click ID is exposed by the resolver's source fields ───
    const resIncident = resolver.resolveOrderAttribution(contaminatedOrder);
    const rawId = "STALECONTAMINATEDGCLID";
    for (const f of ["traffic_source_final", "traffic_channel_final", "attribution_rule_reason",
                     "last_touch_source_final", "last_touch_channel_final", "last_touch_rule_reason"]) {
      check(`R15 ${f} carries no raw click ID`, !String(resIncident[f]).includes(rawId));
    }
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return failures.slice(before);
}

// ── Structural checks on the server + flows + uploader ─────────────────────
function runStructuralChecks(paths) {
  const before = failures.length;

  const gro = readSource(paths.getResumeOrder);
  const groCode = stripComments(gro);
  const groNoStr = stripCommentsAndStrings(gro);
  const groFlat = normWs(groCode);

  // Server: flat click-ID fills must flow through the provenance-gated candidate.
  for (const f of ["gclid", "gbraid", "wbraid", "fbclid"]) {
    check(`S1 server flat ${f} gated`,
      groFlat.includes(`stickyAttrSet(clickIdCandidate("${f}"`),
      "flat click-ID fill no longer flows through clickIdCandidate");
  }
  // Server: no direct ungated body → flat click-ID fill (must-NOT, string-stripped).
  for (const f of ["gclid", "gbraid", "wbraid", "fbclid"]) {
    check(`S2 server no direct body.${f} fill`,
      !normWs(groNoStr).includes(`stickyAttrSet(body.${f},`),
      `stickyAttrSet(body.${f}, ...) bypasses the provenance gate`);
  }
  // Server: last_touch overwrite refuses unproven click IDs.
  check("S3 server last_touch unproven gate",
    groFlat.includes("touchHasUnprovenClickIds(body.lastTouchJson)"),
    "last_touch_json overwrite no longer checks click-ID provenance");
  // Server: provenance test accepts exactly the "url" marker.
  check("S3b server url-provenance check used",
    groFlat.includes("touchClickIdIsUrlProven(body.lastTouchJson, key)"),
    "clickIdCandidate no longer verifies url provenance for last-touch IDs");
  // Server: first_touch_json stays sticky (email-reuse cannot overwrite source).
  check("S4 server first_touch sticky",
    normWs(groFlat).includes("body.firstTouchJson !== undefined && body.firstTouchJson !== null && !existingFirstTouch"),
    "first_touch_json write is no longer guarded by !existingFirstTouch");
  // Server: meaningful-touch precedence present.
  check("S5 server meaningful-touch gate",
    groFlat.includes("isMeaningfulTouch(body.lastTouchJson)"));
  // Server: no raw click-ID VALUES in logs / string interpolation.
  for (const bad of [
    "${body.gclid", "${body.gbraid", "${body.wbraid", "${body.fbclid",
    "${fromFirstTouch", "${fromLastTouch", "${legacyBodyVal",
  ]) {
    check(`S6 server never interpolates ${bad}}`, !gro.includes(bad),
      "raw click-ID value reaches a template string (logging risk)");
  }

  // Conversion uploader untouched: evidence resolution intact (guard 11).
  const uploader = readSource(paths.uploader);
  check("U1 uploader gclid evidence path intact",
    normWs(stripComments(uploader)).includes("resolveGclid(order.gclid, order.attribution_json"),
    "sync-google-ads-conversions no longer resolves gclid from order/attribution_json");

  // ESA + PSD parity: both flows send the dual-touch payload from the shared store.
  for (const [label, p] of [["ESA", paths.esaPage], ["PSD", paths.psdPage]]) {
    const page = stripComments(readSource(p));
    check(`P1 ${label} sends firstTouchJson`, /firstTouchJson:\s*firstTouchVal/.test(page));
    check(`P2 ${label} sends lastTouchJson`, /lastTouchJson:\s*lastTouchVal/.test(page));
    check(`P3 ${label} uses shared getLastTouch`, /getLastTouch/.test(page));
  }

  // ── Link decoration: EACH click identifier individually excluded ───────
  {
    const storeSrcL = readSource(paths.store);
    const linkBlock = (stripComments(storeSrcL).match(/const linkFields[\s\S]*?\];/) || [""])[0];
    for (const id of ["gclid", "gbraid", "wbraid", "fbclid"]) {
      check(`L1 shared links exclude ${id}`,
        !new RegExp(`\\["${id}"`).test(linkBlock),
        `${id} is appended to internal links (share-contamination vector)`);
    }
    // UTM / ValueTrack labels must SURVIVE.
    for (const keep of ["utm_source", "utm_medium", "utm_campaign", "gad_source", "ref"]) {
      check(`L2 shared links keep ${keep}`, new RegExp(`\\["${keep}"`).test(linkBlock),
        `${keep} was dropped from link attribution`);
    }
  }

  // ── CSV column semantics: original source must NOT read last touch ─────
  {
    const exp = normWs(stripComments(readSource(paths.exportOrders)));
    check("X1 CSV Traffic Source Final = original acquisition",
      exp.includes('{ label: "Traffic Source Final", get: (o) => attr(o).traffic_source_final }'),
      "the CSV original-source column no longer reads traffic_source_final");
    check("X2 CSV exposes the later touch separately",
      exp.includes('{ label: "Last Touch Source", get: (o) => attr(o).last_touch_source_final }'));
    check("X3 CSV original-source column does not read a last-touch field",
      !/label: "Traffic Source Final", get: \(o\) => attr\(o\)\.last_touch/.test(exp),
      "CSV original source is being fed from the LATER touch");
  }

  // ── Admin Orders: every referenced live-refresh helper is DEFINED ───────
  // 4a78b0a on TEST shipped calls to notifyOrderPaid / scheduleAggregateInvalidation
  // with no definition, throwing at mount. vite does NOT type-check, so only a
  // guard catches it.
  {
    const adminSrc = stripComments(readSource(paths.adminPage));
    for (const helper of ["scheduleAggregateInvalidation", "notifyOrderPaid"]) {
      const referenced = new RegExp(`\\b${helper}\\s*\\(`).test(adminSrc);
      if (!referenced) { checksRun++; continue; }   // not used on this repo — fine
      const defined =
        new RegExp(`(const|function)\\s+${helper}\\b`).test(adminSrc) ||
        new RegExp(`import[^;]*\\b${helper}\\b[^;]*;`).test(adminSrc);
      check(`A1 admin-orders defines ${helper}`, defined,
        `${helper}() is called but never defined or imported — page crashes at mount`);
    }
  }

  // Client store: provenance markers exist and gate the channel builders.
  const storeSrc = readSource(paths.store);
  const storeCode = normWs(stripComments(storeSrc));
  check("C1 store defines provenance", storeCode.includes("function getClickIdProvenance"));
  check("C2 store gates buildChannel",
    storeCode.includes('if (fresh("fbclid", fbclid)) return "facebook_ads";'),
    "buildChannel stored-click-ID branch is no longer provenance-gated");

  return failures.slice(before);
}

// ── Real paths ──────────────────────────────────────────────────────────────
const REAL = {
  srcLib: join(ROOT, "src", "lib"),
  store: join(ROOT, "src", "lib", "attributionStore.ts"),
  classifier: join(ROOT, "src", "lib", "acquisitionClassifier.ts"),
  resolver: join(ROOT, "src", "lib", "attributionResolver.ts"),
  getResumeOrder: join(ROOT, "supabase", "functions", "get-resume-order", "index.ts"),
  uploader: join(ROOT, "supabase", "functions", "sync-google-ads-conversions", "index.ts"),
  esaPage: join(ROOT, "src", "pages", "assessment", "page.tsx"),
  psdPage: join(ROOT, "src", "pages", "psd-assessment", "page.tsx"),
  adminPage: join(ROOT, "src", "pages", "admin-orders", "page.tsx"),
  orderCard: join(ROOT, "src", "pages", "admin-orders", "components", "OrderCard.tsx"),
  journeyTab: join(ROOT, "src", "pages", "admin-orders", "components", "AttributionJourneyTab.tsx"),
  exportOrders: join(ROOT, "src", "lib", "exportOrders.ts"),
};

// ── Self-test: plant negative controls in TEMP COPIES ───────────────────────
// Each plant mutates a copy, re-runs the SAME checks, and requires at least
// one failure. The real files are never modified.
async function runSelfTest() {
  const plants = [];

  const behavioralPlant = (name, file, from, to) => plants.push({
    name, kind: "behavioral", file, from, to,
  });
  const structuralPlant = (name, file, from, to) => plants.push({
    name, kind: "structural", file, from, to,
  });

  // 1. Primary badge switched back to last-touch precedence.
  behavioralPlant("P1 badge reverts to last-touch", "acquisitionClassifier.ts",
    "if (ft) {", "if (false) {");
  // 2. Stored stale gclid treated as a fresh click (channel builder).
  behavioralPlant("P2 stale gclid treated fresh", "attributionStore.ts",
    'if (fresh("gclid", gclid) || fresh("gbraid", gbraid) || fresh("wbraid", wbraid)) return "google_ads";',
    'if (gclid) return "google_ads";');
  // 3. Shared provider link becomes Google Ads (last touch stops filtering).
  behavioralPlant("P3 lastTouch stops filtering", "attributionStore.ts",
    "gclid:         fresh(\"gclid\", data.gclid),",
    "gclid:         data.gclid,");
  // 4. First-touch overwritten during lead reuse (client snapshot side).
  behavioralPlant("P4 first-touch overwrite", "attributionStore.ts",
    "if (parsed && parsed.session_id) return parsed;",
    "if (false && parsed && parsed.session_id) return parsed;");
  // 5. Later paid touch discarded entirely.
  behavioralPlant("P5 later touch discarded", "acquisitionClassifier.ts",
    "const lt = order.last_touch_json ?? null;\n  if (!lt) return null;",
    "const lt = null;\n  if (!lt) return null;");
  // 6. Conversion uploader switched to an organic-only source.
  structuralPlant("P6 uploader loses evidence path", "uploader",
    "resolveGclid(order.gclid, order.attribution_json",
    "resolveGclid(null, null && order.attribution_json");
  // 7. Unknown provenance accepted as paid (server).
  structuralPlant("P7 server accepts unknown provenance", "getResumeOrder",
    "touchClickIdIsUrlProven(body.lastTouchJson, key)", "true");
  // 8. Raw click ID logged (server).
  structuralPlant("P8 raw click ID logged", "getResumeOrder",
    "field=${key} order=${effectiveConfirmationId}",
    "field=${key} value=${legacyBodyVal} order=${effectiveConfirmationId}");
  // 9. ESA fixed while PSD remains vulnerable.
  structuralPlant("P9 PSD drops lastTouchJson", "psdPage",
    "lastTouchJson:  lastTouchVal,", "");
  // 10. Shared link re-appends gclid.
  structuralPlant("P10 shared link appends gclid", "store",
    'const linkFields: Array<[string, string | null]> = [',
    'const linkFields: Array<[string, string | null]> = [\n    ["gclid", data.gclid],');
  // 11. Shared link re-appends gbraid.
  structuralPlant("P11 shared link appends gbraid", "store",
    'const linkFields: Array<[string, string | null]> = [',
    'const linkFields: Array<[string, string | null]> = [\n    ["gbraid", data.gbraid],');
  // 12. CSV original source fed from the LATER touch.
  structuralPlant("P12 CSV uses last touch as original source", "exportOrders",
    '{ label: "Traffic Source Final", get: (o) => attr(o).traffic_source_final }',
    '{ label: "Traffic Source Final", get: (o) => attr(o).last_touch_source_final }');
  // 13. Absent provenance treated as a URL capture (fail-OPEN).
  behavioralPlant("P13 absent provenance treated as url", "attributionStore.ts",
    'return present ? "storage" : null;', 'return present ? "url" : null;');
  // 14. Genuine ad-first classification broken.
  behavioralPlant("P14 ad-first classification broken", "acquisitionClassifier.ts",
    'gclid:        touchVal(ft, "gclid"),', 'gclid:        null,');

  // 15. Admin Orders references an undefined live-refresh helper.
  {
    const adminSrc = readSource(REAL.adminPage);
    const m = adminSrc.match(/const\s+(scheduleAggregateInvalidation|notifyOrderPaid)\s*=/);
    if (m) {
      structuralPlant("P15 admin helper definition removed", "adminPage",
        `const ${m[1]} =`, `const __removed_${m[1]} =`);
    }
  }

  let selfTestFailures = 0;
  const plantCount = plants.length;

  for (const plant of plants) {
    const tmp = mkdtempSync(join(tmpdir(), "attr-prov-plant-"));
    try {
      if (plant.kind === "behavioral") {
        // Copy the three libs + their local deps, mutate one file, re-bundle.
        const libTmp = join(tmp, "lib");
        cpSync(REAL.srcLib, libTmp, { recursive: true });
        const target = join(libTmp, plant.file);
        const src = readSource(target);
        if (!src.includes(plant.from)) {
          console.error(`[self-test] ${plant.name}: plant anchor NOT FOUND — control is vacuous`);
          selfTestFailures++;
          continue;
        }
        writeFileSync(target, src.replace(plant.from, plant.to));
        const failed = await runBehavioralChecks(libTmp);
        // Remove these expected failures from the shared list again.
        failures.length -= failed.length;
        if (failed.length === 0) {
          console.error(`[self-test] ${plant.name}: planted defect NOT detected`);
          selfTestFailures++;
        } else {
          console.log(`[self-test] ${plant.name}: detected ✓ (${failed[0]})`);
        }
      } else {
        // Structural: mutate a copy of the single file, point paths at it.
        const target = join(tmp, "mutated.ts");
        const src = readSource(REAL[plant.file] ?? plant.file);
        if (!src.includes(plant.from)) {
          console.error(`[self-test] ${plant.name}: plant anchor NOT FOUND — control is vacuous`);
          selfTestFailures++;
          continue;
        }
        // Replace EVERY occurrence — an anchor that appears twice would
        // otherwise leave the check trivially green (vacuous control).
        writeFileSync(target, src.split(plant.from).join(plant.to));
        const paths = { ...REAL, [plant.file]: target };
        const failed = runStructuralChecks(paths);
        failures.length -= failed.length;
        if (failed.length === 0) {
          console.error(`[self-test] ${plant.name}: planted defect NOT detected`);
          selfTestFailures++;
        } else {
          console.log(`[self-test] ${plant.name}: detected ✓ (${failed[0]})`);
        }
      }
    } finally {
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  console.log(`[self-test] ${plantCount - selfTestFailures}/${plantCount} planted controls detected`);
  return selfTestFailures;
}

// ── Main ────────────────────────────────────────────────────────────────────
const behavioralFailed = await runBehavioralChecks(REAL.srcLib);
const structuralFailed = runStructuralChecks(REAL);

let selfTestFailed = 0;
if (SELF_TEST) {
  selfTestFailed = await runSelfTest();
}

if (failures.length > 0) {
  console.error(`\n[check-attribution-provenance] FAILED ${failures.length}/${checksRun} checks:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exitCode = 1;
} else if (selfTestFailed > 0) {
  console.error(`\n[check-attribution-provenance] checks pass but ${selfTestFailed} planted control(s) went undetected`);
  process.exitCode = 1;
} else {
  console.log(
    `[check-attribution-provenance] OK — ${checksRun} checks passed` +
    (SELF_TEST ? " (every planted negative control detected)" : ""),
  );
}
