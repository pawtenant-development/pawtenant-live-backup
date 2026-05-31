import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fetchTeamPresence,
  PRESENCE_DOT,
  AWAY_LABEL,
  type PresenceRow,
} from "../../../lib/presence";

// Compact, VIEW-ONLY team presence for the admin top bar.
// The current user manages their own clock-in / away status from the profile
// menu (AdminProfileMenu); this dropdown is purely for viewing/searching the team.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_TEXT_COLOR: Record<PresenceRow["presence"], string> = {
  green: "text-emerald-600",
  orange: "text-amber-600",
  red: "text-gray-400",
};

export default function EmployeePresenceBar() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const data = await fetchTeamPresence();
    setRows(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    // Refresh instantly when the current user changes their own status.
    const onChange = () => load();
    window.addEventListener("pw:presence-changed", onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener("pw:presence-changed", onChange);
    };
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onlineCount = useMemo(() => rows.filter((r) => r.presence === "green").length, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.display_name.toLowerCase().includes(q) || (r.employee_code ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="relative" ref={wrapRef}>
      {/* Compact icon + online-count dot */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        title={`Team presence — ${onlineCount} online`}
        className="relative flex items-center gap-1 px-2.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <i className="ri-team-line text-base"></i>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{onlineCount}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-[130] overflow-hidden">
          {/* Header + search */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-extrabold text-gray-900">Team presence</p>
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{onlineCount} online
              </span>
            </div>
            <div className="relative">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5]"
              />
            </div>
          </div>

          {/* Roster */}
          <div className="max-h-72 overflow-y-auto py-1">
            {!loaded ? (
              <p className="px-3 py-6 text-center text-xs text-gray-400">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-gray-400">No employees found.</p>
            ) : (
              filtered.map((r) => (
                <div key={r.team_member_id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                  <span className="relative flex-shrink-0">
                    <span className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">
                      {initials(r.display_name)}
                    </span>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${PRESENCE_DOT[r.presence]}`}></span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800 truncate">{r.display_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {r.employee_code ? `#${r.employee_code}` : "Team member"}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold ${STATUS_TEXT_COLOR[r.presence]}`}>
                    {r.is_clocked_in ? AWAY_LABEL[r.away_status] : "Offline"}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
            <span>{rows.length} team member{rows.length !== 1 ? "s" : ""}</span>
            <button type="button" onClick={load} className="font-bold text-[#3b6ea5] hover:underline cursor-pointer">Refresh</button>
          </div>
        </div>
      )}
    </div>
  );
}
