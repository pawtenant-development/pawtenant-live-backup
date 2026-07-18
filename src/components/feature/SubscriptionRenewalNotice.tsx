// SubscriptionRenewalNotice — the full, explicit renewal disclosure shown in
// checkout for any annual subscription (CLOSEOUT-005 Phase F3). It always states
// the amount charged today, the first-year framing, the EXACT renewal price, the
// expected renewal date, automatic renewal, and cancellation — never a tooltip,
// footer-only line, or vague "renews lower" sentence. Renders on desktop and
// mobile (it lives in the payment card, which is full-width on mobile).
import { useMemo } from "react";

interface Props {
  /** Amount charged today (= the first-year subscription total). */
  firstYearPrice: number;
  /** Amount billed each year from year two onward. */
  renewalPrice: number;
  tone?: "orange" | "emerald";
  className?: string;
}

const TONES = {
  orange: { wrap: "bg-orange-50 border-orange-200", icon: "text-orange-600 ring-orange-200", head: "text-orange-900", body: "text-orange-800", strong: "text-orange-900" },
  emerald: { wrap: "bg-emerald-50 border-emerald-200", icon: "text-emerald-600 ring-emerald-200", head: "text-emerald-900", body: "text-emerald-800", strong: "text-emerald-900" },
} as const;

export default function SubscriptionRenewalNotice({ firstYearPrice, renewalPrice, tone = "emerald", className = "" }: Props) {
  const renewalDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }, []);
  const t = TONES[tone];
  const flat = firstYearPrice === renewalPrice;

  return (
    <div role="note" aria-label="Automatic annual renewal details" className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${t.wrap} ${className}`}>
      <div className={`w-7 h-7 flex items-center justify-center bg-white rounded-lg flex-shrink-0 ring-1 ${t.icon}`}>
        <i className="ri-loop-right-line text-sm" aria-hidden="true"></i>
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-extrabold leading-snug ${t.head}`}>Automatic annual renewal</p>
        <p className={`text-[11px] mt-0.5 leading-relaxed ${t.body}`}>
          {flat ? (
            <><strong className={t.strong}>${firstYearPrice} today</strong>, then renews automatically at <strong className={t.strong}>${renewalPrice}/year</strong> on {renewalDate}.</>
          ) : (
            <><strong className={t.strong}>${firstYearPrice} today for the first year.</strong> Renews automatically at <strong className={t.strong}>${renewalPrice}/year</strong> beginning {renewalDate}.</>
          )}
          {" "}Cancel anytime from your account portal — no cancellation fees.
        </p>
      </div>
    </div>
  );
}
