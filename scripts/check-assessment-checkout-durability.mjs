#!/usr/bin/env node
// ASSESSMENT-CHECKOUT-REFRESH-AND-RESUME-PERSISTENCE-LIVE-INCIDENT-003
//
// Deploy-blocking guard for checkout state durability across a page reload.
//
// WHAT HAPPENED
// -------------
// A customer who completed a PSD or ESA assessment and reached payment was
// standing on `/psd-assessment` (or `/assessment`) with the ENTIRE checkout
// state — current step, the server's assessment-complete verdict, restored
// identity, the Stripe client secret — held in React component state and
// nowhere else. `useState(1)` was the only thing deciding which step rendered.
//
// Pressing F5 remounted the component and that state was gone. A customer who
// had just finished a 16-question clinical intake was returned to Question 1,
// "0 answered · Step 1 of 3". Reproduced on LIVE, on both flows.
//
// The durable architecture already existed. `/checkout/<slug>` resolves an
// order server-side from a high-entropy, non-clinical, order-bound slug — no
// browser memory required. But the route DESTROYED its own URL on arrival
// (`history.replaceState({}, "", "/checkout")`) and then navigated to the
// ephemeral assessment route, so the durable handle was thrown away at exactly
// the moment it started mattering.
//
// THE INVARIANT THIS GUARD PINS
// -----------------------------
// A completed customer who reloads must land on PAYMENT, decided by the SERVER,
// for BOTH flows. Not by `localStorage.completed`, not by a surviving React
// mount, not by an assessment token the browser might not have.
//
//   D1  the checkout route does not scrub the slug out of the address bar
//   D2  the checkout route does not navigate away from itself
//   D3  it renders BOTH checkout hosts in place (ESA and PSD)
//   D4  both assessment pages accept the resolved order as a PROP
//   D5  both pages boot in a RESOLVING state — no Step-1 flash
//   D6  both pages adopt the durable URL at payment
//   D7  adoption uses replaceState, never navigate (no remount, no second PI)
//   D8  adoption requires a verified identity — never anonymous
//   D9  the slug is never written to localStorage / sessionStorage
//   D10 the slug is never logged
//   D11 URL capture masks /checkout/<slug>, in the module AND pre-boot inline
//   D12 the credential-bearing checkout view is noindex
//   D13 a checkout reload reuses the open PaymentIntent instead of minting one
//   D14 the open intent lives in its OWN column, never payment_intent_id
//   D15 reuse only adopts a requires_payment_method intent for the SAME order
//   D16 the PSD flow does not describe itself as an ESA letter
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-assessment-checkout-durability.mjs             → guard
//   node scripts/check-assessment-checkout-durability.mjs --warn-only → audit
//   node scripts/check-assessment-checkout-durability.mjs --self-test → controls

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");
const GREEN = "\x1b[32m", RED = "\x1b[31m", RESET = "\x1b[0m";

const F = {
  checkoutRoute: "src/pages/checkout-link/page.tsx",
  esaPage:       "src/pages/assessment/page.tsx",
  psdPage:       "src/pages/psd-assessment/page.tsx",
  durable:       "src/lib/durableCheckoutUrl.ts",
  slugMask:      "src/lib/checkoutSlugMask.ts",
  attribution:   "src/lib/attributionStore.ts",
  indexHtml:     "index.html",
  stepIndicator: "src/pages/assessment/components/StepIndicator.tsx",
  paymentIntent: "supabase/functions/create-payment-intent/index.ts",
  resolver:      "supabase/functions/resolve-checkout-link/index.ts",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing required file: ${F[key]}`);
  // Normalize CRLF. The LIVE repo checks out CRLF; a guard matching raw bytes
  // would behave differently there and the planted controls (anchored on "\n")
  // would silently no-op — which reports success while proving nothing.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Strip comments so PROSE can never satisfy a code assertion.
 *
 * This matters more here than usual: every file in this task carries long
 * explanations that quote the very patterns being banned. A guard that read the
 * comments would pass on a file that had been fully regressed.
 */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** Strip comments AND string/template literals — for "must NOT contain" scans. */
function bare(src) {
  return code(src)
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

/** The body of the durable-URL adoption effect on an assessment page. */
function adoptionEffect(src) {
  const c = code(src);
  const i = c.indexOf("ensureDurableCheckoutUrl({");
  if (i < 0) return "";
  const start = Math.max(0, c.lastIndexOf("useEffect(", i));
  return c.slice(start, i + 200);
}

const CHECKS = [
  ["D1", "the checkout route does not scrub the slug out of the address bar", (s) => {
    const c = bare(s.checkoutRoute);
    // The exact regression: rewriting the address bar on arrival threw the
    // durable handle away and made the next refresh a total loss.
    return !/history\.replaceState/.test(c);
  }],

  ["D2", "the checkout route does not navigate away from itself", (s) => {
    const c = bare(s.checkoutRoute);
    // A navigate() to /assessment or /psd-assessment puts the customer back on
    // the ephemeral route, which is the whole defect.
    if (/\bnavigate\s*\(/.test(c)) return false;
    if (/location\.(replace|assign|href\s*=)/.test(c)) return false;
    return true;
  }],

  ["D3", "the checkout route renders BOTH hosts in place", (s) => {
    const c = code(s.checkoutRoute);
    return /<PSDAssessmentPage\b/.test(c) && /<AssessmentPage\b/.test(c);
  }],

  ["D4", "both assessment pages accept the resolved order as a PROP", (s) => {
    // A `window` read alone cannot make the FIRST render aware of the resume,
    // and cannot be handed down by the route that owns the URL.
    for (const key of ["esaPage", "psdPage"]) {
      const c = code(s[key]);
      if (!/checkoutResume\?:\s*Record<string,\s*unknown>/.test(c)) return false;
      if (!/checkoutResume:\s*checkoutResumeProp/.test(c)) return false;
      if (!/checkoutResumeProp\s*\?\?/.test(c)) return false;
    }
    return true;
  }],

  ["D5", "both pages boot in a RESOLVING state — no Step-1 flash", (s) => {
    // The initial value, not a later effect. Correcting the step one frame in
    // IS the flash the incident asked to eliminate: a completed customer must
    // never see Question 1, not even briefly.
    for (const key of ["esaPage", "psdPage"]) {
      const c = code(s[key]);
      const m = c.match(/useState\(\s*\n?\s*!!resumeConfirmationId\s*\|\|\s*!!resumeToken([\s\S]{0,80}?)\)/);
      if (!m) return false;
      if (!/\|\|\s*!!checkoutResume/.test(m[1])) return false;
    }
    return true;
  }],

  ["D6", "both pages adopt the durable URL at payment", (s) => {
    for (const key of ["esaPage", "psdPage"]) {
      const region = adoptionEffect(s[key]);
      if (!region) return false;
      // Gated on actually BEING at checkout…
      if (!/(currentStep|step)\s*!==\s*3/.test(region)) return false;
      // …and on a verified identity, or an anonymous visitor could mint a
      // payment handle for an order that is not theirs.
      if (!/!otpVerified/.test(region)) return false;
    }
    return true;
  }],

  ["D7", "adoption uses replaceState, never navigate (no remount, no second PI)", (s) => {
    const c = code(s.durable);
    if (!/window\.history\.replaceState\(\{\},\s*""\s*,\s*`\/checkout\/\$\{s\}`\)/.test(c)) return false;
    // A router navigation here would unmount checkout mid-payment, discard the
    // Stripe Elements instance and mint a second PaymentIntent.
    const b = bare(s.durable);
    if (/\bnavigate\s*\(/.test(b)) return false;
    if (/location\.(replace|assign|href\s*=)/.test(b)) return false;
    return true;
  }],

  ["D8", "minting a durable URL requires a verified identity", (s) => {
    const c = code(s.durable);
    // The slug is a payment handle. Minting must be authorised by the caller's
    // OWN session, never by the anon key.
    const usesSession = /supabase\.auth\.getSession\(\)/.test(c)
      && /access_token/.test(c)
      && /if \(!accessToken\) return false;/.test(c);
    const authorizesWithSession = /Authorization:\s*`Bearer \$\{accessToken\}`/.test(c);
    const noAnonKey = !/VITE_PUBLIC_SUPABASE_ANON_KEY/.test(c);
    return usesSession && authorizesWithSession && noAnonKey;
  }],

  ["D9", "the slug is never written to localStorage / sessionStorage", (s) => {
    for (const key of ["checkoutRoute", "durable", "esaPage", "psdPage"]) {
      const c = code(s[key]);
      if (/(local|session)Storage\.setItem\([^)]*\b(slug|checkoutResume|resume)\b/i.test(c)) {
        return false;
      }
    }
    return true;
  }],

  ["D10", "the slug is never logged", (s) => {
    for (const key of ["checkoutRoute", "durable"]) {
      const c = code(s[key]);
      if (/console\.\w+\([^)]*\b(slug|raw|json\.url|issued\.url)\b/.test(c)) return false;
    }
    return true;
  }],

  ["D11", "URL capture masks /checkout/<slug>, in the module AND pre-boot inline", (s) => {
    // The slug is in the PATH, so the query-only credential strip sails past it.
    // Unmasked, it reaches sessionStorage landing_url and from there the order
    // row, the GHL payload and every analytics event — the `?rt=` leak again.
    const mask = code(s.slugMask);
    if (!/export function maskCheckoutSlugPath/.test(mask)) return false;
    if (!/\/\$\{parts\[0\]\.toLowerCase\(\)\}\/:slug/.test(mask)) return false;

    const attr = code(s.attribution);
    if (!/import \{ maskCheckoutSlugPath \}/.test(attr)) return false;
    // It must be applied on BOTH exits of stripCredentialParams — the happy path
    // and the unparseable fallback.
    const i = attr.indexOf("export function stripCredentialParams");
    const region = attr.slice(i, i + 900);
    if ((region.match(/maskCheckoutSlugPath\(/g) ?? []).length < 2) return false;

    // The INLINE capture in index.html runs BEFORE React boots and is therefore
    // the FIRST writer of landing_url. Masking only in the module would leave
    // the leak fully intact.
    const html = s.indexHtml;
    if (!/var maskSlug = function/.test(html)) return false;
    if (!/'\/' \+ parts\[0\]\.toLowerCase\(\) \+ '\/:slug'/.test(html)) return false;
    const stripAt = html.indexOf("var stripCreds = function");
    const stripRegion = html.slice(stripAt, stripAt + 700);
    return (stripRegion.match(/maskSlug\(/g) ?? []).length >= 2;
  }],

  ["D12", "the credential-bearing checkout view is noindex", (s) => {
    for (const key of ["esaPage", "psdPage"]) {
      const c = code(s[key]);
      // Conditional on the durable path: the bare /assessment entry point keeps
      // its normal SEO posture, the slug URL must never be crawlable.
      if (!/isDurableCheckoutPath\(\)\s*\?/.test(c)) return false;
      if (!/content="noindex, nofollow"/.test(c)) return false;
      if (!/content="no-referrer"/.test(c)) return false;
    }
    return true;
  }],

  ["D13", "a checkout reload reuses the open PaymentIntent instead of minting one", (s) => {
    const c = code(s.paymentIntent);
    if (!/async function reuseOpenPaymentIntent\(/.test(c)) return false;
    // And the create path must actually CONSULT it, not merely define it.
    return /const reused = confirmationId[\s\S]{0,200}?await reuseOpenPaymentIntent\(/.test(c)
        && /(const|let) paymentIntent = reused \?\? await stripe\.paymentIntents\.create\(/.test(c);
  }],

  ["D14", "the open intent lives in its OWN column, never payment_intent_id", (s) => {
    const c = code(s.paymentIntent);
    if (!/open_payment_intent_id/.test(c)) return false;
    // Writing an UNPAID intent id to `payment_intent_id` is the defect that used
    // to stamp paid_at and mint an entitlement snapshot for an unpaid order
    // (ORDER-PAYMENT-INTENT-LIFECYCLE-TRIGGER-HARDENING-001). Scope the ban to
    // the update objects this task added.
    const writer = c.slice(c.indexOf("async function claimOpenPaymentIntentId"), c.indexOf("async function stampPricingSource"));
    if (!/\.update\(\{ open_payment_intent_id: paymentIntentId \}\)/.test(writer)) return false;
    // `[^_]` matters: `open_payment_intent_id:` CONTAINS `payment_intent_id:`,
    // so a naive negative lookup fails against the correct code.
    return !/[^_]payment_intent_id:\s*paymentIntent/.test(writer);
  }],

  ["D15", "reuse only adopts a requires_payment_method intent for the SAME order", (s) => {
    const c = code(s.paymentIntent);
    const i = c.indexOf("async function reuseOpenPaymentIntent");
    const region = c.slice(i, c.indexOf("async function stampPricingSource", i));
    // Anything further along than requires_payment_method may be mid-capture or
    // already succeeded and must be left completely alone.
    const statusGate = /existing\.status !== "requires_payment_method"/.test(region);
    // An intent minted for a different order must never be adopted.
    const orderGate = /existing\.metadata\?\.confirmation_id \?\? ""\) !== confirmationId/.test(region);
    // A paid order must never hand back a reusable intent.
    const paidGate = /if \(data\.paid_at \|\| data\.payment_intent_id\) return null;/.test(c);
    // And it must REPRICE, or a package/coupon change between reloads would be
    // charged at the stale amount.
    const reprices = /paymentIntents\.update\(openId, \{ amount, metadata \}\)/.test(region);
    return statusGate && orderGate && paidGate && reprices;
  }],

  ["D16", "the PSD flow does not describe itself as an ESA letter", (s) => {
    const si = code(s.stepIndicator);
    // The shared step header hard-coded ESA copy for both flows, so a PSD
    // customer was told "Check if you qualify for an ESA letter" under a header
    // that said Psychiatric Service Dog. Visible on LIVE.
    if (!/letterType\?:\s*"esa"\s*\|\s*"psd"/.test(si)) return false;
    if (!/const isPsd = letterType === "psd"/.test(si)) return false;
    if (!/Psychiatric Service Dog letter/.test(si)) return false;
    // Every ESA-specific headline must be behind the flag.
    if (/headline: "Check if you qualify for an ESA letter in 2 minutes"/.test(si)) return false;
    if (/headline: "Last step — your ESA letter is minutes away!"/.test(si)) return false;
    // And the PSD page must actually pass the flag plus a real progress count —
    // without it the header read "Question 1 · 0 answered" at every step.
    const psd = code(s.psdPage);
    return /letterType="psd"/.test(psd)
        && /answeredInStep1=\{psdProgress\.answered\}/.test(psd)
        && /totalInStep1=\{psdProgress\.total\}/.test(psd);
  }],

  ["D18", "a resumed ESA checkout keeps its OWN confirmation id", (s) => {
    const c = code(s.esaPage);
    // `resumeConfirmationId` is `searchParams.get("resume")` — the LEGACY query
    // param. A stable /checkout/<slug> arrival carries no `?resume=`, so
    // assigning it alone WIPED the id to "" and the page minted a
    // PaymentIntent with no `confirmation_id` in its metadata: unlinked from
    // the order and invisible to reconciliation. Only harmless back when a
    // refresh dumped the customer on Question 1.
    const m = c.match(/confirmationId\.current =([\s\S]{0,260}?);/);
    if (!m) return false;
    const assign = m[1];
    // The RESOLVED order must be the first source considered...
    if (!/confirmation_id/.test(assign)) return false;
    // ...and a bare assignment from the query param alone must not survive.
    if (/^\s*resumeConfirmationId\s*$/.test(assign)) return false;
    // An empty resolved id must never win over the id already held.
    return /\|\|\s*confirmationId\.current/.test(assign);
  }],

  ["D19", "every ESA mint call carries the order's confirmation id", (s) => {
    const c = code(s.esaPage);
    // THE root cause of the unlinked resumed ESA PaymentIntent. The resume
    // effect called fetchClientSecret with `resumeConfirmationId` —
    // `searchParams.get("resume")` — bypassing the ref it had just resolved
    // from the order. On a /checkout/<slug> arrival that is "", and a falsy id
    // makes create-payment-intent skip reuse, skip the reuse-pointer write,
    // skip the trusted quote, and stamp NO confirmation_id into the Stripe
    // metadata. Captured live: cid "", HTTP 200, a new pi_ on every reload.
    const calls = [...c.matchAll(/fetchClientSecret\(([^)]*)\)/g)].map((m) => m[1]);
    if (calls.length === 0) return false;
    // No call site may pass the legacy query param as the confirmation id.
    return !calls.some((a) => /(^|,)\s*resumeConfirmationId\s*(,|$)/.test(a));
  }],

  ["D20", "the open-intent slot is claimed atomically, so concurrent mounts cannot fan out", (s) => {
    const c = code(s.paymentIntent);
    if (!/async function claimOpenPaymentIntentId\(/.test(c)) return false;
    const i = c.indexOf("async function claimOpenPaymentIntentId");
    const region = c.slice(i, c.indexOf("async function rememberOpenPaymentIntentId", i));
    // A read-then-write lets every racing mount see null and mint its own PI.
    // The claim must be ONE conditional update guarded on the slot being empty.
    if (!/\.is\("open_payment_intent_id",\s*null\)/.test(region)) return false;
    // Losers must adopt the winner rather than serve their own intent...
    if (!/select\("open_payment_intent_id"\)/.test(region)) return false;
    // ...and the create path must actually USE the claim.
    return /await claimOpenPaymentIntentId\(confirmationId, paymentIntent\.id\)/.test(c)
        && /paymentIntents\.cancel\(loser\)/.test(c);
  }],

  ["D17", "the server, not the browser, decides that a completed order belongs at checkout", (s) => {
    const c = code(s.resolver);
    // The resolver must still return the completeness verdict and must still
    // refuse to guess it. A browser-held assessment token is an ASSIST, never
    // the authority — a customer on a new device does not have one.
    if (!/assessmentComplete/.test(c)) return false;
    if (!/psd_assessment_status/.test(c)) return false;
    // Unknown must mean "show the questions", never "skip them".
    return /let assessmentComplete = false;/.test(c);
  }],
];

// ── Planted negative controls ────────────────────────────────────────────────
// Each mutates the real source into the regression it names. A control that
// fails to change the file proves nothing and is reported as NO-OP.
const CONTROLS = [
  ["D1", "the checkout route scrubs its own slug away again", (b) => ({
    checkoutRoute: b.checkoutRoute.replace(
      "    const raw = slug.trim().toUpperCase();",
      '    const raw = slug.trim().toUpperCase();\n    window.history.replaceState({}, "", "/checkout");',
    ),
  })],
  ["D2", "the checkout route forwards to the ephemeral assessment route again", (b) => ({
    checkoutRoute: b.checkoutRoute.replace(
      "        setResume(json.resume);",
      '        setResume(json.resume);\n        navigate("/psd-assessment", { replace: true });',
    ),
  })],
  ["D3", "the PSD host is dropped, so PSD falls back to the ESA screen", (b) => ({
    checkoutRoute: b.checkoutRoute.replace(
      "          ? <PSDAssessmentPage checkoutResume={resume as unknown as Record<string, unknown>} />",
      "          ? <AssessmentPage checkoutResume={resume as unknown as Record<string, unknown>} />",
    ),
  })],
  ["D4", "the ESA page goes back to reading the handoff off window only", (b) => ({
    esaPage: b.esaPage.replace("    checkoutResumeProp ??\n", ""),
  })],
  ["D5", "the PSD page boots on Question 1 again (Step-1 flash returns)", (b) => ({
    psdPage: b.psdPage.replace(
      "    !!resumeConfirmationId || !!resumeToken || !!checkoutResume,",
      "    !!resumeConfirmationId || !!resumeToken,",
    ),
  })],
  ["D6", "the ESA page stops adopting the durable URL at payment", (b) => ({
    esaPage: b.esaPage.replace("    if (currentStep !== 3) return;", "    if (false) return;"),
  })],
  ["D6", "an anonymous visitor can trigger URL adoption", (b) => ({
    psdPage: b.psdPage.replace("    if (!otpVerified) return;", "    if (false) return;"),
  })],
  ["D7", "adoption becomes a router navigation, remounting checkout", (b) => ({
    durable: b.durable.replace(
      "    window.history.replaceState({}, \"\", `/checkout/${s}`);",
      "    window.location.assign(`/checkout/${s}`);",
    ),
  })],
  ["D8", "the anon key is accepted as authority to mint a payment handle", (b) => ({
    durable: b.durable.replace("    if (!accessToken) return false;", "    if (false) return false;"),
  })],
  ["D11", "the module stops masking the slug in captured URLs", (b) => ({
    attribution: b.attribution.replace(
      "    return maskCheckoutSlugPath(touched ? u.toString() : rawUrl);",
      "    return touched ? u.toString() : rawUrl;",
    ),
  })],
  ["D11", "the pre-boot inline capture stores the raw slug URL again", (b) => ({
    indexHtml: b.indexHtml.replace(
      "            return maskSlug(touched ? u.toString() : raw);",
      "            return touched ? u.toString() : raw;",
    ),
  })],
  ["D12", "the credential-bearing checkout view becomes indexable", (b) => ({
    psdPage: b.psdPage.replace(
      "      {isDurableCheckoutPath() ? (",
      "      {false ? (",
    ),
  })],
  ["D13", "every checkout reload mints another PaymentIntent again", (b) => ({
    paymentIntent: b.paymentIntent.replace(
      "    const reused = confirmationId\n      ? await reuseOpenPaymentIntent(stripe, confirmationId, finalAmount, piMetadata)\n      : null;",
      "    const reused = null;",
    ),
  })],
  ["D14", "the unpaid intent id is written to payment_intent_id again", (b) => ({
    paymentIntent: b.paymentIntent.replace(
      "      .update({ open_payment_intent_id: paymentIntentId })",
      "      .update({ payment_intent_id: paymentIntentId })",
    ),
  })],
  ["D15", "an intent that is already processing is adopted for reuse", (b) => ({
    paymentIntent: b.paymentIntent.replace(
      '    if (existing.status !== "requires_payment_method") return null;',
      "",
    ),
  })],
  ["D15", "another order's intent can be adopted", (b) => ({
    paymentIntent: b.paymentIntent.replace(
      '    if ((existing.metadata?.confirmation_id ?? "") !== confirmationId) return null;',
      "",
    ),
  })],
  ["D15", "a reused intent is not repriced, so a stale amount is charged", (b) => ({
    paymentIntent: b.paymentIntent.replace(
      "    const updated = await stripe.paymentIntents.update(openId, { amount, metadata });",
      "    const updated = existing;",
    ),
  })],
  ["D16", "the PSD flow tells the customer they are buying an ESA letter again", (b) => ({
    stepIndicator: b.stepIndicator.replace(
      "        headline: isPsd\n          ? \"Check if you qualify for a Psychiatric Service Dog letter\"\n          : \"Check if you qualify for an ESA letter in 2 minutes\",",
      '        headline: "Check if you qualify for an ESA letter in 2 minutes",',
    ),
  })],
  ["D16", "the PSD header loses its real progress count", (b) => ({
    psdPage: b.psdPage.replace("          answeredInStep1={psdProgress.answered}\n", ""),
  })],
  ["D18", "the resumed ESA confirmation id comes from the legacy query param again", (b) => ({
    esaPage: b.esaPage.replace(
      /confirmationId\.current =[\s\S]{0,260}?;/,
      "confirmationId.current = resumeConfirmationId;",
    ),
  })],
  ["D19", "the ESA resume mint passes the legacy query param again", (b) => ({
    esaPage: b.esaPage.replace(
      "if (landGate === \"pay\") fetchClientSecret(loadedStep2, confirmationId.current);",
      "if (landGate === \"pay\") fetchClientSecret(loadedStep2, resumeConfirmationId);",
    ),
  })],
  ["D20", "the open-intent claim goes back to an unguarded write", (b) => ({
    paymentIntent: b.paymentIntent.replace(
      '      .is("open_payment_intent_id", null)\n',
      "",
    ),
  })],
  ["D17", "the resolver assumes completeness instead of asking the server", (b) => ({
    resolver: b.resolver.replace(
      "    let assessmentComplete = false;",
      "    let assessmentComplete = true;",
    ),
  })],
];

function loadAll(override) {
  const out = {};
  for (const k of Object.keys(F)) out[k] = read(k, override);
  return out;
}

function runChecks(src) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok;
    try { ok = !!fn(src); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-assessment-checkout-durability";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? GREEN + "CAUGHT " : changed ? RED + "MISSED " : RED + "NO-OP  "}${RESET}${target.padEnd(4)} ${label}`,
      );
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`  ${r.ok ? GREEN + "PASS" : RED + "FAIL"}${RESET}  ${r.id.padEnd(4)} ${r.desc}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) {
    console.log(`${RED}✗ assessment checkout durability guard FAILED${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ a completed assessment survives refresh on BOTH flows${RESET}`);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
