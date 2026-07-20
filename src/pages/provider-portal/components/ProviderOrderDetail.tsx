// ProviderOrderDetail — Full order view for providers
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { openSecureDocument, downloadSecureDocument } from "../../../lib/openSecureDocument";
import SharedNotesPanel from "../../../components/feature/SharedNotesPanel";
import {
  LOGO_URL as ASSESSMENT_LOGO,
  STATE_NAMES,
  QUESTIONNAIRE_ITEMS,
  PetInfo,
  resolveLabel,
  formatDob,
  formatSubmitDate,
  buildPrintHTML,
} from "../../admin-orders/components/assessmentUtils";
import PSDAssessmentView from "../../admin-orders/components/PSDAssessmentView";

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  status: string;
  doctor_status: string | null;
  doctor_user_id: string | null;
  price: number | null;
  payment_intent_id: string | null;
  delivery_speed: string | null;
  selected_provider: string | null;
  assessment_answers: Record<string, unknown> | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  created_at: string;
  letter_type?: string | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
  addon_services?: string[] | null;
  letter_id?: string | null;
  letter_issue_date?: string | null;
  letter_expiry_date?: string | null;
  // RA bundle (PACKAGE-RA-LETTER-BUNDLE-001)
  package_key?: string | null;
  package_display_name?: string | null;
  includes_reasonable_accommodation_letter?: boolean | null;
  additional_documentation_status?: string | null;
  // Customer preferred contact time (CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001)
  preferred_provider_contact_date?: string | null;
  preferred_provider_contact_window?: string | null;
  preferred_provider_contact_note?: string | null;
  preferred_provider_contact_timezone?: string | null;
}

const CONTACT_WINDOW_LABEL: Record<string, string> = {
  morning: "Morning (8am–12pm)",
  afternoon: "Afternoon (12pm–5pm)",
  evening: "Evening (5pm–8pm)",
  any: "Any time",
};

// ─── PSD order detection helper ───────────────────────────────────────────────
function isPSDOrder(order: Pick<Order, "letter_type" | "confirmation_id">): boolean {
  return order.letter_type === "psd" || order.confirmation_id.includes("-PSD");
}

interface OrderDocument {
  id: string;
  label: string;
  doc_type: string;
  file_url: string;
  uploaded_by: string;
  uploaded_at: string;
  sent_to_customer: boolean;
}

// ── Queue item for multi-file upload ─────────────────────────────────────────
interface QueueItem {
  id: string;
  file: File | null;
  url: string;
  label: string;
  docType: string;
  uploading: boolean;
  error: string | null;
  done: boolean;
}

interface ProviderOrderDetailProps {
  order: Order;
  providerUserId: string;
  providerName: string;
  onClose: () => void;
  onOrderUpdated: (updated: Partial<Order> & { id: string }) => void;
  readOnly?: boolean; // When true, disables all interactive actions (admin preview mode)
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const DOCTOR_STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending Review",
  in_review: "In Review",
  approved: "Approved",
  letter_sent: "Letter Issued",
  patient_notified: "Completed",
  thirty_day_reissue: "30-Day Reissue",
};

const DOCTOR_STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  in_review: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  letter_sent: "bg-[#e8f0f9] text-[#2c5282]",
  patient_notified: "bg-emerald-100 text-emerald-700",
  thirty_day_reissue: "bg-orange-100 text-orange-700",
};

type Section = "overview" | "assessment" | "upload" | "notes";

export default function ProviderOrderDetail({
  order: initialOrder,
  providerUserId,
  providerName,
  onClose,
  onOrderUpdated,
  readOnly = false,
}: ProviderOrderDetailProps) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [section, setSection] = useState<Section>("overview");

  // isPSDOrder is the canonical product detector (drives labels + copy).
  const orderIsPsd = isPSDOrder(initialOrder);

  // Provider note carried on the letter submission; submitted flag gates the
  // "order completed" banner. (The legacy single-file upload state was removed
  // along with its dead handlers — uploads now stream through the queue below.)
  const [providerNote, setProviderNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Multi-file queue
  const [fileQueue, setFileQueue] = useState<QueueItem[]>([]);
  const [submittingQueue, setSubmittingQueue] = useState(false);
  const [queueMsg, setQueueMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Confirmation popup before submitting
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Completed Housing Accommodation form uploader — a SEPARATE document class from
  // the ESA/PSD letter. It receives NO verification ID / footer and does NOT
  // complete the base ESA/PSD letter. Kept separate from the letter queue on purpose.
  const [housingFile, setHousingFile] = useState<File | null>(null);
  const [housingUploading, setHousingUploading] = useState(false);
  const [housingMsg, setHousingMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Transient error toast for secure document open/download failures.
  const [docMsg, setDocMsg] = useState<string | null>(null);

  // In-Review status update
  const [markingInReview, setMarkingInReview] = useState(false);
  const [inReviewMsg, setInReviewMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Reject order state ────────────────────────────────────────────────────
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectMsg, setRejectMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Uploaded docs for this order
  const [uploadedDocs, setUploadedDocs] = useState<OrderDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Additional Documentation ($50 add-on) requests for this order. The provider
  // can read these via RLS (assigned-doctor SELECT policy). A paid request means
  // the customer paid for extra documentation and the case needs provider action.
  const [addonRequests, setAddonRequests] = useState<Array<{ id: string; status: string; amount_cents: number; created_at: string; paid_at: string | null }>>([]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true);
    const { data } = await supabase
      .from("order_documents")
      .select("id, label, doc_type, file_url, uploaded_by, uploaded_at, sent_to_customer")
      .eq("order_id", order.id)
      .order("uploaded_at", { ascending: false });
    setUploadedDocs((data as OrderDocument[]) ?? []);
    setLoadingDocs(false);
  }, [order.id]);

  const loadAddonRequests = useCallback(async () => {
    const { data } = await supabase
      .from("order_additional_documentation_requests")
      .select("id, status, amount_cents, created_at, paid_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false });
    setAddonRequests((data as Array<{ id: string; status: string; amount_cents: number; created_at: string; paid_at: string | null }>) ?? []);
  }, [order.id]);

  useEffect(() => {
    loadDocs();
    loadAddonRequests();
  }, [loadDocs, loadAddonRequests]);

  const handleMarkInReview = async () => {
    setMarkingInReview(true);
    setInReviewMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-update-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          newDoctorStatus: "in_review",
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) {
        const updated = { ...order, doctor_status: "in_review" };
        setOrder(updated);
        onOrderUpdated({ id: order.id, doctor_status: "in_review" });
        setInReviewMsg({ ok: true, text: "Status updated to In Review." });
        setTimeout(() => setInReviewMsg(null), 3000);
      } else {
        setInReviewMsg({ ok: false, text: result.error ?? "Failed to update status." });
      }
    } catch {
      setInReviewMsg({ ok: false, text: "Network error. Please try again." });
    }
    setMarkingInReview(false);
  };

  const handleRejectOrder = async () => {
    if (rejectionReason.trim().length < 5) {
      setRejectMsg({ ok: false, text: "Please provide a reason (at least 5 characters)." });
      return;
    }
    setRejecting(true);
    setRejectMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-reject-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          rejectionReason: rejectionReason.trim(),
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; message?: string };
      if (result.ok) {
        setRejectMsg({ ok: true, text: result.message ?? "Order rejected. Admin has been notified." });
        const updated = { ...order, doctor_status: "provider_rejected", status: "processing" };
        setOrder(updated);
        onOrderUpdated({ id: order.id, doctor_status: "provider_rejected", status: "processing" });
        setShowRejectModal(false);
        setRejectionReason("");
        // Close the modal after a short delay
        setTimeout(() => onClose(), 2500);
      } else {
        setRejectMsg({ ok: false, text: result.error ?? "Rejection failed. Please try again." });
      }
    } catch {
      setRejectMsg({ ok: false, text: "Network error. Please check your connection." });
    }
    setRejecting(false);
  };

  // RA-PROVIDER-DOCUMENT-WORKFLOW-RELEASE-BLOCKERS-001: the legacy single-file
  // upload handlers (client-side storage write to provider-letters) were removed.
  // All provider letter uploads now go through the multi-file queue below, which
  // streams the file to the provider-submit-letter edge function — the file is
  // stored in the private provider-letters bucket SERVER-SIDE via the service
  // role (after the assignment check), so the client never writes to storage.

  // RA-ADMIN-VISIBILITY-STORAGE-HARDENING-LIVE-001: open a submitted document via
  // a fresh signed URL from get-document-signed-url — required now that the
  // provider-letters bucket is PRIVATE (raw file_url links 404). The assigned
  // provider is authorized per-order by that function; unrelated providers are
  // denied. Opens a tab synchronously so the popup blocker doesn't fire.
  const openDoc = async (documentId: string) => {
    const r = await openSecureDocument(documentId);
    if (!r.ok) setDocMsg(r.error ?? "Could not open the document. Please try again.");
  };
  const downloadDoc = async (documentId: string, filename?: string) => {
    const r = await downloadSecureDocument(documentId, filename);
    if (!r.ok) setDocMsg(r.error ?? "Could not download the document. Please try again.");
  };

  // ── Add files to queue ──────────────────────────────────────────────────────
  const addFilesToQueue = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const newItems: QueueItem[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      url: "",
      label: f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
      docType: isPSDOrder(order) ? "psd_letter" : "esa_letter",
      uploading: false,
      error: null,
      done: false,
    }));
    setFileQueue((prev) => [...prev, ...newItems]);
  };

  const removeQueueItem = (id: string) => {
    setFileQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQueueItem = (id: string, patch: Partial<QueueItem>) => {
    setFileQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  // ── Add a URL-only item to queue ────────────────────────────────────────────
  const addUrlItem = () => {
    setFileQueue((prev) => [...prev, {
      id: `url-${Date.now()}`,
      file: null,
      url: "",
      label: "Additional Document",
      // The letter queue only submits the ESA/PSD letter (product-derived). Housing
      // forms use the dedicated uploader in the Housing Accommodation section.
      docType: isPSDOrder(order) ? "psd_letter" : "esa_letter",
      uploading: false,
      error: null,
      done: false,
    }]);
  };

  // ── Submit all queued items ─────────────────────────────────────────────────
  const handleSubmitQueue = async () => {
    if (fileQueue.length === 0) return;
    setSubmittingQueue(true);
    setQueueMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? SUPABASE_KEY;
    let successCount = 0;
    let failCount = 0;
    for (const item of fileQueue) {
      if (item.done) continue;
      try {
        updateQueueItem(item.id, { uploading: true, error: null });
        let res: Response;
        if (item.file) {
          // Preferred path: stream the file to provider-submit-letter, which
          // stores it in the private provider-letters bucket via the service role
          // (after verifying assignment). No client-side storage write, so the
          // upload can never hit the client RLS path.
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("confirmationId", order.confirmation_id);
          fd.append("documentLabel", item.label.trim() || "Document");
          fd.append("docType", item.docType);
          if (providerNote.trim()) fd.append("providerNote", providerNote.trim());
          res = await fetch(`${SUPABASE_URL}/functions/v1/provider-submit-letter`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
            body: fd,
          });
        } else {
          // External / Drive-link item: legacy JSON body.
          if (!item.url.trim()) {
            updateQueueItem(item.id, { error: "URL is required", uploading: false });
            failCount++;
            continue;
          }
          res = await fetch(`${SUPABASE_URL}/functions/v1/provider-submit-letter`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_KEY,
            },
            body: JSON.stringify({
              confirmationId: order.confirmation_id,
              documentUrl: item.url.trim(),
              documentLabel: item.label.trim() || "Document",
              docType: item.docType,
              providerNote: providerNote.trim() || null,
            }),
          });
        }
        const result = await res.json() as { ok: boolean; error?: string };
        if (result.ok) {
          updateQueueItem(item.id, { done: true, uploading: false });
          successCount++;
          // Order goes straight to patient_notified + completed
          const updatedOrder = {
            ...order,
            doctor_status: "patient_notified",
            status: "completed",
            patient_notification_sent_at: new Date().toISOString(),
          };
          setOrder(updatedOrder);
          onOrderUpdated({ id: order.id, doctor_status: "patient_notified", status: "completed" });
        } else {
          updateQueueItem(item.id, { error: result.error ?? "Submission failed", uploading: false });
          failCount++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        updateQueueItem(item.id, { error: msg, uploading: false });
        failCount++;
      }
    }
    setSubmittingQueue(false);
    if (failCount === 0) {
      setQueueMsg({ ok: true, text: `${successCount} document${successCount !== 1 ? "s" : ""} submitted! Order marked as completed and patient has been notified.` });
      setSubmitted(true);
      loadDocs();
    } else {
      setQueueMsg({ ok: false, text: `${successCount} submitted, ${failCount} failed. Fix the errors and retry.` });
    }
  };

  // ── Upload the COMPLETED Housing Accommodation form (separate class) ──────────
  // Streams the completed/signed landlord form to provider-submit-letter with
  // doc_type "housing_completed": the backend stores it privately, marks the RA /
  // add-on workflow complete, and — critically — mints NO verification ID, injects
  // NO footer, and does NOT complete the ESA/PSD letter lifecycle.
  const handleUploadHousingForm = async () => {
    if (!housingFile) return;
    setHousingUploading(true);
    setHousingMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const fd = new FormData();
      fd.append("file", housingFile);
      fd.append("confirmationId", order.confirmation_id);
      fd.append("documentLabel", "Completed Housing Accommodation Form");
      fd.append("docType", "housing_completed");
      if (providerNote.trim()) fd.append("providerNote", providerNote.trim());
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-submit-letter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
        body: fd,
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) {
        setHousingMsg({ ok: true, text: "Completed Housing Accommodation form uploaded and shared with the customer." });
        setHousingFile(null);
        // Reflect RA-workflow completion locally — NO letter-lifecycle change.
        setOrder((o) => ({ ...o, additional_documentation_status: "completed" }));
        onOrderUpdated({ id: order.id, additional_documentation_status: "completed" });
        await loadDocs();
      } else {
        setHousingMsg({ ok: false, text: result.error ?? "Upload failed" });
      }
    } catch (e) {
      setHousingMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setHousingUploading(false);
    }
  };

  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
  const initials = fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const doctorStatus = order.doctor_status ?? "pending_review";
  const assessmentAnswers = order.assessment_answers as Record<string, unknown> | null;
  const assessmentCount = assessmentAnswers ? Object.keys(assessmentAnswers).length : 0;
  const isLetterSubmitted = doctorStatus === "letter_sent" || doctorStatus === "patient_notified";
  const isThirtyDayReissue = doctorStatus === "thirty_day_reissue";
  // REFUND-ONLY-OPERATIONAL: only operational cancellation locks the provider —
  // Refund Only (partial OR full) keeps the case active. Never key on refund fields.
  const isRefunded = order.status === "cancelled" || order.status === "refunded";
  const isRejected = doctorStatus === "provider_rejected";

  // ── Document taxonomy (ORDER-PAYMENT-GATING-RA-DOCUMENT-TAXONOMY-INTAKE-PORTAL-001) ──
  // Three distinct classes, never mixed:
  //   • customerForms       — doc_type "customer_upload": the customer's Housing
  //     Accommodation / landlord SOURCE form (reference material for the provider).
  //   • housingCompletedDocs — doc_type "housing_completed": the provider's COMPLETED
  //     Housing Accommodation form (returned to the customer; NO verification ID).
  //   • providerDocs        — the ESA/PSD LETTERS only (the clinical deliverable).
  const customerForms = uploadedDocs.filter((d) => d.doc_type === "customer_upload");
  const housingCompletedDocs = uploadedDocs.filter((d) => d.doc_type === "housing_completed");
  const providerDocs = uploadedDocs.filter((d) => d.doc_type !== "customer_upload" && d.doc_type !== "housing_completed");

  // Shared "completed Housing form" block — the dedicated upload action (distinct
  // from the ESA/PSD letter submission) plus a read-only list of completed forms.
  // Rendered inside both the paid $50 add-on section and the Combo RA section.
  const renderHousingCompletion = () => {
    if (readOnly && housingCompletedDocs.length === 0) return null;
    return (
      <div className="mt-3 pt-3 border-t border-emerald-200/70">
        <p className="text-xs font-bold text-emerald-800 mb-1.5 flex items-center gap-1.5">
          <i className="ri-file-upload-line"></i>Completed Housing Accommodation form
        </p>
        {housingCompletedDocs.length > 0 ? (
          <ul className="space-y-1.5 mb-2">
            {housingCompletedDocs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 bg-white border border-emerald-100 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  <i className="ri-file-check-line text-emerald-600 flex-shrink-0"></i>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-800 truncate">{d.label}</span>
                    {d.uploaded_at && <span className="block text-[10px] text-gray-400">Completed {fmtDate(d.uploaded_at)}</span>}
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => openDoc(d.id)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                    <i className="ri-eye-line"></i>Open
                  </button>
                  <button type="button" onClick={() => downloadDoc(d.id, d.label)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                    <i className="ri-download-2-line"></i>Download
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          !readOnly && (
            <p className="text-xs text-gray-600 mb-2">
              Upload the completed / signed version of the customer&apos;s form. It is returned to the customer as a
              Housing Accommodation document — <strong>not</strong> the ESA/PSD letter, and it receives <strong>no</strong> verification ID.
            </p>
          )
        )}
        {!readOnly && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                <i className="ri-attachment-2"></i>{housingFile ? "Change file" : "Choose completed form"}
                <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0] ?? null; setHousingFile(f); setHousingMsg(null); }} />
              </label>
              {housingFile && <span className="text-xs text-gray-500 truncate max-w-[160px]">{housingFile.name}</span>}
              <button type="button" disabled={!housingFile || housingUploading} onClick={handleUploadHousingForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                <i className="ri-upload-cloud-line"></i>{housingUploading ? "Uploading…" : "Upload completed form"}
              </button>
            </div>
            {housingMsg && (
              <p className={`text-xs mt-2 flex items-center gap-1 font-semibold ${housingMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
                <i className={housingMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{housingMsg.text}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  // Format date helper
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {docMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] max-w-sm w-[90%] bg-red-600 text-white text-xs font-semibold rounded-lg shadow-lg px-4 py-3 flex items-start gap-2">
          <i className="ri-error-warning-line mt-0.5 flex-shrink-0"></i>
          <span className="flex-1">{docMsg}</span>
          <button type="button" onClick={() => setDocMsg(null)} className="cursor-pointer opacity-80 hover:opacity-100 flex-shrink-0"><i className="ri-close-line"></i></button>
        </div>
      )}
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-11 h-11 flex items-center justify-center bg-[#e8f0f9] rounded-full text-[#2c5282] text-base font-extrabold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-gray-900">{fullName}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${DOCTOR_STATUS_COLOR[doctorStatus] ?? "bg-gray-100 text-gray-500"}`}>
                {DOCTOR_STATUS_LABEL[doctorStatus] ?? doctorStatus}
              </span>
              {isRejected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                  <i className="ri-close-circle-fill" style={{ fontSize: "10px" }}></i>Rejected
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              <span className="font-mono">{order.confirmation_id}</span>
              {" · "}
              {order.state ?? "—"}
              {" · "}
              Assigned {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors flex-shrink-0">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-100 bg-gray-50/60 flex-shrink-0 overflow-x-auto">
          {([
            { key: "overview" as Section, label: "Case Overview", icon: "ri-layout-grid-line" },
            { key: "assessment" as Section, label: `Assessment${assessmentCount > 0 ? ` (${assessmentCount})` : ""}`, icon: "ri-questionnaire-line" },
            { key: "notes" as Section, label: "Notes", icon: "ri-chat-3-line" },
            { key: "upload" as Section, label: isLetterSubmitted ? "Documents ✓" : "Upload Letter", icon: isLetterSubmitted ? "ri-file-check-line" : "ri-upload-cloud-line" },
          ]).map((tab) => (
            <button key={tab.key} type="button" onClick={() => setSection(tab.key)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${section === tab.key ? "bg-[#2c5282] text-white" : "text-gray-500 hover:bg-white"}`}>
              <i className={tab.icon}></i>{tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── OVERVIEW ── */}
          {section === "overview" && (
            <div className="p-6 space-y-5">

              {/* Rejected banner */}
              {isRejected && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                    <i className="ri-close-circle-fill text-red-600 text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-red-800 mb-1">You Rejected This Order</p>
                    <p className="text-sm text-red-700 leading-relaxed">
                      This order has been sent back to admin for reassignment. The patient was not notified.
                    </p>
                  </div>
                </div>
              )}

              {/* Reject feedback message */}
              {rejectMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${rejectMsg.ok ? "bg-[#e8f0f9] border-[#b8cce4] text-[#2c5282]" : "bg-red-50 border-red-200 text-red-700"}`}>
                  <i className={rejectMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                  {rejectMsg.text}
                </div>
              )}

              {/* 30-Day Reissue Banner */}
              {isThirtyDayReissue && (
                <div className="bg-orange-50 border-2 border-orange-300 rounded-xl px-5 py-4 flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-100 rounded-xl flex-shrink-0">
                    <i className="ri-time-fill text-orange-600 text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-orange-800 mb-1">30-Day Period Completed</p>
                    <p className="text-sm text-orange-700 leading-relaxed">
                      Please issue the <strong>official letter</strong> for this order. The 30-day evaluation period is over — upload and submit the final official letter using the &ldquo;Upload Letter&rdquo; tab above.
                    </p>
                  </div>
                </div>
              )}

              {/* Patient essentials */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Patient Information</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Full Name", value: fullName },
                    { label: "Email", value: order.email },
                    { label: "Phone", value: order.phone ?? "—" },
                    { label: "State", value: order.state ?? "—" },
                    { label: "Order ID", value: order.confirmation_id, mono: true },
                    { label: "Assigned Date", value: new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                    { label: "Delivery Speed", value: order.delivery_speed ?? "—" },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                      <p className={`text-sm font-semibold text-gray-900 break-all ${item.mono ? "font-mono text-xs" : ""}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Customer preferred contact time (read-only) ── */}
              {(order.preferred_provider_contact_window || order.preferred_provider_contact_date || order.preferred_provider_contact_note) && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 flex items-center justify-center bg-indigo-100 rounded-lg flex-shrink-0">
                      <i className="ri-calendar-schedule-line text-indigo-600 text-sm"></i>
                    </div>
                    <p className="text-xs font-extrabold text-indigo-700 uppercase tracking-widest">Customer Preferred Contact Time</p>
                    <span className="ml-auto text-[10px] font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">Preference</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {order.preferred_provider_contact_window && (
                      <div>
                        <p className="text-xs text-indigo-400 mb-0.5">Best time</p>
                        <p className="text-sm font-semibold text-indigo-900">{CONTACT_WINDOW_LABEL[order.preferred_provider_contact_window] ?? order.preferred_provider_contact_window}</p>
                      </div>
                    )}
                    {order.preferred_provider_contact_date && (
                      <div>
                        <p className="text-xs text-indigo-400 mb-0.5">Preferred date</p>
                        <p className="text-sm font-semibold text-indigo-900">{fmtDate(order.preferred_provider_contact_date)}</p>
                      </div>
                    )}
                    {order.preferred_provider_contact_timezone && (
                      <div>
                        <p className="text-xs text-indigo-400 mb-0.5">Time zone</p>
                        <p className="text-sm font-semibold text-indigo-900">{order.preferred_provider_contact_timezone}</p>
                      </div>
                    )}
                  </div>
                  {order.preferred_provider_contact_note && (
                    <p className="mt-2 text-xs text-indigo-800 bg-white border border-indigo-100 rounded-lg px-3 py-2 italic">&ldquo;{order.preferred_provider_contact_note}&rdquo;</p>
                  )}
                  <p className="mt-2 text-[11px] text-indigo-500 flex items-center gap-1">
                    <i className="ri-information-line"></i>Customer preference only — not a scheduled appointment. Review can continue regardless.
                  </p>
                </div>
              )}

              {/* ── Additional Services Required ── */}
              {(() => {
                const ADDON_LABELS: Record<string, { label: string; icon: string; note: string }> = {
                  zoom_call: { label: "Private Zoom Call Session", icon: "ri-video-chat-line", note: "Schedule a 30-min consultation with the patient" },
                  physical_mail: { label: "Physical Letter via Certified Mail", icon: "ri-mail-send-line", note: "Original signed copy must be mailed to the patient" },
                  landlord_letter: { label: "Verification Letter for Landlord", icon: "ri-building-line", note: "Prepare a separate letter addressed to the patient's landlord" },
                };
                const addons = Array.isArray(order.addon_services) ? order.addon_services : [];
                const additionalDocReq = (order.assessment_answers as Record<string, unknown> | null)?.additionalDocs as { types?: string[]; otherDescription?: string } | null | undefined;
                const extraDocTypes = (additionalDocReq?.types ?? []).filter((t) => t !== "ESA Letter");
                if (addons.length === 0 && extraDocTypes.length === 0) return null;
                return (
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                        <i className="ri-star-fill text-orange-500 text-sm"></i>
                      </div>
                      <p className="text-xs font-extrabold text-orange-700 uppercase tracking-widest">Additional Requirements for This Order</p>
                    </div>
                    <div className="space-y-2">
                      {addons.map((addon) => {
                        const cfg = ADDON_LABELS[addon] ?? { label: addon, icon: "ri-star-line", note: "" };
                        return (
                          <div key={addon} className="flex items-start gap-3 bg-white rounded-lg border border-orange-200 px-3 py-2.5">
                            <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                              <i className={`${cfg.icon} text-orange-600 text-sm`}></i>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900">{cfg.label}</p>
                              {cfg.note && <p className="text-xs text-orange-600 mt-0.5">{cfg.note}</p>}
                            </div>
                          </div>
                        );
                      })}
                      {extraDocTypes.map((docType) => (
                        <div key={docType} className="flex items-start gap-3 bg-white rounded-lg border border-orange-200 px-3 py-2.5">
                          <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5">
                            <i className="ri-file-add-line text-amber-600 text-sm"></i>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900">Additional Document: {docType}</p>
                            <p className="text-xs text-orange-600 mt-0.5">Patient requested this document — please prepare and upload alongside the ESA letter</p>
                          </div>
                        </div>
                      ))}
                      {additionalDocReq?.otherDescription && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                          <i className="ri-message-3-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
                          <p className="text-xs text-amber-800 italic">&ldquo;{additionalDocReq.otherDescription}&rdquo;</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-orange-500 mt-3 flex items-center gap-1">
                      <i className="ri-information-line"></i>
                      Please ensure all of the above are fulfilled before submitting.
                    </p>
                  </div>
                );
              })()}

              {/* ── Additional Documentation (paid $50 add-on) ── */}
              {(() => {
                const paid = addonRequests.find((r) => r.status === "paid");
                const pending = addonRequests.find((r) => r.status === "pending");
                const req = paid ?? pending;
                if (!req) return null;
                const customerUploads = customerForms;
                return (
                  <div className="bg-sky-50 border-2 border-sky-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 flex items-center justify-center bg-sky-100 rounded-lg flex-shrink-0">
                          <i className="ri-file-add-line text-sky-600 text-sm"></i>
                        </div>
                        <p className="text-xs font-extrabold text-sky-700 uppercase tracking-widest">Additional Documentation Request</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        <i className={paid ? "ri-checkbox-circle-fill" : "ri-time-line"}></i>
                        {paid ? "Add-on active" : "Not yet active"}
                      </span>
                    </div>
                    <p className="text-[11px] text-sky-700 font-semibold mb-2 flex items-center gap-1.5 flex-wrap">
                      {paid && <span className="inline-flex items-center gap-1 bg-sky-100 px-2 py-0.5 rounded-full"><i className="ri-price-tag-3-line"></i>Purchased Add-on</span>}
                      {req.created_at && <span className="text-sky-500 font-normal">requested {fmtDate(req.created_at)}</span>}
                    </p>
                    {paid ? (
                      <>
                        <p className="text-xs text-sky-800 leading-relaxed mb-2">
                          Additional documentation was authorized for this case and it has been reopened for your
                          review. Please review the uploaded form below and complete the requested documentation.
                        </p>
                        <p className="text-xs text-emerald-700 leading-relaxed mb-3 flex items-start gap-1.5">
                          <i className="ri-money-dollar-circle-line mt-0.5"></i>
                          <span>You earn your standard per-order rate for this additional documentation — it has been added to your earnings.</span>
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-amber-700 leading-relaxed mb-3">
                        This additional-documentation request isn&apos;t active yet. No action is needed until it becomes active.
                      </p>
                    )}
                    {paid && (
                      <div>
                        <p className="text-xs font-bold text-sky-800 mb-1.5 flex items-center gap-1.5">
                          <i className="ri-attachment-2"></i>Customer-uploaded form{customerUploads.length > 1 ? "s" : ""}
                        </p>
                        {customerUploads.length === 0 ? (
                          <div className="flex items-start gap-2 bg-white border border-sky-100 rounded-lg px-3 py-2.5">
                            <i className="ri-information-line text-sky-500 text-sm mt-0.5 flex-shrink-0"></i>
                            <p className="text-xs text-gray-600">No file uploaded yet. The patient may email the form, or upload it from their portal — check back shortly.</p>
                          </div>
                        ) : (
                          <ul className="space-y-1.5">
                            {customerUploads.map((d) => (
                              <li key={d.id} className="flex items-center justify-between gap-2 bg-white border border-sky-100 rounded-lg px-3 py-2">
                                <span className="flex items-center gap-2 min-w-0">
                                  <i className="ri-file-text-line text-sky-500 flex-shrink-0"></i>
                                  <span className="min-w-0">
                                    <span className="block text-xs font-semibold text-gray-800 truncate">{d.label}</span>
                                    {d.uploaded_at && <span className="block text-[10px] text-gray-400">Uploaded {fmtDate(d.uploaded_at)}</span>}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <button type="button" onClick={() => openDoc(d.id)} className="text-xs font-semibold text-sky-600 hover:text-sky-800 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                                    <i className="ri-eye-line"></i>Open
                                  </button>
                                  <button type="button" onClick={() => downloadDoc(d.id, d.label)} className="text-xs font-semibold text-sky-600 hover:text-sky-800 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                                    <i className="ri-download-2-line"></i>Download
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {paid && renderHousingCompletion()}
                  </div>
                );
              })()}

              {/* ── RA bundle — Reasonable Accommodation documentation (PACKAGE-RA-LETTER-BUNDLE-001) ── */}
              {order.includes_reasonable_accommodation_letter === true && (() => {
                const raUploads = customerForms;
                return (
                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
                          <i className="ri-file-shield-2-line text-emerald-600 text-sm"></i>
                        </div>
                        <p className="text-xs font-extrabold text-emerald-700 uppercase tracking-widest">Housing Accommodation</p>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                        <i className="ri-attachment-2"></i>{raUploads.length > 0 ? "Form provided" : "RA form may be needed"}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-semibold mb-2 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded-full"><i className="ri-checkbox-circle-fill"></i>Included with Combo Package</span>
                      {order.additional_documentation_status && <span className="text-emerald-500 font-normal">status: {String(order.additional_documentation_status).replace(/_/g, " ")}</span>}
                    </p>
                    <p className="text-xs text-emerald-700 leading-relaxed mb-3 flex items-start gap-1.5">
                      <i className="ri-money-dollar-circle-line mt-0.5"></i>
                      <span>This Housing Accommodation request is compensated at your standard per-case rate.</span>
                    </p>
                    <p className="text-xs text-emerald-800 leading-relaxed mb-3">
                      This order includes Reasonable Accommodation documentation support. If the customer uploaded a
                      landlord / property-manager / HOA / tenant-association form, review it below and complete it where
                      clinically appropriate. If no form is attached, continue the standard ESA/PSD review — an upload is
                      only required when the customer has an external form.
                    </p>
                    <p className="text-xs font-bold text-emerald-800 mb-1.5 flex items-center gap-1.5">
                      <i className="ri-attachment-2"></i>Customer-uploaded form{raUploads.length === 1 ? "" : "s"}
                    </p>
                    {raUploads.length === 0 ? (
                      <div className="flex items-start gap-2 bg-white border border-emerald-100 rounded-lg px-3 py-2.5">
                        <i className="ri-information-line text-emerald-500 text-sm mt-0.5 flex-shrink-0"></i>
                        <p className="text-xs text-gray-600">No file uploaded yet. The customer may not have a form to complete, or may upload it from their portal — check back if they do.</p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {raUploads.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-2 bg-white border border-emerald-100 rounded-lg px-3 py-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <i className="ri-file-text-line text-emerald-500 flex-shrink-0"></i>
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold text-gray-800 truncate">{d.label}</span>
                                {d.uploaded_at && <span className="block text-[10px] text-gray-400">Uploaded {fmtDate(d.uploaded_at)}</span>}
                              </span>
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              <button type="button" onClick={() => openDoc(d.id)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                                <i className="ri-eye-line"></i>Open
                              </button>
                              <button type="button" onClick={() => downloadDoc(d.id, d.label)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                                <i className="ri-download-2-line"></i>Download
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {renderHousingCompletion()}
                  </div>
                );
              })()}

              {/* Status card */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Case Status</p>

                {/* In-Review feedback */}
                {inReviewMsg && (
                  <div className={`mb-3 rounded-xl px-4 py-2.5 flex items-center gap-2 ${inReviewMsg.ok ? "bg-[#e8f0f9] border border-[#b8cce4]" : "bg-red-50 border border-red-200"}`}>
                    <i className={`text-sm flex-shrink-0 ${inReviewMsg.ok ? "ri-checkbox-circle-fill text-[#2c5282]" : "ri-error-warning-line text-red-500"}`}></i>
                    <p className={`text-xs font-semibold ${inReviewMsg.ok ? "text-[#2c5282]" : "text-red-700"}`}>{inReviewMsg.text}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap mb-4">
                  {[
                    { status: "pending_review", label: "Assigned" },
                    { status: "in_review", label: "In Review" },
                    { status: "patient_notified", label: "Completed" },
                  ].map((s) => (
                    <span key={s.status}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                        doctorStatus === s.status || (s.status === "patient_notified" && doctorStatus === "letter_sent")
                          ? "border-[#2c5282] bg-[#e8f0f9] text-[#2c5282]"
                          : "border-gray-200 text-gray-400"
                      }`}>
                      {(doctorStatus === s.status || (s.status === "patient_notified" && doctorStatus === "letter_sent")) && <i className="ri-checkbox-circle-fill text-[#2c5282]"></i>}
                      {s.label}
                    </span>
                  ))}
                </div>

                {/* In Review action */}
                {doctorStatus === "pending_review" && !readOnly && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <i className="ri-time-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
                      <div>
                        <p className="text-xs font-bold text-amber-800 mb-0.5">Ready to start this case?</p>
                        <p className="text-xs text-amber-700">Click to mark the case as &quot;In Review&quot; so admin knows you&apos;ve started.</p>
                      </div>
                    </div>
                    <button type="button" onClick={handleMarkInReview} disabled={markingInReview}
                      className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-extrabold rounded-lg hover:bg-amber-600 disabled:opacity-50 cursor-pointer transition-colors flex-shrink-0">
                      {markingInReview
                        ? <><i className="ri-loader-4-line animate-spin"></i>Updating...</>
                        : <><i className="ri-stethoscope-line"></i>Mark as In Review</>
                      }
                    </button>
                  </div>
                )}
                {doctorStatus === "pending_review" && readOnly && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
                    <i className="ri-time-line text-gray-400 text-sm flex-shrink-0"></i>
                    <p className="text-xs text-gray-500">Provider has not started this case yet</p>
                  </div>
                )}

                {(doctorStatus === "in_review" || isThirtyDayReissue) && (
                  <div className={`border rounded-xl px-4 py-3 flex items-center gap-2 ${isThirtyDayReissue ? "bg-orange-50 border-orange-200" : "bg-sky-50 border-sky-200"}`}>
                    <i className={`text-base flex-shrink-0 ${isThirtyDayReissue ? "ri-time-fill text-orange-600" : "ri-stethoscope-line text-sky-600"}`}></i>
                    <p className={`text-sm font-semibold ${isThirtyDayReissue ? "text-orange-700" : "text-sky-700"}`}>
                      {isThirtyDayReissue
                        ? "30-day period completed. Please upload and submit the official letter."
                        : "You're currently reviewing this case. Upload the completed letter when ready."
                      }
                    </p>
                  </div>
                )}

                {isLetterSubmitted && (
                  <div className="mt-3 space-y-2">
                    <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center gap-2">
                      <i className="ri-checkbox-circle-fill text-[#2c5282] text-base"></i>
                      <p className="text-sm font-semibold text-[#2c5282]">
                        Order completed! Documents submitted and the patient has been notified.
                      </p>
                    </div>

                    {/* ── Letter validity dates ── */}
                    {(order.letter_issue_date || order.letter_expiry_date) && (
                      <div className="bg-white border border-[#b8cce4] rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <i className="ri-calendar-check-line text-[#2c5282]"></i>
                          Letter Validity Period
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Issue Date</p>
                            <p className="text-sm font-bold text-gray-900">{fmtDate(order.letter_issue_date)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Expiry Date</p>
                            <p className="text-sm font-bold text-gray-900">{fmtDate(order.letter_expiry_date)}</p>
                            <p className="text-xs text-[#2c5282] mt-0.5 flex items-center gap-1">
                              <i className="ri-time-line"></i>Valid for 1 year
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Verification ID */}
                    {order.letter_id && (
                      <div className="bg-white border border-[#b8cce4] rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <i className="ri-shield-check-line text-[#2c5282]"></i>
                          Verification ID
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-bold text-[#2c5282] bg-[#e8f0f9] border border-[#b8cce4] px-3 py-1.5 rounded-lg select-all tracking-wider">
                            {order.letter_id}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                            <i className="ri-shield-check-line"></i>Valid
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                          <i className="ri-information-line"></i>
                          This ID is assigned to the letter you submitted. Landlords can use it to verify authenticity.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Provider-submitted letters — the provider's own ESA/PSD deliverables
                  ONLY. The customer's Housing Accommodation form (doc_type
                  "customer_upload") is a different document class shown in the Housing
                  Accommodation section above; it is excluded here so it never appears
                  twice. RA-PROVIDER-DOCUMENT-WORKFLOW-RELEASE-BLOCKERS-001. */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Provider Submitted Letters</p>
                {providerDocs.length === 0 && !order.signed_letter_url ? (
                  <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                    <i className="ri-information-line text-gray-400 text-sm mt-0.5 flex-shrink-0"></i>
                    <p className="text-xs text-gray-500">No letter submitted yet. Upload the completed {orderIsPsd ? "PSD" : "ESA"} letter from the Upload Letter tab.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {providerDocs.map((doc) => (
                      <button key={doc.id} type="button" onClick={() => openDoc(doc.id)}
                        className="w-full text-left whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl hover:bg-[#dce8f5] cursor-pointer transition-colors">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                          <i className="ri-file-check-line text-[#2c5282]"></i>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#2c5282]">{doc.label}</p>
                          <p className="text-xs text-[#2c5282]/60">
                            {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {doc.sent_to_customer && " · Sent to patient ✓"}
                          </p>
                        </div>
                        <i className="ri-external-link-line text-[#2c5282]/60"></i>
                      </button>
                    ))}
                    {order.signed_letter_url && !providerDocs.some((d) => d.file_url === order.signed_letter_url) && (
                      <a href={order.signed_letter_url} target="_blank" rel="noopener noreferrer"
                        className="whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl hover:bg-[#dce8f5] cursor-pointer transition-colors">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                          <i className="ri-shield-check-line text-[#2c5282]"></i>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#2c5282]">{orderIsPsd ? "Signed PSD Letter" : "Signed ESA Letter"}</p>
                          <p className="text-xs text-[#2c5282]/60">Your submitted document</p>
                        </div>
                        <i className="ri-external-link-line text-[#2c5282]/60"></i>
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Refunded banner */}
              {isRefunded && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
                    <i className="ri-refund-line text-red-600 text-base"></i>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-red-800">Order Refunded — No Further Action Required</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      This order has been refunded by admin. Document submission and assignment are locked.
                      {order.refund_amount != null && <span className="font-semibold"> Refund amount: ${order.refund_amount}.00</span>}
                    </p>
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => setSection("assessment")}
                  className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 cursor-pointer transition-colors">
                  <i className="ri-questionnaire-line"></i>View Assessment
                </button>
                {/* Submit Letter button */}
                {(!isLetterSubmitted || isThirtyDayReissue) && !isRefunded && !readOnly && !isRejected && (
                  <button type="button" onClick={() => setSection("upload")}
                    className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-xl cursor-pointer transition-colors ${isThirtyDayReissue ? "bg-orange-500 hover:bg-orange-600" : "bg-[#2c5282] hover:bg-[#1e3a5f]"}`}>
                    <i className="ri-upload-cloud-line"></i>{isThirtyDayReissue ? "Submit Official Letter" : "Submit Letter"}
                  </button>
                )}
                {/* Reject Order button — only for active, non-completed, non-refunded orders */}
                {!isLetterSubmitted && !isRefunded && !readOnly && !isRejected && (
                  <button type="button" onClick={() => setShowRejectModal(true)}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 bg-red-50 text-sm font-bold rounded-xl hover:bg-red-100 cursor-pointer transition-colors">
                    <i className="ri-close-circle-line"></i>Reject Order
                  </button>
                )}
                {!isPSDOrder(order) && assessmentCount > 0 && (
                  <button type="button"
                    onClick={() => {
                      const w = window.open("", "_blank");
                      if (!w) return;
                      w.document.write(buildPrintHTML(order as Parameters<typeof buildPrintHTML>[0]));
                      w.document.close();
                    }}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors">
                    <i className="ri-download-line"></i>Download PDF
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── ASSESSMENT ── */}
          {section === "assessment" && (
            <div className="p-6 space-y-5">
              {/* Action bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  {isPSDOrder(order) ? "PSD Psychiatric Service Dog Evaluation" : "ESA Intake Form"}
                </p>
                {/* Download PDF — ESA only */}
                {!isPSDOrder(order) && assessmentCount > 0 && (
                  <button type="button"
                    onClick={() => {
                      const w = window.open("", "_blank");
                      if (!w) return;
                      w.document.write(buildPrintHTML(order as Parameters<typeof buildPrintHTML>[0]));
                      w.document.close();
                    }}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors">
                    <i className="ri-download-line"></i>Download PDF
                  </button>
                )}
              </div>

              {/* ── PSD Assessment ── */}
              {isPSDOrder(order) ? (
                <PSDAssessmentView
                  audience="provider"
                  answers={order.assessment_answers}
                  orderInfo={{
                    firstName: order.first_name,
                    lastName: order.last_name,
                    email: order.email,
                    phone: order.phone,
                    state: order.state,
                    confirmationId: order.confirmation_id,
                    createdAt: order.created_at,
                  }}
                />
              ) : !assessmentAnswers || assessmentCount === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
                  <i className="ri-questionnaire-line text-gray-300 text-3xl block mb-2"></i>
                  <p className="text-sm font-bold text-gray-600">No assessment data available</p>
                </div>
              ) : (() => {
                const a = assessmentAnswers;
                const pets = (a.pets as PetInfo[]) ?? [];
                const dob = a.dob as string | undefined;
                const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "—";

                return (
                  <div className="space-y-7">
                    {/* Header */}
                    <div className="text-center bg-gray-50 rounded-2xl border border-gray-100 px-6 py-5">
                      <img src={ASSESSMENT_LOGO} alt="PawTenant" className="h-10 mx-auto mb-2 object-contain" />
                      <h2 className="text-xl font-extrabold text-orange-500 mb-1">PawTenant ESA Intake Form</h2>
                      <p className="text-xs text-gray-400 max-w-xs mx-auto">Submitted by patient for ESA evaluation</p>
                    </div>

                    {/* Owner Info */}
                    <div>
                      <h3 className="text-sm font-extrabold text-orange-500 pb-2 border-b-2 border-orange-500 mb-4">Patient &amp; Owner Information</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
                        {[
                          { label: "Full Name", value: fullName },
                          { label: "State", value: stateName },
                          { label: "Email", value: order.email },
                          { label: "Phone", value: order.phone || "—" },
                          ...(dob ? [{ label: "Date of Birth", value: formatDob(dob) }] : []),
                          { label: "Order ID", value: order.confirmation_id },
                          { label: "Submitted", value: formatSubmitDate(order.created_at) },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-start gap-2">
                            <span className="text-xs text-gray-500 w-28 flex-shrink-0 mt-0.5">{label}:</span>
                            <span className="text-sm font-semibold text-gray-900 break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pet Information */}
                    <div>
                      <h3 className="text-sm font-extrabold text-orange-500 pb-2 border-b-2 border-orange-500 mb-4">Pet Information</h3>
                      {pets.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm min-w-[400px]">
                            <thead>
                              <tr className="bg-orange-50">
                                {["Pet Name", "Type", "Age", "Breed", "Weight"].map((h) => (
                                  <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-orange-600 uppercase tracking-wide border-b border-orange-100">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pets.map((pet, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                  <td className="px-4 py-2.5 text-gray-900 font-semibold border-b border-gray-100">{pet.name || "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.type || "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.age ? `${pet.age} yr${pet.age !== "1" ? "s" : ""}` : "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.breed || "—"}</td>
                                  <td className="px-4 py-2.5 text-gray-700 border-b border-gray-100">{pet.weight ? `${pet.weight} lbs` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-sm text-gray-400">No pet information recorded.</p>}
                    </div>

                    {/* Questionnaire */}
                    <div>
                      <h3 className="text-sm font-extrabold text-orange-500 pb-2 border-b-2 border-orange-500 mb-4">Mental Health Questionnaire</h3>
                      <div className="space-y-4">
                        {QUESTIONNAIRE_ITEMS.map(({ label, key }, idx) => {
                          const val = a[key];
                          const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && (val as unknown[]).length === 0);
                          if (isEmpty) return null;
                          return (
                            <div key={key} className="flex gap-3">
                              <div className="w-6 h-6 flex items-center justify-center bg-orange-500 text-white text-xs font-bold rounded-full flex-shrink-0 mt-0.5">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-800 mb-1">{label}</p>
                                <p className="text-sm text-orange-600 font-semibold">{resolveLabel(key, val)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── UPLOAD ── */}
          {section === "upload" && (
            <div className="p-6 space-y-5">

              {/* ── READ-ONLY PREVIEW MODE ── */}
              {readOnly && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-5 py-6 flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 flex items-center justify-center bg-amber-100 rounded-full">
                    <i className="ri-eye-line text-amber-600 text-xl"></i>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-amber-800 mb-1">Read-Only Preview</p>
                    <p className="text-xs text-amber-600">Document upload is disabled in admin preview mode</p>
                  </div>
                </div>
              )}

              {/* ── REFUNDED: show lock banner + read-only doc list ONLY, nothing else ── */}
              {isRefunded ? (
                <>
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl px-5 py-10 flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 flex items-center justify-center bg-red-100 rounded-full">
                      <i className="ri-lock-2-line text-red-600 text-3xl"></i>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-red-800 mb-1.5">Upload Locked — Order Refunded</p>
                      <p className="text-xs text-red-600 leading-relaxed max-w-sm">
                        This order has been refunded. No new documents can be submitted.
                        {order.refund_amount != null && (
                          <span className="block mt-1 font-semibold">Refund amount: ${order.refund_amount}.00</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Read-only: show what was already submitted */}
                  {loadingDocs ? (
                    <div className="flex justify-center py-4"><i className="ri-loader-4-line animate-spin text-[#2c5282]"></i></div>
                  ) : providerDocs.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <i className="ri-file-check-line text-gray-400 text-sm"></i>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                          Previously Submitted ({providerDocs.length}) — Read Only
                        </p>
                      </div>
                      {providerDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 opacity-75">
                          <div className="w-8 h-8 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
                            <i className="ri-file-check-line text-violet-500 text-sm"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{doc.label}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {doc.sent_to_customer && <span className="ml-2 text-[#2c5282] font-semibold">· Sent to patient ✓</span>}
                            </p>
                          </div>
                          <button type="button" onClick={() => openDoc(doc.id)}
                            className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer">
                            <i className="ri-external-link-line"></i>Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* 30-Day reissue notice in upload tab */}
                  {isThirtyDayReissue && (
                    <div className="bg-orange-50 border-2 border-orange-300 rounded-xl px-4 py-3 flex items-start gap-3">
                      <i className="ri-time-fill text-orange-600 text-lg flex-shrink-0 mt-0.5"></i>
                      <div>
                        <p className="text-sm font-bold text-orange-800 mb-0.5">Official Letter Required</p>
                        <p className="text-xs text-orange-700">The 30-day evaluation period for this order is complete. Please upload and submit the official letter now.</p>
                      </div>
                    </div>
                  )}

                  {/* Already submitted banner */}
                  {isLetterSubmitted && !submitted && (
                    <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-start gap-3">
                      <i className="ri-checkbox-circle-fill text-[#2c5282] text-lg flex-shrink-0 mt-0.5"></i>
                      <div>
                        <p className="text-sm font-bold text-[#2c5282] mb-0.5">Order completed</p>
                        <p className="text-xs text-[#2c5282]/70">You can upload additional documents for this order below.</p>
                      </div>
                    </div>
                  )}

                  {/* Queue result */}
                  {queueMsg && (
                    <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${queueMsg.ok ? "bg-[#e8f0f9] border-[#b8cce4] text-[#2c5282]" : "bg-red-50 border-red-200 text-red-700"}`}>
                      <i className={queueMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                      {queueMsg.text}
                    </div>
                  )}

                  {/* Previously uploaded docs */}
                  {loadingDocs ? (
                    <div className="flex justify-center py-4"><i className="ri-loader-4-line animate-spin text-[#2c5282]"></i></div>
                  ) : providerDocs.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-4 py-3 border-b border-gray-100 bg-gray-50">
                        Previously Submitted ({providerDocs.length})
                      </p>
                      {providerDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                          <div className="w-8 h-8 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
                            <i className="ri-file-check-line text-violet-500 text-sm"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{doc.label}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {doc.sent_to_customer && <span className="ml-2 text-[#2c5282] font-semibold">· Sent to patient ✓</span>}
                            </p>
                          </div>
                          <button type="button" onClick={() => openDoc(doc.id)}
                            className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer">
                            <i className="ri-external-link-line"></i>Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Multi-file drop zone + file queue (hidden in read-only mode) ── */}
                  {!readOnly && (<>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {isLetterSubmitted ? "Upload Additional Documents" : "Upload Documents"}
                      </p>
                      {fileQueue.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f0f9] text-[#2c5282] text-xs font-bold rounded-full">
                          {fileQueue.filter((i) => !i.done).length} pending
                        </span>
                      )}
                    </div>

                    <input
                      ref={multiFileInputRef}
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => { if (e.target.files && e.target.files.length > 0) { addFilesToQueue(e.target.files); e.target.value = ""; } }}
                    />

                    <div
                      className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#2c5282] hover:bg-[#f8fdfc] transition-colors"
                      onClick={() => multiFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) addFilesToQueue(e.dataTransfer.files); }}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 flex items-center justify-center bg-[#e8f0f9] rounded-full">
                          <i className="ri-upload-cloud-2-line text-[#2c5282] text-2xl"></i>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800 mb-1">Click or drag to add files</p>
                          <p className="text-xs text-gray-400">Select multiple files at once · PDF, JPG, PNG up to 50MB each</p>
                        </div>
                        <button type="button"
                          className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#2c5282] text-white text-sm font-bold rounded-xl hover:bg-[#1e3a5f] cursor-pointer transition-colors">
                          <i className="ri-folder-open-line"></i>Choose Files
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-100"></div>
                      <span className="text-xs text-gray-400 font-medium">or</span>
                      <div className="flex-1 h-px bg-gray-100"></div>
                    </div>
                    <button type="button" onClick={addUrlItem}
                      className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 text-gray-500 text-sm font-semibold rounded-xl hover:border-[#2c5282] hover:text-[#2c5282] hover:bg-[#f8fdfc] cursor-pointer transition-colors">
                      <i className="ri-link"></i>Add a Google Drive / Dropbox link instead
                    </button>
                  </div>

                  {/* ── File queue ── */}
                  {fileQueue.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Files to Submit ({fileQueue.filter((i) => !i.done).length})</p>
                      {fileQueue.map((item) => (
                        <div key={item.id} className={`bg-white rounded-xl border overflow-hidden transition-all ${item.done ? "border-[#b8cce4] bg-[#f8fdfb]" : item.error ? "border-red-200" : "border-gray-200"}`}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${item.done ? "bg-[#e8f5f1]" : item.error ? "bg-red-50" : "bg-violet-50"}`}>
                              {item.uploading
                                ? <i className="ri-loader-4-line animate-spin text-[#2c5282] text-base"></i>
                                : item.done
                                  ? <i className="ri-checkbox-circle-fill text-[#2c5282] text-base"></i>
                                  : item.error
                                    ? <i className="ri-error-warning-line text-red-500 text-base"></i>
                                    : <i className="ri-file-check-line text-violet-500 text-base"></i>
                              }
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              {item.file ? (
                                <p className="text-xs text-gray-400 truncate">{item.file.name}</p>
                              ) : (
                                <input
                                  type="url"
                                  value={item.url}
                                  onChange={(e) => updateQueueItem(item.id, { url: e.target.value })}
                                  placeholder="https://drive.google.com/file/..."
                                  disabled={item.done}
                                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#2c5282] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                />
                              )}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={item.label}
                                  onChange={(e) => updateQueueItem(item.id, { label: e.target.value })}
                                  placeholder="Document label..."
                                  disabled={item.done}
                                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#2c5282] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                />
                                {/* Document type is fixed to the order's product
                                    (ESA/PSD) — not provider-selectable, so a PSD order
                                    can never be mislabeled ESA. Completed Housing
                                    Accommodation forms use the dedicated uploader in the
                                    Housing Accommodation section, not this letter queue. */}
                                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#e8f0f9] text-[#2c5282] whitespace-nowrap flex-shrink-0">
                                  <i className="ri-file-text-line"></i>{orderIsPsd ? "PSD Letter" : "ESA Letter"}
                                </span>
                              </div>
                              {item.error && (
                                <p className="text-xs text-red-500 flex items-center gap-1">
                                  <i className="ri-error-warning-line"></i>{item.error}
                                </p>
                              )}
                              {item.done && (
                                <p className="text-xs text-[#2c5282] flex items-center gap-1 font-semibold">
                                  <i className="ri-checkbox-circle-fill"></i>Submitted successfully
                                </p>
                              )}
                            </div>
                            {!item.done && (
                              <button type="button" onClick={() => removeQueueItem(item.id)}
                                className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 cursor-pointer transition-colors flex-shrink-0">
                                <i className="ri-close-line text-sm"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Personal Note to Patient (Optional)</label>
                        <textarea value={providerNote} onChange={(e) => setProviderNote(e.target.value)}
                          rows={2} maxLength={500}
                          placeholder="A short personal note included in the patient's notification email..."
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#2c5282] resize-none transition-colors" />
                        <p className="text-xs text-gray-400 text-right mt-0.5">{providerNote.length}/500</p>
                      </div>

                      {fileQueue.some((i) => !i.done) && (
                        <button type="button" onClick={() => setShowSubmitConfirm(true)} disabled={submittingQueue}
                          className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-[#2c5282] text-white text-sm font-extrabold rounded-xl hover:bg-[#1e3a5f] disabled:opacity-50 cursor-pointer transition-colors">
                          {submittingQueue
                            ? <><i className="ri-loader-4-line animate-spin"></i>Submitting documents...</>
                            : <><i className="ri-send-plane-line"></i>Submit {fileQueue.filter((i) => !i.done).length} Document{fileQueue.filter((i) => !i.done).length !== 1 ? "s" : ""} &amp; Notify Patient</>
                          }
                        </button>
                      )}
                    </div>
                  )}
                  </>)}
                </>
              )}
            </div>
          )}

          {/* ── NOTES (shared with admin) ── */}
          {section === "notes" && (
            <SharedNotesPanel
              orderId={order.id}
              confirmationId={order.confirmation_id}
              currentUserId={providerUserId}
              currentUserName={providerName}
              currentUserRole="provider"
            />
          )}
        </div>
      </div>

      {/* ── Submit Confirmation Popup ── */}
      {showSubmitConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-[#e8f5f1] rounded-xl flex-shrink-0">
                <i className="ri-send-plane-fill text-[#2c5282] text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Submit Documents &amp; Complete Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will submit the uploaded document{fileQueue.filter((i) => !i.done).length !== 1 ? "s" : ""} to the patient, send them a notification email, and <strong>mark this order as completed</strong>.
                </p>
              </div>
            </div>
            <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 mb-4 space-y-1">
              <p className="text-xs text-[#2c5282] font-semibold flex items-center gap-1.5">
                <i className="ri-file-check-line"></i>
                {fileQueue.filter((i) => !i.done).length} document{fileQueue.filter((i) => !i.done).length !== 1 ? "s" : ""} ready to submit
              </p>
              <p className="text-xs text-[#2c5282] font-semibold flex items-center gap-1.5">
                <i className="ri-mail-send-line"></i>
                Patient will receive an email notification
              </p>
              <p className="text-xs text-[#2c5282] font-semibold flex items-center gap-1.5">
                <i className="ri-checkbox-circle-line"></i>
                Order will be marked as <strong>Completed</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowSubmitConfirm(false); handleSubmitQueue(); }}
                disabled={submittingQueue}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#2c5282] text-white text-sm font-bold rounded-lg hover:bg-[#1e3a5f] cursor-pointer transition-colors disabled:opacity-50"
              >
                <i className="ri-send-plane-line"></i>Yes, Submit &amp; Complete
              </button>
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Order Modal ── */}
      {showRejectModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-close-circle-fill text-red-600 text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Reject This Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  The order will be sent back to admin for reassignment. <strong>The patient will not be notified.</strong>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-amber-800 flex items-start gap-1.5 leading-relaxed">
                <i className="ri-information-line flex-shrink-0 mt-0.5"></i>
                Your rejection reason will be visible to admin only. Please be specific so the case can be handled appropriately.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                Reason for Rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="e.g. I am not licensed in this state, conflict of interest, insufficient information provided..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none transition-colors"
                autoFocus
              />
              <div className="flex items-center justify-between mt-1">
                <p className={`text-xs ${rejectionReason.trim().length < 5 && rejectionReason.length > 0 ? "text-red-500" : "text-gray-400"}`}>
                  {rejectionReason.trim().length < 5 && rejectionReason.length > 0 ? "Too short — please provide more detail" : "Required"}
                </p>
                <p className="text-xs text-gray-400">{rejectionReason.length}/500</p>
              </div>
            </div>

            {rejectMsg && !rejectMsg.ok && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg mb-3 text-xs font-semibold text-red-700">
                <i className="ri-error-warning-line"></i>{rejectMsg.text}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRejectOrder}
                disabled={rejecting || rejectionReason.trim().length < 5}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rejecting
                  ? <><i className="ri-loader-4-line animate-spin"></i>Rejecting...</>
                  : <><i className="ri-close-circle-line"></i>Confirm Rejection</>
                }
              </button>
              <button
                type="button"
                onClick={() => { setShowRejectModal(false); setRejectionReason(""); setRejectMsg(null); }}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
