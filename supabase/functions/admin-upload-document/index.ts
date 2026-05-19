// admin-upload-document — admin-only PDF/document upload to the letters
// bucket, attached to an order via public.order_documents.
//
// DOCS-UPLOAD-SUPPORT (2026-05-19): the Documents tab previously only
// supported URL-based links. Admins now POST multipart/form-data here
// to upload a file directly. The function:
//
//   1. Verifies the caller is an admin (doctor_profiles.is_admin).
//   2. Validates the file (MIME whitelist + 25 MB cap).
//   3. Uploads to storage.objects under the private "letters" bucket.
//   4. Inserts a public.order_documents row.
//   5. Returns the new row.
//
// The customer portal /my-orders + notify-patient-letter resend flow
// already read from public.order_documents, so the upload immediately
// shows up in the customer's documents list once customer_visible=true.
//
// Contract mirrors supabase/functions/chat-attachment-upload (same MIME
// caps, same bucket-private pattern, same service-role upload).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const ALLOWED_DOC_TYPES = new Set<string>([
  "esa_letter",
  "housing_verification",
  "landlord_form",
  "signed_letter",
  "other",
]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function safeFilename(raw: string): string {
  const trimmed = raw.trim() || "document.pdf";
  return trimmed.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!bearer) {
    return json(401, { ok: false, error: "Missing bearer token" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve the caller to a user_id, then gate on doctor_profiles.is_admin.
  // Service-role bearer (used by internal tooling) bypasses the user
  // check — those callers are inherently trusted.
  let isAdmin = false;
  if (bearer === serviceKey) {
    isAdmin = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) {
      return json(401, { ok: false, error: "Invalid token" });
    }
    const { data: profile } = await admin
      .from("doctor_profiles")
      .select("is_admin")
      .eq("user_id", userResp.user.id)
      .maybeSingle();
    isAdmin = !!(profile && (profile as { is_admin?: boolean }).is_admin);
    if (!isAdmin) {
      return json(403, { ok: false, error: "Admin only" });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: "Expected multipart/form-data" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json(400, { ok: false, error: "file field is required" });
  }
  if (file.size === 0) {
    return json(400, { ok: false, error: "file is empty" });
  }
  if (file.size > MAX_BYTES) {
    return json(413, {
      ok: false,
      error: `File exceeds ${Math.floor(MAX_BYTES / (1024 * 1024))} MB`,
    });
  }
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return json(415, { ok: false, error: `Unsupported MIME type: ${mime}` });
  }

  const orderIdField = (form.get("order_id") ?? "").toString().trim();
  const confirmationIdField = (form.get("confirmation_id") ?? "").toString().trim();
  if (!orderIdField && !confirmationIdField) {
    return json(400, {
      ok: false,
      error: "Either order_id or confirmation_id is required",
    });
  }

  // Resolve to a canonical order row so we always get both id +
  // confirmation_id stamped on the new document.
  let orderQuery = admin
    .from("orders")
    .select("id, confirmation_id")
    .limit(1);
  if (orderIdField) {
    orderQuery = orderQuery.eq("id", orderIdField);
  } else {
    orderQuery = orderQuery.eq("confirmation_id", confirmationIdField);
  }
  const { data: orderRow, error: orderErr } = await orderQuery.maybeSingle();
  if (orderErr || !orderRow) {
    return json(404, { ok: false, error: "Order not found" });
  }
  const orderId = (orderRow as { id: string }).id;
  const confirmationId = (orderRow as { confirmation_id: string | null }).confirmation_id ?? null;

  const labelField = (form.get("label") ?? "").toString().trim();
  const docTypeField = (form.get("doc_type") ?? "other").toString().trim();
  const customerVisibleField = (form.get("customer_visible") ?? "true").toString().trim().toLowerCase();
  const notesField = (form.get("notes") ?? "").toString().trim() || null;

  if (!ALLOWED_DOC_TYPES.has(docTypeField)) {
    return json(400, { ok: false, error: `Unsupported doc_type: ${docTypeField}` });
  }
  const customerVisible = customerVisibleField === "true" || customerVisibleField === "1";

  const originalName = safeFilename(file.name);
  const label = labelField || originalName;

  // Object path: letters/<confirmation_or_id>/<timestamp>-<rand>-<name>.
  const stem = confirmationId || orderId;
  const ts = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
  const objectPath = `${stem}/${ts}-${rand}-${originalName}`;

  const buf = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("letters")
    .upload(objectPath, buf, {
      contentType: mime,
      upsert: false,
    });
  if (uploadErr) {
    console.error("[admin-upload-document] storage upload failed:", uploadErr.message);
    return json(500, { ok: false, error: `Upload failed: ${uploadErr.message}` });
  }

  // Build a long-lived signed URL the customer portal + notify-patient-letter
  // can use. 10-year signed URL is acceptable for a private letters bucket
  // because the letter URL is treated as the public reference downstream.
  const { data: signed } = await admin.storage
    .from("letters")
    .createSignedUrl(objectPath, 60 * 60 * 24 * 365 * 10);
  const fileUrl = signed?.signedUrl ?? "";

  const uploadedBy = bearer === serviceKey ? "service_role" : "admin";

  const { data: inserted, error: insertErr } = await admin
    .from("order_documents")
    .insert({
      order_id: orderId,
      confirmation_id: confirmationId,
      label,
      doc_type: docTypeField,
      file_url: fileUrl,
      file_path: objectPath,
      mime_type: mime,
      file_size_bytes: file.size,
      uploaded_by: uploadedBy,
      customer_visible: customerVisible,
      notes: notesField,
    })
    .select()
    .maybeSingle();

  if (insertErr || !inserted) {
    // Best-effort cleanup of the orphan object so we don't accumulate
    // storage cost for a failed insert.
    try {
      await admin.storage.from("letters").remove([objectPath]);
    } catch { /* ignore */ }
    console.error("[admin-upload-document] order_documents insert failed:", insertErr?.message);
    return json(500, {
      ok: false,
      error: `Insert failed: ${insertErr?.message ?? "unknown"}`,
    });
  }

  return json(200, { ok: true, document: inserted });
});
