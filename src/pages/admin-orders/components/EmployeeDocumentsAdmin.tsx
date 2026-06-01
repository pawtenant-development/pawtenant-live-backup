import { useEffect, useRef, useState } from "react";
import {
  fetchEmployeeDocuments,
  uploadEmployeeDocument,
  getDocumentSignedUrl,
  deleteEmployeeDocument,
  validateDocument,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  VISIBILITY_LABEL,
  type EmployeeDocument,
  type DocumentType,
  type DocumentVisibility,
} from "../../../lib/employeeDocuments";

/**
 * Admin document manager for one employee (inside Team → Employee HR Profiles).
 * Owner/admin_manager only (DB RLS enforces). Private bucket; downloads use
 * short-lived signed URLs.
 */
export default function EmployeeDocumentsAdmin({ teamMemberId }: { teamMemberId: string }) {
  const [docs, setDocs] = useState<EmployeeDocument[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>("employment_contract");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<DocumentVisibility>("employee_and_admin");
  const [requiresAck, setRequiresAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setDocs(await fetchEmployeeDocuments(teamMemberId));
  }
  useEffect(() => {
    let cancelled = false;
    fetchEmployeeDocuments(teamMemberId).then((d) => { if (!cancelled) setDocs(d); });
    return () => { cancelled = true; };
  }, [teamMemberId]);

  function flash(ok: boolean, msg: string) {
    setToast({ ok, msg });
    window.setTimeout(() => setToast(null), 4000);
  }

  async function handleUpload() {
    if (busy) return;
    if (!file) { flash(false, "Choose a file first."); return; }
    const invalid = validateDocument(file);
    if (invalid) { flash(false, invalid); return; }
    if (!title.trim()) { flash(false, "Title is required."); return; }
    setBusy(true);
    const err = await uploadEmployeeDocument(teamMemberId, file, {
      document_type: docType,
      title: title.trim(),
      description: description.trim() || null,
      visibility,
      requires_acknowledgment: requiresAck,
    });
    if (err) {
      flash(false, err);
    } else {
      flash(true, "Document uploaded.");
      setFile(null); setTitle(""); setDescription(""); setRequiresAck(false);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    }
    setBusy(false);
  }

  async function handleOpen(doc: EmployeeDocument) {
    const url = await getDocumentSignedUrl(doc.file_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else flash(false, "Could not open document.");
  }

  async function handleDelete(doc: EmployeeDocument) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setBusy(true);
    const err = await deleteEmployeeDocument(doc);
    if (err) flash(false, err);
    else { flash(true, "Document deleted."); await load(); }
    setBusy(false);
  }

  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Documents</p>

      {/* Upload form */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">File (PDF / image / Word, ≤20MB)</span>
            <input ref={fileRef} type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs" />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">Type</span>
            <select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)}
              className="w-full rounded-lg border border-gray-200 px-2 h-9 text-sm bg-white">
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">Title</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 h-9 text-sm" />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">Description (optional)</span>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 h-9 text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">Visibility</span>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
              className="w-full rounded-lg border border-gray-200 px-2 h-9 text-sm bg-white">
              <option value="employee_and_admin">{VISIBILITY_LABEL.employee_and_admin}</option>
              <option value="admin_only">{VISIBILITY_LABEL.admin_only}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
            <span className="text-xs text-gray-600">Requires acknowledgment</span>
          </label>
        </div>
        <div className="mt-2.5 flex justify-end">
          <button type="button" onClick={handleUpload} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-60 px-3 py-2 text-xs font-bold text-white">
            {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-upload-2-line" />}
            Upload Document
          </button>
        </div>
      </div>

      {toast && (
        <div className={`mb-2 rounded-lg px-3 py-2 text-xs font-semibold ${toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          <i className={`mr-1 ${toast.ok ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`} />{toast.msg}
        </div>
      )}

      {/* List */}
      {docs === null ? (
        <p className="text-xs text-gray-400">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-gray-400">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2">
              <i className="ri-file-text-line text-gray-400 text-base shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 truncate">{d.title}</p>
                <p className="text-[10px] text-gray-400 truncate">
                  {DOCUMENT_TYPE_LABEL[d.document_type] ?? d.document_type} · {VISIBILITY_LABEL[d.visibility] ?? d.visibility}
                  {d.requires_acknowledgment ? (d.acknowledged_at ? " · Acknowledged" : " · Awaiting ack") : ""}
                </p>
              </div>
              <button type="button" onClick={() => handleOpen(d)} title="View / download"
                className="shrink-0 h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">
                <i className="ri-download-2-line" />
              </button>
              <button type="button" onClick={() => handleDelete(d)} title="Delete" disabled={busy}
                className="shrink-0 h-7 w-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-500 disabled:opacity-50">
                <i className="ri-delete-bin-line" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
