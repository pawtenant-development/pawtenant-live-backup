// ProviderOrderDetail — Full order view for providers
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
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
}

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
  letter_sent: "bg-[#e8f5f1] text-[#1a5c4f]",
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

  // Upload form (single — kept for backward compat)
  const [docUrl, setDocUrl] = useState("");
  const [docLabel, setDocLabel] = useState("ESA Letter – Signed");
  const [docType, setDocType] = useState("esa_letter");
  const [providerNote, setProviderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [useUrlFallback, setUseUrlFallback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-file queue
  const [fileQueue, setFileQueue] = useState<QueueItem[]>([]);
  const [submittingQueue, setSubmittingQueue] = useState(false);
  const [queueMsg, setQueueMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Confirmation popup before submitting
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // In-Review status update
  const [markingInReview, setMarkingInReview] = useState(false);
  const [inReviewMsg, setInReviewMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Uploaded docs for this order
  const [uploadedDocs, setUploadedDocs] = useState<OrderDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

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

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

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

  const handleSubmitLetter = async () => {
    if (!docUrl.trim()) {
      setSubmitMsg({ ok: false, text: "Please enter the document URL." });
      return;
    }
    if (!docLabel.trim()) {
      setSubmitMsg({ ok: false, text: "Please enter a document label." });
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-submit-letter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          documentUrl: docUrl.trim(),
          documentLabel: docLabel.trim(),
          docType,
          providerNote: providerNote.trim() || null,
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; patientNotified?: boolean };
      if (result.ok) {
        setSubmitMsg({ ok: true, text: result.patientNotified
          ? "Letter submitted! The patient has been notified by email."
          : "Letter submitted and saved successfully."
        });
        setSubmitted(true);
        setDocUrl("");
        setProviderNote("");
        const updated = {
          ...order,
          doctor_status: "letter_sent",
          signed_letter_url: docUrl.trim(),
          patient_notification_sent_at: new Date().toISOString(),
        };
        setOrder(updated);
        onOrderUpdated({ id: order.id, doctor_status: "letter_sent", signed_letter_url: docUrl.trim() });
        loadDocs();
      } else {
        setSubmitMsg({ ok: false, text: result.error ?? "Submission failed. Please try again." });
      }
    } catch {
      setSubmitMsg({ ok: false, text: "Network error. Please check your connection." });
    }
    setSubmitting(false);
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;
    setUploadingFile(true);
    setSubmitMsg(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${order.confirmation_id}-${Date.now()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from("provider-letters")
        .upload(fileName, file, { contentType: file.type, upsert: true });
      if (error) {
        setSubmitMsg({ ok: false, text: `Upload failed: ${error.message}` });
        setUploadingFile(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from("provider-letters").getPublicUrl(data.path);
      setDocUrl(publicUrl);
      setUploadedFileName(file.name);
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      if (docLabel === "ESA Letter – Signed") setDocLabel(nameWithoutExt);
    } catch {
      setSubmitMsg({ ok: false, text: "Upload error. Please try again." });
    }
    setUploadingFile(false);
  };

  // ── Add files to queue ──────────────────────────────────────────────────────
  const addFilesToQueue = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const newItems: QueueItem[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      url: "",
      label: f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
      docType: "esa_letter",
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
      docType: "other",
      uploading: false,
      error: null,
      done: false,
    }]);
  };

  // ── Upload a single queue item file to Supabase Storage ───────────────────
  const uploadQueueFile = async (item: QueueItem): Promise<string> => {
    if (!item.file) return item.url;
    updateQueueItem(item.id, { uploading: true, error: null });
    const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${order.confirmation_id}-${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage
      .from("provider-letters")
      .upload(fileName, item.file, { contentType: item.file.type, upsert: true });
    if (error) {
      updateQueueItem(item.id, { uploading: false, error: error.message });
      throw new Error(error.message);
    }
    const { data: { publicUrl } } = supabase.storage.from("provider-letters").getPublicUrl(data.path);
    updateQueueItem(item.id, { uploading: false, url: publicUrl });
    return publicUrl;
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
        // Step 1: upload file if needed
        const finalUrl = item.file ? await uploadQueueFile(item) : item.url;
        if (!finalUrl.trim()) {
          updateQueueItem(item.id, { error: "URL is required" });
          failCount++;
          continue;
        }
        // Step 2: submit to provider-submit-letter
        const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-submit-letter`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_KEY,
          },
          body: JSON.stringify({
            confirmationId: order.confirmation_id,
            documentUrl: finalUrl,
            documentLabel: item.label.trim() || "Document",
            docType: item.docType,
            providerNote: providerNote.trim() || null,
          }),
        });
        const result = await res.json() as { ok: boolean; error?: string };
        if (result.ok) {
          updateQueueItem(item.id, { done: true, url: finalUrl });
          successCount++;
          // Order goes straight to patient_notified + completed
          const updatedOrder = {
            ...order,
            doctor_status: "patient_notified",
            status: "completed",
            signed_letter_url: finalUrl,
            patient_notification_sent_at: new Date().toISOString(),
          };
          setOrder(updatedOrder);
          onOrderUpdated({ id: order.id, doctor_status: "patient_notified", status: "completed", signed_letter_url: finalUrl });
        } else {
          updateQueueItem(item.id, { error: result.error ?? "Submission failed" });
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

  const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
  const initials = fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const doctorStatus = order.doctor_status ?? "pending_review";
  const assessmentAnswers = order.assessment_answers as Record<string, unknown> | null;
  const assessmentCount = assessmentAnswers ? Object.keys(assessmentAnswers).length : 0;
  const isLetterSubmitted = doctorStatus === "letter_sent" || doctorStatus === "patient_notified";
  const isThirtyDayReissue = doctorStatus === "thirty_day_reissue";
  const isRefunded = order.status === "refunded" || !!order.refunded_at;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-11 h-11 flex items-center justify-center bg-[#f0faf7] rounded-full text-[#1a5c4f] text-base font-extrabold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-gray-900">{fullName}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${DOCTOR_STATUS_COLOR[doctorStatus] ?? "bg-gray-100 text-gray-500"}`}>
                {DOCTOR_STATUS_LABEL[doctorStatus] ?? doctorStatus}
              </span>
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
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${section === tab.key ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:bg-white"}`}>
              <i className={tab.icon}></i>{tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── OVERVIEW ── */}
          {section === "overview" && (
            <div className="p-6 space-y-5">

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

              {/* ── Additional Services Required ── shown when customer purchased extras or requested additional docs */}
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

              {/* Status card */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Case Status</p>

                {/* In-Review feedback */}
                {inReviewMsg && (
                  <div className={`mb-3 rounded-xl px-4 py-2.5 flex items-center gap-2 ${inReviewMsg.ok ? "bg-[#f0faf7] border border-[#b8ddd5]" : "bg-red-50 border border-red-200"}`}>
                    <i className={`text-sm flex-shrink-0 ${inReviewMsg.ok ? "ri-checkbox-circle-fill text-[#1a5c4f]" : "ri-error-warning-line text-red-500"}`}></i>
                    <p className={`text-xs font-semibold ${inReviewMsg.ok ? "text-[#1a5c4f]" : "text-red-700"}`}>{inReviewMsg.text}</p>
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
                          ? "border-[#1a5c4f] bg-[#f0faf7] text-[#1a5c4f]"
                          : "border-gray-200 text-gray-400"
                      }`}>
                      {(doctorStatus === s.status || (s.status === "patient_notified" && doctorStatus === "letter_sent")) && <i className="ri-checkbox-circle-fill text-[#1a5c4f]"></i>}
                      {s.label}
                    </span>
                  ))}
                </div>

                {/* In Review action — shown when status is pending_review (hidden in read-only mode) */}
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
                {/* Read-only indicator for pending review */}
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
                  <div className="mt-3 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-center gap-2">
                    <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base"></i>
                    <p className="text-sm font-semibold text-[#1a5c4f]">
                      Order completed! Documents submitted and the patient has been notified.
                    </p>
                  </div>
                )}
              </div>

              {/* Documents in this order */}
              {(uploadedDocs.length > 0 || order.signed_letter_url) && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Submitted Documents</p>
                  <div className="space-y-2">
                    {uploadedDocs.map((doc) => (
                      <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl hover:bg-[#e0f2ec] cursor-pointer transition-colors">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                          <i className="ri-file-check-line text-[#1a5c4f]"></i>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#1a5c4f]">{doc.label}</p>
                          <p className="text-xs text-[#1a5c4f]/60">
                            {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {doc.sent_to_customer && " · Sent to patient ✓"}
                          </p>
                        </div>
                        <i className="ri-external-link-line text-[#1a5c4f]/60"></i>
                      </a>
                    ))}
                    {order.signed_letter_url && !uploadedDocs.some((d) => d.file_url === order.signed_letter_url) && (
                      <a href={order.signed_letter_url} target="_blank" rel="noopener noreferrer"
                        className="whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl hover:bg-[#e0f2ec] cursor-pointer transition-colors">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                          <i className="ri-shield-check-line text-[#1a5c4f]"></i>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#1a5c4f]">Signed ESA Letter</p>
                          <p className="text-xs text-[#1a5c4f]/60">Your submitted document</p>
                        </div>
                        <i className="ri-external-link-line text-[#1a5c4f]/60"></i>
                      </a>
                    )}
                  </div>
                </div>
              )}

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
                {/* Submit Letter button (hidden in read-only mode) */}
                {(!isLetterSubmitted || isThirtyDayReissue) && !isRefunded && !readOnly && (
                  <button type="button" onClick={() => setSection("upload")}
                    className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-xl cursor-pointer transition-colors ${isThirtyDayReissue ? "bg-orange-500 hover:bg-orange-600" : "bg-[#1a5c4f] hover:bg-[#17504a]"}`}>
                    <i className="ri-upload-cloud-line"></i>{isThirtyDayReissue ? "Submit Official Letter" : "Submit Letter"}
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
                    <div className="flex justify-center py-4"><i className="ri-loader-4-line animate-spin text-[#1a5c4f]"></i></div>
                  ) : uploadedDocs.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <i className="ri-file-check-line text-gray-400 text-sm"></i>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                          Previously Submitted ({uploadedDocs.length}) — Read Only
                        </p>
                      </div>
                      {uploadedDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 opacity-75">
                          <div className="w-8 h-8 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
                            <i className="ri-file-check-line text-violet-500 text-sm"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{doc.label}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {doc.sent_to_customer && <span className="ml-2 text-[#1a5c4f] font-semibold">· Sent to patient ✓</span>}
                            </p>
                          </div>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                            className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer">
                            <i className="ri-external-link-line"></i>Open
                          </a>
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
                    <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-3">
                      <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-lg flex-shrink-0 mt-0.5"></i>
                      <div>
                        <p className="text-sm font-bold text-[#1a5c4f] mb-0.5">Order completed</p>
                        <p className="text-xs text-[#1a5c4f]/70">You can upload additional documents for this order below.</p>
                      </div>
                    </div>
                  )}

                  {/* Queue result */}
                  {queueMsg && (
                    <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${queueMsg.ok ? "bg-[#f0faf7] border-[#b8ddd5] text-[#1a5c4f]" : "bg-red-50 border-red-200 text-red-700"}`}>
                      <i className={queueMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                      {queueMsg.text}
                    </div>
                  )}

                  {/* Previously uploaded docs */}
                  {loadingDocs ? (
                    <div className="flex justify-center py-4"><i className="ri-loader-4-line animate-spin text-[#1a5c4f]"></i></div>
                  ) : uploadedDocs.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-4 py-3 border-b border-gray-100 bg-gray-50">
                        Previously Submitted ({uploadedDocs.length})
                      </p>
                      {uploadedDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                          <div className="w-8 h-8 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
                            <i className="ri-file-check-line text-violet-500 text-sm"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{doc.label}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(doc.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {doc.sent_to_customer && <span className="ml-2 text-[#1a5c4f] font-semibold">· Sent to patient ✓</span>}
                            </p>
                          </div>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                            className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer">
                            <i className="ri-external-link-line"></i>Open
                          </a>
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#f0faf7] text-[#1a5c4f] text-xs font-bold rounded-full">
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
                      className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#1a5c4f] hover:bg-[#f8fdfc] transition-colors"
                      onClick={() => multiFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) addFilesToQueue(e.dataTransfer.files); }}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 flex items-center justify-center bg-[#f0faf7] rounded-full">
                          <i className="ri-upload-cloud-2-line text-[#1a5c4f] text-2xl"></i>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800 mb-1">Click or drag to add files</p>
                          <p className="text-xs text-gray-400">Select multiple files at once · PDF, JPG, PNG up to 50MB each</p>
                        </div>
                        <button type="button"
                          className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors">
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
                      className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 text-gray-500 text-sm font-semibold rounded-xl hover:border-[#1a5c4f] hover:text-[#1a5c4f] hover:bg-[#f8fdfc] cursor-pointer transition-colors">
                      <i className="ri-link"></i>Add a Google Drive / Dropbox link instead
                    </button>
                  </div>

                  {/* ── File queue ── */}
                  {fileQueue.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Files to Submit ({fileQueue.filter((i) => !i.done).length})</p>
                      {fileQueue.map((item) => (
                        <div key={item.id} className={`bg-white rounded-xl border overflow-hidden transition-all ${item.done ? "border-[#b8ddd5] bg-[#f8fdfb]" : item.error ? "border-red-200" : "border-gray-200"}`}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${item.done ? "bg-[#e8f5f1]" : item.error ? "bg-red-50" : "bg-violet-50"}`}>
                              {item.uploading
                                ? <i className="ri-loader-4-line animate-spin text-[#1a5c4f] text-base"></i>
                                : item.done
                                  ? <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base"></i>
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
                                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                />
                              )}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={item.label}
                                  onChange={(e) => updateQueueItem(item.id, { label: e.target.value })}
                                  placeholder="Document label..."
                                  disabled={item.done}
                                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                />
                                <div className="relative">
                                  <select
                                    value={item.docType}
                                    onChange={(e) => updateQueueItem(item.id, { docType: e.target.value })}
                                    disabled={item.done}
                                    className="appearance-none pl-2.5 pr-6 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1a5c4f] cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
                                  >
                                    <option value="esa_letter">ESA Letter</option>
                                    <option value="signed_letter">Signed Letter</option>
                                    <option value="housing_verification">Housing Verification</option>
                                    <option value="landlord_form">Landlord Form</option>
                                    <option value="other">Other</option>
                                  </select>
                                  <i className="ri-arrow-down-s-line absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: "11px" }}></i>
                                </div>
                              </div>
                              {item.error && (
                                <p className="text-xs text-red-500 flex items-center gap-1">
                                  <i className="ri-error-warning-line"></i>{item.error}
                                </p>
                              )}
                              {item.done && (
                                <p className="text-xs text-[#1a5c4f] flex items-center gap-1 font-semibold">
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
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] resize-none transition-colors" />
                        <p className="text-xs text-gray-400 text-right mt-0.5">{providerNote.length}/500</p>
                      </div>

                      {fileQueue.some((i) => !i.done) && (
                        <button type="button" onClick={() => setShowSubmitConfirm(true)} disabled={submittingQueue}
                          className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors">
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
                <i className="ri-send-plane-fill text-[#1a5c4f] text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Submit Documents &amp; Complete Order?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will submit the uploaded document{fileQueue.filter((i) => !i.done).length !== 1 ? "s" : ""} to the patient, send them a notification email, and <strong>mark this order as completed</strong>.
                </p>
              </div>
            </div>
            <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 mb-4 space-y-1">
              <p className="text-xs text-[#1a5c4f] font-semibold flex items-center gap-1.5">
                <i className="ri-file-check-line"></i>
                {fileQueue.filter((i) => !i.done).length} document{fileQueue.filter((i) => !i.done).length !== 1 ? "s" : ""} ready to submit
              </p>
              <p className="text-xs text-[#1a5c4f] font-semibold flex items-center gap-1.5">
                <i className="ri-mail-send-line"></i>
                Patient will receive an email notification
              </p>
              <p className="text-xs text-[#1a5c4f] font-semibold flex items-center gap-1.5">
                <i className="ri-checkbox-circle-line"></i>
                Order will be marked as <strong>Completed</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowSubmitConfirm(false); handleSubmitQueue(); }}
                disabled={submittingQueue}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors disabled:opacity-50"
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
    </div>
  );
}
