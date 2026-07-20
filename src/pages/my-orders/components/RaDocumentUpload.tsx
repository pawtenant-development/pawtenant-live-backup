// RaDocumentUpload — customer-facing Reasonable Accommodation / additional
// documentation upload inside /my-orders (PACKAGE-RA-LETTER-BUNDLE-001).
//
// Shown ONLY for RA bundle orders (esa_ra_bundle / psd_ra_bundle, i.e.
// includes_reasonable_accommodation_letter=true). Reuses the EXISTING
// `customer-upload-document` edge function (private `letters` bucket →
// order_documents, doc_type=customer_upload, customer_visible=true) and the
// same auth/ownership rules as the $50 add-on flow — no parallel upload system.
//
// Upload is OPTIONAL: only needed when the customer has an external landlord /
// property-manager / HOA / tenant-association form for the provider to complete.

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CustomerPortalSection from "./CustomerPortalSection";
import { openSecureDocument } from "../../../lib/openSecureDocument";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface UploadedDoc {
  id: string;
  label: string;
  file_url: string;
  uploaded_at: string;
}

export interface RaEligibleOrder {
  id: string;
  confirmation_id: string;
  includes_reasonable_accommodation_letter?: boolean | null;
  additional_documentation_status?: string | null;
}

/** Show the RA upload area only for a bundle order that includes the RA letter. */
export function showRaDocumentUpload(order: RaEligibleOrder): boolean {
  return order.includes_reasonable_accommodation_letter === true;
}

function StatusPill({ status, hasUploads }: { status: string | null | undefined; hasUploads: boolean }) {
  // Derive a friendly label. Server status wins; fall back to upload presence.
  const s = (status ?? "").toLowerCase();
  let label = "Waiting for your upload";
  let cls = "bg-amber-50 text-[#B45309]";
  if (s === "completed") { label = "Completed by provider"; cls = "bg-[#ECFDF5] text-[#059669]"; }
  else if (s === "in_review" || s === "uploaded" || hasUploads) { label = "Uploaded — under provider review"; cls = "bg-[#EFF6FF] text-[#2563EB]"; }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${cls}`}>
      <i className="ri-circle-fill text-[6px]"></i>{label}
    </span>
  );
}

/** Short date for an uploaded file (e.g. "Jul 11, 2026"). */
function uploadedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RaDocumentUpload({ order }: { order: RaEligibleOrder }) {
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUploads = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/customer-upload-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "list", orderId: order.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.documents)) setUploads(data.documents as UploadedDoc[]);
    } catch { /* fail soft */ }
  }, [order.id]);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Your session has expired — please sign in again.");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("order_id", order.id);
      fd.append("label", file.name);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/customer-upload-document`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets multipart boundary
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error ?? `Upload failed (HTTP ${res.status})`);
      await loadUploads();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const hasUploads = uploads.length > 0;
  const completed = (order.additional_documentation_status ?? "").toLowerCase() === "completed";

  // Secure view of the customer's OWN source form — mints a fresh short-lived
  // signed URL (never exposes the private-bucket path). The completed/returned form
  // is NOT rendered here; it lives in My Documents (no duplicate doc card).
  const viewSource = async (docId: string) => {
    const r = await openSecureDocument(docId);
    if (!r.ok) console.error("[my-orders] open source form failed:", r.error);
  };

  // Housing Accommodation workflow section (rendered through the shared shell so it
  // matches every other portal section). Source forms + upload live HERE; the
  // provider's COMPLETED form is a My Documents deliverable, linked (not duplicated).
  return (
    <CustomerPortalSection
      title="Housing Accommodation"
      icon="ri-home-smile-line"
      tone="blue"
      prominent
      headerRight={<StatusPill status={order.additional_documentation_status} hasUploads={hasUploads} />}
    >
      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-[#059669] bg-[#ECFDF5] border border-[#C7F0DC] px-1.5 py-0.5 rounded-full mb-2.5">
        <i className="ri-checkbox-circle-fill text-[9px]"></i>Included with your combo package
      </span>

      {completed && (
        <div className="mb-3 rounded-xl border border-[#C7F0DC] bg-[#ECFDF5] px-3.5 py-3 flex items-start gap-2">
          <i className="ri-checkbox-circle-fill text-[#059669] mt-0.5 flex-shrink-0"></i>
          <p className="text-xs text-[#065F46] leading-relaxed">
            <span className="font-bold">Your provider completed your Housing Accommodation form.</span>{" "}
            Open or download the finished form from <span className="font-bold">My Documents</span>.
          </p>
        </div>
      )}

      <p className="text-[13px] text-[#5F6B7A] leading-relaxed mb-3">
        Reasonable Accommodation document support is <span className="font-semibold text-[#172033]">included in your package —
        no extra payment</span>. If your landlord, property manager, HOA, or tenant association gave you a form, upload it here
        and your provider will review it with your file. <span className="font-semibold text-[#172033]">If you don't have a
        separate form, no upload is needed</span> — your provider continues reviewing your documentation. Uploading does not
        guarantee third-party acceptance.
      </p>

      {hasUploads && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] mb-1.5">Your uploaded form{uploads.length > 1 ? "s" : ""}</p>
          <ul className="space-y-1.5">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  <i className="ri-file-text-line text-[#059669] flex-shrink-0"></i>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[#172033] truncate" title={u.label}>{u.label}</span>
                    {uploadedOn(u.uploaded_at) && <span className="block text-[10px] text-[#64748b]">Uploaded {uploadedOn(u.uploaded_at)}</span>}
                  </span>
                </span>
                <button type="button" onClick={() => viewSource(u.id)} className="text-xs font-semibold text-[#3b6ea5] hover:text-[#1e3a5f] whitespace-nowrap flex items-center gap-1 flex-shrink-0 cursor-pointer">
                  <i className="ri-external-link-line"></i>View
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/png,image/jpeg,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer transition-colors"
      >
        {uploading ? <><i className="ri-loader-4-line animate-spin"></i>Uploading…</> : <><i className="ri-upload-2-line"></i>{hasUploads ? "Upload another form" : "Upload your form"}</>}
      </button>
      <p className="text-[10px] text-[#64748b] mt-2">PDF, image, or Word — max 25&nbsp;MB. You can replace it by uploading again.</p>
      {uploadError && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><i className="ri-error-warning-line"></i>{uploadError}</p>}
    </CustomerPortalSection>
  );
}
