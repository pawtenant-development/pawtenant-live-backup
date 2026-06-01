import { Widget } from "./TeamWidget";

/**
 * Benefits widget — Emergency Medical Fund summary (UI foundation). Eligibility
 * and amounts are informational; benefit claims backend is a fast-follow.
 */
export default function BenefitsWidget() {
  return (
    <div id="benefits">
      <Widget icon="ri-heart-pulse-line" title="Benefits">
        <div className="rounded-xl bg-gradient-to-br from-[#0f1e1a] to-[#1f3b34] p-4 text-white">
          <div className="text-[11px] uppercase tracking-wide text-white/60">Emergency Medical Fund</div>
          <div className="mt-1 text-2xl font-bold">PKR 50,000</div>
          <div className="mt-1 text-[11px] text-white/70">Permanent employees only</div>
        </div>
        <p className="mt-2.5 text-[11px] leading-snug text-stone-500">
          Eligibility is subject to company approval. Contact HR or use a benefit claim request
          (coming soon) to apply.
        </p>
      </Widget>
    </div>
  );
}
