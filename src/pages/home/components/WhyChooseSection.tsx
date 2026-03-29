const reasons = [
  {
    icon: "ri-flashlight-line",
    color: "bg-orange-100 text-orange-500",
    title: "Fast Processing",
    desc: "Same-day or next-day ESA letter delivery for most applicants.",
  },
  {
    icon: "ri-award-line",
    color: "bg-teal-100 text-teal-600",
    title: "Licensed Professionals",
    desc: "All evaluations are conducted by state-licensed mental health professionals.",
  },
  {
    icon: "ri-lock-2-line",
    color: "bg-orange-100 text-orange-500",
    title: "Secure &amp; Confidential",
    desc: "Your data is fully protected with HIPAA-compliant security protocols.",
  },
  {
    icon: "ri-customer-service-2-line",
    color: "bg-teal-100 text-teal-600",
    title: "Trusted Service",
    desc: "Thousands of satisfied customers with a 4.9-star average rating.",
  },
  {
    icon: "ri-map-2-line",
    color: "bg-orange-100 text-orange-500",
    title: "Nationwide Coverage",
    desc: "We serve clients in all 50 states with state-specific compliant letters.",
  },
  {
    icon: "ri-money-dollar-circle-line",
    color: "bg-teal-100 text-teal-600",
    title: "Transparent Pricing",
    desc: "No hidden fees or surprise charges — what you see is what you pay.",
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
            Why Choose <span className="text-orange-500">PawTenant</span> for Your ESA Letter?
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
            We are committed to providing the most reliable, legitimate, and affordable ESA letter service available.
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

        <div className="text-center mt-12">
          <a
            href="#pricing"
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Get Your ESA Letter Today
            <i className="ri-arrow-right-line"></i>
          </a>
        </div>
      </div>
    </section>
  );
}
