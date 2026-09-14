#!/usr/bin/env node
/**
 * check-partner-orders-segregation.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 (slice 3).
 *
 * Proves that partner-origin orders are STRUCTURALLY segregated from the retail
 * Orders workspace — not merely labelled with a chip.
 *
 * The property under test is narrow and load-bearing: there is exactly ONE
 * order-origin predicate, it lives inside the single filter funnel that the row
 * query, the scope total, the lifecycle facets, the KPI cards and the sequence
 * chips all share, and its default is "direct". If any of those stops being
 * true, a partner order can appear in a retail KPI — silently, and with money
 * attached.
 *
 * `--self-test` PLANTS each failure into a copy of the real source and asserts
 * this guard catches it. A guard that only ever passes proves nothing.
 *
 * CRLF: the repo is checked out with core.autocrlf=true, so every read is
 * normalised at the SINGLE read point below. Anchors written with \n would
 * otherwise silently match nothing and every control would report a vacuous
 * pass.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FACETS = "src/pages/admin-orders/orderFacetCounts.ts";
const TAB = "src/pages/admin-orders/components/PartnerOrdersTab.tsx";
// PARTNER-PLATFORM-ADMIN-WORKSPACE-001: PartnerOrdersTab now mounts inside the
// Partner Platform workspace (?tab=partners → Orders sub-tab) instead of the
// Orders tab's ?sub=partner switch, which redirects there.
const WORKSPACE = "src/pages/admin-orders/components/partner-platform/PartnerPlatformWorkspace.tsx";
const PAGE = "src/pages/admin-orders/page.tsx";
const MODAL = "src/pages/admin-orders/components/OrderDetailModal.tsx";
const COMMS = "src/pages/admin-orders/components/CommunicationTab.tsx";

/** THE single read point. Every anchor in this file assumes \n line endings. */
function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Strip comments so a "must NOT contain" scan tests the USE of a thing, not a
 * comment explaining that we deliberately do not do it. PartnerOrdersTab's
 * header comment names every forbidden action; without this, the comms control
 * would fail against correct source.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
}

function runChecks(sources) {
  const facets = sources[FACETS];
  const tab = sources[TAB];
  const page = sources[PAGE];

  const facetsCode = stripComments(facets);
  const tabCode = stripComments(tab);
  const pageCode = stripComments(page);
  const modal = sources[MODAL];
  const modalCode = stripComments(modal);
  const commsCode = stripComments(sources[COMMS]);

  // ── A. The canonical predicate exists and is the only one ────────────────
  check(
    "A1 orderOrigin is part of the shared FacetFilters contract",
    /orderOrigin\?\s*:\s*OrderOriginFilter/.test(facetsCode),
    "FacetFilters must carry orderOrigin so every count surface can express it",
  );

  check(
    "A2 a single applyOrderOriginFilter predicate exists",
    (facetsCode.match(/function applyOrderOriginFilter\s*\(/g) ?? []).length === 1,
    "expected exactly one origin predicate implementation",
  );

  // ── B. The default is "direct" — the whole safety property ───────────────
  const defaultMatch = facetsCode.match(
    /const\s+origin\s*:\s*OrderOriginFilter\s*=\s*f\.orderOrigin\s*\?\?\s*"([a-z]+)"/,
  );
  check(
    "B1 an omitted orderOrigin defaults to \"direct\", never \"all\"",
    defaultMatch?.[1] === "direct",
    `default resolved to "${defaultMatch?.[1] ?? "<not found>"}" — "all" would leak partner orders into every retail KPI that omits the field`,
  );

  // ── C. The predicate is inside the SHARED funnel ─────────────────────────
  const funnel = facetsCode.match(
    /function applyNonStatusFilters\s*\([^)]*\)\s*:\s*Q\s*\{([\s\S]*?)\n\}/,
  )?.[1];
  check(
    "C1 applyNonStatusFilters applies the origin predicate",
    Boolean(funnel) && /applyOrderOriginFilter\s*\(\s*q\s*,\s*f\s*\)/.test(funnel),
    "the origin predicate must live in the funnel shared by rows, totals, facets, KPIs and sequence chips — otherwise search or a KPI can bypass it",
  );

  // ── C2. The partner's own reference is searchable ────────────────────────
  // Browser QA caught this: the search "worked" only because a fixture email
  // happened to contain the partner order id. A real customer's email does not,
  // so an operator holding the PARTNER'S reference could not find the order.
  const searchArm = facetsCode.match(/q\s*=\s*q\.or\(\s*`([^`]*ilike[^`]*)`/)?.[1] ?? "";
  check(
    "C2 the shared search predicate includes partner_order_id",
    /partner_order_id\.ilike/.test(searchArm),
    "the partner's own reference is the only id their support agent can quote; retail is unaffected because direct rows have partner_order_id NULL",
  );

  // ── D. The partner workspace pins the origin ─────────────────────────────
  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the pin moved into
  // ONE shared module (partnerOrderScope.ts) that the tab AND the Overview
  // cards import, so a card count and the list share a single origin predicate.
  const scopeCode = stripComments(read("src/pages/admin-orders/partnerOrderScope.ts"));
  const pinned = scopeCode.match(/orderOrigin\s*:\s*"([a-z]+)"/g) ?? [];
  const tabPins = tabCode.match(/orderOrigin\s*:\s*"([a-z]+)"/g) ?? [];
  check(
    "D1 PartnerOrdersTab pins orderOrigin exactly once (through partnerOrderScope)",
    pinned.length === 1 && tabPins.length === 0 && /partnerOrdersFilters\(partnerId/.test(tabCode) && /from "\.\.\/partnerOrderScope"/.test(tabCode),
    `found ${pinned.length} orderOrigin assignments — more than one is a second source of truth`,
  );
  check(
    "D2 PartnerOrdersTab pins orderOrigin to \"partner\"",
    pinned[0] === 'orderOrigin: "partner"' && /from "\.\.\/partnerOrderScope"/.test(tabCode),
    `found ${pinned[0] ?? "<none>"} — anything else lets direct orders into the partner workspace`,
  );

  // ── E. Count-to-list parity is structural ────────────────────────────────
  const orderQueries = (tabCode.match(/supabase\s*\.\s*from\(\s*"orders"\s*\)/g) ?? []).length;
  const predicated = (tabCode.match(/applyListPredicates\s*\(/g) ?? []).length;
  check(
    "E1 every orders query in the partner workspace goes through applyListPredicates",
    orderQueries > 0 && orderQueries === predicated,
    `${orderQueries} orders queries vs ${predicated} applyListPredicates calls — an unpredicated query is how a total and its list disagree`,
  );

  // ── F. No retail payment semantics on partner rows ───────────────────────
  // The partner did not pay PawTenant. Rendering a partner order as unpaid,
  // $0, or Payment Failed misreports a fulfilment case as a lost retail sale.
  const RETAIL_PAYMENT_VOCAB = [
    /\bUnpaid\b/, /\bPayment Failed\b/, /\$0\b/, /payment_intent_id/, /\bstripe/i,
    /coupon_discount/, /refund_amount/,
  ];
  const retailHit = RETAIL_PAYMENT_VOCAB.find((re) => re.test(tabCode));
  check(
    "F1 partner rows carry no retail payment semantics",
    !retailHit,
    `partner workspace references ${retailHit} — partner orders must never read as unpaid or retail-paid`,
  );
  check(
    "F2 partner rows declare a neutral funding label",
    /Partner funded|Payment collected by partner/.test(tab),
    "the workspace must state that the partner collected payment",
  );

  // ── G. No customer-contact affordance ────────────────────────────────────
  // Not the comms slice, but the UI must not OFFER an action that would reach
  // the partner's customer.
  const CONTACT_ACTIONS = [
    /\bsendSms\b/, /\bsendEmail\b/, /\bsendSMS\b/, /\bghlSync\b/, /\bresendConfirmation\b/,
    /["'`]send-sms["'`]/, /["'`]send-templated-email["'`]/, /["'`]ghl-send-sms["'`]/,
    /["'`]send-checkout-recovery["'`]/, /["'`]broadcast-email["'`]/,
    /checkoutRecovery/, /\bSend SMS\b/, /\bSend Email\b/, /\bResend\b/,
  ];
  const contactHit = CONTACT_ACTIONS.find((re) => re.test(tabCode));
  check(
    "G1 the partner workspace offers no customer-contact action",
    !contactHit,
    `partner workspace exposes ${contactHit} — the partner owns the customer relationship`,
  );

  // ── H. Origin is selected everywhere ─────────────────────────────────────
  check(
    "H1 ORDERS_LIST_COLUMNS selects order_origin",
    /ORDERS_LIST_COLUMNS[\s\S]{0,4000}?order_origin/.test(pageCode),
    "partnerPolicy.ts refuses to decide for a row read without order_origin; every list projection must select it",
  );

  const workspaceCode = stripComments(sources[WORKSPACE]);
  check(
    "H2 the partner workspace is mounted and legacy links redirect into it",
    /<PartnerPlatformWorkspace/.test(pageCode) &&
      /activeTab\s*===\s*"partners"/.test(pageCode) &&
      /<PartnerOrdersTab/.test(workspaceCode) &&
      /params\.get\("sub"\)\s*!==\s*"partner"/.test(pageCode),
    "the Partner Platform tab must mount the workspace, the workspace must mount PartnerOrdersTab, and ?sub=partner must redirect",
  );

  check(
    "H3 the partner workspace reuses the canonical order-opening controller",
    /onOpenOrder=\{openOrderDetail\}/.test(pageCode),
    "opening must go through the existing controller, not a second modal or URL handler",
  );

  // ==========================================================================
  // M. PARTNER-ORDER-MODAL-SEGREGATION-001 (tracker row 394)
  //
  // The LIST being segregated is not enough: the SHARED OrderDetailModal is
  // what an operator actually acts in. Browser QA found it presenting a partner
  // order as "Lead (Unpaid)" with Stripe remediation, SMS/Email/Call and a GHL
  // Sync button. These checks pin that closed.
  // ==========================================================================

  // M1/M2 - classification integrity. Origin must come from the authoritative
  // columns, never from something a customer or a coincidence controls.
  const originFn = modalCode.match(
    /function isPartnerOriginOrder\([\s\S]*?\)\s*:\s*boolean\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  check(
    "M1 the modal recognises partner origin from order_origin + partner_id",
    /order_origin\s*===\s*"partner"/.test(originFn) && /partner_id/.test(originFn),
    "partner origin must be read from the authoritative canonical columns",
  );
  check(
    "M2 partner origin is NOT inferred from email, name, confirmation id or price",
    originFn !== "" &&
      !/\bemail\b/.test(originFn) && !/first_name|last_name|full_name/.test(originFn) &&
      !/confirmation_id/.test(originFn) && !/\bprice\b/.test(originFn),
    "inferring origin from customer-controlled or coincidental data would silence real retail controls on a retail order",
  );

  // M3 - the status badge must have a partner arm, and it must come BEFORE the
  // retail lead arm or the retail arm wins.
  const badgeFn = modalCode.match(
    /function getModalDisplayStatus\(order: Order\)[\s\S]*?\n\}/,
  )?.[0] ?? "";
  const partnerArmIdx = badgeFn.indexOf('label: "Partner Order"');
  const leadArmIdx = badgeFn.indexOf('label: "Lead (Unpaid)"');
  check(
    "M3 a partner order renders as \"Partner Order\", not \"Lead (Unpaid)\"",
    partnerArmIdx !== -1 && leadArmIdx !== -1 && partnerArmIdx < leadArmIdx &&
      /isPartnerOriginOrder\(order\)/.test(badgeFn),
    "a partner order is paid by the partner; labelling it an unpaid lead reports a fulfillment case as a lost sale",
  );

  // M4 - Stripe "Payment Not Linked" remediation must be suppressed. One gate
  // covers both the Overview warning and the Payments-tab repair panel.
  const repairDecl = modalCode.match(/const paymentRepairNeeded =([\s\S]*?);/)?.[1] ?? "";
  check(
    "M4 partner orders never offer Stripe payment remediation",
    /!isPartnerOrder/.test(repairDecl),
    "there is no Stripe payment to repair on a partner order; offering it invites attaching a payment that does not exist",
  );

  // M5/M6/M7 - customer-contact and CRM affordances are gated on origin.
  check(
    "M5 SMS / Email / Call quick actions are hidden for partner orders",
    /\$\{isPartnerOrder \? "hidden" : "hidden sm:flex"\} items-center gap-1\.5/.test(modalCode),
    "the partner owns the customer relationship",
  );
  check(
    "M6 the GHL Sync pill and Re-sync are hidden for partner orders",
    modalCode.includes('col-span-2 sm:col-span-3 md:col-span-4 ${isPartnerOrder ? "hidden" : ""}'),
    "GHL is PawTenant's retail CRM; a partner order must never be pushed into it",
  );
  check(
    "M7 payment-failure remediation is unreachable for partner orders",
    /mt-4 pt-4 border-t border-red-200 \$\{isPartnerOrder \? "hidden" : ""\}/.test(modalCode),
    "its Send Recovery action would email the partner's customer. Gated on the CONTAINER because the condition string is the exact anchor asserted by check-order-paid-stale-failure-suppression.mjs",
  );

  // M5b/M5c - the SECOND and THIRD contact affordances, both found by browser
  // QA after the first static pass looked clean. Static review saw one
  // SMS/Email/Call row; the running modal also had an icon-only SMS/Call pair
  // in the HEADER and a full message composer inside CommunicationTab.
  check(
    "M5b the modal-header SMS / Call icon pair is hidden for partner orders",
    (modalCode.match(/\$\{isPartnerOrder \? "hidden" : "hidden sm:flex"\} whitespace-nowrap w-8 h-8/g) ?? []).length === 2,
    "the header pair is a separate contact affordance from the quick-action row",
  );
  check(
    "M5c the customer-communication composer is suppressed for partner orders",
    /partnerManaged \? "hidden" : "flex"/.test(commsCode) &&
      /partnerManaged\?: boolean/.test(sources[COMMS]) &&
      (modalCode.match(/partnerManaged=\{isPartnerOrder\}/g) ?? []).length === 2,
    "CommunicationTab is mounted twice in the modal; BOTH mounts must pass the suppression flag",
  );
  check(
    "M5d the composer suppression defaults OFF so direct orders are untouched",
    /partnerManaged = false/.test(commsCode),
    "an optional prop defaulting to false keeps every existing call site behaving exactly as before",
  );

  // M8 - partner-safe payment vocabulary.
  check(
    "M8 partner payment reads \"Partner funded\" / \"Payment collected by\"",
    /isPartnerOrder \? "Partner funded"/.test(modalCode) &&
      /Payment collected by \$\{partnerDisplayName\}/.test(modalCode),
    "partner orders must not read as unpaid or retail-paid",
  );

  // M9 - THE REGRESSION GUARD FOR DIRECT ORDERS. Every retail control and label
  // must still exist and still be reachable on the direct branch. This is what
  // stops a partner fix from quietly disabling PawTenant's own retail tooling.
  check(
    "M9 direct orders keep their retail payment labels",
    /order\.payment_intent_id \? "Paid" : "Unpaid"/.test(modalCode) &&
      /order\.payment_intent_id \? "Paid" : "No payment"/.test(modalCode) &&
      /label: "Lead \(Unpaid\)"/.test(modalCode),
    "the retail Paid/Unpaid, No payment and Lead (Unpaid) branches must survive",
  );
  check(
    "M10 direct orders keep SMS / Email / Call and GHL Sync",
    /title="Send SMS"/.test(modalCode) && /title="Email"/.test(modalCode) &&
      /title="Call"/.test(modalCode) && /GHL Sync/.test(modalCode) &&
      /"hidden sm:flex"/.test(modalCode),
    "a direct order must lose nothing",
  );

  // M11 - no partner economics or credential material may reach the modal.
  check(
    "M11 the modal reads no partner financials or credential material",
    !/partner_order_financials|wholesale_fee|fulfillment_margin|provider_earning_snapshot|partner_api_credentials|secret_hash/.test(modalCode),
    "partner economics are admin-only and live in partner_order_financials; the modal must not read them",
  );

  // ── I. The merge-frozen modal was not restructured ───────────────────────
  check(
    "I1 retail Orders keeps its default origin implicitly",
    !/orderOrigin\s*:\s*"(all|partner)"/.test(
      pageCode.match(/const listFilters = useMemo<FacetFilters>\(\(\) => \(\{[\s\S]*?\}\)/)?.[0] ?? "",
    ),
    "the retail listFilters must not opt into partner or all",
  );
}

// ── Runner ──────────────────────────────────────────────────────────────────

function loadSources() {
  return { [FACETS]: read(FACETS), [TAB]: read(TAB), [WORKSPACE]: read(WORKSPACE), [PAGE]: read(PAGE), [MODAL]: read(MODAL), [COMMS]: read(COMMS) };
}

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
  runChecks(loadSources());
  const failed = report("PARTNER ORDERS SEGREGATION");
  process.exitCode = failed ? 1 : 0;
} else {
  // ── PLANTED NEGATIVE CONTROLS ─────────────────────────────────────────────
  //
  // Each control mutates the REAL source on disk, re-runs the guard, and
  // asserts the named check flips to FAIL. Restoration happens in `finally`,
  // and this block never calls process.exit() — that would skip `finally` and
  // leave a planted mutation on disk.
  const controls = [
    {
      name: "partner leakage into retail Orders (default flipped to \"all\")",
      file: FACETS,
      from: 'const origin: OrderOriginFilter = f.orderOrigin ?? "direct";',
      to: 'const origin: OrderOriginFilter = f.orderOrigin ?? "all";',
      expect: "B1",
    },
    {
      name: "direct-order leakage into Partner Orders (workspace unpinned)",
      file: TAB,
      from: 'orderOrigin: "partner",',
      to: 'orderOrigin: "direct",',
      expect: "D2",
    },
    {
      name: "search bypasses the origin filter (predicate removed from the funnel)",
      file: FACETS,
      from: "  q = applyOrderOriginFilter(q, f);",
      to: "  // predicate removed by negative control",
      expect: "C1",
    },
    {
      name: "partner reference not searchable (partner_order_id dropped)",
      file: FACETS,
      from: "confirmation_id.ilike.${a},partner_order_id.ilike.${a},email.ilike.${a}",
      to: "confirmation_id.ilike.${a},email.ilike.${a}",
      expect: "C2",
    },
    {
      name: "partner order shown as Lead (Unpaid)",
      file: MODAL,
      from: '    return { label: "Partner Order", color: "bg-indigo-100 text-indigo-700" };',
      to: '    return { label: "Lead (Unpaid)", color: "bg-amber-100 text-amber-700" };',
      expect: "M3",
    },
    {
      name: "partner order shown Payment Not Linked / Stripe remediation",
      file: MODAL,
      from: "    !isPartnerOrder &&\n    !order.payment_intent_id &&",
      to: "    !order.payment_intent_id &&",
      expect: "M4",
    },
    {
      name: "partner order exposing SMS / Email / Call",
      file: MODAL,
      from: '<div className={`${isPartnerOrder ? "hidden" : "hidden sm:flex"} items-center gap-1.5`}>',
      to: '<div className="hidden sm:flex items-center gap-1.5">',
      expect: "M5",
    },
    {
      name: "partner order exposing the modal-header SMS / Call pair",
      file: MODAL,
      from: '${isPartnerOrder ? "hidden" : "hidden sm:flex"} whitespace-nowrap w-8 h-8',
      to: 'hidden sm:flex whitespace-nowrap w-8 h-8',
      expect: "M5b",
    },
    {
      name: "partner order exposing the customer-communication composer",
      file: COMMS,
      from: '<div className={`${partnerManaged ? "hidden" : "flex"} items-end gap-2 px-3 py-2.5`}>',
      to: '<div className="flex items-end gap-2 px-3 py-2.5">',
      expect: "M5c",
    },
    {
      name: "composer suppression made default-ON (would mute DIRECT orders)",
      file: COMMS,
      from: "  partnerManaged = false,",
      to: "  partnerManaged = true,",
      expect: "M5d",
    },
    {
      name: "partner order exposing GHL Sync / Re-sync",
      file: MODAL,
      from: '<div className={`col-span-2 sm:col-span-3 md:col-span-4 ${isPartnerOrder ? "hidden" : ""}`}>',
      to: '<div className="col-span-2 sm:col-span-3 md:col-span-4">',
      expect: "M6",
    },
    {
      name: "partner order exposing checkout-recovery / payment-failure remediation",
      file: MODAL,
      from: 'className={`mt-4 pt-4 border-t border-red-200 ${isPartnerOrder ? "hidden" : ""}`}',
      to: 'className="mt-4 pt-4 border-t border-red-200"',
      expect: "M7",
    },
    {
      name: "partner classified by email instead of authoritative origin",
      file: MODAL,
      from: '  return order.order_origin === "partner" && Boolean(order.partner_id);',
      to: '  return (order as { email?: string }).email?.includes("partner-fixture.test") ?? false;',
      expect: "M2",
    },
    {
      name: "direct order LOSES its retail payment labels",
      file: MODAL,
      from: 'value: isPartnerOrder ? "Partner funded" : (order.payment_intent_id ? "Paid" : "Unpaid"),',
      to: 'value: "Partner funded",',
      expect: "M9",
    },
    {
      name: "KPI/list predicate divergence (an unpredicated count query)",
      file: TAB,
      from: 'const { count } = await applyPartnerOnlyPredicates(\n              applyListPredicates(\n                supabase.from("orders").select("id", { count: "exact", head: true }),\n                filters,\n                "all",\n              ),\n            );',
      to: 'const { count } = await applyPartnerOnlyPredicates(\n                supabase.from("orders").select("id", { count: "exact", head: true }),\n            );',
      expect: "E1",
    },
    {
      name: "partner order labelled as an unpaid retail lead",
      file: TAB,
      from: "<td className=\"px-4 py-3 align-top text-gray-700\">{o.state ?? \"—\"}</td>",
      to: "<td className=\"px-4 py-3 align-top text-gray-700\">Unpaid</td>",
      expect: "F1",
    },
    {
      name: "a retail communication action appears on a partner row",
      file: TAB,
      from: "                    <td className=\"px-4 py-3 align-top tabular-nums text-gray-600\">",
      to: "                    <td onClick={() => sendSms(o)} className=\"px-4 py-3 align-top tabular-nums text-gray-600\">",
      expect: "G1",
    },
  ];

  let controlFailures = 0;
  const originals = new Map();

  try {
    // Baseline must be GREEN before any plant, or a control could "pass"
    // because the guard was already failing.
    results.length = 0;
    runChecks(loadSources());
    const baseFailed = report("BASELINE (must be clean before planting)");
    if (baseFailed) {
      console.log("\n  baseline is not clean — controls would be meaningless");
      controlFailures += 1;
    } else {
      for (const c of controls) {
        const path = join(ROOT, c.file);
        if (!originals.has(c.file)) originals.set(c.file, readFileSync(path, "utf8"));
        const src = read(c.file);
        if (!src.includes(c.from)) {
          console.log(`\n  CONTROL ANCHOR MISSING → ${c.name}\n        anchor not found in ${c.file}`);
          controlFailures += 1;
          continue;
        }
        writeFileSync(path, src.replace(c.from, c.to), "utf8");

        results.length = 0;
        runChecks(loadSources());
        const target = results.find((r) => r.name.startsWith(c.expect));
        const caught = target && !target.ok;
        console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
        if (!caught) controlFailures += 1;

        writeFileSync(path, originals.get(c.file), "utf8");
      }
    }
  } finally {
    for (const [rel, content] of originals) {
      writeFileSync(join(ROOT, rel), content, "utf8");
    }
  }

  // Re-verify the tree is clean after restoration.
  results.length = 0;
  runChecks(loadSources());
  const afterFailed = report("AFTER RESTORE (must be clean)");

  console.log(
    `\nSELF-TEST: ${controls.length - controlFailures}/${controls.length} controls detected` +
    `${afterFailed ? ", RESTORE FAILED" : ", tree restored"}`,
  );
  process.exitCode = controlFailures || afterFailed ? 1 : 0;
}
