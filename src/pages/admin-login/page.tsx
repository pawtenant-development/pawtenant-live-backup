import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { resolveStaffRole } from "../../lib/staffAuth";
import PawTenantLoginShell, { type LoginBullet } from "../../components/auth/PawTenantLoginShell";

type LoginStep = "email_password" | "otp_challenge" | "reset_password";

// Simple device fingerprint — browser + OS combo stored in localStorage
function getDeviceId(): string {
  const key = "admin_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function getTrustedDevices(): string[] {
  try {
    return JSON.parse(localStorage.getItem("admin_trusted_devices") ?? "[]");
  } catch {
    return [];
  }
}

function trustDevice(deviceId: string) {
  const trusted = getTrustedDevices();
  if (!trusted.includes(deviceId)) {
    trusted.push(deviceId);
    localStorage.setItem("admin_trusted_devices", JSON.stringify(trusted));
  }
}

function isDeviceTrusted(deviceId: string): boolean {
  return getTrustedDevices().includes(deviceId);
}

// Admin/staff post-login destination. COMPANY-FIRST: only /company (and its
// sub-paths) and the /go-live tool are honored. Anything else — notably the
// /admin-orders dashboard or other admin subroutes — falls back to /company,
// so the admin portal is always entered from the Company OS workstation, never
// directly from the login flow. (Provider next handling is separate.)
function safeAdminDest(rawNext: string | null): string {
  if (!rawNext) return "/company";
  if (rawNext === "/company" || rawNext.startsWith("/company?") || rawNext.startsWith("/company/")) return rawNext;
  if (rawNext === "/go-live") return rawNext;
  return "/company";
}

// Left brand-panel feature cards for the unified Staff & Provider Portal.
const STAFF_BULLETS: LoginBullet[] = [
  { icon: "ri-shield-keyhole-line", title: "Secure workspace access", subtitle: "Role-based sign-in for your team" },
  { icon: "ri-route-line", title: "Provider portal routing", subtitle: "Providers land in the right place" },
  { icon: "ri-layout-grid-line", title: "Company OS and admin tools", subtitle: "Everything your workspace needs" },
];

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResetMode = searchParams.get("mode") === "reset";
  const passwordResetSuccess = searchParams.get("passwordReset") === "success";
  const redirectReason = searchParams.get("reason");
  // Unified staff/provider entry. Admin/staff login is COMPANY-FIRST: the admin
  // portal (/admin-orders) is entered from the Company OS workstation, never as
  // the login destination. Only company/workstation-safe ?next= values are
  // honored for admins (see safeAdminDest); /admin-orders and other admin
  // subroutes fall back to /company. Provider ?next= is handled separately.
  const rawNext = searchParams.get("next");
  const adminDest = safeAdminDest(rawNext);

  const [step, setStep] = useState<LoginStep>(isResetMode ? "reset_password" : "email_password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  // Holds the Supabase session after password auth, before OTP challenge completes
  const pendingSessionRef = useRef<string | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  // Reset mode: wait for Supabase to process the token
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

  // ── STEP 1: Email + Password sign-in ──
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    setError("");
    setLoading(true);

    try {
      // Sign in with password
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authErr || !authData.session) {
        setError("Incorrect email or password. Please try again.");
        setLoading(false);
        return;
      }

      // Verify admin status (authoritative service-role check)
      const checkRes = await fetch(`${supabaseUrl}/functions/v1/check-admin-status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${authData.session.access_token}` },
      });
      const checkResult = await checkRes.json() as { ok: boolean; is_admin: boolean };

      if (!checkResult.ok) {
        await supabase.auth.signOut();
        setError("We couldn't verify your account right now. Please try again.");
        setLoading(false);
        return;
      }

      // Not an admin → could be a provider, an inactive account, or neither.
      // Providers are routed straight to their portal (no admin device-OTP step).
      if (!checkResult.is_admin) {
        const role = await resolveStaffRole(authData.session.user.id);
        if (role === "provider") {
          navigate(rawNext && rawNext.startsWith("/provider") ? rawNext : "/provider-portal");
          return;
        }
        await supabase.auth.signOut();
        setError(
          role === "inactive"
            ? "Your account is currently inactive. Please contact support."
            : "We could not find a staff or provider profile for this account. Please contact support.",
        );
        setLoading(false);
        return;
      }

      // Admin — check if this device is trusted
      const deviceId = getDeviceId();
      if (isDeviceTrusted(deviceId)) {
        // Known device — go straight in
        navigate(adminDest);
        return;
      }

      // Unknown device — trigger OTP challenge
      // Keep the session alive but require OTP confirmation
      pendingSessionRef.current = authData.session.access_token;

      // Send OTP challenge email
      const otpRes = await fetch(`${supabaseUrl}/functions/v1/send-admin-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), challenge: true }),
      });
      const otpResult = await otpRes.json() as { ok: boolean; error?: string };

      if (!otpResult.ok) {
        // If OTP send fails, still let them in (don't block on email failure)
        console.warn("[admin-login] OTP send failed, skipping challenge:", otpResult.error);
        trustDevice(deviceId);
        navigate(adminDest);
        return;
      }

      setStep("otp_challenge");
      setOtp(["", "", "", "", "", ""]);
      setResendCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
    setLoading(false);
  };

  // ── OTP Challenge: verify the device confirmation code ──
  const handleOTPChallenge = async () => {
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter the complete 6-digit code."); return; }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-admin-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: code, challenge: true }),
      });
      const result = await res.json() as { ok: boolean; error?: string };

      if (!result.ok) {
        setError(result.error ?? "Invalid code. Please try again.");
        setLoading(false);
        return;
      }

      // OTP confirmed — trust this device and proceed
      trustDevice(getDeviceId());
      navigate(adminDest);
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), challenge: true }),
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
      if (code.length === 6) handleOTPChallenge();
    }
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
    setSuccess("Password updated! Redirecting to sign in...");
    setTimeout(() => navigate("/admin-login", { replace: true }), 2000);
  };

  const otpComplete = otp.join("").length === 6;

  // ── Presentational helpers (light split-card theme) ──────────────────────
  const inputCls = "w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-colors";
  const labelCls = "block text-xs font-bold text-stone-600 mb-1.5";
  const primaryBtn = "whitespace-nowrap w-full py-3.5 bg-orange-500 text-white font-extrabold text-sm rounded-xl hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2";
  const eyeBtn = "whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors cursor-pointer";

  const reasonBanner =
    redirectReason === "session_expired" ? (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2.5 text-sm text-amber-800">
        <i className="ri-time-line text-amber-500"></i>
        Your session has expired — please sign in again to continue.
      </div>
    ) : redirectReason === "unauthorized" ? (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2.5 text-sm text-red-700">
        <i className="ri-shield-cross-line text-red-500"></i>
        Access denied — staff or provider credentials required.
      </div>
    ) : null;

  let badge = "Secure Sign In";
  let heading = "Staff & Provider Portal";
  let subheading: string | undefined = "Sign in to access your PawTenant workspace.";
  let roleHint: string | undefined = "Admins and staff are routed to Company OS. Providers are routed to the Provider Portal.";
  if (step === "reset_password") {
    badge = "Reset Password";
    heading = "Set a new password";
    subheading = "Enter and confirm your new password.";
    roleHint = undefined;
  } else if (step === "otp_challenge") {
    badge = "Device Verification";
    heading = "Verify this device";
    subheading = "Enter the 6-digit code we sent to your email.";
    roleHint = undefined;
  }

  return (
    <PawTenantLoginShell
      brandTitle="PawTenant Workspace"
      brandSubtitle="Secure access for your team and licensed providers — sign in to your Company OS workspace or provider portal."
      brandTagline="Staff & Provider Platform"
      bullets={STAFF_BULLETS}
      bottomBadge={{ icon: "ri-lock-2-line", text: "Role-based secure access" }}
      topRight={{ to: "/customer-login", label: "Customer Portal", icon: "ri-user-line" }}
      banner={reasonBanner}
      badge={badge}
      heading={heading}
      subheading={subheading}
      roleHint={roleHint}
    >
      {/* ── RESET PASSWORD MODE ── */}
      {step === "reset_password" && (
        <>
          {!sessionReady && !error && (
            <div className="mb-4 flex items-center justify-center gap-2 text-stone-400 text-sm py-2">
              <i className="ri-loader-4-line animate-spin"></i>
              <span>Verifying reset link…</span>
            </div>
          )}
          {passwordResetSuccess && !error && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-700">
              <i className="ri-checkbox-circle-fill mt-0.5"></i>
              <span>Password updated! Sign in with your new credentials.</span>
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-red-700">
              <i className="ri-error-warning-fill mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-700">
              <i className="ri-checkbox-circle-fill mt-0.5"></i>
              <span>{success}</span>
            </div>
          )}
          {sessionReady && (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div>
                <label htmlFor="new-password" className={labelCls}>New Password</label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className={`${inputCls} pr-11`}
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className={eyeBtn} aria-label={showNewPassword ? "Hide password" : "Show password"}>
                    <i className={showNewPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className={labelCls}>Confirm Password</label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={`${inputCls} pr-11`}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={eyeBtn} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                    <i className={showConfirmPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? <><i className="ri-loader-4-line animate-spin"></i>Updating…</> : <><i className="ri-lock-line"></i>Set New Password</>}
              </button>
            </form>
          )}
        </>
      )}

      {/* ── STEP 1: Email + Password ── */}
      {step === "email_password" && (
        <>
          {passwordResetSuccess && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-700">
              <i className="ri-checkbox-circle-fill mt-0.5"></i>
              <span>Password updated! Sign in with your new credentials.</span>
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-red-700">
              <i className="ri-error-warning-fill mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelCls}>Email Address</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@pawtenant.com"
                autoFocus
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
                  placeholder="Your password"
                  autoComplete="current-password"
                  className={`${inputCls} pr-11`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className={eyeBtn} aria-label={showPassword ? "Hide password" : "Show password"}>
                  <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                </button>
              </div>
              <div className="text-right mt-1.5">
                <Link to="/reset-password" className="whitespace-nowrap text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors cursor-pointer">
                  Forgot password?
                </Link>
              </div>
            </div>
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? <><i className="ri-loader-4-line animate-spin"></i>Signing In…</> : <><i className="ri-login-box-line"></i>Sign In</>}
            </button>
          </form>
        </>
      )}

      {/* ── STEP 2: OTP Device Challenge (unknown browser/device only) ── */}
      {step === "otp_challenge" && (
        <>
          <p className="mb-4 text-sm text-stone-500">
            We sent a verification code to <span className="font-bold text-stone-800 break-all">{email}</span>
          </p>
          <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <i className="ri-information-line mt-0.5"></i>
            <span>This browser hasn&apos;t been used to access the workspace before. Enter the code to verify and trust this device.</span>
          </div>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-red-700">
              <i className="ri-error-warning-fill mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-700">
              <i className="ri-checkbox-circle-fill mt-0.5"></i>
              <span>{success}</span>
            </div>
          )}
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-3 text-center">Enter 6-Digit Code</label>
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
                    aria-label={`Digit ${index + 1}`}
                    className={`w-11 h-14 text-center text-xl font-extrabold rounded-xl border-2 bg-stone-50 text-stone-800 transition-all focus:outline-none font-mono ${
                      digit ? "border-orange-400 bg-orange-50" : "border-stone-200 focus:border-orange-300"
                    }`}
                  />
                ))}
              </div>
            </div>
            <button type="button" onClick={handleOTPChallenge} disabled={loading || !otpComplete} className={primaryBtn}>
              {loading ? <><i className="ri-loader-4-line animate-spin"></i>Verifying…</> : <><i className="ri-shield-check-line"></i>Verify &amp; Trust This Device</>}
            </button>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  supabase.auth.signOut();
                  setStep("email_password");
                  setError("");
                  setOtp(["", "", "", "", "", ""]);
                  pendingSessionRef.current = null;
                }}
                className="whitespace-nowrap text-xs text-stone-400 hover:text-stone-600 cursor-pointer transition-colors flex items-center gap-1"
              >
                <i className="ri-arrow-left-line"></i>Back to sign in
              </button>
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={resendCooldown > 0 || resendLoading}
                className="whitespace-nowrap text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-orange-500 hover:text-orange-600"
              >
                {resendLoading ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
            <p className="text-center text-[11px] text-stone-400 flex items-center justify-center gap-1.5">
              <i className="ri-time-line"></i>Code expires in 10 minutes
            </p>
          </div>
        </>
      )}
    </PawTenantLoginShell>
  );
}
