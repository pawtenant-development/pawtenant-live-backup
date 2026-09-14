// Shared assessment label maps, types, and PDF generator
// Used by: AssessmentIntakeModal, OrderDetailModal (Assessment tab)

export interface PetInfo {
  name: string;
  type: string;
  age: string;
  breed: string;
  weight?: string;
  // PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004: the ported pet-support
  // renderer reads these optional fields. LIVE orders never carry them today
  // (ASSESSMENT-PET-SUPPORT-AND-STEP-STRUCTURE-001 is TEST-only), so readers
  // fail safe to empty — the renderer already guards every access.
  vaccinated?: boolean;
  supportFunctions?: string[];
  supportNarrative?: string;
}

export interface AssessmentData {
  emotionalFrequency?: string;
  conditions?: string[];
  lifeChangeStress?: string;       // NEW — Adjustment Disorder screen
  challengeDuration?: string;
  dailyImpact?: string;
  sleepQuality?: string;
  socialFunctioning?: string;
  medication?: string;
  medicationDetails?: string;        // NEW — optional medication list
  priorDiagnosis?: string;
  specificDiagnosis?: string;      // NEW — conditional text
  currentTreatment?: string;
  treatmentDetails?: string;         // NEW — optional treatment description
  symptomDescription?: string;     // NEW — open-ended
  housingType?: string;
  // Legacy fields (present in older orders)
  hasESA?: string;
  petSupport?: string[];
  petType?: string;
  pets?: PetInfo[];
  dob?: string;
}

export interface AssessmentOrderBase {
  confirmation_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  state: string | null;
  assessment_answers: Record<string, unknown> | null;
  created_at: string;
  // PARTNER-ASSESSMENT-NEUTRAL-PDF-001 — authoritative origin columns. Optional
  // so every existing caller compiles unchanged; a caller that omits them can
  // only be looking at a direct order, which is what the branded layout is for.
  order_origin?: string | null;
  partner_id?: string | null;
  partner_order_id?: string | null;
  letter_type?: string | null;
}

// ── Label Maps ─────────────────────────────────────────────────────────────

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC",
};

export const ANSWER_MAP: Record<string, Record<string, string>> = {
  emotionalFrequency: {
    rarely: "Rarely — a few times a month",
    sometimes: "Sometimes — a few times a week",
    often: "Often — most days",
    daily: "Almost always — daily or near-daily",
  },
  lifeChangeStress: {
    yes_current: "Yes — currently going through a major life change",
    yes_recent: "Yes — recently went through one and still adjusting",
    no: "Not significantly — situation feels generally stable",
  },
  challengeDuration: {
    lt3months: "Less than 3 months",
    "3to6months": "3–6 months",
    "6to12months": "6–12 months",
    "1to2years": "1–2 years",
    gt2years: "More than 2 years",
  },
  // Q5, Q6, Q7 now use the same consistent frequency scale
  dailyImpact: {
    rarely: "Rarely — barely affects my routine",
    sometimes: "Sometimes — occasionally interferes with daily tasks",
    often: "Often — regularly disrupts work, relationships, or daily life",
    daily: "Almost always — severely impairs ability to function",
    // Legacy values from old form
    mild: "Mild — manageable with some effort",
    moderate: "Moderate — affects work, relationships, or daily tasks",
    severe: "Severe — significantly disrupts daily functioning",
  },
  sleepQuality: {
    rarely: "Rarely — I usually sleep well",
    sometimes: "Sometimes — I occasionally have trouble sleeping",
    often: "Often — I frequently struggle with sleep",
    daily: "Almost always — severe insomnia or very restless sleep",
    // Legacy values
    good: "Good — I sleep well most nights",
    fair: "Fair — occasional difficulty sleeping",
    poor: "Poor — I frequently have trouble sleeping",
    very_poor: "Very poor — insomnia or restless sleep most nights",
  },
  socialFunctioning: {
    rarely: "Rarely — I maintain social life and relationships normally",
    sometimes: "Sometimes — I occasionally withdraw from social situations",
    often: "Often — I frequently avoid people or social activities",
    daily: "Almost always — I am largely isolated from others",
    // Legacy values
    minimal: "Minimal impact — I maintain relationships normally",
    moderate: "Moderate — I avoid some social situations",
    significant: "Significant — I frequently withdraw from others",
    severe: "Severe — I am largely isolated from others",
  },
  medication: {
    yes_taking: "Yes, currently prescribed and taking",
    yes_not_taking: "Yes, prescribed but not currently taking",
    previous: "Previously prescribed, no longer taking",
    never: "No, never prescribed",
  },
  priorDiagnosis: {
    yes: "Yes, I have a formal diagnosis",
    informal: "I have been told I may have a condition, but not formally diagnosed",
    no: "No, I have never been evaluated",
    prefer_not: "I prefer not to say",
  },
  currentTreatment: {
    active: "Yes, I am actively in treatment",
    previous: "Previously received treatment",
    considering: "No, but I am considering it",
    none: "No treatment at this time",
  },
  // Legacy
  hasESA: {
    yes: "Yes, I already have one",
    planning: "No, but I plan to get one",
  },
  petType: {
    dog: "Dog",
    cat: "Cat",
    bird: "Bird",
    small_mammal: "Small mammal (rabbit, hamster, etc.)",
    other: "Other",
  },
  housingType: {
    apt_nopet: "Apartment with a no-pet policy",
    condo: "Condo or townhouse",
    house_rent: "Renting a house",
    dorm: "College dorm or on-campus housing",
    looking: "Currently looking for housing",
  },
};

export const QUESTIONNAIRE_ITEMS: { label: string; key: string; isText?: boolean; subOf?: string }[] = [
  { label: "How often do you experience emotional distress, anxiety, or depression?", key: "emotionalFrequency" },
  { label: "Which of the following do you currently experience?", key: "conditions" },
  { label: "Have you experienced a major life change or transition impacting your mental health?", key: "lifeChangeStress" },
  { label: "How long have you been experiencing these challenges?", key: "challengeDuration" },
  { label: "How often do your symptoms interfere with your daily life, work, or responsibilities?", key: "dailyImpact" },
  { label: "How often do you experience difficulty sleeping or disrupted sleep?", key: "sleepQuality" },
  { label: "How often does your mental health cause you to withdraw from social activities or relationships?", key: "socialFunctioning" },
  { label: "Are you currently taking prescribed medication for a mental health condition?", key: "medication" },
  { label: "Medication(s) listed by patient", key: "medicationDetails", isText: true, subOf: "medication" },
  { label: "Have you previously received a mental health diagnosis from a licensed professional?", key: "priorDiagnosis" },
  { label: "Specific diagnosis (if shared)", key: "specificDiagnosis", isText: true, subOf: "priorDiagnosis" },
  { label: "Are you currently receiving mental health treatment or therapy?", key: "currentTreatment" },
  { label: "Treatment or therapy described by patient", key: "treatmentDetails", isText: true, subOf: "currentTreatment" },
  { label: "Symptoms described in patient's own words", key: "symptomDescription", isText: true },
  { label: "What type of housing do you currently live in?", key: "housingType" },
  // Legacy fields — shown only when present in older orders
  { label: "Do you currently have an Emotional Support Animal?", key: "hasESA" },
  { label: "In what ways does (or would) your ESA help manage your symptoms?", key: "petSupport" },
  { label: "What type of animal is your ESA?", key: "petType" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function resolveLabel(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    const arr = value as string[];
    if (arr.length === 0) return "—";
    return arr.join(", ");
  }
  if (typeof value === "string") {
    return (ANSWER_MAP[field]?.[value] ?? value) || "—";
  }
  return String(value);
}

export function formatDob(dob: string): string {
  if (!dob) return "—";
  try {
    return new Date(dob + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return dob; }
}

export function formatSubmitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

import { resolvePartnerQuestionnaire } from "../../../lib/partnerQuestionnaire";
import {
  PSD_QUESTIONNAIRE_ITEMS,
  getPsdEvidence,
  getPsdMultiValues,
  getPsdText,
  isAnswered,
  normalizePsdAnswers,
  resolvePsdOptionLabel,
} from "./psdAssessmentSchema";

export const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

// ── HTML ESCAPING — THE canonical escape for this generator ─────────────────
//
// PARTNER-ASSESSMENT-NEUTRAL-PDF-001.
//
// This module builds an HTML STRING and hands it to `document.write` / a Blob.
// React is not involved, so nothing escapes for us. Assessment values are
// externally supplied — a partner posts them through the intake API — so every
// dynamic value must be neutralised here or a payload can inject markup,
// scripts, styles, iframes, links or remote requests into a clinical document
// that a provider then reads.
//
// The five characters below are sufficient for both element text and quoted
// attribute values, which is why `"` and `'` are included and not just the
// three "text" characters.
export function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape first, THEN turn real newlines into <br/>.
 *
 * Order matters: escaping after inserting the tag would turn our own <br/> into
 * visible text, and inserting before escaping is how "preserve line breaks"
 * becomes an injection hole.
 */
export function escapeMultilineHtml(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

// ── Rendering context ───────────────────────────────────────────────────────
//
// Which DOCUMENT this assessment is. Derived only from authoritative database
// columns — never from an email domain, a customer name, a confirmation-id
// shape, a price, a UTM value or anything inside the partner's payload, all of
// which are attacker- or coincidence-controlled.
export type AssessmentDocumentContext =
  | { origin: "direct" }
  | { origin: "partner"; partnerOrderId?: string | null };

/**
 * Resolve the context from the order row.
 *
 * A partner order ALWAYS carries partner_id — the orders_partner_identity_consistent
 * check constraint makes a partner row without one impossible — so either
 * authoritative signal is sufficient, and a direct order can never satisfy
 * them. A caller that fails to select these columns therefore degrades to the
 * historical branded output, which is correct for the direct orders that are
 * the only thing those older call paths can reach.
 */
export function resolveAssessmentContext(order: AssessmentOrderBase): AssessmentDocumentContext {
  const isPartner = order.order_origin === "partner" || Boolean(order.partner_id);
  return isPartner
    ? { origin: "partner", partnerOrderId: order.partner_order_id ?? null }
    : { origin: "direct" };
}

/** Internal payload keys that are never questionnaire answers.
 *
 *  `partnerQuestionnaireText` is the customer's questionnaire transcript as the
 *  partner pasted it. It IS clinical content, but it gets its own rendering in
 *  the Mental Health Questionnaire section — listing it here stops it being
 *  emitted a second time as a generic "Partner questionnaire text" answer.
 *  `partnerIntakeChannel` is provenance metadata, not an answer. */
const NON_ANSWER_KEYS = new Set([
  "pets", "dob", "consents", "source", "schema_version",
  "partnerQuestionnaireText", "partnerIntakeChannel",
]);

/** Humanise an unknown question id, e.g. `sleepQuality` -> `Sleep quality`. */
function humaniseKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface RenderedAnswer { label: string; value: string; multiline: boolean }

/**
 * Every answer, in a stable order: the canonical ESA questionnaire first (so an
 * ESA assessment keeps its familiar clinical sequence), then any remaining
 * stored answers. The second pass is what lets a PSD assessment — whose
 * question ids are not in QUESTIONNAIRE_ITEMS — render through the same
 * generator instead of needing a second one.
 */
function collectAnswers(a: Record<string, unknown>): RenderedAnswer[] {
  const out: RenderedAnswer[] = [];
  const seen = new Set<string>();

  for (const item of QUESTIONNAIRE_ITEMS) {
    const v = a[item.key];
    seen.add(item.key);
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out.push({ label: item.label, value: resolveLabel(item.key, v), multiline: Boolean(item.isText) });
  }

  for (const key of Object.keys(a)) {
    if (seen.has(key) || NON_ANSWER_KEYS.has(key)) continue;
    const v = a[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === "object" && !Array.isArray(v)) continue;
    out.push({ label: humaniseKey(key), value: resolveLabel(key, v), multiline: String(v).length > 80 });
  }
  return out;
}

// ── PDF HTML Builder ────────────────────────────────────────────────────────
//
// PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001 — AUDIENCE-SPECIFIC OUTPUT.
//
// "internal" (the default — admin portal and provider portal): ALWAYS the
// neutral document. No PawTenant logo or name, no partner name, no external
// partner reference; the heading is "ESA Assessment" / "PSD Assessment" and
// the case is identified by the PawTenant confirmation id the staff already
// use. The owner wants providers to see one neutral clinical document
// regardless of where the order came from.
//
// "customer" (the customer portal only): the historical behaviour — a direct
// PawTenant order keeps its branded intake form; a partner order stays
// neutral with the partner's own reference. Customer-facing documents were
// deliberately NOT changed by that task.
export type AssessmentAudience = "internal" | "customer";

export function buildPrintHTML(
  order: AssessmentOrderBase,
  contextOverride?: AssessmentDocumentContext,
  audience: AssessmentAudience = "internal",
): string {
  const context = contextOverride ?? resolveAssessmentContext(order);
  if (audience === "internal") {
    return buildNeutralAssessmentHTML(order, { origin: "partner", partnerOrderId: null }, {
      caseReference: order.confirmation_id ?? null,
    });
  }
  return context.origin === "partner"
    ? buildNeutralAssessmentHTML(order, context)
    : buildBrandedAssessmentHTML(order);
}

// ── PER-ANIMAL SUPPORT EVIDENCE (ASSESSMENT-PET-SUPPORT-AND-STEP-STRUCTURE-001)
//
// Renders what the CUSTOMER reported about each individual animal. Every value
// passes through escapeHtml / escapeMultilineHtml, so hostile stored text is
// inert here exactly as it is everywhere else in this file.
//
// FAILS SAFE: an order saved before this task carries none of these fields, in
// which case this returns "" and the document is byte-identical to before.
const PET_DIFFERENTIATION_LABELS: Record<string, string> = {
  different_symptoms: "They help with different symptoms",
  different_situations: "They help at different times or in different situations",
  different_temperaments: "They have different temperaments or interaction styles",
  similar_support: "They provide similar support",
  not_sure: "Not sure",
};

export function buildPetSupportEvidenceHTML(
  pets: PetInfo[],
  a: Record<string, unknown>,
  opts: { titleStyle?: string; bodyStyle?: string; mono?: boolean } = {},
): string {
  // `mono` strips every colour from this block so the internal black-and-white
  // assessment stays black and white. The branded customer document passes
  // nothing and keeps its historical palette byte-for-byte.
  const C = opts.mono
    ? { line: "#666", head: "#000", sub: "#333", faint: "#444", ok: "#000" }
    : { line: "#e5e7eb", head: "#111827", sub: "#6b7280", faint: "#9ca3af", ok: "#047857" };
  const differentiation = typeof a.petsDifferentiation === "string" ? a.petsDifferentiation : "";
  const differentiationNote =
    typeof a.petsDifferentiationNote === "string" ? a.petsDifferentiationNote : "";
  const hasEvidence = (p: PetInfo) =>
    (p.supportFunctions?.length ?? 0) > 0 || !!p.supportNarrative?.trim() || p.vaccinated === true;
  const withEvidence = pets.filter(hasEvidence);
  if (withEvidence.length === 0 && !differentiation && !differentiationNote.trim()) return "";

  const title = opts.titleStyle ?? "font-size:13px;font-weight:bold;color:#374151;margin:14px 0 4px;";
  const body = opts.bodyStyle ?? "font-size:12px;color:#374151;margin:0 0 8px;";

  const petBlocks = pets
    .map((p, i) => {
      if (!hasEvidence(p)) return "";
      const label = p.name?.trim() || `Pet ${i + 1}`;
      const fns = (p.supportFunctions ?? []).filter((f) => !!f);
      const narrative = p.supportNarrative?.trim() ?? "";
      return `
      <div style="border:1px solid ${C.line};border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <p style="font-size:13px;font-weight:bold;color:${C.head};margin:0 0 4px;">${escapeHtml(label)}${
          p.vaccinated === true ? ` <span style="font-size:11px;font-weight:normal;color:${C.ok};">(vaccinations confirmed)</span>` : ""
        }</p>
        ${
          fns.length > 0
            ? `<p style="${body}">${fns.map((f) => escapeHtml(f)).join(" &middot; ")}</p>`
            : `<p style="font-size:12px;color:${C.faint};margin:0 0 8px;">No support options selected.</p>`
        }
        ${
          narrative
            ? `<p style="font-size:12px;color:${C.sub};margin:6px 0 2px;font-weight:bold;">In the customer&#39;s words</p>
               <p style="${body}">${escapeMultilineHtml(narrative)}</p>`
            : ""
        }
      </div>`;
    })
    .join("");

  const diffBlock =
    differentiation || differentiationNote.trim()
      ? `
      <div style="border:1px solid ${C.line};border-radius:8px;padding:10px 12px;">
        <p style="font-size:13px;font-weight:bold;color:${C.head};margin:0 0 4px;">Do the animals support the customer in different ways?</p>
        ${differentiation ? `<p style="${body}">${escapeHtml(PET_DIFFERENTIATION_LABELS[differentiation] ?? differentiation)}</p>` : ""}
        ${
          differentiationNote.trim()
            ? `<p style="font-size:12px;color:${C.sub};margin:6px 0 2px;font-weight:bold;">What would be lost with only one</p>
               <p style="${body}">${escapeMultilineHtml(differentiationNote.trim())}</p>`
            : ""
        }
      </div>`
      : "";

  return `
    <p style="${title}">Support reported for each animal</p>
    <p style="font-size:11px;color:${C.faint};margin:0 0 8px;">Reported by the customer. Descriptive intake information for clinical review &mdash; not a finding and not a score.</p>
    ${petBlocks}
    ${diffBlock}`;
}

// ── INTERNAL CLINICAL ASSESSMENT (admin + provider) ─────────────────────────
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — redesigned.
//
// One plain black-and-white clinical record for EVERY internal assessment:
// direct ESA, direct PSD, partner ESA, partner PSD. It carries no logo, no
// brand colour, no marketing line, no price, no QR, no verification id, no
// partner name and no partner external reference. The case is identified by
// the PawTenant confirmation id the staff and the provider already use.
//
// WHY IT PAGINATES ITSELF
// The previous version handed one long flow to the browser and relied on
// `page-break-inside`, which produced orphaned headings, clipped answers and
// no page numbers. This version lays the content out into real US-Letter
// sheets inside the document, so what you see on screen is exactly what
// prints: every page is measurable, inspectable and numbered.
//
// THE PAGINATOR CARRIES NO DATA. It is a fixed, first-party script with zero
// interpolation — byte-identical for a benign order and for an order whose
// every field is hostile. All untrusted values are escaped before they reach
// the markup, exactly as before; the script only measures and moves the
// elements the template already produced. `check-partner-assessment-pdf.mjs`
// asserts both halves of that: the script never varies with the data, and it
// contains no network, eval or innerHTML primitive.
//
// The sans stack (Helvetica / Arial) and `letter-spacing: normal` are
// deliberate — the old serif layout with tracked-out headings is what produced
// the unusual character spacing the owner reported.

/** Break free text into one element per line so a long pasted transcript can
 *  flow across pages instead of being clipped. Blank lines survive as spacing.
 *  Every line is escaped, so pasted markup stays inert text. */
function questionnaireLineBlocks(text: string): string {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line, i) => {
      const cls = [
        "a-line",
        i === 0 ? "a-first" : "",
        i === lines.length - 1 ? "a-last" : "",
      ].filter(Boolean).join(" ");
      return `<div class="${cls}">${line.trim() === "" ? "&nbsp;" : escapeHtml(line)}</div>`;
    })
    .join("");
}

// ── ONE ASSESSMENT DOCUMENT MODEL (screen + PDF) ────────────────────────────
//
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// Every internal assessment surface — the admin Assessment tab, the admin
// Provider View, the provider portal and the downloadable PDF — renders THIS
// model. It is built once from the order row and carries no branding, no
// partner identity, no economics. Because the screen component and the HTML
// builder consume the same object, they cannot show different questions,
// different answers or a different order.
//
// Three questionnaire shapes are recognised and normalised into numbered
// question/answer blocks:
//   * a pasted partner transcript (partner portal / admin intake) — parsed
//     losslessly by resolvePartnerQuestionnaire, numbering preserved;
//   * a structured PSD assessment — the canonical psd_v1 catalog, option codes
//     resolved to the wording the customer saw, follow-ups and evidence kept;
//   * a structured ESA assessment — the retail catalog first, then any other
//     stored answer so nothing is dropped.
//
// Consent / attestation evidence is carried on the model for an ADMIN-ONLY
// audit view. It is never rendered to a provider and never enters the PDF.
export interface AssessmentQuestionBlock {
  number: number;
  question: string;
  answer: string;
  /** Free text that keeps its line breaks. */
  multiline: boolean;
}

export interface AssessmentPetEvidence {
  label: string;
  vaccinated: boolean;
  functions: string[];
  narrative: string;
}

export interface AssessmentDocumentModel {
  title: "ESA Assessment" | "PSD Assessment";
  isPsd: boolean;
  caseReference: string;
  customer: { label: string; value: string }[];
  pets: PetInfo[];
  petEvidence: { pets: AssessmentPetEvidence[]; differentiation: string | null; differentiationNote: string | null };
  questionnaire: {
    source: "pasted" | "structured" | "none";
    note: string | null;
    blocks: AssessmentQuestionBlock[];
    additional: string[];
    additionalNote: string | null;
  };
  /** Admin-only audit rows. Never shown to a provider, never in the PDF. */
  consents: { item: string; status: string; recordedAt: string }[];
}

const PSD_KNOWN_KEYS = new Set<string>([
  ...PSD_QUESTIONNAIRE_ITEMS.flatMap((q) => (q.followUp ? [q.key, q.followUp.key] : [q.key])),
  "taskEvidenceType", "taskEvidenceUrl",
]);

/** The canonical PSD catalog rendered as numbered blocks, verbatim answers. */
function collectPsdBlocks(raw: Record<string, unknown>): AssessmentQuestionBlock[] {
  const a = normalizePsdAnswers(raw);
  const out: AssessmentQuestionBlock[] = [];
  for (const q of PSD_QUESTIONNAIRE_ITEMS) {
    let answer = "";
    let multiline = false;
    if (q.kind === "evidence") {
      const ev = getPsdEvidence(a);
      if (!ev.present) continue;
      answer = [ev.type, ev.url].filter(Boolean).join(" — ");
    } else if (q.kind === "multi") {
      const vals = getPsdMultiValues(a, q.key);
      if (vals.length === 0) continue;
      answer = vals.join("; ");
    } else if (q.kind === "text") {
      const v = getPsdText(a, q.key);
      if (!isAnswered(v)) continue;
      answer = v;
      multiline = true;
    } else {
      const v = a[q.key];
      if (!isAnswered(v)) continue;
      answer = resolvePsdOptionLabel(q.options, v);
    }
    out.push({ number: q.n, question: q.label, answer, multiline });
    if (q.followUp) {
      const fv = getPsdText(a, q.followUp.key);
      if (isAnswered(fv)) out.push({ number: q.n, question: q.followUp.label, answer: fv, multiline: true });
    }
  }
  // Anything stored outside the catalog is still shown, humanised — never dropped.
  let n = out.length > 0 ? Math.max(...out.map((b) => b.number)) : 0;
  for (const key of Object.keys(a)) {
    if (PSD_KNOWN_KEYS.has(key) || NON_ANSWER_KEYS.has(key)) continue;
    const v = a[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === "object" && !Array.isArray(v)) continue;
    n += 1;
    out.push({ number: n, question: humaniseKey(key), answer: resolveLabel(key, v), multiline: String(v).length > 80 });
  }
  return out;
}

export function buildAssessmentDocumentModel(order: AssessmentOrderBase): AssessmentDocumentModel {
  const a = (order.assessment_answers ?? {}) as Record<string, unknown>;
  const isPsd = (order.letter_type ?? "").toString().toLowerCase() === "psd";
  const pets = (Array.isArray(a.pets) ? (a.pets as PetInfo[]) : []) ?? [];
  const dob = typeof a.dob === "string" ? a.dob : undefined;
  const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";
  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";

  const customer: { label: string; value: string }[] = [
    { label: "Name", value: fullName },
    ...(dob ? [{ label: "Date of Birth", value: formatDob(dob) }] : []),
    ...(order.email ? [{ label: "Email", value: order.email }] : []),
    ...(order.phone ? [{ label: "Phone", value: order.phone }] : []),
    { label: "State", value: stateName },
    { label: "Submission Date", value: order.created_at ? formatSubmitDate(order.created_at) : "—" },
  ];

  const hasEvidence = (p: PetInfo) =>
    (p.supportFunctions?.length ?? 0) > 0 || !!p.supportNarrative?.trim() || p.vaccinated === true;
  const differentiation = typeof a.petsDifferentiation === "string" && a.petsDifferentiation
    ? (PET_DIFFERENTIATION_LABELS[a.petsDifferentiation] ?? a.petsDifferentiation)
    : null;
  const differentiationNote = typeof a.petsDifferentiationNote === "string" && a.petsDifferentiationNote.trim()
    ? a.petsDifferentiationNote.trim()
    : null;
  const petEvidence = {
    pets: pets.filter(hasEvidence).map((p, i) => ({
      label: p.name?.trim() || `Pet ${i + 1}`,
      vaccinated: p.vaccinated === true,
      functions: (p.supportFunctions ?? []).filter((f) => !!f),
      narrative: p.supportNarrative?.trim() ?? "",
    })),
    differentiation,
    differentiationNote,
  };

  const parsedPaste = resolvePartnerQuestionnaire(a);
  let questionnaire: AssessmentDocumentModel["questionnaire"];
  if (parsedPaste) {
    questionnaire = {
      source: "pasted",
      note: "Submitted as supplied by the customer. Original wording and answers preserved; numbering follows the submitted document.",
      blocks: parsedPaste.blocks.map((b) => ({ number: b.number, question: b.question, answer: b.answer, multiline: true })),
      additional: parsedPaste.additional,
      additionalNote: parsedPaste.additional.length === 0 ? null
        : parsedPaste.blocks.length === 0
          ? "The submitted text did not use numbered questions, so it is shown exactly as received."
          : "Text submitted outside the numbered questions, shown exactly as received.",
    };
  } else {
    const blocks = isPsd
      ? collectPsdBlocks(a)
      : collectAnswers(a).map((ans, i) => ({ number: i + 1, question: ans.label, answer: ans.value, multiline: ans.multiline }));
    questionnaire = { source: blocks.length > 0 ? "structured" : "none", note: null, blocks, additional: [], additionalNote: null };
  }

  const consentsRaw = (a.consents && typeof a.consents === "object" && !Array.isArray(a.consents))
    ? a.consents as Record<string, unknown>
    : {};
  const consents = Object.keys(consentsRaw).map((k) => {
    const c = consentsRaw[k];
    const rec = (c && typeof c === "object" && !Array.isArray(c)) ? c as Record<string, unknown> : {};
    return {
      item: humaniseKey(k),
      status: rec.accepted === true ? "Acknowledged" : (rec.name ? `Signed: ${String(rec.name)}` : "—"),
      recordedAt: rec.at ? String(rec.at) : "—",
    };
  });

  return {
    title: isPsd ? "PSD Assessment" : "ESA Assessment",
    isPsd,
    caseReference: order.confirmation_id,
    customer,
    pets,
    petEvidence,
    questionnaire,
    consents,
  };
}

function buildNeutralAssessmentHTML(
  order: AssessmentOrderBase,
  context: Extract<AssessmentDocumentContext, { origin: "partner" }>,
  opts: { caseReference?: string | null } = {},
): string {
  const m = buildAssessmentDocumentModel(order);
  const title = m.title;

  const infoRow = (label: string, value: string) =>
    `<div class="row"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`;
  const sectionTitle = (t: string) => `<p class="section-title">${escapeHtml(t)}</p>`;

  // Internal audience: the PawTenant case reference staff already use, under a
  // brandless label. Customer audience (partner order): the PARTNER'S OWN
  // reference only; the internal confirmation id is deliberately absent.
  const caseRef = opts.caseReference
    ? infoRow("Case Reference", opts.caseReference)
    : context.partnerOrderId
      ? infoRow("Partner Case Reference", context.partnerOrderId)
      : "";

  // ── Pet information ──────────────────────────────────────────────────────
  const petRows = m.pets.length > 0
    ? m.pets.map((p) => `<tr>
        <td>${escapeHtml(p.name || "—")}</td>
        <td>${escapeHtml(p.type || "—")}</td>
        <td>${escapeHtml(p.breed || "—")}</td>
        <td>${escapeHtml(p.age ? `${p.age} yr` : "—")}</td>
        <td>${escapeHtml(p.weight ? `${p.weight} lbs` : "—")}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="muted">No animal information recorded</td></tr>`;

  // Per-animal support evidence, rendered from the SAME model the screen uses.
  // Black and white only; every value escaped.
  const ev = m.petEvidence;
  const petEvidence = ev.pets.length === 0 && !ev.differentiation && !ev.differentiationNote ? "" :
    `<p class="q">Support reported for each animal</p>
     <p class="note">Reported by the customer. Descriptive intake information for clinical review &mdash; not a finding and not a score.</p>` +
    ev.pets.map((p) => `<div class="ev">
        <p class="ev-name">${escapeHtml(p.label)}${p.vaccinated ? " <span class=\"ev-ok\">(vaccinations confirmed)</span>" : ""}</p>
        ${p.functions.length > 0 ? `<p class="ev-body">${p.functions.map((f) => escapeHtml(f)).join(" &middot; ")}</p>` : `<p class="ev-faint">No support options selected.</p>`}
        ${p.narrative ? `<p class="ev-sub">In the customer&#39;s words</p><p class="ev-body">${escapeMultilineHtml(p.narrative)}</p>` : ""}
      </div>`).join("") +
    (ev.differentiation || ev.differentiationNote
      ? `<div class="ev"><p class="ev-name">Do the animals support the customer in different ways?</p>
         ${ev.differentiation ? `<p class="ev-body">${escapeHtml(ev.differentiation)}</p>` : ""}
         ${ev.differentiationNote ? `<p class="ev-sub">What would be lost with only one</p><p class="ev-body">${escapeMultilineHtml(ev.differentiationNote)}</p>` : ""}
         </div>`
      : "");

  // ── Questionnaire ────────────────────────────────────────────────────────
  // One rendering for every source: numbered question, answer beneath. A
  // pasted transcript answer is split per line so a long block can flow
  // across pages; a bounded structured narrative stays one block.
  const qa = m.questionnaire;
  let qaBlocks = "";
  if (qa.source === "none") {
    qaBlocks = `<p class="muted">No questionnaire answers recorded.</p>`;
  } else {
    const blockHtml = qa.blocks.map((b) => {
      const q = `<p class="q"><span class="num">${escapeHtml(String(b.number))}.</span> ${escapeHtml(b.question)}</p>`;
      if (!b.answer.trim()) return q + `<p class="a-scalar muted-left">No answer recorded for this question.</p>`;
      if (qa.source === "pasted") return q + questionnaireLineBlocks(b.answer);
      return b.multiline
        ? `${q}<p class="a-body">${escapeMultilineHtml(b.answer)}</p>`
        : `${q}<p class="a-scalar">${escapeHtml(b.answer)}</p>`;
    }).join("");
    const additionalHtml = qa.additional.length > 0
      ? `<p class="q">Additional Questionnaire Information</p>` +
        (qa.additionalNote ? `<p class="note">${escapeHtml(qa.additionalNote)}</p>` : "") +
        questionnaireLineBlocks(qa.additional.join("\n"))
      : "";
    qaBlocks = (qa.note ? `<p class="note">${escapeHtml(qa.note)}</p>` : "") + blockHtml + additionalHtml;
  }

  // Consent / attestation evidence is deliberately NOT rendered here: this
  // document reaches providers. It lives on the model for the admin audit view.

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; letter-spacing: normal; }
  html, body { background: #fff; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #000;
    font-size: 11.5px;
    line-height: 1.55;
  }
  /* One real US Letter sheet. Screen and print use the same box, so what is
     inspected on screen is what comes out of the printer. */
  .sheet {
    position: relative;
    width: 8.5in;
    height: 11in;
    padding: 0.75in;
    margin: 0 auto 18px;
    background: #fff;
    overflow: hidden;
  }
  .body-area { height: 8.55in; overflow: hidden; }
  .sheet-footer {
    position: absolute;
    left: 0.75in; right: 0.75in; bottom: 0.5in;
    border-top: 1px solid #000;
    padding-top: 6px;
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  }
  .sheet-footer span { font-size: 9px; color: #000; }
  .sheet-footer .pg { white-space: nowrap; }

  .doc-title { font-size: 17px; font-weight: bold; margin-bottom: 2px; }
  .doc-sub { font-size: 10px; margin-bottom: 16px; }
  .section-title {
    font-size: 11px; font-weight: bold; text-transform: uppercase;
    border-bottom: 1px solid #000; padding-bottom: 3px;
    margin: 16px 0 8px;
  }
  .row { display: flex; gap: 8px; margin-bottom: 3px; }
  .k { width: 1.9in; flex: 0 0 1.9in; }
  .v { font-weight: bold; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 9.5px; text-transform: uppercase; font-weight: bold;
       border: 1px solid #000; padding: 5px 7px; text-align: left; }
  td { font-size: 11px; border: 1px solid #666; padding: 5px 7px; word-break: break-word; }
  .muted { color: #444; text-align: center; }
  .note { font-size: 10px; color: #333; margin-bottom: 6px; }

  .q { font-weight: bold; margin: 10px 0 3px; }
  .a-scalar { margin: 0 0 4px 16px; }
  .muted-left { color: #444; font-style: italic; }
  /* Narrative answers sit in a lightly bordered, light-grey readable block. */
  .a-body {
    margin: 0 0 8px 16px; padding: 6px 9px;
    background: #f4f4f4; border: 1px solid #666;
    word-break: break-word;
  }
  /* The pasted transcript is built one line per element so a long answer flows
     onto the next page instead of being clipped; the shared styling keeps it
     reading as one continuous block. */
  .a-line {
    margin-left: 16px; padding: 1px 9px;
    background: #f4f4f4;
    border-left: 1px solid #666; border-right: 1px solid #666;
    white-space: pre-wrap; word-break: break-word;
  }
  .a-first { border-top: 1px solid #666; padding-top: 6px; }
  .ev { border: 1px solid #666; padding: 6px 9px; margin: 0 0 6px 16px; }
  .ev-name { font-weight: bold; margin: 0 0 3px; }
  .ev-ok { font-weight: normal; font-size: 10px; }
  .ev-sub { font-weight: bold; font-size: 10px; margin: 4px 0 1px; }
  .ev-body { margin: 0 0 3px; word-break: break-word; }
  .ev-faint { color: #444; margin: 0 0 3px; }
  .a-last  { border-bottom: 1px solid #666; padding-bottom: 6px; margin-bottom: 6px; }

  @media screen {
    body { background: #e9e9e9; padding: 18px 0; }
  }
  @media print {
    body { background: #fff; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: Letter; margin: 0; }
    .sheet { margin: 0; page-break-after: always; }
    .sheet:last-of-type { page-break-after: auto; }
  }
</style>
</head>
<body>
<div id="src" style="display:none">
  <p class="doc-title">${escapeHtml(title)}</p>
  <p class="doc-sub">Confidential clinical assessment prepared for licensed provider review.</p>

  ${sectionTitle("Customer Information")}
  ${caseRef}
  ${m.customer.map((r) => infoRow(r.label, r.value)).join("")}

  ${sectionTitle("Pet Information")}
  <div class="tbl"><table>
    <thead><tr><th>Name</th><th>Type</th><th>Breed</th><th>Age</th><th>Weight</th></tr></thead>
    <tbody>${petRows}</tbody>
  </table></div>
  ${petEvidence ? `<div class="evidence">${petEvidence}</div>` : ""}

  ${sectionTitle("Mental Health Questionnaire")}
  ${qaBlocks}
</div>
<div id="pages"></div>
<script>
(function () {
  var FOOTER = "This document is confidential and intended solely for licensed professionals reviewing this case.";
  var holder = document.getElementById("src");
  var out = document.getElementById("pages");
  var blocks = Array.prototype.slice.call(holder.children);
  var sheets = [];

  function newSheet() {
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    var area = document.createElement("div");
    area.className = "body-area";
    sheet.appendChild(area);
    var foot = document.createElement("div");
    foot.className = "sheet-footer";
    var left = document.createElement("span");
    left.textContent = FOOTER;
    var right = document.createElement("span");
    right.className = "pg";
    foot.appendChild(left);
    foot.appendChild(right);
    sheet.appendChild(foot);
    out.appendChild(sheet);
    sheets.push({ area: area, pg: right });
    return sheets[sheets.length - 1];
  }

  var cur = newSheet();
  for (var i = 0; i < blocks.length; i++) {
    var node = blocks[i];
    cur.area.appendChild(node);
    if (cur.area.scrollHeight > cur.area.clientHeight && cur.area.children.length > 1) {
      cur.area.removeChild(node);
      cur = newSheet();
      cur.area.appendChild(node);
    }
  }

  for (var s = 0; s < sheets.length - 1; s++) {
    var area = sheets[s].area;
    var last = area.lastElementChild;
    while (last && (last.className === "section-title" || last.className === "q" || last.className === "note")) {
      area.removeChild(last);
      sheets[s + 1].area.insertBefore(last, sheets[s + 1].area.firstChild);
      last = area.lastElementChild;
    }
  }

  holder.parentNode.removeChild(holder);
  for (var p = 0; p < sheets.length; p++) {
    sheets[p].pg.textContent = "Page " + (p + 1) + " of " + sheets.length;
  }
})();
</script>
</body>
</html>`;
}

// ── DIRECT PAWTENANT ASSESSMENT (historical branded layout) ─────────────────
//
// Unchanged in content, structure, colour and copy. The ONLY difference from
// the previous implementation is that every dynamic value now passes through
// escapeHtml / escapeMultilineHtml, so a hostile stored answer renders as inert
// text here too.
function buildBrandedAssessmentHTML(order: AssessmentOrderBase): string {
  const a = (order.assessment_answers ?? {}) as Record<string, unknown>;
  const pets = (a.pets as PetInfo[]) ?? [];
  const dob = a.dob as string | undefined;
  const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";
  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";
  const submittedDate = formatSubmitDate(order.created_at);

  const petRows = pets.length > 0
    ? pets.map((p) => `
      <tr>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${escapeHtml(p.name || "—")}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${escapeHtml(p.type || "—")}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${escapeHtml(p.age ? `${p.age} yr${p.age !== "1" ? "s" : ""}` : "—")}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${escapeHtml(p.breed || "—")}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${escapeHtml(p.weight ? `${p.weight} lbs` : "—")}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="padding:10px;border:1px solid #e5e7eb;font-size:13px;color:#9ca3af;text-align:center;">No pet information recorded</td></tr>`;

  const subItemKeys = new Set(QUESTIONNAIRE_ITEMS.filter((i) => i.subOf).map((i) => i.key));
  let qNum = 0;
  const qaRows = QUESTIONNAIRE_ITEMS.map((item) => {
    if (item.subOf) return "";

    const val = a[item.key];
    const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && (val as unknown[]).length === 0);

    if (isEmpty && !subItemKeys.has(item.key)) return "";

    qNum++;

    const subItem = QUESTIONNAIRE_ITEMS.find((s) => s.subOf === item.key);
    const subVal = subItem ? a[subItem.key] : undefined;
    const hasSubVal = subVal && String(subVal).trim().length > 0;

    const isSymptom = item.key === "symptomDescription";

    if (isSymptom && !isEmpty) {
      return `
        <div style="margin-bottom:22px;page-break-inside:avoid;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#374151;">
            <span style="display:inline-block;width:22px;height:22px;background:#FF6A00;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;margin-right:8px;font-weight:bold;">${qNum}</span>
            ${escapeHtml(item.label)}
          </p>
          <blockquote style="margin:0 0 0 30px;padding:12px 16px;background:#FFF8F3;border-left:4px solid #FF6A00;border-radius:0 8px 8px 0;font-size:13px;color:#374151;font-style:italic;line-height:1.7;">
            ${escapeMultilineHtml(val)}
          </blockquote>
        </div>`;
    }

    if (isEmpty) return "";

    return `
      <div style="margin-bottom:18px;page-break-inside:avoid;">
        <p style="margin:0 0 5px;font-size:13px;font-weight:bold;color:#374151;">
          <span style="display:inline-block;width:22px;height:22px;background:#FF6A00;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;margin-right:8px;font-weight:bold;">${qNum}</span>
          ${escapeHtml(item.label)}
        </p>
        <p style="margin:0 0 0 30px;font-size:13px;color:#FF6A00;font-weight:600;">${escapeHtml(resolveLabel(item.key, val))}</p>
        ${hasSubVal ? `
          <div style="margin:8px 0 0 30px;padding:8px 14px;background:#F9FAFB;border:1px solid #e5e7eb;border-radius:8px;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(subItem?.label ?? "Patient Note")}</p>
            <p style="margin:0;font-size:13px;color:#111827;line-height:1.6;">${escapeMultilineHtml(subVal)}</p>
          </div>` : ""}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ESA Intake Form — ${escapeHtml(fullName)} — ${escapeHtml(order.confirmation_id)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
  .page { max-width: 760px; margin: 0 auto; padding: 48px 40px; }
  .header { text-align: center; margin-bottom: 36px; }
  .logo { height: 52px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; }
  .form-title { font-size: 24px; font-weight: 800; color: #FF6A00; margin-bottom: 6px; }
  .form-subtitle { font-size: 12px; color: #6B7280; max-width: 420px; margin: 0 auto; line-height: 1.6; }
  .section { margin-bottom: 32px; page-break-inside: avoid; }
  .section-title { font-size: 15px; font-weight: 800; color: #FF6A00; padding-bottom: 8px; border-bottom: 2px solid #FF6A00; margin-bottom: 16px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
  .info-row { display: flex; gap: 6px; align-items: flex-start; }
  .info-label { font-size: 13px; color: #6B7280; min-width: 130px; flex-shrink: 0; }
  .info-value { font-size: 13px; color: #111827; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #FFF1E8; color: #FF6A00; font-size: 12px; font-weight: 700; padding: 10px 12px; border: 1px solid #e5e7eb; text-align: left; letter-spacing: 0.04em; text-transform: uppercase; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; }
  .footer p { font-size: 11px; color: #9CA3AF; line-height: 1.8; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 1.2cm; size: A4; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <img src="${LOGO_URL}" class="logo" alt="PawTenant" />
    <p class="form-title">PawTenant ESA Intake Form</p>
    <p class="form-subtitle">Kindly provide as much accurate information as possible to enable the provider to approve your request.</p>
  </div>

  <div class="section">
    <p class="section-title">Pet and Owner Information</p>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Full Name:</span><span class="info-value">${escapeHtml(fullName)}</span></div>
      <div class="info-row"><span class="info-label">State:</span><span class="info-value">${escapeHtml(stateName)}</span></div>
      <div class="info-row"><span class="info-label">Email:</span><span class="info-value">${escapeHtml(order.email || "—")}</span></div>
      <div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${escapeHtml(order.phone || "—")}</span></div>
      ${dob ? `<div class="info-row"><span class="info-label">Date of Birth:</span><span class="info-value">${escapeHtml(formatDob(dob))}</span></div>` : ""}
      <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value" style="font-family:monospace;font-size:12px;">${escapeHtml(order.confirmation_id)}</span></div>
      <div class="info-row"><span class="info-label">Submitted:</span><span class="info-value">${escapeHtml(submittedDate)}</span></div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Pet Information</p>
    <p style="font-size:13px;font-weight:bold;color:#374151;margin-bottom:10px;">How many emotional support animals are you certifying today?</p>
    <table>
      <thead>
        <tr>
          <th>Pet Name</th>
          <th>Pet Type</th>
          <th>Age</th>
          <th>Breed</th>
          <th>Weight</th>
        </tr>
      </thead>
      <tbody>${petRows}</tbody>
    </table>
  </div>

  <div class="section">
    <p class="section-title">Mental Health Questionnaire</p>
    ${qaRows || "<p style=\"font-size:13px;color:#9ca3af;\">No questionnaire answers recorded.</p>"}
  </div>

  <div class="footer">
    <p>PawTenant &bull; Secure ESA Consultation Support &bull; pawtenant.com</p>
    <p>This document is confidential and intended solely for licensed professionals reviewing this ESA case.</p>
  </div>

</div>
<script>
  var img = document.querySelector('img');
  function triggerPrint() { setTimeout(function() { window.print(); }, 300); }
  if (img) {
    if (img.complete) { triggerPrint(); }
    else { img.onload = triggerPrint; img.onerror = triggerPrint; }
  } else {
    triggerPrint();
  }
</script>
</body>
</html>`;
}
