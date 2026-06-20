// customer-upload-document — owning-customer (or admin) upload of a supporting
// document (e.g. a landlord / HOA / tenancy-association form) to the private
// "letters" bucket, attached to an order via public.order_documents.
//
// ADDON-DOC-UPLOAD (2026-06-21): the Additional Documentation ($40) flow only
// took payment — there was no way for the customer to actually hand the form to
// the provider. This function lets the owning customer upload that form from
// /my-orders. The uploaded row lands in public.order_documents with
// doc_type="customer_upload" / uploaded_by="customer", so it shows up
// automatically in BOTH the admin Documents tab and the assigned provider's
// portal (both already read order_documents and RLS already allows those reads).
//
// Auth model mirrors create-additional-doc-invoice:
//   • service-role bearer            → trusted (internal tooling)
//   • doctor_profiles.is_admin       → admin
//   • otherwise                      → owning customer (caller email === order email)
//
// Two modes (both POST):
//   • multipart/form-data            → upload a file (fields: file, order_id|confirmation_id, label?)
//   • application/json {action:list} → list this order's customer uploads
//
// Contract / limits mirror supabase/functions/admin-upload-document.

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
const DOC_TYPE = "customer_upload";

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

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!bearer) {
    return json(401, { ok: false, error: "Missing bearer token" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── Resolve caller identity ────────────────────────────────────────────────
  // service-role bearer or admin profile → trusted; otherwise resolve the
  // customer's email so we can enforce order ownership below.
  let isAdmin = false;
  let callerEmail = "";
  if (bearer === serviceKey) {
    isAdmin = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) {
      return json(401, { ok: false, error: "Invalid token" });
    }
    callerEmail = (userResp.user.email ?? "").toLowerCase();
    const { data: profile } = await admin
      .from("doctor_profiles")
      .select("is_admin")
      .eq("user_id", userResp.user.id)
      .maybeSingle();
    isAdmin = !!(profile && (profile as { is_admin?: boolean }).is_admin);
  }

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const isMultipart = contentType.includes("multipart/form-data");

  // ── Shared order resolver + ownership guard ────────────────────────────────
  async function resolveOrder(orderIdField: string, confirmationIdField: string) {
    let q = admin.from("orders").select("id, confirmation_id, email").limit(1);
    q = orderIdField ? q.eq("id", orderIdField) : q.eq("confirmation_id", confirmationIdField);
    const { data: row } = await q.maybeSingle();
    return row as { id: string; confirmation_id: string | null; email: string | null } | null;
  }
  function ownsOrder(orderEmail: string | null): boolean {
    if (isAdmin) return true;
    return !!orderEmail && orderEmail.toLowerCase() === callerEmail && !!callerEmail;
  }

  // ── LIST mode (JSON) ───────────────────────────────────────────────────────
  if (!isMultipart) {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: "Expected JSON body or multipart upload" });
    }
    if ((body.action ?? "") !== "list") {
      return json(400, { ok: false, error: "Unsupported action" });
    }
    const order = await resolveOrder(
      (body.orderId ?? "").toString().trim(),
      (body.confirmationId ?? "").toString().trim(),
    );
    if (!order) return json(404, { ok: false, error: "Order not found" });
    if (!ownsOrder(order.email)) return json(403, { ok: false, error: "Not your order" });

    const { data: docs, error } = await admin
      .from("order_documents")
      .select("id, label, doc_type, file_url, uploaded_by, uploaded_at, mime_type")
      .eq("order_id", order.id)
      .eq("doc_type", DOC_TYPE)
      .order("uploaded_at", { ascending: false });
    if (error) return json(500, { ok: false, error: error.message });
    return json(200, { ok: true, documents: docs ?? [] });
  }

  // ── UPLOAD mode (multipart) ────────────────────────────────────────────────
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
    return json(415, { ok: false, error: `Unsupported file type: ${mime}` });
  }

  const orderIdField = (form.get("order_id") ?? "").toString().trim();
  const confirmationIdField = (form.get("confirmation_id") ?? "").toString().trim();
  if (!orderIdField && !confirmationIdField) {
    return json(400, { ok: false, error: "Either order_id or confirmation_id is required" });
  }

  const order = await resolveOrder(orderIdField, confirmationIdField);
  if (!order) return json(404, { ok: false, error: "Order not found" });
  if (!ownsOrder(order.email)) return json(403, { ok: false, error: "Not your order" });

  const originalName = safeFilename(file.name);
  const labelField = (form.get("label") ?? "").toString().trim();
  const label = labelField || originalName;

  // Object path under the private letters bucket, namespaced to /customer/.
  const stem = order.confirmation_id || order.id;
  const ts = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
  const objectPath = `${stem}/customer/${ts}-${rand}-${originalName}`;

  const buf = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("letters")
    .upload(objectPath, buf, { contentType: mime, upsert: false });
  if (uploadErr) {
    console.error("[customer-upload-document] storage upload failed:", uploadErr.message);
    return json(500, { ok: false, error: `Upload failed: ${uploadErr.message}` });
  }

  // 10-year signed URL — same convention as admin-upload-document.
  const { data: signed } = await admin.storage
    .from("letters")
    .createSignedUrl(objectPath, 60 * 60 * 24 * 365 * 10);
  const fileUrl = signed?.signedUrl ?? "";

  const uploadedBy = bearer === serviceKey ? "service_role" : (isAdmin ? "admin" : "customer");

  const { data: inserted, error: insertErr } = await admin
    .from("order_documents")
    .insert({
      order_id: order.id,
      confirmation_id: order.confirmation_id,
      label,
      doc_type: DOC_TYPE,
      file_url: fileUrl,
      file_path: objectPath,
      mime_type: mime,
      file_size_bytes: file.size,
      uploaded_by: uploadedBy,
      customer_visible: true,
    })
    .select("id, label, doc_type, file_url, uploaded_by, uploaded_at, mime_type")
    .maybeSingle();

  if (insertErr || !inserted) {
    try {
      await admin.storage.from("letters").remove([objectPath]);
    } catch { /* ignore */ }
    console.error("[customer-upload-document] order_documents insert failed:", insertErr?.message);
    return json(500, { ok: false, error: `Insert failed: ${insertErr?.message ?? "unknown"}` });
  }

  return json(200, { ok: true, document: inserted });
});
