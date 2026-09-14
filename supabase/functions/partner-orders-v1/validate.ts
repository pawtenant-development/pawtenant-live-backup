// partner-orders-v1/validate.ts
//
// Request validation for the partner intake API.
//
// PRINCIPLES
//   * STRICT: an unexpected field is a schema violation, not something to
//     ignore. Silently dropping a field a partner believes we stored is how a
//     consent flag or a state ends up missing from a clinical record.
//   * FIELD NAMES, NEVER VALUES: `details` reports which field failed so an
//     integrator can fix it. It never echoes the value, because the value is
//     PHI.
//   * COVERAGE IS CALCULATED, NEVER ASSERTED: state serviceability is derived
//     from the live provider licence matrix (doctor_profiles.licensed_states).
//     We never claim all-50-state availability.

import type { PartnerErrorCode, PartnerIdentity } from "../_shared/partnerApi.ts";
import {
  PARTNER_PSD_SCHEMA_VERSION,
  PSD_TARGET_ASSESSMENT_VERSION,
} from "../_shared/partnerApi.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Slice 7: duplicate JSON keys are invisible after JSON.parse (the last one
 * silently wins), which is exactly how a clinical answer could be quietly
 * replaced inside one payload. This scanner walks the RAW text and reports
 * any object containing the same key twice, anywhere in the payload.
 */
export function hasDuplicateJsonKeys(raw: string): boolean {
  type Frame = { kind: "object" | "array"; keys: Set<string>; expectKey: boolean };
  const stack: Frame[] = [];
  let i = 0;
  const n = raw.length;
  const readString = (): string | null => {
    // raw[i] === '"' on entry; returns the decoded-enough key (escapes kept raw
    // — identical raw escapes are identical keys, which is all we need).
    let out = "";
    i++;
    while (i < n) {
      const c = raw[i];
      if (c === "\\") { out += raw[i] + (raw[i + 1] ?? ""); i += 2; continue; }
      if (c === '"') { i++; return out; }
      out += c;
      i++;
    }
    return null; // unterminated — the JSON.parse caller already rejected it
  };
  while (i < n) {
    const c = raw[i];
    const top = stack[stack.length - 1];
    if (c === '"') {
      const s = readString();
      if (s === null) return false;
      if (top && top.kind === "object" && top.expectKey) {
        if (top.keys.has(s)) return true;
        top.keys.add(s);
        top.expectKey = false;
      }
      continue;
    }
    if (c === "{") stack.push({ kind: "object", keys: new Set(), expectKey: true });
    else if (c === "[") stack.push({ kind: "array", keys: new Set(), expectKey: false });
    else if (c === "}" || c === "]") stack.pop();
    else if (c === "," && top && top.kind === "object") top.expectKey = true;
    i++;
  }
  return false;
}

/** Answer keys that would claim a clinical decision. Never accepted. */
const ELIGIBILITY_CLAIM_KEYS = new Set([
  "complete", "eligible", "eligibility", "approved", "approval",
  "qualified", "qualifies", "decision", "outcome", "passed",
]);

/** psd_v1 questions whose canonical answers are arrays of strings. */
const PSD_ARRAY_QUESTIONS = new Set(["conditions", "dogTasks"]);
const PSD_MAX_SCALAR_CHARS = 4000;
const PSD_MAX_ARRAY_ITEMS = 64;
const PSD_MAX_ARRAY_ITEM_CHARS = 500;

export interface ValidatedAnimal {
  name: string;
  type: string;
  breed?: string;
  age?: string;
  weight?: string;
}

export interface ValidatedOrder {
  partnerOrderId: string;
  paymentReference: string;
  service: "esa" | "psd";
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  adultConfirmed: boolean;
  currentPhysicalState: string;
  residenceState: string | null;
  animals: ValidatedAnimal[];
  assessmentAnswers: Record<string, unknown>;
  assessmentSchemaVersion: string;
  consents: {
    telehealth: { accepted: true; at: string; evidence?: string };
    privacyDataTransfer: { accepted: true; at: string; evidence?: string };
    electronicSignature: { name: string; at: string; evidence?: string };
  };
  rawPayload: unknown;
}

export type ValidationResult =
  | { ok: true; order: ValidatedOrder; partnerOrderId: string }
  | { ok: false; code: PartnerErrorCode; details?: Record<string, string[]>; partnerOrderId?: string };

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR",
  "PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]);

/** Top-level keys the schema permits. Anything else is a violation. */
const ALLOWED_TOP_LEVEL = new Set([
  "partner_order_id", "payment", "service", "customer", "animals", "assessment", "consents",
]);

const ALLOWED_PAYMENT = new Set(["status", "reference"]);
const ALLOWED_CUSTOMER = new Set([
  "legal_first_name", "legal_last_name", "email", "phone",
  "date_of_birth", "adult_confirmed", "current_physical_state", "residence_state",
]);
const ALLOWED_ANIMAL = new Set(["name", "type", "breed", "age", "weight"]);
const ALLOWED_ASSESSMENT = new Set(["schema_version", "answers"]);
const ALLOWED_CONSENTS = new Set(["telehealth", "privacy_data_transfer", "electronic_signature"]);

/**
 * Card-shaped data must never be accepted or stored. This is a REJECTION, not a
 * strip: a partner transmitting card data has a compliance problem they need to
 * hear about, and quietly discarding it would let them keep doing it.
 */
const CARD_FIELD_HINTS = [
  "card", "card_number", "cardnumber", "pan", "cvv", "cvc", "security_code",
  "expiry", "exp_month", "exp_year", "account_number", "routing", "iban", "track2",
];

export function looksLikeCardData(value: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (typeof value === "string") {
    // 13-19 digits, optionally separated -- the shape of a PAN.
    const digits = value.replace(/[\s-]/g, "");
    if (/^\d{13,19}$/.test(digits) && luhn(digits)) return true;
    return false;
  }
  if (Array.isArray(value)) return value.some((v) => looksLikeCardData(v, depth + 1));
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CARD_FIELD_HINTS.includes(k.toLowerCase())) return true;
      if (looksLikeCardData(v, depth + 1)) return true;
    }
  }
  return false;
}

function luhn(num: string): boolean {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isIsoTimestamp(v: unknown): boolean {
  const s = str(v);
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function unexpectedKeys(obj: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

export type PsdContractResult =
  | { ok: true }
  | { ok: false; code: PartnerErrorCode; details?: Record<string, string[]> };

/**
 * THE canonical partner PSD contract check (Slice 7), extracted in Slice 8 so
 * that intake (create) and the revision route validate through ONE code path.
 *
 * Enforces: the versioned contract id, catalog-only question ids from the
 * LIVE registry (never a hardcoded list), refusal of eligibility-claim keys,
 * required-question completeness, and canonical answer shapes. Fails closed
 * on an unreadable catalog.
 */
export async function validatePsdContractAssessment(
  assessmentSchemaVersion: string | null,
  assessmentAnswers: Record<string, unknown>,
  admin: SupabaseClient,
): Promise<PsdContractResult> {
  if (assessmentSchemaVersion !== PARTNER_PSD_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "assessment_schema_unsupported",
      details: {
        "assessment.schema_version": [
          `PSD orders require schema_version '${PARTNER_PSD_SCHEMA_VERSION}'`,
        ],
      },
    };
  }

  // The requirement set comes from the LIVE canonical catalog — the same
  // registry the assignment gate reads — never from a hardcoded list that
  // could drift from it.
  const { data: catalogRows, error: catErr } = await admin
    .from("psd_assessment_questions")
    .select("question_id, required")
    .eq("assessment_version", PSD_TARGET_ASSESSMENT_VERSION);
  const catalog = (catalogRows ?? []) as Array<{ question_id: string; required: boolean }>;
  if (catErr || catalog.length === 0) {
    // An unreadable catalog must refuse clinical intake, not wave it in.
    return { ok: false, code: "internal_error" };
  }
  const knownIds = new Set(catalog.map((q) => q.question_id));
  const requiredIds = catalog.filter((q) => q.required).map((q) => q.question_id);

  const psdProblems: string[] = [];

  for (const key of Object.keys(assessmentAnswers)) {
    if (ELIGIBILITY_CLAIM_KEYS.has(key)) {
      return {
        ok: false,
        code: "schema_violation",
        details: {
          "assessment.answers": [
            `'${key}' is not accepted: clinical eligibility is determined by PawTenant clinicians, never submitted`,
          ],
        },
      };
    }
    if (!knownIds.has(key)) {
      return {
        ok: false,
        code: "schema_violation",
        details: { "assessment.answers": [`unknown question: ${key}`] },
      };
    }
  }

  for (const qid of requiredIds) {
    if (!(qid in assessmentAnswers)) psdProblems.push(`missing required question: ${qid}`);
  }

  for (const [qid, value] of Object.entries(assessmentAnswers)) {
    if (PSD_ARRAY_QUESTIONS.has(qid)) {
      if (!Array.isArray(value) || value.length === 0
          || value.length > PSD_MAX_ARRAY_ITEMS
          || value.some((v) => typeof v !== "string" || !v.trim() || v.length > PSD_MAX_ARRAY_ITEM_CHARS)) {
        psdProblems.push(`${qid}: must be a non-empty array of short strings`);
      }
    } else {
      if (typeof value !== "string" || !value.trim() || value.length > PSD_MAX_SCALAR_CHARS) {
        psdProblems.push(`${qid}: must be a non-empty string`);
      }
    }
  }

  if (psdProblems.length) {
    return {
      ok: false,
      code: "assessment_incomplete",
      details: { "assessment.answers": psdProblems },
    };
  }

  return { ok: true };
}

export async function validateOrderRequest(
  body: unknown,
  identity: PartnerIdentity,
  admin: SupabaseClient,
): Promise<ValidationResult> {
  const details: Record<string, string[]> = {};
  const add = (field: string, msg: string) => {
    (details[field] ??= []).push(msg);
  };

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "schema_violation", details: { body: ["must be a JSON object"] } };
  }
  const b = body as Record<string, unknown>;

  // Card data -- checked over the WHOLE payload before anything else is trusted.
  if (looksLikeCardData(b)) {
    return { ok: false, code: "payment_credentials_rejected" };
  }

  const unexpected = unexpectedKeys(b, ALLOWED_TOP_LEVEL);
  if (unexpected.length) {
    return { ok: false, code: "schema_violation", details: { body: unexpected.map((k) => `unexpected field: ${k}`) } };
  }

  // ── partner_order_id ──────────────────────────────────────────────────────
  const partnerOrderId = str(b.partner_order_id);
  if (!partnerOrderId) return { ok: false, code: "partner_order_id_required" };
  if (partnerOrderId.length > 128) {
    return { ok: false, code: "schema_violation", details: { partner_order_id: ["too long"] }, partnerOrderId };
  }

  // ── payment ───────────────────────────────────────────────────────────────
  const payment = (b.payment ?? {}) as Record<string, unknown>;
  if (typeof payment !== "object" || Array.isArray(payment)) {
    return { ok: false, code: "schema_violation", details: { payment: ["must be an object"] }, partnerOrderId };
  }
  const badPayment = unexpectedKeys(payment, ALLOWED_PAYMENT);
  if (badPayment.length) {
    return {
      ok: false, code: "schema_violation",
      details: { payment: badPayment.map((k) => `unexpected field: ${k}`) }, partnerOrderId,
    };
  }
  const paymentStatus = (str(payment.status) ?? "").toLowerCase();
  if (paymentStatus !== "paid") {
    // We only fulfil work the partner has already been paid for.
    return { ok: false, code: "payment_not_paid", partnerOrderId };
  }
  const paymentReference = str(payment.reference);
  if (!paymentReference) add("payment.reference", "required");

  // ── service ───────────────────────────────────────────────────────────────
  const service = (str(b.service) ?? "").toLowerCase();
  if (service !== "esa" && service !== "psd") {
    return { ok: false, code: "service_unsupported", partnerOrderId };
  }

  // ── customer ──────────────────────────────────────────────────────────────
  const customer = (b.customer ?? {}) as Record<string, unknown>;
  if (typeof customer !== "object" || Array.isArray(customer)) {
    return { ok: false, code: "schema_violation", details: { customer: ["must be an object"] }, partnerOrderId };
  }
  const badCustomer = unexpectedKeys(customer, ALLOWED_CUSTOMER);
  if (badCustomer.length) {
    return {
      ok: false, code: "schema_violation",
      details: { customer: badCustomer.map((k) => `unexpected field: ${k}`) }, partnerOrderId,
    };
  }

  const firstName = str(customer.legal_first_name);
  const lastName = str(customer.legal_last_name);
  const email = str(customer.email);
  const phone = str(customer.phone);
  if (!firstName) add("customer.legal_first_name", "required");
  if (!lastName) add("customer.legal_last_name", "required");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) add("customer.email", "required, must be a valid address");

  // Adulthood: either a date of birth or an explicit adult confirmation.
  const dob = str(customer.date_of_birth);
  const adultConfirmed = customer.adult_confirmed === true;
  if (!dob && !adultConfirmed) {
    add("customer.date_of_birth", "required unless customer.adult_confirmed is true");
  }
  if (dob && Number.isNaN(new Date(dob).getTime())) {
    add("customer.date_of_birth", "must be an ISO date");
  }

  // The state that governs provider licensure is where the customer physically
  // IS at evaluation time, not where they live.
  const currentPhysicalState = (str(customer.current_physical_state) ?? "").toUpperCase();
  if (!currentPhysicalState) add("customer.current_physical_state", "required");
  else if (!US_STATES.has(currentPhysicalState)) add("customer.current_physical_state", "must be a US state code");

  const residenceState = str(customer.residence_state)?.toUpperCase() ?? null;
  if (residenceState && !US_STATES.has(residenceState)) {
    add("customer.residence_state", "must be a US state code");
  }

  // ── animals ───────────────────────────────────────────────────────────────
  const animalsRaw = b.animals;
  const animals: ValidatedAnimal[] = [];
  if (!Array.isArray(animalsRaw) || animalsRaw.length === 0) {
    add("animals", "at least one animal is required");
  } else if (animalsRaw.length > 10) {
    add("animals", "too many animals");
  } else {
    animalsRaw.forEach((a, i) => {
      if (!a || typeof a !== "object" || Array.isArray(a)) { add(`animals[${i}]`, "must be an object"); return; }
      const rec = a as Record<string, unknown>;
      const bad = unexpectedKeys(rec, ALLOWED_ANIMAL);
      if (bad.length) { add(`animals[${i}]`, `unexpected field: ${bad.join(", ")}`); return; }
      const name = str(rec.name); const type = str(rec.type);
      if (!name) add(`animals[${i}].name`, "required");
      if (!type) add(`animals[${i}].type`, "required");
      if (name && type) {
        animals.push({
          name, type,
          breed: str(rec.breed) ?? undefined,
          age: str(rec.age) ?? undefined,
          weight: str(rec.weight) ?? undefined,
        });
      }
    });
  }

  // ── assessment ────────────────────────────────────────────────────────────
  const assessment = (b.assessment ?? {}) as Record<string, unknown>;
  if (typeof assessment !== "object" || Array.isArray(assessment)) {
    return { ok: false, code: "schema_violation", details: { assessment: ["must be an object"] }, partnerOrderId };
  }
  const badAssessment = unexpectedKeys(assessment, ALLOWED_ASSESSMENT);
  if (badAssessment.length) {
    return {
      ok: false, code: "schema_violation",
      details: { assessment: badAssessment.map((k) => `unexpected field: ${k}`) }, partnerOrderId,
    };
  }
  const assessmentSchemaVersion = str(assessment.schema_version);
  if (!assessmentSchemaVersion) add("assessment.schema_version", "required");

  const answersRaw = assessment.answers;
  let assessmentAnswers: Record<string, unknown> = {};
  if (!answersRaw || typeof answersRaw !== "object" || Array.isArray(answersRaw)) {
    add("assessment.answers", "required, must be an object of question_id -> answer");
  } else {
    assessmentAnswers = answersRaw as Record<string, unknown>;
    const keys = Object.keys(assessmentAnswers);
    if (keys.length === 0) add("assessment.answers", "at least one answer is required");
    if (keys.length > 200) add("assessment.answers", "too many answers");
    for (const k of keys) {
      if (k.length > 128) { add("assessment.answers", "question id too long"); break; }
    }
  }

  // ── consents ──────────────────────────────────────────────────────────────
  const consents = (b.consents ?? {}) as Record<string, unknown>;
  if (typeof consents !== "object" || Array.isArray(consents)) {
    return { ok: false, code: "consent_missing", partnerOrderId };
  }
  const badConsents = unexpectedKeys(consents, ALLOWED_CONSENTS);
  if (badConsents.length) {
    return {
      ok: false, code: "schema_violation",
      details: { consents: badConsents.map((k) => `unexpected field: ${k}`) }, partnerOrderId,
    };
  }

  const consentMissing: string[] = [];
  const readAccepted = (key: string) => {
    const c = consents[key];
    if (!c || typeof c !== "object" || Array.isArray(c)) { consentMissing.push(key); return null; }
    const rec = c as Record<string, unknown>;
    if (rec.accepted !== true) { consentMissing.push(`${key}.accepted`); return null; }
    if (!isIsoTimestamp(rec.at)) { consentMissing.push(`${key}.at`); return null; }
    return { accepted: true as const, at: str(rec.at)!, evidence: str(rec.evidence) ?? undefined };
  };
  const telehealth = readAccepted("telehealth");
  const privacy = readAccepted("privacy_data_transfer");

  const sigRaw = consents.electronic_signature;
  let signature: { name: string; at: string; evidence?: string } | null = null;
  if (!sigRaw || typeof sigRaw !== "object" || Array.isArray(sigRaw)) {
    consentMissing.push("electronic_signature");
  } else {
    const rec = sigRaw as Record<string, unknown>;
    const sigName = str(rec.name);
    if (!sigName) consentMissing.push("electronic_signature.name");
    else if (!isIsoTimestamp(rec.at)) consentMissing.push("electronic_signature.at");
    else signature = { name: sigName, at: str(rec.at)!, evidence: str(rec.evidence) ?? undefined };
  }

  if (consentMissing.length || !telehealth || !privacy || !signature) {
    return { ok: false, code: "consent_missing", details: { consents: consentMissing }, partnerOrderId };
  }

  // ── Slice 7: canonical PSD contract ───────────────────────────────────────
  // A PSD order is CLINICAL work: it must arrive under the versioned contract
  // that is the retail psd_v1 catalog verbatim. Nothing is inferred from the
  // generic partner vocabulary, no unknown field is tolerated, and no field
  // may claim a clinical decision. Everything here fails closed. Slice 8: the
  // same contract check is shared verbatim with the revision route — one
  // validator, so intake and revision can never diverge.
  if (service === "psd") {
    const psd = await validatePsdContractAssessment(assessmentSchemaVersion, assessmentAnswers, admin);
    if (!psd.ok) {
      return { ok: false, code: psd.code, ...(psd.details ? { details: psd.details } : {}), partnerOrderId };
    }
  }

  // Report accumulated field problems before the expensive coverage checks.
  if (Object.keys(details).length) {
    const assessmentOnly = Object.keys(details).every((k) => k.startsWith("assessment"));
    return {
      ok: false,
      code: assessmentOnly ? "assessment_incomplete" : "schema_violation",
      details,
      partnerOrderId,
    };
  }

  // ── Partner entitlement: is this service enabled for THIS partner? ─────────
  const { data: partner } = await admin
    .from("partner_organizations")
    .select("allowed_services, allowed_states, status")
    .eq("id", identity.partnerId)
    .maybeSingle();

  if (!partner) return { ok: false, code: "partner_not_active", partnerOrderId };
  const allowedServices: string[] = partner.allowed_services ?? [];
  if (!allowedServices.includes(service)) {
    return { ok: false, code: "service_unsupported", partnerOrderId };
  }

  // Explicit state allowlist, when the partner has one.
  const allowedStates: string[] = partner.allowed_states ?? [];
  if (allowedStates.length > 0 && !allowedStates.includes(currentPhysicalState)) {
    return { ok: false, code: "state_unsupported", partnerOrderId };
  }

  // ── Provider coverage -- CALCULATED from the live licence matrix ──────────
  // An order we cannot staff must be refused at intake rather than accepted and
  // stranded. This is also why the partner's allowed_states is empty by default:
  // availability is whatever the licence matrix currently supports, and never a
  // marketing claim.
  const { data: providers, error: provErr } = await admin
    .from("doctor_profiles")
    .select("user_id")
    .eq("is_active", true)
    .contains("licensed_states", [currentPhysicalState])
    .limit(1);

  if (provErr) return { ok: false, code: "internal_error", partnerOrderId };
  if (!providers || providers.length === 0) {
    return { ok: false, code: "no_provider_coverage", partnerOrderId };
  }

  return {
    ok: true,
    partnerOrderId,
    order: {
      partnerOrderId,
      paymentReference: paymentReference!,
      service: service as "esa" | "psd",
      firstName: firstName!,
      lastName: lastName!,
      email: email!,
      phone,
      dateOfBirth: dob,
      adultConfirmed: adultConfirmed || Boolean(dob),
      currentPhysicalState,
      residenceState,
      animals,
      assessmentAnswers,
      assessmentSchemaVersion: assessmentSchemaVersion!,
      consents: {
        telehealth,
        privacyDataTransfer: privacy,
        electronicSignature: signature,
      },
      rawPayload: body,
    },
  };
}
