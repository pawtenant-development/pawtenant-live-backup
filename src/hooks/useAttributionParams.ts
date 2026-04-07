/**
 * useAttributionParams
 *
 * React hook that returns attribution params and a helper to append them
 * to any internal navigation path. Delegates to attributionStore — single
 * source of truth for all attribution data.
 *
 * Usage:
 *   const { withAttribution } = useAttributionParams();
 *   <a href={withAttribution("/assessment")}>Get ESA Letter</a>
 *   // → "/assessment?fbclid=xxx&utm_source=fb"
 */

import { useLocation } from "react-router-dom";
import { useMemo } from "react";
import {
  getAttribution,
  appendAttribution as storeAppendAttribution,
  type AttributionData,
} from "@/lib/attributionStore";

export type { AttributionData as AttributionParams };

/**
 * Reads attribution params from the store.
 * Returns a plain object with only the params that have values.
 */
export function getAttributionParams(): Partial<AttributionData> {
  const data = getAttribution();
  const result: Partial<AttributionData> = {};

  if (data.fbclid)       result.fbclid       = data.fbclid;
  if (data.gclid)        result.gclid        = data.gclid;
  if (data.utm_source)   result.utm_source   = data.utm_source;
  if (data.utm_medium)   result.utm_medium   = data.utm_medium;
  if (data.utm_campaign) result.utm_campaign = data.utm_campaign;
  if (data.utm_term)     result.utm_term     = data.utm_term;
  if (data.utm_content)  result.utm_content  = data.utm_content;

  return result;
}

/**
 * Appends attribution params to a path string.
 * Delegates to attributionStore.appendAttribution().
 */
export function appendAttribution(path: string): string {
  return storeAppendAttribution(path);
}

/**
 * React hook — returns attribution params and a helper to build attributed paths.
 * Re-computes when the URL search string changes (new ad click on any page).
 */
export function useAttributionParams(): {
  params: Partial<AttributionData>;
  withAttribution: (path: string) => string;
} {
  const { search } = useLocation();

  // Re-read from store on every route change (search change triggers re-render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => getAttributionParams(), [search]);

  const withAttribution = useMemo(
    () => (path: string) => storeAppendAttribution(path),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search],
  );

  return { params, withAttribution };
}
