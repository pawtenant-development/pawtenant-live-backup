import { useCallback, useEffect, useState } from "react";
import {
  FALLBACK_PRICING_MAP,
  fetchSitePricing,
  getCachedPricing,
  displayPrice,
  dollarsForKey,
  type SitePricingMap,
} from "../lib/sitePricing";

/**
 * useSitePricing — read admin-managed website display prices at runtime.
 *
 * Starts from the in-code fallback map (or the shared cache if already loaded),
 * so prerender / first paint always renders a price. On mount it fetches the
 * latest values from Supabase and hydrates. A failed fetch silently keeps the
 * fallback — prices never break the page.
 *
 *   const { price, dollars } = useSitePricing();
 *   price("esa_single_pet")            -> "$110"
 *   price("esa_single_pet", "$110")    -> override fallback string
 *   dollars("esa_single_pet")          -> 110
 */
export function useSitePricing() {
  const [map, setMap] = useState<SitePricingMap>(
    () => getCachedPricing() ?? FALLBACK_PRICING_MAP,
  );
  const [ready, setReady] = useState<boolean>(() => !!getCachedPricing());

  useEffect(() => {
    let active = true;
    fetchSitePricing()
      .then((m) => {
        if (active) {
          setMap(m);
          setReady(true);
        }
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const price = useCallback(
    (key: string, fallback?: string) => displayPrice(map, key, fallback),
    [map],
  );
  const dollars = useCallback((key: string) => dollarsForKey(map, key), [map]);

  return { price, dollars, map, ready };
}
