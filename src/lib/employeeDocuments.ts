import { supabase } from "./supabaseClient";

// Employee Documents / Contracts. Private bucket + RLS-backed table.
// Admin (owner/admin_manager + is_admin) uploads/manages; employees read only
// their own employee_and_admin documents. Downloads use short-lived signed URLs
// (bucket is private — never public URLs). Employees only; providers/customers
// are not part of this system.

const BUCKET = "employee-documents";
const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export type DocumentType =
  | "signing_letter"
  | "employment_contract"
  | "id_document"
  | "policy"
  | "tax_payment"
  | "warning_letter"
  | "training_certificate"
  | "other";

export type DocumentVisibility = "admin_only" | "employee_and_admin";

export const DOCUMENT_TYPES: DocumentType[] = [
  "signing_letter",
  "employment_contract",
  "id_document",
  "policy",
  "tax_payment",
  "warning_letter",
  "training_certificate",
  "other",
];

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  signing_letter: "Signing Letter",
  employment_contract: "Employment Contract",
  id_document: "ID Document",
  policy: "Policy Acknowledgment",
  tax_payment: "Tax / Payment",
  warning_letter: "Warning / Disciplinary",
  training_certificate: "Training Certificate",
  other: "Other",
};

export const VISIBILITY_LABEL: Record<string, string> = {
  admin_only: "Admin only",
  employee_and_admin: "Employee + Admin",
};

export interface EmployeeDocument {
  id: string;
  team_member_id: string;
  document_type: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string | null;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  visibility: string;
  requires_acknowledgment: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

const SELECT_COLS =
  "id, team_member_id, document_type, title, description, file_path, file_name, file_mime_type, file_size_bytes, visibility, requires_acknowledgment, acknowledged_at, created_at";

/** Documents for one employee. RLS decides what the caller sees (admin = all;
 * employee = own employee_and_admin only). Returns [] on error. */
export async function fetchEmployeeDocuments(teamMemberId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase
    .from("employee_documents")
    .select(SELECT_COLS)
    .eq("team_member_id", teamMemberId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[employeeDocuments] fetch error", error);
    return [];
  }
  return (data as EmployeeDocument[] | null) ?? [];
}

export function validateDocument(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Allowed: PDF, image, or Word document.";
  if (file.size > MAX_BYTES) return "File must be 20MB or smaller.";
  return null;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export interface UploadMeta {
  document_type: DocumentType;
  title: string;
  description?: string | null;
  visibility: DocumentVisibility;
  requires_acknowledgment: boolean;
}

/** Admin upload: store the file under {team_member_id}/{uuid}-{name}, then insert
 * the metadata row. Returns error message or null. */
export async function uploadEmployeeDocument(
  teamMemberId: string,
  file: File,
  meta: UploadMeta,
): Promise<string | null> {
  const invalid = validateDocument(file);
  if (invalid) return invalid;

  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `${teamMemberId}/${uuid}-${safeName(file.name)}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "0",
    upsert: false,
    contentType: file.type,
  });
  if (up.error) return up.error.message;

  const { data: sessionData } = await supabase.auth.getSession();
  const uploadedBy = sessionData?.session?.user?.id ?? null;

  const { error } = await supabase.from("employee_documents").insert({
    team_member_id: teamMemberId,
    document_type: meta.document_type,
    title: meta.title,
    description: meta.description ?? null,
    file_path: path,
    file_name: file.name,
    file_mime_type: file.type,
    file_size_bytes: file.size,
    visibility: meta.visibility,
    requires_acknowledgment: meta.requires_acknowledgment,
    uploaded_by: uploadedBy,
  });
  if (error) {
    // Best-effort cleanup of the orphaned object.
    await supabase.storage.from(BUCKET).remove([path]);
    return error.message;
  }
  return null;
}

/** Short-lived signed URL for download/view. RLS gates which objects the caller
 * may sign (admin = all; employee = own employee_and_admin). null on failure. */
export async function getDocumentSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 120);
  if (error) {
    console.warn("[employeeDocuments] signed url error", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Admin delete: remove storage object + row. Returns error message or null. */
export async function deleteEmployeeDocument(doc: EmployeeDocument): Promise<string | null> {
  await supabase.storage.from(BUCKET).remove([doc.file_path]);
  const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
  return error ? error.message : null;
}

/** Employee acknowledges their own required document (SECURITY DEFINER RPC). */
export async function acknowledgeMyDocument(documentId: string): Promise<string | null> {
  const { error } = await supabase.rpc("acknowledge_my_document", { p_document_id: documentId });
  return error ? error.message : null;
}
