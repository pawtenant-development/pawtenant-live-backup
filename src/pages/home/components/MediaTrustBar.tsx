export default function MediaTrustBar() {
  return (
    <section className="bg-white border-b border-gray-100 py-6">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-wrap items-center justify-center gap-6">
          {[
            { icon: "ri-shield-check-fill", label: "HIPAA Compliant", color: "text-emerald-700" },
            { icon: "ri-award-fill", label: "Licensed Professionals", color: "text-orange-600" },
            { icon: "ri-verified-badge-fill", label: "BBB Accredited", color: "text-amber-600" },
            { icon: "ri-lock-fill", label: "SSL Encrypted", color: "text-gray-700" },
          ].map((badge) => (
            <div key={badge.label} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 flex items-center justify-center ${badge.color}`}>
                <i className={`${badge.icon} text-sm`}></i>
              </div>
              <span className="text-xs font-semibold text-gray-700">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
