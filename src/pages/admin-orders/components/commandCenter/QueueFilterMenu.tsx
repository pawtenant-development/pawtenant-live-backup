/**
 * QueueFilterMenu — COMMAND-CENTER-QUEUE-FILTER-MENU-001
 *
 * Replaces the wrapping pill strip (12 pills over 4 rows on TEST) with one
 * compact "Filters" button + grouped dropdown, so the left pane gives its
 * vertical space back to the actual queue.
 *
 * Semantics are a strict SUPERSET of the old strip: selecting exactly one
 * filter behaves precisely as before (same facets, same counts). Selecting
 * several ANDs them, which the old strip simply could not express. "All" is the
 * empty selection and stays the default — it is not another permanent pill.
 *
 * Accessibility: the button is a real `aria-expanded` menu trigger, options are
 * checkboxes (multi-select), ArrowUp/ArrowDown roves focus, Home/End jump,
 * Escape closes and restores focus to the trigger, and a pointerdown outside
 * closes. Nothing here fetches, writes or sends.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FilterKey } from "./useCommsQueue";

export interface FilterGroup {
  label: string;
  keys: FilterKey[];
}

/**
 * Grouped presentation. Every key that exists in the queue's FILTERS vocabulary
 * appears exactly once; `all` is deliberately absent because it is the empty
 * selection, not an option.
 */
export const FILTER_GROUPS: FilterGroup[] = [
  { label: "Attention", keys: ["unread", "needs_reply", "ai_draft", "escalated", "blocked", "legal"] },
  { label: "Channel",   keys: ["sms", "chat", "calls", "email"] },
  { label: "Order",     keys: ["orders", "unassigned", "mine"] },
];

interface Props {
  labelFor: (k: FilterKey) => string;
  countFor: (k: FilterKey) => number;
  active: Set<FilterKey>;
  onToggle: (k: FilterKey) => void;
  onClear: () => void;
}

export default function QueueFilterMenu({ labelFor, countFor, active, onToggle, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  // Flat option order — what the roving cursor walks.
  const flat = useMemo(() => FILTER_GROUPS.flatMap((g) => g.keys), []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) btnRef.current?.focus();
  }, []);

  // Click-outside. pointerdown (not click) so a press that starts outside
  // closes immediately rather than after the button swallows the click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Escape anywhere in the menu closes and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => { if (open) itemRefs.current[cursor]?.focus(); }, [open, cursor]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + flat.length) % flat.length); }
    else if (e.key === "Home") { e.preventDefault(); setCursor(0); }
    else if (e.key === "End") { e.preventDefault(); setCursor(flat.length - 1); }
  };

  const activeCount = active.size;

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          ref={btnRef}
          type="button"
          onClick={() => { setOpen((o) => !o); setCursor(0); }}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={open ? menuId : undefined}
          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
            activeCount > 0
              ? "bg-[#1E293B] border-[#1E293B] text-white"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
          }`}
        >
          <i className="ri-filter-3-line text-[12px] leading-none" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] bg-white/25">
              {activeCount}
            </span>
          )}
          <i className={`ri-arrow-down-s-line text-[12px] leading-none transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {/* Active-filter chips. Only rendered when something is applied, so the
            default state is a single button and nothing else. */}
        {[...active].map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
          >
            {labelFor(k)}
            <button
              type="button"
              onClick={() => onToggle(k)}
              aria-label={`Remove ${labelFor(k)} filter`}
              className="text-slate-400 hover:text-slate-700 cursor-pointer leading-none"
            >
              <i className="ri-close-line text-[12px]" />
            </button>
          </span>
        ))}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10.5px] font-bold text-slate-500 hover:text-slate-800 underline underline-offset-2 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Queue filters"
          onKeyDown={onMenuKeyDown}
          className="absolute z-30 mt-1.5 w-[248px] max-h-[60vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1.5"
        >
          {FILTER_GROUPS.map((g) => (
            <div key={g.label} className="py-1">
              <p className="px-3 pb-1 text-[9.5px] font-bold uppercase tracking-widest text-slate-400">{g.label}</p>
              {g.keys.map((k) => {
                const idx = flat.indexOf(k);
                const on = active.has(k);
                const n = countFor(k);
                return (
                  <button
                    key={k}
                    ref={(el) => { itemRefs.current[idx] = el; }}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    tabIndex={cursor === idx ? 0 : -1}
                    onFocus={() => setCursor(idx)}
                    onClick={() => onToggle(k)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer focus:outline-none focus:bg-slate-100 ${
                      on ? "bg-slate-50 font-bold text-[#0F172A]" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      on ? "bg-[#1E293B] border-[#1E293B]" : "bg-white border-slate-300"
                    }`}>
                      {on && <i className="ri-check-line text-white text-[10px] leading-none" />}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{labelFor(k)}</span>
                    <span className="text-[10px] tabular-nums text-slate-400">{n}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
