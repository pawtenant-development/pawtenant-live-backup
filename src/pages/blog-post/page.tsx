import { Fragment } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { blogPosts, BlogPost } from "../../mocks/blogPosts";
import { blogPostsExtended } from "../../mocks/blogPostsExtended";
import { blogPostsExtended2 } from "../../mocks/blogPostsExtended2";

const allBlogPosts: BlogPost[] = [...blogPostsExtended2, ...blogPostsExtended, ...blogPosts] as BlogPost[];

function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return allBlogPosts.find((p) => p.slug === slug);
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

  const relatedPosts = post
    ? blogPosts.filter((p) => post.relatedSlugs.includes(p.slug)).slice(0, 3)
    : [];

  const canonicalUrl = `https://www.pawtenant.com/blog/${slug}`;

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
      "url": "https://www.pawtenant.com/"
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
      { "@type": "ListItem", "position": 3, "name": post.title, "item": canonicalUrl }
    ]
  }) : "";

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbSchema }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="pt-24 md:pt-28 pb-0 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6">
            <Link to="/blog" className="text-xs text-gray-400 hover:text-orange-500 cursor-pointer">Blog</Link>
            <i className="ri-arrow-right-s-line text-gray-300 text-xs"></i>
            <span className="text-xs text-gray-400">{post.category}</span>
            <i className="ri-arrow-right-s-line text-gray-300 text-xs"></i>
            <span className="text-xs text-gray-600 truncate max-w-xs">{post.title}</span>
          </div>

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

              {/* Article Sections */}
              <div className="prose prose-sm max-w-none space-y-8">
                {post.sections.map((section, i) => (
                  <Fragment key={i}>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 mb-3">{section.heading}</h2>
                      <p className="text-sm text-gray-600 leading-relaxed">{section.content}</p>
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
            </article>

            {/* Sidebar */}
            <aside className="w-full lg:w-72 lg:flex-shrink-0">
              <div className="lg:sticky lg:top-24">
                {/* CTA Card */}
                <div className={`${isPSD ? "bg-gray-900" : "bg-orange-500"} rounded-2xl p-6 text-center mb-5`}>
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

                {/* Quick Facts */}
                <div className="bg-[#fdf8f3] rounded-xl p-5 border border-orange-100 mb-5">
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

                {/* Service Page Links — Internal Authority Flow */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
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

                {/* Top State Guides — PageRank internal links */}
                <div className="bg-[#fdf6ee] rounded-xl border border-orange-100 p-4 mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Popular State Guides</h3>
                  <div className="space-y-2">
                    {[
                      { label: "ESA Letter California", to: "/esa-letter/california" },
                      { label: "ESA Letter Texas", to: "/esa-letter/texas" },
                      { label: "ESA Letter Florida", to: "/esa-letter/florida" },
                      { label: "ESA Letter New York", to: "/esa-letter/new-york" },
                      { label: "ESA Letter Cost California", to: "/blog/esa-letter-cost-california-2026" },
                      { label: "Texas ESA Landlord Rights", to: "/blog/texas-esa-landlord-rights-2026" },
                      { label: "Florida ESA Renters Guide", to: "/blog/florida-esa-letter-renters-2026" },
                      { label: "New York ESA Apartment Guide", to: "/blog/new-york-esa-letter-apartment-2026" },
                      { label: "ESA Letter Ohio", to: "/esa-letter/ohio" },
                      { label: "ESA Letter Washington", to: "/esa-letter/washington" },
                    ].map((link) => (
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
