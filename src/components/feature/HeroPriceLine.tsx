/**
 * HeroPriceLine — shared public-hero price anchor
 * (HOMEPAGE-CRO-RESPONSIVE-TYPOGRAPHY-POLISH-001, 2026-07-12).
 *
 * Renders the approved homepage hero price line — exactly:
 *
 *     Start for as low as $32.25
 *
 * for PUBLIC customer-acquisition hero sections only (marketing / service /
 * SEO / state / guide / article heroes that carry an assessment CTA).
 * Plain paragraph (never a heading), $32.25 emphasized in the approved
 * Source Serif display treatment. Do NOT use on legal, portal, checkout,
 * assessment or verification pages. Keep the copy verbatim — the figure is
 * the Klarna 4-installment anchor of the $129 letter; do not change it to
 * $129 here.
 *
 * tone="light" → for dark photo heroes (white text)
 * tone="dark"  → for light backgrounds (ink text)
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

interface HeroPriceLineProps {
  tone?: "light" | "dark";
  /** Extra classes for spacing/alignment within the host hero. */
  className?: string;
}

export default function HeroPriceLine({ tone = "dark", className = "" }: HeroPriceLineProps) {
  const body = tone === "light" ? "text-gray-100" : "text-[#4A443C]";
  const amount = tone === "light" ? "text-white" : "text-[#231F1A]";
  return (
    <p className={`text-[16px] sm:text-[17px] ${body} ${className}`.trim()}>
      Start for as low as{" "}
      <strong className={`font-bold text-[1.25em] ${amount}`} style={FONT_DISPLAY}>
        $32.25
      </strong>
    </p>
  );
}
