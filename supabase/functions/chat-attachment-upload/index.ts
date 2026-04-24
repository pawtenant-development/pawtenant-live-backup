import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * chat-attachment-upload
 *
 * Visitor and agent file uploads for PawChat. Accepts multipart/form-data
 * with a single `file` field plus chat session context. Uploads to the
 * private `chat-attachments` bucket, creates a chat_attachments row, and
 * inserts a corresponding chats message that points at the attachment.
 *
 * Contract:
 *   - Max size:   10 MB
 *   - MIME types: image (jpeg/png/webp), pdf, msword, officedoc word
 *
 * Fire-and-forget on failure is NOT desired — the UI needs the attachment
 * row id to render the bubble. All errors are returned as JSON.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_NAME = 200;

const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXT = new Set<string>([
  "jpg", "jpeg", "png", "webp", "pdf", "doc", "docx",
]);

type SenderType = "visitor" | "agent" | "system";
const ALLOWED_SENDERS: SenderType[] = ["visitor", "agent", "system"];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "bin";
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
}

function sanitizeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, MAX_FILE_NAME);
  return base || "file";
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  } catch (e) {
    return json(400, { ok: false, error: "Failed to parse form body" });
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

  const typeOk =
    ALLOWED_MIME.has(declaredType) ||
    (declaredType === "" && ALLOWED_EXT.has(ext));
  if (!typeOk) {
    return json(415, {
      ok: false,
      error: "Unsupported file type. Allowed: jpg, png, webp, pdf, doc, docx.",
    });
  }

  const sessionIdField = (form.get("session_id") ?? "").toString().trim();
  const email = (form.get("email") ?? "").toString().trim() || null;
  const name = (form.get("name") ?? "").toString().trim() || null;
  const provider = (form.get("provider") ?? "").toString().trim() || null;
  const providerSessionId =
    (form.get("provider_session_id") ?? "").toString().trim() || null;

  let sender: SenderType = "visitor";
  const senderRaw = (form.get("sender") ?? "").toString().trim() as SenderType;
  if (senderRaw && ALLOWED_SENDERS.includes(senderRaw)) sender = senderRaw;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve or create session.
  let sessionId: string | null = null;
  if (sessionIdField) {
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionIdField)
      .maybeSingle();
    if (existing?.id) sessionId = existing.id as string;
  }

  if (!sessionId) {
    const { data: matched, error: matchErr } = await supabase.rpc(
      "match_or_create_chat_session",
      {
        p_provider: provider,
        p_provider_session_id: providerSessionId,
        p_email: email,
        p_name: name,
        p_window_minutes: 30,
      },
    );
    if (matchErr || !matched) {
      return json(500, {
        ok: false,
        error: matchErr?.message ?? "Session match failed",
      });
    }
    sessionId = matched as string;
  }

  // Storage path: <session>/<uuid>.<ext>
  const objectId = genId();
  const storagePath = `${sessionId}/${objectId}.${ext}`;

  // Upload bytes.
  const arrayBuf = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from("chat-attachments")
    .upload(storagePath, arrayBuf, {
      contentType: declaredType || `application/octet-stream`,
      upsert: false,
    });
  if (uploadErr) {
    return json(500, {
      ok: false,
      error: `Upload failed: ${uploadErr.message}`,
    });
  }

  // Build message body. Short, human-readable — the full file metadata is
  // in chat_attachments; the chats row keeps a pointer in metadata.
  const messageBody = `📎 ${rawName}`;

  let chatId: string | null = null;

  if (sender === "visitor") {
    const { data: recorded, error: recErr } = await supabase.rpc(
      "record_chat_message",
      {
        p_session_id: sessionId,
        p_message: messageBody,
        p_sender: "visitor",
        p_provider: provider,
        p_provider_message_id: null,
        p_metadata: {
          kind: "attachment",
          attachment: {
            file_name: rawName,
            file_path: storagePath,
            file_type: declaredType || null,
            file_size: file.size,
          },
        },
        p_email: email,
        p_name: name,
      },
    );
    if (recErr || !recorded) {
      // Roll back storage object so we don't orphan bytes.
      await supabase.storage.from("chat-attachments").remove([storagePath]);
      return json(500, {
        ok: false,
        error: recErr?.message ?? "Message record failed",
      });
    }
    chatId = recorded as string;
  } else {
    // Agent: reuse post_agent_chat_message then stamp metadata on the row.
    const { data: recorded, error: recErr } = await supabase.rpc(
      "post_agent_chat_message",
      { p_session_id: sessionId, p_message: messageBody },
    );
    if (recErr || !recorded) {
      await supabase.storage.from("chat-attachments").remove([storagePath]);
      return json(500, {
        ok: false,
        error: recErr?.message ?? "Agent message record failed",
      });
    }
    chatId = recorded as string;

    await supabase
      .from("chats")
      .update({
        metadata: {
          origin: "admin_portal",
          kind: "attachment",
          attachment: {
            file_name: rawName,
            file_path: storagePath,
            file_type: declaredType || null,
            file_size: file.size,
          },
        },
      })
      .eq("id", chatId);
  }

  // Insert attachment row.
  const { data: attachmentRow, error: attErr } = await supabase
    .from("chat_attachments")
    .insert({
      chat_session_id: sessionId,
      chat_message_id: chatId,
      uploaded_by: sender,
      file_name: rawName,
      file_path: storagePath,
      file_type: declaredType || null,
      file_size: file.size,
    })
    .select("id")
    .single();

  if (attErr || !attachmentRow) {
    // Message already exists; don't blow up the whole flow. Just warn.
    return json(200, {
      ok: true,
      session_id: sessionId,
      chat_id: chatId,
      file_path: storagePath,
      file_name: rawName,
      file_type: declaredType || null,
      file_size: file.size,
      attachment_id: null,
      warning: attErr?.message ?? "Attachment row insert failed",
    });
  }

  return json(200, {
    ok: true,
    session_id: sessionId,
    chat_id: chatId,
    attachment_id: attachmentRow.id,
    file_path: storagePath,
    file_name: rawName,
    file_type: declaredType || null,
    file_size: file.size,
  });
});
