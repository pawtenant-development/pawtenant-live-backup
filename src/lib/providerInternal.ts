import { supabase } from "./supabaseClient";
import { getAdminIdentity } from "./adminIdentity";
import { logAudit } from "./auditLogger";

// Admin-only provider records: internal documents (bank docs, contracts,
// verification proofs) + masked bank/payout metadata.
//
// SECURITY MODEL (mirrors migration 20260702120000_company_os_admin_ops):
//   • Tables provider_internal_documents / provider_bank_details are RLS-gated
//     to is_provider_records_admin() = active admin with role owner /
//     admin_manager / finance. Providers (role='provider') and support /
//     read_only staff get zero rows.
//   • Files live in the PRIVATE `provider-internal` bucket; downloads use
//     short-lived signed URLs. Never store these files in provider-uploads
//     (that bucket is public).
//   • provider_bank_details holds MASKED metadata only (bank name, holder,
//     last-4, method). Full account/routing numbers are NOT stored as
//     structured data — upload the bank document as an internal document
//     instead. Structured full storage needs encrypted columns before LIVE.
//   • Every upload / download / archive / bank save / bank reveal is written
//     to audit_logs.

export const PROVIDER_INTERNAL_CATEGORIES: { value: string; label: string }[] = [
  { value: "bank_payout_details",        label: "Bank / Payout Details" },
  { value: "contract",                   label: "Contract" },
  { value: "license_verification",       label: "License Verification" },
  { value: "insurance_verification",     label: "Insurance Verification" },
  { value: "psypact_apit_verification",  label: "PSYPACT / APIT Verification" },
  { value: "tax_form",                   label: "Tax Form (e.g. W-9)" },
  { value: "payout_receipt",             label: "Payout Receipt" },
  { value: "compliance",                 label: "Compliance" },
  { value: "other",                      label: "Other" },
];

export interface ProviderInternalDocument {
  id: string;
  provider_email: string;
  category: string;
  title: string;
  notes: string | null;
  file_path: string;
  file_name: string | null;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  status: "active" | "archived";
  uploaded_by_name: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface ProviderBankDetails {
  id: string;
  provider_email: string;
  account_holder_name: string | null;
  bank_name: string | null;
  account_last4: string | null;
  payment_method: string | null;
  payment_notes: string | null;
  status: "active" | "archived";
  updated_at: string;
}

const BUCKET = "provider-internal";

/** List internal documents for a provider. Returns null when RLS blocks (unauthorized role). */
export async function listInternalDocuments(
  providerEmail: string,
): Promise<ProviderInternalDocument[] | null> {
  const { data, error } = await supabase
    .from("provider_internal_documents")
    .select("id, provider_email, category, title, notes, file_path, file_name, file_mime_type, file_size_bytes, status, uploaded_by_name, archived_at, created_at")
    .eq("provider_email", providerEmail.toLowerCase())
    .order("created_at", { ascending: false });
  if (error) return null;
  return (data as ProviderInternalDocument[] | null) ?? [];
}

export async function uploadInternalDocument(params: {
  providerEmail: string;
  doctorProfileId?: string | null;
  category: string;
  title: string;
  notes?: string;
  file: File;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = params.providerEmail.toLowerCase();
  const admin = await getAdminIdentity().catch(() => ({ id: null, email: null, name: null }));
  const safeEmail = email.replace(/[^a-z0-9@._-]/g, "_");
  const ext = params.file.name.includes(".") ? params.file.name.split(".").pop() : "bin";
  const path = `${safeEmail}/${Date.now()}-${params.category}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, params.file, { contentType: params.file.type || undefined, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: insErr } = await supabase.from("provider_internal_documents").insert({
    provider_email: email,
    doctor_profile_id: params.doctorProfileId ?? null,
    category: params.category,
    title: params.title.trim(),
    notes: (params.notes ?? "").trim() || null,
    file_path: path,
    file_name: params.file.name,
    file_mime_type: params.file.type || null,
    file_size_bytes: params.file.size,
    uploaded_by: admin.id ?? null,
    uploaded_by_name: admin.name ?? admin.email ?? null,
  });
  if (insErr) {
    // Roll back the orphan file so the private bucket stays clean.
    await supabase.storage.from(BUCKET).remove([path]).then(() => {}, () => {});
    return { ok: false, error: insErr.message };
  }

  void logAudit({
    actor_id: admin.id ?? null,
    actor_name: admin.name ?? admin.email ?? "admin",
    object_type: "provider",
    object_id: email,
    action: "provider_internal_doc_uploaded",
    description: `Uploaded internal document "${params.title.trim()}" (${params.category}) for provider ${email}`,
    metadata: { category: params.category, file_name: params.file.name, size: params.file.size },
  });
  return { ok: true };
}

/** Short-lived signed URL (private bucket). Audit-logged as a download/view. */
export async function getInternalDocumentUrl(
  doc: ProviderInternalDocument,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 300);
  if (error || !data?.signedUrl) return null;
  const admin = await getAdminIdentity().catch(() => ({ id: null, email: null, name: null }));
  void logAudit({
    actor_id: admin.id ?? null,
    actor_name: admin.name ?? admin.email ?? "admin",
    object_type: "provider",
    object_id: doc.provider_email,
    action: "provider_internal_doc_downloaded",
    description: `Opened internal document "${doc.title}" (${doc.category}) for provider ${doc.provider_email}`,
    metadata: { document_id: doc.id, category: doc.category },
  });
  return data.signedUrl;
}

/** Soft archive (no delete — receipts/contracts stay recoverable). */
export async function archiveInternalDocument(
  doc: ProviderInternalDocument,
  archive: boolean,
): Promise<string | null> {
  const admin = await getAdminIdentity().catch(() => ({ id: null, email: null, name: null }));
  const { error } = await supabase
    .from("provider_internal_documents")
    .update(
      archive
        ? { status: "archived", archived_at: new Date().toISOString(), archived_by: admin.id ?? null }
        : { status: "active", archived_at: null, archived_by: null },
    )
    .eq("id", doc.id);
  if (error) return error.message;
  void logAudit({
    actor_id: admin.id ?? null,
    actor_name: admin.name ?? admin.email ?? "admin",
    object_type: "provider",
    object_id: doc.provider_email,
    action: archive ? "provider_internal_doc_archived" : "provider_internal_doc_restored",
    description: `${archive ? "Archived" : "Restored"} internal document "${doc.title}" for provider ${doc.provider_email}`,
    metadata: { document_id: doc.id, category: doc.category },
  });
  return null;
}

/** Masked bank record. Returns undefined when RLS blocks (unauthorized role). */
export async function fetchBankDetails(
  providerEmail: string,
): Promise<ProviderBankDetails | null | undefined> {
  const { data, error } = await supabase
    .from("provider_bank_details")
    .select("id, provider_email, account_holder_name, bank_name, account_last4, payment_method, payment_notes, status, updated_at")
    .eq("provider_email", providerEmail.toLowerCase())
    .maybeSingle();
  if (error) return undefined;
  return (data as ProviderBankDetails | null) ?? null;
}

export async function saveBankDetails(params: {
  providerEmail: string;
  doctorProfileId?: string | null;
  account_holder_name: string;
  bank_name: string;
  account_last4: string;
  payment_method: string;
  payment_notes: string;
}): Promise<string | null> {
  const email = params.providerEmail.toLowerCase();
  const admin = await getAdminIdentity().catch(() => ({ id: null, email: null, name: null }));
  const { error } = await supabase.from("provider_bank_details").upsert(
    {
      provider_email: email,
      doctor_profile_id: params.doctorProfileId ?? null,
      account_holder_name: params.account_holder_name.trim() || null,
      bank_name: params.bank_name.trim() || null,
      account_last4: params.account_last4.trim() || null,
      payment_method: params.payment_method.trim() || null,
      payment_notes: params.payment_notes.trim() || null,
      status: "active",
      updated_by: admin.id ?? null,
      // created_by only matters on first insert; upsert overwrite is harmless.
      created_by: admin.id ?? null,
    },
    { onConflict: "provider_email" },
  );
  if (error) return error.message;
  void logAudit({
    actor_id: admin.id ?? null,
    actor_name: admin.name ?? admin.email ?? "admin",
    object_type: "provider",
    object_id: email,
    action: "provider_bank_details_saved",
    description: `Saved masked bank/payout details for provider ${email} (bank name, holder, last-4 only — no full account numbers stored)`,
    metadata: { bank_name: params.bank_name.trim() || null, account_last4: params.account_last4.trim() || null },
  });
  return null;
}

/** Audit the explicit reveal click — required by the security spec. */
export async function logBankDetailsReveal(providerEmail: string): Promise<void> {
  const admin = await getAdminIdentity().catch(() => ({ id: null, email: null, name: null }));
  void logAudit({
    actor_id: admin.id ?? null,
    actor_name: admin.name ?? admin.email ?? "admin",
    object_type: "provider",
    object_id: providerEmail.toLowerCase(),
    action: "provider_bank_details_revealed",
    description: `Viewed bank/payout details for provider ${providerEmail.toLowerCase()}`,
  });
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
