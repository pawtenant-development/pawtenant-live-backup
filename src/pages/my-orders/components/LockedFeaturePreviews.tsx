// LockedFeaturePreviews — the "unlocks after booking" preview cards shown to an
// UNPAID lead (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001).
//
// Each card is understandable but inert: a lock icon, a short "when it becomes
// available" line, and NO active form fields, NO upload button, NO provider
// identity, NO document links, NO $50 add-on action, NO false progress. This is
// the trust-building preview of what the paid portal unlocks — it never grants
// pre-payment access to provider workflows, uploads, contact-time controls, or
// delivered documents.

import { isPsdOrder, type BookingOrderLike } from "@/lib/bookingProgress";

interface LockedFeature {
  icon: string;
  title: string;
  message: string;
}

function LockedCard({ f }: { f: LockedFeature }) {
  return (
    <div className="rounded-xl border border-[#e6ebf1] bg-[#f8fafc] px-4 py-3.5 flex items-start gap-3">
      <div className="w-9 h-9 flex items-center justify-center bg-white rounded-lg ring-1 ring-[#e2e8f0] flex-shrink-0 relative">
        <i className={`${f.icon} text-[#94a3b8]`}></i>
        <span className="absolute -bottom-1 -right-1 w-4 h-4 flex items-center justify-center bg-[#64748b] rounded-full ring-2 ring-[#f8fafc]">
          <i className="ri-lock-2-fill text-white text-[9px]"></i>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-[#475569]">{f.title}</p>
          <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Locked</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.message}</p>
      </div>
    </div>
  );
}

export default function LockedFeaturePreviews({ order }: { order: BookingOrderLike }) {
  const psd = isPsdOrder(order);
  const features: LockedFeature[] = [
    {
      icon: "ri-user-heart-line",
      title: "Assigned Provider",
      message: `Available after booking — a licensed provider will be matched based on your state and ${psd ? "psychiatric service dog" : "ESA"} service.`,
    },
    {
      icon: "ri-time-line",
      title: "Preferred Contact Time",
      message: "Available after booking and provider assignment.",
    },
    {
      icon: "ri-home-heart-line",
      title: "Housing Accommodation / Additional Documentation",
      message: "Available according to your selected package after booking.",
    },
    {
      icon: "ri-file-shield-2-line",
      title: "Documents & Letter Delivery",
      message: "Your completed letter and eligible documents will appear here.",
    },
  ];

  return (
    <div>
      <p className="text-xs font-extrabold text-[#64748b] uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
        <i className="ri-lock-line"></i>Unlocks after booking
      </p>
      <div className="space-y-2.5">
        {features.map((f) => (
          <LockedCard key={f.title} f={f} />
        ))}
      </div>
    </div>
  );
}
