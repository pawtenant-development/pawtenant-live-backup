const reasons = [
  {
    icon: "ri-flashlight-line",
    color: "bg-orange-100 text-orange-500",
    title: "Fast Processing",
    desc: "Same-day or next-day ESA letter delivery for most applicants.",
    link: null,
  },
  {
    icon: "ri-award-line",
    color: "bg-amber-100 text-amber-700",
    title: "Licensed Professionals",
    desc: "All evaluations are conducted by state-licensed mental health professionals.",
    link: null,
  },
  {
    icon: "ri-lock-2-line",
    color: "bg-orange-100 text-orange-500",
    title: "Secure &amp; Confidential",
    desc: "Your data is fully protected with HIPAA-compliant security protocols.",
    link: null,
  },
  {
    icon: "ri-customer-service-2-line",
    color: "bg-amber-100 text-amber-700",
    title: "Trusted Service",
    desc: "Thousands of satisfied customers with a 4.9-star average rating.",
    link: null,
  },
  {
    icon: "ri-map-2-line",
    color: "bg-orange-100 text-orange-500",
    title: "Nationwide Coverage",
    desc: "We serve clients in all 50 states with state-specific compliant letters.",
    link: null,
  },
  {
    icon: "ri-money-dollar-circle-line",
    color: "bg-amber-100 text-amber-700",
    title: "Transparent Pricing",
    desc: "No hidden fees or surprise charges — what you see is what you pay.",
    link: null,
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
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-2">Our Advantage</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Why Choose <span className="text-orange-500">PawTenant</span> for Your Legitimate ESA Letter?
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
            We are committed to providing the most reliable, <strong>legit ESA letter online</strong> service — affordable, fast, and backed by licensed professionals.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-14 bg-orange-50 rounded-2xl p-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-orange-500">{s.value}</p>
              <p className="text-gray-600 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Reasons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((r) => (
            <div key={r.title} className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl border border-gray-100">
              <div className={`w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 ${r.color}`}>
                <i className={`${r.icon} text-xl`}></i>
              </div>
              <div>
                <h3 className="text-gray-900 font-bold text-sm mb-1" dangerouslySetInnerHTML={{ __html: r.title }} />
                <p className="text-gray-500 text-sm leading-relaxed">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Verification highlight card — centered below the grid */}
        <div className="flex justify-center mt-6">
          <a
            href="/esa-letter-verification"
            className="flex items-start gap-4 p-5 bg-[#FFF7ED] rounded-xl border border-orange-200 hover:border-orange-400 transition-colors cursor-pointer group w-full max-w-md"
          >
            <div className="w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 bg-[#92400e] text-white">
              <i className="ri-shield-check-line text-xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-gray-900 font-bold text-sm group-hover:text-[#92400e] transition-colors">Landlord-Verifiable Letters</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#92400e] bg-orange-100 px-2 py-0.5 rounded-full whitespace-nowrap">Unique</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">Every letter includes a QR code &amp; Verification ID — landlords confirm authenticity in seconds.</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#92400e] mt-2 group-hover:underline">
                How it works <i className="ri-arrow-right-line text-xs"></i>
              </span>
            </div>
          </a>
        </div>

        <div className="text-center mt-12">
          <a
            href="#pricing"
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Get Your Legit ESA Letter Today
            <i className="ri-arrow-right-line"></i>
          </a>
          <p className="text-gray-400 text-xs mt-3">
            Trusted by 15,000+ pet owners — the fastest way to get a <strong className="text-gray-600">legitimate ESA letter online</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
