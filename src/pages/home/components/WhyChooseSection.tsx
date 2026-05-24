/*
 * 2026-05-24 visual storytelling pass v2.
 *
 * Tightened from 6 icon+paragraph cards to 6 compact icon+tagline rows
 * (single-line descs). Stats panel kept as the visual anchor. The
 * Landlord-Verifiable highlight card and main CTA preserved. Reduces
 * vertical text-wall feel without removing any unique points.
 */

const reasons = [
  {
    icon: "ri-flashlight-line",
    color: "bg-orange-100 text-orange-500",
    title: "Fast Processing",
    tag: "Same-day or next-day delivery.",
  },
  {
    icon: "ri-award-line",
    color: "bg-amber-100 text-amber-700",
    title: "Licensed Professionals",
    tag: "State-licensed clinicians review every assessment.",
  },
  {
    icon: "ri-lock-2-line",
    color: "bg-orange-100 text-orange-500",
    title: "Secure & Confidential",
    tag: "HIPAA-compliant data handling.",
  },
  {
    icon: "ri-customer-service-2-line",
    color: "bg-amber-100 text-amber-700",
    title: "Trusted Service",
    tag: "4.9★ from 15,000+ pet owners.",
  },
  {
    icon: "ri-map-2-line",
    color: "bg-orange-100 text-orange-500",
    title: "Nationwide Coverage",
    tag: "Compliant letters in all 50 states.",
  },
  {
    icon: "ri-money-dollar-circle-line",
    color: "bg-amber-100 text-amber-700",
    title: "Transparent Pricing",
    tag: "No hidden fees — refund if not approved.",
  },
];

const stats = [
  { value: "15,000+", label: "Letters Issued" },
  { value: "4.9★", label: "Customer Rating" },
  { value: "50", label: "States Covered" },
  { value: "24hr", label: "Avg. Delivery" },
];

export default function WhyChooseSection() {
  return (
    <section className="py-14 sm:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <p className="text-orange-500 text-[12px] sm:text-sm font-semibold tracking-widest uppercase mb-2">Our Advantage</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Why Choose <span className="text-orange-500">PawTenant</span> for Your ESA Letter?
          </h2>
          <p className="text-gray-500 mt-3 text-[14px] sm:text-sm leading-relaxed">
            The most reliable, <strong>legit ESA letter online</strong> service — affordable, fast, backed by licensed clinicians.
          </p>
        </div>

        {/* Stats Row — visual anchor */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-10 sm:mb-14 bg-orange-50 rounded-2xl p-5 sm:p-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-extrabold text-orange-500">{s.value}</p>
              <p className="text-gray-600 text-[12px] sm:text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Compact reasons — single-line taglines instead of paragraphs.
            Reads as a quick benefit-roll-up; no text walls. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {reasons.map((r) => (
            <div key={r.title} className="flex items-center gap-3 p-4 sm:p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-orange-200 transition-colors">
              <div className={`w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0 ${r.color}`}>
                <i className={`${r.icon} text-lg`}></i>
              </div>
              <div className="min-w-0">
                <h3 className="text-gray-900 font-bold text-[13.5px] sm:text-[14px] leading-snug">{r.title}</h3>
                <p className="text-gray-500 text-[12.5px] sm:text-[13px] leading-snug mt-0.5">{r.tag}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Verification highlight card — centered below the grid. Kept
            as it surfaces the strongest differentiator. */}
        <div className="flex justify-center mt-5 sm:mt-6">
          <a
            href="/esa-letter-verification"
            className="flex items-start gap-4 p-5 bg-[#FFF7ED] rounded-xl border border-orange-200 hover:border-orange-400 transition-colors cursor-pointer group w-full max-w-md"
          >
            <div className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 bg-[#92400e] text-white">
              <i className="ri-shield-check-line text-xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-gray-900 font-bold text-[13.5px] sm:text-sm group-hover:text-[#92400e] transition-colors">Landlord-Verifiable Letters</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#92400e] bg-orange-100 px-2 py-0.5 rounded-full whitespace-nowrap">Unique</span>
              </div>
              <p className="text-gray-500 text-[12.5px] sm:text-[13px] leading-relaxed">Unique Verification ID on every letter — landlords confirm in seconds.</p>
              <span className="inline-flex items-center gap-1 text-[11.5px] sm:text-xs font-semibold text-[#92400e] mt-2 group-hover:underline">
                How it works <i className="ri-arrow-right-line text-xs"></i>
              </span>
            </div>
          </a>
        </div>

        <div className="text-center mt-10 sm:mt-12">
          <a
            href="#pricing"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.30)] sm:shadow-none"
          >
            Get Your ESA Letter Today
            <i className="ri-arrow-right-line"></i>
          </a>
          <p className="text-gray-400 text-[11.5px] sm:text-xs mt-3">
            Trusted by 15,000+ pet owners — the fastest way to get a <strong className="text-gray-600">legitimate ESA letter online</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
