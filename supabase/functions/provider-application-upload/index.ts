// provider-application-upload
//
// PROVIDER-UPLOADS-PRIVATE-REMEDIATION (2026-07-02):
//   The public join-our-network application form used to upload headshots and
//   onboarding documents DIRECTLY into the `provider-uploads` bucket via anon
//   "Allow public uploads" / "Allow public reads" storage policies, and stored
//   permanent PUBLIC URLs on provider_applications. That made every applicant
//   resume / license / insurance PDF world-readable, the bucket enumerable,
//   and gave anonymous visitors a free file-hosting endpoint.
//
//   This function replaces the direct client upload. It runs with the service
//   role, so the bucket needs NO anon storage policies at all and is flipped
//   private. The caller gets back the storage PATH (e.g.
//   "documents/1751450000000-resume.pdf"), which is what the form now stores
//   in provider_applications.headshot_url / documents_urls. Admin surfaces
//   resolve paths to short-lived signed URLs (see src/lib/providerUploads.ts).
//
// Contract (multipart/form-data):
//   - file: the upload (required)
//   - kind: "headshot" | "document" (required)
//   - Max size 10 MB; MIME whitelist mirrors the bucket's allowed_mime_types
//     (images + PDF). Headshots must be images.
//
// Path convention keeps the legacy "<folder>/<unix-ms>-<safe-name>" shape so
// existing filename-based document-type inference in the admin UI keeps
// working for both old (backfilled) and new rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "provider-uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — matches bucket file_size_limit
const MAX_FILE_NAME = 180;

// Mirrors storage.buckets.allowed_mime_types for provider-uploads.
const IMAGE_MIME = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const DOCUMENT_MIME = new Set<string>([...IMAGE_MIME, "application/pdf"]);

const IMAGE_EXT = new Set<string>(["jpg", "jpeg", "png", "webp"]);
const DOCUMENT_EXT = new Set<string>([...IMAGE_EXT, "pdf"]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Same sanitization the form used client-side, so backfilled and new paths
// share one shape.
function sanitizeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, MAX_FILE_NAME);
  return base || "file";
}

function safeExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json(400, { ok: false, error: "Expected multipart/form-data" });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: "Failed to parse form body" });
  }

  const kind = (form.get("kind") ?? "").toString().trim();
  if (kind !== "headshot" && kind !== "document") {
    return json(400, { ok: false, error: "kind must be 'headshot' or 'document'" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json(400, { ok: false, error: "file field is required" });
  }
  if (file.size <= 0) {
    return json(400, { ok: false, error: "Empty file" });
  }
  if (file.size > MAX_FILE_SIZE) {
    return json(413, {
      ok: false,
      error: `File too large (max ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)} MB)`,
    });
  }

  const declaredType = (file.type || "").toLowerCase();
  const rawName = sanitizeName(file.name || "file");
  const ext = safeExt(rawName);
  const allowedMime = kind === "headshot" ? IMAGE_MIME : DOCUMENT_MIME;
  const allowedExt = kind === "headshot" ? IMAGE_EXT : DOCUMENT_EXT;

  const typeOk =
    allowedMime.has(declaredType) ||
    (declaredType === "" && ext !== "" && allowedExt.has(ext));
  if (!typeOk) {
    return json(415, {
      ok: false,
      error:
        kind === "headshot"
          ? "Unsupported headshot type. Allowed: jpg, png, webp."
          : "Unsupported document type. Allowed: jpg, png, webp, pdf.",
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const folder = kind === "headshot" ? "headshots" : "documents";
  const storagePath = `${folder}/${Date.now()}-${rawName}`;

  const arrayBuf = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuf, {
      contentType: declaredType || "application/octet-stream",
      upsert: false,
    });
  if (uploadErr) {
    console.error("[provider-application-upload] upload failed:", uploadErr.message);
    return json(500, { ok: false, error: `Upload failed: ${uploadErr.message}` });
  }

  return json(200, {
    ok: true,
    path: storagePath,
    file_name: rawName,
    size: file.size,
  });
});
