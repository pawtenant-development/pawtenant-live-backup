// Standalone test harness for the shared customer document resolver
// (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001). This repo has no unit-test
// framework; rather than add one (which would churn package.json / package-lock),
// we transpile the REAL resolver with esbuild (already a Vite dependency) and assert
// the §14 document-grouping scenarios against the actual shipped logic.
//
//   node scripts/test-customer-documents.mjs
//
// Covers resolver-testable scenarios 1–8 + the version-lineage rules. Scenarios
// 9–10 (cross-customer / anonymous authorization) are enforced server-side by
// get-document-signed-url RLS and are verified by the authenticated API tests in
// the task QA, not by this pure harness.
//
// ── CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001 rewrote several expectations ──
// The resolver used to render AT MOST two cards and deliberately EXCLUDED the
// customer's own uploads. The portal must now show EVERY customer-visible
// document, one card per logical document, where "logical document" means a
// version chain terminal (`superseded_by_document_id IS NULL`) — never a
// doc_type bucket. Assertions that asserted the old collapsing behaviour are
// updated below and annotated with why they flipped.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "src", "lib", "customerDocuments.ts"), "utf8");
const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const { resolveCustomerDocuments } = mod;

let passed = 0;
let failed = 0;
const fail = (name, msg) => { failed++; console.error(`  ✗ ${name}\n      ${msg}`); };
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };
function check(name, cond, msg) { if (cond) ok(name); else fail(name, msg || "assertion failed"); }

// ── Fixture builders ────────────────────────────────────────────────────────
let seq = 0;
const uid = () => `doc-${++seq}`;
const finalizedLetter = (doc_type, over = {}) => ({
  id: uid(), label: "letter", doc_type, file_url: "orig.pdf", processed_file_url: "final.pdf",
  footer_injected: true, uploaded_at: "2026-07-12T11:44:00Z", customer_visible: true, ...over,
});
const rawLetterOriginal = (doc_type) => ({
  id: uid(), label: "raw", doc_type, file_url: "orig.pdf", processed_file_url: null,
  footer_injected: false, uploaded_at: "2026-07-12T11:40:00Z", customer_visible: true,
});
const customerSource = (over = {}) => ({
  id: uid(), label: "Landlord Form.pdf", doc_type: "customer_upload", file_url: "src.pdf",
  processed_file_url: null, footer_injected: false, uploaded_at: "2026-07-12T11:39:00Z",
  customer_visible: true, ...over,
});
const housingCompleted = (over = {}) => ({
  id: uid(), label: "Completed Housing Accommodation Form", doc_type: "housing_completed",
  file_url: "hc.pdf", processed_file_url: null, footer_injected: false,
  uploaded_at: "2026-07-12T14:04:00Z", customer_visible: true, ...over,
});
const delivered = (over = {}) => ({
  confirmation_id: "PT-TEST01", letter_type: "esa", doctor_status: "patient_notified",
  status: "completed", letter_id: "ESA-AR-LENYUFW", signed_letter_url: "final.pdf", documents: [], ...over,
});

const kinds = (r) => r.deliverables.map((d) => d.kind);
const byKind = (r, k) => r.deliverables.find((d) => d.kind === k);

console.log("customerDocuments resolver — §14 document-grouping scenarios\n");

// 1) ESA letter + completed Housing form
{
  const r = resolveCustomerDocuments(delivered({ documents: [customerSource(), finalizedLetter("esa_letter"), housingCompleted()] }));
  // FLIPPED: the customer's own upload is now a deliverable in its own right.
  check("1 ESA+housing+upload: [esa_letter, housing_completed, customer_upload]", JSON.stringify(kinds(r)) === JSON.stringify(["esa_letter", "housing_completed", "customer_upload"]), `got ${JSON.stringify(kinds(r))}`);
  check("1 ESA letter carries verification id", byKind(r, "esa_letter")?.verificationId === "ESA-AR-LENYUFW");
  check("1 housing_completed has NO verification id", byKind(r, "housing_completed")?.verificationId === undefined);
  check("1 housing_completed titled correctly", byKind(r, "housing_completed")?.title === "Completed Housing Accommodation Form");
  check("1 esa letter titled 'Signed ESA Letter'", byKind(r, "esa_letter")?.title === "Signed ESA Letter");
  // FLIPPED: hiding the customer's own file was half of the reported defect.
  check("1 source upload IS a deliverable, clearly labelled", kinds(r).includes("customer_upload") && byKind(r, "customer_upload")?.title === "Customer Upload" && r.deliverables.length === 3);
  check("1 customer upload keeps its own filename as detail", byKind(r, "customer_upload")?.detail === "Landlord Form.pdf");
  check("1 customer upload carries NO verification id", byKind(r, "customer_upload")?.verificationId === undefined);
}

// 2) PSD letter + completed Housing form
{
  const r = resolveCustomerDocuments(delivered({ letter_type: "psd", confirmation_id: "PT-PSDX01", letter_id: "PSD-FL-ABC1234", documents: [finalizedLetter("psd_letter"), housingCompleted()] }));
  check("2 PSD+housing: [psd_letter, housing_completed]", JSON.stringify(kinds(r)) === JSON.stringify(["psd_letter", "housing_completed"]), `got ${JSON.stringify(kinds(r))}`);
  check("2 PSD letter titled 'Signed PSD Letter'", byKind(r, "psd_letter")?.title === "Signed PSD Letter");
  check("2 PSD letter carries verification id", byKind(r, "psd_letter")?.verificationId === "PSD-FL-ABC1234");
  check("2 housing_completed still has NO verification id", byKind(r, "housing_completed")?.verificationId === undefined);
}

// 3) ESA letter only
{
  const r = resolveCustomerDocuments(delivered({ documents: [finalizedLetter("esa_letter")] }));
  check("3 letter only: [esa_letter]", JSON.stringify(kinds(r)) === JSON.stringify(["esa_letter"]), `got ${JSON.stringify(kinds(r))}`);
  check("3 hasLetter true / hasHousingCompleted false", r.hasLetter === true && r.hasHousingCompleted === false);
}

// 4) Housing pending — source uploaded, provider not done yet (letter delivered)
{
  const r = resolveCustomerDocuments(delivered({ documents: [finalizedLetter("esa_letter"), customerSource()] }));
  // FLIPPED: the upload still must not masquerade as a COMPLETED housing form,
  // but it is the customer's file and must be retrievable.
  check("4 housing pending: [esa_letter, customer_upload] and no fake housing row", JSON.stringify(kinds(r)) === JSON.stringify(["esa_letter", "customer_upload"]), `got ${JSON.stringify(kinds(r))}`);
  check("4 source form not surfaced as deliverable", r.hasHousingCompleted === false);
}

// 5) Late Housing follow-up ACTIVE — order reopened (under-review) but letter_id present
{
  const r = resolveCustomerDocuments(delivered({ status: "under-review", doctor_status: "in_review", additional_documentation_status: "uploaded", documents: [finalizedLetter("esa_letter"), customerSource()] }));
  check("5 reopened order still shows the delivered letter (letter_id honored)", kinds(r).includes("esa_letter"), `got ${JSON.stringify(kinds(r))}`);
  check("5 no completed-housing row while follow-up still active", r.hasHousingCompleted === false);
}

// 6) Multiple legitimate source forms + a completed form
{
  const r = resolveCustomerDocuments(delivered({ documents: [customerSource({ label: "Form A.pdf" }), customerSource({ label: "Form B.pdf" }), finalizedLetter("esa_letter"), housingCompleted()] }));
  // FLIPPED: two DISTINCT uploads are two documents; collapsing them by type is
  // exactly the defect. They stay distinguishable by their own detail lines.
  check("6 multiple sources each render", JSON.stringify(kinds(r)) === JSON.stringify(["esa_letter", "housing_completed", "customer_upload", "customer_upload"]), `got ${JSON.stringify(kinds(r))}`);
  check("6 the two uploads are distinguishable", JSON.stringify(r.deliverables.filter((d) => d.kind === "customer_upload").map((d) => d.detail)) === JSON.stringify(["Form A.pdf", "Form B.pdf"]));
  check("6 exactly one completed-housing deliverable", r.deliverables.filter((d) => d.kind === "housing_completed").length === 1);
}

// 7) Two housing_completed ROWS with no lineage link are two documents.
//
// FLIPPED. This previously asserted they collapse to one. Collapsing by doc_type
// is precisely the reported defect: on LIVE, two same-typed rows are routinely
// two genuinely different files (two pets, a letter plus additional
// documentation, a letter plus a notarized copy). A row is only ever suppressed
// when the SYSTEM says another row replaced it — see 7d.
{
  const hc = housingCompleted();
  const r = resolveCustomerDocuments(delivered({ documents: [finalizedLetter("esa_letter"), hc, { ...hc, id: uid() }] }));
  check("7 two unlinked housing_completed rows render as two documents", r.deliverables.filter((d) => d.kind === "housing_completed").length === 2, `got ${JSON.stringify(kinds(r))}`);
}

// 7d) Lineage — and ONLY lineage — collapses a row. A predecessor stamped with
// superseded_by_document_id is history, not a card.
{
  const v2 = housingCompleted();
  const v1 = housingCompleted({ superseded_by_document_id: v2.id });
  const r = resolveCustomerDocuments(delivered({ documents: [finalizedLetter("esa_letter"), v1, v2] }));
  const shown = r.deliverables.filter((d) => d.kind === "housing_completed");
  check("7d superseded predecessor is not rendered", shown.length === 1 && shown[0].id === v2.id, `got ${JSON.stringify(shown.map((d) => d.id))}`);
}

// 7e) The approval gate: a row awaiting admin approval is never customer-facing,
// even if customer_visible somehow said otherwise.
{
  const r = resolveCustomerDocuments(delivered({
    documents: [finalizedLetter("esa_letter"), housingCompleted({ review_status: "pending_admin_approval" })],
  }));
  check("7e pending_admin_approval row is withheld", r.hasHousingCompleted === false, `got ${JSON.stringify(kinds(r))}`);
}

// 7b) CUSTOMER-DUAL-LETTER-DOWNLOADS-001 revises this case.
//
// It used to assert that an un-stamped provider original is NEVER a deliverable.
// That was written when the card had one ambiguous Download and the only safe
// answer was to hide anything unstamped. But `docs` is already filtered to
// customer_visible, and the trg_order_document_release_gate trigger lets nothing
// but a release function set that flag — so a customer_visible un-stamped letter
// is an APPROVED, DELIVERED letter that injection simply never ran on (2 such
// rows on LIVE, 5 on TEST). Those customers reach the same bytes today anyway,
// via the orders.signed_letter_url fallback, which approve_order_document sets to
// coalesce(processed_file_url, file_url) — i.e. the original. The row-based path
// is the same file with authorization and an honest label.
{
  const r = resolveCustomerDocuments(delivered({ signed_letter_url: null, documents: [rawLetterOriginal("esa_letter")] }));
  const d = byKind(r, "esa_letter");
  check("7b approved-but-unstamped letter offers ORIGINAL only",
    !!d && !!d.originalDownload && !d.verificationDownload,
    `got ${JSON.stringify(r.deliverables)}`);
  check("7b unstamped letter reports the verification artifact as missing",
    !!d && JSON.stringify(d.missingArtifacts) === JSON.stringify(["verification"]),
    `got ${JSON.stringify(d?.missingArtifacts)}`);
}

// 7c) A NON-visible raw original is still never a deliverable (the gate itself).
{
  const r = resolveCustomerDocuments(delivered({
    signed_letter_url: null,
    documents: [{ ...rawLetterOriginal("esa_letter"), customer_visible: false }],
  }));
  check("7c hidden un-stamped original yields NO deliverable",
    r.hasLetter === false && r.deliverables.length === 0, `got ${JSON.stringify(r.deliverables)}`);
}

// 8) Unpaid customer / no completed documents → empty
{
  const r = resolveCustomerDocuments({ confirmation_id: "PT-LEAD01", letter_type: "esa", status: "lead", doctor_status: null, letter_id: null, signed_letter_url: null, documents: [] });
  check("8 unpaid lead: no deliverables + empty-state signal", r.deliverables.length === 0 && r.hasLetter === false && r.hasHousingCompleted === false);
}

// Extra) housing_completed can arrive on a completed order even without letter delivered fields set oddly
{
  const r = resolveCustomerDocuments(delivered({ doctor_status: "patient_notified", letter_id: null, signed_letter_url: null, documents: [housingCompleted()] }));
  check("extra housing_completed surfaces even with no letter doc", r.hasHousingCompleted === true && kinds(r).includes("housing_completed"));
}

// Non-visible rows must be ignored
{
  const r = resolveCustomerDocuments(delivered({ documents: [finalizedLetter("esa_letter"), housingCompleted({ customer_visible: false })] }));
  check("guard: customer_visible=false housing row is excluded", r.hasHousingCompleted === false, `got ${JSON.stringify(kinds(r))}`);
}

// ══ CUSTOMER-DUAL-LETTER-DOWNLOADS-001 — required regression matrix ═════════
//
// Every delivered ESA/PSD letter must expose TWO independently retrievable
// downloads resolved from ONE document row: the provider's exact original
// (file_url) and the separately generated Verification-ID copy
// (processed_file_url). They are distinct storage objects; neither may ever
// stand in for the other.
console.log("\nCUSTOMER-DUAL-LETTER-DOWNLOADS-001 — dual download regression matrix\n");

const pair = (doc_type, over = {}) => ({
  id: uid(), label: "letter", doc_type,
  file_url: "https://x.supabase.co/storage/v1/object/sign/provider-letters/PT-DUAL/provider/orig.pdf?token=a",
  processed_file_url: "https://x.supabase.co/storage/v1/object/sign/letters/PT-DUAL-verified.pdf?token=b",
  footer_injected: true, uploaded_at: "2026-08-01T10:00:00Z", customer_visible: true, ...over,
});

// R1 — completed ESA order with both files
{
  const r = resolveCustomerDocuments(delivered({ confirmation_id: "PT-MSMAS1S3", documents: [pair("esa_letter")] }));
  const d = byKind(r, "esa_letter");
  check("R1 ESA: both downloads present", !!d?.originalDownload && !!d?.verificationDownload);
  check("R1 ESA: variants are correctly tagged",
    d?.originalDownload?.variant === "original" && d?.verificationDownload?.variant === "verification");
  check("R1 ESA: nothing reported missing", JSON.stringify(d?.missingArtifacts) === "[]", `got ${JSON.stringify(d?.missingArtifacts)}`);
  check("R1 ESA: original filename",
    d?.originalDownload?.filename === "PawTenant-ESA-Letter-Original-PT-MSMAS1S3.pdf", `got ${d?.originalDownload?.filename}`);
  check("R1 ESA: verification filename",
    d?.verificationDownload?.filename === "PawTenant-ESA-Letter-Verification-PT-MSMAS1S3.pdf", `got ${d?.verificationDownload?.filename}`);
  check("R1 ESA: the two filenames differ",
    d?.originalDownload?.filename !== d?.verificationDownload?.filename);
}

// R2 — completed PSD order with both files → product label follows the ORDER
{
  const r = resolveCustomerDocuments(delivered({
    confirmation_id: "PT-PSD06N5XDOF", letter_type: "psd", letter_id: "PSD-FL-EKBEVYD",
    documents: [pair("psd_letter")],
  }));
  const d = byKind(r, "psd_letter");
  check("R2 PSD: both downloads present", !!d?.originalDownload && !!d?.verificationDownload);
  check("R2 PSD: filenames use the PSD product label",
    d?.originalDownload?.filename === "PawTenant-PSD-Letter-Original-PT-PSD06N5XDOF.pdf" &&
    d?.verificationDownload?.filename === "PawTenant-PSD-Letter-Verification-PT-PSD06N5XDOF.pdf",
    `got ${d?.originalDownload?.filename} / ${d?.verificationDownload?.filename}`);
}

// R2b — a PSD order whose letter row is stored as esa_letter still labels by the
// ORDER, so a provider misclassification cannot rename the customer's file.
{
  const r = resolveCustomerDocuments(delivered({
    confirmation_id: "PT-PSDXYZ", letter_type: "psd", documents: [pair("esa_letter")],
  }));
  const d = r.deliverables[0];
  check("R2b PSD order + esa_letter row: still labelled PSD",
    d?.kind === "psd_letter" && d?.originalDownload?.filename.startsWith("PawTenant-PSD-"),
    `got ${d?.kind} / ${d?.originalDownload?.filename}`);
}

// R3 — historical order (public-bucket URLs, older shape) still yields both
{
  const r = resolveCustomerDocuments(delivered({
    confirmation_id: "PT-MNXBWBFJ",
    documents: [pair("esa_letter", {
      file_url: "https://x.supabase.co/storage/v1/object/public/provider-letters/PT-MNXBWBFJ-177609-Noa.pdf",
      processed_file_url: "https://x.supabase.co/storage/v1/object/public/letters/PT-MNXBWBFJ-e04036-verified.pdf",
      uploaded_at: "2026-04-11T10:00:00Z",
    })],
  }));
  const d = byKind(r, "esa_letter");
  check("R3 historical public-bucket row: both downloads present",
    !!d?.originalDownload && !!d?.verificationDownload);
}

// R4 — only ONE genuine file exists → only that action, and it is REPORTED
{
  const r = resolveCustomerDocuments(delivered({
    confirmation_id: "PT-MO6KE9TE", signed_letter_url: null,
    documents: [pair("esa_letter", { processed_file_url: null, footer_injected: false })],
  }));
  const d = byKind(r, "esa_letter");
  check("R4 original-only: no verification button", !!d?.originalDownload && !d?.verificationDownload);
  check("R4 original-only: missing artifact reported",
    JSON.stringify(d?.missingArtifacts) === JSON.stringify(["verification"]), `got ${JSON.stringify(d?.missingArtifacts)}`);
}

// R5 — additional-documentation / RA / housing files are NEVER assigned to
// either letter button, and never become an ESA/PSD letter themselves.
{
  const r = resolveCustomerDocuments(delivered({
    documents: [customerSource({ label: "Landlord RA Form.pdf" }), pair("esa_letter"), housingCompleted()],
  }));
  const letter = byKind(r, "esa_letter");
  const housing = byKind(r, "housing_completed");
  check("R5 letter buttons resolve to the LETTER row only",
    letter?.originalDownload?.documentId === letter?.id &&
    letter?.verificationDownload?.documentId === letter?.id &&
    letter?.id !== housing?.id);
  check("R5 housing form gets NEITHER letter button",
    !housing?.originalDownload && !housing?.verificationDownload);
  check("R5 customer source upload is still not a deliverable",
    !r.deliverables.some((x) => x.title.includes("Landlord")));
  check("R5 notarized/RA extra doc types never become a letter kind",
    kinds(r).filter((k) => k === "esa_letter" || k === "psd_letter").length === 1);
}

// R6 — revised letter history: BOTH buttons must come from the CURRENT approved
// row, never a v1 original paired with a v2 stamped copy.
{
  const v1 = pair("esa_letter", {
    file_url: "sign/provider-letters/v1-orig.pdf", processed_file_url: "sign/letters/v1-verified.pdf",
    uploaded_at: "2026-08-01T10:00:00Z",
  });
  const v2 = pair("esa_letter", {
    file_url: "sign/provider-letters/v2-orig.pdf", processed_file_url: "sign/letters/v2-verified.pdf",
    uploaded_at: "2026-08-05T10:00:00Z",
  });
  // The fixture now models what the pipeline ACTUALLY writes: approve_order_document
  // (migration 20260729121500) stamps the retired row's superseded_by_document_id
  // with the replacement's id. Without that marker these are not a revision pair at
  // all — they are two separate letters, which is the LIVE two-pet case.
  v1.superseded_by_document_id = v2.id;
  const r = resolveCustomerDocuments(delivered({ documents: [v1, v2] }));
  const d = byKind(r, "esa_letter");
  check("R6 revision: resolves to the NEWEST row", d?.id === v2.id, `got ${d?.id} want ${v2.id}`);
  check("R6 revision: both buttons come from that same row",
    d?.originalDownload?.documentId === v2.id && d?.verificationDownload?.documentId === v2.id);

  // Same rows, reversed array — one of the portal's three document fetches issues
  // no ORDER BY, so the resolver must not depend on arrival order.
  const rRev = resolveCustomerDocuments(delivered({ documents: [v2, v1] }));
  check("R6 revision: order-independent (unsorted query still picks v2)",
    byKind(rRev, "esa_letter")?.id === v2.id, `got ${byKind(rRev, "esa_letter")?.id}`);
}

// R6b — a stamped row still outranks a NEWER un-stamped one, so no order that
// resolves to a verification PDF today can be demoted by this change.
{
  const stamped = pair("esa_letter", { uploaded_at: "2026-08-01T10:00:00Z" });
  const newerRaw = pair("esa_letter", {
    processed_file_url: null, footer_injected: false, uploaded_at: "2026-08-09T10:00:00Z",
  });
  const r = resolveCustomerDocuments(delivered({ documents: [stamped, newerRaw] }));
  const d = byKind(r, "esa_letter");
  check("R6b stamped row outranks a newer un-stamped row", d?.id === stamped.id, `got ${d?.id}`);
  check("R6b verification button survives", !!d?.verificationDownload);
}

// R7 — the two buttons may NEVER resolve to the same storage object. Defensive:
// if injection ever wrote back over its own source, one button disappears.
{
  const same = "https://x.supabase.co/storage/v1/object/sign/letters/PT-SAME-verified.pdf";
  const r = resolveCustomerDocuments(delivered({
    documents: [pair("esa_letter", { file_url: `${same}?token=aaa`, processed_file_url: `${same}?token=bbb` })],
  }));
  const d = byKind(r, "esa_letter");
  check("R7 same-object collision: original button suppressed",
    !d?.originalDownload && !!d?.verificationDownload, `got orig=${!!d?.originalDownload} ver=${!!d?.verificationDownload}`);
  check("R7 same-object collision: reported as a missing original",
    JSON.stringify(d?.missingArtifacts) === JSON.stringify(["original"]), `got ${JSON.stringify(d?.missingArtifacts)}`);
}

// R8 — legacy order with no document row: one honest action, never two aliases.
{
  const r = resolveCustomerDocuments(delivered({ documents: [] }));
  const d = byKind(r, "esa_letter");
  check("R8 legacy-direct: still a single fallback action",
    d?.isLegacyDirect === true && !d?.originalDownload && !d?.verificationDownload);
}

// R9 — LIVE legacy shape: the real letter was stored as doc_type="other" and
// orders.signed_letter_url points at that exact private-bucket object using a
// broken public URL. The row must become the main letter so the UI can re-sign
// it by document id; it must not also render as Additional Documentation.
{
  const legacyUrl = "https://x.supabase.co/storage/v1/object/public/provider-letters/PT-LEGACY/actual-letter.pdf";
  const legacyRow = {
    id: uid(), label: "Legacy letter", doc_type: "other", file_url: legacyUrl,
    processed_file_url: null, footer_injected: false,
    uploaded_at: "2026-06-01T10:00:00Z", customer_visible: true,
  };
  const r = resolveCustomerDocuments(delivered({
    confirmation_id: "PT-LEGACY", signed_letter_url: `${legacyUrl}?token=stale`,
    documents: [legacyRow],
  }));
  const d = byKind(r, "esa_letter");
  check("R9 exact matched legacy other-row becomes the secure main letter",
    r.deliverables.length === 1 && d?.id === legacyRow.id && !!d?.originalDownload && !d?.isLegacyDirect,
    `got ${JSON.stringify(r.deliverables)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
