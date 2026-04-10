import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

type LoginStep = "email" | "otp" | "reset_password";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResetMode = searchParams.get("mode") === "reset";
  const passwordResetSuccess = searchParams.get("passwordReset") === "success";
  const redirectReason = searchParams.get("reason");
  const nextPath = searchParams.get("next") ?? "/admin-orders";

  const [step, setStep] = useState<LoginStep>(isResetMode ? "reset_password" : "email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown]);

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-admin-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (!result.ok) {
        setError(result.error ?? "Failed to send code. Please try again.");
        setLoading(false);
        return;
      }
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
      setResendCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
    setLoading(false);
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError("");
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-admin-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) {
        setOtp(["", "", "", "", "", ""]);
        setResendCooldown(60);
        setSuccess("New code sent!");
        setTimeout(() => setSuccess(""), 3000);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else {
        setError(result.error ?? "Failed to resend code.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setResendLoading(false);
  };

  const handleOTPInput = (index: number, value: string) => {
    // Handle paste
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = [...otp];
      digits.forEach((d, i) => { if (index + i < 6) newOtp[index + i] = d; });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      setTimeout(() => otpRefs.current[nextIndex]?.focus(), 0);
      return;
    }
    const digit = value.replace(/\D/g, "");
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 5) {
      setTimeout(() => otpRefs.current[index + 1]?.focus(), 0);
    }
  };

  const handleOTPKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      setTimeout(() => otpRefs.current[index - 1]?.focus(), 0);
    }
    if (e.key === "Enter") {
      const code = otp.join("");
      if (code.length === 6) handleVerifyOTP();
    }
  };

  const handleVerifyOTP = async () => {
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter the complete 6-digit code."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-admin-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: code }),
      });
      const result = await res.json() as { ok: boolean; error?: string; token?: string; action_link?: string };
      if (!result.ok) {
        setError(result.error ?? "Invalid code. Please try again.");
        setLoading(false);
        return;
      }

      // Use the magic link token to sign in
      if (result.action_link) {
        // Navigate to the magic link to complete sign-in
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: result.token ?? "",
          type: "magiclink",
        });

        if (verifyErr) {
          // Fallback: try signing in via the action link redirect approach
          // Use signInWithOtp flow via the token
          console.warn("[admin-login] verifyOtp error:", verifyErr.message);
          // Try alternative: use the action link directly
          window.location.href = result.action_link;
          return;
        }
      }

      // Verify admin status
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // If no session yet, redirect via action link
        if (result.action_link) {
          window.location.href = result.action_link;
          return;
        }
        setError("Sign-in failed. Please try again.");
        setLoading(false);
        return;
      }

      const checkRes = await fetch(`${supabaseUrl}/functions/v1/check-admin-status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const checkResult = await checkRes.json() as { ok: boolean; is_admin: boolean };
      if (!checkResult.ok || !checkResult.is_admin) {
        await supabase.auth.signOut();
        setError("Access denied. This portal is for authorized administrators only.");
        setLoading(false);
        return;
      }

      navigate(nextPath);
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
    setLoading(false);
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      setError(updateErr.message || "Failed to update password. Please request a new reset link.");
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    setLoading(false);
    setSuccess("Password set! Redirecting to sign in...");
    setTimeout(() => navigate("/admin-login", { replace: true }), 2000);
  };

  const otpComplete = otp.join("").length === 6;

  return (
    <div className="min-h-screen bg-[#0f1e1a] flex flex-col">
      {/* Top bar */}
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

      {/* Redirect reason banners */}
      {redirectReason === "session_expired" && (
        <div className="bg-amber-500/15 border-b border-amber-500/25 px-6 py-3 flex items-center justify-center gap-3">
          <i className="ri-time-line text-amber-400 text-base"></i>
          <p className="text-sm text-amber-300 font-medium">Your session has expired — please sign in again to continue.</p>
        </div>
      )}
      {redirectReason === "unauthorized" && (
        <div className="bg-red-500/15 border-b border-red-500/25 px-6 py-3 flex items-center justify-center gap-3">
          <i className="ri-shield-cross-line text-red-400 text-base"></i>
          <p className="text-sm text-red-300 font-medium">Access denied — admin credentials required.</p>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">

          {/* ── RESET PASSWORD MODE ── */}
          {step === "reset_password" && (
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
          )}

          {/* ── STEP 1: EMAIL ENTRY ── */}
          {step === "email" && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 flex items-center justify-center bg-[#1a5c4f] rounded-2xl mx-auto mb-5">
                  <i className="ri-shield-keyhole-line text-white text-2xl"></i>
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1.5">Admin Portal</h1>
                <p className="text-sm text-white/40">Enter your email to receive a sign-in code</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                {passwordResetSuccess && (
                  <div className="mb-5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-fill text-green-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-green-300 leading-relaxed">Password updated! Sign in with your email below.</p>
                  </div>
                )}

                {error && (
                  <div className="mb-5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-error-warning-fill text-red-400 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@pawtenant.com"
                      autoFocus
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1a5c4f] transition-colors"
                    />
                  </div>

                  {/* OTP method badge */}
                  <div className="flex items-center gap-2.5 bg-[#1a5c4f]/20 border border-[#1a5c4f]/30 rounded-xl px-4 py-3">
                    <div className="w-7 h-7 flex items-center justify-center bg-[#1a5c4f]/40 rounded-lg flex-shrink-0">
                      <i className="ri-mail-check-line text-[#4ecdc4] text-sm"></i>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white/80">Email OTP Verification</p>
                      <p className="text-xs text-white/40 mt-0.5">A 6-digit code will be sent to your email</p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="whitespace-nowrap w-full py-3.5 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-xl hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {loading
                      ? <><i className="ri-loader-4-line animate-spin"></i>Sending Code...</>
                      : <><i className="ri-mail-send-line"></i>Send Sign-In Code</>
                    }
                  </button>
                </form>
              </div>

              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/25">
                <i className="ri-lock-line"></i>
                <span>Secured admin access — unauthorized access is prohibited</span>
              </div>
            </>
          )}

          {/* ── STEP 2: OTP ENTRY ── */}
          {step === "otp" && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 flex items-center justify-center bg-[#1a5c4f] rounded-2xl mx-auto mb-5">
                  <i className="ri-mail-check-line text-white text-2xl"></i>
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1.5">Check Your Email</h1>
                <p className="text-sm text-white/40">We sent a 6-digit code to</p>
                <p className="text-sm font-bold text-[#4ecdc4] mt-1 break-all">{email}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
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

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-3 uppercase tracking-wider text-center">Enter 6-Digit Code</label>
                    {/* OTP input boxes */}
                    <div className="flex items-center justify-center gap-2">
                      {otp.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => { otpRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={digit}
                          onChange={(e) => handleOTPInput(index, e.target.value)}
                          onKeyDown={(e) => handleOTPKeyDown(index, e)}
                          onFocus={(e) => e.target.select()}
                          className={`w-11 h-14 text-center text-xl font-extrabold rounded-xl border-2 bg-white/5 text-white transition-all focus:outline-none font-mono ${
                            digit
                              ? "border-[#1a5c4f] bg-[#1a5c4f]/20"
                              : "border-white/15 focus:border-[#1a5c4f]/60"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyOTP}
                    disabled={loading || !otpComplete}
                    className="whitespace-nowrap w-full py-3.5 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-xl hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading
                      ? <><i className="ri-loader-4-line animate-spin"></i>Verifying...</>
                      : <><i className="ri-login-box-line"></i>Sign In to Admin Portal</>
                    }
                  </button>

                  {/* Resend + back */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => { setStep("email"); setError(""); setOtp(["", "", "", "", "", ""]); }}
                      className="whitespace-nowrap text-xs text-white/30 hover:text-white/60 cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <i className="ri-arrow-left-line"></i>Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={resendCooldown > 0 || resendLoading}
                      className="whitespace-nowrap text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#4ecdc4] hover:text-[#3dbdb5]"
                    >
                      {resendLoading
                        ? "Sending..."
                        : resendCooldown > 0
                        ? `Resend in ${resendCooldown}s`
                        : "Resend code"
                      }
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/25">
                <i className="ri-time-line"></i>
                <span>Code expires in 10 minutes</span>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
