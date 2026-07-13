// get-document-signed-url
//
// Resolves any order_documents row to a fresh, working signed download URL.
//
// Why this exists (LETTERS-BUCKET-PRIVATE-SIGNED-URL-FIX, 2026-05-20):
//   The `letters` storage bucket was created PRIVATE (migration
//   20260519140000_order_documents_capture_and_letters_bucket.sql §4 sets
//   `public: false`). Three edge functions — provider-submit-letter,
//   repair-order-letter-id, inject-pdf-footer — historically called
//   supabase.storage.from("letters").getPublicUrl(...) and stored the
//   resulting `/storage/v1/object/public/letters/<file>` URL in
//   order_documents.processed_file_url. Those URLs return:
//     {"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}
//   for both admins and customers, because Supabase's public URL pattern
//   returns 404 for private buckets. The data is fine; only the URL shape
//   is wrong.
//
//   The working pattern (already used by notify-patient-letter and
//   admin-upload-document) is `createSignedUrl(path, ttl)`. This endpoint
//   resolves a stored doc on demand to a fresh signed URL — the admin
//   "Open Verified PDF" button and the customer /my-orders list both
//   call it instead of opening processed_file_url directly. Self-healing
//   for old broken rows; not dependent on a SQL backfill.
//
// Auth model:
//   - service-role bearer  → always allowed (internal tooling)
//   - admin auth JWT      → allowed (doctor_profiles.is_admin = true)
//   - customer auth JWT   → allowed only when orders.email matches
//                            auth.user.email for the row's order_id
//
// Input:
//   { documentId: "<uuid>" }            → resolves processed_file_url
//                                          (falls back to file_url if no
//                                          processed exists)
//   { documentId, preferOriginal: true } → forces file_url over
//                                          processed_file_url (admin
//                                          "Open Original" link path)
//
// Output:
//   { signedUrl: "<https...>", expiresIn: 31536000, source: "processed"|"original" }
//
// All operations idempotent. Generating a signed URL never mutates the row.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 10-year TTL matches admin-upload-document's signed-URL convention. The
// stored URL on order_documents is treated as the canonical reference for
// admin + customer; rotating it every 30 days the way notify-patient-letter
// does would force a click-time re-sign for every UI surface. Long TTL is
// acceptable for a private bucket because the bearer token in the URL is
// the only access proof — same model as the existing admin uploads.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

const STORAGE_PATH_RE =
  /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface OrderDocRow {
  id: string;
  order_id: string;
  file_url: string | null;
  file_path: string | null;
  processed_file_url: string | null;
  footer_injected: boolean | null;
  customer_visible: boolean | null;
}

/**
 * Parse a Supabase storage URL into { bucket, path }. Returns null when the
 * URL is not a Supabase storage URL (e.g. an external CDN), in which case
 * the caller should return the URL unchanged.
 */
function parseStorageUrl(rawUrl: string | null | undefined): { bucket: string; path: string } | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(STORAGE_PATH_RE);
    if (!match) return null;
    return {
      bucket: decodeURIComponent(match[1]),
      path: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Auth gate ──────────────────────────────────────────────────────────
  // Service-role bearer = full pass. Otherwise resolve the auth user and
  // confirm they are either an admin OR the customer on the order this
  // document belongs to.
  let isServiceRole = false;
  let callerEmail = "";
  let callerUserId = "";
  let isAdmin = false;
  if (bearer === SUPABASE_SERVICE_ROLE_KEY) {
    isServiceRole = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) {
      return json(401, { ok: false, error: "Invalid token" });
    }
    callerEmail = (userResp.user.email ?? "").trim().toLowerCase();
    callerUserId = userResp.user.id;
    const { data: profile } = await admin
      .from("doctor_profiles")
      .select("is_admin")
      .eq("user_id", userResp.user.id)
      .maybeSingle();
    isAdmin = !!(profile && (profile as { is_admin?: boolean }).is_admin);
  }

  let body: { documentId?: string; preferOriginal?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const documentId = (body.documentId ?? "").trim();
  if (!documentId) return json(400, { ok: false, error: "documentId is required" });

  const preferOriginal = body.preferOriginal === true;

  // ── Look up the document row ──────────────────────────────────────────
  const { data: doc, error: docErr } = await admin
    .from("order_documents")
    .select("id, order_id, file_url, file_path, processed_file_url, footer_injected, customer_visible")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr) {
    console.error("[get-document-signed-url] doc lookup error:", docErr.message);
    return json(500, { ok: false, error: `Lookup failed: ${docErr.message}` });
  }
  if (!doc) return json(404, { ok: false, error: "Document not found" });

  const row = doc as OrderDocRow;

  // ── Non-admin auth: owning customer OR the assigned provider ──────────
  // RA-ADMIN-VISIBILITY-STORAGE-HARDENING-LIVE-001: the assigned provider may
  // resolve a signed URL for their OWN assigned order's documents (needed for
  // the Housing workflow — the provider re-signs source forms on open).
  // Authorization is strictly per-order, so an UNRELATED provider is denied.
  // Owning-customer (customer_visible + email match), admin, and service-role
  // checks are unchanged.
  if (!isServiceRole && !isAdmin) {
    const { data: order } = await admin
      .from("orders")
      .select("email, doctor_user_id, doctor_email")
      .eq("id", row.order_id)
      .maybeSingle();
    const orderEmail = ((order?.email as string | null) ?? "").trim().toLowerCase();
    const orderDoctorEmail = ((order?.doctor_email as string | null) ?? "").trim().toLowerCase();
    const isAssignedProvider =
      (!!callerUserId && (order?.doctor_user_id as string | null) === callerUserId) ||
      (!!callerEmail && !!orderDoctorEmail && orderDoctorEmail === callerEmail);
    const isOwningCustomer = !!orderEmail && orderEmail === callerEmail;

    if (isAssignedProvider) {
      // provider is authorized regardless of customer_visible
    } else if (isOwningCustomer) {
      if (!row.customer_visible) {
        return json(403, { ok: false, error: "Document is not customer-visible" });
      }
    } else {
      return json(403, { ok: false, error: "Not authorized for this document" });
    }
  }

  // ── Resolve the source URL → bucket + path → signed URL ───────────────
  const preferProcessed = !preferOriginal && row.footer_injected && row.processed_file_url;
  const candidateUrl = preferProcessed ? row.processed_file_url : row.file_url;
  if (!candidateUrl) {
    return json(404, { ok: false, error: "No URL on document row" });
  }

  const parsed = parseStorageUrl(candidateUrl);
  if (!parsed) {
    // External CDN URL — pass it through unchanged.
    return json(200, {
      ok: true,
      signedUrl: candidateUrl,
      expiresIn: null,
      source: preferProcessed ? "processed" : "original",
      external: true,
    });
  }

  const { bucket, path } = parsed;
  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    console.error("[get-document-signed-url] createSignedUrl failed:", signErr?.message ?? "no url");
    return json(500, {
      ok: false,
      error: `Failed to sign URL for ${bucket}/${path}: ${signErr?.message ?? "unknown"}`,
    });
  }

  return json(200, {
    ok: true,
    signedUrl: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    source: preferProcessed ? "processed" : "original",
    bucket,
    path,
  });
});
