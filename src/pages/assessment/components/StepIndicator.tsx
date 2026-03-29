interface StepIndicatorProps {
  currentStep: number;
  answeredInStep1?: number;
  totalInStep1?: number;
}

const STEPS = [
  {
    label: "Assessment",
    icon: "ri-mental-health-line",
    time: "~2 min",
    completedIcon: "ri-checkbox-circle-fill",
  },
  {
    label: "Your Info",
    icon: "ri-user-line",
    time: "~1 min",
    completedIcon: "ri-checkbox-circle-fill",
  },
  {
    label: "Checkout",
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
    // 0% → 30% as questions get answered in step 1
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
        headline: "Let's find out if you qualify",
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
      <div className="text-center mb-4">
        <p className="text-base font-bold text-gray-900 mb-1">{headline}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>

      {/* Step pills */}
      <div className="flex items-center justify-center mb-4">
        {STEPS.map((step, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={step.label} className="flex items-center">
              {/* Step */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isCompleted
                      ? "bg-orange-500 border-orange-500 text-white"
                      : isActive
                      ? "bg-white border-orange-500 text-orange-500"
                      : "bg-white border-gray-200 text-gray-400"
                  }`}
                >
                  {isCompleted ? (
                    <i className="ri-check-line text-lg font-bold"></i>
                  ) : (
                    <i className={`${step.icon} text-base`}></i>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <span
                    className={`text-xs font-bold leading-tight ${
                      isActive
                        ? "text-orange-500"
                        : isCompleted
                        ? "text-gray-700"
                        : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span
                    className={`text-xs leading-none mt-0.5 ${
                      isActive ? "text-orange-400" : "text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <span className="text-green-500 font-semibold">Done</span>
                    ) : (
                      step.time
                    )}
                  </span>
                </div>
              </div>

              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <div className="mx-3 sm:mx-5 mb-5 flex-shrink-0">
                  <div className="w-12 sm:w-16 h-0.5 bg-gray-200 relative overflow-hidden rounded-full">
                    <div
                      className="absolute inset-y-0 left-0 bg-orange-500 transition-all duration-500"
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
      <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-gray-400">Step {currentStep} of 3</span>
        <span className="text-xs font-bold text-orange-500">{progress}% complete</span>
      </div>
    </div>
  );
}
