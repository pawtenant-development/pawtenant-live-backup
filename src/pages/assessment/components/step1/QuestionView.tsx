// Step 1 v2 — single-question renderer.
//
// Pure presentational. Given a QuestionDef + the current Step1Data + an
// onUpdate callback, renders the appropriate primitive (RadioGroup,
// CheckboxGroup, textarea) inside the shared QuestionCard. Conditional
// follow-up text fields (Q8 medicationDetails, Q9 specificDiagnosis,
// Q10 treatmentDetails) render inline within the same card, matching the
// legacy long-form behavior exactly.

import type { Step1Data } from "../Step1Assessment";
import { CheckboxGroup, QuestionCard, RadioGroup } from "./primitives";
import type { QuestionDef } from "./QuestionManifest";

interface QuestionViewProps {
  def: QuestionDef;
  data: Step1Data;
  onUpdate: (patch: Partial<Step1Data>) => void;
  hasError: boolean;
}

export function QuestionView({ def, data, onUpdate, hasError }: QuestionViewProps) {
  if (def.kind === "radio") {
    const value = (data[def.id] as string) ?? "";
    return (
      <QuestionCard
        number={def.number}
        question={def.question}
        required={def.required}
        hint={def.hint}
        hasError={hasError}
      >
        <RadioGroup
          name={def.id as string}
          value={value}
          options={def.options}
          onChange={(v) => onUpdate({ [def.id]: v } as Partial<Step1Data>)}
        />
      </QuestionCard>
    );
  }

  if (def.kind === "checkbox") {
    const values = (data[def.id] as string[]) ?? [];
    return (
      <QuestionCard
        number={def.number}
        question={def.question}
        required={def.required}
        hint={def.hint}
        hasError={hasError}
      >
        <CheckboxGroup
          values={values}
          options={def.options}
          onChange={(v) => onUpdate({ [def.id]: v } as Partial<Step1Data>)}
        />
      </QuestionCard>
    );
  }

  if (def.kind === "radio+text") {
    const value = (data[def.id] as string) ?? "";
    const condValue = (data[def.conditionalField] as string) ?? "";
    const showConditional = def.showWhen(value);
    return (
      <QuestionCard
        number={def.number}
        question={def.question}
        required={def.required}
        hint={def.hint}
        hasError={hasError}
      >
        <RadioGroup
          name={def.id as string}
          value={value}
          options={def.options}
          onChange={(v) => {
            const patch: Partial<Step1Data> = { [def.id]: v } as Partial<Step1Data>;
            if (def.clearWhen(v)) {
              (patch as Record<string, string>)[def.conditionalField] = "";
            }
            onUpdate(patch);
          }}
        />
        {showConditional && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {def.conditionalLabel} <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={condValue}
              onChange={(e) =>
                onUpdate({ [def.conditionalField]: e.target.value } as Partial<Step1Data>)
              }
              placeholder={def.conditionalPlaceholder}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#F97316] transition-colors"
            />
          </div>
        )}
      </QuestionCard>
    );
  }

  // textarea (symptomDescription)
  const value = data.symptomDescription ?? "";
  return (
    <QuestionCard
      number={def.number}
      question={def.question}
      required={def.required}
      hint={def.hint}
      hasError={hasError}
    >
      <textarea
        value={value}
        onChange={(e) => onUpdate({ symptomDescription: e.target.value })}
        placeholder="For example: I have been dealing with persistent anxiety for the past year. I find it hard to sleep and often feel overwhelmed in social situations. My dog helps me stay calm and feel grounded..."
        rows={5}
        maxLength={def.maxLen}
        className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-colors resize-none ${
          hasError ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#F97316]"
        }`}
      />
      <div className="flex items-center justify-between mt-1.5 gap-2">
        {value.trim().length > 0 && value.trim().length < def.minLen ? (
          <span className="text-xs text-red-500">
            Please write at least a few words to describe your experience.
          </span>
        ) : (
          <span className="text-xs text-gray-400">
            Your response is confidential and only visible to your assigned provider.
          </span>
        )}
        <span
          className={`text-xs font-semibold ml-2 flex-shrink-0 ${
            value.length === 0
              ? "text-gray-400"
              : value.trim().length < def.minLen
                ? "text-red-500"
                : value.length >= 950
                  ? "text-amber-600"
                  : "text-emerald-600"
          }`}
          aria-live="polite"
        >
          {value.trim().length < def.minLen
            ? `${value.length} / ${def.maxLen} · ${def.minLen} min`
            : `${value.length} / ${def.maxLen}`}
        </span>
      </div>
    </QuestionCard>
  );
}
