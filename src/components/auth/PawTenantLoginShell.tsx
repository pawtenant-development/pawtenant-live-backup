import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface LoginBullet {
  icon: string;
  title: string;
  subtitle: string;
}

interface PawTenantLoginShellProps {
  /** Left brand-panel headline + supporting copy. */
  brandTitle: string;
  brandSubtitle: string;
  /** Small label beside the logo (e.g. "ESA Letter Platform"). */
  brandTagline?: string;
  /** Glass feature cards in the brand panel. */
  bullets: LoginBullet[];
  /** Pill at the bottom of the brand panel. */
  bottomBadge?: { icon: string; text: string };
  /** Right form-panel header. */
  badge?: string;
  heading: string;
  subheading?: string;
  /** Small contextual link in the top-right (e.g. Customer Portal / Get ESA Letter). */
  topRight?: { to: string; label: string; icon?: string };
  /** Full-width notice above the form (e.g. session-expired banner). */
  banner?: ReactNode;
  /** Small print under the form (e.g. role-routing hint). */
  roleHint?: string;
  /** Optional footer node under the form (e.g. support link). */
  footer?: ReactNode;
  /** The form itself. */
  children: ReactNode;
}

/**
 * PawTenantLoginShell — shared, presentational FULL-VIEWPORT split-screen layout
 * for the staff/provider and customer login pages. It is the page, not a card:
 * the left PawTenant brand panel and the right form panel each fill their half
 * of the viewport edge-to-edge — no cream frame, no rounded outer wrapper, no
 * empty margin around a centered box.
 *
 * All auth/redirect logic, form state, and handlers stay in the page components,
 * which pass their form as `children`. No business logic lives here.
 *
 * Layout (flexbox so both panels stretch to the full viewport height):
 *   - lg+  : two side-by-side panels — brand ~55% / form ~45% — both 100svh tall.
 *   - <lg  : stacked — the brand panel becomes a compact top hero (feature cards
 *            + bottom badge hidden) and the white form panel grows to fill the
 *            rest, so the form is reachable fast with no horizontal overflow.
 *
 * The logo is a clickable home link (→ /). The top-right contextual link
 * (Customer Portal / Get ESA Letter) sits in the form panel's top bar.
 */
export default function PawTenantLoginShell({
  brandTitle,
  brandSubtitle,
  brandTagline,
  bullets,
  bottomBadge,
  badge,
  heading,
  subheading,
  topRight,
  banner,
  roleHint,
  footer,
  children,
}: PawTenantLoginShellProps) {
  return (
    <div className="min-h-[100svh] w-full flex flex-col lg:flex-row bg-white overflow-hidden">
      {/* ── Left — brand hero (full-bleed) ── */}
      <div className="relative overflow-hidden w-full lg:w-[55%] lg:flex-shrink-0 bg-gradient-to-br from-[#0e3b34] via-[#155b50] to-[#1f8473] p-7 sm:p-10 lg:p-12 flex flex-col text-white">
        {/* decorative shapes (PawTenant teal + orange glows) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/[0.06]" />
          <div className="absolute top-1/4 -right-28 w-80 h-80 rounded-full bg-[#4ecdc4]/15 blur-2xl" />
          <div className="absolute -bottom-28 left-1/4 w-72 h-72 rounded-full bg-orange-400/15 blur-3xl" />
          <div className="absolute bottom-8 right-8 w-40 h-40 rounded-full bg-white/[0.05]" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          {/* logo — clickable home link */}
          <Link
            to="/"
            aria-label="PawTenant home"
            className="inline-flex items-center gap-3 self-start cursor-pointer group"
          >
            <img
              src="/assets/brand/pawtenant-logo-white-02.png"
              alt="PawTenant"
              className="h-9 lg:h-10 w-auto object-contain transition-opacity group-hover:opacity-90"
            />
            {brandTagline && (
              <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider text-white/55 border-l border-white/20 pl-3">
                {brandTagline}
              </span>
            )}
          </Link>

          {/* headline */}
          <div className="mt-8 lg:mt-12">
            <h2 className="text-2xl sm:text-3xl lg:text-[2.5rem] lg:leading-[1.08] font-extrabold tracking-tight">
              {brandTitle}
            </h2>
            <p className="mt-3 text-sm lg:text-[15px] text-white/65 leading-relaxed max-w-md">
              {brandSubtitle}
            </p>
          </div>

          {/* feature cards (desktop only) */}
          <ul className="mt-8 space-y-3 hidden lg:block">
            {bullets.map((b) => (
              <li
                key={b.title}
                className="flex items-start gap-3.5 rounded-2xl bg-white/[0.08] border border-white/10 backdrop-blur-sm px-4 py-3.5"
              >
                <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                  <i className={`${b.icon} text-orange-300 text-lg`}></i>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{b.title}</p>
                  <p className="text-xs text-white/55 mt-0.5 leading-snug">{b.subtitle}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* bottom badge (desktop only — keeps the mobile hero compact) */}
          {bottomBadge && (
            <div className="hidden lg:block lg:mt-auto lg:pt-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-2 text-xs font-semibold text-white/85">
                <i className={`${bottomBadge.icon} text-[#5fe3d8]`}></i>
                {bottomBadge.text}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right — form panel (fills the rest of the viewport) ── */}
      <div className="relative w-full lg:w-[45%] flex-1 lg:flex-none flex flex-col bg-white">
        {/* top bar — contextual link (e.g. Customer Portal) */}
        {topRight && (
          <div className="flex items-center justify-end px-5 sm:px-8 lg:px-10 pt-6 sm:pt-7 lg:pt-9 flex-shrink-0">
            <Link
              to={topRight.to}
              className="whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-bold text-[#0f766e] hover:border-[#0f766e]/40 hover:text-[#0d5d57] shadow-sm transition-colors cursor-pointer"
            >
              {topRight.icon && <i className={topRight.icon}></i>}
              {topRight.label}
            </Link>
          </div>
        )}

        {/* form area — vertically centered */}
        <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 lg:px-10 py-8 sm:py-10">
          <div className="w-full max-w-sm mx-auto">
            {banner && <div className="mb-5">{banner}</div>}
            {badge && (
              <span className="inline-flex items-center gap-1.5 self-start bg-[#e6f5f1] text-[#0f766e] border border-[#bfe6dd] text-[11px] font-bold px-2.5 py-1 rounded-full mb-4">
                <i className="ri-shield-check-line"></i>
                {badge}
              </span>
            )}
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-[#10241f] tracking-tight">{heading}</h1>
            {subheading && <p className="mt-1.5 text-sm text-stone-500">{subheading}</p>}
            <div className="mt-6">{children}</div>
            {roleHint && (
              <p className="mt-5 text-[11px] leading-relaxed text-stone-400 border-t border-stone-100 pt-4">{roleHint}</p>
            )}
            {footer && <div className="mt-5">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
