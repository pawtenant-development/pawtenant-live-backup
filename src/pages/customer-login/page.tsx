import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import PawTenantLoginShell, { type LoginBullet } from "../../components/auth/PawTenantLoginShell";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

// Left brand-panel feature cards for the customer dashboard login.
const CUSTOMER_BULLETS: LoginBullet[] = [
  { icon: "ri-lock-2-line", title: "Secure document access", subtitle: "Your data is protected & private" },
  { icon: "ri-file-list-3-line", title: "Order and letter status", subtitle: "Track every step in one place" },
  { icon: "ri-shield-user-line", title: "Private customer dashboard", subtitle: "Built just for you, always secure" },
];

export default function CustomerLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Route through the dedicated edge function instead of
    // supabase.auth.resetPasswordForEmail so delivery goes through Resend
    // (the Supabase /recover SMTP path was returning unexpected_failure and
    // leaving paid customers unable to get a reset link).
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-customer-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      setLoading(false);
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not send reset link. Please try again or email hello@pawtenant.com.");
        return;
      }
      setResetSent(true);
    } catch {
      setLoading(false);
      setError("Network error — please try again or email hello@pawtenant.com.");
    }
  };

  // ── Presentational helpers (light split-card theme) ──────────────────────
  const inputCls = "w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-colors";
  const labelCls = "block text-xs font-bold text-stone-600 mb-1.5";
  const primaryBtn = "whitespace-nowrap w-full py-3.5 bg-orange-500 text-white font-extrabold text-sm rounded-xl hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2";

  const heading = showReset ? "Reset your password" : "Welcome back";
  const subheading = showReset
    ? "Enter your email and we'll send a password reset link."
    : "Sign in to access your PawTenant customer dashboard.";

  const supportFooter = (
    <p className="text-center text-xs text-stone-400">
      Need help?{" "}
      <a href="mailto:hello@pawtenant.com" className="text-orange-500 font-semibold hover:underline">
        hello@pawtenant.com
      </a>
    </p>
  );

  return (
    <PawTenantLoginShell
      brandTitle="Your ESA Letter Dashboard"
      brandSubtitle="Access your assessment, order details, and documents securely — all in one private place."
      brandTagline="ESA Letter Platform"
      bullets={CUSTOMER_BULLETS}
      bottomBadge={{ icon: "ri-lock-2-line", text: "Private & secure dashboard" }}
      topRight={{ to: "/assessment", label: "Get ESA Letter", icon: "ri-arrow-right-line" }}
      badge="Secure Sign In"
      heading={heading}
      subheading={subheading}
      roleHint={showReset ? undefined : "Need a new ESA letter? Start your assessment from the main PawTenant website."}
      footer={supportFooter}
    >
      {passwordResetSuccess && !showReset && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-700">
          <i className="ri-checkbox-circle-fill mt-0.5"></i>
          <span>Password updated successfully! Sign in with your new password.</span>
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-red-700">
          <i className="ri-error-warning-fill mt-0.5"></i>
          <span>{error}</span>
        </div>
      )}

      {/* ── PASSWORD RESET ── */}
      {showReset ? (
        resetSent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 flex items-center justify-center bg-emerald-100 rounded-full mx-auto mb-3">
              <i className="ri-mail-check-line text-emerald-500 text-2xl"></i>
            </div>
            <p className="text-sm font-bold text-stone-800 mb-1">Reset email sent!</p>
            <p className="text-xs text-stone-500 mb-4">Check your inbox for the password reset link.</p>
            <button
              type="button"
              onClick={() => { setShowReset(false); setResetSent(false); }}
              className="whitespace-nowrap text-sm text-orange-500 font-semibold hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label htmlFor="reset-email" className={labelCls}>Email Address</label>
              <input
                id="reset-email"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="your@email.com"
                autoFocus
                className={inputCls}
              />
            </div>
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? <><i className="ri-loader-4-line animate-spin"></i>Sending…</> : <><i className="ri-mail-send-line"></i>Send Reset Link</>}
            </button>
            <button
              type="button"
              onClick={() => { setShowReset(false); setError(""); }}
              className="whitespace-nowrap w-full text-sm text-stone-400 hover:text-stone-600 cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </form>
        )
      ) : (
        /* ── SIGN IN ── */
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="email" className={labelCls}>Email Address</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
              </button>
            </div>
            <div className="text-right mt-1.5">
              <button
                type="button"
                onClick={() => { setShowReset(true); setResetEmail(email); setError(""); }}
                className="whitespace-nowrap text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className={primaryBtn}>
            {loading ? <><i className="ri-loader-4-line animate-spin"></i>Signing in…</> : <><i className="ri-login-box-line"></i>Sign In</>}
          </button>
        </form>
      )}
    </PawTenantLoginShell>
  );
}
