import { useState, useEffect } from "react";

type GeoState = "loading" | "allowed" | "blocked";

const ALLOWED_COUNTRIES = ["US", "PK"];

// Admin/portal paths are always allowed regardless of country
const EXEMPT_PATHS = ["/admin", "/provider-portal", "/provider-login"];

export function useGeoBlock(): GeoState {
  const [state, setState] = useState<GeoState>("loading");

  useEffect(() => {
    const pathname = window.location.pathname;
    const isExempt = EXEMPT_PATHS.some((p) => pathname.startsWith(p));
    if (isExempt) {
      setState("allowed");
      return;
    }

    // Check cache first to avoid repeated API calls
    const cached = sessionStorage.getItem("geo_country");
    if (cached) {
      setState(ALLOWED_COUNTRIES.includes(cached) ? "allowed" : "blocked");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch("https://api.country.is/", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { country?: string }) => {
        clearTimeout(timeout);
        const country = data?.country ?? "";
        sessionStorage.setItem("geo_country", country);
        setState(ALLOWED_COUNTRIES.includes(country) ? "allowed" : "blocked");
      })
      .catch(() => {
        clearTimeout(timeout);
        // On error / timeout, allow through (don't punish legit users due to API issues)
        setState("allowed");
      });

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  return state;
}
