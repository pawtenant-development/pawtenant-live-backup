// PSDAssessmentView — Renders PSD Psychiatric Service Dog evaluation answers
// inside the OrderDetailModal / ProviderOrderDetail Assessment tab.
// Matches the branded style of the ESA intake form (logo + contact info at top).

import { useRef } from "react";

const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington D.C.",
};

interface PSDAnswers {
  dogTasks?: string[];
  taskTraining?: string;
  dogDuration?: string;
  emotionalFrequency?: string;
  conditions?: string[];
  lifeChangeStress?: string;
  dailyImpact?: string;
  medication?: string;
  medicationDetails?: string;
  priorDiagnosis?: string;
  specificDiagnosis?: string;
  currentTreatment?: string;
  treatmentDetails?: string;
  dogHelpDescription?: string;
  housingType?: string;
  pets?: { name?: string; type?: string; age?: string; breed?: string; weight?: string }[];
  dob?: string;
}

interface OrderInfo {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  confirmationId?: string | null;
  createdAt?: string | null;
}

interface Props {
  answers: Record<string, unknown> | null;
  orderInfo?: OrderInfo;
}

// ── Label maps ────────────────────────────────────────────────────────────────

const TASK_TRAINING_LABELS: Record<string, string> = {
  professional: "Professionally trained by a certified trainer",
  owner_trained: "Owner-trained (self-trained with the dog)",
  mixed: "Mix of professional and owner training",
  in_training: "Currently in training",
};

const DURATION_LABELS: Record<string, string> = {
  lt6months: "Less than 6 months",
  "6to12months": "6–12 months",
  "1to2years": "1–2 years",
  gt2years: "More than 2 years",
};

const FREQ_LABELS: Record<string, string> = {
  rarely: "Rarely — a few times a month",
  sometimes: "Sometimes — a few times a week",
  often: "Often — most days",
  daily: "Almost always — daily or near-daily",
};

const LIFE_CHANGE_LABELS: Record<string, string> = {
  yes_current: "Yes — currently going through a major life change",
  yes_recent: "Yes — recently went through one and still adjusting",
  no: "Not significantly — situation feels generally stable",
};

const MEDICATION_LABELS: Record<string, string> = {
  yes_taking: "Yes, currently prescribed and taking",
  yes_not_taking: "Yes, prescribed but not currently taking",
  previous: "Previously prescribed, no longer taking",
  never: "No, never prescribed",
};

const DIAGNOSIS_LABELS: Record<string, string> = {
  yes: "Yes, formal diagnosis",
  informal: "Told I may have a condition, not formally diagnosed",
  no: "No, never been evaluated",
  prefer_not: "Prefer not to say",
};

const TREATMENT_LABELS: Record<string, string> = {
  active: "Yes, actively in treatment",
  previous: "Previously received treatment",
  considering: "No, but considering it",
  none: "No treatment at this time",
};

const HOUSING_LABELS: Record<string, string> = {
  apt_nopet: "Apartment with no-pet policy",
  condo: "Condo or townhouse",
  house_rent: "Renting a house",
  dorm: "College dorm or on-campus housing",
  looking: "Currently looking for housing",
};

// ── ADA task checklist ────────────────────────────────────────────────────────

const ALL_DOG_TASKS = [
  "Interrupting anxiety or panic attacks",
  "Providing deep pressure therapy (DPT)",
  "Grounding during dissociation or flashbacks",
  "Alerting to emotional distress before it escalates",
  "Retrieving medication or water",
  "Guiding handler through crowds or public spaces",
  "Waking handler from nightmares (PTSD)",
  "Creating personal space / blocking (crowd control)",
  "Performing safety checks of rooms",
  "Tethering — preventing self-harm or wandering",
  "Alerting to sounds or persons for hearing impairment",
  "Reminding handler to take medication",
];

function AnswerRow({ label, value, accent }: { label: string; value: string | undefined; accent?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm font-semibold flex-1 ${accent ?? "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm text-gray-400 w-32 flex-shrink-0">{label}:</span>
      <span className="text-sm font-semibold text-gray-900 break-all">{value}</span>
    </div>
  );
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function handlePrintAssessment(
  contentRef: React.RefObject<HTMLDivElement | null>,
  orderInfo?: OrderInfo,
) {
  const el = contentRef.current;
  if (!el) return;
  const printWin = window.open("", "_blank", "width=960,height=800");
  if (!printWin) return;
  const html = el.innerHTML;
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>PSD Evaluation — ${orderInfo?.confirmationId ?? "PawTenant"}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: system-ui, -apple-system, sans-serif; background: white; padding: 24px; }
  </style>
</head>
<body>
  ${html}
  <script>
    window.addEventListener("load", function() {
      setTimeout(function() { window.print(); }, 800);
    });
  <\/script>
</body>
</html>`);
  printWin.document.close();
}

export default function PSDAssessmentView({ answers, orderInfo }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  if (!answers) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
        <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
          <i className="ri-questionnaire-line text-gray-400 text-xl"></i>
        </div>
        <p className="text-sm font-bold text-gray-600 mb-1">No PSD assessment data</p>
        <p className="text-xs text-gray-400">PSD assessment answers haven&apos;t been recorded for this order yet.</p>
      </div>
    );
  }

  const a = answers as PSDAnswers;
  const dogTasks = a.dogTasks ?? [];
  const conditions = a.conditions ?? [];
  const pets = a.pets ?? [];

  const fullName = [orderInfo?.firstName, orderInfo?.lastName].filter(Boolean).join(" ") || "—";
  const stateName = STATE_NAMES[orderInfo?.state ?? ""] ?? orderInfo?.state ?? "—";

  return (
    <div className="space-y-6" ref={contentRef}>

      {/* ── Print / Save PDF button ── */}
      <div className="flex justify-end no-print">
        <button
          type="button"
          onClick={() => handlePrintAssessment(contentRef, orderInfo)}
          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 cursor-pointer transition-colors"
        >
          <i className="ri-printer-line"></i>Print / Save as PDF
        </button>
      </div>

      {/* ── BRANDED HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-[#f8f7f4] border border-gray-200 rounded-xl overflow-hidden">
        {/* Logo + title band */}
        <div className="bg-white px-6 py-5 text-center border-b border-gray-100">
          <img src={LOGO_URL} alt="PawTenant" className="h-10 mx-auto mb-3 object-contain" />
          <h2 className="text-lg font-extrabold text-amber-700 mb-1">PawTenant — PSD Evaluation Form</h2>
          <p className="text-xs text-gray-500">Psychiatric Service Dog (ADA) Assessment &bull; Confidential</p>
          {/* Contact strip */}
          <div className="flex items-center justify-center gap-5 mt-3 flex-wrap">
            {[
              { icon: "ri-mail-line", text: "hello@pawtenant.com" },
              { icon: "ri-phone-line", text: "(409) 965-5885" },
              { icon: "ri-global-line", text: "pawtenant.com" },
            ].map((c) => (
              <span key={c.text} className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                <i className={`${c.icon} text-amber-500`}></i>{c.text}
              </span>
            ))}
          </div>
        </div>

        {/* Patient info grid */}
        {orderInfo && (
          <div className="px-6 py-4">
            <p className="text-xs font-extrabold text-amber-700 uppercase tracking-widest mb-3">Patient Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              <InfoRow label="Full Name" value={fullName} />
              <InfoRow label="State" value={stateName} />
              <InfoRow label="Email" value={orderInfo.email ?? "—"} />
              <InfoRow label="Phone" value={orderInfo.phone ?? "—"} />
              {a.dob && <InfoRow label="Date of Birth" value={a.dob} />}
              <InfoRow label="Order ID" value={orderInfo.confirmationId ?? "—"} />
              <InfoRow label="Submitted" value={formatDate(orderInfo.createdAt)} />
            </div>
          </div>
        )}

        {/* Dog info (from pets array) */}
        {pets.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-extrabold text-amber-700 uppercase tracking-widest mb-3">Service Dog Information</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="bg-amber-50">
                    {["Dog Name", "Type", "Age", "Breed", "Weight"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-amber-700 uppercase tracking-wider border-b border-amber-100">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pets.map((pet, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2.5 text-gray-900 font-semibold border-b border-gray-100">{pet.name || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.type || "Dog"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.age ? `${pet.age} yr${pet.age !== "1" ? "s" : ""}` : "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.breed || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.weight ? `${pet.weight} lbs` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── PSD Badge Summary ──────────────────────────────────────────────── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-xl flex-shrink-0">
            <i className="ri-service-line text-amber-600 text-lg"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold text-amber-900">Psychiatric Service Dog (PSD) Evaluation</p>
            <p className="text-xs text-amber-700">ADA-compliant assessment — dog must perform at least one specific task</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 px-3 py-1 bg-amber-600 text-white rounded-full text-xs font-extrabold flex-shrink-0">
            <i className="ri-service-fill" style={{ fontSize: "10px" }}></i>PSD
          </span>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-amber-700">
          <span className="flex items-center gap-1">
            <i className="ri-shield-check-line"></i>
            <strong>{dogTasks.length}</strong> task{dogTasks.length !== 1 ? "s" : ""} reported
          </span>
          <span className="flex items-center gap-1">
            <i className="ri-heart-pulse-line"></i>
            <strong>{conditions.length}</strong> condition{conditions.length !== 1 ? "s" : ""} reported
          </span>
        </div>
      </div>

      {/* ── Section 1 — Dog Tasks ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
            <i className="ri-checkbox-multiple-line text-amber-600 text-sm"></i>
          </div>
          <div>
            <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Q1 — Dog Tasks Performed</p>
            <p className="text-xs text-gray-400 mt-0.5">ADA requires at least 1 trained task directly related to disability</p>
          </div>
          {dogTasks.length > 0 ? (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-extrabold">
              <i className="ri-check-line"></i>{dogTasks.length} selected
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-extrabold">
              <i className="ri-close-line"></i>None selected
            </span>
          )}
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALL_DOG_TASKS.map((task) => {
            const selected = dogTasks.includes(task);
            return (
              <div
                key={task}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-xs font-semibold ${
                  selected
                    ? "bg-amber-50 border-amber-300 text-amber-800"
                    : "bg-gray-50 border-gray-100 text-gray-400"
                }`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 ${selected ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                  {selected && <i className="ri-check-line text-white leading-none" style={{ fontSize: "11px" }}></i>}
                </div>
                {task}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2 — Training & Duration ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
            <i className="ri-time-line text-[#1a5c4f] text-sm"></i>
          </div>
          <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Training &amp; Duration</p>
        </div>
        <div className="px-5 py-1">
          <AnswerRow label="Training method" value={TASK_TRAINING_LABELS[a.taskTraining ?? ""] ?? a.taskTraining} />
          <AnswerRow label="Duration with dog" value={DURATION_LABELS[a.dogDuration ?? ""] ?? a.dogDuration} />
        </div>
      </div>

      {/* ── Section 3 — Mental Health ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-violet-100 rounded-lg flex-shrink-0">
            <i className="ri-heart-pulse-line text-violet-600 text-sm"></i>
          </div>
          <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Mental Health Information</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">Conditions experienced</p>
            {conditions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {conditions.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 border border-violet-200 rounded-full text-xs font-semibold text-violet-700">
                    <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>{c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No conditions reported</p>
            )}
          </div>
          <div className="border-t border-gray-50 pt-3 space-y-0">
            <AnswerRow label="Emotional frequency" value={FREQ_LABELS[a.emotionalFrequency ?? ""] ?? a.emotionalFrequency} />
            <AnswerRow label="Life change stress" value={LIFE_CHANGE_LABELS[a.lifeChangeStress ?? ""] ?? a.lifeChangeStress} />
            <AnswerRow label="Daily impact" value={FREQ_LABELS[a.dailyImpact ?? ""] ?? a.dailyImpact} />
            <AnswerRow label="Medication" value={MEDICATION_LABELS[a.medication ?? ""] ?? a.medication} />
            {a.medicationDetails && <AnswerRow label="Medication details" value={a.medicationDetails} accent="text-gray-700" />}
            <AnswerRow label="Prior diagnosis" value={DIAGNOSIS_LABELS[a.priorDiagnosis ?? ""] ?? a.priorDiagnosis} />
            {a.specificDiagnosis && <AnswerRow label="Specific diagnosis" value={a.specificDiagnosis} accent="text-violet-700" />}
            <AnswerRow label="Current treatment" value={TREATMENT_LABELS[a.currentTreatment ?? ""] ?? a.currentTreatment} />
            {a.treatmentDetails && <AnswerRow label="Treatment details" value={a.treatmentDetails} accent="text-gray-700" />}
          </div>
        </div>
      </div>

      {/* ── Section 4 — How the dog helps ─────────────────────────────────── */}
      {a.dogHelpDescription && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
              <i className="ri-message-3-line text-orange-600 text-sm"></i>
            </div>
            <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">How the Dog Helps — Patient&apos;s Own Words</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-gray-700 leading-relaxed italic bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
              &ldquo;{a.dogHelpDescription}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* ── Section 5 — Housing ───────────────────────────────────────────── */}
      {a.housingType && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-sky-100 rounded-lg flex-shrink-0">
              <i className="ri-home-line text-sky-600 text-sm"></i>
            </div>
            <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Housing Type</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-gray-800">{HOUSING_LABELS[a.housingType] ?? a.housingType}</p>
          </div>
        </div>
      )}

      {/* ── ADA Provider Checklist ─────────────────────────────────────────── */}
      <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
            <i className="ri-shield-check-line text-[#1a5c4f] text-sm"></i>
          </div>
          <p className="text-xs font-extrabold text-[#1a5c4f] uppercase tracking-wider">Provider ADA Eligibility Checklist</p>
        </div>
        <div className="space-y-2.5">
          {[
            {
              label: "Dog performs at least 1 specific trained task",
              pass: dogTasks.length > 0,
              note: dogTasks.length > 0 ? `${dogTasks.length} task${dogTasks.length !== 1 ? "s" : ""} reported` : "No tasks reported — does not meet ADA requirement",
            },
            {
              label: "Patient has a disability that substantially limits major life activity",
              pass: conditions.length > 0 || !!a.specificDiagnosis,
              note: conditions.length > 0 ? `${conditions.length} condition${conditions.length !== 1 ? "s" : ""} reported` : "No conditions or diagnosis disclosed",
            },
            {
              label: "Tasks are directly related to the patient's disability",
              pass: !!a.dogHelpDescription && a.dogHelpDescription.trim().length > 20,
              note: a.dogHelpDescription ? "Patient provided description of therapeutic relationship" : "No description provided",
            },
            {
              label: "Dog is trained (not in early training stages)",
              pass: a.taskTraining !== "in_training",
              note: TASK_TRAINING_LABELS[a.taskTraining ?? ""] ?? "Training status not provided",
            },
          ].map((item) => (
            <div key={item.label} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${item.pass ? "bg-[#e8f5f1] border-[#b8ddd5]" : "bg-red-50 border-red-200"}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5 ${item.pass ? "bg-[#1a5c4f]" : "bg-red-500"}`}>
                <i className={`${item.pass ? "ri-check-line" : "ri-close-line"} text-white leading-none`} style={{ fontSize: "11px" }}></i>
              </div>
              <div>
                <p className={`text-xs font-bold ${item.pass ? "text-[#1a5c4f]" : "text-red-700"}`}>{item.label}</p>
                <p className={`text-xs mt-0.5 ${item.pass ? "text-[#1a5c4f]/70" : "text-red-600"}`}>{item.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#1a5c4f]/60 mt-3 flex items-center gap-1">
          <i className="ri-information-line"></i>
          This checklist is a guide for the provider. Final eligibility determination is at the licensed professional&apos;s discretion.
        </p>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-2 text-center">
        <p className="text-xs text-gray-400">PawTenant &bull; Secure PSD Consultation Support &bull; pawtenant.com</p>
        <p className="text-xs text-gray-400 mt-1">This document is confidential and intended solely for licensed professionals reviewing this case.</p>
      </div>

    </div>
  );
}
