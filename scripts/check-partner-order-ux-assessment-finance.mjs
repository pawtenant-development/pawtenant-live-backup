#!/usr/bin/env node
/**
 * check-partner-order-ux-assessment-finance.mjs
 *
 * PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — build guard.
 *
 * Proves, against the real source (bundled with esbuild where behaviour is
 * asserted) that:
 *   Q  the pasted questionnaire parser is lossless, ordered, HTML-inert, and
 *      never renders an empty section when raw text exists;
 *   B  the partner assessment (screen + PDF) carries no PawTenant identity, no
 *      partner identity and no economics, while the direct-customer document
 *      stays branded;
 *   N  every customer-communication entry point refuses partner orders, the
 *      partner contact is the ONLY completion recipient, and the provider's
 *      submission language is neutral on partner cases;
 *   A  authorization is derived server-side (admin / correct partner /
 *      assigned provider) and the partner chip is admin-only;
 *   F  contribution = frozen charge − provider cost − adjustments, provider
 *      cost excludes voided earnings, adjustments apply once, unreconciled
 *      orders are flagged, invoice-paid ≠ manually-paid;
 *   O  partner orders sit in the main Orders list with a Partner Orders KPI
 *      whose count IS the list predicate, are never leads, and never move off
 *      their creation day;
 *   U  the Partner Platform UI contract (collapsed filters, keyboard rows,
 *      no legacy PDF control, Overview without technical material, Settings
 *      with the technical sections, neutral attestation, retired intake 410).
 *
 * `--self-test` plants each failure into the real source and asserts detection.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const F = {
  PARSER: "src/lib/partnerQuestionnaire.ts",
  PARTNER_ORDER: "src/lib/partnerOrder.ts",
  DIRECTORY: "src/lib/partnerDirectory.ts",
  LIFECYCLE: "src/lib/orderLifecycle.ts",
  ASSESS: "src/pages/admin-orders/components/assessmentUtils.ts",
  NEUTRAL: "src/components/partner/PartnerNeutralAssessment.tsx",
  MODAL: "src/pages/admin-orders/components/OrderDetailModal.tsx",
  PROVIDER_DETAIL: "src/pages/provider-portal/components/ProviderOrderDetail.tsx",
  PROVIDER_PAGE: "src/pages/provider-portal/page.tsx",
  ESA_VIEW: "src/pages/admin-orders/components/EsaIntakeView.tsx",
  PAYMENTS: "src/pages/admin-orders/components/PaymentHistoryTab.tsx",
  FUNDING: "src/pages/admin-orders/components/PartnerFundingSummary.tsx",
  FACETS: "src/pages/admin-orders/orderFacetCounts.ts",
  PAGE: "src/pages/admin-orders/page.tsx",
  CARD: "src/pages/admin-orders/components/OrderCard.tsx",
  ORDERS_TAB: "src/pages/admin-orders/components/PartnerOrdersTab.tsx",
  WORKSPACE: "src/pages/admin-orders/components/partner-platform/PartnerPlatformWorkspace.tsx",
  OVERVIEW: "src/pages/admin-orders/components/partner-platform/PartnerOverviewTab.tsx",
  SETTINGS: "src/pages/admin-orders/components/partner-platform/PartnerSettingsTab.tsx",
  FINANCE: "src/pages/admin-orders/components/partner-platform/PartnerFinanceTab.tsx",
  RECEIVABLES: "src/pages/admin-orders/components/partner-platform/PartnerReceivablesPanel.tsx",
  HISTORY: "src/pages/admin-orders/components/partner-platform/PartnerLegacyIntakeHistory.tsx",
  WIZARD: "src/components/partner/PartnerOrderWizard.tsx",
  PORTAL_ORDERS: "src/pages/partner-portal/components/PartnerPortalOrders.tsx",
  MY_ORDERS: "src/pages/my-orders/page.tsx",
  MIG: "supabase/migrations/20260911210000_partner_order_ux_assessment_finance_repair.sql",
  MIG_FOUNDATION: "supabase/migrations/20260818183659_partner_clinical_fulfillment_foundation.sql",
  MIG_BILLING: "supabase/migrations/20260911190300_partner_stripe_invoicing_and_reconciliation.sql",
  GATE: "supabase/functions/_shared/partnerCommsGate.ts",
  NPL: "supabase/functions/notify-patient-letter/index.ts",
  INTAKE_FN: "supabase/functions/partner-manual-intake/index.ts",
  PORTAL_DOC_FN: "supabase/functions/partner-portal-document/index.ts",
  PKG: "package.json",
};

/** Newly gated customer emitters: gate import + call BEFORE the send anchor, and a live refusal branch. */
const GATED = [
  { file: "supabase/functions/send-sms/index.ts", anchor: "api.twilio.com" },
  { file: "supabase/functions/bulk-sms/index.ts", anchor: "api.twilio.com" },
  // broadcast-email: the admin TEST send precedes the gate by design; the customer send is the batch loop.
  { file: "supabase/functions/broadcast-email/index.ts", anchor: "batch.map(async (recipient) =>" },
  { file: "supabase/functions/send-resume-checkout-email/index.ts", anchor: "sendEmailViaResend(" },
  // notify-customer-refund: the Resend helper is DEFINED above; the customer send is its call site.
  { file: "supabase/functions/notify-customer-refund/index.ts", anchor: "sendViaResend({ to: order.email" },
  { file: "supabase/functions/send-customer-otp/index.ts", anchor: "api.resend.com" },
  { file: "supabase/functions/request-customer-password-reset/index.ts", anchor: "api.resend.com" },
  { file: "supabase/functions/send-customer-password-reset/index.ts", anchor: "api.resend.com" },
  { file: "supabase/functions/create-customer-account/index.ts", anchor: "api.resend.com" },
];

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeOnly = (s) => stripComments(s)
  .replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
const sqlCode = (s) => s.replace(/--[^\n]*/g, "");

async function bundle(rel) {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, rel)], bundle: true, write: false, format: "esm",
    platform: "neutral", target: "es2022", logLevel: "silent",
    // React / supabase are never executed here; the modules under test are pure.
    external: ["react", "react-dom", "react/jsx-runtime", "@supabase/supabase-js", "https://esm.sh/@supabase/supabase-js@2"],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

// Synthetic questionnaire with every shape the task names. No real answers.
const FIXTURE = [
  "1 How often do you feel worried or low?", "Often - most days",
  "2 Which of the following apply? (Select all that apply)", "Worry or unease; Low mood; Trouble sleeping; Social", "withdrawal or isolation",
  "3 Have you had a major life change that is affecting you or", "causing stress?", "Yes - recently and still adjusting",
  "4 How long have you noticed these challenges?", "6-12 months",
  "5 How many hours do you sleep on a typical night?", "6 hours or more",
  "6 Are you currently taking any prescribed medication?", "No, never prescribed", "",
  "7 In your own words, please describe what you are going through.", "I moved out on my own recently. I am not used to being alone", "and I have random worries about affording things", "in order to stay living on my own", "",
  "8 What type of housing do you live in?", "Apartment with a no-pet policy",
  "9 Any other comments?", "2 dogs at home",
  "10 Are you currently having thoughts of harming yourself or others?", "No",
  "11 Eleventh question with more words?", "Answer eleven",
  "12 Twelfth question with more words?", "Answer twelve",
  "13 Thirteenth question with more words?", "Answer thirteen",
].join("\n");

const HOSTILE = "1 Do you have <script>alert(1)</script> issues?\n<img src=x onerror=alert(1)>\n2 Next question here?\n</td></tr><style>body{display:none}</style>";

function partnerOrder(extra = {}) {
  return {
    confirmation_id: "PT-GUARD001", first_name: "Zo", last_name: "Guard", email: "zo@example.invalid", phone: "555",
    state: "TX", created_at: "2026-09-11T12:00:00Z", letter_type: "esa",
    order_origin: "partner", partner_id: "00000000-0000-0000-0000-000000000001", partner_order_id: "PARTNER-REF-77",
    assessment_answers: {
      dob: "1990-01-01", pets: [{ name: "Milo", type: "Dog", breed: "Mix", age: "4", weight: "20" }],
      partnerQuestionnaireText: FIXTURE, partnerIntakeChannel: "partner_portal_manual", source: "partner_manual",
      consents: { partnerSubmissionAuthorization: { accepted: true, at: "2026-09-11T12:00:00Z" } },
    },
    ...extra,
  };
}

async function runChecks() {
  results.length = 0;

  // ── Q. Questionnaire ──────────────────────────────────────────────────────
  const P = await bundle(F.PARSER);
  const p = P.parsePartnerQuestionnaire(FIXTURE);
  check("Q1 numbered questions 1–13 parse in order, with a wrapped question joined",
    p.blocks.length === 13 && p.blocks.every((b, i) => b.number === i + 1) &&
      p.blocks[2].question === "Have you had a major life change that is affecting you or causing stress?" &&
      p.blocks[3].answer === "6-12 months" && p.blocks[4].answer === "6 hours or more" && p.blocks[8].answer === "2 dogs at home",
    JSON.stringify(p.blocks.map((b) => [b.number, b.answer.slice(0, 20)])));
  check("Q2 multi-line narrative answers keep their line breaks",
    p.blocks[6].answer.split("\n").length === 3 && p.blocks[6].answer.startsWith("I moved out"));
  check("Q3 blank lines between blocks drop nothing (lossless)",
    P.questionnaireIsLossless(FIXTURE, p) && p.additional.length === 0);
  check("Q4 semicolon-separated selections are kept verbatim",
    p.blocks[1].answer === "Worry or unease; Low mood; Trouble sleeping; Social\nwithdrawal or isolation");
  const malformed = P.parsePartnerQuestionnaire("Hello this is not a questionnaire\njust some notes\nabout the customer");
  check("Q5 malformed text falls back to Additional Questionnaire Information, nothing dropped",
    malformed.blocks.length === 0 && malformed.additional.length === 3 &&
      P.questionnaireIsLossless("Hello this is not a questionnaire\njust some notes\nabout the customer", malformed));
  const hostile = P.parsePartnerQuestionnaire(HOSTILE);
  check("Q6a hostile input is kept as TEXT by the parser (never interpreted)",
    hostile.blocks.length === 2 && hostile.blocks[0].answer === "<img src=x onerror=alert(1)>" && P.questionnaireIsLossless(HOSTILE, hostile));
  const dropped = { ...p, blocks: p.blocks.slice(0, 12) };
  const invented = { ...p, blocks: p.blocks.map((b, i) => (i === 0 ? { ...b, answer: b.answer + " and invented text" } : b)) };
  check("Q8 the lossless check rejects a dropped answer AND an invented one",
    P.questionnaireIsLossless(FIXTURE, dropped) === false && P.questionnaireIsLossless(FIXTURE, invented) === false);
  const resolved = P.resolvePartnerQuestionnaire({ partnerQuestionnaireText: FIXTURE, partnerQuestionnaireBlocks: [{ number: 1, question: "Tampered", answer: "x" }] });
  check("Q7 raw text present + stored blocks that do not match → the raw text wins (never empty)",
    resolved && resolved.blocks.length === 13);
  check("Q7b no raw text → null; raw text → always renderable content",
    P.resolvePartnerQuestionnaire({}) === null && P.resolvePartnerQuestionnaire({ partnerQuestionnaireText: "   " }) === null &&
      (P.resolvePartnerQuestionnaire({ partnerQuestionnaireText: "x" })?.additional.length ?? 0) === 1);
  const mig = sqlCode(read(F.MIG));
  check("Q9 the database re-checks losslessness before storing blocks and refuses otherwise",
    /create or replace function public\.partner_questionnaire_blocks_lossless/.test(mig) &&
      /raise exception 'questionnaire_blocks_not_lossless'/.test(mig) &&
      /p_questionnaire_blocks jsonb default null/.test(mig) &&
      /'partnerQuestionnaireText', p_questionnaire_text/.test(mig));

  // ── B. Branding (screen + PDF) ───────────────────────────────────────────
  const A = await bundle(F.ASSESS);
  const internal = A.buildPrintHTML(partnerOrder());
  const outsideStyle = internal.replace(/<style>[\s\S]*?<\/style>/g, "");
  check("B1 the partner PDF renders every question and answer, numbered, with no brand or economics",
    /<span class="num">13\.<\/span>/.test(internal) && /Thirteenth question with more words\?/.test(internal) &&
      /Answer thirteen/.test(internal) && /6-12 months/.test(internal) && /withdrawal or isolation/.test(internal) &&
      !/PawTenant|pawtenant\.com|readdy|#FF6A00|PARTNER-REF-77|Partner Case Reference|wholesale|invoice|\$\d/i.test(outsideStyle));
  const hostileDoc = A.buildPrintHTML(partnerOrder({ assessment_answers: { ...partnerOrder().assessment_answers, partnerQuestionnaireText: HOSTILE } }));
  check("Q6b hostile pasted text is escaped in the PDF (no live tags, body stays visible)",
    !/<script>alert\(1\)<\/script>/.test(hostileDoc) && /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(hostileDoc) &&
      !/<img src=x/.test(hostileDoc) && /&lt;img src=x/.test(hostileDoc) && !/<style>body\{display:none\}/.test(hostileDoc));
  const direct = A.buildPrintHTML({ ...partnerOrder(), order_origin: "direct", partner_id: null, partner_order_id: null,
    assessment_answers: { dob: "1990-01-01", pets: [], emotionalFrequency: "often", consents: {} } }, undefined, "customer");
  check("B2 the direct-customer assessment stays branded", /PawTenant ESA Intake Form/.test(direct));
  const neutral = read(F.NEUTRAL);
  const neutralCode = codeOnly(neutral);
  check("B3 the on-screen neutral assessment has no company name, logo, orange accent, partner name or economics",
    !/PawTenant|pawtenant/.test(neutral.replace(/^\/\/.*$/gm, "")) && !/LOGO_URL|readdy|orange-|#FF6A00|#F97316/i.test(neutral) &&
      !/partner_order_id|partner_reference|display_name|wholesale|invoice|contribution|price/i.test(neutralCode) &&
      /Additional Questionnaire Information/.test(neutral) && /\{b\.number\}/.test(neutral) &&
      !/dangerouslySetInnerHTML/.test(neutralCode) && /buildAssessmentDocumentModel\(/.test(neutralCode),
    "");
  check("B3b the neutral assessment uses the SAME canonical data as the PDF (one parser, one resolver)",
    /resolvePartnerQuestionnaire/.test(codeOnly(read(F.ASSESS))) && /from "\.\.\/\.\.\/\.\.\/lib\/partnerQuestionnaire"/.test(read(F.ASSESS)));
  const providerDetail = read(F.PROVIDER_DETAIL);
  check("B4 the provider bundle carries no partner identity, reference or economics",
    !/partner_order_id|partner_reference|partnerDisplayName|wholesale|invoice_status|fulfillment_margin|partner_order_financials|usePartnerDirectory/.test(codeOnly(providerDetail)) &&
      !/usePartnerDirectory|PARTNER_ORDER_INDICATOR/.test(read(F.PROVIDER_PAGE)));
  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the neutral assessment
  // is mounted for EVERY order on every internal surface (no partner branch).
  check("Q10 admin modal, provider detail and the shared intake view mount the neutral assessment for every order",
    /<PartnerNeutralAssessment order=\{order\} audience="admin" showDownload \/>/.test(read(F.MODAL)) && !/isPartnerOrder \? \(\s*<PartnerNeutralAssessment/.test(read(F.MODAL)) &&
      /<PartnerNeutralAssessment order=\{order\} showDownload \/>/.test(providerDetail) && !/isPartnerCase/.test(providerDetail) &&
      /if \(isPartnerOrder\(order\) \|\| variant === "admin"\)/.test(read(F.ESA_VIEW)));

  // ── N. Notifications ─────────────────────────────────────────────────────
  for (const g of GATED) {
    const src = stripComments(read(g.file));
    const gateAt = Math.min(...["gateCustomerContact(", "gateCustomerContactIdentity("].map((s) => src.indexOf(s)).filter((i) => i >= 0), Infinity);
    const anchorAt = src.indexOf(g.anchor);
    check(`N1 ${g.file.split("/")[2]} gates partner customers BEFORE its send, with a live refusal branch`,
      /partnerCommsGate\.ts/.test(src) && gateAt !== Infinity && anchorAt > gateAt && /if \(!contactGate\.allowed\)|if \(gate\.allowed\)/.test(src),
      `gate@${gateAt} send@${anchorAt}`);
  }
  const npl = stripComments(read(F.NPL));
  const partnerBlockStart = npl.indexOf("let partnerContactNotified = false;");
  const partnerBlockEnd = npl.indexOf("partnerContactNotified,", partnerBlockStart);
  const partnerBlock = partnerBlockStart >= 0 ? npl.slice(partnerBlockStart, partnerBlockEnd) : "";
  check("N2 clinical completion notifies ONLY the configured partner contact, with the minimum necessary content",
    partnerBlock.length > 0 && /completion_notification_email/.test(partnerBlock) && /evaluateNotificationSuppression\(contact\)/.test(partnerBlock) &&
      /confirmationId/.test(partnerBlock) && /partner-portal/.test(partnerBlock) &&
      !/order\.email|order\.first_name|order\.last_name|partnerQuestionnaire|doctor_amount|wholesale|per_order_rate|doctor_name/.test(partnerBlock) &&
      /to: \[contact\]/.test(partnerBlock),
    partnerBlock.length === 0 ? "partner contact block missing" : "");
  check("N2b the partner arm still never emails the customer or stamps patient_notification_sent_at",
    /if \(!contactGate\.allowed\) \{/.test(npl) && !/patient_notification_sent_at/.test(npl.slice(npl.indexOf("if (!contactGate.allowed) {"), partnerBlockEnd)));
  check("N3 on EVERY case the provider submits FOR REVIEW with an internal note — never 'Notify Patient'",
    !/isPartnerCase|isPartnerOriginOrder/.test(providerDetail) &&
      /Internal Note \(Optional\)/.test(providerDetail) && !/Personal Note to Patient/.test(providerDetail) &&
      /<><i className="ri-send-plane-line"><\/i>Submit \{[^}]+\} Document[^<]*for Review<\/>/.test(providerDetail) &&
      !/Notify Patient|Submit & Complete|Complete Order\?/.test(stripComments(providerDetail)));
  check("N4 admin_force_complete_order never asks the client to notify a partner order's customer",
    /v_notify\s+:= v_has_doc AND coalesce\(v_order\.order_origin, 'direct'\) <> 'partner';/.test(mig) &&
      /'notify_customer', v_notify,/.test(mig) && /'customer_notification_allowed',\s+v_notify,/.test(mig));
  const G = await bundle(F.GATE);
  const fakeClient = (rows, error = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ or: () => ({ limit: async () => ({ data: rows, error }) }) }) }) }),
  });
  const refused = await G.mayContactCustomerIdentity(fakeClient([{ id: "o1", confirmation_id: "PT-X", email: "p@x.test", phone: "+1 555 000 1234", order_origin: "partner", partner_id: "p", partner_communication_policy: "partner_managed" }]), { email: "P@x.test" });
  const allowed = await G.mayContactCustomerIdentity(fakeClient([]), { email: "d@x.test" });
  const unresolved = await G.mayContactCustomerIdentity(fakeClient(null, { message: "boom" }), { email: "d@x.test" });
  const noIdentity = await G.mayContactCustomerIdentity(fakeClient([]), {});
  check("N6 the identity gate refuses a partner-managed identity, allows a clean one, and FAILS CLOSED on error / no identity",
    refused.allowed === false && refused.reason === G.PARTNER_COMMS_REFUSAL && refused.orderId === "o1" &&
      allowed.allowed === true && unresolved.allowed === false && unresolved.reason === G.PARTNER_COMMS_UNRESOLVED &&
      noIdentity.allowed === false);
  const phoneRefused = await G.mayContactCustomerIdentity(fakeClient([{ id: "o2", confirmation_id: "PT-Y", email: "z@x.test", phone: "(555) 000-1234", order_origin: "partner", partner_id: "p" }]), { phone: "5550001234" });
  check("N6b the identity gate matches a phone number regardless of formatting", phoneRefused.allowed === false);
  // Clinical completion is retryable (admin force-complete, provider re-submit,
  // the ordinary notify path). The partner notice must be claimed once per
  // order BEFORE the send, so a retry sends nothing.
  const claimIdx = partnerBlock.indexOf("reserveEmailSend(");
  const sendIdx = partnerBlock.indexOf("sendEmailViaResend(");
  check("N7 the partner completion notice claims a permanent per-order key BEFORE the send, and sends nothing on a retry",
    claimIdx >= 0 && sendIdx >= 0 && claimIdx < sendIdx &&
      /`\$\{confirmationId\}:partner_completion`/.test(partnerBlock) &&
      /slug: "partner_completion"/.test(partnerBlock) &&
      /if \(!reservePartner\.proceed\)/.test(partnerBlock) &&
      // No Date.now()/bucketing: a partner completion is once per order, unlike
      // letter_delivery, whose key is time-bucketed so an admin CAN resend.
      !/Date\.now\(\)|randomUUID/.test(partnerBlock.slice(0, sendIdx)),
    claimIdx < 0 ? "no reservation" : (claimIdx > sendIdx ? "claim AFTER send" : ""));
  check("N7b every partner-completion outcome finalises its claim — a thrown send releases it, never a stuck 'sending'",
    (partnerBlock.match(/finalizeEmailSend\(/g) ?? []).length >= 3 &&
      /catch \(sendErr\) \{[\s\S]*?finalizeEmailSend\(/.test(partnerBlock) &&
      // Suppressed is recorded as NOT delivered — never as a successful send.
      /success: false,\s*\n\s*body: html,\s*\n\s*errorMessage: `SUPPRESSED/.test(partnerBlock) &&
      /allowRetryAfterFailed: true/.test(partnerBlock));

  // ── M. Migration surface ─────────────────────────────────────────────────
  // This closure is code-only. Later, separately approved migrations may exist,
  // but the closure migration itself must remain the last migration owned by
  // this task. Keep the explicit allowlist narrow so a planted/unknown migration
  // is still caught.
  const migFiles = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const allowedAfterClosure = new Set([
    "20260915013358_sync_reassigned_additional_pet_into_assessment.sql",
    "20260915054500_additional_pet_reassignment_privacy_earnings_price.sql",
    "20260915061500_additional_pet_full_case_assignment_message.sql",
  ]);
  const unexpectedAfterClosure = migFiles.filter((f) =>
    f > "20260911210000_partner_order_ux_assessment_finance_repair.sql" && !allowedAfterClosure.has(f));
  check("M1 the closure introduces no migration; only separately approved later migrations exist",
    unexpectedAfterClosure.length === 0, `unexpected=${unexpectedAfterClosure.join(",") || "none"}`);

  // ── A. Authorization ─────────────────────────────────────────────────────
  check("A1 every new database function pins search_path and is revoked from anon; the lossless helper is not client-callable",
    (mig.match(/set search_path to 'public', 'pg_catalog', 'pg_temp'/g) ?? []).length >= 8 &&
      /revoke all on function public\.partner_questionnaire_blocks_lossless\(text, jsonb, jsonb\) from public, anon, authenticated;/.test(mig) &&
      /revoke all on function public\.partner_admin_store_questionnaire_blocks\(uuid, jsonb, jsonb\) from public, anon;/.test(mig) &&
      /revoke all on function public\.partner_admin_order_finance\(uuid\) from public, anon;/.test(mig) &&
      /revoke all on function public\.partner_admin_billing_summary\(uuid\) from public, anon;/.test(mig));
  check("A1b admin finance/questionnaire functions gate on is_chat_admin(); the portal projection on current_partner_id()",
    (mig.match(/if not coalesce\(public\.is_chat_admin\(\), false\) then/g) ?? []).length >= 5 &&
      /and o\.partner_id = public\.current_partner_id\(\)\s+and public\.current_partner_id\(\) is not null/.test(mig) &&
      /if v_order\.order_origin is distinct from 'partner' or v_order\.partner_id is null then/.test(mig));
  const portalFn = stripComments(read(F.PORTAL_DOC_FN));
  check("A2 the partner-portal document function derives the partner from the SESSION and scopes the order to it",
    /bearer === SERVICE_ROLE_KEY \|\| bearer === ANON_KEY/.test(portalFn) && /rpc\("partner_portal_context"\)/.test(portalFn) &&
      /\.eq\("order_origin", "partner"\)\s*\.eq\("partner_id", partnerId\)/.test(portalFn) &&
      !/body\.partner_id|req\.headers\.get\("x-partner/.test(portalFn) && /handleDocumentRetrieval\(/.test(portalFn));
  check("A4 the Partner Order chip and partner directory are admin-only (never imported by provider, customer or partner-portal code)",
    /usePartnerDirectory/.test(read(F.CARD)) && /PARTNER_ORDER_INDICATOR/.test(read(F.CARD)) &&
      ![F.PROVIDER_PAGE, F.PROVIDER_DETAIL, F.MY_ORDERS, F.PORTAL_ORDERS].some((f) => /partnerDirectory|PARTNER_ORDER_INDICATOR/.test(read(f))));

  // ── F. Finance ───────────────────────────────────────────────────────────
  check("F1 per-order contribution = frozen charge − provider cost + credits, and the summary nets the same way",
    /coalesce\(b\.wholesale_fee_cents, 0\) - coalesce\(c\.cents, 0\) \+ coalesce\(a\.cents, 0\)/.test(mig) &&
      /coalesce\(f\.charges_c,0\) - coalesce\(f\.cost_c,0\) \+ coalesce\(f\.adj_c,0\)/.test(mig));
  check("F2 provider cost comes from the payout ledger and excludes cancelled / voided / refunded earnings",
    /from public\.doctor_earnings d\s+where coalesce\(d\.status, ''\) not in \('cancelled', 'voided', 'refunded'\)\s+group by d\.order_id/.test(mig));
  check("F3 adjustments are credit events only (applied once, per order)",
    /where c\.event_kind = 'credit'\s+group by c\.order_id/.test(mig) && !/event_kind = 'charge'\s+group by c\.order_id/.test(mig));
  check("F4 unreconciled orders are FLAGGED, never guessed",
    /\(b\.fin_order_id is null\) or \(b\.billable_status = 'billable' and c\.rows_n is null\)/.test(mig) &&
      /'no provider cost evidence'/.test(mig) && /'no financial snapshot'/.test(mig) &&
      /orders_needing_reconciliation/.test(mig));
  check("F5 the billing summary counts charges, provider cost and adjustments over the SAME billable orders, and reports the pending pipeline separately",
    /sum\(r\.charge_cents\) filter \(where r\.billable_status = 'billable'\)/.test(mig) &&
      /sum\(r\.provider_cost_cents\) filter \(where r\.billable_status = 'billable'\)/.test(mig) &&
      /sum\(r\.adjustments_cents\) filter \(where r\.billable_status = 'billable'\)/.test(mig) &&
      /in_progress_charges_cents/.test(mig) && /r\.billable_status = 'pending'/.test(mig));
  check("F6 invoice-paid and manually-marked-paid stay separate states",
    /'invoice_paid_unreconciled'/.test(sqlCode(read(F.MIG_BILLING))) && /manual_paid_at timestamptz, manual_paid_by text/.test(mig) &&
      /from public\.partner_order_reconciliations r/.test(mig));
  check("F7 the frozen partner charge is immutable after acceptance",
    /new\.wholesale_fee_cents\s+is distinct from old\.wholesale_fee_cents/.test(sqlCode(read(F.MIG_FOUNDATION))) &&
      /provider_earning_snapshot_cents = coalesce\(provider_earning_snapshot_cents, v_provider_cents\)/.test(mig));
  const payments = read(F.PAYMENTS);
  const funding = read(F.FUNDING);
  check("F8 the Payments tab shows partner funding for a partner order — no customer warning, no recovery actions",
    /if \(isPartnerOrder\(order\)\) \{\s*return \(/.test(payments) && /<PartnerFundingSummary orderId=\{order\.id\} \/>/.test(payments) &&
      stripComments(payments).indexOf("if (isPartnerOrder(order)) {") < stripComments(payments).indexOf("No Payment Received Yet") &&
      !/Retry Payment|Discount Recovery|No Payment Received|payment_attempts|send-checkout-recovery/.test(stripComments(funding)) &&
      /partner_admin_order_finance/.test(funding) && /Net partner contribution/.test(funding) && /Needs financial reconciliation/.test(funding));
  check("F8b the Finance tab reads the same per-order server rows and flags reconciliation",
    /rpc\("partner_admin_order_finance_rows"/.test(read(F.FINANCE)) && /Needs financial reconciliation/.test(read(F.FINANCE)) &&
      /orders_needing_reconciliation/.test(read(F.RECEIVABLES)) && /in_progress_charges_cents/.test(read(F.RECEIVABLES)));

  // ── O. Main Orders list + KPI + creation date ────────────────────────────
  const facets = read(F.FACETS);
  const facetsCode = stripComments(facets);
  check("O1 Partner Orders is a KPI card that opens the partner origin on the All tab; retail cards stay direct",
    /"partner_orders"/.test(facetsCode) && /partner_orders: "Partner Orders"/.test(facetsCode) &&
      /if \(key === "partner_orders"\) return \{ statusFilter: "all", orderOrigin: "partner" \};/.test(facetsCode) &&
      /return \{ statusFilter: key, orderOrigin: "direct" \};/.test(facetsCode) && /partner_orders: "created"/.test(facetsCode) &&
      /partner_orders: "event"/.test(facetsCode));
  check("O2 'paid' recognises a partner-funded order everywhere; 'lead' never includes one",
    /export const CONFIRMED_PAYMENT_ARM =\s*"payment_intent_id\.not\.is\.null,and\(order_origin\.eq\.partner,paid_at\.not\.is\.null\)"/.test(facetsCode) &&
      /case "lead_unpaid":[^\n]*\n\s*return q\.or\(`status\.eq\.lead,\$\{NO_CONFIRMED_PAYMENT_ARM\}`\);/.test(facetsCode) &&
      (facetsCode.match(/requireConfirmedPayment\(q\)/g) ?? []).length >= 4 &&
      /if \(f\.payment === "paid"\) q = requireConfirmedPayment\(q\);/.test(facetsCode) &&
      /`and\(or\(\$\{CONFIRMED_PAYMENT_ARM\}\)`/.test(facetsCode));
  check("O2b the KPI count IS the list predicate for every card (built through kpiCardListSelection + applyListPredicates)",
    /const sel = kpiCardListSelection\(k\);/.test(facetsCode) && /applyListPredicates\(newCountQuery\(\), \{/.test(facetsCode));
  const page = stripComments(read(F.PAGE));
  // A direct load of ?kpi=partner_orders must seed the tab AND the origin
  // through the same mapping a click uses (browser QA found the list empty
  // under a card reading 2 when the status was seeded from the raw key).
  check("O3 the main list carries an explicit origin filter (default both, seeded from ?kpi= via kpiCardListSelection) and the six-card banner",
    /useState<OrderOriginFilter>\(\(\) => \{\s*const seeded = readKpiParam\(window\.location\.search\);\s*return seeded \? kpiCardListSelection\(seeded\)\.orderOrigin : "all";/.test(page) &&
      /useState<string>\(\(\) => \{\s*const seeded = readKpiParam\(window\.location\.search\);\s*return seeded \? kpiCardListSelection\(seeded\)\.statusFilter : "all";/.test(page) &&
      /orderOrigin: originFilter,/.test(page) && /partnerId: partnerIdFilter,/.test(page) &&
      /lg:grid-cols-6/.test(page) && /key: "partner_orders" as KpiCardKey/.test(page) &&
      /const sel = kpiCardListSelection\(key\);\s*setStatusFilter\(sel\.statusFilter\);\s*setOriginFilter\(sel\.orderOrigin\);/.test(page) &&
      /<option value="partner">Partner orders<\/option>/.test(page));
  const card = stripComments(read(F.CARD));
  check("O4 the list card never treats a partner-funded order as a lead, and labels it Partner Order + brand",
    /const isLead = order\.status === "lead" \|\| !hasConfirmedPayment\(order\);/.test(card) &&
      /if \(o\.status === "lead" \|\| !hasConfirmedPayment\(o\)\)/.test(card) &&
      (card.match(/\{PARTNER_ORDER_INDICATOR\} · \{partnerBrand\}/g) ?? []).length === 3 &&
      /const isLead = order\.status === "lead" \|\| !hasConfirmedPayment\(order\);/.test(page));
  const L = await bundle(F.LIFECYCLE);
  const partnerPaid = { order_origin: "partner", partner_id: "p", paid_at: "2026-08-01T00:00:00Z", payment_intent_id: null, status: "processing", doctor_status: "pending_review", created_at: "2026-08-01T00:00:00Z" };
  const directUnpaid = { order_origin: "direct", paid_at: null, payment_intent_id: null, status: "processing", doctor_status: null, created_at: "2026-08-01T00:00:00Z" };
  check("O5 the client workflow classifier: a partner-funded order is paid_unassigned, a direct order without a PaymentIntent is a lead",
    L.orderWorkflowState(partnerPaid) === "paid_unassigned" && L.orderWorkflowState(directUnpaid) === "lead" &&
      L.orderWorkflowState({ ...partnerPaid, doctor_email: "d@x.test" }) === "under_review");
  const moved = { ...partnerPaid, doctor_status: "patient_notified", last_completed_at: "2026-09-11T15:00:00Z", last_meaningful_activity_at: "2026-09-11T15:00:00Z", last_under_review_entered_at: "2026-09-11T14:00:00Z", paid_at: "2026-09-11T13:00:00Z" };
  check("O6 an old partner order stays on its creation day after assignment / completion / activity / payment marking",
    L.orderGroupingIso(moved, "created") === "2026-08-01T00:00:00Z" &&
      /orderGroupingIso\(order, "created"\)/.test(page) && /orderComparator\("created"\)\(a, b\)/.test(page) &&
      /const ordered = base\.order\("created_at", \{ ascending: asc \}\);/.test(page) &&
      !/orderGroupingIso\(order, (dateBasis|effDateBasis)\)/.test(page));
  const PO = await bundle(F.PARTNER_ORDER);
  check("O7 the shared partner-order helper fails closed (both facts required) and treats partner paid_at as confirmed payment",
    PO.isPartnerOrder({ order_origin: "partner", partner_id: "p" }) === true && PO.isPartnerOrder({ order_origin: "partner" }) === false &&
      PO.isPartnerOrder({ partner_id: "p" }) === false && PO.hasConfirmedPayment(partnerPaid) === true &&
      PO.hasConfirmedPayment({ order_origin: "partner", partner_id: "p", paid_at: null }) === false &&
      PO.hasConfirmedPayment({ order_origin: "direct", paid_at: "2026-01-01" }) === false && PO.partnerIntakeMethodLabel("bogus") === "unknown");

  // ── U. Partner Platform + portal UI ──────────────────────────────────────
  const ordersTab = read(F.ORDERS_TAB);
  check("U1 Partner Orders filters are collapsible, collapsed by default, count active filters, keep Clear filters, and rows work by keyboard",
    /useState<boolean>\(false\);\s*$/m.test(ordersTab.slice(ordersTab.indexOf("const [filtersOpen, setFiltersOpen]"), ordersTab.indexOf("const [filtersOpen, setFiltersOpen]") + 80)) &&
      /activeFilterCount > 0 && \(/.test(ordersTab) && /Clear filters/.test(ordersTab) && /\{filtersOpen && \(/.test(ordersTab) &&
      /onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter" \|\| e\.key === " "\) \{ e\.preventDefault\(\); onOpenOrder\(o\); \} \}\}/.test(ordersTab) &&
      /tabIndex=\{0\}\s*role="button"/.test(ordersTab));
  const overview = read(F.OVERVIEW);
  const settings = read(F.SETTINGS);
  check("U2 Overview shows business information only; the technical material lives under Settings behind collapsible sections",
    !/Sandbox onboarding checklist/.test(stripComments(overview).replace(/checklistRetired[\s\S]*?\}, \[partner, state\]\);/, "")) &&
      !/label="API access"|label="Webhooks"|label="Last API \/ webhook"/.test(overview) &&
      /<PartnerOnboardingChecklist partner=\{selected\} \/>/.test(settings) && /<PartnerLegacyIntakeHistory partner=\{selected\}/.test(settings) &&
      /<PartnerCompletionContact partner=\{selected\} \/>/.test(settings) &&
      (settings.match(/<CollapsibleSection/g) ?? []).length >= 6 && /tone="history"/.test(settings));
  check("U3 the legacy PDF upload control is gone from the workspace",
    !/Legacy: PDF upload|setLegacyIntakeOpen|<PartnerManualIntake/.test(read(F.WORKSPACE)));
  const wizard = read(F.WIZARD);
  check("U4 the wizard has the four canonical steps, a live provider preview, a neutral attestation, and sends the parsed blocks with the verbatim text",
    /\["Service", "Customer", "Pets", "Questionnaire"\]/.test(wizard) && /<QuestionnairePreview parsed=\{parsed\} \/>/.test(wizard) &&
      /I confirm this information is accurate and authorized for clinical review\./.test(wizard) &&
      !/to PawTenant for clinical review/.test(wizard) &&
      /p_questionnaire_text: questionnaire,/.test(wizard) && /p_questionnaire_blocks: parsed && parsedLossless \? parsed\.blocks : null,/.test(wizard) &&
      /p_partner_id: mode === "admin" \? partnerId : null,/.test(wizard) && !/<input[^>]*type="file"/i.test(wizard) &&
      /disabled=\{submitting \|\| !authorizationConfirmed/.test(wizard) && /No numbered questions were recognised/.test(wizard));
  const portal = read(F.PORTAL_ORDERS);
  check("U5 the partner portal rows open by mouse and keyboard, and documents come through the session-scoped edge function",
    /onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter" \|\| e\.key === " "\)/.test(portal) && /tabIndex=\{0\}/.test(portal) &&
      /functions\.invoke\("partner-portal-document"/.test(portal) && /document_available/.test(portal) && /clinical_completed_at/.test(portal));
  const intakeFn = stripComments(read(F.INTAKE_FN));
  check("U6 the retired legacy PDF intake refuses every write action server-side (410), leaving only source_url",
    /LEGACY_INTAKE_READ_ONLY_ACTIONS = new Set\(\["source_url"\]\)/.test(intakeFn) &&
      /if \(!LEGACY_INTAKE_READ_ONLY_ACTIONS\.has\(action\)\) \{/.test(intakeFn) && /fail\(410, "legacy_intake_retired"/.test(intakeFn) &&
      intakeFn.indexOf("LEGACY_INTAKE_READ_ONLY_ACTIONS.has(action)") < intakeFn.indexOf('if (action === "upload") {') &&
      !/action=upload|action=commit|action=reparse|action=review|action=ocr_text/.test(codeOnly(read(F.HISTORY))));

  // ── W. Build wiring ──────────────────────────────────────────────────────
  check("W1 this guard is wired into the build chain",
    JSON.parse(read(F.PKG)).scripts.build.includes("check-partner-order-ux-assessment-finance.mjs"));
}

function report(title) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${title}`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  [${r.detail}]` : ""}`);
  console.log(`  ${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length > 0;
}

const SELF = process.argv.includes("--self-test");

if (SELF) {
  const CONTROLS = [
    { name: "a numeric answer (\"6 hours or more\" after question 5) is read as question 6", file: F.PARSER, expect: "Q1",
      from: "  if (/\\?/.test(t)) return true;", to: "  return true;\n  if (/\\?/.test(t)) return true;" },
    { name: "the parser drops every answer line after the first", file: F.PARSER, expect: "Q3",
      from: "    current.answer.push(line.replace(/^\\s+/, \"\"));", to: "    if (current.answer.length < 1) current.answer.push(line.replace(/^\\s+/, \"\"));" },
    { name: "stored blocks are trusted without the lossless check", file: F.PARSER, expect: "Q7",
      from: "      if (questionnaireIsLossless(raw, candidate)) return candidate;", to: "      return candidate;" },
    { name: "the PDF stops escaping the question text", file: F.ASSESS, expect: "Q6b",
      from: "${escapeHtml(b.question)}</p>", to: "${b.question}</p>" },
    { name: "the on-screen partner assessment grows a company name", file: F.NEUTRAL, expect: "B3",
      from: "<h2 className=\"text-xl font-bold\">{title}</h2>", to: "<h2 className=\"text-xl font-bold\">PawTenant {title}</h2>" },
    { name: "the on-screen partner assessment shows the partner reference", file: F.NEUTRAL, expect: "B3",
      from: "<Row label=\"Case Reference\" value={order.confirmation_id} />", to: "<Row label=\"Case Reference\" value={String((order as { partner_order_id?: string }).partner_order_id)} />" },
    { name: "send-sms keeps its gate but stops refusing", file: "supabase/functions/send-sms/index.ts", expect: "N1",
      from: "    if (!contactGate.allowed) {\n      return new Response(JSON.stringify({ ok: false, error: contactGate.detail, reason: contactGate.reason }), {", to: "    if (false) {\n      return new Response(JSON.stringify({ ok: false, error: contactGate.detail, reason: contactGate.reason }), {" },
    { name: "the partner completion email carries the customer's name", file: F.NPL, expect: "N2",
      from: "          `Order reference: ${confirmationId}`,", to: "          `Order reference: ${confirmationId} for ${order.first_name}`," },
    { name: "the partner completion email goes to the customer too", file: F.NPL, expect: "N2",
      from: "            to: [contact],", to: "            to: [contact, order.email]," },
    { name: "the partner completion notice sends without claiming (every retry re-sends)", file: F.NPL, expect: "N7",
      from: "        if (!reservePartner.proceed) {", to: "        if (false) {" },
    { name: "the partner completion key is time-bucketed, so a retry claims a fresh key", file: F.NPL, expect: "N7",
      from: "        const partnerDedupeKey = `${confirmationId}:partner_completion`;",
      to: "        const partnerDedupeKey = `${confirmationId}:partner_completion:${Date.now()}`;" },
    { name: "a thrown partner send abandons its claim in 'sending' forever", file: F.NPL, expect: "N7b",
      from: "          } catch (sendErr) {\n            // Release the claim so the partner can still be told later.\n            await finalizeEmailSend(supabase, reservePartner.rowId, {",
      to: "          } catch (sendErr) {\n            await Promise.resolve({" },
    { name: "a suppressed partner notice is recorded as a successful send", file: F.NPL, expect: "N7b",
      from: "                success: false,\n                body: html,\n                errorMessage: `SUPPRESSED (TEST fixture): ${suppression.reason}`,",
      to: "                success: true,\n                body: html,\n                errorMessage: null," },
    { name: "the closure smuggles in a new migration", file: "supabase/migrations/20260911210000_partner_order_ux_assessment_finance_repair.sql", expect: "M1",
      newFile: "supabase/migrations/29991231000000_control_new_migration.sql", content: "-- negative control\nselect 1;\n" },
    { name: "the provider submission promises a patient notification again", file: F.PROVIDER_DETAIL, expect: "N3",
      from: "Submit Documents for Review?", to: "Submit Documents & Complete Order?" },
    { name: "force-complete asks the client to notify a partner customer", file: F.MIG, expect: "N4",
      from: "  v_notify   := v_has_doc AND coalesce(v_order.order_origin, 'direct') <> 'partner';", to: "  v_notify   := v_has_doc;" },
    { name: "the identity gate fails OPEN on a partner match", file: F.GATE, expect: "N6",
      from: "  if (!hit) {\n    return { allowed: true,", to: "  if (true) {\n    return { allowed: true," },
    { name: "the portal document function stops scoping the order to the session's partner", file: F.PORTAL_DOC_FN, expect: "A2",
      from: "    .eq(\"order_origin\", \"partner\")\n    .eq(\"partner_id\", partnerId)", to: "    .eq(\"order_origin\", \"partner\")" },
    { name: "adjustments are subtracted twice (sign flipped)", file: F.MIG, expect: "F1",
      from: "         coalesce(b.wholesale_fee_cents, 0) - coalesce(c.cents, 0) + coalesce(a.cents, 0),", to: "         coalesce(b.wholesale_fee_cents, 0) - coalesce(c.cents, 0) - coalesce(a.cents, 0)," },
    { name: "provider cost counts cancelled earnings", file: F.MIG, expect: "F2",
      from: "     where coalesce(d.status, '') not in ('cancelled', 'voided', 'refunded')\n     group by d.order_id", to: "     group by d.order_id" },
    { name: "a missing provider cost is silently treated as zero", file: F.MIG, expect: "F4",
      from: "         (b.fin_order_id is null) or (b.billable_status = 'billable' and c.rows_n is null),", to: "         (b.fin_order_id is null)," },
    { name: "the Payments tab shows customer recovery actions on a partner order again", file: F.PAYMENTS, expect: "F8",
      from: "  if (isPartnerOrder(order)) {\n    return (", to: "  if (false) {\n    return (" },
    { name: "a direct load of ?kpi=partner_orders seeds a status that does not exist (empty list under a card reading 2)", file: F.PAGE, expect: "O3",
      from: "    return seeded ? kpiCardListSelection(seeded).statusFilter : \"all\";", to: "    return seeded ?? \"all\";" },
    { name: "the Partner Orders card opens direct orders", file: F.FACETS, expect: "O1",
      from: "  if (key === \"partner_orders\") return { statusFilter: \"all\", orderOrigin: \"partner\" };", to: "  if (key === \"partner_orders\") return { statusFilter: \"all\", orderOrigin: \"direct\" };" },
    { name: "the lead bucket keys on payment_intent_id alone again", file: F.FACETS, expect: "O2",
      from: "      return q.or(`status.eq.lead,${NO_CONFIRMED_PAYMENT_ARM}`);\n    case \"paid_unassigned\"", to: "      return q.or(\"payment_intent_id.is.null,status.eq.lead\");\n    case \"paid_unassigned\"" },
    { name: "the client classifier calls a partner-funded order a lead", file: F.LIFECYCLE, expect: "O5",
      from: "  const partnerPaid = o.order_origin === \"partner\" && Boolean(o.paid_at);", to: "  const partnerPaid = false;" },
    { name: "day ribbons regroup on lifecycle activity", file: F.PAGE, expect: "O6",
      from: "    const groupIso = orderGroupingIso(order, \"created\") ?? order.created_at;", to: "    const groupIso = orderGroupingIso(order, effDateBasis) ?? order.created_at;" },
    { name: "the list card calls a partner order a lead again", file: F.CARD, expect: "O4",
      from: "  const isLead = order.status === \"lead\" || !hasConfirmedPayment(order);", to: "  const isLead = order.status === \"lead\" || !order.payment_intent_id;" },
    { name: "the wizard attestation describes sharing with an outside brand", file: F.WIZARD, expect: "U4",
      from: "              I confirm this information is accurate and authorized for clinical review.", to: "              I confirm this organization is authorized to submit this information to PawTenant for clinical review." },
    { name: "Partner Orders filters open by default", file: F.ORDERS_TAB, expect: "U1",
      from: "  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);", to: "  const [filtersOpen, setFiltersOpen] = useState<boolean>(true);" },
    { name: "the onboarding checklist returns to Overview", file: F.OVERVIEW, expect: "U2",
      from: "        <StatCard\n          label=\"Needs action\"", to: "        <h3>Sandbox onboarding checklist</h3>\n        <StatCard\n          label=\"Needs action\"" },
    { name: "the server accepts legacy PDF uploads again", file: F.INTAKE_FN, expect: "U6",
      from: "  if (!LEGACY_INTAKE_READ_ONLY_ACTIONS.has(action)) {", to: "  if (false) {" },
    { name: "the guard falls out of the build chain", file: F.PKG, expect: "W1",
      from: " && node scripts/check-partner-order-ux-assessment-finance.mjs", to: "" },
  ];

  let missed = 0;
  const originals = new Map();
  /** Files a control ADDED, so the finally block can remove them too. */
  const added = new Set();
  try {
    await runChecks();
    if (report("BASELINE (must be clean before planting)")) {
      console.log("\n  baseline dirty — controls would be meaningless");
      missed++;
    } else {
      for (const c of CONTROLS) {
        // Two plant shapes: edit an existing file in place, or ADD a file that
        // must not exist (used to prove the "no new migration" check).
        if (c.newFile) {
          const addedPath = join(ROOT, c.newFile);
          if (existsSync(addedPath)) { console.log(`  ANCHOR MISSING  ${c.name} (control file already exists)`); missed++; continue; }
          added.add(c.newFile);
          writeFileSync(addedPath, c.content, "utf8");
          let caught = false;
          try {
            await runChecks();
            const t = results.find((r) => r.name.startsWith(c.expect + " "));
            caught = Boolean(t && !t.ok);
          } catch { caught = true; }
          console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
          if (!caught) missed++;
          rmSync(addedPath, { force: true });
          added.delete(c.newFile);
          continue;
        }
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
    for (const rel of added) rmSync(join(ROOT, rel), { force: true });
  }

  await runChecks();
  const after = report("AFTER RESTORE (must be clean)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - missed}/${CONTROLS.length} controls detected${after ? ", RESTORE FAILED" : ", tree restored"}`);
  // Never process.exit() here: it would abandon the restore in the finally block.
  process.exitCode = missed || after ? 1 : 0;
} else {
  await runChecks();
  const failed = report("PARTNER ORDER · UX · ASSESSMENT · FINANCE REPAIR");
  process.exitCode = failed ? 1 : 0;
}
