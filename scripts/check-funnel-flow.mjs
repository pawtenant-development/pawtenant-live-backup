// scripts/check-funnel-flow.mjs
//
// TEST-ASSESSMENT-DIRECT-CHECKOUT-NO-OTP-001 — deterministic funnel-flow guard.
//
// BLOCKING (exit 1) if TEST assessment direct checkout or package-change access regresses. Static
// source assertions over the real files (no runtime, no network). Mirrors the
// task's 22-point guard; items 21–22 (pricing / route-status / prerender guards)
// are enforced by their own existing check-*.mjs and run separately in the build.
//
// The 12 negative controls (A–L) are proven by `--self-test`, which applies each
// breaking mutation IN MEMORY and asserts the matching check trips — so nothing
// is ever written to disk and no mutation can be committed.
//
// Usage:
//   node scripts/check-funnel-flow.mjs             → guard the real files (exit 1 on fail)
//   node scripts/check-funnel-flow.mjs --warn-only → audit (always exit 0)
//   node scripts/check-funnel-flow.mjs --self-test → prove every negative control trips

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const selfTest = process.argv.includes("--self-test");
const TAG = "[check-funnel-flow]";

const PATHS = {
  esa: "src/pages/assessment/page.tsx",
  psd: "src/pages/psd-assessment/page.tsx",
  otp: "src/pages/assessment/components/CustomerOtpStep.tsx",
  pkg: "src/pages/assessment/components/PackageSelectionStep.tsx",
  esaCheckout: "src/pages/assessment/components/Step3Checkout.tsx",
  psdCheckout: "src/pages/psd-assessment/components/PSDStep3Checkout.tsx",
  track: "src/lib/trackEvent.ts",
  flag: "src/config/flowVersion.ts",
};
// Funnel files that must NOT touch the separate portal RA add-on pricing.
const FUNNEL_FILES = ["esa", "psd", "otp", "pkg", "esaCheckout", "psdCheckout", "track", "flag"];

async function readAll() {
  const files = {};
  for (const [k, p] of Object.entries(PATHS)) {
    try { files[k] = await readFile(resolve(ROOT, p), "utf8"); }
    catch { files[k] = null; }
  }
  return files;
}

/** Slice out a `const <name> = (...) => { ... };` body for scoped assertions. */
function fnBody(src, name) {
  const m = (src ?? "").match(new RegExp(`const ${name} = (?:async\\s+)?\\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};`));
  return m ? m[1] : "";
}

// Each check: { id, run(files) -> problem string | null }. A null return = pass.
const CHECKS = [
  { id: "C1-esa-no-otp", run: (f) => !/CustomerOtpStep|checkoutGate\s*===\s*["']otp["']|setCheckoutGate\(\s*["']otp["']\s*\)/.test(f.esa ?? "") ? null : "ESA assessment must not import, mount, or route to OTP on TEST" },
  { id: "C1-psd-no-otp", run: (f) => !/CustomerOtpStep|checkoutGate\s*===\s*["']otp["']|setCheckoutGate\(\s*["']otp["']\s*\)/.test(f.psd ?? "") ? null : "PSD assessment must not import, mount, or route to OTP on TEST" },
  { id: "C2-flag-default-direct", run: (f) => /return "direct_checkout_v1";/.test(f.flag ?? "") ? null : "flowVersion default must be direct_checkout_v1" },
  { id: "C3-esa-package-not-mandatory", run: (f) => /setCheckoutGate\("pay"\)/.test(fnBody(f.esa ?? "", "goNext")) ? null : "ESA Personal Details must continue directly to pay" },
  { id: "C3-psd-package-not-mandatory", run: (f) => /setCheckoutGate\("pay"\)/.test(fnBody(f.psd ?? "", "handleStep2Next")) ? null : "PSD Personal Details must continue directly to pay" },
  { id: "C3b-esa-lead-deadline", run: (f) => /"get-resume-order\/upsert-lead"[\s\S]{0,500}signal:\s*AbortSignal\.timeout\(8_000\)/.test(f.esa ?? "") ? null : "ESA Personal Details lead save must have an 8-second deadline" },
  { id: "C3b-psd-lead-deadline", run: (f) => /"get-resume-order\/upsert-psd-lead"[\s\S]{0,500}signal:\s*AbortSignal\.timeout\(8_000\)/.test(f.psd ?? "") ? null : "PSD Personal Details lead save must have an 8-second deadline" },
  { id: "C4-esa-change-reachable", run: (f) => (/onChangePackage=\{\(\) => \{ trackPackageChangeOpened\(confirmationId\.current, "esa"\); setCheckoutGate\("package"\)/.test(f.esa ?? "") && /import PackageSelectionStep/.test(f.esa ?? "")) ? null : "ESA checkout must keep 'Change package' → setCheckoutGate('package') and still import PackageSelectionStep" },
  { id: "C4-psd-change-reachable", run: (f) => (/onChangePackage=\{\(\) => \{ trackPackageChangeOpened\(confirmationId, "psd"\); setCheckoutGate\("package"\)/.test(f.psd ?? "") && /import PackageSelectionStep|PackageSelectionStep/.test(f.psd ?? "")) ? null : "PSD checkout must keep 'Change package' → setCheckoutGate('package') and still render PackageSelectionStep" },
  { id: "C5-esa-standard-default", run: (f) => /get\("package"\) === "esa_ra_bundle"[\s\S]{0,60}"esa_standard"/.test(f.esa ?? "") ? null : "ESA default package must be esa_standard (RA only via explicit ?package)" },
  { id: "C6-psd-standard-default", run: (f) => /\? "psd_ra_bundle" : "psd_standard"/.test(f.psd ?? "") ? null : "PSD default package must be psd_standard (RA only via explicit ?package)" },
  { id: "C7-esa-ra-not-autoselected", run: (f) => /: "esa_standard";/.test(f.esa ?? "") ? null : "ESA package initializer must resolve to esa_standard by default (RA must NOT be auto-selected)" },
  { id: "C8-esa-select-returns-pay", run: (f) => /const next = \(pkg === "esa_ra_bundle" \? "esa_ra_bundle" : "esa_standard"\);[\s\S]*?setCheckoutGate\("pay"\)/.test(f.esa ?? "") ? null : "ESA handlePackageSelect must return to the pay gate" },
  { id: "C8-psd-select-returns-pay", run: (f) => /setCheckoutGate\("pay"\)/.test(fnBody(f.psd ?? "", "handlePackageSelect")) ? null : "PSD handlePackageSelect must return to the pay gate" },
  { id: "C9-esa-plan-survives-change", run: (f) => /setStep3/.test(fnBody(f.esa ?? "", "handlePackageChange")) ? "ESA handlePackageChange must NOT reset the plan (no setStep3 in package change)" : null },
  { id: "C10-esa-resume-restores-plan", run: (f) => /savedBillingPlan === "annual"\) setStep3\(\(s\) => \(\{ \.\.\.s, plan: "subscription" \}\)\)/.test(f.esa ?? "") ? null : "ESA resume must restore billing_plan (annual → subscription)" },
  { id: "C10-psd-resume-restores-plan", run: (f) => (/setResumedPlan\("subscription"\)/.test(f.psd ?? "") && /initialPlan \?\? "onetime"/.test(f.psdCheckout ?? "")) ? null : "PSD resume must restore billing_plan (resumedPlan → PSDStep3Checkout initialPlan)" },
  { id: "C12-esa-no-order-create-in-checkout", run: (f) => /status:\s*["']lead["']/.test(f.esaCheckout ?? "") ? "ESA checkout component must NOT create a lead/order row" : null },
  { id: "C12-psd-no-order-create-in-checkout", run: (f) => /status:\s*["']lead["']/.test(f.psdCheckout ?? "") ? "PSD checkout component must NOT create a lead/order row" : null },
  { id: "C13-esa-single-pi", run: (f) => ((fnBody(f.esa ?? "", "goNext").match(/fetchClientSecret\(/g) || []).length === 1) ? null : "ESA Personal Details must mint at most one PaymentIntent before checkout" },
  { id: "C14-esa-change-reprices", run: (f) => /fetchClientSecret\(/.test(fnBody(f.esa ?? "", "handlePackageChange")) ? null : "ESA handlePackageChange must re-price via fetchClientSecret (server re-derivation)" },
  { id: "C15-esa-stale-secret-remount", run: (f) => /key=\{stripeClientSecret/.test(f.esaCheckout ?? "") ? null : "ESA checkout must remount <Elements key={stripeClientSecret}> so a stale secret can't be confirmed" },
  { id: "C18b-esa-checkout-viewed", run: (f) => /trackCheckoutViewed\(confirmationId, \{ funnel_type: "esa", flow_version: flowVersionProp\(\) \}\)/.test(f.esaCheckout ?? "") ? null : "ESA checkout_viewed must fire on render with flow_version (checkout_viewed repair)" },
  { id: "C18b-psd-checkout-viewed", run: (f) => /trackCheckoutViewed\(confirmationId, \{ funnel_type: "psd", flow_version: flowVersionProp\(\) \}\)/.test(f.psdCheckout ?? "") ? null : "PSD checkout_viewed must fire on render with flow_version (checkout_viewed repair)" },
  { id: "CH-esa-no-plan-leak", run: (f) => /plan: "one-time",\s*\n\s*packageKey: pkg,/.test(f.esa ?? "") ? null : 'ESA create-payment-intent body must hard-code plan: "one-time" (never step3.plan) — stale-closure price bug (CHECKOUT-PRICING-STABILITY-001)' },
  { id: "C16-esa-attribution-preserved", run: (f) => /getSessionId/.test(f.esa ?? "") ? null : "ESA must preserve the analytics session (getSessionId) — direct checkout must not start a new session" },
  { id: "C17-events-exist", run: (f) => {
      const need = ["trackOtpScreenViewed", "trackOtpSendSucceeded", "trackOtpSendFailed", "trackOtpEntryStarted", "trackOtpResendRequested", "trackOtpVerifyFailed", "trackPostOtpDestination", "trackPackageChangeOpened", "trackPackageScreenViewed", "trackPackageSelected", "trackPlanChanged"];
      const missing = need.filter((n) => !new RegExp(`export function ${n}\\b`).test(f.track ?? ""));
      return missing.length ? `trackEvent.ts missing required helpers: ${missing.join(", ")}` : null;
    } },
  { id: "C18-no-otp-code-in-events", run: (f) => {
      for (const k of ["otp", "track"]) {
        if (/track\w+\([^)]*\bcode\b/.test(f[k] ?? "")) return `${PATHS[k]} passes an OTP code into an analytics event (forbidden)`;
      }
      return null;
    } },
  { id: "C19-esa-no-psd-terms", run: (f) => /psd_ra_bundle/.test(f.esa ?? "") ? "ESA orchestrator must not reference PSD package keys" : null },
  { id: "C19-psd-no-esa-terms", run: (f) => /esa_ra_bundle/.test(f.psd ?? "") ? "PSD orchestrator must not reference ESA package keys" : null },
  { id: "C20-funnel-untouches-addon-pricing", run: (f) => {
      for (const k of FUNNEL_FILES) {
        if (/ADDON_AMOUNT_CENTS|ADDITIONAL_DOC_PRICING/.test(f[k] ?? "")) return `${PATHS[k]} references the portal RA add-on pricing — out of scope for this task (see PORTAL-ADDON-PRICE-RECONCILE-001)`;
      }
      return null;
    } },
];

function runChecks(files) {
  return CHECKS.map((c) => ({ id: c.id, problem: c.run(files) })).filter((r) => r.problem);
}

// ── Negative controls: (mutator, expected check id that must trip) ──────────────
const CONTROLS = [
  ["A: OTP is reinserted into the ESA assessment", (f) => ({ ...f, esa: `<CustomerOtpStep />\n${f.esa}` }), "C1-esa-no-otp"],
  ["A2: ESA lead wait loses its deadline", (f) => ({ ...f, esa: f.esa.replace("signal: AbortSignal.timeout(8_000),", "") }), "C3b-esa-lead-deadline"],
  ["A3: PSD lead wait loses its deadline", (f) => ({ ...f, psd: f.psd.replace("signal: AbortSignal.timeout(8_000),", "") }), "C3b-psd-lead-deadline"],
  ["B: package unreachable from Change", (f) => ({ ...f, esa: f.esa.replace('trackPackageChangeOpened(confirmationId.current, "esa"); setCheckoutGate("package")', 'trackPackageChangeOpened(confirmationId.current, "esa")') }), "C4-esa-change-reachable"],
  ["C: RA becomes the default", (f) => ({ ...f, esa: f.esa.replace(': "esa_standard";', ': "esa_ra_bundle";') }), "C7-esa-ra-not-autoselected"],
  ["D: annual resets to one-time on package change", (f) => ({ ...f, esa: f.esa.replace("const handlePackageChange = (pkg: string) => {", "const handlePackageChange = (pkg: string) => {\n    setStep3((s) => ({ ...s, plan: \"one-time\" }));") }), "C9-esa-plan-survives-change"],
  ["E: resume loses billing plan", (f) => ({ ...f, esa: f.esa.replace('if (savedBillingPlan === "annual") setStep3((s) => ({ ...s, plan: "subscription" }));', "") }), "C10-esa-resume-restores-plan"],
  ["F: new order created on checkout entry", (f) => ({ ...f, esaCheckout: f.esaCheckout.replace("export default function Step3Checkout", 'const __x = { status: "lead" };\nexport default function Step3Checkout') }), "C12-esa-no-order-create-in-checkout"],
  ["G: duplicate identical PI minted", (f) => ({ ...f, esa: f.esa.replace("fetchClientSecret(step2, confirmationId.current);", "fetchClientSecret(step2, confirmationId.current);\n      fetchClientSecret(step2, confirmationId.current);") }), "C13-esa-single-pi"],
  ["H: client plan trusted (stale-closure leak)", (f) => ({ ...f, esa: f.esa.replace(/plan: "one-time",(\s*\n\s*packageKey: pkg,)/, "plan: step3.plan,$1") }), "CH-esa-no-plan-leak"],
  ["I: attribution/session reset", (f) => ({ ...f, esa: f.esa.replace(/getSessionId/g, "getNewSession") }), "C16-esa-attribution-preserved"],
  ["J: analytics event carries OTP code", (f) => ({ ...f, otp: f.otp.replace("trackOtpVerified(confirmationId, letterType,", "trackOtpVerified(confirmationId, letterType, { code: fullCode },") }), "C18-no-otp-code-in-events"],
  ["K: PSD receives ESA package/copy", (f) => ({ ...f, psd: f.psd.replace('const next = (pkg === "psd_ra_bundle" ? "psd_ra_bundle" : "psd_standard") as PackageKey;', 'const next = (pkg === "esa_ra_bundle" ? "esa_ra_bundle" : "psd_standard") as PackageKey;') }), "C19-psd-no-esa-terms"],
  ["L: funnel touches portal add-on pricing", (f) => ({ ...f, esa: f.esa.replace("const directCheckout = isDirectCheckout();", "const directCheckout = isDirectCheckout(); /* ADDITIONAL_DOC_PRICING */") }), "C20-funnel-untouches-addon-pricing"],
];

async function main() {
  const files = await readAll();
  const missing = Object.entries(PATHS).filter(([k]) => files[k] == null).map(([, p]) => p);
  if (missing.length) {
    console.error(`${TAG} FAIL — missing files: ${missing.join(", ")}`);
    if (!warnOnly) process.exit(1);
    return;
  }

  if (selfTest) {
    const failures = [];
    // 1) The real files must PASS the guard (baseline sanity).
    const baseProblems = runChecks(files);
    if (baseProblems.length) {
      for (const p of baseProblems) failures.push(`baseline unexpectedly failed: ${p.id} — ${p.problem}`);
    }
    // 2) Each negative control must TRIP its expected check.
    for (const [label, mutate, expectedId] of CONTROLS) {
      const mutated = mutate(files);
      const problems = runChecks(mutated);
      const tripped = problems.some((p) => p.id === expectedId);
      if (!tripped) failures.push(`control "${label}" did NOT trip ${expectedId} (guard would miss this regression)`);
    }
    if (failures.length) {
      console.error(`${TAG} SELF-TEST FAIL — ${failures.length} problem(s):`);
      for (const p of failures) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log(`${TAG} SELF-TEST OK — baseline passes; all ${CONTROLS.length} negative controls (A–L) trip their guard. No file mutated on disk.`);
    return;
  }

  const problems = runChecks(files);
  if (problems.length === 0) {
    console.log(`${TAG} OK — TEST direct-checkout flow verified: no assessment OTP (ESA+PSD), Assurance/Package not auto-shown, package reachable via Change, Standard default, RA not auto-selected, plan preserved (resume + change), PI reused, no order created at checkout, stale secret remounts, attribution intact, all funnel events present, no OTP code in analytics, ESA/PSD separated, portal add-on pricing untouched.`);
    return;
  }
  console.error(`${TAG} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ [${p.id}] ${p.problem}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
