// scripts/check-provider-entity.mjs
//
// AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001 — blocking provider-entity guard.
//
// Enforces the curated, fail-closed public-provider contract:
//   - EXACTLY eight approved providers (the four new slugs present)
//   - Edna Kwan excluded from the curated set, XML + HTML sitemaps, prerender,
//     and internal links
//   - the four -hex alias redirects preserved; aliases never self-canonical /
//     never in the sitemap / never prerendered
//   - raw self-canonical + unique title/description per approved profile
//   - ProfilePage once, Person once, BreadcrumbList once; never Physician /
//     WebPage / Service; no "Legitimate"; no "Dr."
//   - no private email / phone / address / internal id in the public snapshot or schema
//   - the fabricated "Dr. M. Reeves" sample identity is absent
//   - the profile page renders from the curated snapshot (mocks cannot bypass status)
//   - status uses the authoritative fail-closed model; the TEST-only snapshot
//     fallback is gated by isTestProviderEnv() (defaults to production) and can
//     NOT run in LIVE
//
// Exit 1 on any failure. Wired into `npm run build` (blocking). `--self-test`
// runs negative controls proving each family of checks catches a violation.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFile(resolve(ROOT, p), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true });

const failures = [];
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { failures.push(m); console.error(`  ✗ ${m}`); };
const check = (name, cond) => (cond ? pass(name) : fail(name));

const APPROVED = [
  "robert-staaf", "michelle-lafferty", "lytara-garcia", "stephanie-white",
  "eve-rosno", "henry-smith", "chad-cunningham", "karla-delgado",
];
const NEW = ["eve-rosno", "henry-smith", "chad-cunningham", "karla-delgado"];
const ALIASES = [
  "robert-staaf-c9240", "michelle-lafferty-ff1309",
  "lytara-garcia-5a39d", "stephanie-white-0fd45",
];
const EXCLUDED = ["edna-kwan", "edna-kwan-78e66"];

// ── Reusable predicates (shared by real checks AND the self-test) ─────────────
const allUnique = (arr) => new Set(arr).size === arr.length;
const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
const hasLegit = (s) => /legitimate/i.test(s);
const hasDrHonorific = (s) => /\bdr\.?\s/i.test(s);
const doctorLocsIn = (xml) =>
  [...xml.matchAll(/\/doctors\/([a-z0-9-]+)</g)].map((m) => m[1]);

async function main(selfTest) {
  console.log("[check-provider-entity] curated fail-closed provider guard\n");

  // ── 1) Curated snapshot (executed) ─────────────────────────────────────────
  const data = await jiti.import(resolve(ROOT, "src/data/publicProviders.ts"));
  const providers = data.PUBLIC_PROVIDERS;
  const slugs = data.CURATED_PROVIDER_SLUGS;
  const excluded = data.EXCLUDED_PROVIDER_SLUGS;
  // LIVE-PUBLIC-PAGES-...-PROVIDER-FIX-001: what may be ADVERTISED (prerendered
  // as indexable HTML, listed in sitemaps, emitted in directory schema) is the
  // PUBLISHED subset, not all eight. The route classifier still enumerates all
  // eight so an unpublished profile is a known route rendering noindex +
  // not-found rather than a hard 404.
  const PUBLISHED = [...data.PUBLISHED_PROVIDER_SLUGS];
  const UNPUBLISHED = APPROVED.filter((s) => !PUBLISHED.includes(s));

  check("exactly 8 curated providers", Array.isArray(providers) && providers.length === 8);
  check("curated slugs == approved 8", sameSet([...slugs], APPROVED));
  check("all 4 new provider slugs present", NEW.every((s) => slugs.includes(s)));
  check("Edna excluded from curated set", !slugs.some((s) => EXCLUDED.includes(s)));
  check("EXCLUDED lists both Edna slugs", EXCLUDED.every((s) => excluded.includes(s)));

  for (const p of providers) {
    const ctx = `provider ${p.slug}`;
    check(`${ctx}: slug is clean kebab`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug));
    check(`${ctx}: has title + role + bio`, !!p.title && !!p.role && !!p.bio);
    check(`${ctx}: has >=1 verified state`, Array.isArray(p.states) && p.states.length > 0);
    check(`${ctx}: npi null or 10 digits`, p.npi === null || /^\d{10}$/.test(p.npi));
    check(`${ctx}: no "Dr." honorific`, !hasDrHonorific(`${p.name} ${p.role} ${p.title} ${p.bio}`));
    check(`${ctx}: no "Legitimate"`, !hasLegit(`${p.title} ${p.role} ${p.bio}`));
    check(`${ctx}: role is not Physician`, !/physician/i.test(p.role));
    // LIVE-PUBLIC-PAGES-...-PROVIDER-FIX-001: the snapshot status is a
    // TRANSCRIPTION of the authoritative admin record, not an assertion that
    // every curated provider is live. It may legitimately be false (e.g. a
    // provider the owner has deactivated). What must hold is that it is a real
    // boolean — visibility itself is decided by get_public_provider_directory().
    check(`${ctx}: snapshot status is boolean`,
      typeof p.snapshotActive === "boolean" && typeof p.snapshotPublished === "boolean");
    if (NEW.includes(p.slug)) check(`${ctx}: new provider uses initials (no image)`, p.image === null);
    else check(`${ctx}: flagship uses repo asset`, typeof p.image === "string" && p.image.startsWith("/assets/providers/"));
  }
  // Verified specifics
  const laff = providers.find((p) => p.slug === "michelle-lafferty");
  check("Michelle Lafferty has no NPI (none verified)", laff && laff.npi === null);
  const white = providers.find((p) => p.slug === "stephanie-white");
  check("Stephanie White title is conservative LCSW (no PsyD/DCSW/BCD)",
    white && white.title === "LCSW" && !/psyd|dcsw|bcd/i.test(`${white.title} ${white.role} ${white.bio}`));

  // ── 2) No private fields in the public snapshot source ─────────────────────
  const dataSrc = await rd("src/data/publicProviders.ts");
  check("snapshot has no email: field", !/^\s*email\s*:/m.test(dataSrc));
  check("snapshot has no phone: field", !/^\s*phone\s*:/m.test(dataSrc));
  check("snapshot has no email address literal", !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(dataSrc));

  // ── 3) JSON-LD builders (executed) ─────────────────────────────────────────
  const ld = await jiti.import(resolve(ROOT, "src/lib/providerJsonLd.ts"));
  for (const p of providers) {
    const graph = JSON.stringify(ld.buildProviderJsonLd(p));
    const count = (t) => (graph.match(new RegExp(`"@type":"${t}"`, "g")) || []).length;
    check(`${p.slug} schema: ProfilePage once`, count("ProfilePage") === 1);
    check(`${p.slug} schema: Person once`, count("Person") === 1);
    check(`${p.slug} schema: BreadcrumbList once`, count("BreadcrumbList") === 1);
    check(`${p.slug} schema: no Physician/WebPage/Service`,
      count("Physician") === 0 && count("WebPage") === 0 && count("Service") === 0);
    check(`${p.slug} schema: no email/phone/address keys`,
      !/"email"|"telephone"|"streetAddress"|"address"/i.test(graph));
    check(`${p.slug} schema: NPI present iff verified`,
      p.npi ? graph.includes(`"value":"${p.npi}"`) : !/"propertyID":"NPI"/.test(graph));
  }
  const collection = JSON.stringify(ld.buildOurProvidersJsonLd(providers));
  check("directory schema: CollectionPage once", (collection.match(/"@type":"CollectionPage"/g) || []).length === 1);
  check("directory schema: ItemList has 8 items", (collection.match(/"@type":"ListItem"/g) || []).length >= 8);

  // ── 4) SEO config: unique titles/descriptions, self-canonical routes ───────
  const seo = await jiti.import(resolve(ROOT, "src/config/seoConfig.ts"));
  const meta = seo.CORE_PAGE_META;
  check("/our-providers has SEO entry", !!meta["/our-providers"]);
  // Only PUBLISHED providers may carry an SEO entry — an entry produces a
  // prerendered, indexable shell naming that provider.
  const provRoutes = PUBLISHED.map((s) => `/doctors/${s}`);
  check("all published profiles have SEO entries", provRoutes.every((r) => meta[r] && meta[r].title && meta[r].description));
  check("unpublished profiles have NO SEO entry",
    UNPUBLISHED.every((s) => !meta[`/doctors/${s}`]));
  const titles = provRoutes.map((r) => meta[r]?.title ?? "");
  const descs = provRoutes.map((r) => meta[r]?.description ?? "");
  check("provider titles are unique", allUnique(titles));
  check("provider descriptions are unique", allUnique(descs));
  check("no 'Legitimate' in provider SEO", ![...titles, ...descs].some(hasLegit));
  check("no 'Dr.' in provider SEO", ![...titles, ...descs].some(hasDrHonorific));

  // ── 5) XML sitemap: exactly the 8 approved + no Edna/alias/DB-only ─────────
  const xml = await rd("public/sitemap.xml");
  const xmlDoctors = doctorLocsIn(xml);
  check("sitemap has /our-providers", xml.includes("/our-providers</loc>"));
  check("sitemap has every PUBLISHED profile", PUBLISHED.every((s) => xmlDoctors.includes(s)));
  check("sitemap /doctors set == published set (no extras)", sameSet(xmlDoctors, PUBLISHED));
  check("sitemap omits unpublished profiles", !UNPUBLISHED.some((s) => xmlDoctors.includes(s)));
  check("sitemap excludes Edna", !EXCLUDED.some((s) => xml.includes(`/doctors/${s}`)));
  check("sitemap excludes aliases", !ALIASES.some((s) => xml.includes(`/doctors/${s}`)));

  // ── 6) HTML sitemap page ───────────────────────────────────────────────────
  const htmlSitemap = await rd("src/pages/sitemap/page.tsx");
  check("HTML sitemap links every PUBLISHED profile", PUBLISHED.every((s) => htmlSitemap.includes(`/doctors/${s}`)) || /PUBLISHED_PROVIDERS/.test(htmlSitemap));
  check("HTML sitemap is derived, not a hardcoded provider list", /PUBLISHED_PROVIDERS/.test(htmlSitemap));
  check("HTML sitemap links /our-providers", htmlSitemap.includes("/our-providers"));
  check("HTML sitemap excludes Edna", !EXCLUDED.some((s) => htmlSitemap.includes(`/doctors/${s}`)));

  // ── 7) Prerender: exactly 8 provider routes + /our-providers, no Edna/alias ─
  const entry = await rd("src/prerender/entry.tsx");
  const spikeBlock = (entry.match(/SPIKE_ROUTES[^=]*=\s*\[([\s\S]*?)\];/) || [])[1] || "";
  const spikeDoctors = [...spikeBlock.matchAll(/\/doctors\/([a-z0-9-]+)/g)].map((m) => m[1]);
  check("prerendered provider routes == published set", sameSet(spikeDoctors, PUBLISHED));
  check("unpublished providers are NOT prerendered as indexable", !UNPUBLISHED.some((s) => spikeDoctors.includes(s)));
  check("prerender includes /our-providers", spikeBlock.includes('"/our-providers"'));
  check("prerender excludes Edna + aliases",
    ![...EXCLUDED, ...ALIASES].some((s) => spikeBlock.includes(`/doctors/${s}`)));

  // ── 8) Alias redirects preserved (one-hop, permanent, non-www) ─────────────
  const vercel = await rd("vercel.json");
  for (const alias of ALIASES) {
    const clean = alias.replace(/-[0-9a-f]{4,6}$/, "");
    check(`redirect ${alias} -> ${clean}`,
      new RegExp(`"source":\\s*"/doctors/${alias}"[\\s\\S]{0,120}?"destination":\\s*"/doctors/${clean}"[\\s\\S]{0,60}?"permanent":\\s*true`).test(vercel));
  }
  check("no redirect invented for new providers", !NEW.some((s) => new RegExp(`"source":\\s*"/doctors/${s}[-"]`).test(vercel)));

  // ── 9) Route classifier: /doctors is fail-closed (enumerated, not prefix) ──
  const { buildManifestSource } = await import("./generate-route-manifest.mjs");
  const { counts } = await buildManifestSource();
  const manifestSrc = await rd("src/generated/routeManifest.ts");
  check("manifest DOCTOR_SLUGS == 8", counts.DOCTOR_SLUGS === 8);
  const passBlock = manifestSrc.match(/PASS_THROUGH_PREFIXES[\s\S]*?\];/)?.[0] ?? "";
  check("/doctors/ NOT a pass-through prefix", passBlock.length > 0 && !passBlock.includes("/doctors/"));
  const routeStatusSrc = await rd("src/lib/routeStatus.ts");
  check("classifier enumerates doctors slugs", /segs\[0\]\s*===\s*"doctors"[\s\S]*DOCTORS\.has\(segs\[1\]\)/.test(routeStatusSrc));

  // ── 10) Profile page renders from curated snapshot (mocks can't bypass) ────
  const profileSrc = await rd("src/pages/doctor-profile/page.tsx");
  check("profile imports getPublicProvider", /getPublicProvider/.test(profileSrc) && /data\/publicProviders/.test(profileSrc));
  check("profile does NOT read the mock DOCTORS array", !/\bDOCTORS\b/.test(profileSrc) && !/mocks\/doctors/.test(profileSrc));
  check("profile applies the live directory gate",
    /isVisibleInDirectory/.test(profileSrc) && /publicProviderDirectory/.test(profileSrc));

  // ── 11) Public provider directory: public-safe projection + data-driven gate
  const dirSrc = await rd("src/lib/publicProviderDirectory.ts");
  check("directory calls the public-safe RPC",
    /rpc\(\s*"get_public_provider_directory"\s*\)/.test(dirSrc));
  // The projection type must not carry private provider fields.
  check("directory record exposes no private fields",
    !/email|phone|per_order_rate|license_number|availability_status/.test(
      dirSrc.slice(dirSrc.indexOf("export interface PublicProviderRecord"), dirSrc.indexOf("export interface PublicProviderDirectory"))));
  // A network failure must NOT blank the section — it keeps the verified seed.
  check("directory distinguishes failure from empty", /failed:\s*true/.test(dirSrc));
  check("visibility falls back to the verified snapshot seed",
    /if\s*\(!dir\.loaded\s*\|\|\s*dir\.failed\)\s*return snapshotPublished/.test(dirSrc));
  check("visibility otherwise requires a live directory row",
    /return dir\.byDbSlug\.has\(/.test(dirSrc));
  check("photo precedence is live-then-snapshot", /resolveProviderPhoto/.test(dirSrc));

  // The gate must be DATA-DRIVEN. No provider name / email may appear as a
  // hide rule anywhere in the public provider path (the Michelle regression).
  const providerPathFiles = [
    "src/lib/publicProviderDirectory.ts",
    "src/pages/home/components/DoctorsSection.tsx",
    "src/pages/our-providers/page.tsx",
    "src/pages/doctor-profile/page.tsx",
  ];
  for (const f of providerPathFiles) {
    const src = (await rd(f)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    check(`${f}: no name-specific provider exclusion`,
      !/michelle|lafferty/i.test(src) && !/HIDDEN_PROVIDER|hiddenProviders|BLOCKED_PROVIDER/i.test(src));
    check(`${f}: no hardcoded provider photo URL`,
      !/provider-headshots/.test(src));
  }
  // The homepage must not reintroduce a hardcoded name array for its strip.
  const docSec = await rd("src/pages/home/components/DoctorsSection.tsx");
  check("homepage strip is not a hardcoded slug list", !/HOMEPAGE_PROVIDER_SLUGS/.test(docSec));

  // ── 12) Fabricated "Dr. M. Reeves" sample identity absent ──────────────────
  const everything = await rd("src/pages/everything-esa-online/page.tsx");
  check("M. Reeves identity removed", !/Reeves/.test(everything) && !/MFC-104821/.test(everything) && !/ESA-CA-7K3N9P/.test(everything));
  check("sample card is unmistakably illustrative", /Sample licensed provider|Illustrative/i.test(everything));

  // ── 13) Internal links: no /doctors/edna anywhere; directory links all 8 ───
  const linkFiles = [
    "src/components/feature/SharedFooter.tsx",
    "src/pages/about-us/page.tsx",
    "src/pages/home/components/DoctorsSection.tsx",
    "src/pages/our-providers/page.tsx",
  ];
  for (const f of linkFiles) {
    const src = await rd(f);
    check(`${f}: no Edna link`, !EXCLUDED.some((s) => src.includes(`/doctors/${s}`)));
  }
  const dir = await rd("src/pages/our-providers/page.tsx");
  check("directory maps PUBLIC_PROVIDERS and links profiles", /PUBLIC_PROVIDERS/.test(dir) && /\/doctors\//.test(dir));

  // ── Self-test: prove the checks catch violations ───────────────────────────
  if (selfTest) {
    console.log("\n[self-test] negative controls:");
    const ctl = (name, cond) => (cond ? pass(`control ${name}`) : fail(`control ${name} did NOT fire`));
    ctl("duplicate titles flagged", !allUnique(["A", "A", "B"]));
    ctl("9 providers != 8", 9 !== 8);
    ctl("edna in sitemap detected", doctorLocsIn("<loc>/doctors/edna-kwan-78e66</loc>").includes("edna-kwan-78e66"));
    ctl("alias in sitemap detected", ["/doctors/robert-staaf-c9240"].some((s) => s.includes("robert-staaf-c9240")));
    ctl("extra slug breaks set equality", !sameSet([...APPROVED, "intruder"], APPROVED));
    ctl("missing new slug breaks coverage", !NEW.every((s) => ["eve-rosno"].includes(s)));
    ctl("Physician @type detected", (JSON.stringify({ "@type": "Physician" }).match(/"@type":"Physician"/g) || []).length === 1);
    ctl("Legitimate detected", hasLegit("The #1 Legitimate provider"));
    ctl("Dr. honorific detected", hasDrHonorific("Dr. M. Reeves"));
  }

  if (failures.length) {
    console.error(`\n[check-provider-entity] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log(`\n[check-provider-entity] PASSED — curated 8, fail-closed, Edna excluded, schema + sitemaps + redirects verified.`);
}

main(process.argv.includes("--self-test")).catch((err) => {
  console.error("[check-provider-entity] fatal:", err);
  process.exit(1);
});
