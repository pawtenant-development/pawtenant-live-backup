import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const ResetPasswordPage = lazy(() => import("../pages/reset-password/page"));
const PartnerPortalPage = lazy(() => import("../pages/partner-portal/page"));
const CustomerLoginPage = lazy(() => import("../pages/customer-login/page"));
const MyOrdersPage = lazy(() => import("../pages/my-orders/page"));
const AccountCheckoutPage = lazy(() => import("../pages/account-checkout/page"));
const CheckoutLinkPage = lazy(() => import("../pages/checkout-link/page"));

function PageLoader({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf7]">
      <div className="flex flex-col items-center gap-3">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        <span className="text-sm text-[#1a5c4f]/60 font-medium">{label}</span>
      </div>
    </div>
  );
}

function P({ C, label }: { C: React.ComponentType; label: string }) {
  return (
    <Suspense fallback={<PageLoader label={label} />}>
      <C />
    </Suspense>
  );
}

export function PartnerSubdomainRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/partner-portal" replace />} />
      <Route path="/partner-portal" element={<P C={PartnerPortalPage} label="Loading partner portal..." />} />
      <Route path="/reset-password" element={<P C={ResetPasswordPage} label="Loading secure access..." />} />
      <Route path="*" element={<Navigate to="/partner-portal" replace />} />
    </Routes>
  );
}

export function CustomerSubdomainRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/customer-login" replace />} />
      <Route path="/customer-login" element={<P C={CustomerLoginPage} label="Loading customer portal..." />} />
      <Route path="/my-orders" element={<P C={MyOrdersPage} label="Loading your orders..." />} />
      <Route path="/account/checkout" element={<P C={AccountCheckoutPage} label="Loading checkout..." />} />
      <Route path="/checkout/:slug" element={<P C={CheckoutLinkPage} label="Loading checkout..." />} />
      <Route path="/checkout" element={<P C={CheckoutLinkPage} label="Loading checkout..." />} />
      <Route path="/reset-password" element={<P C={ResetPasswordPage} label="Loading secure access..." />} />
      <Route path="*" element={<Navigate to="/customer-login" replace />} />
    </Routes>
  );
}

