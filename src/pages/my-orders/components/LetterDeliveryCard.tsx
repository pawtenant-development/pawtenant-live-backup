// LetterDeliveryCard — "Where your letter will appear" panel. Shown BEFORE the
// letter is delivered: explains that the finished letter appears in the portal
// automatically once the provider completes review, with a disabled placeholder
// download. Once delivered (doctor_status === "patient_notified"), the existing
// DocumentsSection renders the real download/view buttons, so this card hides.
// CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001.
//
// Compliance: no guaranteed completion time; "we'll email you once it's ready".

import CustomerPortalSection from "./CustomerPortalSection";

import { isRefundTerminal, isOperationallyCancelled } from "@/lib/orderClassification";
// ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001 — an admin can complete an order
// that has no customer-visible document. `patient_notified` therefore no longer
// implies "there is a letter", so this card asks the resolver instead of hiding
// itself and leaving the customer with an order marked complete and no
// explanation anywhere on the page.
import { resolveCustomerDocuments, type ResolverOrder } from "@/lib/customerDocuments";
export interface DeliveryOrder extends ResolverOrder {
  letter_type?: string | null;
  confirmation_id: string;
  doctor_status?: string | null;
  status: string;
}

function isPSD(order: DeliveryOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

export default function LetterDeliveryCard({ order }: { order: DeliveryOrder }) {
  const { hasLetter, hasPreliminary } = resolveCustomerDocuments(order);

  if (hasPreliminary && !hasLetter) {
    return (
      <CustomerPortalSection
        title="Follow-up consultation required"
        icon="ri-calendar-check-line"
        tone="blue"
        prominent
        headerRight={
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-[#B45309]">
            <i className="ri-error-warning-line"></i>Action needed
          </span>
        }
      >
        <p className="text-[13px] text-[#5F6B7A] leading-relaxed">
          A <span className="font-semibold text-[#172033]">preliminary document</span> is available
          in My Documents. It is not your final ESA/PSD letter. Please contact PawTenant to schedule
          or complete your follow-up consultation; after that review, your provider can issue the
          final letter if you qualify.
        </p>
      </CustomerPortalSection>
    );
  }

  if (order.doctor_status === "patient_notified" && hasLetter) return null;

  if (order.doctor_status === "patient_notified" && !hasLetter) {
    return (
      <CustomerPortalSection
        title="Your order is complete"
        icon="ri-customer-service-2-line"
        tone="blue"
        prominent
        headerRight={
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-[#B45309]">
            <i className="ri-error-warning-line"></i>No final letter
          </span>
        }
      >
        <p className="text-[13px] text-[#5F6B7A] leading-relaxed">
          Your order has been marked complete by our team, but there is
          <span className="font-semibold text-[#172033]"> no final ESA/PSD letter in your portal yet</span>.
          If you were expecting a letter, please contact support so we can arrange the required follow-up.
        </p>
      </CustomerPortalSection>
    );
  }
  // No pre-delivery placeholder for cancelled/fully-refunded/unpaid states.
  // PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: a PARTIAL refund keeps the
  // letter coming, so the customer must keep this card. The old bare
  // status==='refunded' test had no partial guard, so a partial carrying a stale
  // status='refunded' silently hid the letter from a customer still owed one.
  if (isOperationallyCancelled(order) || isRefundTerminal(order) || order.status === "lead") return null;

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
