// LegacyImportPanel — Safe WordPress legacy CSV import tool
// CSV is parsed 100% in the browser; only clean mapped objects are sent to the edge function
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

// ── Types ────────────────────────────────────────────────────────────────────
interface ImportResult {
  row: number;
  email: string;
  confirmation_id: string;
  action: "inserted" | "skipped" | "error";
  reason?: string;
}

interface ImportResponse {
  ok: boolean;
  test_mode: boolean;
  total_parsed: number;
  rows_processed: number;
  success_count: number;
  skipped_count: number;
  error_count: number;
  errors: { row: number; email: string; error: string }[];
  results: ImportResult[];
  error?: string;
}

interface MappedRow {
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  status: string;
  letter_type: string;
  price: number | null;
  plan_type: string | null;
  delivery_speed: string | null;
  payment_method: string | null;
  payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referred_by: string | null;
  gclid: string | null;
  fbclid: string | null;
  source_system: string;
  historical_import: boolean;
  doctor_user_id: null;
  doctor_status: string;
  ghl_synced_at: null;
  google_ads_upload_status: string;
  email_confirmation_sent: boolean;
  sms_confirmation_sent: boolean;
  followup_opt_out: boolean;
  seq_opted_out_at: string;
  user_id: null;
}

interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

interface PreviewData {
  totalRows: number;
  headers: string[];
  sampleMapped: Partial<MappedRow>[];
  mappedRows: MappedRow[];
}

type ImportPhase = "idle" | "preview_done" | "test" | "full";
type LoadingState = "idle" | "reading_file" | "previewing" | "importing";

// ── CSV parser (browser-side) ────────────────────────────────────────────────
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(field); field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCSV(text: string): ParsedCSV {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current); current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const rawHeaders = splitCSVLine(nonEmpty[0]);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));

  const rows = nonEmpty.slice(1).map(line => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });

  return { headers, rows };
}

// ── Field resolvers ──────────────────────────────────────────────────────────
function resolve(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

const getEmail      = (r: Record<string, string>) => resolve(r, "email", "email_address", "customer_email", "billing_email").toLowerCase().trim();
const getFirstName  = (r: Record<string, string>) => resolve(r, "first_name", "firstname", "billing_first_name", "fname");
const getLastName   = (r: Record<string, string>) => resolve(r, "last_name", "lastname", "billing_last_name", "lname");
const getPhone      = (r: Record<string, string>) => resolve(r, "phone", "phone_number", "billing_phone", "mobile", "telephone");
const getState      = (r: Record<string, string>) => resolve(r, "state", "billing_state", "us_state", "patient_state", "state_abbr");
const getPrice      = (r: Record<string, string>) => resolve(r, "order_total", "price", "amount", "total", "payment_amount", "cost");
const getCreatedAt  = (r: Record<string, string>) => resolve(r, "created_at", "date", "order_date", "created_date", "submission_date", "timestamp", "date_created");
const getPaidAt     = (r: Record<string, string>) => resolve(r, "paid_at", "payment_date", "date_paid", "paid_date");
const getPaymentId  = (r: Record<string, string>) => resolve(r, "payment_intent_id", "stripe_id", "transaction_id", "stripe_payment_id", "txn_id");
const getRecordType = (r: Record<string, string>) => resolve(r, "record_type", "type", "order_type").toLowerCase().trim();
const getStatus     = (r: Record<string, string>) => resolve(r, "status", "order_status", "record_status").toLowerCase().trim();
const getPayStatus  = (r: Record<string, string>) => resolve(r, "payment_status", "pay_status", "payment_state").toLowerCase().trim();
const getLetterType = (r: Record<string, string>) => resolve(r, "letter_type", "service_type", "product", "service", "letter", "product_name").toLowerCase();
const getConfId     = (r: Record<string, string>) => resolve(r, "legacy_order_id", "order_id", "confirmation_id", "order_number", "id", "order_num");
const getUtmSource  = (r: Record<string, string>) => resolve(r, "utm_source", "source");
const getUtmMedium  = (r: Record<string, string>) => resolve(r, "utm_medium", "medium");
const getUtmCampaign= (r: Record<string, string>) => resolve(r, "utm_campaign", "campaign");
const getReferredBy = (r: Record<string, string>) => resolve(r, "referred_by", "referral", "channel", "traffic_source", "ref");
const getGclid      = (r: Record<string, string>) => resolve(r, "gclid", "google_click_id");
const getFbclid     = (r: Record<string, string>) => resolve(r, "fbclid", "facebook_click_id");
const getPlanType   = (r: Record<string, string>) => resolve(r, "plan_type", "plan", "package");
const getDelivery   = (r: Record<string, string>) => resolve(r, "delivery_speed", "delivery", "turnaround");
const getPayMethod  = (r: Record<string, string>) => resolve(r, "payment_method", "payment_type", "method");

function resolveStatus(row: Record<string, string>): { status: string; isPaid: boolean } {
  const rt = getRecordType(row);
  const st = getStatus(row);
  const ps = getPayStatus(row);
  if (rt === "paid" || rt === "completed") return { status: "completed", isPaid: true };
  if (rt === "lead" || rt === "unpaid")    return { status: "lead",      isPaid: false };
  if (st.includes("complet") || st.includes("paid") || st.includes("process")) return { status: "completed", isPaid: true };
  if (st.includes("lead") || st.includes("unpaid") || st.includes("pending"))  return { status: "lead",      isPaid: false };
  if (ps === "paid" || ps === "completed") return { status: "completed", isPaid: true };
  return { status: "lead", isPaid: false };
}

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : Math.round(n);
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

function buildConfirmationId(row: Record<string, string>, index: number): string {
  const existing = getConfId(row);
  if (existing) {
    if (existing.startsWith("LEGACY-") || existing.startsWith("PT-")) return existing;
    return `LEGACY-${existing}`;
  }
  return `LEGACY-IDX-${index}`;
}

function resolveLetterType(row: Record<string, string>): "esa" | "psd" {
  const raw = getLetterType(row);
  return (raw.includes("psd") || raw.includes("psychiatric") || raw.includes("service")) ? "psd" : "esa";
}

// ── Map a CSV row → DB payload ───────────────────────────────────────────────
function mapRow(row: Record<string, string>, index: number, now: string): MappedRow {
  const { status, isPaid } = resolveStatus(row);
  const letterType = resolveLetterType(row);
  const price = parsePrice(getPrice(row));
  const createdAt = parseDate(getCreatedAt(row)) ?? now;
  const paidAt = isPaid ? (parseDate(getPaidAt(row)) ?? createdAt) : null;
  const rawPaymentId = getPaymentId(row);
  const confirmationId = buildConfirmationId(row, index);
  const paymentIntentId = isPaid ? (rawPaymentId || `LEGACY-PAID-${confirmationId}`) : null;

  return {
    confirmation_id:          confirmationId,
    email:                    getEmail(row),
    first_name:               getFirstName(row) || null,
    last_name:                getLastName(row) || null,
    phone:                    getPhone(row) || null,
    state:                    getState(row) || null,
    status,
    letter_type:              letterType,
    price,
    plan_type:                getPlanType(row) || null,
    delivery_speed:           getDelivery(row) || null,
    payment_method:           getPayMethod(row) || null,
    payment_intent_id:        paymentIntentId,
    paid_at:                  paidAt,
    created_at:               createdAt,
    utm_source:               getUtmSource(row) || null,
    utm_medium:               getUtmMedium(row) || null,
    utm_campaign:             getUtmCampaign(row) || null,
    referred_by:              getReferredBy(row) || null,
    gclid:                    getGclid(row) || null,
    fbclid:                   getFbclid(row) || null,
    source_system:            "wordpress_legacy",
    historical_import:        true,
    doctor_user_id:           null,
    doctor_status:            "pending_review",
    ghl_synced_at:            null,
    google_ads_upload_status: "skip_historical",
    email_confirmation_sent:  false,
    sms_confirmation_sent:    false,
    followup_opt_out:         true,
    seq_opted_out_at:         now,
    user_id:                  null,
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function LegacyImportPanel() {
  const [csvText, setCsvText] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [testResult, setTestResult] = useState<ImportResponse | null>(null);
  const [fullResult, setFullResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState("");
  const [showAllResults, setShowAllResults] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loading = loadingState !== "idle";

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setLoadingState("reading_file");
    try {
      const text = await readFileAsText(file);
      setCsvText(text);
      setPhase("idle");
      setPreview(null);
    } catch {
      setError("Could not read file — try again");
    }
    setLoadingState("idle");
  };

  // Parse CSV in browser and build preview + mapped rows
  const runPreview = () => {
    if (!csvText.trim()) { setError("No CSV content — upload a file or paste CSV first"); return; }
    setError("");
    setLoadingState("previewing");

    try {
      const { headers, rows } = parseCSV(csvText);
      if (rows.length === 0) {
        setError(`CSV parsed 0 data rows. Headers found: [${headers.join(", ")}]. Check the file has data rows below the header.`);
        setLoadingState("idle");
        return;
      }

      const now = new Date().toISOString();
      const mappedRows = rows.map((r, i) => mapRow(r, i, now));

      // Sample: first 3 rows, only non-null fields
      const sampleMapped = mappedRows.slice(0, 3).map(r => {
        const out: Partial<MappedRow> = {};
        (Object.keys(r) as (keyof MappedRow)[]).forEach(k => {
          if (r[k] !== null && r[k] !== false && r[k] !== "" && k !== "user_id" && k !== "doctor_user_id" && k !== "ghl_synced_at") {
            (out as Record<string, unknown>)[k] = r[k];
          }
        });
        return out;
      });

      setPreview({ totalRows: rows.length, headers, sampleMapped, mappedRows });
      setPhase("preview_done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    }
    setLoadingState("idle");
  };

  const callEdgeFunction = async (mappedRows: MappedRow[], testMode: boolean): Promise<ImportResponse> => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/legacy-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: mappedRows, test_mode: testMode }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Edge function returned ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  };

  const runImport = async (testMode: boolean) => {
    if (!preview?.mappedRows?.length) { setError("Run Preview first to parse the CSV"); return; }
    setError("");
    setLoadingState("importing");
    try {
      const data = await callEdgeFunction(preview.mappedRows, testMode);
      if (!data.ok) { setError(data.error ?? "Import failed"); setLoadingState("idle"); return; }
      if (testMode) { setTestResult(data); setPhase("test"); }
      else          { setFullResult(data); setPhase("full"); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error — could not reach edge function");
    }
    setLoadingState("idle");
  };

  const reset = () => {
    setPhase("idle");
    setPreview(null);
    setTestResult(null);
    setFullResult(null);
    setError("");
    setShowAllResults(false);
    setLoadingState("idle");
    setCsvText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const loadingLabel =
    loadingState === "reading_file" ? "Reading file..." :
    loadingState === "previewing"   ? "Parsing CSV..." :
    loadingState === "importing"    ? "Importing..." : "";

  const rowCount = csvText ? csvText.split("\n").filter(l => l.trim()).length - 1 : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-xl flex-shrink-0">
            <i className="ri-upload-cloud-2-line text-amber-600 text-base"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Legacy WordPress Import</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Import historical orders &amp; leads from WordPress — safe, no automations triggered
            </p>
          </div>
        </div>
        {phase !== "idle" && (
          <button
            type="button"
            onClick={reset}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
          >
            <i className="ri-refresh-line"></i>Start Over
          </button>
        )}
      </div>

      <div className="px-5 py-5 space-y-5">

        {/* Safety notice */}
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <i className="ri-shield-check-line text-amber-600 text-base flex-shrink-0 mt-0.5"></i>
          <div className="text-xs text-amber-800 leading-relaxed">
            <strong>Safe import mode:</strong> No emails, SMS, Stripe, GHL, Google Ads, or provider assignment will be triggered.
            All records are tagged <code className="bg-amber-100 px-1 rounded">source_system = wordpress_legacy</code> and <code className="bg-amber-100 px-1 rounded">historical_import = true</code>.
            Existing live orders are never overwritten.
          </div>
        </div>

        {/* ── Step 1: Load CSV ── */}
        {(phase === "idle" || phase === "preview_done") && (
          <>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">Step 1 — Load your CSV file</p>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-3">
                {[
                  { key: "file",  label: "Upload File", icon: "ri-file-upload-line" },
                  { key: "paste", label: "Paste CSV",   icon: "ri-clipboard-line" },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setInputMode(m.key as typeof inputMode)}
                    className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${inputMode === m.key ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <i className={m.icon}></i>{m.label}
                  </button>
                ))}
              </div>

              {inputMode === "file" && (
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#1a5c4f] transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <i className="ri-file-upload-line text-3xl text-gray-300 block mb-2"></i>
                  {csvText ? (
                    <div>
                      <p className="text-sm font-bold text-[#1a5c4f]">
                        <i className="ri-checkbox-circle-fill mr-1"></i>File loaded
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{rowCount} data rows detected — click Preview to verify</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-gray-500">Click to select your CSV file</p>
                      <p className="text-xs text-gray-400 mt-1">Accepts .csv files</p>
                    </div>
                  )}
                </div>
              )}

              {inputMode === "paste" && (
                <div>
                  <textarea
                    value={csvText}
                    onChange={(e) => { setCsvText(e.target.value); setPhase("idle"); setPreview(null); }}
                    placeholder="Paste your CSV here (with header row)..."
                    rows={8}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:border-[#1a5c4f] resize-y"
                  />
                  {csvText && (
                    <p className="text-xs text-[#1a5c4f] mt-1 font-semibold">
                      <i className="ri-checkbox-circle-fill mr-1"></i>
                      {rowCount} data rows detected
                    </p>
                  )}
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}

            {/* Step 2: Preview */}
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">Step 2 — Preview column mapping</p>
              <button
                type="button"
                onClick={runPreview}
                disabled={loading || !csvText.trim()}
                className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white text-sm font-extrabold rounded-xl hover:bg-gray-900 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loadingState === "previewing" ? (
                  <><i className="ri-loader-4-line animate-spin"></i>Parsing CSV...</>
                ) : (
                  <><i className="ri-eye-line"></i>Preview Columns</>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Preview result ── */}
        {phase === "preview_done" && preview && (
          <div className="space-y-4">
            <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-center gap-3">
              <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-lg flex-shrink-0"></i>
              <div>
                <p className="text-sm font-extrabold text-[#1a5c4f]">CSV parsed — {preview.totalRows} rows ready</p>
                <p className="text-xs text-[#1a5c4f]/70 mt-0.5">{preview.headers.length} columns detected. Verify the sample below looks correct.</p>
              </div>
            </div>

            {/* Detected headers */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-700 mb-2">Detected CSV columns ({preview.headers.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.headers.map(h => (
                  <span key={h} className="px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[10px] font-mono text-gray-600">{h}</span>
                ))}
              </div>
            </div>

            {/* Sample rows */}
            {preview.sampleMapped.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-700 mb-2">Sample mapping (first {preview.sampleMapped.length} rows)</p>
                <div className="space-y-3">
                  {preview.sampleMapped.map((s, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      {(Object.entries(s) as [string, unknown][]).map(([k, v]) => (
                        <div key={k} className="bg-white rounded-lg border border-gray-200 px-2 py-1.5">
                          <p className="text-gray-400 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                          <p className="text-gray-800 font-mono truncate">{String(v)}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Run test */}
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">Step 3 — Run test import (5 rows)</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => runImport(true)}
                  disabled={loading}
                  className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {loadingState === "importing" ? (
                    <><i className="ri-loader-4-line animate-spin"></i>Importing...</>
                  ) : (
                    <><i className="ri-test-tube-line"></i>Run Test Import (5 rows)</>
                  )}
                </button>
                <p className="text-xs text-gray-400">Inserts only 5 rows so you can verify before the full run.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Test result ── */}
        {phase === "test" && testResult && (
          <div className="space-y-4">
            <ResultSummary result={testResult} isTest />
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i><span>{error}</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => runImport(false)}
                disabled={loading}
                className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loadingState === "importing" ? (
                  <><i className="ri-loader-4-line animate-spin"></i>Importing...</>
                ) : (
                  <><i className="ri-upload-cloud-2-line"></i>Run Full Import ({testResult.total_parsed} rows)</>
                )}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={loading}
                className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 disabled:opacity-50 cursor-pointer transition-colors"
              >
                <i className="ri-close-line"></i>Cancel
              </button>
            </div>
            <ResultTable result={testResult} showAll={showAllResults} onShowAll={() => setShowAllResults(true)} />
          </div>
        )}

        {/* ── Full import result ── */}
        {phase === "full" && fullResult && (
          <div className="space-y-4">
            <ResultSummary result={fullResult} isTest={false} />
            <ResultTable result={fullResult} showAll={showAllResults} onShowAll={() => setShowAllResults(true)} />
          </div>
        )}

      </div>
    </div>
  );
}

// ── Result summary cards ─────────────────────────────────────────────────────
function ResultSummary({ result, isTest }: { result: ImportResponse; isTest: boolean }) {
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isTest ? "bg-sky-50 border-sky-200" : result.error_count > 0 ? "bg-amber-50 border-amber-200" : "bg-[#f0faf7] border-[#b8ddd5]"}`}>
        <i className={`text-lg flex-shrink-0 ${isTest ? "ri-test-tube-line text-sky-600" : result.error_count > 0 ? "ri-error-warning-line text-amber-600" : "ri-checkbox-circle-fill text-[#1a5c4f]"}`}></i>
        <div>
          <p className={`text-sm font-extrabold ${isTest ? "text-sky-800" : result.error_count > 0 ? "text-amber-800" : "text-[#1a5c4f]"}`}>
            {isTest
              ? `Test complete — ${result.rows_processed} of ${result.total_parsed} rows previewed`
              : result.error_count > 0
                ? `Import complete with ${result.error_count} error${result.error_count !== 1 ? "s" : ""}`
                : "Import complete — all rows processed successfully"}
          </p>
          <p className={`text-xs mt-0.5 ${isTest ? "text-sky-700" : "text-gray-500"}`}>
            {isTest
              ? "Review below, then click \"Run Full Import\" to process all rows."
              : `${result.success_count} inserted · ${result.skipped_count} skipped · ${result.error_count} errors`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isTest ? "Rows Previewed" : "Total Parsed", value: isTest ? result.rows_processed : result.total_parsed, icon: "ri-file-list-3-line", color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Inserted",             value: result.success_count, icon: "ri-checkbox-circle-line", color: "text-[#1a5c4f]",                                    bg: "bg-[#f0faf7]" },
          { label: "Skipped (Duplicates)", value: result.skipped_count, icon: "ri-skip-forward-line",   color: "text-amber-600",                                    bg: "bg-amber-50"  },
          { label: "Errors",               value: result.error_count,   icon: "ri-error-warning-line",  color: result.error_count > 0 ? "text-red-600" : "text-gray-400", bg: result.error_count > 0 ? "bg-red-50" : "bg-gray-50" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4`}>
            <div className="w-7 h-7 flex items-center justify-center bg-white rounded-lg mb-2">
              <i className={`${s.icon} ${s.color} text-sm`}></i>
            </div>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Result table ─────────────────────────────────────────────────────────────
function ResultTable({ result, showAll, onShowAll }: { result: ImportResponse; showAll: boolean; onShowAll: () => void }) {
  const displayRows = showAll ? result.results : result.results.slice(0, 25);
  const hasMore = result.results.length > 25 && !showAll;

  if (result.results.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">Row-by-row results</p>
        <span className="text-xs text-gray-400">{result.results.length} rows</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
        {displayRows.map((r) => (
          <div key={`${r.row}-${r.email}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-[10px] text-gray-400 font-mono w-6 flex-shrink-0">#{r.row}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold flex-shrink-0 ${
              r.action === "inserted" ? "bg-[#f0faf7] text-[#1a5c4f]" :
              r.action === "skipped"  ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-600"
            }`}>
              <i className={r.action === "inserted" ? "ri-checkbox-circle-fill" : r.action === "skipped" ? "ri-skip-forward-line" : "ri-error-warning-line"}></i>
              {r.action}
            </span>
            <span className="text-xs text-gray-700 font-mono truncate flex-1">{r.email}</span>
            <span className="text-[10px] text-gray-400 font-mono truncate max-w-[140px] hidden sm:block">{r.confirmation_id}</span>
            {r.reason && (
              <span className="text-[10px] text-gray-400 truncate max-w-[160px] hidden md:block">{r.reason}</span>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="px-4 py-3 border-t border-gray-100 text-center">
          <button type="button" onClick={onShowAll} className="whitespace-nowrap text-xs font-bold text-[#1a5c4f] hover:underline cursor-pointer">
            Show all {result.results.length} rows
          </button>
        </div>
      )}
    </div>
  );
}
