#!/usr/bin/env node
/**
 * check-psd-partner-unmapped-version.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 6 closure.
 *
 * THE INVARIANT
 * A PSD order whose stored answer-version is not in psd_assessment_questions
 * (today: every genuine partner PSD order, stored under the server constant
 * 'partner.assessment.v1') is ALWAYS blocked from assignment, and blocked
 * HONESTLY: judged against the canonical current retail version, with the full
 * required-question list reported as missing, with NOTHING counted as answered
 * — no implicit id-collision equivalence, no partner-identity input, no
 * manufactured eligibility. Known-version (direct) behaviour is byte-identical
 * to before the closure. `--self-test` plants real weakenings and proves each
 * is detected.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const GATE = "supabase/functions/_shared/psdCompletionGate.ts";
const ASSIGN = "supabase/functions/assign-doctor/index.ts";
const MIGRATION = "supabase/migrations/20260820170000_psd_partner_unmapped_version_honest_block.sql";

/** Single read point; CRLF normalised here and nowhere else. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Strip comments only — STRING-AWARE (a `//` or `--` inside a string literal
 * is code, not a comment; see the Slice 6 comms guard for the failure mode
 * this prevents). `sql` mode switches the line-comment token to `--`.
 */
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
      else if (quote !== "`" && quote !== "$" && ch === "\n" && !sql) quote = null;
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

async function loadGate() {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, GATE)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
    plugins: [{
      name: "external-remote",
      setup(b) {
        b.onResolve({ filter: /^https?:/ }, (args) => ({ path: args.path, external: true }));
      },
    }],
  });
  let code = result.outputFiles[0].text;
  // The bundle keeps the remote supabase-js import as external; neutralise it
  // so the module evaluates under plain node (the client is stubbed anyway).
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+"https:[^"]+";?/g, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

/** Stub client whose rpc() answers from a canned map. */
function stubClient(rpcResponses) {
  return {
    rpc(name) {
      const r = rpcResponses[name];
      if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message } });
      return Promise.resolve({ data: r ?? null, error: null });
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

const KNOWN_INCOMPLETE = {
  is_psd: true, required_total: 16, answered: 3, missing_count: 13,
  missing: ["conditions", "dogTasks"], complete: false,
  unmapped_version: false, judged_version: "psd_v1",
};
const UNMAPPED = {
  is_psd: true, required_total: 16, answered: 0, missing_count: 16,
  missing: ["conditions", "safetyCheck"], complete: false,
  unmapped_version: true, judged_version: "psd_v1",
};
const COMPLETE = {
  is_psd: true, required_total: 16, answered: 16, missing_count: 0,
  missing: [], complete: true, unmapped_version: false, judged_version: "psd_v1",
};
// A broken/forged status row claiming completeness for an unmapped version —
// the TS belt must refuse it regardless.
const UNMAPPED_CLAIMS_COMPLETE = { ...UNMAPPED, complete: true, missing: [], missing_count: 0, answered: 16 };
const NON_PSD = { is_psd: false, required_total: 0, answered: 0, missing_count: 0, missing: [], complete: false };
const REPAIR_NOOP = { repaired: false, reason: "already_paid" };

async function runChecks() {
  const gate = await loadGate();
  const { checkPsdAssessmentComplete } = gate;

  let r = await checkPsdAssessmentComplete(
    stubClient({ psd_assessment_status: KNOWN_INCOMPLETE, psd_repair_answers_from_projection: REPAIR_NOOP }), "o1");
  check("E1", "known-version incomplete → blocked with real counts, not flagged unmapped",
    r.allowed === false && r.requiredTotal === 16 && r.unmappedVersion === false &&
    r.adminMessage != null && !/not mapped/i.test(r.adminMessage));

  r = await checkPsdAssessmentComplete(
    stubClient({ psd_assessment_status: UNMAPPED, psd_repair_answers_from_projection: REPAIR_NOOP }), "o2");
  check("E2", "unmapped version → blocked, flag surfaced, admin message names the mapping gap",
    r.allowed === false && r.unmappedVersion === true && r.judgedVersion === "psd_v1" &&
    r.missingCount === 16 && /not mapped/i.test(r.adminMessage ?? "") && /Slice 7/i.test(r.adminMessage ?? ""));

  r = await checkPsdAssessmentComplete(
    stubClient({ psd_assessment_status: COMPLETE, psd_repair_answers_from_projection: REPAIR_NOOP }), "o3");
  check("E3", "known-version complete → allowed (direct behaviour intact)", r.allowed === true);

  r = await checkPsdAssessmentComplete(
    stubClient({ psd_assessment_status: new Error("boom"), psd_repair_answers_from_projection: REPAIR_NOOP }), "o4");
  check("E4", "status unavailable → blocked (fail closed)", r.allowed === false);

  r = await checkPsdAssessmentComplete(
    stubClient({ psd_assessment_status: NON_PSD, psd_repair_answers_from_projection: REPAIR_NOOP }), "o5");
  check("E5", "non-PSD order → allowed (ESA has its own flow)", r.allowed === true && r.isPsd === false);

  r = await checkPsdAssessmentComplete(
    stubClient({ psd_assessment_status: UNMAPPED_CLAIMS_COMPLETE, psd_repair_answers_from_projection: REPAIR_NOOP }), "o6");
  check("E6", "unmapped version claiming complete → STILL blocked (belt over the RPC)",
    r.allowed === false && r.unmappedVersion === true);

  // ── Migration source (the repo record of the deployed function) ──────────
  const sql = stripComments(read(MIGRATION), true);
  check("S1", "unmapped version counts NOTHING as answered (catalog_known gates the ans CTE)",
    /ans as \(select a\.question_id from public\.assessment_answers a, known\s*\n\s*where a\.order_id = p_order_id\s*\n\s*and known\.catalog_known/.test(sql));
  check("S2", "unknown stored version is judged against canonical 'psd_v1', never itself",
    /case when known\.catalog_known then ver\.v else 'psd_v1' end/.test(sql));
  check("S3", "complete demands required_total > 0 (an empty catalog can never pass)",
    /'complete', \(\(select count\(\*\) from missing\) = 0 and \(select count\(\*\) from req\) > 0\)/.test(sql));
  check("S4", "partner identity is never a clinical input",
    !/order_origin|partner_id|partner_organizations|partner_managed|rapid/i.test(sql));
  check("S5", "status JSON carries unmapped_version and judged_version",
    sql.includes("'unmapped_version'") && sql.includes("'judged_version'"));

  // ── Gate + assign-doctor passthrough ─────────────────────────────────────
  const gateSrc = stripComments(read(GATE));
  check("S6", "gate belt: allowed = complete && !unmappedVersion",
    /allowed: complete && !unmappedVersion/.test(gateSrc));
  const assignSrc = stripComments(read(ASSIGN));
  check("S7", "assign-doctor 409 names the unmapped cause",
    /unmappedVersion: gate\.unmappedVersion === true/.test(assignSrc));

  return failures.length === 0;
}

// ── Self-test: plant real weakenings, prove detection, restore ──────────────
const PLANTS = [
  {
    name: "id-collision answers satisfy retail questions without a mapping",
    file: MIGRATION,
    find: "where a.order_id = p_order_id\n             and known.catalog_known\n",
    replace: "where a.order_id = p_order_id\n",
    expectFail: "S1",
  },
  {
    name: "unmapped version judged against itself again (vacuous 0/0 diagnostics return)",
    file: MIGRATION,
    find: "case when known.catalog_known then ver.v else 'psd_v1' end",
    replace: "case when known.catalog_known then ver.v else ver.v end",
    expectFail: "S2",
  },
  {
    name: "empty requirement set counts as complete",
    file: MIGRATION,
    find: "'complete', ((select count(*) from missing) = 0 and (select count(*) from req) > 0),",
    replace: "'complete', ((select count(*) from missing) = 0),",
    expectFail: "S3",
  },
  {
    name: "partner identity becomes a clinical input",
    file: MIGRATION,
    find: "with o as (select id, letter_type from public.orders where id = p_order_id),",
    replace: "with o as (select id, letter_type, order_origin from public.orders where id = p_order_id),",
    expectFail: "S4",
  },
  {
    name: "gate treats unmapped as eligible",
    file: GATE,
    find: "allowed: complete && !unmappedVersion,",
    replace: "allowed: complete || unmappedVersion,",
    expectFail: "E2",
  },
  {
    name: "gate swallows the unmapped flag (vacuous refusal returns)",
    file: GATE,
    find: "const unmappedVersion = s.unmapped_version === true;",
    replace: "const unmappedVersion = false && s.unmapped_version === true;",
    expectFail: "E2",
  },
  {
    name: "assign-doctor hides the unmapped cause from the admin",
    file: ASSIGN,
    find: "unmappedVersion: gate.unmappedVersion === true,",
    replace: "unmappedVersion: false,",
    expectFail: "S7",
  },
];

async function selfTest() {
  console.log("── SELF-TEST: planting real defects ──────────────────────────");
  let planted = 0;
  let detected = 0;
  for (const plant of PLANTS) {
    const abs = join(ROOT, plant.file);
    const original = readFileSync(abs, "utf8");
    const normalized = original.replace(/\r\n/g, "\n");
    if (!normalized.includes(plant.find)) {
      console.error(`  NO-OP  cannot plant "${plant.name}" — anchor not found in ${plant.file}`);
      failures.push(`self-test NO-OP: ${plant.name}`);
      continue;
    }
    planted++;
    writeFileSync(abs, normalized.replace(plant.find, plant.replace));
    try {
      failures.length = 0;
      await runChecks();
      const caught = failures.some((f) => f.startsWith(plant.expectFail));
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

if (process.argv.includes("--self-test")) {
  await selfTest();
  console.log(process.exitCode ? "SELF-TEST FAILED" : "SELF-TEST PASSED");
} else {
  const ok = await runChecks();
  console.log(`\n${checkCount - failures.length}/${checkCount} checks passed.`);
  if (!ok) {
    console.error("check-psd-partner-unmapped-version: FAILED");
    process.exitCode = 1;
  }
}
