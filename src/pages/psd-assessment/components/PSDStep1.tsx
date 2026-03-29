import { useState } from "react";

export interface PSDStep1Data {
  dogTasks: string[];
  taskTraining: string;
  dogDuration: string;
  emotionalFrequency: string;
  conditions: string[];
  lifeChangeStress: string;
  dailyImpact: string;
  medication: string;
  medicationDetails: string;
  priorDiagnosis: string;
  specificDiagnosis: string;
  currentTreatment: string;
  treatmentDetails: string;
  dogHelpDescription: string;
  housingType: string;
}

interface Props {
  data: PSDStep1Data;
  onChange: (data: PSDStep1Data) => void;
  onNext: () => void;
}

const DOG_TASKS = [
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

const CONDITIONS = [
  "PTSD or trauma-related stress",
  "Anxiety or constant worry",
  "Depression or persistent low mood",
  "Panic attacks",
  "ADHD or difficulty focusing",
  "Bipolar disorder",
  "Obsessive-compulsive behaviors",
  "Phobias or specific fears",
  "Social isolation or loneliness",
  "Adjustment disorder or situational stress",
  "Difficulty sleeping or insomnia",
  "Emotional dysregulation",
];

const FREQ_OPTIONS = [
  { label: "Rarely — a few times a month", value: "rarely" },
  { label: "Sometimes — a few times a week", value: "sometimes" },
  { label: "Often — most days", value: "often" },
  { label: "Almost always — daily or near-daily", value: "daily" },
];

function RadioGroup({ name, value, options, onChange }: { name: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${value === opt.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-700 hover:border-orange-300"}`}
          aria-label={`${name}: ${opt.label}`}>
          <span className="flex items-start gap-2">
            <span className={`w-4 h-4 flex-shrink-0 mt-0.5 rounded-full border-2 flex items-center justify-center ${value === opt.value ? "border-orange-500 bg-orange-500" : "border-gray-300"}`}>
              {value === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-white block"></span>}
            </span>
            <span>{opt.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CheckboxGroup({ values, options, onChange }: { values: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const checked = values.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${checked ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-700 hover:border-orange-300"}`}>
            <span className="flex items-center gap-2">
              <span className={`w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border-2 ${checked ? "border-orange-500 bg-orange-500" : "border-gray-300"}`}>
                {checked && <i className="ri-check-line text-white text-xs leading-none"></i>}
              </span>
              {opt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QCard({ number, question, hint, required, hasError, children }: { number: number; question: string; hint?: string; required?: boolean; hasError?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bg-white rounded-xl border p-6 transition-all ${hasError ? "border-red-300 ring-2 ring-red-200" : "border-gray-200"}`}>
      <p className="text-sm font-bold text-gray-900 mb-1">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold mr-2">{number}</span>
        {question}{required && <span className="text-orange-500 ml-1">*</span>}
      </p>
      {hint && <p className="text-xs text-gray-400 mb-4 ml-8">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </div>
  );
}

export default function PSDStep1({ data, onChange, onNext }: Props) {
  const [errors, setErrors] = useState<string[]>([]);

  const update = (field: keyof PSDStep1Data, val: string | string[]) => onChange({ ...data, [field]: val });
  const updateMulti = (fields: Partial<PSDStep1Data>) => onChange({ ...data, ...fields });

  const showDiagText = data.priorDiagnosis === "yes" || data.priorDiagnosis === "informal";

  const REQUIRED: Array<{ key: keyof PSDStep1Data; check: () => boolean }> = [
    { key: "dogTasks",           check: () => data.dogTasks.length > 0 },
    { key: "taskTraining",       check: () => !!data.taskTraining },
    { key: "dogDuration",        check: () => !!data.dogDuration },
    { key: "emotionalFrequency", check: () => !!data.emotionalFrequency },
    { key: "conditions",         check: () => data.conditions.length > 0 },
    { key: "lifeChangeStress",   check: () => !!data.lifeChangeStress },
    { key: "dailyImpact",        check: () => !!data.dailyImpact },
    { key: "medication",         check: () => !!data.medication },
    { key: "priorDiagnosis",     check: () => !!data.priorDiagnosis },
    { key: "currentTreatment",   check: () => !!data.currentTreatment },
    { key: "dogHelpDescription", check: () => data.dogHelpDescription.trim().length >= 10 },
    { key: "housingType",        check: () => !!data.housingType },
  ];

  const answered = REQUIRED.filter((f) => f.check()).length;
  const total = REQUIRED.length;
  const pct = Math.round((answered / total) * 100);

  const validate = () => {
    const missing = REQUIRED.filter((f) => !f.check()).map((f) => f.key as string);
    setErrors(missing);
    return missing.length === 0;
  };

  const hasErr = (k: string) => errors.includes(k);

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">Psychiatric Service Dog Assessment</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
          This confidential screening helps a licensed provider evaluate your eligibility for a PSD letter. Under the ADA, your dog must perform specific tasks. All answers are HIPAA protected.
        </p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 mb-6 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-gray-700">
              {answered === 0 ? "Answer each question to continue" : answered < total ? `${answered} of ${total} questions answered` : "All questions answered — ready to continue!"}
            </span>
            <span className={`text-xs font-bold ${pct === 100 ? "text-green-500" : "text-orange-500"}`}>{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-orange-500"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
        </div>
        <div className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full ${pct === 100 ? "bg-green-100" : "bg-orange-50"}`}>
          {pct === 100 ? <i className="ri-checkbox-circle-fill text-green-500 text-lg"></i> : <span className={`text-sm font-extrabold ${answered > 0 ? "text-orange-500" : "text-gray-400"}`}>{answered}/{total}</span>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-5 py-4 text-sm text-red-700 flex items-center gap-2">
          <i className="ri-error-warning-line text-base"></i>
          Please answer all required questions before continuing.
        </div>
      )}

      <div className="space-y-5">

        {/* Q1 — Dog tasks */}
        <QCard number={1} question="What specific tasks does your dog perform to help with your disability?" hint="Select all that apply — your dog must perform at least one task (ADA requirement)" required hasError={hasErr("dogTasks")}>
          <CheckboxGroup values={data.dogTasks} options={DOG_TASKS} onChange={(v) => update("dogTasks", v)} />
        </QCard>

        {/* Q2 — Training */}
        <QCard number={2} question="How were these tasks trained?" required hasError={hasErr("taskTraining")}>
          <RadioGroup name="taskTraining" value={data.taskTraining} onChange={(v) => update("taskTraining", v)} options={[
            { label: "Professionally trained by a certified trainer", value: "professional" },
            { label: "Owner-trained (self-trained with the dog)", value: "owner_trained" },
            { label: "Mix of professional and owner training", value: "mixed" },
            { label: "Currently in training", value: "in_training" },
          ]} />
        </QCard>

        {/* Q3 — Duration with dog */}
        <QCard number={3} question="How long has your dog been performing these tasks for you?" required hasError={hasErr("dogDuration")}>
          <RadioGroup name="dogDuration" value={data.dogDuration} onChange={(v) => update("dogDuration", v)} options={[
            { label: "Less than 6 months", value: "lt6months" },
            { label: "6–12 months", value: "6to12months" },
            { label: "1–2 years", value: "1to2years" },
            { label: "More than 2 years", value: "gt2years" },
          ]} />
        </QCard>

        {/* Q4 — Emotional frequency */}
        <QCard number={4} question="How often do you experience emotional distress, anxiety, or depression?" required hasError={hasErr("emotionalFrequency")}>
          <RadioGroup name="emotionalFrequency" value={data.emotionalFrequency} onChange={(v) => update("emotionalFrequency", v)} options={FREQ_OPTIONS} />
        </QCard>

        {/* Q5 — Conditions */}
        <QCard number={5} question="Which of the following do you currently experience? (Select all that apply)" required hasError={hasErr("conditions")}>
          <CheckboxGroup values={data.conditions} options={CONDITIONS} onChange={(v) => update("conditions", v)} />
        </QCard>

        {/* Q6 — Life change */}
        <QCard number={6} question="Have you experienced a major life change or transition that is impacting your mental health?" hint="e.g., moving, divorce, job loss, illness, grief, trauma" required hasError={hasErr("lifeChangeStress")}>
          <RadioGroup name="lifeChangeStress" value={data.lifeChangeStress} onChange={(v) => update("lifeChangeStress", v)} options={[
            { label: "Yes — currently going through a major life change", value: "yes_current" },
            { label: "Yes — recently went through one and still adjusting", value: "yes_recent" },
            { label: "Not significantly — my situation feels generally stable", value: "no" },
          ]} />
        </QCard>

        {/* Q7 — Daily impact */}
        <QCard number={7} question="How often do your symptoms interfere with your daily life, work, or responsibilities?" required hasError={hasErr("dailyImpact")}>
          <RadioGroup name="dailyImpact" value={data.dailyImpact} onChange={(v) => update("dailyImpact", v)} options={FREQ_OPTIONS} />
        </QCard>

        {/* Q8 — Medication */}
        <QCard number={8} question="Are you currently taking any prescribed medication for a mental health condition?" required hasError={hasErr("medication")}>
          <RadioGroup name="medication" value={data.medication} onChange={(v) => updateMulti({ medication: v, ...(v === "never" ? { medicationDetails: "" } : {}) })} options={[
            { label: "Yes, currently prescribed and taking", value: "yes_taking" },
            { label: "Yes, prescribed but not currently taking", value: "yes_not_taking" },
            { label: "Previously prescribed, no longer taking", value: "previous" },
            { label: "No, never prescribed", value: "never" },
          ]} />
          {data.medication && data.medication !== "never" && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">If comfortable, please list the medication(s) <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={data.medicationDetails} onChange={(e) => update("medicationDetails", e.target.value)}
                placeholder="e.g., Sertraline (Zoloft), Escitalopram (Lexapro)..." className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-400 transition-colors" />
            </div>
          )}
        </QCard>

        {/* Q9 — Prior diagnosis */}
        <QCard number={9} question="Have you previously received a mental health diagnosis from a licensed professional?" required hasError={hasErr("priorDiagnosis")}>
          <RadioGroup name="priorDiagnosis" value={data.priorDiagnosis} onChange={(v) => updateMulti({ priorDiagnosis: v, ...(v === "no" || v === "prefer_not" ? { specificDiagnosis: "" } : {}) })} options={[
            { label: "Yes, I have a formal diagnosis", value: "yes" },
            { label: "I have been told I may have a condition, but not formally diagnosed", value: "informal" },
            { label: "No, I have never been evaluated", value: "no" },
            { label: "I prefer not to say", value: "prefer_not" },
          ]} />
          {showDiagText && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">If comfortable, please share your specific diagnosis <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={data.specificDiagnosis} onChange={(e) => update("specificDiagnosis", e.target.value)}
                placeholder="e.g., PTSD, Generalized Anxiety Disorder, Bipolar II..." className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-400 transition-colors" />
            </div>
          )}
        </QCard>

        {/* Q10 — Current treatment */}
        <QCard number={10} question="Are you currently receiving mental health treatment or therapy?" required hasError={hasErr("currentTreatment")}>
          <RadioGroup name="currentTreatment" value={data.currentTreatment} onChange={(v) => updateMulti({ currentTreatment: v, ...(v === "none" || v === "considering" ? { treatmentDetails: "" } : {}) })} options={[
            { label: "Yes, I am actively in treatment", value: "active" },
            { label: "Previously received treatment", value: "previous" },
            { label: "No, but I am considering it", value: "considering" },
            { label: "No treatment at this time", value: "none" },
          ]} />
          {(data.currentTreatment === "active" || data.currentTreatment === "previous") && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Please describe your current or past treatment <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={data.treatmentDetails} onChange={(e) => update("treatmentDetails", e.target.value)}
                placeholder="e.g., Weekly individual therapy, EMDR for PTSD..." className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-400 transition-colors" />
            </div>
          )}
        </QCard>

        {/* Q11 — Open-ended: how dog helps */}
        <QCard number={11} question="In your own words, describe how your dog helps you manage your disability and daily life." hint="This is reviewed confidentially by your provider to understand the therapeutic relationship between you and your dog." required hasError={hasErr("dogHelpDescription")}>
          <textarea value={data.dogHelpDescription} onChange={(e) => update("dogHelpDescription", e.target.value)}
            placeholder="For example: My dog Buddy interrupts my panic attacks by putting his paws on my lap, which brings me back to the present moment. Without him, I am unable to leave my apartment..." rows={5} maxLength={1000}
            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-colors resize-none ${hasErr("dogHelpDescription") ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-orange-400"}`} />
          <div className="flex items-center justify-between mt-1.5">
            {data.dogHelpDescription.trim().length > 0 && data.dogHelpDescription.trim().length < 10
              ? <span className="text-xs text-red-500">Please write at least a few words.</span>
              : <span className="text-xs text-gray-400">Your response is confidential and only visible to your assigned provider.</span>}
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{data.dogHelpDescription.length}/1000</span>
          </div>
        </QCard>

        {/* Q12 — Housing */}
        <QCard number={12} question="What type of housing do you currently live in?" required hasError={hasErr("housingType")}>
          <RadioGroup name="housingType" value={data.housingType} onChange={(v) => update("housingType", v)} options={[
            { label: "Apartment with a no-pet policy", value: "apt_nopet" },
            { label: "Condo or townhouse", value: "condo" },
            { label: "Renting a house", value: "house_rent" },
            { label: "College dorm or on-campus housing", value: "dorm" },
            { label: "Currently looking for housing", value: "looking" },
          ]} />
        </QCard>

      </div>

      <div className="mt-8 flex flex-col sm:flex-row sm:justify-end">
        <button type="button" onClick={() => { if (validate()) onNext(); else window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="whitespace-nowrap w-full sm:w-auto inline-flex items-center justify-center gap-2 px-10 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer">
          Continue to Your Information
          <i className="ri-arrow-right-line"></i>
        </button>
      </div>
    </div>
  );
}
