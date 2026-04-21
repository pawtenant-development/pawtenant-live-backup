interface StepIndicatorProps {
  currentStep: number;
  answeredInStep1?: number;
  totalInStep1?: number;
}

const STEPS = [
  {
    label: "Assessment",
    mobileLabel: "Assessment",
    icon: "ri-mental-health-line",
    time: "~2 min",
    completedIcon: "ri-checkbox-circle-fill",
  },
  {
    label: "Your Info",
    mobileLabel: "Info",
    icon: "ri-user-line",
    time: "~1 min",
    completedIcon: "ri-checkbox-circle-fill",
  },
  {
    label: "Checkout",
    mobileLabel: "Pay",
    icon: "ri-secure-payment-line",
    time: "~1 min",
    completedIcon: "ri-checkbox-circle-fill",
  },
];

function getProgressPercent(
  currentStep: number,
  answeredInStep1: number,
  totalInStep1: number
): number {
  if (currentStep === 1) {
    return Math.round((answeredInStep1 / totalInStep1) * 30);
  }
  if (currentStep === 2) return 42;
  if (currentStep === 3) return 78;
  return 100;
}

function getMotivationalCopy(
  currentStep: number,
  answered: number,
  total: number
): { headline: string; sub: string } {
  if (currentStep === 1) {
    if (answered === 0)
      return {
        headline: "Check if you qualify for an ESA letter in 2 minutes",
        sub: "Answer honestly — this confidential screening takes about 2 minutes.",
      };
    if (answered < 5)
      return {
        headline: "Good start, keep going!",
        sub: `${answered} of ${total} questions answered — almost there.`,
      };
    if (answered < 10)
      return {
        headline: "You're doing great!",
        sub: `${answered} of ${total} answered — most people qualify.`,
      };
    return {
      headline: "Almost finished with your assessment!",
      sub: `${answered} of ${total} answered — just a few more to go.`,
    };
  }
  if (currentStep === 2)
    return {
      headline: "You likely qualify — let's personalize your letter",
      sub: "We just need a few personal details. Takes about 1 minute.",
    };
  return {
    headline: "Last step — your ESA letter is minutes away!",
    sub: "Choose your provider and complete your secure payment.",
  };
}

export default function StepIndicator({
  currentStep,
  answeredInStep1 = 0,
  totalInStep1 = 12,
}: StepIndicatorProps) {
  const progress = getProgressPercent(currentStep, answeredInStep1, totalInStep1);
  const { headline, sub } = getMotivationalCopy(currentStep, answeredInStep1, totalInStep1);

  return (
    <div className="w-full mb-2">
      {/* Motivational headline */}
      <div className="text-center mb-3 sm:mb-4">
        <p className="text-sm sm:text-base font-bold text-gray-900 mb-0.5 sm:mb-1 px-2">{headline}</p>

      </div>

      {/* Step pills */}
      <div className="flex items-center justify-center mb-3 sm:mb-4">
        {STEPS.map((step, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={step.label} className="flex items-center">
              {/* Step */}
              <div className="flex flex-col items-center gap-1 sm:gap-1.5">
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isCompleted
                      ? "bg-[#F97316] border-[#F97316] text-white"
                      : isActive
                      ? "bg-white border-[#F97316] text-[#F97316]"
                      : "bg-white border-gray-200 text-gray-400"
                  }`}
                >
                  {isCompleted ? (
                    <i className="ri-check-line text-base font-bold"></i>
                  ) : (
                    <i className={`${step.icon} text-sm sm:text-base`}></i>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  {/* Mobile uses shorter label */}
                  <span
                    className={`text-xs font-bold leading-tight ${
                      isActive
                        ? "text-[#F97316]"
                        : isCompleted
                        ? "text-gray-700"
                        : "text-gray-400"
                    }`}
                  >
                    <span className="sm:hidden">{step.mobileLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                  <span
                    className={`text-xs leading-none mt-0.5 ${
                      isActive ? "text-[#F97316]" : "text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <span className="text-green-500 font-semibold text-xs">Done ✓</span>
                    ) : (
                      <span className="hidden sm:inline">{step.time}</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <div className="mx-2 sm:mx-3 md:mx-5 mb-4 sm:mb-5 flex-shrink-0">
                  <div className="w-8 sm:w-12 md:w-16 h-0.5 bg-gray-200 relative overflow-hidden rounded-full">
                    <div
                      className="absolute inset-y-0 left-0 bg-[#F97316] transition-all duration-500"
                      style={{ width: stepNum < currentStep ? "100%" : "0%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <div className="bg-gray-100 rounded-full h-2 sm:h-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#F97316] to-[#EA580C] rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-gray-400">Step {currentStep} of 3</span>
        <span className="text-xs font-bold text-[#F97316]">{progress}% complete</span>
      </div>
    </div>
  );
}
