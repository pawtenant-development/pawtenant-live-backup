// partner-orders-v1/document.ts
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part A
// GET /partner-orders-v1/orders/{partner_order_id}/document
//
// Returns a short-lived signed download URL for the CURRENT approved
// partner-safe document of the caller's own order. The partner never touches
// PawTenant's internal document store:
//
//   * The signable artifact is a RELEASE — a copy of the approved letter's
//     bytes minted into the private `partner-documents` bucket under a path
//     containing nothing but the release's own random id. The provider's
//     original upload, retail customer uploads, and every internal derivative
//     (QR/verification/footer artifacts) are structurally out of reach: this
//     handler only ever signs `partner-documents` objects.
//   * Tenant isolation is a table predicate (partner_id + partner_order_id),
//     applied before anything else is read. Another partner's reference is
//     indistinguishable from a nonexistent one.
//   * Readiness is server-decided: the order's letter must be approved,
//     customer-deliverable and not superseded. Anything else is a refusal,
//     not a fallback to some other artifact.
//   * GET is idempotent: the release is minted once per approved source
//     document (DB-unique) and re-signed on every call. Nothing mutates on
//     retry; a superseded-then-reapproved letter is a NEW source document and
//     therefore a NEW release, and only the current one is ever served.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  partnerError,
  partnerJson,
  type PartnerIdentity,
} from "../_shared/partnerApi.ts";

/** Short-lived by design: the URL is a bearer credential for one document.
 *  Rapid re-fetches this endpoint for a fresh URL rather than storing it. */
export const PARTNER_DOCUMENT_URL_TTL_SECONDS = 300;

const RELEASE_BUCKET = "partner-documents";
const LETTER_DOC_TYPES = ["esa_letter", "psd_letter"];

const STORAGE_PATH_RE =
  /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/;

function parseStorageUrl(rawUrl: string | null | undefined): { bucket: string; path: string } | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(STORAGE_PATH_RE);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/**
 * The partner_order_id is partner-supplied text and ends up in a
 * Content-Disposition download name — reduce it to a safe basename charset so
 * a hostile reference (`../../x`, quotes, control characters) cannot escape
 * into a header or a filesystem path on the partner's side.
 */
function safeReferenceForFilename(ref: string): string {
  return ref
    .replace(/[^A-Za-z0-9._-]/g, "-")
    // No dot runs: ".." carries traversal meaning to naive partner-side file
    // handling even when our own separators are already gone.
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .slice(0, 60) || "order";
}

async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ReleaseRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  file_sha256: string;
  created_at: string;
}

export async function handleDocumentRetrieval(
  admin: SupabaseClient,
  identity: PartnerIdentity,
  partnerOrderId: string,
  requestId: string,
  audit: (opts: {
    partnerId?: string | null; partnerSlug?: string | null; partnerOrderId?: string | null;
    orderId?: string | null; action: string; outcome: string; requestId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>,
): Promise<Response> {
  const auditBase = {
    partnerId: identity.partnerId,
    partnerSlug: identity.partnerSlug,
    partnerOrderId,
    action: "document_retrieval",
    requestId,
  };

  // ── Tenant isolation FIRST ────────────────────────────────────────────────
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, confirmation_id, letter_type, partner_document_policy")
    .eq("partner_id", identity.partnerId)
    .eq("partner_order_id", partnerOrderId)
    .maybeSingle();
  if (orderErr) return partnerError("internal_error", requestId);
  if (!order) {
    await audit({ ...auditBase, outcome: "not_found" });
    return partnerError("not_found", requestId);
  }

  // ── Readiness: the CURRENT approved, deliverable, non-superseded letter ──
  const { data: docs, error: docErr } = await admin
    .from("order_documents")
    .select("id, doc_type, file_url, file_path, processed_file_url, footer_injected, qr_file_url, mime_type, review_status, customer_visible, superseded_by_document_id, approved_at")
    .eq("order_id", order.id)
    .in("doc_type", LETTER_DOC_TYPES)
    .eq("review_status", "approved")
    .eq("customer_visible", true)
    .is("superseded_by_document_id", null)
    .order("approved_at", { ascending: false })
    .limit(1);
  if (docErr) return partnerError("internal_error", requestId);
  const doc = docs?.[0] as {
    id: string; doc_type: string; file_url: string | null; file_path: string | null;
    processed_file_url: string | null; footer_injected: boolean | null; qr_file_url: string | null;
    mime_type: string | null;
  } | undefined;
  if (!doc) {
    await audit({ ...auditBase, orderId: order.id, outcome: "document_not_ready" });
    return partnerError("document_not_ready", requestId);
  }

  // BELT: a partner-neutral order must never have grown a verification/QR
  // derivative (Slice 5 boundary). If one exists, something upstream is
  // breached — refuse and audit rather than serve anything.
  if (doc.footer_injected || doc.processed_file_url || doc.qr_file_url) {
    await audit({
      ...auditBase, orderId: order.id, outcome: "verification_artifact_present_refused",
    });
    return partnerError("internal_error", requestId);
  }

  // ── Ensure the partner-safe release exists (mint-once, DB-unique) ────────
  let release: ReleaseRow | null = null;
  {
    const { data } = await admin
      .from("partner_document_releases")
      .select("id, storage_bucket, storage_path, mime_type, file_size_bytes, file_sha256, created_at")
      .eq("source_document_id", doc.id)
      .maybeSingle();
    release = (data as ReleaseRow | null) ?? null;
  }

  if (!release) {
    // Resolve the approved source object. The stored URL carries the
    // authoritative bucket (provider-submit-letter stores a signed URL into
    // provider-letters); file_path is the in-bucket fallback for rows whose
    // URL did not parse. External (non-storage) URLs are refused: partner
    // releases only ever come from our own store.
    const source = parseStorageUrl(doc.file_url)
      ?? (doc.file_path ? { bucket: "provider-letters", path: doc.file_path } : null);
    if (!source) {
      await audit({ ...auditBase, orderId: order.id, outcome: "source_object_unresolvable" });
      return partnerError("internal_error", requestId);
    }

    const { data: blob, error: dlErr } = await admin.storage.from(source.bucket).download(source.path);
    if (dlErr || !blob) {
      await audit({ ...auditBase, orderId: order.id, outcome: "source_object_unreadable" });
      return partnerError("internal_error", requestId);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha256 = await sha256HexOf(bytes);

    const releaseId = crypto.randomUUID();
    const ext = (source.path.split("/").pop() ?? "").match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase() ?? "pdf";
    const mime = doc.mime_type ?? (ext === "pdf" ? "application/pdf" : "application/octet-stream");
    // Path discipline: the release id and nothing else. No internal order id,
    // no partner id, no customer identity can leak through a signed URL path.
    const releasePath = `releases/${releaseId}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(RELEASE_BUCKET)
      .upload(releasePath, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      await audit({ ...auditBase, orderId: order.id, outcome: "release_upload_failed" });
      return partnerError("internal_error", requestId);
    }

    const { data: inserted, error: insErr } = await admin
      .from("partner_document_releases")
      .insert({
        id: releaseId,
        order_id: order.id,
        partner_id: identity.partnerId,
        partner_order_id: partnerOrderId,
        source_document_id: doc.id,
        service: (order.letter_type ?? "esa").toLowerCase(),
        storage_bucket: RELEASE_BUCKET,
        storage_path: releasePath,
        mime_type: mime,
        file_size_bytes: bytes.length,
        file_sha256: sha256,
      })
      .select("id, storage_bucket, storage_path, mime_type, file_size_bytes, file_sha256, created_at")
      .maybeSingle();

    if (insErr) {
      // A concurrent request won the mint race (unique on source_document_id):
      // use the winner's release and remove this attempt's orphaned object.
      await admin.storage.from(RELEASE_BUCKET).remove([releasePath]).then(() => {}, () => {});
      const { data: winner } = await admin
        .from("partner_document_releases")
        .select("id, storage_bucket, storage_path, mime_type, file_size_bytes, file_sha256, created_at")
        .eq("source_document_id", doc.id)
        .maybeSingle();
      release = (winner as ReleaseRow | null) ?? null;
      if (!release) return partnerError("internal_error", requestId);
    } else {
      release = inserted as ReleaseRow;
    }
  }

  // ── Sign the RELEASE object only, short TTL, safe download name ──────────
  const service = (order.letter_type ?? "esa").toUpperCase();
  const ext = (release.storage_path.split(".").pop() ?? "pdf").toLowerCase();
  const filename = `PawTenant-${service}-Assessment-Letter-${safeReferenceForFilename(partnerOrderId)}.${ext}`;

  const { data: signed, error: signErr } = await admin.storage
    .from(release.storage_bucket)
    .createSignedUrl(release.storage_path, PARTNER_DOCUMENT_URL_TTL_SECONDS, { download: filename });
  if (signErr || !signed?.signedUrl) {
    await audit({ ...auditBase, orderId: order.id, outcome: "sign_failed" });
    return partnerError("internal_error", requestId);
  }

  await audit({
    ...auditBase,
    orderId: order.id,
    outcome: "signed_url_issued",
    metadata: { release_id: release.id, expires_in_seconds: PARTNER_DOCUMENT_URL_TTL_SECONDS },
  });

  return partnerJson({
    partner_order_id: partnerOrderId,
    pawtenant_reference: order.confirmation_id,
    service: (order.letter_type ?? "esa").toLowerCase(),
    document: {
      download_url: signed.signedUrl,
      expires_in_seconds: PARTNER_DOCUMENT_URL_TTL_SECONDS,
      content_type: release.mime_type,
      size_bytes: release.file_size_bytes,
      sha256: release.file_sha256,
      released_at: release.created_at,
      filename,
    },
    request_id: requestId,
  }, 200, requestId);
}
