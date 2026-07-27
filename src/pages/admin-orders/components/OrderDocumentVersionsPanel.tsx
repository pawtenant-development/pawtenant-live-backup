// OrderDocumentVersionsPanel — admin read-only "Document Version History" panel
// for the order detail Documents tab
// (ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §10).
//
// Mounted as a single isolated component inside the FROZEN OrderDetailModal
// Documents tab (approved "isolated component mount"). Fully self-contained: it
// fetches its own rows from order_document_versions, so it never depends on
// which columns the frozen modal's order query selected.
//
// READ ONLY BY DESIGN. There is no activate, no edit, no delete. Versions are
// immutable and are only ever written by the service-role SECURITY DEFINER
// functions (create_document_version / activate_document_version /
// fail_document_version). This panel cannot mutate anything.
//
// Shows the ACTIVE version first, then superseded/failed versions beneath it.
// Carries NO payment data, NO entitlement evidence, NO diagnosis and NO
// assessment answers — only document lifecycle facts.
//
// Legacy orders (no version rows) render NOTHING, so the existing document
// display on pre-versioning orders is untouched.

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface Props {
  orderId: string;
  /** Opens a document by order_documents id via the modal's signed-URL helper. */
  onOpenFile: (documentId: string) => void;
}

interface DocVersion {
  id: string;
  doc_type: string;
  version: number;
  letter_id: string | null;
  provider_id: string | null;
  approval_status: string;
  is_active: boolean;
  revision_reason: string | null;
  generation_error: string | null;
  generated_at: string | null;
  activated_at: string | null;
  superseded_at: string | null;
  order_document_id: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  esa_letter: "ESA Letter",
  psd_letter: "PSD Letter",
  ra_letter: "Reasonable Accommodation Letter",
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ v }: { v: DocVersion }) {
  if (v.is_active && v.approval_status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0">
        <i className="ri-checkbox-circle-line text-[11px]"></i>Active
      </span>
    );
  }
  if (v.approval_status === "superseded") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0">
        <i className="ri-history-line text-[11px]"></i>Superseded
      </span>
    );
  }
  if (v.approval_status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0">
        <i className="ri-error-warning-line text-[11px]"></i>Generation failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0">
      <i className="ri-time-line text-[11px]"></i>Pending
    </span>
  );
}

export default function OrderDocumentVersionsPanel({ orderId, onOpenFile }: Props) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("order_document_versions")
        .select(
          "id, doc_type, version, letter_id, provider_id, approval_status, is_active, revision_reason, generation_error, generated_at, activated_at, superseded_at, order_document_id",
        )
        .eq("order_id", orderId)
        // active first, then newest version down
        .order("is_active", { ascending: false })
        .order("doc_type", { ascending: true })
        .order("version", { ascending: false });
      if (!alive) return;
      const rows = (data ?? []) as DocVersion[];
      setVersions(rows);

      const ids = [...new Set(rows.map((r) => r.provider_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("doctor_profiles").select("id, full_name").in("id", ids);
        if (!alive) return;
        setProviderNames(Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "—"])));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [orderId]);

  // Legacy / pre-versioning orders: render nothing so the existing document
  // display is preserved exactly. No broken empty history panel.
  if (loading || versions.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 flex items-center justify-center bg-indigo-50 rounded-lg shrink-0">
          <i className="ri-stack-line text-indigo-600 text-base"></i>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800">Document Version History</p>
          <p className="text-[11px] text-gray-500">
            Read-only. Every version is immutable and keeps its own verification ID.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className={`rounded-lg border p-3 ${
              v.is_active ? "border-green-200 bg-green-50/40" : "border-gray-200 bg-gray-50/60"
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-800">
                    {DOC_TYPE_LABELS[v.doc_type] ?? v.doc_type}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-500">v{v.version}</span>
                  <StatusBadge v={v} />
                </div>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Generated</p>
                    <p className="text-[11px] font-semibold text-gray-700">{fmt(v.generated_at)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {v.is_active ? "Activated" : "Superseded"}
                    </p>
                    <p className="text-[11px] font-semibold text-gray-700">
                      {fmt(v.is_active ? v.activated_at : v.superseded_at)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Provider</p>
                    <p className="text-[11px] font-semibold text-gray-700 truncate">
                      {(v.provider_id && providerNames[v.provider_id]) || "—"}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-3 min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Verification ID</p>
                    <p className="text-[11px] font-mono font-semibold text-gray-700 break-all">
                      {v.letter_id ?? "— (no verification issued for this version)"}
                    </p>
                  </div>
                </div>
                {v.revision_reason && (
                  <p className="text-[11px] text-gray-500 italic mt-1.5 break-words">{v.revision_reason}</p>
                )}
                {v.generation_error && (
                  <p className="text-[11px] text-red-700 mt-1.5 break-words">{v.generation_error}</p>
                )}
              </div>

              {v.order_document_id && (
                <button
                  type="button"
                  onClick={() => onOpenFile(v.order_document_id as string)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <i className="ri-external-link-line text-[12px]"></i>View
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
