import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface ChangePasswordModalProps {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);

    // Re-authenticate with current password first
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setError("Could not identify your account."); setSaving(false); return; }

    const { error: reAuthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reAuthErr) {
      setError("Current password is incorrect.");
      setSaving(false);
      return;
    }

    // Update password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => onClose(), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-[#f0faf7] rounded-xl">
              <i className="ri-lock-password-line text-[#1a5c4f] text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-0.5">Security</p>
              <h2 className="text-lg font-extrabold text-gray-900">Change Password</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        <div className="px-6 py-6">
          {success ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 flex items-center justify-center bg-[#f0faf7] rounded-full mx-auto mb-4">
                <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-3xl"></i>
              </div>
              <p className="text-base font-extrabold text-gray-900 mb-1">Password Updated!</p>
              <p className="text-sm text-gray-500">Your new password is active. Closing...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Your current password"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <i className={showCurrent ? "ri-eye-off-line" : "ri-eye-line"}></i>
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <i className={showNew ? "ri-eye-off-line" : "ri-eye-line"}></i>
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f]"
                  />
                </div>
              </div>

              {/* Password strength indicator */}
              {newPassword.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[8, 12, 16].map((len) => (
                      <div
                        key={len}
                        className={`flex-1 h-1 rounded-full transition-colors ${
                          newPassword.length >= len
                            ? len === 8 ? "bg-orange-400" : len === 12 ? "bg-amber-400" : "bg-emerald-500"
                            : "bg-gray-200"
                        }`}
                      ></div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {newPassword.length < 8 ? "Too short" : newPassword.length < 12 ? "Fair" : newPassword.length < 16 ? "Good" : "Strong"}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="whitespace-nowrap flex-1 py-3 border border-gray-200 text-gray-500 text-sm font-bold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="whitespace-nowrap flex-1 py-3 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><i className="ri-loader-4-line animate-spin"></i>Updating...</>
                  ) : (
                    <><i className="ri-shield-check-line"></i>Update Password</>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
