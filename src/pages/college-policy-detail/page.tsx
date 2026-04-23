import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { getCollegeBySlug, colleges } from "../../mocks/colleges";

export default function CollegePolicyDetailPage() {
  const { college: slug } = useParams<{ college: string }>();
  const college = getCollegeBySlug(slug || "");
  const otherColleges = colleges.filter((c) => c.slug !== slug).slice(0, 4);

  useEffect(() => {
    if (!college) return;

    const title = college.metaTitle;
    const description = college.metaDesc;
    const canonical = `https://www.pawtenant.com/college-pet-policy/${college.slug}`;

    document.title = title;

    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) { el = document.createElement("link"); el.setAttribute("rel", rel); document.head.appendChild(el); }
      el.setAttribute("href", href);
    };

    setMeta("description", description);
    setMeta("keywords", `ESA letter ${college.name}, ${college.name} ESA policy, emotional support animal ${college.name}, ESA dorm ${college.name}, college ESA housing`);
    setLink("canonical", canonical);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);
    setMeta("og:type", "website", true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title, true);
    setMeta("twitter:description", description, true);

    const existingSchema = document.getElementById("college-esa-schema");
    if (existingSchema) existingSchema.remove();

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "mainEntity": college.faq.map((f) => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": { "@type": "Answer", "text": f.answer },
          })),
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "College Pet Policy", "item": "https://www.pawtenant.com/college-pet-policy" },
            { "@type": "ListItem", "position": 3, "name": college.name, "item": canonical },
          ],
        },
      ],
    };

    const script = document.createElement("script");
    script.id = "college-esa-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const schemaEl = document.getElementById("college-esa-schema");
      if (schemaEl) schemaEl.remove();
    };
  }, [college]);

  if (!college) {
    return (
      <main className="min-w-[1024px]">
        <SharedNavbar />
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">College Not Found</h1>
          <p className="text-gray-500 mb-6">We couldn&apos;t find information for this college.</p>
          <Link to="/college-pet-policy" className="whitespace-nowrap px-6 py-3 bg-orange-500 text-white rounded-md font-semibold text-sm hover:bg-orange-600 cursor-pointer">
            Browse All Colleges
          </Link>
        </div>
        <SharedFooter />
      </main>
    );
  }

  return (
    <main className="min-w-[1024px]">
      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={college.image} alt={college.name} className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/60 to-transparent"></div>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-2 mb-4">
            <Link to="/college-pet-policy" className="text-white/60 text-xs hover:text-white cursor-pointer">College Pet Policy</Link>
            <i className="ri-arrow-right-s-line text-white/40 text-xs"></i>
            <span className="text-white/80 text-xs">{college.name}</span>
          </div>
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 bg-orange-500/20 text-orange-300 text-xs font-semibold rounded-full uppercase tracking-widest mb-3">
              {college.location}
            </span>
            <h1 className="text-3xl font-bold text-white mb-3">
              ESA Letter for {college.name} Students
            </h1>
            <p className="text-white/80 text-sm leading-relaxed mb-6 max-w-lg">
              {college.esaPolicy}
            </p>
            <div className="flex gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap px-5 py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Get My ESA Letter
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Key Facts + Housing Policy */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-8">
              {/* Housing Policy */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">{college.name} ESA Housing Policy</h2>
                <p className="text-gray-500 text-sm leading-relaxed">{college.housingPolicy}</p>
              </div>
              {/* Application Process */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Application Process</h2>
                <div className="space-y-3">
                  {college.applicationProcess.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 flex items-center justify-center bg-orange-500 text-white text-xs font-bold rounded-full flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Allowed / Restricted */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-checkbox-circle-fill text-green-500"></i>
                    </div>
                    Where ESAs Are Allowed
                  </h3>
                  <ul className="space-y-2">
                    {college.allowedAreas.map((area, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className="ri-check-line text-green-500 text-xs"></i>
                        </div>
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-close-circle-fill text-red-400"></i>
                    </div>
                    Restrictions
                  </h3>
                  <ul className="space-y-2">
                    {college.restrictions.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className="ri-close-line text-red-400 text-xs"></i>
                        </div>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-5">
              {/* Key Facts */}
              <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Key Facts</h3>
                <ul className="space-y-2.5">
                  {college.keyFacts.map((fact, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-check-fill text-orange-500"></i>
                      </div>
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
              {/* University Info */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3">University Info</h3>
                <div className="space-y-2.5 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Location</span><span className="font-medium text-gray-700">{college.location}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Type</span><span className="font-medium text-gray-700">{college.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Enrollment</span><span className="font-medium text-gray-700">{college.enrollment}</span>
                  </div>
                </div>
              </div>
              {/* CTA */}
              <div className="bg-gray-900 rounded-2xl p-5 text-center">
                <i className="ri-file-text-fill text-orange-500 text-2xl mb-2 block"></i>
                <h3 className="text-sm font-bold text-white mb-2">Get Your ESA Letter Today</h3>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  University-compliant letter from a licensed professional. Accepted at {college.name} and nationwide.
                </p>
                <Link
                  to="/assessment"
                  className="whitespace-nowrap block w-full py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-center"
                >
                  Get Started — From $99
                </Link>
                <p className="text-xs text-gray-500 mt-2">100% money-back guarantee</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-[#fdf8f3]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-xl font-bold text-gray-900 mb-7">FAQs: ESA at {college.name}</h2>
          <div className="space-y-3">
            {college.faq.map((f, i) => (
              <details key={i} className="bg-white rounded-xl border border-gray-100 group">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <span className="text-sm font-semibold text-gray-800">{f.question}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-4">
                    <i className="ri-add-line text-orange-500 group-open:hidden"></i>
                    <i className="ri-subtract-line text-orange-500 hidden group-open:block"></i>
                  </div>
                </summary>
                <div className="px-5 pb-5">
                  <p className="text-sm text-gray-500 leading-relaxed">{f.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Other Colleges */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">ESA Policies at Other Universities</h2>
          <div className="grid grid-cols-4 gap-5">
            {otherColleges.map((c) => (
              <Link
                key={c.slug}
                to={`/college-pet-policy/${c.slug}`}
                className="group bg-[#fdf8f3] rounded-xl overflow-hidden border border-orange-100 hover:border-orange-300 transition-all cursor-pointer"
              >
                <div className="h-28 overflow-hidden">
                  <img src={c.image} alt={c.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-3">
                  <p className="text-xs font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.location}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/college-pet-policy" className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer inline-flex items-center gap-1">
              View All Colleges <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
