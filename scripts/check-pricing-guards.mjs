// scripts/check-pricing-guards.mjs
//
// CHECKOUT-PRICING-PHASED-SUBSCRIPTION regression + security guards.
// (Phase 13 baseline + CLOSEOUT-005 Phase C hardening.)
//
// BLOCKING in the normal build (`npm run build`) — fails the build (exit 1) if
// the phased-subscription pricing model or its provisioning security is broken
// open again. See scripts/check-pricing-parity.mjs for the numeric matrix parity.
//
// Usage:
//   node scripts/check-pricing-guards.mjs             → exit 1 on failure
//   node scripts/check-pricing-guards.mjs --warn-only → always exit 0 (audit)

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const TAG = "[check-pricing-guards]";

// OLD recurring Price IDs ($109/$129) that must NEVER be charged again.
const OLD_PRICE_IDS = [
  "price_1ToobiGwm9wIWlgiFIbOgBJC", // ESA $109
  "price_1ToocNGwm9wIWlgitsjhAK0u", // ESA $129
  "price_1TooczGwm9wIWlgiY4BR5epM", // PSD $109
  "price_1ToodQGwm9wIWlgi0CmvxnZr", // PSD $129
];

// LIVE (production) Price IDs — must NEVER appear in the TEST primary charge /
// matrix paths. (The legacy renewal/upgrade functions that used to hardcode these
// were RETIRED to inert 410 stubs in CLOSEOUT-005 Phase D — see the retired-
// endpoint guards below, which forbid ANY price_ ID in those functions.)
const LIVE_PRICE_ID_PREFIX = /price_1TF1a[A-Za-z0-9]+/;

// Any Stripe Price ID, a Stripe API/creation call, or client-billing input — all
// forbidden in the retired renewal/upgrade endpoints (Phase D inert 410 stubs).
const ANY_PRICE_ID = /price_[A-Za-z0-9]{6,}/;
const STRIPE_CALL = /new\s+Stripe\s*\(|esm\.sh\/stripe|stripe\.(checkout|subscriptions|subscriptionSchedules|paymentIntents|prices|customers)\b|checkout\.sessions\.create/;
const CLIENT_BILLING = /req\.json\s*\(|\bpetCount\b|\bpet_count\b|\bbillingCycle\b|\bbilling_cycle\b|\bpriceId\b|\bunit_amount\b/;

// Burned / rotated plaintext provisioning secret — must never reappear in source.
const BURNED_SECRETS = ["pv3_7Rk2Qm9Xb4Lt6Yw1Nc8Hd5Za0Vs3Jf"];

async function read(f) {
  try { return await readFile(resolve(ROOT, f), "utf8"); }
  catch { return null; }
}

/** Recursively collect .ts/.tsx files under a dir. */
async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(resolve(ROOT, dir), { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

async function main() {
  const problems = [];
  const need = (src, file, re, msg) => {
    if (src == null) { problems.push(`${file} — MISSING`); return; }
    if (!re.test(src)) problems.push(`${file} — ${msg}`);
  };
  const forbid = (src, file, re, msg) => {
    if (src == null) { problems.push(`${file} — MISSING`); return; }
    if (re.test(src)) problems.push(`${file} — ${msg}`);
  };

  const cpi = await read("supabase/functions/create-payment-intent/index.ts");
  const ccs = await read("supabase/functions/create-checkout-session/index.ts");
  const wh = await read("supabase/functions/stripe-webhook/index.ts");
  const matrix = await read("supabase/functions/_shared/pricingMatrix.ts");
  const sched = await read("supabase/functions/_shared/subscriptionSchedule.ts");
  const provision = await read("supabase/functions/provision-subscription-prices/index.ts");
  const assess = await read("src/pages/assessment/page.tsx");
  const step3 = await read("src/pages/assessment/components/Step3Checkout.tsx");
  const psd3 = await read("src/pages/psd-assessment/components/PSDStep3Checkout.tsx");
  const renewalFn = await read("supabase/functions/create-renewal-checkout/index.ts");
  const upgradeFn = await read("supabase/functions/create-upgrade-checkout/index.ts");

  // ── Charge paths: consultation + subscription-coupon rejection, no stale IDs ──
  for (const [file, src] of [["create-payment-intent", cpi], ["create-checkout-session", ccs]]) {
    const f = `supabase/functions/${file}/index.ts`;
    need(src, f, /no longer available[\s\S]{0,80}410|410[\s\S]{0,80}retired|retired:\s*true/, "must REJECT the retired PSD consultation (410)");
    need(src, f, /couponRejected|can't be applied to subscription/, "must REJECT public coupons on subscriptions");
    for (const pid of OLD_PRICE_IDS) forbid(src, f, new RegExp(pid), `reintroduces retired recurring Price ID ${pid}`);
    forbid(src, f, LIVE_PRICE_ID_PREFIX, "contains a LIVE production Price ID (price_1TF1a…) in TEST");
    forbid(src, f, /esa_additional_pet|esa_subscription_addon/, "references a retired per-pet add-on key in a charge path");
  }
  // Matrix must be free of OLD and LIVE ids.
  for (const pid of OLD_PRICE_IDS) forbid(matrix, "supabase/functions/_shared/pricingMatrix.ts", new RegExp(pid), `matrix contains retired Price ID ${pid}`);
  forbid(matrix, "supabase/functions/_shared/pricingMatrix.ts", LIVE_PRICE_ID_PREFIX, "matrix contains a LIVE production Price ID in TEST");

  // ── Webhook attaches the two-phase renewal schedule on the first invoice ──
  const whf = "supabase/functions/stripe-webhook/index.ts";
  need(wh, whf, /attachRenewalSchedule/, "webhook must call attachRenewalSchedule");
  need(wh, whf, /subscription_create/, "webhook must handle the subscription_create invoice to attach the schedule");

  // ── Schedule helper integrity (first-year + renewal phase, boundary, release, idempotency) ──
  const sf = "supabase/functions/_shared/subscriptionSchedule.ts";
  need(sched, sf, /from_subscription/, "schedule must be built from_subscription (Option B)");
  need(sched, sf, /end_behavior:\s*["']release["']/, "schedule must set end_behavior=release");
  need(sched, sf, /renewalPriceIdForFirstYear/, "schedule must resolve the renewal-phase price from the first-year price");
  need(sched, sf, /iterations:\s*1[\s\S]*?iterations:\s*1/, "schedule must define TWO one-period phases (first-year boundary + renewal)");
  need(sched, sf, /already_scheduled/, "schedule must guard against double-scheduling at the Stripe level");
  need(sched, sf, /order_already_scheduled/, "schedule must guard against double-scheduling at the DB level");

  // ── Provisioning security (env secret + service-role + rails; no plaintext) ──
  const pf = "supabase/functions/provision-subscription-prices/index.ts";
  need(provision, pf, /Deno\.env\.get\("PROVISION_SECRET"\)/, "provisioning must read PROVISION_SECRET from env (not hardcoded)");
  // Check the actual gate EXPRESSIONS (not just the strings, which also appear in comments).
  need(provision, pf, /callerRole\s*!==\s*"service_role"/, "provisioning must gate on a service-role JWT (role !== service_role → deny)");
  need(provision, pf, /x-provision-secret[\s\S]{0,60}PROVISION_SECRET/, "provisioning must require the env secret as a second factor");
  need(provision, pf, /includes\("_live_"\)/, "provisioning must keep the LIVE-only key rail (reject non *_live_* key)");
  need(provision, pf, /livemode\s*!==\s*true/, "provisioning must keep the livemode=true abort rail");
  // No plaintext PROVISION_SECRET literal in any edge function.
  for (const [name, src] of [[pf, provision], ["create-payment-intent", cpi], ["create-checkout-session", ccs], ["stripe-webhook", wh]]) {
    forbid(src, name, /PROVISION_SECRET\s*=\s*["'][^"']+["']/, "hardcodes a plaintext PROVISION_SECRET literal (use Deno.env.get)");
  }

  // ── Phase D: retired renewal/upgrade endpoints must be inert 410 stubs ───────
  // These orphaned functions used to hardcode LIVE Price IDs, trust client pricing
  // and create Stripe sessions with NO auth. They were retired to inert 410 stubs;
  // the real renewal/upgrade flows run through the authenticated portal + phased
  // assessment checkout. Fail the build if either regresses into a billing path.
  for (const [file, src] of [["create-renewal-checkout", renewalFn], ["create-upgrade-checkout", upgradeFn]]) {
    const f = `supabase/functions/${file}/index.ts`;
    need(src, f, /status:\s*410/, "retired endpoint must respond HTTP 410 Gone");
    need(src, f, /retired/i, "retired endpoint must declare itself retired");
    forbid(src, f, ANY_PRICE_ID, "retired endpoint must not contain any Stripe Price ID");
    forbid(src, f, STRIPE_CALL, "retired endpoint must not import Stripe or make any Stripe API/creation call");
    forbid(src, f, CLIENT_BILLING, "retired endpoint must not read the request body or trust client amount/tier/pet count");
  }

  // ── No burned secret anywhere in tracked source; provisioning never called from the app ──
  const scanDirs = ["src", "supabase/functions", "scripts"];
  const files = (await Promise.all(scanDirs.map(walk))).flat();
  for (const rel of files) {
    const src = await read(rel);
    if (src == null) continue;
    for (const bad of BURNED_SECRETS) {
      if (src.includes(bad)) problems.push(`${rel} — contains a burned/rotated provisioning secret`);
    }
    if (rel.startsWith("src") && /["'`]provision-subscription-prices["'`]|functions\/v1\/provision-subscription-prices/.test(src)) {
      problems.push(`${rel} — frontend must never invoke provision-subscription-prices (ops-only)`);
    }
    // Phase D: no active frontend component may invoke the retired renewal/upgrade
    // endpoints (this also keeps the retired $70 upgrade path from becoming reachable).
    if (rel.startsWith("src") && /functions\/v1\/create-(renewal|upgrade)-checkout|["'`]create-(renewal|upgrade)-checkout["'`]/.test(src)) {
      problems.push(`${rel} — active frontend must not invoke the retired renewal/upgrade checkout endpoints`);
    }
  }

  // ── Checkout UI: coupon hidden on subscription + renewal disclosure present ──
  need(step3, "src/pages/assessment/components/Step3Checkout.tsx", /isSubscription\s*\?\s*null/, "ESA checkout must hide the coupon field on subscription");
  need(psd3, "src/pages/psd-assessment/components/PSDStep3Checkout.tsx", /isSubscription\s*\?\s*null/, "PSD checkout must hide the coupon field on subscription");
  need(step3, "src/pages/assessment/components/Step3Checkout.tsx", /renewalPrice/, "ESA checkout must reference the renewal price for disclosure");
  need(step3, "src/pages/assessment/components/Step3Checkout.tsx", /first year, then|renews at[\s\S]{0,40}next year/, "ESA checkout must disclose that it renews next year (not a permanent price)");
  need(psd3, "src/pages/psd-assessment/components/PSDStep3Checkout.tsx", /renewalPrice/, "PSD checkout must reference the renewal price for disclosure");
  need(psd3, "src/pages/psd-assessment/components/PSDStep3Checkout.tsx", /first year[\s\S]{0,10}then|renews/, "PSD checkout must disclose that it renews next year (not a permanent price)");

  // ── testCheckout bypass must stay DEV-gated (never production-reachable) ──
  need(assess, "src/pages/assessment/page.tsx", /import\.meta\.env\.DEV\s*&&\s*[\s\S]{0,120}testCheckout/, "testCheckout must be gated behind import.meta.env.DEV");

  // ── One-time PaymentIntent minter must hard-code plan:"one-time" (never step3.plan) ──
  // fetchClientSecret is the SOLE live one-time PI minter; its clientSecret feeds only the
  // one-time StripePaymentForm (the subscription path mints its own PI at pay time via
  // subscriptionParams/StripeCardForm). A stale `step3.plan` closure here mints a SUBSCRIPTION
  // PaymentIntent and writes its annual amount into quotedBasePriceDollars, collapsing the
  // one-time price onto the subscription price when toggling Subscribe→One-time
  // (P0 CHECKOUT-PRICING-STABILITY-001 / LIVE-CHECKOUT-TOGGLE-PARITY-HOTFIX-008).
  {
    const af = "src/pages/assessment/page.tsx";
    if (assess == null) problems.push(`${af} — MISSING`);
    else {
      // Isolate the fetchClientSecret create-payment-intent body: the block bounded by
      // `state: s2.state,` and `packageKey: pkg,` (both unique to that one call).
      const body = assess.match(/state:\s*s2\.state,([\s\S]{0,1200}?)packageKey:\s*pkg,/);
      if (!body) problems.push(`${af} — could not locate the fetchClientSecret create-payment-intent body (state→packageKey block)`);
      else {
        if (!/plan:\s*["']one-time["']/.test(body[1])) problems.push(`${af} — one-time PaymentIntent minter must hard-code plan:"one-time" in the create-payment-intent body`);
        if (/plan:\s*step3\.plan/.test(body[1])) problems.push(`${af} — one-time PaymentIntent minter must NOT send the dynamic plan:step3.plan (stale closure collapses one-time onto the subscription price)`);
      }
    }
  }

  if (problems.length === 0) {
    console.log(`${TAG} OK — consultation & sub-coupons rejected; no old/LIVE price IDs; schedule wired (2-phase/release/idempotent); provisioning env-secret + service-role gated; no plaintext/burned secret; coupon hidden + renewal disclosed on subscription; testCheckout DEV-gated; one-time PI minter hard-codes plan:one-time.`);
    return;
  }
  console.error(`${TAG} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
