import { Link } from "react-router-dom";

interface LandlordVerificationBadgeProps {
  /** compact = small inline pill, full = expanded card */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Reusable landlord verification trust badge.
 * Use variant="compact" for inline/checkout contexts.
 * Use variant="full" for section-level trust blocks.
 */
export default function LandlordVerificationBadge({
  variant = "compact",
  className = "",
}: LandlordVerificationBadgeProps) {
  if (variant === "compact") {
    return (
      <div className={`inline-flex items-center gap-2 bg-orange-100 border border-orange-200 rounded-full px-3 py-1.5 ${className}`}>
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          <i className="ri-verified-badge-line text-orange-600 text-sm"></i>
        </div>
        <span className="text-xs font-bold text-orange-700 whitespace-nowrap">
          Landlord Verification Included
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-[#FFF7ED] border border-orange-200 rounded-xl p-5 ${className}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
          <i className="ri-verified-badge-line text-white text-base"></i>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-gray-900">Landlord Verification Included</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Every finalized letter includes a unique Verification ID landlords can check online.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {[
          { icon: "ri-link-m", text: "Verify at pawtenant.com/verify" },
          { icon: "ri-eye-off-line", text: "No private health info exposed" },
          { icon: "ri-user-star-line", text: "Issued by licensed providers" },
          { icon: "ri-shield-check-line", text: "HIPAA-compliant documentation" },
        ].map((item) => (
          <div key={item.text} className="flex items-center gap-2 min-w-0">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <i className={`${item.icon} text-orange-600 text-xs`}></i>
            </div>
            <span className="text-xs text-gray-600 font-medium leading-snug">{item.text}</span>
          </div>
        ))}
      </div>
      <Link
        to="/ESA-letter-verification"
        className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:underline cursor-pointer"
      >
        How verification works
        <i className="ri-arrow-right-line text-xs"></i>
      </Link>
    </div>
  );
}
