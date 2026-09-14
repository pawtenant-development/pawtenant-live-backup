#!/usr/bin/env node
/**
 * check-partner-comms-isolation.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 6.
 *
 * THE INVARIANT
 * A partner-managed order's CUSTOMER must never hear from PawTenant — no
 * email, no SMS, no GHL contact/workflow sync, no payment link, no ad-platform
 * identity push — while the PROVIDER keeps every operational notification and
 * is paid the existing approved provider rate (doctor_profiles.per_order_rate),
 * never the retail price and never the partner's wholesale rate. Direct orders
 * keep, byte-for-byte, the behaviour they have today.
 *
 * SHAPE (same discipline as check-partner-document-isolation.mjs):
 * 1. The gate is EXECUTED, not grepped — the dangerous bug is a present call
 *    whose failure branch is wrong.
 * 2. Source assertions run against a COMMENT-STRIPPED copy; string literals
 *    are kept (they ARE the code).
 * 3. The DIRECT control is pinned as hard as the partner one.
 * 4. `--self-test` plants each real defect into the real source and proves
 *    the corresponding check fails, then restores.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const GATE = "supabase/functions/_shared/partnerCommsGate.ts";
const POLICY = "supabase/functions/_shared/partnerPolicy.ts";
const DOC_GATE = "supabase/functions/_shared/partnerDocumentGate.ts";
const ASSIGN = "supabase/functions/assign-doctor/index.ts";
const PROXY = "supabase/functions/ghl-webhook-proxy/index.ts";
const LEAD_CORE = "supabase/functions/lead-followup-sequence/core.ts";
const RENEWAL = "supabase/functions/send-renewal-reminders/index.ts";
const META_CAPI = "supabase/functions/send-meta-capi-event/index.ts";
const NPL = "supabase/functions/notify-patient-letter/index.ts";
const NOS = "supabase/functions/notify-order-status/index.ts";
const BROADCAST_MODAL = "src/pages/admin-orders/components/BroadcastModal.tsx";
const PKG = "package.json";

/** Emitters that must import the gate and call it BEFORE their send anchor. */
const GATED_EMITTERS = [
  { file: "supabase/functions/send-checkout-recovery/index.ts", anchor: "sendEmailViaResend(" },
  { file: "supabase/functions/resend-confirmation-email/index.ts", anchor: "reserveEmailSend(" },
  { file: NOS, anchor: "reserveEmailSend(" },
  { file: NPL, anchor: "reserveEmailSend(" },
  { file: "supabase/functions/notify-thirty-day-customer/index.ts", anchor: "api.resend.com" },
  { file: "supabase/functions/send-templated-email/index.ts", anchor: "sendEmailViaResend(" },
  { file: "supabase/functions/ghl-send-sms/index.ts", anchor: "sendGhlSms(" },
  { file: "supabase/functions/send-review-request/index.ts", anchor: "api.resend.com" },
  // LIVE ADAPTATION (PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004): LIVE has no
  // send-new-esa-order-link function (the admin action spawns the child order
  // in-app), so that TEST emitter is not part of the LIVE gate inventory.
  { file: "supabase/functions/manage-custom-payment-request/index.ts", anchor: "reserveEmailSend(" },
  { file: "supabase/functions/create-additional-doc-invoice/index.ts", anchor: "reserveEmailSend(" },
  { file: "supabase/functions/create-additional-pet-request/index.ts", anchor: "sendAdditionalPetEmail(" },
  // Call-site anchors (`await …`), not bare names: both files DEFINE a local
  // upsertGhlContact above the handler, and a definition match would put the
  // "send" before the gate and fail the ordering check spuriously.
  { file: "supabase/functions/backfill-order-ghl/index.ts", anchor: "await upsertGhlContact({" },
  { file: PROXY, anchor: "await upsertGhlContact({" },
  // assign-doctor is deliberately absent: it resolves the policy from its own
  // row read and is pinned by the dedicated A-checks below.
];

/** Identifiers that name partner economics — banned from comms emitters. */
const ECONOMICS_IDENTIFIERS = [
  "partner_rate_cards",
  "wholesale_unit_price_cents",
  "wholesale_fee_cents",
  "partner_order_financials",
  "fulfillment_margin_cents",
];

/** Single read point; CRLF normalised here and nowhere else. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Strip COMMENTS ONLY — string literals are kept (they are the code).
 *
 * STRING-AWARE, unlike a naive scanner: `//` inside a string literal (every
 * `https://…` URL in these files) is NOT a comment. A naive stripper blanks
 * the rest of that line and silently vaporises anchors like `api.resend.com`,
 * turning ordering checks vacuous — the exact bug this guard family exists
 * to prevent.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null; // ', ", or ` when inside a string/template literal
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      out += ch;
      if (ch === "\\") { if (i + 1 < src.length) { out += src[i + 1]; i += 2; continue; } }
      else if (ch === quote) quote = null;
      else if (quote !== "`" && ch === "\n") quote = null; // unterminated line string
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; out += ch; i++; continue; }
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

// ── Load the REAL gate module ───────────────────────────────────────────────
async function loadGate() {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, GATE)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

/**
 * Recording supabase stub. `ordersResponse` answers the orders read;
 * audit inserts are captured for inspection.
 */
function stubClient(ordersResponse) {
  const auditInserts = [];
  const client = {
    auditInserts,
    from(table) {
      if (table === "audit_logs") {
        return { insert: (row) => { auditInserts.push(row); return Promise.resolve({ data: null, error: null }); } };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve(ordersResponse),
      };
      return chain;
    },
  };
  return client;
}

const failures = [];
let checkCount = 0;
function check(id, desc, ok) {
  checkCount++;
  if (ok) console.log(`  PASS  ${id} ${desc}`);
  else { console.error(`  FAIL  ${id} ${desc}`); failures.push(`${id} ${desc}`); }
}

async function runChecks() {
  // ═══ A. EXECUTE the real gate ═══════════════════════════════════════════
  const gate = await loadGate();
  const {
    mayContactCustomerForOrder, gateCustomerContact, auditSuppressedCustomerContact,
    PARTNER_COMMS_REFUSAL, PARTNER_COMMS_UNRESOLVED,
  } = gate;

  const direct = { id: "o1", confirmation_id: "PT-DIRECT", order_origin: "direct", partner_communication_policy: null, partner_document_policy: null };
  const partnerManaged = { id: "o2", confirmation_id: "PT-PARTNER", order_origin: "partner", partner_communication_policy: "partner_managed", partner_document_policy: "partner_neutral" };
  const partnerPawtenantComms = { id: "o3", confirmation_id: "PT-PARTNER2", order_origin: "partner", partner_communication_policy: "pawtenant_managed", partner_document_policy: "partner_neutral" };
  const partnerNoPolicy = { id: "o4", confirmation_id: "PT-PARTNER3", order_origin: "partner", partner_communication_policy: null, partner_document_policy: "partner_neutral" };
  const weirdOrigin = { id: "o5", confirmation_id: "PT-WEIRD", order_origin: "franchise", partner_communication_policy: null, partner_document_policy: null };

  let r = await mayContactCustomerForOrder(stubClient({ data: direct, error: null }), { confirmationId: "PT-DIRECT" });
  check("E1", "direct order → customer contact ALLOWED", r.allowed === true);

  r = await mayContactCustomerForOrder(stubClient({ data: partnerManaged, error: null }), { confirmationId: "PT-PARTNER" });
  check("E2", "partner_managed → REFUSED with partner_policy_suppressed", r.allowed === false && r.reason === PARTNER_COMMS_REFUSAL);

  r = await mayContactCustomerForOrder(stubClient({ data: partnerPawtenantComms, error: null }), { confirmationId: "PT-PARTNER2" });
  check("E3", "partner with pawtenant_managed comms → ALLOWED (policy decides, never the partner name)", r.allowed === true);

  r = await mayContactCustomerForOrder(stubClient({ data: partnerNoPolicy, error: null }), { confirmationId: "PT-PARTNER3" });
  check("E4", "partner with missing communication policy → REFUSED (unresolved)", r.allowed === false && r.reason === PARTNER_COMMS_UNRESOLVED);

  r = await mayContactCustomerForOrder(stubClient({ data: null, error: { message: "boom" } }), { confirmationId: "PT-X" });
  check("E5", "order read error → REFUSED (a failure is not permission)", r.allowed === false && r.reason === PARTNER_COMMS_UNRESOLVED);

  r = await mayContactCustomerForOrder(stubClient({ data: null, error: null }), { confirmationId: "PT-GONE" });
  check("E6", "order not found → REFUSED (cannot prove it is direct)", r.allowed === false && r.reason === PARTNER_COMMS_UNRESOLVED);

  r = await mayContactCustomerForOrder(stubClient({ data: direct, error: null }), {});
  check("E7", "no order reference → REFUSED", r.allowed === false);

  r = await mayContactCustomerForOrder(stubClient({ data: weirdOrigin, error: null }), { confirmationId: "PT-WEIRD" });
  check("E8", "unrecognised order_origin → REFUSED (fail closed, never retail-by-default)", r.allowed === false);

  {
    const client = stubClient({ data: partnerManaged, error: null });
    await auditSuppressedCustomerContact(client, {
      orderId: "o2", confirmationId: "PT-PARTNER", channel: "email",
      event: "provider_assigned_customer", source: "assign-doctor", reason: PARTNER_COMMS_REFUSAL,
    });
    const row = client.auditInserts[0];
    const surface = JSON.stringify(row ?? {});
    const noPii = !!row
      && row.action === "partner_policy_suppressed"
      && !("email" in (row.metadata ?? {})) && !("phone" in (row.metadata ?? {})) && !("body" in (row.metadata ?? {}))
      && !surface.includes("@");
    check("E9", "suppression audit row: action=partner_policy_suppressed, no recipient/body/PHI", noPii);
  }

  {
    const refusedClient = stubClient({ data: partnerManaged, error: null });
    const refused = await gateCustomerContact(refusedClient, { confirmationId: "PT-PARTNER" }, { channel: "email", event: "x", source: "guard" });
    const allowedClient = stubClient({ data: direct, error: null });
    const allowed = await gateCustomerContact(allowedClient, { confirmationId: "PT-DIRECT" }, { channel: "email", event: "x", source: "guard" });
    check("E10", "gateCustomerContact audits on refusal and stays silent on allow",
      refused.allowed === false && refusedClient.auditInserts.length === 1 &&
      allowed.allowed === true && allowedClient.auditInserts.length === 0);
  }

  // ═══ B. assign-doctor source ═══════════════════════════════════════════
  const assignSrc = stripComments(read(ASSIGN));
  check("A1", "assign-doctor imports the comms gate and the canonical policy",
    assignSrc.includes(`from "../_shared/partnerCommsGate.ts"`) && assignSrc.includes(`from "../_shared/partnerPolicy.ts"`));
  check("A2", "assign-doctor order select carries PARTNER_POLICY_COLUMNS",
    /\$\{PARTNER_POLICY_COLUMNS\}/.test(assignSrc));
  check("A3", "policy resolved before the earning is written",
    assignSrc.indexOf("resolveOrderPolicy(order)") !== -1 &&
    assignSrc.indexOf("resolveOrderPolicy(order)") < assignSrc.indexOf(`.from("doctor_earnings")`));
  check("A4", "order_amount is NULL unless the order is provably direct",
    /const orderAmount = policy\.origin === "direct" \? \(\(order\.price as number\) \?\? null\) : null;/.test(assignSrc));
  check("A5", "doctor_amount is fed by doctorRate (the existing provider-rate resolver), never the order price",
    /doctor_amount: doctorRate/.test(assignSrc) && !/doctor_amount:\s*\(?order\.price/.test(assignSrc) && !/doctor_amount:\s*orderAmount/.test(assignSrc));
  check("A6", "provider assignment email fires BEFORE (outside) the customer gate",
    assignSrc.indexOf("await sendProviderEmail(") !== -1 &&
    assignSrc.indexOf("await sendProviderEmail(") < assignSrc.indexOf("customerContactAllowed"));
  check("A7", "customer assignment email is gated on customerContactAllowed",
    /if \(customerContactAllowed\) \{\s*customerEmailSent = await sendCustomerAssignedEmail\(/.test(assignSrc) &&
    /auditSuppressedCustomerContact\(/.test(assignSrc));
  check("A8", "GHL doctor_assigned fire is gated on customerContactAllowed",
    (() => {
      const ghlIdx = assignSrc.indexOf("ghl-webhook-proxy");
      if (ghlIdx === -1) return false;
      const guardIdx = assignSrc.lastIndexOf("if (customerContactAllowed)", ghlIdx);
      return guardIdx !== -1 && ghlIdx - guardIdx < 600;
    })());
  check("A9", "customer communications logging happens only inside the gated branch",
    (() => {
      const firstGateRef = assignSrc.indexOf("customerContactAllowed");
      const custSlugIdx = assignSrc.indexOf(`"provider_assigned_customer"`);
      const custSlugLast = assignSrc.lastIndexOf(`"provider_assigned_customer"`);
      return firstGateRef !== -1 && custSlugIdx > firstGateRef && custSlugLast > firstGateRef;
    })());
  check("A10", "no partner-economics identifiers anywhere in assign-doctor",
    ECONOMICS_IDENTIFIERS.every((id) => !assignSrc.includes(id)));
  check("A11", "provider email template interpolates no money",
    (() => {
      const start = assignSrc.indexOf("async function sendProviderEmail");
      const end = assignSrc.indexOf("async function sendCustomerAssignedEmail");
      if (start === -1 || end === -1 || end < start) return false;
      const block = assignSrc.slice(start, end);
      // Money-bearing identifiers only — CSS `margin:` and prose words like
      // "separate" must not trip this, or the check dies to noise and gets
      // deleted by the next person. `wholesale*` catches the planted control.
      return !/\b(price|orderAmount|doctorRate|per_order_rate|wholesale\w*|margin_cents|unit_price\w*|fee_cents)\b/.test(block);
    })());
  check("A12", "duplicate base earnings stay impossible (base-filtered existence check before insert)",
    /\.eq\("earning_type", "base"\)/.test(assignSrc) &&
    (assignSrc.match(/\.from\("doctor_earnings"\)\.insert\(/g) ?? []).length === 1);

  // ═══ C. ghl-webhook-proxy source ═════════════════════════════════════════
  const proxySrc = stripComments(read(PROXY));
  check("P1", "proxy imports the comms gate",
    proxySrc.includes(`from "../_shared/partnerCommsGate.ts"`));
  check("P2", "proxy gate runs BEFORE the contact upsert and the workflow fire",
    (() => {
      const g = proxySrc.indexOf("gateCustomerContact(");
      const upsertCall = proxySrc.indexOf("await upsertGhlContact({");
      const fireCall = proxySrc.indexOf("await fetchWithRetry(");
      return g !== -1 && upsertCall !== -1 && fireCall !== -1 && g < upsertCall && g < fireCall;
    })());
  check("P2b", "proxy refusal branch is live (if (!gate.allowed))",
    /if \(!gate\.allowed\) \{/.test(proxySrc));
  check("P3", "proxy refusal is a SUCCESS response naming partner_policy_suppressed (no caller retries)",
    /ok: true, skipped: "partner_policy_suppressed"/.test(proxySrc));
  // LIVE ADAPTATION (PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004): LIVE has no
  // TEST GHL-isolation skip, so the gate is pinned ahead of the first GHL side
  // effect in the handler (the contact upsert) instead.
  check("P4", "proxy partner gate sits ahead of the first GHL side effect (contact upsert)",
    (() => {
      const g = proxySrc.indexOf("gateCustomerContact(");
      const handlerStart = proxySrc.indexOf("Deno.serve(");
      const upsert = proxySrc.indexOf("upsertGhlContact(", handlerStart);
      return g !== -1 && handlerStart !== -1 && g > handlerStart && (upsert === -1 || g < upsert)
        && !/ghlIsolationBlocked/.test(proxySrc);
    })());
  check("P5", "proxy never trusts a payload origin field",
    !/payload\.order_origin|body\.order_origin/.test(proxySrc));

  // ═══ D. Cohorts ══════════════════════════════════════════════════════════
  const leadSrc = stripComments(read(LEAD_CORE));
  check("L1", "recovery drip cohort is direct-only by predicate + per-lead belt",
    /\.eq\("order_origin", "direct"\)/.test(leadSrc) &&
    /order_origin !== "direct"\) \{ results\.skipped\+\+; continue; \}/.test(leadSrc));
  const renewalSrc = stripComments(read(RENEWAL));
  check("L2", "renewal-reminder cohort is direct-only by predicate",
    /\.eq\("order_origin", "direct"\)/.test(renewalSrc));
  const capiSrc = stripComments(read(META_CAPI));
  check("L3", "Meta CAPI mode:single refuses non-direct orders",
    /order_origin !== "direct"/.test(capiSrc) && capiSrc.includes("partner_policy_suppressed"));

  // ═══ E. Emitter gates (import + call before send anchor) ═════════════════
  for (const { file, anchor } of GATED_EMITTERS) {
    const src = stripComments(read(file));
    const short = file.split("/").slice(-2).join("/");
    const gateIdx = src.indexOf("gateCustomerContact(");
    const anchorIdx = src.indexOf(anchor);
    const imported = src.includes(`from "../_shared/partnerCommsGate.ts"`);
    check(`G:${short}`, `gate imported and called before ${anchor}`,
      imported && gateIdx !== -1 && anchorIdx !== -1 && gateIdx < anchorIdx);
  }

  // ═══ F. notify-patient-letter partner arm specifics ══════════════════════
  const nplSrc = stripComments(read(NPL));
  check("N1", "partner completion arm records order_amount: null",
    /order_amount: null/.test(nplSrc));
  check("N2", "partner completion arm never stamps patient_notification_sent_at",
    (() => {
      const armStart = nplSrc.indexOf("if (!contactGate.allowed) {");
      if (armStart === -1) return false;
      const armEnd = nplSrc.indexOf("const subjectSuffixPre", armStart);
      if (armEnd === -1) return false;
      const arm = nplSrc.slice(armStart, armEnd);
      return arm.includes(`doctor_status: "patient_notified", status: "completed"`) &&
        !arm.includes("patient_notification_sent_at");
    })());
  check("N3", "direct-path earning keys order_amount on proven-direct origin",
    /const retailOrderAmount = contactGate\.decision\?\.origin === "direct" \? \(order\.price \?\? 0\) : null;/.test(nplSrc) &&
    /order_amount: retailOrderAmount/.test(nplSrc));
  check("N4", "no partner-economics identifiers in notify-patient-letter",
    ECONOMICS_IDENTIFIERS.every((id) => !nplSrc.includes(id)));

  // ═══ G. notify-order-status: admin fan-out survives suppression ══════════
  const nosSrc = stripComments(read(NOS));
  check("S1", "status-email suppression branch does not return — admin fan-out still runs",
    /if \(!contactGate\.allowed\) \{\s*console\.warn\([^;]*\);\s*\} else \{/.test(nosSrc) &&
    nosSrc.includes("getAdminRecipients("));

  // ═══ H. Broadcast modal ═══════════════════════════════════════════════════
  const bmSrc = stripComments(read(BROADCAST_MODAL));
  check("B1", "broadcast audiences are direct-only (both the list and the counts)",
    (bmSrc.match(/!isLegacyOrder\(o\) && o\.order_origin === "direct"/g) ?? []).length >= 2);

  // ═══ I. Wiring — every prior guard stays, the new one is appended ═════════
  const pkg = JSON.parse(read(PKG));
  const buildChain = String(pkg.scripts?.build ?? "");
  const required = [
    "check-partner-orders-segregation.mjs",
    "check-partner-assessment-pdf.mjs",
    "check-partner-document-isolation.mjs",
    "check-partner-comms-isolation.mjs",
    "check-admin-orders-kpi-list-parity.mjs",
    "check-admin-orders-kpi-semantics.mjs",
    "check-admin-orders-monthly-kpis.mjs",
    "check-admin-orders-ny-clock-kpi-status.mjs",
  ];
  check("W1", "build chain keeps every partner + KPI guard and includes this one",
    required.every((g) => buildChain.includes(g)));

  return failures.length === 0;
}

// ── Self-test: plant each real defect, prove detection, restore ─────────────
const PLANTS = [
  {
    name: "partner customer assignment email allowed (gate bypassed)",
    file: ASSIGN,
    find: "if (customerContactAllowed) {\n    customerEmailSent = await sendCustomerAssignedEmail({",
    replace: "if (true) {\n    customerEmailSent = await sendCustomerAssignedEmail({",
    expectFail: "A7",
  },
  {
    name: "partner checkout-recovery SMS allowed (drip cohort loses the origin predicate)",
    file: LEAD_CORE,
    find: `.eq("order_origin", "direct")\n      .is("payment_intent_id", null)`,
    replace: `.is("payment_intent_id", null)`,
    expectFail: "L1",
  },
  {
    name: "partner GHL sync allowed (proxy refusal branch dead)",
    file: PROXY,
    find: "if (!gate.allowed) {",
    replace: "if (false) {",
    expectFail: "P2b",
  },
  {
    name: "manual retry bypasses policy (resend-confirmation gate removed)",
    file: "supabase/functions/resend-confirmation-email/index.ts",
    find: "const gate = await gateCustomerContact(supabase, { confirmationId }, {",
    replace: "const gate = { allowed: true, reason: null }; void ((_x) => _x)({ confirmationId }, {",
    expectFail: "G:resend-confirmation-email/index.ts",
  },
  {
    name: "order price written as provider compensation",
    file: ASSIGN,
    find: "doctor_amount: doctorRate, status: \"pending\", earning_type: \"base\"",
    replace: "doctor_amount: (order.price as number), status: \"pending\", earning_type: \"base\"",
    expectFail: "A5",
  },
  {
    name: "partner wholesale rate exposed to the provider",
    file: ASSIGN,
    find: "<p style=\"margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;text-align:center;\">New Case Assigned</p>",
    replace: "<p>Rate: ${wholesale_unit_price_cents}</p><p style=\"margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;text-align:center;\">New Case Assigned</p>",
    expectFail: "A10",
  },
  {
    name: "partner economics inserted into provider notification",
    file: ASSIGN,
    find: `title: "New Case Assigned"`,
    replace: `title: "New Case Assigned (partner_order_financials)"`,
    expectFail: "A10",
  },
  {
    name: "unknown classification treated as retail (gate not-found branch fails open)",
    file: GATE,
    find: `  if (error || !data) {
    return refuse(
      PARTNER_COMMS_UNRESOLVED,`,
    replace: `  if (error || !data) {
    return { allowed: true, reason: null, detail: "assumed direct", decision: null, orderId: null, confirmationId: null };
    return refuse(
      PARTNER_COMMS_UNRESOLVED,`,
    expectFail: "E6",
  },
  {
    name: "direct customer communications accidentally suppressed (gate inverted)",
    file: GATE,
    find: "if (decision.suppressCustomerCommunication) {",
    replace: "if (!decision.suppressCustomerCommunication) {",
    expectFail: "E1",
  },
  {
    name: "provider assignment notification accidentally suppressed (nested in customer gate)",
    file: ASSIGN,
    find: "const emailSent = await sendProviderEmail({",
    replace: "const emailSent = customerContactAllowed && await sendProviderEmail({",
    expectFail: "A6",
  },
  {
    name: "duplicate partner earning creation (base filter dropped)",
    file: ASSIGN,
    find: `.eq("confirmation_id", confirmationId).eq("earning_type", "base").neq("status", "cancelled")`,
    replace: `.eq("confirmation_id", confirmationId).neq("status", "cancelled")`,
    expectFail: "A12",
  },
  {
    // NOTE the shape: simply killing the `if (error || !data)` branch is NOT a
    // defect — resolveOrderPolicy(null) throws and the catch still refuses.
    // The real defect is the branch RETURNING PERMISSION, so that is what is
    // planted.
    name: "Slice 5 QR/verification isolation bypassed (document gate fails open)",
    file: DOC_GATE,
    find: `  if (error || !data) {
    return {
      allowed: false,
      reason: PARTNER_POLICY_UNRESOLVED,`,
    replace: `  if (error || !data) {
    return {
      allowed: true,
      reason: PARTNER_POLICY_UNRESOLVED,`,
    expectFail: "slice5-guard",
  },
];

async function selfTest() {
  console.log("── SELF-TEST: planting real defects ──────────────────────────");
  let planted = 0;
  let detected = 0;
  for (const plant of PLANTS) {
    const abs = join(ROOT, plant.file);
    const original = readFileSync(abs, "utf8");
    const normalized = original.replace(/\r\n/g, "\n");
    if (!normalized.includes(plant.find)) {
      console.error(`  NO-OP  cannot plant "${plant.name}" — anchor not found in ${plant.file}`);
      failures.push(`self-test NO-OP: ${plant.name}`);
      continue;
    }
    planted++;
    writeFileSync(abs, normalized.replace(plant.find, plant.replace));
    try {
      let caught = false;
      if (plant.expectFail === "slice5-guard") {
        const res = spawnSync(process.execPath, [join(ROOT, "scripts/check-partner-document-isolation.mjs")], {
          cwd: ROOT, encoding: "utf8", timeout: 240_000,
        });
        caught = res.status !== 0;
      } else {
        failures.length = 0;
        await runChecks();
        caught = failures.some((f) => f.startsWith(plant.expectFail));
      }
      if (caught) { detected++; console.log(`  DETECTED  ${plant.name}`); }
      else { console.error(`  MISSED    ${plant.name}`); }
    } finally {
      writeFileSync(abs, original);
    }
  }
  failures.length = 0;
  console.log(`── SELF-TEST: ${detected}/${planted} planted defects detected ──`);
  if (planted !== PLANTS.length || detected !== planted) {
    process.exitCode = 1;
    return false;
  }
  // Final clean pass proves the restore left everything green.
  const clean = await runChecks();
  if (!clean) process.exitCode = 1;
  return clean;
}

const selfTestMode = process.argv.includes("--self-test");
if (selfTestMode) {
  await selfTest();
  console.log(process.exitCode ? "SELF-TEST FAILED" : "SELF-TEST PASSED");
} else {
  const ok = await runChecks();
  console.log(`\n${checkCount - failures.length}/${checkCount} checks passed.`);
  if (!ok) {
    console.error("check-partner-comms-isolation: FAILED");
    process.exitCode = 1;
  }
}
