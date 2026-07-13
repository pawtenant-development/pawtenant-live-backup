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
            "Provider-reviewed PSD documentation where eligible",
            "Support for eligible psychiatric service dog situations",
            "Housing and travel context support where applicable",
            "HIPAA-conscious, secure process",
            "Refund if you don't qualify",
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
            "Everything in Standard PSD",
            "Reasonable Accommodation request support",
            "Upload a landlord / property-manager form in your portal if needed",
            "Priority support",
            "Clear steps for landlord submission",
            "Supports your request — does not create service-dog status",
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
            "HIPAA-conscious, secure process",
            "Refund if you don't qualify",
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
            "Everything in Standard ESA",
            "Reasonable Accommodation request support",
            "Helps prepare for landlord / property-manager forms",
            "Upload a landlord / property form in your portal if needed",
            "Priority support",
            "Clear steps for landlord submission",
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
                <h3 className="text-base font-extrabold text-slate-900 pr-24 leading-tight">{c.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{c.tagline}</p>
                {c.badge && (
                  <span className="inline-block mt-2 self-start text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.soft, color: theme.text }}>
                    {c.badge}
                  </span>
                )}

                {/* Prominent ONE-TIME price only. The subscription/annual price chip
                    was removed — the one-time vs annual billing choice is made at
                    checkout (see the note under the cards). Value comes from the
                    shared getPackageTotal helper (never hardcoded, never inferred).
                    RA-PROVIDER-DOCUMENT-WORKFLOW-RELEASE-BLOCKERS-001. */}
                <div className="mt-4 mb-4 flex items-baseline gap-2">
                  <span className="text-[34px] leading-none font-extrabold tracking-tight text-slate-900">${c.oneTime}</span>
                  <span className="text-xs font-semibold text-slate-500">one-time</span>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {c.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-slate-700 leading-snug">
                      <i className="ri-check-line text-sm mt-0.5 flex-shrink-0" style={{ color: theme.solid }}></i>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

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

      {/* Billing note — the one-time vs annual choice is made at checkout, so no
          annual price is shown on the cards. RA-PROVIDER-DOCUMENT-WORKFLOW-RELEASE-BLOCKERS-001. */}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-slate-500">
        <i className="ri-information-line"></i>
        Choose one-time or annual billing at checkout.
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
