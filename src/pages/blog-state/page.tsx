import { useEffect, useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { blogPosts, BlogPost } from "../../mocks/blogPosts";
import { blogPostsExtended } from "../../mocks/blogPostsExtended";
import { blogPostsExtended2 } from "../../mocks/blogPostsExtended2";
import { STATE_BLOG_MAP, getStateBlogEntry } from "../../mocks/stateBlogMap";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const allBlogPosts: BlogPost[] = [...blogPostsExtended2, ...blogPostsExtended, ...blogPosts] as BlogPost[];

function getPostBySlug(slug: string): BlogPost | undefined {
  return allBlogPosts.find((p) => p.slug === slug);
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer flex flex-col"
    >
      <div className="h-44 overflow-hidden flex-shrink-0">
        <img
          src={post.image}
          alt={post.title}
          title={post.title}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">
            {post.category}
          </span>
          <span className="text-xs text-gray-400 whitespace-nowrap">{post.readTime}</span>
        </div>
        <h3 className="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors mb-2 leading-snug flex-1">
          {post.title}
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">{post.excerpt}</p>
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-auto">
          <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full flex-shrink-0">
            <i className="ri-user-line text-orange-500 text-xs"></i>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700 truncate">{post.author}</p>
            <p className="text-xs text-gray-400">{post.date}</p>
          </div>
          <div className="ml-auto w-6 h-6 flex items-center justify-center">
            <i className="ri-arrow-right-line text-orange-400 text-sm group-hover:translate-x-0.5 transition-transform"></i>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function BlogStatePage() {
  const { state: stateSlug } = useParams<{ state: string }>();
  const entry = getStateBlogEntry(stateSlug || "");
  const { withAttribution } = useAttributionParams();

  const statePosts = useMemo(() => {
    if (!entry) return [];
    return entry.postSlugs
      .map(getPostBySlug)
      .filter((p): p is BlogPost => !!p);
  }, [entry]);

  const canonicalUrl = `https://www.pawtenant.com/blog/state/${stateSlug}`;
  const pageTitle = entry ? `${entry.stateName} ESA Housing Rights Blog 2026 | PawTenant` : "ESA Blog | PawTenant";
  const pageDesc = entry ? `All ESA housing rights guides for ${entry.stateName} renters in 2026. ${entry.descriptor}. Written by licensed professionals at PawTenant.` : "";

  const itemListSchema = entry
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": `${entry.stateName} ESA Housing Rights Guides 2026`,
        "description": pageDesc,
        "url": canonicalUrl,
        "publisher": { "@type": "Organization", "name": "PawTenant", "url": "https://www.pawtenant.com/" },
        "hasPart": statePosts.map((p) => ({
          "@type": "BlogPosting",
          "headline": p.title,
          "url": `https://www.pawtenant.com/blog/${p.slug}`,
          "datePublished": p.date,
          "author": { "@type": "Person", "name": p.author },
          "description": p.metaDesc,
        })),
      })
    : "";

  const breadcrumbSchema = entry
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com/" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.pawtenant.com/blog" },
          { "@type": "ListItem", "position": 3, "name": `${entry.stateName} ESA Guides`, "item": canonicalUrl },
        ],
      })
    : "";

  // Inject schema via useEffect — MUST be before any conditional return (React rules of hooks)
  useEffect(() => {
    if (!entry) return;
    const schemas = [itemListSchema, breadcrumbSchema].filter(Boolean);
    const tags = schemas.map((s) => {
      const el = document.createElement("script");
      el.type = "application/ld+json";
      el.text = s;
      document.head.appendChild(el);
      return el;
    });
    return () => tags.forEach((el) => el.remove());
  }, [entry, itemListSchema, breadcrumbSchema]);

  // Redirect if state not found — AFTER all hooks
  if (!entry) {
    return <Navigate to="/blog" replace />;
  }

  // Other states for "Explore more" section
  const otherStates = STATE_BLOG_MAP.filter((e) => e.stateSlug !== stateSlug).slice(0, 12);

  return (
    <main>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
      <meta name="Last-Modified" content={new Date().toUTCString()} />

      <SharedNavbar />

      {/* Hero */}
      <section className="bg-[#fdf8f3] pt-32 pb-10 border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-5 md:px-6">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 mb-6 text-xs text-gray-400">
            <Link to="/" className="hover:text-orange-500 transition-colors">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-300"></i>
            <Link to="/blog" className="hover:text-orange-500 transition-colors">Blog</Link>
            <i className="ri-arrow-right-s-line text-gray-300"></i>
            <span className="text-gray-600 font-medium">{entry.stateName} ESA Guides</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full mb-4">
                <i className="ri-map-pin-2-line text-orange-500 text-xs"></i>
                State ESA Guide Cluster
              </span>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 leading-tight">
                {entry.stateName} ESA Housing Rights<br className="hidden sm:block" /> Blog 2026
              </h1>
              <p className="text-gray-500 text-sm max-w-2xl leading-relaxed">
                {entry.descriptor}. All articles written by PawTenant&apos;s licensed mental health professionals and housing rights specialists.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <Link
                to={`/esa-letter/${stateSlug}`}
                className="whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-md hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-file-text-line text-orange-500"></i>
                {entry.stateName} ESA Letter Info
              </Link>
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Get My ESA Letter
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-6 mt-8 pt-6 border-t border-orange-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-article-line text-orange-400"></i>
              </div>
              <span><strong className="text-gray-800">{statePosts.length}</strong> expert articles</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-shield-check-line text-orange-400"></i>
              </div>
              <span>FHA &amp; state law coverage</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-user-star-line text-orange-400"></i>
              </div>
              <span>Written by licensed professionals</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-calendar-check-line text-orange-400"></i>
              </div>
              <span>Updated 2026</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-5 md:px-6">
          <div className="flex flex-col lg:flex-row gap-10 items-start">

            {/* Post Grid */}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-800 mb-6">
                All {entry.stateName} ESA &amp; Housing Rights Guides
              </h2>

              {statePosts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {statePosts.map((post) => (
                    <PostCard key={post.slug} post={post} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-gray-50 rounded-xl">
                  <div className="w-12 h-12 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-3">
                    <i className="ri-article-line text-orange-400 text-xl"></i>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">
                    No articles found for {entry.stateName}
                  </p>
                  <Link to="/blog" className="whitespace-nowrap mt-3 inline-block text-xs text-orange-500 hover:text-orange-700 cursor-pointer">
                    Browse all articles
                  </Link>
                </div>
              )}

              {/* Key Topics for this state */}
              <div className="mt-10 p-6 bg-[#fdf8f3] rounded-xl border border-orange-100">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  Key {entry.stateName} ESA Topics Covered
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    `${entry.stateName} Fair Housing Act & FHA protections`,
                    `What ${entry.stateName} landlords can legally ask`,
                    `No-pet fee rules in ${entry.stateName} rentals`,
                    `${entry.stateName} ESA letter requirements`,
                    `HOA & condo ESA rights in ${entry.stateName}`,
                    `University housing ESA accommodation in ${entry.stateName}`,
                    `Filing a fair housing complaint in ${entry.stateName}`,
                    `${entry.stateName} ESA breed & size restriction rules`,
                  ].map((topic) => (
                    <div key={topic} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 flex items-center justify-center mt-0.5 flex-shrink-0">
                        <i className="ri-check-fill text-orange-500 text-xs"></i>
                      </div>
                      <span className="text-xs text-gray-600 leading-relaxed">{topic}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <aside className="w-full lg:w-72 lg:flex-shrink-0 space-y-5">
              {/* CTA */}
              <div className="bg-orange-500 rounded-xl p-5 text-white">
                <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-lg mb-3">
                  <i className="ri-shield-check-line text-white text-lg"></i>
                </div>
                <h3 className="font-bold text-sm mb-2">
                  Get Your {entry.stateName} ESA Letter
                </h3>
                <p className="text-xs text-white/85 leading-relaxed mb-4">
                  Licensed {entry.stateName} mental health professionals. FHA-compliant, same-day delivery, 100% money-back guarantee.
                </p>
                <Link
                  to={withAttribution("/assessment")}
                  className="whitespace-nowrap block text-center bg-white text-orange-600 font-bold text-xs px-4 py-2.5 rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  Start Free Assessment
                </Link>
              </div>

              {/* State ESA Letter Page */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                  {entry.stateName} Resources
                </h3>
                <div className="space-y-2">
                  {[
                    { label: `${entry.stateName} ESA Letter Guide`, to: `/esa-letter/${stateSlug}` },
                    { label: "ESA Housing Rights Guide", to: "/housing-rights-esa" },
                    { label: "ESA Laws by State", to: "/explore-esa-letters-all-states" },
                    { label: "ESA Letter Cost", to: "/esa-letter-cost" },
                    { label: "Start Your ESA Assessment", to: withAttribution("/assessment") },
                  ].map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="flex items-center gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer"
                    >
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className="ri-arrow-right-s-line text-orange-400"></i>
                      </div>
                      <span>{link.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Why PawTenant */}
              <div className="bg-[#fdf6ee] rounded-xl p-5 border border-orange-100">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Why PawTenant</h3>
                <ul className="space-y-2.5">
                  {[
                    `${entry.stateName}-licensed professionals`,
                    "Same-day letter delivery",
                    "100% money-back guarantee",
                    "HIPAA compliant & secure",
                    "FHA & state law compliant",
                  ].map((fact) => (
                    <li key={fact} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                        <i className="ri-check-fill text-orange-500 text-xs"></i>
                      </div>
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>

              {/* More State Blog Clusters */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                  Guides by State
                </h3>
                <div className="space-y-1.5">
                  {otherStates.map((s) => (
                    <Link
                      key={s.stateSlug}
                      to={`/blog/state/${s.stateSlug}`}
                      className="flex items-center gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer"
                    >
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className="ri-map-pin-2-line text-orange-400"></i>
                      </div>
                      <span>{s.stateName} ESA Guides</span>
                    </Link>
                  ))}
                  <Link
                    to="/blog"
                    className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-700 font-semibold mt-2 cursor-pointer"
                  >
                    <i className="ri-arrow-right-line"></i>
                    All blog articles
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Explore Other States */}
      <section className="py-12 bg-[#fdf8f3] border-t border-orange-100">
        <div className="max-w-7xl mx-auto px-5 md:px-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Explore ESA Guides by State</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {STATE_BLOG_MAP.map((s) => (
              <Link
                key={s.stateSlug}
                to={`/blog/state/${s.stateSlug}`}
                className={`group flex items-center gap-2.5 px-4 py-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  s.stateSlug === stateSlug
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:text-orange-600"
                }`}
              >
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <i className={`ri-map-pin-2-line text-xs ${s.stateSlug === stateSlug ? "text-white" : "text-orange-400"}`}></i>
                </div>
                <span className="truncate">{s.stateName}</span>
                <span className={`ml-auto text-xs ${s.stateSlug === stateSlug ? "text-white/70" : "text-gray-400"}`}>
                  {s.postSlugs.length}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-14 bg-white text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Protect Your {entry.stateName} Housing Rights Today
          </h2>
          <p className="text-gray-500 text-sm mb-7 leading-relaxed">
            Get a legitimate ESA letter from a {entry.stateName}-licensed mental health professional. Fast, affordable, and backed by our 100% money-back guarantee.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-block px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Get My ESA Letter — Starting at $100
            </Link>
            <Link
              to={`/esa-letter/${stateSlug}`}
              className="whitespace-nowrap inline-block px-8 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-md hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
            >
              {entry.stateName} ESA Law Guide
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
