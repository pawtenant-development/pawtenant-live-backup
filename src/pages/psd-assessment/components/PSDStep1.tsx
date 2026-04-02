import { useState } from "react";

export interface PSDStep1Data {
  dogTasks: string[];
  taskTraining: string;
  taskDescription: string;
  taskReliability: string;
  taskPublicAccess: string;
  taskEvidenceUrl: string;
  taskEvidenceType: string;
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
    { key: "taskDescription",    check: () => data.taskDescription.trim().length >= 15 },
    { key: "taskReliability",    check: () => !!data.taskReliability },
    { key: "taskPublicAccess",   check: () => !!data.taskPublicAccess },
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

        {/* Q3 — Task description (ADA trained task detail) */}
        <QCard number={3} question="Describe exactly how your dog performs each task — step by step." hint="ADA requires tasks to be specifically trained behaviors, not just comfort or presence. Be as specific as possible." required hasError={hasErr("taskDescription")}>
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <i className="ri-information-line text-amber-500 text-base flex-shrink-0 mt-0.5"></i>
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>ADA standard:</strong> A psychiatric service dog must be trained to perform a specific task that directly mitigates your disability. General comfort, companionship, or emotional support alone does not qualify under the ADA.
            </p>
          </div>
          <textarea
            value={data.taskDescription}
            onChange={(e) => update("taskDescription", e.target.value)}
            placeholder={`Example: When I begin to show signs of a panic attack (rapid breathing, pacing), my dog Bella nudges my hand with her nose, then places her front paws on my lap and applies pressure until my breathing slows. She was trained to recognize these cues over 6 months of task-specific training.`}
            rows={6}
            maxLength={1200}
            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-colors resize-none ${hasErr("taskDescription") ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-orange-400"}`}
          />
          <div className="flex items-center justify-between mt-1.5">
            {data.taskDescription.trim().length > 0 && data.taskDescription.trim().length < 15
              ? <span className="text-xs text-red-500">Please describe the task in more detail.</span>
              : <span className="text-xs text-gray-400">Your provider will use this to verify ADA task eligibility.</span>}
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{data.taskDescription.length}/1200</span>
          </div>
        </QCard>

        {/* Q4 — Task reliability */}
        <QCard number={4} question="How reliably does your dog perform these tasks on cue or when needed?" required hasError={hasErr("taskReliability")}>
          <RadioGroup name="taskReliability" value={data.taskReliability} onChange={(v) => update("taskReliability", v)} options={[
            { label: "Very reliably — performs the task consistently every time", value: "very_reliable" },
            { label: "Mostly reliably — performs the task most of the time", value: "mostly_reliable" },
            { label: "Sometimes — still learning, performs inconsistently", value: "inconsistent" },
            { label: "Still in early training — not yet reliable", value: "in_training" },
          ]} />
        </QCard>

        {/* Q5 — Public access behavior */}
        <QCard number={5} question="Is your dog able to accompany you in public spaces (stores, restaurants, transit) without disruptive behavior?" hint="ADA-covered PSDs must be under control and not pose a direct threat in public settings" required hasError={hasErr("taskPublicAccess")}>
          <RadioGroup name="taskPublicAccess" value={data.taskPublicAccess} onChange={(v) => update("taskPublicAccess", v)} options={[
            { label: "Yes — well-behaved and under control in public", value: "yes" },
            { label: "Mostly — minor issues but generally manageable", value: "mostly" },
            { label: "Working on it — still training for public access", value: "training" },
            { label: "No — not yet ready for public access", value: "no" },
          ]} />
        </QCard>

        {/* Q6 — Task Training Evidence (optional upload) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-bold text-gray-900 mb-1">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold mr-2">6</span>
            Task Training Evidence
            <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
          </p>
          <p className="text-xs text-gray-400 mb-4 ml-8">Upload a short video or photo of your dog performing the trained task. This helps your provider verify ADA eligibility faster.</p>

          <div className="ml-0 space-y-4">
            {/* Evidence type selector */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "video", icon: "ri-video-line", label: "Short Video", hint: "MP4, MOV, up to 60s" },
                { value: "photo", icon: "ri-image-line", label: "Photo", hint: "JPG, PNG, HEIC" },
                { value: "link", icon: "ri-links-line", label: "Link / URL", hint: "YouTube, Google Drive, etc." },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("taskEvidenceType", data.taskEvidenceType === opt.value ? "" : opt.value)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-xs font-semibold transition-all cursor-pointer ${data.taskEvidenceType === opt.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-500 hover:border-orange-300"}`}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    <i className={`${opt.icon} text-xl`}></i>
                  </div>
                  <span className="font-bold">{opt.label}</span>
                  <span className="text-gray-400 font-normal text-center leading-tight">{opt.hint}</span>
                </button>
              ))}
            </div>

            {/* URL input for link type */}
            {data.taskEvidenceType === "link" && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Paste your link here</label>
                <input
                  type="url"
                  value={data.taskEvidenceUrl}
                  onChange={(e) => update("taskEvidenceUrl", e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://drive.google.com/..."
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-400 transition-colors"
                />
                {data.taskEvidenceUrl && (
                  <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                    <i className="ri-checkbox-circle-fill"></i>Link saved — your provider will be able to view this
                  </p>
                )}
              </div>
            )}

            {/* File upload for video/photo */}
            {(data.taskEvidenceType === "video" || data.taskEvidenceType === "photo") && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  {data.taskEvidenceType === "video" ? "Upload video file" : "Upload photo"}
                  <span className="text-gray-400 font-normal ml-1">
                    {data.taskEvidenceType === "video" ? "(MP4, MOV — max 100MB)" : "(JPG, PNG, HEIC — max 20MB)"}
                  </span>
                </label>
                {data.taskEvidenceUrl ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-2 border-green-300 rounded-lg">
                    <div className="w-8 h-8 flex items-center justify-center bg-green-100 rounded-lg flex-shrink-0">
                      <i className={`${data.taskEvidenceType === "video" ? "ri-video-line" : "ri-image-line"} text-green-600 text-base`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-green-700 truncate">{data.taskEvidenceUrl.split("/").pop()}</p>
                      <p className="text-xs text-green-600">File ready — your provider will review this</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => update("taskEvidenceUrl", "")}
                      className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-green-500 hover:bg-green-100 cursor-pointer transition-colors"
                    >
                      <i className="ri-close-line text-sm"></i>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-all group">
                    <div className="w-10 h-10 flex items-center justify-center bg-gray-100 group-hover:bg-orange-100 rounded-xl transition-colors">
                      <i className={`${data.taskEvidenceType === "video" ? "ri-video-upload-line" : "ri-image-add-line"} text-gray-400 group-hover:text-orange-500 text-xl transition-colors`}></i>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-600 group-hover:text-orange-600 transition-colors">
                        Click to upload {data.taskEvidenceType === "video" ? "video" : "photo"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {data.taskEvidenceType === "video" ? "MP4, MOV up to 100MB" : "JPG, PNG, HEIC up to 20MB"}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept={data.taskEvidenceType === "video" ? "video/mp4,video/quicktime,video/*" : "image/jpeg,image/png,image/heic,image/*"}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // Store filename as placeholder — actual upload would go to Supabase Storage
                        // For now we store the object URL so the provider can see it was attached
                        const objectUrl = URL.createObjectURL(file);
                        update("taskEvidenceUrl", objectUrl);
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <i className="ri-lock-2-line"></i>
                  Your file is encrypted and only visible to your assigned licensed provider.
                </p>
              </div>
            )}

            {/* Skip note */}
            {!data.taskEvidenceType && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                <i className="ri-information-line text-gray-400"></i>
                Skipping this is fine — your written description above is sufficient for evaluation. Evidence just speeds up the review.
              </p>
            )}
          </div>
        </div>

        {/* Q7 — Duration with dog */}
        <QCard number={7} question="How long has your dog been performing these tasks for you?" required hasError={hasErr("dogDuration")}>
          <RadioGroup name="dogDuration" value={data.dogDuration} onChange={(v) => update("dogDuration", v)} options={[
            { label: "Less than 6 months", value: "lt6months" },
            { label: "6–12 months", value: "6to12months" },
            { label: "1–2 years", value: "1to2years" },
            { label: "More than 2 years", value: "gt2years" },
          ]} />
        </QCard>

        {/* Q8 — Emotional frequency */}
        <QCard number={8} question="How often do you experience emotional distress, anxiety, or depression?" required hasError={hasErr("emotionalFrequency")}>
          <RadioGroup name="emotionalFrequency" value={data.emotionalFrequency} onChange={(v) => update("emotionalFrequency", v)} options={FREQ_OPTIONS} />
        </QCard>

        {/* Q9 — Conditions */}
        <QCard number={9} question="Which of the following do you currently experience? (Select all that apply)" required hasError={hasErr("conditions")}>
          <CheckboxGroup values={data.conditions} options={CONDITIONS} onChange={(v) => update("conditions", v)} />
        </QCard>

        {/* Q10 — Life change */}
        <QCard number={10} question="Have you experienced a major life change or transition that is impacting your mental health?" hint="e.g., moving, divorce, job loss, illness, grief, trauma" required hasError={hasErr("lifeChangeStress")}>
          <RadioGroup name="lifeChangeStress" value={data.lifeChangeStress} onChange={(v) => update("lifeChangeStress", v)} options={[
            { label: "Yes — currently going through a major life change", value: "yes_current" },
            { label: "Yes — recently went through one and still adjusting", value: "yes_recent" },
            { label: "Not significantly — my situation feels generally stable", value: "no" },
          ]} />
        </QCard>

        {/* Q11 — Daily impact */}
        <QCard number={11} question="How often do your symptoms interfere with your daily life, work, or responsibilities?" required hasError={hasErr("dailyImpact")}>
          <RadioGroup name="dailyImpact" value={data.dailyImpact} onChange={(v) => update("dailyImpact", v)} options={FREQ_OPTIONS} />
        </QCard>

        {/* Q12 — Medication */}
        <QCard number={12} question="Are you currently taking any prescribed medication for a mental health condition?" required hasError={hasErr("medication")}>
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

        {/* Q13 — Prior diagnosis */}
        <QCard number={13} question="Have you previously received a mental health diagnosis from a licensed professional?" required hasError={hasErr("priorDiagnosis")}>
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

        {/* Q14 — Current treatment */}
        <QCard number={14} question="Are you currently receiving mental health treatment or therapy?" required hasError={hasErr("currentTreatment")}>
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

        {/* Q15 — Open-ended: how dog helps */}
        <QCard number={15} question="In your own words, describe how your dog helps you manage your disability and daily life." hint="This is reviewed confidentially by your provider to understand the therapeutic relationship between you and your dog." required hasError={hasErr("dogHelpDescription")}>
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

        {/* Q16 — Housing */}
        <QCard number={16} question="What type of housing do you currently live in?" required hasError={hasErr("housingType")}>
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
