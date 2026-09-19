// Step 1 shared visual primitives.
//
// Extracted from Step1Assessment.tsx so both the legacy long-form path and
// the v2 one-question-at-a-time path can reuse identical visuals.
//
// ASSESSMENT-PRESENTATION-TRUST-001 (2026-08-21): v2 now renders a focused,
// centered, large-target presentation. The legacy v1 long-form path is the
// documented `?step1=v1` rollback and MUST keep its previous compact look, so
// the new presentation is opt-in via `variant="focus"` / `size="large"`. Every
// default in this file reproduces the pre-change v1 rendering exactly.
//
// Accessibility (both variants):
//   • RadioGroup is a real radiogroup — role=radiogroup + role=radio, arrow-key
//     navigation with a roving tabindex, Home/End, and aria-checked reflecting
//     the STORED answer (so the highlight can never disagree with the state).
//   • CheckboxGroup exposes role=checkbox + aria-checked per option.
//   • The question text labels the group via aria-labelledby.

import { useId, useRef, type ReactNode } from "react";

type Size = "default" | "large";
type Variant = "default" | "focus";

/* ── v2 answer-option states (ASSESSMENT-PRESENTATION-TRUST-002) ─────────────
 * Owner asked for a subtly shaded unselected option instead of pure white, with
 * the selected state still immediately distinguishable.
 *
 * Unselected uses a COOL slate tint (#F8FAFC / slate-50) and selected a WARM
 * orange tint (#FFEDD5 / orange-100). The two suggested unselected values were
 * #FFF9F5 and #F8FAFC; the warm one was rejected because it sits ~2 channel
 * steps from the selected orange and the states stop reading apart at a glance.
 * Cool-vs-warm keeps them separable even for a colour-blind viewer, and the
 * filled radio dot + border weight carry the state independently of hue.
 *
 * Contrast (WCAG AA, normal text needs 4.5:1):
 *   unselected  #334155 on #F8FAFC  ≈ 10.7:1
 *   selected    #9A3412 on #FFEDD5  ≈  6.6:1
 * These constants are v2-only — the `default` size below is the ?step1=v1
 * rollback rendering and must keep its original pure-white look.
 * ───────────────────────────────────────────────────────────────────────── */
const UNSELECTED_OPTION_CLASSES =
  "border-slate-200 bg-[#F8FAFC] text-slate-700 hover:border-[#F97316]/60 hover:bg-[#FFF7ED]";
const SELECTED_OPTION_CLASSES =
  "border-[#F97316] bg-[#FFEDD5] text-[#9A3412] shadow-[0_2px_10px_-4px_rgba(249,115,22,0.45)]";

// ── RadioGroup ───────────────────────────────────────────────────────────────

interface RadioGroupProps {
  name: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  size?: Size;
  /** id of the element that labels this group (the question text). */
  labelledBy?: string;
}

export function RadioGroup({ name, value, options, onChange, size = "default", labelledBy }: RadioGroupProps) {
  const large = size === "large";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  // Roving tabindex: the selected option is the tab stop; with nothing selected
  // the first option is, so the group is always reachable in one Tab press.
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        move(index, 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        move(index, -1);
        break;
      case "Home":
        e.preventDefault();
        onChange(options[0].value);
        refs.current[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        onChange(options[options.length - 1].value);
        refs.current[options.length - 1]?.focus();
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={
        large
          ? "grid grid-cols-1 gap-3"
          : "grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-2"
      }
    >
      {options.map((opt, index) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={
              large
                ? `text-left px-5 py-4 min-h-[60px] rounded-xl border-2 text-[15px] font-semibold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 ${
                    selected
                      ? SELECTED_OPTION_CLASSES
                      : UNSELECTED_OPTION_CLASSES
                  }`
                : `text-left px-4 py-3.5 sm:py-3 min-h-[52px] sm:min-h-0 rounded-lg border-2 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 ${
                    selected
                      ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316]"
                      : "border-gray-200 bg-white text-gray-700 hover:border-[#F97316]/60 hover:bg-[#FFF7ED]/50"
                  }`
            }
            aria-label={`${name}: ${opt.label}`}
          >
            <span className={large ? "flex items-center gap-3" : "flex items-start gap-2"}>
              <span
                className={
                  large
                    ? `w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selected ? "border-[#F97316] bg-[#F97316]" : "border-slate-300"
                      }`
                    : `w-4 h-4 flex-shrink-0 mt-0.5 rounded-full border-2 flex items-center justify-center ${
                        selected ? "border-[#F97316] bg-[#F97316]" : "border-gray-300"
                      }`
                }
                aria-hidden="true"
              >
                {selected && (
                  <span className={`${large ? "w-2 h-2" : "w-1.5 h-1.5"} rounded-full bg-white block`}></span>
                )}
              </span>
              <span className="break-words min-w-0">{opt.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── CheckboxGroup ────────────────────────────────────────────────────────────

interface CheckboxGroupProps {
  values: string[];
  options: string[];
  onChange: (vals: string[]) => void;
  size?: Size;
  labelledBy?: string;
}

export function CheckboxGroup({ values, options, onChange, size = "default", labelledBy }: CheckboxGroupProps) {
  const large = size === "large";
  const toggle = (opt: string) => {
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  };
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={
        large
          ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5"
          : "grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-2"
      }
    >
      {options.map((opt) => {
        const checked = values.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => toggle(opt)}
            className={
              large
                ? `text-left px-4 py-3.5 min-h-[56px] rounded-xl border-2 text-[14px] font-semibold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 ${
                    checked
                      ? SELECTED_OPTION_CLASSES
                      : UNSELECTED_OPTION_CLASSES
                  }`
                : `text-left px-4 py-3.5 sm:py-3 min-h-[52px] sm:min-h-0 rounded-lg border-2 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 ${
                    checked
                      ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316]"
                      : "border-gray-200 bg-white text-gray-700 hover:border-[#F97316]/60 hover:bg-[#FFF7ED]/50"
                  }`
            }
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`${large ? "w-5 h-5" : "w-4 h-4"} flex-shrink-0 rounded flex items-center justify-center border-2 ${
                  checked ? "border-[#F97316] bg-[#F97316]" : large ? "border-slate-300" : "border-gray-300"
                }`}
                aria-hidden="true"
              >
                {checked && <i className="ri-check-line text-white text-xs leading-none"></i>}
              </span>
              <span className="break-words min-w-0">{opt}</span>
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
  /** Body. Optional when `renderWithLabelId` is supplied instead. */
  children?: ReactNode;
  variant?: Variant;
  /** Short plain-language explanation of why the question is asked. */
  context?: string;
  /** Receives the id of the question text so a group can be labelled by it. */
  renderWithLabelId?: (labelId: string) => ReactNode;
}

export function QuestionCard({
  number,
  question,
  required,
  hint,
  hasError,
  children,
  variant = "default",
  context,
  renderWithLabelId,
}: QuestionCardProps) {
  const labelId = useId();
  const focus = variant === "focus";
  const body = renderWithLabelId ? renderWithLabelId(labelId) : children;

  if (focus) {
    return (
      <div
        className={`bg-white rounded-2xl border p-5 sm:p-8 transition-all ${
          hasError ? "border-red-300 ring-2 ring-red-200" : "border-slate-200"
        }`}
      >
        <div className="text-center max-w-xl mx-auto">
          <h3
            id={labelId}
            className="text-[19px] sm:text-[22px] font-extrabold leading-snug text-slate-900 text-balance"
          >
            {question}
            {required && <span className="text-[#F97316] ml-1" aria-hidden="true">*</span>}
          </h3>
          {hint && <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{hint}</p>}
          {context && (
            <p className="mt-3 inline-flex items-start gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-left text-[12px] leading-relaxed text-slate-600">
              <i className="ri-information-line mt-[1px] flex-shrink-0 text-slate-400" aria-hidden="true"></i>
              <span>{context}</span>
            </p>
          )}
        </div>
        <div className="mt-6 max-w-xl mx-auto">{body}</div>
        {hasError && (
          <p
            className="mt-4 text-center text-[13px] font-semibold text-red-600 flex items-center justify-center gap-1.5"
            role="alert"
          >
            <i className="ri-error-warning-line flex-shrink-0" aria-hidden="true"></i>
            Please answer this question to continue.
          </p>
        )}
      </div>
    );
  }

  // Legacy v1 rendering — unchanged.
  return (
    <div className={`bg-white rounded-xl border p-4 sm:p-6 transition-all ${hasError ? "border-red-300 ring-2 ring-red-200" : "border-gray-200"}`}>
      <p id={labelId} className="text-sm font-bold text-gray-900 mb-1 leading-snug">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F97316] text-white text-xs font-bold mr-2 flex-shrink-0">
          {number}
        </span>
        {question}
        {required && <span className="text-[#F97316] ml-1">*</span>}
      </p>
      {hint && <p className="text-xs text-gray-400 mb-3 sm:mb-4 ml-8">{hint}</p>}
      {!hint && <div className="mb-3 sm:mb-4" />}
      {body}
      {hasError && (
        <p className="mt-3 text-xs font-semibold text-red-600 flex items-center gap-1.5" role="alert">
          <i className="ri-error-warning-line flex-shrink-0"></i>
          Please answer this question to continue.
        </p>
      )}
    </div>
  );
}
