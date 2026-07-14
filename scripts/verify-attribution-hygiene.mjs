// scripts/verify-attribution-hygiene.mjs
//
// BATCH-0-MEASUREMENT-ATTRIBUTION-HYGIENE-001 verification harness.
//
// The repo has no unit-test runner, so — mirroring check-attribution-parity.mjs
// — this asserts the pure attribution-hygiene logic via jiti (already a devDep).
// It covers the synthetic TEST matrix cases that are expressible as pure logic:
//   A. Google paid (gclid)                → Google Ads
//   B. keyword captured, search term null  (macro-guard on {keyword})
//   C. un-expanded {keyword} placeholder   → rejected (null)
//   D. Meta {{site_source_name}} macro     → rejected (null); no false channel
//   E. ChatGPT referral                    → AI host / ChatGPT label
//   F. false-positive guard                → real brace-y values are KEPT
//
// buildChannel()/captureFromUrl() themselves depend on the browser env
// (sessionStorage / import.meta.env) so they are exercised separately in the
// TEST browser preview; this harness validates the pure building blocks those
// functions delegate to (sanitizeMacroValue + detectAiChannelFromReferrer) plus
// the read-side classifier.
//
// Usage:
//   node scripts/verify-attribution-hygiene.mjs             → exit 1 on any fail
//   node scripts/verify-attribution-hygiene.mjs --warn-only → always exit 0

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");

const jiti = createJiti(import.meta.url, { interopDefault: true });
const macros = await jiti.import(resolve(ROOT, "src/lib/attributionMacros.ts"));
const ai = await jiti.import(resolve(ROOT, "src/lib/aiReferral.ts"));
const classifier = await jiti.import(resolve(ROOT, "src/lib/acquisitionClassifier.ts"));

const { isUnresolvedMacro, sanitizeMacroValue } = macros;
const { detectAiChannelFromReferrer } = ai;
const { classifyAcquisition } = classifier;

for (const [name, fn] of [
  ["sanitizeMacroValue", sanitizeMacroValue],
  ["isUnresolvedMacro", isUnresolvedMacro],
  ["detectAiChannelFromReferrer", detectAiChannelFromReferrer],
  ["classifyAcquisition", classifyAcquisition],
]) {
  if (typeof fn !== "function") {
    console.error(`[verify-attribution-hygiene] ERROR: ${name} not exported`);
    process.exit(1);
  }
}

let pass = 0;
let fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (ok) { pass++; }
  else { fail++; console.error(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

// ── Macro detection (A/C/D + F false-positive guard) ─────────────────────────
check("macro: Meta {{site_source_name}}",   sanitizeMacroValue("{{site_source_name}}"), null);
check("macro: Meta {{campaign.name}}",       sanitizeMacroValue("{{campaign.name}}"),    null);
check("macro: ValueTrack {keyword}",         sanitizeMacroValue("{keyword}"),            null);
check("macro: ValueTrack {campaignid}",      sanitizeMacroValue("{campaignid}"),         null);
check("macro: ValueTrack {ifmobile:on}",     sanitizeMacroValue("{ifmobile:on}"),        null);
check("keep: real keyword phrase",           sanitizeMacroValue("valid esa letter"),     "valid esa letter");
check("keep: utm_source google",             sanitizeMacroValue("google"),               "google");
check("keep: chatgpt.com",                   sanitizeMacroValue("chatgpt.com"),          "chatgpt.com");
check("keep: brace inside value a{b}c",      sanitizeMacroValue("a{b}c"),                "a{b}c");
check("keep: json-ish {\"a\":1}",            sanitizeMacroValue('{"a":1}'),              '{"a":1}');
check("empty → null",                        sanitizeMacroValue(""),                     null);
check("null → null",                         sanitizeMacroValue(null),                   null);
check("isUnresolvedMacro true (meta)",       isUnresolvedMacro("{{site_source_name}}"),  true);
check("isUnresolvedMacro false (real)",      isUnresolvedMacro("valid esa letter"),      false);

// ── AI referrer detection (E) ────────────────────────────────────────────────
check("ai: chatgpt.com",       detectAiChannelFromReferrer("https://chatgpt.com/"),            "chatgpt.com");
check("ai: chat.openai.com",   detectAiChannelFromReferrer("https://chat.openai.com/c/abc"),   "chat.openai.com");
check("ai: www.perplexity.ai", detectAiChannelFromReferrer("https://www.perplexity.ai/search"), "perplexity.ai");
check("ai: gemini.google.com", detectAiChannelFromReferrer("https://gemini.google.com/app"),   "gemini.google.com");
check("ai: NOT google search", detectAiChannelFromReferrer("https://www.google.com/search?q=esa"), null);
check("ai: NOT facebook",      detectAiChannelFromReferrer("https://facebook.com/x"),           null);
check("ai: empty → null",      detectAiChannelFromReferrer(""),                                 null);

// ── Read-side classifier matrix (A/D/E) ──────────────────────────────────────
check("A. gclid → Google Ads",
  classifyAcquisition({ gclid: "CjwKTEST" }).label, "Google Ads");
check("A2. gclid + utm_source=google → Google Ads",
  classifyAcquisition({ gclid: "CjwKTEST", utm_source: "google", utm_medium: "cpc" }).label, "Google Ads");
check("E. ChatGPT referrer → ChatGPT",
  classifyAcquisition({ referrer: "https://chatgpt.com/" }).label, "ChatGPT");
check("E2. utm_source=chatgpt.com → ChatGPT",
  classifyAcquisition({ utm_source: "chatgpt.com" }).label, "ChatGPT");
// D. A macro utm_source that has been sanitized to null must NOT become a bogus
//    "Referral" — it should fall through to Direct when nothing else is present.
check("D. sanitized macro utm_source → Direct (not Referral)",
  classifyAcquisition({ utm_source: sanitizeMacroValue("{{site_source_name}}") }).label, "Direct / Unknown");
// D2. macro utm_source but a real AI referrer present → referrer wins → ChatGPT
check("D2. macro utm_source + chatgpt referrer → ChatGPT",
  classifyAcquisition({ utm_source: sanitizeMacroValue("{{site_source_name}}"), referrer: "https://chatgpt.com/" }).label, "ChatGPT");

// ── index.html inline early-capture must ALSO reject macros ──────────────────
// Regression guard for the second capture path found during Batch 0.1 Case G
// runtime validation: index.html writes raw UTM params to sessionStorage BEFORE
// the bundle, so it must mirror the sanitizer (attributionStore alone is not
// enough — it runs later and does not overwrite an existing stored macro).
const indexHtml = readFileSync(resolve(ROOT, "index.html"), "utf8");
check("index.html inline capture has a macro guard", /isUnresolvedMacro\s*\(/.test(indexHtml), true);
check("index.html guards utm fields before setItem", /!CLICK_IDS\[k\]\s*&&\s*isUnresolvedMacro\(v\)/.test(indexHtml), true);

console.log(`\n[verify-attribution-hygiene] ${pass} passed, ${fail} failed.`);
if (fail > 0 && !warnOnly) process.exit(1);
process.exit(0);
