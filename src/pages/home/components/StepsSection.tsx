import { useAttributionParams } from "@/hooks/useAttributionParams";

const steps = [
  {
    number: "01",
    icon: "ri-file-list-3-line",
    title: "Complete the Assessment Form",
    desc: "Fill out our quick, confidential online questionnaire about your mental health and need for emotional support. It takes less than 5 minutes.",
  },
  {
    number: "02",
    icon: "ri-stethoscope-line",
    title: "Professional Evaluation",
    desc: "A licensed mental health professional reviews your assessment and conducts a thorough evaluation to determine ESA eligibility.",
  },
  {
    number: "03",
    icon: "ri-mail-check-line",
    title: "Receive Your ESA Letter",
    desc: "Once approved, your official ESA letter is sent directly to your inbox — ready to present to landlords or housing providers.",
  },
];

export default function StepsSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="how-it-works" className="py-20 bg-orange-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-2">Simple Process</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Get Your <span className="text-orange-500">Legit ESA Letter</span> in 3 Simple Steps
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
            Our streamlined process makes it easy to get a <strong>legitimate ESA letter online</strong> — no waiting rooms, no in-person visits, no stress.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector lines - desktop only */}
          <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-0.5 bg-orange-200 z-0"></div>

          {steps.map((step, idx) => (
            <div key={step.number} className="relative z-10 flex flex-col items-center text-center">
              {/* Step number badge */}
              <div className="relative mb-6">
                <div className="w-20 h-20 flex items-center justify-center bg-white rounded-full border-2 border-orange-200">
                  <i className={`${step.icon} text-3xl text-orange-500`}></i>
                </div>
                <span className="absolute -top-2 -right-2 w-7 h-7 flex items-center justify-center bg-orange-500 text-white text-xs font-bold rounded-full">
                  {idx + 1}
                </span>
              </div>
              <h3 className="text-gray-900 font-bold text-base mb-3">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-xs">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href={withAttribution("/assessment")}
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Start Your Legitimate ESA Letter Online
            <i className="ri-arrow-right-line"></i>
          </a>
        </div>
      </div>
    </section>
  );
}
