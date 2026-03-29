import { useState } from "react";
import { Link } from "react-router-dom";

const galleryImages = [
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/13037e49-5dee-4f4b-ae8a-c2d1ab78b6d5_What-Is-an-Emotional-Support-Animal-ESA.jpg?v=f7097c36da8144b17b45b9d7d5a1d06f",
    alt: "What is an Emotional Support Animal ESA — overview and housing rights guide USA",
    title: "What Is an Emotional Support Animal?",
    caption: "ESA Housing Rights",
    link: "/how-to-get-esa-letter",
    schema: {
      "@type": "ImageObject",
      "name": "What Is an Emotional Support Animal (ESA)",
      "description": "Comprehensive guide to understanding ESA designation, legal rights, and how to qualify for an ESA letter in the USA.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/13037e49-5dee-4f4b-ae8a-c2d1ab78b6d5_What-Is-an-Emotional-Support-Animal-ESA.jpg?v=f7097c36da8144b17b45b9d7d5a1d06f",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/13037e49-5dee-4f4b-ae8a-c2d1ab78b6d5_What-Is-an-Emotional-Support-Animal-ESA.jpg?v=f7097c36da8144b17b45b9d7d5a1d06f",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/d865c255-b615-451f-a02d-71420df80d88_Housing-Protection-Support.jpg?v=c3cc0edf08b5cac53b799c74d0c40b95",
    alt: "ESA housing protection support — Fair Housing Act tenant rights emotional support animal",
    title: "ESA Housing Protection",
    caption: "Fair Housing Act",
    link: "/housing-rights-esa",
    schema: {
      "@type": "ImageObject",
      "name": "ESA Housing Protection Support",
      "description": "ESA housing rights under the Fair Housing Act — what landlords cannot do and how to assert your rights.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/d865c255-b615-451f-a02d-71420df80d88_Housing-Protection-Support.jpg?v=c3cc0edf08b5cac53b799c74d0c40b95",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/d865c255-b615-451f-a02d-71420df80d88_Housing-Protection-Support.jpg?v=c3cc0edf08b5cac53b799c74d0c40b95",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/9b84851b-3705-4e4e-8dc8-0e9c04e43242_Simple-Online-Approval.jpg?v=145826463a27215e63a6b5f46f73b69b",
    alt: "Simple online ESA letter approval process — licensed professional telehealth consultation",
    title: "Simple Online Approval",
    caption: "Same-Day Delivery",
    link: "/assessment",
    schema: {
      "@type": "ImageObject",
      "name": "Simple Online ESA Letter Approval",
      "description": "PawTenant's simple online ESA letter approval process — telehealth consultation, same-day delivery.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/9b84851b-3705-4e4e-8dc8-0e9c04e43242_Simple-Online-Approval.jpg?v=145826463a27215e63a6b5f46f73b69b",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/9b84851b-3705-4e4e-8dc8-0e9c04e43242_Simple-Online-Approval.jpg?v=145826463a27215e63a6b5f46f73b69b",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0",
    alt: "Licensed mental health professionals LMHP issuing ESA letters via telehealth USA 2026",
    title: "Licensed Professionals",
    caption: "Board-Certified LMHPs",
    link: "/how-to-get-esa-letter",
    schema: {
      "@type": "ImageObject",
      "name": "Licensed Mental Health Professionals",
      "description": "PawTenant works exclusively with board-licensed mental health professionals to issue ESA and PSD letters.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/aee06116-f060-432c-9708-efefb3518d9b_Everything-You-Need-to-Know-About-Service-Dogs.jpg?v=a7de4185fc4f47c2749bf7e7906fe127",
    alt: "Everything you need to know about psychiatric service dogs PSD and emotional support animals ESA",
    title: "Service Dog & PSD Guide",
    caption: "PSD Letters",
    link: "/all-about-service-dogs",
    schema: {
      "@type": "ImageObject",
      "name": "Everything About Service Dogs and ESAs",
      "description": "Complete guide to service dogs, psychiatric service dogs (PSDs), and ESAs — legal rights and how to qualify.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/aee06116-f060-432c-9708-efefb3518d9b_Everything-You-Need-to-Know-About-Service-Dogs.jpg?v=a7de4185fc4f47c2749bf7e7906fe127",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/aee06116-f060-432c-9708-efefb3518d9b_Everything-You-Need-to-Know-About-Service-Dogs.jpg?v=a7de4185fc4f47c2749bf7e7906fe127",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/27841c36-74a5-4e2f-b810-72504b6b7e2a_Airline-Pet--ESA-Policy-Guide-2026.jpg?v=958e516b05dce6aa12bc43afa9d02919",
    alt: "Airline pet and ESA policy guide 2026 — flying with emotional support animals and service dogs",
    title: "Airline ESA Policy 2026",
    caption: "Travel Guide",
    link: "/airline-pet-policy",
    schema: {
      "@type": "ImageObject",
      "name": "Airline Pet & ESA Policy Guide 2026",
      "description": "Complete 2026 airline policy guide for traveling with emotional support animals and psychiatric service dogs.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/27841c36-74a5-4e2f-b810-72504b6b7e2a_Airline-Pet--ESA-Policy-Guide-2026.jpg?v=958e516b05dce6aa12bc43afa9d02919",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/27841c36-74a5-4e2f-b810-72504b6b7e2a_Airline-Pet--ESA-Policy-Guide-2026.jpg?v=958e516b05dce6aa12bc43afa9d02919",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/7efddf74-4a4d-4bfb-b606-afc0060a9955_Laws-That-Protect-a-College-Students-ESA.jpg?v=0df93183a2f7372a30c9683a689dd88e",
    alt: "Federal laws that protect a college student ESA rights in university housing 2026",
    title: "College Student ESA Laws",
    caption: "University Housing",
    link: "/college-pet-policy",
    schema: {
      "@type": "ImageObject",
      "name": "Laws That Protect a College Student's ESA",
      "description": "Federal and state laws protecting college students' ESA rights in university housing and dormitories.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/7efddf74-4a4d-4bfb-b606-afc0060a9955_Laws-That-Protect-a-College-Students-ESA.jpg?v=0df93183a2f7372a30c9683a689dd88e",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/7efddf74-4a4d-4bfb-b606-afc0060a9955_Laws-That-Protect-a-College-Students-ESA.jpg?v=0df93183a2f7372a30c9683a689dd88e",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/925edf71-8f53-4f8f-8180-12a475777e58_How-to-Get-a-Psychiatric-Service-Dog-Letter.jpg?v=d622f9279132e3d201c18ec9bc2a95ab",
    alt: "How to get a psychiatric service dog PSD letter licensed professional online 2026",
    title: "How to Get a PSD Letter",
    caption: "PSD Assessment",
    link: "/how-to-get-psd-letter",
    schema: {
      "@type": "ImageObject",
      "name": "How to Get a Psychiatric Service Dog Letter",
      "description": "Step-by-step guide to getting a PSD letter from a licensed mental health professional in 2026.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/925edf71-8f53-4f8f-8180-12a475777e58_How-to-Get-a-Psychiatric-Service-Dog-Letter.jpg?v=d622f9279132e3d201c18ec9bc2a95ab",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/925edf71-8f53-4f8f-8180-12a475777e58_How-to-Get-a-Psychiatric-Service-Dog-Letter.jpg?v=d622f9279132e3d201c18ec9bc2a95ab",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/626a4b1c-6e1e-4903-b4bd-b67a5b1e37f7_What-is-a-PSD-Letter.jpg?v=8af77abe89f837f83927117fef15ce63",
    alt: "What is a psychiatric service dog PSD letter and what rights does it provide housing travel",
    title: "What Is a PSD Letter?",
    caption: "Service Dog Rights",
    link: "/all-about-service-dogs",
    schema: {
      "@type": "ImageObject",
      "name": "What Is a PSD Letter",
      "description": "Understanding what a psychiatric service dog letter is, how it differs from an ESA letter, and what legal rights it provides.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/626a4b1c-6e1e-4903-b4bd-b67a5b1e37f7_What-is-a-PSD-Letter.jpg?v=8af77abe89f837f83927117fef15ce63",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/626a4b1c-6e1e-4903-b4bd-b67a5b1e37f7_What-is-a-PSD-Letter.jpg?v=8af77abe89f837f83927117fef15ce63",
    }
  },
  {
    src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/561aa113-dc1b-4213-a6f8-e9f681bd9156_Removing-Barriers-Between-People--Their-Support-Animals.jpg?v=9b0341ba256bb320f627993afbd6b622",
    alt: "Removing barriers between people and their support animals ESA housing disability rights USA",
    title: "Removing Barriers",
    caption: "Disability Rights",
    link: "/housing-rights-esa",
    schema: {
      "@type": "ImageObject",
      "name": "Removing Barriers Between People and Their Support Animals",
      "description": "How ESA and PSD laws remove housing barriers for people with disabilities across all 50 US states.",
      "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/561aa113-dc1b-4213-a6f8-e9f681bd9156_Removing-Barriers-Between-People--Their-Support-Animals.jpg?v=9b0341ba256bb320f627993afbd6b622",
      "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/561aa113-dc1b-4213-a6f8-e9f681bd9156_Removing-Barriers-Between-People--Their-Support-Animals.jpg?v=9b0341ba256bb320f627993afbd6b622",
    }
  },
];

const schemaData = {
  "@context": "https://schema.org",
  "@type": "ImageGallery",
  "name": "PawTenant ESA & PSD Resource Image Gallery",
  "description": "Professional image gallery showcasing ESA housing rights, PSD letters, mental health support, and emotional support animal guides from PawTenant.",
  "url": "https://www.pawtenant.com/",
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
            Media & Resources
          </span>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Trusted ESA &amp; PSD Resources
          </h2>
          <p className="text-gray-500 text-sm max-w-xl mx-auto leading-relaxed">
            Professional guides covering housing rights, mental health support, travel, and state-specific ESA laws — all backed by licensed professionals.
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
                <span className="inline-block mt-1 text-orange-300 text-xs font-semibold">{img.caption}</span>
              </div>
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
