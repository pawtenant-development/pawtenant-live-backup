// customerDocuments — the SINGLE shared resolver that turns an order + its
// order_documents rows into the customer's DELIVERABLES for "My Documents".
//
// ── CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001 ─────────────────────────────
//
// THE DEFECT THIS REPLACES
// The previous resolver rendered AT MOST TWO cards: it collapsed every
// letter-typed row (`esa_letter` / `psd_letter` / `signed_letter` / `letter`)
// into ONE "the letter" card, and it recognised exactly one other class
// (`housing_completed`). Everything else the customer owns — their own uploads,
// provider-issued `other` letters, `landlord_form` pages — was silently
// dropped, and a second GENUINE letter-class deliverable was not merely hidden:
// the single surviving card was resolved to the NEWEST stamped row and then
// titled "Signed ESA/PSD Letter". On PT-PSD977033Z3 that made the card serve
// the provider's "Extra documentation" file under the main letter's title,
// leaving the actual signed letter unreachable.
//
// Blast radius measured on LIVE before the fix: 33 orders carried more than one
// live letter-class row, 57 carried more than one live customer-visible row,
// and 14 customer uploads + 26 `other`/`landlord_form` rows had never been
// renderable at all.
//
// ── LOGICAL DOCUMENT IDENTITY: LINEAGE, NEVER doc_type ──────────────────────
// A "logical document" is a VERSION CHAIN, not a doc_type. `order_documents`
// models revisions by stamping the OLD row's `superseded_by_document_id` with
// its replacement. So:
//
//   * `superseded_by_document_id IS NULL`  → this row is the chain's terminal,
//                                            i.e. the latest active version of
//                                            one logical document → ONE card.
//   * `superseded_by_document_id IS NOT NULL` → a prior immutable version. Never
//                                            a card; reachable through
//                                            MyDocumentVersionHistory, which
//                                            reads `order_document_versions`.
//
// `superseded_at` is NOT usable for this: a LIVE census found 36 predecessor
// rows, of which only 7 carry `superseded_at` while all 36 carry
// `superseded_by_document_id`. Keying on the timestamp would resurrect 29
// superseded letters as if they were current documents.
//
// Two rows sharing a doc_type are therefore two DIFFERENT documents unless the
// lineage says one replaced the other. Real examples on LIVE: one order carries
// two `esa_letter` rows for two different PETS ("(Krystal D: Daki)" and
// "(Krystal D: Smokey)"), another carries a letter plus a notarized copy.
//
// Where operators historically re-uploaded a corrected letter WITHOUT the
// pipeline stamping the lineage, both rows are terminal and both now render.
// That is deliberate: the alternative is a label/timestamp heuristic ("same
// label within N hours = a revision"), which is exactly the kind of inferred
// second classifier this codebase forbids — and its failure mode is HIDING a
// document the customer paid for. Showing a superseded-but-unmarked file is
// recoverable; hiding a real deliverable is the bug being fixed.
//
// ── VISIBILITY IS SERVER-OWNED ──────────────────────────────────────────────
// This module is presentation. It NEVER widens access:
//   * RLS policy `customers_read_own_docs` already restricts SELECT to
//     `customer_visible = true` AND an order owned by the caller (user_id or
//     matching email), so cross-order/cross-customer rows can never arrive here.
//   * every open/download re-mints a short-lived signed URL through
//     get-document-signed-url, which re-checks owning-customer + customer_visible
//     per document id. No storage path or raw URL is ever put in the DOM.
// The filters below are a redundant client-side gate, never the only one.
//
// ── DUAL LETTER ARTIFACTS (CUSTOMER-DUAL-LETTER-DOWNLOADS-001, preserved) ────
// A letter-class row is TWO distinct stored objects, never one:
//   • the ORIGINAL     — order_documents.file_url, the exact bytes the provider
//                        submitted, in the private `provider-letters` bucket.
//   • the VERIFICATION — order_documents.processed_file_url, a SEPARATE object
//                        in the private `letters` bucket carrying the PawTenant
//                        verification QR code.
// Both are exposed independently, Original first. A variant is offered only when
// its file genuinely exists — the two buttons can never resolve to one object.

export type CustomerDocKind =
  | "esa_letter"
  | "psd_letter"
  | "additional_documentation"
  | "housing_completed"
  | "ra_document"
  | "customer_upload";

/** Which of the two independent letter artifacts a download targets. */
export type DeliverableVariant = "original" | "verification";

/** One concrete, independently retrievable download action. */
export interface DeliverableDownload {
  variant: DeliverableVariant;
  /** order_documents.id — the token get-document-signed-url authorizes against. */
  documentId: string;
  /** Suggested download filename. The edge function corrects the extension to
   *  match the real stored object (a handful of legacy originals are images). */
  filename: string;
}

/**
 * The EXACT column list every customer-portal `order_documents` query must
 * select. Exported so the portal's several fetch sites cannot drift apart —
 * omitting `superseded_by_document_id` would silently resurrect prior versions
 * as extra cards, and omitting `review_status` would drop the approval gate.
 */
// Declared as ONE `as const` string literal, deliberately not a concatenation:
// supabase-js derives the row type of `.select()` from the LITERAL type of its
// argument, and a `+`-concatenated constant widens to `string`, which collapses
// the result to `GenericStringError[]` and breaks every downstream cast.
export const CUSTOMER_DOCUMENT_COLUMNS =
  "id, label, doc_type, file_url, processed_file_url, footer_injected, uploaded_at, sent_to_customer, customer_visible, superseded_by_document_id, review_status, order_id" as const;

/** Minimal order_documents shape the resolver reads. */
export interface ResolverDoc {
  id: string;
  label: string;
  doc_type: string;
  file_url: string;
  processed_file_url: string | null;
  footer_injected: boolean;
  uploaded_at: string;
  customer_visible: boolean;
  /** Lineage marker — non-null means a LATER row replaced this one. */
  superseded_by_document_id?: string | null;
  /** Approval gate. Anything not approved/not_applicable is withheld. */
  review_status?: string | null;
}

/** Minimal order shape the resolver reads. */
export interface ResolverOrder {
  confirmation_id: string;
  letter_type?: string | null;
  doctor_status?: string | null;
  status?: string | null;
  letter_id?: string | null;
  signed_letter_url?: string | null;
  /** PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — see partnerSuppressesPortal(). */
  order_origin?: string | null;
  partner_communication_policy?: string | null;
  documents?: ResolverDoc[];
}

export interface CustomerDeliverable {
  /** order_documents.id — the token every secure open/download is minted from.
   *  Undefined only for the legacy signed_letter_url fallback (no doc row). */
  id?: string;
  kind: CustomerDocKind;
  /** Human title, e.g. "Signed ESA Letter" / "Additional Documentation". */
  title: string;
  /** The row's OWN stored label, shown as a secondary line so two cards of the
   *  same kind are distinguishable. Rendered as text by React (never as HTML),
   *  so a hostile filename is inert. Omitted when it adds nothing to the title. */
  detail?: string;
  /** Remix icon class. */
  icon: string;
  /** ISO timestamp of the relevant event (delivery / completion / upload). */
  date?: string;
  /** Verb for the date line. */
  dateVerb: "Delivered" | "Completed" | "Added" | "Uploaded";
  /** Verification ID — present ONLY on the order's MAIN ESA/PSD letter. */
  verificationId?: string;
  /** True when there is no order_documents.id and we must fall back to a stored URL. */
  isLegacyDirect?: boolean;
  /** Direct stored URL used only for the legacy fallback. */
  fallbackUrl?: string;
  /** The provider's exact, unmodified file. Letter-class rows only. */
  originalDownload?: DeliverableDownload;
  /** The separately generated copy carrying the verification QR code. */
  verificationDownload?: DeliverableDownload;
  /** Artifacts that genuinely do not exist for this deliverable. */
  missingArtifacts?: DeliverableVariant[];
}

export interface CustomerDocuments {
  /** Ordered for display: main letter, additional provider documents, then
   *  accommodation artifacts, then the customer's own uploads. */
  deliverables: CustomerDeliverable[];
  hasLetter: boolean;
  hasHousingCompleted: boolean;
}

/** Letter-class doc types — the classes that carry a QR/verification artifact. */
const LETTER_DOC_TYPES = ["esa_letter", "psd_letter", "signed_letter", "letter"];

/** Provider-issued classes gated behind letter delivery. `other` is a real
 *  provider deliverable on LIVE (PSD letters, "Preliminary letter",
 *  "Establishing Care") that had no mapping at all before this change. */
const PROVIDER_ISSUED_OTHER = ["other"];

/** review_status values a customer may see. Anything else — notably
 *  `pending_admin_approval` and `rejected` — is withheld. Belt-and-braces:
 *  the approval gate already flips `customer_visible` to false, and a LIVE
 *  census confirms 0 pending rows are customer_visible. */
const RELEASABLE_REVIEW_STATUS = ["approved", "not_applicable"];

export function isPsdOrder(order: ResolverOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

/** Authoritative "letter is delivered to the customer" — mirrors bookingProgress:
 *  patient_notified OR a minted letter_id. Stays true across a late-Housing reopen. */
function letterDelivered(order: ResolverOrder): boolean {
  return order.doctor_status === "patient_notified" || !!order.letter_id;
}

/**
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — partner-managed orders are
 * delivered to the customer BY THE PARTNER; PawTenant's portal shows nothing and
 * stamps nothing.
 *
 * NOTE the deliberate asymmetry with `_shared/partnerPolicy.ts`, which REFUSES
 * when `order_origin` is absent. That fail-closed rule is correct for edge
 * functions, which always select the column explicitly. It would be catastrophic
 * here: `order_origin` does not exist as a column on the LIVE database at all
 * (partner fulfillment is TEST-only), so failing closed on `undefined` would
 * blank every LIVE customer's documents. This therefore suppresses ONLY on an
 * explicit `order_origin === "partner"`, which is unreachable on LIVE and exact
 * on TEST.
 */
function partnerSuppressesPortal(order: ResolverOrder): boolean {
  if ((order.order_origin ?? "") !== "partner") return false;
  // A partner order whose policy is missing/unknown is suppressed, not guessed.
  return order.partner_communication_policy !== "pawtenant_managed";
}

/**
 * `bucket/path` identity of a Supabase storage URL, with the signing query string
 * stripped. Two URLs that sign the SAME object compare equal even though their
 * tokens differ, which is what makes the "never point both buttons at one file"
 * guard meaningful. Returns null for anything that is not a storage URL.
 */
function storageObjectKey(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const m = rawUrl.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/([^?]+)/,
  );
  return m ? `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}` : null;
}

/**
 * Download filename for a letter artifact, e.g.
 *   PawTenant-ESA-Letter-Original-PT-MSMAS1S3.pdf
 * The ESA/PSD label is derived from the ORDER, never from the provider's own
 * document label, so a mislabelled upload cannot rename the customer's file.
 */
export function letterDownloadFilename(
  psd: boolean,
  confirmationId: string,
  variant: DeliverableVariant,
): string {
  const product = psd ? "PSD" : "ESA";
  const part = variant === "original" ? "Original" : "Verification";
  const safeId = (confirmationId ?? "").replace(/[^A-Za-z0-9._-]/g, "") || "Order";
  return `PawTenant-${product}-Letter-${part}-${safeId}.pdf`;
}

/** Download filename for a non-main deliverable, disambiguated by document id so
 *  two "Additional Documentation" files never land on the same name. */
function auxDownloadFilename(
  confirmationId: string,
  docId: string,
  variant: DeliverableVariant,
): string {
  const safeId = (confirmationId ?? "").replace(/[^A-Za-z0-9._-]/g, "") || "Order";
  const part = variant === "original" ? "Original" : "Verification";
  return `PawTenant-Document-${part}-${safeId}-${docId.slice(0, 8)}.pdf`;
}

/** Ascending by uploaded_at, with `id` as a stable tie-break. Two rows can share
 *  a timestamp to the second (a two-pet submission on LIVE differs by 4s, but a
 *  future batch write could collide), and an unstable sort would let the "main
 *  letter" title hop between cards across renders. */
function byUploadedAtAsc(a: ResolverDoc, b: ResolverDoc): number {
  const t = (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? "");
  return t !== 0 ? t : (a.id ?? "").localeCompare(b.id ?? "");
}

/** A row the customer may see: visible, lineage-terminal, and release-approved. */
function isLiveCustomerRow(d: ResolverDoc): boolean {
  if (!d.customer_visible) return false;
  // Lineage terminal only — a prior version is history, not a card.
  if (d.superseded_by_document_id) return false;
  // Absent review_status (legacy row) is treated as releasable, matching the
  // column default `not_applicable`.
  const rs = (d.review_status ?? "not_applicable").toLowerCase();
  return RELEASABLE_REVIEW_STATUS.includes(rs);
}

/** Build the two independent download actions for a letter-class row. */
function letterArtifacts(
  doc: ResolverDoc,
  filenameFor: (v: DeliverableVariant) => string,
): Pick<CustomerDeliverable, "originalDownload" | "verificationDownload" | "missingArtifacts"> {
  const originalKey = storageObjectKey(doc.file_url);
  const verificationKey = storageObjectKey(doc.processed_file_url);
  // Defensive: if injection had ever written back over its own source, the two
  // pointers would name ONE object and the two buttons would be a lie. Census on
  // TEST and LIVE finds zero such rows; if one ever appears we surface the
  // stamped copy alone and report the original as missing rather than offering
  // the same file twice.
  const collides = !!originalKey && originalKey === verificationKey;

  const hasVerification = !!doc.footer_injected && !!doc.processed_file_url;
  const hasOriginal = !!doc.file_url && !collides;

  const missingArtifacts: DeliverableVariant[] = [];
  if (!hasOriginal) missingArtifacts.push("original");
  if (!hasVerification) missingArtifacts.push("verification");

  return {
    originalDownload: hasOriginal
      ? { variant: "original", documentId: doc.id, filename: filenameFor("original") }
      : undefined,
    verificationDownload: hasVerification
      ? { variant: "verification", documentId: doc.id, filename: filenameFor("verification") }
      : undefined,
    missingArtifacts,
  };
}

/** The row's own label, shown beneath the title when it adds information. */
function detailFor(doc: ResolverDoc, title: string): string | undefined {
  const raw = (doc.label ?? "").trim();
  if (!raw) return undefined;
  if (raw.toLowerCase() === title.toLowerCase()) return undefined;
  return raw;
}

/**
 * Resolve the customer's deliverables — ONE card per logical document. Pure: no
 * I/O, no side effects. Secure URL minting still happens later via
 * get-document-signed-url keyed on the returned id.
 */
export function resolveCustomerDocuments(order: ResolverOrder): CustomerDocuments {
  const deliverables: CustomerDeliverable[] = [];

  // Partner-managed delivery: PawTenant's portal is not the delivery channel.
  if (partnerSuppressesPortal(order)) {
    return { deliverables, hasLetter: false, hasHousingCompleted: false };
  }

  const docs = (order.documents ?? []).filter(isLiveCustomerRow).slice().sort(byUploadedAtAsc);

  const psd = isPsdOrder(order);
  const mainLetterTitle = psd ? "Signed PSD Letter" : "Signed ESA Letter";
  const mainLetterKind: CustomerDocKind = psd ? "psd_letter" : "esa_letter";
  const delivered = letterDelivered(order);

  // ── 1) Provider-issued letter-class rows ──────────────────────────────────
  // The EARLIEST live letter-class row is the order's main letter (it is the row
  // the delivery event and the order's verification id belong to). Every LATER
  // live letter-class row is a genuinely separate deliverable — an additional
  // document, a second pet's letter, a notarized copy — and gets its own card
  // rather than overwriting the main one, which is the defect being fixed.
  //
  // There is deliberately NO "Notarized Document" title: the schema carries no
  // notarization marker (no column, no table, no doc_type), so the only signal
  // is free text inside `label`. Sniffing the label to promote a title is the
  // same infer-from-filename anti-pattern this module exists to remove; the
  // stored label is instead shown verbatim as the card's detail line, which
  // tells the customer exactly what the file is without guessing.
  const letterDocs = docs.filter((d) => LETTER_DOC_TYPES.includes(d.doc_type));

  // CUSTOMER-PORTAL-LETTER-VIEW-RECOVERY-001 — five delivered legacy orders
  // stored their actual ESA/PSD letter as doc_type="other" while
  // orders.signed_letter_url points at that row's exact storage object. The old
  // fallback opened the stored URL directly; those rows use a public URL shape
  // against a private bucket, so customers received "Bucket not found" even
  // though the file exists. Promote ONLY an exact object-identity match to the
  // main letter. This avoids filename/label guessing and gives the row a
  // document id so every View/Download goes through fresh authorized signing.
  const signedLetterKey = storageObjectKey(order.signed_letter_url);
  const legacyMainDoc = letterDocs.length === 0 && signedLetterKey
    ? docs.find((d) =>
        PROVIDER_ISSUED_OTHER.includes(d.doc_type) &&
        (storageObjectKey(d.file_url) === signedLetterKey ||
          storageObjectKey(d.processed_file_url) === signedLetterKey))
    : undefined;
  const resolvedLetterDocs = legacyMainDoc ? [legacyMainDoc] : letterDocs;

  if (delivered) {
    resolvedLetterDocs.forEach((doc, index) => {
      const isMain = index === 0;
      const title = isMain ? mainLetterTitle : "Additional Documentation";
      deliverables.push({
        id: doc.id,
        kind: isMain ? mainLetterKind : "additional_documentation",
        title,
        detail: detailFor(doc, title),
        icon: isMain ? "ri-shield-check-line" : "ri-file-add-line",
        date: doc.uploaded_at,
        dateVerb: isMain ? "Delivered" : "Added",
        // The order's verification id identifies the MAIN letter. Repeating it on
        // a second card would tell the customer two different files share one
        // verification reference, which is false.
        verificationId: isMain ? (order.letter_id ?? undefined) : undefined,
        ...letterArtifacts(doc, (v) =>
          isMain
            ? letterDownloadFilename(psd, order.confirmation_id, v)
            : auxDownloadFilename(order.confirmation_id, doc.id, v)),
      });
    });

    // Legacy delivered order with NO matching order_documents row. There is one
    // stored pointer and nothing that distinguishes an
    // original from a stamped copy, so neither labelled button can be offered
    // honestly — the card falls back to its single direct action.
    if (resolvedLetterDocs.length === 0 && order.signed_letter_url) {
      deliverables.push({
        kind: mainLetterKind,
        title: mainLetterTitle,
        icon: "ri-shield-check-line",
        dateVerb: "Delivered",
        verificationId: order.letter_id ?? undefined,
        isLegacyDirect: true,
        fallbackUrl: order.signed_letter_url,
        missingArtifacts: ["original", "verification"],
      });
    }

    // ── 2) Provider-issued `other` rows ─────────────────────────────────────
    // 24 live rows on LIVE ("PSD Copy", "Preliminary letter", "Establishing
    // Care") that were previously unrenderable. They carry no reliable
    // verification artifact, so they use the plain Open/Download pair.
    docs
      .filter((d) =>
        PROVIDER_ISSUED_OTHER.includes(d.doc_type) &&
        d.id !== legacyMainDoc?.id)
      .forEach((doc) => {
        deliverables.push({
          id: doc.id,
          kind: "additional_documentation",
          title: "Additional Documentation",
          detail: detailFor(doc, "Additional Documentation"),
          icon: "ri-file-add-line",
          date: doc.uploaded_at,
          dateVerb: "Added",
        });
      });
  }

  // ── 3) Accommodation artifacts — independent of letter delivery ───────────
  // A housing follow-up can complete after the base letter is already delivered.
  docs
    .filter((d) => d.doc_type === "housing_completed")
    .forEach((doc) => {
      deliverables.push({
        id: doc.id,
        kind: "housing_completed",
        title: "Completed Housing Accommodation Form",
        // An order can carry more than one completed housing form (one per
        // landlord/property form the customer supplied). Without the row's own
        // label the cards are visually identical and the customer cannot tell
        // which file is which — caught in browser QA on PT-QA-LATEHOUSING.
        detail: detailFor(doc, "Completed Housing Accommodation Form"),
        icon: "ri-home-smile-line",
        date: doc.uploaded_at,
        dateVerb: "Completed",
        // deliberately NO verificationId — housing forms carry no PawTenant ID.
      });
    });

  docs
    .filter((d) => d.doc_type === "landlord_form")
    .forEach((doc) => {
      deliverables.push({
        id: doc.id,
        kind: "ra_document",
        title: "Reasonable Accommodation Document",
        detail: detailFor(doc, "Reasonable Accommodation Document"),
        icon: "ri-home-smile-line",
        date: doc.uploaded_at,
        dateVerb: "Completed",
      });
    });

  // ── 4) The customer's OWN uploads ─────────────────────────────────────────
  // Previously excluded entirely (14 live rows on LIVE). These are the
  // customer's own files — always theirs to retrieve, never gated on delivery,
  // and clearly marked so they are not mistaken for a provider deliverable.
  docs
    .filter((d) => d.doc_type === "customer_upload")
    .forEach((doc) => {
      deliverables.push({
        id: doc.id,
        kind: "customer_upload",
        title: "Customer Upload",
        detail: detailFor(doc, "Customer Upload"),
        icon: "ri-upload-cloud-2-line",
        date: doc.uploaded_at,
        dateVerb: "Uploaded",
      });
    });

  return {
    deliverables,
    hasLetter: deliverables.some((d) => d.kind === "esa_letter" || d.kind === "psd_letter"),
    hasHousingCompleted: deliverables.some((d) => d.kind === "housing_completed"),
  };
}

/** Short human date, e.g. "Jul 12, 2026". */
export function formatDeliverableDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
