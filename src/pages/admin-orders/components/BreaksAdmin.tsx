import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAllBreakRecords,
  todayBreaks,
  todayBreakSeconds,
  activeBreak,
  fmtDuration,
  fmtHMS,
  BREAK_TYPE_LABEL,
  BREAK_TYPE_ICON,
  type BreakRecord,
} from "../../../lib/employeeBreaks";
import { fetchAllEmployees } from "../../../lib/employeeHr";
import { pktTimeString } from "../../../lib/timezones";
import type { TeamMember } from "../../../lib/teamMembers";

/**
 * Live Breaks admin sub-view (Team tab). Owner / admin_manager only — gated by
 * the parent toggle + DB RLS. Shows who is currently on break (live timer) and
 * each employee's total break time today, joined client-side from team_members.
 * Read-only; not linked to payroll.
 */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

interface EmpAgg {
  emp: TeamMember | undefined;
  teamMemberId: string;
  active: BreakRecord | null;
  totalSec: number;
  count: number;
}

export default function BreaksAdmin() {
  const [records, setRecords] = useState<BreakRecord[] | null>(null);
  const [employees, setEmployees] = useState<TeamMember[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const tickRef = useRef<number | null>(null);

  async function load() {
    const [recs, emps] = await Promise.all([fetchAllBreakRecords(), fetchAllEmployees()]);
    setRecords(recs);
    setEmployees(emps);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, []);

  const empById = useMemo(() => {
    const m = new Map<string, TeamMember>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  // Aggregate today's breaks per employee (only employees who took a break today).
  const aggs = useMemo<EmpAgg[]>(() => {
    const all = records ?? [];
    const todays = todayBreaks(all, new Date(nowMs));
    const byMember = new Map<string, BreakRecord[]>();
    for (const r of todays) {
      const arr = byMember.get(r.team_member_id) ?? [];
      arr.push(r);
      byMember.set(r.team_member_id, arr);
    }
    const out: EmpAgg[] = [];
    byMember.forEach((recs, tmId) => {
      out.push({
        emp: empById.get(tmId),
        teamMemberId: tmId,
        active: activeBreak(recs),
        totalSec: todayBreakSeconds(recs, nowMs),
        count: recs.length,
      });
    });
    // Active breaks first, then by total time desc.
    out.sort((a, b) => {
      if (!!a.active !== !!b.active) return a.active ? -1 : 1;
      return b.totalSec - a.totalSec;
    });
    return out;
  }, [records, empById, nowMs]);

  const onBreakNow = aggs.filter((a) => a.active);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-extrabold text-gray-900">Live Breaks &amp; Away</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {onBreakNow.length > 0
            ? <span className="font-semibold text-rose-600">{onBreakNow.length} on break now</span>
            : "No one is on break right now"} · today's break totals per employee.
        </p>
      </div>

      {records === null ? (
        <div className="flex items-center justify-center py-20">
          <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]" />
        </div>
      ) : aggs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="w-11 h-11 flex items-center justify-center bg-gray-100 rounded-xl mx-auto mb-3">
            <i className="ri-cup-line text-gray-400 text-lg" />
          </div>
          <p className="text-sm font-bold text-gray-700">No breaks today</p>
          <p className="text-xs text-gray-400 mt-1">Break activity will appear here as employees take breaks.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {aggs.map((a) => {
            const elapsed = a.active ? Math.max(0, Math.floor((nowMs - new Date(a.active.started_at).getTime()) / 1000)) : 0;
            return (
              <div key={a.teamMemberId}
                className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 ${a.active ? "border-rose-200" : "border-gray-200"}`}>
                <div className="w-9 h-9 flex items-center justify-center rounded-full bg-[#e8f0f9] text-[#3b6ea5] text-xs font-extrabold flex-shrink-0">
                  {initials(a.emp?.display_name ?? null)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {a.emp?.display_name ?? "Unknown employee"}
                    {a.emp?.employee_code ? <span className="ml-1.5 text-xs font-medium text-gray-400">#{a.emp.employee_code}</span> : null}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{a.emp?.title ?? "—"} · {a.count} break{a.count === 1 ? "" : "s"} today</p>
                </div>
                {a.active ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <i className={BREAK_TYPE_ICON[a.active.break_type] ?? "ri-cup-line"} />
                    {BREAK_TYPE_LABEL[a.active.break_type] ?? a.active.break_type}
                    <span className="font-mono">{fmtHMS(elapsed)}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                    <i className="ri-check-line" /> Not on break
                  </span>
                )}
                <div className="text-right w-20 flex-shrink-0">
                  <div className="font-mono text-sm font-bold text-gray-800">{fmtDuration(a.totalSec)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Total today</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onBreakNow.length > 0 && (
        <p className="mt-3 text-[11px] text-gray-400">
          Live since: {onBreakNow.map((a) => a.active ? pktTimeString(a.active.started_at) : "").filter(Boolean).join(", ")} (PKT).
        </p>
      )}
    </div>
  );
}
