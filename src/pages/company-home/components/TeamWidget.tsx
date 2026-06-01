import { useEffect, useState } from "react";
import { fetchTeamPresence, PRESENCE_DOT, type PresenceRow } from "../../../lib/presence";

interface TeamWidgetProps {
  reloadToken?: number;
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * My Team widget — live team roster with computed presence dots, backed by the
 * existing `get_team_presence()` RPC (self + active team members; providers
 * excluded). Read-only. Returns an empty state if the roster can't be read.
 */
export default function TeamWidget({ reloadToken }: TeamWidgetProps) {
  const [rows, setRows] = useState<PresenceRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeamPresence().then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const online = rows?.filter((r) => r.presence === "green").length ?? 0;
  const away = rows?.filter((r) => r.presence === "orange").length ?? 0;
  const offline = rows?.filter((r) => r.presence === "red").length ?? 0;

  return (
    <Widget icon="ri-team-line" title="My Team">
      {rows === null ? (
        <p className="px-1 py-2 text-xs text-stone-400">Loading team…</p>
      ) : rows.length === 0 ? (
        <p className="px-1 py-2 text-xs text-stone-400">Team roster unavailable.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 text-[11px]">
            <span className="text-emerald-600 font-semibold">{online} online</span>
            <span className="text-amber-600 font-semibold">{away} away</span>
            <span className="text-stone-400 font-semibold">{offline} offline</span>
          </div>
          <ul className="space-y-1.5">
            {rows.slice(0, 8).map((r) => (
              <li key={r.team_member_id} className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="h-7 w-7 rounded-full bg-stone-100 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-stone-500">
                    {r.display_picture_url ? (
                      <img src={r.display_picture_url} alt={r.display_name || ""} className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(r.display_name)
                    )}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${PRESENCE_DOT[r.presence]}`}
                  />
                </div>
                <span className="text-xs text-stone-700 truncate">{r.display_name || "—"}</span>
              </li>
            ))}
          </ul>
          {rows.length > 8 ? (
            <p className="mt-2 text-[11px] text-stone-400">+{rows.length - 8} more</p>
          ) : null}
        </>
      )}
    </Widget>
  );
}

export function Widget({
  icon,
  title,
  action,
  children,
}: {
  icon: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className={`${icon} text-stone-400`} />
          <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
