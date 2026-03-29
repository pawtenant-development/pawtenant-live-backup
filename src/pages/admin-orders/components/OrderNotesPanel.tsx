import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface Note {
  id: string;
  note: string;
  doctor_user_id: string;
  created_at: string;
  author_name?: string;
}

interface OrderNotesPanelProps {
  orderId: string;
  confirmationId: string;
  adminUserId: string;
  adminName: string;
  onClose: () => void;
}

export default function OrderNotesPanel({
  orderId,
  confirmationId,
  adminUserId,
  adminName,
  onClose,
}: OrderNotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("doctor_notes")
        .select("id, note, doctor_user_id, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (data) {
        const enriched = await Promise.all(
          (data as Note[]).map(async (n) => {
            const { data: prof } = await supabase
              .from("doctor_profiles")
              .select("full_name")
              .eq("user_id", n.doctor_user_id)
              .maybeSingle();
            return { ...n, author_name: (prof as { full_name: string } | null)?.full_name ?? "Unknown" };
          })
        );
        setNotes(enriched);
      }
      setLoading(false);
    };
    fetchNotes();
  }, [orderId]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("doctor_notes")
      .insert({
        order_id: orderId,
        doctor_user_id: adminUserId,
        note: noteText.trim(),
      })
      .select("id, note, doctor_user_id, created_at")
      .maybeSingle();
    setSaving(false);
    if (!error && data) {
      setNotes((prev) => [...prev, { ...(data as Note), author_name: adminName }]);
      setNoteText("");
    }
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="bg-amber-50 border-t border-amber-200 px-5 py-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-sticky-note-line text-amber-600 text-sm"></i>
          </div>
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
            Admin Notes — {confirmationId}
          </p>
          {notes.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-200 text-amber-800 rounded-full text-xs font-extrabold">
              {notes.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="whitespace-nowrap w-6 h-6 flex items-center justify-center rounded-full hover:bg-amber-200 cursor-pointer transition-colors"
        >
          <i className="ri-close-line text-amber-700 text-sm"></i>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-amber-700">
          <i className="ri-loader-4-line animate-spin text-sm"></i>
          <span className="text-xs">Loading notes...</span>
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-amber-600 italic mb-3">No internal notes yet. Add the first one below.</p>
      ) : (
        <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
          {notes.map((n) => (
            <div key={n.id} className="bg-white border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-amber-800">{n.author_name}</span>
                <span className="text-xs text-amber-500">{formatTime(n.created_at)}</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.note}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
          }}
          placeholder="Write an internal note... (Ctrl+Enter to save)"
          rows={2}
          className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-amber-500 bg-white resize-none text-gray-700 placeholder-amber-400"
        />
        <button
          type="button"
          onClick={handleAddNote}
          disabled={saving || !noteText.trim()}
          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 disabled:opacity-40 cursor-pointer transition-colors self-end"
        >
          {saving ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-add-line"></i>
          )}
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>
      <p className="text-xs text-amber-500 mt-1">{noteText.length}/500</p>
    </div>
  );
}
