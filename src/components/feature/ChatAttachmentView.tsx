/**
 * ChatAttachmentView — renders a list of chat_attachments rows for a single
 * chat message. Shared between PawChatWidget (visitor) and MiniChatPanel
 * + ChatsTab (admin).
 *
 * - Image attachments render as a clickable thumbnail (opens signed URL in
 *   a new tab).
 * - Non-image attachments (pdf, doc, docx) render as a compact file chip
 *   with file icon, name, size, and a download button that mints a fresh
 *   signed URL on click.
 *
 * Signed URLs are generated lazily (on click for downloads, on mount for
 * image previews) and have short TTL.
 */

import { useEffect, useMemo, useState } from "react";
import {
  getChatAttachmentSignedUrl,
  isImageAttachment,
  formatBytes,
} from "../../lib/chatAttachments";

export interface ChatAttachmentItem {
  id: string;
  chat_message_id?: string | null;
  uploaded_by?: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at?: string;
}

interface Props {
  attachments: ChatAttachmentItem[];
  align?: "left" | "right";
  variant?: "dark" | "light";
}

export default function ChatAttachmentView({
  attachments,
  align = "left",
  variant = "light",
}: Props) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div
      className={`flex flex-col gap-1.5 mt-1 ${
        align === "right" ? "items-end" : "items-start"
      }`}
    >
      {attachments.map((a) =>
        isImageAttachment(a.file_type) ? (
          <ImageAttachment key={a.id} attachment={a} />
        ) : (
          <FileAttachment key={a.id} attachment={a} variant={variant} />
        ),
      )}
    </div>
  );
}

function ImageAttachment({ attachment }: { attachment: ChatAttachmentItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getChatAttachmentSignedUrl(attachment.file_path, 300);
        if (!cancelled) setUrl(u);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? "Preview unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.file_path]);

  if (err) {
    return <FileAttachment attachment={attachment} variant="light" />;
  }
  if (!url) {
    return (
      <div
        className="rounded-xl bg-gray-100 animate-pulse"
        style={{ width: 180, height: 140 }}
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={attachment.file_name}
      className="block rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm max-w-[220px]"
    >
      <img
        src={url}
        alt={attachment.file_name}
        style={{
          display: "block",
          maxWidth: 220,
          maxHeight: 220,
          width: "100%",
          height: "auto",
          objectFit: "cover",
        }}
      />
    </a>
  );
}

function FileAttachment({
  attachment,
  variant,
}: {
  attachment: ChatAttachmentItem;
  variant: "dark" | "light";
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const icon = useMemo(() => {
    const t = (attachment.file_type ?? "").toLowerCase();
    const n = attachment.file_name.toLowerCase();
    if (t.includes("pdf") || n.endsWith(".pdf")) return "ri-file-pdf-2-line";
    if (t.includes("word") || n.endsWith(".doc") || n.endsWith(".docx"))
      return "ri-file-word-2-line";
    if (t.startsWith("image/")) return "ri-image-2-line";
    return "ri-file-line";
  }, [attachment.file_type, attachment.file_name]);

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const u = await getChatAttachmentSignedUrl(attachment.file_path, 120);
      window.open(u, "_blank", "noopener,noreferrer");
    } catch (ex) {
      setErr((ex as Error).message ?? "Download failed");
    } finally {
      setBusy(false);
    }
  }

  const baseBg = variant === "dark" ? "rgba(255,255,255,0.18)" : "#F4F7FA";
  const textColor = variant === "dark" ? "#ffffff" : "#1F2937";
  const subColor = variant === "dark" ? "rgba(255,255,255,0.8)" : "#6B7280";

  return (
    <div className="flex flex-col gap-1 max-w-[260px]">
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-left cursor-pointer transition-colors disabled:opacity-60"
        style={{
          backgroundColor: baseBg,
          color: textColor,
          border:
            variant === "dark" ? "1px solid rgba(255,255,255,0.25)" : "1px solid #E5E7EB",
        }}
      >
        <i className={`${icon} text-lg flex-shrink-0`} />
        <span className="flex-1 min-w-0">
          <span
            className="block text-xs font-semibold truncate"
            style={{ color: textColor }}
          >
            {attachment.file_name}
          </span>
          <span className="block text-[10px] font-medium" style={{ color: subColor }}>
            {formatBytes(attachment.file_size ?? 0) || "Attachment"} ·{" "}
            {busy ? "Opening…" : "Tap to download"}
          </span>
        </span>
        <i
          className={`${busy ? "ri-loader-4-line animate-spin" : "ri-download-2-line"} text-sm flex-shrink-0`}
        />
      </button>
      {err && (
        <span className="text-[10px] text-red-600 font-semibold">{err}</span>
      )}
    </div>
  );
}
