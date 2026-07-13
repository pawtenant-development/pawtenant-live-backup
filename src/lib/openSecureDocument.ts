// openSecureDocument — the SINGLE shared, popup-safe secure document opener/downloader
// (RA-LATE-UPLOAD-DOCUMENT-DELIVERY-DISCOUNT-CONTINUITY-001 §5). Provider and Customer
// portals route every document open/download through this one helper instead of
// divergent inline implementations.
//
// Security: never embeds a long-lived URL in the DOM; always mints a FRESH short-lived
// signed URL via the authorized `get-document-signed-url` edge function (service-role
// signing behind admin / assigned-provider / owning-customer authz). By default the
// delivered ESA/PSD letter resolves to the FINALIZED (footer-injected) artifact; only
// an explicit `preferOriginal` opens the provider's raw upload.
//
// Popup-safe pattern: open a blank tab SYNCHRONOUSLY on the user click, then navigate
// it once the signed URL resolves — so the async fetch never triggers a popup block.

import { supabase } from "./supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export interface SecureDocResult {
  ok: boolean;
  error?: string;
  signedUrl?: string;
  source?: string; // "processed" (finalized) | "original"
}

async function signDocument(documentId: string, preferOriginal: boolean): Promise<SecureDocResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? SUPABASE_ANON;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-document-signed-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({ documentId, ...(preferOriginal ? { preferOriginal: true } : {}) }),
    });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; signedUrl?: string; source?: string; error?: string };
    if (res.ok && data?.ok && data.signedUrl) return { ok: true, signedUrl: data.signedUrl, source: data.source };
    return { ok: false, error: data?.error ?? `Could not open document (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error opening document" };
  }
}

/** Popup-safe open in a new tab. Returns the result so the caller can toast on failure. */
export async function openSecureDocument(
  documentId: string,
  opts: { preferOriginal?: boolean } = {},
): Promise<SecureDocResult> {
  const win = window.open("about:blank", "_blank");
  const result = await signDocument(documentId, opts.preferOriginal ?? false);
  if (result.ok && result.signedUrl) {
    if (win) win.location.href = result.signedUrl;
    else window.location.href = result.signedUrl; // popup blocked → same-tab fallback
  } else if (win) {
    win.close();
  }
  return result;
}

/** Secure download via a transient <a download>. Returns the result for error UI. */
export async function downloadSecureDocument(
  documentId: string,
  filename?: string,
  opts: { preferOriginal?: boolean } = {},
): Promise<SecureDocResult> {
  const result = await signDocument(documentId, opts.preferOriginal ?? false);
  if (result.ok && result.signedUrl) {
    const a = document.createElement("a");
    a.href = result.signedUrl;
    a.rel = "noopener";
    if (filename) a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return result;
}
