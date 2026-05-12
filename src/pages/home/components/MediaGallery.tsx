import { useState } from "react";
import { Link } from "react-router-dom";

// Helper for schema.org URLs (must be absolute per spec)
const SITE = "https://www.pawtenant.com";
const abs = (p: string) => `${SITE}${p}`;

// Every image below is a real, calm, professional photograph that
// physically exists in public/assets/. No AI-generated graphics, no
// fake testimonials, no stock-photo families. Each card links to a
// real PawTenant resource page.
const galleryImages = [
  {
    src: "/assets/blog/owner-laptop-cuddle.jpg",
    alt: "What is an Emotional Support Animal ESA — overview and housing rights guide USA",
    title: "What Is an Emotional Support Animal?",
    caption: "ESA Housing Rights",
    link: "/how-to-get-esa-letter",
    schema: {
      "@type": "ImageObject",
      "name": "What Is an Emotional Support Animal (ESA)",
      "description": "Comprehensive guide to understanding ESA designation, legal rights, and how to qualify for an ESA letter in the USA.",
      "url": abs("/assets/blog/owner-laptop-cuddle.jpg"),
      "contentUrl": abs("/assets/blog/owner-laptop-cuddle.jpg"),
    },
  },
  {
    src: "/assets/blog/fp-windowsill-dog.jpg",
    alt: "ESA housing protection support — Fair Housing Act tenant rights emotional support animal",
    title: "ESA Housing Protection",
    caption: "Fair Housing Act",
    link: "/housing-rights-esa",
    schema: {
      "@type": "ImageObject",
      "name": "ESA Housing Protection Support",
      "description": "ESA housing rights under the Fair Housing Act — what landlords cannot do and how to assert your rights.",
      "url": abs("/assets/blog/fp-windowsill-dog.jpg"),
      "contentUrl": abs("/assets/blog/fp-windowsill-dog.jpg"),
    },
  },
  {
    src: "/assets/lifestyle/woman-telehealth-with-dog.jpg",
    alt: "Simple online ESA letter approval — telehealth consultation with a licensed mental health practitioner",
    title: "Simple Online Approval",
    caption: "Same-Day Delivery",
    link: "/assessment",
    schema: {
      "@type": "ImageObject",
      "name": "Simple Online ESA Letter Approval",
      "description": "PawTenant's simple online ESA letter approval process — telehealth consultation, same-day delivery.",
      "url": abs("/assets/lifestyle/woman-telehealth-with-dog.jpg"),
      "contentUrl": abs("/assets/lifestyle/woman-telehealth-with-dog.jpg"),
    },
  },
  {
    src: "/assets/blog/smiley-tablet.jpg",
    alt: "Licensed mental health practitioners issuing ESA letters via telehealth in 2026",
    title: "Licensed Mental Health Practitioners",
    caption: "Board-Certified Providers",
    link: "/how-to-get-esa-letter",
    schema: {
      "@type": "ImageObject",
      "name": "Licensed Mental Health Practitioners",
      "description": "PawTenant works exclusively with board-licensed mental health practitioners to issue ESA and PSD letters.",
      "url": abs("/assets/blog/smiley-tablet.jpg"),
      "contentUrl": abs("/assets/blog/smiley-tablet.jpg"),
    },
  },
  {
    src: "/assets/blog/man-working-dog.jpg",
    alt: "Everything you need to know about psychiatric service dogs PSD and emotional support animals ESA",
    title: "Service Dog & PSD Guide",
    caption: "PSD Letters",
    link: "/all-about-service-dogs",
    schema: {
      "@type": "ImageObject",
      "name": "Everything About Service Dogs and ESAs",
      "description": "Complete guide to service dogs, psychiatric service dogs (PSDs), and ESAs — legal rights and how to qualify.",
      "url": abs("/assets/blog/man-working-dog.jpg"),
      "contentUrl": abs("/assets/blog/man-working-dog.jpg"),
    },
  },
  {
    src: "/assets/blog/cafe-retriever.jpg",
    alt: "Airline pet and ESA policy guide 2026 — flying with emotional support animals and service dogs",
    title: "Airline ESA Policy 2026",
    caption: "Travel Guide",
    link: "/airline-pet-policy",
    schema: {
      "@type": "ImageObject",
      "name": "Airline Pet & ESA Policy Guide 2026",
      "description": "Complete 2026 airline policy guide for traveling with emotional support animals and psychiatric service dogs.",
      "url": abs("/assets/blog/cafe-retriever.jpg"),
      "contentUrl": abs("/assets/blog/cafe-retriever.jpg"),
    },
  },
  {
    src: "/assets/blog/woman-looking-dog.jpg",
    alt: "Federal laws that protect a college student ESA rights in university housing 2026",
    title: "College Student ESA Laws",
    caption: "University Housing",
    link: "/college-pet-policy",
    schema: {
      "@type": "ImageObject",
      "name": "Laws That Protect a College Student's ESA",
      "description": "Federal and state laws protecting college students' ESA rights in university housing and dormitories.",
      "url": abs("/assets/blog/woman-looking-dog.jpg"),
      "contentUrl": abs("/assets/blog/woman-looking-dog.jpg"),
    },
  },
  {
    src: "/assets/blog/hands-typing-dog.jpg",
    alt: "How to get a psychiatric service dog PSD letter from a licensed mental health practitioner online in 2026",
    title: "How to Get a PSD Letter",
    caption: "PSD Assessment",
    link: "/how-to-get-psd-letter",
    schema: {
      "@type": "ImageObject",
      "name": "How to Get a Psychiatric Service Dog Letter",
      "description": "Step-by-step guide to getting a PSD letter from a licensed mental health practitioner in 2026.",
      "url": abs("/assets/blog/hands-typing-dog.jpg"),
      "contentUrl": abs("/assets/blog/hands-typing-dog.jpg"),
    },
  },
  {
    src: "/assets/blog/man-puppy-portrait.jpg",
    alt: "What is a psychiatric service dog PSD letter and what rights does it provide housing travel",
    title: "What Is a PSD Letter?",
    caption: "Service Dog Rights",
    link: "/all-about-service-dogs",
    schema: {
      "@type": "ImageObject",
      "name": "What Is a PSD Letter",
      "description": "Understanding what a psychiatric service dog letter is, how it differs from an ESA letter, and what legal rights it provides.",
      "url": abs("/assets/blog/man-puppy-portrait.jpg"),
      "contentUrl": abs("/assets/blog/man-puppy-portrait.jpg"),
    },
  },
  {
    src: "/assets/blog/hug-close-1.jpg",
    alt: "Removing barriers between people and their support animals — ESA housing disability rights USA",
    title: "Removing Barriers",
    caption: "Disability Rights",
    link: "/housing-rights-esa",
    schema: {
      "@type": "ImageObject",
      "name": "Removing Barriers Between People and Their Support Animals",
      "description": "How ESA and PSD laws remove housing barriers for people with disabilities across all 50 US states.",
      "url": abs("/assets/blog/hug-close-1.jpg"),
      "contentUrl": abs("/assets/blog/hug-close-1.jpg"),
    },
  },
];

const schemaData = {
  "@context": "https://schema.org",
  "@type": "ImageGallery",
  "name": "PawTenant ESA & PSD Resource Image Gallery",
  "description":
    "Professional image gallery showcasing ESA housing rights, PSD letters, mental health support, and emotional support animal guides from PawTenant.",
  "url": SITE + "/",
  "image": galleryImages.map((img) => img.schema),
};

export default function MediaGallery() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <section className="py-16 bg-[#fdf8f3]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      <div className="max-w-7xl mx-auto px-5 md:px-6">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
            Media &amp; Resources
          </span>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Trusted ESA &amp; PSD Resources
          </h2>
          <p className="text-gray-500 text-sm max-w-xl mx-auto leading-relaxed">
            Professional guides covering housing rights, mental health support, travel, and
            state-specific ESA laws — all backed by licensed mental health practitioners.
          </p>
        </div>

        {/* Masonry-style grid */}
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
          {galleryImages.map((img, i) => (
            <div
              key={img.src}
              className="break-inside-avoid group relative overflow-hidden rounded-xl cursor-pointer"
              onClick={() => setActiveIndex(activeIndex === i ? null : i)}
            >
              <img
                src={img.src}
                alt={img.alt}
                title={img.title}
                className="w-full h-auto object-cover object-top group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                <p className="text-white text-xs font-bold leading-tight">{img.title}</p>
                <span className="inline-block mt-1 text-orange-300 text-xs font-semibold">
                  {img.caption}
                </span>
              </div>
              {/* Wrap whole card in a link so the gallery is keyboard- and SEO-accessible */}
              <Link
                to={img.link}
                className="absolute inset-0"
                aria-label={img.title}
              />
            </div>
          ))}
        </div>

        {/* Quick Links Row */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {[
            { label: "ESA Housing Rights", to: "/housing-rights-esa" },
            { label: "Service Dog Guide", to: "/all-about-service-dogs" },
            { label: "Airline ESA Policy", to: "/airline-pet-policy" },
            { label: "College ESA Guide", to: "/college-pet-policy" },
            { label: "Get PSD Letter", to: "/how-to-get-psd-letter" },
            { label: "All State Guides", to: "/explore-esa-letters-all-states" },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:border-orange-300 hover:text-orange-600 text-gray-600 text-xs font-semibold rounded-full transition-colors cursor-pointer"
            >
              <div className="w-3.5 h-3.5 flex items-center justify-center">
                <i className="ri-arrow-right-s-line text-orange-400 text-xs"></i>
              </div>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
