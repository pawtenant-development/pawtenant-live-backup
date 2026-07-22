import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
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
const PSDLetterCostPage = lazy(() => import("../pages/psd-letter-cost/page"));
const ExploreStatesPage = lazy(() => import("../pages/explore-states/page"));
const StateESAPage = lazy(() => import("../pages/state-esa/page"));
const ServiceDogsPage = lazy(() => import("../pages/service-dogs/page"));
const HowToGetPSDLetterPage = lazy(() => import("../pages/how-to-get-psd-letter/page"));
const PrivacyPolicyPage = lazy(() => import("../pages/privacy-policy/page"));
const TermsOfUsePage = lazy(() => import("../pages/terms-of-use/page"));
const RefundPolicyPage = lazy(() => import("../pages/refund-policy/page"));
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
const OurProvidersPage = lazy(() => import("../pages/our-providers/page"));
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
const EsaPsdRegistryVsLetterPage = lazy(() => import("../pages/esa-psd-registry-vs-letter/page"));
const IsPawTenantLegitPage = lazy(() => import("../pages/is-pawtenant-legit/page"));
// Landlord ESA objection / documentation SEO batch (informational, indexable, in sitemap).
const CanLandlordRejectESALetterPage = lazy(() => import("../pages/can-landlord-reject-esa-letter/page"));
const WhatDocumentsCanLandlordAskForESAPage = lazy(() => import("../pages/what-documents-can-landlord-ask-for-esa/page"));
const ESALetterVsPetPolicyPage = lazy(() => import("../pages/esa-letter-vs-pet-policy/page"));
const HowToRespondToESALetterDenialPage = lazy(() => import("../pages/how-to-respond-to-esa-letter-denial/page"));
// ESA letter validity / verification SEO batch (informational, indexable, in sitemap).
const WhatMakesESALetterValidPage = lazy(() => import("../pages/what-makes-esa-letter-valid/page"));
const LandlordSaysESALetterIsFakePage = lazy(() => import("../pages/landlord-says-esa-letter-is-fake/page"));
const ESALetterVerificationIdPage = lazy(() => import("../pages/esa-letter-verification-id/page"));
// ESA housing SEO batch (informational, indexable, in sitemap).
const ESALetterForApartmentsPage = lazy(() => import("../pages/esa-letter-for-apartments/page"));
const ESAAccommodationRequestLetterPage = lazy(() => import("../pages/esa-accommodation-request-letter/page"));
const LandlordESADocumentationChecklistPage = lazy(() => import("../pages/landlord-esa-documentation-checklist/page"));
// State apartment ESA SEO batch (informational, indexable, in sitemap).
const CaliforniaESALetterForApartmentsPage = lazy(() => import("../pages/california-esa-letter-for-apartments/page"));
const TexasESALetterForApartmentsPage = lazy(() => import("../pages/texas-esa-letter-for-apartments/page"));
const FloridaESALetterForApartmentsPage = lazy(() => import("../pages/florida-esa-letter-for-apartments/page"));
const NewYorkESALetterForApartmentsPage = lazy(() => import("../pages/new-york-esa-letter-for-apartments/page"));
// HUD 2026 ESA enforcement-change educational page (indexable, in sitemap).
const AreEsaLettersStillValidAfterHudChangePage = lazy(() => import("../pages/are-esa-letters-still-valid-after-hud-change/page"));
// Pet rent savings calculator (interactive tool, indexable, in sitemap).
const PetRentSavingsCalculatorPage = lazy(() => import("../pages/pet-rent-savings-calculator/page"));
// 2026 HUD ESA guidelines blog article (indexable, in sitemap).
const Blog2026HudEsaGuidelinesPage = lazy(() => import("../pages/blog-2026-hud-esa-guidelines/page"));
// Travel-anxiety / major-event ESA content cluster (indexable, in sitemap).
const TravelAnxietyESALetterPage = lazy(() => import("../pages/travel-anxiety-esa-letter/page"));
const BlogESATravelAnxietyPage = lazy(() => import("../pages/blog-emotional-support-animal-travel-anxiety/page"));
const BlogTemporaryHousingESAPage = lazy(() => import("../pages/blog-temporary-housing-emotional-support-animal/page"));
const BlogCrowdsTravelStressESAPage = lazy(() => import("../pages/blog-crowds-travel-stress-emotional-support-animal/page"));
// Core ESA-letter blog cluster (indexable, in sitemap): how-to / what-is / requirements.
const BlogHowToGetEsaLetterOnlinePage = lazy(() => import("../pages/blog-how-to-get-an-esa-letter-online/page"));
const BlogWhatIsAnEsaLetterPage = lazy(() => import("../pages/blog-what-is-an-esa-letter/page"));
const BlogEsaLetterRequirementsPage = lazy(() => import("../pages/blog-esa-letter-requirements/page"));
// Pet-rent blog cluster (informational, indexable, in sitemap).
const BlogPetRentExplainedPage = lazy(() => import("../pages/blog-pet-rent-explained/page"));
const BlogApartmentPetRentEsaLettersPage = lazy(() => import("../pages/blog-apartment-pet-rent-and-esa-letters/page"));
const BlogPetDepositVsPetRentPage = lazy(() => import("../pages/blog-pet-deposit-vs-pet-rent/page"));
// State pet-rent blog cluster (informational, indexable, in sitemap).
const BlogCaliforniaPetRentEsaLettersPage = lazy(() => import("../pages/blog-california-pet-rent-and-esa-letters/page"));
const BlogNewYorkPetRentEsaLettersPage = lazy(() => import("../pages/blog-new-york-pet-rent-and-esa-letters/page"));
const BlogFloridaPetRentEsaLettersPage = lazy(() => import("../pages/blog-florida-pet-rent-and-esa-letters/page"));
const BlogTexasPetRentEsaLettersPage = lazy(() => import("../pages/blog-texas-pet-rent-and-esa-letters/page"));
const BlogWashingtonPetRentEsaLettersPage = lazy(() => import("../pages/blog-washington-pet-rent-and-esa-letters/page"));
const BlogColoradoPetRentEsaLettersPage = lazy(() => import("../pages/blog-colorado-pet-rent-and-esa-letters/page"));
// PSD AEO content batch — PSD conversion + AI-answer pages (indexable, in sitemap).
const PsychiatricServiceDogLetterOnlinePage = lazy(() => import("../pages/psychiatric-service-dog-letter-online/page"));
const PsdLetterForApartmentsPage = lazy(() => import("../pages/psd-letter-for-apartments/page"));
const PsdLetterRequirementsPage = lazy(() => import("../pages/psd-letter-requirements/page"));
const EsaVsPsdLetterPage = lazy(() => import("../pages/esa-vs-psd-letter/page"));
const CanALandlordDenyAPsdLetterPage = lazy(() => import("../pages/can-a-landlord-deny-a-psd-letter/page"));
const DoYouNeedAPsdLetterForAServiceDogPage = lazy(() => import("../pages/do-you-need-a-psd-letter-for-a-service-dog/page"));
// PSD blog cluster (indexable, in sitemap).
const BlogPsychiatricServiceDogLetterExplainedPage = lazy(() => import("../pages/blog-psychiatric-service-dog-letter-explained/page"));
const BlogPsdLetterVsServiceDogCertificatePage = lazy(() => import("../pages/blog-psd-letter-vs-service-dog-certificate/page"));
const BlogPsdLetterForAnxietyPage = lazy(() => import("../pages/blog-psd-letter-for-anxiety/page"));
const BlogPsychiatricServiceDogHousingRightsPage = lazy(() => import("../pages/blog-psychiatric-service-dog-housing-rights/page"));
// California ESA/PSD content cluster — /states/* regional guides + PSD-training blog (indexable, in sitemap).
const CaliforniaEsaPsdGuidePage = lazy(() => import("../pages/states-california-esa-psd-guide/page"));
const LosAngelesEsaLandlordGuidePage = lazy(() => import("../pages/states-los-angeles-esa-landlord-guide/page"));
const SanFranciscoHoaPsdGuidePage = lazy(() => import("../pages/states-san-francisco-hoa-psd-guide/page"));
const SanDiegoTelehealthGuidePage = lazy(() => import("../pages/states-san-diego-telehealth-guide/page"));
const BlogHowToTrainPsdTasksPage = lazy(() => import("../pages/blog-how-to-train-psychiatric-service-dog-tasks/page"));
// Texas ESA/PSD content cluster — /states/texas-esa-psd-guide + Texas penalties blog (indexable, in sitemap).
const TexasEsaPsdGuidePage = lazy(() => import("../pages/states-texas-esa-psd-guide/page"));
const BlogTexasServiceAnimalPenaltiesPage = lazy(() => import("../pages/blog-texas-service-animal-laws-penalties/page"));
// PSD/ESA condition content cluster — anxiety/depression qualification (indexable, in sitemap).
const BlogCanAnxietyQualifyPsdPage = lazy(() => import("../pages/blog-can-anxiety-qualify-you-for-a-psd/page"));
const BlogCanDepressionQualifyPsdPage = lazy(() => import("../pages/blog-can-depression-qualify-psychiatric-service-dog/page"));
const BlogCanDepressionQualifyEsaPage = lazy(() => import("../pages/blog-can-depression-qualify-you-for-an-esa/page"));

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

// ── Legacy flat state URLs → canonical nested routes ─────────────────────────
// The original site (and some older internal links / indexed pages) used flat
// URLs like /esa-letter-florida. Canonical is /esa-letter/florida (and
// /psd-letter/:state for PSD). These redirects keep any old link, bookmark, or
// indexed URL working. `replace` avoids polluting history; the query string is
// preserved so attribution params (?utm_*, ?gclid) survive the hop.
//
// Slug lists mirror src/mocks/states.ts (51) and src/mocks/statesPSD.ts (10).
// They are duplicated here as plain strings instead of importing those data
// modules (~104 KB + ~42 KB) into the eager router bundle. If a state page is
// added or removed there, update these lists too.
const ESA_STATE_SLUGS = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new-hampshire", "new-jersey",
  "new-mexico", "new-york", "north-carolina", "north-dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode-island", "south-carolina",
  "south-dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "washington-dc", "west-virginia", "wisconsin", "wyoming",
];
const PSD_STATE_SLUGS = [
  "arizona", "california", "florida", "georgia", "illinois", "new-york",
  "north-carolina", "ohio", "pennsylvania", "texas",
];

function LegacyStateRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

const legacyFlatStateRoutes: RouteObject[] = [
  ...ESA_STATE_SLUGS.map((slug) => ({
    path: `/esa-letter-${slug}`,
    element: <LegacyStateRedirect to={`/esa-letter/${slug}`} />,
  })),
  ...PSD_STATE_SLUGS.map((slug) => ({
    path: `/psd-letter-${slug}`,
    element: <LegacyStateRedirect to={`/psd-letter/${slug}`} />,
  })),
];

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
  { path: "/psd-letter-cost", element: <P C={PSDLetterCostPage} /> },
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
  { path: "/esa-psd-registry-vs-letter", element: <P C={EsaPsdRegistryVsLetterPage} /> },
  { path: "/is-pawtenant-legit", element: <P C={IsPawTenantLegitPage} /> },
  // Landlord ESA objection / documentation SEO batch (informational, indexable).
  { path: "/can-landlord-reject-esa-letter", element: <P C={CanLandlordRejectESALetterPage} /> },
  { path: "/what-documents-can-landlord-ask-for-esa", element: <P C={WhatDocumentsCanLandlordAskForESAPage} /> },
  { path: "/esa-letter-vs-pet-policy", element: <P C={ESALetterVsPetPolicyPage} /> },
  { path: "/how-to-respond-to-esa-letter-denial", element: <P C={HowToRespondToESALetterDenialPage} /> },
  // ESA letter validity / verification SEO batch (informational, indexable).
  { path: "/what-makes-esa-letter-valid", element: <P C={WhatMakesESALetterValidPage} /> },
  { path: "/landlord-says-esa-letter-is-fake", element: <P C={LandlordSaysESALetterIsFakePage} /> },
  { path: "/esa-letter-verification-id", element: <P C={ESALetterVerificationIdPage} /> },
  // PSD AEO content batch — PSD conversion + AI-answer pages (informational, indexable).
  { path: "/psychiatric-service-dog-letter-online", element: <P C={PsychiatricServiceDogLetterOnlinePage} /> },
  { path: "/psd-letter-for-apartments", element: <P C={PsdLetterForApartmentsPage} /> },
  { path: "/psd-letter-requirements", element: <P C={PsdLetterRequirementsPage} /> },
  { path: "/esa-vs-psd-letter", element: <P C={EsaVsPsdLetterPage} /> },
  { path: "/can-a-landlord-deny-a-psd-letter", element: <P C={CanALandlordDenyAPsdLetterPage} /> },
  { path: "/do-you-need-a-psd-letter-for-a-service-dog", element: <P C={DoYouNeedAPsdLetterForAServiceDogPage} /> },
  // ESA housing SEO batch (informational, indexable).
  { path: "/esa-letter-for-apartments", element: <P C={ESALetterForApartmentsPage} /> },
  { path: "/esa-accommodation-request-letter", element: <P C={ESAAccommodationRequestLetterPage} /> },
  { path: "/landlord-esa-documentation-checklist", element: <P C={LandlordESADocumentationChecklistPage} /> },
  // State apartment ESA SEO batch (informational, indexable).
  { path: "/california-esa-letter-for-apartments", element: <P C={CaliforniaESALetterForApartmentsPage} /> },
  { path: "/texas-esa-letter-for-apartments", element: <P C={TexasESALetterForApartmentsPage} /> },
  { path: "/florida-esa-letter-for-apartments", element: <P C={FloridaESALetterForApartmentsPage} /> },
  { path: "/new-york-esa-letter-for-apartments", element: <P C={NewYorkESALetterForApartmentsPage} /> },
  // Travel-anxiety / major-event ESA hub (informational, indexable).
  { path: "/travel-anxiety-esa-letter", element: <P C={TravelAnxietyESALetterPage} /> },
  // HUD 2026 ESA enforcement-change educational page (informational, indexable).
  { path: "/are-esa-letters-still-valid-after-hud-change", element: <P C={AreEsaLettersStillValidAfterHudChangePage} /> },
  // California ESA/PSD content cluster — /states/* regional guides (informational, indexable).
  { path: "/states/california-esa-psd-guide", element: <P C={CaliforniaEsaPsdGuidePage} /> },
  { path: "/states/los-angeles-esa-landlord-guide", element: <P C={LosAngelesEsaLandlordGuidePage} /> },
  { path: "/states/san-francisco-hoa-psd-guide", element: <P C={SanFranciscoHoaPsdGuidePage} /> },
  { path: "/states/san-diego-telehealth-guide", element: <P C={SanDiegoTelehealthGuidePage} /> },
  // Texas ESA/PSD content cluster — main Texas guide (informational, indexable).
  { path: "/states/texas-esa-psd-guide", element: <P C={TexasEsaPsdGuidePage} /> },
  // Pet rent savings calculator (interactive tool, indexable).
  { path: "/pet-rent-savings-calculator", element: <P C={PetRentSavingsCalculatorPage} /> },
  { path: "/explore-esa-letters-all-states", element: <P C={ExploreStatesPage} /> },
  // PRIMARY route — /esa-letter/[state] format
  { path: "/esa-letter/:state", element: <P C={StateESAPage} /> },
  { path: "/all-about-service-dogs", element: <P C={ServiceDogsPage} /> },
  { path: "/how-to-get-psd-letter", element: <P C={HowToGetPSDLetterPage} /> },
  { path: "/privacy-policy", element: <P C={PrivacyPolicyPage} /> },
  { path: "/terms-of-use", element: <P C={TermsOfUsePage} /> },
  { path: "/refund-policy", element: <P C={RefundPolicyPage} /> },
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
  { path: "/blog/how-to-get-an-esa-letter-online", element: <P C={BlogHowToGetEsaLetterOnlinePage} /> },
  { path: "/blog/what-is-an-esa-letter", element: <P C={BlogWhatIsAnEsaLetterPage} /> },
  { path: "/blog/esa-letter-requirements", element: <P C={BlogEsaLetterRequirementsPage} /> },
  { path: "/blog/pet-rent-explained", element: <P C={BlogPetRentExplainedPage} /> },
  { path: "/blog/apartment-pet-rent-and-esa-letters", element: <P C={BlogApartmentPetRentEsaLettersPage} /> },
  { path: "/blog/pet-deposit-vs-pet-rent", element: <P C={BlogPetDepositVsPetRentPage} /> },
  { path: "/blog/california-pet-rent-and-esa-letters", element: <P C={BlogCaliforniaPetRentEsaLettersPage} /> },
  { path: "/blog/new-york-pet-rent-and-esa-letters", element: <P C={BlogNewYorkPetRentEsaLettersPage} /> },
  { path: "/blog/florida-pet-rent-and-esa-letters", element: <P C={BlogFloridaPetRentEsaLettersPage} /> },
  { path: "/blog/texas-pet-rent-and-esa-letters", element: <P C={BlogTexasPetRentEsaLettersPage} /> },
  { path: "/blog/washington-pet-rent-and-esa-letters", element: <P C={BlogWashingtonPetRentEsaLettersPage} /> },
  { path: "/blog/colorado-pet-rent-and-esa-letters", element: <P C={BlogColoradoPetRentEsaLettersPage} /> },
  { path: "/blog/psychiatric-service-dog-letter-explained", element: <P C={BlogPsychiatricServiceDogLetterExplainedPage} /> },
  { path: "/blog/psd-letter-vs-service-dog-certificate", element: <P C={BlogPsdLetterVsServiceDogCertificatePage} /> },
  { path: "/blog/psd-letter-for-anxiety", element: <P C={BlogPsdLetterForAnxietyPage} /> },
  { path: "/blog/psychiatric-service-dog-housing-rights", element: <P C={BlogPsychiatricServiceDogHousingRightsPage} /> },
  // California ESA/PSD cluster — PSD-training blog article (static segment outranks /blog/:slug).
  { path: "/blog/how-to-train-psychiatric-service-dog-tasks", element: <P C={BlogHowToTrainPsdTasksPage} /> },
  // Texas ESA/PSD cluster — Texas service-animal penalties blog (static segment outranks /blog/:slug).
  { path: "/blog/texas-service-animal-laws-penalties", element: <P C={BlogTexasServiceAnimalPenaltiesPage} /> },
  // PSD/ESA condition content cluster — anxiety/depression qualification (static segments outrank /blog/:slug).
  { path: "/blog/can-anxiety-qualify-you-for-a-psd", element: <P C={BlogCanAnxietyQualifyPsdPage} /> },
  { path: "/blog/can-depression-qualify-psychiatric-service-dog", element: <P C={BlogCanDepressionQualifyPsdPage} /> },
  { path: "/blog/can-depression-qualify-you-for-an-esa", element: <P C={BlogCanDepressionQualifyEsaPage} /> },
  { path: "/blog/:slug", element: <P C={BlogPostPage} /> },
  { path: "/sitemap", element: <P C={SitemapPage} /> },
  { path: "/contact-us", element: <P C={ContactUsPage} /> },
  // Consultation Slot Recovery Funnel — noindex (set per-page). Captures
  // a preferred consultation window into public.consultation_requests.
  { path: "/consultation-request", element: <P C={ConsultationRequestPage} /> },
  { path: "/our-providers", element: <P C={OurProvidersPage} /> },
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
  // Legacy flat state URLs (/esa-letter-florida, /psd-letter-texas, …) →
  // canonical nested routes. Generated above; NOT in sitemap, NOT canonical.
  ...legacyFlatStateRoutes,
  { path: "*", element: <P C={NotFound} /> },
];

export default routes;
