// OrderDocumentReviewPanel — the Admin release gate for provider documents.
//
// PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §9–§11.
//
// A provider-submitted final customer-facing document is now held at
// `pending_admin_approval` and is invisible to the customer until an employee
// previews it here and either releases it or sends it back for correction.
//
// This is a self-contained panel mounted once at the top of the existing
// Documents tab — it fetches its own rows and owns its own state, so it adds no
// coupling to the (merge-frozen) order modal beyond a single mount.
//
// Nothing here is the security boundary. The buttons call admin-review-document,
// which performs the transition through a SECURITY DEFINER RPC on the caller's
// own JWT: the approver recorded is auth.uid(), a provider's token fails
// is_admin_staff(), and only ONE call can ever transition the row.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import MissingProfessionalContactNotice from "@/components/feature/MissingProfessionalContactNotice";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

/** The review checklist an employee confirms before a document can be released.
 *  Guidance only — deliberately NOT a database table (§9). */
const REVIEW_CHECKLIST = [
  "Customer name and spelling",
  "Correct ESA or PSD document",
  "Correct pet names",
  "All pets included",
  "Correct date",
  "Provider signature",
  "Provider credentials",
  "No template or customer mismatch",
];

const DOC_TYPE_LABEL: Record<string, string> = {
  esa_letter: "ESA Letter",
  psd_letter: "PSD Letter",
  signed_letter: "Signed Letter",
  letter: "Letter",
  housing_completed: "Completed Housing Accommodation Form",
};

export interface ReviewDoc {
  id: string;
  label: string;
  doc_type: string;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
  review_status: string;
  submitted_at: string | null;
  correction_note: string | null;
  reviewed_at: string | null;
  footer_injected: boolean | null;
}

interface Props {
  orderId: string;
  confirmationId: string;
  /** Opens a document by order_documents id through the modal's signed-URL helper. */
  onOpenDocument: (documentId: string, preferOriginal: boolean) => void;
  /** Called after a real transition so the parent can refresh docs / order state. */
  onReviewed?: () => void;
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(+d)) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function OrderDocumentReviewPanel({
  orderId, confirmationId, onOpenDocument, onReviewed,
}: Props) {
  const [docs, setDocs] = useState<ReviewDoc[]>([]);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [providerUserId, setProviderUserId] = useState<string | null>(null);
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("order_documents")
      .select("id, label, doc_type, uploaded_at, uploaded_by, notes, review_status, submitted_at, correction_note, reviewed_at, footer_injected")
      .eq("order_id", orderId)
      .in("review_status", ["pending_admin_approval", "needs_correction"])
      .order("uploaded_at", { ascending: false });
    const rows = (data ?? []) as ReviewDoc[];
    setDocs(rows);

    if (rows.length > 0) {
      const { data: vers } = await supabase
        .from("order_document_versions")
        .select("order_document_id, version")
        .in("order_document_id", rows.map((r) => r.id));
      const map: Record<string, number> = {};
      ((vers ?? []) as { order_document_id: string; version: number }[]).forEach((v) => {
        if (v.order_document_id) map[v.order_document_id] = v.version;
      });
      setVersions(map);
    } else {
      setVersions({});
    }

    // PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001 — resolve the issuing
    // provider only when an eligible FINAL ESA/PSD letter is actually in review.
    // An RA, intake, notary or customer upload must not surface the notice.
    if (rows.some((r) => r.doc_type === "esa_letter" || r.doc_type === "psd_letter")) {
      const { data: ord } = await supabase
        .from("orders")
        .select("doctor_user_id")
        .eq("id", orderId)
        .maybeSingle();
      setProviderUserId((ord as { doctor_user_id: string | null } | null)?.doctor_user_id ?? null);
    } else {
      setProviderUserId(null);
    }

    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const callReview = async (
    documentId: string,
    action: "approve" | "request_correction",
    correctionNote?: string,
  ) => {
    setBusyId(documentId);
    setMsg(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setMsg({ ok: false, text: "Your session expired — sign in again to review documents." });
        setBusyId(null);
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-review-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId, action, note: correctionNote }),
      });
      const result = await res.json() as {
        ok?: boolean; error?: string; message?: string; transitioned?: boolean;
      };
      if (!result.ok) {
        setMsg({ ok: false, text: result.error ?? "Review action failed." });
      } else {
        setMsg({ ok: true, text: result.message ?? "Done." });
        setCorrectionFor(null);
        setNote("");
        await load();
        if (result.transitioned) onReviewed?.();
      }
    } catch {
      setMsg({ ok: false, text: "Network error — please try again." });
    }
    setBusyId(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-5 mb-4 flex items-center gap-2">
        <i className="ri-loader-4-line animate-spin text-[#3b6ea5]"></i>
        <span className="text-sm text-gray-500">Checking for documents awaiting review…</span>
      </div>
    );
  }

  if (docs.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {/* Informational only — never blocks approve / request-correction. */}
      <MissingProfessionalContactNotice providerUserId={providerUserId} />

      {docs.map((doc) => {
        const isPending = doc.review_status === "pending_admin_approval";
        const isBusy = busyId === doc.id;
        const isConfirmed = confirmed.has(doc.id);
        const version = versions[doc.id];
        const typeLabel = DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type.replace(/_/g, " ");

        return (
          <div
            key={doc.id}
            className={`bg-white rounded-xl border-2 overflow-hidden ${
              isPending ? "border-amber-300" : "border-orange-300"
            }`}
          >
            {/* Header */}
            <div className={`px-4 py-3 flex flex-wrap items-center gap-2 ${isPending ? "bg-amber-50" : "bg-orange-50"}`}>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  isPending ? "bg-amber-500 text-white" : "bg-orange-500 text-white"
                }`}
              >
                <i className={isPending ? "ri-time-line" : "ri-edit-2-line"}></i>
                {isPending ? "Pending Admin Approval" : "Correction Requested"}
              </span>
              <span className="text-xs font-bold text-gray-700">{typeLabel}</span>
              {version !== undefined && (
                <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                  v{version}
                </span>
              )}
              <span className="ml-auto text-xs text-gray-500">
                Not visible to the customer
              </span>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
                <Row label="Document" value={doc.label} />
                <Row label="Provider" value={doc.uploaded_by ?? "—"} />
                <Row label="Submitted" value={fmt(doc.submitted_at ?? doc.uploaded_at)} />
                <Row label="Order" value={confirmationId} mono />
              </div>

              {doc.notes && (
                <p className="text-xs text-gray-600 italic mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Provider note: “{doc.notes}”
                </p>
              )}

              {doc.review_status === "needs_correction" && doc.correction_note && (
                <div className="mb-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] font-bold text-orange-700 uppercase tracking-wider mb-1">
                    Correction requested {doc.reviewed_at ? `· ${fmt(doc.reviewed_at)}` : ""}
                  </p>
                  <p className="text-xs text-gray-700">{doc.correction_note}</p>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Waiting for the provider to upload a corrected version.
                  </p>
                </div>
              )}

              {/* Preview */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => onOpenDocument(doc.id, false)}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer"
                >
                  <i className="ri-eye-line"></i>
                  {doc.footer_injected ? "Preview Verified PDF" : "Preview Document"}
                </button>
                {doc.footer_injected && (
                  <button
                    type="button"
                    onClick={() => onOpenDocument(doc.id, true)}
                    className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer"
                  >
                    <i className="ri-file-line"></i>Open Original
                  </button>
                )}
              </div>

              {isPending && (
                <>
                  {/* Checklist */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-3">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Check before releasing
                    </p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                      {REVIEW_CHECKLIST.map((item) => (
                        <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <i className="ri-checkbox-blank-circle-line text-[8px] mt-1.5 text-gray-400"></i>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <label className="flex items-start gap-2 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isConfirmed}
                      onChange={(e) =>
                        setConfirmed((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(doc.id);
                          else next.delete(doc.id);
                          return next;
                        })
                      }
                      className="mt-0.5 w-4 h-4 accent-[#3b6ea5] cursor-pointer flex-shrink-0"
                    />
                    <span className="text-xs text-gray-700">
                      I reviewed the customer name, product type, pet details, date, signature and
                      credentials.
                    </span>
                  </label>

                  {correctionFor === doc.id ? (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
                      <label className="block text-[11px] font-bold text-orange-700 uppercase tracking-wider mb-1.5">
                        What needs fixing?
                      </label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                        rows={3}
                        placeholder="e.g. Pet name is spelled Bela, should be Bella."
                        className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none"
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-gray-500">{note.trim().length}/1000 · minimum 5</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setCorrectionFor(null); setNote(""); }}
                            className="whitespace-nowrap px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || note.trim().length < 5}
                            onClick={() => callReview(doc.id, "request_correction", note.trim())}
                            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isBusy ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-send-plane-line"></i>}
                            Send to Provider
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy || !isConfirmed}
                        onClick={() => callReview(doc.id, "approve")}
                        title={!isConfirmed ? "Confirm your review first" : undefined}
                        className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isBusy ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-shield-check-line"></i>}
                        Approve &amp; Deliver
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => { setCorrectionFor(doc.id); setNote(""); }}
                        className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-white border border-orange-300 text-orange-600 text-sm font-bold rounded-lg hover:bg-orange-50 disabled:opacity-50 cursor-pointer"
                      >
                        <i className="ri-edit-2-line"></i>Needs Correction
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {msg && (
        <p
          className={`text-xs font-semibold flex items-start gap-1.5 ${
            msg.ok ? "text-[#1a5c4f]" : "text-red-600"
          }`}
        >
          <i className={`${msg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"} mt-0.5`}></i>
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-[11px] text-gray-400 uppercase tracking-wider flex-shrink-0 w-20">{label}</span>
      <span className={`text-xs text-gray-800 font-semibold truncate ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
