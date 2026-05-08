import { useState, useMemo, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { blogPosts, BlogPost } from "../../mocks/blogPosts";
import { blogPostsExtended } from "../../mocks/blogPostsExtended";
import { blogPostsExtended2 } from "../../mocks/blogPostsExtended2";
import { blogPostsVerification } from "../../mocks/blogPostsVerification";
import { STATE_BLOG_MAP } from "../../mocks/stateBlogMap";

const allBlogPosts: BlogPost[] = [...blogPostsVerification, ...blogPostsExtended2, ...blogPostsExtended, ...blogPosts] as BlogPost[];

// Ordered for visual variety in the first ~12 slots: alternate close-ups,
// outdoor, work-from-home, couples, and solo portraits so the first page of
// blog cards never repeats an image close together.
const BLOG_IMAGE_FALLBACKS = [
  "/assets/blog/hug-close-1.jpg",
  "/assets/blog/cafe-retriever.jpg",
  "/assets/blog/fp-woman-jeans-living-room.jpg",
  "/assets/blog/freelancer-cat-desk.jpg",
  "/assets/blog/lady-pink-puppy-walk.jpg",
  "/assets/blog/fp-curly-woman-fun-dog.jpg",
  "/assets/blog/woman-holding-dog-1.jpg",
  "/assets/blog/man-puppy-portrait.jpg",
  "/assets/blog/fp-windowsill-dog.jpg",
  "/assets/blog/woman-working-cute-dog.jpg",
  "/assets/blog/pomeranian-portrait.jpg",
  "/assets/blog/smiley-tablet.jpg",
  "/assets/blog/fp-parent-baby-cat-kitchen.jpg",
  "/assets/blog/woman-looking-dog.jpg",
  "/assets/blog/couple-outdoors.jpg",
  "/assets/blog/fp-woman-dog-couch.jpg",
  "/assets/blog/man-working-dog.jpg",
  "/assets/blog/couple-with-dog.jpg",
  "/assets/blog/fp-woman-sitting-floor.jpg",
  "/assets/blog/owner-laptop-cuddle.jpg",
  "/assets/blog/hands-typing-dog.jpg",
  "/assets/lifestyle/woman-telehealth-with-dog.jpg",
  "/assets/blog/woman-holding-dog-2.jpg",
  "/assets/blog/hug-close-2.jpg",
  "/assets/blog/pregnant-with-dog.jpg",
  "/assets/lifestyle/owner-with-dog-laptop.jpg",
  "/assets/lifestyle/freelancer-with-dog-laptop.jpg",
  "/assets/lifestyle/senior-with-pet-home.jpg",
  "/assets/blog/fp-woman-dog-floor.jpg",
  "/assets/lifestyle/person-paperwork-with-dog.jpg",
  "/assets/lifestyle/woman-with-dog-office.jpg",
  "/assets/lifestyle/woman-laptop-clean.jpg",
  "/assets/lifestyle/woman-laptop-home.jpg",
  "/assets/lifestyle/woman-with-dog-new-apartment.jpg",
] as const;

const BLOG_LAST_RESORT_IMG = BLOG_IMAGE_FALLBACKS[0];

function isLocalAssetPath(src: string | undefined | null): boolean {
  return typeof src === "string" && src.startsWith("/") && !src.startsWith("//");
}

function resolveBlogImage(rawSrc: string | undefined, position: number): string {
  if (isLocalAssetPath(rawSrc)) return rawSrc as string;
  const len = BLOG_IMAGE_FALLBACKS.length;
  const i = ((position % len) + len) % len;
  return BLOG_IMAGE_FALLBACKS[i];
}

function handleImgFallback(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = BLOG_LAST_RESORT_IMG;
}

const categories = ["All", "College & ESA", "Legal & Rights", "Housing Rights", "Housing & Insurance", "Travel & ESA", "Getting Started", "Mental Health"];

const trendingTopics = [
  { label: "ESA Complete Guide 2026 — What\u2019s Updated", slug: "esa-complete-guide-2026-whats-updated" },
  { label: "ESA New Jersey 2026 — Newark, Jersey City & Hoboken", slug: "esa-new-jersey-newark-jersey-city-2026-guide" },
  { label: "ESA NYC Co-ops & Rent-Stabilized 2026", slug: "esa-nyc-apartments-coop-rent-stabilized-2026-guide" },
  { label: "South Florida ESA — Miami, Fort Lauderdale 2026", slug: "esa-south-florida-miami-fort-lauderdale-2026-guide" },
  { label: "HOA ESA Rights 2026", slug: "hoa-esa-rights-2026" },
  { label: "ESA for PTSD — Science & Evidence", slug: "how-esas-help-ptsd-2026" },
  { label: "ESA Ohio 2026 — Renter Guide", slug: "esa-ohio-2026-guide" },
  { label: "ESA California 2026 Update", slug: "esa-california-2026-update" },
  { label: "What landlords cannot do with ESA", slug: "what-landlords-cannot-legally-do-esa" },
  { label: "ESA vs service animal 2026", slug: "esa-vs-service-animal-key-differences-2026" },
];

function PostCard({ post, position }: { post: BlogPost; position: number }) {
  const inner = (
    <>
      <div className="h-40 overflow-hidden bg-orange-50">
        <img
          src={resolveBlogImage(post.image, position)}
          alt={post.title}
          title={post.title}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          decoding="async"
          onError={handleImgFallback}
        />
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">{post.category}</span>
          <span className="text-xs text-gray-400 whitespace-nowrap">{post.readTime}</span>
        </div>
        <h3 className="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors mb-2 leading-snug line-clamp-2">
          {post.title}
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{post.excerpt}</p>
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <div className="w-6 h-6 flex items-center justify-center bg-orange-100 rounded-full flex-shrink-0">
            <i className="ri-user-line text-orange-500 text-xs"></i>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700 truncate">{post.author}</p>
            <p className="text-xs text-gray-400">{post.date}</p>
          </div>
        </div>
      </div>
    </>
  );

  if (post.externalUrl) {
    return (
      <a
        href={post.externalUrl}
        target="_blank"
        rel="nofollow noopener noreferrer"
        className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer block"
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer"
    >
      {inner}
    </Link>
  );
}

function BlogSidebar({ selectedCategory, onCategoryChange }: { selectedCategory: string; onCategoryChange: (c: string) => void }) {
  return (
    <aside className="w-72 flex-shrink-0 space-y-6">
      {/* CTA Box */}
      <div className="bg-orange-500 rounded-xl p-5 text-white">
        <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-lg mb-3">
          <i className="ri-shield-check-line text-white text-lg"></i>
        </div>
        <h3 className="font-bold text-sm mb-2 leading-snug">Get Your ESA Letter in 24 Hours</h3>
        <p className="text-xs text-white/85 leading-relaxed mb-4">
          Licensed therapists, FHA-compliant letters, and a 100% money-back guarantee. Starting at $99/year.
        </p>
        <Link
          to="/assessment"
          className="whitespace-nowrap block text-center bg-white text-orange-600 font-bold text-xs px-4 py-2.5 rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
        >
          Start Free Assessment
        </Link>
      </div>

      {/* Categories */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-list-unordered text-orange-500"></i>
          </div>
          Browse by Topic
        </h3>
        <div className="space-y-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? "bg-orange-50 text-orange-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{cat}</span>
                {selectedCategory === cat && (
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-check-line text-orange-500 text-xs"></i>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Trending Topics */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-fire-line text-orange-500"></i>
          </div>
          Trending Now
        </h3>
        <div className="space-y-2">
          {trendingTopics.map((topic, i) => (
            <Link
              key={topic.slug}
              to={`/blog/${topic.slug}`}
              className="flex items-start gap-2.5 group cursor-pointer"
            >
              <span className="text-xs font-bold text-orange-400 mt-0.5 flex-shrink-0 w-4">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-xs text-gray-600 group-hover:text-orange-600 transition-colors leading-snug">{topic.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Popular Guides */}
      <div className="bg-[#fdf6ee] rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Links</h3>
        <div className="space-y-2">
          {[
            { label: "How to Get an ESA Letter", to: "/how-to-get-esa-letter" },
            { label: "ESA Housing Rights", to: "/housing-rights-esa" },
            { label: "ESA Letter Cost", to: "/esa-letter-cost" },
            { label: "ESA vs Service Animal", to: "/service-animal-vs-esa" },
            { label: "ESA for College Students", to: "/college-pet-policy" },
            { label: "ESA Laws by State", to: "/explore-esa-letters-all-states" },
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

      {/* Browse by State — links to state blog cluster pages */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-map-pin-2-line text-orange-500"></i>
          </div>
          Guides by State
        </h3>
        <div className="space-y-1.5">
          {STATE_BLOG_MAP.slice(0, 8).map((s) => (
            <Link
              key={s.stateSlug}
              to={`/blog/state/${s.stateSlug}`}
              className="flex items-center justify-between gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <i className="ri-map-pin-2-line text-orange-400 group-hover:text-orange-600"></i>
                </div>
                <span className="truncate">{s.stateName}</span>
              </div>
              <span className="text-gray-400 text-xs flex-shrink-0">{s.postSlugs.length}</span>
            </Link>
          ))}
          <details className="group/detail">
            <summary className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 cursor-pointer font-semibold pt-1 select-none list-none">
              <i className="ri-add-circle-line group-open/detail:hidden"></i>
              <i className="ri-indeterminate-circle-line hidden group-open/detail:inline"></i>
              <span className="group-open/detail:hidden">More states</span>
              <span className="hidden group-open/detail:inline">Show less</span>
            </summary>
            <div className="space-y-1.5 mt-1.5">
              {STATE_BLOG_MAP.slice(8).map((s) => (
                <Link
                  key={s.stateSlug}
                  to={`/blog/state/${s.stateSlug}`}
                  className="flex items-center justify-between gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className="ri-map-pin-2-line text-orange-400 group-hover:text-orange-600"></i>
                    </div>
                    <span className="truncate">{s.stateName}</span>
                  </div>
                  <span className="text-gray-400 text-xs flex-shrink-0">{s.postSlugs.length}</span>
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </aside>
  );
}

export default function BlogPage() {
  const [selectedCategory, setSelectedCategory] = useState("All");

  const featuredPost = allBlogPosts[0];

  const filteredPosts = useMemo(() => {
    const rest = allBlogPosts.slice(1);
    if (selectedCategory === "All") return rest;
    return rest.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const allFiltered = useMemo(() => {
    if (selectedCategory === "All") return allBlogPosts;
    return allBlogPosts.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const showFeatured = selectedCategory === "All";
  const postsToShow = showFeatured ? filteredPosts : allFiltered;

  return (
    <main>
      <title>ESA Letter Blog | Guides, Laws &amp; Tips | PawTenant</title>
      <meta name="description" content="Explore expert guides on ESA letters, emotional support animal laws, and tenant rights. Stay informed with PawTenant's blog, your trusted ESA resource." />
      <meta name="keywords" content="ESA letter blog, emotional support animal guides, ESA laws, ESA housing rights, ESA tips" />
      <link rel="canonical" href="https://www.pawtenant.com/blog" />
      <meta property="og:title" content="ESA Letter Blog | Guides, Laws & Tips | PawTenant" />
      <meta property="og:description" content="Explore expert guides on ESA letters, emotional support animal laws, and tenant rights. Stay informed with PawTenant's blog, your trusted ESA resource." />
      <meta property="og:url" content="https://www.pawtenant.com/blog" />
      <meta property="og:type" content="website" />

      <SharedNavbar />

      {/* Hero */}
      <section className="bg-[#fdf8f3] pt-32 pb-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-3">
              PawTenant Blog
            </span>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">ESA Guides, News &amp; Resources</h1>
            <p className="text-gray-500 text-sm max-w-lg mx-auto leading-relaxed">
              Expert articles on emotional support animals, housing rights, ESA letters, and mental health wellness — from PawTenant's licensed professionals.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-5 md:px-6">
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            {/* Main Content */}
            <div className="flex-1 min-w-0 w-full">
              {/* Featured Post — only shown when All */}
              {showFeatured && (
                (() => {
                  const post = featuredPost;
                  const inner = (
                    <>
                      <div className="h-64 overflow-hidden bg-orange-50">
                        <img
                          src={resolveBlogImage(post.image, 0)}
                          alt={post.title}
                          title={post.title}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
                          onError={handleImgFallback}
                        />
                      </div>
                      <div className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-2.5 py-1 rounded-full whitespace-nowrap">{post.category}</span>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{post.readTime}</span>
                          <span className="text-xs font-semibold text-orange-400 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">Featured</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-orange-600 transition-colors leading-snug">{post.title}</h2>
                        <p className="text-sm text-gray-500 leading-relaxed mb-5 line-clamp-2">{post.excerpt}</p>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-full flex-shrink-0">
                            <i className="ri-user-line text-orange-500 text-sm"></i>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{post.author}</p>
                            <p className="text-xs text-gray-400">{post.date}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  );

                  return post.externalUrl ? (
                    <a
                      href={post.externalUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="group bg-[#fdf8f3] rounded-2xl overflow-hidden border border-orange-100 mb-8 hover:border-orange-300 transition-all cursor-pointer block"
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link
                      to={`/blog/${post.slug}`}
                      className="group bg-[#fdf8f3] rounded-2xl overflow-hidden border border-orange-100 mb-8 hover:border-orange-300 transition-all cursor-pointer block"
                    >
                      {inner}
                    </Link>
                  );
                })()
              )}

              {/* Category header when filtering */}
              {selectedCategory !== "All" && (
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedCategory}</h2>
                    <p className="text-xs text-gray-500">{postsToShow.length} article{postsToShow.length !== 1 ? "s" : ""}</p>
                  </div>
                  <button
                    onClick={() => setSelectedCategory("All")}
                    className="whitespace-nowrap text-xs text-orange-500 hover:text-orange-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-close-line"></i>
                    </div>
                    Clear filter
                  </button>
                </div>
              )}

              {/* Posts Grid */}
              {postsToShow.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {postsToShow.map((post, idx) => (
                    <PostCard key={post.slug} post={post} position={idx + 1} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-14 text-gray-400">
                  <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                    <i className="ri-article-line text-gray-400 text-xl"></i>
                  </div>
                  <p className="text-sm font-semibold">No articles in this category yet</p>
                  <button
                    onClick={() => setSelectedCategory("All")}
                    className="whitespace-nowrap mt-3 text-xs text-orange-500 hover:text-orange-700 cursor-pointer"
                  >
                    View all articles
                  </button>
                </div>
              )}
            </div>

            {/* Sidebar — shows below content on mobile */}
            <div className="w-full lg:w-72 lg:flex-shrink-0 order-last lg:order-none">
              <BlogSidebar selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} />
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-14 bg-[#fdf8f3] text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Protect Your Housing Rights Today</h2>
          <p className="text-gray-500 text-sm mb-7 leading-relaxed">
            Get a legitimate ESA letter from a licensed mental health professional. Fast, affordable, and backed by our 100% money-back guarantee.
          </p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-block px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Get My ESA Letter — Starting at $99
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
