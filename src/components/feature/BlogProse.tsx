/**
 * BlogProse.tsx — shared, lightweight building blocks for the pet-rent blog
 * cluster (and future long-form articles). Pure presentational + Tailwind +
 * remixicon. No business logic, no network calls.
 *
 * Why a shared kit: the pet-rent cluster ships several articles that share the
 * same hero / prose / FAQ / disclaimer chrome. Centralizing it keeps each
 * article file focused on unique content and keeps the FAQ JSON-LD in lockstep
 * with the visible FAQ (both render from the same `faqs` array).
 *
 * Compliance: the <BlogLegalDisclaimer> is baked in and must stay on every
 * article. Articles that discuss pet-rent savings should also render
 * <PetRentSavingsMini> (which carries the required estimate-only disclaimer and
 * the /pet-rent-savings-calculator link).
 */

import { useState } from "react";
import { Link } from "react-router-dom";

export interface BlogFaqItem {
  q: string;
  a: string;
}

export const inlineLink =
  "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

/* ── Prose primitives ────────────────────────────────────────────────────── */
export function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28">
      {children}
    </h2>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base md:text-lg font-bold text-gray-900 mt-8 mb-3">{children}</h3>;
}

export function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}

export function CheckList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5 my-5">
      {items.map((it, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 text-sm md:text-[15px] text-gray-600 leading-relaxed"
        >
          <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Per-page meta (OG/Twitter/keywords). Title/description/canonical come from
   CORE_PAGE_META via SEOManager + prerender; these add the social + keyword
   tags the prerenderer doesn't manage. ───────────────────────────────────── */
export function BlogMeta({
  title,
  description,
  canonical,
  image,
  keywords,
  published,
}: {
  title: string;
  description: string;
  canonical: string;
  image: string;
  keywords: string;
  published: string;
}) {
  return (
    <>
      <meta name="keywords" content={keywords} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="article:published_time" content={published} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </>
  );
}

/* ── JSON-LD: BlogPosting + BreadcrumbList + FAQPage. `faqs` is the SAME array
   the page renders with <BlogFaq>, so schema and visible FAQ never drift. ── */
export function BlogJsonLd({
  canonical,
  headline,
  description,
  image,
  datePublished,
  dateModified,
  breadcrumbName,
  faqs,
  keywords,
}: {
  canonical: string;
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified?: string;
  breadcrumbName: string;
  faqs: BlogFaqItem[];
  keywords: string;
}) {
  const graph: object[] = [
    {
      "@type": "BlogPosting",
      "@id": `${canonical}#article`,
      headline,
      description,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      url: canonical,
      image: [image],
      datePublished,
      dateModified: dateModified ?? datePublished,
      author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
      publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
      articleSection: "Pet Rent & ESA Housing",
      keywords,
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
        { "@type": "ListItem", position: 3, name: breadcrumbName, item: canonical },
      ],
    },
  ];
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────── */
export function BlogHero({
  chips,
  breadcrumbName,
  h1,
  h1Accent,
  publishedLabel,
  readMins,
  summaryItems,
  image,
  alt,
}: {
  chips: string[];
  breadcrumbName: string;
  h1: string;
  h1Accent: string;
  publishedLabel: string;
  readMins: number;
  summaryItems: React.ReactNode[];
  image: string;
  alt: string;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-[#fffaf4] to-white pt-28 pb-12 sm:pt-32 sm:pb-14">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <nav className="text-xs text-gray-400 mb-5" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-orange-600">Home</Link>
          <span className="mx-1.5">/</span>
          <Link to="/blog" className="hover:text-orange-600">Blog</Link>
          <span className="mx-1.5">/</span>
          <span className="text-gray-500">{breadcrumbName}</span>
        </nav>
        <div className="flex flex-wrap gap-2 mb-5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm"
            >
              {chip}
            </span>
          ))}
        </div>
        <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
          {h1} <span className="text-orange-500">{h1Accent}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-calendar-line text-orange-400"></i> {publishedLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-time-line text-orange-400"></i> ~{readMins} min read
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy
          </span>
        </div>

        <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3 flex items-center gap-2">
            <i className="ri-flashlight-line"></i> Quick summary
          </p>
          <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
            {summaryItems.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>

        <figure className="mt-8">
          <img
            src={image}
            alt={alt}
            width={1600}
            height={1067}
            fetchPriority="high"
            decoding="async"
            className="w-full h-52 sm:h-80 md:h-[26rem] object-cover object-center rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
          />
        </figure>
      </div>
    </section>
  );
}

/* ── FAQ (visible accordion; schema emitted separately from the same array) ─ */
export function BlogFaq({ heading, faqs }: { heading: string; faqs: BlogFaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-14 bg-white">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">{heading}</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={f.q} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                aria-expanded={open === i}
              >
                <span className="text-sm font-bold text-gray-900">{f.q}</span>
                <i
                  className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                ></i>
              </button>
              {open === i && (
                <div className="px-5 pb-4 -mt-1">
                  <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Keep reading ────────────────────────────────────────────────────────── */
export function BlogKeepReading({
  links,
}: {
  links: { to: string; icon: string; label: string }[];
}) {
  return (
    <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
      <div className="max-w-4xl mx-auto px-5 sm:px-6">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">
          Keep reading
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
          {links.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all"
            >
              <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
              <span className="text-sm font-semibold text-gray-800">{r.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Legal disclaimer (required on every article) ────────────────────────── */
export function BlogLegalDisclaimer() {
  return (
    <section className="py-10 bg-white border-t border-gray-100">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <div className="flex items-start gap-3">
          <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-600">Informational only — not legal or financial advice.</strong>{" "}
            This article from the PawTenant Editorial Team explains how pet rent and pet fees work and
            how housing-focused ESA documentation fits in. Pet-rent figures shown in calculators and
            examples are estimates only. PawTenant connects you with licensed mental health providers
            who decide whether an ESA letter is clinically appropriate; it does not sell ESA
            registrations, claim any government affiliation, or guarantee landlord approval, fee
            waivers, or any specific housing outcome. Rents, pet fees, and applicable law vary by
            housing provider and location — for your situation, consult your lease, your housing
            provider, or a qualified professional.
          </p>
        </div>
      </div>
    </section>
  );
}
