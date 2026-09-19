// Step 1 v2 — single-question renderer.
//
// Pure presentational. Given a QuestionDef + the current Step1Data + an
// onUpdate callback, renders the appropriate primitive (RadioGroup,
// CheckboxGroup, textarea) inside the shared QuestionCard. Conditional
// follow-up text fields (Q8 medicationDetails, Q9 specificDiagnosis,
// Q10 treatmentDetails) render inline within the same card, matching the
// legacy long-form behavior exactly.
//
// ASSESSMENT-PRESENTATION-TRUST-001: v2 uses the focused presentation —
// centered question, large answer targets, and the question text labelling the
// answer group via renderWithLabelId. The stored answer is the ONLY source of
// the selected style (`value` / `values` below), so a highlight can never
// disagree with what will be submitted. Question ids, option values and the
// `check` predicates are untouched — they live in QuestionManifest.ts.

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
        context={def.context}
        hasError={hasError}
        variant="focus"
        renderWithLabelId={(labelId) => (
          <RadioGroup
            name={def.id as string}
            value={value}
            options={def.options}
            size="large"
            labelledBy={labelId}
            onChange={(v) => onUpdate({ [def.id]: v } as Partial<Step1Data>)}
          />
        )}
      />
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
        context={def.context}
        hasError={hasError}
        variant="focus"
        renderWithLabelId={(labelId) => (
          <CheckboxGroup
            values={values}
            options={def.options}
            size="large"
            labelledBy={labelId}
            onChange={(v) => onUpdate({ [def.id]: v } as Partial<Step1Data>)}
          />
        )}
      />
    );
  }

  // ASSESSMENT-FUNCTIONAL-IMPACT-DETAIL-002 — the frequency radio plus, on the
  // SAME screen, the required "what becomes more difficult" multi-select and an
  // optional short example. No extra screen, and the example never blocks.
  if (def.kind === "radio+impact") {
    const value = (data[def.id] as string) ?? "";
    const areas = (data[def.impactField] as string[]) ?? [];
    const note = (data[def.impactNoteField] as string) ?? "";
    return (
      <QuestionCard
        number={def.number}
        question={def.question}
        required={def.required}
        hint={def.hint}
        context={def.context}
        hasError={hasError}
        variant="focus"
        renderWithLabelId={(labelId) => (
          <>
            <RadioGroup
              name={def.id as string}
              value={value}
              options={def.options}
              size="large"
              labelledBy={labelId}
              onChange={(v) => onUpdate({ [def.id]: v } as Partial<Step1Data>)}
            />

            <div className="mt-6 pt-6 border-t border-slate-100">
              <p id={`impact-${def.impactField}`} className="text-[15px] font-bold text-slate-900 leading-snug">
                {def.impactQuestion}
                <span className="text-[#F97316] ml-1" aria-hidden="true">*</span>
              </p>
              <p className="mt-1 mb-3 text-[12px] text-slate-500">Select everything that applies.</p>
              <CheckboxGroup
                values={areas}
                options={def.impactOptions}
                size="large"
                labelledBy={`impact-${def.impactField}`}
                onChange={(vals) => onUpdate({ [def.impactField]: vals } as Partial<Step1Data>)}
              />

              {/* Conditional on the customer actually reporting an area of
                  difficulty, and ALWAYS optional. */}
              {areas.length > 0 && (
                <div className="mt-4">
                  <label
                    htmlFor={`impact-note-${def.impactNoteField}`}
                    className="block text-xs font-semibold text-slate-600 mb-1.5"
                  >
                    {def.impactNoteLabel}{" "}
                    <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id={`impact-note-${def.impactNoteField}`}
                    value={note}
                    onChange={(e) =>
                      onUpdate({
                        [def.impactNoteField]: e.target.value.slice(0, def.impactNoteMax),
                      } as Partial<Step1Data>)
                    }
                    placeholder={def.impactNotePlaceholder}
                    rows={3}
                    maxLength={def.impactNoteMax}
                    className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F97316] transition-colors resize-none"
                  />
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span className="text-xs text-slate-400">You can leave this blank and continue.</span>
                    <span className="text-xs font-semibold text-slate-400 flex-shrink-0" aria-live="polite">
                      {note.length} / {def.impactNoteMax}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      />
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
        context={def.context}
        hasError={hasError}
        variant="focus"
        renderWithLabelId={(labelId) => (
          <>
            <RadioGroup
              name={def.id as string}
              value={value}
              options={def.options}
              size="large"
              labelledBy={labelId}
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
                <label
                  htmlFor={`cond-${def.conditionalField}`}
                  className="block text-xs font-semibold text-slate-600 mb-1.5"
                >
                  {def.conditionalLabel} <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id={`cond-${def.conditionalField}`}
                  type="text"
                  value={condValue}
                  onChange={(e) =>
                    onUpdate({ [def.conditionalField]: e.target.value } as Partial<Step1Data>)
                  }
                  placeholder={def.conditionalPlaceholder}
                  className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            )}
          </>
        )}
      />
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
      context={def.context}
      hasError={hasError}
      variant="focus"
      renderWithLabelId={(labelId) => (
        <>
          <textarea
            aria-labelledby={labelId}
            value={value}
            onChange={(e) => onUpdate({ symptomDescription: e.target.value })}
            placeholder="For example: I have been dealing with persistent anxiety for the past year. I find it hard to sleep and often feel overwhelmed in social situations. My dog helps me stay calm and feel grounded..."
            rows={5}
            maxLength={def.maxLen}
            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition-colors resize-none ${
              hasError ? "border-red-300 focus:border-red-400" : "border-slate-200 focus:border-[#F97316]"
            }`}
          />
          <div className="flex items-center justify-between mt-1.5 gap-2">
            {value.trim().length > 0 && value.trim().length < def.minLen ? (
              <span className="text-xs text-red-500">
                Please write at least a few words to describe your experience.
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Your response is confidential and only visible to your assigned provider.
              </span>
            )}
            <span
              className={`text-xs font-semibold ml-2 flex-shrink-0 ${
                value.length === 0
                  ? "text-slate-400"
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
        </>
      )}
    />
  );
}
