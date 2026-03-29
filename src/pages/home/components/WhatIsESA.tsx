const benefits = [
  "Provides emotional support for anxiety, depression, PTSD, and other mental health conditions",
  "Legally protected under the Fair Housing Act for housing accommodations",
  "Allows you to live with your pet in no-pet housing without extra fees",
  "Prescribed by licensed mental health professionals",
  "Not the same as a service animal — no special training required",
  "Can be any domesticated animal, not just dogs",
];

export default function WhatIsESA() {
  return (
    <section className="py-20 bg-[#1a5c4f]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <div className="rounded-2xl overflow-hidden h-96 lg:h-auto">
            <img
              src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/13037e49-5dee-4f4b-ae8a-c2d1ab78b6d5_What-Is-an-Emotional-Support-Animal-ESA.jpg?v=f7097c36da8144b17b45b9d7d5a1d06f"
              alt="What is an emotional support animal ESA — licensed LMHP letter for mental health housing rights"
              className="w-full h-full object-cover object-top"
            />
          </div>

          {/* Content */}
          <div>
            <p className="text-orange-400 text-sm font-semibold tracking-widest uppercase mb-3">Understanding ESAs</p>
            <h2 className="text-3xl font-extrabold text-white mb-5">
              What Is an Emotional Support Animal (ESA)?
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-6">
              An Emotional Support Animal (ESA) is a companion animal that provides therapeutic benefit to its owner through affection and companionship. Unlike service animals, ESAs do not need specialized training. Their presence alone provides significant mental health benefits for people struggling with emotional or psychological conditions.
            </p>
            <p className="text-gray-300 text-sm leading-relaxed mb-8">
              With a valid ESA letter signed by a licensed mental health professional, you gain legal protections allowing you to live with your emotional support animal even in no-pet housing — without additional pet fees.
            </p>

            <ul className="space-y-3 mb-8">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-gray-200">
                  <div className="w-5 h-5 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-orange-400 text-lg"></i>
                  </div>
                  {b}
                </li>
              ))}
            </ul>

            <a
              href="#pricing"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Learn More &amp; Get Started
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
