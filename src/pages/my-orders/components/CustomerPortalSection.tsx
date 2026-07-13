// CustomerPortalSection — the ONE shared visual shell every major /my-orders
// section renders through (CUSTOMER-PORTAL-DOCUMENTS-IA-HOUSING-VISIBILITY-001).
//
// Before this component each portal card invented its own chrome and title
// treatment (text-xs uppercase here, text-sm gray-900 there, text-base sm:text-lg
// elsewhere; icon tiles 6px / 10px / none; borders 1px / 2px). This shell gives
// every section ONE consistent: outer border + radius + white surface + restrained
// shadow, ONE header (icon tile + title + optional right-side status/meta slot),
// ONE title typography, and ONE body padding — so sections read as a single system
// with clearly visible beginnings and ends.
//
// Palette (per task §6): admin blue for structure, emerald=completed/included,
// amber=pending, review-blue (#2563EB) reserved for active provider review, muted
// gray for locked/unavailable. Light-only, no dark/brown styling.

import type { ReactNode } from "react";

export type SectionTone = "blue" | "emerald" | "amber" | "review" | "gray";

/** Icon-tile background + foreground per tone. Kept in one place so every section's
 *  header icon reads from the same restrained palette. */
const TILE: Record<SectionTone, string> = {
  blue: "bg-[#e8f0f9] text-[#3b6ea5]",
  emerald: "bg-[#ECFDF5] text-[#059669]",
  amber: "bg-[#FFFBEB] text-[#B45309]",
  review: "bg-[#EFF6FF] text-[#2563EB]",
  gray: "bg-[#f1f5f9] text-[#64748b]",
};

export interface CustomerPortalSectionProps {
  /** Section heading — consistent sentence-case (e.g. "Order Overview",
   *  "Housing Accommodation", "My Documents", "Your Submitted Assessment"). */
  title: string;
  /** Remix icon class for the header tile. */
  icon: string;
  /** Icon-tile tone. Default "blue" (structure). */
  tone?: SectionTone;
  /** Optional right-aligned slot — a status chip, count, order id, or date. */
  headerRight?: ReactNode;
  /** Principal-outcome sections (letter delivery, housing workflow) get a stronger
   *  blue border + slightly deeper shadow while keeping the identical header/title. */
  prominent?: boolean;
  /** Anchor id (e.g. the assessment scroll target). */
  id?: string;
  /** Extra classes on the outer shell (margins, etc.). */
  className?: string;
  /** Override the default body padding when a section needs edge-to-edge content. */
  bodyClassName?: string;
  children: ReactNode;
}

export default function CustomerPortalSection({
  title,
  icon,
  tone = "blue",
  headerRight,
  prominent = false,
  id,
  className = "",
  bodyClassName = "px-4 sm:px-5 py-4",
  children,
}: CustomerPortalSectionProps) {
  return (
    <section
      id={id}
      className={`rounded-2xl bg-white overflow-hidden ${
        prominent
          ? "border-2 border-[#c3d6ea] shadow-[0_10px_30px_-20px_rgba(30,58,95,0.35)]"
          : "border border-[#e2e8f0] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      } ${className}`}
    >
      {/* Consistent header: fixed icon tile + one title treatment + right slot.
          Same padding / height feel across every section. */}
      <header className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-[#eef2f7]">
        <span className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${TILE[tone]}`}>
          <i className={`${icon} text-sm`}></i>
        </span>
        <h2 className="text-sm font-extrabold text-[#1e3a5f] tracking-tight leading-tight min-w-0 truncate">
          {title}
        </h2>
        {headerRight != null && (
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">{headerRight}</div>
        )}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Small status chip used in section headers — one shape, tone-driven colors. */
export function SectionStatusChip({
  tone,
  icon,
  label,
  spin = false,
}: {
  tone: SectionTone;
  icon: string;
  label: string;
  spin?: boolean;
}) {
  const CLS: Record<SectionTone, string> = {
    blue: "bg-[#e8f0f9] text-[#1e3a5f]",
    emerald: "bg-[#ECFDF5] text-[#059669]",
    amber: "bg-[#FFFBEB] text-[#B45309]",
    review: "bg-[#EFF6FF] text-[#2563EB]",
    gray: "bg-[#f1f5f9] text-[#475569]",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${CLS[tone]}`}>
      <i className={`${icon} ${spin ? "animate-spin" : ""} text-[11px]`}></i>
      {label}
    </span>
  );
}
