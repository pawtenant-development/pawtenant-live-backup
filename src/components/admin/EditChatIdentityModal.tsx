/**
 * EditChatIdentityModal — admin-only modal to correct a chat session's
 * visitor name/email.
 *
 * Calls the update_chat_admin_identity RPC (SECURITY DEFINER) which
 * updates visitor_name / visitor_email AND the legacy name / email mirror
 * columns. It does NOT touch matched_order_id or re-run order matching.
 *
 * Reused from both MiniChatPanel and ChatsTab.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

interface Props {
  open: boolean;
  sessionId: string | null;
  initialName: string | null;
  initialEmail: string | null;
  onClose: () => void;
  onSaved: (next: { name: string | null; email: string | null }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditChatIdentityModal({
  open,
  sessionId,
  initialName,
  initialEmail,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setEmail(initialEmail ?? "");
      setError(null);
      const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, initialName, initialEmail]);

  if (!open || !sessionId) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setError("Invalid email format");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "update_chat_admin_identity",
        {
          p_session_id: sessionId,
          p_name: trimmedName,
          p_email: trimmedEmail,
        },
      );
      if (rpcErr) throw new Error(rpcErr.message);
      const row = Array.isArray(data) ? data[0] : data;
      const nextName =
        (row?.visitor_name as string | null) ??
        (row?.name as string | null) ??
        null;
      const nextEmail =
        (row?.visitor_email as string | null) ??
        (row?.email as string | null) ??
        null;
      onSaved({ name: nextName, email: nextEmail });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to save identity");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-label="Edit visitor identity"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 bg-[#3b6ea5] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              Admin Action
            </p>
            <h3 className="text-base font-extrabold text-white mt-0.5">
              Edit Visitor Identity
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 cursor-pointer"
            aria-label="Close"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="px-5 py-5 space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Visitor Name
            </label>
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave blank to clear"
              maxLength={200}
              disabled={saving}
              className="w-full bg-[#f8f7f4] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#3b6ea5]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Visitor Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="visitor@example.com"
              maxLength={320}
              disabled={saving}
              className="w-full bg-[#f8f7f4] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#3b6ea5]"
            />
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed">
            This only updates the chat session's identity. Linked orders and
            attribution data are not affected.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <i className="ri-error-warning-line mr-1"></i>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-[#f8f7f4] border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="whitespace-nowrap px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:border-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="whitespace-nowrap inline-flex items-center gap-1.5 bg-[#3b6ea5] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg hover:bg-[#2e5a87] disabled:opacity-50 cursor-pointer"
          >
            <i
              className={`${
                saving ? "ri-loader-4-line animate-spin" : "ri-save-line"
              } text-xs`}
            ></i>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
