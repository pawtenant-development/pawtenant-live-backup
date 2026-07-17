// Focused test for LETTER-VERIFICATION-REVOKE-AUDIT-FIX-001.
//
//   node scripts/test-revoke-audit-shape.mjs
//
// The bug was a SHAPE MISMATCH between what revoke-letter-verification writes and
// what audit_logs actually accepts. This asserts the shape statically against the
// real, verified schema — no DB connection, no network, no framework.
//
// The behavioural half (does an authorized revoke write exactly one correct row,
// is a non-admin denied, is a duplicate revoke idempotent, is an audit failure
// surfaced) is exercised against synthetic TEST fixtures via the deployed
// function in the task QA, and recorded in the task card. This file locks the
// contract so the shape can never silently regress again.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FN = join(ROOT, "supabase/functions/revoke-letter-verification/index.ts");
const src = readFileSync(FN, "utf8");

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const fail = (n, m) => { failed++; console.error(`  ✗ ${n}\n      ${m}`); };
const check = (n, cond, m) => (cond ? ok(n) : fail(n, m));

// Strip comments so the documentation of the OLD broken shape never trips the
// assertions that the old shape is gone.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

// ── audit_logs columns, verified against BOTH TEST and LIVE on 2026-07-17 ────
const AUDIT_COLUMNS = new Set([
  "id", "actor_id", "actor_name", "actor_role", "object_type", "object_id",
  "action", "description", "old_values", "new_values", "metadata", "created_at",
]);
// object_type + action + actor_name are NOT NULL (actor_name defaults to 'system').
const NOT_NULL = ["object_type", "action"];

// The exact columns the OLD deployed version wrote. None of these exist.
const DEAD_COLUMNS = ["entity_type", "entity_id", "performed_by", "details"];

console.log("\n── The regression that caused this task ──");
for (const dead of DEAD_COLUMNS) {
  check(
    `never writes non-existent audit column "${dead}"`,
    !new RegExp(`\\b${dead}\\s*:`).test(code),
    `found "${dead}:" — audit_logs has no such column; the insert will fail with 42703`,
  );
}

// ── Extract the audit insert object ─────────────────────────────────────────
const m = code.match(/from\("audit_logs"\)\s*\.insert\(\{([\s\S]*?)\n\s*\}\);/);
check("audit insert into audit_logs exists", !!m, "no audit_logs insert found");

if (m) {
  const objSrc = m[1];
  const keys = [...objSrc.matchAll(/^\s{6}([a-z_]+):/gm)].map((x) => x[1]);

  console.log("\n── Every written column must exist on audit_logs ──");
  for (const k of keys) {
    check(`"${k}" is a real audit_logs column`, AUDIT_COLUMNS.has(k), `"${k}" is not in the schema`);
  }

  console.log("\n── NOT NULL columns must be supplied ──");
  for (const nn of NOT_NULL) {
    check(`supplies NOT NULL column "${nn}"`, keys.includes(nn), `missing required "${nn}"`);
  }

  console.log("\n── The task's required audit facts ──");
  const req = {
    "actor (id)": /actor_id:\s*actorId/.test(objSrc),
    "actor (name)": /actor_name:\s*actorName/.test(objSrc),
    "actor (role)": /actor_role:\s*actorRole/.test(objSrc),
    "action": /action:\s*"letter_verification_revoked"/.test(objSrc),
    "verification ID": /letter_id:\s*letterId/.test(objSrc),
    "order ID": /order_id:\s*orderId/.test(objSrc),
    "reason": /\breason,/.test(objSrc),
    "previous status": /old_values:[\s\S]*status:\s*prev\.status/.test(objSrc),
    "new status": /new_values:[\s\S]*status:\s*"revoked"/.test(objSrc),
    "timestamp": /revoked_at:\s*revokedAt/.test(objSrc),
  };
  for (const [name, present] of Object.entries(req)) {
    check(`records ${name}`, present, `"${name}" is not recorded in the audit row`);
  }

  console.log("\n── Matches the sibling writers' canonical shape ──");
  check(
    'object_type is "letter_verification"',
    /object_type:\s*"letter_verification"/.test(objSrc),
    "must match verification_issued / letter_verification_restored",
  );
  check(
    "object_id is the confirmation id (with letterId fallback)",
    /object_id:\s*confirmationId\s*\?\?\s*letterId/.test(objSrc),
    "sibling writers use the confirmation id as object_id",
  );
}

console.log("\n── The audit failure must NOT be swallowed ──");
check(
  "audit insert result is captured",
  /const\s*\{\s*error:\s*auditErr\s*\}\s*=\s*await\s+supabase\.from\("audit_logs"\)/.test(code),
  "the { error } result is discarded — supabase-js does NOT throw, so try/catch cannot catch it",
);
check(
  "audit failure is branched on",
  /if\s*\(auditErr\)/.test(code),
  "auditErr is never inspected",
);
check(
  "audit failure reaches monitoring (console.error)",
  /console\.error\([\s\S]{0,120}AUDIT WRITE FAILED/.test(code),
  "no edge-log escalation on audit failure",
);
check(
  "audit failure reaches the caller (auditLogged:false + auditError)",
  /auditLogged:\s*false/.test(code) && /auditError:\s*auditErr\.message/.test(code),
  "the caller cannot tell the audit was lost",
);
check(
  "success path reports auditLogged:true",
  /auditLogged:\s*true/.test(code),
  "a successful audit is not confirmed to the caller",
);
check(
  "no empty catch swallows the audit",
  !/catch\s*\{\s*\}/.test(code),
  "an empty catch block remains",
);

console.log("\n── Authorization (verify_jwt only proves a VALID jwt, not an admin) ──");
check(
  "bearer token is required",
  /Missing bearer token/.test(code) && /401/.test(code),
  "no bearer requirement",
);
check(
  "caller is resolved from the JWT",
  /supabase\.auth\.getUser\(bearer\)/.test(code),
  "the caller is never resolved — actor cannot be recorded",
);
check(
  "gated on doctor_profiles.is_admin",
  /from\("doctor_profiles"\)/.test(code) && /is_admin/.test(code),
  "no admin gate — any signed-in customer could revoke",
);
check(
  "non-admin is denied 403",
  /"Admin only"/.test(code) && /403/.test(code),
  "unauthorized roles are not denied",
);
check(
  "service-role bearer still allowed (internal tooling)",
  /bearer === SERVICE_ROLE_KEY/.test(code),
  "service-role callers would be locked out",
);
check(
  "actor is never hardcoded null",
  !/performed_by:\s*null/.test(code) && !/actor_id:\s*null,/.test(code),
  "actor is hardcoded null — the audit would record nobody",
);

console.log("\n── Idempotency + scope guards ──");
check(
  "already-revoked short-circuits",
  /alreadyRevoked:\s*true/.test(code),
  "duplicate revoke is not idempotent",
);
check(
  "no audit row written for a no-op",
  code.indexOf('alreadyRevoked: true') < code.indexOf('from("audit_logs")'),
  "the no-op path must return BEFORE the audit insert, else it fabricates an event",
);
check(
  "sends no customer communication",
  !/(resend|sendEmail|twilio|ghl-send|notify-patient|sms)/i.test(code),
  "this endpoint must never message anyone",
);
check(
  "writes no customer PII into the audit row",
  !/(first_name|last_name|patient_name|\bemail_to\b|\bphone\b)/.test(code),
  "audit rows must carry staff identity + confirmation id only",
);
check(
  "does not touch refunds / price / ads / earnings",
  !/(refund_status|orders\.price|google_ads|doctor_earnings)/.test(code),
  "out-of-scope system touched",
);

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
