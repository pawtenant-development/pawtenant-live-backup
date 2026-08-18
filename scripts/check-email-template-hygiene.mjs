#!/usr/bin/env node
// scripts/check-email-template-hygiene.mjs
//
// EMAIL-HYGIENE-RESEND-DELIVERABILITY-001.
//
// A delivered PawTenant email tripped six Resend Insights warnings. The two
// that were real defects — a third-party Readdy-hosted logo and a set of
// off-domain links — are what this guard exists to keep out of ACTIVE email
// sources. It is deliberately narrow: it asserts what a template will actually
// EMIT, not what a comment mentions.
//
// WHAT COUNTS AS AN ACTIVE EMAIL SOURCE
//   - every supabase/functions/**/*.ts that builds or sends email HTML
//   - the two admin surfaces that ship email HTML of their own
// Explicitly NOT scanned: docs/, outputs/, supabase/migrations/ (historical
// seeds — rewriting a shipped migration would rewrite history), and the
// communications/email records in the database (already-sent mail is a record,
// not a template).
//
// COMMENTS ARE STRIPPED, STRING LITERALS ARE NOT. The forbidden thing here IS
// a string literal — a URL in an <img src>. Stripping literals would make
// every "must NOT contain" assertion vacuously true. Comments are stripped
// because a comment naming a banned host is a mention, not a use; notify-
// patient-letter genuinely documents a search.google.com writereview URL it
// does not emit.
//
// ACCEPTED EXCEPTIONS are listed in ALLOWED with an owner decision recorded
// against each. An exception is per (rule, file) — a NEW occurrence elsewhere
// still fails.
//
// Part A scans the real tree. Part B (--self-test) feeds each forbidden
// pattern through the same scanner and requires it to be rejected, and feeds
// a clean sample through and requires it to pass. A check that only ever
// passes proves nothing.
//
// Run: node scripts/check-email-template-hygiene.mjs [--self-test]

import { readFile, readdir } from "node:fs/promises";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let passes = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { passes++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { failures++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` — ${detail}` : ""}`); }
};

// CRLF is normalised at the SINGLE read point. core.autocrlf=true otherwise
// makes \n-anchored patterns — and the planted self-test defects — vacuous.
const read = async (p) => (await readFile(p, "utf8")).replace(/\r\n/g, "\n");

const posix = (p) => p.split(sep).join("/");

// ── Comment stripping ───────────────────────────────────────────────────────
// Line and block comments only. Newlines are preserved so reported line
// numbers still point at the real source line.
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let mode = "code"; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") mode = "tpl";
      out += c; i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += "\n"; } else out += " ";
      i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && d === "/") { mode = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    // inside a string literal: copy verbatim, honour escapes
    if (c === "\\") { out += c + (d ?? ""); i += 2; continue; }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) mode = "code";
    out += c; i++; continue;
  }
  return out;
}

// ── Rules ───────────────────────────────────────────────────────────────────
const RULES = [
  { id: "readdy",          re: /readdy\.ai|static\.readdy\.ai|readdy-site\.link/gi,
    why: "third-party Readdy-hosted asset or link" },
  { id: "resend-dev",      re: /\b[\w.+-]*resend\.dev\b/gi,
    why: "resend.dev sandbox sender/host in production email" },
  { id: "http-resource",   re: /(?:src|href)\s*=\s*["'`]?http:\/\/(?!www\.w3\.org)[^\s"'`>]+/gi,
    why: "insecure http:// resource in email HTML" },
  { id: "google-search",   re: /https?:\/\/(?:www\.)?google\.[a-z.]+\/search\b/gi,
    why: "Google Search intermediary instead of the real destination" },
  { id: "raw-storage",     re: /https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\//gi,
    why: "raw Supabase storage URL in a customer-facing email" },
  { id: "placeholder",     re: /\b(?:example\.(?:com|org|net)|yourdomain\.[a-z]+|your-domain\.[a-z]+|foo\.bar)\b/gi,
    why: "placeholder / example domain" },
];

// Accepted exceptions — (rule, file) → owner decision.
const ALLOWED = [
  { rule: "google-search", file: "supabase/functions/notify-patient-letter/index.ts",
    note: "Owner decision 2026-08-18: the Google reviews URL is the live, working review destination. Bounded follow-up: swap for the GBP write-review URL once the owner supplies the Place ID (the GOOGLE_REVIEW_URL secret already takes precedence over this fallback)." },
  { rule: "google-search", file: "src/pages/admin-orders/components/CommunicationsTemplatesPanel.tsx",
    note: "Same owner decision. This file holds the letter_delivery template seed (ctaUrl) and the preview sample data (review_url) for that identical URL." },
];
const isAllowed = (ruleId, file) => ALLOWED.some((a) => a.rule === ruleId && a.file === file);

// A LOGO_URL is acceptable only when the host is PawTenant's own, over https.
export const FIRST_PARTY_LOGO =
  /LOGO_URL\s*=\s*[`"']https:\/\/(?:www\.)?(?:\$\{COMPANY_DOMAIN\}|pawtenant\.com)\//;

// A React `placeholder="admin@example.com"` on an <input> is UI chrome — it is
// never emitted into an email. Blank the VALUE (keeping the character count so
// line/column reporting stays honest) before the placeholder-domain rule runs,
// otherwise every admin form field trips it. A placeholder domain inside a real
// href/src/URL literal is untouched and still fails.
export function maskUiPlaceholders(src) {
  return src.replace(/(\bplaceholder\s*=\s*)(["'])(.*?)\2/gs,
    (_m, head, q, val) => head + q + " ".repeat(val.length) + q);
}

/** Scan one already-comment-stripped email source. Returns violations. */
export function scanEmailSource(file, strippedSrc) {
  const lines = maskUiPlaceholders(strippedSrc).split("\n");
  const out = [];
  for (const rule of RULES) {
    if (isAllowed(rule.id, file)) continue;
    lines.forEach((line, idx) => {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m;
      while ((m = re.exec(line)) !== null) {
        out.push({ rule: rule.id, why: rule.why, file, line: idx + 1, match: m[0].slice(0, 80) });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
  }
  return out;
}

// ── File discovery ──────────────────────────────────────────────────────────
const EXTRA_EMAIL_SOURCES = [
  "src/pages/admin-orders/components/BroadcastModal.tsx",
  "src/pages/admin-orders/components/CommunicationsTemplatesPanel.tsx",
];

async function walk(dir) {
  const acc = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) acc.push(...(await walk(p)));
    else if (e.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

/** An edge-function file is an email source only if it actually builds email. */
const EMAIL_MARKER = /api\.resend\.com|sendViaResend|<html|<img\s|LOGO_URL/i;

async function collectEmailSources() {
  const fnFiles = await walk(join(ROOT, "supabase", "functions"));
  const files = [];
  for (const abs of fnFiles) {
    const raw = await read(abs);
    if (EMAIL_MARKER.test(raw)) files.push({ file: posix(relative(ROOT, abs)), raw });
  }
  for (const rel of EXTRA_EMAIL_SOURCES) {
    files.push({ file: rel, raw: await read(join(ROOT, rel)) });
  }
  return files;
}

// ── Part A — the real tree ──────────────────────────────────────────────────
async function partA() {
  console.log("\nPart A — active email sources");
  const sources = await collectEmailSources();
  ok(sources.length >= 30, `discovered ${sources.length} active email sources`,
     "expected the edge-function email fleet plus the two admin email surfaces");

  const violations = [];
  for (const { file, raw } of sources) {
    violations.push(...scanEmailSource(file, stripComments(raw)));
  }

  for (const rule of RULES) {
    const hits = violations.filter((v) => v.rule === rule.id);
    ok(hits.length === 0, `no ${rule.id} (${rule.why})`,
       hits.slice(0, 6).map((h) => `${h.file}:${h.line} ${h.match}`).join(" | "));
  }

  // The logo every email header uses must be first-party and explicit. `www.`
  // is accepted because it is still PawTenant-controlled — it 308s to the apex
  // and serves the same image. (Worth collapsing to the canonical non-www host
  // one day to save a redirect hop, but that is a cosmetic follow-up, not a
  // hygiene defect, and this guard must not fail a first-party URL.)
  const withLogo = sources.filter(({ raw }) => /LOGO_URL\s*=/.test(stripComments(raw)));
  const badLogo = withLogo.filter(({ raw }) => !FIRST_PARTY_LOGO.test(stripComments(raw)));
  ok(badLogo.length === 0, `all ${withLogo.length} LOGO_URL constants are first-party PawTenant hosts`,
     badLogo.map((b) => b.file).join(", "));

  // Marketing/broadcast mail must keep its unsubscribe wiring.
  const bc = sources.find((s) => s.file.endsWith("supabase/functions/broadcast-email/index.ts"));
  ok(!!bc, "broadcast-email is present among email sources");
  if (bc) {
    const s = stripComments(bc.raw);
    ok(/buildUnsubscribeUrl\s*\(/.test(s) && /unsubscribeUrl/.test(s),
       "broadcast-email builds an unsubscribe URL");
    ok(/>\s*Unsubscribe\s*</i.test(s),
       "broadcast-email renders a visible Unsubscribe link");
  }
}

// ── Part B — negative controls ──────────────────────────────────────────────
function partB() {
  console.log("\nPart B — negative controls (each forbidden pattern must be rejected)");
  const F = "supabase/functions/__control__/index.ts";

  const planted = {
    readdy:          `const LOGO_URL = "https://static.readdy.ai/image/abc/def.png";`,
    "resend-dev":    `const FROM = "PawTenant <hello@resend.dev>";`,
    "http-resource": `const h = '<img src="http://cdn.insecure-host.net/logo.png">';`,
    "google-search": `const REVIEW = "https://www.google.com/search?q=PawTenant+Reviews";`,
    "raw-storage":   `const dl = "https://abcdefgh.supabase.co/storage/v1/object/sign/letters/x.pdf";`,
    placeholder:     `const PORTAL = "https://example.com/my-orders";`,
  };
  for (const [ruleId, src] of Object.entries(planted)) {
    const hits = scanEmailSource(F, stripComments(src));
    ok(hits.some((h) => h.rule === ruleId), `planted ${ruleId} is rejected`,
       `scanner returned ${JSON.stringify(hits.map((h) => h.rule))}`);
  }

  // Clean control — must PASS, otherwise the scanner rejects everything and
  // the controls above are meaningless.
  const clean = `const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const PORTAL_URL = "https://pawtenant.com/my-orders";
const html = '<img src="https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png" width="160" height="56" alt="PawTenant logo">';`;
  ok(scanEmailSource(F, stripComments(clean)).length === 0,
     "clean first-party sample passes", JSON.stringify(scanEmailSource(F, stripComments(clean))));

  // Comment stripping must neutralise a MENTION...
  const mention = `// historical: the logo used to live at https://static.readdy.ai/image/a/b.png
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";`;
  ok(scanEmailSource(F, stripComments(mention)).length === 0,
     "readdy mentioned only in a comment does not fail");

  // ...but must NOT neutralise a USE. If stripComments ever ate string
  // literals, every "must NOT contain" assertion above would go vacuous.
  const use = `const LOGO_URL = "https://static.readdy.ai/image/a/b.png"; // first-party pending`;
  ok(scanEmailSource(F, stripComments(use)).some((h) => h.rule === "readdy"),
     "readdy USED in a literal still fails even with a trailing comment");

  // The placeholder mask must neutralise UI chrome...
  const uiPlaceholder = `<input type="email" placeholder="admin@example.com" className="x" />`;
  ok(scanEmailSource(F, stripComments(uiPlaceholder)).length === 0,
     "example.com in a React input placeholder does not fail");

  // ...but must NOT hide a placeholder domain that a template would emit.
  const emittedPlaceholder = `const html = '<a href="https://example.com/my-orders">Portal</a>';`;
  ok(scanEmailSource(F, stripComments(emittedPlaceholder)).some((h) => h.rule === "placeholder"),
     "example.com inside an emitted href still fails");

  // The first-party LOGO_URL test must accept PawTenant hosts...
  for (const good of [
    'const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";',
    'const LOGO_URL = `https://${COMPANY_DOMAIN}/assets/brand/pawtenant-logo-white-02.png`;',
    'const LOGO_URL = `https://www.${COMPANY_DOMAIN}/assets/brand/pawtenant-logo-white-02.png`;',
  ]) ok(FIRST_PARTY_LOGO.test(good), `first-party LOGO_URL accepted: ${good.slice(17, 52)}…`);

  // ...and must still reject any host PawTenant does not control, otherwise
  // widening it for `www.` would have quietly disarmed the whole assertion.
  for (const bad of [
    'const LOGO_URL = "https://static.readdy.ai/image/a/b.png";',
    'const LOGO_URL = "https://cdn.thirdparty.net/pawtenant.com/logo.png";',
    'const LOGO_URL = "http://pawtenant.com/assets/brand/logo.png";',
  ]) ok(!FIRST_PARTY_LOGO.test(bad), `non-first-party LOGO_URL rejected: ${bad.slice(17, 56)}…`);

  // The allowlist must be scoped to its file, not global.
  const g = `const R = "https://www.google.com/search?q=PawTenant+Reviews";`;
  ok(scanEmailSource("supabase/functions/notify-patient-letter/index.ts", stripComments(g)).length === 0,
     "allowlisted google-search passes in notify-patient-letter only");
  ok(scanEmailSource("supabase/functions/send-review-request/index.ts", stripComments(g))
       .some((h) => h.rule === "google-search"),
     "the same google-search URL still fails in any other function");
}

// ── main ────────────────────────────────────────────────────────────────────
console.log("EMAIL TEMPLATE HYGIENE — active sources only");
await partA();
if (process.argv.includes("--self-test")) partB();
console.log(`\n${passes} passed, ${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
