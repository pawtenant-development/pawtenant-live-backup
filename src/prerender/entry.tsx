// src/prerender/entry.tsx
//
// AI-SEO-FULL-BODY-PRERENDER-SPIKE-001  (original spike, 2026-07)
// SEO-H1-RAW-HTML-COVERAGE-001          (widened to the full SEO surface, 2026-09-16)
//
// Build-time SSR entry. It renders the REAL route page components to a static
// HTML string so the deployed raw HTML for every indexable content route
// carries meaningful, route-specific body content — an <h1>, intro copy, CTA,
// internal links, visible FAQ — BEFORE the React bundle executes, instead of
// an empty <div id="root">.
//
// Why it had to widen
// -------------------
// A Semrush crawl on 2026-09-15 reported 270 indexable URLs with "No. of H1 =
// 0". Every page in that list DOES render exactly one <h1> once React mounts —
// usually via a shared layout component such as BlogProse's <BlogHero> — but
// the crawler reads raw HTML, and only the 21 routes registered here were ever
// given a body. Not one of the 21 appeared in the report; every one of the 270
// was a route that got the head-only prerender from scripts/prerender-seo.mjs
// and therefore an empty #root.
//
// So the H1s were never missing from the components — they were missing from
// the SERVER OUTPUT. The root fix is to register the whole indexable content
// surface here rather than to add 270 headings by hand. The component tree is
// still the single source of truth: no hand-authored SEO copy, no duplicated
// wording, and a page's heading keeps whatever markup and styling it already had.
//
// This module is loaded ONLY at build time by
// scripts/prerender-full-body-spike.mjs (through Vite's SSR pipeline, so
// unplugin-auto-import + the "@/" alias + the react-swc transform all apply).
// It is NOT part of the client bundle and main.tsx never imports it, so the
// shipped app is byte-identical.
//
// Design contract (unchanged from the original spike):
//   - Renders the SAME components the client renders. The client still uses
//     createRoot(), which clears #root and re-renders on mount, so this markup
//     is an SSR-only first paint that React replaces with an identical tree.
//   - Renders each route under a StaticRouter so Link / useParams /
//     useLocation resolve without a browser.
//   - Effects (useEffect) do NOT run under renderToStaticMarkup, so per-page
//     document.head SEO/JSON-LD injection never runs here; the <head> is owned
//     by scripts/prerender-seo.mjs. Any JSON-LD a page emits in JSX is stripped
//     by the generator so schema stays emitted exactly once.
//   - The homepage ("/") is intentionally NOT rendered here: it keeps its tuned
//     static-hero / lazy-section architecture in prerender-seo.mjs, which
//     already puts a real <h1> in the raw HTML.
//   - The generator refuses to write any route whose SSR body has no <h1>, so a
//     page that cannot render statically is REPORTED, never shipped as an empty
//     shell.

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { Routes, Route } from "react-router-dom";

// ── Route data modules — the same sources scripts/prerender-seo.mjs uses, so
// the head-only file this generator injects into always exists. ─────────────
import { ESA_STATE_META, getSEO } from "@/config/seoConfig";
import { STATE_BLOG_MAP } from "@/mocks/stateBlogMap";
import { colleges } from "@/mocks/colleges";
import { blogPosts } from "@/mocks/blogPosts";
import { blogPostsExtended } from "@/mocks/blogPostsExtended";
import { blogPostsExtended2 } from "@/mocks/blogPostsExtended2";
import { blogPostsVerification } from "@/mocks/blogPostsVerification";
import { PUBLISHED_PROVIDERS, getPublicProvider } from "@/data/publicProviders";
import { buildProviderJsonLd, buildOurProvidersJsonLd, stringifyJsonLd } from "@/lib/providerJsonLd";

// ── Page components ─────────────────────────────────────────────────────────
import Pg_about_us from "@/pages/about-us/page";
import Pg_airline_pet_policy from "@/pages/airline-pet-policy/page";
import Pg_are_esa_letters_still_valid_after_hud_change from "@/pages/are-esa-letters-still-valid-after-hud-change/page";
import Pg_are_online_esa_letters_legit from "@/pages/are-online-esa-letters-legit/page";
import Pg_assessment from "@/pages/assessment/page";
import Pg_best_online_esa_letter_service from "@/pages/best-online-esa-letter-service/page";
import Pg_blog_2026_hud_esa_guidelines from "@/pages/blog-2026-hud-esa-guidelines/page";
import Pg_blog_apartment_pet_rent_and_esa_letters from "@/pages/blog-apartment-pet-rent-and-esa-letters/page";
import Pg_blog_california_pet_rent_and_esa_letters from "@/pages/blog-california-pet-rent-and-esa-letters/page";
import Pg_blog_can_anxiety_qualify_you_for_a_psd from "@/pages/blog-can-anxiety-qualify-you-for-a-psd/page";
import Pg_blog_can_depression_qualify_psychiatric_service_dog from "@/pages/blog-can-depression-qualify-psychiatric-service-dog/page";
import Pg_blog_can_depression_qualify_you_for_an_esa from "@/pages/blog-can-depression-qualify-you-for-an-esa/page";
import Pg_blog_colorado_pet_rent_and_esa_letters from "@/pages/blog-colorado-pet-rent-and-esa-letters/page";
import Pg_blog_crowds_travel_stress_emotional_support_animal from "@/pages/blog-crowds-travel-stress-emotional-support-animal/page";
import Pg_blog_emotional_support_animal_travel_anxiety from "@/pages/blog-emotional-support-animal-travel-anxiety/page";
import Pg_blog_esa_letter_requirements from "@/pages/blog-esa-letter-requirements/page";
import Pg_blog_florida_pet_rent_and_esa_letters from "@/pages/blog-florida-pet-rent-and-esa-letters/page";
import Pg_blog_how_to_get_an_esa_letter_online from "@/pages/blog-how-to-get-an-esa-letter-online/page";
import Pg_blog_how_to_train_psychiatric_service_dog_tasks from "@/pages/blog-how-to-train-psychiatric-service-dog-tasks/page";
import Pg_blog_new_york_pet_rent_and_esa_letters from "@/pages/blog-new-york-pet-rent-and-esa-letters/page";
import Pg_blog_pet_deposit_vs_pet_rent from "@/pages/blog-pet-deposit-vs-pet-rent/page";
import Pg_blog_pet_rent_explained from "@/pages/blog-pet-rent-explained/page";
import Pg_blog_post from "@/pages/blog-post/page";
import Pg_blog_psd_letter_for_anxiety from "@/pages/blog-psd-letter-for-anxiety/page";
import Pg_blog_psd_letter_vs_service_dog_certificate from "@/pages/blog-psd-letter-vs-service-dog-certificate/page";
import Pg_blog_psychiatric_service_dog_housing_rights from "@/pages/blog-psychiatric-service-dog-housing-rights/page";
import Pg_blog_psychiatric_service_dog_letter_explained from "@/pages/blog-psychiatric-service-dog-letter-explained/page";
import Pg_blog_state from "@/pages/blog-state/page";
import Pg_blog_temporary_housing_emotional_support_animal from "@/pages/blog-temporary-housing-emotional-support-animal/page";
import Pg_blog_texas_pet_rent_and_esa_letters from "@/pages/blog-texas-pet-rent-and-esa-letters/page";
import Pg_blog_texas_service_animal_laws_penalties from "@/pages/blog-texas-service-animal-laws-penalties/page";
import Pg_blog_washington_pet_rent_and_esa_letters from "@/pages/blog-washington-pet-rent-and-esa-letters/page";
import Pg_blog_what_is_an_esa_letter from "@/pages/blog-what-is-an-esa-letter/page";
import Pg_blog from "@/pages/blog/page";
import Pg_california_esa_letter_30_day_rule from "@/pages/california-esa-letter-30-day-rule/page";
import Pg_california_esa_letter_for_apartments from "@/pages/california-esa-letter-for-apartments/page";
import Pg_can_a_landlord_deny_a_psd_letter from "@/pages/can-a-landlord-deny-a-psd-letter/page";
import Pg_can_landlord_reject_esa_letter from "@/pages/can-landlord-reject-esa-letter/page";
import Pg_college_pet_policy from "@/pages/college-pet-policy/page";
import Pg_college_policy_detail from "@/pages/college-policy-detail/page";
import Pg_contact_us from "@/pages/contact-us/page";
import Pg_do_you_need_a_psd_letter_for_a_service_dog from "@/pages/do-you-need-a-psd-letter-for-a-service-dog/page";
import Pg_doctor_profile from "@/pages/doctor-profile/page";
import Pg_esa_accommodation_request_letter from "@/pages/esa-accommodation-request-letter/page";
import Pg_esa_laws from "@/pages/esa-laws/page";
import Pg_esa_letter_cost from "@/pages/esa-letter-cost/page";
import Pg_esa_letter_for_apartments from "@/pages/esa-letter-for-apartments/page";
import Pg_esa_letter_for_landlord from "@/pages/esa-letter-for-landlord/page";
import Pg_esa_letter_housing from "@/pages/lp-esa-housing/page";
import Pg_esa_letter_verification_id from "@/pages/esa-letter-verification-id/page";
import Pg_esa_letter_verification from "@/pages/esa-letter-verification/page";
import Pg_esa_letter_vs_pet_policy from "@/pages/esa-letter-vs-pet-policy/page";
import Pg_esa_pet_rent_deposit from "@/pages/esa-pet-rent-deposit/page";
import Pg_esa_psd_registry_vs_letter from "@/pages/esa-psd-registry-vs-letter/page";
import Pg_esa_vs_psd_letter from "@/pages/esa-vs-psd-letter/page";
import Pg_everything_esa_online from "@/pages/everything-esa-online/page";
import Pg_explore_states from "@/pages/explore-states/page";
import Pg_faqs from "@/pages/faqs/page";
import Pg_florida_esa_letter_for_apartments from "@/pages/florida-esa-letter-for-apartments/page";
import Pg_florida_esa_letter_housing_rules from "@/pages/florida-esa-letter-housing-rules/page";
import Pg_housing_rights from "@/pages/housing-rights/page";
import Pg_how_to_get_esa_letter_online from "@/pages/how-to-get-esa-letter-online/page";
import Pg_how_to_get_esa from "@/pages/how-to-get-esa/page";
import Pg_how_to_get_psd_letter from "@/pages/how-to-get-psd-letter/page";
import Pg_how_to_respond_to_esa_letter_denial from "@/pages/how-to-respond-to-esa-letter-denial/page";
import Pg_how_to_verify_esa_letter from "@/pages/how-to-verify-esa-letter/page";
import Pg_iowa_esa_letter_housing_rules from "@/pages/iowa-esa-letter-housing-rules/page";
import Pg_is_pawtenant_legit from "@/pages/is-pawtenant-legit/page";
import Pg_join_our_network from "@/pages/join-our-network/page";
import Pg_landlord_denied_esa_letter from "@/pages/landlord-denied-esa-letter/page";
import Pg_landlord_esa_documentation_checklist from "@/pages/landlord-esa-documentation-checklist/page";
import Pg_landlord_says_esa_letter_is_fake from "@/pages/landlord-says-esa-letter-is-fake/page";
import Pg_new_york_esa_letter_for_apartments from "@/pages/new-york-esa-letter-for-apartments/page";
import Pg_no_risk_guarantee from "@/pages/no-risk-guarantee/page";
import Pg_our_providers from "@/pages/our-providers/page";
import Pg_pet_rent_savings_calculator from "@/pages/pet-rent-savings-calculator/page";
import Pg_privacy_policy from "@/pages/privacy-policy/page";
import Pg_psd_assessment from "@/pages/psd-assessment/page";
import Pg_psd_letter_for_apartments from "@/pages/psd-letter-for-apartments/page";
import Pg_psd_letter_requirements from "@/pages/psd-letter-requirements/page";
import Pg_psychiatric_service_dog_letter_online from "@/pages/psychiatric-service-dog-letter-online/page";
import Pg_refund_policy from "@/pages/refund-policy/page";
import Pg_renew_esa_letter from "@/pages/renew-esa-letter/page";
import Pg_resource_center from "@/pages/resource-center/page";
import Pg_service_animal_vs_esa from "@/pages/service-animal-vs-esa/page";
import Pg_service_dogs from "@/pages/service-dogs/page";
import Pg_sitemap from "@/pages/sitemap/page";
import Pg_state_esa from "@/pages/state-esa/page";
import Pg_state_psd from "@/pages/state-psd/page";
import Pg_states_california_esa_psd_guide from "@/pages/states-california-esa-psd-guide/page";
import Pg_states_los_angeles_esa_landlord_guide from "@/pages/states-los-angeles-esa-landlord-guide/page";
import Pg_states_san_diego_telehealth_guide from "@/pages/states-san-diego-telehealth-guide/page";
import Pg_states_san_francisco_hoa_psd_guide from "@/pages/states-san-francisco-hoa-psd-guide/page";
import Pg_states_texas_esa_psd_guide from "@/pages/states-texas-esa-psd-guide/page";
import Pg_terms_of_use from "@/pages/terms-of-use/page";
import Pg_texas_esa_letter_for_apartments from "@/pages/texas-esa-letter-for-apartments/page";
import Pg_travel_anxiety_esa_letter from "@/pages/travel-anxiety-esa-letter/page";
import Pg_what_documents_can_landlord_ask_for_esa from "@/pages/what-documents-can-landlord-ask-for-esa/page";
import Pg_what_makes_esa_letter_valid from "@/pages/what-makes-esa-letter-valid/page";

/**
 * Route pattern → component → the page's source key in the Vite manifest.
 * Patterns mirror src/router/config.tsx exactly so a StaticRouter at each
 * location matches the same component (and resolves :state / :slug / :college
 * params the pages read via useParams). react-router ranks by specificity, so
 * a dedicated article route always wins over /blog/:slug regardless of order.
 */
const ROUTE_ELEMENTS: { path: string; element: React.ReactNode; source: string }[] = [
  { path: "/about-us", element: <Pg_about_us />, source: "src/pages/about-us/page.tsx" },
  { path: "/airline-pet-policy", element: <Pg_airline_pet_policy />, source: "src/pages/airline-pet-policy/page.tsx" },
  { path: "/all-about-service-dogs", element: <Pg_service_dogs />, source: "src/pages/service-dogs/page.tsx" },
  { path: "/are-esa-letters-still-valid-after-hud-change", element: <Pg_are_esa_letters_still_valid_after_hud_change />, source: "src/pages/are-esa-letters-still-valid-after-hud-change/page.tsx" },
  { path: "/are-online-esa-letters-legit", element: <Pg_are_online_esa_letters_legit />, source: "src/pages/are-online-esa-letters-legit/page.tsx" },
  { path: "/assessment", element: <Pg_assessment />, source: "src/pages/assessment/page.tsx" },
  { path: "/best-online-esa-letter-service", element: <Pg_best_online_esa_letter_service />, source: "src/pages/best-online-esa-letter-service/page.tsx" },
  { path: "/blog", element: <Pg_blog />, source: "src/pages/blog/page.tsx" },
  { path: "/blog/:slug", element: <Pg_blog_post />, source: "src/pages/blog-post/page.tsx" },
  { path: "/blog/2026-hud-esa-guidelines", element: <Pg_blog_2026_hud_esa_guidelines />, source: "src/pages/blog-2026-hud-esa-guidelines/page.tsx" },
  { path: "/blog/apartment-pet-rent-and-esa-letters", element: <Pg_blog_apartment_pet_rent_and_esa_letters />, source: "src/pages/blog-apartment-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/california-pet-rent-and-esa-letters", element: <Pg_blog_california_pet_rent_and_esa_letters />, source: "src/pages/blog-california-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/can-anxiety-qualify-you-for-a-psd", element: <Pg_blog_can_anxiety_qualify_you_for_a_psd />, source: "src/pages/blog-can-anxiety-qualify-you-for-a-psd/page.tsx" },
  { path: "/blog/can-depression-qualify-psychiatric-service-dog", element: <Pg_blog_can_depression_qualify_psychiatric_service_dog />, source: "src/pages/blog-can-depression-qualify-psychiatric-service-dog/page.tsx" },
  { path: "/blog/can-depression-qualify-you-for-an-esa", element: <Pg_blog_can_depression_qualify_you_for_an_esa />, source: "src/pages/blog-can-depression-qualify-you-for-an-esa/page.tsx" },
  { path: "/blog/colorado-pet-rent-and-esa-letters", element: <Pg_blog_colorado_pet_rent_and_esa_letters />, source: "src/pages/blog-colorado-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/crowds-travel-stress-emotional-support-animal", element: <Pg_blog_crowds_travel_stress_emotional_support_animal />, source: "src/pages/blog-crowds-travel-stress-emotional-support-animal/page.tsx" },
  { path: "/blog/emotional-support-animal-travel-anxiety", element: <Pg_blog_emotional_support_animal_travel_anxiety />, source: "src/pages/blog-emotional-support-animal-travel-anxiety/page.tsx" },
  { path: "/blog/esa-letter-requirements", element: <Pg_blog_esa_letter_requirements />, source: "src/pages/blog-esa-letter-requirements/page.tsx" },
  { path: "/blog/florida-pet-rent-and-esa-letters", element: <Pg_blog_florida_pet_rent_and_esa_letters />, source: "src/pages/blog-florida-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/how-to-get-an-esa-letter-online", element: <Pg_blog_how_to_get_an_esa_letter_online />, source: "src/pages/blog-how-to-get-an-esa-letter-online/page.tsx" },
  { path: "/blog/how-to-train-psychiatric-service-dog-tasks", element: <Pg_blog_how_to_train_psychiatric_service_dog_tasks />, source: "src/pages/blog-how-to-train-psychiatric-service-dog-tasks/page.tsx" },
  { path: "/blog/new-york-pet-rent-and-esa-letters", element: <Pg_blog_new_york_pet_rent_and_esa_letters />, source: "src/pages/blog-new-york-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/pet-deposit-vs-pet-rent", element: <Pg_blog_pet_deposit_vs_pet_rent />, source: "src/pages/blog-pet-deposit-vs-pet-rent/page.tsx" },
  { path: "/blog/pet-rent-explained", element: <Pg_blog_pet_rent_explained />, source: "src/pages/blog-pet-rent-explained/page.tsx" },
  { path: "/blog/psd-letter-for-anxiety", element: <Pg_blog_psd_letter_for_anxiety />, source: "src/pages/blog-psd-letter-for-anxiety/page.tsx" },
  { path: "/blog/psd-letter-vs-service-dog-certificate", element: <Pg_blog_psd_letter_vs_service_dog_certificate />, source: "src/pages/blog-psd-letter-vs-service-dog-certificate/page.tsx" },
  { path: "/blog/psychiatric-service-dog-housing-rights", element: <Pg_blog_psychiatric_service_dog_housing_rights />, source: "src/pages/blog-psychiatric-service-dog-housing-rights/page.tsx" },
  { path: "/blog/psychiatric-service-dog-letter-explained", element: <Pg_blog_psychiatric_service_dog_letter_explained />, source: "src/pages/blog-psychiatric-service-dog-letter-explained/page.tsx" },
  { path: "/blog/state/:state", element: <Pg_blog_state />, source: "src/pages/blog-state/page.tsx" },
  { path: "/blog/temporary-housing-emotional-support-animal", element: <Pg_blog_temporary_housing_emotional_support_animal />, source: "src/pages/blog-temporary-housing-emotional-support-animal/page.tsx" },
  { path: "/blog/texas-pet-rent-and-esa-letters", element: <Pg_blog_texas_pet_rent_and_esa_letters />, source: "src/pages/blog-texas-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/texas-service-animal-laws-penalties", element: <Pg_blog_texas_service_animal_laws_penalties />, source: "src/pages/blog-texas-service-animal-laws-penalties/page.tsx" },
  { path: "/blog/washington-pet-rent-and-esa-letters", element: <Pg_blog_washington_pet_rent_and_esa_letters />, source: "src/pages/blog-washington-pet-rent-and-esa-letters/page.tsx" },
  { path: "/blog/what-is-an-esa-letter", element: <Pg_blog_what_is_an_esa_letter />, source: "src/pages/blog-what-is-an-esa-letter/page.tsx" },
  { path: "/california-esa-letter-30-day-rule", element: <Pg_california_esa_letter_30_day_rule />, source: "src/pages/california-esa-letter-30-day-rule/page.tsx" },
  { path: "/california-esa-letter-for-apartments", element: <Pg_california_esa_letter_for_apartments />, source: "src/pages/california-esa-letter-for-apartments/page.tsx" },
  { path: "/can-a-landlord-deny-a-psd-letter", element: <Pg_can_a_landlord_deny_a_psd_letter />, source: "src/pages/can-a-landlord-deny-a-psd-letter/page.tsx" },
  { path: "/can-landlord-reject-esa-letter", element: <Pg_can_landlord_reject_esa_letter />, source: "src/pages/can-landlord-reject-esa-letter/page.tsx" },
  { path: "/college-pet-policy", element: <Pg_college_pet_policy />, source: "src/pages/college-pet-policy/page.tsx" },
  { path: "/college-pet-policy/:college", element: <Pg_college_policy_detail />, source: "src/pages/college-policy-detail/page.tsx" },
  { path: "/contact-us", element: <Pg_contact_us />, source: "src/pages/contact-us/page.tsx" },
  { path: "/do-you-need-a-psd-letter-for-a-service-dog", element: <Pg_do_you_need_a_psd_letter_for_a_service_dog />, source: "src/pages/do-you-need-a-psd-letter-for-a-service-dog/page.tsx" },
  { path: "/doctors/:id", element: <Pg_doctor_profile />, source: "src/pages/doctor-profile/page.tsx" },
  { path: "/esa-accommodation-request-letter", element: <Pg_esa_accommodation_request_letter />, source: "src/pages/esa-accommodation-request-letter/page.tsx" },
  { path: "/esa-laws", element: <Pg_esa_laws />, source: "src/pages/esa-laws/page.tsx" },
  { path: "/esa-letter-cost", element: <Pg_esa_letter_cost />, source: "src/pages/esa-letter-cost/page.tsx" },
  { path: "/esa-letter-for-apartments", element: <Pg_esa_letter_for_apartments />, source: "src/pages/esa-letter-for-apartments/page.tsx" },
  { path: "/esa-letter-for-landlord", element: <Pg_esa_letter_for_landlord />, source: "src/pages/esa-letter-for-landlord/page.tsx" },
  { path: "/esa-letter-housing", element: <Pg_esa_letter_housing />, source: "src/pages/lp-esa-housing/page.tsx" },
  { path: "/esa-letter-verification", element: <Pg_esa_letter_verification />, source: "src/pages/esa-letter-verification/page.tsx" },
  { path: "/esa-letter-verification-id", element: <Pg_esa_letter_verification_id />, source: "src/pages/esa-letter-verification-id/page.tsx" },
  { path: "/esa-letter-vs-pet-policy", element: <Pg_esa_letter_vs_pet_policy />, source: "src/pages/esa-letter-vs-pet-policy/page.tsx" },
  { path: "/esa-letter/:state", element: <Pg_state_esa />, source: "src/pages/state-esa/page.tsx" },
  { path: "/esa-pet-rent-deposit", element: <Pg_esa_pet_rent_deposit />, source: "src/pages/esa-pet-rent-deposit/page.tsx" },
  { path: "/esa-psd-registry-vs-letter", element: <Pg_esa_psd_registry_vs_letter />, source: "src/pages/esa-psd-registry-vs-letter/page.tsx" },
  { path: "/esa-vs-psd-letter", element: <Pg_esa_vs_psd_letter />, source: "src/pages/esa-vs-psd-letter/page.tsx" },
  { path: "/everything-you-need-to-know-about-obtaining-an-esa-letter-online", element: <Pg_everything_esa_online />, source: "src/pages/everything-esa-online/page.tsx" },
  { path: "/explore-esa-letters-all-states", element: <Pg_explore_states />, source: "src/pages/explore-states/page.tsx" },
  { path: "/faqs", element: <Pg_faqs />, source: "src/pages/faqs/page.tsx" },
  { path: "/florida-esa-letter-for-apartments", element: <Pg_florida_esa_letter_for_apartments />, source: "src/pages/florida-esa-letter-for-apartments/page.tsx" },
  { path: "/florida-esa-letter-housing-rules", element: <Pg_florida_esa_letter_housing_rules />, source: "src/pages/florida-esa-letter-housing-rules/page.tsx" },
  { path: "/housing-rights-esa", element: <Pg_housing_rights />, source: "src/pages/housing-rights/page.tsx" },
  { path: "/how-to-get-esa-letter", element: <Pg_how_to_get_esa />, source: "src/pages/how-to-get-esa/page.tsx" },
  { path: "/how-to-get-esa-letter-online", element: <Pg_how_to_get_esa_letter_online />, source: "src/pages/how-to-get-esa-letter-online/page.tsx" },
  { path: "/how-to-get-psd-letter", element: <Pg_how_to_get_psd_letter />, source: "src/pages/how-to-get-psd-letter/page.tsx" },
  { path: "/how-to-respond-to-esa-letter-denial", element: <Pg_how_to_respond_to_esa_letter_denial />, source: "src/pages/how-to-respond-to-esa-letter-denial/page.tsx" },
  { path: "/how-to-verify-esa-letter", element: <Pg_how_to_verify_esa_letter />, source: "src/pages/how-to-verify-esa-letter/page.tsx" },
  { path: "/iowa-esa-letter-housing-rules", element: <Pg_iowa_esa_letter_housing_rules />, source: "src/pages/iowa-esa-letter-housing-rules/page.tsx" },
  { path: "/is-pawtenant-legit", element: <Pg_is_pawtenant_legit />, source: "src/pages/is-pawtenant-legit/page.tsx" },
  { path: "/join-our-network", element: <Pg_join_our_network />, source: "src/pages/join-our-network/page.tsx" },
  { path: "/landlord-denied-esa-letter", element: <Pg_landlord_denied_esa_letter />, source: "src/pages/landlord-denied-esa-letter/page.tsx" },
  { path: "/landlord-esa-documentation-checklist", element: <Pg_landlord_esa_documentation_checklist />, source: "src/pages/landlord-esa-documentation-checklist/page.tsx" },
  { path: "/landlord-says-esa-letter-is-fake", element: <Pg_landlord_says_esa_letter_is_fake />, source: "src/pages/landlord-says-esa-letter-is-fake/page.tsx" },
  { path: "/new-york-esa-letter-for-apartments", element: <Pg_new_york_esa_letter_for_apartments />, source: "src/pages/new-york-esa-letter-for-apartments/page.tsx" },
  { path: "/no-risk-guarantee", element: <Pg_no_risk_guarantee />, source: "src/pages/no-risk-guarantee/page.tsx" },
  { path: "/our-providers", element: <Pg_our_providers />, source: "src/pages/our-providers/page.tsx" },
  { path: "/pet-rent-savings-calculator", element: <Pg_pet_rent_savings_calculator />, source: "src/pages/pet-rent-savings-calculator/page.tsx" },
  { path: "/privacy-policy", element: <Pg_privacy_policy />, source: "src/pages/privacy-policy/page.tsx" },
  { path: "/psd-assessment", element: <Pg_psd_assessment />, source: "src/pages/psd-assessment/page.tsx" },
  { path: "/psd-letter-for-apartments", element: <Pg_psd_letter_for_apartments />, source: "src/pages/psd-letter-for-apartments/page.tsx" },
  { path: "/psd-letter-requirements", element: <Pg_psd_letter_requirements />, source: "src/pages/psd-letter-requirements/page.tsx" },
  { path: "/psd-letter/:state", element: <Pg_state_psd />, source: "src/pages/state-psd/page.tsx" },
  { path: "/psychiatric-service-dog-letter-online", element: <Pg_psychiatric_service_dog_letter_online />, source: "src/pages/psychiatric-service-dog-letter-online/page.tsx" },
  { path: "/refund-policy", element: <Pg_refund_policy />, source: "src/pages/refund-policy/page.tsx" },
  { path: "/renew-esa-letter", element: <Pg_renew_esa_letter />, source: "src/pages/renew-esa-letter/page.tsx" },
  { path: "/resource-center", element: <Pg_resource_center />, source: "src/pages/resource-center/page.tsx" },
  { path: "/service-animal-vs-esa", element: <Pg_service_animal_vs_esa />, source: "src/pages/service-animal-vs-esa/page.tsx" },
  { path: "/sitemap", element: <Pg_sitemap />, source: "src/pages/sitemap/page.tsx" },
  { path: "/states/california-esa-psd-guide", element: <Pg_states_california_esa_psd_guide />, source: "src/pages/states-california-esa-psd-guide/page.tsx" },
  { path: "/states/los-angeles-esa-landlord-guide", element: <Pg_states_los_angeles_esa_landlord_guide />, source: "src/pages/states-los-angeles-esa-landlord-guide/page.tsx" },
  { path: "/states/san-diego-telehealth-guide", element: <Pg_states_san_diego_telehealth_guide />, source: "src/pages/states-san-diego-telehealth-guide/page.tsx" },
  { path: "/states/san-francisco-hoa-psd-guide", element: <Pg_states_san_francisco_hoa_psd_guide />, source: "src/pages/states-san-francisco-hoa-psd-guide/page.tsx" },
  { path: "/states/texas-esa-psd-guide", element: <Pg_states_texas_esa_psd_guide />, source: "src/pages/states-texas-esa-psd-guide/page.tsx" },
  { path: "/terms-of-use", element: <Pg_terms_of_use />, source: "src/pages/terms-of-use/page.tsx" },
  { path: "/texas-esa-letter-for-apartments", element: <Pg_texas_esa_letter_for_apartments />, source: "src/pages/texas-esa-letter-for-apartments/page.tsx" },
  { path: "/travel-anxiety-esa-letter", element: <Pg_travel_anxiety_esa_letter />, source: "src/pages/travel-anxiety-esa-letter/page.tsx" },
  { path: "/what-documents-can-landlord-ask-for-esa", element: <Pg_what_documents_can_landlord_ask_for_esa />, source: "src/pages/what-documents-can-landlord-ask-for-esa/page.tsx" },
  { path: "/what-makes-esa-letter-valid", element: <Pg_what_makes_esa_letter_valid />, source: "src/pages/what-makes-esa-letter-valid/page.tsx" },
];

/**
 * Expansion of each dynamic pattern into the concrete routes to prerender.
 * Driven by the same data modules prerender-seo.mjs iterates, so the two can
 * never disagree about which files exist.
 */
const ALL_BLOG_POSTS = [
  ...blogPosts,
  ...blogPostsExtended,
  ...blogPostsExtended2,
  ...blogPostsVerification,
];

// Providers stay explicitly listed: prerender-seo.mjs only writes head files
// for the curated approved set, and injecting into a file that does not exist
// is a build failure rather than a silent skip.
const PRERENDERED_DOCTOR_SLUGS = [
  "robert-staaf",
  "lytara-garcia",
  "stephanie-white",
  "eve-rosno",
  "henry-smith",
  "chad-cunningham",
  "karla-delgado",
  "cassandra-enriquez",
];

const DYNAMIC_EXPANSIONS: Record<string, () => string[]> = {
  "/esa-letter/:state": () =>
    Object.keys(ESA_STATE_META).map((slug) => `/esa-letter/${slug}`),
  // PSD entries are formulaic in seoConfig; getSEO returns null for slugs that
  // have no PSD page, exactly as prerender-seo.mjs filters them.
  "/psd-letter/:state": () =>
    Object.keys(ESA_STATE_META)
      .map((slug) => `/psd-letter/${slug}`)
      .filter((routePath) => Boolean(getSEO(routePath))),
  "/blog/state/:state": () =>
    STATE_BLOG_MAP.map((entry) => `/blog/state/${entry.stateSlug}`),
  // externalUrl posts link off-site and get no local file. Only some entries in
  // the blog union declare the field, so narrow with `in` rather than reading it
  // off the union directly (scripts/prerender-seo.mjs filters identically).
  "/blog/:slug": () =>
    ALL_BLOG_POSTS.filter(
      (post) => !("externalUrl" in post && post.externalUrl),
    ).map((post) => `/blog/${post.slug}`),
  "/college-pet-policy/:college": () =>
    colleges.map((college) => `/college-pet-policy/${college.slug}`),
  "/doctors/:id": () => PRERENDERED_DOCTOR_SLUGS.map((slug) => `/doctors/${slug}`),
};

function expandRoutes(): { routes: string[]; source: Record<string, string> } {
  const routes: string[] = [];
  const source: Record<string, string> = {};
  const seen = new Set<string>();

  const add = (routePath: string, sourceKey: string) => {
    if (seen.has(routePath)) return;
    seen.add(routePath);
    routes.push(routePath);
    source[routePath] = sourceKey;
  };

  for (const entry of ROUTE_ELEMENTS) {
    if (!entry.path.includes(":")) {
      add(entry.path, entry.source);
      continue;
    }
    const expand = DYNAMIC_EXPANSIONS[entry.path];
    if (!expand) {
      throw new Error(
        `[prerender/entry] dynamic pattern ${entry.path} has no entry in DYNAMIC_EXPANSIONS`,
      );
    }
    for (const routePath of expand()) add(routePath, entry.source);
  }

  return { routes, source };
}

const EXPANDED = expandRoutes();

/**
 * The exact set of routes this entry can render. The generator imports this so
 * the two can never drift. Name kept as SPIKE_ROUTES for compatibility with
 * scripts/prerender-full-body-spike.mjs.
 */
export const SPIKE_ROUTES: string[] = EXPANDED.routes;

/**
 * Route → the page.tsx source key in the Vite manifest, so the generator can
 * resolve each route's lazily-loaded client chunk and inject a
 * <link rel="modulepreload"> for it. That makes the lazy route module ready by
 * the time createRoot() mounts, so the client re-render is immediate — no
 * spinner gap between the SSR'd first paint and the client render.
 */
export const ROUTE_SOURCE: Record<string, string> = EXPANDED.source;

/**
 * Render one approved route to a static HTML string (the innerHTML that will
 * be injected into <div id="root">). Throws if the route matches nothing, so
 * the generator fails loudly rather than writing an empty body.
 */
export function renderRoute(routePath: string): string {
  return renderToStaticMarkup(
    <StaticRouter location={routePath}>
      <Routes>
        {ROUTE_ELEMENTS.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>
    </StaticRouter>,
  );
}

/**
 * Build the <head> JSON-LD <script> string for a provider route so the raw HTML
 * carries provider schema exactly once. Effects never run under
 * renderToStaticMarkup and the body's JSON-LD is stripped by the generator, so
 * scripts/prerender-full-body-spike.mjs injects this into <head> instead.
 * Returns null for any non-provider route. "<" is escaped so the JSON can never
 * terminate the surrounding <script>. AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001.
 */
export function getRouteHeadJsonLd(routePath: string): string | null {
  const wrap = (graph: Record<string, unknown>) =>
    `<script type="application/ld+json">${stringifyJsonLd(graph).replace(/</g, "\\u003c")}</script>`;
  if (routePath === "/our-providers") return wrap(buildOurProvidersJsonLd(PUBLISHED_PROVIDERS));
  const m = routePath.match(/^\/doctors\/([a-z0-9-]+)$/);
  if (m) {
    const provider = getPublicProvider(m[1]);
    if (provider) return wrap(buildProviderJsonLd(provider));
  }
  return null;
}