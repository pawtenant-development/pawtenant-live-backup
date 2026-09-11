// get-customer-resource-url — mints a SHORT-LIVED signed URL for an
// owner-managed customer resource (the Pet Care Planner by PawTenant) after
// the database says the caller is entitled to it.
// ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001.
//
// Authorization is NOT decided here. The function forwards the caller's own
// JWT to a SECURITY DEFINER RPC:
//   * customer path  → public.customer_resource_access(resourceKey, previewEmail)
//     requires an authenticated user who OWNS an authoritatively-paid order of
//     the resource's service family (or an admin previewing a customer by
//     email, re-checked with is_admin_staff() in SQL).
//   * admin path     → public.admin_customer_resource_version_location(versionId)
//     lets admin staff preview ANY version (draft or published) before
//     publishing. is_admin_staff() is enforced in SQL with the caller's JWT.
// This function only turns the storage location that RPC returns into a
// 5-minute signed URL — it never stores one, never returns a storage path,
// and never reads a resource table with the service role on the caller's
// behalf.
//
// verify_jwt = true (the gateway rejects tokens that are not project JWTs) —
// but verify_jwt is NOT authorization: the public anon key satisfies it. Every
// call therefore resolves a real user with auth.getUser(bearer). A bearer that
// equals the service-role key or the anon key is REFUSED: this endpoint serves
// identities, not tooling.
//
// Side effects: none. No order, document, communication, earning, lifecycle or
// audit row is written. Opening the planner is not "delivery" of anything.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Five minutes — long enough to open or save, too short to share. */
const SIGNED_URL_TTL_SECONDS = 300;
const RESOURCE_KEYS = new Set(["esa_planner", "psd_planner"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeDownloadFilename(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 120);
  const named = cleaned || "planner.pdf";
  return named.toLowerCase().endsWith(".pdf") ? named : `${named}.pdf`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { ok: false, error: "Server not configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  // No service-role arm and no anon arm, by design (see header).
  if (!bearer || bearer === serviceKey || bearer === anonKey) {
    return json(401, { ok: false, code: "unauthenticated", error: "Sign in to open this resource" });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp?.user) {
    return json(401, { ok: false, code: "unauthenticated", error: "Sign in to open this resource" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "bad_request", error: "Invalid JSON body" });
  }
  const wantDownload = body.download === true;

  // The caller's identity, enforced by Postgres: auth.uid() / auth.email()
  // inside the RPCs come from THIS token.
  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

  let bucket = "";
  let path = "";
  let fileName = "";
  let version: number | null = null;
  let displayName: string | null = null;

  const adminVersionId = typeof body.adminVersionId === "string" ? body.adminVersionId.trim() : "";
  if (adminVersionId) {
    // ── Admin preview of a specific version ────────────────────────────────
    if (!UUID_RE.test(adminVersionId)) return json(400, { ok: false, code: "bad_request", error: "Invalid version" });
    const { data, error } = await asCaller.rpc("admin_customer_resource_version_location", { p_version_id: adminVersionId });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code === "42501") return json(403, { ok: false, code: "forbidden", error: "Admin staff only" });
      console.error("[get-customer-resource-url] admin lookup failed:", error.message);
      return json(500, { ok: false, code: "lookup_failed", error: "Could not look up that version" });
    }
    const row = (Array.isArray(data) ? data[0] : data) as {
      storage_bucket: string; storage_path: string; file_name: string; version: number; resource_key: string;
    } | undefined;
    if (!row) return json(404, { ok: false, code: "unavailable", error: "Version not found" });
    bucket = row.storage_bucket; path = row.storage_path; fileName = row.file_name; version = row.version; displayName = row.resource_key;
  } else {
    // ── Customer access (or admin Customer View by email) ──────────────────
    const resourceKey = typeof body.resourceKey === "string" ? body.resourceKey.trim() : "";
    if (!RESOURCE_KEYS.has(resourceKey)) return json(400, { ok: false, code: "bad_request", error: "Unknown resource" });
    const previewEmail = typeof body.previewEmail === "string" ? body.previewEmail.trim() : "";

    const { data, error } = await asCaller.rpc("customer_resource_access", {
      p_resource_key: resourceKey,
      p_preview_email: previewEmail || null,
    });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code === "42501") return json(403, { ok: false, code: "preview_forbidden", error: "Not authorized" });
      console.error("[get-customer-resource-url] access lookup failed:", error.message);
      return json(500, { ok: false, code: "lookup_failed", error: "Could not check your access right now" });
    }
    const row = (Array.isArray(data) ? data[0] : data) as {
      eligible: boolean; available: boolean; storage_bucket: string | null; storage_path: string | null;
      file_name: string | null; version: number | null; display_name: string | null;
    } | undefined;
    if (!row || !row.eligible) {
      return json(403, { ok: false, code: "not_entitled", error: "This resource is not included with your order" });
    }
    if (!row.available || !row.storage_bucket || !row.storage_path) {
      return json(404, { ok: false, code: "unavailable", error: "This resource is temporarily unavailable" });
    }
    bucket = row.storage_bucket; path = row.storage_path; fileName = row.file_name ?? ""; version = row.version; displayName = row.display_name;
  }

  const safeName = safeDownloadFilename(fileName || "Pet-Care-Planner-by-PawTenant.pdf");
  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, wantDownload ? { download: safeName } : undefined);
  if (signErr || !signed?.signedUrl) {
    console.error("[get-customer-resource-url] sign failed:", signErr?.message);
    return json(502, { ok: false, code: "sign_failed", error: "Could not prepare your download right now" });
  }

  return json(200, {
    ok: true,
    signedUrl: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    fileName: safeName,
    version,
    displayName,
  });
});
