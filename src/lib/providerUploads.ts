/**
 * providerUploads — client helpers for provider application files.
 *
 * PROVIDER-UPLOADS-PRIVATE-REMEDIATION (2026-07-02): the `provider-uploads`
 * bucket is PRIVATE. Applicant resumes / licenses / insurance PDFs and
 * headshots are no longer world-readable, and the public join-our-network
 * form no longer writes to storage directly (the anon INSERT policy is gone).
 *
 * Two entry points:
 *   - uploadProviderApplicationFile(): public form → provider-application-upload
 *     edge function (service role). Returns the storage PATH, which is what
 *     provider_applications.headshot_url / documents_urls now store.
 *   - resolveProviderUploadUrl(): admin surfaces turn a stored value (new
 *     path OR legacy public URL, backfilled rows included) into a short-lived
 *     signed URL. Requires the provider_uploads_admin_select storage policy
 *     (authenticated admins only) — anonymous/non-admin callers get null.
 *
 * External URLs (anything not pointing at provider-uploads) pass through
 * unchanged so old rows with third-party photo links keep working.
 */

import { supabase } from "./supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as
  | string
  | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as
  | string
  | undefined;

const BUCKET = "provider-uploads";

/** Default signed-URL lifetime for admin viewing (1 hour). */
export const PROVIDER_UPLOAD_SIGNED_TTL_SECONDS = 60 * 60;

export type ProviderUploadKind = "headshot" | "document";

/**
 * Extract the storage path inside provider-uploads from a stored value.
 * Handles the three shapes that exist in provider_applications:
 *   - new path values:        "documents/1751450000000-resume.pdf"
 *   - legacy public URLs:     "https://<ref>.supabase.co/storage/v1/object/public/provider-uploads/<path>"
 *   - anything else (external URL, empty) → null
 */
export function providerUploadPath(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    // Bare storage path. Guard against absolute/parent traversal junk.
    return v.startsWith("/") || v.includes("..") ? null : v;
  }
  const m = v.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/provider-uploads\/(.+?)(?:\?.*)?$/,
  );
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Resolve a stored headshot/document value to a URL the admin UI can render.
 * provider-uploads values become short-lived signed URLs; external URLs are
 * returned unchanged; unresolvable values return null.
 */
export async function resolveProviderUploadUrl(
  value: string | null | undefined,
  ttlSeconds: number = PROVIDER_UPLOAD_SIGNED_TTL_SECONDS,
): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  const path = providerUploadPath(v);
  if (!path) {
    // Not a provider-uploads reference — external URLs pass through.
    return /^https?:\/\//i.test(v) ? v : null;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Resolve a list, dropping entries that cannot be resolved. */
export async function resolveProviderUploadUrls(
  values: (string | null | undefined)[] | null | undefined,
  ttlSeconds: number = PROVIDER_UPLOAD_SIGNED_TTL_SECONDS,
): Promise<string[]> {
  const list = (values ?? []).filter(Boolean) as string[];
  if (list.length === 0) return [];
  const resolved = await Promise.all(
    list.map((v) => resolveProviderUploadUrl(v, ttlSeconds)),
  );
  return resolved.filter(Boolean) as string[];
}

export interface ProviderUploadResult {
  ok: true;
  path: string;
  file_name: string;
  size: number;
}

/**
 * Upload one application file through the provider-application-upload edge
 * function. Returns the storage PATH on success, null on any failure — the
 * form treats a failed optional upload the same way the old direct-storage
 * code did (skips the file, submission continues).
 */
export async function uploadProviderApplicationFile(
  file: File,
  kind: ProviderUploadKind,
): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const fd = new FormData();
    fd.set("file", file, file.name);
    fd.set("kind", kind);
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/provider-application-upload`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: fd,
      },
    );
    const body = (await res.json().catch(() => null)) as
      | ProviderUploadResult
      | { ok?: false; error?: string }
      | null;
    if (!res.ok || !body || body.ok !== true || !("path" in body)) {
      console.error(
        "[providerUploads] upload failed:",
        (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`,
      );
      return null;
    }
    return body.path;
  } catch (e) {
    console.error("[providerUploads] upload threw:", e);
    return null;
  }
}
