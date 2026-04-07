import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

type Tab = "signin" | "signup";

export default function CustomerLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Show success message if redirected after password reset
  const passwordResetSuccess = searchParams.get("passwordReset") === "success";

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    // Check if this user is an admin — redirect to admin portal
    if (data.user) {
      const { data: profile } = await supabase
        .from("doctor_profiles")
        .select("is_admin")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (profile?.is_admin) {
        navigate("/admin-orders");
        return;
      }
    }
    navigate("/my-orders");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);

    // Use our edge function instead of supabase.auth.signUp() so NO
    // confirmation email is sent — eliminates bounce risk entirely.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-customer-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    const json = await res.json() as { ok: boolean; error?: string };

    if (!json.ok) {
      if (json.error === "already_exists") {
        // Account exists — try to sign them in directly
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setError("An account with this email already exists. Please sign in with your password, or use 'Forgot password?' to reset it.");
          setLoading(false);
          setTab("signin");
          return;
        }
        navigate("/my-orders");
        return;
      }
      setError(json.error ?? "Failed to create account. Please try again.");
      setLoading(false);
      return;
    }

    // Account created and confirmed — sign in directly, no email confirmation needed
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) {
      setError("Account created! Please sign in with your new password.");
      setTab("signin");
      return;
    }
    navigate("/my-orders");
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResetSent(true);
  };

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/assessment" className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors cursor-pointer">
            Get ESA Letter
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-full mx-auto mb-4">
              <i className="ri-user-heart-line text-orange-500 text-3xl"></i>
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Customer Portal</h1>
            <p className="text-sm text-gray-500">View your orders and re-download your ESA letter</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              <button
                type="button"
                onClick={() => { setTab("signin"); setError(""); setSuccessMsg(""); }}
                className={`whitespace-nowrap flex-1 py-3.5 text-sm font-bold transition-colors cursor-pointer ${tab === "signin" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-400 hover:text-gray-600"}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab("signup"); setError(""); setSuccessMsg(""); }}
                className={`whitespace-nowrap flex-1 py-3.5 text-sm font-bold transition-colors cursor-pointer ${tab === "signup" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-400 hover:text-gray-600"}`}
              >
                Create Account
              </button>
            </div>

            <div className="p-6">
              {passwordResetSuccess && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-green-700">
                  <i className="ri-checkbox-circle-line flex-shrink-0 mt-0.5"></i>
                  Password updated successfully! Sign in with your new password.
                </div>
              )}
              {successMsg && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-green-700">
                  <i className="ri-checkbox-circle-line flex-shrink-0 mt-0.5"></i>
                  {successMsg}
                </div>
              )}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-red-700">
                  <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
                  {error}
                </div>
              )}

              {/* Password Reset Form */}
              {showReset ? (
                resetSent ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-full mx-auto mb-3">
                      <i className="ri-mail-check-line text-green-500 text-2xl"></i>
                    </div>
                    <p className="text-sm font-bold text-gray-800 mb-1">Reset email sent!</p>
                    <p className="text-xs text-gray-500 mb-4">Check your inbox for the password reset link.</p>
                    <button type="button" onClick={() => { setShowReset(false); setResetSent(false); }} className="whitespace-nowrap text-sm text-orange-500 font-semibold hover:underline cursor-pointer">
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <p className="text-sm text-gray-600 mb-4">Enter your email and we&apos;ll send a password reset link.</p>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                      />
                    </div>
                    <button type="submit" disabled={loading} className="whitespace-nowrap w-full py-3 bg-orange-500 text-white font-bold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60">
                      {loading ? "Sending..." : "Send Reset Link"}
                    </button>
                    <button type="button" onClick={() => setShowReset(false)} className="whitespace-nowrap w-full text-sm text-gray-400 hover:text-gray-600 cursor-pointer">
                      Cancel
                    </button>
                  </form>
                )
              ) : tab === "signin" ? (
                /* Sign In Form */
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-orange-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                    <div className="text-right mt-1">
                      <button type="button" onClick={() => setShowReset(true)} className="whitespace-nowrap text-xs text-orange-500 hover:underline cursor-pointer">
                        Forgot password?
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="whitespace-nowrap w-full py-3.5 bg-orange-500 text-white font-extrabold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">
                    {loading ? <><i className="ri-loader-4-line animate-spin" />Signing in...</> : "Sign In to My Orders"}
                  </button>
                </form>
              ) : (
                /* Sign Up Form */
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="bg-[#FFF7ED] border border-orange-200 rounded-lg px-4 py-3 text-xs text-orange-700">
                    <i className="ri-information-line mr-1.5"></i>
                    Use the <strong>same email</strong> you used when purchasing to automatically link your orders.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-orange-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="whitespace-nowrap w-full py-3.5 bg-orange-500 text-white font-extrabold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">
                    {loading ? <><i className="ri-loader-4-line animate-spin" />Creating account...</> : "Create Account"}
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
