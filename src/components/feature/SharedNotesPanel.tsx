// SharedNotesPanel — shared note thread between admin and provider for a given order
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";

interface SharedNote {
  id: string;
  order_id: string;
  confirmation_id: string;
  author_id: string;
  author_name: string;
  author_role: "admin" | "provider";
  note: string;
  created_at: string;
}

interface SharedNotesPanelProps {
  orderId: string;
  confirmationId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: "admin" | "provider";
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SharedNotesPanel({
  orderId,
  confirmationId,
  currentUserId,
  currentUserName,
  currentUserRole,
}: SharedNotesPanelProps) {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, []);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shared_order_notes")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setNotes((data as SharedNote[]) ?? []);
    setLoading(false);
    scrollToBottom();
  }, [orderId, scrollToBottom]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`shared-notes-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shared_order_notes",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newNote = payload.new as SharedNote;
          setNotes((prev) => {
            if (prev.some((n) => n.id === newNote.id)) return prev;
            return [...prev, newNote];
          });
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "shared_order_notes",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setNotes((prev) => prev.filter((n) => n.id !== deleted.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, scrollToBottom]);

  const handleSend = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase.from("shared_order_notes").insert({
      order_id: orderId,
      confirmation_id: confirmationId,
      author_id: currentUserId,
      author_name: currentUserName,
      author_role: currentUserRole,
      note: text,
    });
    setSaving(false);
    if (error) {
      setSaveError("Failed to send. Please try again.");
    } else {
      setNoteText("");
      textareaRef.current?.focus();
    }
  };

  const handleDelete = async (noteId: string) => {
    await supabase.from("shared_order_notes").delete().eq("id", noteId);
  };

  const isMyNote = (note: SharedNote) => note.author_id === currentUserId;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/40 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
            <i className="ri-chat-3-line text-[#2c5282] text-sm"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold text-gray-900">Shared Notes</p>
            <p className="text-xs text-gray-400">
              Visible to admin and the assigned provider · {confirmationId}
            </p>
          </div>
          {notes.length > 0 && (
            <span className="ml-auto inline-flex items-center justify-center px-2.5 py-0.5 bg-[#e8f0f9] text-[#2c5282] text-xs font-extrabold rounded-full">
              {notes.length}
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#2c5282]"></div>
            <span className="text-xs text-gray-500 font-semibold">Admin (Pawtenant Team)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span className="text-xs text-gray-500 font-semibold">Provider</span>
          </div>
        </div>
      </div>

      {/* Notes list */}
      <div className="overflow-y-auto px-6 py-4 space-y-4 bg-white" style={{ minHeight: "320px", maxHeight: "420px" }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-2xl text-[#2c5282]"></i>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mb-3">
              <i className="ri-chat-3-line text-gray-300 text-2xl"></i>
            </div>
            <p className="text-sm font-bold text-gray-600 mb-1">No shared notes yet</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              This thread is shared between the Pawtenant admin team and the assigned provider.
              Add a note below to start the conversation.
            </p>
          </div>
        ) : (
          <>
            {notes.map((note) => {
              const isAdmin = note.author_role === "admin";
              const isMine = isMyNote(note);
              const alignRight = isMine;
              return (
                <div
                  key={note.id}
                  className={`flex gap-2.5 ${alignRight ? "flex-row-reverse" : "flex-row"} group`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-white text-xs font-extrabold flex-shrink-0 self-end ${isAdmin ? "bg-[#2c5282]" : "bg-amber-500"}`}
                  >
                    {note.author_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>

                  {/* Bubble */}
                  <div className={`max-w-[75%] space-y-1 ${alignRight ? "items-end" : "items-start"} flex flex-col`}>
                    {/* Meta */}
                    <div className={`flex items-center gap-1.5 ${alignRight ? "flex-row-reverse" : ""}`}>
                      <span className={`text-xs font-extrabold ${isAdmin ? "text-[#2c5282]" : "text-amber-700"}`}>
                        {note.author_name}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isAdmin ? "bg-[#e8f0f9] text-[#2c5282]" : "bg-amber-100 text-amber-700"}`}>
                        {isAdmin ? "Admin" : "Provider"}
                      </span>
                    </div>

                    {/* Note bubble */}
                    <div className="relative">
                      <div
                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          alignRight
                            ? isAdmin
                              ? "bg-[#2c5282] text-white rounded-br-sm"
                              : "bg-amber-500 text-white rounded-br-sm"
                            : isAdmin
                              ? "bg-[#e8f0f9] border border-[#b8cce4] text-gray-800 rounded-bl-sm"
                              : "bg-amber-50 border border-amber-200 text-gray-800 rounded-bl-sm"
                        }`}
                      >
                        {note.note}
                      </div>

                      {/* Delete button (own notes only, hover reveal) */}
                      {isMine && (
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          className={`whitespace-nowrap absolute -top-2 ${alignRight ? "-left-2" : "-right-2"} w-5 h-5 flex items-center justify-center bg-white border border-red-200 rounded-full text-red-400 hover:text-red-600 hover:border-red-400 cursor-pointer transition-all opacity-0 group-hover:opacity-100`}
                        >
                          <i className="ri-close-line" style={{ fontSize: "10px" }}></i>
                        </button>
                      )}
                    </div>

                    {/* Timestamp */}
                    <p className="text-xs text-gray-400">{formatTime(note.created_at)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef}></div>
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 bg-gray-50/40 px-6 py-4">
        {saveError && (
          <p className="text-xs text-red-500 flex items-center gap-1 mb-2">
            <i className="ri-error-warning-line"></i>{saveError}
          </p>
        )}

        {/* Role indicator */}
        <div className={`flex items-center gap-1.5 mb-2 px-3 py-1.5 rounded-lg w-fit ${currentUserRole === "admin" ? "bg-[#e8f0f9]" : "bg-amber-50 border border-amber-200"}`}>
          <div className={`w-2 h-2 rounded-full ${currentUserRole === "admin" ? "bg-[#2c5282]" : "bg-amber-500"}`}></div>
          <span className={`text-xs font-bold ${currentUserRole === "admin" ? "text-[#2c5282]" : "text-amber-700"}`}>
            Sending as {currentUserName} ({currentUserRole === "admin" ? "Admin" : "Provider"})
          </span>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
            placeholder={`Add a note visible to both admin and provider... (Ctrl+Enter to send)`}
            rows={3}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2c5282] bg-white resize-none transition-colors"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={saving || !noteText.trim()}
            className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 text-white text-sm font-extrabold rounded-xl cursor-pointer transition-colors disabled:opacity-40 self-end ${currentUserRole === "admin" ? "bg-[#2c5282] hover:bg-[#17504a]" : "bg-amber-500 hover:bg-amber-600"}`}
          >
            {saving ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-send-plane-fill"></i>
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{noteText.length}/1000</p>
      </div>
    </div>
  );
}
