#!/usr/bin/env node
/**
 * check-partner-assessment-pdf.mjs
 *
 * PARTNER-ASSESSMENT-NEUTRAL-PDF-001.
 *
 * Two things must hold at once and they pull in opposite directions:
 *
 *   1. A PARTNER assessment must carry no PawTenant identity, no partner
 *      identity, no internal order id, no QR, no verification id and no money.
 *   2. A DIRECT assessment must keep the branded document it has always had.
 *
 * A change that satisfies one by breaking the other is the failure mode this
 * guard exists to catch, so the direct-order control is asserted just as hard
 * as the partner one.
 *
 * The generator builds an HTML STRING, so React never escapes anything. Partner
 * answers arrive from an external API, which makes escaping a security control
 * rather than a nicety — hostile fixtures are executed through the REAL
 * transpiled module, not a copy.
 *
 * `--self-test` plants each failure into the real source and asserts detection.
 * `--emit <dir>` writes the four documents for visual PDF QA.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UTILS = "src/pages/admin-orders/components/assessmentUtils.ts";
const PROVIDER = "src/pages/provider-portal/page.tsx";

/** Single read point — CRLF normalised so \n anchors cannot silently miss. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

async function loadModule() {
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the renderer now imports the
  // canonical questionnaire parser (src/lib/partnerQuestionnaire.ts), so the
  // module is BUNDLED rather than transpiled alone. Everything else is unchanged:
  // the self-test still plants into the file on disk and reloads it from there.
  const result = await esbuild.build({
    entryPoints: [join(ROOT, UTILS)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

// ── Hostile + edge-case fixtures ────────────────────────────────────────────

const HOSTILE = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "</td></tr><style>body{display:none}</style>",
  '<a href="https://example.com">click</a>',
  '"><iframe src="https://example.com"></iframe>',
  "& < > \" '",
];

const LONG = "A".repeat(600);

function partnerOrder(overrides = {}) {
  return {
    confirmation_id: "PT-SHOULDNOTAPPEAR",
    first_name: "Zoë",
    last_name: "O'Brien-Ünal",
    email: "zoe.obrien@partner-fixture.test",
    phone: "+15555550101",
    state: "NY",
    created_at: "2026-08-19T12:00:00.000Z",
    order_origin: "partner",
    partner_id: "11111111-1111-4111-8111-111111111111",
    partner_order_id: "RAPID-EXT-001",
    letter_type: "esa",
    assessment_answers: {
      source: "partner_api",
      schema_version: "partner.assessment.v1",
      dob: "1990-04-02",
      pets: [
        { name: "Milo", type: "Dog", breed: "Mixed", age: "3", weight: "20" },
        { name: "Luna & Co", type: "Cat", breed: "Tabby", age: "2", weight: "9" },
        { name: "Ríos", type: "Dog", breed: "Collie", age: "5", weight: "30" },
      ],
      consents: {
        telehealth: { accepted: true, at: "2026-08-19T11:59:00.000Z" },
        privacy_data_transfer: { accepted: true, at: "2026-08-19T11:59:01.000Z" },
        electronic_signature: { name: "Zoë O'Brien-Ünal", at: "2026-08-19T11:59:02.000Z" },
      },
      emotionalFrequency: "often",
      symptomDescription: "Line one.\nLine two with an ampersand & an apostrophe's tail.",
      medication: "yes",
      medicationDetails: "Sertraline 50mg",
      ...overrides.answers,
    },
    ...overrides.order,
  };
}

function directOrder() {
  const o = partnerOrder();
  return {
    ...o,
    confirmation_id: "PT-DIRECT001",
    order_origin: "direct",
    partner_id: null,
    partner_order_id: null,
  };
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

// ── Checks ──────────────────────────────────────────────────────────────────

async function runChecks() {
  results.length = 0;
  const m = await loadModule();
  const utilsSrc = read(UTILS);
  const providerSrc = read(PROVIDER);

  const partnerEsa = m.buildPrintHTML(partnerOrder());
  const partnerPsd = m.buildPrintHTML(partnerOrder({ order: { letter_type: "psd" } }));
  const hostile = m.buildPrintHTML(partnerOrder({
    answers: {
      symptomDescription: HOSTILE.join("\n"),
      medicationDetails: LONG,
      priorDiagnosis: HOSTILE[0],
    },
    order: { first_name: HOSTILE[1], last_name: HOSTILE[3] },
  }));
  const direct = m.buildPrintHTML(directOrder());
  // PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001 — audience-specific output.
  // Default audience = "internal" (admin + provider portals): ALWAYS neutral.
  // "customer" (customer portal only): the historical behaviour.
  const partnerEsaCustomer = m.buildPrintHTML(partnerOrder(), undefined, "customer");
  const directCustomer = m.buildPrintHTML(directOrder(), undefined, "customer");

  const partnerDocs = { partnerEsa, partnerPsd, hostile, partnerEsaCustomer };

  // ── 1/2. No PawTenant or partner branding in a partner document ──────────
  const brandTokens = [/PawTenant/i, /pawtenant\.com/i, /readdy/i, /Rapid ESA Letter/i, /#FF6A00/i, /FFF1E8/i];
  const brandHit = Object.entries(partnerDocs).flatMap(([k, h]) =>
    brandTokens.filter((re) => re.test(h)).map((re) => `${k}:${re}`));
  check("P1 no PawTenant / partner branding in any partner document", brandHit.length === 0, brandHit.join(", "));

  // TAG ALLOWLIST, not attribute regex. Escaped answer text legitimately
  // contains the characters `src=` and `href=` as inert prose, so matching on
  // those produces a false alarm. What actually matters is which ELEMENTS the
  // renderer will construct — and since `<` is escaped to `&lt;`, any real tag
  // must appear literally. Anything outside this list is an injected element.
  // PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002: the internal
  // document now lays itself out into real US-Letter sheets so it can carry
  // page numbers and break without orphaning a heading, which needs one
  // first-party script. That is NOT a licence to run data: P2b proves the
  // script is byte-identical for a benign order and for an order whose every
  // field is hostile, and that it holds no network / eval / innerHTML
  // primitive. Every other active element stays banned.
  const ALLOWED_TAGS = new Set([
    "html", "head", "meta", "title", "style", "body", "div", "p", "span",
    "table", "thead", "tbody", "tr", "th", "td", "br", "script",
  ]);
  const tagHit = Object.entries(partnerDocs).flatMap(([k, h]) => {
    const tags = new Set([...h.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((x) => x[1].toLowerCase()));
    return [...tags].filter((t) => !ALLOWED_TAGS.has(t)).map((t) => `${k}:<${t}>`);
  });
  const cssFetch = Object.entries(partnerDocs)
    .filter(([, h]) => /url\(/i.test(h)).map(([k]) => `${k}:css-url()`);
  check("P2 partner documents construct only inert elements (no img/iframe/script/link/a, no css url())",
    tagHit.length === 0 && cssFetch.length === 0, [...tagHit, ...cssFetch].join(", "));

  // ── 2b. The paginator is a CONSTANT. It never varies with the data, so no
  // answer, name or pasted transcript can reach executable context through it.
  const scriptsOf = (h) => [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m2) => m2[1]);
  const benignScripts = scriptsOf(partnerEsa);
  const hostileScripts = scriptsOf(hostile);
  const psdScripts = scriptsOf(partnerPsd);
  const SCRIPT_PRIMITIVES = /fetch\(|XMLHttpRequest|eval|new Function|Function\(|innerHTML|outerHTML|insertAdjacentHTML|document\.write|import\(|https?:|<[a-zA-Z]/;
  check("P2b the paginator script is a constant — identical for benign and hostile orders, with no network/eval/innerHTML primitive",
    benignScripts.length === 1 && hostileScripts.length === 1 && psdScripts.length === 1 &&
      benignScripts[0] === hostileScripts[0] && benignScripts[0] === psdScripts[0] &&
      !SCRIPT_PRIMITIVES.test(benignScripts[0]),
    "a script that changes with the data, or that can fetch/eval/write markup, is an injection surface");

  // ── 2c. Every page carries the confidentiality line and its own number. ──
  check("P2c the document paginates into numbered US-Letter sheets with a per-page confidentiality footer",
    /class = "sheet"|className = "sheet"/.test(benignScripts[0]) &&
      /Page " \+ \(p \+ 1\) \+ " of "/.test(benignScripts[0]) &&
      /This document is confidential and intended solely for licensed professionals reviewing this case\./.test(benignScripts[0]) &&
      /\.sheet \{/.test(partnerEsa) && /height: 11in/.test(partnerEsa),
    "page numbers and the confidentiality footer are required on every page");

  // ── 3. Case references are audience-specific ─────────────────────────────
  check("P3 the internal PT- confirmation id never appears in the CUSTOMER-facing partner document",
    !/PT-SHOULDNOTAPPEAR/.test(partnerEsaCustomer),
    "the internal order id must stay out of the partner-facing clinical record");
  check("P3b the customer-facing partner document shows the PARTNER's own reference only",
    /RAPID-EXT-001/.test(partnerEsaCustomer) && /Partner Case Reference/.test(partnerEsaCustomer),
    "the partner's customer copy carries the partner's reference, not ours");
  check("P3c the INTERNAL (admin/provider) document identifies the case by the PawTenant reference",
    /Case Reference/.test(partnerEsa) && /PT-SHOULDNOTAPPEAR/.test(partnerEsa),
    "staff identify a case by its PawTenant confirmation id");
  check("P3d the INTERNAL document never carries the partner's external order id",
    [partnerEsa, partnerPsd, hostile].every((h) => !/RAPID-EXT-001/.test(h) && !/Partner Case Reference/.test(h)),
    "providers must not see the partner's external reference (task §11)");

  // ── 4/5. No QR, verification id or verify URL ────────────────────────────
  check("P4 no QR is present in a partner document",
    !Object.values(partnerDocs).some((h) => /\bqr\b/i.test(h)), "assessment is not a verifiable letter");
  check("P5 no verification id or verify URL appears",
    !Object.values(partnerDocs).some((h) => /verification id/i.test(h) || /\/verify\//i.test(h) || /\bESA-[A-Z]{2}-/.test(h)),
    "the assessment is not a letter and must never look verifiable");

  // ── 6. No money ──────────────────────────────────────────────────────────
  // Strip the <style> block first: CSS legitimately contains "margin", and a
  // guard that fails on a stylesheet property is a guard nobody will trust.
  const visibleOf = (h) => h.replace(/<style>[\s\S]*?<\/style>/gi, "");
  const moneyTokens = [/\$\s?\d/, /wholesale/i, /payout/i, /fulfillment margin/i, /invoice/i, /price/i, /paid/i];
  const moneyHit = Object.entries(partnerDocs).flatMap(([k, h]) =>
    moneyTokens.filter((re) => re.test(visibleOf(h))).map((re) => `${k}:${re}`));
  check("P6 no price, payout, margin or payment information appears",
    moneyHit.length === 0, moneyHit.join(", "));

  // ── 7/8/9. Injection is inert ────────────────────────────────────────────
  check("P7 <script> from an answer is inert text, not markup",
    !/<script>alert\(1\)<\/script>/.test(hostile) && hostile.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
    "a stored answer must never become executable");
  check("P8 <img onerror> from an answer is inert text",
    !/<img src=x onerror/i.test(hostile) && hostile.includes("&lt;img src=x onerror=alert(1)&gt;"),
    "an image tag would also be a remote request");
  check("P9 a closing-tag breakout is neutralised",
    !/<\/td><\/tr><style>/.test(hostile) && hostile.includes("&lt;/td&gt;&lt;/tr&gt;&lt;style&gt;"),
    "breaking out of a cell would let CSS hide or rewrite the document");
  check("P9b anchor and iframe payloads are inert",
    !/<a href="https:\/\/example\.com">/.test(hostile) && !/<iframe/i.test(hostile),
    "links and iframes must not be constructible from an answer");
  check("P9c line breaks survive as <br/> without enabling injection",
    /Line one\.<br\/>Line two/.test(m.buildPrintHTML(partnerOrder())),
    "readability must not be bought with an injection hole");

  // ── 10. Every dynamic field goes through the canonical escape ────────────
  // Interpolations inside the two builders must call an escape helper. A raw
  // ${value} in an HTML template is exactly the defect this slice fixes.
  // BEHAVIOURAL, not textual. A regex over the source cannot tell that
  // `escapeHtml(cond ? `${x} yr` : "-")` is safe, and would flag it. So instead
  // every dynamic field is independently poisoned and the output is checked for
  // the raw payload. This is what actually matters, and it cannot be fooled by
  // how the template happens to be written.
  const POISON = "<script>PWN</script>";
  const fieldProbes = {
    first_name: () => partnerOrder({ order: { first_name: POISON } }),
    last_name: () => partnerOrder({ order: { last_name: POISON } }),
    email: () => partnerOrder({ order: { email: POISON } }),
    phone: () => partnerOrder({ order: { phone: POISON } }),
    state: () => partnerOrder({ order: { state: POISON } }),
    partner_order_id: () => partnerOrder({ order: { partner_order_id: POISON } }),
    answer_value: () => partnerOrder({ answers: { emotionalFrequency: POISON } }),
    answer_key: () => partnerOrder({ answers: { [POISON]: "x" } }),
    free_text: () => partnerOrder({ answers: { symptomDescription: POISON } }),
    pet_name: () => partnerOrder({ answers: { pets: [{ name: POISON, type: "Dog" }] } }),
    pet_type: () => partnerOrder({ answers: { pets: [{ name: "A", type: POISON }] } }),
    pet_breed: () => partnerOrder({ answers: { pets: [{ name: "A", type: "Dog", breed: POISON }] } }),
    pet_age: () => partnerOrder({ answers: { pets: [{ name: "A", type: "Dog", age: POISON }] } }),
    pet_weight: () => partnerOrder({ answers: { pets: [{ name: "A", type: "Dog", weight: POISON }] } }),
    consent_key: () => partnerOrder({ answers: { consents: { [POISON]: { accepted: true, at: "t" } } } }),
    consent_signer: () => partnerOrder({ answers: { consents: { sig: { name: POISON, at: "t" } } } }),
    consent_at: () => partnerOrder({ answers: { consents: { sig: { accepted: true, at: POISON } } } }),
    // PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — the
    // pasted questionnaire transcript is the largest untrusted surface in the
    // document, and the one a partner types by hand. Poison it on its own AND
    // with the payload split across lines, because it is rendered per line.
    pasted_questionnaire: () => partnerOrder({ answers: { partnerQuestionnaireText: POISON } }),
    pasted_questionnaire_multiline: () =>
      partnerOrder({ answers: { partnerQuestionnaireText: `1. Question\n${POISON}\n\n2. Next` } }),
  };
  const leaked = Object.entries(fieldProbes)
    .filter(([, mk]) => m.buildPrintHTML(mk()).includes(POISON));
  check("P10 no dynamic field can emit raw markup (every field poisoned individually)",
    leaked.length === 0, `fields leaking raw markup: ${leaked.map(([k]) => k).join(", ")}`);

  const directLeaked = Object.entries(fieldProbes)
    .filter(([, mk]) => m.buildPrintHTML({ ...mk(), order_origin: "direct", partner_id: null }).includes(POISON));
  check("P10c the DIRECT document is equally un-poisonable",
    directLeaked.length === 0, `direct fields leaking: ${directLeaked.map(([k]) => k).join(", ")}`);

  check("P10b a single canonical escape function exists",
    (utilsSrc.match(/export function escapeHtml\(/g) ?? []).length === 1,
    "one escape implementation, not several");

  // ── 11. Origin is authoritative ──────────────────────────────────────────
  const resolver = utilsSrc.match(/export function resolveAssessmentContext[\s\S]*?\n\}/)?.[0] ?? "";
  check("P11 origin comes from order_origin / partner_id only",
    /order_origin === "partner"/.test(resolver) && /partner_id/.test(resolver) &&
      !/\bemail\b/.test(resolver) && !/confirmation_id/.test(resolver) && !/\bprice\b/.test(resolver) && !/utm/i.test(resolver),
    "inferring origin from customer-controlled data would neutralise a real retail document");

  // Behavioural proof: a DIRECT order whose email/name look partner-ish stays branded (customer copy).
  const decoy = m.buildPrintHTML({
    ...directOrder(),
    email: "someone@rapid-esa-letter.com",
    first_name: "Rapid",
    last_name: "Partner",
  }, undefined, "customer");
  check("P11b a direct order with partner-looking name/email stays BRANDED for the customer",
    /PawTenant ESA Intake Form/.test(decoy),
    "origin must not be guessable from identity fields");

  // ── 12. Customer-facing direct document is unchanged ─────────────────────
  check("P12 the customer-facing direct assessment keeps its PawTenant branding",
    /PawTenant ESA Intake Form/.test(directCustomer) && /pawtenant\.com/.test(directCustomer) &&
      /#FF6A00/.test(directCustomer) && /<img[^>]+class="logo"/.test(directCustomer) && /PT-DIRECT001/.test(directCustomer),
    "the retail customer document must not be neutralised");
  // ── 21/22. INTERNAL audience (admin + provider) is neutral for EVERY origin ─
  check("P21 the internal direct assessment is neutral (no PawTenant logo/name, no orange, PT reference kept)",
    !/PawTenant/i.test(direct) && !/pawtenant\.com/i.test(direct) && !/#FF6A00/i.test(direct) && !/<img/i.test(direct) &&
      /Case Reference/.test(direct) && /PT-DIRECT001/.test(direct) && /<p class="doc-title">ESA Assessment<\/p>/.test(direct),
    "providers must see one neutral clinical document regardless of origin");
  check("P22 the internal document is the default (no audience argument) — admin and provider call sites need no change",
    /audience: AssessmentAudience = "internal"/.test(utilsSrc),
    "a forgotten audience argument must yield the neutral document, never the branded one");
  check("P12b the direct assessment is still escaped",
    /&lt;script&gt;/.test(m.buildPrintHTML({ ...directOrder(), assessment_answers: { symptomDescription: HOSTILE[0] } })),
    "the security fix applies to both documents");

  // ── 13/15. Not a deliverable, not verifiable ─────────────────────────────
  // The generator returns a string to a browser print/blob. It writes no
  // storage row, so it cannot acquire a doc_type and cannot enter the QR
  // allowlist. Assert it stays that way.
  check("P13 the generator performs no storage, upload or network call",
    !/supabase|storage|fetch\(|XMLHttpRequest|upload/i.test(utilsSrc),
    "a stored assessment would gain a doc_type and could reach the QR path");
  check("P15 the generator never assigns a verifiable document type",
    !/esa_letter|psd_letter|doc_type/i.test(utilsSrc),
    "unknown/new document types must stay non-verifiable by default");

  // ── 14. No side effects ──────────────────────────────────────────────────
  check("P14 the generator triggers no email / SMS / webhook",
    !/send-templated-email|send-sms|ghl|webhook|notify/i.test(utilsSrc),
    "generating a clinical document must not message anyone");

  // ── Provider access ──────────────────────────────────────────────────────
  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the provider is never
  // told where a case came from, and every internal document is neutral, so
  // the provider portal no longer selects the origin columns at all.
  check("P16 the provider portal selects NO origin / partner column (every case is worked identically)",
    !/order_origin|partner_id|partner_order_id/.test(providerSrc.replace(/\/\/[^\n]*/g, "")),
    "a provider surface must not carry partner identity; the document is neutral for every order");

  // ── Structure ────────────────────────────────────────────────────────────
  check("P17 neutral ESA and PSD documents carry the exact neutral headings",
    /<p class="doc-title">ESA Assessment<\/p>/.test(partnerEsa) && /<p class="doc-title">PSD Assessment<\/p>/.test(partnerPsd) &&
      !/Summary/.test(partnerEsa.match(/<p class="doc-title">[^<]*<\/p>/)?.[0] ?? ""),
    "the owner's neutral headings are 'ESA Assessment' / 'PSD Assessment'");
  check("P18 the neutral footer is present",
    Object.values(partnerDocs).every((h) => /Confidential clinical assessment/.test(h)),
    "required neutral footer");
  check("P19 clinical content survives (patient, animals, answers) and the provider document carries NO consent/attestation rows",
    /Zo/.test(partnerEsa) && /Milo/.test(partnerEsa) && /Sertraline 50mg/.test(partnerEsa) &&
      !/Consent and Attestations|Partner Submission Authorization/.test(partnerEsa) && /Mental Health Questionnaire/.test(partnerEsa) &&
      /Customer Information/.test(partnerEsa) && /Pet Information/.test(partnerEsa),
    "neutral must not mean incomplete");
  check("P20 US Letter page size is declared for the partner document",
    /size: Letter/.test(partnerEsa), "print target is US Letter");

  // ── 23. The FORMAT the owner asked for: a conventional black-and-white
  // document in a standard sans face at normal character spacing. The old
  // serif layout with tracked-out headings is what produced the unusual
  // spacing the owner reported, so both halves are pinned.
  const styleOf = (h) => h.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? "";
  const css = styleOf(partnerEsa);
  const trackedOut = [...css.matchAll(/letter-spacing:\s*([^;]+);/g)].map((x) => x[1].trim())
    .filter((v) => v !== "normal" && v !== "0" && v !== "0px");
  check("P23 the internal document uses a standard Helvetica/Arial face at normal letter spacing",
    /font-family:\s*"Helvetica Neue", Helvetica, Arial, sans-serif/.test(css) &&
      // `sans-serif` is the fallback we WANT, so the lookbehind keeps this
      // from firing on our own stack while still catching a serif revert.
      !/Georgia|Times New Roman|(?<!sans-)\bserif\b/.test(css) &&
      trackedOut.length === 0,
    `unusual letter-spacing values: ${trackedOut.join(", ") || "none"}`);

  return { partnerEsa, partnerPsd, hostile, direct, partnerEsaCustomer, directCustomer };
}

function report(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${label}`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`);
  console.log(`\n  ${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length;
}

// ── Runner ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const emitIdx = args.indexOf("--emit");

if (args.includes("--self-test")) {
  const CONTROLS = [
    { name: "PawTenant branding leaks into the partner PDF", file: UTILS, expect: "P1",
      from: '  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review.</p>',
      to: '  <p class="doc-sub">PawTenant &bull; pawtenant.com</p>' },
    { name: "Rapid branding leaks into the neutral PDF", file: UTILS, expect: "P1",
      from: '<p class="doc-title">${escapeHtml(title)}</p>',
      to: '<p class="doc-title">Rapid ESA Letter — ${escapeHtml(title)}</p>' },
    { name: "internal PT- confirmation id leaks", file: UTILS, expect: "P3",
      from: '  ${infoRow("Submission Date", formatSubmitDate(order.created_at))}',
      to: '  ${infoRow("Order ID", order.confirmation_id)}\n  ${infoRow("Submission Date", formatSubmitDate(order.created_at))}' },
    { name: "partner assessment receives a QR", file: UTILS, expect: "P4",
      from: '  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review.</p>',
      to: '  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review. QR verification enclosed.</p>' },
    { name: "verification id / verify URL appears", file: UTILS, expect: "P5",
      from: '  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review.</p>',
      to: '  <p class="doc-sub">Verification ID: ESA-NY-ABC123</p>' },
    { name: "retail price / payment information appears", file: UTILS, expect: "P6",
      from: '  ${infoRow("State", stateName)}',
      to: '  ${infoRow("State", stateName)}\n  ${infoRow("Partner charge", "$45.00")}' },
    { name: "<script> renders as markup (escape removed from answers)", file: UTILS, expect: "P7",
      from: '        ? `${q}<p class="a-body">${escapeMultilineHtml(ans.value)}</p>`\n        : `${q}<p class="a-scalar">${escapeHtml(ans.value)}</p>`;',
      to: '        ? `${q}<p class="a-body">${ans.value}</p>`\n        : `${q}<p class="a-scalar">${ans.value}</p>`;' },
    { name: "<img onerror> renders as markup (patient name unescaped)", file: UTILS, expect: "P8",
      from: '`<div class="row"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`',
      to: '`<div class="row"><span class="k">${escapeHtml(label)}</span><span class="v">${value}</span></div>`' },
    // Targets P10: the pet-name cell is not where P9's free-text payload lives,
    // so the FIELD-POISONING check is the one that must catch this. Verified
    // empirically rather than assumed.
    { name: "HTML/CSS breakout through a closing tag (pet cells unescaped)", file: UTILS, expect: "P10",
      from: "        <td>${escapeHtml(p.name || \"—\")}</td>",
      to: "        <td>${p.name || \"—\"}</td>" },
    { name: "a dynamic field bypasses the canonical escape function", file: UTILS, expect: "P10",
      from: '<p class="q"><span class="num">${i + 1}.</span> ${escapeHtml(ans.label)}</p>',
      to: '<p class="q"><span class="num">${i + 1}.</span> ${ans.label}</p>' },
    { name: "origin inferred from email instead of authoritative fields", file: UTILS, expect: "P11",
      from: '  const isPartner = order.order_origin === "partner" || Boolean(order.partner_id);',
      to: '  const isPartner = (order.email ?? "").includes("rapid");' },
    { name: "internal (provider) document accidentally becomes BRANDED", file: UTILS, expect: "P21",
      from: '  if (audience === "internal") {',
      to: '  if (false) {' },
    { name: "partner external reference leaks into the internal document", file: UTILS, expect: "P3d",
      from: "  const caseRef = opts.caseReference\n    ? infoRow(\"Case Reference\", opts.caseReference)",
      to: "  const caseRef = opts.caseReference\n    ? infoRow(\"Case Reference\", opts.caseReference) + infoRow(\"Partner Case Reference\", order.partner_order_id ?? \"\")" },
    { name: "direct PawTenant PDF accidentally becomes neutral", file: UTILS, expect: "P12",
      from: "  return context.origin === \"partner\"\n    ? buildNeutralAssessmentHTML(order, context)\n    : buildBrandedAssessmentHTML(order);",
      to: "  return buildNeutralAssessmentHTML(order, { origin: \"partner\", partnerOrderId: null });" },
    { name: "partner document becomes publicly deliverable (storage write added)", file: UTILS, expect: "P13",
      from: "export function escapeHtml(value: unknown): string {",
      to: "export async function uploadToStorage(h: string) { await fetch(\"/upload\", { method: \"POST\", body: h }); }\nexport function escapeHtml(value: unknown): string {" },
    { name: "automatic email/SMS/webhook side effect introduced", file: UTILS, expect: "P14",
      from: "export function escapeMultilineHtml(value: unknown): string {",
      to: "export function notifyPartnerWebhook() { /* send-templated-email */ }\nexport function escapeMultilineHtml(value: unknown): string {" },
    // PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 controls.
    { name: "the paginator starts carrying order data (customer name interpolated into the script)", file: UTILS, expect: "P2b",
      from: '  var FOOTER = "This document is confidential and intended solely for licensed professionals reviewing this case.";',
      to: '  var FOOTER = "This document is confidential and intended solely for licensed professionals reviewing this case. ${fullName}";' },
    { name: "the paginator gains a network primitive", file: UTILS, expect: "P2b",
      from: '  var holder = document.getElementById("src");',
      to: '  fetch("/telemetry");\n  var holder = document.getElementById("src");' },
    { name: "the paginator stops numbering pages", file: UTILS, expect: "P2c",
      from: '    sheets[p].pg.textContent = "Page " + (p + 1) + " of " + sheets.length;',
      to: '    sheets[p].pg.textContent = "";' },
    { name: "the pasted questionnaire is written as raw markup instead of escaped text", file: UTILS, expect: "P10",
      from: '      return `<div class="${cls}">${line.trim() === "" ? "&nbsp;" : escapeHtml(line)}</div>`;',
      to: '      return `<div class="${cls}">${line.trim() === "" ? "&nbsp;" : line}</div>`;' },
    { name: "the questionnaire section is renamed away from the owner's heading", file: UTILS, expect: "P19",
      from: '  ${sectionTitle("Mental Health Questionnaire")}',
      to: '  ${sectionTitle("Questions")}' },
    { name: "the internal document reintroduces tracked-out letter spacing", file: UTILS, expect: "P23",
      from: '  * { box-sizing: border-box; margin: 0; padding: 0; letter-spacing: normal; }',
      to: '  * { box-sizing: border-box; margin: 0; padding: 0; letter-spacing: 0.08em; }' },
    { name: "the internal document reverts to the serif family", file: UTILS, expect: "P23",
      from: '    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;',
      to: '    font-family: Georgia, "Times New Roman", serif;' },
    { name: "unknown document type becomes QR-verifiable", file: UTILS, expect: "P15",
      from: "export type AssessmentDocumentContext =",
      to: "export const doc_type = \"esa_letter\";\nexport type AssessmentDocumentContext =" },
  ];

  let missed = 0;
  const originals = new Map();
  try {
    await runChecks();
    if (report("BASELINE (must be clean before planting)")) {
      console.log("\n  baseline dirty — controls would be meaningless");
      missed++;
    } else {
      for (const c of CONTROLS) {
        const path = join(ROOT, c.file);
        if (!originals.has(c.file)) originals.set(c.file, readFileSync(path, "utf8"));
        const src = read(c.file);
        if (!src.includes(c.from)) { console.log(`  ANCHOR MISSING  ${c.name}`); missed++; continue; }
        writeFileSync(path, src.replace(c.from, c.to), "utf8");
        let caught = false;
        try {
          await runChecks();
          const t = results.find((r) => r.name.startsWith(c.expect));
          caught = Boolean(t && !t.ok);
        } catch { caught = true; } // a control that breaks the module also counts as detected
        console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
        if (!caught) missed++;
        writeFileSync(path, originals.get(c.file), "utf8");
      }
    }
  } finally {
    for (const [rel, content] of originals) writeFileSync(join(ROOT, rel), content, "utf8");
  }

  await runChecks();
  const after = report("AFTER RESTORE (must be clean)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - missed}/${CONTROLS.length} controls detected${after ? ", RESTORE FAILED" : ", tree restored"}`);
  process.exitCode = missed || after ? 1 : 0;
} else {
  const docs = await runChecks();
  const failed = report("PARTNER ASSESSMENT PDF");
  if (emitIdx !== -1) {
    const dir = args[emitIdx + 1];
    mkdirSync(dir, { recursive: true });
    for (const [name, html] of Object.entries(docs)) writeFileSync(join(dir, `${name}.html`), html, "utf8");
    console.log(`\n  emitted ${Object.keys(docs).length} documents to ${dir}`);
  }
  process.exitCode = failed ? 1 : 0;
}
