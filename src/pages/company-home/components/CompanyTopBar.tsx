import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import {
  clockInCurrentUser,
  clockOutCurrentUser,
  fetchTodayShiftContext,
  fetchMyTodayAttendance,
  type TodayShiftContext,
  type TodayAttendanceEntry,
} from "../../../lib/attendance";
import {
  AWAY_OPTIONS,
  PRESENCE_DOT,
  fetchMyPresence,
  setMyPresence,
  type AwayStatus,
  type PresenceColor,
} from "../../../lib/presence";
import { isClockInAllowed, useDeviceType } from "../../../lib/deviceType";
import { pktTimeString } from "../../../lib/timezones";
import type { TeamMember } from "../../../lib/teamMembers";
import BreakControls from "./BreakControls";

interface CompanyTopBarProps {
  member: TeamMember;
  /** Bumped whenever clock/status changes so sibling widgets refetch. */
  onChange?: () => void;
  /** Navigate to a portal section (left-rail keys). */
  onNavigate?: (section: string) => void;
}

/**
 * Company portal top utility bar — the primary clock-in/out + status surface.
 * Uses the SAME backend RPCs as the admin profile dropdown (clock_in/out,
 * set_my_presence) via shared libs. Break Time is a labelled UI placeholder
 * (no break_records backend yet). Desktop-only clock policy preserved.
 */

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

function fmtHM(totalMin: number): string {
  const m = Math.max(0, Math.floor(totalMin));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function workedMinutes(
  ctx: TodayShiftContext | null,
  today: TodayAttendanceEntry | null,
  nowMs: number,
): number {
  if (ctx?.openEntry) return (nowMs - new Date(ctx.openEntry.clock_in_at).getTime()) / 60000;
  if (today?.clock_out_at)
    return (new Date(today.clock_out_at).getTime() - new Date(today.clock_in_at).getTime()) / 60000;
  return 0;
}

export default function CompanyTopBar({ member, onChange, onNavigate }: CompanyTopBarProps) {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<TodayShiftContext | null>(null);
  const [today, setToday] = useState<TodayAttendanceEntry | null>(null);
  const [status, setStatus] = useState<AwayStatus>("available");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [menu, setMenu] = useState<null | "status" | "bell">(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const device = useDeviceType();
  const allowAttendance = isClockInAllowed(device);
  const tickRef = useRef<number | null>(null);

  async function load() {
    const [shiftCtx, todayEntry, presence] = await Promise.all([
      fetchTodayShiftContext(member.id),
      fetchMyTodayAttendance(member.id),
      fetchMyPresence(member.id),
    ]);
    setCtx(shiftCtx);
    setToday(todayEntry);
    setStatus(presence?.status ?? "available");
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchTodayShiftContext(member.id),
      fetchMyTodayAttendance(member.id),
      fetchMyPresence(member.id),
    ]).then(([shiftCtx, todayEntry, presence]) => {
      if (cancelled) return;
      setCtx(shiftCtx);
      setToday(todayEntry);
      setStatus(presence?.status ?? "available");
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 20000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const clockedIn = !!ctx?.openEntry;
  const color: PresenceColor = !clockedIn ? "red" : status !== "available" ? "orange" : "green";
  const timeInLabel = ctx?.openEntry
    ? pktTimeString(ctx.openEntry.clock_in_at)
    : today?.clock_in_at
      ? pktTimeString(today.clock_in_at)
      : "—";

  async function handleClock() {
    if (!allowAttendance || submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    if (clockedIn) {
      const id = await clockOutCurrentUser();
      if (!id) setErrorMessage("Could not clock out. Please try again.");
    } else {
      const id = await clockInCurrentUser();
      if (!id) setErrorMessage("Could not clock in. Please try again.");
      else await setMyPresence("available");
    }
    await load();
    setSubmitting(false);
    onChange?.();
  }

  async function handleSetStatus(next: AwayStatus) {
    setMenu(null);
    if (statusBusy || !clockedIn) return;
    setStatusBusy(true);
    const ok = await setMyPresence(next);
    if (ok) setStatus(next);
    setStatusBusy(false);
    onChange?.();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/admin-login");
  }

  const ctrlBtn =
    "h-9 w-9 shrink-0 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-500";

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="flex items-center gap-2.5 px-3 sm:px-4 h-14">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-md bg-[#0f1e1a] flex items-center justify-center text-white text-sm font-bold leading-none">
            P
          </div>
          <span className="hidden sm:block text-sm font-semibold text-stone-800 leading-none">
            PawTenant <span className="text-stone-400 font-normal">Portal</span>
          </span>
        </div>

        {/* Search */}
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 h-9 w-full max-w-xs">
          <i className="ri-search-line text-stone-400 text-sm" />
          <input
            type="text"
            placeholder="Search employees, policies, notices…"
            className="flex-1 bg-transparent text-sm text-stone-700 placeholder:text-stone-400 outline-none"
          />
        </div>

        <div className="flex-1" />

        {/* Timers */}
        <div className="hidden lg:flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-stone-500">Computer Hrs</span>
            <span className="rounded bg-emerald-600 px-1.5 h-5 inline-flex items-center font-mono font-semibold text-white leading-none">
              {fmtHM(workedMinutes(ctx, today, nowMs))}
            </span>
          </span>
          <BreakControls
            teamMemberId={member.id}
            clockedIn={clockedIn}
            onChange={() => { load(); onChange?.(); }}
          />
        </div>

        <div className="hidden lg:block h-6 w-px bg-stone-200" />

        {/* Identity + clock */}
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-xs font-semibold text-stone-700 max-w-[120px] truncate">
            {member.display_name || "Team Member"}
          </span>
          <span className="flex items-center gap-1 text-[11px]">
            <span className={`h-2 w-2 rounded-full ${PRESENCE_DOT[color]}`} />
            <span className="text-stone-500">{clockedIn ? `In ${timeInLabel}` : "Out"}</span>
          </span>
        </div>

        {allowAttendance ? (
          <button
            type="button"
            onClick={handleClock}
            disabled={submitting}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-9 shrink-0 text-xs font-semibold text-white disabled:opacity-60 ${
              clockedIn ? "bg-stone-900 hover:bg-stone-800" : "bg-[#0f1e1a] hover:bg-[#1a2e29]"
            }`}
          >
            <i className={clockedIn ? "ri-logout-circle-r-line" : "ri-login-circle-line"} />
            {submitting ? "…" : clockedIn ? "Time Out" : "Time In"}
          </button>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-700 shrink-0" title="Clock in/out from a desktop or laptop">
            <i className="ri-computer-line" /> Desktop only
          </span>
        )}

        {/* Bell */}
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => (m === "bell" ? null : "bell"))} className={ctrlBtn} aria-label="Notifications">
            <i className="ri-notification-3-line text-lg" />
          </button>
          {menu === "bell" ? (
            <Dropdown onClose={() => setMenu(null)}>
              <div className="px-3 py-6 text-center text-xs text-stone-500">
                <i className="ri-notification-off-line text-xl text-stone-300 block mb-1" />
                No new notifications.
              </div>
            </Dropdown>
          ) : null}
        </div>

        {/* Hamburger */}
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => (m === "status" ? null : "status"))} className={`${ctrlBtn} text-stone-600`} aria-label="Menu">
            <i className="ri-menu-line text-lg" />
          </button>
          {menu === "status" ? (
            <Dropdown onClose={() => setMenu(null)}>
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100">
                <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-semibold text-stone-500">
                  {initialsOf(member.display_name)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-800 truncate">{member.display_name}</div>
                  <div className="text-[11px] text-stone-500 truncate">{member.title || "Employee"}</div>
                </div>
              </div>

              <MenuLabel>Set status {clockedIn ? "" : "(clock in first)"}</MenuLabel>
              {AWAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!clockedIn || statusBusy}
                  onClick={() => handleSetStatus(opt.value)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className={`${opt.icon} text-stone-400`} />
                  <span className="flex-1">{opt.label}</span>
                  {clockedIn && status === opt.value ? <i className="ri-check-line text-emerald-600" /> : null}
                </button>
              ))}

              <div className="border-t border-stone-100 my-1" />
              <MenuLink icon="ri-user-line" label="My Profile" onClick={() => { onNavigate?.("myprofile"); setMenu(null); }} />
              <MenuLink icon="ri-file-list-3-line" label="Policies" onClick={() => { onNavigate?.("policies"); setMenu(null); }} />
              <a
                href="/admin-orders"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenu(null)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                <i className="ri-briefcase-line text-stone-400" />
                <span className="flex-1">Enter Workstation</span>
                <i className="ri-external-link-line text-xs text-stone-400" />
              </a>
              <div className="border-t border-stone-100 my-1" />
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              >
                <i className="ri-logout-box-r-line" />
                Sign Out
              </button>
            </Dropdown>
          ) : null}
        </div>
      </div>

      {errorMessage ? <div className="px-4 pb-2 text-xs text-rose-600">{errorMessage}</div> : null}
    </header>
  );
}

function Dropdown({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <button aria-label="Close menu" onClick={onClose} className="fixed inset-0 z-10 cursor-default" />
      <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg py-1">
        {children}
      </div>
    </>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-stone-400">{children}</div>;
}

function MenuLink({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50">
      <i className={`${icon} text-stone-400`} />
      {label}
    </button>
  );
}
