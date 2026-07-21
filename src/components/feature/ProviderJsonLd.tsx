// src/components/feature/ProviderJsonLd.tsx
//
// AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001
//
// Renders null and injects a single <script type="application/ld+json"> into
// <head> at runtime (client). It upserts by a marker attribute so hydration over
// prerendered HTML never produces a duplicate, and removes the script on unmount
// so provider schema never leaks onto the next route. Because it emits nothing in
// the body, the full-body prerender's JSON-LD body-stripper has nothing to strip;
// the raw-HTML copy is injected into <head> by the prerender step instead.

import { useEffect } from "react";
import { PROVIDER_JSONLD_ATTR, stringifyJsonLd } from "../../lib/providerJsonLd";

export default function ProviderJsonLd({ graph }: { graph: Record<string, unknown> }) {
  const json = stringifyJsonLd(graph);
  useEffect(() => {
    const selector = `script[${PROVIDER_JSONLD_ATTR}]`;
    let el = document.head.querySelector(selector) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.setAttribute(PROVIDER_JSONLD_ATTR, "true");
      document.head.appendChild(el);
    }
    el.textContent = json;
    return () => {
      document.head.querySelectorAll(selector).forEach((n) => n.remove());
    };
  }, [json]);
  return null;
}
