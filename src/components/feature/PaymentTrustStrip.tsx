// PaymentTrustStrip — a small, accessible payment-method + guarantee strip shown
// directly below the public pricing cards (CLOSEOUT-005 Phase F4).
//
// Card brands are rendered as accessible TEXT chips in their brand colors — no
// stretched logo images and no implied endorsement. Deliberately visually
// smaller than the primary pricing CTAs. Responsive down to 375px.
const CARD_BRANDS: { name: string; color: string }[] = [
  { name: "Visa", color: "#1A1F71" },
  { name: "Mastercard", color: "#EB001B" },
  { name: "Amex", color: "#2E77BC" },
  { name: "Discover", color: "#E86A10" },
];

export default function PaymentTrustStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-5 gap-y-3 ${className}`}
      role="group"
      aria-label="Accepted payment methods and guarantees"
    >
      <ul className="flex flex-wrap items-center justify-center gap-2 m-0 p-0 list-none" aria-label="Accepted cards">
        {CARD_BRANDS.map((b) => (
          <li key={b.name}>
            <span
              className="inline-flex items-center px-2 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-bold tracking-wide"
              style={{ color: b.color }}
            >
              {b.name}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="ri-lock-2-line text-emerald-600" aria-hidden="true"></i>
          Secure Checkout
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="ri-refund-2-line text-emerald-600" aria-hidden="true"></i>
          100% Money-Back Guarantee
        </span>
      </div>
    </div>
  );
}
