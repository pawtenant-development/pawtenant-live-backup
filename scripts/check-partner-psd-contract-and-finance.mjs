#!/usr/bin/env node
/**
 * check-partner-psd-contract-and-finance.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 7.
 *
 * TWO INVARIANT FAMILIES
 * 1. CLINICAL CONTRACT — a partner PSD order exists only under the canonical
 *    versioned contract: all 16 psd_v1 questions, catalog ids only, no
 *    eligibility claims, no duplicate keys, no inference from generic fields,
 *    immutable normalization provenance, replay can never rewrite an accepted
 *    submission.
 * 2. FINANCE LEDGER — one immutable charge per order minted at clinical
 *    completion from the acceptance-frozen rate snapshot; never orders.price,
 *    never a hardcoded amount, never touching provider compensation; invoices
 *    freeze at issue; events bill once per non-void invoice; every write path
 *    is admin-gated; provider surfaces reference none of it.
 *
 * The validator is EXECUTED (bundled, run against stub clients); SQL and
 * wiring are asserted on comment-stripped, string-aware sources. --self-test
 * plants 15 real weakenings — including cross-slice regressions proven via
 * the Slice 5/6 guards as subprocesses — and demands every one is detected.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const VALIDATE = "supabase/functions/partner-orders-v1/validate.ts";
const INDEX = "supabase/functions/partner-orders-v1/index.ts";
const ACCEPT = "supabase/functions/partner-orders-v1/accept.ts";
const API_SHARED = "supabase/functions/_shared/partnerApi.ts";
const COMMS_GATE = "supabase/functions/_shared/partnerCommsGate.ts";
const DOC_GATE = "supabase/functions/_shared/partnerDocumentGate.ts";
const ASSIGN = "supabase/functions/assign-doctor/index.ts";
const MIG_A = "supabase/migrations/20260821100000_partner_psd_contract_snapshots.sql";
const MIG_B = "supabase/migrations/20260821110000_partner_finance_ledger.sql";
// PARTNER-PLATFORM-ADMIN-WORKSPACE-001: the finance surface moved from the
// PartnerFinancePanel accordion (under PartnerOrdersTab) to the Finance
// sub-tab of the Partner Platform workspace. The invariant is unchanged —
// wholesale economics render in EXACTLY ONE admin-only mount.
const FINANCE_PANEL = "src/pages/admin-orders/components/partner-platform/PartnerFinanceTab.tsx";
const FINANCE_HOST = "src/pages/admin-orders/components/partner-platform/PartnerPlatformWorkspace.tsx";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** Comment-stripper: string-aware; `sql` switches the line token to `--`. */
function stripComments(src, sql = false) {
  let out = "";
  let i = 0;
  let quote = null;
  const lineTok = sql ? "--" : "//";
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      out += ch;
      if (!sql && ch === "\\") { if (i + 1 < src.length) { out += src[i + 1]; i += 2; continue; } }
      else if (ch === quote) quote = null;
      else if (quote !== "`" && ch === "\n" && !sql) quote = null;
      i++;
      continue;
    }
    if (sql ? ch === "'" : (ch === "'" || ch === '"' || ch === "`")) { quote = ch; out += ch; i++; continue; }
    const two = src.slice(i, i + 2);
    if (two === lineTok) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (!sql && two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

async function loadValidator() {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, VALIDATE)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
    plugins: [{
      name: "external-remote",
      setup(b) { b.onResolve({ filter: /^https?:/ }, (a) => ({ path: a.path, external: true })); },
    }],
  });
  let code = result.outputFiles[0].text;
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*"https:[^"]+";?/g, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const CATALOG = [
  "conditions", "currentTreatment", "dailyImpact", "dogDuration", "dogHelpDescription",
  "dogTasks", "emotionalFrequency", "housingType", "lifeChangeStress", "medication",
  "priorDiagnosis", "safetyCheck", "taskDescription", "taskPublicAccess",
  "taskReliability", "taskTraining",
].map((q) => ({ question_id: q, required: true }))
  .concat(["medicationDetails", "specificDiagnosis", "taskEvidenceType", "taskEvidenceUrl", "treatmentDetails"]
    .map((q) => ({ question_id: q, required: false })));

/** Thenable query-chain stub answering per table. */
function stubAdmin({ catalog = CATALOG, catalogError = null } = {}) {
  const responses = {
    psd_assessment_questions: { data: catalogError ? null : catalog, error: catalogError },
    partner_organizations: { data: { allowed_services: ["esa", "psd"], allowed_states: [], status: "sandbox" }, error: null },
    doctor_profiles: { data: [{ user_id: "provider-1" }], error: null },
  };
  return {
    from(table) {
      const resp = responses[table] ?? { data: null, error: null };
      const chain = {
        select: () => chain, eq: () => chain, contains: () => chain, limit: () => chain,
        maybeSingle: () => Promise.resolve(resp),
        then: (res, rej) => Promise.resolve(resp).then(res, rej),
      };
      return chain;
    },
  };
}

const IDENTITY = { partnerId: "p-1", partnerSlug: "fixture-partner", maxPayloadBytes: 262144 };

const CANONICAL_PSD_ANSWERS = {
  conditions: ["ptsd"], currentTreatment: "weekly therapy", dailyImpact: "significant",
  dogDuration: "2_years", dogHelpDescription: "interrupts panic episodes",
  dogTasks: ["deep_pressure_therapy"], emotionalFrequency: "daily", housingType: "apartment",
  lifeChangeStress: "moderate", medication: "none", priorDiagnosis: "yes", safetyCheck: "no",
  taskDescription: "applies deep pressure", taskPublicAccess: "yes",
  taskReliability: "consistent", taskTraining: "professional",
};

function psdBody(answers, version = "partner.assessment.psd.v1") {
  return {
    partner_order_id: "GUARD-1",
    payment: { status: "paid", reference: "GUARD-PAY-1" },
    service: "psd",
    customer: {
      legal_first_name: "Guard", legal_last_name: "Fixture", email: "guard@fixture.test",
      date_of_birth: "1990-01-01", current_physical_state: "TX",
    },
    animals: [{ name: "GuardDog", type: "Dog" }],
    assessment: { schema_version: version, answers },
    consents: {
      telehealth: { accepted: true, at: "2026-01-01T00:00:00Z" },
      privacy_data_transfer: { accepted: true, at: "2026-01-01T00:00:00Z" },
      electronic_signature: { name: "Guard Fixture", at: "2026-01-01T00:00:00Z" },
    },
  };
}

const failures = [];
let checkCount = 0;
function check(id, desc, ok) {
  checkCount++;
  if (ok) console.log(`  PASS  ${id} ${desc}`);
  else { console.error(`  FAIL  ${id} ${desc}`); failures.push(`${id} ${desc}`); }
}

async function runChecks() {
  const mod = await loadValidator();
  const { validateOrderRequest, hasDuplicateJsonKeys } = mod;

  let r = await validateOrderRequest(psdBody(CANONICAL_PSD_ANSWERS), IDENTITY, stubAdmin());
  check("V1", "canonical PSD payload validates", r.ok === true && r.order?.service === "psd");

  r = await validateOrderRequest(
    psdBody({ primaryConcern: "anxiety" }, "partner.assessment.v1"), IDENTITY, stubAdmin());
  check("V2", "generic contract refused for PSD (assessment_schema_unsupported)",
    r.ok === false && r.code === "assessment_schema_unsupported");

  {
    const missing = { ...CANONICAL_PSD_ANSWERS };
    delete missing.safetyCheck;
    r = await validateOrderRequest(psdBody(missing), IDENTITY, stubAdmin());
    check("V3", "missing required question refused and NAMED",
      r.ok === false && r.code === "assessment_incomplete" &&
      JSON.stringify(r.details ?? {}).includes("safetyCheck"));
  }

  r = await validateOrderRequest(
    psdBody({ ...CANONICAL_PSD_ANSWERS, favoriteColor: "blue" }), IDENTITY, stubAdmin());
  check("V4", "unknown question id refused", r.ok === false && r.code === "schema_violation");

  r = await validateOrderRequest(
    psdBody({ ...CANONICAL_PSD_ANSWERS, eligible: "true" }), IDENTITY, stubAdmin());
  check("V5", "eligibility-claim field refused with the clinicians message",
    r.ok === false && r.code === "schema_violation" &&
    /determined by PawTenant clinicians/.test(JSON.stringify(r.details ?? {})));

  check("V6", "duplicate-key scanner: nested dup found, clean payloads pass, escapes safe",
    hasDuplicateJsonKeys('{"a":1,"b":{"x":1,"x":2}}') === true &&
    hasDuplicateJsonKeys('{"a":1,"b":{"x":1,"y":2}}') === false &&
    hasDuplicateJsonKeys('{"a":[{"k":1},{"k":2}]}') === false &&
    hasDuplicateJsonKeys('{"a":"br{ace\\"","a":2}') === true);

  r = await validateOrderRequest(
    psdBody({ ...CANONICAL_PSD_ANSWERS, dogTasks: "not-an-array" }), IDENTITY, stubAdmin());
  check("V7", "malformed answer shape refused", r.ok === false && r.code === "assessment_incomplete");

  r = await validateOrderRequest(
    psdBody(CANONICAL_PSD_ANSWERS), IDENTITY, stubAdmin({ catalogError: { message: "down" } }));
  check("V8", "unreadable question catalog fails CLOSED (internal_error)",
    r.ok === false && r.code === "internal_error");

  {
    const esa = psdBody({ primaryConcern: "anxiety" }, "partner.assessment.v1");
    esa.service = "esa";
    r = await validateOrderRequest(esa, IDENTITY, stubAdmin());
    check("V9", "ESA generic contract unchanged", r.ok === true && r.order?.service === "esa");
  }

  // ═══ Source assertions ═══
  const vSrc = stripComments(read(VALIDATE));
  const iSrc = stripComments(read(INDEX));
  const aSrc = stripComments(read(ACCEPT));
  check("S1", "no generic field is ever mapped into clinical answers",
    ["primaryConcern", "symptomDescription", "durationOfSymptoms"]
      .every((f) => !vSrc.includes(f) && !iSrc.includes(f) && !aSrc.includes(f)));
  check("S2", "duplicate-key scan runs before the payload is hashed",
    iSrc.indexOf("hasDuplicateJsonKeys(raw)") !== -1 &&
    iSrc.indexOf("hasDuplicateJsonKeys(raw)") < iSrc.indexOf("canonicalPayloadHash(body)"));
  check("S3", "PSD submissions carry the psd_v1 normalization target; ESA carries none",
    /order\.service === "psd" \? PSD_TARGET_ASSESSMENT_VERSION : null/.test(iSrc) &&
    /p_target_assessment_version: ctx\.targetAssessmentVersion/.test(aSrc));

  const migA = stripComments(read(MIG_A), true);
  check("S4", "replay returns before any write; snapshots unique per order and UPDATE-refusing",
    migA.indexOf("if found then") < migA.indexOf("insert into public.orders") &&
    /order_id\s+uuid not null unique references public\.orders/.test(migA) &&
    /if tg_op = 'UPDATE' then\s*\n\s*raise exception 'partner_assessment_snapshots/.test(migA));

  const migB = stripComments(read(MIG_B), true);
  check("S5a", "exactly one charge per order (partial unique on event_kind='charge')",
    /create unique index if not exists partner_billable_one_charge_per_order\s*\n\s*on public\.partner_billable_events \(order_id\)\s*\n\s*where event_kind = 'charge'/.test(migB));
  check("S5b", "the charge amount comes from the acceptance-frozen snapshot — never orders.price, never a literal",
    /v_fin\.wholesale_fee_cents, v_fin\.currency, v_fin\.rate_card_id, v_fin\.rate_card_version/.test(migB) &&
    !/new\.price|orders\.price/.test(migB) &&
    !/\b4500\b|\b5500\b/.test(migB));
  check("S5c", "completion trigger keys on the doctor_status transition, not partner identity heuristics",
    /if new\.doctor_status is distinct from 'patient_notified' then return new; end if;/.test(migB) &&
    /if old\.doctor_status is not distinct from new\.doctor_status then return new; end if;/.test(migB));
  check("S5d", "issued invoices freeze (financial fields immutable outside draft)",
    /if old\.status <> 'draft' then\s*\n\s*if new\.total_cents\s+is distinct from old\.total_cents/.test(migB));
  check("S5e", "an event bills at most once across non-void invoices",
    /where l\.billable_event_id = new\.billable_event_id and i\.status <> 'void'/.test(migB));
  check("S5f", "credits negate and link, originals untouched",
    /'credit', 'void_credit', v_ev\.id,\s*\n\s*now\(\), -v_ev\.amount_cents/.test(migB));
  check("S5g", "cross-partner billing refused inside the draft RPC",
    /if v_ev\.partner_id <> p_partner_id then\s*\n\s*raise exception/.test(migB));
  check("S5h", "every ledger write path is admin-gated and RLS is FORCED",
    (migB.match(/if not coalesce\(public\.is_chat_admin\(\), false\) then/g) ?? []).length >= 5 &&
    (migB.match(/force row level security/g) ?? []).length >= 4);
  check("S6", "the finance ledger never touches provider compensation",
    !/doctor_earnings|per_order_rate|doctor_amount/.test(migB));

  // ═══ Exposure surfaces ═══
  const financeImporters = [];
  const walk = (dir) => {
    for (const e of require("node:fs").readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(tsx?|mjs)$/.test(e.name)) continue;
      const s = readFileSync(join(ROOT, rel), "utf8");
      if (s.includes("PartnerFinanceTab") && rel !== FINANCE_PANEL) financeImporters.push(rel);
    }
  };
  walk("src");
  check("X1", "the finance surface mounts ONLY in the Partner Platform workspace",
    financeImporters.length === 1 && financeImporters[0].replaceAll("\\", "/") === FINANCE_HOST);

  const providerPortalDir = join(ROOT, "src/pages/provider-portal");
  let providerLeak = false;
  const walkLeak = (dir) => {
    for (const e of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walkLeak(p); continue; }
      if (!/\.(tsx?|ts)$/.test(e.name)) continue;
      const s = readFileSync(p, "utf8");
      if (/partner_billable_events|partner_invoice|wholesale_fee_cents|partner_rate_cards/.test(s)) providerLeak = true;
    }
  };
  walkLeak(providerPortalDir);
  check("X2", "provider portal references no partner economics", providerLeak === false);

  return failures.length === 0;
}

// ── Self-test ────────────────────────────────────────────────────────────────
const PLANTS = [
  {
    name: "generic partner answers translated into PSD answers",
    file: VALIDATE,
    find: "  if (service === \"psd\") {",
    replace: "  if (service === \"psd\") {\n    if (assessmentAnswers.primaryConcern) assessmentAnswers.conditions = [String(assessmentAnswers.primaryConcern)];",
    expectFail: "S1",
  },
  {
    name: "missing PSD answer accepted",
    file: VALIDATE,
    find: "    for (const qid of requiredIds) {\n      if (!(qid in assessmentAnswers)) psdProblems.push(`missing required question: ${qid}`);\n    }",
    replace: "    for (const qid of requiredIds) {\n      if (false) psdProblems.push(`missing required question: ${qid}`);\n    }",
    expectFail: "V3",
  },
  {
    name: "client eligibility flag trusted",
    file: VALIDATE,
    find: "      if (ELIGIBILITY_CLAIM_KEYS.has(key)) {",
    replace: "      if (false && ELIGIBILITY_CLAIM_KEYS.has(key)) {",
    expectFail: "V5",
  },
  {
    name: "normalized snapshot silently replaceable",
    file: MIG_A,
    find: "  if tg_op = 'UPDATE' then\n    raise exception 'partner_assessment_snapshots: snapshots are immutable (order %)', old.order_id",
    replace: "  if false and tg_op = 'UPDATE' then\n    raise exception 'partner_assessment_snapshots: snapshots are immutable (order %)', old.order_id",
    expectFail: "S4",
  },
  {
    name: "duplicate billable events possible",
    file: MIG_B,
    find: "  on public.partner_billable_events (order_id)\n  where event_kind = 'charge';",
    replace: "  on public.partner_billable_events (order_id, id)\n  where event_kind = 'charge';",
    expectFail: "S5a",
  },
  {
    name: "hardcoded wholesale amount",
    file: MIG_B,
    find: "    now(), v_fin.wholesale_fee_cents, v_fin.currency, v_fin.rate_card_id, v_fin.rate_card_version,",
    replace: "    now(), 4500, v_fin.currency, v_fin.rate_card_id, v_fin.rate_card_version,",
    expectFail: "S5b",
  },
  {
    name: "orders.price used for the partner receivable",
    file: MIG_B,
    find: "    now(), v_fin.wholesale_fee_cents, v_fin.currency, v_fin.rate_card_id, v_fin.rate_card_version,",
    replace: "    now(), (new.price * 100)::int, v_fin.currency, v_fin.rate_card_id, v_fin.rate_card_version,",
    expectFail: "S5b",
  },
  {
    name: "wholesale value written as provider compensation",
    file: MIG_B,
    find: "  new.partner_clinical_completed_at := coalesce(new.partner_clinical_completed_at, now());",
    replace: "  update public.doctor_earnings set doctor_amount = 99 where order_id = new.id;\n  new.partner_clinical_completed_at := coalesce(new.partner_clinical_completed_at, now());",
    expectFail: "S6",
  },
  {
    name: "issued invoice silently editable",
    file: MIG_B,
    find: "  if old.status <> 'draft' then\n    if new.total_cents    is distinct from old.total_cents",
    replace: "  if false then\n    if new.total_cents    is distinct from old.total_cents",
    expectFail: "S5d",
  },
  {
    name: "cross-partner invoice access",
    file: MIG_B,
    find: "    if v_ev.partner_id <> p_partner_id then\n      raise exception 'billable event % belongs to a different partner', v_id using errcode = '42501';\n    end if;",
    replace: "    if false then\n      raise exception 'unreachable';\n    end if;",
    expectFail: "S5g",
  },
  {
    name: "provider portal references partner economics",
    file: "src/pages/provider-portal/page.tsx",
    find: "import",
    replace: "const financeLeak = \"partner_billable_events\";\nimport",
    expectFail: "X2",
    firstOccurrence: true,
  },
  {
    name: "partner customer communication allowed (Slice 6 regression)",
    file: COMMS_GATE,
    find: "    if (decision.suppressCustomerCommunication) {",
    replace: "    if (false && decision.suppressCustomerCommunication) {",
    subprocess: "scripts/check-partner-comms-isolation.mjs",
  },
  {
    name: "direct PawTenant workflow suppressed (Slice 6 regression)",
    file: COMMS_GATE,
    find: "  if (origin === \"direct\") {",
    replace: "  if (false && origin === \"direct\") {",
    subprocessAny: ["scripts/check-partner-comms-isolation.mjs"],
    subprocess: "scripts/check-partner-comms-isolation.mjs",
    plantTarget: "supabase/functions/_shared/partnerPolicy.ts",
  },
  {
    name: "Slice 5 QR isolation bypassed",
    file: DOC_GATE,
    find: "  if (error || !data) {\n    return {\n      allowed: false,\n      reason: PARTNER_POLICY_UNRESOLVED,",
    replace: "  if (error || !data) {\n    return {\n      allowed: true,\n      reason: PARTNER_POLICY_UNRESOLVED,",
    subprocess: "scripts/check-partner-document-isolation.mjs",
  },
  {
    name: "Slice 6 earnings isolation bypassed",
    file: ASSIGN,
    find: "doctor_amount: doctorRate, status: \"pending\", earning_type: \"base\"",
    replace: "doctor_amount: (order.price as number), status: \"pending\", earning_type: \"base\"",
    subprocess: "scripts/check-partner-comms-isolation.mjs",
  },
];

async function selfTest() {
  console.log("── SELF-TEST: planting real defects ──────────────────────────");
  let planted = 0;
  let detected = 0;
  for (const plant of PLANTS) {
    const targetRel = plant.plantTarget ?? plant.file;
    const abs = join(ROOT, targetRel);
    const original = readFileSync(abs, "utf8");
    const normalized = original.replace(/\r\n/g, "\n");
    if (!normalized.includes(plant.find)) {
      console.error(`  NO-OP  cannot plant "${plant.name}" — anchor not found in ${targetRel}`);
      failures.push(`self-test NO-OP: ${plant.name}`);
      continue;
    }
    planted++;
    const mutated = plant.firstOccurrence
      ? normalized.replace(plant.find, plant.replace)
      : normalized.replace(plant.find, plant.replace);
    writeFileSync(abs, mutated);
    try {
      let caught = false;
      if (plant.subprocess) {
        const res = spawnSync(process.execPath, [join(ROOT, plant.subprocess)], {
          cwd: ROOT, encoding: "utf8", timeout: 300_000,
        });
        caught = res.status !== 0;
      } else {
        failures.length = 0;
        await runChecks();
        caught = failures.some((f) => f.startsWith(plant.expectFail));
      }
      if (caught) { detected++; console.log(`  DETECTED  ${plant.name}`); }
      else console.error(`  MISSED    ${plant.name}`);
    } finally {
      writeFileSync(abs, original);
    }
  }
  failures.length = 0;
  console.log(`── SELF-TEST: ${detected}/${planted} planted defects detected ──`);
  if (planted !== PLANTS.length || detected !== planted) {
    process.exitCode = 1;
    return false;
  }
  const clean = await runChecks();
  if (!clean) process.exitCode = 1;
  return clean;
}

// node:fs require shim for the walker inside runChecks (ESM context).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

if (process.argv.includes("--self-test")) {
  await selfTest();
  console.log(process.exitCode ? "SELF-TEST FAILED" : "SELF-TEST PASSED");
} else {
  const ok = await runChecks();
  console.log(`\n${checkCount - failures.length}/${checkCount} checks passed.`);
  if (!ok) {
    console.error("check-partner-psd-contract-and-finance: FAILED");
    process.exitCode = 1;
  }
}
