import { lazy, Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

// Lazy-loaded pages for code splitting
const NotFound = lazy(() => import("../pages/NotFound"));
const Home = lazy(() => import("../pages/home/page"));
const AssessmentPage = lazy(() => import("../pages/assessment/page"));
const HowToGetESAPage = lazy(() => import("../pages/how-to-get-esa/page"));
// ── 2026-05-21 SEO-EVERYTHING-ESA ─────────────────────────────────────────
// Long-form SEO guide. The page component already exists in this repo
// (src/pages/everything-esa-online/page.tsx, 962 lines), but the route was
// never wired, so /everything-you-need-to-know-about-obtaining-an-esa-letter-
// online was returning 404 in LIVE while serving correctly in TEST. Mirrors
// the route registration that already exists in pawtenant-test.
const EverythingEsaOnlinePage = lazy(() => import("../pages/everything-esa-online/page"));
const HousingRightsPage = lazy(() => import("../pages/housing-rights/page"));
const ESALetterCostPage = lazy(() => import("../pages/esa-letter-cost/page"));
const ExploreStatesPage = lazy(() => import("../pages/explore-states/page"));
const StateESAPage = lazy(() => import("../pages/state-esa/page"));
const ServiceDogsPage = lazy(() => import("../pages/service-dogs/page"));
const HowToGetPSDLetterPage = lazy(() => import("../pages/how-to-get-psd-letter/page"));
const PrivacyPolicyPage = lazy(() => import("../pages/privacy-policy/page"));
const TermsOfUsePage = lazy(() => import("../pages/terms-of-use/page"));
const AboutUsPage = lazy(() => import("../pages/about-us/page"));
const NoRiskGuaranteePage = lazy(() => import("../pages/no-risk-guarantee/page"));
const FAQsPage = lazy(() => import("../pages/faqs/page"));
const CollegePetPolicyPage = lazy(() => import("../pages/college-pet-policy/page"));
const CollegePolicyDetailPage = lazy(() => import("../pages/college-policy-detail/page"));
const AirlinePetPolicyPage = lazy(() => import("../pages/airline-pet-policy/page"));
const ServiceAnimalVsESAPage = lazy(() => import("../pages/service-animal-vs-esa/page"));
const BlogPage = lazy(() => import("../pages/blog/page"));
const BlogPostPage = lazy(() => import("../pages/blog-post/page"));
const SitemapPage = lazy(() => import("../pages/sitemap/page"));
const ContactUsPage = lazy(() => import("../pages/contact-us/page"));
const DoctorProfilePage = lazy(() => import("../pages/doctor-profile/page"));
const RenewESALetterPage = lazy(() => import("../pages/renew-esa-letter/page"));
const JoinOurNetworkPage = lazy(() => import("../pages/join-our-network/page"));
const AssessmentThankYouPage = lazy(() => import("../pages/assessment-thankyou/page"));
const CustomerLoginPage = lazy(() => import("../pages/customer-login/page"));
const MyOrdersPage = lazy(() => import("../pages/my-orders/page"));
const GoLivePage = lazy(() => import("../pages/go-live/page"));
const AdminOrdersPage = lazy(() => import("../pages/admin-orders/page"));
const AdminLiveVisitorsPage = lazy(() => import("../pages/admin-live/page"));
const AdminGuidePage = lazy(() => import("../pages/admin-guide/page"));
const AdminLoginPage = lazy(() => import("../pages/admin-login/page"));
const ResetPasswordPage = lazy(() => import("../pages/reset-password/page"));
const AdminDoctorsPage = lazy(() => import("../pages/admin-doctors/page"));
const ProviderLoginPage = lazy(() => import("../pages/provider-login/page"));
const ProviderPortalPage = lazy(() => import("../pages/provider-portal/page"));
const AdminProviderPreview = lazy(() => import("../pages/admin-orders/components/AdminProviderPreview"));
const PSDAssessmentPage = lazy(() => import("../pages/psd-assessment/page"));
const PSDAssessmentThankYouPage = lazy(() => import("../pages/psd-assessment-thankyou/page"));
const StatePSDPage = lazy(() => import("../pages/state-psd/page"));
const ResourceCenterPage = lazy(() => import("../pages/resource-center/page"));
const BlogStatePage = lazy(() => import("../pages/blog-state/page"));
const VerifyEntryPage = lazy(() => import("../pages/verify/page"));
const VerifyResultPage = lazy(() => import("../pages/verify-result/page"));
const ESALetterVerificationPage = lazy(() => import("../pages/esa-letter-verification/page"));
const AccountCheckoutPage = lazy(() => import("../pages/account-checkout/page"));
const CompanyHomePage = lazy(() => import("../pages/company-home/page"));
// Google Ads paid landing page — noindex, not in nav, not in sitemap.
const LpEsaHousingPage = lazy(() => import("../pages/lp-esa-housing/page"));
// Meta/Facebook Ads paid landing page — noindex, not in nav, not in sitemap.
const MetaEsaLetterPage = lazy(() => import("../pages/meta-esa-letter/page"));
// Recovery click bridge — /r/:stage?o=<confirmationId>&dc=<discountCode>
const RecoveryClickBridge = lazy(() => import("../pages/r/page"));
// Consultation Slot Recovery Funnel — unpaid lead recovery V1
const ConsultationRequestPage = lazy(() => import("../pages/consultation-request/page"));
// ESA laws / compliance content pages (informational, indexable).
const ESALawsPage = lazy(() => import("../pages/esa-laws/page"));
const AreOnlineESALettersLegitPage = lazy(() => import("../pages/are-online-esa-letters-legit/page"));
const CaliforniaESA30DayRulePage = lazy(() => import("../pages/california-esa-letter-30-day-rule/page"));
const IowaESAHousingRulesPage = lazy(() => import("../pages/iowa-esa-letter-housing-rules/page"));
const FloridaESAHousingRulesPage = lazy(() => import("../pages/florida-esa-letter-housing-rules/page"));
const LandlordDeniedESALetterPage = lazy(() => import("../pages/landlord-denied-esa-letter/page"));
// AI-SEO answer-library pages (indexable, in sitemap + llms.txt).
const BestOnlineESALetterServicePage = lazy(() => import("../pages/best-online-esa-letter-service/page"));
const HowToGetESALetterOnlinePage = lazy(() => import("../pages/how-to-get-esa-letter-online/page"));
const ESALetterForLandlordPage = lazy(() => import("../pages/esa-letter-for-landlord/page"));
const ESAPetRentDepositPage = lazy(() => import("../pages/esa-pet-rent-deposit/page"));
const HowToVerifyESALetterPage = lazy(() => import("../pages/how-to-verify-esa-letter/page"));
const IsPawTenantLegitPage = lazy(() => import("../pages/is-pawtenant-legit/page"));
// HUD 2026 ESA enforcement-change educational page (indexable, in sitemap).
const AreEsaLettersStillValidAfterHudChangePage = lazy(() => import("../pages/are-esa-letters-still-valid-after-hud-change/page"));
// 2026 HUD ESA guidelines blog article (indexable, in sitemap).
const Blog2026HudEsaGuidelinesPage = lazy(() => import("../pages/blog-2026-hud-esa-guidelines/page"));
// Travel-anxiety / major-event ESA content cluster (indexable, in sitemap).
const TravelAnxietyESALetterPage = lazy(() => import("../pages/travel-anxiety-esa-letter/page"));
const BlogESATravelAnxietyPage = lazy(() => import("../pages/blog-emotional-support-animal-travel-anxiety/page"));
const BlogTemporaryHousingESAPage = lazy(() => import("../pages/blog-temporary-housing-emotional-support-animal/page"));
const BlogCrowdsTravelStressESAPage = lazy(() => import("../pages/blog-crowds-travel-stress-emotional-support-animal/page"));

// Minimal page-level loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50">
      <div className="flex flex-col items-center gap-3">
        <i className="ri-loader-4-line animate-spin text-3xl text-orange-500"></i>
        <span className="text-sm text-gray-500 font-medium">Loading...</span>
      </div>
    </div>
  );
}

function P({
  C,
  fallback = <PageLoader />,
}: {
  C: React.ComponentType;
  fallback?: React.ReactNode;
}) {
  return <Suspense fallback={fallback}>{<C />}</Suspense>;
}

function ESAStateRedirect() {
  const { state } = useParams<{ state: string }>();
  return <Navigate to={`/esa-letter/${state ?? ""}`} replace />;
}

const routes: RouteObject[] = [
  // Homepage: fallback={null} (not the orange PageLoader). The prerendered hero
  // skeleton already paints the above-the-fold instantly, and the Home chunk is
  // modulepreloaded (see scripts/prerender-seo.mjs) so it's ready by the time
  // React mounts — showing the spinner here would briefly REPLACE the painted
  // hero and inflate LCP/Speed Index. Null keeps whatever is painted until the
  // hero re-renders. Other routes keep the default PageLoader.
  { path: "/", element: <P C={Home} fallback={null} /> },
  { path: "/apply-page", element: <Navigate to="/assessment" replace /> },
  // Recovery click bridge — fires recovery_click then redirects to /assessment.
  { path: "/r/:stage", element: <P C={RecoveryClickBridge} /> },
  { path: "/assessment", element: <P C={AssessmentPage} /> },
  { path: "/assessment/thank-you", element: <P C={AssessmentThankYouPage} /> },
  { path: "/customer-login", element: <P C={CustomerLoginPage} /> },
  { path: "/my-orders", element: <P C={MyOrdersPage} /> },
  { path: "/account/checkout", element: <P C={AccountCheckoutPage} /> },
  { path: "/how-to-get-esa-letter", element: <P C={HowToGetESAPage} /> },
  // Long-form SEO guide — indexable, in sitemap.
  { path: "/everything-you-need-to-know-about-obtaining-an-esa-letter-online", element: <P C={EverythingEsaOnlinePage} /> },
  { path: "/housing-rights-esa", element: <P C={HousingRightsPage} /> },
  { path: "/esa-letter-cost", element: <P C={ESALetterCostPage} /> },
  // ESA laws / compliance content pages (informational, indexable).
  { path: "/esa-laws", element: <P C={ESALawsPage} /> },
  { path: "/are-online-esa-letters-legit", element: <P C={AreOnlineESALettersLegitPage} /> },
  { path: "/california-esa-letter-30-day-rule", element: <P C={CaliforniaESA30DayRulePage} /> },
  { path: "/iowa-esa-letter-housing-rules", element: <P C={IowaESAHousingRulesPage} /> },
  { path: "/florida-esa-letter-housing-rules", element: <P C={FloridaESAHousingRulesPage} /> },
  // Landlord-denial ESA housing-rights page (informational, indexable).
  { path: "/landlord-denied-esa-letter", element: <P C={LandlordDeniedESALetterPage} /> },
  // AI-SEO answer-library pages (informational, indexable).
  { path: "/best-online-esa-letter-service", element: <P C={BestOnlineESALetterServicePage} /> },
  { path: "/how-to-get-esa-letter-online", element: <P C={HowToGetESALetterOnlinePage} /> },
  { path: "/esa-letter-for-landlord", element: <P C={ESALetterForLandlordPage} /> },
  { path: "/esa-pet-rent-deposit", element: <P C={ESAPetRentDepositPage} /> },
  { path: "/how-to-verify-esa-letter", element: <P C={HowToVerifyESALetterPage} /> },
  { path: "/is-pawtenant-legit", element: <P C={IsPawTenantLegitPage} /> },
  // Travel-anxiety / major-event ESA hub (informational, indexable).
  { path: "/travel-anxiety-esa-letter", element: <P C={TravelAnxietyESALetterPage} /> },
  // HUD 2026 ESA enforcement-change educational page (informational, indexable).
  { path: "/are-esa-letters-still-valid-after-hud-change", element: <P C={AreEsaLettersStillValidAfterHudChangePage} /> },
  { path: "/explore-esa-letters-all-states", element: <P C={ExploreStatesPage} /> },
  // PRIMARY route — /esa-letter/[state] format
  { path: "/esa-letter/:state", element: <P C={StateESAPage} /> },
  { path: "/all-about-service-dogs", element: <P C={ServiceDogsPage} /> },
  { path: "/how-to-get-psd-letter", element: <P C={HowToGetPSDLetterPage} /> },
  { path: "/privacy-policy", element: <P C={PrivacyPolicyPage} /> },
  { path: "/terms-of-use", element: <P C={TermsOfUsePage} /> },
  { path: "/about-us", element: <P C={AboutUsPage} /> },
  { path: "/no-risk-guarantee", element: <P C={NoRiskGuaranteePage} /> },
  { path: "/faqs", element: <P C={FAQsPage} /> },
  { path: "/college-pet-policy", element: <P C={CollegePetPolicyPage} /> },
  { path: "/college-pet-policy/:college", element: <P C={CollegePolicyDetailPage} /> },
  { path: "/airline-pet-policy", element: <P C={AirlinePetPolicyPage} /> },
  { path: "/service-animal-vs-esa", element: <P C={ServiceAnimalVsESAPage} /> },
  { path: "/blog", element: <P C={BlogPage} /> },
  { path: "/blog/state/:state", element: <P C={BlogStatePage} /> },
  // Standalone rich articles — static segments outrank /blog/:slug in route matching.
  { path: "/blog/2026-hud-esa-guidelines", element: <P C={Blog2026HudEsaGuidelinesPage} /> },
  { path: "/blog/emotional-support-animal-travel-anxiety", element: <P C={BlogESATravelAnxietyPage} /> },
  { path: "/blog/temporary-housing-emotional-support-animal", element: <P C={BlogTemporaryHousingESAPage} /> },
  { path: "/blog/crowds-travel-stress-emotional-support-animal", element: <P C={BlogCrowdsTravelStressESAPage} /> },
  { path: "/blog/:slug", element: <P C={BlogPostPage} /> },
  { path: "/sitemap", element: <P C={SitemapPage} /> },
  { path: "/contact-us", element: <P C={ContactUsPage} /> },
  // Consultation Slot Recovery Funnel — noindex (set per-page). Captures
  // a preferred consultation window into public.consultation_requests.
  { path: "/consultation-request", element: <P C={ConsultationRequestPage} /> },
  { path: "/doctors/:id", element: <P C={DoctorProfilePage} /> },
  { path: "/renew-esa-letter", element: <P C={RenewESALetterPage} /> },
  { path: "/join-our-network", element: <P C={JoinOurNetworkPage} /> },
  { path: "/go-live", element: <P C={GoLivePage} /> },
  { path: "/admin-login", element: <P C={AdminLoginPage} /> },
  // Visitor Intelligence — Phase 1 read-only live visitors page.
  // Declared before /admin-orders so the more specific match is unambiguous.
  { path: "/admin-orders/live", element: <P C={AdminLiveVisitorsPage} /> },
  { path: "/admin-orders", element: <P C={AdminOrdersPage} /> },
  { path: "/company", element: <P C={CompanyHomePage} /> },
  { path: "/admin-doctors", element: <P C={AdminDoctorsPage} /> },
  { path: "/provider-login", element: <P C={ProviderLoginPage} /> },
  { path: "/provider-portal", element: <P C={ProviderPortalPage} /> },
  { path: "/admin/provider-preview", element: <P C={AdminProviderPreview} /> },
  { path: "/admin-guide", element: <P C={AdminGuidePage} /> },
  { path: "/reset-password", element: <P C={ResetPasswordPage} /> },
  { path: "/psd-assessment", element: <P C={PSDAssessmentPage} /> },
  { path: "/psd-assessment/thank-you", element: <P C={PSDAssessmentThankYouPage} /> },
  { path: "/psd-letter/:state", element: <P C={StatePSDPage} /> },
  { path: "/resource-center", element: <P C={ResourceCenterPage} /> },
  { path: "/verify", element: <P C={VerifyEntryPage} /> },
  { path: "/verify/:letterId", element: <P C={VerifyResultPage} /> },
  // Canonical landlord verification info page. caseSensitive so legacy
  // uppercase paths fall through to the explicit Navigate redirect below.
  { path: "/esa-letter-verification", caseSensitive: true, element: <P C={ESALetterVerificationPage} /> },
  // Legacy paths normalize/redirect to the canonical lowercase route.
  { path: "/ESA-letter-verification", element: <Navigate to="/esa-letter-verification" replace /> },
  { path: "/landlord-verification", element: <Navigate to="/esa-letter-verification" replace /> },
  { path: "/verifiable-esa-letters", element: <Navigate to="/esa-letter-verification" replace /> },
  // Google Ads paid landing page (TEST). noindex via per-page meta. Not in nav. Not in sitemap.
  { path: "/esa-letter-housing", element: <P C={LpEsaHousingPage} /> },
  // Meta/Facebook Ads paid landing page (TEST). noindex via per-page meta. Not in nav. Not in sitemap.
  { path: "/meta-esa-letter", element: <P C={MetaEsaLetterPage} /> },
  // Legacy redirects to the new canonical URL.
  { path: "/lp/esa-housing", element: <Navigate to="/esa-letter-housing" replace /> },
  { path: "/lp-esa-housing", element: <Navigate to="/esa-letter-housing" replace /> },
  { path: "*", element: <P C={NotFound} /> },
];

export default routes;
