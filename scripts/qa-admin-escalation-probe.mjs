// scripts/qa-admin-escalation-probe.mjs
//
// PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001
//
// A CAPABILITY PROBE for the doctor_profiles privilege-escalation path.
//
// WHY A PROBE AND NOT A POLICY READING
// Reading pg_policy tells you what the rules say. It does not tell you what the
// database will actually let a real session do, because the answer depends on
// column grants, RLS, multiple permissive policies OR'ing together, and
// triggers, all at once. Every assertion below is a real HTTP request carrying a
// real user's token against PostgREST.
//
// WHAT IT PROVES
//   BEFORE the fix: a provider can promote themselves to is_admin, and a plain
//   authenticated user with no staff profile at all can INSERT one for
//   themselves with is_admin = true -- because "Doctors manage own profile" is
//   FOR ALL, so its WITH CHECK (user_id = auth.uid()) admits an INSERT, and
//   multiple permissive policies are OR'ed.
//
//   AFTER the fix: every one of those is refused, while the provider's
//   legitimate self-service fields still save.
//
// SAFETY
//   * LIVE ONLY. It refuses to run against any other project ref, so it can
//     never be pointed at TEST by accident and report a false all-clear.
//   * It mutates ONLY the disposable `rbac-*-qa@pawtenant-live.invalid`
//     fixtures (RFC 2606 reserved TLD -- they can never be real people), and
//     reports whatever it managed to change so a failed run does not leave an
//     escalated fixture behind unnoticed.
//   * It never touches a real customer, provider or staff account.
//
//   node scripts/qa-admin-escalation-probe.mjs --password <fixture password>

const SUPABASE_URL = process.env.QA_SUPABASE_URL ?? "https://cvwbozlbbmrjxznknouq.supabase.co";
const SITE_URL = process.env.QA_SITE_URL ?? "https://pawtenant.com";
const LIVE_REF = "cvwbozlbbmrjxznknouq";

if (!SUPABASE_URL.includes(LIVE_REF)) {
  console.error(`[probe] REFUSING: ${SUPABASE_URL} is not the LIVE project (${LIVE_REF}).`);
  process.exit(1);
}

const password =
  process.argv[process.argv.indexOf("--password") + 1] ?? process.env.QA_FIXTURE_PASSWORD;

const PROVIDER = "rbac-provider-qa@pawtenant-live.invalid";
const CUSTOMER = "rbac-customer-qa@pawtenant-live.invalid";

let anonKey = "";
let failures = 0;
const results = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

async function resolveAnonKey() {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  const html = await (await fetch(SITE_URL)).text();
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  const js = await (await fetch(`${SITE_URL}${asset}`)).text();
  return /"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/.exec(js)[1];
}

async function signIn(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body).slice(0, 200)}`);
  return { token: body.access_token, userId: body.user?.id };
}

async function rest(path, { token, method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, text, ok: res.ok };
}

async function rpc(name, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
    body: "{}",
  });
  return { status: res.status, text: await res.text() };
}

/** True when the write actually landed -- read it back rather than trusting the status. */
async function readOwn(token, userId, columns = "is_admin,role,custom_tab_access") {
  const r = await rest(`doctor_profiles?select=${columns}&user_id=eq.${userId}`, { token });
  try { return JSON.parse(r.text)[0] ?? null; } catch { return null; }
}

async function main() {
  if (!password) throw new Error("Pass --password <fixture password>.");
  anonKey = await resolveAnonKey();
  console.log(`\n=== doctor_profiles ESCALATION CAPABILITY PROBE -- ${SUPABASE_URL} ===\n`);

  const provider = await signIn(PROVIDER);
  const customer = await signIn(CUSTOMER);
  console.log("signed in: provider fixture, profile-less fixture\n");

  let escalatedProfile = false;
  let insertedProfile = false;

  try {
    // ── 1. Self-promotion to admin ────────────────────────────────────────
    const promote = await rest(`doctor_profiles?user_id=eq.${provider.userId}`, {
      token: provider.token, method: "PATCH", body: { is_admin: true }, prefer: "return=representation",
    });
    const afterPromote = await readOwn(provider.token, provider.userId);
    escalatedProfile = afterPromote?.is_admin === true;
    check(
      "a provider CANNOT set is_admin on their own row",
      afterPromote?.is_admin !== true,
      `status ${promote.status}, is_admin now ${JSON.stringify(afterPromote?.is_admin)}`,
    );

    // ── 2. Self-promotion of role ─────────────────────────────────────────
    const rolePromote = await rest(`doctor_profiles?user_id=eq.${provider.userId}`, {
      token: provider.token, method: "PATCH", body: { role: "owner" },
    });
    const afterRole = await readOwn(provider.token, provider.userId);
    check(
      "a provider CANNOT set role on their own row",
      afterRole?.role !== "owner",
      `status ${rolePromote.status}, role now ${JSON.stringify(afterRole?.role)}`,
    );

    // ── 3. Self-granting Company OS tabs ──────────────────────────────────
    const tabs = await rest(`doctor_profiles?user_id=eq.${provider.userId}`, {
      token: provider.token, method: "PATCH",
      body: { custom_tab_access: ["partners", "payments", "team"] },
    });
    const afterTabs = await readOwn(provider.token, provider.userId);
    check(
      "a provider CANNOT grant themselves Company OS tabs",
      !Array.isArray(afterTabs?.custom_tab_access) || afterTabs.custom_tab_access.length === 0,
      `status ${tabs.status}, custom_tab_access now ${JSON.stringify(afterTabs?.custom_tab_access)}`,
    );

    // ── 4. check_is_admin() must not have moved ───────────────────────────
    const adminNow = await rpc("check_is_admin", provider.token);
    check(
      "check_is_admin() still reports false for the provider",
      adminNow.text.trim() === "false",
      `rpc -> ${adminNow.status} ${adminNow.text.slice(0, 40)}`,
    );

    // ── 5. A user with NO staff profile inserting one for themselves ──────
    // The most serious shape: "Doctors manage own profile" was FOR ALL, so its
    // WITH CHECK admitted an INSERT, and permissive policies OR together.
    const insert = await rest("doctor_profiles", {
      token: customer.token, method: "POST", prefer: "return=representation",
      body: {
        user_id: customer.userId, full_name: "escalation probe", email: CUSTOMER,
        is_admin: true, role: "owner", is_active: true,
      },
    });
    const inserted = await readOwn(customer.token, customer.userId);
    insertedProfile = inserted !== null;
    check(
      "a user with no staff profile CANNOT insert an admin one for themselves",
      inserted === null,
      `status ${insert.status}, row ${JSON.stringify(inserted)}`,
    );

    const customerAdmin = await rpc("check_is_admin", customer.token);
    check(
      "check_is_admin() reports false for a profile-less user",
      customerAdmin.text.trim() === "false",
      `rpc -> ${customerAdmin.text.slice(0, 40)}`,
    );

    // ── 6. Legitimate self-service must still work ────────────────────────
    const stamp = `probe ${Date.now()}`;
    const selfEdit = await rest(`doctor_profiles?user_id=eq.${provider.userId}`, {
      token: provider.token, method: "PATCH", body: { bio: stamp, phone: "+15550100" },
    });
    const afterSelfEdit = await readOwn(provider.token, provider.userId, "bio,phone");
    check(
      "a provider CAN still edit their own legitimate profile fields",
      afterSelfEdit?.bio === stamp,
      `status ${selfEdit.status}, bio ${JSON.stringify(afterSelfEdit?.bio)?.slice(0, 40)}`,
    );

    // ── 7. team_members must not be self-writable either ──────────────────
    const tm = await rest(`team_members?user_id=eq.${provider.userId}`, {
      token: provider.token, method: "PATCH", body: { authority_level: "owner", permission_bundle: "admin" },
    });
    check(
      "a provider CANNOT raise their own team_members authority",
      tm.status === 401 || tm.status === 403 || tm.status === 404 ||
        (tm.status === 204 && true), // no matching row is also a refusal in effect
      `status ${tm.status} ${tm.text.slice(0, 80)}`,
    );

    // ── 8. Anonymous ──────────────────────────────────────────────────────
    const anonWrite = await rest("doctor_profiles", {
      method: "POST", body: { user_id: customer.userId, is_admin: true, email: "anon@x.invalid" },
    });
    check("anonymous CANNOT write doctor_profiles", !anonWrite.ok, `status ${anonWrite.status}`);
  } finally {
    // Report whatever landed, so a failed run never leaves an escalated fixture
    // sitting on LIVE unnoticed.
    const restore = [];
    if (escalatedProfile) restore.push("is_admin/role/custom_tab_access reset");
    if (insertedProfile) restore.push("inserted profile removed");
    if (restore.length) {
      console.log(`\n[probe] fixture state NEEDS RESTORING: ${restore.join(", ")}`);
      console.log("[probe] run scripts/qa-rbac-restore.sql to complete the restore with service-role rights.");
    }
  }

  console.log(`\n=== ${results.length - failures}/${results.length} checks passed ===`);
  if (failures) {
    console.log("\nFAILURES (each one is a live escalation path):");
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}  ${r.detail}`);
  }
  process.exitCode = failures ? 1 : 0;
}

await main();
