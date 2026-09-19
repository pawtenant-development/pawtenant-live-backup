import { useState, useEffect } from "react";

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  // bumpedUp tracks the MobileStickyApplyCTA's 500px threshold. When the
  // bottom-fixed sticky CTA bar is on screen, this scroll-to-top button
  // would otherwise sit inside its vertical range and visually collide.
  // On mobile we lift it to bottom-[90px] (≈13px clearance above the
  // ~77px sticky bar — matches PawChat launcher's bottom-[90px]). On md+
  // the md:bottom-6 override keeps the desktop position unchanged
  // (sticky CTA is md:hidden on desktop, so no collision there).
  const [bumpedUp, setBumpedUp] = useState(false);
  // Hide this FAB while the assessment Step 3 payment surface is on screen
  // — the floating button visually competes with the secure payment area
  // and reduces trust. The same scroll handler that already runs covers
  // the check, so no extra observer is needed.
  const [paymentInView, setPaymentInView] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      setVisible(y > 320);
      setBumpedUp(y > 500);

      const payEl = document.getElementById("step3-payment-section");
      if (payEl) {
        const rect = payEl.getBoundingClientRect();
        const vh = window.innerHeight;
        setPaymentInView(rect.top < vh && rect.bottom > 0);
      } else {
        setPaymentInView(false);
      }
    };
    // Run once in case the page loaded with scroll already restored.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const show = visible && !paymentInView;

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      aria-hidden={!show}
      // ESA-HOUSING-LANDING-PAGE-CRO-001 — while hidden this button is
      // aria-hidden AND pointer-events-none, but it stayed in the tab order,
      // so keyboard focus landed on a control screen readers are told to
      // ignore. Lighthouse flags exactly this as `aria-hidden-focus`, and it
      // was the only a11y FAILURE (as opposed to contrast finding) on
      // /esa-letter-housing. Mirrors the tabIndex pattern MobileStickyApplyCTA
      // already uses for its own hidden state. Visible behaviour unchanged.
      tabIndex={show ? 0 : -1}
      className={`fixed left-6 z-50 w-11 h-11 flex items-center justify-center rounded-full bg-orange-500 text-white cursor-pointer transition-all duration-300 hover:bg-orange-600 ${
        bumpedUp ? "bottom-[90px]" : "bottom-6"
      } md:bottom-6 ${
        show
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <i className="ri-arrow-up-line text-lg"></i>
    </button>
  );
}