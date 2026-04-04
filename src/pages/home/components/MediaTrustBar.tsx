export default function MediaTrustBar() {
  const outlets = [
    { name: "Forbes", icon: "ri-article-line", subtext: "Featured" },
    { name: "Yahoo! News", icon: "ri-news-line", subtext: "Covered" },
    { name: "Newsweek", icon: "ri-newspaper-line", subtext: "Featured" },
    { name: "Reuters", icon: "ri-global-line", subtext: "Published" },
    { name: "USA Today", icon: "ri-file-text-line", subtext: "Mentioned" },
    { name: "The Guardian", icon: "ri-book-open-line", subtext: "Featured" },
  ];

  return (
    <section className="bg-white border-b border-gray-100 py-6">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col items-center gap-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            As Seen In
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 w-full">
            {outlets.map((outlet) => (
              <div
                key={outlet.name}
                className="flex items-center gap-2 opacity-60 hover:opacity-90 transition-opacity cursor-default"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className={`${outlet.icon} text-gray-600 text-lg`}></i>
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-gray-800 leading-none">{outlet.name}</p>
                  <p className="text-[10px] text-gray-500 leading-none mt-0.5">{outlet.subtext}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 mt-1">
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
      </div>
    </section>
  );
}
