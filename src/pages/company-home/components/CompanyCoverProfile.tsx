import { useEffect, useRef, useState } from "react";
import type { TeamMember } from "../../../lib/teamMembers";
import { uploadEmployeeMedia, type MediaKind } from "../../../lib/employeeMedia";

interface CompanyCoverProfileProps {
  member: TeamMember;
  /** Called after a successful upload so the page can refetch the member row. */
  onMediaUpdated?: () => void;
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Facebook-style cover + profile hero with self-service image upload.
 *
 * Avatar (display picture) and cover photo upload to the public
 * `employee-profile-media` bucket and persist to team_members via the
 * `set_my_profile_media` RPC. The same display_picture_url is used by the admin
 * profile menu and team widgets, so a new photo appears everywhere. Identity
 * stays minimal (name, title · department, compact Employee ID).
 */
export default function CompanyCoverProfile({ member, onMediaUpdated }: CompanyCoverProfileProps) {
  // Local copies so the new image shows instantly without a full reload.
  const [photo, setPhoto] = useState<string | null>(member.display_picture_url);
  const [cover, setCover] = useState<string | null>(member.cover_photo_url);
  const [busy, setBusy] = useState<MediaKind | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPhoto(member.display_picture_url);
    setCover(member.cover_photo_url);
  }, [member.display_picture_url, member.cover_photo_url]);

  const displayName = (member.display_name?.trim() || "Team Member").trim();
  const userId = member.user_id ?? "";

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    window.setTimeout(() => setToast(null), 4000);
  }

  async function handleFile(kind: MediaKind, file: File | undefined) {
    if (!file || busy) return;
    setBusy(kind);
    setToast(null);
    const res = await uploadEmployeeMedia(kind, file, userId);
    if (res.error || !res.url) {
      showToast(false, res.error ?? "Upload failed. Please try again.");
    } else {
      if (kind === "avatar") setPhoto(res.url);
      else setCover(res.url);
      showToast(true, kind === "avatar" ? "Display picture updated." : "Cover photo updated.");
      onMediaUpdated?.();
    }
    setBusy(null);
  }

  return (
    <section id="profile" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile("avatar", e.target.files?.[0] ?? undefined)}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile("cover", e.target.files?.[0] ?? undefined)}
      />

      {/* Cover */}
      <div
        className="relative h-40 sm:h-52 w-full"
        style={
          cover
            ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: "linear-gradient(120deg,#0f1e1a 0%,#1f3b34 55%,#2f6f5f 100%)" }
        }
      >
        {/* Subtle bottom scrim so the avatar/actions stay legible over busy photos */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" />
        {!cover ? (
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:22px_22px]" />
        ) : null}
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          disabled={busy === "cover"}
          title="Upload a cover photo (JPG, PNG or WebP, up to 5MB)"
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-white/90 hover:bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {busy === "cover" ? (
            <i className="ri-loader-4-line animate-spin" />
          ) : (
            <i className="ri-image-edit-line" />
          )}
          {busy === "cover" ? "Uploading…" : "Change Cover"}
        </button>
      </div>

      <div className="px-4 sm:px-6 pb-5">
        <div className="-mt-14 sm:-mt-16 flex items-end justify-between gap-3">
          {/* Avatar with edit button */}
          <div className="relative z-10">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl ring-4 ring-white bg-stone-100 overflow-hidden flex items-center justify-center text-3xl font-semibold text-stone-500 shadow-md">
              {photo ? (
                <img src={photo} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span>{initialsOf(displayName)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={busy === "avatar"}
              title="Change display picture (JPG, PNG or WebP, up to 5MB)"
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-[#0f1e1a] hover:bg-[#1a2e29] text-white flex items-center justify-center shadow-md ring-2 ring-white disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {busy === "avatar" ? (
                <i className="ri-loader-4-line animate-spin text-xs" />
              ) : (
                <i className="ri-camera-line text-xs" />
              )}
            </button>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
              {member.employee_code ? (
                <>
                  ID <span className="font-mono font-semibold text-stone-700">{member.employee_code}</span>
                </>
              ) : (
                "Employee"
              )}
            </span>
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-base sm:text-lg font-semibold text-stone-900 truncate">{displayName}</h1>
          <p className="text-xs sm:text-sm text-stone-600 truncate">
            {member.title || "Employee"}
            {member.department ? <span className="text-stone-400"> · {member.department}</span> : null}
          </p>
        </div>

        {toast ? (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-xs font-medium border ${
              toast.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            <i className={`mr-1 ${toast.ok ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`} />
            {toast.msg}
          </div>
        ) : null}

        {!member.is_active ? (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            This profile is currently marked inactive.
          </div>
        ) : null}
      </div>
    </section>
  );
}
