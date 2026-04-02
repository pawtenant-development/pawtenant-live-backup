import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResetMode = searchParams.get("mode") === "reset";
  const passwordResetSuccess = searchParams.get("passwordReset") === "success";
  const redirectReason = searchParams.get("reason");
  const nextPath = searchParams.get("next") ?? "/admin-orders";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  // When in reset mode, wait for Supabase to finish processing the token
  useEffect(() => {
    if (!isResetMode) return;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionReady(true);
      } else {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
            setSessionReady(true);
            subscription.unsubscribe();
          }
        });
        return () => subscription.unsubscribe();
      }
    };

    checkSession();
  }, [isResetMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr || !data.session) {
      setError("Invalid email or password. Please try again.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/check-admin-status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const result = await res.json() as { ok: boolean; is_admin: boolean; error?: string };

      if (!result.ok || !result.is_admin) {
        await supabase.auth.signOut();
        setError("Access denied. This portal is for authorized administrators only.");
        setLoading(false);
        return;
      }

      navigate(nextPath);
    } catch {
      await supabase.auth.signOut();
      setError("Could not verify admin status. Please try again.");
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      setError(updateErr.message || "Failed to update password. Please request a new reset link.");
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setSuccess("Password set! Please sign in with your new credentials.");
    setTimeout(() => navigate("/admin-login", { replace: true }), 2000);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email address.");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      forgotEmail.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/admin-login?mode=reset` },
    );
    setForgotLoading(false);
    if (err) {
      setForgotError(err.message);
      return;
    }
    setForgotSent(true);
  };

  return (
    <div className="min-h-screen bg-[#0f1e1a] flex flex-col">
      <div className="px-8 h-16 flex items-center justify-between border-b border-white/10">
        <Link to="/" className="cursor-pointer">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-9 w-auto object-contain brightness-0 invert opacity-90"
          />
        </Link>
        <Link
          to="/customer-login"
          className="whitespace-nowrap text-xs text-white/40 hover:text-white/70 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <i className="ri-user-line"></i>Customer Portal
        </Link>
      </div>

      {/* Session / auth reason banner */}
      {redirectReason === "session_expired" && (
        <div className="bg-amber-500/15 border-b border-amber-500/25 px-6 py-3 flex items-center justify-center gap-3">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <i className="ri-time-line text-amber-400 text-base"></i>
          </div>
          <p className="text-sm text-amber-300 font-medium">
            Your session has expired — please sign in again to continue.
          </p>
        </div>
      )}
      {redirectReason === "unauthorized" && (
        <div className="bg-red-500/15 border-b border-red-500/25 px-6 py-3 flex items-center justify-center gap-3">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <i className="ri-shield-cross-line text-red-400 text-base"></i>
          </div>
          <p className="text-sm text-red-300 font-medium">
            Access denied — admin credentials required.
          </p>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">

          {/* ── RESET MODE (user clicked link in email) ── */}
          {isResetMode ? (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 flex items-center justify-center bg-[#1a5c4f] rounded-2xl mx-auto mb-5">
                  <i className="ri-lock-password-line text-white text-2xl"></i>
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1.5">Set New Password</h1>
                <p className="text-sm text-white/40">Enter and confirm your new admin password</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                {!sessionReady && !error && (
                  <div className="mb-5 flex items-center justify-center gap-2 text-white/40 text-sm py-2">
                    <i className="ri-loader-4-line animate-spin"></i>
                    <span>Verifying reset link...</span>
                  </div>
                )}

                {passwordResetSuccess && !error && (
                  <div className="mb-5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-fill text-green-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-green-300 leading-relaxed">Password updated! Sign in with your new credentials.</p>
                  </div>
                )}

                {error && (
                  <div className="mb-5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-error-warning-fill text-red-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="mb-5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-fill text-green-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-green-300 leading-relaxed">{success}</p>
                  </div>
                )}

                {sessionReady && (
                  <form onSubmit={handleSetNewPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">New Password</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1a5c4f] transition-colors"
                        />
                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                          className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors cursor-pointer">
                          <i className={showNewPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">Confirm Password</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1a5c4f] transition-colors"
                        />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors cursor-pointer">
                          <i className={showConfirmPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                        </button>
                      </div>
                    </div>
                    <button type="submit" disabled={loading}
                      className="whitespace-nowrap w-full py-3.5 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-xl hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                      {loading ? <><i className="ri-loader-4-line animate-spin"></i>Updating...</> : <><i className="ri-lock-line"></i>Set New Password</>}
                    </button>
                  </form>
                )}
              </div>
            </>

          ) : showForgotPassword ? (
            /* ── FORGOT PASSWORD VIEW ── */
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 flex items-center justify-center bg-[#1a5c4f] rounded-2xl mx-auto mb-5">
                  <i className="ri-mail-send-line text-white text-2xl"></i>
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1.5">Reset Admin Password</h1>
                <p className="text-sm text-white/40">
                  {forgotSent ? "Check your email" : "We'll send a reset link to your email"}
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                {forgotSent ? (
                  <div className="text-center">
                    <div className="w-12 h-12 flex items-center justify-center bg-[#1a5c4f]/40 rounded-full mx-auto mb-4">
                      <i className="ri-mail-check-line text-green-400 text-2xl"></i>
                    </div>
                    <p className="text-sm font-bold text-white mb-1">Reset link sent!</p>
                    <p className="text-xs text-white/50 mb-2">We sent a reset link to:</p>
                    <p className="text-sm font-bold text-[#4ecdc4] mb-5">{forgotEmail}</p>
                    <p className="text-xs text-white/40 mb-6 leading-relaxed">
                      Click the link in the email to set a new password. The link expires in 1 hour.
                    </p>
                    <button type="button"
                      onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(""); }}
                      className="whitespace-nowrap text-sm text-white/60 hover:text-white cursor-pointer font-semibold flex items-center gap-1.5 mx-auto">
                      <i className="ri-arrow-left-line"></i>Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    {forgotError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                        <i className="ri-error-warning-fill text-red-400 text-sm flex-shrink-0 mt-0.5"></i>
                        <p className="text-xs text-red-300">{forgotError}</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">Admin Email Address</label>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="admin@pawtenant.com"
                        autoFocus
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1a5c4f] transition-colors"
                      />
                      <p className="text-xs text-white/30 mt-1.5">Enter the email address for your admin account.</p>
                    </div>
                    <button type="submit" disabled={forgotLoading}
                      className="whitespace-nowrap w-full py-3.5 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-xl hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                      {forgotLoading ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-mail-send-line"></i>Send Reset Link</>}
                    </button>
                    <button type="button"
                      onClick={() => { setShowForgotPassword(false); setForgotError(""); setForgotEmail(""); }}
                      className="whitespace-nowrap w-full text-sm text-white/30 hover:text-white/60 cursor-pointer transition-colors text-center">
                      Cancel — back to sign in
                    </button>
                  </form>
                )}
              </div>
            </>

          ) : (
            /* ── NORMAL LOGIN VIEW ── */
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 flex items-center justify-center bg-[#1a5c4f] rounded-2xl mx-auto mb-5">
                  <i className="ri-shield-keyhole-line text-white text-2xl"></i>
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1.5">Admin Portal</h1>
                <p className="text-sm text-white/40">Sign in with your administrator credentials</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                {passwordResetSuccess && (
                  <div className="mb-5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-fill text-green-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-green-300 leading-relaxed">Password updated! Sign in with your new credentials.</p>
                  </div>
                )}

                {error && (
                  <div className="mb-5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-error-warning-fill text-red-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@pawtenant.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1a5c4f] transition-colors"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Password</label>
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setError(""); }}
                        className="whitespace-nowrap text-xs text-white/40 hover:text-white/70 font-semibold cursor-pointer transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1a5c4f] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                      >
                        <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="whitespace-nowrap w-full py-3.5 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-xl hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {loading
                      ? <><i className="ri-loader-4-line animate-spin"></i>Verifying...</>
                      : <><i className="ri-login-box-line"></i>Sign In to Admin Portal</>
                    }
                  </button>
                </form>
              </div>

              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/25">
                <div className="w-3.5 h-3.5 flex items-center justify-center">
                  <i className="ri-lock-line"></i>
                </div>
                <span>Secured admin access — unauthorized access is prohibited</span>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
