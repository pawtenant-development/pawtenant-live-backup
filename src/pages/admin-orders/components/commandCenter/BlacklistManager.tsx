/**
 * BlacklistManager — view & manage the AI Support blacklists (TEST).
 *
 * Blacklist-first model: every chat session / SMS number is eligible for an AI
 * reply by DEFAULT. Blacklisting one silences the AI for it (chat: no auto
 * reply; SMS: never auto-sends, and a manual admin send warns). This is the
 * full LIST view — add / remove / search across both blacklists in one place,
 * complementing the per-conversation "Blacklist this…" button in the context
 * panel.
 *
 * Storage: ai_support_settings holds each blacklist as a plain JSON string
 * array (ai_sms_auto_reply_blacklisted_numbers / ai_chat_auto_reply_blacklisted_sessions).
 * There is no per-entry reason / created_by / created_at metadata yet — the
 * arrays are values, not rows (documented limitation). Writes are RLS-gated to
 * owner / admin_manager (is_chat_admin()); reads to is_admin_staff().
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useCurrentAdminRole } from "../../../../hooks/useCurrentAdminRole";
import { isAdminLevel } from "../../../../lib/adminPermissions";

type ListKind = "sms" | "chat";

const KEYS: Record<ListKind, string> = {
  sms: "ai_sms_auto_reply_blacklisted_numbers",
  chat: "ai_chat_auto_reply_blacklisted_sessions",
};

function normSms(v: string): string {
  let p = (v || "").replace(/\D/g, "");
  if (p.length === 10) p = "1" + p;
  return p ? "+" + p : "";
}

export default function BlacklistManager({ onChanged }: { onChanged?: () => void }) {
  const { role } = useCurrentAdminRole();
  const canManage = isAdminLevel(role ?? null);
  const [kind, setKind] = useState<ListKind>("sms");
  const [lists, setLists] = useState<Record<ListKind, string[]>>({ sms: [], chat: [] });
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("ai_support_settings")
        .select("key, value")
        .in("key", [KEYS.sms, KEYS.chat]);
      const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
      const read = (k: string) => {
        const r = rows.find((x) => x.key === k);
        return Array.isArray(r?.value) ? (r!.value as unknown[]).map((x) => String(x)) : [];
      };
      setLists({
        sms: read(KEYS.sms).map(normSms).filter(Boolean),
        chat: read(KEYS.chat),
      });
    } catch { /* keep last */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const write = useCallback(async (k: ListKind, next: string[]) => {
    if (!canManage) return;
    setBusy(true); setMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("ai_support_settings").upsert(
        { key: KEYS[k], value: next, updated_by: auth?.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) { setMsg({ kind: "err", text: `Could not save — ${error.message}` }); return; }
      setLists((prev) => ({ ...prev, [k]: next }));
      onChanged?.();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(false); }
  }, [canManage, onChanged]);

  const add = useCallback(async () => {
    const raw = input.trim();
    if (!raw) return;
    const value = kind === "sms" ? normSms(raw) : raw;
    if (!value) { setMsg({ kind: "err", text: "Enter a valid phone number." }); return; }
    const current = lists[kind];
    if (current.includes(value)) { setMsg({ kind: "err", text: "Already blacklisted." }); return; }
    await write(kind, [...current, value]);
    setInput("");
    setMsg({ kind: "ok", text: `${kind === "sms" ? "Number" : "Session"} blacklisted — AI will not reply.` });
  }, [input, kind, lists, write]);

  const remove = useCallback(async (value: string) => {
    await write(kind, lists[kind].filter((x) => x !== value));
    setMsg({ kind: "ok", text: "Removed — AI can reply again." });
  }, [kind, lists, write]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = lists[kind];
    return q ? list.filter((x) => x.toLowerCase().includes(q)) : list;
  }, [lists, kind, search]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest">Automation · Blacklist manager</p>
          <p className="text-xs text-slate-500 mt-0.5">Everyone is AI-eligible by default. Blacklist a number/session to silence the AI for it.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs font-bold">
          {(["sms", "chat"] as ListKind[]).map((k) => (
            <button key={k} type="button" onClick={() => { setKind(k); setSearch(""); setMsg(null); }}
              className={`px-3 py-1.5 ${kind === k ? "bg-[#1E293B] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {k === "sms" ? "SMS numbers" : "Chat sessions"}
              <span className={`ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] ${kind === k ? "bg-white/25" : "bg-slate-100 text-slate-600"}`}>{lists[k].length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
            readOnly={!canManage}
            placeholder={kind === "sms" ? "Add a phone number (e.g. +14155551234)" : "Add a chat session id"}
            className="flex-1 min-w-[220px] text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#059669]"
          />
          <button type="button" disabled={!canManage || busy || !input.trim()} onClick={() => void add()}
            className="inline-flex items-center gap-1.5 bg-[#1E293B] text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#0F172A] disabled:opacity-50">
            <i className="ri-forbid-line" />Blacklist
          </button>
        </div>

        {lists[kind].length > 4 && (
          <div className="relative">
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-slate-400" />
          </div>
        )}

        <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          {!loaded ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{lists[kind].length === 0 ? "Nothing blacklisted — AI is eligible everywhere." : "No matches."}</p>
          ) : (
            visible.map((value) => (
              <div key={value} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
                <span className="text-sm font-semibold text-slate-700 tabular-nums break-all">{value}</span>
                <button type="button" disabled={!canManage || busy} onClick={() => void remove(value)}
                  className="text-xs px-2.5 py-1 rounded-md border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 disabled:opacity-50 whitespace-nowrap">
                  <i className="ri-check-line mr-1" />Remove
                </button>
              </div>
            ))
          )}
        </div>

        {msg && <p className={`text-[11px] ${msg.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
        {!canManage && <p className="text-[10.5px] text-slate-400">Owner / Admin roles only — read-only for your role.</p>}
        <p className="text-[10.5px] text-slate-400">
          <i className="ri-information-line mr-1" />
          SMS also keeps DND / STOP fail-closed, human takeover, dedupe and risky-category protections at send time. Entries store the value only (no per-entry reason/date yet).
        </p>
      </div>
    </div>
  );
}
