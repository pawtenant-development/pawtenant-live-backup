#!/usr/bin/env node
/**
 * check-partner-platform-workspace.mjs
 *
 * PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
 *
 * Proves the dedicated Partner Platform workspace exists AND that moving the
 * Slice 3/7/8 surfaces into it weakened nothing:
 *
 *   * navigation + five URL-addressable sub-tabs + /admin-partners redirect;
 *   * legacy ?sub=partner links land in the workspace, never on a blank page;
 *   * Finance and Integration genuinely LEFT Admin Orders (single-mount);
 *   * the management layer's security contract: admin gate on every function,
 *     one-time secret reveals, hash-only storage, prefix/last4 display,
 *     sandbox-only credential creation on TEST, overlap-preserving rotation,
 *     SSRF refusal at registration AND dispatch, timestamp-bound signatures,
 *     partner-scoped private-ledger readers;
 *   * providers/customers still see none of it; direct orders untouched;
 *   * every prior partner guard is still wired into the build.
 *
 * `--self-test` PLANTS 18 real weakenings (the task's required negative
 * controls) into copies of the live sources and asserts each one fails the
 * guard. Restoration happens in `finally`; process.exit() is never called
 * inside the plant loop (it would skip `finally` and leave a mutation).
 *
 * CRLF: normalised at the single read point — anchors assume \n.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SIDEBAR = "src/pages/admin-orders/components/AdminSidebar.tsx";
const PAGE = "src/pages/admin-orders/page.tsx";
const ORDERS_TAB = "src/pages/admin-orders/components/PartnerOrdersTab.tsx";
const PP_DIR = "src/pages/admin-orders/components/partner-platform";
const WORKSPACE = `${PP_DIR}/PartnerPlatformWorkspace.tsx`;
const OVERVIEW = `${PP_DIR}/PartnerOverviewTab.tsx`;
const FINANCE_TAB = `${PP_DIR}/PartnerFinanceTab.tsx`;
const INTEGRATION_TAB = `${PP_DIR}/PartnerIntegrationTab.tsx`;
const SETTINGS_TAB = `${PP_DIR}/PartnerSettingsTab.tsx`;
const REDIRECT = `${PP_DIR}/AdminPartnersRedirect.tsx`;
const ROUTER_MAIN = "src/router/config.tsx";
const ROUTER_ADMIN = "src/router/adminRoutes.tsx";
const PROVIDER_PORTAL = "src/pages/provider-portal/page.tsx";
const MIG_MGMT = "supabase/migrations/20260821190000_partner_platform_admin_management.sql";
const MIG_FOUNDATION = "supabase/migrations/20260818183659_partner_clinical_fulfillment_foundation.sql";
const DISPATCH = "supabase/functions/partner-webhook-dispatch/index.ts";
const API_SHARED = "supabase/functions/_shared/partnerApi.ts";
const PKG = "package.json";

/** THE single read point. Every anchor below assumes \n line endings. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** String-aware comment stripper (Slice 6 lesson: never blank string bodies). */
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
      continue;
    }
    if (!sql && two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Extract one `create or replace function <name>(...)... $$;` block from SQL. */
function fnBlock(sqlSrc, name) {
  const re = new RegExp(
    `create or replace function [\\w.]*${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`, "m",
  );
  return sqlSrc.match(re)?.[0] ?? "";
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

function runChecks() {
  const sidebar = stripComments(read(SIDEBAR));
  const page = stripComments(read(PAGE));
  const workspace = stripComments(read(WORKSPACE));
  const overview = stripComments(read(OVERVIEW));
  const financeTab = stripComments(read(FINANCE_TAB));
  const integrationTab = stripComments(read(INTEGRATION_TAB));
  const settingsRaw = read(SETTINGS_TAB);
  const settings = stripComments(settingsRaw);
  const redirect = stripComments(read(REDIRECT));
  const routerMain = stripComments(read(ROUTER_MAIN));
  const routerAdmin = stripComments(read(ROUTER_ADMIN));
  const ordersTabRaw = read(ORDERS_TAB);
  const migMgmt = read(MIG_MGMT); // raw: SQL comments state the contract, code is quoted
  const migFoundation = read(MIG_FOUNDATION);
  const dispatch = stripComments(read(DISPATCH));
  const apiShared = stripComments(read(API_SHARED));
  const pkg = read(PKG);

  // ── N1/N2: navigation + tab registration ─────────────────────────────────
  check("N1 sidebar has the Partner Platform item",
    /key:\s*"partners",\s*label:\s*"Partner Platform"/.test(sidebar) &&
    /"dashboard",\s*"orders",\s*"partners",/.test(sidebar),
    "AdminSidebar must list partners in TAB_CONFIG and DESKTOP_ORDER");
  check("N2 the shell registers and mounts the partners tab",
    /"partners"/.test(page.match(/type TabKey = [^\n]*/)?.[0] ?? "") &&
    /"partners"/.test(page.match(/const ALL_TABS[^\n]*/)?.[0] ?? "") &&
    /activeTab === "partners" && isTabVisible\("partners"\)/.test(page) &&
    /<PartnerPlatformWorkspace/.test(page),
    "page.tsx must register partners in TabKey + ALL_TABS and mount the workspace");

  // ── N3/N4: five URL-addressable sub-tabs ─────────────────────────────────
  const subKeys = ["overview", "orders", "finance", "integration", "settings"];
  check("N3 all five sub-tabs exist",
    subKeys.every((k) => new RegExp(`key:\\s*"${k}"`).test(workspace)),
    "the workspace must declare overview/orders/finance/integration/settings");
  check("N4 sub-tabs bind to ?ptab= in both directions",
    /get\("ptab"\)/.test(workspace) && /params\.set\("ptab", next\)/.test(workspace),
    "refresh, Back and saved links require the sub-tab in the URL");

  // ── N5/N6: routes + legacy links ─────────────────────────────────────────
  check("N5 /admin-partners exists in BOTH routers and redirects into the shell",
    /path:\s*"\/admin-partners"/.test(routerMain) &&
    /path="\/admin-partners"/.test(routerAdmin) &&
    /\/admin-orders\?tab=partners/.test(redirect) && /ptab=\$\{sub\}/.test(redirect),
    "the memorable route must map its ?tab= onto ?ptab= in the shell");
  check("N6 legacy ?sub=partner deep links redirect into the workspace",
    /params\.get\("sub"\)\s*!==\s*"partner"/.test(page) &&
    /params\.set\("tab", "partners"\)/.test(page) &&
    /params\.set\("ptab", "orders"\)/.test(page),
    "old Partner Orders bookmarks must land on the workspace Orders sub-tab");

  // ── N7: Partner Orders remains functional inside the workspace ───────────
  check("N7 the workspace mounts PartnerOrdersTab through the canonical props",
    /<PartnerOrdersTab/.test(workspace) &&
    /onOpenOrder=\{onOpenOrder\}/.test(workspace) &&
    /listColumns=\{listColumns\}/.test(workspace) &&
    /partnerOrdersFilters\(partnerId/.test(stripComments(ordersTabRaw)) &&
    /orderOrigin:\s*"partner"/.test(stripComments(read("src/pages/admin-orders/partnerOrderScope.ts"))),
    "orders list, filters and the shared modal controller must survive the move");

  // ── N8/N9: Finance and Integration genuinely moved out ───────────────────
  const importersOf = (token, selfRel) => {
    const hits = [];
    const walk = (dir) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { walk(rel); continue; }
        if (!/\.(tsx?|mjs)$/.test(e.name)) continue;
        const s = readFileSync(join(ROOT, rel), "utf8");
        if (s.includes(token) && rel.replaceAll("\\", "/") !== selfRel) hits.push(rel.replaceAll("\\", "/"));
      }
    };
    walk("src");
    return hits;
  };
  const finImporters = importersOf("PartnerFinanceTab", FINANCE_TAB);
  check("N8 Finance mounts ONLY in the workspace and left Admin Orders",
    finImporters.length === 1 && finImporters[0] === WORKSPACE &&
    !existsSync(join(ROOT, "src/pages/admin-orders/components/PartnerFinancePanel.tsx")) &&
    !ordersTabRaw.includes("PartnerFinance"),
    `finance importers: ${JSON.stringify(finImporters)}`);
  const intImporters = importersOf("PartnerIntegrationTab", INTEGRATION_TAB);
  check("N9 Integration mounts ONLY in the workspace and left Admin Orders",
    intImporters.length === 1 && intImporters[0] === WORKSPACE &&
    !existsSync(join(ROOT, "src/pages/admin-orders/components/PartnerIntegrationPanel.tsx")) &&
    !ordersTabRaw.includes("PartnerIntegration"),
    `integration importers: ${JSON.stringify(intImporters)}`);

  // ── N10: Sandbox and Live visually distinct, Live locked ─────────────────
  check("N10 Live is visibly locked with the owner-approval explanation",
    /Sandbox<\/p>/.test(settingsRaw) && /Live<\/p>/.test(settingsRaw) &&
    /label="Locked"/.test(settingsRaw) &&
    /owner approval and a separate LIVE rollout/.test(settingsRaw),
    "the environment cards must present Sandbox usable and Live locked");

  // ── N11/N12: TEST cannot create Live credentials ─────────────────────────
  const createKeyFn = fnBlock(migMgmt, "partner_admin_create_api_key");
  check("N11 credential creation refuses forged and production environments server-side",
    /not in \('sandbox','production'\) then\n    raise exception 'environment must be sandbox or production'/.test(createKeyFn) &&
    /if p_environment = 'production' and not v_org\.production_enabled then\n    raise exception 'production credentials require production_enabled/.test(createKeyFn),
    "a forged environment=live must 22023 and production must 42501 while not production_enabled");
  check("N12 the admin UI only ever requests sandbox credentials",
    /p_environment:\s*"sandbox"/.test(settings) &&
    !/p_environment:\s*"(live|production)"/.test(settings),
    "the frontend must pin sandbox; the server refusal is the real gate");

  // ── N13: the canonical admin gate fronts every management function ───────
  const mgmtFnCount = (migMgmt.match(/create or replace function (public\.partner_admin_|public\.partner_register_webhook_endpoint)/g) ?? []).length;
  const gateCount = (migMgmt.match(/if not coalesce\(public\.is_chat_admin\(\), false\) then/g) ?? []).length;
  check("N13 every management function starts with the is_chat_admin capability gate",
    mgmtFnCount >= 15 && gateCount >= mgmtFnCount,
    `${mgmtFnCount} management functions, ${gateCount} gates — no second authorization system`);

  // ── N14/N15/N16: one-time secrets, hash-only storage, safe projections ───
  const listKeysFn = fnBlock(migMgmt, "partner_admin_list_api_keys");
  check("N14 the key list projection can never carry secret material",
    listKeysFn.length > 0 && !/secret_hash|secret_algo/.test(listKeysFn) &&
    /secret_last4/.test(listKeysFn),
    "list_api_keys must expose prefix identity + last4 only");
  check("N15 creation returns the secret exactly once and stores only the hash",
    /returns table \(credential_id uuid, key_id text, secret text\)/.test(createKeyFn) &&
    /encode\(extensions\.digest\(v_secret, 'sha256'\), 'hex'\)/.test(createKeyFn) &&
    /right\(v_secret, 4\)/.test(createKeyFn),
    "the mint path is the ONLY reveal; at rest: sha256 + last4");
  const srcHashLeak = importersOf("secret_hash", "");
  check("N16 no frontend source references credential hashes",
    srcHashLeak.length === 0,
    `secret_hash appears in: ${JSON.stringify(srcHashLeak)}`);

  // ── N17/N18/N19: revoked / expired / wrong-scope keys fail ───────────────
  check("N17 the verifier refuses revoked credentials",
    /c\.status = 'active'\n\s*and c\.revoked_at is null/.test(migFoundation),
    "partner_verify_api_credential must require active + not revoked");
  check("N18 the verifier refuses expired credentials",
    /and \(c\.expires_at is null or c\.expires_at > now\(\)\)/.test(migFoundation),
    "partner_verify_api_credential must enforce expiry");
  check("N19 scope enforcement is real membership, not a stub",
    /export function hasScope\(identity: PartnerIdentity, scope: string\): boolean \{\n  return identity\.scopes\.includes\(scope\);\n\}/.test(apiShared),
    "hasScope must test the credential's scopes");

  // ── N20: rotation preserves the old key (controlled overlap) ─────────────
  const rotateFn = fnBlock(migMgmt, "partner_admin_rotate_api_key");
  check("N20 rotation never touches the old credential",
    rotateFn.length > 0 && /rotated_from_key_id/.test(rotateFn) &&
    !/update\s+private\.partner_api_credentials/.test(rotateFn),
    "the replacement is minted first; revoking the old key is a separate explicit action");

  // ── N21: webhook signing secrets reveal once, no client read path ────────
  const rotateHookFn = fnBlock(migMgmt, "partner_admin_rotate_webhook_secret");
  const secretReaders = importersOf("partner_webhook_endpoint_secrets", "");
  check("N21 webhook secrets reveal once and have no client read path",
    /returns table \(endpoint_id uuid, secret text\)/.test(fnBlock(migMgmt, "partner_register_webhook_endpoint")) &&
    /returns text/.test(rotateHookFn) &&
    secretReaders.length === 0,
    `frontend files reading the secrets table: ${JSON.stringify(secretReaders)}`);

  // ── N22/N23: SSRF + signature/replay protections remain ──────────────────
  check("N22 unsafe webhook destinations are refused at registration AND dispatch",
    /if v_host ~\* '\^\(localhost\|127\\\.\|10\\\.\|192\\\.168\\\.\|169\\\.254\\\.\|0\\\.\|172\\\.\(1\[6-9\]\|2\[0-9\]\|3\[01\]\)\\\.\)' then/.test(migMgmt) &&
    /must not embed credentials/.test(migMgmt) &&
    /PRIVATE_HOST_RE/.test(dispatch) && /redirect: "error"/.test(dispatch) &&
    /sandbox endpoint must be the controlled sandbox receiver/.test(read(DISPATCH)),
    "HTTPS-only, no loopback/private hosts, no redirects, sandbox pinned to the sink");
  check("N23 deliveries stay HMAC-signed and timestamp-bound",
    /"X-PawTenant-Signature": `v1=\$\{signature\}`/.test(dispatch) &&
    /`\$\{timestamp\}\.\$\{body\}`/.test(dispatch),
    "removing the signature or the timestamp binding would allow forgery/replay");

  // ── N24: private-ledger readers are partner-scoped ───────────────────────
  check("N24 private-ledger readers filter by the requested partner",
    /where c\.partner_id = p_partner_id/.test(listKeysFn) &&
    /where r\.partner_id = p_partner_id/.test(fnBlock(migMgmt, "partner_admin_list_api_requests")),
    "a reader without the partner predicate would leak cross-partner data");

  // ── N25/N26: providers and customers stay outside ────────────────────────
  const providerSrc = read(PROVIDER_PORTAL);
  check("N25 the provider portal references no partner economics or credentials",
    !/wholesale_fee_cents|partner_billable_events|partner_invoice|partner_rate_cards|partner_api_credentials|partner-platform/.test(providerSrc),
    "providers must never see wholesale amounts, invoices or the management UI");
  const ppImporters = importersOf("partner-platform/", "");
  const allowedHosts = new Set([PAGE, ROUTER_MAIN, ROUTER_ADMIN]);
  const badHosts = ppImporters.filter((f) => !allowedHosts.has(f) && !f.startsWith(PP_DIR));
  check("N26 only the admin shell and routers import the workspace",
    badHosts.length === 0,
    `unexpected partner-platform importers: ${JSON.stringify(badHosts)}`);

  // ── N27: secrets have no side channels in the workspace UI ───────────────
  const uiSources = [workspace, overview, financeTab, integrationTab, settings, stripComments(read(`${PP_DIR}/shared.tsx`))];
  const sideChannel = uiSources.some((s) =>
    /localStorage|sessionStorage/.test(s) ||
    /console\.\w+\([^\n]*[sS]ecret/.test(s) ||
    /gtag\(|dataLayer|posthog|mixpanel/.test(s));
  check("N27 no secret reaches storage, logs or analytics from the workspace",
    !sideChannel,
    "reveal values must exist only in React state while the dialog is open");

  // ── N28: every prior partner guard (and this one) stays wired ────────────
  const buildLine = JSON.parse(pkg).scripts.build;
  const REQUIRED_GUARDS = [
    "check-partner-orders-segregation.mjs", "check-partner-assessment-pdf.mjs",
    "check-partner-document-isolation.mjs", "check-partner-comms-isolation.mjs",
    "check-psd-partner-unmapped-version.mjs", "check-partner-psd-contract-and-finance.mjs",
    "check-partner-slice8-closure.mjs", "check-partner-platform-workspace.mjs",
    "check-partner-manual-intake.mjs",
    "check-partner-portal-manual-order-billing.mjs",
  ];
  check("N28 all partner guards remain in the build chain",
    REQUIRED_GUARDS.every((g) => buildLine.includes(g)),
    `missing: ${REQUIRED_GUARDS.filter((g) => !buildLine.includes(g)).join(", ")}`);

  // ── N29: direct PawTenant orders unchanged ───────────────────────────────
  check("N29 the retail Orders workspace is intact and free of sub-tab remnants",
    !/ordersSubTab/.test(page) &&
    /activeTab === "orders" &&/.test(page),
    "the direct experience must not carry dead partner switches");

  // ── N30: partner-platform order queries stay origin-pinned ───────────────
  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the Overview pins its
  // origin through the shared partnerOrdersFilters() funnel (the same one the
  // Orders list uses); Finance / Integration keep the literal pin.
  const originPinned = [overview, financeTab, integrationTab].every((s) => {
    const fromOrders = (s.match(/\.from\("orders"\)/g) ?? []).length;
    const pinned = (s.match(/\.eq\("order_origin", "partner"\)/g) ?? []).length
      + (s.match(/partnerOrdersFilters\(/g) ?? []).length;
    return fromOrders >= 1 && pinned >= fromOrders;
  });
  check("N30 every workspace orders query pins order_origin = partner",
    originPinned,
    "a direct PawTenant order must never appear in the Partner Platform");

  // ── N31/N32: safe archive + endpoint hygiene ─────────────────────────────
  const archiveFn = fnBlock(migMgmt, "partner_admin_archive_organization");
  check("N31 archiving an organization fails closed on operational history",
    /organization has orders/.test(archiveFn) &&
    /still has active API keys/.test(archiveFn) &&
    /still has active webhook endpoints/.test(archiveFn),
    "orders/invoices/events/credentials/webhooks all block the archive");
  check("N32 endpoint removal refuses delivery history; test events carry no PHI",
    /endpoint has delivery history/.test(fnBlock(migMgmt, "partner_admin_delete_webhook_endpoint")) &&
    /'note', 'PawTenant signed webhook test event — safe to ignore'/.test(fnBlock(migMgmt, "partner_admin_send_test_webhook")),
    "unused-only removal; the test ping is a fixed notice string");
}

// ── Reporting ────────────────────────────────────────────────────────────────
function report(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${label}`);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`);
  }
  console.log(`\n  ${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length;
}

const SELF_TEST = process.argv.includes("--self-test");

if (!SELF_TEST) {
  runChecks();
  process.exitCode = report("PARTNER PLATFORM WORKSPACE") ? 1 : 0;
} else {
  // ── PLANTED NEGATIVE CONTROLS (the task's 18, verbatim) ────────────────────
  const CONTROLS = [
    { name: "complete stored API key exposed through the list projection",
      file: MIG_MGMT,
      find: "  select c.id, c.key_id, c.label, c.environment, c.scopes,\n         c.status, c.secret_last4, c.created_at, c.last_used_at,",
      replace: "  select c.id, c.key_id, c.label, c.environment, c.scopes,\n         c.status, c.secret_hash, c.created_at, c.last_used_at,",
      expect: "N14" },
    { name: "credential hash returned to the browser",
      file: SETTINGS_TAB,
      find: "  secret_last4: string | null;\n  created_at: string;",
      replace: "  secret_last4: string | null;\n  secret_hash: string;\n  created_at: string;",
      expect: "N16" },
    { name: "API key written to logs",
      file: SETTINGS_TAB,
      find: "        const row = Array.isArray(data) ? data[0] as { credential_id: string; key_id: string; secret: string } : null;\n        if (row) {\n          setReveal({\n            kind: \"api_key\",\n            title: \"Sandbox API key created\",",
      replace: "        const row = Array.isArray(data) ? data[0] as { credential_id: string; key_id: string; secret: string } : null;\n        if (row) {\n          console.log(\"minted secret\", row.secret);\n          setReveal({\n            kind: \"api_key\",\n            title: \"Sandbox API key created\",",
      expect: "N27" },
    { name: "TEST generating a Live key (production gate removed)",
      file: MIG_MGMT,
      find: "  if p_environment = 'production' and not v_org.production_enabled then\n    raise exception 'production credentials require production_enabled — a separately authorized activation'\n      using errcode = '42501';\n  end if;\n  if v_org.status not in ('sandbox','active') then",
      replace: "  if v_org.status not in ('sandbox','active') then",
      expect: "N11" },
    { name: "non-admin generating a key (gate removed)",
      file: MIG_MGMT,
      find: "  v_allowed  text[] := array['orders:create','orders:read','documents:read'];\nbegin\n  if not coalesce(public.is_chat_admin(), false) then\n    raise exception 'admin access required' using errcode = '42501';\n  end if;\n  if p_environment is null",
      replace: "  v_allowed  text[] := array['orders:create','orders:read','documents:read'];\nbegin\n  if p_environment is null",
      expect: "N13" },
    { name: "revoked key authenticating",
      file: MIG_FOUNDATION,
      find: "    and c.status = 'active'\n    and c.revoked_at is null\n",
      replace: "    and c.status = 'active'\n",
      expect: "N17" },
    { name: "expired key authenticating",
      file: MIG_FOUNDATION,
      find: "    and (c.expires_at is null or c.expires_at > now())\n",
      replace: "\n",
      expect: "N18" },
    { name: "wrong-scope request succeeding",
      file: API_SHARED,
      find: "export function hasScope(identity: PartnerIdentity, scope: string): boolean {\n  return identity.scopes.includes(scope);\n}",
      replace: "export function hasScope(identity: PartnerIdentity, scope: string): boolean {\n  return true;\n}",
      expect: "N19" },
    { name: "old key revoked automatically during rotation",
      file: MIG_MGMT,
      find: "  perform private.partner_admin_audit('partner_admin_api_key_rotated'",
      replace: "  update private.partner_api_credentials set status = 'revoked', revoked_at = now() where id = p_credential_id;\n  perform private.partner_admin_audit('partner_admin_api_key_rotated'",
      expect: "N20" },
    { name: "webhook secret retrievable after creation",
      file: SETTINGS_TAB,
      find: "        supabase.from(\"partner_webhook_endpoints\")\n          .select(\"id, partner_id, environment, url, description, active, event_types, created_at, disabled_at, disabled_reason\")",
      replace: "        supabase.from(\"partner_webhook_endpoint_secrets\")\n          .select(\"endpoint_id, secret\")",
      expect: "N21" },
    { name: "unsafe webhook URL accepted",
      file: MIG_MGMT,
      find: "  if v_host ~* '^(localhost|127\\.|10\\.|192\\.168\\.|169\\.254\\.|0\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)' then\n    raise exception 'webhook endpoints must not target loopback or private networks' using errcode = '22023';\n  end if;",
      replace: "  if false then\n    raise exception 'webhook endpoints must not target loopback or private networks' using errcode = '22023';\n  end if;",
      expect: "N22" },
    { name: "unsigned webhook treated as valid (signature header dropped)",
      file: DISPATCH,
      find: "          \"X-PawTenant-Signature\": `v1=${signature}`,\n",
      replace: "",
      expect: "N23" },
    { name: "replayed webhook accepted (timestamp unbound from signature)",
      file: DISPATCH,
      find: "const mac = await crypto.subtle.sign(\"HMAC\", key, new TextEncoder().encode(`${timestamp}.${body}`));",
      replace: "const mac = await crypto.subtle.sign(\"HMAC\", key, new TextEncoder().encode(`${body}`));",
      expect: "N23" },
    { name: "cross-partner ledger rows visible",
      file: MIG_MGMT,
      find: "    from private.partner_api_requests r\n   where r.partner_id = p_partner_id",
      replace: "    from private.partner_api_requests r\n   where true",
      expect: "N24" },
    { name: "provider seeing the wholesale amount",
      file: PROVIDER_PORTAL,
      find: "order_origin, partner_id, partner_order_id\")",
      replace: "order_origin, partner_id, partner_order_id, wholesale_fee_cents\")",
      expect: "N25" },
    { name: "Finance remaining embedded in Admin Orders",
      file: ORDERS_TAB,
      find: "import { supabase } from \"../../../lib/supabaseClient\";",
      replace: "import { supabase } from \"../../../lib/supabaseClient\";\nimport PartnerFinanceTab from \"./partner-platform/PartnerFinanceTab\";",
      expect: "N8" },
    { name: "Integration remaining embedded in Admin Orders",
      file: ORDERS_TAB,
      find: "import { supabase } from \"../../../lib/supabaseClient\";",
      replace: "import { supabase } from \"../../../lib/supabaseClient\";\nimport PartnerIntegrationTab from \"./partner-platform/PartnerIntegrationTab\";",
      expect: "N9" },
    { name: "direct PawTenant order appearing in the Partner Platform",
      file: OVERVIEW,
      find: "          .eq(\"order_origin\", \"partner\").eq(\"partner_id\", partnerId)",
      replace: "          .eq(\"partner_id\", partnerId)",
      expect: "N30" },
  ];

  let controlFailures = 0;
  for (const c of CONTROLS) {
    const abs = join(ROOT, c.file);
    const original = readFileSync(abs, "utf8");
    const normalized = original.replace(/\r\n/g, "\n");
    const occurrences = normalized.split(c.find).length - 1;
    if (occurrences !== 1) {
      console.log(`  MISSED  ${c.name} — anchor matched ${occurrences}× (must be exactly 1)`);
      controlFailures++;
      continue;
    }
    try {
      writeFileSync(abs, normalized.replace(c.find, c.replace));
      results.length = 0;
      runChecks();
      const target = results.find((r) => r.name.startsWith(c.expect));
      if (target && !target.ok) console.log(`  DETECTED  ${c.name} (fails ${c.expect})`);
      else { console.log(`  MISSED  ${c.name} — ${c.expect} still passes`); controlFailures++; }
    } finally {
      writeFileSync(abs, original);
    }
  }

  // Clean run after every restore — the tree must be green again.
  results.length = 0;
  runChecks();
  const cleanFailures = report("PARTNER PLATFORM WORKSPACE (post-restore)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - controlFailures}/${CONTROLS.length} controls detected, tree restored`);
  process.exitCode = controlFailures || cleanFailures ? 1 : 0;
}
