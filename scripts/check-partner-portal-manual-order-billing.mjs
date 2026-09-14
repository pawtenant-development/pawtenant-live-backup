#!/usr/bin/env node
/**
 * check-partner-portal-manual-order-billing.mjs
 *
 * PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
 *
 * The rules this task exists to keep true:
 *
 *   INTAKE      A manual partner order is TYPED, not extracted. PDF + OCR is a
 *               labelled legacy path, never the default and never required.
 *   IDENTITY    A partner's organization comes from auth.uid(). Nothing sends a
 *               partner id from the browser that the database will trust.
 *   ISOLATION   The partner tables stay admin-only under RLS; partner reads are
 *               SECURITY DEFINER projections filtered by current_partner_id().
 *   MONEY       A submitted order freezes its rate. Rate history is versioned,
 *               never edited in place. An order joins at most one active
 *               invoice. A Stripe line carries the order id and nothing else.
 *   THE WALL    invoice.paid is bookkeeping. It never completes a clinical
 *               order and never marks an individual order paid — only an admin
 *               does, by hand, and that action changes billing state only.
 *   PRIVACY     The questionnaire transcript never reaches a log, an audit
 *               payload, an analytics call, an email or a Stripe description.
 *   UNCHANGED   Customer-facing letters and the branded customer intake form
 *               are not touched, and the internal document keeps its plain
 *               black-and-white format.
 *
 * `--self-test` plants each failure into the real source and asserts detection.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const F = {
  MIG_SCHEMA: "supabase/migrations/20260911190000_partner_portal_manual_order_billing.sql",
  MIG_RPC: "supabase/migrations/20260911190100_partner_portal_manual_order_rpcs.sql",
  MIG_SUBMIT: "supabase/migrations/20260911190200_partner_portal_submission_and_billing_rpcs.sql",
  MIG_BILLING: "supabase/migrations/20260911190300_partner_stripe_invoicing_and_reconciliation.sql",
  MIG_REVOKE: "supabase/migrations/20260911190700_partner_trigger_functions_revoke_public.sql",
  MIG_POLICY: "supabase/migrations/20260911190800_partner_portal_advisor_cleanup.sql",
  WIZARD: "src/components/partner/PartnerOrderWizard.tsx",
  RULES: "src/lib/assessmentIdentityRules.ts",
  PORTAL: "src/pages/partner-portal/page.tsx",
  PORTAL_ORDERS: "src/pages/partner-portal/components/PartnerPortalOrders.tsx",
  ADMIN_INTAKE: "src/pages/admin-orders/components/partner-platform/PartnerAdminOrderIntake.tsx",
  WORKSPACE: "src/pages/admin-orders/components/partner-platform/PartnerPlatformWorkspace.tsx",
  RECEIVABLES: "src/pages/admin-orders/components/partner-platform/PartnerReceivablesPanel.tsx",
  USERS_PANEL: "src/pages/admin-orders/components/partner-platform/PartnerUsersPanel.tsx",
  STRIPE_SHARED: "supabase/functions/_shared/partnerStripeInvoice.ts",
  STRIPE_FN: "supabase/functions/partner-stripe-invoice/index.ts",
  WEEKLY_FN: "supabase/functions/partner-weekly-invoices/index.ts",
  INVITE_FN: "supabase/functions/partner-user-invite/index.ts",
  ADMIN_AUTH: "supabase/functions/_shared/partnerAdminAuth.ts",
  WEBHOOK: "supabase/functions/stripe-webhook/index.ts",
  ASSESS: "src/pages/admin-orders/components/assessmentUtils.ts",
  STEP2: "src/pages/assessment/components/Step2PersonalInfo.tsx",
};

/** SINGLE read point — CRLF normalised so every \n anchor matches on a Windows
 *  checkout exactly as it does on Vercel. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Strip `--` comments ONLY. A PL/pgSQL body lives inside a `$…$` literal, so a
 * literal-stripping pass would delete the whole function.
 */
const sqlCode = (s) => s.replace(/--[^\n]*/g, "");

/** Strip comments only — for "this exact copy must be present" assertions. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Strip comments AND string/template literals — for "this must NOT be USED"
 * assertions, so a word that merely appears in a comment or in customer copy
 * can never fail a wiring check.
 */
function codeOnly(s) {
  return stripComments(s)
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

async function loadEsm(rel) {
  const { code } = await esbuild.transform(read(rel), { loader: "ts", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

async function runChecks() {
  results.length = 0;

  const migSchema = read(F.MIG_SCHEMA);
  const migRpc = read(F.MIG_RPC);
  const migSubmit = read(F.MIG_SUBMIT);
  const migBilling = read(F.MIG_BILLING);
  const migRevoke = read(F.MIG_REVOKE);
  const migPolicy = read(F.MIG_POLICY);
  const allSql = sqlCode(
    migSchema + "\n" + migRpc + "\n" + migSubmit + "\n" + migBilling + "\n" + migRevoke + "\n" + migPolicy,
  );

  const wizard = read(F.WIZARD);
  const portalOrders = read(F.PORTAL_ORDERS);
  const adminIntake = read(F.ADMIN_INTAKE);
  const workspace = read(F.WORKSPACE);
  const receivables = read(F.RECEIVABLES);
  const stripeShared = read(F.STRIPE_SHARED);
  const stripeFn = read(F.STRIPE_FN);
  const weeklyFn = read(F.WEEKLY_FN);
  const inviteFn = read(F.INVITE_FN);
  const adminAuth = read(F.ADMIN_AUTH);
  const webhook = read(F.WEBHOOK);
  const assess = read(F.ASSESS);

  // ── 1. INTAKE: typed, not extracted ──────────────────────────────────────
  const wizardCode = codeOnly(wizard);
  check("M1 the manual order wizard has no file input and no OCR",
    !/type=\s*""/.test("") &&
      !/<input[^>]*type="file"/i.test(wizard) &&
      !/\b(tesseract|pdfjs|pdfOcr|FormData|readAsDataURL|ocr)\b/i.test(wizardCode),
    "a structured form that still demands a PDF is the defect this task fixed");

  // PAIRED, not ordered: an ordering test passes vacuously when one of the two
  // handlers disappears. Each label must be wired to ITS OWN handler.
  const btnPairs = [...stripComments(workspace)
    .matchAll(/onClick=\{\(\) => (setIntakeOpen|setLegacyIntakeOpen)\(true\)\}[\s\S]{0,400}?<\/button>/g)]
    .map((m) => ({ handler: m[1], html: m[0] }));
  const primary = btnPairs.find((b) => /New Partner Order/.test(b.html));
  const legacy = btnPairs.find((b) => /Legacy: PDF upload/.test(b.html));
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the legacy PDF control is
  // GONE from the workspace (no button, no wizard state), and the server
  // refuses every write action of the retired path with 410.
  const intakeFn = stripComments(read("supabase/functions/partner-manual-intake/index.ts"));
  check("M2 the admin default action opens the STRUCTURED form, and the legacy PDF upload control no longer exists",
    /<PartnerAdminOrderIntake/.test(stripComments(workspace)) &&
      Boolean(primary) && primary.handler === "setIntakeOpen" &&
      !legacy && !/setLegacyIntakeOpen|Legacy: PDF upload/.test(stripComments(workspace)) &&
      /if \(!LEGACY_INTAKE_READ_ONLY_ACTIONS\.has\(action\)\) \{/.test(intakeFn) && /fail\(410, "legacy_intake_retired"/.test(intakeFn),
    `New Partner Order -> ${primary?.handler ?? "missing"}; legacy control present: ${Boolean(legacy)}`);

  check("M3 the retired PDF path is labelled read-only history wherever it is still shown",
    /Legacy PDF intake/.test(read("src/pages/admin-orders/components/partner-platform/PartnerManualIntake.tsx")) &&
      /retired/i.test(codeOnly(read("src/pages/admin-orders/components/partner-platform/PartnerLegacyIntakeHistory.tsx")) + read("src/pages/admin-orders/components/partner-platform/PartnerLegacyIntakeHistory.tsx")) &&
      !/action=upload|action=commit|action=reparse|action=review|action=ocr_text/.test(codeOnly(read("src/pages/admin-orders/components/partner-platform/PartnerLegacyIntakeHistory.tsx"))),
    "a superseded path presented as normal intake is how it stays the default");

  check("M4 the PDF intake function and the partner API are still present (nothing deleted)",
    ["supabase/functions/partner-manual-intake/index.ts",
     "supabase/functions/partner-orders-v1/index.ts",
     "supabase/functions/partner-orders-v1/validate.ts"].every((p) => read(p).length > 500),
    "historical drafts, audit records and API partners must keep working");

  // ── 2. IDENTITY: a partner id can never be forged ────────────────────────
  check("M5 current_partner_id() derives the organization from auth.uid(), never from an argument",
    /create or replace function public\.current_partner_id\(\)/.test(sqlCode(migSchema)) &&
      /where pu\.user_id = auth\.uid\(\)/.test(sqlCode(migSchema)) &&
      /pu\.status\s*=\s*'active'/.test(sqlCode(migSchema)) &&
      // and it is never given an argument to trust
      !/current_partner_id\(\s*[a-z_$]/.test(allSql),
    "the whole isolation model rests on this one function");

  check("M6 a partner caller's p_partner_id is refused on mismatch, never silently accepted",
    /if p_partner_id is not null and p_partner_id <> v_actor_partner then/.test(sqlCode(migSubmit)) &&
      /raise exception 'partner_mismatch'/.test(sqlCode(migSubmit)),
    "accepting a forged partner id would write an order to the wrong organization");

  check("M7 the portal wizard sends NO partner id in partner mode",
    /p_partner_id:\s*mode === "admin" \? partnerId : null/.test(stripComments(wizard)),
    "a browser that can name the partner is a browser that can name someone else's");

  // ── 3. ISOLATION ─────────────────────────────────────────────────────────
  const portalFns = ["partner_portal_orders", "partner_portal_invoices", "partner_portal_drafts"];
  // Bounded to the function's OWN body ($fn$ … $fn$). An unbounded slice reads
  // into the NEXT function and passes on its neighbour's filter.
  const bodyOf = (sql, fn) => {
    const after = sql.split(`function public.${fn}`)[1] ?? "";
    const open = after.indexOf("$fn$");
    if (open === -1) return "";
    const close = after.indexOf("$fn$", open + 4);
    return close === -1 ? after.slice(open) : after.slice(open, close);
  };
  const unfiltered = portalFns.filter((fn) => !/current_partner_id\(\)/.test(bodyOf(sqlCode(migRpc), fn)));
  check("M8 every partner-facing projection filters on current_partner_id()",
    unfiltered.length === 0,
    `unfiltered projections: ${unfiltered.join(", ") || "none"}`);

  check("M9 no partner-facing RLS policy opens a partner table to every signed-in user",
    !/create policy[^;]*for select to authenticated using \(true\)/i.test(allSql) &&
      !/using \(current_partner_id\(\) is not null\)/i.test(allSql),
    "partner reads go through projections; the tables stay admin-only");

  const fnAudit = (() => {
    // EVERY function, trigger functions included. PostgreSQL grants EXECUTE on a
    // new function to PUBLIC by default, so a SECURITY DEFINER trigger function
    // shows up as anon-callable over /rest/v1/rpc until it is revoked — which is
    // exactly what the security advisor caught here.
    const defs = [...allSql.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    const callable = defs;
    const missingPath = defs.filter((fn) => {
      const body = allSql.split(`function public.${fn}(`)[1] ?? "";
      return !/set search_path to/.test(body.slice(0, 1200));
    });
    const notRevoked = callable.filter((fn) => !new RegExp(`revoke all on function public\\.${fn}\\(`).test(allSql));
    return { defs, missingPath, notRevoked };
  })();
  check("M10 every new function pins its search_path, and every callable one is revoked from anon",
    fnAudit.missingPath.length === 0 && fnAudit.notRevoked.length === 0,
    `${fnAudit.defs.length} functions · mutable search_path: ${fnAudit.missingPath.join(", ") || "none"} · not revoked: ${fnAudit.notRevoked.join(", ") || "none"}`);

  check("M11 the service-role-only functions are NOT granted to signed-in users",
    ["partner_prepare_invoice", "partner_attach_stripe_invoice",
     "partner_record_stripe_invoice_paid", "partner_weekly_invoice_candidates"]
      .every((fn) => new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`).test(allSql)
        && !new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`).test(allSql)),
    "a signed-in partner that can call the invoicing primitives can bill or settle itself");

  // ── 4. MONEY ─────────────────────────────────────────────────────────────
  check("M12 a submitted order freezes the rate into the immutable snapshot",
    /insert into public\.partner_order_financials/.test(sqlCode(migRpc)) &&
      /rate_card_id, rate_card_version/.test(sqlCode(migRpc)) &&
      /v_rate\.wholesale_unit_price_cents/.test(sqlCode(migRpc)),
    "an order priced from the CURRENT rate reprices itself whenever the rate moves");

  check("M13 invoicing reads the FROZEN charge, never the live rate card",
    (() => {
      const body = sqlCode(migBilling).split("function public.partner_prepare_invoice(")[1] ?? "";
      const scope = body.slice(0, 6000);
      return /v_ev\.amount_cents/.test(scope) && !/partner_rate_cards/.test(scope);
    })(),
    "an invoice built from the live rate card is an invoice that changes after the fact");

  check("M14 an order can only be invoiced from `uninvoiced`, and a line cannot join a second active invoice",
    /if v_fin\.invoice_status <> 'uninvoiced' then/.test(sqlCode(migBilling)) &&
      /tg_partner_invoice_line_single_active/.test(sqlCode(migSubmit)) &&
      /i\.status <> 'void'/.test(sqlCode(migSubmit)),
    "billing the same work twice is the failure this pair of gates prevents");

  check("M15 the weekly job is keyed by billing period and returns an existing invoice instead of making a second",
    // The word UNIQUE is the whole point: a plain index stops nothing.
    /create unique index if not exists partner_invoices_period_uniq\s*\n\s*on public\.partner_invoices \(partner_id, billing_period_key\)/
      .test(sqlCode(migSchema)) &&
      /if p_billing_period_key is not null then/.test(sqlCode(migBilling)) &&
      /'already_existed', true/.test(sqlCode(migBilling)) &&
      /already_existed/.test(codeOnly(weeklyFn)),
    "a retried cron run must find its invoice, not create another");

  check("M16 weekly sending cannot be enabled for a half-configured partner",
    /constraint partner_billing_weekly_ready check/.test(sqlCode(migSchema)) &&
      /billing_email is not null and stripe_customer_id is not null/.test(sqlCode(migSchema)),
    "the database, not the UI, decides when automatic billing may start");

  check("M17 rate history is versioned, and nothing here edits a rate card in place",
    !/update .*partner_rate_cards set wholesale_unit_price_cents/i.test(allSql) &&
      !/update\s*\(\s*"partner_rate_cards"/.test(codeOnly(receivables)) &&
      !/from\("partner_rate_cards"\)[\s\S]{0,120}\.update\(/.test(codeOnly(receivables)),
    "editing a used rate rewrites the price of orders that were already billed");

  // ── 5. STRIPE CARRIES NO CUSTOMER DATA ───────────────────────────────────
  check("M18 the Stripe line description is built from the order id and the service only",
    /v_conf \|\| ' — ' \|\| upper\(v_ev\.service\) \|\| ' clinical fulfillment'/.test(sqlCode(migBilling)),
    "a description assembled from anything else is a PHI channel");

  check("M19 a guard re-checks every description before it reaches Stripe",
    /assertNoCustomerData/.test(codeOnly(stripeShared)) &&
      /assertNoCustomerData\(lines\)/.test(codeOnly(stripeShared)) &&
      /DESCRIPTION_RE/.test(codeOnly(stripeShared)),
    "a promise is not a control");

  check("M20 nothing customer-shaped is sent to Stripe from the invoice builders",
    !/first_name|last_name|customer_name|pet|questionnaire|assessment_answers|dob|date_of_birth/i
      .test(codeOnly(stripeShared) + codeOnly(stripeFn) + codeOnly(weeklyFn)),
    "Stripe is an external processor");

  // ── 6. THE WALL: money never moves clinical state ────────────────────────
  const paidBody = sqlCode(migBilling).split("function public.partner_record_stripe_invoice_paid(")[1] ?? "";
  const paidScope = paidBody.slice(0, 4000);
  check("M21 invoice.paid touches the invoice ledger and the billing state only",
    /update public\.partner_invoices/.test(paidScope) &&
      /set invoice_status = 'invoice_paid_unreconciled'/.test(paidScope) &&
      !/update public\.orders/.test(paidScope) &&
      !/doctor_status|doctor_earnings|order_documents|communications/.test(paidScope),
    "a paid invoice that completes an order delivers a clinical document nobody reviewed");

  check("M22 invoice.paid never sets an individual order to `paid`",
    !/set invoice_status = 'paid'/.test(paidScope),
    "the middle state exists so a human decides, order by order");

  const reconBody = sqlCode(migBilling).split("function public.partner_admin_mark_orders_paid(")[1] ?? "";
  const reconScope = reconBody.slice(0, 4000);
  check("M23 manual reconciliation changes the billing state and nothing else",
    /set invoice_status = 'paid'/.test(reconScope) &&
      /insert into public\.partner_order_reconciliations/.test(reconScope) &&
      !/update public\.orders/.test(reconScope) &&
      !/doctor_status|doctor_earnings|order_documents|insert into public\.communications/.test(reconScope),
    "settling an invoice must not create a second provider earning or move a provider");

  // Found in browser QA: the Accounts contribution panel read the INVOICE's
  // payment status for a PER-ORDER badge, so a paid invoice made every order on
  // it read "Paid" — including the ones nobody had reconciled.
  const contribution = read("src/pages/admin-orders/components/PartnerContributionPanel.tsx");
  check("M23b the per-order billing badge reads the ORDER's state before the invoice's",
    (() => {
      const code = stripComments(contribution);
      const body = code.split("function invoiceBadge")[1]?.slice(0, 1800) ?? "";
      const orderFirst = body.indexOf('r.invoice_status === "paid"');
      const invoiceFirst = body.indexOf('r.invoice_payment_status === "paid"');
      return orderFirst > -1 && invoiceFirst > -1 && orderFirst < invoiceFirst &&
        /invoice_paid_unreconciled/.test(body);
    })(),
    "an unreconciled order shown as Paid erases the distinction this task exists to draw");

  check("M24 only an order on a PAID invoice, still unreconciled, can be settled",
    /if v_fin\.invoice_status <> 'invoice_paid_unreconciled' then/.test(reconScope) &&
      /v_inv\.status <> 'paid'/.test(reconScope),
    "otherwise 'mark paid' becomes a way to skip the invoice entirely");

  check("M25 the reconciliation ledger is append-only",
    /tg_partner_recon_append_only/.test(sqlCode(migSchema)) &&
      /before update or delete on public\.partner_order_reconciliations/.test(sqlCode(migSchema)),
    "a rewritable settlement ledger is not a ledger");

  check("M26 the webhook recognises a partner receivable by OUR metadata and returns before any customer branch",
    (() => {
      const code = stripComments(webhook);
      const i = code.indexOf('pawtenant_kind === "partner_receivable"');
      const j = code.indexOf("partner_record_stripe_invoice_paid");
      const k = code.indexOf("findOrderBySubId(invoice.subscription)");
      return i > 0 && j > i && (k === -1 || i < k);
    })(),
    "a business invoice that falls into the customer path would reconcile against a real order");

  // ── 7. PRIVACY ───────────────────────────────────────────────────────────
  check("M27 the submission audit records a LENGTH, never the questionnaire text",
    /'questionnaire_chars', length\(coalesce\(p_questionnaire_text,''\)\)/.test(sqlCode(migSubmit)) &&
      !/'questionnaire', p_questionnaire_text/.test(sqlCode(migSubmit)) &&
      !/jsonb_build_object\([^)]*p_questionnaire_text\)/.test(sqlCode(migSubmit).replace(/'partnerQuestionnaireText', p_questionnaire_text,/g, "")),
    "clinical free text in an audit payload is clinical free text in every audit export");

  check("M28 the audit action stays inside the namespace partner_intake_audit() accepts",
    /'partner_intake_[a-z_]+'/.test(sqlCode(migSubmit)),
    "an action outside ^partner_intake_[a-z_]+$ aborts the whole submission");

  check("M29 no browser surface logs or analyses the questionnaire",
    [wizard, portalOrders, adminIntake, receivables].every((s) => {
      const c = codeOnly(s);
      return !/console\.(log|info|warn|error)\s*\([^)]*questionnaire/i.test(c) &&
        !/(trackEvent|gtag|dataLayer|fbq|analytics)[^\n]*questionnaire/i.test(c);
    }),
    "a debug line is a permanent disclosure");

  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the preview renders the
  // PARSED blocks (question, answer, additional text) — every one a React
  // text child, never HTML.
  check("M30 the questionnaire preview renders as React text children, never as HTML",
    /\{b\.question\}/.test(wizard) && /\{b\.answer\}/.test(wizard) &&
      /\{parsed\.additional\.join\("\\n"\)\}/.test(wizard) &&
      !/dangerouslySetInnerHTML/.test(codeOnly(wizard)),
    "pasted markup must stay inert text");

  check("M31 the edge functions never log the questionnaire or the customer",
    [stripeFn, weeklyFn, inviteFn].every((s) => {
      const c = codeOnly(s);
      return !/console\.[a-z]+\([^)]*(questionnaire|customer|email|first_name|last_name)/i.test(c);
    }),
    "edge function logs are retained");

  // ── 8. UNCHANGED SURFACES ────────────────────────────────────────────────
  check("M32 the branded CUSTOMER assessment document still exists and is still branded",
    /function buildBrandedAssessmentHTML/.test(assess) &&
      /PawTenant ESA Intake Form/.test(assess) &&
      /#FF6A00/.test(assess),
    "customer-facing documents were explicitly out of scope");

  check("M33 the internal document keeps its plain black-and-white format",
    /"Helvetica Neue", Helvetica, Arial, sans-serif/.test(assess) &&
      /letter-spacing: normal/.test(assess) &&
      /size: Letter/.test(assess) &&
      /This document is confidential and intended solely for licensed professionals reviewing this case\./.test(assess),
    "the format the owner asked for");

  // codeOnly: the comment above the import also names the module, so a textual
  // match on the raw file survives deleting the import itself.
  const step2Code = codeOnly(read(F.STEP2));
  check("M34 the customer assessment and the partner form share ONE rule set",
    /import \{[^}]*isOfAssessmentAge[^}]*\} from/.test(stripComments(read(F.STEP2))) &&
      /assessmentIdentityRules/.test(stripComments(read(F.STEP2)).split("\n").filter((l) => l.startsWith("import")).join("\n")) &&
      // and Step 2 must NOT define its own copies any more
      !/function validateAge\s*\(/.test(step2Code) &&
      !/const isValidEmail\s*=/.test(step2Code) &&
      /assessmentIdentityRules/.test(stripComments(wizard)),
    "two copies of 'is this customer 18' is how they start disagreeing");

  // ── 9. ADMIN INVOCATION AUTHORIZATION ────────────────────────────────────
  check("M35 the admin edge functions refuse a project key and re-check the caller's own JWT",
    /bearer === SERVICE_ROLE_KEY \|\| bearer === ANON_KEY/.test(adminAuth) &&
      /asCaller\.rpc\("is_chat_admin"\)/.test(adminAuth) &&
      [stripeFn, inviteFn].every((s) => /requirePartnerPlatformAdmin/.test(codeOnly(s))),
    "verify_jwt=true is satisfied by the PUBLIC anon key; it is not authorization");

  check("M36 the weekly job is gated by a database-verified cron secret, not by a bare anon key",
    /verify_partner_invoice_cron_secret/.test(stripComments(weeklyFn)) &&
      /x-partner-invoice-secret/.test(weeklyFn) &&
      /okSecret !== true/.test(codeOnly(weeklyFn)),
    "an unauthenticated scheduled endpoint bills partners on demand");

  check("M37 the invitation reads the address from the database row, never from the request",
    // stripComments, not codeOnly: the table name IS a string literal.
    /\.from\("partner_users"\)/.test(stripComments(inviteFn)) &&
      /const email = String\(row\.email\)\.toLowerCase\(\)/.test(stripComments(inviteFn)) &&
      !/body\.email/.test(codeOnly(inviteFn)),
    "an invitation redirected by a request body is an account takeover");

  check("M38 no password is generated, stored or transported for a partner user",
    !/(generatePassword|randomPassword|temp_password|tempPassword|password:\s)/i.test(codeOnly(inviteFn)) &&
      /inviteUserByEmail|generateLink/.test(codeOnly(inviteFn)),
    "the task says: do not automate passwords or MFA");

  // ── 10. BEHAVIOURAL: the Stripe description guard actually refuses ───────
  try {
    const mod = await loadEsm(F.STRIPE_SHARED);
    const good = [{ line_id: "1", description: "PT-ABC123 — ESA clinical fulfillment", amount_cents: 5200, service: "esa" }];
    let goodOk = true;
    try { mod.assertNoCustomerData(good); } catch { goodOk = false; }
    const bad = [
      [{ line_id: "1", description: "ESA letter for Jane Doe", amount_cents: 1, service: "esa" }],
      [{ line_id: "1", description: "PT-ABC123 — ESA clinical fulfillment (Milo)", amount_cents: 1, service: "esa" }],
      [{ line_id: "1", description: "PT-ABC123 — ESA clinical fulfillment jane@example.com", amount_cents: 1, service: "esa" }],
      [{ line_id: "1", description: "", amount_cents: 1, service: "esa" }],
    ];
    const refused = bad.filter((lines) => {
      try { mod.assertNoCustomerData(lines); return false; } catch { return true; }
    }).length;
    check("M39 assertNoCustomerData accepts the canonical form and refuses every customer-shaped description",
      goodOk && refused === bad.length,
      `canonical accepted: ${goodOk}; refused ${refused}/${bad.length}`);
  } catch (e) {
    check("M39 assertNoCustomerData accepts the canonical form and refuses every customer-shaped description",
      false, `module did not load: ${e.message}`);
  }

  // ── 11. BEHAVIOURAL: the shared validation rules ─────────────────────────
  try {
    const mod = await loadEsm(F.RULES);
    const base = {
      service: "esa",
      customer: { firstName: "A", lastName: "B", email: "a@b.test", phone: "1", dob: "1990-01-01", state: "NY" },
      pets: [{ name: "P", type: "Dog", age: "1", breed: "Mix" }],
      questionnaire: "1. Q\n   A",
      authorizationConfirmed: true,
    };
    const clean = Object.keys(mod.validatePartnerOrder(base)).length === 0;
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10);
    const cases = [
      ["minor", { ...base, customer: { ...base.customer, dob: minorDob.toISOString().slice(0, 10) } }, "dob"],
      ["bad email", { ...base, customer: { ...base.customer, email: "not-an-email" } }, "email"],
      ["bad state", { ...base, customer: { ...base.customer, state: "ZZ" } }, "state"],
      ["psd cat", { ...base, service: "psd", pets: [{ name: "C", type: "Cat", age: "1", breed: "Tabby" }] }, "pet_0_type"],
      ["four pets", { ...base, pets: [1, 2, 3, 4].map((i) => ({ name: `P${i}`, type: "Dog", age: "1", breed: "Mix" })) }, "pets"],
      ["no questionnaire", { ...base, questionnaire: "   " }, "questionnaire"],
      ["unconfirmed", { ...base, authorizationConfirmed: false }, "authorizationConfirmed"],
    ];
    const missed = cases.filter(([, input, key]) => !mod.validatePartnerOrder(input)[key]).map(([n]) => n);
    check("M40 the shared validator accepts a clean order and names every invalid one",
      clean && missed.length === 0,
      `clean: ${clean}; not caught: ${missed.join(", ") || "none"}`);
  } catch (e) {
    check("M40 the shared validator accepts a clean order and names every invalid one",
      false, `module did not load: ${e.message}`);
  }

  return results;
}

function report(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${label}`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`);
  console.log(`\n  ${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length;
}

// ── Runner ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--self-test")) {
  const CONTROLS = [
    { name: "the manual wizard demands a PDF again", file: F.WIZARD, expect: "M1",
      from: '            <textarea',
      to: '            <input type="file" accept="application/pdf" />\n            <textarea' },
    { name: "the legacy PDF upload control comes back", file: F.WORKSPACE, expect: "M2",
      from: "                  <i className=\"ri-file-add-line\"></i> New Partner Order\n                </button>",
      to: "                  <i className=\"ri-file-add-line\"></i> New Partner Order\n                </button>\n                <button type=\"button\" onClick={() => setLegacyIntakeOpen(true)}>Legacy: PDF upload</button>" },
    { name: "the server accepts a legacy PDF upload again", file: "supabase/functions/partner-manual-intake/index.ts", expect: "M2",
      from: "  if (!LEGACY_INTAKE_READ_ONLY_ACTIONS.has(action)) {",
      to: "  if (false) {" },
    { name: "a partner caller's forged partner id is silently accepted", file: F.MIG_SUBMIT, expect: "M6",
      from: "    if p_partner_id is not null and p_partner_id <> v_actor_partner then\n      raise exception 'partner_mismatch' using errcode = '42501';\n    end if;",
      to: "    if false then\n      raise exception 'partner_mismatch' using errcode = '42501';\n    end if;" },
    { name: "the portal wizard starts sending a partner id", file: F.WIZARD, expect: "M7",
      from: '        p_partner_id: mode === "admin" ? partnerId : null,',
      to: '        p_partner_id: partnerId,' },
    { name: "a partner projection stops filtering by current_partner_id()", file: F.MIG_RPC, expect: "M8",
      from: "   where i.partner_id = public.current_partner_id()\n     and public.current_partner_id() is not null",
      to: "   where i.partner_id is not null" },
    { name: "a new function loses its pinned search_path", file: F.MIG_RPC, expect: "M10",
      from: "create or replace function public.partner_portal_delete_draft(p_draft_id uuid)\nreturns boolean\nlanguage plpgsql\nsecurity definer\nset search_path to 'public','pg_catalog','pg_temp'",
      to: "create or replace function public.partner_portal_delete_draft(p_draft_id uuid)\nreturns boolean\nlanguage plpgsql\nsecurity definer" },
    { name: "an invoicing primitive becomes callable by any signed-in user", file: F.MIG_BILLING, expect: "M11",
      from: "revoke all on function public.partner_record_stripe_invoice_paid(text,integer,text,timestamptz,text) from public, anon, authenticated;",
      to: "revoke all on function public.partner_record_stripe_invoice_paid(text,integer,text,timestamptz,text) from public, anon;" },
    { name: "invoicing reprices from the live rate card instead of the frozen charge", file: F.MIG_BILLING, expect: "M13",
      from: "    select * into v_ev from public.partner_billable_events\n     where order_id = v_oid and event_kind = 'charge' limit 1;",
      to: "    select * into v_ev from public.partner_billable_events\n     where order_id = v_oid and event_kind = 'charge' limit 1;\n    select wholesale_unit_price_cents into v_ev.amount_cents from public.partner_rate_cards where partner_id = p_partner_id limit 1;" },
    { name: "an already-invoiced order can join a second invoice", file: F.MIG_BILLING, expect: "M14",
      from: "    if v_fin.invoice_status <> 'uninvoiced' then",
      to: "    if false then" },
    { name: "the weekly period uniqueness index is dropped", file: F.MIG_SCHEMA, expect: "M15",
      from: "create unique index if not exists partner_invoices_period_uniq",
      to: "create index if not exists partner_invoices_period_uniq" },
    { name: "weekly sending can be enabled without a Stripe customer", file: F.MIG_SCHEMA, expect: "M16",
      from: "    or (active = true and billing_email is not null and stripe_customer_id is not null)",
      to: "    or (active = true)" },
    { name: "the Stripe line description carries the customer name", file: F.MIG_BILLING, expect: "M18",
      from: "            v_conf || ' — ' || upper(v_ev.service) || ' clinical fulfillment',",
      to: "            v_conf || ' — ' || upper(v_ev.service) || ' for ' || (select first_name from public.orders where id = v_oid),", },
    { name: "the pre-send description guard is removed", file: F.STRIPE_SHARED, expect: "M19",
      from: "  assertNoCustomerData(lines);",
      to: "  void lines;" },
    { name: "invoice.paid starts completing the clinical order", file: F.MIG_BILLING, expect: "M21",
      from: "  update public.partner_order_financials\n     set invoice_status = 'invoice_paid_unreconciled'\n   where invoice_id = v_inv.id and invoice_status = 'invoiced';",
      to: "  update public.orders set doctor_status = 'patient_notified' where id in (select order_id from public.partner_order_financials where invoice_id = v_inv.id);\n  update public.partner_order_financials\n     set invoice_status = 'invoice_paid_unreconciled'\n   where invoice_id = v_inv.id and invoice_status = 'invoiced';" },
    { name: "invoice.paid marks the individual orders paid without an admin", file: F.MIG_BILLING, expect: "M22",
      from: "     set invoice_status = 'invoice_paid_unreconciled'\n   where invoice_id = v_inv.id and invoice_status = 'invoiced';",
      to: "     set invoice_status = 'paid'\n   where invoice_id = v_inv.id and invoice_status = 'invoiced';" },
    { name: "manual reconciliation starts creating a provider earning", file: F.MIG_BILLING, expect: "M23",
      from: "    update public.partner_order_financials set invoice_status = 'paid' where order_id = v_oid;",
      to: "    insert into public.doctor_earnings (doctor_user_id, order_id, doctor_amount) values (auth.uid(), v_oid, 30);\n    update public.partner_order_financials set invoice_status = 'paid' where order_id = v_oid;" },
    { name: "the per-order badge falls back to the INVOICE's paid status again",
      file: "src/pages/admin-orders/components/PartnerContributionPanel.tsx", expect: "M23b",
      from: '  if (r.invoice_status === "paid") return { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };\n  if (r.invoice_status === "invoice_paid_unreconciled") {',
      to: '  if (r.invoice_payment_status === "paid") return { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };\n  if (r.invoice_status === "invoice_paid_unreconciled") {' },
    { name: "an order can be settled without a paid invoice", file: F.MIG_BILLING, expect: "M24",
      from: "    if v_fin.invoice_status <> 'invoice_paid_unreconciled' then",
      to: "    if false then" },
    { name: "the reconciliation append-only trigger is dropped", file: F.MIG_SCHEMA, expect: "M25",
      from: "create trigger trg_partner_recon_append_only before update or delete on public.partner_order_reconciliations",
      to: "create trigger trg_partner_recon_append_only before delete on public.partner_order_reconciliations" },
    { name: "the questionnaire text is copied into the audit payload", file: F.MIG_SUBMIT, expect: "M27",
      from: "      'questionnaire_chars', length(coalesce(p_questionnaire_text,'')),",
      to: "      'questionnaire', p_questionnaire_text," },
    { name: "the questionnaire is logged to the console", file: F.WIZARD, expect: "M29",
      from: "    inFlight.current = true;",
      to: "    console.log(\"submitting questionnaire\", questionnaire);\n    inFlight.current = true;" },
    { name: "the questionnaire is rendered as HTML", file: F.WIZARD, expect: "M30",
      from: "            <p className=\"text-sm font-bold text-gray-900 break-words\">{b.question}</p>",
      to: "            <p className=\"text-sm font-bold text-gray-900 break-words\" dangerouslySetInnerHTML={{ __html: b.question }} />" },
    { name: "the internal document reverts to a serif face", file: F.ASSESS, expect: "M33",
      from: '    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;',
      to: "    font-family: Georgia, serif;" },
    { name: "the customer assessment grows its own copy of the age rule again", file: F.STEP2, expect: "M34",
      from: 'import { isValidEmail, isOfAssessmentAge, maxAssessmentDob } from "../../../lib/assessmentIdentityRules";',
      to: "const isValidEmail = (v: string) => v.includes(\"@\");" },
    { name: "an admin edge function accepts a bare project key", file: F.ADMIN_AUTH, expect: "M35",
      from: "  if (!bearer || bearer === SERVICE_ROLE_KEY || bearer === ANON_KEY) {",
      to: "  if (!bearer) {" },
    { name: "the weekly job drops its cron-secret gate", file: F.WEEKLY_FN, expect: "M36",
      from: '  const { data: okSecret } = await service.rpc("verify_partner_invoice_cron_secret", { p_secret: secret });',
      to: "  const okSecret = true; void secret;" },
    { name: "the invitation trusts an address from the request body", file: F.INVITE_FN, expect: "M37",
      from: "  const email = String(row.email).toLowerCase();",
      to: "  const email = String(body.email ?? row.email).toLowerCase();" },
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
  // Never process.exit() here: it would abandon the restore in the finally block.
  process.exitCode = missed || after ? 1 : 0;
} else {
  await runChecks();
  const failed = report("PARTNER PORTAL · MANUAL ORDER · BILLING · SIMPLE ASSESSMENT");
  process.exitCode = failed ? 1 : 0;
}
