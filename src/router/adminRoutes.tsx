/**
 * Admin Subdomain Routes
 *
 * Rendered only when ADMIN_SUBDOMAIN_ENABLED = true and the user is on
 * admin.pawtenant.com.  Contains strictly admin/provider portal pages —
 * no public marketing pages are exposed.
 *
 * /  → redirects to /admin-login
 * *  → redirects to /admin-login (catches any stray public URL attempts)
 */
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const AdminLoginPage    = lazy(() => import("../pages/admin-login/page"));
const AdminOrdersPage   = lazy(() => import("../pages/admin-orders/page"));
const AdminDoctorsPage  = lazy(() => import("../pages/admin-doctors/page"));
const AdminGuidePage    = lazy(() => import("../pages/admin-guide/page"));
const ResetPasswordPage = lazy(() => import("../pages/reset-password/page"));
const ProviderLoginPage  = lazy(() => import("../pages/provider-login/page"));
const ProviderPortalPage = lazy(() => import("../pages/provider-portal/page"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1e1a]">
      <div className="flex flex-col items-center gap-3">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#4ecdc4]"></i>
        <span className="text-sm text-white/40 font-medium">Loading admin portal...</span>
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

export function AdminSubdomainRoutes() {
  return (
    <Routes>
      {/* Root → admin login */}
      <Route path="/" element={<Navigate to="/admin-login" replace />} />

      {/* Admin portal */}
      <Route path="/admin-login"   element={<P C={AdminLoginPage} />} />
      <Route path="/admin-orders"  element={<P C={AdminOrdersPage} />} />
      <Route path="/admin-doctors" element={<P C={AdminDoctorsPage} />} />
      <Route path="/admin-guide"   element={<P C={AdminGuidePage} />} />

      {/* Shared auth utility */}
      <Route path="/reset-password" element={<P C={ResetPasswordPage} />} />

      {/* Provider portal — accessible from admin subdomain */}
      <Route path="/provider-login"  element={<P C={ProviderLoginPage} />} />
      <Route path="/provider-portal" element={<P C={ProviderPortalPage} />} />

      {/* Catch-all: redirect any unknown path to login rather than 404 */}
      <Route path="*" element={<Navigate to="/admin-login" replace />} />
    </Routes>
  );
}
