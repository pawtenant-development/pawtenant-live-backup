// check-customer-portal-all-documents.mjs
//
// CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001
//
// Guards the two defects this task fixed, so neither can silently return:
//
//   Item 1 — the Customer Portal must render EVERY customer-visible document for
//            the selected order, one card per LOGICAL document (a version-chain
//            terminal), including the customer's own uploads. It previously
//            collapsed every letter-typed row into a single card and dropped
//            uploads entirely.
//
//   Item 2 — the Communications → Emails linked-order card must classify with the
//            CANONICAL lifecycle classifier (orderWorkflowState), not a second
//            status-string classifier that labelled paid-and-unassigned orders
//            "Under Review" next to a Provider row reading "Unassigned".
//
// Run:  node scripts/check-customer-portal-all-documents.mjs
// Self: node scripts/check-customer-portal-all-documents.mjs --self-test
//
// The self-test is the point. Each check is proved by PLANTING the exact defect
// it claims to catch, re-running the checks against the mutated tree, and
// asserting that the specific check FAILS. A guard that only ever passes proves
// nothing.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const FILES = {
  resolver: join(root, "src", "lib", "customerDocuments.ts"),
  portalPage: join(root, "src", "pages", "my-orders", "page.tsx"),
  docsCard: join(root, "src", "pages", "my-orders", "components", "MyDocumentsCard.tsx"),
  orderLink: join(root, "src", "lib", "orderLink.ts"),
  linkedCard: join(root, "src", "pages", "admin-orders", "components", "LinkedOrderCard.tsx"),
};

// SINGLE read point, and it normalises CRLF→LF here and nowhere else. With
// core.autocrlf=true a `\n`-anchored pattern silently matches nothing on a
// CRLF working copy, which would make every "must contain" check vacuously
// pass and every negative control report a false NO-OP.
function read(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Strip comments and string/template literals so a "must NOT contain" scan
 * asserts the USE of a construct, not a mention of it in prose. Without this,
 * the doc comment on summarizeOrderStatus() — which necessarily quotes
 * 'processing' and "Under Review" while explaining the bug — would trip the
 * very check that exists to forbid classifying on those strings.
 */
function stripComments(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === "/" && d === "/") { while (i < n && code.charCodeAt(i) !== 10) i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++;
      while (i < n && code[i] !== q) { if (code[i] === "\\") { out += code[i]; i++; } out += code[i]; i++; }
      out += code[i]; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function stripCommentsAndStrings(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === "/" && d === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && code[i] !== q) { if (code[i] === "\\") i++; i++; }
      i++; out += " "; continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * Bundle the REAL orderLink.ts so summarizeOrderStatus() can be exercised
 * behaviourally rather than grepped. It imports ./supabaseClient (which wants
 * browser env vars), so that one module is stubbed; everything the classifier
 * actually depends on — orderLifecycle.ts, orderClassification.ts — is bundled
 * for real. String-scanning alone cannot catch a hard-coded early return that
 * never mentions a forbidden token, which is exactly the defect Item 2 fixed.
 */
async function loadOrderLink() {
  const stub = {
    name: "stub-supabase",
    setup(build) {
      build.onResolve({ filter: /supabaseClient$/ }, () => ({ path: "supabaseClient", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const supabase = { rpc: async () => ({ data: null, error: null }) };",
        loader: "js",
      }));
    },
  };
  const out = await esbuild.build({
    entryPoints: [FILES.orderLink],
    bundle: true, format: "esm", write: false, platform: "neutral",
    plugins: [stub], logLevel: "silent",
  });
  const code = out.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

async function loadResolver() {
  const src = read(FILES.resolver);
  const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

// ── Fixtures ────────────────────────────────────────────────────────────────
let seq = 0;
const uid = () => `d-${++seq}`;
const letterRow = (over = {}) => ({
  id: uid(), label: "Letter", doc_type: "esa_letter",
  file_url: "https://x.supabase.co/storage/v1/object/sign/provider-letters/o.pdf",
  processed_file_url: "https://x.supabase.co/storage/v1/object/sign/letters/v.pdf",
  footer_injected: true, uploaded_at: "2026-06-21T04:08:59Z",
  customer_visible: true, superseded_by_document_id: null, review_status: "approved", ...over,
});
const uploadRow = (over = {}) => ({
  id: uid(), label: "RRHA_Reasonable_Accommodation_Form.pdf", doc_type: "customer_upload",
  file_url: "https://x.supabase.co/storage/v1/object/sign/customer-uploads/u.pdf",
  processed_file_url: null, footer_injected: false, uploaded_at: "2026-06-21T04:22:15Z",
  customer_visible: true, superseded_by_document_id: null, review_status: "not_applicable", ...over,
});
const order = (over = {}) => ({
  confirmation_id: "PT-PSD977033Z3", letter_type: "psd", doctor_status: "patient_notified",
  status: "completed", letter_id: "ESA-VA-XC4G7MT", signed_letter_url: null, documents: [], ...over,
});

// ── Checks ──────────────────────────────────────────────────────────────────
// Each returns { ok, detail }. Names are stable — the self-test targets them.

async function runChecks() {
  const results = [];
  const add = (name, ok, detail = "") => results.push({ name, ok, detail });

  let mod;
  try {
    mod = await loadResolver();
  } catch (e) {
    add("resolver loads", false, String(e && e.message));
    return results;
  }
  const { resolveCustomerDocuments } = mod;

  // ── B1 — the reported LIVE shape: main letter + additional documentation of
  // the SAME doc_type + a customer upload → THREE cards.
  {
    const main = letterRow({ doc_type: "psd_letter", label: "Letter DL PT PSD977033Z 06 20 26" });
    const extra = letterRow({ doc_type: "psd_letter", label: "Extra documentation PT PSD977033Z3 6 21 26", uploaded_at: "2026-06-22T02:03:05Z" });
    const up = uploadRow();
    const r = resolveCustomerDocuments(order({ documents: [main, up, extra] }));
    const ids = r.deliverables.map((d) => d.id);
    add("B1 same-doc_type rows do not collapse (3 cards for the PT-PSD977033Z3 shape)",
      r.deliverables.length === 3 && ids.includes(main.id) && ids.includes(extra.id) && ids.includes(up.id),
      `got ${r.deliverables.length} cards: ${JSON.stringify(r.deliverables.map((d) => d.title))}`);
    add("B1 the FIRST letter row keeps the main-letter title and verification id",
      r.deliverables[0]?.id === main.id && r.deliverables[0]?.title === "Signed PSD Letter" &&
      r.deliverables[0]?.verificationId === "ESA-VA-XC4G7MT",
      `got ${JSON.stringify(r.deliverables[0])}`);
    add("B1 the later letter row is additional documentation, not a second main letter",
      r.deliverables.some((d) => d.id === extra.id && d.kind === "additional_documentation" && d.verificationId === undefined),
      `got ${JSON.stringify(r.deliverables.map((d) => [d.id, d.kind]))}`);
    add("B1 the customer upload renders and is labelled as such",
      r.deliverables.some((d) => d.id === up.id && d.title === "Customer Upload"),
      `got ${JSON.stringify(r.deliverables.map((d) => d.title))}`);
  }

  // ── B2 — hidden / internal rows must never render.
  {
    const r = resolveCustomerDocuments(order({
      documents: [letterRow(), letterRow({ customer_visible: false, label: "ADMIN ONLY" })],
    }));
    add("B2 customer_visible=false row is never a deliverable",
      r.deliverables.length === 1, `got ${JSON.stringify(r.deliverables.map((d) => d.detail))}`);
  }
  {
    const r = resolveCustomerDocuments(order({
      documents: [letterRow(), uploadRow({ review_status: "pending_admin_approval" })],
    }));
    add("B2 non-released review_status row is never a deliverable",
      r.deliverables.length === 1, `got ${JSON.stringify(r.deliverables.map((d) => d.title))}`);
  }

  // ── B3 — versions: a lineage predecessor is history, never a second card.
  {
    const v2 = letterRow({ uploaded_at: "2026-08-05T10:00:00Z" });
    const v1 = letterRow({ uploaded_at: "2026-08-01T10:00:00Z", superseded_by_document_id: v2.id });
    const r = resolveCustomerDocuments(order({ documents: [v1, v2] }));
    add("B3 a superseded predecessor is not counted as a separate logical document",
      r.deliverables.length === 1 && r.deliverables[0].id === v2.id,
      `got ${JSON.stringify(r.deliverables.map((d) => d.id))}`);
  }

  // ── B4 — the provider's ORIGINAL file is never discarded in favour of the
  // stamped copy; both artifacts stay independently retrievable.
  {
    const r = resolveCustomerDocuments(order({ documents: [letterRow()] }));
    const d = r.deliverables[0];
    add("B4 the original artifact is preserved alongside the verified copy",
      !!d?.originalDownload && !!d?.verificationDownload &&
      d.originalDownload.variant === "original" && d.verificationDownload.variant === "verification",
      `got ${JSON.stringify({ o: d?.originalDownload, v: d?.verificationDownload })}`);
  }

  // ── B5 — partner-managed orders are delivered BY THE PARTNER. No PawTenant
  // portal delivery, therefore no PawTenant QR/verification surface at all.
  {
    const r = resolveCustomerDocuments(order({
      order_origin: "partner", partner_communication_policy: "partner_managed",
      documents: [letterRow(), uploadRow()],
    }));
    add("B5 partner-managed order exposes NO portal deliverables (no QR leakage)",
      r.deliverables.length === 0, `got ${JSON.stringify(r.deliverables.map((d) => d.title))}`);
  }
  {
    // A partner order with an unknown/missing policy is suppressed, not guessed.
    const r = resolveCustomerDocuments(order({ order_origin: "partner", documents: [letterRow()] }));
    add("B5 partner order with unknown policy is suppressed, never assumed direct",
      r.deliverables.length === 0, `got ${r.deliverables.length}`);
  }
  {
    // Direct orders — and LIVE, where order_origin does not exist as a column —
    // must be completely unaffected.
    const r = resolveCustomerDocuments(order({ documents: [letterRow()] }));
    add("B5 an order with no order_origin (LIVE shape) still renders normally",
      r.deliverables.length === 1, `got ${r.deliverables.length}`);
  }

  // ── B6 — a hostile filename is carried as inert text, never markup.
  {
    const nasty = '<img src=x onerror="alert(1)">.pdf';
    const r = resolveCustomerDocuments(order({ documents: [letterRow(), uploadRow({ label: nasty })] }));
    const up = r.deliverables.find((d) => d.kind === "customer_upload");
    add("B6 hostile filename is passed through as plain text for React to escape",
      up?.detail === nasty, `got ${JSON.stringify(up?.detail)}`);
  }

  // ── L — Item 2 behavioural matrix, run against the REAL summarizeOrderStatus.
  // The canonical rule is that `under_review` requires an ASSIGNED provider, so a
  // paid order with nobody assigned can never show "Under Review".
  {
    let link;
    try {
      link = await loadOrderLink();
    } catch (e) {
      add("L orderLink bundles", false, String(e && e.message));
      link = null;
    }
    if (link) {
     try {
      const { summarizeOrderStatus } = link;
      const base = {
        status: "processing", doctor_status: "pending_review", payment_intent_id: "pi_1",
        paid_at: "2026-08-19T15:11:55Z", doctor_user_id: null, doctor_email: null,
        refund_status: "none", refunded_at: null, refund_amount: null, dispute_id: null,
        payment_failed_at: null, payment_failure_reason: null,
        official_letter_reopened_at: null, official_letter_final_completed_at: null,
      };
      const label = (over) => summarizeOrderStatus({ ...base, ...over }).label;

      // The exact reported shape: PT-MSZGR2TS while it was paid and unassigned.
      add("L1 paid + no provider → Paid (Unassigned), never Under Review",
        label({}) === "Paid (Unassigned)", `got ${label({})}`);
      add("L2 paid + assigned provider → Under Review",
        label({ doctor_user_id: "u-1" }) === "Under Review", `got ${label({ doctor_user_id: "u-1" })}`);
      add("L3 delivered → Completed",
        label({ doctor_status: "patient_notified", doctor_user_id: "u-1" }) === "Completed",
        `got ${label({ doctor_status: "patient_notified", doctor_user_id: "u-1" })}`);
      add("L4 unpaid → Lead (Unpaid)",
        label({ status: "lead", payment_intent_id: null, paid_at: null }) === "Lead (Unpaid)",
        `got ${label({ status: "lead", payment_intent_id: null, paid_at: null })}`);
      add("L5 awaiting employee approval → Pending Delivery",
        label({ doctor_status: "pending_admin_approval", doctor_user_id: "u-1" }) === "Pending Delivery",
        `got ${label({ doctor_status: "pending_admin_approval", doctor_user_id: "u-1" })}`);
      add("L6 full refund → Refunded",
        label({ refund_status: "full", refunded_at: "2026-08-19T18:00:00Z" }) === "Refunded",
        `got ${label({ refund_status: "full", refunded_at: "2026-08-19T18:00:00Z" })}`);
      add("L6 dispute → Disputed",
        label({ dispute_id: "dp_1" }) === "Disputed", `got ${label({ dispute_id: "dp_1" })}`);
      add("L6 cancelled → Cancelled",
        label({ status: "cancelled" }) === "Cancelled", `got ${label({ status: "cancelled" })}`);
      add("L7 a partial refund stays operational, not terminal",
        label({ refund_status: "partial", refunded_at: "2026-08-19T18:00:00Z" }).startsWith("Paid (Unassigned)"),
        `got ${label({ refund_status: "partial", refunded_at: "2026-08-19T18:00:00Z" })}`);
      // The contradiction guard, stated directly: across a spread of shapes, the
      // chip may only read "Under Review" when a provider is genuinely assigned.
      const shapes = [
        {}, { doctor_user_id: "u-1" }, { doctor_email: "d@x.com" },
        { status: "under-review" }, { status: "under_review" }, { status: "processing" },
        { status: "completed" }, { status: "lead", payment_intent_id: null },
      ];
      const contradiction = shapes.find((sh) => {
        const o = { ...base, ...sh };
        return summarizeOrderStatus(o).label === "Under Review" && !o.doctor_user_id && !o.doctor_email;
      });
      add("L8 'Under Review' never appears on an unassigned order",
        !contradiction, `contradicting shape: ${JSON.stringify(contradiction)}`);
     } catch (e) {
      // A classifier that throws is a broken classifier. Record it as a failure
      // of the behavioural checks rather than letting it abort the whole run —
      // the self-test plants defects that deliberately break this module, and an
      // uncaught throw there would stop every later negative control.
      add("L1 paid + no provider → Paid (Unassigned), never Under Review", false, String(e && e.message));
      add("L8 'Under Review' never appears on an unassigned order", false, String(e && e.message));
     }
    }
  }

  // ── B7 — two cards of the SAME kind must stay tellable apart. Rendering every
  // document is only half the fix; two identical-looking cards leave the customer
  // unable to pick the right file. Caught in browser QA on PT-QA-LATEHOUSING,
  // which carries two completed housing forms with different stored labels.
  {
    const h1 = { ...uploadRow(), doc_type: "housing_completed", label: "Completed Housing" };
    const h2 = { ...uploadRow(), doc_type: "housing_completed", label: "Completed Housing Form" };
    const r = resolveCustomerDocuments(order({ documents: [letterRow(), h1, h2] }));
    const shown = r.deliverables.map((d) => `${d.title}||${d.detail ?? ""}`);
    add("B7 same-kind cards are distinguishable when their stored labels differ",
      new Set(shown).size === shown.length, `got ${JSON.stringify(shown)}`);
  }

  // ── S1 — every portal document fetch selects the shared column list and is
  // scoped to the customer's own orders. A fetch that drops the order predicate
  // would leak another customer's documents; one that hand-rolls its column list
  // can silently omit superseded_by_document_id and resurrect old versions.
  {
    const src = read(FILES.portalPage);
    // Fetches are counted on comment-stripped source (the table name is a string
    // literal, so full stripping would erase it); the shared-constant selects are
    // counted on the same source, where CUSTOMER_DOCUMENT_COLUMNS is an
    // identifier. A hand-rolled `.select("...")` therefore shows up as a fetch
    // with no matching shared select.
    const code = stripComments(src);
    const fetches = code.split('from("order_documents")').length - 1;
    const shared = (code.match(/\.select\(CUSTOMER_DOCUMENT_COLUMNS\)/g) || []).length;
    add("S1 every order_documents fetch uses the shared column list",
      fetches > 0 && shared === fetches, `${fetches} fetches, ${shared} using CUSTOMER_DOCUMENT_COLUMNS`);

    // Each fetch block must carry BOTH an owning-order predicate and the
    // customer_visible predicate.
    const blocks = code.split('from("order_documents")').slice(1);
    const scoped = blocks.filter((b) => {
      const head = b.slice(0, 400);
      return /\.(in|eq)\("order_id"/.test(head) && /\.eq\("customer_visible",\s*true\)/.test(head);
    }).length;
    add("S1 every order_documents fetch is scoped by order_id AND customer_visible",
      blocks.length > 0 && scoped === blocks.length, `${scoped}/${blocks.length} scoped`);

    add("S1 the shared column list still carries the version-lineage column",
      /superseded_by_document_id/.test(read(FILES.resolver).match(/CUSTOMER_DOCUMENT_COLUMNS[\s\S]{0,400}/)?.[0] ?? ""),
      "CUSTOMER_DOCUMENT_COLUMNS must select superseded_by_document_id");
  }

  // ── S2 — the card never injects HTML and never renders a raw storage URL.
  {
    const code = stripCommentsAndStrings(read(FILES.docsCard));
    add("S2 the documents card never uses dangerouslySetInnerHTML",
      !/dangerouslySetInnerHTML/.test(code), "dangerouslySetInnerHTML found in MyDocumentsCard");
    add("S2 the documents card never renders a raw storage URL",
      !/\b(file_url|processed_file_url)\b/.test(code),
      "MyDocumentsCard must go through the signed-URL helper, never a stored URL");
  }

  // ── S3 — the linked-order chip delegates to the CANONICAL classifier.
  {
    const code = stripCommentsAndStrings(read(FILES.orderLink));
    add("S3 summarizeOrderStatus delegates to the canonical workflow classifier",
      /orderWorkflowState\s*\(/.test(code), "orderLink.ts must call orderWorkflowState()");
    add("S3 no second lifecycle classifier keyed on raw status strings",
      !/["']?under[-_]review["']?/.test(code) && !/processing/.test(code),
      "orderLink.ts must not re-derive lifecycle from orders.status text");
    add("S3 the linked-order projection carries the provider-assignment fields",
      /doctor_user_id/.test(code) && /doctor_email/.test(code),
      "LinkedOrder must expose the fields the canonical classifier reads");
  }

  // ── S4 — the linked order opens the EXACT order, not just the Orders tab.
  {
    const src = read(FILES.linkedCard);
    add("S4 linked-order card deep-links to the exact order modal",
      /\/admin-orders\?order=/.test(src) && /encodeURIComponent/.test(src),
      "LinkedOrderCard must link to /admin-orders?order=<id>");
    const code = stripCommentsAndStrings(src);
    add("S4 provider display is derived from assignment, not from doctor_name alone",
      /doctor_user_id/.test(code) && /doctor_email/.test(code),
      "providerLabel() must key 'Unassigned' off the assignment fields");
  }

  return results;
}

// ── Negative controls ───────────────────────────────────────────────────────
// Each plants ONE real defect and names the check that must go red.
const PLANTS = [
  {
    name: "group documents by doc_type alone (render one card per type)",
    file: "resolver",
    find: "const letterDocs = docs.filter((d) => LETTER_DOC_TYPES.includes(d.doc_type));",
    replace: "const letterDocs = docs.filter((d) => LETTER_DOC_TYPES.includes(d.doc_type)).slice(0, 1);",
    expect: "B1 same-doc_type rows do not collapse (3 cards for the PT-PSD977033Z3 shape)",
  },
  {
    name: "return only the first document",
    file: "resolver",
    find: "  return {\n    deliverables,",
    replace: "  return {\n    deliverables: deliverables.slice(0, 1),",
    expect: "B1 same-doc_type rows do not collapse (3 cards for the PT-PSD977033Z3 shape)",
  },
  {
    name: "expose hidden / admin-only documents",
    file: "resolver",
    find: "  if (!d.customer_visible) return false;",
    replace: "  if (false) return false;",
    expect: "B2 customer_visible=false row is never a deliverable",
  },
  {
    name: "drop the approval gate on unreleased documents",
    file: "resolver",
    find: "  return RELEASABLE_REVIEW_STATUS.includes(rs);",
    replace: "  return true || RELEASABLE_REVIEW_STATUS.includes(rs);",
    expect: "B2 non-released review_status row is never a deliverable",
  },
  {
    name: "count prior versions as separate logical documents",
    file: "resolver",
    find: "  if (d.superseded_by_document_id) return false;",
    replace: "  if (false) return false;",
    expect: "B3 a superseded predecessor is not counted as a separate logical document",
  },
  {
    name: "discard the original in favour of the stamped copy",
    file: "resolver",
    find: "  const hasOriginal = !!doc.file_url && !collides;",
    replace: "  const hasOriginal = false;",
    expect: "B4 the original artifact is preserved alongside the verified copy",
  },
  {
    name: "render same-kind cards without their distinguishing label",
    file: "resolver",
    find: '        detail: detailFor(doc, "Completed Housing Accommodation Form"),' + String.fromCharCode(10),
    replace: "",
    expect: "B7 same-kind cards are distinguishable when their stored labels differ",
  },
  {
    name: "leak PawTenant portal delivery into a partner-managed order",
    file: "resolver",
    find: '  if ((order.order_origin ?? "") !== "partner") return false;',
    replace: "  return false;",
    expect: "B5 partner-managed order exposes NO portal deliverables (no QR leakage)",
  },
  {
    name: "drop the version-lineage column from the shared select",
    file: "resolver",
    find: "customer_visible, superseded_by_document_id, review_status, order_id",
    replace: "customer_visible, review_status, order_id",
    expect: "S1 the shared column list still carries the version-lineage column",
  },
  {
    name: "hand-roll a column list on one portal fetch (drifts from the shared one)",
    file: "portalPage",
    find: ".select(CUSTOMER_DOCUMENT_COLUMNS)",
    replace: '.select("id, label, doc_type, file_url, customer_visible, order_id")',
    replaceOnce: true,
    expect: "S1 every order_documents fetch uses the shared column list",
  },
  {
    name: "drop the owning-order predicate from a portal fetch (cross-order leak)",
    file: "portalPage",
    find: '.eq("order_id", orderId)\n      .eq("customer_visible", true)',
    replace: '.eq("customer_visible", true)',
    expect: "S1 every order_documents fetch is scoped by order_id AND customer_visible",
  },
  {
    name: "render a document label as raw HTML (XSS via filename)",
    file: "docsCard",
    find: "{doc.detail}",
    replace: "<span dangerouslySetInnerHTML={{ __html: doc.detail }} />",
    expect: "S2 the documents card never uses dangerouslySetInnerHTML",
  },
  {
    name: "expose a raw storage URL in the DOM",
    file: "docsCard",
    find: "const dateLine =",
    replace: "const rawHref = (doc as unknown as { file_url?: string }).file_url;\n  const dateLine =",
    expect: "S2 the documents card never renders a raw storage URL",
  },
  {
    name: "hard-code Under Review for every paid order",
    file: "orderLink",
    find: "  switch (orderWorkflowState(o)) {",
    replace: '  if (o.payment_intent_id) return { label: "Under Review", tone: "violet", icon: "ri-time-line" };\n  switch (orderWorkflowState(o)) {',
    expect: "L8 'Under Review' never appears on an unassigned order",
  },
  {
    name: "duplicate the lifecycle rules instead of using the canonical classifier",
    file: "orderLink",
    find: "  switch (orderWorkflowState(o)) {",
    replace: '  switch (((o.status ?? "").toLowerCase() === "processing" ? "under_review" : orderWorkflowStateREMOVED(o))) {',
    expect: "S3 summarizeOrderStatus delegates to the canonical workflow classifier",
  },
  {
    name: "open only the Orders tab instead of the exact order",
    file: "linkedCard",
    find: "return `/admin-orders?order=${encodeURIComponent(o.confirmation_id ?? o.id)}`;",
    replace: 'return "/admin-orders?tab=orders";',
    expect: "S4 linked-order card deep-links to the exact order modal",
  },
];

// ── Runner ──────────────────────────────────────────────────────────────────
const selfTest = process.argv.includes("--self-test");

if (!selfTest) {
  const results = await runChecks();
  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `\n      ${r.detail}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  // process.exitCode, never process.exit(): an abrupt exit here would be fine,
  // but keeping one convention across both branches is what stops the self-test
  // branch below from ever skipping its restore.
  if (failed > 0) process.exitCode = 1;
} else {
  console.log("negative controls — each plants a real defect and must be caught\n");
  const originals = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(p, "utf8")]));
  let bad = 0;
  try {
    for (const plant of PLANTS) {
      const path = FILES[plant.file];
      const before = read(path);
      if (!before.includes(plant.find)) {
        console.error(`  ✗ ${plant.name}\n      NO-OP: anchor not found in ${plant.file} — the control proves nothing`);
        bad++;
        continue;
      }
      const after = plant.replaceOnce
        ? before.replace(plant.find, plant.replace)
        : before.split(plant.find).join(plant.replace);
      writeFileSync(path, after, "utf8");

      const results = await runChecks();
      const target = results.find((r) => r.name === plant.expect);
      writeFileSync(path, originals[plant.file], "utf8");

      if (!target) {
        console.error(`  ✗ ${plant.name}\n      check "${plant.expect}" does not exist`);
        bad++;
      } else if (target.ok) {
        console.error(`  ✗ ${plant.name}\n      NOT CAUGHT by "${plant.expect}"`);
        bad++;
      } else {
        console.log(`  ✓ ${plant.name}\n      caught by "${plant.expect}"`);
      }
    }
  } finally {
    // Restore unconditionally. Never process.exit() inside this block — it would
    // skip the finally and leave a planted mutation on disk.
    for (const [k, p] of Object.entries(FILES)) writeFileSync(p, originals[k], "utf8");
  }

  const clean = await runChecks();
  const cleanFailed = clean.filter((r) => !r.ok);
  if (cleanFailed.length > 0) {
    console.error(`\n  ✗ tree not clean after restore: ${cleanFailed.map((r) => r.name).join(", ")}`);
    bad++;
  } else {
    console.log("\n  ✓ clean tree restored and all checks pass");
  }

  console.log(`\n${PLANTS.length - bad} of ${PLANTS.length} negative controls proved`);
  if (bad > 0) process.exitCode = 1;
}
