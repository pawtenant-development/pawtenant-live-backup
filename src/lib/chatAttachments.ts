/**
 * chatAttachments — client helpers for PawChat file attachments.
 *
 * Two entry points:
 *   - uploadChatAttachment(): POST a file to the chat-attachment-upload
 *     edge function. Returns the attachment metadata + new chat row id.
 *   - getChatAttachmentSignedUrl(): turns a stored file_path into a
 *     time-limited signed URL for display / download in the UI.
 *
 * All throws are normalized to Error so callers can surface a single
 * user-facing message. Never fails silently — callers need the result to
 * render the attachment bubble.
 */

import { supabase } from "./supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as
  | string
  | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const CHAT_ATTACHMENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const CHAT_ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx," +
  "image/jpeg,image/png,image/webp,application/pdf," +
  "application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface UploadChatAttachmentParams {
  file: File;
  sessionId?: string | null;
  email?: string | null;
  name?: string | null;
  provider?: string | null;
  providerSessionId?: string | null;
  sender?: "visitor" | "agent" | "system";
}

export interface UploadChatAttachmentResult {
  ok: true;
  session_id: string;
  chat_id: string;
  attachment_id: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number;
}

export function isValidChatAttachment(file: File): string | null {
  if (file.size <= 0) return "File is empty.";
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return `File too large (max ${Math.floor(
      CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024,
    )} MB).`;
  }
  const t = (file.type || "").toLowerCase();
  if (t && !CHAT_ATTACHMENT_ALLOWED_MIME.includes(t)) {
    const extOk = /\.(jpg|jpeg|png|webp|pdf|doc|docx)$/i.test(file.name);
    if (!extOk) return "Unsupported file type.";
  }
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
  return `${(bytes / (k * k)).toFixed(1)} MB`;
}

export function isImageAttachment(fileType: string | null | undefined): boolean {
  if (!fileType) return false;
  const t = fileType.toLowerCase();
  return t.startsWith("image/");
}

export async function uploadChatAttachment(
  params: UploadChatAttachmentParams,
): Promise<UploadChatAttachmentResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Chat attachments are not configured.");
  }

  const validationErr = isValidChatAttachment(params.file);
  if (validationErr) throw new Error(validationErr);

  const fd = new FormData();
  fd.set("file", params.file, params.file.name);
  if (params.sessionId) fd.set("session_id", params.sessionId);
  if (params.email) fd.set("email", params.email);
  if (params.name) fd.set("name", params.name);
  if (params.provider) fd.set("provider", params.provider);
  if (params.providerSessionId)
    fd.set("provider_session_id", params.providerSessionId);
  if (params.sender) fd.set("sender", params.sender);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-attachment-upload`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: fd,
  });

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }

  if (!res.ok || !parsed || parsed.ok !== true) {
    const err = (parsed?.error as string) || `Upload failed (HTTP ${res.status}).`;
    throw new Error(err);
  }

  return parsed as unknown as UploadChatAttachmentResult;
}

/**
 * Returns a signed URL for the given storage path. Expires in `ttlSec`
 * seconds (default 5 minutes — enough for a bubble to render + a user
 * click without leaking a long-lived URL).
 */
export async function getChatAttachmentSignedUrl(
  filePath: string,
  ttlSec = 300,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(filePath, ttlSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate signed URL");
  }
  return data.signedUrl;
}

export interface VisitorAttachment {
  id: string;
  chat_message_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export async function fetchVisitorAttachments(
  provider: string,
  providerSessionId: string,
): Promise<VisitorAttachment[]> {
  const { data, error } = await supabase.rpc("get_visitor_chat_attachments", {
    p_provider: provider,
    p_provider_session_id: providerSessionId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as VisitorAttachment[];
}
