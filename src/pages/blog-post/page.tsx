import { Fragment, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { blogPosts, BlogPost } from "../../mocks/blogPosts";
import { blogPostsExtended } from "../../mocks/blogPostsExtended";
import { blogPostsExtended2 } from "../../mocks/blogPostsExtended2";
import { blogPostsVerification } from "../../mocks/blogPostsVerification";
import { usStates } from "../../mocks/states";
import { detectStateFromSlug, STATE_BLOG_MAP } from "../../mocks/stateBlogMap";

const allBlogPosts: BlogPost[] = [...blogPostsVerification, ...blogPostsExtended2, ...blogPostsExtended, ...blogPosts] as BlogPost[];

function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return allBlogPosts.find((p) => p.slug === slug);
}

// ── State-link auto-injection ───────────────────────────────────────────────
// Maps state name → slug, sorted longest-first so "North Carolina" is matched
// before "Carolina", "New York" before "York", etc.
const stateSlugMap = new Map<string, string>(usStates.map((s) => [s.name, s.slug]));
const sortedStateNames = [...stateSlugMap.keys()].sort((a, b) => b.length - a.length);

/**
 * Recursively scans `text` for state names. The first occurrence of each
 * state (tracked in the shared `linked` Set) is wrapped in a Link.
 * Returns an array of React nodes ready for rendering.
 */
function linkifyStates(text: string, linked: Set<string>): React.ReactNode[] {
  for (const name of sortedStateNames) {
    if (linked.has(name)) continue;
    const idx = text.indexOf(name);
    if (idx === -1) continue;
    linked.add(name);
    const slug = stateSlugMap.get(name)!;
    const before = text.slice(0, idx);
    const after = text.slice(idx + name.length);
    return [
      ...(before ? linkifyStates(before, linked) : []),
      <Link
        key={`sl-${name}`}
        to={`/esa-letter/${slug}`}
        className="text-orange-600 hover:text-orange-700 underline underline-offset-2 decoration-orange-300/60 font-medium"
      >
        {name}
      </Link>,
      ...(after ? linkifyStates(after, linked) : []),
    ];
  }
  return [text];
}

// ── Popular sidebar state list (all 50 + DC, grouped by tier) ───────────────
const sidebarStateLinks = [
  // Tier 1 — highest traffic
  { label: "ESA Letter California", to: "/esa-letter/california" },
  { label: "ESA Letter Texas", to: "/esa-letter/texas" },
  { label: "ESA Letter Florida", to: "/esa-letter/florida" },
  { label: "ESA Letter New York", to: "/esa-letter/new-york" },
  { label: "ESA Letter Illinois", to: "/esa-letter/illinois" },
  { label: "ESA Letter Pennsylvania", to: "/esa-letter/pennsylvania" },
  { label: "ESA Letter Ohio", to: "/esa-letter/ohio" },
  { label: "ESA Letter Georgia", to: "/esa-letter/georgia" },
  { label: "ESA Letter North Carolina", to: "/esa-letter/north-carolina" },
  { label: "ESA Letter Michigan", to: "/esa-letter/michigan" },
  // Tier 2
  { label: "ESA Letter Washington", to: "/esa-letter/washington" },
  { label: "ESA Letter Arizona", to: "/esa-letter/arizona" },
  { label: "ESA Letter Massachusetts", to: "/esa-letter/massachusetts" },
  { label: "ESA Letter Tennessee", to: "/esa-letter/tennessee" },
  { label: "ESA Letter Indiana", to: "/esa-letter/indiana" },
  { label: "ESA Letter Missouri", to: "/esa-letter/missouri" },
  { label: "ESA Letter Maryland", to: "/esa-letter/maryland" },
  { label: "ESA Letter Wisconsin", to: "/esa-letter/wisconsin" },
  { label: "ESA Letter Colorado", to: "/esa-letter/colorado" },
  { label: "ESA Letter Minnesota", to: "/esa-letter/minnesota" },
  // Tier 3 — visible on expansion
  { label: "ESA Letter Virginia", to: "/esa-letter/virginia" },
  { label: "ESA Letter New Jersey", to: "/esa-letter/new-jersey" },
  { label: "ESA Letter Oregon", to: "/esa-letter/oregon" },
  { label: "ESA Letter Nevada", to: "/esa-letter/nevada" },
  { label: "ESA Letter Oklahoma", to: "/esa-letter/oklahoma" },
  { label: "ESA Letter Connecticut", to: "/esa-letter/connecticut" },
  { label: "ESA Letter Utah", to: "/esa-letter/utah" },
  { label: "ESA Letter Iowa", to: "/esa-letter/iowa" },
  { label: "ESA Letter Arkansas", to: "/esa-letter/arkansas" },
  { label: "ESA Letter Mississippi", to: "/esa-letter/mississippi" },
  { label: "ESA Letter Kansas", to: "/esa-letter/kansas" },
  { label: "ESA Letter New Mexico", to: "/esa-letter/new-mexico" },
  { label: "ESA Letter Nebraska", to: "/esa-letter/nebraska" },
  { label: "ESA Letter West Virginia", to: "/esa-letter/west-virginia" },
  { label: "ESA Letter Idaho", to: "/esa-letter/idaho" },
  { label: "ESA Letter Hawaii", to: "/esa-letter/hawaii" },
  { label: "ESA Letter Maine", to: "/esa-letter/maine" },
  { label: "ESA Letter New Hampshire", to: "/esa-letter/new-hampshire" },
  { label: "ESA Letter Rhode Island", to: "/esa-letter/rhode-island" },
  { label: "ESA Letter Montana", to: "/esa-letter/montana" },
  { label: "ESA Letter Delaware", to: "/esa-letter/delaware" },
  { label: "ESA Letter South Carolina", to: "/esa-letter/south-carolina" },
  { label: "ESA Letter South Dakota", to: "/esa-letter/south-dakota" },
  { label: "ESA Letter North Dakota", to: "/esa-letter/north-dakota" },
  { label: "ESA Letter Alaska", to: "/esa-letter/alaska" },
  { label: "ESA Letter Vermont", to: "/esa-letter/vermont" },
  { label: "ESA Letter Wyoming", to: "/esa-letter/wyoming" },
  { label: "ESA Letter Louisiana", to: "/esa-letter/louisiana" },
  { label: "ESA Letter Alabama", to: "/esa-letter/alabama" },
  { label: "ESA Letter Kentucky", to: "/esa-letter/kentucky" },
  { label: "ESA Letter Washington DC", to: "/esa-letter/washington-dc" },
];

// ── Related States resolver ──────────────────────────────────────────────────
// Returns up to 6 states relevant to the current blog post.
// Priority: 1) the post's own state cluster, 2) states mentioned in the post title/tags,
// 3) geographically adjacent states from the same region.
const REGION_GROUPS: Record<string, string[]> = {
  northeast: ["new-york", "new-jersey", "connecticut", "massachusetts", "rhode-island", "vermont", "new-hampshire", "maine", "delaware", "pennsylvania", "maryland", "washington-dc"],
  southeast: ["florida", "georgia", "north-carolina", "south-carolina", "virginia", "tennessee", "alabama", "mississippi", "kentucky", "west-virginia", "louisiana", "arkansas"],
  midwest: ["illinois", "ohio", "michigan", "indiana", "wisconsin", "minnesota", "iowa", "missouri", "kansas", "nebraska", "north-dakota", "south-dakota"],
  southwest: ["texas", "arizona", "new-mexico", "oklahoma", "nevada"],
  west: ["california", "washington", "oregon", "colorado", "utah", "idaho", "montana", "wyoming", "alaska", "hawaii"],
};

function getRelatedStates(postSlug: string, postTags: string[], postTitle: string, primaryStateSlug?: string): Array<{ slug: string; name: string }> {
  const seen = new Set<string>();
  const results: Array<{ slug: string; name: string }> = [];

  const addState = (slug: string) => {
    if (seen.has(slug)) return;
    const state = usStates.find((s) => s.slug === slug);
    if (!state) return;
    seen.add(slug);
    results.push({ slug, name: state.name });
  };

  // 1. Primary state first
  if (primaryStateSlug) addState(primaryStateSlug);

  // 2. States mentioned in tags or title
  const searchText = `${postTitle} ${postTags.join(" ")}`.toLowerCase();
  for (const s of usStates) {
    if (searchText.includes(s.name.toLowerCase()) || searchText.includes(s.slug)) {
      addState(s.slug);
    }
  }

  // 3. Fill remaining slots with regional neighbors
  if (primaryStateSlug) {
    const region = Object.entries(REGION_GROUPS).find(([, slugs]) => slugs.includes(primaryStateSlug));
    if (region) {
      for (const slug of region[1]) {
        if (results.length >= 6) break;
        addState(slug);
      }
    }
  }

  // 4. If still under 6, pull from states that have blog map entries
  if (results.length < 6) {
    for (const entry of STATE_BLOG_MAP) {
      if (results.length >= 6) break;
      addState(entry.stateSlug);
    }
  }

  return results.slice(0, 6);
}

function InArticleCTA({ isPSD = false }: { isPSD?: boolean }) {
  return (
    <div className="my-8 rounded-2xl overflow-hidden border border-orange-200 bg-gradient-to-r from-[#fff8f1] to-[#fdf2e5]">
      <div className="flex items-stretch">
        <div className="w-1.5 bg-orange-500 flex-shrink-0" />
        <div className="flex items-center gap-5 px-6 py-5 flex-1">
          <div className="w-12 h-12 flex items-center justify-center bg-orange-100 rounded-xl flex-shrink-0">
            <i className={`${isPSD ? "ri-mental-health-line" : "ri-shield-check-line"} text-orange-500 text-2xl`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 mb-0.5">
              {isPSD ? "Do you qualify for a PSD letter?" : "Still unsure if you qualify?"}
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              {isPSD
                ? "Take our free PSD assessment. Get your Psychiatric Service Dog letter same-day from a licensed professional."
                : "Take our free 2-minute assessment. Get your ESA letter same-day from a licensed professional — 100% money-back guarantee."}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                  <i className="ri-check-fill text-orange-500 text-xs"></i>
                </div>
                Licensed therapists
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                  <i className="ri-check-fill text-orange-500 text-xs"></i>
                </div>
                Same-day delivery
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                  <i className="ri-check-fill text-orange-500 text-xs"></i>
                </div>
                {isPSD ? "From $120" : "From $100"}
              </div>
            </div>
          </div>
          {/* CTA Button */}
          <Link
            to={isPSD ? "/psd-assessment" : "/assessment"}
            className="whitespace-nowrap flex-shrink-0 px-5 py-2.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
          >
            {isPSD ? "Get My PSD Letter" : "Get My ESA Letter"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = getBlogPostBySlug(slug || "");
  const isPSD = post?.category === "PSD";

  // Fix: search ALL blog posts for related, not just blogPosts
  const relatedPosts = post
    ? allBlogPosts.filter((p) => post.relatedSlugs.includes(p.slug)).slice(0, 3)
    : [];

  // Detect if this post belongs to a state cluster
  const stateEntry = slug ? detectStateFromSlug(slug) : undefined;
  // Other posts in the same state cluster (excluding current)
  const moreStatePosts = stateEntry
    ? stateEntry.postSlugs
        .filter((s) => s !== slug)
        .map(getBlogPostBySlug)
        .filter((p): p is BlogPost => !!p)
        .slice(0, 3)
    : [];

  const canonicalUrl = `https://www.pawtenant.com/blog/${slug}`;

  // One Set per render — shared across all section .map() iterations
  const linkedStates = new Set<string>();

  const articleSchema = post ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.metaDesc,
    "image": post.image,
    "url": canonicalUrl,
    "datePublished": post.date,
    "dateModified": post.date,
    "author": {
      "@type": "Person",
      "name": post.author,
      "jobTitle": post.authorTitle
    },
    "publisher": {
      "@type": "Organization",
      "name": "PawTenant",
      "url": "https://www.pawtenant.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.pawtenant.com/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    },
    "keywords": post.tags.join(", "),
    "articleSection": post.category
  }) : "";

  const breadcrumbSchema = post ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.pawtenant.com/blog" },
      ...(stateEntry
        ? [{ "@type": "ListItem", "position": 3, "name": `${stateEntry.stateName} ESA Guides`, "item": `https://www.pawtenant.com/blog/state/${stateEntry.stateSlug}` }]
        : []),
      { "@type": "ListItem", "position": stateEntry ? 4 : 3, "name": post.title, "item": canonicalUrl }
    ]
  }) : "";

  // Inject schema via useEffect — avoids React 19 hoisting / double-render issue
  useEffect(() => {
    if (!post) return;
    const scripts = [articleSchema, breadcrumbSchema].map((s) => {
      const el = document.createElement("script");
      el.type = "application/ld+json";
      el.text = s;
      document.head.appendChild(el);
      return el;
    });
    return () => scripts.forEach((el) => el.remove());
  }, [post, articleSchema, breadcrumbSchema]);

  if (!post) {
    return (
      <main>
        <title>Article Not Found | PawTenant Blog</title>
        <SharedNavbar />
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Article Not Found</h1>
          <p className="text-gray-500 mb-6">This article doesn&apos;t exist or may have moved.</p>
          <Link to="/blog" className="whitespace-nowrap px-6 py-3 bg-orange-500 text-white rounded-md font-semibold text-sm hover:bg-orange-600 cursor-pointer">
            Browse All Articles
          </Link>
        </div>
        <SharedFooter />
      </main>
    );
  }

  return (
    <main>
      <title>{post.metaTitle}</title>
      <meta name="description" content={post.metaDesc} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={post.metaTitle} />
      <meta property="og:description" content={post.metaDesc} />
      <meta property="og:image" content={post.image} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="article" />
      <meta name="twitter:title" content={post.metaTitle} />
      <meta name="twitter:description" content={post.metaDesc} />
      <meta name="twitter:image" content={post.image} />
      <meta name="Last-Modified" content={new Date(post.date).toUTCString()} />

      <SharedNavbar />

      {/* Hero */}
      <section className="pt-24 md:pt-28 pb-0 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          {/* Breadcrumb — now includes state cluster link when applicable */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 mb-6 flex-wrap">
            <Link to="/blog" className="text-xs text-gray-400 hover:text-orange-500 cursor-pointer">Blog</Link>
            {stateEntry && (
              <>
                <i className="ri-arrow-right-s-line text-gray-300 text-xs"></i>
                <Link
                  to={`/blog/state/${stateEntry.stateSlug}`}
                  className="text-xs text-gray-400 hover:text-orange-500 cursor-pointer whitespace-nowrap"
                >
                  {stateEntry.stateName} Guides
                </Link>
              </>
            )}
            <i className="ri-arrow-right-s-line text-gray-300 text-xs"></i>
            <span className="text-xs text-gray-400">{post.category}</span>
            <i className="ri-arrow-right-s-line text-gray-300 text-xs"></i>
            <span className="text-xs text-gray-600 truncate max-w-xs">{post.title}</span>
          </nav>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
            {/* Main Article */}
            <article className="w-full lg:flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-3 py-1 rounded-full">{post.category}</span>
                <span className="text-xs text-gray-400">{post.readTime}</span>
                <span className="text-xs text-gray-400">{post.date}</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-5 leading-tight">{post.title}</h1>

              {/* Author */}
              <div className="flex items-center gap-3 pb-6 mb-8 border-b border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-full">
                  <i className="ri-user-line text-orange-500"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{post.author}</p>
                  <p className="text-xs text-gray-400">{post.authorTitle}</p>
                </div>
              </div>

              {/* Hero Image */}
              <div className="w-full h-64 mb-8 rounded-xl overflow-hidden">
                <img src={post.image} alt={post.title} title={post.title} className="w-full h-full object-cover object-top" loading="eager" fetchPriority="high" decoding="async" />
              </div>

              {/* Excerpt */}
              <p className="text-base text-gray-600 leading-relaxed mb-8 font-medium border-l-4 border-orange-400 pl-5">{post.excerpt}</p>

              {/* Article Sections — state names auto-linked */}
              <div className="prose prose-sm max-w-none space-y-8">
                {post.sections.map((section, i) => (
                  <Fragment key={i}>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 mb-3">{section.heading}</h2>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {linkifyStates(section.content, linkedStates)}
                      </p>
                    </div>
                    {i === 3 && <InArticleCTA isPSD={isPSD} />}
                  </Fragment>
                ))}
              </div>

              {/* Tags */}
              <div className="mt-10 pt-8 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Related States — two-way internal linking loop */}
              {(() => {
                const relatedStates = getRelatedStates(
                  slug || "",
                  post.tags,
                  post.title,
                  stateEntry?.stateSlug
                );
                if (relatedStates.length === 0) return null;
                return (
                  <div className="mt-10 pt-8 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          <a href="/explore-esa-letters-all-states" className="hover:text-orange-600 transition-colors">
                            ESA Letters by State
                          </a>
                        </h4>
                        <p className="text-xs text-gray-400 mt-0.5">Get state-specific ESA housing guidance</p>
                      </div>
                      <Link
                        to="/explore-esa-letters-all-states"
                        className="whitespace-nowrap text-xs text-orange-500 hover:text-orange-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        All states
                        <i className="ri-arrow-right-s-line"></i>
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {relatedStates.map((s) => (
                        <Link
                          key={s.slug}
                          to={`/esa-letter/${s.slug}`}
                          className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-100 bg-[#fdf8f3] hover:border-orange-200 hover:bg-orange-50 transition-colors cursor-pointer"
                        >
                          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            <i className="ri-map-pin-2-line text-orange-400 text-sm group-hover:text-orange-500"></i>
                          </div>
                          <span className="text-xs font-medium text-gray-700 group-hover:text-orange-700 leading-tight">{s.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Cross-link CTA to verifiable-esa-letters */}
              {'ctaLink' in post && post.ctaLink && (
                <div className="mt-6 p-5 bg-[#f0faf7] rounded-xl border border-[#b8ddd5] flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-[#1a5c4f] rounded-full flex-shrink-0">
                      <i className="ri-shield-check-line text-white"></i>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{'ctaText' in post && post.ctaText ? post.ctaText : "Learn more about PawTenant's verifiable ESA letters"}</p>
                    </div>
                  </div>
                  <Link
                    to={post.ctaLink}
                    className="whitespace-nowrap flex items-center gap-1.5 text-xs font-semibold text-[#1a5c4f] hover:text-[#145244] cursor-pointer"
                  >
                    Learn more
                    <i className="ri-arrow-right-line"></i>
                  </Link>
                </div>
              )}

              {/* State cluster link — in-article internal link */}
              {stateEntry && (
                <div className="mt-8 p-5 bg-[#fdf8f3] rounded-xl border border-orange-100 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-full flex-shrink-0">
                      <i className="ri-map-pin-2-line text-orange-500"></i>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">More {stateEntry.stateName} ESA Guides</p>
                      <p className="text-xs text-gray-500">{stateEntry.postSlugs.length} articles covering {stateEntry.stateName} housing rights</p>
                    </div>
                  </div>
                  <Link
                    to={`/blog/state/${stateEntry.stateSlug}`}
                    className="whitespace-nowrap flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                  >
                    See all {stateEntry.stateName} guides
                    <i className="ri-arrow-right-line"></i>
                  </Link>
                </div>
              )}
            </article>

            {/* Sidebar */}
            <aside className="w-full lg:w-72 lg:flex-shrink-0">
              <div className="lg:sticky lg:top-24 space-y-5">
                {/* CTA Card */}
                <div className={`${isPSD ? "bg-gray-900" : "bg-orange-500"} rounded-2xl p-6 text-center`}>
                  <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-full mx-auto mb-3">
                    <i className={`${isPSD ? "ri-mental-health-line" : "ri-file-text-fill"} text-white text-xl`}></i>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">
                    {isPSD ? "Get Your PSD Letter Today" : "Get Your ESA Letter Today"}
                  </h3>
                  <p className={`text-xs ${isPSD ? "text-gray-300" : "text-orange-100"} mb-4 leading-relaxed`}>
                    {isPSD
                      ? "ADA-compliant PSD letters from licensed professionals. Same-day delivery, 100% money-back guarantee."
                      : "Fast, legitimate ESA letters from licensed professionals. 100% money-back guarantee."}
                  </p>
                  <Link
                    to={isPSD ? "/psd-assessment" : "/assessment"}
                    className={`whitespace-nowrap block w-full py-2.5 ${isPSD ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-white text-orange-600 hover:bg-orange-50"} font-semibold text-sm rounded-md transition-colors cursor-pointer text-center`}
                  >
                    {isPSD ? "Apply Now — from $120" : "Apply Now — from $100"}
                  </Link>
                </div>

                {/* State cluster widget — only for state-specific posts */}
                {stateEntry && moreStatePosts.length > 0 && (
                  <div className="bg-white rounded-xl border border-orange-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                        More {stateEntry.stateName} Guides
                      </h3>
                      <Link
                        to={`/blog/state/${stateEntry.stateSlug}`}
                        className="text-xs text-orange-500 hover:text-orange-700 font-semibold cursor-pointer whitespace-nowrap"
                      >
                        See all
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {moreStatePosts.map((rp) => (
                        <Link
                          key={rp.slug}
                          to={`/blog/${rp.slug}`}
                          className="group flex gap-3 items-start cursor-pointer"
                        >
                          <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden">
                            <img src={rp.image} alt={rp.title} title={rp.title} className="w-full h-full object-cover object-top" loading="lazy" decoding="async" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-800 group-hover:text-orange-600 transition-colors leading-snug line-clamp-2">{rp.title}</p>
                            <p className="text-xs text-gray-400 mt-1">{rp.readTime}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <Link
                      to={`/esa-letter/${stateEntry.stateSlug}`}
                      className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-700 font-semibold mt-3 pt-3 border-t border-gray-100 cursor-pointer"
                    >
                      <i className="ri-file-text-line"></i>
                      {stateEntry.stateName} ESA Letter Guide
                    </Link>
                  </div>
                )}

                {/* Quick Facts */}
                <div className="bg-[#fdf8f3] rounded-xl p-5 border border-orange-100">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Why PawTenant</h3>
                  <ul className="space-y-2.5">
                    {[
                      "Licensed mental health professionals",
                      "Same-day letter delivery",
                      "100% money-back guarantee",
                      "HIPAA compliant & secure",
                      "Accepted nationwide"
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

                {/* Service Page Links */}
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Explore Our Services</h3>
                  <div className="space-y-2">
                    {[
                      { label: "How to Get an ESA Letter", to: "/how-to-get-esa-letter" },
                      { label: "ESA Housing Rights Guide", to: "/housing-rights-esa" },
                      { label: "ESA Letter Cost & Pricing", to: "/esa-letter-cost" },
                      { label: "ESA for College Students", to: "/college-pet-policy" },
                      { label: "ESA Laws by State", to: "/explore-esa-letters-all-states" },
                      { label: "Service Animal vs ESA", to: "/service-animal-vs-esa" },
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

                {/* Popular State Guides */}
                <div className="bg-[#fdf6ee] rounded-xl border border-orange-100 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">ESA Letters by State</h3>
                  <div className="space-y-1.5">
                    {sidebarStateLinks.slice(0, 10).map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        className="flex items-center gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer"
                      >
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                          <i className="ri-map-pin-2-line text-orange-400"></i>
                        </div>
                        <span>{link.label}</span>
                      </Link>
                    ))}
                    <details className="group">
                      <summary className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 cursor-pointer font-semibold pt-1 select-none list-none">
                        <i className="ri-add-circle-line group-open:hidden"></i>
                        <i className="ri-indeterminate-circle-line hidden group-open:inline"></i>
                        <span className="group-open:hidden">Show all 50 states</span>
                        <span className="hidden group-open:inline">Show less</span>
                      </summary>
                      <div className="space-y-1.5 mt-1.5">
                        {sidebarStateLinks.slice(10).map((link) => (
                          <Link
                            key={link.to}
                            to={link.to}
                            className="flex items-center gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer"
                          >
                            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                              <i className="ri-map-pin-2-line text-orange-400"></i>
                            </div>
                            <span>{link.label}</span>
                          </Link>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                {/* Related Posts */}
                {relatedPosts.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Related Articles</h3>
                    <div className="space-y-3">
                      {relatedPosts.map((rp) => (
                        <Link
                          key={rp.slug}
                          to={`/blog/${rp.slug}`}
                          className="group flex gap-3 items-start cursor-pointer"
                        >
                          <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden">
                            <img src={rp.image} alt={rp.title} title={rp.title} className="w-full h-full object-cover object-top" loading="lazy" decoding="async" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-800 group-hover:text-orange-600 transition-colors leading-snug line-clamp-2">{rp.title}</p>
                            <p className="text-xs text-gray-400 mt-1">{rp.readTime}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <div className="py-14 bg-[#fdf8f3]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {isPSD ? "Ready to Get Your PSD Letter?" : "Ready to Protect Your Housing Rights?"}
          </h2>
          <p className="text-gray-500 text-sm mb-7 leading-relaxed">
            {isPSD
              ? "Get your PSD letter from a licensed mental health professional. ADA-compliant, same-day delivery, 100% guaranteed."
              : "Get your ESA letter from a licensed mental health professional. Fast, affordable, and 100% guaranteed."}
          </p>
          <Link
            to={isPSD ? "/psd-assessment" : "/assessment"}
            className="whitespace-nowrap inline-block px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            {isPSD ? "Apply for My PSD Letter" : "Apply for My ESA Letter"}
          </Link>
        </div>
      </div>

      <SharedFooter />
    </main>
  );
}
