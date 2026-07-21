import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

// REFUND-POLICY-HOUSING-DENIAL-IMPLEMENTATION-001
//
// Dedicated Refund Policy — the single detailed source of truth for refund
// eligibility. Terms of Use and the No-Risk Guarantee page summarize and link
// here; checkout and marketing pages stay brief and link here.
//
// Compliance guardrails baked into the copy (enforced by
// scripts/check-refund-guarantee-parity.mjs):
//   • Provider non-qualification = full refund (ESA + PSD), no fee.
//   • Housing-denial claims are reviewed for eligibility under THIS policy only.
//     PawTenant does NOT determine legal liability, FHA violation, HUD outcome,
//     or whether a property is legally exempt.
//   • Evidence is case-specific ("examples PawTenant may consider"); a HUD /
//     agency reference is optional when filed, never the sole required proof.
//   • The up-to-$40 professional evaluation & administrative services fee is
//     discretionary, manual, case-specific, never exceeds the amount paid, and
//     never applies to a guaranteed full-refund category. It is NOT automatic.
//
// Title/description/canonical come from CORE_PAGE_META via SEOManager +
// scripts/prerender-seo.mjs (no hardcoded <title> — single source of truth).

const sections = [
  { id: "summary", title: "How Refunds Work" },
  { id: "how-to-request", title: "How to Request a Refund" },
  { id: "categories", title: "Refund Categories" },
  { id: "housing-denial", title: "Housing-Denial Review" },
  { id: "evidence", title: "Evidence We May Consider" },
  { id: "services-fee", title: "Professional Evaluation & Administrative Services Fee" },
  { id: "timing", title: "Timing, Discounts, Subscriptions & Bundles" },
  { id: "request-period", title: "When to Submit Your Request" },
  { id: "disputes", title: "Payment Disputes & Your Rights" },
  { id: "fair-housing", title: "Fair-Housing Resources" },
  { id: "changes", title: "Review & Changes" },
];

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 scroll-mt-28"
    >
      {title}
    </h2>
  );
}

const categories: { name: string; outcome: string; fee: boolean }[] = [
  { name: "A licensed provider determines you do not qualify", outcome: "Full refund", fee: false },
  { name: "Duplicate or erroneous charge", outcome: "Full refund", fee: false },
  { name: "PawTenant fails to deliver, or a provider is unable to complete the service", outcome: "Full refund", fee: false },
  { name: "You cancel before professional work on your order begins", outcome: "Full refund", fee: false },
  { name: "A qualifying housing-denial claim under this Refund Policy", outcome: "Full refund", fee: false },
  { name: "A standalone Additional-Documentation / Reasonable-Accommodation add-on the reviewing provider does not approve", outcome: "Full add-on refund", fee: false },
  { name: "You cancel after professional work has been completed (change of mind)", outcome: "Discretionary — up to $40 may be retained", fee: true },
  { name: "A housing-denial claim that does not meet the criteria below", outcome: "No guaranteed refund; a discretionary partial refund may be offered", fee: true },
  { name: "Completed evaluation or letter already issued, where no guarantee category applies", outcome: "Generally non-refundable; discretionary only", fee: true },
  { name: "Discretionary goodwill (no other category applies)", outcome: "Case by case — up to $40 may be retained", fee: true },
  { name: "Subscription renewal", outcome: "Governed by the renewal terms below; cancel anytime from your account", fee: false },
  { name: "ESA + Reasonable-Accommodation or PSD + Reasonable-Accommodation bundle", outcome: "Reviewed by component under the rules above", fee: false },
  { name: "Payment dispute / chargeback", outcome: "Handled through the dispute process (see below)", fee: false },
];

export default function RefundPolicyPage() {
  const [activeId, setActiveId] = useState("summary");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <SharedNavbar />

      {/* Hero */}
      <section className="pt-32 pb-12 bg-[#fdf6ee]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Link to="/" className="hover:text-orange-500 transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-800 font-medium">Refund Policy</span>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            Refund Policy
          </h1>
          <p className="text-sm text-gray-500">
            <strong>Pawtenant (HyperSpace Solutions LLC)</strong> &nbsp;&middot;&nbsp; Last Updated: <strong>July 21, 2026</strong>
          </p>
          <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 max-w-3xl">
            <p className="text-sm text-amber-800 leading-relaxed">
              This Refund Policy is the complete source of truth for refund eligibility. It is read together with our{" "}
              <Link to="/terms-of-use" className="font-semibold underline hover:text-amber-900">Terms of Use</Link> and{" "}
              <Link to="/privacy-policy" className="font-semibold underline hover:text-amber-900">Privacy Policy</Link>. PawTenant is not a law firm, does not provide legal advice, and does not determine whether any law was violated, whether a landlord is legally liable, whether HUD would sustain a complaint, or whether any property is legally exempt.
            </p>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex gap-12">

          {/* Sidebar TOC */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">On This Page</p>
              <ul className="space-y-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className={`block text-sm py-1.5 px-3 rounded-lg transition-colors cursor-pointer ${
                        activeId === s.id
                          ? "bg-orange-50 text-orange-600 font-semibold border-l-2 border-orange-500"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-10">

            <div>
              <SectionHeading id="summary" title="How Refunds Work" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>If a licensed provider determines you do not qualify, you receive a <strong>full refund</strong>. If a housing provider denies your valid letter, you can submit a <strong>housing-denial claim</strong> for review under this policy. Other requests are handled case by case, as described below.</p>
                <p>When we review a housing-denial claim, we decide only whether PawTenant's own refund guarantee applies. <strong>This is a refund-eligibility decision, not a legal determination</strong> about your landlord, the Fair Housing Act, a HUD complaint, or whether a property is exempt.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="how-to-request" title="How to Request a Refund" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Email <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a> or use the refund request in your account. Please submit promptly (see <a href="#request-period" className="text-orange-500 hover:underline">When to Submit Your Request</a> below).</p>
                <p>Our team reviews each request against this policy and follows up if we need anything further. Approved refunds are issued to your original payment method. Depending on your bank or payment provider, the credit may take approximately <strong>5&ndash;10 business days</strong> to appear.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="categories" title="Refund Categories" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-4">
                <p>The outcome of a refund request depends on the situation:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#fdf6ee]">
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Situation</th>
                        <th className="border border-gray-200 px-3 py-2 text-left font-bold text-gray-800">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((c) => (
                        <tr key={c.name} className="even:bg-gray-50 align-top">
                          <td className="border border-gray-200 px-3 py-2 text-gray-700">{c.name}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-700">{c.outcome}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500">Provider non-qualification is a full-refund category for both ESA and PSD orders. No fee is retained on any full-refund category.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="housing-denial" title="Housing-Denial Review — How a Claim Qualifies" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>A housing provider saying &ldquo;no&rdquo; does <strong>not</strong> automatically qualify an order for a refund. A housing-denial claim qualifies for the guarantee when PawTenant determines, based on the submitted evidence and the criteria in this Refund Policy, that you completed the required accommodation process and the claim falls within PawTenant's published housing-denial guarantee. <strong>This decision concerns refund eligibility only and is not a legal determination.</strong></p>
                <p>To be reviewed, you must have:</p>
                <ul className="space-y-1.5 pl-1">
                  {[
                    "submitted your accommodation request and your PawTenant letter to the housing provider;",
                    "provided documentation of the housing provider's response; and",
                    "cooperated with our review.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p>A claim may not meet the criteria when, for example: the denial was only verbal (we will help you request it in writing); no final decision has been made; the housing provider lawfully asked for additional information you have not yet provided; you did not submit your request and letter; the documentation was altered, expired, misused, or submitted for another person; or you decline to cooperate with our review. These are refund-eligibility criteria under this policy, not legal conclusions about the denial.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="evidence" title="Evidence We May Consider" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p><strong>Examples of evidence PawTenant may consider</strong> (no single item is required or automatically sufficient — each claim is reviewed individually):</p>
                <ul className="space-y-1.5 pl-1">
                  {[
                    "A written denial from your landlord or property manager (letter, notice, or email).",
                    "A resident-portal message or screenshot showing the refusal.",
                    "A lease-enforcement communication or formal notice.",
                    "A written reason the accommodation was refused.",
                    "Confirmation that you submitted your accommodation request and PawTenant letter.",
                    "A message requesting additional documentation.",
                    "If you filed one, a HUD or state/local fair-housing complaint or inquiry reference — optional, where available, and never the sole required form of evidence.",
                    "Attorney or fair-housing-organization correspondence.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p>PawTenant may request additional information reasonably necessary to verify the accommodation request, the housing provider's response, and eligibility under this Refund Policy. Supplying one screenshot, email, complaint number, or notice does not by itself guarantee approval.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="services-fee" title="Professional Evaluation & Administrative Services Fee (up to $40)" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Where PawTenant approves a <strong>discretionary</strong> partial or goodwill refund <strong>after the professional evaluation, provider review, letter preparation, or other substantial professional work has already been completed</strong>, PawTenant may retain <strong>up to $40</strong> as a professional evaluation and administrative services fee.</p>
                <p>This fee:</p>
                <ul className="space-y-1.5 pl-1">
                  {[
                    "is discretionary and case-specific — it is not deducted from every refund;",
                    "never exceeds the amount you actually paid (for discounted orders, it is capped accordingly);",
                    "applies only when PawTenant voluntarily approves a partial or goodwill refund;",
                    "reflects work already performed (assessment and intake processing, licensed-provider review coordination, document preparation, compliance review, payment processing, and case administration); and",
                    "remains a manual support/finance decision.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p>It <strong>may</strong> apply when you change your mind after professional work is completed, or when a housing-denial request lacks sufficient verifiable evidence but PawTenant nevertheless approves a discretionary partial refund.</p>
                <p>It <strong>does not apply</strong> to: provider non-qualification; a duplicate or erroneous charge; PawTenant's failure to deliver; a provider being unable to complete the service; cancellation before professional work begins; a qualifying housing-denial claim approved under this Refund Policy; a standalone Additional-Documentation / Reasonable-Accommodation add-on the provider does not approve; or a refund required by applicable law. It is not an automatic deduction, not a mandatory charge, and not a fee applied to every refund. This provision is subject to applicable law.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="timing" title="Timing, Discounts, Subscriptions & Bundles" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Approved refunds are generally issued promptly by PawTenant. Depending on your bank or payment provider, the credit may take approximately <strong>5&ndash;10 business days</strong> to appear.</p>
                <p>Discounted or installment orders are refunded based on the amount actually paid. Subscription renewals are governed by the renewal terms in your account; you may cancel anytime, and cancelling stops future renewals. Bundles are reviewed by component. The standalone Additional-Documentation / Reasonable-Accommodation add-on is fully refundable if the reviewing provider does not approve it.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="request-period" title="When to Submit Your Request" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Please submit your refund request promptly. For a housing-denial claim, submit promptly after you receive the housing provider's final, documented response — that decision may come some time after your letter was delivered. For provider non-qualification, a billing error, or a case where PawTenant did not deliver the service, contact us as soon as you are aware of the issue.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="disputes" title="Payment Disputes & Your Rights" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Nothing in this policy limits rights available under applicable law or applicable card-network rules. If a payment dispute is opened, the matter may also be handled through the relevant bank, card issuer, or payment provider. Duplicate recovery is not permitted — PawTenant does not issue a separate refund for the same charge while a chargeback for that charge is pending or has been resolved in your favor.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="fair-housing" title="Fair-Housing Resources" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>If you believe a denial was unlawful, you may file a complaint with the U.S. Department of Housing and Urban Development (HUD) at{" "}
                  <a href="https://www.hud.gov/reporthousingdiscrimination" className="text-orange-500 hover:underline" rel="nofollow noreferrer" target="_blank">hud.gov/reporthousingdiscrimination</a>{" "}
                  or 1-800-669-9777, generally within one year of the last alleged act, or with a state or local fair-housing agency. Filing is free and carries no guaranteed outcome. You may also consult a tenant-rights attorney or a fair-housing organization. PawTenant reviews refund eligibility under this policy only and does not provide legal representation.</p>
              </div>
            </div>

            <div>
              <SectionHeading id="changes" title="Review & Changes" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Refund decisions are made by PawTenant support and finance under this policy. If you disagree with a decision, reply to your support thread to request a second review. We may update this policy from time to time; the &ldquo;Last Updated&rdquo; date above reflects the current version. Questions? Email{" "}
                  <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a>.</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
