// scripts/qa-rbac-role-matrix.mjs
//
// PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001
//
// The role matrix, proven over HTTP against the deployed LIVE project with real
// identities. Nothing here is stubbed: every assertion is a request carrying a
// real user's token, so it exercises the gateway, the grants, RLS and the
// triggers together -- which is the only combination that tells you what a real
// session can actually do. Service-role SQL would bypass RLS entirely and report
// a comfortable, meaningless all-clear.
//
//   node scripts/qa-rbac-role-matrix.mjs --password <fixture password>
//
// Fixtures (all on the RFC 2606 reserved `.invalid` TLD -- never real people):
//   rbac-admin-qa     admin_manager
//   rbac-staff-qa     support -- the team member whose tab grant is granted and
//                     revoked during the run
//   rbac-provider-qa  provider
//   rbac-customer-qa  authenticated with no staff profile at all
//
// SCOPE NOTE
// The TEST copy of this matrix also drives the SEO Editor's own Edge Functions
// (seo-editor-v1 / seo-editor-admin-v1 / seo-editor-preview). None of those
// exist in this repository or in the LIVE project, so those cases are absent
// here rather than faked. Everything in this file is an authority assertion
// that stands on its own.

const SUPABASE_URL = process.env.QA_SUPABASE_URL ?? "https://cvwbozlbbmrjxznknouq.supabase.co";
const SITE_URL = process.env.QA_SITE_URL ?? "https://pawtenant.com";
const LIVE_REF = "cvwbozlbbmrjxznknouq";
if (!SUPABASE_URL.includes(LIVE_REF)) {
  console.error(`[matrix] REFUSING: ${SUPABASE_URL} is not the LIVE project.`);
  process.exit(1);
}

const password = process.argv[process.argv.indexOf("--password") + 1] ?? process.env.QA_FIXTURE_PASSWORD;

const ADMIN = "rbac-admin-qa@pawtenant-live.invalid";
const STAFF = "rbac-staff-qa@pawtenant-live.invalid";
const PROVIDER = "rbac-provider-qa@pawtenant-live.invalid";
const CUSTOMER = "rbac-customer-qa@pawtenant-live.invalid";

let anonKey = "";
let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  rows.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}
const section = (t) => console.log(`\n--- ${t} ---`);

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
  const b = await res.json();
  if (!b.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(b).slice(0, 160)}`);
  return { token: b.access_token, userId: b.user?.id };
}

async function rpc(name, token, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(args),
  });
  return { status: res.status, text: await res.text() };
}

async function rest(path, { token, method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json", apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, text: await res.text(), ok: res.ok };
}

async function main() {
  if (!password) throw new Error("Pass --password <fixture password>.");
  anonKey = await resolveAnonKey();
  console.log(`\n=== RBAC ROLE MATRIX -- ${SUPABASE_URL} ===`);

  const admin = await signIn(ADMIN);
  const staff = await signIn(STAFF);
  const provider = await signIn(PROVIDER);
  const customer = await signIn(CUSTOMER);

  // ── 1. The authority table itself is unreachable ────────────────────────
  section("1. the authority source is not reachable from a browser session");
  const authTable = await rest("staff_authority?select=user_id", { token: admin.token });
  check("private.staff_authority is unreachable over PostgREST, even for an admin",
    !authTable.ok, `status ${authTable.status}`);
  const forAnother = await rpc("staff_access_for", admin.token, { p_user_id: provider.userId });
  check("staff_access_for() is not callable by a signed-in account",
    forAnother.status >= 400, `status ${forAnother.status} ${forAnother.text.slice(0, 80)}`);

  // ── 2. Admin resolves from the hardened source ──────────────────────────
  section("2. a genuine admin resolves from private.staff_authority");
  const adminAccess = await rpc("current_staff_access", admin.token);
  const adminJson = JSON.parse(adminAccess.text)[0] ?? {};
  check("admin resolves as admin_manager from the hardened source",
    adminJson.access_role === "admin_manager" && adminJson.is_admin === true && adminJson.is_admin_level === true,
    adminAccess.text.slice(0, 120));
  const adminIsAdmin = await rpc("check_is_admin", admin.token);
  check("check_is_admin() is true for the admin", adminIsAdmin.text.trim() === "true", adminIsAdmin.text.slice(0, 40));

  // Reset the team member to a known state, so a re-run never starts from
  // "already granted" and reports a false failure at the revocation case.
  await rpc("admin_set_staff_access", admin.token, {
    p_user_id: staff.userId, p_access_role: "support", p_tab_access: null, p_revoke: false,
  });

  // ── 3. A non-admin cannot grant access ──────────────────────────────────
  section("3. a non-admin CANNOT grant access");
  const staffGrants = await rpc("admin_set_staff_access", staff.token, {
    p_user_id: staff.userId, p_access_role: "owner", p_tab_access: null, p_revoke: false,
  });
  check("support cannot grant themselves owner", staffGrants.status >= 400,
    `status ${staffGrants.status} ${staffGrants.text.slice(0, 90)}`);
  const providerGrants = await rpc("admin_set_staff_access", provider.token, {
    p_user_id: provider.userId, p_access_role: "owner", p_tab_access: null, p_revoke: false,
  });
  check("provider cannot grant themselves owner", providerGrants.status >= 400, `status ${providerGrants.status}`);
  const customerGrants = await rpc("admin_set_staff_access", customer.token, {
    p_user_id: customer.userId, p_access_role: "owner", p_tab_access: null, p_revoke: false,
  });
  check("a customer cannot grant themselves owner", customerGrants.status >= 400, `status ${customerGrants.status}`);
  const selfChange = await rpc("admin_set_staff_access", admin.token, {
    p_user_id: admin.userId, p_access_role: "owner", p_tab_access: null, p_revoke: false,
  });
  check("even an admin cannot change their OWN access", selfChange.status >= 400,
    `status ${selfChange.status} ${selfChange.text.slice(0, 90)}`);
  const unknownRole = await rpc("admin_set_staff_access", admin.token, {
    p_user_id: staff.userId, p_access_role: "superuser", p_tab_access: null, p_revoke: false,
  });
  check("an unknown role is refused", unknownRole.status >= 400, `status ${unknownRole.status}`);

  // ── 4. Tab access granted through the canonical interface ───────────────
  section("4. a tab grant through the canonical role/tab interface");
  const grant = await rpc("admin_set_staff_access", admin.token, {
    p_user_id: staff.userId, p_access_role: "support",
    p_tab_access: ["orders", "communications", "payments"], p_revoke: false,
  });
  check("an admin grants a tab set", grant.status === 200, `status ${grant.status} ${grant.text.slice(0, 90)}`);

  const staffAccess = await rpc("current_staff_access", staff.token);
  const staffJson = JSON.parse(staffAccess.text)[0] ?? {};
  check("the grant is visible to the team member's own session, on the SAME token",
    Array.isArray(staffJson.tab_access) && staffJson.tab_access.includes("payments"),
    staffAccess.text.slice(0, 120));
  check("the granted team member is an admin but NOT admin-level",
    staffJson.is_admin === true && staffJson.is_admin_level === false,
    `is_admin=${staffJson.is_admin} is_admin_level=${staffJson.is_admin_level}`);

  // The display mirror must have moved in the same transaction.
  const mirror = await rest(`doctor_profiles?select=role,is_admin,custom_tab_access&user_id=eq.${staff.userId}`,
    { token: admin.token });
  const mirrorRow = mirror.ok ? JSON.parse(mirror.text)[0] ?? {} : {};
  check("the doctor_profiles display mirror was written in the same transaction",
    mirrorRow.role === "support" && mirrorRow.is_admin === true &&
      Array.isArray(mirrorRow.custom_tab_access) && mirrorRow.custom_tab_access.includes("payments"),
    JSON.stringify(mirrorRow).slice(0, 120));

  // ── 5. Revocation takes effect immediately ──────────────────────────────
  section("5. revocation, on the same token");
  const revoke = await rpc("admin_set_staff_access", admin.token, {
    p_user_id: staff.userId, p_access_role: "support", p_tab_access: null, p_revoke: true,
  });
  check("an admin revokes the team member's access", revoke.status === 200, `status ${revoke.status}`);
  const staffAfter = await rpc("current_staff_access", staff.token);
  const staffAfterJson = JSON.parse(staffAfter.text)[0] ?? {};
  check("access disappears immediately, on the SAME token — no re-login needed",
    !staffAfterJson.access_role && staffAfterJson.is_admin === false,
    staffAfter.text.slice(0, 120));
  const staffIsAdmin = await rpc("check_is_admin", staff.token);
  check("check_is_admin() is false for the revoked member", staffIsAdmin.text.trim() === "false",
    staffIsAdmin.text.slice(0, 40));
  const staffOrders = await rest("orders?select=id&limit=1", { token: staff.token });
  check("the revoked member can no longer read admin-gated data",
    !staffOrders.ok || JSON.parse(staffOrders.text).length === 0,
    `status ${staffOrders.status}`);

  // Put the fixture back to granted so a failed run does not leave it revoked.
  await rpc("admin_set_staff_access", admin.token, {
    p_user_id: staff.userId, p_access_role: "support", p_tab_access: null, p_revoke: false,
  });

  // ── 6. Provider ─────────────────────────────────────────────────────────
  section("6. provider");
  const bio = `matrix ${Date.now()}`;
  const selfEdit = await rest(`doctor_profiles?user_id=eq.${provider.userId}`, {
    token: provider.token, method: "PATCH", body: { bio },
  });
  check("provider CAN edit their own legitimate profile fields", selfEdit.status === 204, `status ${selfEdit.status}`);

  // Every attempted value must DIFFER from what is already stored, and the row
  // is read back afterwards rather than trusting the status code.
  //
  // Both halves matter. lifecycle_status defaults to 'approved' and every row on
  // LIVE carries that value, so an earlier version of this loop PATCHed it to
  // 'approved' — a no-op the trigger correctly ignores — and reported a refusal
  // that had never been tested. A status code alone would have called that a
  // hole; reading the value back is what told the truth.
  const beforeRest = await rest(
    `doctor_profiles?select=is_admin,role,custom_tab_access,user_id,per_order_rate,is_published,is_active,lifecycle_status&user_id=eq.${provider.userId}`,
    { token: provider.token });
  const before = beforeRest.ok ? JSON.parse(beforeRest.text)[0] ?? {} : {};

  const attempts = [
    ["is_admin", "is_admin", !before.is_admin],
    ["role", "role", before.role === "owner" ? "admin_manager" : "owner"],
    ["custom_tab_access", "custom_tab_access", ["team", "payments"]],
    ["user_id (ownership)", "user_id", admin.userId],
    ["per_order_rate (payout)", "per_order_rate", (before.per_order_rate ?? 0) + 9999],
    ["is_published", "is_published", !before.is_published],
    ["is_active", "is_active", !before.is_active],
    ["lifecycle_status", "lifecycle_status",
      before.lifecycle_status === "suspended" ? "revoked" : "suspended"],
  ];

  for (const [label, column, value] of attempts) {
    const r = await rest(`doctor_profiles?user_id=eq.${provider.userId}`, {
      token: provider.token, method: "PATCH", body: { [column]: value },
    });
    // Re-read through the provider's own session: if the write landed, the
    // provider can see it.
    const afterRest = await rest(`doctor_profiles?select=${column}&user_id=eq.${provider.userId}`,
      { token: provider.token });
    const after = afterRest.ok ? (JSON.parse(afterRest.text)[0] ?? {})[column] : undefined;
    const unchanged = JSON.stringify(after) === JSON.stringify(before[column]);
    check(`provider CANNOT change ${label}`,
      r.status >= 400 && unchanged,
      `status ${r.status}, ${column} was ${JSON.stringify(before[column])} and is now ${JSON.stringify(after)}`);
  }

  const providerInsert = await rest("doctor_profiles", {
    token: provider.token, method: "POST",
    body: { user_id: customer.userId, email: "extra@x.invalid", is_admin: true, role: "owner" },
  });
  check("provider CANNOT insert another privileged profile", !providerInsert.ok, `status ${providerInsert.status}`);

  const providerAccess = await rpc("current_staff_access", provider.token);
  const providerJson = JSON.parse(providerAccess.text)[0] ?? {};
  check("provider resolves as provider, not an admin",
    providerJson.access_role === "provider" && providerJson.is_admin === false && providerJson.is_admin_level === false,
    providerAccess.text.slice(0, 120));

  // ── 7. Customer and anonymous ───────────────────────────────────────────
  section("7. customer and anonymous");
  const custInsert = await rest("doctor_profiles", {
    token: customer.token, method: "POST",
    body: { user_id: customer.userId, email: CUSTOMER, is_admin: true, role: "owner" },
  });
  check("customer CANNOT insert themselves a staff profile", !custInsert.ok, `status ${custInsert.status}`);
  const custInsertPlain = await rest("doctor_profiles", {
    token: customer.token, method: "POST",
    body: { user_id: customer.userId, email: CUSTOMER, is_admin: false, role: "provider" },
  });
  check("customer CANNOT insert even an UNPRIVILEGED staff profile for themselves",
    !custInsertPlain.ok, `status ${custInsertPlain.status}`);
  const custAccess = await rpc("current_staff_access", customer.token);
  const custJson = JSON.parse(custAccess.text)[0] ?? {};
  check("a customer has no staff access at all",
    !custJson.access_role && custJson.is_admin === false && custJson.is_admin_level === false,
    custAccess.text.slice(0, 120));
  const custIsAdmin = await rpc("check_is_admin", customer.token);
  check("check_is_admin() is false for a customer", custIsAdmin.text.trim() === "false", custIsAdmin.text.slice(0, 40));
  check("anonymous cannot read the authority mirror's privileged columns",
    !(await rest("doctor_profiles?select=is_admin,role")).ok);
  const anonRpc = await rpc("admin_set_staff_access", null, {
    p_user_id: customer.userId, p_access_role: "owner", p_tab_access: null, p_revoke: false,
  });
  check("anonymous cannot call the access setter", anonRpc.status >= 400, `status ${anonRpc.status}`);

  // ── 8. The existing admin portal still works ────────────────────────────
  section("8. existing admin portal access for a verified admin");
  const adminOrders = await rest("orders?select=id&limit=1", { token: admin.token });
  check("admin can still read orders", adminOrders.ok, `status ${adminOrders.status}`);
  const adminProfiles = await rest("doctor_profiles?select=id,role&limit=3", { token: admin.token });
  check("admin can still read staff profiles", adminProfiles.ok, `status ${adminProfiles.status}`);
  const providerProfiles = await rest("doctor_profiles?select=id,role&limit=3", { token: provider.token });
  check("provider sees only their own profile row",
    providerProfiles.ok && JSON.parse(providerProfiles.text).length <= 1,
    `rows ${providerProfiles.ok ? JSON.parse(providerProfiles.text).length : "n/a"}`);

  // ── 9. Audit ────────────────────────────────────────────────────────────
  section("9. audit");
  const audit = await rest("audit_logs?select=action,object_type&object_type=eq.staff_access&order=created_at.desc&limit=5",
    { token: admin.token });
  const auditRows = audit.ok ? JSON.parse(audit.text) : [];
  check("grants and revocations are audited",
    auditRows.length > 0 && auditRows.every((r) => r.object_type === "staff_access"),
    `${auditRows.length} rows, actions ${auditRows.map((r) => r.action).join(",")}`);
  const auditLeak = audit.ok ? audit.text : "";
  check("the audit rows carry no email or secret",
    !/@|password|token|key/i.test(auditLeak), auditLeak.slice(0, 80));

  console.log(`\n=== ${rows.length - failures}/${rows.length} checks passed ===`);
  if (failures) {
    console.log("\nFAILURES:");
    for (const r of rows.filter((x) => !x.ok)) console.log(`  - ${r.name}  ${r.detail}`);
  }
  process.exitCode = failures ? 1 : 0;
}

await main();
