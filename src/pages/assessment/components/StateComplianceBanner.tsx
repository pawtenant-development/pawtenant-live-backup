// State-specific compliance banner — shown when the user has selected a state
// that legally requires a client-provider relationship / waiting period before
// an ESA letter can be issued.
//
// Scope: ESA flow only (Step 2 state selection + Step 3 checkout).
// Trigger states: AR, CA, IA, LA, MT.

export const COMPLIANCE_STATES = ["AR", "CA", "IA", "LA", "MT"] as const;

export function isComplianceState(code?: string | null): boolean {
  if (!code) return false;
  return (COMPLIANCE_STATES as readonly string[]).includes(code.toUpperCase());
}

interface StateComplianceBannerProps {
  state: string;
  className?: string;
}

export default function StateComplianceBanner({ state, className = "" }: StateComplianceBannerProps) {
  if (!isComplianceState(state)) return null;

  return (
    <div
      role="note"
      aria-label="State law notice"
      className={`bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex items-start gap-3 ${className}`}
    >
      <div className="w-9 h-9 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5 ring-1 ring-amber-200">
        <i className="ri-shield-star-line text-amber-700 text-base"></i>
      </div>
      <div className="min-w-0 text-amber-900">
        <p className="text-sm font-bold leading-snug">Important State Law Notice</p>
        <p className="text-xs mt-1.5 leading-relaxed text-amber-900/90">
          Your selected state requires a <strong>client-provider relationship period</strong> before
          ESA documentation can be issued. This means your licensed provider may need to complete the
          legally required relationship/evaluation period before issuing your final ESA letter.
        </p>
        {state.toUpperCase() === "CA" ? (
          <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
            For <strong>California residents</strong>, state law requires at least a{" "}
            <strong>30-day client-provider relationship</strong> before ESA documentation can be issued.
          </p>
        ) : (
          <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
            Your selected state may require a <strong>client-provider relationship</strong> or{" "}
            <strong>waiting period</strong> before ESA documentation can be issued.
          </p>
        )}
        <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
          By continuing, you understand that your final ESA documentation may not be issued immediately
          and will only be provided if legally permitted and clinically appropriate.
        </p>
      </div>
    </div>
  );
}
