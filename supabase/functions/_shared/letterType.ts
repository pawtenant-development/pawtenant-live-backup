// _shared/letterType.ts
//
// Product-type helper for ESA vs PSD letter wording, document labels, and
// verification-ID prefixes. Single source of truth for every edge function
// that touches letter-delivery wording or generates a verification ID.
//
// Why this exists (LETTER-DELIVERY-PRODUCT-TYPE-CONSISTENCY, 2026-05-20):
//   PSD orders were delivered with ESA wording in the customer email
//   ("Your ESA Letter is here", "Signed ESA Letter") and the verification
//   ID was prefixed `ESA-` regardless of letter_type. Customers paying
//   for a Psychiatric Service Dog letter received what looked like an
//   ESA letter — wrong wording, wrong ID format, and (more critically)
//   verification lookups for PSD letters returned ESA-prefixed IDs.
//
//   This module centralizes:
//     - isPsdLetter(order)         — single canonical check
//     - LETTER_LABELS[type]        — productLabel, documentLabel, …
//     - applyPsdPrefix(rawId, type) — swap ESA-/PSD- prefix to match type
//     - postProcessPsdHtml(html)   — fallback to fix admin-edited template
//                                    bodies that still hardcode "ESA Letter"
//
// All call-sites should derive their wording from here so future renames
// land in one place.

export type LetterType = "esa" | "psd";

export interface LetterTypeMeta {
  /** Canonical machine value stored in DB columns / used in SQL filters. */
  type: LetterType;
  /** Short product label — "ESA Letter" / "PSD Letter". */
  productLabel: string;
  /** Long product label — "Emotional Support Animal" / "Psychiatric Service Dog". */
  productLabelLong: string;
  /** Customer-facing document label — "Signed ESA Letter" / "Signed PSD Letter". */
  documentLabel: string;
  /** Document label long form — "Signed Psychiatric Service Dog Letter". */
  documentLabelLong: string;
  /** Email subject snippet — "Your ESA Letter is here" / "Your PSD Letter is here". */
  emailHeading: string;
  /** Heading for the documents-ready email card title row. */
  badgeTitle: string;
  /** Lower-case product noun used in body sentences: "ESA letter" / "PSD letter". */
  productNoun: string;
  /** Verification-ID prefix — "ESA" / "PSD". */
  verificationPrefix: "ESA" | "PSD";
  /** Legal-protection footer line for the email. */
  legalProtection: string;
}

export const LETTER_LABELS: Record<LetterType, LetterTypeMeta> = {
  esa: {
    type: "esa",
    productLabel: "ESA Letter",
    productLabelLong: "Emotional Support Animal Letter",
    documentLabel: "Signed ESA Letter",
    documentLabelLong: "Signed Emotional Support Animal Letter",
    emailHeading: "Your ESA Letter is here!",
    badgeTitle: "Documents Ready",
    productNoun: "ESA letter",
    verificationPrefix: "ESA",
    legalProtection:
      "Your ESA letter is legally recognized under the Fair Housing Act.",
  },
  psd: {
    type: "psd",
    productLabel: "PSD Letter",
    productLabelLong: "Psychiatric Service Dog Letter",
    documentLabel: "Signed PSD Letter",
    documentLabelLong: "Signed Psychiatric Service Dog Letter",
    emailHeading: "Your PSD Letter is here!",
    badgeTitle: "Documents Ready",
    productNoun: "PSD letter",
    verificationPrefix: "PSD",
    legalProtection:
      "Your PSD letter documents your provider's recommendation for a Psychiatric Service Dog under the ADA.",
  },
};

/**
 * Single canonical "is this order a PSD letter?" check.
 *
 * Priority:
 *   1. orders.letter_type column (canonical)
 *   2. confirmation_id contains "-PSD" (legacy fallback)
 */
export function isPsdLetter(order: {
  letter_type?: string | null;
  confirmation_id?: string | null;
} | null | undefined): boolean {
  if (!order) return false;
  const lt = (order.letter_type ?? "").toString().toLowerCase().trim();
  if (lt === "psd") return true;
  const conf = (order.confirmation_id ?? "").toString().toUpperCase();
  if (conf.includes("-PSD")) return true;
  return false;
}

export function getLetterType(order: {
  letter_type?: string | null;
  confirmation_id?: string | null;
} | null | undefined): LetterType {
  return isPsdLetter(order) ? "psd" : "esa";
}

export function getLetterMeta(order: {
  letter_type?: string | null;
  confirmation_id?: string | null;
} | null | undefined): LetterTypeMeta {
  return LETTER_LABELS[getLetterType(order)];
}

/**
 * Swap the ESA-/PSD- prefix of a generated verification ID to match the
 * letter type. The underlying RPC (generate_letter_verification_id) only
 * accepts p_state and emits "ESA-XX-XXXXXX" — this helper rewrites the
 * prefix so PSD letters get "PSD-XX-XXXXXX" without requiring a DB-side
 * RPC change. Idempotent: an already-PSD-prefixed ID is returned as-is.
 *
 * The (state, code) tail remains identical to whatever the RPC produced;
 * verify-letter looks up by the full letter_id string so PSD-NY-ABCDEF
 * and ESA-NY-ABCDEF are distinct keys and never collide.
 */
export function applyVerificationPrefix(rawId: string, type: LetterType): string {
  if (!rawId) return rawId;
  const meta = LETTER_LABELS[type];
  const target = meta.verificationPrefix;
  // Replace whatever prefix the RPC emitted with the canonical one.
  // Match ESA-/PSD- (case-insensitive) at the start; leave the rest alone.
  return rawId.replace(/^(ESA|PSD)-/i, `${target}-`);
}

/**
 * Post-process rendered email HTML to swap "ESA Letter" wording with the
 * PSD equivalent. Used as a safety net for admin-edited template bodies
 * that still hardcode ESA wording. ESA orders are returned unchanged.
 *
 * Order of substitutions matters — longer phrases first so we don't
 * accidentally rewrite a phrase that's already been swapped.
 */
export function postProcessLetterHtml(html: string, type: LetterType): string {
  if (type !== "psd" || !html) return html;
  const psd = LETTER_LABELS.psd;
  return html
    .replace(/Your ESA Letter is here/g, psd.emailHeading.replace(/!$/, ""))
    .replace(/Signed ESA Letter/g, psd.documentLabel)
    .replace(/Your ESA letter has been signed/g, "Your PSD letter has been signed")
    .replace(/your signed ESA letter/g, "your signed PSD letter")
    .replace(/Your ESA letter is legally recognized under the Fair Housing Act\.?/g, psd.legalProtection)
    .replace(/ESA letter/g, psd.productNoun)
    .replace(/ESA Letter/g, psd.productLabel);
}
