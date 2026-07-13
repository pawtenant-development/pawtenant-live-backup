// OrderOverviewCard — customer-facing "at a glance" summary of the order:
// product type, package name, billing plan, amount paid, pet/dog count,
// confirmation id + state/delivery. CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001.
// Read-only; derives everything from the order the customer already owns.
// Renders through the shared CustomerPortalSection shell (consistent section chrome
// + title typography — CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001).

import CustomerPortalSection from "./CustomerPortalSection";

export interface OverviewOrder {
  confirmation_id: string;
  letter_type?: string | null;
  plan_type?: string | null;
  billing_plan?: string | null;
  package_key?: string | null;
  package_display_name?: string | null;
  includes_reasonable_accommodation_letter?: boolean | null;
  price?: number | null;
  state?: string | null;
  delivery_speed?: string | null;
  payment_intent_id?: string | null;
  assessment_answers?: Record<string, unknown> | null;
}

function isPSD(order: OverviewOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

/** Friendly package name. Uses the stored display name when present, else derives. */
function packageName(order: OverviewOrder): string {
  if (order.package_display_name) return order.package_display_name;
  const psd = isPSD(order);
  if (order.includes_reasonable_accommodation_letter) {
    return psd ? "PSD + Reasonable Accommodation" : "ESA + Reasonable Accommodation";
  }
  return psd ? "Standard PSD Letter" : "Standard ESA Letter";
}

/** One-time vs annual. billing_plan is authoritative; fall back to plan_type text. */
function billingLabel(order: OverviewOrder): string {
  const bp = (order.billing_plan ?? "").toLowerCase();
  if (bp === "annual") return "Annual plan";
  if (bp === "one_time") return "One-time purchase";
  const pt = (order.plan_type ?? "").toLowerCase();
  if (pt.includes("subscription") || pt.includes("annual")) return "Annual plan";
  return "One-time purchase";
}

function petCount(order: OverviewOrder): number | null {
  const pets = order.assessment_answers?.pets;
  if (Array.isArray(pets) && pets.length > 0) return pets.length;
  return null;
}

export default function OrderOverviewCard({ order }: { order: OverviewOrder }) {
  const psd = isPSD(order);
  const isPaid = !!order.payment_intent_id;
  const pets = petCount(order);
  const rows: Array<{ icon: string; label: string; value: string }> = [
    {
      icon: psd ? "ri-service-line" : "ri-heart-line",
      label: "Product",
      value: psd ? "PSD Letter" : "ESA Letter",
    },
    { icon: "ri-vip-crown-2-line", label: "Package", value: packageName(order) },
    { icon: "ri-price-tag-3-line", label: "Billing", value: billingLabel(order) },
    ...(isPaid && order.price != null
      ? [{ icon: "ri-bank-card-line", label: "Amount paid", value: `$${order.price}.00` }]
      : []),
    ...(pets != null
      ? [{
          icon: psd ? "ri-shield-star-line" : "ri-footprint-line",
          label: psd ? "Dogs" : "Animals",
          value: `${pets}`,
        }]
      : []),
    { icon: "ri-map-pin-line", label: "State", value: order.state ?? "—" },
    {
      icon: "ri-timer-flash-line",
      label: "Delivery",
      value: order.delivery_speed === "24hours" || order.delivery_speed === "24h"
        ? "Within 24 hrs"
        : "2–3 business days",
    },
  ];

  return (
    <CustomerPortalSection
      title="Order Overview"
      icon="ri-file-list-3-line"
      tone="blue"
      headerRight={
        <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {order.confirmation_id}
        </span>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
              <i className={`${r.icon} text-[#3b6ea5] text-sm`}></i>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400 mb-0.5">{r.label}</p>
              <p className="text-xs font-semibold text-gray-800 leading-snug">{r.value}</p>
            </div>
          </div>
        ))}
      </div>
    </CustomerPortalSection>
  );
}
