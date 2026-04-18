import { Link } from "react-router-dom";

interface PrivacySafeVerificationNoteProps {
  /** "inline" = single-line note, "block" = small card */
  variant?: "inline" | "block";
  className?: string;
}

/**
 * Short privacy-safe verification note.
 * Use "inline" for tight spaces (FAQ answers, state page callouts).
 * Use "block" for slightly more prominent placement.
 */
export default function PrivacySafeVerificationNote({
  variant = "inline",
  className = "",
}: PrivacySafeVerificationNoteProps) {
  if (variant === "inline") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-[#2c5282] font-medium ${className}`}>
        <i className="ri-shield-check-line text-xs flex-shrink-0"></i>
        Verification confirms authenticity only — your health information is never disclosed.{" "}
        <Link
          to="/ESA-letter-verification"
          className="font-bold underline hover:no-underline cursor-pointer whitespace-nowrap"
        >
          Learn more
        </Link>
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 ${className}`}>
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
        <i className="ri-eye-off-line text-[#2c5282] text-sm"></i>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-[#2c5282] mb-0.5">Privacy-Safe Verification</p>
        <p className="text-xs text-[#2c5282]/75 leading-relaxed">
          Your finalized letter includes a Verification ID. Landlords can confirm authenticity online — your diagnosis and health details are never shared.{" "}
          <Link
            to="/ESA-letter-verification"
            className="font-bold underline hover:no-underline cursor-pointer"
          >
            See how it works
          </Link>
        </p>
      </div>
    </div>
  );
}
