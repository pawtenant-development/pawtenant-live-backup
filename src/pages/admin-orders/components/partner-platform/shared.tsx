// Partner Platform — shared primitives.
// PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// One place for the vocabulary every subtab agrees on: the organization row
// shape, environment naming (UI says "Sandbox"/"Live", the database says
// 'sandbox'/'production'), money formatting, status badges, the copy button
// and the ONE-TIME secret reveal dialog.
//
// SECRET DISCIPLINE (the rule the reveal dialog exists to enforce):
//   A freshly minted API key or webhook signing secret lives ONLY in React
//   state while the dialog is open. It is never written to localStorage,
//   sessionStorage, a URL, an analytics call or a log; closing the dialog
//   drops the last reference. Downloads go through a Blob object URL that is
//   revoked immediately after the click.

import { useEffect, useState } from "react";

/** Full admin projection of a partner organization (RLS: is_chat_admin only). */
export interface PartnerOrg {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string | null;
  status: string; // draft | sandbox | active | paused | terminated
  production_enabled: boolean;
  billing_contact: { name?: string; email?: string } | null;
  technical_contact: { name?: string; email?: string } | null;
  support_owner: string | null;
  allowed_services: string[] | null;
  allowed_states: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  // PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001 — profile fields
  domain: string | null;
  domain_verified_at: string | null;
  intake_mode: "manual" | "api" | "both";
  default_communication_policy: "pawtenant_managed" | "partner_managed";
  default_document_policy: "pawtenant_branded" | "partner_neutral";
}

export const PARTNER_ORG_COLUMNS =
  "id, slug, display_name, legal_name, status, production_enabled, billing_contact, technical_contact, support_owner, allowed_services, allowed_states, notes, created_at, updated_at, " +
  "domain, domain_verified_at, intake_mode, default_communication_policy, default_document_policy";

export const INTAKE_MODE_LABELS: Record<PartnerOrg["intake_mode"], string> = {
  manual: "Manual (structured intake)",
  api: "API",
  both: "Manual + API",
};

/** A partner may receive manually uploaded orders. */
export const acceptsManualIntake = (o: Pick<PartnerOrg, "intake_mode" | "status">) =>
  (o.intake_mode === "manual" || o.intake_mode === "both") && (o.status === "sandbox" || o.status === "active");

/** The partner API's sandbox base URL — derived, never hardcoded per-env. */
export function partnerApiBaseUrl(): string {
  const root = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string) ?? "";
  return `${root.replace(/\/$/, "")}/functions/v1/partner-orders-v1`;
}

export const PARTNER_API_VERSION = "v1";

export const PARTNER_API_SCOPES = [
  { value: "orders:create", label: "orders:create — submit new orders and assessment revisions" },
  { value: "orders:read", label: "orders:read — read order status" },
  { value: "documents:read", label: "documents:read — retrieve approved documents" },
];

export const WEBHOOK_EVENT_TYPES = [
  "order.accepted", "order.provider_assigned", "order.additional_information_required",
  "order.correction_required", "order.document_approved", "order.completed",
  "order.document_ready", "order.cancelled", "invoice.issued", "invoice.paid",
  "billing.credit_issued", "test.ping",
];

export const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/** Plain-language organization state. */
export function orgStatusView(o: Pick<PartnerOrg, "status" | "production_enabled">): { label: string; tone: string } {
  if (o.production_enabled) return { label: "Live", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  switch (o.status) {
    case "sandbox": return { label: "Sandbox", tone: "bg-blue-50 text-blue-700 ring-blue-200" };
    case "active": return { label: "Live-approved", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
    case "paused": return { label: "Sandbox disabled", tone: "bg-amber-50 text-amber-800 ring-amber-200" };
    case "terminated": return { label: "Archived", tone: "bg-gray-100 text-gray-500 ring-gray-300" };
    default: return { label: "Draft", tone: "bg-gray-100 text-gray-600 ring-gray-300" };
  }
}

export function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <i className={copied ? "ri-check-line text-emerald-600" : "ri-file-copy-line"}></i>
      {copied ? "Copied" : label}
    </button>
  );
}

/** Section card with a title, optional subtitle and actions row. */
export function Section({
  title, subtitle, actions, children,
}: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/**
 * PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — progressive disclosure for
 * the Settings tab. A collapsed section shows only its title, subtitle and an
 * optional summary chip; the content is mounted only while open, so heavy
 * panels do not load until the operator asks for them.
 */
export function CollapsibleSection({
  title, subtitle, summary, defaultOpen = false, tone = "default", children,
}: {
  title: string; subtitle?: string; summary?: React.ReactNode; defaultOpen?: boolean;
  tone?: "default" | "technical" | "history"; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClass = tone === "technical"
    ? "border-blue-200" : tone === "history" ? "border-gray-300 border-dashed" : "border-gray-200";
  return (
    <div className={`rounded-xl border bg-white ${toneClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {title}
            {tone === "technical" && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Technical</span>}
            {tone === "history" && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Read-only history</span>}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary}
          <i className={`ri-arrow-down-s-line text-lg text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}></i>
        </div>
      </button>
      {open && <div className="border-t border-gray-100 px-4 py-4">{children}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-6 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/**
 * ONE-TIME secret reveal.
 *
 * Shown exactly once, immediately after the server mints a credential. The
 * secret exists only in the parent's state; closing calls onClose which MUST
 * drop it. There is deliberately no way to reopen this dialog — the server
 * keeps only hash/verification material and can never show the value again.
 */
export function SecretRevealModal({
  title, secretLabel, secret, extraRows = [], downloadName, downloadBody, onClose,
}: {
  title: string;
  secretLabel: string;
  secret: string;
  /** Non-secret companion identifiers (key id, endpoint URL, …). */
  extraRows?: { label: string; value: string }[];
  downloadName: string;
  /** Full text of the credentials download (built by the caller). */
  downloadBody: string;
  onClose: () => void;
}) {
  const [ackClose, setAckClose] = useState(false);

  const download = () => {
    const blob = new Blob([downloadBody], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden></div>
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
            <i className="ri-key-2-line text-lg text-amber-700"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">
              This is the <strong>only time</strong> the full {secretLabel} will be shown.
              Copy it or download it now — after this dialog closes it cannot be viewed
              again, only revoked or rotated.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {extraRows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{r.label}</p>
                <p className="break-all font-mono text-xs text-gray-800">{r.value}</p>
              </div>
              <CopyButton value={r.value} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{secretLabel}</p>
              <p className="break-all font-mono text-xs text-amber-900">{secret}</p>
            </div>
            <CopyButton value={secret} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <i className="ri-download-2-line"></i> Download credentials
          </button>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={ackClose} onChange={(e) => setAckClose(e.target.checked)} />
            I saved the {secretLabel}
          </label>
        </div>

        <button
          type="button"
          disabled={!ackClose}
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Close — the {secretLabel} will not be shown again
        </button>
      </div>
    </div>
  );
}

/** Confirmation dialog for sensitive actions. */
export function ConfirmDialog({
  title, body, confirmLabel, tone = "danger", onConfirm, onCancel,
}: {
  title: string; body: string; confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden></div>
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Success / error notice line used by every tab. */
export function Notice({ notice, error }: { notice: string; error: string }) {
  if (!notice && !error) return null;
  return (
    <>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
    </>
  );
}

/** Debounce helper for search inputs. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
