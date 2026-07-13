// PortalSocialSection — lightweight "Follow PawTenant" section for /my-orders.
// CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001.
// Static curated links from config (no live social API, no fake stats).

import { PAWTENANT_SOCIAL_LINKS } from "../../../config/portalLinks";

export default function PortalSocialSection() {
  if (PAWTENANT_SOCIAL_LINKS.length === 0) return null;
  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
          <i className="ri-heart-3-line text-[#3b6ea5] text-base"></i>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Follow PawTenant</p>
          <p className="text-xs text-gray-500">Tips, updates, and stories from the PawTenant community.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {PAWTENANT_SOCIAL_LINKS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:border-[#dbe4f0] hover:text-[#1e3a5f] transition-colors cursor-pointer"
          >
            <i className={`${s.icon} text-[#3b6ea5]`}></i>
            {s.label}
            <span className="text-xs text-gray-400 font-normal">{s.handle}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
