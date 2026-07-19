// PackageSelectionStep — dedicated post-OTP package-selection step
// (PACKAGE-RA-BUNDLE-UX-STORAGE-HARDENING-001). Shown after OTP/assurance and
// BEFORE the checkout/payment step, for both ESA and PSD.
//
// Two centered comparison cards: Standard vs the Reasonable Accommodation bundle.
// Price is derived from the ALREADY-selected pet/dog count (no pet-count input here).
// Standard price varies by count ($129 / $149); the RA bundle is flat ($179 one-time
// / $159 annual) per the existing pricing rule. The one-time / annual plan choice is
// made on the checkout step, so both prices are shown for context.
//
// PawTenant-branded (own palette). Compliance-safe: no guaranteed approval, no
// service-dog-status, no registry/certification/vest, no "legit(imate)".

import { motion } from "framer-motion";
import { getPackageTotal, isRaBundle } from "@/config/pricing";
import type { PackageKey } from "@/config/pricing";
import { packageOffer } from "@/lib/packageOffer";

type Accent = "esa" | "psd";

interface PackageSelectionStepProps {
  letterType: "esa" | "psd";
  accent?: Accent;
  /** Already-selected pet/dog count from Step 2 — never re-asked here. */
  petCount: number;
  /** Currently selected package (highlights that card). */
  selectedPackage: PackageKey;
  onSelect: (packageKey: PackageKey) => void;
  onBack: () => void;
}

// Brand palette per product. ESA = calm teal/emerald; PSD = deep blue.
const THEME: Record<Accent, { ring: string; solid: string; solidDark: string; soft: string; softBorder: string; text: string }> = {
  esa: { ring: "#059669", solid: "#059669", solidDark: "#047857", soft: "#ECFDF5", softBorder: "#A7F3D0", text: "#065F46" },
  psd: { ring: "#2c5282", solid: "#2c5282", solidDark: "#1e3a5f", soft: "#EFF4FB", softBorder: "#C3D5EC", text: "#1e3a5f" },
};

interface CardModel {
  key: PackageKey;
  title: string;
  tagline: string;
  oneTime: number;
  annual: number;
  features: string[];
  recommended: boolean;
  badge: string | null;
}

function ProgressBar({ theme }: { theme: { solid: string; soft: string } }) {
  const steps = [
    { label: "Assessment", done: true },
    { label: "Verification", done: true },
    { label: "Package", active: true },
    { label: "Checkout" },
    { label: "Confirmation" },
  ];
  return (
    <ol className="flex items-center justify-center gap-1.5 sm:gap-2 mb-6 flex-wrap">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5 sm:gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-full"
            style={
              s.active
                ? { backgroundColor: theme.solid, color: "#fff" }
                : s.done
                  ? { backgroundColor: theme.soft, color: theme.solid }
                  : { backgroundColor: "#F1F5F9", color: "#94A3B8" }
            }
          >
            {s.done && <i className="ri-check-line text-[11px]"></i>}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="w-4 sm:w-6 h-px bg-slate-200"></span>}
        </li>
      ))}
    </ol>
  );
}

export default function PackageSelectionStep({
  letterType,
  accent,
  petCount,
  selectedPackage,
  onSelect,
  onBack,
}: PackageSelectionStepProps) {
  const theme = THEME[accent ?? letterType];
  const n = Math.max(1, Math.min(3, petCount));
  const noun = letterType === "psd" ? (n === 1 ? "dog" : "dogs") : (n === 1 ? "pet" : "pets");
  const stdKey: PackageKey = letterType === "psd" ? "psd_standard" : "esa_standard";
  const bundleKey: PackageKey = letterType === "psd" ? "psd_ra_bundle" : "esa_ra_bundle";

  const cards: CardModel[] = letterType === "psd"
    ? [
        {
          key: stdKey,
          title: "Standard PSD Documentation",
          tagline: "Provider-reviewed psychiatric service dog documentation.",
          oneTime: getPackageTotal(stdKey, "one_time", n),
          annual: getPackageTotal(stdKey, "annual", n),
          recommended: false,
          badge: null,
          features: [
            "Licensed provider evaluation",
            "Official PSD letter PDF if you qualify",
            "Housing and travel documentation",
            "Secure online assessment and document delivery",
            "Letter verification support when requested",
            "HIPAA-conscious, secure process",
            "Fast digital delivery after provider approval",
          ],
        },
        {
          key: bundleKey,
          title: "PSD + Reasonable Accommodation Letter",
          tagline: "Everything in Standard, plus housing accommodation support.",
          oneTime: getPackageTotal(bundleKey, "one_time", n),
          annual: getPackageTotal(bundleKey, "annual", n),
          recommended: true,
          badge: "Best for housing accommodation requests",
          features: [
            "Everything included in Standard PSD",
            "Reasonable Accommodation letter included",
            "Support for landlord or property-manager requests",
            "Upload property forms through your customer portal",
            "Provider review of submitted accommodation forms",
            "Clear documentation and submission guidance",
            "Priority support for accommodation requests",
          ],
        },
      ]
    : [
        {
          key: stdKey,
          title: "Standard ESA Letter",
          tagline: "Licensed provider evaluation for your emotional support animal.",
          oneTime: getPackageTotal(stdKey, "one_time", n),
          annual: getPackageTotal(stdKey, "annual", n),
          recommended: false,
          badge: null,
          features: [
            "Licensed provider evaluation",
            "Official ESA letter PDF if you qualify",
            "Landlord-ready housing documentation",
            "Secure online assessment and document delivery",
            "Letter verification support for landlords or property managers",
            "HIPAA-conscious, secure process",
            "Fast digital delivery after provider approval",
          ],
        },
        {
          key: bundleKey,
          title: "ESA + Reasonable Accommodation Letter",
          tagline: "Everything in Standard, plus housing accommodation support.",
          oneTime: getPackageTotal(bundleKey, "one_time", n),
          annual: getPackageTotal(bundleKey, "annual", n),
          recommended: true,
          badge: "Best for landlord / property-manager requests",
          features: [
            "Everything included in Standard ESA",
            "Reasonable Accommodation letter included",
            "Support for landlord or property-manager requests",
            "Upload property forms through your customer portal",
            "Provider review of submitted accommodation forms",
            "Clear documentation and submission guidance",
            "Priority support for accommodation requests",
          ],
        },
      ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl mx-auto px-4 pb-24 lg:pb-10"
    >
      <ProgressBar theme={theme} />

      <div className="text-center mb-6">
        <h2 className="text-[22px] sm:text-2xl font-extrabold text-slate-900 tracking-tight">Choose your package</h2>
        <p className="text-sm text-slate-500 mt-1.5">
          Based on your selected <span className="font-semibold text-slate-700">{n} {noun}</span>.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 sm:gap-5 items-stretch">
        {cards.map((c) => {
          const active = selectedPackage === c.key;
          // Presentation-only offer values (compare-at, $30 badge, Klarna 4-pay).
          // Derived from the canonical payable one-time price; never enter checkout.
          const offer = packageOffer(c.oneTime);
          return (
            <motion.div
              key={c.key}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.18 }}
              className={`relative flex flex-col rounded-2xl bg-white border-2 overflow-hidden ${active ? "" : "border-slate-200"}`}
              style={
                active
                  ? { borderColor: theme.solid, boxShadow: `0 0 0 4px ${theme.soft}, 0 18px 40px -22px rgba(15,23,42,0.28)` }
                  : { boxShadow: "0 10px 30px -20px rgba(15,23,42,0.18)" }
              }
            >
              {c.recommended && (
                <div className="absolute top-0 right-0">
                  <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-white px-3 py-1 rounded-bl-xl" style={{ backgroundColor: theme.solid }}>
                    Recommended
                  </span>
                </div>
              )}
              <div className="p-5 sm:p-6 flex flex-col flex-1">
                {/* Shared, equal-height header so BOTH price rows start at the exact
                    same vertical position regardless of title wrap or the presence
                    of the "Best for…" chip. Title / tagline / chip each reserve a
                    fixed min-height; the Standard card renders an empty (a11y) chip
                    spacer in the same slot the Combo chip occupies.
                    ASSESSMENT-PACKAGE-CARD-VISUAL-ALIGNMENT-001. */}
                <h3 className="text-base font-extrabold text-slate-900 pr-24 leading-tight min-h-[2.5rem]">{c.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-snug min-h-[2.25rem]">{c.tagline}</p>
                <div className="mt-2 min-h-[1.5rem] flex items-start">
                  {c.badge ? (
                    <span className="inline-block self-start text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.soft, color: theme.text }}>
                      {c.badge}
                    </span>
                  ) : (
                    <span className="sr-only">No additional label</span>
                  )}
                </div>

                {/* One-time OFFER price row. The bold payable price is the REAL
                    one-time total from the shared getPackageTotal helper (never
                    hardcoded, never inferred). The crossed-out compare-at price and
                    the "$30 OFF" badge are PRESENTATION-ONLY (packageOffer) — they
                    never enter checkout, because onSelect passes only the package
                    KEY and the server re-computes the charge from pricing.ts.
                    ASSESSMENT-PACKAGE-CARD-OFFER-PRESENTATION-001. */}
                <div className="mt-4 mb-3">
                  <div className="flex items-baseline flex-wrap gap-x-2.5 gap-y-1.5">
                    <span className="text-[34px] leading-none font-extrabold tracking-tight text-slate-900">${offer.payablePrice}</span>
                    <span className="text-lg font-semibold text-slate-400 line-through decoration-slate-300">${offer.compareAtPrice}</span>
                    <span
                      className="inline-flex items-center whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FEF3C7", color: "#B45309" }}
                    >
                      ${offer.savings} OFF
                    </span>
                  </div>
                  <span className="block text-xs font-semibold text-slate-500 mt-1.5">one-time</span>
                </div>

                <ul className="space-y-2 mb-4 flex-1">
                  {c.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-slate-700 leading-snug">
                      <i className="ri-check-line text-sm mt-0.5 flex-shrink-0" style={{ color: theme.solid }}></i>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Refund reassurance box — approved wording, shown on every card.
                    Deliberately NOT a guaranteed-approval / guaranteed-qualification
                    / guaranteed-landlord-acceptance claim. */}
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2.5"
                  style={{ backgroundColor: theme.soft, border: `1px solid ${theme.softBorder}` }}
                >
                  <i className="ri-shield-check-line text-sm flex-shrink-0" style={{ color: theme.solid }}></i>
                  <span className="text-xs font-semibold" style={{ color: theme.text }}>
                    Full refund if you don&apos;t qualify.
                  </span>
                </div>

                {/* Klarna / installment message — the installment is derived from the
                    payable one-time price (offer.klarnaInstallment), NEVER the
                    crossed-out compare-at price. Eligibility is not guaranteed. */}
                <div className="flex items-start gap-2 mb-4">
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-[#ffb3c7] text-[#17120e] text-[9px] font-extrabold tracking-tight flex-shrink-0 mt-0.5">
                    Klarna
                  </span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Interest-free payment plans available at checkout, subject to eligibility. Choose Klarna to pay in 4 installments starting at{" "}
                    <span className="font-bold text-slate-700">${offer.klarnaInstallment}</span>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelect(c.key)}
                  className="w-full text-center font-bold text-sm rounded-xl py-3 transition-colors cursor-pointer"
                  style={
                    c.recommended || active
                      ? { backgroundColor: theme.solid, color: "#fff" }
                      : { backgroundColor: "#F8FAFC", color: theme.text, border: `1px solid ${theme.softBorder}` }
                  }
                >
                  {active ? "Continue with this package" : `Select ${isRaBundle(c.key) ? "bundle" : "standard"}`} <i className="ri-arrow-right-line align-middle"></i>
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Billing note — clarifies that the bold price is the ONE-TIME total, that
          annual billing is chosen at checkout, and that the crossed-out price is a
          comparison to our regular one-time rate (NOT an annual renewal).
          ASSESSMENT-PACKAGE-CARD-OFFER-PRESENTATION-001. */}
      <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-xs font-semibold text-slate-500 max-w-md mx-auto leading-relaxed">
        <i className="ri-information-line mt-0.5 flex-shrink-0"></i>
        <span>
          The bold price is your one-time total. Choose one-time or annual billing at checkout — the crossed-out price is our regular one-time rate, not an annual renewal.
        </span>
      </p>

      <p className="text-center text-[11px] text-slate-400 mt-5 max-w-xl mx-auto leading-relaxed">
        The Reasonable Accommodation letter supports your housing accommodation request. Approval decisions remain with
        the housing provider and applicable law. Documentation is issued only when clinically appropriate.
      </p>

      <div className="text-center mt-5">
        <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-400 hover:text-slate-600 cursor-pointer">
          <i className="ri-arrow-left-line"></i> Back
        </button>
      </div>
    </motion.div>
  );
}
