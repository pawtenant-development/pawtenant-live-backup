const TIMELINE = [
  {
    step: "01",
    icon: "ri-file-check-line",
    title: "Assessment Submitted",
    subtitle: "Right now",
    desc: "Your confidential health screening is securely submitted to our licensed network.",
    color: "text-[#1A5C4F]",
    bgColor: "bg-[#E8F1EE]",
    accent: "border-[#CFE2DC]",
  },
  {
    step: "02",
    icon: "ri-stethoscope-line",
    title: "Licensed Provider Reviews",
    subtitle: "Within a few hours",
    desc: "A state-licensed mental health professional evaluates your assessment, reviews your case, and signs your ESA letter.",
    color: "text-amber-500",
    bgColor: "bg-amber-100",
    accent: "border-amber-200",
  },
  {
    step: "03",
    icon: "ri-mail-send-line",
    title: "ESA Letter Emailed to You",
    subtitle: "24 hrs or 2–3 business days",
    desc: "Your official, HIPAA-compliant ESA letter arrives in your inbox — ready to download, print, or forward directly to your landlord.",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    accent: "border-emerald-200",
  },
  {
    step: "04",
    icon: "ri-home-heart-line",
    title: "Present to Housing & Live Freely",
    subtitle: "Same day you receive it",
    desc: "Hand your letter to any landlord or housing provider. Under the Fair Housing Act, they must allow your emotional support animal — no pet deposits, no extra fees.",
    color: "text-[#1A5C4F]",
    bgColor: "bg-[#E8F1EE]",
    accent: "border-[#CFE2DC]",
  },
];

export default function WhatHappensNext() {
  return (
    <div className="mt-14 mb-4">


      {/* Bottom trust note */}
      <div className="text-center mt-6">
        <div className="inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-4 py-2">
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-shield-check-line text-[#1A5C4F]"></i>
          </div>
          Your letter is valid nationwide and legally enforceable under the Fair Housing Act
        </div>
      </div>
    </div>
  );
}
