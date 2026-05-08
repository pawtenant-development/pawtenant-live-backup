import { useAttributionParams } from "@/hooks/useAttributionParams";

export default function CTASection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section className="relative py-24 overflow-hidden bg-gradient-to-br from-[#7c2d12] via-[#92400e] to-[#b45309]">
      {/* Subtle decorative glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-orange-500/15 rounded-full blur-3xl"></div>
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
