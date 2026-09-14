#!/usr/bin/env node
/**
 * check-partner-api-behaviour.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 -- BEHAVIOURAL test of the
 * deployed partner intake API.
 *
 * This is not a static guard. It sends real HTTP requests to the deployed
 * edge function and asserts the documented contract, because the contract that
 * matters is the one the deployed function actually honours.
 *
 * CREDENTIALS COME FROM THE ENVIRONMENT, NEVER FROM THE REPO:
 *   PARTNER_API_BASE      e.g. https://<ref>.supabase.co/functions/v1
 *   PARTNER_API_KEY_ID    sandbox key id
 *   PARTNER_API_SECRET    sandbox secret
 *   PARTNER_API_KEY_ID_2  (optional) second partner, for cross-tenant denial
 *   PARTNER_API_SECRET_2  (optional)
 *
 * Without them the script SKIPS rather than fails, so it never blocks a build
 * on a machine that has no sandbox credential.
 *
 * EVERY fixture uses a reserved, non-deliverable TLD (RFC 2606 .test/.invalid)
 * so nothing here can reach a real inbox, and the accepted rows are flagged
 * is_test by the acceptance function.
 */

const BASE = process.env.PARTNER_API_BASE;
const KEY_ID = process.env.PARTNER_API_KEY_ID;
const SECRET = process.env.PARTNER_API_SECRET;
const KEY_ID_2 = process.env.PARTNER_API_KEY_ID_2;
const SECRET_2 = process.env.PARTNER_API_SECRET_2;

const RUN_TAG = process.env.PARTNER_FIXTURE_TAG || `FIXT-${Date.now()}`;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function call(path, { method = "POST", body, headers = {}, keyId = KEY_ID, secret = SECRET } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (keyId !== null) h["X-Partner-Key-Id"] = keyId;
  if (secret !== null) h["X-Partner-Secret"] = secret;
  const res = await fetch(`${BASE}/partner-orders-v1${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

/** A complete, valid, obviously-synthetic order. */
function validOrder(overrides = {}) {
  const base = {
    partner_order_id: `${RUN_TAG}-${Math.random().toString(36).slice(2, 8)}`,
    payment: { status: "paid", reference: "partner-retail-ref-000" },
    service: "esa",
    customer: {
      legal_first_name: "Fixture",
      legal_last_name: "Testcase",
      email: `fixture-${Math.random().toString(36).slice(2, 8)}@partner-fixture.test`,
      phone: "+15555550100",
      date_of_birth: "1990-01-01",
      current_physical_state: "NY",
    },
    animals: [{ name: "Fixture Pet", type: "Dog", breed: "Mixed", age: "3", weight: "20" }],
    assessment: {
      schema_version: "partner.assessment.v1",
      answers: {
        primaryConcern: "anxiety",
        symptomDescription: "Synthetic fixture answer for automated contract testing.",
        durationOfSymptoms: "over_1_year",
      },
    },
    consents: {
      telehealth: { accepted: true, at: new Date().toISOString(), evidence: "fixture" },
      privacy_data_transfer: { accepted: true, at: new Date().toISOString(), evidence: "fixture" },
      electronic_signature: { name: "Fixture Testcase", at: new Date().toISOString(), evidence: "fixture" },
    },
  };
  return deepMerge(base, overrides);
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) { delete out[k]; continue; }
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])
      ? deepMerge(a[k], v)
      : v;
  }
  return out;
}

const idem = () => `idem-${RUN_TAG}-${Math.random().toString(36).slice(2, 10)}`;

async function main() {
  if (!BASE || !KEY_ID || !SECRET) {
    console.log("check-partner-api-behaviour: SKIPPED (no sandbox credential in environment)");
    process.exitCode = 0;
    return;
  }

  console.log(`check-partner-api-behaviour -- run tag ${RUN_TAG}`);
  const accepted = [];

  // ── 1. Valid paid ESA order ───────────────────────────────────────────────
  const esa = validOrder();
  const esaKey = idem();
  const r1 = await call("/orders", { body: esa, headers: { "Idempotency-Key": esaKey } });
  check("1  valid paid ESA order is accepted (201)", r1.status === 201, `got ${r1.status} ${JSON.stringify(r1.json)}`);
  check("1a accepted order returns a PawTenant reference",
    typeof r1.json?.pawtenant_reference === "string" && r1.json.pawtenant_reference.startsWith("PT-"),
    JSON.stringify(r1.json));
  if (r1.json?.pawtenant_reference) accepted.push(r1.json.pawtenant_reference);

  // ── 2. Valid paid PSD order — canonical partner.assessment.psd.v1 ─────────
  // Slice 7 made the canonical contract mandatory for PSD: the retail psd_v1
  // catalog verbatim (16 required ids; conditions/dogTasks are arrays). The
  // old generic-answers PSD fixture is now CORRECTLY refused (see 2b).
  const psd = validOrder({ service: "psd" });
  // Replace (never merge) the assessment: the canonical contract refuses
  // unknown question ids, so the generic base answers must not leak in.
  psd.assessment = {
    schema_version: "partner.assessment.psd.v1",
    answers: {
        safetyCheck: "no",
        dogTasks: ["deep_pressure_therapy", "interrupt_anxiety"],
        taskTraining: "professional_trainer",
        taskDescription: "Synthetic fixture: the dog performs trained deep-pressure therapy on cue.",
        taskReliability: "always",
        taskPublicAccess: "yes",
        dogDuration: "over_2_years",
        emotionalFrequency: "daily",
        conditions: ["anxiety"],
        lifeChangeStress: "moderate",
        dailyImpact: "significant",
        medication: "no",
        priorDiagnosis: "yes",
        currentTreatment: "therapy",
        dogHelpDescription: "Synthetic fixture answer for automated contract testing.",
        housingType: "apartment",
    },
  };
  const r2 = await call("/orders", { body: psd, headers: { "Idempotency-Key": idem() } });
  check("2  canonical PSD order is accepted (201)", r2.status === 201, `got ${r2.status} ${JSON.stringify(r2.json)}`);
  if (r2.json?.pawtenant_reference) accepted.push(r2.json.pawtenant_reference);

  // ── 2b. Generic PSD answers are refused (the Slice 7 contract) ────────────
  const r2b = await call("/orders", {
    body: validOrder({ service: "psd" }),
    headers: { "Idempotency-Key": idem() },
  });
  check("2b PSD without the canonical contract is refused (422)",
    r2b.status === 422, `got ${r2b.status}`);

  // ── 3. Duplicate IDENTICAL retry -> same order, no duplicate ──────────────
  const r3 = await call("/orders", { body: esa, headers: { "Idempotency-Key": esaKey } });
  check("3  identical retry replays the SAME order", r3.status === 200 && r3.json?.idempotent_replay === true,
    `got ${r3.status} ${JSON.stringify(r3.json)}`);
  check("3a replay returns the SAME PawTenant reference",
    r3.json?.pawtenant_reference === r1.json?.pawtenant_reference,
    `${r3.json?.pawtenant_reference} vs ${r1.json?.pawtenant_reference}`);

  // ── 4. Same key + CHANGED payload -> conflict ─────────────────────────────
  const mutated = deepMerge(esa, { customer: { legal_first_name: "Changed" } });
  const r4 = await call("/orders", { body: mutated, headers: { "Idempotency-Key": esaKey } });
  check("4  same idempotency key + different payload -> 409", r4.status === 409, `got ${r4.status}`);
  check("4a conflict uses the documented code", r4.json?.error?.code === "idempotency_conflict",
    JSON.stringify(r4.json?.error));

  // ── 4b. Same partner_order_id + different payload, NEW key -> conflict ────
  const r4b = await call("/orders", { body: mutated, headers: { "Idempotency-Key": idem() } });
  check("4b same partner_order_id with different content -> 409",
    r4b.status === 409 && r4b.json?.error?.code === "partner_order_conflict",
    `got ${r4b.status} ${JSON.stringify(r4b.json?.error)}`);

  // ── 5. Unpaid request ─────────────────────────────────────────────────────
  const r5 = await call("/orders", {
    body: validOrder({ payment: { status: "pending", reference: "x" } }),
    headers: { "Idempotency-Key": idem() },
  });
  check("5  unpaid order is refused", r5.status === 422 && r5.json?.error?.code === "payment_not_paid",
    `got ${r5.status} ${JSON.stringify(r5.json?.error)}`);

  // ── 6. Missing consent ────────────────────────────────────────────────────
  const noConsent = validOrder();
  delete noConsent.consents.telehealth;
  const r6 = await call("/orders", { body: noConsent, headers: { "Idempotency-Key": idem() } });
  check("6  missing telehealth consent is refused",
    r6.status === 422 && r6.json?.error?.code === "consent_missing",
    `got ${r6.status} ${JSON.stringify(r6.json?.error)}`);

  // ── 7. Unsupported state / service ────────────────────────────────────────
  const r7a = await call("/orders", {
    body: validOrder({ customer: { current_physical_state: "ZZ" } }),
    headers: { "Idempotency-Key": idem() },
  });
  check("7a invalid state is refused", r7a.status === 422, `got ${r7a.status}`);

  const r7b = await call("/orders", {
    body: validOrder({ service: "notarization" }),
    headers: { "Idempotency-Key": idem() },
  });
  check("7b unsupported service is refused",
    r7b.status === 422 && r7b.json?.error?.code === "service_unsupported",
    `got ${r7b.status} ${JSON.stringify(r7b.json?.error)}`);

  // ── 8/9. Missing + wrong authentication ───────────────────────────────────
  const r9 = await call("/orders", {
    body: validOrder(), headers: { "Idempotency-Key": idem() }, keyId: null, secret: null,
  });
  check("9  missing authentication -> 401", r9.status === 401, `got ${r9.status}`);

  const r8 = await call("/orders", {
    // Deliberately invalid. Written so a secret scanner cannot mistake it for a
    // real credential shape.
    body: validOrder(), headers: { "Idempotency-Key": idem() }, secret: "INVALID-NEGATIVE-CONTROL-VALUE",
  });
  check("8  wrong secret -> 401", r8.status === 401, `got ${r8.status}`);
  check("8a auth failure reveals nothing beyond the code",
    r8.json?.error?.code === "unauthenticated" && !JSON.stringify(r8.json).match(/sql|postgres|relation|column/i),
    JSON.stringify(r8.json));

  // ── 10. Oversized / malformed payload ─────────────────────────────────────
  const huge = validOrder();
  huge.assessment.answers.symptomDescription = "x".repeat(200_000);
  const r10a = await call("/orders", { body: huge, headers: { "Idempotency-Key": idem() } });
  check("10a oversized payload is refused (413)", r10a.status === 413, `got ${r10a.status}`);

  const r10b = await fetch(`${BASE}/partner-orders-v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Partner-Key-Id": KEY_ID, "X-Partner-Secret": SECRET, "Idempotency-Key": idem(),
    },
    body: "{ this is not json",
  });
  check("10b malformed JSON is refused (400)", r10b.status === 400, `got ${r10b.status}`);

  // ── 10c. Unexpected field violates the schema ─────────────────────────────
  const r10c = await call("/orders", {
    body: { ...validOrder(), retail_price_usd: 199 },
    headers: { "Idempotency-Key": idem() },
  });
  check("10c unexpected top-level field is refused",
    r10c.status === 422 && r10c.json?.error?.code === "schema_violation",
    `got ${r10c.status} ${JSON.stringify(r10c.json?.error)}`);

  // ── 10d. Card data is REJECTED, never silently stripped ───────────────────
  const r10d = await call("/orders", {
    body: deepMerge(validOrder(), { payment: { reference: "4242424242424242" } }),
    headers: { "Idempotency-Key": idem() },
  });
  check("10d card-shaped data is rejected outright",
    r10d.status === 422 && r10d.json?.error?.code === "payment_credentials_rejected",
    `got ${r10d.status} ${JSON.stringify(r10d.json?.error)}`);

  // ── Missing idempotency key ───────────────────────────────────────────────
  const rIdem = await call("/orders", { body: validOrder() });
  check("11 missing Idempotency-Key is refused",
    rIdem.status === 400 && rIdem.json?.error?.code === "idempotency_key_required",
    `got ${rIdem.status}`);

  // ── Credential in query string is refused, not ignored ────────────────────
  const rQuery = await fetch(`${BASE}/partner-orders-v1/orders?secret=leaked`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Partner-Key-Id": KEY_ID, "X-Partner-Secret": SECRET, "Idempotency-Key": idem(),
    },
    body: JSON.stringify(validOrder()),
  });
  check("12 a credential in the query string is refused", rQuery.status === 401, `got ${rQuery.status}`);

  // ── Status retrieval ──────────────────────────────────────────────────────
  const rStatus = await call(`/orders/${encodeURIComponent(esa.partner_order_id)}`, { method: "GET" });
  check("13 status endpoint returns the accepted order",
    rStatus.status === 200 && rStatus.json?.pawtenant_reference === r1.json?.pawtenant_reference,
    `got ${rStatus.status} ${JSON.stringify(rStatus.json)}`);
  check("13a status exposes a clinical state", typeof rStatus.json?.clinical_status === "string",
    JSON.stringify(rStatus.json));

  const rMissing = await call(`/orders/${RUN_TAG}-does-not-exist`, { method: "GET" });
  check("13b unknown reference -> 404", rMissing.status === 404, `got ${rMissing.status}`);

  // ── 16. Cross-partner access denial ───────────────────────────────────────
  if (KEY_ID_2 && SECRET_2) {
    const rCross = await call(`/orders/${encodeURIComponent(esa.partner_order_id)}`, {
      method: "GET", keyId: KEY_ID_2, secret: SECRET_2,
    });
    check("16 partner B cannot read partner A's order (404, not 403)",
      rCross.status === 404, `got ${rCross.status} ${JSON.stringify(rCross.json)}`);
  } else {
    console.log("  SKIP  16 cross-partner denial (no second credential in environment)");
  }

  // ── No PHI in any error response ──────────────────────────────────────────
  const phiProbe = JSON.stringify([r5.json, r6.json, r7a.json, r7b.json, r10c.json, r8.json]);
  check("17 no error response echoes customer PHI",
    !/Fixture|Testcase|@partner-fixture\.test|1990-01-01/.test(phiProbe),
    "an error body contained fixture PHI");

  console.log(`\n  accepted fixture references: ${accepted.join(", ") || "(none)"}`);
  console.log(`\ncheck-partner-api-behaviour: ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("check-partner-api-behaviour: harness error", e);
  process.exitCode = 1;
});
