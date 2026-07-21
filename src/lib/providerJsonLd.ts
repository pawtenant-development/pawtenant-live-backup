// src/lib/providerJsonLd.ts
//
// AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001
//
// Pure builders for provider structured data. Intentionally emits ONLY
// ProfilePage + Person + BreadcrumbList (and CollectionPage + ItemList for the
// directory) — never WebPage / Service / Organization / WebSite / Physician, so
// it does not collide with the homepage-only schema hygiene enforced by
// scripts/check-machine-facts.mjs, and never over-states a social-work / counseling
// / psychology provider as a medical Physician.
//
// Used by BOTH the client profile component (runtime <head> injection) AND the
// build-time prerender (scripts/prerender-full-body-spike.mjs, via
// src/prerender/entry.tsx) so the raw HTML and the hydrated DOM carry identical,
// single-instance schema.

import { BASE_URL } from "../config/seoConfig";
import { US_STATES } from "./usStates";
import type { PublicProvider } from "../data/publicProviders";

const STATE_NAME: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s.name]),
);

export function stateName(code: string): string {
  return STATE_NAME[code] ?? code;
}

export function providerProfileUrl(slug: string): string {
  return `${BASE_URL}/doctors/${slug}`;
}

/** Marker attribute the client injector and the prerender share so the script is upserted, never duplicated. */
export const PROVIDER_JSONLD_ATTR = "data-provider-jsonld";

function personNode(p: PublicProvider) {
  const url = providerProfileUrl(p.slug);
  const node: Record<string, unknown> = {
    "@type": "Person",
    "@id": `${url}#person`,
    name: p.name,
    jobTitle: p.role,
    url,
    knowsAbout: [
      "Emotional support animal (ESA) evaluations",
      "Telehealth mental health evaluations",
    ],
    areaServed: p.states.map((code) => ({
      "@type": "AdministrativeArea",
      name: stateName(code),
    })),
  };
  if (p.npi) {
    node.identifier = { "@type": "PropertyValue", propertyID: "NPI", value: p.npi };
  }
  return node;
}

function breadcrumbNode(p: PublicProvider) {
  const url = providerProfileUrl(p.slug);
  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Our Providers", item: `${BASE_URL}/our-providers` },
      { "@type": "ListItem", position: 3, name: p.name },
    ],
  };
}

/** Full @graph for a single provider profile page: ProfilePage + Person + BreadcrumbList. */
export function buildProviderJsonLd(p: PublicProvider): Record<string, unknown> {
  const url = providerProfileUrl(p.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${url}#profilepage`,
        url,
        name: `${p.name}, ${p.title}`,
        mainEntity: { "@id": `${url}#person` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      personNode(p),
      breadcrumbNode(p),
    ],
  };
}

/** @graph for the /our-providers directory: CollectionPage + ItemList + BreadcrumbList. */
export function buildOurProvidersJsonLd(providers: readonly PublicProvider[]): Record<string, unknown> {
  const url = `${BASE_URL}/our-providers`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#collectionpage`,
        url,
        name: "Our Providers",
        mainEntity: { "@id": `${url}#list` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "ItemList",
        "@id": `${url}#list`,
        itemListElement: providers.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: providerProfileUrl(p.slug),
          name: `${p.name}, ${p.title}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Our Providers" },
        ],
      },
    ],
  };
}

export function stringifyJsonLd(graph: Record<string, unknown>): string {
  return JSON.stringify(graph);
}
