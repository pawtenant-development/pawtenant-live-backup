// PartnerManualIntake — PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// "New Partner Order": admin-only manual intake of a partner's PAID-ORDER PDF.
//
//   1. Select partner (only partners whose profile allows manual intake)
//   2. Upload the partner PDF (validated by content server-side, stored privately)
//   3. Extraction — text layer first; image-only PDFs get a browser OCR fallback
//   4. Review & correct every extracted field (provenance + confidence shown,
//      low-confidence and missing values highlighted, ESA/PSD contradictions
//      must be resolved by a human, PSD uses the canonical questionnaire)
//   5. Confirm — what will be created, the proposed partner charge (selected
//      and frozen SERVER-SIDE), and the explicit "no Stripe, no customer email"
//      statement — then create the canonical PawTenant order and open it.
//
// Nothing here creates an order until step 5; extraction never does. Every
// write goes through the partner-manual-intake edge function with the admin's
// own session JWT; drafts are read through admin-only RLS.
//
// SCOPE GUARD: partner identity + economics. Mounts ONLY inside the Partner
// Platform workspace; never import into provider or customer surfaces.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import type { Order } from "../../types";
import { PSD_QUESTIONNAIRE_ITEMS, type PsdQuestion } from "../psdAssessmentSchema";
import { type PartnerOrg, acceptsManualIntake, money, Badge, Section, EmptyState, Notice, ConfirmDialog } from "./shared";
import { OCR_ENGINE, ocrPdfFile } from "./pdfOcr";

// ── Types mirrored from the edge function ────────────────────────────────────

interface ExtractedField { value: string | null; page: number | null; method: string | null; confidence: number; warnings: string[] }
interface ExtractedPet { name: ExtractedField; type: ExtractedField; breed: ExtractedField; age: ExtractedField; weight: ExtractedField }
interface ExtractedQa { question: string; answer: string; page: number; confidence: number }
interface ReviewIssue { code: string; field?: string; messages?: string[]; blocking: boolean }

export interface IntakeDraft {
  id: string;
  partner_id: string;
  status: string;
  original_filename: string;
  file_size_bytes: number;
  page_count: number | null;
  extraction_method: string | null;
  extraction_attempts: number;
  extraction_error_code: string | null;
  extracted_fields: Record<string, ExtractedField> & { _warnings?: string[]; _char_count?: number };
  extracted_pets: ExtractedPet[];
  extracted_qa: ExtractedQa[];
  reviewed_fields: Review | null;
  review_issues: ReviewIssue[];
  review_version: number;
  external_order_id: string | null;
  service: string | null;
  committed_order_id: string | null;
  committed_at: string | null;
  created_at: string;
  uploaded_by_email: string | null;
}

interface Animal { name: string; type: string; breed?: string; age?: string; weight?: string }
interface Review {
  external_order_id?: string; payment_reference?: string; paid_confirmed?: boolean; order_date?: string;
  service?: "esa" | "psd" | null; service_conflict_resolution?: string;
  first_name?: string; last_name?: string; email?: string; phone?: string; date_of_birth?: string; adult_confirmed?: boolean;
  current_physical_state?: string; residence_state?: string; address?: string;
  animals?: Animal[]; answers?: Record<string, string | string[]>; consultation?: string; notes?: string;
  consents?: { telehealth?: boolean; privacy_data_transfer?: boolean; signature_name?: string };
}

const DRAFT_COLUMNS =
  "id, partner_id, status, original_filename, file_size_bytes, page_count, extraction_method, extraction_attempts, extraction_error_code, " +
  "extracted_fields, extracted_pets, extracted_qa, reviewed_fields, review_issues, review_version, external_order_id, service, " +
  "committed_order_id, committed_at, created_at, uploaded_by_email";

const REVIEW_THRESHOLD = 0.85;
const OPEN_STATUSES = new Set(["uploaded", "extraction_pending", "ocr_required", "extraction_failed", "review_required", "reviewed", "committing"]);

const STATUS_VIEW: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  extraction_pending: { label: "Extracting", tone: "bg-blue-50 text-blue-700 ring-blue-200" },
  ocr_required: { label: "OCR required", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  extraction_failed: { label: "Extraction failed", tone: "bg-red-50 text-red-700 ring-red-200" },
  review_required: { label: "Review required", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  reviewed: { label: "Ready to create", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  committing: { label: "Creating…", tone: "bg-blue-50 text-blue-700 ring-blue-200" },
  committed: { label: "Order created", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "Cancelled", tone: "bg-gray-100 text-gray-500 ring-gray-300" },
};

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const inputCls = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

// ── Edge-function client ────────────────────────────────────────────────────

async function intake<T = { ok: boolean; code?: string; error?: string; draft?: IntakeDraft; [k: string]: unknown }>(
  action: string, body: Record<string, unknown> | FormData,
): Promise<{ status: number; body: T }> {
  const { data, error } = await supabase.functions.invoke(`partner-manual-intake?action=${action}`, { body });
  if (error) {
    // supabase-js surfaces non-2xx as an error carrying the Response.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { return { status: ctx.status, body: await ctx.json() as T }; } catch { /* fall through */ }
    }
    return { status: 0, body: { ok: false, code: "network", error: error.message } as unknown as T };
  }
  return { status: 200, body: data as T };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const qKey = (q: string) => { const s = q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100); return s ? `q_${s}` : "q_unlabelled"; };
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 2));
function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
function toIsoDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toISOString().slice(0, 10);
}

/** Initial review built from extraction (the admin corrects it; nothing is invented). */
function reviewFromExtraction(d: IntakeDraft): Review {
  const f = d.extracted_fields ?? {};
  const v = (k: string) => f[k]?.value ?? undefined;
  const animals: Animal[] = (d.extracted_pets ?? []).map((p) => ({
    name: p.name?.value ?? "", type: p.type?.value ?? "", breed: p.breed?.value ?? undefined, age: p.age?.value ?? undefined, weight: p.weight?.value ?? undefined,
  }));
  const service = v("service") === "esa" ? "esa" : v("service") === "psd" ? "psd" : null;
  const answers: Record<string, string | string[]> = {};
  if (service === "psd") {
    // Pre-fill the CANONICAL questionnaire by matching the partner's question wording.
    for (const item of PSD_QUESTIONNAIRE_ITEMS) {
      if (item.kind === "evidence") continue;
      let best: ExtractedQa | null = null; let bestScore = 0;
      for (const q of d.extracted_qa ?? []) { const s = similarity(item.label, q.question); if (s > bestScore) { bestScore = s; best = q; } }
      if (!best || bestScore < 0.45 || !best.answer) continue;
      if (item.kind === "multi") answers[item.key] = best.answer.split(/[;\n]|,\s(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
      else if (item.kind === "single" && item.options) {
        let code = ""; let cs = 0;
        for (const [k, label] of Object.entries(item.options)) { const s = similarity(label, best.answer); if (s > cs) { cs = s; code = k; } }
        if (cs >= 0.4) answers[item.key] = code;
      } else answers[item.key] = best.answer;
    }
  } else {
    for (const q of d.extracted_qa ?? []) if (q.answer) answers[qKey(q.question)] = q.answer;
  }
  return {
    external_order_id: v("external_order_id"), payment_reference: v("payment_reference"), paid_confirmed: v("paid_status") === "paid",
    order_date: v("order_date"), service,
    first_name: v("first_name"), last_name: v("last_name"), email: v("email"), phone: v("phone"),
    date_of_birth: toIsoDate(v("date_of_birth")), adult_confirmed: false,
    current_physical_state: v("state"), address: v("address"),
    animals, answers, consultation: v("consultation"), notes: v("notes"),
    consents: { telehealth: false, privacy_data_transfer: false, signature_name: "" },
  };
}

function Prov({ f, label }: { f?: ExtractedField; label?: string }) {
  if (!f) return null;
  if (f.value === null) return <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">not found in PDF</span>;
  const low = f.confidence < REVIEW_THRESHOLD;
  return (
    <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${low ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-gray-50 text-gray-600 ring-gray-200"}`}
      title={`${label ?? ""} page ${f.page ?? "?"} · ${f.method} · ${Math.round(f.confidence * 100)}%${f.warnings.length ? " · " + f.warnings.join(", ") : ""}`}>
      p{f.page ?? "?"} · {f.method} · {Math.round(f.confidence * 100)}%{low ? " · check" : ""}
    </span>
  );
}

function fieldCls(f?: ExtractedField, value?: string) {
  if (!value) return `${inputCls} border-red-300 bg-red-50/40`;
  if (f && f.value !== null && f.confidence < REVIEW_THRESHOLD) return `${inputCls} border-amber-300 bg-amber-50/40`;
  return `${inputCls} border-gray-300`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  partners: PartnerOrg[];
  selected: PartnerOrg | null;
  listColumns: string;
  onOpenOrder: (order: Order) => void;
  onOrderCreated: () => void;
  wizardOpen: boolean;
  onWizardOpenChange: (open: boolean) => void;
}

export default function PartnerManualIntake({ partners, selected, listColumns, onOpenOrder, onOrderCreated, wizardOpen, onWizardOpenChange }: Props) {
  const [drafts, setDrafts] = useState<IntakeDraft[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [active, setActive] = useState<IntakeDraft | null>(null);

  const partnerName = useCallback((id: string) => partners.find((p) => p.id === id)?.display_name ?? "Partner", [partners]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let q = supabase.from("partner_intake_drafts").select(DRAFT_COLUMNS).order("created_at", { ascending: false }).limit(100);
      if (!showHistory) q = q.in("status", Array.from(OPEN_STATUSES));
      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) { setError("Could not load intake drafts (admin access required)."); return; }
      setDrafts((data as unknown as IntakeDraft[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [reload, showHistory, wizardOpen]);

  const openOrder = useCallback(async (orderId: string) => {
    const { data } = await supabase.from("orders").select(listColumns).eq("order_origin", "partner").eq("id", orderId).maybeSingle();
    if (data) onOpenOrder(data as unknown as Order);
  }, [listColumns, onOpenOrder]);

  const open = drafts.filter((d) => OPEN_STATUSES.has(d.status));

  return (
    <>
      <Section
        title="Legacy PDF intake (superseded)"
        subtitle="Historical PDF uploads, kept for audit. The normal way to create a partner order is now the structured New Partner Order form — PDF extraction could not reliably read real partner documents."
        actions={
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} /> Show created & cancelled
          </label>
        }
      >
        <Notice notice={notice} error={error} />
        {drafts.length === 0 ? (
          <EmptyState title="No intake drafts" hint="Nothing has been uploaded through the legacy PDF path." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Partner</th><th className="py-2 pr-3">File</th><th className="py-2 pr-3">External ref</th>
                  <th className="py-2 pr-3">Service</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Uploaded</th><th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const st = STATUS_VIEW[d.status] ?? { label: d.status, tone: "bg-gray-100 text-gray-600 ring-gray-300" };
                  return (
                    <tr key={d.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3"><Badge label={partnerName(d.partner_id)} tone="bg-indigo-50 text-indigo-700 ring-indigo-200" /></td>
                      <td className="py-2 pr-3 text-xs text-gray-700">{d.original_filename}<span className="block text-[10px] text-gray-400">{d.page_count ?? "?"} page(s) · {Math.round(d.file_size_bytes / 1024)} KB</span></td>
                      <td className="py-2 pr-3 font-mono text-xs">{d.external_order_id ?? "—"}</td>
                      <td className="py-2 pr-3 uppercase text-xs">{d.service ?? "—"}</td>
                      <td className="py-2 pr-3"><Badge label={st.label} tone={st.tone} /></td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{new Date(d.created_at).toLocaleString()}<span className="block text-[10px] text-gray-400">{d.uploaded_by_email ?? ""}</span></td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-2">
                          {OPEN_STATUSES.has(d.status) && (
                            <button type="button" onClick={() => { setActive(d); onWizardOpenChange(true); }} className="rounded border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700">
                              {d.status === "reviewed" ? "Confirm" : "Review"}
                            </button>
                          )}
                          {d.committed_order_id && (
                            <button type="button" onClick={() => void openOrder(d.committed_order_id!)} className="rounded border border-emerald-300 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Open order
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {open.length > 0 && <p className="mt-2 text-[11px] text-gray-500">{open.length} draft{open.length === 1 ? "" : "s"} awaiting action.</p>}
      </Section>

      {wizardOpen && (
        <IntakeWizard
          partners={partners}
          initialPartner={active ? partners.find((p) => p.id === active.partner_id) ?? null : selected}
          initialDraft={active}
          partnerName={partnerName}
          onClose={() => { onWizardOpenChange(false); setActive(null); setReload((n) => n + 1); }}
          onCreated={(conf) => { setNotice(`Partner order ${conf} created.`); onOrderCreated(); setReload((n) => n + 1); }}
          onOpenOrder={openOrder}
        />
      )}
    </>
  );
}

// ── Wizard ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

function stepForDraft(d: IntakeDraft | null): Step {
  if (!d) return 1;
  if (d.status === "reviewed") return 5;
  if (d.status === "review_required" || d.status === "ocr_required" || d.status === "extraction_failed") return d.status === "review_required" && d.reviewed_fields ? 4 : 3;
  if (d.status === "committed") return 5;
  return 3;
}

function IntakeWizard({ partners, initialPartner, initialDraft, partnerName, onClose, onCreated, onOpenOrder }: {
  partners: PartnerOrg[]; initialPartner: PartnerOrg | null; initialDraft: IntakeDraft | null;
  partnerName: (id: string) => string; onClose: () => void; onCreated: (conf: string) => void; onOpenOrder: (orderId: string) => Promise<void>;
}) {
  const eligible = useMemo(() => partners.filter(acceptsManualIntake), [partners]);
  const [partnerId, setPartnerId] = useState<string>(initialPartner && acceptsManualIntake(initialPartner) ? initialPartner.id : (eligible[0]?.id ?? ""));
  const [draft, setDraft] = useState<IntakeDraft | null>(initialDraft);
  const [step, setStep] = useState<Step>(stepForDraft(initialDraft));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dupe, setDupe] = useState<{ draft_id: string; status: string; committed_order_id: string | null; original_filename: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string>("");
  const [review, setReview] = useState<Review>(() => initialDraft?.reviewed_fields ?? (initialDraft ? reviewFromExtraction(initialDraft) : {}));
  const [issues, setIssues] = useState<ReviewIssue[]>(initialDraft?.review_issues ?? []);
  const [rate, setRate] = useState<{ cents: number; version: number; environment: string } | null>(null);
  const [result, setResult] = useState<{ order_id: string; confirmation_id: string; replayed: boolean } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showPages, setShowPages] = useState(false);

  const partner = partners.find((p) => p.id === (draft?.partner_id ?? partnerId)) ?? null;

  const adoptDraft = (d: IntakeDraft | undefined | null, next?: Step) => {
    if (!d) return;
    setDraft(d);
    setIssues(d.review_issues ?? []);
    if (!d.reviewed_fields && (d.status === "review_required")) setReview(reviewFromExtraction(d));
    else if (d.reviewed_fields) setReview(d.reviewed_fields);
    if (next) setStep(next); else setStep(stepForDraft(d));
  };

  // Proposed charge for the confirm step — display only; the server re-selects and freezes it.
  useEffect(() => {
    if (step !== 5 || !partner || !review.service) { setRate(null); return; }
    let cancelled = false;
    void (async () => {
      const env = partner.production_enabled ? "production" : "sandbox";
      const { data } = await supabase.from("partner_rate_cards").select("wholesale_unit_price_cents, version, environment")
        .eq("partner_id", partner.id).eq("service", review.service!).eq("environment", env).is("effective_to", null)
        .lte("effective_from", new Date().toISOString()).order("version", { ascending: false }).limit(1);
      if (cancelled) return;
      const r = (data ?? [])[0] as { wholesale_unit_price_cents: number; version: number; environment: string } | undefined;
      setRate(r ? { cents: r.wholesale_unit_price_cents, version: r.version, environment: r.environment } : null);
    })();
    return () => { cancelled = true; };
  }, [step, partner, review.service]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const upload = async () => {
    if (!file || !partnerId) return;
    setBusy("Uploading and extracting…"); setError(""); setDupe(null);
    try {
      const fd = new FormData(); fd.append("partner_id", partnerId); fd.append("file", file);
      const r = await intake("upload", fd);
      if (!r.body.ok) {
        if (r.body.code === "duplicate_pdf") setDupe(r.body.existing as typeof dupe);
        setError(r.body.error ?? "Upload failed"); return;
      }
      adoptDraft(r.body.draft, r.body.draft?.status === "review_required" ? 4 : 3);
      if (r.body.draft?.status === "review_required") setReview(reviewFromExtraction(r.body.draft));
    } finally { setBusy(null); }
  };

  const runOcr = async () => {
    if (!draft) return;
    if (!file) { setError("Re-select the same PDF from your computer to run OCR in this browser (the page images never leave your machine)."); return; }
    setBusy("Running OCR in your browser…"); setError("");
    try {
      const pages = await ocrPdfFile(file, "all", (p) => setOcrProgress(`${p.stage === "render" ? "Rendering" : "Recognising"} page ${p.page}/${p.pages} · ${p.pct}%`));
      const r = await intake("ocr_text", { draft_id: draft.id, pages: pages.map((p) => ({ page: p.page, text: p.text })), engine: OCR_ENGINE });
      if (!r.body.ok) { setError(r.body.error ?? "OCR text was not accepted"); return; }
      adoptDraft(r.body.draft, r.body.draft?.status === "review_required" ? 4 : 3);
      if (r.body.draft?.status === "review_required") setReview(reviewFromExtraction(r.body.draft));
    } catch (e) {
      setError(`OCR failed in this browser: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); setOcrProgress(""); }
  };

  const reparse = async () => {
    if (!draft) return;
    setBusy("Re-running extraction…"); setError("");
    try {
      const r = await intake("reparse", { draft_id: draft.id });
      if (!r.body.ok) { setError(r.body.error ?? "Extraction retry failed"); return; }
      adoptDraft(r.body.draft, r.body.draft?.status === "review_required" ? 4 : 3);
      if (r.body.draft?.status === "review_required") setReview(reviewFromExtraction(r.body.draft));
    } finally { setBusy(null); }
  };

  const saveReview = async (goConfirm: boolean) => {
    if (!draft) return;
    setBusy("Saving review…"); setError("");
    try {
      const r = await intake<{ ok: boolean; code?: string; error?: string; draft?: IntakeDraft; issues?: ReviewIssue[]; ready?: boolean }>(
        "review", { draft_id: draft.id, review, expected_review_version: draft.review_version });
      if (!r.body.ok) {
        if (r.body.code === "stale_review" && r.body.draft) { adoptDraft(r.body.draft, 4); }
        setError(r.body.error ?? "Review could not be saved"); return;
      }
      setIssues(r.body.issues ?? []);
      setDraft(r.body.draft ?? draft);
      if (goConfirm && r.body.ready) setStep(5);
      else if (goConfirm) setError("Fix the blocking items below before creating the order.");
    } finally { setBusy(null); }
  };

  const commit = async () => {
    if (!draft) return;
    setBusy("Creating the PawTenant order…"); setError("");
    try {
      const r = await intake<{ ok: boolean; code?: string; error?: string; draft?: IntakeDraft; order_id?: string; confirmation_id?: string; replayed?: boolean; issues?: ReviewIssue[] }>("commit", { draft_id: draft.id });
      if (!r.body.ok) {
        if (r.body.issues) setIssues(r.body.issues);
        if (r.body.draft) setDraft(r.body.draft);
        setError(r.body.error ?? "The order could not be created");
        if (r.body.code === "review_invalid" || r.body.code === "duplicate_external_order_id") setStep(4);
        return;
      }
      setResult({ order_id: r.body.order_id!, confirmation_id: r.body.confirmation_id!, replayed: Boolean(r.body.replayed) });
      if (r.body.draft) setDraft(r.body.draft);
      onCreated(r.body.confirmation_id!);
    } finally { setBusy(null); }
  };

  const cancelDraft = async () => {
    if (!draft) return;
    setBusy("Cancelling…"); setError("");
    try {
      const r = await intake("cancel", { draft_id: draft.id, reason: "cancelled from intake wizard" });
      if (!r.body.ok) { setError(r.body.error ?? "Cancel failed"); return; }
      onClose();
    } finally { setBusy(null); setConfirmCancel(false); }
  };

  const viewSource = async () => {
    if (!draft) return;
    const r = await intake<{ ok: boolean; signedUrl?: string; error?: string }>("source_url", { draft_id: draft.id });
    if (r.body.ok && r.body.signedUrl) window.open(r.body.signedUrl, "_blank", "noopener"); else setError(r.body.error ?? "Source PDF unavailable");
  };

  // ── Review helpers ────────────────────────────────────────────────────────
  const f = draft?.extracted_fields ?? {};
  const set = <K extends keyof Review>(k: K, v: Review[K]) => setReview((r) => ({ ...r, [k]: v }));
  const setAnimal = (i: number, patch: Partial<Animal>) => setReview((r) => ({ ...r, animals: (r.animals ?? []).map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const setAnswer = (k: string, v: string | string[]) => setReview((r) => ({ ...r, answers: { ...(r.answers ?? {}), [k]: v } }));
  const serviceConflict = (f._warnings ?? []).includes("service_conflict");
  const blocking = issues.filter((i) => i.blocking);
  const esaQa: { key: string; question: string; page?: number; confidence?: number }[] = useMemo(() => {
    if (review.service === "psd") return [];
    const fromExtraction = (draft?.extracted_qa ?? []).map((q) => ({ key: qKey(q.question), question: q.question, page: q.page, confidence: q.confidence }));
    const known = new Set(fromExtraction.map((q) => q.key));
    const extra = Object.keys(review.answers ?? {}).filter((k) => !known.has(k) && k.startsWith("q_")).map((k) => ({ key: k, question: k.slice(2).replace(/_/g, " ") }));
    return [...fromExtraction, ...extra];
  }, [draft, review.answers, review.service]);

  const steps: { n: Step; label: string }[] = [{ n: 1, label: "Partner" }, { n: 2, label: "Upload" }, { n: 3, label: "Extraction" }, { n: 4, label: "Review" }, { n: 5, label: "Confirm" }];
  const st = draft ? (STATUS_VIEW[draft.status] ?? { label: draft.status, tone: "bg-gray-100 text-gray-600 ring-gray-300" }) : null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={busy ? undefined : onClose}></div>
      <div className="relative flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">Legacy PDF intake</h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {partner ? partner.display_name : "Select a partner"}{draft ? ` · ${draft.original_filename}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {st && <Badge label={st.label} tone={st.tone} />}
            <button type="button" onClick={onClose} disabled={busy !== null} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close"><i className="ri-close-line text-lg"></i></button>
          </div>
        </div>
        {/* Stepper */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 px-4 py-2 sm:px-5" role="list">
          {steps.map((s) => (
            <div key={s.n} role="listitem" className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${step === s.n ? "bg-indigo-600 text-white" : step > s.n ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              <span className="tabular-nums">{s.n}</span> {s.label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {busy && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700"><i className="ri-loader-4-line mr-1 animate-spin"></i>{busy} {ocrProgress}</p>}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">Choose the partner whose paid order you are entering. Only partners whose profile allows <strong>Manual</strong> or <strong>Manual + API</strong> intake are listed.</p>
              {eligible.length === 0 ? (
                <EmptyState title="No partner accepts manual intake" hint="Set a partner's intake mode to Manual or Both in Settings → Partner profile." />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {eligible.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPartnerId(p.id)}
                      className={`rounded-xl border-2 p-3 text-left ${partnerId === p.id ? "border-indigo-500 bg-indigo-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                      <p className="font-semibold text-gray-900">{p.display_name}</p>
                      <p className="text-xs text-gray-500">{p.domain ?? p.slug} · {p.intake_mode === "both" ? "Manual + API" : "Manual"} · {p.status}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">Upload the paid-order PDF the partner sent. It is validated by content (real PDF, not encrypted, no active content, size limit) and stored privately — there is no public link.</p>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 px-4 py-8 text-center hover:border-indigo-400"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const d = e.dataTransfer.files?.[0]; if (d) setFile(d); }}>
                <i className="ri-file-pdf-2-line text-3xl text-indigo-500"></i>
                <span className="mt-2 text-sm font-medium text-gray-800">{file ? file.name : "Drop the partner PDF here or click to choose"}</span>
                <span className="text-xs text-gray-500">{file ? `${Math.round(file.size / 1024)} KB` : "PDF only · up to 10 MB"}</span>
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {dupe && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="font-semibold">Duplicate PDF</p>
                  <p className="text-xs">This exact file was already uploaded for {partner?.display_name} as <span className="font-mono">{dupe.original_filename}</span> ({STATUS_VIEW[dupe.status]?.label ?? dupe.status}).{dupe.committed_order_id ? " An order was already created from it." : " Open that draft from the intake list instead."}</p>
                  {dupe.committed_order_id && <button type="button" onClick={() => void onOpenOrder(dupe.committed_order_id!)} className="mt-2 rounded border border-amber-300 px-2 py-0.5 text-xs font-medium">Open existing order</button>}
                </div>
              )}
            </div>
          )}

          {step === 3 && draft && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <p><strong>{draft.original_filename}</strong> · {draft.page_count ?? "?"} page(s) · method: {draft.extraction_method ?? "—"} · attempts: {draft.extraction_attempts}</p>
                {draft.extraction_error_code && <p className="text-xs text-gray-600">Last result: <span className="font-mono">{draft.extraction_error_code}</span></p>}
              </div>
              {draft.status === "ocr_required" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <p className="font-semibold">This PDF has no readable text layer (scanned or photographed).</p>
                  <p className="mt-1 text-xs">Run OCR here in your browser: pages are rendered locally and the recognised text is sent to PawTenant for extraction. The page images never leave your computer and nothing is sent to a third-party OCR service.</p>
                  {!file && <p className="mt-2 text-xs">Select the same PDF again so it can be rendered locally:</p>}
                  {!file && <input type="file" accept="application/pdf,.pdf" className="mt-1 text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
                  <button type="button" disabled={busy !== null || !file} onClick={() => void runOcr()} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Run OCR in this browser</button>
                </div>
              )}
              {draft.status === "extraction_failed" && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                  <p className="font-semibold">Extraction failed.</p>
                  <p className="mt-1 text-xs">The upload is safe. Retry extraction, run OCR, or review the draft and enter the fields by hand from the source PDF.</p>
                </div>
              )}
              {draft.status === "review_required" && <p className="text-sm text-emerald-700">Extraction complete — continue to review.</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void reparse()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">Retry extraction</button>
                <button type="button" disabled={busy !== null} onClick={() => void viewSource()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">View source PDF</button>
                <button type="button" disabled={busy !== null} onClick={() => { if (!draft.reviewed_fields) setReview(reviewFromExtraction(draft)); setStep(4); }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Review fields</button>
              </div>
            </div>
          )}

          {step === 4 && draft && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                <p>Extracted values carry their source page, method and confidence. <span className="rounded bg-amber-50 px-1 text-amber-800 ring-1 ring-inset ring-amber-200">amber</span> = check against the PDF · <span className="rounded bg-red-50 px-1 text-red-700 ring-1 ring-inset ring-red-200">red</span> = required and missing. Nothing is invented for you.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void viewSource()} className="rounded border border-gray-300 px-2 py-0.5">View source PDF</button>
                  <button type="button" onClick={() => setShowPages((v) => !v)} className="rounded border border-gray-300 px-2 py-0.5">{showPages ? "Hide" : "Show"} extracted Q/A</button>
                </div>
              </div>

              {(f._warnings ?? []).length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <strong>Extraction warnings:</strong> {(f._warnings ?? []).join(", ")}
                </div>
              )}

              {/* Order & payment */}
              <fieldset className="rounded-xl border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Partner order & payment</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block"><span className={labelCls}>Partner external order ID *<Prov f={f.external_order_id} /></span>
                    <input value={review.external_order_id ?? ""} onChange={(e) => set("external_order_id", e.target.value)} className={`${fieldCls(f.external_order_id, review.external_order_id)} font-mono`} /></label>
                  <label className="block"><span className={labelCls}>Partner payment reference *<Prov f={f.payment_reference} /></span>
                    <input value={review.payment_reference ?? ""} onChange={(e) => set("payment_reference", e.target.value)} className={`${fieldCls(f.payment_reference, review.payment_reference)} font-mono`} /></label>
                  <label className="block"><span className={labelCls}>Partner order date<Prov f={f.order_date} /></span>
                    <input value={review.order_date ?? ""} onChange={(e) => set("order_date", e.target.value)} className={`${inputCls} border-gray-300`} /></label>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-800">
                    <input type="checkbox" checked={review.paid_confirmed === true} onChange={(e) => set("paid_confirmed", e.target.checked)} />
                    The PDF shows this order as <strong>paid to the partner</strong> *<Prov f={f.paid_status} />
                  </label>
                  <div className="sm:col-span-2">
                    <span className={labelCls}>Service *<Prov f={f.service} /></span>
                    <div className="flex flex-wrap gap-2">
                      {(["esa", "psd"] as const).map((s) => (
                        <button key={s} type="button" onClick={() => set("service", s)} className={`rounded-lg border-2 px-4 py-2 text-sm font-semibold ${review.service === s ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-gray-200 text-gray-700"}`}>
                          {s === "esa" ? "ESA letter" : "PSD letter"}
                        </button>
                      ))}
                    </div>
                    {serviceConflict && (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <p className="font-semibold">The PDF contains both ESA and PSD wording. The system will not guess.</p>
                        <p className="mt-1">Confirm the service with the partner and record how it was resolved (required):</p>
                        <input value={review.service_conflict_resolution ?? ""} onChange={(e) => set("service_conflict_resolution", e.target.value)} placeholder="e.g. Confirmed ESA with partner ops by email on …" className={`${inputCls} mt-1 border-red-300`} />
                      </div>
                    )}
                  </div>
                </div>
              </fieldset>

              {/* Customer */}
              <fieldset className="rounded-xl border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block"><span className={labelCls}>Legal first name *<Prov f={f.first_name} /></span><input value={review.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} className={fieldCls(f.first_name, review.first_name)} /></label>
                  <label className="block"><span className={labelCls}>Legal last name *<Prov f={f.last_name} /></span><input value={review.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} className={fieldCls(f.last_name, review.last_name)} /></label>
                  <label className="block"><span className={labelCls}>Email *<Prov f={f.email} /></span><input type="email" value={review.email ?? ""} onChange={(e) => set("email", e.target.value)} className={fieldCls(f.email, review.email)} /></label>
                  <label className="block"><span className={labelCls}>Phone<Prov f={f.phone} /></span><input value={review.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={`${inputCls} border-gray-300`} /></label>
                  <label className="block"><span className={labelCls}>Date of birth (or confirm adult)<Prov f={f.date_of_birth} /></span><input type="date" value={review.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} className={fieldCls(f.date_of_birth, review.date_of_birth || (review.adult_confirmed ? "ok" : ""))} /></label>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-800"><input type="checkbox" checked={review.adult_confirmed === true} onChange={(e) => set("adult_confirmed", e.target.checked)} /> Partner confirmed the customer is an adult</label>
                  <label className="block"><span className={labelCls}>State where the customer is physically located *<Prov f={f.state} /></span>
                    <select value={review.current_physical_state ?? ""} onChange={(e) => set("current_physical_state", e.target.value)} className={fieldCls(f.state, review.current_physical_state)}>
                      <option value="">Select state</option>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select></label>
                  <label className="block"><span className={labelCls}>Address<Prov f={f.address} /></span><input value={review.address ?? ""} onChange={(e) => set("address", e.target.value)} className={`${inputCls} border-gray-300`} /></label>
                </div>
              </fieldset>

              {/* Animals */}
              <fieldset className="rounded-xl border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Animals · {(review.animals ?? []).length} of {f.pet_count?.value ?? "?"} listed<Prov f={f.pet_count} /></legend>
                {(review.animals ?? []).length === 0 && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">No animal was found in the PDF. At least one animal is required.</p>}
                <div className="space-y-2">
                  {(review.animals ?? []).map((a, i) => {
                    const ep = draft.extracted_pets?.[i];
                    return (
                      <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-6">
                        <label className="block sm:col-span-2"><span className={labelCls}>Name *<Prov f={ep?.name} /></span><input value={a.name} onChange={(e) => setAnimal(i, { name: e.target.value })} className={fieldCls(ep?.name, a.name)} /></label>
                        <label className="block"><span className={labelCls}>Type *<Prov f={ep?.type} /></span><input value={a.type} onChange={(e) => setAnimal(i, { type: e.target.value })} className={fieldCls(ep?.type, a.type)} placeholder="Dog" /></label>
                        <label className="block"><span className={labelCls}>Breed<Prov f={ep?.breed} /></span><input value={a.breed ?? ""} onChange={(e) => setAnimal(i, { breed: e.target.value })} className={`${inputCls} border-gray-300`} /></label>
                        <label className="block"><span className={labelCls}>Age<Prov f={ep?.age} /></span><input value={a.age ?? ""} onChange={(e) => setAnimal(i, { age: e.target.value })} className={`${inputCls} border-gray-300`} /></label>
                        <div className="flex items-end gap-1">
                          <label className="block flex-1"><span className={labelCls}>Weight<Prov f={ep?.weight} /></span><input value={a.weight ?? ""} onChange={(e) => setAnimal(i, { weight: e.target.value })} className={`${inputCls} border-gray-300`} /></label>
                          <button type="button" onClick={() => set("animals", (review.animals ?? []).filter((_, j) => j !== i))} className="mb-1 rounded p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove animal"><i className="ri-delete-bin-line"></i></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => set("animals", [...(review.animals ?? []), { name: "", type: "" }])} className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">+ Add animal</button>
              </fieldset>

              {/* Assessment */}
              <fieldset className="rounded-xl border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Assessment answers{review.service === "psd" ? " — canonical PSD questionnaire" : ""}</legend>
                {review.service === "psd" ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-600">PSD is clinical work: answers must map onto PawTenant's canonical PSD questions. Pre-filled where the partner's wording matched — verify each against the PDF. Never enter an answer the partner did not collect.</p>
                    {PSD_QUESTIONNAIRE_ITEMS.filter((q) => q.kind !== "evidence").map((q: PsdQuestion) => {
                      const val = review.answers?.[q.key];
                      const missing = val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
                      return (
                        <div key={q.key} className={`rounded-lg p-2 ${missing ? "bg-red-50/60" : "bg-gray-50"}`}>
                          <span className={labelCls}>{q.n}. {q.label} *</span>
                          {q.kind === "single" && q.options ? (
                            <select value={typeof val === "string" ? val : ""} onChange={(e) => setAnswer(q.key, e.target.value)} className={`${inputCls} ${missing ? "border-red-300" : "border-gray-300"}`}>
                              <option value="">— not answered in PDF —</option>
                              {Object.entries(q.options).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                            </select>
                          ) : q.kind === "multi" ? (
                            <textarea rows={2} value={Array.isArray(val) ? val.join("; ") : (val ?? "")} onChange={(e) => setAnswer(q.key, e.target.value.split(/;|\n/).map((s) => s.trim()).filter(Boolean))} placeholder="Separate items with ;" className={`${inputCls} ${missing ? "border-red-300" : "border-gray-300"}`} />
                          ) : (
                            <textarea rows={2} value={typeof val === "string" ? val : ""} onChange={(e) => setAnswer(q.key, e.target.value)} className={`${inputCls} ${missing ? "border-red-300" : "border-gray-300"}`} />
                          )}
                          {q.followUp && (
                            <label className="mt-1 block"><span className={labelCls}>{q.followUp.label} (optional)</span>
                              <input value={typeof review.answers?.[q.followUp.key] === "string" ? (review.answers?.[q.followUp.key] as string) : ""} onChange={(e) => setAnswer(q.followUp!.key, e.target.value)} className={`${inputCls} border-gray-300`} /></label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">Question/answer pairs found in the PDF. Correct any answer, or clear it to leave it out.</p>
                    {esaQa.length === 0 && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">No questionnaire answers were found. At least one answer is required — add the partner's questions below.</p>}
                    {esaQa.map((q) => (
                      <div key={q.key} className="rounded-lg bg-gray-50 p-2">
                        <span className={labelCls}>{q.question}{q.page !== undefined && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">p{q.page} · {Math.round((q.confidence ?? 0) * 100)}%</span>}</span>
                        <textarea rows={2} value={typeof review.answers?.[q.key] === "string" ? (review.answers?.[q.key] as string) : ""} onChange={(e) => setAnswer(q.key, e.target.value)} className={`${inputCls} ${(q.confidence ?? 1) < 0.7 ? "border-amber-300" : "border-gray-300"}`} />
                      </div>
                    ))}
                    <AddQuestion onAdd={(question, answer) => setAnswer(qKey(question), answer)} />
                  </div>
                )}
                {showPages && (
                  <details className="mt-3 rounded-lg border border-gray-200 bg-white p-2 text-xs" open>
                    <summary className="cursor-pointer font-medium text-gray-700">Raw extracted Q/A ({draft.extracted_qa?.length ?? 0})</summary>
                    <ul className="mt-2 space-y-1">{(draft.extracted_qa ?? []).map((q, i) => <li key={i}><span className="text-gray-500">p{q.page}</span> <strong>{q.question}</strong> → {q.answer || <em>no answer</em>}</li>)}</ul>
                  </details>
                )}
              </fieldset>

              {/* Consultation / notes */}
              <fieldset className="rounded-xl border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Consultation & notes</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block"><span className={labelCls}>Consultation information<Prov f={f.consultation} /></span><input value={review.consultation ?? ""} onChange={(e) => set("consultation", e.target.value)} className={`${inputCls} border-gray-300`} /></label>
                  <label className="block"><span className={labelCls}>Relevant notes<Prov f={f.notes} /></span><input value={review.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} border-gray-300`} /></label>
                </div>
              </fieldset>

              {/* Consents */}
              <fieldset className="rounded-xl border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Consent evidence (from the partner's order)</legend>
                <p className="mb-2 text-xs text-gray-600">Tick only what the partner's PDF or order record evidences. Your attestation and the source draft are recorded with the order.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={review.consents?.telehealth === true} onChange={(e) => set("consents", { ...(review.consents ?? {}), telehealth: e.target.checked })} /> Telehealth consent *</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={review.consents?.privacy_data_transfer === true} onChange={(e) => set("consents", { ...(review.consents ?? {}), privacy_data_transfer: e.target.checked })} /> Privacy / data transfer *</label>
                  <label className="block"><span className={labelCls}>E-signature name *</span><input value={review.consents?.signature_name ?? ""} onChange={(e) => set("consents", { ...(review.consents ?? {}), signature_name: e.target.value })} className={fieldCls(undefined, review.consents?.signature_name)} /></label>
                </div>
              </fieldset>

              {issues.length > 0 && (
                <div className={`rounded-lg border px-3 py-2 text-xs ${blocking.length ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                  <p className="font-semibold">{blocking.length ? `${blocking.length} item(s) block order creation` : "Review passes validation"}</p>
                  <ul className="mt-1 list-disc pl-4">{issues.map((i, n) => <li key={n}><span className="font-mono">{i.code}</span>{i.messages?.length ? ` — ${i.messages.join(" · ")}` : ""}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {step === 5 && draft && (
            <div className="space-y-4">
              {result ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <i className="ri-checkbox-circle-line text-3xl text-emerald-600"></i>
                  <p className="mt-1 text-lg font-bold text-emerald-900">{result.replayed ? "Order already existed" : "Partner order created"}</p>
                  <p className="font-mono text-sm text-emerald-800">{result.confirmation_id}</p>
                  <p className="mt-1 text-xs text-emerald-800">It is now in the normal paid / unassigned queue and will be assigned to a licensed provider like any other order.</p>
                  <button type="button" onClick={() => void onOpenOrder(result.order_id)} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Open order</button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700">Confirm what will be created. The partner charge is selected and frozen <strong>server-side</strong> at creation from the partner's current rate — the value below is the current rate for reference.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order</p>
                      <p className="mt-1"><strong>{partner?.display_name}</strong> · external ref <span className="font-mono">{review.external_order_id}</span></p>
                      <p>{review.service?.toUpperCase()} · {(review.animals ?? []).length} animal(s) · {Object.keys(review.answers ?? {}).length} answer(s)</p>
                      <p>{review.first_name} {review.last_name} · {review.current_physical_state}</p>
                      <p className="text-xs text-gray-500">{review.email}</p>
                    </div>
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Partner charge (wholesale)</p>
                      <p className="mt-1 text-2xl font-bold text-indigo-900">{rate ? money(rate.cents) : "No current rate"}</p>
                      <p className="text-xs text-indigo-800">{rate ? `rate v${rate.version} · ${rate.environment} · billable on clinical completion` : "Set a rate in Settings → Partner profile before creating this order."}</p>
                    </div>
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
                    <li>A PawTenant confirmation ID is generated; the partner's external order ID is kept separately.</li>
                    <li>The order enters the normal paid / unassigned provider queue with the normal licensing and assignment rules.</li>
                    <li><strong>No Stripe payment</strong> is recorded and <strong>no customer email or SMS</strong> is sent — the partner owns the customer relationship.</li>
                    <li>The provider sees a neutral <em>Partner Case</em>, never the partner's brand or economics.</li>
                    <li>The source PDF and extraction record stay attached to this draft, privately, for audit.</li>
                  </ul>
                  {draft.status !== "reviewed" && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">This draft is not marked ready — go back to Review and save it first.</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 sm:px-5">
          <div className="flex gap-2">
            {draft && !result && draft.status !== "committed" && (
              <button type="button" disabled={busy !== null} onClick={() => setConfirmCancel(true)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700">Cancel draft</button>
            )}
          </div>
          <div className="flex gap-2">
            {step > 1 && !result && step !== 3 && <button type="button" disabled={busy !== null} onClick={() => setStep((s) => (draft && s === 4 ? 3 : (Math.max(1, s - 1) as Step)))} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700">Back</button>}
            {step === 1 && <button type="button" disabled={!partnerId} onClick={() => setStep(2)} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Continue</button>}
            {step === 2 && <button type="button" disabled={!file || busy !== null} onClick={() => void upload()} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Upload & extract</button>}
            {step === 4 && <button type="button" disabled={busy !== null} onClick={() => void saveReview(false)} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700">Save review</button>}
            {step === 4 && <button type="button" disabled={busy !== null} onClick={() => void saveReview(true)} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Save & continue</button>}
            {step === 5 && !result && <button type="button" disabled={busy !== null || draft?.status !== "reviewed" || !rate} onClick={() => void commit()} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Create partner order</button>}
            {result && <button type="button" onClick={onClose} className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white">Done</button>}
          </div>
        </div>
      </div>
      {confirmCancel && (
        <ConfirmDialog title="Cancel this intake draft?" body="The uploaded PDF and its extracted text are deleted. The draft stays in history for audit. No order is affected." confirmLabel="Cancel draft" onConfirm={() => void cancelDraft()} onCancel={() => setConfirmCancel(false)} />
      )}
    </div>
  );
}

function AddQuestion({ onAdd }: { onAdd: (question: string, answer: string) => void }) {
  const [q, setQ] = useState(""); const [a, setA] = useState("");
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-gray-300 p-2 sm:grid-cols-5">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question as written in the PDF" className={`${inputCls} border-gray-300 sm:col-span-2`} />
      <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Answer as written in the PDF" className={`${inputCls} border-gray-300 sm:col-span-2`} />
      <button type="button" disabled={!q.trim() || !a.trim()} onClick={() => { onAdd(q.trim(), a.trim()); setQ(""); setA(""); }} className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-40">+ Add</button>
    </div>
  );
}
