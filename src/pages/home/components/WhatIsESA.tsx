const benefits = [
  "Provides emotional support for anxiety, depression, PTSD, and other mental health conditions",
  "Legally protected under the Fair Housing Act for housing accommodations",
  "Allows you to live with your pet in no-pet housing without extra fees",
  "Prescribed by licensed mental health professionals",
  "Not the same as a service animal — no special training required",
  "Can be any domesticated animal, not just dogs",
];

const petBreeds = [
  {
    name: "Siberian Husky",
    label: "Dogs",
    img: "https://readdy.ai/api/search-image?query=purebred%20Siberian%20Husky%20dog%20real%20photo%20portrait%20blue%20eyes%20black%20white%20fluffy%20coat%20pointed%20ears%20sitting%20studio%20white%20background%20photorealistic&width=200&height=200&seq=husky-breed-2025x1&orientation=squarish",
  },
  {
    name: "Standard Poodle",
    label: "Dogs",
    img: "https://readdy.ai/api/search-image?query=purebred%20Standard%20Poodle%20dog%20real%20photo%20portrait%20apricot%20curly%20coat%20long%20snout%20intelligent%20eyes%20sitting%20studio%20white%20background%20photorealistic&width=200&height=200&seq=poodle-breed-2025x1&orientation=squarish",
  },
  {
    name: "Pitbull",
    label: "Dogs",
    img: "https://readdy.ai/api/search-image?query=American%20Pitbull%20Terrier%20dog%20real%20photo%20portrait%20brindle%20short%20coat%20blocky%20head%20muscular%20gentle%20brown%20eyes%20happy%20sitting%20studio%20white%20background%20photorealistic&width=200&height=200&seq=pitbull-breed-2025x1&orientation=squarish",
  },
  {
    name: "Tabby Cat",
    label: "Cats",
    img: "https://readdy.ai/api/search-image?query=brown%20tabby%20cat%20real%20photo%20portrait%20M%20marking%20forehead%20striped%20orange%20fur%20green%20eyes%20sitting%20studio%20white%20background%20photorealistic&width=200&height=200&seq=tabby-breed-2025x1&orientation=squarish",
  },
  {
    name: "Golden Retriever",
    label: "Dogs",
    img: "https://readdy.ai/api/search-image?query=purebred%20Golden%20Retriever%20dog%20real%20photo%20portrait%20golden%20wavy%20coat%20warm%20brown%20eyes%20friendly%20face%20tongue%20out%20studio%20light%20background%20photorealistic&width=200&height=200&seq=golden-breed-2025x1&orientation=squarish",
  },
  {
    name: "Persian Cat",
    label: "Cats",
    img: "https://readdy.ai/api/search-image?query=purebred%20Persian%20cat%20real%20photo%20portrait%20long%20silky%20white%20fur%20flat%20face%20copper%20orange%20eyes%20calm%20regal%20studio%20cream%20background%20photorealistic&width=200&height=200&seq=persian-breed-2025x1&orientation=squarish",
  },
];

export default function WhatIsESA() {
  return (
    <section className="py-20 bg-[#f0fdf4]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
          {/* Image */}
          <div className="rounded-2xl overflow-hidden min-h-80">
            <img
              src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/13037e49-5dee-4f4b-ae8a-c2d1ab78b6d5_What-Is-an-Emotional-Support-Animal-ESA.jpg?v=f7097c36da8144b17b45b9d7d5a1d06f"
              alt="What is an emotional support animal ESA — licensed LMHP letter for mental health housing rights"
              className="w-full h-full object-cover object-top"
            />
          </div>

          {/* Content */}
          <div className="flex flex-col">
            <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-3">Understanding ESAs</p>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-5">
              What Is an Emotional Support Animal (ESA)?
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-6">
              An Emotional Support Animal (ESA) is a companion animal that provides therapeutic benefit to its owner through affection and companionship. Unlike service animals, ESAs do not need specialized training. Their presence alone provides significant mental health benefits for people struggling with emotional or psychological conditions.
            </p>
            <p className="text-gray-600 text-sm leading-relaxed mb-8">
              With a valid ESA letter signed by a licensed mental health professional, you gain legal protections allowing you to live with your emotional support animal even in no-pet housing — without additional pet fees.
            </p>

            <ul className="space-y-3 mb-8">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-gray-700">
                  <div className="w-5 h-5 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-orange-500 text-lg"></i>
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

        {/* Any Pet Qualifies strip */}
        <div className="mt-16 pt-12 border-t border-green-100">
          <div className="text-center mb-8">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">All Pets Welcome</span>
            <h3 className="text-xl font-bold text-gray-900">Any Domesticated Animal Can Be an ESA</h3>
            <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
              Dogs, cats, rabbits, birds — if your pet provides emotional comfort, they may qualify. No special training required.
            </p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {petBreeds.map((pet) => (
              <div key={pet.name} className="flex flex-col items-center gap-2 group">
                <div className="w-full aspect-square rounded-2xl overflow-hidden border-2 border-white group-hover:border-orange-300 transition-colors">
                  <img
                    src={pet.img}
                    alt={pet.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{pet.name}</p>
                  <span className="text-xs text-orange-500 font-medium">{pet.label}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">
            <i className="ri-information-line mr-1"></i>
            ESA letters cover dogs, cats, rabbits, birds, hamsters, and other domesticated animals
          </p>
        </div>
      </div>
    </section>
  );
}
