import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(isPreview);
  const [verifying, setVerifying] = useState(!isPreview);

  useEffect(() => {
    if (isPreview) return;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setVerifying(false);
    };

    // ── 1. Check if a session is already active (token already exchanged) ─
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
        settle();
      }
    });

    // ── 2. Listen for all auth events that mean "token is valid" ─────────
    // PASSWORD_RECOVERY fires for type=recovery
    // SIGNED_IN fires for type=invite and type=signup
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN"
      ) {
        if (session) {
          setSessionReady(true);
          settle();
        }
      }
    });

    // ── 3. Handle PKCE code exchange — ?code= param in URL ───────────────
    const code = searchParams.get("code");
    const type = searchParams.get("type");
    if (code && (type === "recovery" || type === "invite" || type === "signup")) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchErr }) => {
        if (!exchErr && data?.session) {
          setSessionReady(true);
          settle();
        } else {
          settle(); // will show "invalid/expired" UI
        }
      });
    }

    // ── 4. Timeout fallback ───────────────────────────────────────────────
    const timeout = setTimeout(settle, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Detect portal based on user role — redirect to the right login page
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("doctor_profiles")
        .select("is_admin, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      await supabase.auth.signOut();

      if (profile?.is_admin) {
        navigate("/admin-login?passwordReset=success", { replace: true });
        return;
      }
      if (profile) {
        navigate("/provider-login?passwordReset=success", { replace: true });
        return;
      }
    } else {
      await supabase.auth.signOut();
    }

    navigate("/customer-login?passwordReset=success", { replace: true });
  };

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-8 pt-8 pb-2 text-center border-b border-gray-100">
              <div className="w-14 h-14 flex items-center justify-center bg-[#f0faf7] rounded-full mx-auto mb-3">
                <i className="ri-lock-password-line text-[#1a5c4f] text-2xl"></i>
              </div>
              <h1 className="text-xl font-extrabold text-gray-900 mb-1">Set New Password</h1>
              <p className="text-sm text-gray-500 pb-6">Enter a strong password for your account.</p>
            </div>

            <div className="p-8">
              {verifying ? (
                <div className="text-center py-8">
                  <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f] block mb-3"></i>
                  <p className="text-sm text-gray-500">Verifying your reset link...</p>
                </div>
              ) : !sessionReady ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 flex items-center justify-center bg-red-50 rounded-full mx-auto mb-3">
                    <i className="ri-error-warning-line text-red-500 text-xl"></i>
                  </div>
                  <p className="text-sm font-bold text-gray-800 mb-2">Reset link invalid or expired</p>
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                    This link may have already been used or has expired (links are valid for 24 hours). Please request a new one from your sign-in page.
                  </p>
                  <div className="flex flex-col items-center gap-2">
                    <Link
                      to="/customer-login"
                      className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] cursor-pointer"
                    >
                      <i className="ri-user-line"></i>Customer Sign In
                    </Link>
                    <Link
                      to="/provider-login"
                      className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <i className="ri-stethoscope-line"></i>Provider Sign In
                    </Link>
                    <Link
                      to="/admin-login"
                      className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 cursor-pointer mt-1"
                    >
                      Admin Portal
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-red-700">
                      <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#1a5c4f]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Use at least 8 characters</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm New Password</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a5c4f]"
                    />
                  </div>

                  {/* Password strength indicators */}
                  <div className="flex items-center gap-2">
                    {[
                      { label: "8+ chars", met: password.length >= 8 },
                      { label: "Uppercase", met: /[A-Z]/.test(password) },
                      { label: "Number", met: /\d/.test(password) },
                    ].map((item) => (
                      <div key={item.label} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${item.met ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-gray-100 text-gray-400"}`}>
                        <i className={item.met ? "ri-checkbox-circle-fill" : "ri-circle-line"} style={{ fontSize: "11px" }}></i>
                        {item.label}
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="whitespace-nowrap w-full py-3 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-lg hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {loading
                      ? <><i className="ri-loader-4-line animate-spin" />Updating password...</>
                      : <><i className="ri-lock-2-line" />Set New Password</>
                    }
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Need help?{" "}
            <a href="mailto:hello@pawtenant.com" className="text-orange-500 font-semibold hover:underline">
              hello@pawtenant.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
