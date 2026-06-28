import { useSitePricing } from "../../hooks/useSitePricing";

interface Props {
  /** Pricing key, e.g. "esa_single_pet" (see PRICING_KEYS in lib/sitePricing). */
  priceKey: string;
  /** Shown during prerender / before hydration / if the key is unknown. */
  fallback?: string;
  className?: string;
}

/**
 * PricingText — inline, admin-managed price string for use inside prose or
 * JSX copy, e.g.  costs <PricingText priceKey="esa_single_pet" fallback="$110" />
 * for one pet.
 *
 * DISPLAY ONLY — reflects the central website pricing settings. Does not affect
 * Stripe checkout amounts.
 */
export default function PricingText({ priceKey, fallback, className }: Props) {
  const { price } = useSitePricing();
  return <span className={className}>{price(priceKey, fallback)}</span>;
}
