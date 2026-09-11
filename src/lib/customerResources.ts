// customerResources — the ONE client module for owner-managed customer
// resources (the Pet Care Planner by PawTenant).
// ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001.
//
// Nothing here decides eligibility. `customer_resource_entitlements()` (a
// SECURITY DEFINER RPC) answers for the signed-in customer — or, for an admin
// in the portal's Customer View, for the previewed email — using the canonical
// payment and service-family helpers. This module only renders what the
// database returns and asks `get-customer-resource-url` for a fresh 5-minute
// signed URL on every open or download. No URL is ever stored, and no storage
// path is ever seen by the browser.
//
// Every read/open here is side-effect free on the server: it writes no order,
// document, communication, earning, lifecycle or delivery state.

import { supabase } from "./supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export type CustomerResourceKey = "esa_planner" | "psd_planner";
export type CustomerResourceFamily = "esa" | "psd";

/** Default portal thumbnail — the planner cover, committed with the site. The
 *  owner-managed thumbnail on the published version overrides it. */
export const PLANNER_DEFAULT_THUMBNAIL = "/assets/planner/pet-care-planner-cover.jpg";
export const PLANNER_DEFAULT_THUMBNAIL_WIDTH = 720;
export const PLANNER_DEFAULT_THUMBNAIL_HEIGHT = 920;
/** Default portal thumbnail for the PSD Training Workbook (rendered from its
 *  own cover page — never the Pet Care Planner artwork). */
export const PSD_DEFAULT_THUMBNAIL = "/assets/planner/psd-workbook-cover.jpg";
export const PSD_DEFAULT_THUMBNAIL_WIDTH = 720;
export const PSD_DEFAULT_THUMBNAIL_HEIGHT = 938;

export interface CustomerResourceEntitlement {
  resource_key: CustomerResourceKey;
  service_family: CustomerResourceFamily;
  display_name: string;
  subtitle: string;
  eligible: boolean;
  /** false = eligible but no published version right now (honest "unavailable"). */
  available: boolean;
  version: number | null;
  published_at: string | null;
  file_name: string | null;
  byte_size: number | null;
  page_count: number | null;
  thumbnail_bucket: string | null;
  thumbnail_path: string | null;
  preview: boolean;
}

export interface EntitlementsResult {
  ok: boolean;
  items: CustomerResourceEntitlement[];
  error?: string;
}

/** Ask the database which resources this viewer is entitled to. */
export async function fetchCustomerResourceEntitlements(previewEmail?: string | null): Promise<EntitlementsResult> {
  try {
    const { data, error } = await supabase.rpc("customer_resource_entitlements", {
      p_preview_email: previewEmail && previewEmail.trim() ? previewEmail.trim() : null,
    });
    if (error) return { ok: false, items: [], error: "Could not load your included resources" };
    const items = (Array.isArray(data) ? data : []) as CustomerResourceEntitlement[];
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], error: "Could not load your included resources" };
  }
}

/** Public URL for the owner-managed thumbnail, or the committed default. */
export function customerResourceThumbnailUrl(e: Pick<CustomerResourceEntitlement, "thumbnail_bucket" | "thumbnail_path" | "resource_key">): string {
  if (e.thumbnail_bucket && e.thumbnail_path) {
    try {
      const { data } = supabase.storage.from(e.thumbnail_bucket).getPublicUrl(e.thumbnail_path);
      if (data?.publicUrl) return data.publicUrl;
    } catch {
      /* fall through to the default */
    }
  }
  return e.resource_key === "psd_planner" ? PSD_DEFAULT_THUMBNAIL : PLANNER_DEFAULT_THUMBNAIL;
}

export interface ResourceUrlResult {
  ok: boolean;
  signedUrl?: string;
  fileName?: string;
  /** Machine-readable failure reason from the server: unauthenticated |
   *  not_entitled | unavailable | sign_failed | lookup_failed | network. */
  code?: string;
  error?: string;
}

export interface ResourceUrlOpts {
  download?: boolean;
  /** Admin Customer View only — forwarded to the server, which re-checks
   *  is_admin_staff() before honouring it. */
  previewEmail?: string | null;
}

/** Mint a fresh short-lived signed URL. Requires a real session — never the anon key. */
export async function requestCustomerResourceUrl(
  resourceKey: CustomerResourceKey,
  opts: ResourceUrlOpts = {},
): Promise<ResourceUrlResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, code: "unauthenticated", error: "Your session has expired — please sign in again." };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-customer-resource-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({
        resourceKey,
        download: !!opts.download,
        ...(opts.previewEmail ? { previewEmail: opts.previewEmail } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean; signedUrl?: string; fileName?: string; code?: string; error?: string;
    };
    if (res.ok && data?.ok && data.signedUrl) return { ok: true, signedUrl: data.signedUrl, fileName: data.fileName };
    return { ok: false, code: data?.code ?? `http_${res.status}`, error: data?.error ?? "Could not open the planner right now." };
  } catch {
    return { ok: false, code: "network", error: "Network error — please check your connection and try again." };
  }
}

/** Popup-safe open in a new tab (same pattern as openSecureDocument): the
 *  blank tab is opened synchronously on the click, then navigated. */
export async function openCustomerResource(resourceKey: CustomerResourceKey, opts: ResourceUrlOpts = {}): Promise<ResourceUrlResult> {
  const win = window.open("about:blank", "_blank");
  const result = await requestCustomerResourceUrl(resourceKey, { ...opts, download: false });
  if (result.ok && result.signedUrl) {
    if (win) win.location.href = result.signedUrl;
    else window.location.href = result.signedUrl;
  } else if (win) {
    win.close();
  }
  return result;
}

/** Download via Content-Disposition (the signed URL's `download` option) —
 *  the only thing that names the file cross-origin, and what makes iPhone
 *  Safari offer "Download" instead of rendering inline. */
export async function downloadCustomerResource(resourceKey: CustomerResourceKey, opts: ResourceUrlOpts = {}): Promise<ResourceUrlResult> {
  const result = await requestCustomerResourceUrl(resourceKey, { ...opts, download: true });
  if (result.ok && result.signedUrl) {
    const a = document.createElement("a");
    a.href = result.signedUrl;
    a.rel = "noopener";
    a.target = "_blank";
    if (result.fileName) a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return result;
}

export function formatResourceBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
