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

/** CUSTOMER-DUAL-LETTER-DOWNLOADS-001 — names ONE of the two stored letter
 *  artifacts. Strict server-side: a named variant is never substituted. */
export type SecureDocVariant = "original" | "verification";

export interface SecureDocResult {
  ok: boolean;
  error?: string;
  signedUrl?: string;
  source?: string; // "processed" (finalized) | "original"
  /** Machine-readable failure reason, e.g. "verification_unavailable". */
  code?: string;
}

export interface SecureDocOpts {
  /** Loose form, kept for the admin "Open Original" call site. */
  preferOriginal?: boolean;
  /** Strict form — resolves that artifact or fails. */
  variant?: SecureDocVariant;
  /** Suggested filename; the function sets Content-Disposition from it (the
   *  <a download> attribute is ignored cross-origin and cannot do this). */
  downloadFilename?: string;
}

async function signDocument(documentId: string, opts: SecureDocOpts): Promise<SecureDocResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? SUPABASE_ANON;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-document-signed-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({
        documentId,
        ...(opts.preferOriginal ? { preferOriginal: true } : {}),
        ...(opts.variant ? { variant: opts.variant } : {}),
        ...(opts.downloadFilename ? { downloadFilename: opts.downloadFilename } : {}),
      }),
    });
    const data = await res.json().catch(() => ({})) as {
      ok?: boolean; signedUrl?: string; source?: string; error?: string; code?: string;
    };
    if (res.ok && data?.ok && data.signedUrl) return { ok: true, signedUrl: data.signedUrl, source: data.source };
    return {
      ok: false,
      code: data?.code,
      error: data?.error ?? `Could not open document (HTTP ${res.status})`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error opening document" };
  }
}

/** Popup-safe open in a new tab. Returns the result so the caller can toast on failure. */
export async function openSecureDocument(
  documentId: string,
  opts: SecureDocOpts = {},
): Promise<SecureDocResult> {
  const win = window.open("about:blank", "_blank");
  const result = await signDocument(documentId, opts);
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
  opts: SecureDocOpts = {},
): Promise<SecureDocResult> {
  // The signed URL is cross-origin, so `a.download` below cannot name the file.
  // `downloadFilename` is what actually does it, via Content-Disposition.
  const result = await signDocument(documentId, {
    ...opts,
    downloadFilename: opts.downloadFilename ?? filename,
  });
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
