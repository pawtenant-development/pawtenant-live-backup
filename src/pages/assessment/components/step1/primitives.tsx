// Step 1 shared visual primitives.
//
// Extracted from Step1Assessment.tsx so both the legacy long-form path and
// the v2 one-question-at-a-time path can reuse identical visuals.
// Behavior, styling, and accessibility match the originals byte-for-byte
// (post-Phase-1 mobile tap-target sizes + inline error helper kept intact).

import type { ReactNode } from "react";

// ── RadioGroup ───────────────────────────────────────────────────────────────

interface RadioGroupProps {
  name: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
}

export function RadioGroup({ name, value, options, onChange }: RadioGroupProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-left px-4 py-3.5 sm:py-3 min-h-[52px] sm:min-h-0 rounded-lg border-2 text-sm font-medium transition-all duration-150 cursor-pointer ${
            value === opt.value
              ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316]"
              : "border-gray-200 bg-white text-gray-700 hover:border-[#F97316]/60 hover:bg-[#FFF7ED]/50"
          }`}
          aria-pressed={value === opt.value}
          aria-label={`${name}: ${opt.label}`}
        >
          <span className="flex items-start gap-2">
            <span
              className={`w-4 h-4 flex-shrink-0 mt-0.5 rounded-full border-2 flex items-center justify-center ${
                value === opt.value ? "border-[#F97316] bg-[#F97316]" : "border-gray-300"
              }`}
            >
              {value === opt.value && (
                <span className="w-1.5 h-1.5 rounded-full bg-white block"></span>
              )}
            </span>
            <span className="break-words">{opt.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── CheckboxGroup ────────────────────────────────────────────────────────────

interface CheckboxGroupProps {
  values: string[];
  options: string[];
  onChange: (vals: string[]) => void;
}

export function CheckboxGroup({ values, options, onChange }: CheckboxGroupProps) {
  const toggle = (opt: string) => {
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-2">
      {options.map((opt) => {
        const checked = values.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`text-left px-4 py-3.5 sm:py-3 min-h-[52px] sm:min-h-0 rounded-lg border-2 text-sm font-medium transition-all duration-150 cursor-pointer ${
              checked
                ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316]"
                : "border-gray-200 bg-white text-gray-700 hover:border-[#F97316]/60 hover:bg-[#FFF7ED]/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border-2 ${
                  checked ? "border-[#F97316] bg-[#F97316]" : "border-gray-300"
                }`}
              >
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

// ── QuestionCard ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  number: number;
  question: string;
  required?: boolean;
  hint?: string;
  hasError?: boolean;
  children: ReactNode;
}

export function QuestionCard({ number, question, required, hint, hasError, children }: QuestionCardProps) {
  return (
    <div className={`bg-white rounded-xl border p-4 sm:p-6 transition-all ${hasError ? "border-red-300 ring-2 ring-red-200" : "border-gray-200"}`}>
      <p className="text-sm font-bold text-gray-900 mb-1 leading-snug">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F97316] text-white text-xs font-bold mr-2 flex-shrink-0">
          {number}
        </span>
        {question}
        {required && <span className="text-[#F97316] ml-1">*</span>}
      </p>
      {hint && <p className="text-xs text-gray-400 mb-3 sm:mb-4 ml-8">{hint}</p>}
      {!hint && <div className="mb-3 sm:mb-4" />}
      {children}
      {hasError && (
        <p className="mt-3 text-xs font-semibold text-red-600 flex items-center gap-1.5" role="alert">
          <i className="ri-error-warning-line flex-shrink-0"></i>
          Please answer this question to continue.
        </p>
      )}
    </div>
  );
}
