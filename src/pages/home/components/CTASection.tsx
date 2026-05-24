import { useAttributionParams } from "@/hooks/useAttributionParams";

export default function CTASection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden bg-gradient-to-br from-[#7a3a26] via-[#9c5239] to-[#b87053]">
      {/* Subtle decorative glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-400/15 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 text-center">
        <p className="text-orange-400 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3">Ready to Get Started?</p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-4 sm:mb-5 leading-tight">
          Get Your <span className="text-orange-400">ESA Letter Online</span> &amp; Keep Your Pet by Your Side
        </h2>
        <p className="text-gray-300 text-[14.5px] sm:text-base max-w-xl mx-auto mb-7 sm:mb-10 leading-relaxed">
          Our team of licensed professionals is ready to issue your <strong className="text-white">ESA letter online</strong> — quickly, affordably, and 100% legally compliant with the Fair Housing Act.
        </p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-3 sm:gap-4 max-w-md sm:max-w-none mx-auto">
          <a
            href={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-400 text-white font-bold text-sm rounded-md hover:bg-orange-500 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(251,146,60,0.30)] sm:shadow-none"
          >
            Get My ESA Letter Now
            <i className="ri-arrow-right-line"></i>
          </a>
          <a
            href="tel:+14099655885"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/50 text-white font-semibold text-sm rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          >
            <i className="ri-phone-line"></i>
            (409) 965-5885
          </a>
        </div>
      </div>
    </section>
  );
}
