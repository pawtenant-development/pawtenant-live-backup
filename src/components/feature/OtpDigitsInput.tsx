// OtpDigitsInput — accessible 6-box numeric code input. Handles typing,
// paste of a full 6-digit code, backspace navigation, and arrow keys. Calls
// onChange with the concatenated value and onComplete when all 6 are filled.

import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

const LEN = 6;

export default function OtpDigitsInput({ value, onChange, onComplete, disabled, error, autoFocus }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(LEN, " ").slice(0, LEN).split("").map((c) => (c === " " ? "" : c));

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setAt = (idx: number, char: string) => {
    const next = digits.slice();
    next[idx] = char;
    const joined = next.join("").replace(/\s/g, "");
    onChange(joined);
    if (joined.length === LEN && onComplete) onComplete(joined);
  };

  const handleChange = (idx: number, raw: string) => {
    const only = raw.replace(/\D/g, "");
    if (!only) { setAt(idx, ""); return; }
    if (only.length > 1) {
      // Paste / fast type — distribute across boxes from this index.
      const chars = only.slice(0, LEN - idx).split("");
      const next = digits.slice();
      chars.forEach((c, i) => { next[idx + i] = c; });
      const joined = next.join("").replace(/\s/g, "");
      onChange(joined);
      const focusIdx = Math.min(idx + chars.length, LEN - 1);
      refs.current[focusIdx]?.focus();
      if (joined.length === LEN && onComplete) onComplete(joined);
      return;
    }
    setAt(idx, only);
    if (idx < LEN - 1) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < LEN - 1) {
      refs.current[idx + 1]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" role="group" aria-label="6-digit verification code">
      {Array.from({ length: LEN }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { refs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digits[idx]}
          disabled={disabled}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          aria-label={`Digit ${idx + 1}`}
          className={`w-11 h-14 sm:w-12 sm:h-15 text-center text-xl font-extrabold rounded-xl border-2 transition-colors focus:outline-none ${
            error
              ? "border-red-300 bg-red-50 text-red-700 focus:border-red-400"
              : "border-gray-200 bg-white text-gray-900 focus:border-[#1A5C4F]"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        />
      ))}
    </div>
  );
}
