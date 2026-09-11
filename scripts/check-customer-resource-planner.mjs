#!/usr/bin/env node
// check-customer-resource-planner.mjs
//
// ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001 → ESA-PSD-PLANNERS-MARKETING-LIVE-001
// ---------------------------------------------------------------------------
// Two owner-managed customer resources — the "Pet Care Planner by PawTenant"
// (paid ESA packages) and the "Psychiatric Service Dog Training Workbook by
// PawTenant" (paid PSD packages) — share ONE canonical asset store (slots +
// immutable versions + events), private storage for the master PDFs, a
// 5-minute signed URL minted only after the DATABASE says the caller owns an
// authoritatively-paid order of the resource's service family, an admin panel
// that replaces / previews / publishes / rolls back / disables without a
// deployment, one reusable marketing section with service-specific copy, and
// honest imagery per family (the PSD surfaces show only pages rendered from
// the PSD workbook; the Pet Care Planner artwork never stands in for it).
//
// Static rules are asserted with comments (and, for "must NOT contain" rules
// on CODE, string literals) stripped so the USE is tested, not the mention.
// Copy rules scan comment-stripped source only — customer copy lives in string
// literals. Presentation modules are EXECUTED through jiti so card content, the
// benefit resolver and the marketing copy are tested for what they return.
//
// Exit 0 = pass, 1 = fail. `--self-test` plants negative controls in the real
// files, requires each to fail, and restores the tree byte-identically.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  mig: join(ROOT, "supabase/migrations/20260909120000_customer_resource_planners.sql"),
  mig2: join(ROOT, "supabase/migrations/20260911100000_customer_resource_psd_workbook_slot.sql"),
  mig3: join(ROOT, "supabase/migrations/20260911130000_customer_resource_cancel_spelling.sql"),
  fnUrl: join(ROOT, "supabase/functions/get-customer-resource-url/index.ts"),
  fnUp: join(ROOT, "supabase/functions/admin-upload-customer-resource/index.ts"),
  lib: join(ROOT, "src/lib/customerResources.ts"),
  section: join(ROOT, "src/pages/my-orders/components/IncludedResourcesSection.tsx"),
  portal: join(ROOT, "src/pages/my-orders/page.tsx"),
  panel: join(ROOT, "src/pages/admin-orders/components/CustomerResourcesPanel.tsx"),
  settings: join(ROOT, "src/pages/admin-orders/components/SettingsTab.tsx"),
  benefit: join(ROOT, "src/data/plannerBenefit.ts"),
  marketing: join(ROOT, "src/components/feature/PlannerMarketingSection.tsx"),
  cards: join(ROOT, "src/data/planPricingCards.ts"),
  mini: join(ROOT, "src/components/feature/EsaPricingMini.tsx"),
  psdMini: join(ROOT, "src/components/feature/PsdPricingMini.tsx"),
  home: join(ROOT, "src/pages/home/page.tsx"),
  cost: join(ROOT, "src/pages/esa-letter-cost/page.tsx"),
  apartments: join(ROOT, "src/pages/esa-letter-for-apartments/page.tsx"),
  howEsa: join(ROOT, "src/pages/how-to-get-esa/page.tsx"),
  psdCost: join(ROOT, "src/pages/psd-letter-cost/page.tsx"),
  psdHow: join(ROOT, "src/pages/how-to-get-psd-letter/page.tsx"),
  psdState: join(ROOT, "src/pages/state-psd/page.tsx"),
  lp: join(ROOT, "src/pages/lp-esa-housing/page.tsx"),
  pkg: join(ROOT, "src/pages/assessment/components/PackageSelectionStep.tsx"),
  step3: join(ROOT, "src/pages/assessment/components/Step3Checkout.tsx"),
  psdStep3: join(ROOT, "src/pages/psd-assessment/components/PSDStep3Checkout.tsx"),
  manifest: join(ROOT, "src/generated/responsiveImages.ts"),
  pricing: join(ROOT, "src/config/pricing.ts"),
  cpi: join(ROOT, "supabase/functions/create-payment-intent/index.ts"),
  ccs: join(ROOT, "supabase/functions/create-checkout-session/index.ts"),
  matrix: join(ROOT, "supabase/functions/_shared/pricingMatrix.ts"),
  imgDir: join(ROOT, "public/assets/planner"),
};
// Pages that exist on TEST but not (yet) on LIVE: skipped when absent.
const OPTIONAL = new Set(["howEsa"]);

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "");
// Assert the USE, not the mention: comments stripped ...
const noComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/gm, "$1");
// ... and, for "must NOT contain" scans of CODE, string literals too.
const codeOnly = (s) => noComments(s).replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, "''");
// SQL: strip `--` and block comments ONLY (a PL/pgSQL body lives inside $$).
const sqlCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
/** The body of one `create or replace function public.<name>(` block. */
const fnBody = (sql, name) => {
  const i = sql.indexOf(`create or replace function public.${name}(`);
  if (i < 0) return "";
  const end = sql.indexOf("\n$$;", i);
  return end < 0 ? sql.slice(i) : sql.slice(i, end + 4);
};
const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };

async function run() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  const migRaw = read(F.mig);
  const mig = sqlCode(migRaw);
  const mig2 = sqlCode(read(F.mig2));
  const mig3 = sqlCode(read(F.mig3));
  const fnUrl = read(F.fnUrl), fnUrlCode = codeOnly(fnUrl), fnUrlNc = noComments(fnUrl);
  const fnUp = read(F.fnUp), fnUpNc = noComments(fnUp);
  const lib = read(F.lib), libCode = codeOnly(lib), libNc = noComments(lib);
  const section = read(F.section), sectionCode = codeOnly(section), sectionNc = noComments(section);
  const portalNc = noComments(read(F.portal));
  const panelNc = noComments(read(F.panel));
  const settingsNc = noComments(read(F.settings));
  const benefit = read(F.benefit), benefitNc = noComments(benefit);
  const marketing = read(F.marketing), marketingNc = noComments(marketing), marketingCode = codeOnly(marketing);
  const step3Nc = noComments(read(F.step3));
  const psdStep3Nc = noComments(read(F.psdStep3));
  const pkgNc = noComments(read(F.pkg));
  const lpNc = noComments(read(F.lp));
  for (const [k, p] of Object.entries(F)) if (k !== "imgDir" && !OPTIONAL.has(k)) ok(existsSync(p), `missing file: ${relative(ROOT, p)}`);
  if (fails.length) return fails;

  // ── 1 · ESA and PSD assets use SEPARATE resource identifiers ──────────────
  ok(/check \(resource_key in \('esa_planner', 'psd_planner'\)\)/.test(mig), "the slot key constraint no longer names two distinct slots (esa_planner, psd_planner)");
  ok(/\('esa_planner', 'esa', /.test(mig) && /\('psd_planner', 'psd', /.test(mig), "both slots are no longer seeded with their own service_family");
  ok(/check \(service_family in \('esa', 'psd'\)\)/.test(mig), "service_family is no longer constrained to esa|psd");
  ok(/customer_resource_versions_key_version_uq unique \(resource_key, version\)/.test(mig), "versions are no longer unique per (resource_key, version)");
  ok(/type CustomerResourceKey = "esa_planner" \| "psd_planner"/.test(lib), "the client no longer models the two slots as distinct keys");
  ok(/esa: \{\s*key: "esa_planner",/.test(sectionNc) && /psd: \{\s*key: "psd_planner",/.test(sectionNc), "the portal card maps a family to the OTHER family's resource key (assets swapped)");
  ok(/display_name\s*=\s*'Psychiatric Service Dog Training Workbook by PawTenant'/.test(mig2) && /where resource_key = 'psd_planner'/.test(mig2) && /advertised\s*=\s*true/.test(mig2), "the PSD slot migration no longer names the PSD workbook / advertises the PSD slot");

  // ── 2 · a resource can never be returned for the other family's order ─────
  const elig = fnBody(mig, "customer_resource_order_eligible");
  ok(/public\.order_service_family\([\s\S]*?\)\s*=\s*p_family/.test(elig), "customer_resource_order_eligible no longer requires order_service_family(...) = the slot's family — a PSD order could receive the ESA planner");
  ok(/p_family in \('esa', 'psd'\)/.test(elig), "the family predicate no longer rejects an unknown family");
  ok(!/confirmation_id/.test(elig), "eligibility reads confirmation_id — an order id is a display reference, not a product record");
  ok(!/confirmation_id/.test(sectionCode) && !/isPSDOrder|isPsdOrder/.test(sectionNc), "the portal section infers the family from a display helper / confirmation_id instead of classifyServiceFamily");
  ok(/classifyServiceFamily\(o\)/.test(sectionNc), "the portal section no longer classifies with the canonical classifyServiceFamily");
  const access = fnBody(mig, "customer_resource_access");
  ok(/customer_resource_identity_eligible\(v_uid, v_email, v_slot\.service_family\)/.test(access), "customer_resource_access no longer checks eligibility against the SLOT's service family");

  // ── 3 · unpaid portal access cannot retrieve a resource ───────────────────
  ok(/not in \('lead', 'cancelled', 'archived', 'refunded', 'disputed'\)/.test(elig), "the status exclusion list lost lead / cancelled / archived / refunded / disputed");
  ok(/public\.order_payment_state\(o\) in \('paid', 'partially_refunded'\)/.test(elig), "eligibility no longer requires the canonical order_payment_state to be paid or partially_refunded");
  ok(!/'unpaid'|'failed'/.test(elig), "an unpaid or failed payment state would be accepted");
  // The LIVE-data hardening: the redefinition must keep every predicate AND exclude both spellings of cancelled.
  const elig3 = fnBody(mig3, "customer_resource_order_eligible");
  ok(/not in \('lead', 'cancelled', 'canceled', 'archived', 'refunded', 'disputed'\)/.test(elig3), "the hardened status exclusion list no longer names BOTH spellings (cancelled / canceled) plus lead / archived / refunded / disputed");
  ok(/public\.order_payment_state\(o\) in \('paid', 'partially_refunded'\)/.test(elig3) && !/'unpaid'|'failed'/.test(elig3), "the hardened predicate no longer requires the canonical paid / partially_refunded payment state");
  ok(/public\.order_service_family\([\s\S]*?\)\s*=\s*p_family/.test(elig3) && /p_family in \('esa', 'psd'\)/.test(elig3), "the hardened predicate dropped the service-family match");
  ok(/revoke all on function public\.customer_resource_order_eligible\(public\.orders, text\) from public, anon, authenticated;/.test(mig3), "the hardened predicate is no longer re-revoked from public / anon / authenticated after create or replace");
  ok(/return json\(403, \{ ok: false, code: "not_entitled"/.test(fnUrlNc), "the signed-URL function no longer answers 403 not_entitled");

  // ── 4 · authentication alone is insufficient without order ownership ──────
  const ident = fnBody(mig, "customer_resource_identity_eligible");
  ok(/\(p_uid is not null and o\.user_id = p_uid\)/.test(ident) && /public\.normalize_email\(o\.email\) = p_email/.test(ident), "ownership no longer requires orders.user_id = caller OR normalized email match");
  ok(/exists \(\s*select 1\s*from public\.orders o/.test(ident), "eligibility no longer proves ownership of an actual orders row");
  ok(/and public\.customer_resource_order_eligible\(o, p_family\)/.test(ident), "ownership is no longer combined with the paid + family predicate");
  const callerId = fnBody(mig, "customer_resource_caller_identity");
  ok(/if not public\.is_admin_staff\(\) then\s*raise exception/.test(callerId), "an email preview no longer requires is_admin_staff()");
  ok(!/user_metadata|raw_user_meta_data|app_metadata/.test(mig), "the migration authorizes from editable user metadata");
  ok(/if \(!bearer \|\| bearer === serviceKey \|\| bearer === anonKey\)/.test(fnUrlNc), "get-customer-resource-url no longer refuses the service-role / anon key as a bearer");
  ok(/admin\.auth\.getUser\(bearer\)/.test(fnUrlNc), "get-customer-resource-url no longer resolves a real user");
  ok(/asCaller\.rpc\("customer_resource_access"/.test(fnUrlNc), "get-customer-resource-url no longer asks customer_resource_access with the CALLER's JWT");
  ok(/global: \{ headers: \{ Authorization: `Bearer \$\{bearer\}` \} \}/.test(fnUrlNc), "the RPC client no longer carries the caller's own token");
  ok(!/admin\s*\.from\("customer_resource_(versions|slots)"\)/.test(fnUrlCode), "get-customer-resource-url reads resource tables with the service role on the caller's behalf");
  ok(/if \(!row \|\| !row\.eligible\)/.test(fnUrlNc), "the eligible flag from the database no longer gates signing");
  ok(/verify_jwt/i.test(fnUrl) && /not authorization/i.test(fnUrl), "the function header no longer records that verify_jwt is not authorization");
  ok(/if \(!UUID_RE\.test\(adminVersionId\)\)/.test(fnUrlNc) && /asCaller\.rpc\("admin_customer_resource_version_location"/.test(fnUrlNc), "the admin preview arm no longer validates the id and asks the admin-gated RPC — versions could be enumerated");

  // ── 5 · an eligible customer can retrieve the active resource ─────────────
  ok(/'available',\s*\(v\.id is not null\)/.test(fnBody(mig, "customer_resource_entitlements")), "entitlements no longer report availability from the active version");
  ok(/return query select true, true, v_ver\.storage_bucket, v_ver\.storage_path/.test(access), "customer_resource_access no longer returns the active version's location for an eligible customer");
  ok(/openCustomerResource\(key, opts\)/.test(sectionNc) && /downloadCustomerResource\(key, opts\)/.test(sectionNc), "the portal card lost its View / Download actions");
  ok(/View Planner/.test(section) && /View Workbook/.test(section) && /Download PDF/.test(section) && /Available now/.test(section), "the portal card lost its required labels (View Planner / View Workbook / Download PDF / Available now)");
  ok(/createSignedUrl\(path, SIGNED_URL_TTL_SECONDS, wantDownload \? \{ download: safeName \}/.test(fnUrlNc), "downloads no longer set Content-Disposition via the signed URL's download option (iPhone Safari)");

  // ── 6 · existing paid orders use the active version — no order rewrites ───
  ok(!/update public\.orders|insert into public\.orders|alter table public\.orders|delete from public\.orders/.test(mig + mig2 + mig3), "a migration writes to orders — historical orders must never be rewritten");
  ok(/active_version_id\s+uuid/.test(mig) && /on v\.id = s\.active_version_id/.test(fnBody(mig, "customer_resource_entitlements")), "the active version is no longer a single pointer on the slot");
  ok(!/orders\.[a-z_]*planner|planner_version|resource_version_id/.test(mig), "a per-order planner column appeared — the asset must never be duplicated per order");

  // ── 7 · replacing the active version changes the resolved asset ───────────
  const pub = fnBody(mig, "admin_customer_resource_publish");
  ok(/set active_version_id = v_new\.id,/.test(pub), "publish no longer moves the slot's active pointer to the new version");
  ok(/where v\.id = v_slot\.active_version_id and v\.retired_at is null/.test(access), "access no longer resolves the file through the slot's active pointer — an old or superseded version could be served");
  ok(/lock_version = lock_version \+ 1/.test(pub), "publish no longer bumps lock_version — stale concurrent edits could no longer be refused");
  ok(/if v_slot\.lock_version <> p_expected_lock_version then\s*return jsonb_build_object\('ok', false, 'reason', 'stale'/.test(pub), "publish no longer refuses a stale expected_lock_version");
  ok(/if v_new\.retired_at is not null then/.test(pub) && /'storage_object_missing'/.test(pub), "publish no longer refuses a retired version or a version whose storage object is missing");

  // ── 8 · previous versions remain auditable and restorable ─────────────────
  ok(!/delete from public\.customer_resource_versions|drop table[^;]*customer_resource_versions|truncate[^;]*customer_resource_versions/.test(mig + mig2 + mig3), "a migration deletes version rows — history must be append-only");
  ok(!/delete from storage\.objects/.test(mig + mig2 + mig3), "a migration deletes storage objects — cleanup must be a separate deliberate operation");
  ok(/superseded_by_version_id = v_new\.id,/.test(pub) && /superseded_by_version_id = null,/.test(pub), "publish no longer records / clears supersession");
  ok(/v_action := 'rollback'/.test(pub), "publishing an OLDER version is no longer recorded as a rollback");
  ok(/customer_resource_events/.test(mig) && /insert into public\.customer_resource_events/.test(pub), "publish is no longer audited in customer_resource_events");
  ok(/uploaded_by\s+uuid not null/.test(mig) && /v_actor uuid := auth\.uid\(\)/.test(pub), "the responsible admin is no longer recorded");
  ok(/Roll back to this/.test(panelNc), "the admin panel lost its roll-back action");
  ok(!/\.remove\(|\.delete\(\)/.test(codeOnly(read(F.panel))), "the admin panel deletes something — nothing on that screen may delete");

  // ── 9 · disabled / unpublished assets are unavailable ─────────────────────
  const unpub = fnBody(mig, "admin_customer_resource_unpublish");
  ok(/set active_version_id = null,/.test(unpub), "unpublish no longer clears the active pointer");
  ok(/if v_slot\.active_version_id is null then\s*return query select true, false/.test(access), "access no longer reports unavailable when nothing is published");
  ok(/return json\(404, \{ ok: false, code: "unavailable"/.test(fnUrlNc), "the signed-URL function no longer answers 404 unavailable");
  ok(/Temporarily unavailable/.test(section) && /if \(!e\.available\)/.test(sectionNc), "the portal no longer renders an honest unavailable state");
  ok(/Disable \(unpublish\)/.test(panelNc), "the admin panel lost its Disable action");

  // ── 10 · permanent signed URLs are not stored ─────────────────────────────
  const ttl = Number((fnUrlNc.match(/const SIGNED_URL_TTL_SECONDS = (\d+);/) || [])[1]);
  ok(Number.isFinite(ttl) && ttl > 0 && ttl <= 900, `signed URL TTL is ${ttl || "missing"}s — must be a short-lived link (<= 900s)`);
  ok(!/signed_url|signedurl/i.test(mig + mig2 + mig3), "a migration stores a signed URL");
  ok(!/localStorage|sessionStorage|indexedDB/.test(libCode + sectionCode + marketingCode), "the client persists a signed URL in browser storage");
  ok(/"Cache-Control": "no-store"/.test(fnUrlNc), "signed-URL responses are cacheable");
  ok(/requestCustomerResourceUrl\(resourceKey, \{ \.\.\.opts, download: false \}\)/.test(libNc) && /requestCustomerResourceUrl\(resourceKey, \{ \.\.\.opts, download: true \}\)/.test(libNc), "open / download no longer mint a FRESH URL per action");
  ok(/if \(!token\) return \{ ok: false, code: "unauthenticated"/.test(libNc), "the client falls back to the anon key instead of requiring a session");

  // ── 11 · clinical document tables / delivery state are not reused ─────────
  for (const [label, src] of [["migration", mig + mig2 + mig3], ["get-customer-resource-url", fnUrlCode], ["admin-upload-customer-resource", codeOnly(fnUp)], ["customerResources.ts", libCode], ["IncludedResourcesSection", sectionCode], ["PlannerMarketingSection", marketingCode]]) {
    ok(!/order_documents|order_document_versions|doctor_status|patient_notified|signed_letter_url|letter_url|processed_file_url|sent_to_customer|customer_visible|delivered_at|patient_notification_sent_at/.test(src),
      `${label} reads clinical document / delivery state as planner entitlement`);
  }
  ok(!/from "@\/lib\/customerDocuments"|customerDocuments/.test(sectionNc), "the portal section imports the clinical document resolver");
  ok(!/<MyDocumentsCard[\s\S]{0,400}<IncludedResourcesSection|<IncludedResourcesSection[\s\S]{0,400}<MyDocumentsCard/.test(portalNc), "the planner card is mounted inside / next to the clinical documents list");
  ok(/title="Included Resources"/.test(section), "the portal section is no longer a distinct 'Included Resources' section");

  // ── 12 · resource access triggers no customer / provider communications ───
  for (const [label, src] of [["migration", mig + mig2 + mig3], ["get-customer-resource-url", fnUrlCode], ["admin-upload-customer-resource", codeOnly(fnUp)], ["customerResources.ts", libCode], ["IncludedResourcesSection", sectionCode], ["PlannerMarketingSection", marketingCode]]) {
    ok(!/communications|logEmailComm|resend|ghl|sendSms|sms|send-email|email_templates|notify-|twilio|trackEvent/i.test(src.replace(/actor_email|v_actor_email|auth\.email|normalize_email|p_preview_email|previewEmail|v_email|p_email|o\.email|uploaded_by_email/g, "")),
      `${label} reaches a communications path`);
  }
  ok(!/\.from\("(communications|email_templates|sms_[a-z_]+|ai_support_[a-z_]+|company_notifications)"\)/.test(fnUrlNc + fnUpNc + libNc + sectionNc + marketingNc), "planner code writes or reads a communications table");
  ok(!/\.from\("(doctor_earnings|payment_attempts|order_price_quotes|orders|order_documents|order_document_versions)"\)/.test(fnUrlNc + fnUpNc + libNc + sectionNc + marketingNc), "planner code touches orders / earnings / payments / documents tables");
  ok(!/functions\/v1\/(notify|send|ghl|twilio|create-payment|create-checkout)/.test(fnUrlNc + fnUpNc + libNc + sectionNc + marketingNc), "planner code invokes a notification or payment function");

  // ── 13 · resource access creates no earnings / payment mutations ──────────
  for (const [label, src] of [["migration", mig + mig2 + mig3], ["get-customer-resource-url", fnUrlCode], ["admin-upload-customer-resource", codeOnly(fnUp)], ["customerResources.ts", libCode], ["IncludedResourcesSection", sectionCode], ["PlannerMarketingSection", marketingCode]]) {
    ok(!/doctor_earnings|payment_attempts|stripe|refund_status\s*=|payment_intent_id\s*=|paid_at\s*=/i.test(src), `${label} touches earnings or payment state`);
  }
  ok(!/update public\.(orders|doctor_earnings|order_documents|order_status_logs)/.test(mig + mig2 + mig3), "a migration mutates orders / earnings / documents");
  ok(!/\.from\("orders"\)|\.from\("doctor_earnings"\)|\.from\("order_documents"\)/.test(fnUrlCode + codeOnly(fnUp)), "an edge function reads or writes orders / earnings / documents directly");

  // ── 14 · checkout copy is product-aware (executed) ────────────────────────
  ok((step3Nc.match(/text: "Free Pet Care Planner"/g) || []).length === 2, "the ESA checkout 'What's Included' no longer lists the free planner on BOTH its desktop and mobile copies");
  ok(!/workbook/i.test(step3Nc), "the ESA checkout advertises the PSD workbook");
  ok((psdStep3Nc.match(/text: "Free PSD Training Workbook"/g) || []).length === 2, "the PSD checkout 'What's Included' no longer lists the PSD workbook on BOTH its desktop and mobile copies");
  ok(!/Pet Care Planner/.test(psdStep3Nc), "the PSD checkout advertises the ESA Pet Care Planner");
  ok((pkgNc.match(/bonus: plannerBenefitFor\("esa"\)/g) || []).length === 2, "the ESA package cards no longer resolve their bonus through plannerBenefitFor(\"esa\")");
  ok((pkgNc.match(/bonus: plannerBenefitFor\("psd"\)/g) || []).length === 2, "the PSD package cards no longer resolve their bonus through plannerBenefitFor(\"psd\") (service-aware)");
  ok(/\{c\.bonus && \(/.test(pkgNc), "the package card no longer renders the bonus conditionally");

  const require_ = createRequire(import.meta.url);
  let jitiMod = null;
  try { jitiMod = require_("jiti"); } catch (e) { fails.push(`jiti unavailable: ${e.message}`); }
  let M = null;
  if (jitiMod) {
    const jiti = (jitiMod.createJiti ?? jitiMod.default ?? jitiMod)(fileURLToPath(import.meta.url), { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
    try {
      const b = await jiti.import(F.benefit);
      M = b;
      ok(typeof b.plannerBenefitFor("esa") === "string" && /Pet Care Planner/.test(b.plannerBenefitFor("esa")) && !/PSD|Workbook/i.test(b.plannerBenefitFor("esa")), "plannerBenefitFor(\"esa\") no longer names ONLY the Pet Care Planner");
      ok(typeof b.plannerBenefitFor("psd") === "string" && /PSD Training Workbook/.test(b.plannerBenefitFor("psd")) && !/Pet Care Planner/.test(b.plannerBenefitFor("psd")), "plannerBenefitFor(\"psd\") no longer names ONLY the PSD Training Workbook (a published asset)");
      ok(b.PSD_PLANNER_PUBLISHED === true, "PSD_PLANNER_PUBLISHED is false while the PSD workbook is a published, advertised asset");
      ok(/veterinary or medical advice/.test(b.PLANNER_DISCLAIMER), "the planner disclaimer no longer disclaims veterinary / medical advice");
      ok(/does not certify a service dog/.test(b.PSD_WORKBOOK_DISCLAIMER) && /does not create legal rights/.test(b.PSD_WORKBOOK_DISCLAIMER) && /public access or airline acceptance/.test(b.PSD_WORKBOOK_DISCLAIMER) && /professional training, veterinary care, medical advice, or legal advice/.test(b.PSD_WORKBOOK_DISCLAIMER), "the PSD workbook disclaimer lost a required scope statement (certify / legal rights / public access or airline / professional training, veterinary, medical, legal advice)");
      const cards = await jiti.import(F.cards);
      const esaBlob = JSON.stringify(cards.buildEsaPlanCards());
      const psdBlob = JSON.stringify(cards.buildPsdPlanCards());
      ok(cards.buildEsaPlanCards().every((c) => c.features.some((f) => /Pet Care Planner/.test(f))), "not every ESA plan card lists the free planner");
      ok(!/Workbook|PSD/i.test(esaBlob), "the shared ESA plan cards mention the PSD workbook");
      ok(cards.buildPsdPlanCards().every((c) => c.features.some((f) => /PSD Training Workbook/.test(f))), "not every PSD plan card lists the PSD workbook");
      ok(!/Pet Care Planner|animal/i.test(psdBlob), "the shared PSD plan cards advertise the ESA Pet Care Planner");
      // ── 15 · marketing content is service-specific, honest and never a promise to every visitor
      for (const fam of ["esa", "psd"]) {
        const c = b.PLANNER_MARKETING[fam];
        const blob = JSON.stringify(c);
        ok(c && c.family === fam, `PLANNER_MARKETING.${fam} is missing or mislabelled`);
        ok(/^Eligible /.test(c.intro), `PLANNER_MARKETING.${fam}.intro no longer opens with "Eligible … customers receive" — copy must never promise the resource to every visitor`);
        ok(!/every (visitor|customer|order)|everyone (gets|receives)|all (visitors|customers) (get|receive)|free for everyone/i.test(blob), `PLANNER_MARKETING.${fam} promises the resource to every visitor`);
        ok(c.benefits.length >= 4 && c.previews.length === 3, `PLANNER_MARKETING.${fam} lost its benefits or its three previews`);
        for (const p of c.previews) {
          ok(typeof p.alt === "string" && p.alt.length >= 25, `PLANNER_MARKETING.${fam} preview ${p.src} has no descriptive alt text`);
          ok(Number.isInteger(p.width) && Number.isInteger(p.height) && p.width > 0 && p.height > 0, `PLANNER_MARKETING.${fam} preview ${p.src} has no intrinsic dimensions (layout shift)`);
        }
        ok(!/\.pdf\b/i.test(blob), `PLANNER_MARKETING.${fam} carries a PDF URL`);
      }
      const esa = b.PLANNER_MARKETING.esa, psd = b.PLANNER_MARKETING.psd;
      ok(esa.previews.every((p) => /^\/assets\/planner\/pet-care-planner-/.test(p.src)) && /Pet Care Planner|pet/i.test(esa.heading + esa.intro) && !/PSD|workbook|service dog/i.test(JSON.stringify(esa)), "the ESA marketing content references the PSD workbook or PSD imagery (assets swapped)");
      ok(psd.previews.every((p) => /^\/assets\/planner\/psd-workbook-/.test(p.src)), "the PSD marketing content shows Pet Care Planner artwork as PSD workbook pages (assets swapped)");
      ok(/workbook/i.test(psd.heading + psd.intro) && !/Pet Care Planner/.test(JSON.stringify(psd)), "the PSD marketing content advertises the ESA Pet Care Planner");
      ok(/veterinary or medical advice/.test(esa.disclaimer), "the ESA marketing disclaimer was removed or weakened");
      ok(/does not certify a service dog/.test(psd.disclaimer) && psd.scopeNotes.some((n) => /Does not certify/.test(n)) && psd.scopeNotes.some((n) => /legal rights/.test(n)) && psd.scopeNotes.some((n) => /public access or airline/.test(n)), "the PSD marketing disclaimer / scope notes were removed or weakened");
      ok(!/(get|become|earn|receive|obtain|official|issue[sd]?|provides?)\s+(a |an |your )?(service[- ]dog )?certif|certif(y|ies|ied) your (service )?dog|registration|registered service dog|guarantee[sd]? (public )?access|legal(ly)? recogni[sz]e/i.test(JSON.stringify(psd).replace(/does not certify a service dog|Does not certify a service dog|does not guarantee public access|Does not guarantee public access/g, "")), "the PSD workbook is advertised as certification, registration, guaranteed access or legal recognition");
      ok(esa.ctaHref === "/assessment" && psd.ctaHref === "/psd-assessment", "a marketing CTA no longer points at its own family's assessment");
      ok(esa.anchorId === "pet-care-planner" && psd.anchorId === "psd-training-workbook", "the canonical preview anchors changed — package-card links would break");
      ok(b.PLANNER_HERO_IMAGES.collage.src.includes("pet-care-planner-collage") && b.PLANNER_HERO_IMAGES.cover.src.includes("pet-care-planner-cover-page") && b.PLANNER_HERO_IMAGES.collage.alt.length > 25 && b.PLANNER_HERO_IMAGES.cover.alt.length > 25 && b.PLANNER_HERO_IMAGES.collage.width === 1536 && b.PLANNER_HERO_IMAGES.cover.height === 1536, "the supplied Pet Care Planner artwork lost its alt text or intrinsic dimensions");
      // ── 16 · prices unchanged (executed) ──────────────────────────────────
      const pricing = await jiti.import(F.pricing);
      ok(pricing.getEsaOneTimeTotal(1) === 129 && pricing.getEsaOneTimeTotal(3) === 149, "ESA one-time totals changed (expected 129 / 149)");
      ok(pricing.getEsaAnnualTotal(1) === 115 && pricing.getEsaRenewalTotal(1) === 100, "ESA annual / renewal totals changed (expected 115 / 100)");
      ok(pricing.getPsdOneTimeTotal(1) === 129 && pricing.getPsdOneTimeTotal(3) === 149, "PSD one-time totals changed (expected 129 / 149)");
      ok(cards.buildEsaPlanCards().map((c) => c.price).join(",") === "129,115,149", "ESA card prices changed");
      ok(cards.buildPsdPlanCards().map((c) => c.price).join(",") === "129,115,149", "PSD card prices changed");
    } catch (e) {
      fails.push(`executing presentation modules failed: ${e.message}`);
    }
  }

  // ── 15 (cont.) · every surface names only its own family's resource ───────
  const esaSurfaces = [["EsaPricingMini", F.mini], ["/esa-letter-cost", F.cost], ["/esa-letter-for-apartments", F.apartments], ["/how-to-get-esa-letter", F.howEsa], ["homepage", F.home]];
  const psdSurfaces = [["PsdPricingMini", F.psdMini], ["/psd-letter-cost", F.psdCost], ["/how-to-get-psd-letter", F.psdHow], ["state PSD template", F.psdState]];
  for (const [label, p] of esaSurfaces) {
    if (!existsSync(p)) continue;
    const src = noComments(read(p));
    ok(!/workbook|PSD Training/i.test(src.replace(/PlannerMarketingSection/g, "")), `${label} mentions the PSD workbook — an ESA surface names only the Pet Care Planner`);
    ok(!/family="psd"/.test(src), `${label} mounts the PSD marketing section`);
  }
  for (const [label, p] of psdSurfaces) {
    const src = noComments(read(p));
    ok(!/Pet Care Planner/.test(src), `${label} advertises the ESA Pet Care Planner`);
    ok(!/family="esa"/.test(src), `${label} mounts the ESA marketing section`);
  }
  ok(/Free PSD Training Workbook/.test(noComments(read(F.psdMini))), "PsdPricingMini no longer lists the PSD workbook");
  ok(/PSD_PLANNER_BENEFIT_LINE/.test(noComments(read(F.psdCost))) && /PSD_PLANNER_INCLUDED_LINE/.test(noComments(read(F.psdCost))), "/psd-letter-cost no longer lists the PSD workbook in its package and inclusion lists");
  // The housing LP carries BOTH cards: each names only its own resource.
  const psdCardStart = lpNc.indexOf("PSD Letter — one-time");
  const psdCardEnd = lpNc.indexOf("</Link>", psdCardStart);
  ok(psdCardStart > 0 && psdCardEnd > psdCardStart, "could not locate the PSD card on the ESA housing LP");
  const psdCard = lpNc.slice(psdCardStart, psdCardEnd);
  ok(/PSD_PLANNER_BENEFIT_SHORT/.test(psdCard) && /PSD_WORKBOOK_PREVIEW_HREF/.test(psdCard) && !/ESA_PLANNER_BENEFIT_SHORT|Pet Care Planner/.test(psdCard), "the ESA housing LP's PSD card no longer lists ONLY the PSD workbook");
  const esaCardStart = lpNc.indexOf("<PriceFeat>Reviewed by a Licensed Mental Health Practitioner in your state");
  ok(esaCardStart > 0 && esaCardStart < psdCardStart, "could not locate the ESA card on the ESA housing LP");
  const esaCard = lpNc.slice(esaCardStart, psdCardStart);
  ok(/ESA_PLANNER_BENEFIT_SHORT/.test(esaCard) && /<Link to=\{PLANNER_PREVIEW_HREF\}/.test(esaCard) && !/PSD_PLANNER_BENEFIT_SHORT/.test(esaCard), "the ESA housing LP's ESA card no longer lists ONLY the free planner with its preview link");

  // ── 16 (cont.) · Stripe / charge paths untouched by planner modules ───────
  for (const [label, p] of [["create-payment-intent", F.cpi], ["create-checkout-session", F.ccs], ["_shared/pricingMatrix", F.matrix], ["config/pricing", F.pricing]]) {
    ok(!/planner|customer_resource|workbook/i.test(codeOnly(read(p))), `${label} mentions the planner — charge paths must stay planner-free`);
  }
  for (const [label, src] of [["customerResources.ts", libNc], ["IncludedResourcesSection", sectionNc], ["plannerBenefit", benefitNc], ["PlannerMarketingSection", marketingNc]]) {
    ok(!/config\/pricing|stripe|price_id|priceId|amount_cents/i.test(src), `${label} reaches pricing / Stripe — the resources must never create a charge`);
  }
  ok(!/add-?on|line_item|lineItem|coupon|subscription/i.test(libCode + sectionCode + marketingCode + codeOnly(fnUrl) + codeOnly(fnUp)), "planner code references an add-on / line item / coupon / subscription");
  ok(!/\$\d|price|\bbuy\b|purchase/i.test(JSON.stringify(M?.PLANNER_MARKETING ?? {})), "the marketing copy invents a planner price or a standalone purchase");

  // ── 17 · public bundle carries no private credentials, paths or PDF URLs ──
  for (const [label, src] of [["customerResources.ts", lib], ["IncludedResourcesSection", section], ["CustomerResourcesPanel", read(F.panel)], ["plannerBenefit", benefit], ["PlannerMarketingSection", marketing]]) {
    ok(!/SERVICE_ROLE|service_role|eyJ[A-Za-z0-9_-]{30,}/.test(src), `${label} carries a service-role reference or an embedded JWT`);
  }
  ok(!/storage_path|storage_bucket|createSignedUrl/.test(libCode + sectionCode + marketingCode), "the customer client references storage paths or signs URLs itself");
  const entBody = fnBody(mig, "customer_resource_entitlements");
  ok(!/'storage_path'|'storage_bucket'|'sha256'/.test(entBody), "customer_resource_entitlements exposes storage paths / hashes to customers");
  ok(/'thumbnail_bucket'/.test(entBody), "entitlements no longer carry the public thumbnail reference");
  ok(/error: "Could not load your included resources"/.test(libNc) && !/error\.message|stack/.test(libCode), "the client surfaces raw server errors / stacks");
  ok(/\.pdf\$'\)/.test(mig) && /customer_resource_versions_path_chk/.test(mig), "storage paths are no longer constrained to safe generated names");
  ok(/const pdfPath = `\$\{resourceKey\}\/\$\{stamp\}-\$\{sha8\}\.pdf`;/.test(fnUpNc), "uploads no longer use a generated safe object path");
  // No public page, component or data module may carry a direct PDF URL or a
  // storage object path — the PDFs are private and reached only via the portal.
  const publicSrc = walk(join(ROOT, "src")).filter((p) => /\.(tsx?|mjs|js)$/.test(p) && !/admin-orders|provider-portal|admin-|OrderDetailModal/.test(p.replace(/\\/g, "/")));
  for (const p of publicSrc) {
    const src = noComments(read(p));
    if (/customer-resources\/|storage\/v1\/object\/(sign|public)\/customer-resources|assets\/planner\/[^"'`\s]*\.pdf|\/planner[^"'`\s]*\.pdf/i.test(src)) {
      fails.push(`${relative(ROOT, p)} carries a direct planner PDF URL / private storage path`);
    }
  }

  // ── 18 · marketing previews are optimized and never expose the full PDF ───
  const imgs = existsSync(F.imgDir) ? readdirSync(F.imgDir) : [];
  const originals = imgs.filter((f) => /\.jpg$/.test(f) && !/-\d+\.jpg$/.test(f));
  const EXPECTED = {
    "pet-care-planner-cover.jpg": { widths: [240, 480, 720], maxKB: 160, maxW: 720 },
    "pet-care-planner-daily-checklist.jpg": { widths: [240, 480, 720], maxKB: 160, maxW: 720 },
    "pet-care-planner-calendar.jpg": { widths: [240, 480, 720], maxKB: 160, maxW: 720 },
    "psd-workbook-cover.jpg": { widths: [240, 480, 720], maxKB: 160, maxW: 720 },
    "psd-workbook-public-access.jpg": { widths: [240, 480, 720], maxKB: 160, maxW: 720 },
    "psd-workbook-milestones.jpg": { widths: [240, 480, 720], maxKB: 160, maxW: 720 },
    "pet-care-planner-collage.jpg": { widths: [640, 960, 1280, 1536], maxKB: 400, maxW: 1536 },
    "pet-care-planner-cover-page.jpg": { widths: [360, 540, 720, 1024], maxKB: 340, maxW: 1024 },
  };
  ok(originals.length === Object.keys(EXPECTED).length && Object.keys(EXPECTED).every((f) => originals.includes(f)), `expected exactly ${Object.keys(EXPECTED).length} planner originals, found: ${originals.join(", ")}`);
  ok(!imgs.some((f) => /\.pdf$/i.test(f)), "a PDF sits in the public planner asset directory");
  let publicPdfs = [];
  try { publicPdfs = walk(join(ROOT, "public")).filter((p) => /(planner|workbook).*\.pdf$/i.test(p)); } catch { /* ignore */ }
  ok(publicPdfs.length === 0, `a planner PDF is publicly exposed: ${publicPdfs.map((p) => relative(ROOT, p)).join(", ")}`);
  const manifest = read(F.manifest);
  for (const [f, exp] of Object.entries(EXPECTED)) {
    if (!imgs.includes(f)) continue;
    const size = statSync(join(F.imgDir, f)).size;
    ok(size <= exp.maxKB * 1024, `${f} is ${Math.round(size / 1024)} KB — must stay compact (<= ${exp.maxKB} KB)`);
    const stem = f.replace(/\.jpg$/, "");
    for (const w of exp.widths) for (const ext of ["avif", "webp"]) ok(imgs.includes(`${stem}-${w}.${ext}`), `missing responsive variant ${stem}-${w}.${ext}`);
    ok(new RegExp(`"/assets/planner/${stem}\\.jpg": \\[${exp.widths.join(", ")}\\]`).test(manifest), `${f} is missing from the responsive-image manifest`);
    const buf = readFileSync(join(F.imgDir, f));
    let i = 2, width = 0;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc2) { width = buf.readUInt16BE(i + 7); break; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    ok(width > 0 && width <= exp.maxW, `${f} width is ${width}px — must be downscaled (<= ${exp.maxW}px)`);
  }
  ok(existsSync(join(ROOT, "design-sources/planner/collage.png")) && existsSync(join(ROOT, "design-sources/planner/cover-page.png")), "the supplied original PNG artwork is no longer preserved under design-sources/planner/");

  // ── wiring · ONE shared marketing section, mounted per family, sized, lazy ─
  ok(/PLANNER_MARKETING\[family\]/.test(marketingNc) && /data-planner-marketing=\{family\}/.test(marketingNc), "PlannerMarketingSection no longer renders from PLANNER_MARKETING[family]");
  ok(/<ResponsiveImage[\s\S]{0,200}?width=\{p\.width\}\s+height=\{p\.height\}/.test(marketingNc) && /alt=\{p\.alt\}/.test(marketingNc), "preview images no longer pass alt + width/height (layout shift / accessibility)");
  ok(/width=\{collage\.width\}\s+height=\{collage\.height\}/.test(marketingNc) && /alt=\{collage\.alt\}/.test(marketingNc) && /loading="lazy"/.test(marketingNc), "the ESA hero image lost its alt / dimensions / lazy loading");
  ok(/<source media="\(max-width: 639px\)"[^>]*srcSet=\{coverAvif\}/.test(marketingNc) && /srcSet=\{collageAvif\}/.test(marketingNc), "the ESA hero is no longer art-directed (portrait cover on phones, collage from sm up)");
  ok(/\{content\.disclaimer\}/.test(marketingNc) && /\{content\.intro\}/.test(marketingNc) && /content\.scopeNotes\.map/.test(marketingNc), "the marketing section no longer renders the disclaimer / intro / scope notes");
  ok(!/priority/.test(marketingNc), "a marketing image is marked as LCP priority");
  ok(/signedIn \?/.test(marketingNc) && /to="\/my-orders"/.test(marketingNc) && /to="\/customer-login"/.test(marketingNc) && /withAttribution\(content\.ctaHref\)/.test(marketingNc), "the CTA is no longer context-aware (assessment / sign in / My Orders)");
  ok(!/PLANNER_MARKETING\[/.test(walk(join(ROOT, "src")).filter((p) => /\.tsx?$/.test(p) && !p.endsWith("PlannerMarketingSection.tsx") && !p.endsWith("plannerBenefit.ts")).map((p) => noComments(read(p))).join("\n")), "a page renders PLANNER_MARKETING itself instead of the ONE shared section (drifting duplicate)");
  ok(!existsSync(join(ROOT, "src/components/feature/PlannerPreviewSection.tsx")), "the retired page-local PlannerPreviewSection still exists — one implementation only");
  const mounts = [
    ["homepage", F.home, "esa"], ["/esa-letter-cost", F.cost, "esa"], ["/esa-letter-housing (Google Ads LP)", F.lp, "esa"], ["/esa-letter-for-apartments", F.apartments, "esa"], ["/how-to-get-esa-letter", F.howEsa, "esa"],
    ["/psd-letter-cost", F.psdCost, "psd"], ["/how-to-get-psd-letter", F.psdHow, "psd"],
  ];
  for (const [label, p, fam] of mounts) {
    if (!existsSync(p)) continue;
    const src = noComments(read(p));
    const n = (src.match(/<PlannerMarketingSection\b/g) || []).length;
    ok(n === 1, `${label} mounts the planner marketing section ${n} times (expected exactly one)`);
    ok(new RegExp(`<PlannerMarketingSection\\s+family="${fam}"`).test(src), `${label} does not mount the ${fam.toUpperCase()} marketing section`);
    ok(/import PlannerMarketingSection from "@\/components\/feature\/PlannerMarketingSection";/.test(src), `${label} does not import the shared PlannerMarketingSection`);
  }
  ok(/<PlannerMarketingSection family="esa" \/>/.test(noComments(read(F.cost))), "/esa-letter-cost no longer hosts the canonical ESA preview anchor (default id)");
  ok(/<PlannerMarketingSection family="psd" \/>/.test(noComments(read(F.psdCost))), "/psd-letter-cost no longer hosts the canonical PSD preview anchor (default id)");
  for (const [label, p] of [["admin orders page", join(ROOT, "src/pages/admin-orders/page.tsx")], ["provider portal", join(ROOT, "src/pages/provider-portal/page.tsx")], ["customer login", join(ROOT, "src/pages/customer-login/page.tsx")]]) {
    if (existsSync(p)) ok(!/PlannerMarketingSection/.test(read(p)), `${label} mounts planner marketing — not on administrative / provider / transactional pages`);
  }

  // ── wiring · the owner-managed workflow is mounted and admin-gated ────────
  ok(/<IncludedResourcesSection\s+orders=\{orders\}\s+isAdminPreview=\{isAdminPreview\}/.test(portalNc.replace(/\s+/g, " ")), "the Customer Portal no longer mounts IncludedResourcesSection");
  ok((portalNc.match(/<IncludedResourcesSection/g) || []).length === 1, "IncludedResourcesSection is mounted more than once (duplicate planner cards)");
  ok(/rows\.map\(\(\{ family, entitlement, locked \}/.test(sectionNc) && /\.filter\(\(r\) => r\.entitlement \|\| r\.locked\)/.test(sectionNc), "the portal no longer renders one row per entitled family (duplicates / placeholders)");
  ok(/<CustomerResourcesPanel \/>/.test(settingsNc) && /title="Customer Resources → Planners"/.test(settingsNc), "Admin Settings no longer mounts the Customer Resources → Planners panel");
  ok(/asCaller\.rpc\("is_admin_staff"\)/.test(fnUpNc) && /isStaff !== true\) \{\s*await drain\(req\);\s*return json\(403/.test(fnUpNc), "admin-upload-customer-resource no longer requires is_admin_staff() via the caller's JWT (and drains the body before the 403)");
  ok(/declaredLength > MAX_PDF_BYTES \+ MAX_THUMB_BYTES/.test(fnUpNc), "the upload no longer refuses an oversized body from Content-Length before buffering it");
  ok(/if \(!bearer \|\| bearer === serviceKey \|\| bearer === anonKey\)/.test(fnUpNc), "admin-upload-customer-resource accepts the service-role / anon key as a bearer");
  ok(/findAscii\(bytes, "%PDF-", 0, 1024\) !== 0/.test(fnUpNc), "the upload no longer verifies the genuine %PDF- signature");
  ok(/findAscii\(bytes, "%%EOF"/.test(fnUpNc), "the upload no longer rejects a truncated PDF");
  ok(/PDFDocument\.load\(bytes/.test(fnUpNc) && /doc\.isEncrypted/.test(fnUpNc), "the upload no longer parses the PDF / rejects encrypted files");
  ok(/if \(findings\.length\) \{/.test(fnUpNc) && /"JavaScript", "JS", "OpenAction", "AA", "Launch", "EmbeddedFiles"/.test(fnUpNc), "the upload no longer rejects PDFs with active or embedded content");
  ok(/const MAX_PDF_BYTES = 25 \* 1024 \* 1024;/.test(fnUpNc) && /file\.size === 0\) return json\(422/.test(fnUpNc), "the upload lost its size limits");
  ok(/await sha256Hex\(bytes\)/.test(fnUpNc) && /p_sha256: sha256/.test(fnUpNc), "the upload no longer records the SHA-256");
  ok(/asCaller\.rpc\("admin_customer_resource_register_version"/.test(fnUpNc), "the upload no longer registers the version with the admin's own JWT");
  ok(/not exists \(select 1 from storage\.objects so/.test(fnBody(mig, "admin_customer_resource_register_version")), "register_version no longer verifies the uploaded object exists");
  const secDef = (mig.match(/security definer/g) || []).length;
  const fnCount = (mig.match(/create or replace function public\./g) || []).length;
  ok(secDef === fnCount && fnCount >= 11, `every function must be SECURITY DEFINER (${secDef}/${fnCount})`);
  ok((mig.match(/set search_path = public, pg_temp/g) || []).length === fnCount, "a function is missing its pinned search_path");
  ok((mig.match(/revoke all on function public\.[a-z_]+\([^)]*\) from public, anon, authenticated;/g) || []).length === fnCount, "a function is not revoked from public, anon AND authenticated by name");
  ok(!/grant execute on function[^;]*to[^;]*\banon\b/.test(mig), "a function is granted to anon");
  for (const t of ["slots", "versions", "events"]) {
    ok(new RegExp(`revoke all on public\\.customer_resource_${t}\\s+from public, anon, authenticated;`).test(mig), `customer_resource_${t} is not revoked from anon/authenticated by name`);
    ok(new RegExp(`alter table public\\.customer_resource_${t}\\s+enable row level security;`).test(mig), `customer_resource_${t} has RLS disabled`);
  }
  ok(/values \('customer-resources', 'customer-resources', false,/.test(mig), "the master-PDF bucket is no longer private");
  ok(!/create policy[^;]*'customer-resources'[^;]*;/.test(mig), "a storage policy grants direct access to the private customer-resources bucket");
  ok(/if not public\.is_admin_staff\(\) then/.test(pub) && /if not public\.is_admin_staff\(\) then/.test(unpub) && /if not public\.is_admin_staff\(\) then/.test(fnBody(mig, "admin_customer_resources_overview")), "an admin RPC is no longer gated by is_admin_staff()");

  return fails;
}

// ── Self-test: planted negative controls, byte-identical restore ────────────
if (process.argv.includes("--self-test")) {
  const original = Object.fromEntries(Object.entries(F).filter(([k, p]) => k !== "imgDir" && existsSync(p)).map(([k, p]) => [k, readFileSync(p)]));
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const baseHash = Object.fromEntries(Object.entries(original).map(([k, b]) => [k, sha(b)]));

  const patch = (key, find, replace, all = false) => {
    if (!original[key]) return false;
    const text = original[key].toString("utf8");
    const crlf = text.includes("\r\n");
    const from = crlf ? find.replace(/\n/g, "\r\n") : find;
    const to = crlf ? replace.replace(/\n/g, "\r\n") : replace;
    if (!text.includes(from)) return false;
    writeFileSync(F[key], all ? text.split(from).join(to) : text.replace(from, to));
    return true;
  };
  const runChild = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" }).status;
  const restore = () => { for (const [k, b] of Object.entries(original)) writeFileSync(F[k], b); };

  const CONTROLS = [
    { name: "N1  ESA and PSD collapse into one resource identifier", file: "mig",
      find: "check (resource_key in ('esa_planner', 'psd_planner'))", replace: "check (resource_key in ('esa_planner'))" },
    { name: "N2  eligibility stops matching the order's family to the slot's family (ESA planner for a PSD order)", file: "mig",
      find: "         ) = p_family;", replace: "         ) is not null;" },
    { name: "N3  a lead (unpaid) order is no longer excluded", file: "mig",
      find: "not in ('lead', 'cancelled', 'archived', 'refunded', 'disputed')", replace: "not in ('cancelled', 'archived', 'refunded', 'disputed')" },
    { name: "N4  an unpaid payment state is accepted (ineligible user receives a URL)", file: "mig",
      find: "public.order_payment_state(o) in ('paid', 'partially_refunded')", replace: "public.order_payment_state(o) in ('paid', 'partially_refunded', 'unpaid')" },
    { name: "N5  any authenticated user passes ownership", file: "mig",
      find: "(p_uid is not null and o.user_id = p_uid)", replace: "(p_uid is not null)" },
    { name: "N6  the signed URL becomes a ten-year link", file: "fnUrl",
      find: "const SIGNED_URL_TTL_SECONDS = 300;", replace: "const SIGNED_URL_TTL_SECONDS = 315360000;" },
    { name: "N7  the service-role key is accepted as a bearer", file: "fnUrl",
      find: "if (!bearer || bearer === serviceKey || bearer === anonKey) {", replace: "if (!bearer) {" },
    { name: "N8  publishing no longer moves the active pointer (replacement changes nothing)", file: "mig",
      find: "     set active_version_id = v_new.id,", replace: "     set active_version_id = active_version_id," },
    { name: "N9  disabling no longer clears the active pointer", file: "mig",
      find: "     set active_version_id = null,", replace: "     set active_version_id = active_version_id," },
    { name: "N10 publishing deletes the previous version row", file: "mig",
      find: "  -- A version being (re)published is current again: clear its supersession.",
      replace: "  delete from public.customer_resource_versions where id = v_old.id;\n  -- A version being (re)published is current again: clear its supersession." },
    { name: "N11 entitlements leak the storage path to customers", file: "mig",
      find: "           'thumbnail_path',  v.thumbnail_path,", replace: "           'thumbnail_path',  v.thumbnail_path,\n           'storage_path',    v.storage_path," },
    { name: "N12 the portal card keys on clinical delivery state", file: "section",
      find: "  const hasAnyOrder = hasOrder(\"esa\") || hasOrder(\"psd\");", replace: "  const hasAnyOrder = (hasOrder(\"esa\") || hasOrder(\"psd\")) && orders.some((o) => (o as { doctor_status?: string | null }).doctor_status === \"patient_notified\");" },
    { name: "N13 opening a resource logs a communication", file: "fnUrl",
      find: "  const safeName = safeDownloadFilename(", replace: "  await admin.from(\"communications\").insert({ type: \"email\" });\n  const safeName = safeDownloadFilename(" },
    { name: "N14 opening a resource creates a provider earning", file: "fnUrl",
      find: "  const safeName = safeDownloadFilename(", replace: "  await admin.from(\"doctor_earnings\").insert({});\n  const safeName = safeDownloadFilename(" },
    { name: "N15 the ESA checkout drops the planner from one of its two copies", file: "step3",
      find: "                    { icon: \"ri-book-open-line\", text: \"Free Pet Care Planner\" },\n", replace: "" },
    { name: "N16 the PSD checkout advertises the ESA Pet Care Planner", file: "psdStep3",
      find: "{ icon: \"ri-book-open-line\", text: \"Free PSD Training Workbook\" },", replace: "{ icon: \"ri-book-open-line\", text: \"Free Pet Care Planner\" }," },
    { name: "N17 plannerBenefitFor(\"psd\") promises the ESA planner (assets swapped in copy)", file: "benefit",
      find: "  return PSD_PLANNER_PUBLISHED ? PSD_PLANNER_BENEFIT_LINE : null;", replace: "  return ESA_PLANNER_BENEFIT_LINE;" },
    { name: "N18 the shared PSD plan cards advertise the ESA planner", file: "cards",
      find: "        PSD_PLANNER_BENEFIT_LINE,\n      ],\n      ctaLabel: \"Start Your Evaluation\"", replace: "        ESA_PLANNER_BENEFIT_LINE,\n      ],\n      ctaLabel: \"Start Your Evaluation\"" },
    { name: "N19 the upload stops checking the %PDF- signature", file: "fnUp",
      find: "if (findAscii(bytes, \"%PDF-\", 0, 1024) !== 0) {", replace: "if (false) {" },
    { name: "N20 the upload stops rejecting active content", file: "fnUp",
      find: "  if (findings.length) {", replace: "  if (false && findings.length) {" },
    { name: "N21 the client persists the signed URL", file: "lib",
      find: "  if (result.ok && result.signedUrl) {\n    if (win) win.location.href = result.signedUrl;",
      replace: "  if (result.ok && result.signedUrl) {\n    localStorage.setItem(\"plannerUrl\", result.signedUrl);\n    if (win) win.location.href = result.signedUrl;" },
    { name: "N22 anon is granted the access RPC", file: "mig",
      find: "grant execute on function public.customer_resource_access(text, text) to authenticated, service_role;",
      replace: "grant execute on function public.customer_resource_access(text, text) to anon, authenticated, service_role;" },
    { name: "N23 the portal no longer mounts the Included Resources section", file: "portal",
      find: "            <IncludedResourcesSection\n              orders={orders}\n              isAdminPreview={isAdminPreview}\n              previewEmail={isAdminPreview ? (searchEmail.trim() || null) : null}\n            />\n", replace: "" },
    { name: "N24 the marketing section drops the disclaimer", file: "marketing",
      find: "            <p className=\"text-[11px] text-gray-400 mt-3 leading-relaxed max-w-lg\">{content.disclaimer}</p>\n", replace: "" },
    { name: "N25 the ESA housing LP puts the ESA planner line into the PSD card", file: "lp",
      find: "                  <Link to={PSD_WORKBOOK_PREVIEW_HREF} className=\"underline decoration-amber-300 underline-offset-2 hover:text-amber-800\">{PSD_PLANNER_BENEFIT_SHORT}</Link>",
      replace: "                  <Link to={PLANNER_PREVIEW_HREF} className=\"underline decoration-amber-300 underline-offset-2 hover:text-amber-800\">{ESA_PLANNER_BENEFIT_SHORT}</Link>" },
    { name: "N26 publish stops refusing a stale lock_version", file: "mig",
      find: "  if v_slot.lock_version <> p_expected_lock_version then\n    return jsonb_build_object('ok', false, 'reason', 'stale',\n                              'current_lock_version', v_slot.lock_version);\n  end if;\n\n  select * into v_new",
      replace: "  select * into v_new" },
    { name: "N27 the upload endpoint no longer requires admin staff", file: "fnUp",
      find: "  if (staffErr || isStaff !== true) {\n    await drain(req);\n    return json(403, { ok: false, code: \"forbidden\", error: \"Admin staff only\" });\n  }", replace: "" },
    { name: "N28 the migration rewrites historical orders", file: "mig",
      find: "-- 7. Self-check", replace: "update public.orders set package_display_name = package_display_name where false;\n-- 7. Self-check" },
    { name: "N29 ESA and PSD assets swapped in the portal card map", file: "section",
      find: "  esa: {\n    key: \"esa_planner\",", replace: "  esa: {\n    key: \"psd_planner\"," },
    { name: "N30 the PSD marketing shows Pet Care Planner artwork as workbook pages", file: "benefit",
      find: "        src: \"/assets/planner/psd-workbook-cover.jpg\",", replace: "        src: \"/assets/planner/pet-care-planner-cover.jpg\"," },
    { name: "N31 a public page carries a direct PDF URL", file: "marketing",
      find: "            <p className=\"text-[12px] text-gray-500 mt-3 leading-relaxed max-w-md\">{content.portalHint}</p>",
      replace: "            <a href=\"/assets/planner/pet-care-planner.pdf\">Download the PDF</a>\n            <p className=\"text-[12px] text-gray-500 mt-3 leading-relaxed max-w-md\">{content.portalHint}</p>" },
    { name: "N32 the PSD workbook is advertised as certification", file: "benefit",
      find: "    heading: \"Plan and document your service-dog training\",", replace: "    heading: \"Get your service dog certified with our workbook\"," },
    { name: "N33 the PSD scope disclaimer is weakened", file: "benefit",
      find: "  \"An educational planning and recordkeeping resource. It does not certify a service dog, does not create legal rights,",
      replace: "  \"An educational planning and recordkeeping resource. It does not create legal rights," },
    { name: "N34 an old superseded version is served instead of the active pointer", file: "mig",
      find: "   where v.id = v_slot.active_version_id and v.retired_at is null;", replace: "   where v.resource_key = p_resource_key order by v.version asc limit 1;" },
    { name: "N35 marketing copy promises the planner to every visitor", file: "benefit",
      find: "      \"Eligible PawTenant customers receive a downloadable Pet Care Planner", replace: "      \"Every visitor receives a downloadable Pet Care Planner" },
    { name: "N36 preview images lose their intrinsic dimensions", file: "marketing",
      find: "                      width={p.width}\n                      height={p.height}\n", replace: "" },
    { name: "N37 a preview image loses its alt text", file: "benefit",
      find: "        alt: \"Milestone Checklist page from the PSD Training Workbook with fourteen dated training checkpoints\",", replace: "        alt: \"\"," },
    { name: "N38 the homepage mounts the PSD section on an ESA surface", file: "home",
      find: "<PlannerMarketingSection family=\"esa\" className=\"border-t border-orange-100\" />", replace: "<PlannerMarketingSection family=\"psd\" className=\"border-t border-orange-100\" />" },
    { name: "N39 a page duplicates the marketing section", file: "psdCost",
      find: "      <PlannerMarketingSection family=\"psd\" />\n", replace: "      <PlannerMarketingSection family=\"psd\" />\n      <PlannerMarketingSection family=\"psd\" id=\"dup\" />\n" },
    { name: "N41 the hardened predicate silently drops the US spelling (a paid `canceled` order keeps access)", file: "mig3",
      find: "not in ('lead', 'cancelled', 'canceled', 'archived', 'refunded', 'disputed')", replace: "not in ('lead', 'cancelled', 'archived', 'refunded', 'disputed')" },
    { name: "N42 the hardened predicate stops matching the order's family to the slot's family", file: "mig3",
      find: "         ) = p_family;", replace: "         ) is not null;" },
    { name: "N43 the hardened predicate is redefined without re-revoking authenticated", file: "mig3",
      find: "revoke all on function public.customer_resource_order_eligible(public.orders, text) from public, anon, authenticated;", replace: "revoke all on function public.customer_resource_order_eligible(public.orders, text) from public, anon;" },
    { name: "N40 the marketing copy invents a planner price", file: "benefit",
      find: "    portalHint: \"Already a customer? It's waiting in My Orders under Included Resources the moment your payment is confirmed.\",\n    previews: [\n      {\n        src: \"/assets/planner/pet-care-planner-cover.jpg\",",
      replace: "    portalHint: \"Buy the planner alone for $19.\",\n    previews: [\n      {\n        src: \"/assets/planner/pet-care-planner-cover.jpg\"," },
  ];

  console.log("check-customer-resource-planner — negative controls\n");
  let bad = 0;
  if ((await run()).length) { console.error("✗ BASELINE guard already failing on a clean tree"); process.exitCode = 1; }
  else {
    console.log("✓ BASELINE guard green on a clean tree\n");
    for (const c of CONTROLS) {
      try {
        if (!patch(c.file, c.find, c.replace, c.all)) { console.error(`✗ ANCHOR MISSING  ${c.name}`); bad++; }
        else if (runChild() === 0) { console.error(`✗ NOT CAUGHT      ${c.name}`); bad++; }
        else console.log(`✓ rejected        ${c.name}`);
      } finally { restore(); }
    }
    for (const [k, p] of Object.entries(F)) {
      if (k === "imgDir" || !original[k]) continue;
      if (sha(readFileSync(p)) !== baseHash[k]) { console.error(`✗ NOT RESTORED    ${relative(ROOT, p)}`); bad++; }
    }
    if (runChild() !== 0) { console.error("✗ POST-RESTORE    guard failing after restore"); bad++; }
    if (bad) { console.error(`\n❌ ${bad} negative-control failure(s)`); process.exitCode = 1; }
    else console.log(`\n✅ all ${CONTROLS.length} negative controls rejected; tree restored byte-identical (sha256)`);
  }
} else {
  const fails = await run();
  if (fails.length) {
    console.error("❌ check-customer-resource-planner: " + fails.length + " failure(s):");
    for (const f of fails) console.error("   • " + f);
    process.exit(1);
  }
  console.log("✅ check-customer-resource-planner: ESA + PSD resources — entitlement, owner-managed versions, service-specific copy, private storage and optimized previews all pinned.");
}
