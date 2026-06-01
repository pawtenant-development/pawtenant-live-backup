import { supabase } from "./supabaseClient";

// Employee profile/cover image uploads (Company OS). Uploads go to the public
// `employee-profile-media` bucket under the caller's own {auth.uid()}/ folder
// (enforced by storage RLS), then the URL is persisted to the caller's own
// team_members row via the self-only `set_my_profile_media` RPC. Employees only;
// providers use separate buckets.

const BUCKET = "employee-profile-media";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export type MediaKind = "avatar" | "cover";

export interface UploadResult {
  url: string | null;
  error: string | null;
}

/** Returns an error message if the file is not an allowed image / too large. */
export function validateImage(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Please choose a JPG, PNG or WebP image.";
  if (file.size > MAX_BYTES) return "Image must be 5MB or smaller.";
  return null;
}

function extFor(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Upload an avatar or cover image and persist its public URL to the current
 * employee's team_members row. Unique filename per upload = natural cache-bust.
 * Returns the new public URL on success, or an error message.
 */
export async function uploadEmployeeMedia(
  kind: MediaKind,
  file: File,
  userId: string,
): Promise<UploadResult> {
  const invalid = validateImage(file);
  if (invalid) return { url: null, error: invalid };
  if (!userId) return { url: null, error: "Could not resolve your account. Please re-sign in." };

  const path = `${userId}/${kind}-${Date.now()}.${extFor(file)}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (up.error) return { url: null, error: up.error.message };

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl ?? null;
  if (!url) return { url: null, error: "Could not resolve the uploaded image URL." };

  const rpc = await supabase.rpc("set_my_profile_media", {
    p_display_picture_url: kind === "avatar" ? url : null,
    p_cover_photo_url: kind === "cover" ? url : null,
  });
  if (rpc.error) return { url: null, error: rpc.error.message };

  return { url, error: null };
}
