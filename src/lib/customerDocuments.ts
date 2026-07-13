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
//   1. the FINALIZED (footer-injected) ESA/PSD letter — with its Verification ID,
//   2. the provider-COMPLETED Housing Accommodation form — with NO Verification ID.
// It never shows the customer's source upload (that lives in the Housing workflow
// section) and never shows the provider's raw/un-stamped letter original.

export type CustomerDocKind = "esa_letter" | "psd_letter" | "housing_completed";

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
 * Resolve the customer's deliverables. Pure — no I/O, no side effects. Secure URL
 * minting still happens later via get-document-signed-url keyed on the returned id.
 */
export function resolveCustomerDocuments(order: ResolverOrder): CustomerDocuments {
  const docs = (order.documents ?? []).filter((d) => d.customer_visible);
  const deliverables: CustomerDeliverable[] = [];

  const psd = isPsdOrder(order);
  const letterTitle = psd ? "Signed PSD Letter" : "Signed ESA Letter";
  const letterKind: CustomerDocKind = psd ? "psd_letter" : "esa_letter";

  // 1) FINALIZED ESA/PSD letter — the footer-injected artifact only. Never the raw
  //    provider original (footer_injected=false). Shown once the letter is delivered.
  if (letterDelivered(order)) {
    const finalLetter = docs.find(
      (d) => LETTER_DOC_TYPES.includes(d.doc_type) && d.footer_injected && !!d.processed_file_url,
    );
    if (finalLetter) {
      deliverables.push({
        id: finalLetter.id,
        kind: letterKind,
        title: letterTitle,
        icon: "ri-shield-check-line",
        date: finalLetter.uploaded_at,
        dateVerb: "Delivered",
        verificationId: order.letter_id ?? undefined,
      });
    } else if (order.signed_letter_url) {
      // Legacy delivered order with no finalized doc row — direct stored URL fallback.
      deliverables.push({
        kind: letterKind,
        title: letterTitle,
        icon: "ri-shield-check-line",
        dateVerb: "Delivered",
        verificationId: order.letter_id ?? undefined,
        isLegacyDirect: true,
        fallbackUrl: order.signed_letter_url,
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
