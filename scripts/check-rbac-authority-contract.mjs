// scripts/check-rbac-authority-contract.mjs
//
// PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001 -- recurrence guard.
//
// Asserts the invariants that stand between PawTenant and "any logged-in
// customer is one HTTP request from being an admin". That was not a theoretical
// risk: a capability probe did it, on TEST, with a plain customer account, and
// the identical grants and policies were confirmed on LIVE before this rollout.
//
//   node scripts/check-rbac-authority-contract.mjs             source checks
//   node scripts/check-rbac-authority-contract.mjs --self-test source + planted negatives
//   node scripts/check-rbac-authority-contract.mjs --db        + live database checks
//   node scripts/check-rbac-authority-contract.mjs --db --self-test   everything
//
// TWO HALVES, DELIBERATELY
//   SOURCE checks run with no network and go in the build chain, so a code
//   change that re-opens a hole fails the build on the developer's machine.
//   DATABASE checks need credentials and are run explicitly; they are the only
//   way to catch a grant or a policy being changed outside the repository, which
//   is exactly how this vulnerability arrived in the first place.
//
// WHY THIS COPY DIFFERS FROM THE TEST COPY
//   The SEO Editor does not exist in this repository at all -- no route, no
//   page, no Edge Functions, no tables. The checks that guard ITS authorization
//   therefore have nothing to read here. Rather than delete them (so they are
//   lost when the editor is promoted) or crash on a missing file, they are
//   gated on the editor's surface actually being present, and the skip is
//   PRINTED BY NAME on every run. The gate is one-way: the moment
//   _shared/seoEditor.ts and the admin-seo-editor page land in this repository,
//   every one of those checks starts enforcing, with no edit to this file.
//
// CONVENTIONS (learned on this repo, the hard way)
//   * one read point, CRLF normalised, so a Windows checkout cannot silently
//     stop matching;
//   * "must NOT contain" scans run on source with comments AND string literals
//     stripped -- this file and the files it guards discuss `is_admin`
//     constantly in prose;
//   * SQL strips `--` comments ONLY: a PL/pgSQL body lives inside a $$ literal.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const WITH_DB = process.argv.includes("--db");

// The SEO Editor's own files. Both must be present before its checks mean
// anything: the shared Edge module is what authorizes, the page is what a
// navigation entry would point at.
const SEO_EDITOR_SHARED = "supabase/functions/_shared/seoEditor.ts";
const SEO_EDITOR_PAGE = "src/pages/admin-seo-editor/page.tsx";
const SEO_EDITOR_PRESENT =
  existsSync(resolve(ROOT, SEO_EDITOR_SHARED)) && existsSync(resolve(ROOT, SEO_EDITOR_PAGE));

const skipped = [];
const skip = (what) => skipped.push(what);

async function rd(rel) {
  return (await readFile(resolve(ROOT, rel), "utf8")).replace(/\r\n/g, "\n");
}

function codeOnly(source) {
  let out = ""; let i = 0; const n = source.length;
  while (i < n) {
    const c = source[i]; const next = source[i + 1];
    if (c === "/" && next === "/") { while (i < n && source[i] !== "\n") i++; continue; }
    if (c === "/" && next === "*") { i += 2; while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n) { if (source[i] === "\\") { i += 2; continue; } if (source[i] === q) { i++; break; } i++; }
      out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}
const sqlCodeOnly = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const findings = [];
const fail = (m) => findings.push(m);

// ---------------------------------------------------------------------------
// Live database helper
// ---------------------------------------------------------------------------
function sql(query) {
  const file = join(tmpdir(), `rbac-guard-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, query, "utf8");
  try {
    const out = execFileSync("supabase", ["db", "query", "--linked", "-f", file, "-o", "json"], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true,
    });
    const m = /\{[\s\S]*\}/.exec(out);
    return m ? JSON.parse(m[0]).rows ?? [] : [];
  } finally {
    try { unlinkSync(file); } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// SOURCE checks
// ---------------------------------------------------------------------------
async function runSourceChecks() {
  const hardening = sqlCodeOnly(await rd("supabase/migrations/20260918100000_staff_authority_hardening.sql"));
  const part3 = sqlCodeOnly(await rd("supabase/migrations/20260919090000_staff_authority_reverse_sync_and_reader.sql"));
  const staffAccess = await rd("src/lib/staffAccess.ts");
  const staffAccessCode = codeOnly(staffAccess);
  const teamTab = codeOnly(await rd("src/pages/admin-orders/components/TeamTab.tsx"));

  // S1 — the authority table must live in `private` and be revoked.
  if (!/create table if not exists private\.staff_authority/i.test(hardening)) {
    fail("The authority table is no longer created in the `private` schema. `public` is exposed through the Data API.");
  }
  for (const stmt of [
    /revoke all on private\.staff_authority from public, anon, authenticated/i,
    /revoke all on schema private from public, anon, authenticated/i,
    /alter table private\.staff_authority enable row level security/i,
  ]) {
    if (!stmt.test(hardening)) fail(`The hardening migration no longer contains: ${stmt}`);
  }

  // S2 — the four authorization columns must be unreachable for `authenticated`.
  //
  // Asserted as "table UPDATE revoked, then granted back per column, and the
  // four are absent from that list" rather than as a column-level REVOKE:
  // a column REVOKE cannot narrow a table-level grant, so the obvious-looking
  // statement silently did nothing when this was first written.
  if (!/revoke update on public\.doctor_profiles from authenticated/i.test(hardening)) {
    fail("doctor_profiles's table-level UPDATE is no longer revoked from `authenticated`; a column revoke alone cannot narrow it.");
  }
  const grantBack = /grant update \(([\s\S]*?)\)\s*\n?\s*on public\.doctor_profiles to authenticated/i.exec(hardening)?.[1] ?? "";
  if (!grantBack) {
    fail("doctor_profiles has no per-column UPDATE grant back to `authenticated`; provider self-service would be dead.");
  }
  for (const col of ["is_admin", "role", "custom_tab_access", "user_id"]) {
    if (new RegExp(`(^|[\\s,])${col}\\s*(,|$)`, "m").test(grantBack)) {
      fail(`Authorization column '${col}' is granted back to authenticated. It must be settable only by admin_set_staff_access().`);
    }
  }

  // S3 — the FOR ALL self policy must be gone.
  if (!/drop policy if exists "Doctors manage own profile" on public\.doctor_profiles/i.test(hardening)) {
    fail('The FOR ALL policy "Doctors manage own profile" is no longer dropped. FOR ALL covers INSERT, which is how a customer could create themselves an admin profile.');
  }
  if (/create policy[^;]*on public\.doctor_profiles[^;]*for all/i.test(hardening)) {
    fail("A FOR ALL policy is being created on doctor_profiles again.");
  }

  // S4 — check_is_admin must read the hardened source, never the mirror or JWT metadata.
  const checkFn = /create or replace function public\.check_is_admin\(\)[\s\S]*?\$fn\$([\s\S]*?)\$fn\$/i.exec(hardening)?.[1] ?? "";
  if (!checkFn) fail("check_is_admin() is no longer defined in the hardening migration.");
  if (/doctor_profiles/i.test(checkFn)) {
    fail("check_is_admin() reads doctor_profiles again. Those columns are a display mirror, not authority.");
  }
  if (/raw_user_meta_data|user_metadata|jwt\s*\(\s*\)\s*->|auth\.jwt/i.test(checkFn)) {
    fail("check_is_admin() reads JWT / user metadata, which the user can edit.");
  }
  if (!/effective_staff_role/i.test(checkFn)) {
    fail("check_is_admin() no longer resolves through private.effective_staff_role().");
  }

  // S5 — every SECURITY DEFINER function here must pin search_path and be revoked from PUBLIC.
  const defs = [...hardening.matchAll(/create (?:or replace )?function (public|private)\.(\w+)\(([^)]*)\)([\s\S]*?)\$fn\$/gi)];
  if (defs.length < 5) fail(`Only ${defs.length} function definitions found in the hardening migration; expected the full set.`);
  for (const [, schema, name, , body] of defs) {
    if (!/security definer/i.test(body)) continue;
    if (!/set search_path to '/i.test(body)) {
      fail(`${schema}.${name}() is SECURITY DEFINER without a pinned search_path.`);
    }
    const revoked = new RegExp(`revoke all on function ${schema}\\.${name}\\([^)]*\\)\\s*from public`, "i");
    if (!revoked.test(hardening)) {
      fail(`${schema}.${name}() is SECURITY DEFINER but EXECUTE is not revoked from PUBLIC.`);
    }
  }

  // S5b — part 3's objects. The reverse-sync trigger is what keeps the four
  // service-role writers (create-team-member, create-provider,
  // create-owner-admin, approve-provider-application) able to confer authority
  // at all; without it a newly invited admin has a profile and no authority.
  // Matched with its ON clause and its full column list, not by name alone:
  // a bare /create trigger doctor_profiles_sync_authority/ also matches
  // `doctor_profiles_sync_authority_disabled`, so renaming the trigger out of
  // existence passed the first version of this check. The column list is in the
  // pattern too, so dropping `is_admin` or `custom_tab_access` from the UPDATE OF
  // list — which would silently stop syncing exactly the privilege columns —
  // fails here as well.
  if (!/create trigger doctor_profiles_sync_authority\s+after insert or update of role, is_admin, custom_tab_access, is_active\s+on public\.doctor_profiles/i.test(part3)) {
    fail("The reverse-sync trigger is gone. A service-role write to doctor_profiles would no longer reach private.staff_authority, so newly created staff would not be admins.");
  }
  if (!/revoke all on function public\.staff_access_for\(uuid\) from public, anon, authenticated/i.test(part3)) {
    fail("staff_access_for(uuid) is no longer revoked from `authenticated`; it answers about ANY user, so that would let a signed-in account enumerate staff.");
  }
  if (/grant execute on function public\.staff_access_for\(uuid\) to [^;]*authenticated/i.test(part3)) {
    fail("staff_access_for(uuid) is granted to `authenticated`. It is service-role only; current_staff_access() is the caller-only one.");
  }
  // The privileged-writer predicate must recognise a direct database
  // connection. auth.role() is NULL there, not 'service_role', and a guard that
  // does not know this refuses every future migration against this table.
  if (!/'service_role',\s*'direct'/.test(part3)) {
    fail("The privilege guard no longer treats a direct database connection as privileged; auth.role() is NULL on one, so migrations against doctor_profiles will be refused.");
  }

  // S6 — the SEO editor must derive access from the hardened source, and an
  //      admin must never be forced to hold a manual seo_editor_accounts row.
  if (SEO_EDITOR_PRESENT) {
    const seoShared = await rd(SEO_EDITOR_SHARED);
    // The RPC name only ever appears as a string literal, so this one scans the
    // RAW source: codeOnly() replaces every literal with "" by design.
    if (!/staff_access_for/.test(seoShared)) {
      fail("_shared/seoEditor.ts no longer calls staff_access_for(). It would be back to trusting a hand-inserted row.");
    }
    const ownerFn = /export async function authenticateOwner[\s\S]*?\n}/.exec(seoShared)?.[0] ?? "";
    // Comments stripped, string literals KEPT: a table name in Supabase client
    // code only ever appears as a literal, so codeOnly() would erase the very
    // thing this looks for. (It did — the control sat silent until this changed.)
    const ownerFnCode = ownerFn
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    if (/seo_editor_accounts/.test(ownerFnCode)) {
      fail("authenticateOwner() requires a seo_editor_accounts row again. A genuine admin must reach owner functions without one.");
    }
    if (!/is_admin_level/.test(codeOnly(ownerFn))) {
      fail("authenticateOwner() no longer requires admin-level authority (owner / admin_manager).");
    }
  } else {
    skip("S6 SEO Editor authorization (admin needs no seo_editor_accounts row; owner functions need is_admin_level)");
  }

  // S7 — the browser must not write the privilege columns.
  const browserWrites = /\.from\(""\)\s*\n?\s*\.(update|insert|upsert)\(\{[^}]*(is_admin|custom_tab_access)/;
  if (browserWrites.test(teamTab)) {
    fail("TeamTab writes a privilege column directly again. admin_set_staff_access() is the only path.");
  }
  if (!/setStaffAccess/.test(teamTab)) {
    fail("TeamTab no longer routes access changes through setStaffAccess().");
  }

  // S8 — navigation and backend must read the same vocabulary.
  if (SEO_EDITOR_PRESENT) {
    const page = await rd("src/pages/admin-orders/page.tsx");
    const sidebar = await rd("src/pages/admin-orders/components/AdminSidebar.tsx");
    // Quoted, exact key. A bare /seo_editor/ also matches "seo_editor_disabled_key",
    // so renaming the key away would have passed.
    if (!/"seo_editor"/.test(page)) fail("page.tsx no longer knows the seo_editor tab key.");
    if (!/"seo_editor"/.test(sidebar)) fail("AdminSidebar no longer lists the SEO Editor.");
    // TAB_CONFIG is not what renders. DESKTOP_ORDER is, and an entry present in
    // the first but missing from the second is invisible while every permission
    // check still says it should be there -- which is exactly what browser QA
    // found after this guard had already passed.
    const desktopOrder = /DESKTOP_ORDER[^=]*=\s*\[([\s\S]*?)\]/.exec(sidebar)?.[1] ?? "";
    if (!/"seo_editor"/.test(desktopOrder)) {
      fail("AdminSidebar's DESKTOP_ORDER omits seo_editor, so the nav entry never renders even when the permission grants it.");
    }
  } else {
    skip("S8 SEO Editor navigation vocabulary (page.tsx TabKey, AdminSidebar TAB_CONFIG *and* DESKTOP_ORDER)");
  }

  // S8b — the browser's own access resolution. This half is NOT gated: it is
  // how every Company OS tab is decided, SEO Editor or not.
  if (!/SEO_EDITOR_TAB/.test(staffAccessCode)) {
    fail("src/lib/staffAccess.ts no longer defines the SEO Editor tab key.");
  }
  // Raw source again -- an RPC name is a string literal.
  if (!/current_staff_access/.test(staffAccess)) {
    fail("The browser resolves access without current_staff_access(); navigation could diverge from the backend.");
  }
  // Comments only. The table name only ever appears INSIDE a string literal, so
  // stripping literals (as codeOnly does) would hide exactly what this looks for.
  const staffAccessNoComments = staffAccess
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (/doctor_profiles/.test(staffAccessNoComments)) {
    fail("src/lib/staffAccess.ts reads doctor_profiles. Navigation must resolve from the hardened source.");
  }

  // S9 — provider self-service must not be revoked.
  for (const col of ["bio", "phone", "licensed_states", "state_license_numbers", "professional_email", "professional_phone", "photo_url"]) {
    if (!new RegExp(`(^|[\\s,])${col}\\s*(,|\\))`, "m").test(grantBack)) {
      fail(`Provider self-service column '${col}' is missing from the UPDATE grant. Providers must keep editing their own profile.`);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// DATABASE checks
// ---------------------------------------------------------------------------
async function runDbChecks() {
  const rows = sql(`
    select
      (select count(*) from information_schema.column_privileges
        where table_schema='public' and table_name='doctor_profiles' and grantee='authenticated'
          and privilege_type='UPDATE' and column_name in ('is_admin','role','custom_tab_access','user_id'))::text as privileged_cols,
      (select count(*) from information_schema.column_privileges
        where table_schema='public' and table_name='doctor_profiles' and grantee='authenticated'
          and privilege_type='UPDATE' and column_name in ('bio','phone','licensed_states','professional_email'))::text as selfservice_cols,
      (select count(*) from pg_policy where polrelid='public.doctor_profiles'::regclass and polcmd='*'
         and pg_get_expr(polqual,polrelid) like '%auth.uid()%')::text as for_all_self_policies,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='check_is_admin'
          and pg_get_functiondef(p.oid) ilike '%doctor_profiles%')::text as check_reads_mirror,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='check_is_admin'
          and pg_get_functiondef(p.oid) ilike '%raw_user_meta_data%')::text as check_reads_metadata,
      has_schema_privilege('authenticated','private','USAGE')::text as auth_private_usage,
      has_table_privilege('authenticated','private.staff_authority','SELECT')::text as auth_authority_select,
      has_function_privilege('authenticated','public.staff_access_for(uuid)','EXECUTE')::text as auth_staff_access_for,
      has_function_privilege('anon','public.admin_set_staff_access(uuid,text,jsonb,boolean)','EXECUTE')::text as anon_setter,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.proname in
          ('check_is_admin','is_admin_level','current_staff_access','staff_access_for','admin_set_staff_access','effective_staff_role')
          and p.prosecdef and (p.proconfig is null or not exists (
             select 1 from unnest(p.proconfig) c where c like 'search_path=%')))::text as unpinned_secdef,
      (select count(*) from pg_trigger where tgrelid='public.doctor_profiles'::regclass
         and tgname='doctor_profiles_privilege_guard' and not tgisinternal)::text as guard_trigger,
      (select count(*) from pg_trigger where tgrelid='public.doctor_profiles'::regclass
         and tgname='doctor_profiles_sync_authority' and not tgisinternal)::text as sync_trigger,
      (select count(*) from private.staff_authority where access_role in ('owner','admin_manager') and is_active and revoked_at is null)::text as admin_level_count,
      (select count(*) from public.doctor_profiles d join private.staff_authority s on s.user_id = d.user_id
        where coalesce(d.is_admin,false) is distinct from
              (s.access_role <> 'provider' and s.is_active and s.revoked_at is null))::text as mirror_drift
  `)[0] ?? {};

  const n = (k) => Number(rows[k] ?? -1);
  const b = (k) => String(rows[k]) === "true";

  if (n("privileged_cols") !== 0) fail(`DB: authenticated still holds UPDATE on ${rows.privileged_cols} privilege column(s) of doctor_profiles.`);
  if (n("selfservice_cols") < 4) fail(`DB: provider self-service columns were revoked (${rows.selfservice_cols}/4 remain).`);
  if (n("for_all_self_policies") !== 0) fail("DB: a FOR ALL self policy exists on doctor_profiles again.");
  if (n("check_reads_mirror") !== 0) fail("DB: check_is_admin() reads doctor_profiles again.");
  if (n("check_reads_metadata") !== 0) fail("DB: check_is_admin() reads raw_user_meta_data.");
  if (b("auth_private_usage")) fail("DB: `authenticated` has USAGE on the private schema.");
  if (b("auth_authority_select")) fail("DB: `authenticated` can SELECT private.staff_authority.");
  if (b("auth_staff_access_for")) fail("DB: `authenticated` can EXECUTE staff_access_for(); it is service-role only.");
  if (b("anon_setter")) fail("DB: `anon` can EXECUTE admin_set_staff_access().");
  if (n("unpinned_secdef") !== 0) fail(`DB: ${rows.unpinned_secdef} SECURITY DEFINER authority function(s) have no pinned search_path.`);
  if (n("guard_trigger") !== 1) fail("DB: the doctor_profiles privilege guard trigger is missing.");
  if (n("sync_trigger") !== 1) fail("DB: the doctor_profiles authority sync trigger is missing; privileged writes would stop reaching private.staff_authority.");
  if (n("admin_level_count") < 1) fail("DB: no active owner/admin_manager remains — that is a lockout.");
  if (n("mirror_drift") !== 0) fail(`DB: ${rows.mirror_drift} profile(s) disagree with the authority table. The display mirror has drifted.`);

  return findings;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runAll() {
  findings.length = 0;
  skipped.length = 0;
  await runSourceChecks();
  if (WITH_DB) await runDbChecks();
  return [...findings];
}

async function runCheck() {
  const result = await runAll();
  if (result.length) {
    console.error("[check-rbac-authority-contract] FAILED:");
    for (const f of result) console.error(`  - ${f}`);
    return false;
  }
  for (const s of skipped) {
    console.log(`[check-rbac-authority-contract] SKIPPED (SEO Editor not in this repository): ${s}`);
  }
  console.log(`[check-rbac-authority-contract] OK — source invariants hold${WITH_DB ? " and the live database matches" : ""}.`);
  return true;
}

// ---------------------------------------------------------------------------
// Planted negatives
// ---------------------------------------------------------------------------
const SOURCE_CONTROLS = [
  {
    name: "doctor_profiles.is_admin is granted back to authenticated",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace("  id, full_name, title,", "  is_admin, id, full_name, title,"),
    expect: /Authorization column 'is_admin' is granted back/,
  },
  {
    name: "doctor_profiles.role is granted back to authenticated",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace("  id, full_name, title,", "  role, id, full_name, title,"),
    expect: /Authorization column 'role' is granted back/,
  },
  {
    name: "the table-level UPDATE revoke is dropped (a column revoke cannot narrow it)",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace("revoke update on public.doctor_profiles from authenticated;", ""),
    expect: /table-level UPDATE is no longer revoked/,
  },
  {
    name: "the FOR ALL self policy is restored",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace(/drop policy if exists "Doctors manage own profile" on public\.doctor_profiles;/, ""),
    expect: /FOR ALL policy .* is no longer dropped/,
  },
  {
    name: "check_is_admin() trusts the doctor_profiles mirror again",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace(
      "  select coalesce(private.effective_staff_role(auth.uid()) is distinct from 'provider'\n                  and private.effective_staff_role(auth.uid()) is not null, false);",
      "  select exists (select 1 from public.doctor_profiles where user_id = auth.uid() and is_admin = true);"),
    expect: /check_is_admin\(\) reads doctor_profiles again/,
  },
  {
    name: "check_is_admin() trusts user-editable JWT metadata",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace(
      "  select coalesce(private.effective_staff_role(auth.uid()) is distinct from 'provider'\n                  and private.effective_staff_role(auth.uid()) is not null, false);",
      "  select coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false);"),
    expect: /reads JWT \/ user metadata/,
  },
  {
    name: "the authority table moves into the exposed public schema",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace("create table if not exists private.staff_authority", "create table if not exists public.staff_authority"),
    expect: /no longer created in the `private` schema/,
  },
  {
    name: "a SECURITY DEFINER authority function loses its pinned search_path",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace(
      "create or replace function public.is_admin_level()\nreturns boolean\nlanguage sql\nstable\nsecurity definer\nset search_path to 'public'",
      "create or replace function public.is_admin_level()\nreturns boolean\nlanguage sql\nstable\nsecurity definer"),
    expect: /is_admin_level\(\) is SECURITY DEFINER without a pinned search_path/,
  },
  {
    name: "a SECURITY DEFINER authority function stays executable by PUBLIC",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace("revoke all on function private.effective_staff_role(uuid) from public, anon, authenticated;", ""),
    expect: /effective_staff_role\(\) is SECURITY DEFINER but EXECUTE is not revoked from PUBLIC/,
  },
  {
    name: "a provider self-service field is dropped from the grant by mistake",
    file: "supabase/migrations/20260918100000_staff_authority_hardening.sql",
    mutate: (s) => s.replace("licensed_states, bio, created_at", "licensed_states, created_at"),
    expect: /Provider self-service column 'bio' is missing from the UPDATE grant/,
  },
  {
    name: "the reverse-sync trigger is dropped, orphaning every newly created admin",
    file: "supabase/migrations/20260919090000_staff_authority_reverse_sync_and_reader.sql",
    mutate: (s) => s.replace("create trigger doctor_profiles_sync_authority", "create trigger doctor_profiles_sync_authority_disabled"),
    expect: /reverse-sync trigger is gone/,
  },
  {
    name: "staff_access_for() becomes callable by every signed-in account",
    file: "supabase/migrations/20260919090000_staff_authority_reverse_sync_and_reader.sql",
    mutate: (s) => s.replace(
      "grant execute on function public.staff_access_for(uuid) to service_role;",
      "grant execute on function public.staff_access_for(uuid) to service_role, authenticated;"),
    expect: /staff_access_for\(uuid\) is granted to `authenticated`/,
  },
  {
    name: "the privilege guard stops recognising a direct database connection",
    file: "supabase/migrations/20260919090000_staff_authority_reverse_sync_and_reader.sql",
    mutate: (s) => s.replace(/'service_role', 'direct'/g, "'service_role'"),
    expect: /no longer treats a direct database connection as privileged/,
  },
  {
    name: "the browser resolves navigation from doctor_profiles again",
    file: "src/lib/staffAccess.ts",
    mutate: (s) => s.replace(
      'const { data, error } = await supabase.rpc("current_staff_access");',
      'const { data, error } = await supabase.from("doctor_profiles").select("role,is_admin,custom_tab_access").single();'),
    expect: /reads doctor_profiles|without current_staff_access/,
  },
  {
    name: "TeamTab writes the privilege columns directly again",
    file: "src/pages/admin-orders/components/TeamTab.tsx",
    mutate: (s) => s.replace(/setStaffAccess/g, "legacySetAccess"),
    expect: /no longer routes access changes through setStaffAccess/,
  },
  // SEO Editor surface controls. They are listed unconditionally so they are
  // never lost, and are reported as SKIPPED — not PASS — while the editor is
  // absent from this repository. A skipped control is not evidence of anything.
  {
    name: "an admin is forced to hold a manual SEO account row again",
    file: SEO_EDITOR_SHARED,
    requiresSeoEditor: true,
    mutate: (s) => s.replace(
      "  const access = await staffAccessFor(admin, userId);\n  if (!access?.is_admin_level) {",
      '  const { data: acct } = await admin.from("seo_editor_accounts").select("user_id").eq("user_id", userId).maybeSingle();\n  const access = acct ? await staffAccessFor(admin, userId) : null;\n  if (!access?.is_admin_level) {'),
    expect: /requires a seo_editor_accounts row again/,
  },
  {
    name: "the SEO editor stops consulting the hardened source",
    file: SEO_EDITOR_SHARED,
    requiresSeoEditor: true,
    mutate: (s) => s.replace(/staff_access_for/g, "legacy_access_for"),
    expect: /no longer calls staff_access_for/,
  },
  {
    name: "the SEO Editor disappears from the Company OS navigation",
    file: "src/pages/admin-orders/components/AdminSidebar.tsx",
    requiresSeoEditor: true,
    mutate: (s) => s.replace(/seo_editor/g, "seo_editor_disabled_key"),
    expect: /AdminSidebar no longer lists the SEO Editor/,
  },
  {
    name: "the SEO Editor is configured but dropped from the render order",
    file: "src/pages/admin-orders/components/AdminSidebar.tsx",
    requiresSeoEditor: true,
    mutate: (s) => s.replace('    "seo_editor",\n', ""),
    expect: /DESKTOP_ORDER omits seo_editor/,
  },
];

async function selfTest() {
  const clean = await runAll();
  if (clean.length) {
    console.error("[check-rbac-authority-contract --self-test] ABORTED: the real tree already fails.");
    for (const f of clean) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }

  let broken = 0;
  let ran = 0;
  for (const c of SOURCE_CONTROLS) {
    if (c.requiresSeoEditor && !SEO_EDITOR_PRESENT) {
      console.log(`  SKIP  ${c.name} — the SEO Editor is not in this repository.`);
      continue;
    }
    const path = resolve(ROOT, c.file);
    const original = await readFile(path, "utf8");
    const normalised = original.replace(/\r\n/g, "\n");
    const mutated = c.mutate(normalised);
    if (mutated === normalised) {
      console.error(`  BROKEN  ${c.name} — the planted edit changed nothing (anchor moved).`);
      broken++; continue;
    }
    try {
      await writeFile(path, mutated, "utf8");
      const result = await runAll();
      const bit = result.some((f) => c.expect.test(f));
      ran++;
      if (bit) console.log(`  PASS  ${c.name}`);
      else { console.error(`  FAIL  ${c.name} — guard silent. Findings: ${result.join(" | ") || "none"}`); broken++; }
    } finally {
      // Byte-for-byte restore, including the original line endings.
      await writeFile(path, original, "utf8");
    }
  }

  if (WITH_DB) broken += await dbSelfTest();

  if (broken) {
    console.error(`[check-rbac-authority-contract --self-test] ${broken} planted control(s) did not bite.`);
    // process.exitCode, never process.exit(): an exit inside the plant/restore
    // loop would leave a planted weakening on disk.
    process.exitCode = 1;
  } else {
    console.log(`[check-rbac-authority-contract --self-test] OK — all ${ran} planted control(s) bit.`);
  }
}

/**
 * Database-side planted negatives.
 *
 * These mutate the live database, so each one captures the exact current
 * definition first (pg_get_functiondef / the grant state), plants, asserts, and
 * restores in a finally block. Nothing is left behind even if an assertion
 * throws.
 */
async function dbSelfTest() {
  let broken = 0;
  const controls = [
    {
      name: "DB: is_admin is re-granted to authenticated",
      plant: "grant update (is_admin) on public.doctor_profiles to authenticated;",
      restore: "revoke update (is_admin) on public.doctor_profiles from authenticated;",
      expect: /authenticated still holds UPDATE on .* privilege column/,
    },
    {
      name: "DB: the privilege guard trigger is dropped",
      plant: "drop trigger if exists doctor_profiles_privilege_guard on public.doctor_profiles;",
      restore: `create trigger doctor_profiles_privilege_guard before insert or update on public.doctor_profiles
                for each row execute function public.tg_doctor_profiles_privilege_guard();`,
      expect: /privilege guard trigger is missing/,
    },
    {
      name: "DB: the authority sync trigger is dropped",
      plant: "drop trigger if exists doctor_profiles_sync_authority on public.doctor_profiles;",
      restore: `create trigger doctor_profiles_sync_authority after insert or update of role, is_admin, custom_tab_access, is_active
                on public.doctor_profiles for each row execute function public.tg_doctor_profiles_sync_authority();`,
      expect: /authority sync trigger is missing/,
    },
    {
      name: "DB: authenticated is given USAGE on the private schema",
      plant: "grant usage on schema private to authenticated;",
      restore: "revoke usage on schema private from authenticated;",
      expect: /has USAGE on the private schema/,
    },
    {
      name: "DB: staff_access_for becomes callable by authenticated",
      plant: "grant execute on function public.staff_access_for(uuid) to authenticated;",
      restore: "revoke execute on function public.staff_access_for(uuid) from authenticated;",
      expect: /can EXECUTE staff_access_for/,
    },
  ];

  for (const c of controls) {
    try {
      sql(c.plant);
      const result = await runAll();
      const bit = result.some((f) => c.expect.test(f));
      if (bit) console.log(`  PASS  ${c.name}`);
      else { console.error(`  FAIL  ${c.name} — guard silent. Findings: ${result.join(" | ") || "none"}`); broken++; }
    } finally {
      sql(c.restore);
    }
  }

  // Prove the restore actually worked rather than assuming it.
  const after = await runAll();
  if (after.length) {
    console.error(`  BROKEN  database not restored after the planted controls: ${after.join(" | ")}`);
    broken++;
  } else {
    console.log("  PASS  the database is byte-for-byte back to its hardened state");
  }
  return broken;
}

if (SELF_TEST) {
  await selfTest();
} else if (!(await runCheck())) {
  process.exitCode = 1;
}
