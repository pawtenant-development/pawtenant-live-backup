// Provider Login — consolidated into the unified staff/provider sign-in.
//
// There is now ONE login entry for PawTenant internal staff AND providers
// (the "Staff & Provider Portal" at /admin-login, reached from /company).
// This route is kept alive so existing bookmarks and the provider-portal
// auth-guard redirect (/provider-login?returnUrl=…) keep working — it simply
// forwards to the unified login, preserving the provider's return target and
// the post-password-reset success banner. Password reset for providers is
// handled by the shared, role-aware /reset-password flow.
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ProviderLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const returnUrl = searchParams.get("returnUrl") ?? "/provider-portal";
    const passwordReset = searchParams.get("passwordReset");
    // Only forward provider-scoped return targets; otherwise default to the portal.
    const next = returnUrl.startsWith("/provider") ? returnUrl : "/provider-portal";
    const params = new URLSearchParams({ next });
    if (passwordReset) params.set("passwordReset", passwordReset);
    navigate(`/admin-login?${params.toString()}`, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
      <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282]"></i>
    </div>
  );
}
