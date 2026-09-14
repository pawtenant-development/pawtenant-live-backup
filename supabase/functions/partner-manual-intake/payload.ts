// partner-manual-intake/payload.ts
//
// PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// Pure helpers shared by the handler and the build guard: page merging (text
// layer vs OCR) and the reviewed-draft → canonical partner API payload
// builder. No I/O. The payload built here is validated by the SAME
// validateOrderRequest the partner API uses, and accepted by the SAME
// public.partner_accept_order().

import { PARTNER_ASSESSMENT_SCHEMA_VERSION, PARTNER_PSD_SCHEMA_VERSION } from "../_shared/partnerApi.ts";
import type { PageText } from "./extract.ts";

/** A page whose text layer is shorter than this is treated as image-only. */
export const MIN_TEXT_CHARS_PER_PAGE = 40;

export interface ReviewAnimal { name?: string; type?: string; breed?: string; age?: string; weight?: string }

/** The reviewed, admin-confirmed intake. Stored verbatim as reviewed_fields. */
export interface ReviewPayload {
  external_order_id?: string;
  payment_reference?: string;
  paid_confirmed?: boolean;
  order_date?: string;
  service?: "esa" | "psd" | null;
  service_conflict_resolution?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  adult_confirmed?: boolean;
  current_physical_state?: string;
  residence_state?: string;
  address?: string;
  animals?: ReviewAnimal[];
  answers?: Record<string, unknown>;
  consultation?: string;
  notes?: string;
  consents?: {
    telehealth?: boolean;
    privacy_data_transfer?: boolean;
    signature_name?: string;
  };
}

export const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Merge the text layer with OCR: per page, prefer a usable text layer. */
export function mergePages(text: PageText[], ocr: PageText[], pageCount: number): { pages: PageText[]; method: "text" | "ocr" | "mixed" | null } {
  const byPage = new Map<number, PageText>();
  let usedText = 0, usedOcr = 0;
  for (let p = 1; p <= Math.max(pageCount, 1); p++) {
    const t = text.find((x) => x.page === p);
    const o = ocr.find((x) => x.page === p);
    if (t && t.text.trim().length >= MIN_TEXT_CHARS_PER_PAGE) { byPage.set(p, t); usedText++; }
    else if (o && o.text.trim().length > 0) { byPage.set(p, o); usedOcr++; }
    else if (t) { byPage.set(p, t); }
  }
  const method = usedText && usedOcr ? "mixed" : usedText ? "text" : usedOcr ? "ocr" : null;
  return { pages: Array.from(byPage.values()), method };
}

export function buildPayload(r: ReviewPayload, draftId: string, attestedAt: string): Record<string, unknown> {
  const customer: Record<string, unknown> = {
    legal_first_name: s(r.first_name), legal_last_name: s(r.last_name), email: s(r.email)?.toLowerCase(),
    current_physical_state: s(r.current_physical_state)?.toUpperCase(),
  };
  if (s(r.phone)) customer.phone = s(r.phone);
  if (s(r.date_of_birth)) customer.date_of_birth = s(r.date_of_birth);
  if (r.adult_confirmed === true) customer.adult_confirmed = true;
  if (s(r.residence_state)) customer.residence_state = s(r.residence_state)!.toUpperCase();

  const animals = (Array.isArray(r.animals) ? r.animals : []).map((a) => {
    const out: Record<string, unknown> = { name: s(a?.name), type: s(a?.type) };
    if (s(a?.breed)) out.breed = s(a?.breed);
    if (s(a?.age)) out.age = s(a?.age);
    if (s(a?.weight)) out.weight = s(a?.weight);
    return out;
  });

  const service = r.service === "psd" ? "psd" : r.service === "esa" ? "esa" : undefined;
  const answers: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.answers ?? {})) {
    if (Array.isArray(v)) { const arr = v.filter((x) => typeof x === "string" && x.trim()); if (arr.length) answers[k] = arr; }
    else if (typeof v === "string" && v.trim()) answers[k] = v.trim();
  }
  if (service === "esa") {
    if (s(r.consultation)) answers.partner_consultation_notes = s(r.consultation);
    if (s(r.notes)) answers.partner_order_notes = s(r.notes);
  }

  const evidence = `partner_pdf:admin_attested:${draftId}`;
  const consents: Record<string, unknown> = {};
  if (r.consents?.telehealth === true) consents.telehealth = { accepted: true, at: attestedAt, evidence };
  if (r.consents?.privacy_data_transfer === true) consents.privacy_data_transfer = { accepted: true, at: attestedAt, evidence };
  if (s(r.consents?.signature_name)) consents.electronic_signature = { name: s(r.consents?.signature_name), at: attestedAt, evidence };

  const payload: Record<string, unknown> = {
    partner_order_id: s(r.external_order_id),
    payment: { status: r.paid_confirmed === true ? "paid" : "unconfirmed", reference: s(r.payment_reference) },
    service,
    customer,
    animals,
    assessment: {
      schema_version: service === "psd" ? PARTNER_PSD_SCHEMA_VERSION : PARTNER_ASSESSMENT_SCHEMA_VERSION,
      answers,
    },
    consents,
  };
  // The strict validator treats `undefined` keys as absent after JSON round-trip.
  return JSON.parse(JSON.stringify(payload));
}

