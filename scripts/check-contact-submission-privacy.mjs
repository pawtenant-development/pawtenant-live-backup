// scripts/check-contact-submission-privacy.mjs
//
// CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001 — P0 privacy guard.
//
// ROOT CAUSE THIS GUARD PINS. public.contact_submissions and
// public.contact_submission_replies had RLS *enabled* but carried blanket
// "TO public USING (true)" policies AND direct anon table grants:
//
//     contact_submissions_read_all         SELECT  public  USING (true)
//     contact_submissions_update_all       UPDATE  public  USING (true)
//     contact_submission_replies_read_all  SELECT  public  USING (true)
//
// RLS being "enabled" is worthless when a policy says USING (true) TO public.
// Anyone holding the PUBLISHABLE anon key — which ships inside the browser
// bundle — could read every submitter's name, email, phone, message body and
// the request metadata (IP + user-agent + referrer), read every support reply,
// and UPDATE any submission's status, silently marking genuine customer
// requests "resolved" so they disappear from the admin inbox.
//
// Measured on LIVE immediately before the fix: 88 submissions, 71 replies,
// 71 distinct customer emails, 14 phone numbers, request metadata on 88/88.
//
//   R1  no blanket public SELECT policy is (re)introduced.
//   R2  no blanket public UPDATE policy is (re)introduced.
//   R3  anon privileges are revoked BY NAME on both tables (revoking "from
//       public" alone does not undo an explicit per-role grant).
//   R4  anon is never re-granted anything.
//   R5  the authenticated grant is narrowed to what the Admin UI performs —
//       no INSERT and no DELETE from a browser session.
//   R6  an authorized staff SELECT policy exists on BOTH tables.
//   R7  the staff UPDATE policy is gated on both USING and WITH CHECK.
//   R8  authorization uses the canonical staff helper, not a second role
//       system and not a raw doctor_profiles subquery.
//   R9  no customer-facing policy is added — these internal tables are never
//       projected to a customer just because their email matches.
//   R10 the server path is preserved: both Edge Functions build their client
//       with SUPABASE_SERVICE_ROLE_KEY, so the public form never needs an
//       anon table grant.
//   R11 contact-submit's success response exposes no metadata / IP / internal
//       field.
//   R12 the migration mutates NO historical data — no INSERT/UPDATE/DELETE
//       against either table, no backfill, no metadata deletion.
//   R13 no TEST project reference and no TEST-only suppression is ported.
//   R14 no unified-email / thread schema is smuggled into this hotfix.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-contact-submission-privacy.mjs             → guard (exit 1 on fail)
//   node scripts/check-contact-submission-privacy.mjs --warn-only → audit (exit 0)
//   node scripts/check-contact-submission-privacy.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  migration: "supabase/migrations/20260730250000_contact_submission_anon_exposure_hotfix.sql",
  submit: "supabase/functions/contact-submit/index.ts",
  reply: "supabase/functions/contact-reply/index.ts",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing required file: ${F[key]}`);
  // Normalize CRLF. This repo checks out with autocrlf=true, so a guard that
  // matched raw bytes would behave differently on Windows and on the Linux
  // build box — and the planted controls (which anchor on "\n") would
  // silently become no-ops.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Strip SQL `--` comments so PROSE can never satisfy a CODE assertion. */
const sql = (s) => s.replace(/^\s*--.*$/gm, "");
/** Strip JS/TS comments for the same reason. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const has = (s, ...n) => n.every((x) => s.includes(x));
const lacks = (s, ...n) => n.every((x) => !s.includes(x));

const CHECKS = [
  ["R1", "no blanket public SELECT policy is (re)introduced", (S) => {
    const m = sql(S.migration);
    // A create policy ... for select to public using (true) in any spacing.
    return !/create\s+policy[\s\S]{0,200}?for\s+select[\s\S]{0,80}?to\s+public[\s\S]{0,80}?using\s*\(\s*true\s*\)/i.test(m)
      && has(m, "drop policy if exists contact_submissions_read_all")
      && has(m, "drop policy if exists contact_submission_replies_read_all");
  }],

  ["R2", "no blanket public UPDATE policy is (re)introduced", (S) => {
    const m = sql(S.migration);
    return !/create\s+policy[\s\S]{0,200}?for\s+update[\s\S]{0,80}?to\s+public[\s\S]{0,80}?using\s*\(\s*true\s*\)/i.test(m)
      && has(m, "drop policy if exists contact_submissions_update_all");
  }],

  ["R3", "anon privileges are revoked BY NAME on both tables", (S) => {
    const m = sql(S.migration);
    return has(m,
      "revoke all on public.contact_submissions        from anon;",
      "revoke all on public.contact_submission_replies from anon;")
      // and PUBLIC too — the two are independent
      && has(m,
        "revoke all on public.contact_submissions        from public;",
        "revoke all on public.contact_submission_replies from public;");
  }],

  ["R4", "anon is never re-granted anything", (S) => {
    const m = sql(S.migration);
    return !/grant\s[\s\S]{0,120}?\bto\b[\s\S]{0,40}?\banon\b/i.test(m);
  }],

  ["R5", "authenticated cannot INSERT or DELETE from a browser session", (S) => {
    const m = sql(S.migration);
    return has(m,
      "revoke insert, delete, truncate, references, trigger\n  on public.contact_submissions        from authenticated;",
      "revoke insert, delete, truncate, references, trigger\n  on public.contact_submission_replies from authenticated;")
      // the only grants back are the reads + the status update
      && has(m,
        "grant select, update on public.contact_submissions        to authenticated;",
        "grant select          on public.contact_submission_replies to authenticated;")
      && !/grant[^;]*\binsert\b[^;]*to authenticated/i.test(m)
      && !/grant[^;]*\bdelete\b[^;]*to authenticated/i.test(m);
  }],

  ["R6", "an authorized staff SELECT policy exists on both tables", (S) => {
    const m = sql(S.migration);
    return has(m,
      "create policy contact_submissions_admin_select on public.contact_submissions",
      "create policy contact_submission_replies_admin_select on public.contact_submission_replies",
      "for select to authenticated");
  }],

  ["R7", "the staff UPDATE policy gates BOTH using and with check", (S) => {
    const m = sql(S.migration);
    const i = m.indexOf("create policy contact_submissions_admin_update");
    if (i < 0) return false;
    const pol = m.slice(i, i + 400);
    return has(pol, "for update to authenticated",
      "using (public.is_admin_staff())", "with check (public.is_admin_staff())");
  }],

  ["R8", "authorization uses the canonical staff helper, not a second role system", (S) => {
    const m = sql(S.migration);
    // every policy predicate on these tables must be the helper
    const preds = m.match(/(using|with check)\s*\(([^)]*\))/gi) ?? [];
    return preds.length > 0
      && preds.every((p) => /is_admin_staff\(\)/.test(p))
      // no inlined role table lookup, no ad-hoc role list
      && lacks(m, "doctor_profiles", "auth.jwt()", "current_setting(");
  }],

  ["R9", "no customer-facing policy is added to these internal tables", (S) => {
    const m = sql(S.migration);
    return lacks(m, "auth.email()", "auth.uid()", "customer_visible",
      "contact_submissions_customer", "contact_submission_replies_customer");
  }],

  ["R10", "both Edge Functions keep the service-role server path", (S) => {
    const a = code(S.submit), b = code(S.reply);
    return has(a, 'Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")', "createClient(supabaseUrl, serviceKey")
      && has(b, 'Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")', "createClient(supabaseUrl, serviceKey")
      // never fall back to the anon key for a table write
      && lacks(a, "SUPABASE_ANON_KEY") && lacks(b, "SUPABASE_ANON_KEY");
  }],

  ["R11", "contact-submit's response exposes no metadata / IP / internal field", (S) => {
    const c = code(S.submit);
    // Isolate the success response object.
    const i = c.lastIndexOf("return json(200, {");
    if (i < 0) return false;
    const resp = c.slice(i, c.indexOf("});", i));
    return lacks(resp, "metadata", "ip", "user_agent", "referer", "request",
      "source_page", "phone", "status", "assigned_admin_id");
  }],

  ["R12", "the migration mutates no historical data", (S) => {
    const m = sql(S.migration).toLowerCase();
    // No DML at all against either table. (revoke/grant/drop policy/create
    // policy/alter table are DDL and are what this migration is made of.)
    //
    // NOTE: the TRUNCATE/DELETE/INSERT *privilege names* legitimately appear
    // inside the `revoke insert, delete, truncate, ... from authenticated`
    // statement — removing those rights is the point of this migration. So
    // each test anchors on the STATEMENT form (verb + target), never on the
    // bare keyword.
    return !/\b(insert\s+into|delete\s+from)\s+(public\.)?contact_submission/.test(m)
      && !/\bupdate\s+(public\.)?contact_submission\w*\s+set\b/.test(m)
      && !/\btruncate\s+(table\s+)?(public\.)?contact_submission/.test(m)
      && !/\bdrop\s+table\b/.test(m)
      && !/\balter\s+table[^;]*drop\s+column\b/.test(m);
  }],

  ["R13", "no TEST project reference and no TEST suppression is ported", (S) =>
    Object.values(S).every((src) =>
      !src.includes("opudhofjbydrljgleofq") &&
      !src.includes("TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS"))],

  ["R14", "no unified-email / thread schema is smuggled into this hotfix", (S) => {
    const m = sql(S.migration);
    return lacks(m, "admin_email_threads", "admin_email_messages",
      "email_ingest_message", "thread_key", "customer_send_email_reply");
  }],
];

// ── Planted negative controls. Each MUST trip exactly its check. ──────────
const CONTROLS = [
  ["R1", "a blanket public SELECT policy is restored", (b) => ({
    migration: b.migration + "\ncreate policy contact_submissions_read_all on public.contact_submissions\n  for select to public using (true);\n",
  })],
  ["R2", "a blanket public UPDATE policy is restored", (b) => ({
    migration: b.migration + "\ncreate policy contact_submissions_update_all on public.contact_submissions\n  for update to public using (true) with check (true);\n",
  })],
  ["R3", "the anon revoke on submissions is dropped", (b) => ({
    migration: b.migration.replace(
      "revoke all on public.contact_submissions        from anon;", "-- (anon revoke removed)"),
  })],
  ["R4", "anon is granted SELECT again", (b) => ({
    migration: b.migration + "\ngrant select on public.contact_submissions to anon;\n",
  })],
  ["R5", "authenticated is granted INSERT again", (b) => ({
    migration: b.migration + "\ngrant insert on public.contact_submissions to authenticated;\n",
  })],
  ["R6", "the replies staff SELECT policy is removed", (b) => ({
    migration: b.migration.replace(
      "create policy contact_submission_replies_admin_select on public.contact_submission_replies",
      "create policy contact_submission_replies_admin_select_DISABLED on public.other_table"),
  })],
  ["R7", "the staff UPDATE policy loses its WITH CHECK", (b) => ({
    migration: b.migration.replace(
      "  using (public.is_admin_staff())\n  with check (public.is_admin_staff());",
      "  using (public.is_admin_staff());"),
  })],
  ["R8", "a second role system is inlined instead of the helper", (b) => ({
    migration: b.migration.replace(
      "using (public.is_admin_staff());\n\n-- Status operations",
      "using (exists (select 1 from public.doctor_profiles d where d.user_id = auth.uid()));\n\n-- Status operations"),
  })],
  ["R9", "a customer-facing policy is added", (b) => ({
    migration: b.migration + "\ncreate policy contact_submissions_customer on public.contact_submissions\n  for select to authenticated using (email = auth.email());\n",
  })],
  ["R10", "contact-submit falls back to the anon key", (b) => ({
    submit: b.submit.replace(
      'const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";',
      'const serviceKey  = Deno.env.get("SUPABASE_ANON_KEY") ?? "";'),
  })],
  ["R11", "the submit response leaks request metadata", (b) => ({
    submit: b.submit.replace(
      "    emailSent,\n    emailError: emailError ?? undefined,",
      "    metadata,\n    emailSent,\n    emailError: emailError ?? undefined,"),
  })],
  ["R12", "the migration deletes historical submissions", (b) => ({
    migration: b.migration + "\ndelete from public.contact_submissions where created_at < now() - interval '90 days';\n",
  })],
  ["R13", "a TEST project reference is introduced", (b) => ({
    migration: b.migration + "\n-- see opudhofjbydrljgleofq\nselect 'opudhofjbydrljgleofq';\n",
  })],
  ["R14", "unified-email schema is smuggled in", (b) => ({
    migration: b.migration + "\nalter table public.admin_email_threads add column if not exists thread_key text;\n",
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

const NAME = "check-contact-submission-privacy";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      // A control that fails to modify the source proves nothing.
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`,
      );
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
