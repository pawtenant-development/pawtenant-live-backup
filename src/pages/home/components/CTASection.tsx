import { useAttributionParams } from "@/hooks/useAttributionParams";

export default function CTASection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="https://readdy.ai/api/search-image?query=cozy%20home%20interior%20with%20warm%20afternoon%20sunlight%20coming%20through%20windows%2C%20a%20dog%20resting%20on%20a%20comfortable%20sofa%2C%20peaceful%20and%20inviting%20atmosphere%2C%20warm%20tones%20amber%20and%20cream%2C%20soft%20bokeh%20background%2C%20lifestyle%20home%20photography&width=1440&height=500&seq=cta001&orientation=landscape"
          alt="Still have questions about ESA letters"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-[#78350f]/85"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <p className="text-orange-400 text-sm font-semibold tracking-widest uppercase mb-3">Ready to Get Started?</p>
        <h2 className="text-4xl font-extrabold text-white mb-5">
          Get Your <span className="text-orange-400">Legit ESA Letter Online</span> &amp; Keep Your Pet by Your Side
        </h2>
        <p className="text-gray-300 text-base max-w-xl mx-auto mb-10">
          Our team of licensed professionals is ready to issue your <strong className="text-white">legitimate ESA letter online</strong> — quickly, affordably, and 100% legally compliant with the Fair Housing Act.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href={withAttribution("/assessment")}
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-4 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Get My Legit ESA Letter Now
            <i className="ri-arrow-right-line"></i>
          </a>
          <a
            href="tel:+14099655885"
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-4 border-2 border-white/50 text-white font-semibold text-sm rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          >
            <i className="ri-phone-line"></i>
            (409) 965-5885
          </a>
        </div>
      </div>
    </section>
  );
}
