// PROVIDER-TEMPORARY-PASSWORD-ONBOARDING-001
//
// Blocking first-login password change for providers who signed in with a
// temporary password issued at approval.
//
// The gate is server-authoritative: `public.provider_password_gate` grants the
// client SELECT only, so nothing here can clear it. Submitting calls the
// `provider-complete-first-login` edge function, which changes the password
// through Admin Auth and clears the gate in the same server-side call. If the
// provider closes the tab or reloads, the gate is still set and they land back
// here.
//
// This renders INSTEAD of the portal, so no case data is reachable until the
// provider owns their own password.
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const MIN_LENGTH = 10;

export default function FirstLoginPasswordGate({
  providerName,
  onComplete,
}: {
  providerName: string;
  onComplete: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const firstName = providerName?.split(" ")[0] || "there";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { data, error: fnErr } = await supabase.functions.invoke("provider-complete-first-login", {
      body: { password },
    });
    setSaving(false);

    const result = data as { ok?: boolean; error?: string } | null;
    if (fnErr || !result?.ok) {
      setError(result?.error ?? fnErr?.message ?? "Could not update your password. Please try again.");
      return;
    }

    // Clear the local copies before handing control back to the portal.
    setPassword("");
    setConfirmPassword("");
    onComplete();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/admin-login?next=/provider-portal");
  };

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 sm:px-8 pt-8 pb-5 text-center border-b border-gray-100">
            <div className="w-14 h-14 flex items-center justify-center bg-[#f0faf7] rounded-full mx-auto mb-3">
              <i className="ri-lock-password-line text-[#1a5c4f] text-2xl"></i>
            </div>
            <h1 className="text-xl font-extrabold text-gray-900 mb-1">Choose your password</h1>
            <p className="text-sm text-gray-500">
              Welcome, {firstName}. You signed in with a temporary password — please set your own before continuing.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-xs font-bold text-gray-700 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/30 focus:border-[#1a5c4f]"
                  placeholder={`At least ${MIN_LENGTH} characters`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-bold text-gray-700 mb-1.5">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/30 focus:border-[#1a5c4f]"
                placeholder="Re-enter your new password"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full whitespace-nowrap bg-[#1a5c4f] text-white text-sm font-bold rounded-lg py-3 hover:bg-[#17504a] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? "Saving…" : "Set password and continue"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Not you?{" "}
          {/* inline-block + padding keeps this above a 24px tap target at 390px */}
          <button type="button" onClick={signOut} className="inline-block py-1.5 px-1 underline hover:text-gray-600 cursor-pointer">
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}

