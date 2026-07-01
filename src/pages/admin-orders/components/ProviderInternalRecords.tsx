// ProviderInternalRecords — admin-only "Internal" tab inside ProviderDrawer.
// Internal provider documents (bank docs, contracts, verification proofs) +
// masked bank/payout details. NEVER visible to providers: tables and the
// private provider-internal bucket are RLS-gated to owner/admin_manager/
// finance (is_provider_records_admin()); the provider portal has no code
// path to these tables. Every upload/open/archive/save/reveal is audit-logged.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROVIDER_INTERNAL_CATEGORIES,
  listInternalDocuments,
  uploadInternalDocument,
  getInternalDocumentUrl,
  archiveInternalDocument,
  fetchBankDetails,
  saveBankDetails,
  logBankDetailsReveal,
  formatFileSize,
  type ProviderInternalDocument,
  type ProviderBankDetails,
} from "../../../lib/providerInternal";

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  PROVIDER_INTERNAL_CATEGORIES.map((c) => [c.value, c.label]),
);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  providerEmail: string;
  doctorProfileId: string | null;
}

export default function ProviderInternalRecords({ providerEmail, doctorProfileId }: Props) {
  const [docs, setDocs] = useState<ProviderInternalDocument[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [upCategory, setUpCategory] = useState("bank_payout_details");
  const [upTitle, setUpTitle] = useState("");
  const [upNotes, setUpNotes] = useState("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bank details
  const [bank, setBank] = useState<ProviderBankDetails | null | undefined>(null);
  const [bankRevealed, setBankRevealed] = useState(false);
  const [bankEditing, setBankEditing] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankErr, setBankErr] = useState("");
  const [bankForm, setBankForm] = useState({
    account_holder_name: "", bank_name: "", account_last4: "", payment_method: "", payment_notes: "",
  });

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([
      listInternalDocuments(providerEmail),
      fetchBankDetails(providerEmail),
    ]);
    if (d === null && b === undefined) {
      // RLS refused both reads → this admin's role isn't authorized.
      setBlocked(true);
      return;
    }
    setBlocked(false);
    setDocs(d ?? []);
    setBank(b === undefined ? null : b);
  }, [providerEmail]);

  useEffect(() => {
    setDocs(null);
    setBank(null);
    setBankRevealed(false);
    setBankEditing(false);
    setShowArchived(false);
    setError("");
    void load();
  }, [load]);

  async function handleUpload() {
    if (uploadBusy) return;
    if (!upTitle.trim()) { setUploadErr("A title is required."); return; }
    if (!upFile) { setUploadErr("Choose a file to upload."); return; }
    setUploadBusy(true);
    setUploadErr("");
    const res = await uploadInternalDocument({
      providerEmail,
      doctorProfileId,
      category: upCategory,
      title: upTitle,
      notes: upNotes,
      file: upFile,
    });
    setUploadBusy(false);
    if (!res.ok) { setUploadErr(res.error); return; }
    setUploadOpen(false);
    setUpTitle(""); setUpNotes(""); setUpFile(null); setUpCategory("bank_payout_details");
    await load();
  }

  async function handleOpen(docRow: ProviderInternalDocument) {
    setBusyId(docRow.id);
    setError("");
    const url = await getInternalDocumentUrl(docRow);
    setBusyId(null);
    if (!url) { setError("Could not create a secure link for this file."); return; }
    window.open(url, "_blank", "noopener");
  }

  async function handleArchive(docRow: ProviderInternalDocument, archive: boolean) {
    if (archive && !window.confirm(`Archive "${docRow.title}"? The file is kept privately and can be restored — nothing is deleted.`)) return;
    setBusyId(docRow.id);
    const err = await archiveInternalDocument(docRow, archive);
    setBusyId(null);
    if (err) { setError(err); return; }
    await load();
  }

  async function handleReveal() {
    setBankRevealed(true);
    void logBankDetailsReveal(providerEmail);
  }

  function openBankEditor() {
    setBankForm({
      account_holder_name: bank?.account_holder_name ?? "",
      bank_name: bank?.bank_name ?? "",
      account_last4: bank?.account_last4 ?? "",
      payment_method: bank?.payment_method ?? "",
      payment_notes: bank?.payment_notes ?? "",
    });
    setBankErr("");
    setBankEditing(true);
  }

  async function handleBankSave() {
    if (bankBusy) return;
    if (bankForm.account_last4 && !/^[0-9]{2,4}$/.test(bankForm.account_last4.trim())) {
      setBankErr("Last digits must be 2–4 numbers only (never store the full account number here).");
      return;
    }
    setBankBusy(true);
    setBankErr("");
    const err = await saveBankDetails({ providerEmail, doctorProfileId, ...bankForm });
    setBankBusy(false);
    if (err) { setBankErr(err); return; }
    setBankEditing(false);
    await load();
  }

  if (blocked) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-10 text-center">
        <div className="w-12 h-12 mx-auto flex items-center justify-center bg-gray-100 rounded-full mb-3">
          <i className="ri-lock-2-line text-gray-400 text-xl"></i>
        </div>
        <p className="text-sm font-bold text-gray-700">Restricted section</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
          Internal provider records (bank details, contracts, verification files) are limited to
          Owner, Admin and Finance roles.
        </p>
      </div>
    );
  }

  const visibleDocs = (docs ?? []).filter((d) => (showArchived ? d.status === "archived" : d.status === "active"));
  const archivedCount = (docs ?? []).filter((d) => d.status === "archived").length;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
      {/* Security banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800 leading-relaxed">
        <i className="ri-shield-keyhole-line mr-1" />
        <strong>Admin-only section.</strong> Nothing here is visible to the provider or in their portal.
        Files are stored in a private bucket and opened via short-lived secure links. All views,
        uploads and changes are audit-logged.
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          <i className="ri-error-warning-line mr-1" />{error}
        </div>
      )}

      {/* ── Bank / Payout Details ── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] rounded-lg">
              <i className="ri-bank-line text-[#1a5c4f] text-sm"></i>
            </div>
            <p className="text-xs font-extrabold text-gray-900">Bank / Payout Details</p>
          </div>
          {!bankEditing && (
            <button type="button" onClick={openBankEditor}
              className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-[#3b6ea5] border border-[#c9dcf0] bg-[#e8f0f9] rounded-lg hover:bg-[#dbe8f6] cursor-pointer">
              <i className="ri-pencil-line"></i>{bank ? "Edit" : "Add"}
            </button>
          )}
        </div>
        <div className="px-4 py-3">
          {bankEditing ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Account holder</span>
                  <input type="text" value={bankForm.account_holder_name}
                    onChange={(e) => setBankForm((p) => ({ ...p, account_holder_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2.5 h-8 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Bank name</span>
                  <input type="text" value={bankForm.bank_name}
                    onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2.5 h-8 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Account last 4 digits</span>
                  <input type="text" maxLength={4} value={bankForm.account_last4}
                    onChange={(e) => setBankForm((p) => ({ ...p, account_last4: e.target.value.replace(/[^0-9]/g, "") }))}
                    placeholder="e.g. 4821"
                    className="w-full rounded-lg border border-gray-200 px-2.5 h-8 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Payment method</span>
                  <input type="text" value={bankForm.payment_method}
                    onChange={(e) => setBankForm((p) => ({ ...p, payment_method: e.target.value }))}
                    placeholder="e.g. ACH, Wise, PayPal"
                    className="w-full rounded-lg border border-gray-200 px-2.5 h-8 text-xs" />
                </label>
              </div>
              <label className="block">
                <span className="block text-[10px] font-semibold text-gray-500 mb-1">Notes</span>
                <textarea value={bankForm.payment_notes} rows={2}
                  onChange={(e) => setBankForm((p) => ({ ...p, payment_notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs resize-y" />
              </label>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-[10px] text-gray-500 leading-relaxed">
                <i className="ri-information-line mr-1" />
                Only masked details are stored here (bank, holder, last 4, method). For full account /
                routing numbers, upload the provider&apos;s bank document below as an Internal Document —
                it stays in the private admin-only bucket.
              </div>
              {bankErr && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  <i className="ri-error-warning-line mr-1" />{bankErr}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" disabled={bankBusy} onClick={() => setBankEditing(false)}
                  className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer disabled:opacity-50">Cancel</button>
                <button type="button" disabled={bankBusy} onClick={handleBankSave}
                  className="px-3.5 py-1.5 text-[11px] font-bold text-white bg-[#1a5c4f] rounded-lg hover:bg-[#14493f] disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer">
                  {bankBusy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />}Save
                </button>
              </div>
            </div>
          ) : !bank ? (
            <p className="text-xs text-gray-400 py-1">No bank/payout details on file for this provider.</p>
          ) : bankRevealed ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <p><span className="text-gray-400 font-semibold">Holder:</span> <span className="text-gray-800 font-bold">{bank.account_holder_name || "—"}</span></p>
                <p><span className="text-gray-400 font-semibold">Bank:</span> <span className="text-gray-800 font-bold">{bank.bank_name || "—"}</span></p>
                <p><span className="text-gray-400 font-semibold">Account:</span> <span className="text-gray-800 font-bold font-mono">•••• {bank.account_last4 || "——"}</span></p>
                <p><span className="text-gray-400 font-semibold">Method:</span> <span className="text-gray-800 font-bold">{bank.payment_method || "—"}</span></p>
              </div>
              {bank.payment_notes && (
                <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-1.5">{bank.payment_notes}</p>
              )}
              <p className="text-[10px] text-gray-400">Updated {fmtDate(bank.updated_at)} · this view was audit-logged</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-600">
                <span className="font-bold">{bank.bank_name || "Bank"}</span>
                <span className="text-gray-400"> · {bank.account_holder_name || "holder on file"} · </span>
                <span className="font-mono font-bold">•••• {bank.account_last4 || "——"}</span>
                {bank.payment_method && <span className="text-gray-400"> · {bank.payment_method}</span>}
              </p>
              <button type="button" onClick={handleReveal}
                title="Reveals notes + full masked record. This action is audit-logged."
                className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-gray-600 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 cursor-pointer flex-shrink-0">
                <i className="ri-eye-line"></i>Reveal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Internal Documents ── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg">
              <i className="ri-folder-lock-line text-[#3b6ea5] text-sm"></i>
            </div>
            <p className="text-xs font-extrabold text-gray-900">Internal Documents</p>
            {archivedCount > 0 && (
              <button type="button" onClick={() => setShowArchived((v) => !v)}
                className={`whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${showArchived ? "bg-slate-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {showArchived ? "Viewing archived" : `Archived (${archivedCount})`}
              </button>
            )}
          </div>
          <button type="button" onClick={() => { setUploadOpen(true); setUploadErr(""); }}
            className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[#1a5c4f] rounded-lg hover:bg-[#14493f] cursor-pointer">
            <i className="ri-upload-2-line"></i>Upload Internal Document
          </button>
        </div>
        <div>
          {docs === null ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">Loading internal documents…</p>
          ) : visibleDocs.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">
              {showArchived ? "No archived internal documents." : "No internal documents yet. Bank documents, contracts and verification proofs uploaded here stay admin-only."}
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {visibleDocs.map((d) => (
                <div key={d.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0 mt-0.5">
                    <i className={`${d.category === "bank_payout_details" ? "ri-bank-line" : d.category === "contract" ? "ri-file-text-line" : d.category === "tax_form" ? "ri-file-list-3-line" : d.category === "payout_receipt" ? "ri-receipt-line" : "ri-file-shield-2-line"} text-gray-500 text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-gray-900 truncate">{d.title}</p>
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-extrabold rounded-full whitespace-nowrap">
                        {CATEGORY_LABEL[d.category] ?? d.category}
                      </span>
                      {d.status === "archived" && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-extrabold rounded-full">Archived</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {d.file_name ?? "file"}{d.file_size_bytes != null ? ` · ${formatFileSize(d.file_size_bytes)}` : ""} · {fmtDate(d.created_at)}
                      {d.uploaded_by_name ? ` · by ${d.uploaded_by_name}` : ""}
                    </p>
                    {d.notes && <p className="text-[11px] text-gray-500 mt-1">{d.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" disabled={busyId === d.id} onClick={() => void handleOpen(d)}
                      title="Open via a secure 5-minute link (audit-logged)"
                      className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#3b6ea5] hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                      {busyId === d.id ? <i className="ri-loader-4-line animate-spin text-sm" /> : <i className="ri-external-link-line text-sm" />}
                    </button>
                    {d.status === "active" ? (
                      <button type="button" disabled={busyId === d.id} onClick={() => void handleArchive(d, true)}
                        title="Archive (soft — restorable, never deleted)"
                        className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-slate-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                        <i className="ri-archive-line text-sm" />
                      </button>
                    ) : (
                      <button type="button" disabled={busyId === d.id} onClick={() => void handleArchive(d, false)}
                        title="Restore"
                        className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                        <i className="ri-inbox-unarchive-line text-sm" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!uploadBusy) setUploadOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-full bg-[#e8f0f9] flex items-center justify-center">
                <i className="ri-upload-2-line text-[#3b6ea5]" />
              </div>
              <h4 className="text-sm font-extrabold text-gray-900">Upload Internal Document</h4>
            </div>
            <p className="text-[11px] text-gray-500 mb-4">
              Visibility: <span className="font-bold text-gray-700">Admin only</span> (owner / admin / finance).
              The provider never sees this file.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Category</span>
                <select value={upCategory} onChange={(e) => setUpCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 h-9 text-sm bg-white">
                  {PROVIDER_INTERNAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Title *</span>
                <input type="text" value={upTitle} onChange={(e) => { setUpTitle(e.target.value); if (uploadErr) setUploadErr(""); }}
                  placeholder="e.g. Bank details form — June 2026"
                  className="w-full rounded-lg border border-gray-200 px-2.5 h-9 text-sm" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Notes (optional)</span>
                <textarea value={upNotes} onChange={(e) => setUpNotes(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm resize-y" />
              </label>
              <div>
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">File *</span>
                <input ref={fileInputRef} type="file" onChange={(e) => { setUpFile(e.target.files?.[0] ?? null); if (uploadErr) setUploadErr(""); }}
                  className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f0f9] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#3b6ea5] file:cursor-pointer cursor-pointer" />
                {upFile && <p className="text-[10px] text-gray-400 mt-1">{upFile.name} · {formatFileSize(upFile.size)}</p>}
              </div>
            </div>
            {uploadErr && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                <i className="ri-error-warning-line mr-1" />{uploadErr}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" disabled={uploadBusy} onClick={() => setUploadOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50 cursor-pointer">Cancel</button>
              <button type="button" disabled={uploadBusy || !upTitle.trim() || !upFile} onClick={() => void handleUpload()}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1a5c4f] rounded-lg hover:bg-[#14493f] disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer">
                {uploadBusy ? (<><i className="ri-loader-4-line animate-spin" /> Uploading…</>) : (<><i className="ri-upload-2-line" /> Upload</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
