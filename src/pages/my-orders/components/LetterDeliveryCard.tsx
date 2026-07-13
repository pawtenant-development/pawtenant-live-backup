// LetterDeliveryCard — "Where your letter will appear" panel. Shown BEFORE the
// letter is delivered: explains that the finished letter appears in the portal
// automatically once the provider completes review, with a disabled placeholder
// download. Once delivered (doctor_status === "patient_notified"), the existing
// DocumentsSection renders the real download/view buttons, so this card hides.
// CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001.
//
// Compliance: no guaranteed completion time; "we'll email you once it's ready".

import CustomerPortalSection from "./CustomerPortalSection";

export interface DeliveryOrder {
  letter_type?: string | null;
  confirmation_id: string;
  doctor_status?: string | null;
  status: string;
}

function isPSD(order: DeliveryOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

export default function LetterDeliveryCard({ order }: { order: DeliveryOrder }) {
  // Once delivered, DocumentsSection owns the real download buttons.
  if (order.doctor_status === "patient_notified") return null;
  // No pre-delivery placeholder for cancelled/refunded/unpaid states.
  if (order.status === "cancelled" || order.status === "refunded" || order.status === "lead") return null;

  const letter = isPSD(order) ? "PSD letter" : "ESA letter";
  const reviewing = order.doctor_status === "in_review"
    || order.doctor_status === "approved"
    || order.doctor_status === "letter_sent";

  // Principal-outcome card — deliberately the most prominent panel in the order
  // detail (admin-blue structure, strong header) while remaining calm. Emerald
  // "Ready" + real download are owned by DocumentsSection once delivered; this
  // card owns the pre-delivery "where it will appear" locked destination.
  return (
    <CustomerPortalSection
      title={`Where your ${letter} will appear`}
      icon="ri-mail-check-line"
      tone="blue"
      prominent
      headerRight={
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-[#B45309]">
          <i className="ri-time-line"></i>{reviewing ? "Under review" : "Preparing"}
        </span>
      }
    >
      <p className="text-[13px] text-[#5F6B7A] leading-relaxed mb-3.5">
        Your finished {letter} will appear <span className="font-semibold text-[#172033]">right here in your portal</span> as
        soon as your provider completes review. {reviewing
          ? "Your provider is reviewing your case now — no action is needed from you."
          : "You don't need to do anything — it appears automatically once it's ready."}{" "}
        We'll also email you the moment it's ready to download.
      </p>
      <button
        type="button"
        disabled
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#f1f5f9] text-[#94a3b8] text-xs font-bold rounded-lg cursor-not-allowed border border-[#e2e8f0]"
      >
        <i className="ri-lock-2-line"></i>Download unlocks when your {letter} is ready
      </button>
    </CustomerPortalSection>
  );
}
