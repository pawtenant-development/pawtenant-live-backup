import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

// Lazy-loaded pages for code splitting
const NotFound = lazy(() => import("../pages/NotFound"));
const Home = lazy(() => import("../pages/home/page"));
const AssessmentPage = lazy(() => import("../pages/assessment/page"));
const HowToGetESAPage = lazy(() => import("../pages/how-to-get-esa/page"));
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
const AdminGuidePage = lazy(() => import("../pages/admin-guide/page"));
const AdminLoginPage = lazy(() => import("../pages/admin-login/page"));
const ResetPasswordPage = lazy(() => import("../pages/reset-password/page"));
const AdminDoctorsPage = lazy(() => import("../pages/admin-doctors/page"));
const ProviderLoginPage = lazy(() => import("../pages/provider-login/page"));
const ProviderPortalPage = lazy(() => import("../pages/provider-portal/page"));
const PSDAssessmentPage = lazy(() => import("../pages/psd-assessment/page"));
const PSDAssessmentThankYouPage = lazy(() => import("../pages/psd-assessment-thankyou/page"));
const StatePSDPage = lazy(() => import("../pages/state-psd/page"));
const ResourceCenterPage = lazy(() => import("../pages/resource-center/page"));

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

function P({ C }: { C: React.ComponentType }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <C />
    </Suspense>
  );
}

const routes: RouteObject[] = [
  { path: "/", element: <P C={Home} /> },
  { path: "/apply-page", element: <Navigate to="/assessment" replace /> },
  { path: "/assessment", element: <P C={AssessmentPage} /> },
  { path: "/assessment/thank-you", element: <P C={AssessmentThankYouPage} /> },
  { path: "/customer-login", element: <P C={CustomerLoginPage} /> },
  { path: "/my-orders", element: <P C={MyOrdersPage} /> },
  { path: "/how-to-get-esa-letter", element: <P C={HowToGetESAPage} /> },
  { path: "/housing-rights-esa", element: <P C={HousingRightsPage} /> },
  { path: "/esa-letter-cost", element: <P C={ESALetterCostPage} /> },
  { path: "/explore-esa-letters-all-states", element: <P C={ExploreStatesPage} /> },
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
  { path: "/blog/:slug", element: <P C={BlogPostPage} /> },
  { path: "/sitemap", element: <P C={SitemapPage} /> },
  { path: "/contact-us", element: <P C={ContactUsPage} /> },
  { path: "/doctors/:id", element: <P C={DoctorProfilePage} /> },
  { path: "/renew-esa-letter", element: <P C={RenewESALetterPage} /> },
  { path: "/join-our-network", element: <P C={JoinOurNetworkPage} /> },
  { path: "/go-live", element: <P C={GoLivePage} /> },
  { path: "/admin-login", element: <P C={AdminLoginPage} /> },
  { path: "/admin-orders", element: <P C={AdminOrdersPage} /> },
  { path: "/admin-doctors", element: <P C={AdminDoctorsPage} /> },
  { path: "/provider-login", element: <P C={ProviderLoginPage} /> },
  { path: "/provider-portal", element: <P C={ProviderPortalPage} /> },
  { path: "/admin-guide", element: <P C={AdminGuidePage} /> },
  { path: "/reset-password", element: <P C={ResetPasswordPage} /> },
  { path: "/psd-assessment", element: <P C={PSDAssessmentPage} /> },
  { path: "/psd-assessment/thank-you", element: <P C={PSDAssessmentThankYouPage} /> },
  { path: "/psd-letter/:state", element: <P C={StatePSDPage} /> },
  { path: "/resource-center", element: <P C={ResourceCenterPage} /> },
  { path: "*", element: <P C={NotFound} /> },
];

export default routes;
