// Shared assessment label maps, types, and PDF generator
// Used by: AssessmentIntakeModal, OrderDetailModal (Assessment tab)

export interface PetInfo {
  name: string;
  type: string;
  age: string;
  breed: string;
  weight?: string;
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

export const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

// ── PDF HTML Builder ────────────────────────────────────────────────────────

export function buildPrintHTML(order: AssessmentOrderBase): string {
  const a = (order.assessment_answers ?? {}) as Record<string, unknown>;
  const pets = (a.pets as PetInfo[]) ?? [];
  const dob = a.dob as string | undefined;
  const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";
  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";
  const submittedDate = formatSubmitDate(order.created_at);

  const petRows = pets.length > 0
    ? pets.map((p) => `
      <tr>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.name || "—"}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.type || "—"}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.age ? `${p.age} yr${p.age !== "1" ? "s" : ""}` : "—"}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.breed || "—"}</td>
        <td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.weight ? `${p.weight} lbs` : "—"}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="padding:10px;border:1px solid #e5e7eb;font-size:13px;color:#9ca3af;text-align:center;">No pet information recorded</td></tr>`;

  // Build questionnaire HTML — open-ended text fields render inline with their parent
  // We group sub-items (isText + subOf) together with their parent question
  const subItemKeys = new Set(QUESTIONNAIRE_ITEMS.filter((i) => i.subOf).map((i) => i.key));
  let qNum = 0;
  const qaRows = QUESTIONNAIRE_ITEMS.map((item) => {
    // Sub-items are rendered inline by their parent — skip them in the main loop
    if (item.subOf) return "";

    const val = a[item.key];
    const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && (val as unknown[]).length === 0);

    // For non-sub items, increment counter only for questions that have a value
    // (legacy items are shown too)
    if (isEmpty && !subItemKeys.has(item.key)) return "";

    qNum++;

    // Find any sub-item that belongs to this question
    const subItem = QUESTIONNAIRE_ITEMS.find((s) => s.subOf === item.key);
    const subVal = subItem ? a[subItem.key] : undefined;
    const hasSubVal = subVal && String(subVal).trim().length > 0;

    // Special full-width blockquote treatment for the big symptom description
    const isSymptom = item.key === "symptomDescription";

    if (isSymptom && !isEmpty) {
      return `
        <div style="margin-bottom:22px;page-break-inside:avoid;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#374151;">
            <span style="display:inline-block;width:22px;height:22px;background:#FF6A00;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;margin-right:8px;font-weight:bold;">${qNum}</span>
            ${item.label}
          </p>
          <blockquote style="margin:0 0 0 30px;padding:12px 16px;background:#FFF8F3;border-left:4px solid #FF6A00;border-radius:0 8px 8px 0;font-size:13px;color:#374151;font-style:italic;line-height:1.7;">
            ${String(val).replace(/\n/g, "<br/>")}
          </blockquote>
        </div>`;
    }

    if (isEmpty) return "";

    return `
      <div style="margin-bottom:18px;page-break-inside:avoid;">
        <p style="margin:0 0 5px;font-size:13px;font-weight:bold;color:#374151;">
          <span style="display:inline-block;width:22px;height:22px;background:#FF6A00;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;margin-right:8px;font-weight:bold;">${qNum}</span>
          ${item.label}
        </p>
        <p style="margin:0 0 0 30px;font-size:13px;color:#FF6A00;font-weight:600;">${resolveLabel(item.key, val)}</p>
        ${hasSubVal ? `
          <div style="margin:8px 0 0 30px;padding:8px 14px;background:#F9FAFB;border:1px solid #e5e7eb;border-radius:8px;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">${subItem?.label ?? "Patient Note"}</p>
            <p style="margin:0;font-size:13px;color:#111827;line-height:1.6;">${String(subVal)}</p>
          </div>` : ""}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ESA Intake Form — ${fullName} — ${order.confirmation_id}</title>
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
      <div class="info-row"><span class="info-label">Full Name:</span><span class="info-value">${fullName}</span></div>
      <div class="info-row"><span class="info-label">State:</span><span class="info-value">${stateName}</span></div>
      <div class="info-row"><span class="info-label">Email:</span><span class="info-value">${order.email || "—"}</span></div>
      <div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${order.phone || "—"}</span></div>
      ${dob ? `<div class="info-row"><span class="info-label">Date of Birth:</span><span class="info-value">${formatDob(dob)}</span></div>` : ""}
      <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value" style="font-family:monospace;font-size:12px;">${order.confirmation_id}</span></div>
      <div class="info-row"><span class="info-label">Submitted:</span><span class="info-value">${submittedDate}</span></div>
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
