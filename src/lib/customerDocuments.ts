// customerDocuments — the SINGLE shared resolver that turns an order + its
// order_documents rows into the customer's DELIVERABLES for "My Documents"
// (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001).
//
// Why this exists: the portal previously relied on a fragile exclusion filter
// ("everything customer_visible that isn't a letter") which conflated the
// customer's own SOURCE upload (doc_type=customer_upload — a Housing workflow
// artifact) with the provider's COMPLETED Housing form (doc_type=housing_completed
// — a real deliverable), and never modeled housing_completed at all (no label/icon),
// so it rendered as an unlabeled "Document". This resolver instead uses an explicit
// ALLOW-LIST of true customer deliverables and returns a typed, labeled structure.
//
// Authoritative document classes (RA taxonomy, ORDER-PAYMENT-GATING-RA-DOCUMENT-
// TAXONOMY-INTAKE-PORTAL-001 §9): `customer_upload`, `housing_completed`,
// `esa_letter`, `psd_letter`.
//
// "My Documents" shows ONLY:
//   1. the delivered ESA/PSD letter — with its Verification ID,
//   2. the provider-COMPLETED Housing Accommodation form — with NO Verification ID.
// It never shows the customer's source upload (that lives in the Housing workflow
// section).
//
// ── CUSTOMER-DUAL-LETTER-DOWNLOADS-001 ──────────────────────────────────────
// The signed letter is TWO distinct stored objects, never one:
//   • the ORIGINAL      — order_documents.file_url, the exact bytes the provider
//                         submitted, living in the private `provider-letters`
//                         bucket. NOTHING in the pipeline ever rewrites it.
//   • the VERIFICATION  — order_documents.processed_file_url, a SEPARATE object
//                         written to the private `letters` bucket by
//                         injectPdfVerification(), carrying the PawTenant
//                         Verification ID + verify URL.
// This resolver now exposes BOTH as independently retrievable downloads, in the
// owner-mandated order (Original first, Verification second). A variant is only
// offered when its file genuinely exists — the two buttons can never resolve to
// the same object, and a missing artifact is reported rather than substituted.

export type CustomerDocKind = "esa_letter" | "psd_letter" | "housing_completed";

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
}

/** Minimal order shape the resolver reads. */
export interface ResolverOrder {
  confirmation_id: string;
  letter_type?: string | null;
  doctor_status?: string | null;
  status?: string | null;
  letter_id?: string | null;
  signed_letter_url?: string | null;
  documents?: ResolverDoc[];
}

export interface CustomerDeliverable {
  /** order_documents.id — the token every secure open/download is minted from.
   *  Undefined only for the legacy signed_letter_url fallback (no doc row). */
  id?: string;
  kind: CustomerDocKind;
  /** Human title, e.g. "Signed ESA Letter" / "Completed Housing Accommodation Form". */
  title: string;
  /** Remix icon class. */
  icon: string;
  /** ISO timestamp of the relevant event (delivery / completion). */
  date?: string;
  /** Verb for the date line: "Delivered" for letters, "Completed" for housing. */
  dateVerb: "Delivered" | "Completed";
  /** Verification ID — present ONLY for ESA/PSD letters (never on housing). */
  verificationId?: string;
  /** True when there is no order_documents.id and we must fall back to a stored URL. */
  isLegacyDirect?: boolean;
  /** Direct stored URL used only for the legacy fallback. */
  fallbackUrl?: string;
  /** CUSTOMER-DUAL-LETTER-DOWNLOADS-001 — the provider's exact, unmodified file.
   *  Letters only; absent when the row carries no original. */
  originalDownload?: DeliverableDownload;
  /** CUSTOMER-DUAL-LETTER-DOWNLOADS-001 — the separately generated copy carrying
   *  the Verification ID + QR. Letters only; absent when injection never ran. */
  verificationDownload?: DeliverableDownload;
  /** Artifacts that genuinely do not exist for this deliverable. Drives the
   *  "show only the valid action" rule and the operational shortfall report. */
  missingArtifacts?: DeliverableVariant[];
}

export interface CustomerDocuments {
  /** Ordered for display: finalized letter first, then completed Housing form. */
  deliverables: CustomerDeliverable[];
  hasLetter: boolean;
  hasHousingCompleted: boolean;
}

const LETTER_DOC_TYPES = ["esa_letter", "psd_letter", "signed_letter", "letter"];

export function isPsdOrder(order: ResolverOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

/** Authoritative "letter is delivered to the customer" — mirrors bookingProgress:
 *  patient_notified OR a minted letter_id. Stays true across a late-Housing reopen. */
function letterDelivered(order: ResolverOrder): boolean {
  return order.doctor_status === "patient_notified" || !!order.letter_id;
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
 *   PawTenant-ESA-Letter-Verification-PT-MSMAS1S3.pdf
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

/** Ascending by uploaded_at. The resolver sorts explicitly rather than trusting
 *  the caller's query order — one of the portal's three document fetches issues
 *  no ORDER BY at all, so "newest wins" was position-dependent and could pick the
 *  wrong revision. */
function byUploadedAtAsc(a: ResolverDoc, b: ResolverDoc): number {
  return (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? "");
}

/**
 * Resolve the customer's deliverables. Pure — no I/O, no side effects. Secure URL
 * minting still happens later via get-document-signed-url keyed on the returned id.
 */
export function resolveCustomerDocuments(order: ResolverOrder): CustomerDocuments {
  const docs = (order.documents ?? []).filter((d) => d.customer_visible);
  const deliverables: CustomerDeliverable[] = [];

  const psd = isPsdOrder(order);
  const letterTitle = psd ? "Signed PSD Letter" : "Signed ESA Letter";
  const letterKind: CustomerDocKind = psd ? "psd_letter" : "esa_letter";

  // 1) The delivered ESA/PSD letter. ONE card, TWO independent artifacts
  //    (CUSTOMER-DUAL-LETTER-DOWNLOADS-001). Shown once the letter is delivered.
  if (letterDelivered(order)) {
    // NEWEST letter row wins, and a FINALIZED (stamped) row always outranks an
    // un-stamped one. `docs` arrives in ascending uploaded_at order, so the
    // original `.find()` returned the OLDEST — after a revision the customer was
    // resolved to the letter that had just been superseded. Under the approval
    // gate a superseded letter deliberately stays visible (a delivered document
    // is never taken away), so picking the newest is what makes "expose only the
    // approved version" true (PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001
    // §10). Both artifacts are read off that ONE row, so the pair is always the
    // matched original+verification of a single submission — a revision can never
    // pair v2's stamped copy with v1's original.
    const letterDocs = docs
      .filter((d) => LETTER_DOC_TYPES.includes(d.doc_type))
      .slice()
      .sort(byUploadedAtAsc);
    const stamped = letterDocs.filter((d) => d.footer_injected && !!d.processed_file_url);
    // Ranking a stamped row above a newer un-stamped one preserves the previous
    // contract exactly: an order that resolves to a verification PDF today can
    // never be demoted to an original-only card by this change.
    const finalLetter = stamped.length > 0
      ? stamped[stamped.length - 1]
      : letterDocs.length > 0
        ? letterDocs[letterDocs.length - 1]
        : undefined;
    if (finalLetter) {
      const originalKey = storageObjectKey(finalLetter.file_url);
      const verificationKey = storageObjectKey(finalLetter.processed_file_url);
      // Defensive: if injection had ever written back over its own source, the two
      // pointers would name ONE object and the two buttons would be a lie. Census
      // on TEST and LIVE finds zero such rows; if one ever appears we surface the
      // stamped copy alone and report the original as missing rather than
      // offering the same file twice.
      const collides = !!originalKey && originalKey === verificationKey;

      const hasVerification = !!finalLetter.footer_injected && !!finalLetter.processed_file_url;
      const hasOriginal = !!finalLetter.file_url && !collides;

      const missingArtifacts: DeliverableVariant[] = [];
      if (!hasOriginal) missingArtifacts.push("original");
      if (!hasVerification) missingArtifacts.push("verification");

      deliverables.push({
        id: finalLetter.id,
        kind: letterKind,
        title: letterTitle,
        icon: "ri-shield-check-line",
        date: finalLetter.uploaded_at,
        dateVerb: "Delivered",
        verificationId: order.letter_id ?? undefined,
        originalDownload: hasOriginal
          ? {
            variant: "original",
            documentId: finalLetter.id,
            filename: letterDownloadFilename(psd, order.confirmation_id, "original"),
          }
          : undefined,
        verificationDownload: hasVerification
          ? {
            variant: "verification",
            documentId: finalLetter.id,
            filename: letterDownloadFilename(psd, order.confirmation_id, "verification"),
          }
          : undefined,
        missingArtifacts,
      });
    } else if (order.signed_letter_url) {
      // Legacy delivered order with NO order_documents row at all (5 such orders on
      // LIVE). There is exactly one stored pointer and nothing that distinguishes
      // an original from a stamped copy, so neither labelled button can be offered
      // honestly — the card falls back to its single direct action. Splitting this
      // into two buttons would mean pointing both at the same URL, which is the one
      // thing this task forbids.
      deliverables.push({
        kind: letterKind,
        title: letterTitle,
        icon: "ri-shield-check-line",
        dateVerb: "Delivered",
        verificationId: order.letter_id ?? undefined,
        isLegacyDirect: true,
        fallbackUrl: order.signed_letter_url,
        missingArtifacts: ["original", "verification"],
      });
    }
  }

  // 2) Provider-COMPLETED Housing Accommodation form — a real deliverable with NO
  //    verification ID/footer. Independent of letter delivery (a housing follow-up
  //    can complete after the base letter is already delivered).
  const housingCompleted = docs.find((d) => d.doc_type === "housing_completed");
  if (housingCompleted) {
    deliverables.push({
      id: housingCompleted.id,
      kind: "housing_completed",
      title: "Completed Housing Accommodation Form",
      icon: "ri-home-smile-line",
      date: housingCompleted.uploaded_at,
      dateVerb: "Completed",
      // deliberately NO verificationId — housing forms carry no PawTenant ESA/PSD ID.
    });
  }

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
