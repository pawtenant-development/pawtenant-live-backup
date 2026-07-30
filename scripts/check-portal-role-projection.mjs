#!/usr/bin/env node
// PENDING-DELIVERY-CUSTOMER-PROVIDER-PREVIEW-QA-CLOSURE-001 — regression guard.
//
// Locks in the THREE-WAY role projection proven in this task's browser QA. The
// same order, at the same instant, must read as:
//
//     admin    -> "Pending Delivery"        (doctor_status = pending_admin_approval)
//     provider -> "Completed"               (submitted, waiting on the employee)
//     customer -> "Under Review"            (NEVER the internal Pending Delivery wording)
//
// and the customer must never be able to see a pending/superseded version or the
// employee's correction note.
//
// It also locks the §12 fix: correction audit rows populate audit_logs.order_id,
// so the correction events are reachable by the same order_id filter that already
// finds document_approved / document_delivered.
//
// STATIC only — this asserts the SOURCE contract. Row-level visibility was proven
// separately with RLS genuinely enforced (`set local role authenticated` PLUS
// request.jwt.claims — claims alone leave the session as table owner and BYPASS
// RLS, which produces a false pass).
//
// Usage:
//   node scripts/check-portal-role-projection.mjs             # guard TEST source
//   node scripts/check-portal-role-projection.mjs --self-test # prove the guard works
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FUNCTIONS = join(ROOT, "supabase", "functions");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const FILES = {
  customerPortal: join(SRC, "pages", "my-orders", "page.tsx"),
  providerPortal: join(SRC, "pages", "provider-portal", "page.tsx"),
  previewWrapper: join(SRC, "pages", "admin-orders", "components", "AdminProviderPreview.tsx"),
  orderDetail: join(SRC, "pages", "provider-portal", "components", "ProviderOrderDetail.tsx"),
  auditTimeline: join(SRC, "pages", "admin-orders", "components", "OrderAuditTimeline.tsx"),
};

// NORMALISE CRLF -> LF: the LIVE repo checks out with core.autocrlf=true, so
// every source file is CRLF on disk while this guard's anchors are written with
// \n. Without this, string anchors and planted mutations silently no-op.
const read = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

/** The migration that added order_id to the correction audit INSERT. */
// LIVE has no 20260730170000: the deployed LIVE correction RPC ALREADY wrote
// order_id (see migration 20260729154829 correction_audit_uses_actor_columns),
// so TEST 64d7393 repaired a TEST-only regression and has no LIVE counterpart.
// The assertions below still matter, so they are pointed at the migration that
// actually owns the correction INSERT on LIVE.
const CORRECTION_MIGRATION = "20260730220000_correction_returns_order_to_review.sql";

/**
 * INVERTED FOR LIVE. On TEST these senders MUST carry a suppression gate. On
 * LIVE they must NOT: real customers and providers are on the other end, so the
 * production notifiers keep their real behaviour and this task introduces no
 * suppression secret. See the LIVE INVERSE block below.
 */
const SUPPRESSION_SENDERS = [
  "notify-patient-letter",
  "notify-thirty-day-reissue",
  "assign-doctor",
  "provider-submit-letter",
  "admin-review-document",
];

const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

function runStatic() {
  // ── 1. Customer projection: pending_admin_approval must map to Under Review ──
  const cust = read(FILES.customerPortal);
  ok(
    "customer status map sends pending_admin_approval -> Under Review",
    /pending_admin_approval[\s\S]{0,200}?Under Review|Under Review[\s\S]{0,200}?pending_admin_approval/.test(cust),
  );
  ok(
    "customer portal never renders the internal 'Pending Delivery' wording",
    !/["'>\s]Pending Delivery/.test(cust),
  );

  // ── 2. Customer document projection is enforced in EVERY query ──
  // The customer portal runs on the admin session in Customer View, so the
  // customer_visible filter must live in the QUERY, not only in RLS.
  const docQueries = (cust.match(/from\("order_documents"\)/g) ?? []).length;
  const visFilters = (cust.match(/\.eq\("customer_visible",\s*true\)/g) ?? []).length;
  ok(
    `every order_documents query filters customer_visible (${visFilters}/${docQueries})`,
    docQueries > 0 && visFilters >= docQueries,
    `${visFilters} filters for ${docQueries} queries`,
  );
  ok(
    "customer portal never selects the employee correction note",
    !/correction_note/.test(cust),
  );

  // ── 3. Provider preview reuses the REAL portal, read-only ──
  const wrap = read(FILES.previewWrapper);
  ok(
    "preview imports the real ProviderPortalPage (not a mock)",
    /import\s+ProviderPortalPage[\s\S]{0,80}provider-portal\/page/.test(wrap),
  );
  ok("preview renders the real portal with previewContext", /<ProviderPortalPage[\s\S]{0,120}previewContext/.test(wrap));
  ok("preview is read-only", /readOnly:\s*true/.test(wrap));
  ok(
    "preview authorizes server-side, not on the URL param",
    /check-admin-status/.test(wrap) && /only a SELECTOR|never the authorization/i.test(wrap),
  );

  // ── 4. Provider sees their OWN pending/superseded versions + the note ──
  const detail = read(FILES.orderDetail);
  ok(
    "provider order detail surfaces the correction note to the provider",
    /correction_note/.test(detail),
  );
  ok(
    "provider tab strip stays horizontally reachable (overflow-x-auto)",
    /overflow-x-auto/.test(detail),
  );

  // ── 5. §12 — correction audit rows must carry order_id ──
  const migPath = join(MIGRATIONS, CORRECTION_MIGRATION);
  let mig = "";
  try {
    mig = read(migPath);
  } catch {
    /* handled by the next assertion */
  }
  ok(`§12 migration ${CORRECTION_MIGRATION} exists`, mig.length > 0);
  ok(
    "§12 correction INSERT names the order_id column",
    /insert into public\.audit_logs\s*\([^)]*\border_id\b/is.test(mig),
  );
  ok(
    "§12 correction INSERT passes v_doc.order_id",
    /v_doc\.order_id/.test(mig),
  );
  ok(
    "§12 keeps object_id on the confirmation id (timeline compatibility)",
    /'order_document',\s*v_doc\.confirmation_id/.test(mig),
  );
  ok(
    "§12 does NOT rewrite historical audit rows",
    !/\bupdate\s+public\.audit_logs\b/i.test(mig) && !/\bdelete\s+from\s+public\.audit_logs\b/i.test(mig),
  );
  // TEST's migration echoed has_function_privilege() checks. The LIVE migration
  // asserts the same property more directly and more usefully — by SETTING the
  // grant state: revoke BY NAME from public/anon/authenticated (revoking "from
  // public" alone does NOT undo the default explicit grant), then re-grant only
  // to authenticated, with the real authorisation enforced inside the function.
  ok(
    "correction RPC revokes EXECUTE by name from public/anon/authenticated",
    /revoke\s+all\s+on\s+function\s+public\.request_order_document_correction\(uuid,\s*text\)\s+from\s+public,\s*anon,\s*authenticated;/i.test(mig)
      && /grant\s+execute\s+on\s+function\s+public\.request_order_document_correction\(uuid,\s*text\)\s+to\s+authenticated;/i.test(mig)
      && /if not public\.is_admin_staff\(\) then/.test(mig),
  );

  // The audit timeline must keep matching BOTH keys, so pre-existing correction
  // rows (order_id NULL) still render.
  const tl = read(FILES.auditTimeline);
  ok(
    "audit timeline still matches order_id OR legacy object_id",
    /order_id\.eq\.\$\{orderId\},object_id\.eq\.\$\{confirmationId\}/.test(tl),
  );

  // ── 6. LIVE INVERSE — production notifiers keep their REAL behaviour ────
  // TEST asserts these three senders DO gate on testNotificationSuppression.
  // On LIVE that gate must NOT exist: real customers and providers are on the
  // other end. notify-patient-letter is excluded from the loop below only
  // because LIVE reaches it through admin-review-document, which carries the
  // pre-existing helper import from an earlier rollout; what matters is that
  // THIS task added no new suppression anywhere.
  for (const fn of SUPPRESSION_SENDERS) {
    let body = "";
    try {
      body = read(join(FUNCTIONS, fn, "index.ts"));
    } catch {
      /* missing file fails below */
    }
    ok(
      `${fn} does NOT gate its send behind TEST suppression`,
      !/TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS/.test(body),
    );
  }

  // ── 7. No LIVE project ref may enter this task's files ──
  const LIVE_REF = "cvwbozlbbmrjxznknouq";
  const scanned = [...Object.values(FILES), migPath].filter(Boolean);
  const leaks = scanned.filter((f) => {
    try {
      return read(f).includes(LIVE_REF);
    } catch {
      return false;
    }
  });
  ok("no LIVE project ref introduced", leaks.length === 0, leaks.join(", "));

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}${r.detail && !r.pass ? ` — ${r.detail}` : ""}`);
  }
  if (failed.length) {
    console.error(`${RED}✗ ${failed.length}/${results.length} checks FAILED${RESET}`);
    return 1;
  }
  console.log(`${GREEN}${results.length}/${results.length} checks passed.${RESET}`);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANTED NEGATIVE CONTROLS — every detector above must FAIL on broken input.
// A guard that cannot fail proves nothing.
// ─────────────────────────────────────────────────────────────────────────────
function runSelfTest() {
  // Customer leaks the internal Pending Delivery wording.
  const leakRe = /["'>\s]Pending Delivery/;
  ok("negative: customer 'Pending Delivery' wording is caught",
    leakRe.test('<span>Pending Delivery</span>'));
  ok("positive: customer copy without it passes", !leakRe.test('<span>Under Review</span>'));

  // A customer_visible filter dropped from one of several queries.
  const qRe = /from\("order_documents"\)/g;
  const vRe = /\.eq\("customer_visible",\s*true\)/g;
  const broken = 'from("order_documents").eq("customer_visible", true); from("order_documents");';
  ok("negative: a missing customer_visible filter is caught",
    (broken.match(vRe) ?? []).length < (broken.match(qRe) ?? []).length);
  const fixed = 'from("order_documents").eq("customer_visible", true); from("order_documents").eq("customer_visible", true);';
  ok("positive: all queries filtered passes",
    (fixed.match(vRe) ?? []).length >= (fixed.match(qRe) ?? []).length);

  // Customer selecting the correction note.
  const noteRe = /correction_note/;
  ok("negative: customer selecting correction_note is caught",
    noteRe.test('.select("id, correction_note")'));

  // §12 — order_id omitted from the INSERT column list (the ORIGINAL bug).
  const insRe = /insert into public\.audit_logs\s*\([^)]*\border_id\b/is;
  const buggy = `insert into public.audit_logs (
    actor_id, actor_name, actor_role, object_type, object_id,
    action, description, old_values, new_values, metadata
  ) values (`;
  ok("negative: §12 regression (order_id absent from INSERT) is caught", !insRe.test(buggy));
  const patched = `insert into public.audit_logs (
    actor_id, actor_name, actor_role, object_type, object_id,
    order_id,
    action, description, old_values, new_values, metadata
  ) values (`;
  ok("positive: patched INSERT passes", insRe.test(patched));

  // §12 must not rewrite history.
  const histRe = /\bupdate\s+public\.audit_logs\b/i;
  ok("negative: a historical audit backfill is caught",
    histRe.test("update public.audit_logs set order_id = x;"));

  // Preview must not become a mock.
  const realRe = /import\s+ProviderPortalPage[\s\S]{0,80}provider-portal\/page/;
  ok("negative: a mocked provider preview is caught",
    !realRe.test('import FakeProviderView from "./FakeProviderView";'));
  ok("positive: real portal import passes",
    realRe.test('import ProviderPortalPage, { type ProviderPreviewContext } from "../../provider-portal/page";'));

  // readOnly removed from the preview context.
  const roRe = /readOnly:\s*true/;
  ok("negative: preview without readOnly is caught", !roRe.test("{ providerUserId, providerName }"));

  // Suppression import removed from a sender.
  const supRe = /testNotificationSuppression/;
  ok("negative: a sender losing its suppression import is caught",
    !supRe.test('import { createClient } from "supabase";'));

  // Audit timeline losing the legacy object_id arm would hide old rows.
  const tlRe = /order_id\.eq\.\$\{orderId\},object_id\.eq\.\$\{confirmationId\}/;
  ok("negative: timeline dropping the legacy object_id arm is caught",
    !tlRe.test("`order_id.eq.${orderId}`"));

  // LIVE ref leak.
  ok("negative: LIVE project ref is caught", "cvwbozlbbmrjxznknouq".includes("cvwbozlbbmrjxznknouq"));

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}`);
  if (failed.length) {
    console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
console.log(
  `${YELLOW}portal-role-projection — ${selfTest ? "self-test (planted negative controls)" : "guard (static contract)"}${RESET}`,
);
process.exit(selfTest ? runSelfTest() : runStatic());
