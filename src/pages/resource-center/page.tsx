import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { usStates } from "../../mocks/states";
import { usPSDStates } from "../../mocks/statesPSD";
import { blogPosts } from "../../mocks/blogPosts";
import { blogPostsExtended } from "../../mocks/blogPostsExtended";
import { blogPostsExtended2 } from "../../mocks/blogPostsExtended2";

const allPosts = [...blogPosts, ...blogPostsExtended, ...blogPostsExtended2];

const guides = [
  { to: "/how-to-get-esa-letter", title: "How to Get an ESA Letter", desc: "Step-by-step guide to obtaining a legitimate ESA letter from a licensed LMHP.", icon: "ri-book-open-line", tag: "ESA Guide" },
  { to: "/housing-rights-esa", title: "ESA Housing Rights Guide", desc: "Complete guide to Fair Housing Act rights for emotional support animal owners.", icon: "ri-home-heart-line", tag: "Housing" },
  { to: "/how-to-get-psd-letter", title: "How to Get a PSD Letter", desc: "Everything you need to know about Psychiatric Service Dog letters and ADA rights.", icon: "ri-mental-health-line", tag: "PSD Guide" },
  { to: "/all-about-service-dogs", title: "All About Service Dogs", desc: "Complete guide to service dogs, PSDs, and their rights under the ADA.", icon: "ri-guide-line", tag: "Service Dogs" },
  { to: "/esa-letter-cost", title: "ESA Letter Cost Guide", desc: "How much does an ESA letter cost? What's included and what to watch out for.", icon: "ri-money-dollar-circle-line", tag: "Cost" },
  { to: "/service-animal-vs-esa", title: "Service Animal vs ESA", desc: "Understanding the key legal differences between service animals and ESAs.", icon: "ri-scales-line", tag: "Comparison" },
  { to: "/airline-pet-policy", title: "Airline Pet Policy Guide", desc: "2026 airline pet and ESA policies — which airlines allow pets and how to travel.", icon: "ri-flight-land-line", tag: "Travel" },
  { to: "/college-pet-policy", title: "College ESA Policy Guide", desc: "ESA rights in university housing — your college campus rights explained.", icon: "ri-graduation-cap-line", tag: "College" },
  { to: "/renew-esa-letter", title: "Renew Your ESA Letter", desc: "When and how to renew your ESA letter — annual renewal guide.", icon: "ri-refresh-line", tag: "Renewal" },
  { to: "/no-risk-guarantee", title: "Our 100% Guarantee", desc: "PawTenant's money-back guarantee and what it covers.", icon: "ri-shield-check-line", tag: "Trust" },
  { to: "/faqs", title: "ESA & PSD FAQs", desc: "Most common questions about emotional support animals and psychiatric service dogs.", icon: "ri-questionnaire-line", tag: "FAQ" },
  { to: "/about-us", title: "About PawTenant", desc: "Our story, mission, licensed providers, and why 12,000+ patients trust us.", icon: "ri-team-line", tag: "About" },
];

const blogCategories = ["All", "ESA", "PSD", "Housing", "Travel", "Mental Health", "State Guides"];

const highTrafficESAStates = usStates.filter(s =>
  ["california","texas","florida","new-york","ohio","washington","illinois","pennsylvania","georgia","north-carolina","arizona","michigan","new-jersey","virginia","colorado","minnesota","oregon"].includes(s.slug)
);

const highTrafficPSDStates = usPSDStates.filter(s =>
  ["california","texas","florida","new-york","ohio","washington","illinois","pennsylvania","georgia","north-carolina","arizona","michigan","new-jersey","virginia","colorado","minnesota","oregon"].includes(s.slug)
);

export default function ResourceCenterPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [showAllESA, setShowAllESA] = useState(false);
  const [showAllPSD, setShowAllPSD] = useState(false);

  const filteredPosts = activeCategory === "All"
    ? allPosts
    : allPosts.filter(p => p.category === activeCategory);

  const esaStatesToShow = showAllESA ? usStates : highTrafficESAStates;
  const psdStatesToShow = showAllPSD ? usPSDStates : highTrafficPSDStates;

  return (
    <main>
      <title>ESA &amp; PSD Resource Center 2026 — Complete Guide Hub | PawTenant</title>
      <meta name="description" content="PawTenant's complete ESA and PSD resource hub — guides, state-specific laws, blog posts, housing rights, travel policies, and mental health resources. Everything you need to know about ESA letters and PSD letters in 2026." />
      <meta name="keywords" content="ESA resource center, PSD resource center, ESA letter guide, psychiatric service dog guide, emotional support animal resources, ESA state laws 2026, PSD letter states" />
      <link rel="canonical" href="https://www.pawtenant.com/resource-center" />
      <meta property="og:title" content="ESA & PSD Resource Center 2026 — Complete Guide Hub | PawTenant" />
      <meta property="og:description" content="Complete hub for all ESA and PSD resources — state guides, housing rights, travel policies, mental health articles, and more." />
      <meta property="og:url" content="https://www.pawtenant.com/resource-center" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "ESA & PSD Resource Center 2026",
        "description": "PawTenant's complete hub of ESA and PSD resources, state guides, housing rights, and mental health articles.",
        "url": "https://www.pawtenant.com/resource-center",
        "publisher": { "@type": "Organization", "name": "PawTenant", "url": "https://www.pawtenant.com" },
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "Resource Center", "item": "https://www.pawtenant.com/resource-center" }
          ]
        }
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-24 pb-14 bg-gray-900 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=library%20bookshelf%20with%20warm%20light%2C%20open%20books%20on%20desk%2C%20organized%20knowledge%20resource%20center%2C%20warm%20amber%20tones%2C%20cozy%20reading%20environment%2C%20professional%20educational%20setting&width=1440&height=500&seq=resourcehero01&orientation=landscape"
            alt="ESA and PSD Resource Center"
            className="w-full h-full object-cover object-top opacity-20"
          />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-5 text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-400 bg-orange-500/15 px-3 py-1.5 rounded-full mb-4">Complete Resource Hub</span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-5">
            ESA &amp; PSD Resource Center 2026
          </h1>
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
            Every guide, state law, blog post, and resource you need to understand your rights and get a legitimate ESA or PSD letter — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {["All 50 States Covered", "2026 Updated Laws", "ESA + PSD Guides", "Housing & Travel"].map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                <i className="ri-checkbox-circle-fill text-orange-400"></i>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-5 flex gap-1 overflow-x-auto py-3 scrollbar-none">
          {[
            { label: "Guides", href: "#guides" },
            { label: "Blog Posts", href: "#blog" },
            { label: "ESA by State", href: "#esa-states" },
            { label: "PSD by State", href: "#psd-states" },
            { label: "Start Assessment", href: "/assessment" },
          ].map(link => (
            link.href.startsWith("#") ? (
              <a
                key={link.label}
                href={link.href}
                className="whitespace-nowrap px-4 py-1.5 text-sm font-semibold text-gray-600 hover:text-orange-500 rounded-full hover:bg-orange-50 transition-colors cursor-pointer"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                to={link.href}
                className="whitespace-nowrap px-4 py-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-full transition-colors cursor-pointer"
              >
                {link.label}
              </Link>
            )
          ))}
        </div>
      </nav>

      {/* Stats Row */}
      <section className="bg-orange-500 py-8">
        <div className="max-w-5xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { value: `${allPosts.length}+`, label: "Blog Articles" },
            { value: "50", label: "State ESA Guides" },
            { value: "50", label: "State PSD Guides" },
            { value: `${guides.length}`, label: "Core Guides" },
          ].map(s => (
            <div key={s.label}>
              <p className="text-2xl md:text-3xl font-black text-white">{s.value}</p>
              <p className="text-orange-100 text-xs font-medium mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Core Guides Grid */}
      <section id="guides" className="py-16 bg-white scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2 block">Essential Reading</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Core ESA &amp; PSD Guides</h2>
            <p className="text-gray-500 text-sm mt-1">Our comprehensive guides covering every aspect of ESA and PSD laws, rights, and processes.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {guides.map(guide => (
              <Link
                key={guide.to}
                to={guide.to}
                className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-orange-200 hover:bg-orange-50/30 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg">
                    <i className={`${guide.icon} text-orange-500`}></i>
                  </div>
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{guide.tag}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1.5 group-hover:text-orange-600 transition-colors">{guide.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{guide.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Posts */}
      <section id="blog" className="py-16 bg-[#fafafa] scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2 block">In-Depth Articles</span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Blog &amp; Articles</h2>
            </div>
            <Link to="/blog" className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer">
              View All Posts &rarr;
            </Link>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap mb-8">
            {blogCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 text-xs font-semibold rounded-full transition-colors cursor-pointer ${activeCategory === cat ? "bg-orange-500 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300"}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPosts.slice(0, 12).map(post => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-orange-200 transition-all cursor-pointer"
              >
                <div className="h-36 overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">{post.category}</span>
                    <span className="text-xs text-gray-400">{post.readTime}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-orange-600 transition-colors">{post.title}</h3>
                </div>
              </Link>
            ))}
          </div>
          {filteredPosts.length > 12 && (
            <div className="text-center mt-8">
              <Link to="/blog" className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer">
                View All {filteredPosts.length} Posts <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ESA State Directory */}
      <section id="esa-states" className="py-16 bg-white scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2 block">State-Specific Laws</span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">ESA Letters by State</h2>
              <p className="text-gray-500 text-sm mt-1">Click your state to see local ESA laws, housing rights, and get your letter.</p>
            </div>
            <Link to="/explore-esa-letters-all-states" className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer">
              Full State Directory &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
            {esaStatesToShow.map(state => (
              <Link
                key={state.slug}
                to={`/esa-letter-${state.slug}`}
                className="flex items-center gap-2 p-3 bg-[#fdf6ee] rounded-xl hover:bg-orange-100 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 group-hover:bg-orange-200 transition-colors">
                  <span className="text-xs font-black text-orange-600">{state.abbreviation}</span>
                </div>
                <span className="text-xs font-semibold text-gray-800 leading-tight">{state.name}</span>
              </Link>
            ))}
          </div>

          {!showAllESA && (
            <button
              onClick={() => setShowAllESA(true)}
              className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer flex items-center gap-1"
            >
              <i className="ri-add-line"></i> Show All 50 States
            </button>
          )}
        </div>
      </section>

      {/* PSD State Directory */}
      <section id="psd-states" className="py-16 bg-[#fafafa] scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2 block">Psychiatric Service Dogs</span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">PSD Letters by State</h2>
              <p className="text-gray-500 text-sm mt-1">Find your state&apos;s PSD laws, ADA rights, and get your Psychiatric Service Dog letter.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
            {psdStatesToShow.map(state => (
              <Link
                key={state.slug}
                to={`/psd-letter/${state.slug}`}
                className="flex items-center gap-2 p-3 bg-white rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0 group-hover:bg-orange-100 transition-colors">
                  <span className="text-xs font-black text-gray-600 group-hover:text-orange-600 transition-colors">{state.abbreviation}</span>
                </div>
                <span className="text-xs font-semibold text-gray-800 leading-tight">{state.name}</span>
              </Link>
            ))}
          </div>

          {!showAllPSD && (
            <button
              onClick={() => setShowAllPSD(true)}
              className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer flex items-center gap-1"
            >
              <i className="ri-add-line"></i> Show All 50 States
            </button>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-14 bg-orange-500">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">
            Ready to Get Your ESA or PSD Letter?
          </h2>
          <p className="text-orange-100 mb-8 text-sm">
            Licensed professionals, same-day delivery, 100% money-back guarantee — serving all 50 states.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-orange-600 font-bold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
            >
              <i className="ri-heart-line"></i> Get ESA Letter
            </Link>
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-orange-700 text-white font-bold text-sm rounded-md hover:bg-orange-800 transition-colors cursor-pointer"
            >
              <i className="ri-mental-health-line"></i> Get PSD Letter
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
