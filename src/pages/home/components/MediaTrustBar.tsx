export default function MediaTrustBar() {
  return (
    <section className="bg-white border-b border-gray-100 py-5 sm:py-6">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        {/* Mobile-first: 2x2 grid at narrow widths so each badge gets a
            comfortable tap-row, switches to single inline row on tablet+. */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center gap-3 sm:gap-6">
          {[
            { icon: "ri-shield-check-fill", label: "HIPAA Compliant", color: "text-emerald-700" },
            { icon: "ri-award-fill", label: "Licensed Professionals", color: "text-orange-600" },
            { icon: "ri-verified-badge-fill", label: "BBB Accredited", color: "text-amber-600" },
            { icon: "ri-lock-fill", label: "SSL Encrypted", color: "text-gray-700" },
          ].map((badge) => (
            <div key={badge.label} className="flex items-center justify-center sm:justify-start gap-1.5">
              <div className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${badge.color}`}>
                <i className={`${badge.icon} text-sm`}></i>
              </div>
              <span className="text-[11.5px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
