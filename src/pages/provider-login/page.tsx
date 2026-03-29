// Provider Login — PawTenant
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function ProviderLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/provider-portal";
  const passwordResetSuccess = searchParams.get("passwordReset") === "success";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  // If already logged in as a provider, redirect
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("doctor_profiles")
          .select("is_admin, is_active")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (profile && !profile.is_admin && profile.is_active !== false) {
          navigate(returnUrl);
          return;
        }
      }
      setChecking(false);
    };
    checkSession();
  }, [navigate, returnUrl]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError || !data.session) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("doctor_profiles")
        .select("is_admin, is_active, full_name")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      if (!profile) {
        await supabase.auth.signOut();
        setError("No provider profile found for this account. Contact support.");
        setLoading(false);
        return;
      }
      if (profile.is_admin) {
        await supabase.auth.signOut();
        setError("This account has admin access. Please use the admin login portal.");
        setLoading(false);
        return;
      }
      if (profile.is_active === false) {
        await supabase.auth.signOut();
        setError("Your account is currently inactive. Please contact support.");
        setLoading(false);
        return;
      }
      navigate(returnUrl);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetError("Please enter your email address.");
      return;
    }
    setResetLoading(true);
    setResetError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      resetEmail.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setResetLoading(false);
    if (err) {
      setResetError(err.message);
      return;
    }
    setResetSent(true);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block cursor-pointer">
            <img
              src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
              alt="PawTenant"
              className="h-12 mx-auto object-contain"
            />
          </Link>
          <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest mt-3 mb-1">Provider Portal</p>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {showReset ? "Reset Your Password" : "Sign in to your account"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {showReset
              ? "Enter your email and we'll send a reset link"
              : "Access your assigned cases and manage ESA evaluations"}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8">

          {/* ── Password reset success banner ── */}
          {passwordResetSuccess && !showReset && (
            <div className="mb-5 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-2.5">
              <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-sm flex-shrink-0 mt-0.5"></i>
              <p className="text-sm text-[#1a5c4f] font-semibold">Password updated successfully! Sign in with your new password.</p>
            </div>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {showReset ? (
            resetSent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 flex items-center justify-center bg-[#f0faf7] rounded-full mx-auto mb-4">
                  <i className="ri-mail-check-line text-[#1a5c4f] text-2xl"></i>
                </div>
                <p className="text-base font-extrabold text-gray-900 mb-1">Check your inbox</p>
                <p className="text-sm text-gray-500 mb-1">We sent a password reset link to:</p>
                <p className="text-sm font-bold text-[#1a5c4f] mb-5">{resetEmail}</p>
                <p className="text-xs text-gray-400 mb-6">
                  Click the link in the email to set a new password. The link expires in 1 hour.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowReset(false); setResetSent(false); setResetEmail(""); }}
                  className="whitespace-nowrap text-sm text-[#1a5c4f] font-bold hover:underline cursor-pointer"
                >
                  &larr; Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-5">
                {resetError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                    <p className="text-sm text-red-700">{resetError}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Email Address</label>
                  <div className="relative">
                    <i className="ri-mail-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="doctor@example.com"
                      autoFocus
                      className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] bg-white transition-colors"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Enter the email address linked to your provider account.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
                >
                  {resetLoading
                    ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                    : <><i className="ri-mail-send-line"></i>Send Reset Link</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReset(false); setResetError(""); setResetEmail(""); }}
                  className="whitespace-nowrap w-full text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                >
                  Cancel — back to sign in
                </button>
              </form>
            )
          ) : (
            /* ── SIGN IN FORM ── */
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Email Address</label>
                <div className="relative">
                  <i className="ri-mail-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@example.com"
                    className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] bg-white transition-colors"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-600">Password</label>
                  <button
                    type="button"
                    onClick={() => { setShowReset(true); setResetEmail(email); setError(""); }}
                    className="whitespace-nowrap text-xs text-[#1a5c4f] hover:underline font-semibold cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <i className="ri-lock-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] bg-white transition-colors"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <i className={showPassword ? "ri-eye-off-line text-sm" : "ri-eye-line text-sm"}></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
              >
                {loading
                  ? <><i className="ri-loader-4-line animate-spin"></i>Signing in...</>
                  : <><i className="ri-login-box-line"></i>Sign In to Provider Portal</>
                }
              </button>
            </form>
          )}

          {!showReset && (
            <div className="mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-start gap-3 bg-[#f0faf7] rounded-xl p-3">
                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                  <i className="ri-information-line text-[#1a5c4f] text-sm"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1a5c4f] mb-0.5">Need help signing in?</p>
                  <p className="text-xs text-[#1a5c4f]/70 leading-relaxed">
                    Your login credentials were sent when your account was created. Check your email for an invite from PawTenant, or contact your admin.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link to="/" className="hover:text-[#1a5c4f] transition-colors cursor-pointer">pawtenant.com</Link>
          {" · "}
          <a href="mailto:support@pawtenant.com" className="hover:text-[#1a5c4f] transition-colors cursor-pointer">support@pawtenant.com</a>
        </p>
      </div>
    </div>
  );
}
