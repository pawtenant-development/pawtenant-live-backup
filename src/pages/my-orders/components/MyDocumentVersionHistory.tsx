// MyDocumentVersionHistory — collapsed "Previous document versions" list for the
// customer portal My Documents card
// (ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §11).
//
// The CURRENT document is already rendered by MyDocumentsCard via
// resolveCustomerDocuments(). This component adds ONLY the superseded history
// beneath it, so the existing active-document behaviour is untouched.
//
// Renders NOTHING when there is no superseded version — which is every legacy /
// pre-versioning order — so no order gains a broken or empty history section and
// nothing in the browser depends on the backfill having run.
//
// Read-only. Opening a historical file goes through the same
// openSecureDocument() signed-URL path as the current document, so no storage
// path or raw URL is ever exposed. RLS on order_document_versions already limits
// rows to the owning customer.
//
// Deliberately NOT shown: provider notes, verification repair metadata, payment
// evidence, entitlement evidence, Stripe identifiers, diagnosis.

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { openSecureDocument } from "@/lib/openSecureDocument";

interface Props { confirmationId: string }

interface HistoryRow {
  id: string;
  doc_type: string;
  version: number;
  superseded_at: string | null;
  generated_at: string | null;
  order_document_id: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  esa_letter: "ESA Letter",
  psd_letter: "PSD Letter",
  ra_letter: "Reasonable Accommodation Letter",
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MyDocumentVersionHistory({ confirmationId }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [open, setOpen] = useState(false);          // collapsed by default
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("order_document_versions")
        .select("id, doc_type, version, superseded_at, generated_at, order_document_id")
        .eq("confirmation_id", confirmationId)
        .eq("approval_status", "superseded")
        .order("version", { ascending: false });
      if (alive) setRows((data ?? []) as HistoryRow[]);
    })();
    return () => { alive = false; };
  }, [confirmationId]);

  // Legacy orders and orders that have never been revised render nothing.
  if (rows.length === 0) return null;

  const openHistorical = async (row: HistoryRow) => {
    setErr("");
    if (!row.order_document_id) {
      setErr("This version isn't available to open. Please contact support.");
      return;
    }
    setBusyId(row.id);
    const r = await openSecureDocument(row.order_document_id);
    if (!r.ok) setErr(r.error ?? "Couldn't open this document. Please try again.");
    setBusyId(null);
  };

  return (
    <div className="mt-3 border-t border-[#e2e8f0] pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
      >
        <span className="text-[11px] font-bold text-[#5F6B7A] group-hover:text-[#1e3a5f]">
          Previous document versions
          <span className="ml-1.5 font-semibold text-[#94a3b8]">({rows.length})</span>
        </span>
        <i className={`ri-arrow-down-s-line text-[#94a3b8] text-base transition-transform ${open ? "rotate-180" : ""}`}></i>
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-bold text-[#172033] break-words">
                      {DOC_TYPE_LABELS[row.doc_type] ?? "Document"}
                    </p>
                    <span className="text-[10px] font-semibold text-[#64748b]">v{row.version}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 bg-[#e2e8f0] text-[#475569] rounded-full text-[9px] font-bold uppercase tracking-wide">
                      Superseded
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    Replaced {fmt(row.superseded_at) || "—"}
                  </p>
                </div>
                {row.order_document_id && (
                  <button
                    type="button"
                    onClick={() => openHistorical(row)}
                    disabled={busyId !== null}
                    className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-lg hover:bg-gray-200 disabled:opacity-60 cursor-pointer transition-colors"
                  >
                    {busyId === row.id
                      ? <i className="ri-loader-4-line animate-spin"></i>
                      : <i className="ri-eye-line"></i>}
                    Open
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {err && (
        <p className="text-[11px] text-red-600 mt-2 flex items-center gap-1">
          <i className="ri-error-warning-line flex-shrink-0"></i>
          <span>{err}</span>
        </p>
      )}
    </div>
  );
}
