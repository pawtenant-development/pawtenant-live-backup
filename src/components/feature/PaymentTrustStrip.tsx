// PaymentTrustStrip — a small, accessible payment-method + guarantee strip shown
// directly below the public pricing cards (CLOSEOUT-005 Phase F4; logos added in
// STATE-PAGE-PRICING-HOMEPAGE-PARITY-TRUST-STRIP-001).
//
// Card brands render as recognizable, self-contained inline-SVG brand marks
// (no remote/CDN images, no emoji, no plain-text chips): the Mastercard
// interlocking circles, and the Visa / Amex / Discover wordmarks in their brand
// colors. Each mark is an accessible graphic (role="img" + aria-label), a
// consistent height, and never stretched or clipped. Deliberately smaller than
// the primary pricing CTAs and responsive down to 375px.

/** Each brand is a self-contained SVG so it always renders and stays crisp. */
function CardLogos() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-2 m-0 p-0 list-none" aria-label="Accepted cards">
      {/* Visa — brand-blue italic wordmark */}
      <li className="inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-gray-200 bg-white">
        <svg role="img" aria-label="Visa" viewBox="0 0 54 18" className="h-[17px] w-auto" xmlns="http://www.w3.org/2000/svg">
          <text x="27" y="14" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontStyle="italic" fontSize="17" letterSpacing="1.5" fill="#1434CB">VISA</text>
        </svg>
      </li>

      {/* Mastercard — interlocking red/amber circles (shape-based logo) */}
      <li className="inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-gray-200 bg-white">
        <svg role="img" aria-label="Mastercard" viewBox="0 0 38 24" className="h-[18px] w-auto" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="12" r="9" fill="#EB001B" />
          <circle cx="24" cy="12" r="9" fill="#F79E1B" />
          <path d="M19 4.8a9 9 0 0 0 0 14.4a9 9 0 0 0 0-14.4" fill="#FF5F00" />
        </svg>
      </li>

      {/* American Express — white wordmark on the brand blue box */}
      <li className="inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-gray-200 bg-white">
        <svg role="img" aria-label="American Express" viewBox="0 0 40 18" className="h-[18px] w-auto" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="18" rx="3" fill="#016FD0" />
          <text x="20" y="12.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="8" letterSpacing="1" fill="#FFFFFF">AMEX</text>
        </svg>
      </li>

      {/* Discover — dark wordmark with the signature orange ball */}
      <li className="inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-gray-200 bg-white">
        <svg role="img" aria-label="Discover" viewBox="0 0 86 16" className="h-[14px] w-auto" xmlns="http://www.w3.org/2000/svg">
          <text x="1" y="13" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="14" letterSpacing="0.3" fill="#1A1A1A">DISC</text>
          <circle cx="49" cy="8.5" r="5.5" fill="#F76E11" />
          <text x="55" y="13" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="14" letterSpacing="0.3" fill="#1A1A1A">VER</text>
        </svg>
      </li>
    </ul>
  );
}

export default function PaymentTrustStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-5 gap-y-3 ${className}`}
      role="group"
      aria-label="Accepted payment methods and guarantees"
    >
      <CardLogos />

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
