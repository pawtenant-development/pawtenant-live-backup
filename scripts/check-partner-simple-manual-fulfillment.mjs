#!/usr/bin/env node
/**
 * check-partner-simple-manual-fulfillment.mjs
 *
 * PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — build guard.
 *
 * Proves, against the real source (bundled with esbuild where behaviour is
 * asserted, and a TypeScript program where declaration is asserted) that:
 *   A  the provider never learns an order's origin: no chip, no disclaimer,
 *      no partner columns in the provider query, no "Case Source" in the
 *      assignment email;
 *   B  ONE neutral black-and-white assessment for every order — the screen
 *      component and the PDF builder consume the same document model, the
 *      internal document is brandless for direct ESA, direct PSD and partner
 *      orders alike, and no consent/attestation reaches a provider or a PDF;
 *   C  the provider upload path declares every identifier it references
 *      (the "Failed to fetch" root cause), explains failures, and the obsolete
 *      professional-contact warning is gone;
 *   D  every customer-send control is hidden on a partner order and the
 *      server refuses the sends regardless; provider submission promises no
 *      customer notification;
 *   E  Partner Platform opens on "All partners" (URL-only selection, never
 *      the first row) and every card counts through the same predicate as
 *      the Orders list;
 *   F  finance reads frozen per-order snapshots and includes completed
 *      uninvoiced work;
 *   G  provider earnings need no retail PaymentIntent and cannot duplicate;
 *   H  one partner role, one creation+invitation action, idempotent on retry,
 *      invitation failure never reported as success;
 *   I  tenant isolation stays server-side;
 *   J  manual PSD answers are never inferred from text and never silently
 *      discarded (feature flag coupled to the applied migration);
 *   K  legacy PDF intake has no active caller and the server tombstone holds;
 *   W  this guard is in the build.
 *
 * `--self-test` plants each failure into the real source and asserts detection.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import esbuild from "esbuild";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const F = {
  PROVIDER_PAGE: "src/pages/provider-portal/page.tsx",
  PROVIDER_DETAIL: "src/pages/provider-portal/components/ProviderOrderDetail.tsx",
  ASSIGN: "supabase/functions/assign-doctor/index.ts",
  PSL: "supabase/functions/provider-submit-letter/index.ts",
  NPL: "supabase/functions/notify-patient-letter/index.ts",
  GATE: "supabase/functions/_shared/partnerCommsGate.ts",
  INTAKE_FN: "supabase/functions/partner-manual-intake/index.ts",
  ASSESS: "src/pages/admin-orders/components/assessmentUtils.ts",
  NEUTRAL: "src/components/partner/PartnerNeutralAssessment.tsx",
  ESA_VIEW: "src/pages/admin-orders/components/EsaIntakeView.tsx",
  MODAL: "src/pages/admin-orders/components/OrderDetailModal.tsx",
  WORKSPACE: "src/pages/admin-orders/components/partner-platform/PartnerPlatformWorkspace.tsx",
  OVERVIEW: "src/pages/admin-orders/components/partner-platform/PartnerOverviewTab.tsx",
  ORDERS_TAB: "src/pages/admin-orders/components/PartnerOrdersTab.tsx",
  SCOPE: "src/pages/admin-orders/partnerOrderScope.ts",
  FINANCE: "src/pages/admin-orders/components/partner-platform/PartnerFinanceTab.tsx",
  RECEIVABLES: "src/pages/admin-orders/components/partner-platform/PartnerReceivablesPanel.tsx",
  BILLING_LIB: "src/lib/partnerBillingSummary.ts",
  MIG_FINANCE: "supabase/migrations/20260911210000_partner_order_ux_assessment_finance_repair.sql",
  MIG_EARNINGS: "supabase/migrations/20260701120000_prevent_duplicate_base_earnings.sql",
  MIG_PORTAL: "supabase/migrations/20260911190000_partner_portal_manual_order_billing.sql",
  MIG_PORTAL_RPC: "supabase/migrations/20260911190100_partner_portal_manual_order_rpcs.sql",
  USERS: "src/pages/admin-orders/components/partner-platform/PartnerUsersPanel.tsx",
  CREATE: "src/pages/admin-orders/components/partner-platform/PartnerCreateForm.tsx",
  SETTINGS: "src/pages/admin-orders/components/partner-platform/PartnerSettingsTab.tsx",
  ROLES: "src/lib/partnerRoles.ts",
  PORTAL_PAGE: "src/pages/partner-portal/page.tsx",
  PORTAL_ORDERS: "src/pages/partner-portal/components/PartnerPortalOrders.tsx",
  PORTAL_ACCOUNTS: "src/pages/partner-portal/components/PartnerPortalAccounts.tsx",
  PORTAL_DOC_FN: "supabase/functions/partner-portal-document/index.ts",
  WIZARD: "src/components/partner/PartnerOrderWizard.tsx",
  PSD_INTAKE: "src/lib/partnerPsdIntake.ts",
  PSD_FORM: "src/components/partner/PartnerPsdQuestionnaire.tsx",
  PKG: "package.json",
};

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeOnly = (s) => stripComments(s)
  .replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
const sqlCode = (s) => s.replace(/--[^\n]*/g, "");
const jsxText = (s) => stripComments(s).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

async function bundle(rel) {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, rel)], bundle: true, write: false, format: "esm",
    platform: "neutral", target: "es2022", logLevel: "silent",
    external: ["react", "react-dom", "react/jsx-runtime", "@supabase/supabase-js", "https://esm.sh/@supabase/supabase-js@2"],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

/** Every identifier an edge function references must be declared — the exact
 *  defect that broke provider uploads (`corsHeaders is not defined`). Remote
 *  (https:/jsr:) imports are unresolved on purpose; that produces module
 *  diagnostics, never "Cannot find name". */
function undeclaredIdentifiers(rels) {
  const files = rels.map((r) => resolve(ROOT, r));
  const ambientName = resolve(ROOT, "__guard_ambient__.d.ts");
  const host = ts.createCompilerHost({}, true);
  const orig = host.getSourceFile;
  // The compiler host normalises separators, so compare by suffix, not equality.
  host.getSourceFile = (name, lang, onErr, should) =>
    name.endsWith("__guard_ambient__.d.ts") ? ts.createSourceFile(name, "declare const Deno: any; declare const EdgeRuntime: any;", lang) : orig(name, lang, onErr, should);
  const program = ts.createProgram([...files, ambientName], {
    noEmit: true, allowImportingTsExtensions: true, moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    skipLibCheck: true, strict: false,
  }, host);
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => [2304, 2552].includes(d.code) && d.file && files.includes(resolve(d.file.fileName)))
    .map((d) => `${d.file.fileName.split(/[\\/]/).slice(-2).join("/")}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

// ── Fixtures: synthetic orders (no real data) ─────────────────────────────
// A leading un-numbered line is "additional" text; a trailing one would be a
// continuation of the last answer (the parser is lossless by contract).
const PASTE = ["Extra note outside numbering", "1 How often do you feel worried or low?", "Often - most days", "2 Which of the following apply?", "Worry; Low mood", "3 In your own words?", "I moved out recently."].join("\n");
const partnerOrder = {
  confirmation_id: "PT-GUARD002", first_name: "Zo", last_name: "Guard", email: "zo@example.invalid", phone: "555", state: "TX",
  created_at: "2026-09-13T12:00:00Z", letter_type: "esa", order_origin: "partner", partner_id: "00000000-0000-0000-0000-000000000001",
  partner_order_id: "PARTNER-REF-88",
  assessment_answers: { dob: "1990-01-01", pets: [{ name: "Milo", type: "Dog", breed: "Mix", age: "4", weight: "20", vaccinated: true, supportFunctions: ["Calm"], supportNarrative: "Helps me settle." }],
    partnerQuestionnaireText: PASTE, partnerIntakeChannel: "partner_portal_manual", consents: { partnerSubmissionAuthorization: { accepted: true, at: "2026-09-13T12:00:00Z" } } },
};
const directEsa = { ...partnerOrder, confirmation_id: "PT-DIRECT002", order_origin: "direct", partner_id: null, partner_order_id: null,
  assessment_answers: { dob: "1990-01-01", pets: [{ name: "Rex", type: "Dog", breed: "Lab", age: "3", weight: "40" }], emotionalFrequency: "often", conditions: ["Anxiety"], symptomDescription: "Long text\nsecond line", housingType: "apt_nopet", consents: { telehealth: { accepted: true, at: "x" } } } };
const directPsd = { ...directEsa, confirmation_id: "PT-PSD002", letter_type: "psd",
  assessment_answers: { dob: "1990-01-01", pets: [{ name: "Ace", type: "Dog", breed: "Shepherd", age: "5", weight: "60" }], dogTasks: ["Deep pressure therapy"], taskTraining: "owner_trained", taskDescription: "Step by step.", taskReliability: "very_reliable", taskPublicAccess: "yes", dogDuration: "1to2years", emotionalFrequency: "daily", conditions: ["PTSD"], lifeChangeStress: "no", dailyImpact: "often", medication: "never", priorDiagnosis: "yes", specificDiagnosis: "PTSD", currentTreatment: "active", dogHelpDescription: "Grounding.", housingType: "apt_nopet", safetyCheck: "no", consents: { electronic_signature: { name: "Zo Guard", at: "x" } } } };

async function runChecks() {
  results.length = 0;
  const providerPage = read(F.PROVIDER_PAGE);
  const providerDetail = read(F.PROVIDER_DETAIL);
  const assign = read(F.ASSIGN);
  const psl = read(F.PSL);
  const npl = stripComments(read(F.NPL));
  const modal = read(F.MODAL);
  const neutral = read(F.NEUTRAL);
  const workspace = read(F.WORKSPACE);
  const overview = read(F.OVERVIEW);
  const ordersTab = read(F.ORDERS_TAB);
  const scope = read(F.SCOPE);
  const receivables = read(F.RECEIVABLES);
  const finance = read(F.FINANCE);
  const users = read(F.USERS);
  const create = read(F.CREATE);
  const wizard = read(F.WIZARD);
  const psdIntake = read(F.PSD_INTAKE);

  // ── A. Provider origin invisibility ──────────────────────────────────────
  const providerCode = stripComments(providerPage);
  check("A1 the provider case list carries no Partner Case chip",
    !/Partner Case/.test(providerCode) && !/isPartnerCase/.test(providerCode));
  check("A2 the provider surfaces carry no partner disclaimer (list, modal, assignment email)",
    !/authorized PawTenant partner/i.test(providerCode) && !/authorized PawTenant partner/i.test(stripComments(providerDetail)) &&
      !/authorized PawTenant partner|Case Source|originLabel|partnerDisclosureHtml|providerFacingOriginLabel/.test(stripComments(assign)));
  const providerSelect = providerCode.match(/\.from\("orders"\)\s*\.select\("([^"]+)"\)\s*\.eq\("doctor_user_id"/)?.[1] ?? "";
  check("A3 the provider-facing order query returns no partner column",
    providerSelect.length > 0 && !/order_origin|partner_id|partner_order_id/.test(providerSelect) &&
      !/order_origin|partner_id|partner_order_id/.test(codeOnly(providerDetail)),
    providerSelect ? "" : "provider select not found");

  // ── B. One neutral assessment ────────────────────────────────────────────
  const A = await bundle(F.ASSESS);
  const docs = { partner: A.buildPrintHTML(partnerOrder), direct: A.buildPrintHTML(directEsa), psd: A.buildPrintHTML(directPsd) };
  const body = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "");
  check("B1 the internal PDF is brandless for a direct ESA, a direct PSD and a partner order",
    Object.values(docs).every((h) => !/PawTenant|pawtenant\.com|readdy|#FF6A00|<img/i.test(body(h))) &&
      /<p class="doc-title">ESA Assessment<\/p>/.test(docs.direct) && /<p class="doc-title">PSD Assessment<\/p>/.test(docs.psd));
  check("B2 no consent / attestation row reaches any internal document",
    Object.values(docs).every((h) => !/Consent and Attestations|Partner Submission Authorization|Electronic signature|Acknowledged|Signed:/.test(body(h))));
  const neutralCode = codeOnly(neutral);
  check("B3 the on-screen assessment is brandless and consumes ONLY the shared document model",
    !/PawTenant|pawtenant/.test(neutral.replace(/^\/\/.*$/gm, "")) && !/LOGO_URL|readdy|orange-|#FF6A00|#F97316/i.test(neutral) &&
      /buildAssessmentDocumentModel\(/.test(neutralCode) && !/resolvePartnerQuestionnaire|QUESTIONNAIRE_ITEMS|PSD_QUESTIONNAIRE_ITEMS|collectAnswers/.test(neutralCode));
  check("B4 consent rows on screen render only for the admin audience, never a provider",
    /audience === "admin" && m\.consents\.length > 0 && \(/.test(neutral) && !/audience="admin"/.test(providerDetail) &&
      /<PartnerNeutralAssessment order=\{order\} audience="admin" \/>/.test(modal));
  const models = { partner: A.buildAssessmentDocumentModel(partnerOrder), direct: A.buildAssessmentDocumentModel(directEsa), psd: A.buildAssessmentDocumentModel(directPsd) };
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const inOrder = (h, blocks) => {
    let pos = 0;
    for (const b of blocks) {
      const i = h.indexOf(esc(b.question), pos); if (i < 0) return false;
      const j = h.indexOf(esc(b.answer.split("\n")[0]), i); if (j < 0) return false;
      pos = j;
    }
    return true;
  };
  check("B5 screen and PDF cannot diverge: every model question/answer appears in the PDF, in model order",
    Object.entries(models).every(([k, m]) => m.questionnaire.blocks.length > 0 && inOrder(body(docs[k]), m.questionnaire.blocks)) &&
      models.psd.questionnaire.blocks.some((b) => b.answer === "Owner-trained (self-trained with the dog)") &&
      models.partner.questionnaire.additional.length === 1 && /Extra note outside numbering/.test(docs.partner));
  check("B6 every internal surface mounts the neutral assessment for every order",
    /<PartnerNeutralAssessment order=\{order\} \/>/.test(providerDetail) && !/PSDAssessmentView|PawTenant ESA Intake Form/.test(stripComments(providerDetail)) &&
      !/PSDAssessmentView|PawTenant ESA Intake Form/.test(stripComments(modal)) &&
      /if \(isPartnerOrder\(order\) \|\| variant === "admin"\)/.test(read(F.ESA_VIEW)));

  // ── C. Upload repair ─────────────────────────────────────────────────────
  const undeclared = undeclaredIdentifiers([F.PSL, F.NPL, F.ASSIGN]);
  check("C1 the provider upload function (and its peers) declare every identifier they reference",
    undeclared.length === 0 && /const corsHeaders = \{/.test(psl) && /const SUPABASE_ANON_KEY = /.test(psl), undeclared.join(" | "));
  check("C2 upload failures are explained: status-aware body parsing and no bare 'Failed to fetch'",
    /describeUploadException\(err\)/.test(providerDetail) && /describeUploadHttpFailure\(res\.status\)/.test(providerDetail) &&
      /const rawBody = await res\.text\(\);/.test(providerDetail) && !/const msg = err instanceof Error \? err\.message : "Unknown error";/.test(providerDetail));
  check("C3 the obsolete professional-contact warning no longer renders in the provider upload tab",
    !/MissingProfessionalContactNotice/.test(stripComments(providerDetail)));
  check("C4 the upload function keeps the compatibility behaviour (magic-byte PDF sniff, 50MB limit, WebP allowed)",
    /%PDF-/.test(psl) && /50 \* 1024 \* 1024/.test(psl) && /image\/webp/.test(psl));

  // ── D. Customer-notification firewall ────────────────────────────────────
  const modalCode = jsxText(modal);
  check("D1 the Notify Patient banner and the post-footer shortcut are hidden on partner orders",
    /\{!isPartnerOrder && orderDocs\.some\(\(d\) => d\.footer_injected && d\.customer_visible === true\) && !reinjectFooterMsg && \(/.test(modalCode) &&
      /\{!isPartnerOrder && \(reinjectFooterMsg\.includes\("success"\) \|\| reinjectFooterMsg\.includes\("stamped"\)\) && hasDeliverableDocument\(orderDocs\) && \(/.test(modalCode));
  check("D2 Send All to Customer and Send Test Email are hidden on partner orders",
    /\{!isPartnerOrder && \(\s*<button type="button" onClick=\{handleSendAllToCustomer\}/.test(modalCode) &&
      /\{!isPartnerOrder && \(\s*<button\s+type="button"\s+onClick=\{handleSendTestEmail\}/.test(modalCode));
  check("D3 portal reset, consultation invite and new-order link are hidden on partner orders",
    /\{!isPartnerOrder && \(\s*<button\s+type="button"\s+onClick=\{\(\) => \{ setShowHeaderMore\(false\); handleSendPortalReset\(\); \}\}/.test(modalCode) &&
      /\{!isPartnerOrder &&\s+!order\.payment_intent_id &&\s+!order\.paid_at &&/.test(modalCode) &&
      // LIVE ADAPTATION (PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004): on LIVE the
      // new-order action is the in-app "Start New ESA Order" spawn, not the emailed link.
      /\{!isPartnerOrder && \(\s*<button\s+type="button"\s+onClick=\{\(\) => \{ setShowHeaderMore\(false\); spawnReturningOrder\(order\.id, "repeat"\); \}\}/.test(modalCode));
  check("D3b resume-checkout email, custom payment request and Upgrade to Annual are hidden on partner orders",
    /\{!isPartnerOrder && \(\s*<OrderResumeCheckoutEmailAction/.test(modalCode) &&
      /\{!isPartnerOrder && \(\s*<OrderCustomPaymentMenuAction/.test(modalCode) &&
      /\{!isPartnerOrder && \(order\.payment_intent_id \|\| order\.paid_at\) && \(/.test(modalCode));
  const gateAt = npl.indexOf("gateCustomerContact(");
  // The direct-path delivery stamps patient_notification_sent_at AFTER its send;
  // the gate must be evaluated before either can happen.
  const stampAt = npl.indexOf("patient_notification_sent_at:");
  check("D4 the server refuses partner customer communication regardless of the UI",
    gateAt > 0 && stampAt > gateAt && /if \(!contactGate\.allowed\) \{/.test(npl) &&
      /allowed: false,\s*reason: PARTNER_COMMS_REFUSAL/.test(stripComments(read(F.GATE)).replace(/\s+/g, " ")));
  check("D5 provider submission promises no customer notification, on every order",
    !/Notify Patient|Submit & Complete|Complete Order\?/.test(jsxText(providerDetail)) && /Internal Note \(Optional\)/.test(providerDetail) &&
      /Submit \{fileQueue\.filter\(\(i\) => !i\.done\)\.length\} Document\{fileQueue\.filter\(\(i\) => !i\.done\)\.length !== 1 \? "s" : ""\} for Review/.test(providerDetail));
  const partnerArm = npl.slice(npl.indexOf("if (!contactGate.allowed) {"), npl.indexOf("partnerContactNotified,"));
  check("D6 the partner completion arm never stamps patient_notification_sent_at and claims ONE per-order partner notice",
    partnerArm.length > 0 && !/patient_notification_sent_at/.test(partnerArm) && /`\$\{confirmationId\}:partner_completion`/.test(partnerArm) && /to: \[contact\]/.test(partnerArm));

  // ── E. Default scope + one predicate ─────────────────────────────────────
  check("E1 Partner Platform opens on All partners: selection comes ONLY from a valid ?partner= id, never the first row",
    /<option value="">\{ALL_PARTNERS_LABEL\}<\/option>/.test(workspace) && !/selectable\[0\]/.test(stripComments(workspace)) &&
      /urlPartnerId \? selectable\.find\(\(o\) => o\.id === urlPartnerId\) \?\? null : null/.test(workspace) &&
      !/localStorage|sessionStorage/.test(workspace) && /UUID_RE\.test\(v\)/.test(workspace));
  check("E2 the Overview cards and the Orders list share one predicate (partnerOrderScope) and the Overview has no second origin pin",
    /from "\.\.\/\.\.\/partnerOrderScope"/.test(overview) && /countPartnerOrders\(pid\)/.test(overview) && /partnerOrdersFilters\(pid\)/.test(overview) &&
      !/partner_admin_onboarding_state|\.eq\("order_origin"/.test(stripComments(overview)) &&
      /partnerOrdersFilters\(partnerId, \{/.test(ordersTab) && !/orderOrigin:\s*"/.test(stripComments(ordersTab)) &&
      (stripComments(scope).match(/orderOrigin:\s*"partner"/g) ?? []).length === 1);
  check("E3 completed / needs-action counts are counted over the FULL scope, not the recent rows",
    /countPartnerOrders\(pid, PARTNER_WORKFLOW_PREDICATES\.completed\)/.test(overview) && /countPartnerOrders\(pid, PARTNER_WORKFLOW_PREDICATES\.needsAction\)/.test(overview) &&
      !/recent\.filter\(/.test(stripComments(overview)));
  check("E4 the Orders and Finance tabs follow the header scope (no second partner selector)",
    /partnerId=\{selected\?\.id \?\? null\}/.test(workspace) && !/<option value="all">All partners<\/option>/.test(ordersTab) &&
      /const scopePartnerId = selected\?\.id \?\? null;/.test(finance) && !/partnerScope/.test(finance));

  // ── F. Finance: frozen snapshots, completed uninvoiced work ──────────────
  const mig = sqlCode(read(F.MIG_FINANCE));
  const rowsFn = mig.slice(mig.indexOf("function public.partner_admin_order_finance_rows"), mig.indexOf("function public.partner_admin_billing_summary"));
  check("F1 finance rows read the FROZEN per-order snapshot, never the current rate card",
    // A table name is a string literal, so the USE is asserted on comment-stripped
    // source (stripping literals would hide the very fetch this forbids).
    /partner_order_financials/.test(rowsFn) && /wholesale_fee_cents/.test(rowsFn) && !/partner_rate_cards/.test(rowsFn) &&
      !/partner_rate_cards/.test(stripComments(finance)) && !/partner_rate_cards/.test(stripComments(receivables)));
  check("F2 completed uninvoiced work is counted (awaiting invoice) and the All-partners aggregate sums it",
    /invoice_status = 'uninvoiced' and r\.billable_status = 'billable'/.test(mig) &&
      /"orders_awaiting_invoice", "awaiting_invoice_cents"/.test(read(F.BILLING_LIB)) && /aggregateBillingSummaries\(\(data \?\? \[\]\) as BillingSummary\[\]\)/.test(receivables) &&
      /p_partner_id: null/.test(receivables));
  const R = await bundle(F.BILLING_LIB);
  const agg = R.aggregateBillingSummaries([
    { partner_id: "a", partner_name: "A", currency: "USD", awaiting_invoice_cents: 5200, orders_awaiting_invoice: 1, in_progress_charges_cents: 100, net_contribution_cents: 2200, provider_cost_cents: 3000, partner_charges_cents: 5200 },
    { partner_id: "b", partner_name: "B", currency: "USD", awaiting_invoice_cents: 4500, orders_awaiting_invoice: 1, in_progress_charges_cents: 0, net_contribution_cents: 1500, provider_cost_cents: 3000, partner_charges_cents: 4500 },
  ]);
  const mixed = R.aggregateBillingSummaries([{ partner_id: "a", currency: "USD", net_contribution_cents: 1 }, { partner_id: "b", currency: "EUR", net_contribution_cents: 1 }]);
  check("F3 the aggregate adds frozen figures within one currency and refuses a mixed set",
    agg && agg.awaiting_invoice_cents === 9700 && agg.orders_awaiting_invoice === 2 && agg.net_contribution_cents === 3700 && agg.partner_name === "All partners" && mixed === null);

  // ── G. Provider earnings ─────────────────────────────────────────────────
  const earnArm = partnerArm;
  check("G1 a partner completion creates the provider earning without any retail PaymentIntent",
    /from\("doctor_earnings"\)\.insert\(/.test(earnArm) && /order_amount: null/.test(earnArm) && !/payment_intent_id/.test(earnArm) &&
      /order_amount: orderAmount/.test(stripComments(assign)) && /const orderAmount = [^;]*policy\.origin === "direct"[^;]*: null/.test(stripComments(assign)));
  check("G2 duplicate earnings are impossible: existing-row check + tolerated unique violation + the partial unique index",
    /if \(!existingBase && partnerDoctorUserId\)/.test(earnArm) && /"23505"/.test(earnArm) &&
      /create unique index/i.test(sqlCode(read(F.MIG_EARNINGS))) && /earning_type = 'base'/i.test(sqlCode(read(F.MIG_EARNINGS))));

  // ── H. One role, one action ──────────────────────────────────────────────
  check("H1 the invite form exposes ONE role (Partner user) and writes the first-release role constant",
    !/<select[^>]*>[\s\S]*?partner_staff/.test(jsxText(users)) && !/<option value="partner_(staff|admin)">/.test(users) &&
      /p_role: FIRST_RELEASE_PARTNER_ROLE/.test(users) && /partnerRoleLabel\(r\.role\)/.test(users) &&
      /partnerRoleLabel\(ctx\?\.role\)/.test(read(F.PORTAL_PAGE)) && /export const FIRST_RELEASE_PARTNER_ROLE = "partner_admin"/.test(read(F.ROLES)));
  check("H2 creation + invitation is ONE admin action on the existing RPCs and rate-card system",
    /partner_admin_create_organization/.test(create) && /partner_admin_set_rate/.test(create) && /partner_admin_set_completion_contact/.test(create) &&
      /partner_admin_invite_user/.test(create) && /functions\/v1\/partner-user-invite/.test(create) && /<PartnerCreateForm orgs=\{orgs\}/.test(read(F.SETTINGS)) &&
      !/Create sandbox partner|showCreateOrg/.test(read(F.SETTINGS)));
  check("H3 a retry never duplicates the organization or the membership",
    /orgs\.find\(\(o\) => o\.slug === slug\)/.test(create) && /already exists\|23505/.test(create) &&
      /let partnerUserId = existingUser\?\.id \?\? null;/.test(create) && /const hasRate = /.test(create) && /completion_notification_email\) \{/.test(create));
  check("H4 invitation dispatch failure is never reported as success",
    /if \(!res\.ok \|\| body\.ok !== true\) throw new Error/.test(create) && /tone: "warn"/.test(create) && /was NOT sent/.test(create) && /Resend invitation/.test(create));

  // ── I. Tenant isolation (server-side) ────────────────────────────────────
  const portalMig = sqlCode(read(F.MIG_PORTAL));
  const portalRpc = sqlCode(read(F.MIG_PORTAL_RPC));
  check("I1 the partner's organization is derived server-side from the session, never sent by the client",
    /pu\.user_id = auth\.uid\(\)[\s\S]{0,40}pu\.status\s*=\s*'active'/.test(portalMig) &&
      (portalRpc.match(/partner_id = public\.current_partner_id\(\)/g) ?? []).length >= 3 &&
      /p_partner_id: mode === "admin" \? partnerId : null,/.test(wizard) &&
      /\.eq\("order_origin", "partner"\)\s*\.eq\("partner_id", partnerId\)/.test(read(F.PORTAL_DOC_FN)));
  check("I2 the portal Accounts view reads only the session-scoped projections and names no provider",
    /partner_portal_orders/.test(read(F.PORTAL_ACCOUNTS)) && /<PartnerPortalInvoices \/>/.test(read(F.PORTAL_ACCOUNTS)) &&
      !/doctor_|provider_earning|doctor_earnings|per_order_rate|margin/i.test(codeOnly(read(F.PORTAL_ACCOUNTS))) &&
      /\["accounts", "Accounts"|key: "accounts"/.test(read(F.PORTAL_PAGE)) && /key: "new"/.test(read(F.PORTAL_PAGE)));

  // ── J. PSD: never inferred, never silently discarded ─────────────────────
  const flagOn = /export const PARTNER_PSD_MANUAL_INTAKE_ENABLED = true;/.test(psdIntake);
  const migFiles = existsSync(join(ROOT, "supabase/migrations")) ? readdirSync(join(ROOT, "supabase/migrations")) : [];
  const psdMig = migFiles.find((f) => /p_psd_answers jsonb/.test(read(`supabase/migrations/${f}`)));
  check("J1 the PSD manual-intake flag is coupled to the applied backend contract (on ⇒ migration declares p_psd_answers)",
    (!flagOn && !psdMig) || (flagOn && Boolean(psdMig)) , flagOn ? `flag on, migration ${psdMig ?? "MISSING"}` : "flag off");
  check("J2 PSD answers are structured (catalog-driven), never inferred from the pasted text",
    // No parser import and no read of the pasted transcript field: the answers
    // come from the form and the catalog only.
    !/parsePartnerQuestionnaire|resolvePartnerQuestionnaire|partnerQuestionnaireText|questionnaireText|partnerQuestionnaire\b/.test(codeOnly(read(F.PSD_FORM))) &&
      /from\("psd_assessment_questions"\)/.test(read(F.PSD_FORM)) && /PSD_QUESTIONNAIRE_ITEMS/.test(read(F.PSD_FORM)) &&
      /missing required question/.test(psdIntake) && /unknown question/.test(psdIntake) && /psd question catalog unavailable/.test(psdIntake));
  check("J3 the wizard sends p_psd_answers ONLY when the contract is live, and refuses PSD otherwise",
    /\.\.\.\(psdIntakeActive \? \{ p_psd_answers: compactPsdAnswers\(psdAnswers\) \} : \{\}\),/.test(wizard) &&
      /if \(service === "psd" && !PARTNER_PSD_MANUAL_INTAKE_ENABLED\) \{/.test(wizard) &&
      /\(s !== "psd" \|\| PARTNER_PSD_MANUAL_INTAKE_ENABLED\)/.test(wizard) && /PARTNER_PSD_UNAVAILABLE_REASON/.test(wizard));

  // ── K. Legacy PDF intake ─────────────────────────────────────────────────
  const srcFiles = walk(join(ROOT, "src"));
  const legacyImporters = srcFiles.filter((p) => !/PartnerManualIntake\.tsx$/.test(p) && /from "\.\/PartnerManualIntake"|from ".*\/PartnerManualIntake"/.test(readFileSync(p, "utf8")));
  // The retired wizard file itself is excluded: K1 proves it has no importer,
  // so its calls are unreachable; every LIVE caller must be read-only.
  const intakeCalls = srcFiles.filter((p) => !/PartnerManualIntake\.tsx$/.test(p))
    .flatMap((p) => [...readFileSync(p, "utf8").matchAll(/partner-manual-intake\?action=([a-z_${}]+)/g)].map((m) => `${p.split(/[\\/]/).pop()}:${m[1]}`));
  check("K1 the legacy PDF wizard has no active importer and the only live call is the read-only source_url",
    legacyImporters.length === 0 && intakeCalls.length > 0 && intakeCalls.every((c) => c.endsWith(":source_url")), intakeCalls.join(","));
  const intakeFn = stripComments(read(F.INTAKE_FN));
  check("K2 the server tombstone refuses every legacy write action with 410",
    /if \(!LEGACY_INTAKE_READ_ONLY_ACTIONS\.has\(action\)\) \{/.test(intakeFn) && /fail\(410, "legacy_intake_retired"/.test(intakeFn) &&
      /new Set\(\["source_url"\]\)/.test(intakeFn));

  // ── W. Wiring ────────────────────────────────────────────────────────────
  check("W1 this guard is in the build chain",
    /node scripts\/check-partner-simple-manual-fulfillment\.mjs/.test(JSON.parse(read(F.PKG)).scripts.build));
}

function report(title) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${title}`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `\n        ${r.detail}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return failed.length;
}

const SELF = process.argv.includes("--self-test");

if (SELF) {
  const CONTROLS = [
    { name: "1 provider partner chip restored", file: F.PROVIDER_PAGE, expect: "A1",
      from: `                  const isPSD = isPSDOrder(order);`, to: `                  const isPSD = isPSDOrder(order);\n                  const partnerChip = "Partner Case"; void partnerChip;` },
    { name: "2 provider partner disclaimer restored", file: F.PROVIDER_PAGE, expect: "A2",
      from: `                  const isPSD = isPSDOrder(order);`, to: `                  const isPSD = isPSDOrder(order);\n                  const disclaimer = "This case was submitted through an authorized PawTenant partner."; void disclaimer;` },
    { name: "3 partner columns returned to the provider query", file: F.PROVIDER_PAGE, expect: "A3",
      from: `preferred_provider_contact_timezone")\n      .eq("doctor_user_id"`, to: `preferred_provider_contact_timezone, order_origin, partner_id")\n      .eq("doctor_user_id"` },
    { name: "4 branding restored in the on-screen assessment", file: F.NEUTRAL, expect: "B3",
      from: `<h2 className="text-xl font-bold">{m.title}</h2>`, to: `<h2 className="text-xl font-bold text-orange-500">PawTenant {m.title}</h2>` },
    { name: "4b logo restored in the internal PDF", file: F.ASSESS, expect: "B1",
      from: `  <p class="doc-title">\${escapeHtml(title)}</p>\n  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review.</p>\n\n  \${sectionTitle("Customer Information")}\n  \${caseRef}\n  \${m.customer`,
      to: `  <img src="\${LOGO_URL}" alt="PawTenant" />\n  <p class="doc-title">\${escapeHtml(title)}</p>\n  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review.</p>\n\n  \${sectionTitle("Customer Information")}\n  \${caseRef}\n  \${m.customer` },
    { name: "5 consent/attestation restored to the provider assessment", file: F.NEUTRAL, expect: "B4",
      from: `{audience === "admin" && m.consents.length > 0 && (`, to: `{m.consents.length > 0 && (` },
    { name: "5b consent table restored to the PDF", file: F.ASSESS, expect: "B2",
      from: `  \${sectionTitle("Mental Health Questionnaire")}\n  \${qaBlocks}\n</div>`,
      to: `  \${sectionTitle("Mental Health Questionnaire")}\n  \${qaBlocks}\n  \${sectionTitle("Consent and Attestations")}\n  \${m.consents.map((c) => \`<p>\${escapeHtml(c.item)} \${escapeHtml(c.status)}</p>\`).join("")}\n</div>` },
    { name: "6 professional-contact warning restored", file: F.PROVIDER_DETAIL, expect: "C3",
      from: `              {/* ── READ-ONLY PREVIEW MODE ── */}`, to: `              <MissingProfessionalContactNotice providerUserId={providerUserId} />\n              {/* ── READ-ONLY PREVIEW MODE ── */}` },
    { name: "7 Notify Patient restored for partner orders", file: F.MODAL, expect: "D1",
      from: `{!isPartnerOrder && orderDocs.some((d) => d.footer_injected && d.customer_visible === true) && !reinjectFooterMsg && (`,
      to: `{orderDocs.some((d) => d.footer_injected && d.customer_visible === true) && !reinjectFooterMsg && (` },
    { name: "8 Send All to Customer restored for partner orders", file: F.MODAL, expect: "D2",
      from: `                  {!isPartnerOrder && (\n                  <button type="button" onClick={handleSendAllToCustomer}`,
      to: `                  {true && (\n                  <button type="button" onClick={handleSendAllToCustomer}` },
    { name: "8b resume-checkout email offered on a partner order again", file: F.MODAL, expect: "D3b",
      from: `                    {!isPartnerOrder && (\n                    <OrderResumeCheckoutEmailAction`, to: `                    {true && (\n                    <OrderResumeCheckoutEmailAction` },
    { name: "9 partner customer communication allowed server-side", file: F.NPL, expect: "D4",
      from: `  if (!contactGate.allowed) {`, to: `  if (false) {` },
    { name: "10 Partner Overview defaults to the first organization", file: F.WORKSPACE, expect: "E1",
      from: `(urlPartnerId ? selectable.find((o) => o.id === urlPartnerId) ?? null : null)`, to: `(urlPartnerId ? selectable.find((o) => o.id === urlPartnerId) ?? null : selectable[0] ?? null)` },
    { name: "11 aggregate cards use a different predicate from the list", file: F.OVERVIEW, expect: "E2",
      from: `        countPartnerOrders(pid),\n`, to: `        supabase.from("orders").select("id", { count: "exact", head: true }).eq("order_origin", "partner").then((r) => r.count ?? 0),\n` },
    { name: "11b the Orders tab grows its own origin pin", file: F.ORDERS_TAB, expect: "E2",
      from: `  const filters = useMemo<FacetFilters>(() => partnerOrdersFilters(partnerId, {`, to: `  const filters = useMemo<FacetFilters>(() => ({ orderOrigin: "partner", dateBasis: "created", ...partnerOrdersFilters(partnerId, {` },
    { name: "12 finance ignores completed uninvoiced work", file: F.BILLING_LIB, expect: "F2",
      from: `  "orders_awaiting_invoice", "awaiting_invoice_cents", "open_invoice_count"`, to: `  "open_invoice_count"` },
    { name: "13 finance reads the current rate card", file: F.FINANCE, expect: "F1",
      from: `        supabase.rpc("partner_admin_order_finance_rows", { p_partner_id: null }),`, to: `        supabase.rpc("partner_admin_order_finance_rows", { p_partner_id: null }),\n        supabase.from("partner_rate_cards").select("wholesale_unit_price_cents"),` },
    { name: "14 provider earning requires a retail PaymentIntent", file: F.NPL, expect: "G1",
      from: `      if (!existingBase && partnerDoctorUserId) {`, to: `      if (!existingBase && partnerDoctorUserId && order.payment_intent_id) {` },
    { name: "15 duplicate provider earning allowed", file: F.NPL, expect: "G2",
      from: `      if (!existingBase && partnerDoctorUserId) {`, to: `      if (partnerDoctorUserId) {` },
    { name: "16 role selector reintroduces the staff/admin distinction", file: F.USERS, expect: "H1",
      from: `              <p className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700" data-partner-role-fixed>{PARTNER_USER_ROLE_LABEL}</p>`,
      to: `              <select><option value="partner_staff">Partner staff</option><option value="partner_admin">Partner admin</option></select>` },
    { name: "17 partner user can name another organization", file: F.WIZARD, expect: "I1",
      from: `        p_partner_id: mode === "admin" ? partnerId : null,`, to: `        p_partner_id: partnerId,` },
    { name: "18 profile retry creates a duplicate membership", file: F.CREATE, expect: "H3",
      from: `      let partnerUserId = existingUser?.id ?? null;`, to: `      let partnerUserId: string | null = null; void existingUser;` },
    { name: "19 invitation failure reported as success", file: F.CREATE, expect: "H4",
      from: `  if (!res.ok || body.ok !== true) throw new Error(body.error ?? \`Invitation email failed (\${res.status})\`);`, to: `  void body;` },
    { name: "20 PSD flag switched on without the backend contract", file: F.PSD_INTAKE, expect: "J1",
      from: `export const PARTNER_PSD_MANUAL_INTAKE_ENABLED = false;`, to: `export const PARTNER_PSD_MANUAL_INTAKE_ENABLED = true;` },
    { name: "20b PSD answers sent to a backend that discards them", file: F.WIZARD, expect: "J3",
      from: `        ...(psdIntakeActive ? { p_psd_answers: compactPsdAnswers(psdAnswers) } : {}),`, to: `        p_psd_answers: compactPsdAnswers(psdAnswers),` },
    { name: "21 legacy PDF intake callable again", file: F.INTAKE_FN, expect: "K2",
      from: `  if (!LEGACY_INTAKE_READ_ONLY_ACTIONS.has(action)) {`, to: `  if (false) {` },
    { name: "22 upload function loses a declaration again (corsHeaders)", file: F.PSL, expect: "C1",
      from: `const corsHeaders = {`, to: `const corsHeadersRenamed = {` },
    { name: "22b upload errors collapse to an unexplained message", file: F.PROVIDER_DETAIL, expect: "C2",
      from: `        updateQueueItem(item.id, { error: describeUploadException(err), uploading: false });`,
      to: `        updateQueueItem(item.id, { error: err instanceof Error ? err.message : "Unknown error", uploading: false });` },
    { name: "23 provider upload promises a customer notification", file: F.PROVIDER_DETAIL, expect: "D5",
      from: `Submit Documents for Review?`, to: `Submit Documents & Notify Patient?` },
    { name: "24 the screen renderer grows a second data path (UI and PDF can diverge)", file: F.NEUTRAL, expect: "B3",
      from: `import {\n  buildAssessmentDocumentModel,`, to: `import { resolvePartnerQuestionnaire } from "../../lib/partnerQuestionnaire";\nvoid resolvePartnerQuestionnaire;\nimport {\n  buildAssessmentDocumentModel,` },
    { name: "W the guard falls out of the build chain", file: F.PKG, expect: "W1",
      from: ` && node scripts/check-partner-simple-manual-fulfillment.mjs`, to: `` },
  ];

  let missed = 0;
  const originals = new Map();
  try {
    await runChecks();
    if (report("BASELINE (must be clean before planting)")) {
      console.log("\n  baseline dirty — controls would be meaningless");
      missed++;
    } else {
      for (const c of CONTROLS) {
        const path = join(ROOT, c.file);
        if (!originals.has(c.file)) originals.set(c.file, readFileSync(path, "utf8"));
        const src = read(c.file);
        if (!src.includes(c.from)) { console.log(`  ANCHOR MISSING  ${c.name}`); missed++; continue; }
        writeFileSync(path, src.replace(c.from, c.to), "utf8");
        let caught = false;
        try {
          await runChecks();
          const t = results.find((r) => r.name.startsWith(c.expect + " "));
          caught = Boolean(t && !t.ok);
        } catch { caught = true; }
        console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
        if (!caught) missed++;
        writeFileSync(path, originals.get(c.file), "utf8");
      }
    }
  } finally {
    for (const [rel, content] of originals) writeFileSync(join(ROOT, rel), content, "utf8");
  }

  await runChecks();
  const after = report("AFTER RESTORE (must be clean)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - missed}/${CONTROLS.length} controls detected${after ? ", RESTORE FAILED" : ", tree restored"}`);
  process.exitCode = missed || after ? 1 : 0;
} else {
  await runChecks();
  const failed = report("PARTNER PLATFORM · SIMPLE MANUAL FULFILLMENT REPAIR");
  process.exitCode = failed ? 1 : 0;
}
