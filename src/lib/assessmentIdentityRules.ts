// Canonical customer-identity and animal rules for every PawTenant intake.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 extracted these
// from `Step2PersonalInfo.tsx` so the partner portal form and the admin
// "New Partner Order" form reuse the SAME rules instead of growing a second,
// slightly-different copy. The customer assessment imports them back, so there
// is exactly one definition of "is this email valid" and "is this customer 18".
//
// The database repeats these rules in `partner_manual_order_validate()`. That
// is deliberate defence in depth, not a competing rule set: the browser copy
// gives immediate feedback, the database copy is the one that actually decides.
// If you change a rule here, change it there too — the guard for this task
// asserts both sides still agree.

/** RFC-5322-lite. Catches the common format errors without rejecting valid
 *  but unusual addresses. Mirrored by the DB regex. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Minimum age to submit an assessment. */
export const MIN_ASSESSMENT_AGE = 18;

/** Maximum animals on one order — matches MAX_PETS in the assessment step 1. */
export const MAX_ORDER_PETS = 3;
export const MIN_ORDER_PETS = 1;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}

/**
 * True when the date of birth puts the person at or over MIN_ASSESSMENT_AGE.
 *
 * Calendar-accurate: a birthday that has not happened yet this year does not
 * count. An empty or unparseable value is false — we never assume an age.
 */
export function isOfAssessmentAge(dob: string): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return false;
  const today = new Date();
  const years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const actual =
    monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())
      ? years - 1
      : years;
  return actual >= MIN_ASSESSMENT_AGE;
}

/** The latest date of birth that satisfies the age rule, as "YYYY-MM-DD".
 *  Used as the `max` attribute on date inputs. */
export function maxAssessmentDob(now: Date = new Date()): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - MIN_ASSESSMENT_AGE);
  return d.toISOString().split("T")[0];
}

/** The 50 states plus DC, as the rest of the system spells them. */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
] as const;

export function isServiceableStateCode(code: string): boolean {
  return (US_STATE_CODES as readonly string[]).includes((code ?? "").trim().toUpperCase());
}

// ── Partner manual-order shapes ─────────────────────────────────────────────

export interface PartnerOrderCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  state: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  partnerCustomerId?: string;
}

export interface PartnerOrderPet {
  name: string;
  type: string;
  age: string;
  breed: string;
  weight?: string;
}

export const PARTNER_PET_TYPES = ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Other"];

/** Longest questionnaire transcript we accept. Mirrored by the DB. */
export const MAX_QUESTIONNAIRE_CHARS = 20000;

export function emptyPartnerPet(service: "esa" | "psd" | ""): PartnerOrderPet {
  // A PSD animal is a task-trained dog, so the field starts on the only value
  // the workflow accepts rather than offering a choice that will be refused.
  return { name: "", type: service === "psd" ? "Dog" : "", age: "", breed: "", weight: "" };
}

export function emptyPartnerCustomer(): PartnerOrderCustomer {
  return {
    firstName: "", lastName: "", email: "", phone: "", dob: "", state: "",
    addressLine1: "", addressLine2: "", city: "", postalCode: "", partnerCustomerId: "",
  };
}

/** Field-level errors, keyed the way the form inputs are keyed.
 *  An empty object means the submission is valid. */
export type PartnerOrderErrors = Record<string, string>;

export function validatePartnerOrder(input: {
  service: "esa" | "psd" | "";
  customer: PartnerOrderCustomer;
  pets: PartnerOrderPet[];
  questionnaire: string;
  authorizationConfirmed: boolean;
}): PartnerOrderErrors {
  const e: PartnerOrderErrors = {};
  const c = input.customer;

  if (input.service !== "esa" && input.service !== "psd") e.service = "Choose ESA or PSD.";

  if (!c.firstName?.trim()) e.firstName = "Full legal first name is required.";
  if (!c.lastName?.trim()) e.lastName = "Full legal last name is required.";

  if (!c.email?.trim()) e.email = "Email address is required.";
  else if (!isValidEmail(c.email)) e.email = "Enter a valid email address (e.g. jane@example.com).";

  if (!c.phone?.trim()) e.phone = "Phone number is required.";

  if (!c.dob) e.dob = "Date of birth is required.";
  else if (!isOfAssessmentAge(c.dob)) e.dob = `The customer must be ${MIN_ASSESSMENT_AGE} or older.`;

  if (!c.state?.trim()) e.state = "State is required.";
  else if (!isServiceableStateCode(c.state)) e.state = "Choose a US state.";

  if (input.pets.length < MIN_ORDER_PETS) e.pets = "At least one animal is required.";
  if (input.pets.length > MAX_ORDER_PETS) e.pets = `No more than ${MAX_ORDER_PETS} animals per order.`;

  input.pets.forEach((p, i) => {
    if (!p.name?.trim()) e[`pet_${i}_name`] = "Pet name is required.";
    if (!p.type?.trim()) e[`pet_${i}_type`] = "Animal type is required.";
    if (!p.age?.trim()) e[`pet_${i}_age`] = "Age is required.";
    if (!p.breed?.trim()) e[`pet_${i}_breed`] = "Breed is required.";
    // A PSD order is for a task-trained dog. Anything else is refused here
    // rather than silently corrected, so the partner sees why.
    if (input.service === "psd" && p.type?.trim().toLowerCase() !== "dog") {
      e[`pet_${i}_type`] = "A psychiatric service dog order must be a dog.";
    }
  });

  if (!input.questionnaire?.trim()) {
    e.questionnaire = "The customer's questionnaire answers are required.";
  } else if (input.questionnaire.length > MAX_QUESTIONNAIRE_CHARS) {
    e.questionnaire = `Keep the answers under ${MAX_QUESTIONNAIRE_CHARS.toLocaleString()} characters.`;
  }

  if (!input.authorizationConfirmed) {
    e.authorizationConfirmed = "Confirm you are authorized to submit this customer's information.";
  }

  return e;
}
