import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import {
  fetchEmployeeDocuments,
  getDocumentSignedUrl,
  acknowledgeMyDocument,
  DOCUMENT_TYPE_LABEL,
  type EmployeeDocument,
} from "../../../lib/employeeDocuments";

/**
 * Employee self-view of their own documents (employee_and_admin only; RLS
 * enforces — admin_only docs and other employees' docs are never returned).
 * Downloads use short-lived signed URLs. Employees can acknowledge required docs.
 */
export default function MyDocumentsPanel({ teamMemberId }: { teamMemberId: string }) {
  const [docs, setDocs] = useState<EmployeeDocument[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setDocs(await fetchEmployeeDocuments(teamMemberId));
  }
  useEffect(() => {
    let cancelled = false;
    fetchEmployeeDocuments(teamMemberId).then((d) => { if (!cancelled) setDocs(d); });
    return () => { cancelled = true; };
  }, [teamMemberId]);

  async function handleOpen(doc: EmployeeDocument) {
    setError(null);
    const url = await getDocumentSignedUrl(doc.file_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("Could not open document. Please try again.");
  }

  async function handleAck(doc: EmployeeDocument) {
    setBusyId(doc.id);
    setError(null);
    const err = await acknowledgeMyDocument(doc.id);
    if (err) setError(err);
    else await load();
    setBusyId(null);
  }

  return (
    <Widget icon="ri-folder-shield-2-line" title="My Documents">
      {docs === null ? (
        <p className="text-xs text-stone-400">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-stone-500">No documents shared with you yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const needsAck = d.requires_acknowledgment && !d.acknowledged_at;
            return (
              <li key={d.id} className="flex items-center gap-2.5 rounded-lg border border-stone-200 px-3 py-2">
                <i className="ri-file-text-line text-stone-400 text-base shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-stone-800 truncate">{d.title}</p>
                  <p className="text-[10px] text-stone-400 truncate">
                    {DOCUMENT_TYPE_LABEL[d.document_type] ?? d.document_type} · {new Date(d.created_at).toLocaleDateString()}
                    {d.requires_acknowledgment ? (d.acknowledged_at ? " · Acknowledged" : " · Action needed") : ""}
                  </p>
                </div>
                {needsAck ? (
                  <button type="button" onClick={() => handleAck(d)} disabled={busyId === d.id}
                    className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                    {busyId === d.id ? "…" : "Acknowledge"}
                  </button>
                ) : null}
                <button type="button" onClick={() => handleOpen(d)} title="View / download"
                  className="shrink-0 h-7 w-7 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-500">
                  <i className="ri-download-2-line" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error ? <p className="mt-2 text-[11px] text-rose-600">{error}</p> : null}
    </Widget>
  );
}
