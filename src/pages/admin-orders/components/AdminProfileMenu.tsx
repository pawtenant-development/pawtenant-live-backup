import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  fetchTeamPresence,
  setMyPresence,
  getMyTeamMemberId,
  AWAY_OPTIONS,
  PRESENCE_DOT,
  AWAY_LABEL,
  type PresenceRow,
  type AwayStatus,
} from "../../../lib/presence";
import { clockInCurrentUser, clockOutCurrentUser } from "../../../lib/attendance";
import { fetchCurrentTeamMember } from "../../../lib/teamMembers";
import {
  getSoundPrefs,
  setSoundPrefs,
  subscribeSoundPrefs,
  type SoundPrefs,
  type SoundType,
} from "../../../lib/soundPrefs";
import { unlockSounds } from "../../../lib/soundPlayer";
import {
  previewVisitorChime,
  previewOpsBell,
  previewChatFirstMessage,
} from "../../../lib/notificationSounds";

// Compact top-right profile / status menu (Facebook/LinkedIn style).
// Owns: clock in/out, away status, light admin shortcuts (Runbook /
// Providers), sound settings, change password, sign out.
// Broadcast now lives in Communications and Approvals in the Team tab —
// both are role-gated and no longer surfaced here.
// Clock + presence use the existing attendance / presence RPCs only.

interface AdminProfileMenuProps {
  name: string;
  role: string | null;
  onChangePassword: () => void;
  onSignOut: () => void;
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-[#f3e8ff] text-[#7c3aed]" },
  admin_manager: { label: "Admin", color: "bg-[#dbeafe] text-[#3b6ea5]" },
  support: { label: "Support", color: "bg-cyan-100 text-cyan-700" },
  finance: { label: "Finance", color: "bg-emerald-100 text-emerald-700" },
  read_only: { label: "Read Only", color: "bg-gray-100 text-gray-500" },
  provider: { label: "Provider", color: "bg-amber-100 text-amber-700" },
};

const SOUND_LABELS: Record<SoundType, string> = {
  chat: "Live Chat",
  visitor: "Visitors",
  consultation: "Consults",
  contact: "Contacts",
};
const SOUND_ICONS: Record<SoundType, string> = {
  chat: "ri-chat-3-line",
  visitor: "ri-eye-line",
  consultation: "ri-stethoscope-line",
  contact: "ri-mail-line",
};
const SOUND_ORDER: SoundType[] = ["chat", "visitor", "consultation", "contact"];

function previewFor(ch: SoundType) {
  unlockSounds();
  if (ch === "visitor") previewVisitorChime();
  else if (ch === "chat") previewChatFirstMessage();
  else previewOpsBell();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Renders the user's display picture (team_members.display_picture_url) when set,
// otherwise an initials avatar. Shared shape so the admin top bar matches the
// /company portal hero for the same employee.
function ProfileAvatar({
  photoUrl,
  name,
  sizeClass,
  textClass,
}: {
  photoUrl: string | null;
  name: string;
  sizeClass: string;
  textClass: string;
}) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={`${sizeClass} rounded-full object-cover`} />;
  }
  return (
    <span className={`${sizeClass} flex items-center justify-center rounded-full bg-[#3b6ea5] text-white ${textClass} font-extrabold`}>
      {initials(name)}
    </span>
  );
}

export default function AdminProfileMenu({
  name,
  role,
  onChangePassword,
  onSignOut,
}: AdminProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [me, setMe] = useState<PresenceRow | null>(null);
  const [resolved, setResolved] = useState(false); // finished first lookup
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [prefs, setPrefs] = useState<SoundPrefs>(getSoundPrefs());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Single source of truth for the user's display picture: team_members.display_picture_url
  // (same field the /company portal hero uses). Falls back to initials when unset.
  useEffect(() => {
    let cancelled = false;
    fetchCurrentTeamMember().then((tm) => {
      if (!cancelled) setPhotoUrl(tm?.display_picture_url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMine = useCallback(async () => {
    const id = await getMyTeamMemberId();
    setMyId(id);
    if (id) {
      const rows = await fetchTeamPresence();
      setMe(rows.find((r) => r.team_member_id === id) ?? null);
    } else {
      setMe(null);
    }
    setResolved(true);
  }, []);

  useEffect(() => {
    loadMine();
    const unsub = subscribeSoundPrefs(setPrefs);
    return () => { unsub(); };
  }, [loadMine]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  };

  // Notify the Team presence bar (and any listener) so dots refresh instantly.
  const broadcastPresence = () => {
    try { window.dispatchEvent(new CustomEvent("pw:presence-changed")); } catch { /* ignore */ }
  };

  const isClockedIn = !!me?.is_clocked_in;
  const presenceColor = me?.presence ?? "red";
  const awayStatus = me?.away_status ?? "available";

  const handleClockIn = async () => {
    setBusy(true);
    try {
      const id = await clockInCurrentUser();
      if (!id) throw new Error("Clock-in failed. You may not have an assigned shift — ask an admin.");
      await setMyPresence("available");
      await loadMine();
      broadcastPresence();
      showToast(true, "Clocked in — you're now online.");
    } catch (e) {
      showToast(false, e instanceof Error ? e.message : "Clock-in failed.");
    }
    setBusy(false);
  };

  const handleClockOut = async () => {
    setBusy(true);
    try {
      await clockOutCurrentUser();
      await loadMine();
      broadcastPresence();
      showToast(true, "Clocked out.");
    } catch (e) {
      showToast(false, e instanceof Error ? e.message : "Clock-out failed.");
    }
    setBusy(false);
  };

  const handleAway = async (status: AwayStatus) => {
    setBusy(true);
    const ok = await setMyPresence(status);
    if (ok) {
      await loadMine();
      broadcastPresence();
    } else {
      showToast(false, "Could not update status.");
    }
    setBusy(false);
  };

  const roleCfg = ROLE_BADGE[role ?? ""] ?? ROLE_BADGE.admin_manager;

  const statusText = useMemo(() => {
    if (!resolved) return "…";
    if (!myId) return "No team profile";
    if (!isClockedIn) return "Not clocked in";
    return AWAY_LABEL[awayStatus];
  }, [resolved, myId, isClockedIn, awayStatus]);

  return (
    <div className="relative" ref={wrapRef}>
      {/* Avatar button */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) loadMine(); }}
        title="Account & status"
        className="relative flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <span className="relative">
          <ProfileAvatar photoUrl={photoUrl} name={name} sizeClass="w-8 h-8" textClass="text-xs" />
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${PRESENCE_DOT[presenceColor]}`}></span>
        </span>
        <span className="hidden md:inline text-xs font-bold text-gray-700 max-w-[120px] truncate">{name}</span>
        <i className="ri-arrow-down-s-line text-gray-400 hidden md:inline"></i>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-[130] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <span className="relative flex-shrink-0">
              <ProfileAvatar photoUrl={photoUrl} name={name} sizeClass="w-10 h-10" textClass="text-sm" />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${PRESENCE_DOT[presenceColor]}`}></span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-gray-900 truncate">{name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${roleCfg.color}`}>{roleCfg.label}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${PRESENCE_DOT[presenceColor]}`}></span>{statusText}
                </span>
              </div>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div className={`mx-3 mt-3 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              <i className={toast.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{toast.msg}
            </div>
          )}

          <div className="max-h-[70vh] overflow-y-auto">
            {/* Work status */}
            <div className="px-3 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Work status</p>
              {!resolved ? (
                <p className="text-xs text-gray-400 px-1 py-1">Loading status…</p>
              ) : !myId ? (
                <p className="text-xs text-amber-600 px-1 py-1 flex items-start gap-1">
                  <i className="ri-information-line mt-0.5"></i>
                  Your login isn't linked to a team-member profile, so clock-in is unavailable. Ask an owner/admin to add you under Team.
                </p>
              ) : (
                <>
                  {!isClockedIn ? (
                    <button type="button" onClick={handleClockIn} disabled={busy}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 cursor-pointer transition-colors">
                      {busy ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-login-circle-line"></i>}
                      Clock In
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={handleClockOut} disabled={busy}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 cursor-pointer transition-colors">
                        {busy ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-logout-circle-line"></i>}
                        Clock Out
                      </button>
                      <div className="grid grid-cols-3 gap-1.5 mt-2">
                        {AWAY_OPTIONS.map((opt) => {
                          const active = awayStatus === opt.value;
                          return (
                            <button key={opt.value} type="button" disabled={busy}
                              onClick={() => handleAway(opt.value)}
                              title={opt.label}
                              className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                                active ? "bg-[#3b6ea5] text-white border-[#3b6ea5]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                              }`}>
                              <i className={`${opt.icon} text-sm`}></i>
                              <span className="leading-none">{opt.value === "available" ? "Back" : opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Admin shortcuts */}
            <div className="px-3 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Shortcuts</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Link to="/admin-guide" onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                  <i className="ri-book-2-line text-[#3b6ea5]"></i>Runbook
                </Link>
                <Link to="/admin-doctors" onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                  <i className="ri-stethoscope-line text-[#3b6ea5]"></i>Providers
                </Link>
              </div>
            </div>

            {/* Sound settings */}
            <div className="px-3 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="ri-volume-up-line text-[#3b6ea5]"></i>Sound Alerts
                </p>
                <button type="button" onClick={() => { const next = !prefs.muted; setSoundPrefs({ muted: next }); if (!next) unlockSounds(); }}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg cursor-pointer ${prefs.muted ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                  {prefs.muted ? "Muted" : "On"}
                </button>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={prefs.volume} disabled={prefs.muted}
                onChange={(e) => setSoundPrefs({ volume: parseFloat(e.target.value) })}
                className="w-full cursor-pointer mb-2 disabled:opacity-40" />
              <div className="grid grid-cols-2 gap-1.5">
                {SOUND_ORDER.map((ch) => (
                  <div key={ch} className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-gray-50">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 truncate">
                      <i className={SOUND_ICONS[ch]}></i>{SOUND_LABELS[ch]}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button type="button" title="Preview" disabled={prefs.muted} onClick={() => previewFor(ch)}
                        className="text-gray-400 hover:text-[#3b6ea5] disabled:opacity-30 cursor-pointer">
                        <i className="ri-play-circle-line"></i>
                      </button>
                      <button type="button" onClick={() => { setSoundPrefs({ enabled: { [ch]: !prefs.enabled[ch] } as Partial<Record<SoundType, boolean>> }); unlockSounds(); }}
                        className={`relative w-7 h-3.5 rounded-full transition-colors cursor-pointer ${prefs.enabled[ch] ? "bg-[#3b6ea5]" : "bg-gray-300"}`}>
                        <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${prefs.enabled[ch] ? "left-3.5" : "left-0.5"}`}></span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Account actions */}
            <div className="py-1">
              <button type="button" onClick={() => { setOpen(false); onChangePassword(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                <i className="ri-lock-password-line text-gray-400"></i>Change Password
              </button>
              <button type="button" onClick={() => { setOpen(false); onSignOut(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer transition-colors">
                <i className="ri-logout-box-r-line"></i>Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
