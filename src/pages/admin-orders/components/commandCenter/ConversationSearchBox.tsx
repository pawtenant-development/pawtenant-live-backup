/**
 * ConversationSearchBox — the search field above the Command Center queue.
 *
 * UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001 §2
 *
 * Finds a conversation by customer name, email address, phone (any formatting)
 * or confirmation id — including conversations with NO order and NO known
 * customer, which is the whole point: the +16202539921 message was unreachable
 * precisely because it had neither.
 *
 * IDENTITY IS NEVER GUESSED. A result whose number is on file for more than one
 * customer renders as "Ambiguous · N" with no name attached. Selecting it opens
 * the thread keyed by the NUMBER; the right panel shows the candidates rather
 * than picking one.
 */
import { useEffect, useRef } from "react";
import {
  formatPhoneDisplay,
  toPreview,
} from "../../../../lib/conversationIdentity";
import type { ConversationHit } from "./useConversation";

const MATCH_LABEL: Record<ConversationHit["matchKind"], { icon: string; label: string }> = {
  phone: { icon: "ri-phone-line", label: "Phone" },
  email: { icon: "ri-mail-line", label: "Email" },
  name:  { icon: "ri-user-line", label: "Name" },
  order: { icon: "ri-shopping-bag-3-line", label: "Order" },
};

function fmtWhen(ts: string | null): string {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ConversationSearchBox({
  query,
  setQuery,
  hits,
  searching,
  empty,
  error,
  clear,
  onPick,
  activeKey,
}: {
  query: string;
  setQuery: (v: string) => void;
  hits: ConversationHit[];
  searching: boolean;
  empty: boolean;
  error: string | null;
  clear: () => void;
  onPick: (hit: ConversationHit) => void;
  activeKey: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // "/" focuses search, Escape clears it — the two shortcuts an operator
  // triaging a queue reaches for without looking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === "Escape" && document.activeElement === inputRef.current) clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  const showResults = query.trim().length >= 2;

  return (
    <div className="border-b border-slate-100">
      <div className="px-3 py-2.5">
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone or order ID…"
            aria-label="Search conversations"
            className="w-full min-w-0 text-[13px] pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white focus:border-[#1E293B] focus:outline-none"
          />
          {searching && (
            <i className="ri-loader-4-line animate-spin absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          )}
          {query && (
            <button type="button" onClick={clear} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <i className="ri-close-circle-fill text-sm" />
            </button>
          )}
        </div>
        {showResults && (
          <p className="text-[10px] text-slate-400 mt-1.5">
            Any phone format finds the same conversation. Unknown numbers are searchable too.
          </p>
        )}
      </div>

      {showResults && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-slate-100 bg-slate-50/60">
          {error ? (
            <p className="text-[12px] text-orange-700 font-semibold px-4 py-4 text-center">
              <i className="ri-error-warning-line mr-1" />{error}
            </p>
          ) : searching && hits.length === 0 ? (
            <p className="text-[12px] text-slate-400 px-4 py-5 text-center">Searching…</p>
          ) : empty ? (
            <div className="px-4 py-5 text-center">
              <i className="ri-search-eye-line text-xl text-slate-300" />
              <p className="text-[12.5px] font-bold text-slate-500 mt-1.5">No conversation found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Try the full phone number, an email address, or the PT- order ID.
              </p>
            </div>
          ) : (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {hits.length} result{hits.length === 1 ? "" : "s"}
              </p>
              {hits.map((h) => {
                const key = h.contactE164 ?? h.orderId ?? "";
                const m = MATCH_LABEL[h.matchKind];
                const active = activeKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onPick(h)}
                    className={`w-full text-left px-4 py-2.5 border-b border-slate-100 transition-colors ${
                      active ? "bg-[#EEF2F7] shadow-[inset_3px_0_0_#1E293B]" : "hover:bg-white"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-bold text-slate-800 truncate min-w-0">
                        {/* An ambiguous or unknown thread shows its NUMBER, never
                            a name the system is not entitled to assert. */}
                        {h.displayName || formatPhoneDisplay(h.contactE164)}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtWhen(h.lastAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        <i className={m.icon} />{m.label}
                      </span>
                      {h.identityState === "ambiguous" && (
                        <span
                          className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800"
                          title={`${h.candidateCount} customers have this number on file — no customer is attached to this thread.`}
                        >
                          <i className="ri-question-line" />Ambiguous · {h.candidateCount}
                        </span>
                      )}
                      {h.identityState === "unknown" && (
                        <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500"
                          title="No customer or order matches this number.">
                          <i className="ri-user-unfollow-line" />Unknown
                        </span>
                      )}
                      {h.confirmationId && (
                        <span className="text-[9.5px] font-mono text-slate-500 truncate">{h.confirmationId}</span>
                      )}
                      {h.messageCount > 0 && (
                        <span className="text-[9.5px] text-slate-400">{h.messageCount} msg</span>
                      )}
                    </div>
                    {h.lastPreview && (
                      <p className="text-[11.5px] text-slate-500 truncate mt-0.5">
                        {toPreview(h.lastPreview, 90)}
                      </p>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
