/**
 * seoSchema.ts — shared JSON-LD schema builders for public SEO/AEO pages.
 *
 * Added 2026-06-05 (PAWTENANT-AI-SEO-SEARCH-ENHANCEABILITY-PUBLIC-PAGES-TEST)
 * to give the new AI-answer-library pages consistent, structurally-valid
 * structured data without duplicating big literal objects in every page.
 *
 * Pure data builders — they return plain objects. Render them with the
 * <JsonLd> component in SeoKit.tsx. Canonical host always comes from
 * BASE_URL (non-www) so schema URLs never disagree with the prerendered
 * <head> canonical.
 *
 * Compliance: nothing here fabricates ratings, reviews, or credentials.
 * No aggregateRating / Review nodes — we have no verified review dataset to
 * cite, and fake review schema is a Google penalty risk.
 */

import { BASE_URL } from "@/config/seoConfig";

export interface FaqItem {
  q: string;
  a: string;
}

export interface BreadcrumbItem {
  name: string;
  /** Absolute or path-relative URL. Paths are resolved against BASE_URL. */
  path: string;
}

function abs(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Organization node — stable PawTenant entity description for AI/answer engines. */
export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: "PawTenant",
    url: BASE_URL,
    logo: `${BASE_URL}/assets/brand/pawtenant-logo-black-01.png`,
    description:
      "PawTenant is an online service that connects people with licensed mental health providers who can evaluate them and, when clinically appropriate, issue an emotional support animal (ESA) or psychiatric service dog (PSD) letter for housing.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: "+1-409-965-5885",
      email: "hello@pawtenant.com",
      areaServed: "US",
      availableLanguage: "English",
    },
  };
}

/** WebPage node. */
export function webPageSchema(opts: {
  url: string;
  name: string;
  description: string;
  dateModified?: string;
}) {
  return {
    "@type": "WebPage",
    "@id": `${abs(opts.url)}#webpage`,
    url: abs(opts.url),
    name: opts.name,
    description: opts.description,
    isPartOf: { "@id": `${BASE_URL}/#website` },
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  };
}

/** Service node — describes the ESA/PSD letter service neutrally. */
export function serviceSchema(opts?: { name?: string; description?: string }) {
  return {
    "@type": "Service",
    name: opts?.name ?? "ESA letter service",
    serviceType: "Emotional support animal documentation",
    provider: { "@id": `${BASE_URL}/#organization` },
    areaServed: "US",
    description:
      opts?.description ??
      "Connects people with licensed mental health providers who can evaluate them and issue an ESA letter for housing when clinically appropriate. No guaranteed approval — eligibility depends on a provider's evaluation.",
  };
}

/** Article node — for guide/answer pages. */
export function articleSchema(opts: {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${abs(opts.url)}#webpage` },
    author: { "@id": `${BASE_URL}/#organization` },
    publisher: { "@id": `${BASE_URL}/#organization` },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
  };
}

/** FAQPage node from a list of Q/A items. */
export function faqSchema(faqs: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** BreadcrumbList node. */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}

/** Wrap any set of schema nodes into a single @graph document. */
export function graph(...nodes: object[]) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}
