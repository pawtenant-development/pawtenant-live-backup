import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import { fetchMyLeaveRequests, LEAVE_STATUS_TONE } from "../../../lib/employeeLeave";
import { fetchMyAttendanceCorrections } from "../../../lib/attendanceCorrections";
import { fetchMyLeaveCorrections } from "../../../lib/leaveCorrections";

interface MyRequestsWidgetProps {
  teamMemberId: string;
  reloadToken?: number;
  onNavigate?: (section: string) => void;
}

interface RequestItem {
  id: string;
  kind: string;
  icon: string;
  detail: string;
  status: string;
  created: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const pretty = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "");

/**
 * My Requests — compact Home widget that surfaces the employee's own leave
 * requests, attendance corrections and leave amendments with status badges, so
 * self-service requests are visible from Home (the full forms live in HR/Forms).
 * Reuses the existing self-scoped (RLS) fetchers — employee sees ONLY their own.
 */
export default function MyRequestsWidget({ teamMemberId, reloadToken, onNavigate }: MyRequestsWidgetProps) {
  const [items, setItems] = useState<RequestItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [leave, attn, leaveCorr] = await Promise.all([
        fetchMyLeaveRequests(teamMemberId),
        fetchMyAttendanceCorrections(teamMemberId),
        fetchMyLeaveCorrections(teamMemberId),
      ]);
      if (cancelled) return;
      const merged: RequestItem[] = [
        ...leave.map((r) => ({
          id: `lv-${r.id}`, kind: "Leave", icon: "ri-calendar-event-line",
          detail: `${pretty(r.leave_type)} · ${fmtDate(r.start_date)}`, status: r.status, created: r.created_at,
        })),
        ...attn.map((r) => ({
          id: `ac-${r.id}`, kind: "Attendance fix", icon: "ri-time-line",
          detail: `${pretty(r.correction_type)} · ${fmtDate(r.correction_date)}`, status: r.status, created: r.created_at,
        })),
        ...leaveCorr.map((r) => ({
          id: `lc-${r.id}`, kind: "Leave amendment", icon: "ri-edit-2-line",
          detail: pretty(r.correction_type), status: r.status, created: r.created_at,
        })),
      ].sort((a, b) => (a.created < b.created ? 1 : -1));
      setItems(merged);
    })();
    return () => { cancelled = true; };
  }, [teamMemberId, reloadToken]);

  const recent = (items ?? []).slice(0, 4);
  const pendingCount = (items ?? []).filter((r) => r.status === "pending").length;

  return (
    <div id="myrequests">
      <Widget
        icon="ri-file-list-3-line"
        title="My Requests"
        action={pendingCount > 0 ? (
          <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            {pendingCount} pending
          </span>
        ) : undefined}
      >
        {items === null ? (
          <p className="py-3 text-center text-xs text-stone-400">
            <i className="ri-loader-4-line animate-spin" /> Loading…
          </p>
        ) : recent.length === 0 ? (
          <div className="py-4 text-center">
            <i className="ri-inbox-line text-2xl text-stone-300" />
            <p className="mt-1 text-xs text-stone-500">No requests yet.</p>
            <button
              type="button"
              onClick={() => onNavigate?.("forms")}
              className="mt-2 text-[11px] font-semibold text-[#0f1e1a] hover:underline"
            >
              Request leave or a correction →
            </button>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-stone-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <i className={`${r.icon} text-stone-400 text-sm shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-700 truncate">{r.kind}</p>
                    <p className="text-[11px] text-stone-400 truncate capitalize">{r.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${LEAVE_STATUS_TONE[r.status] ?? "bg-stone-100 text-stone-500 border-stone-200"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onNavigate?.("forms")}
              className="mt-2 w-full rounded-lg bg-stone-100 hover:bg-stone-200 py-1.5 text-[11px] font-semibold text-stone-700"
            >
              View all in HR / Forms
            </button>
          </>
        )}
      </Widget>
    </div>
  );
}
