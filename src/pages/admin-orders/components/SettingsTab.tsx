// SettingsTab — GHL, Stripe, and Email integration health
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import UTMLinkGenerator from "./UTMLinkGenerator";
import AdminNotificationPrefsPanel from "./AdminNotificationPrefsPanel";

interface GhlStats {
  total: number;
  synced: number;
  failed: number;
  pending: number;
  lastSync: string | null;
  lastAttempt: string | null;
  recentErrors: { confirmation_id: string; email: string; error: string }[];
}

interface StripeStats {
  ok: boolean;
  total_revenue: number;
  available_balance: number;
  charge_count: number;
  refund_count: number;
  error?: string;
}

interface BulkRetryState {
  running: boolean;
  total: number;
  done: number;
  successCount: number;
  failCount: number;
  finished: boolean;
  mode?: "unsynced" | "all";
}

const INIT_BULK: BulkRetryState = { running: false, total: 0, done: 0, successCount: 0, failCount: 0, finished: false };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button type="button" onClick={handle}
      className="whitespace-nowrap flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-200 cursor-pointer transition-colors">
      <i className={copied ? "ri-checkbox-circle-line text-[#3b6ea5]" : "ri-file-copy-line"}></i>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${ok ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-red-100 text-red-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? "bg-[#3b6ea5]" : "bg-red-500"}`}></span>
      {label}
    </span>
  );
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
}

// ── GHL Webhook URLs ──────────────────────────────────────────────────────────
// IMPORTANT: These URLs are displayed for reference only.
// The edge functions use Supabase secrets — NOT these constants directly.
// Set GHL_WEBHOOK_URL and GHL_COMMS_WEBHOOK_URL in Supabase Edge Function Secrets.
const GHL_WEBHOOK_MAIN = "https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/6feb660d-6ee0-4a71-a2c0-732264440592";
const GHL_WEBHOOK_NETWORK = "https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/cfdc1278-5813-46c9-901e-39165cf0f1f3";

// ── BAA & Retention types ──────────────────────────────────────────────────
type BaaStatus = "signed" | "pending" | "not_started";

interface BaaEntry {
  key: string;
  vendor: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  docUrl: string;
  planNote: string;
}

interface RetentionSettings {
  completedOrders: string;
  auditLogs: string;
  patientDocuments: string;
  leadData: string;
  autoArchive: boolean;
  archiveNotifyEmail: string;
}

const BAA_VENDORS: BaaEntry[] = [
  {
    key: "supabase",
    vendor: "Supabase",
    description: "Database, Auth, Storage, Edge Functions — stores all PHI (orders, patient info, letters).",
    icon: "ri-database-2-line",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
    docUrl: "https://supabase.com/docs/guides/security/hipaa",
    planNote: "BAA available on Pro plan or higher. Request via Dashboard → Settings → Compliance.",
  },
  {
    key: "stripe",
    vendor: "Stripe",
    description: "Payment processing — handles customer billing and payment records.",
    icon: "ri-bank-card-line",
    iconBg: "bg-[#e8f0f9]",
    iconColor: "text-[#3b6ea5]",
    docUrl: "https://stripe.com/guides/hipaa",
    planNote: "Stripe is not itself a HIPAA-covered service (payment data ≠ PHI). A BAA is generally not required unless you pass PHI in payment metadata.",
  },
  {
    key: "email_provider",
    vendor: "Email Provider (Resend / SendGrid / Postmark)",
    description: "Transactional emails — sends ESA letters, order confirmations, and patient notifications containing PHI.",
    icon: "ri-mail-send-line",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    docUrl: "https://resend.com/docs/knowledge-base/hipaa",
    planNote: "BAA required — emails contain PHI (patient name, letter content). Resend, SendGrid, and Postmark all offer BAAs on paid plans.",
  },
  {
    key: "ghl",
    vendor: "GoHighLevel (GHL)",
    description: "CRM — receives synced contact data including name, email, phone, and state.",
    icon: "ri-radar-line",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    docUrl: "https://help.gohighlevel.com/support/solutions/articles/155000003544",
    planNote: "BAA available — request through GHL support or your account manager. Required if you sync any PHI fields to GHL contacts.",
  },
];

const RETENTION_OPTIONS = [
  { value: "1_year", label: "1 Year" },
  { value: "2_years", label: "2 Years" },
  { value: "3_years", label: "3 Years" },
  { value: "5_years", label: "5 Years" },
  { value: "7_years", label: "7 Years (HIPAA minimum)" },
  { value: "10_years", label: "10 Years" },
  { value: "indefinite", label: "Indefinite (No archival)" },
];

const DEFAULT_RETENTION: RetentionSettings = {
  completedOrders: "7_years",
  auditLogs: "7_years",
  patientDocuments: "7_years",
  leadData: "2_years",
  autoArchive: false,
  archiveNotifyEmail: "",
};

function BaaStatusBadge({ status }: { status: BaaStatus }) {
  if (status === "signed") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#e8f0f9] text-[#3b6ea5]">
      <i className="ri-shield-check-fill text-[#3b6ea5]" style={{ fontSize: "10px" }}></i>BAA Signed
    </span>
  );
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
      <i className="ri-time-line" style={{ fontSize: "10px" }}></i>In Progress
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600">
      <i className="ri-alert-line" style={{ fontSize: "10px" }}></i>Action Required
    </span>
  );
}

// ── BAA Panel ────────────────────────────────────────────────────────────────
function BaaPanel() {
  const [statuses, setStatuses] = useState<Record<string, BaaStatus>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hipaa_baa_statuses");
      if (saved) setStatuses(JSON.parse(saved) as Record<string, BaaStatus>);
    } catch { /* ignore */ }
  }, []);

  const setStatus = (key: string, status: BaaStatus) => {
    const next = { ...statuses, [key]: status };
    setStatuses(next);
    localStorage.setItem("hipaa_baa_statuses", JSON.stringify(next));
  };

  const signedCount = BAA_VENDORS.filter((v) => statuses[v.key] === "signed").length;
  const allSigned = signedCount === BAA_VENDORS.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-indigo-50 rounded-xl flex-shrink-0">
            <i className="ri-shield-keyhole-line text-indigo-600 text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">HIPAA BAA Compliance Tracker</h3>
            <p className="text-xs text-gray-400">Track Business Associate Agreements with third-party vendors handling PHI.</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${allSigned ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-red-50 text-red-600"}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${allSigned ? "bg-[#3b6ea5]" : "bg-red-500"}`}></span>
          {signedCount}/{BAA_VENDORS.length} Signed
        </span>
      </div>

      <div className="px-5 py-5 space-y-3">
        {/* Summary bar */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-1">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-indigo-600 text-sm mt-0.5 flex-shrink-0"></i>
            <div>
              <p className="text-xs font-bold text-indigo-800 mb-1">What is a BAA?</p>
              <p className="text-xs text-indigo-700 leading-relaxed">
                A Business Associate Agreement (BAA) is a legally required contract under HIPAA between a Covered Entity (you) and any vendor that handles Protected Health Information (PHI) on your behalf.
                Without a signed BAA, transmitting PHI to that vendor is a HIPAA violation regardless of technical safeguards.
              </p>
            </div>
          </div>
        </div>

        {/* Coverage progress */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold">BAA Coverage</span>
            <span className="font-bold">{Math.round((signedCount / BAA_VENDORS.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all"
              style={{ width: `${(signedCount / BAA_VENDORS.length) * 100}%`, backgroundColor: allSigned ? "#3b6ea5" : signedCount > 1 ? "#f59e0b" : "#ef4444" }}>
            </div>
          </div>
        </div>

        {/* Vendor rows */}
        {BAA_VENDORS.map((v) => {
          const status: BaaStatus = statuses[v.key] ?? "not_started";
          const isOpen = expandedKey === v.key;
          return (
            <div key={v.key} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setExpandedKey(isOpen ? null : v.key)}
              >
                <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${v.iconBg}`}>
                  <i className={`${v.icon} ${v.iconColor} text-sm`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{v.vendor}</p>
                  <p className="text-xs text-gray-500 truncate">{v.description}</p>
                </div>
                <BaaStatusBadge status={status} />
                <i className={`${isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-400 text-sm flex-shrink-0`}></i>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div className="px-4 py-4 border-t border-gray-100 bg-white">
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">{v.planNote}</p>

                  {/* Status picker */}
                  <div className="mb-4">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Update BAA Status</p>
                    <div className="flex gap-2 flex-wrap">
                      {(["not_started", "pending", "signed"] as BaaStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(v.key, s)}
                          className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                            status === s
                              ? s === "signed" ? "bg-[#3b6ea5] text-white border-[#3b6ea5]"
                                : s === "pending" ? "bg-amber-500 text-white border-amber-500"
                                : "bg-red-500 text-white border-red-500"
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {s === "not_started" ? "Action Required" : s === "pending" ? "In Progress" : "BAA Signed"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <a
                    href={v.docUrl}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    <i className="ri-external-link-line"></i>
                    View BAA documentation for {v.vendor}
                  </a>
                </div>
              )}
            </div>
          );
        })}

        {/* Not-signed warning */}
        {!allSigned && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <i className="ri-alert-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
            <div>
              <p className="text-xs font-bold text-red-700 mb-0.5">Compliance Gap Detected</p>
              <p className="text-xs text-red-600 leading-relaxed">
                {BAA_VENDORS.filter((v) => (statuses[v.key] ?? "not_started") !== "signed").map((v) => v.vendor).join(", ")} —
                {" "}no signed BAA on record. Operating without a BAA while transmitting PHI is a HIPAA violation.
                Mark each as &ldquo;In Progress&rdquo; once the request is submitted, and &ldquo;BAA Signed&rdquo; once the executed agreement is on file.
              </p>
            </div>
          </div>
        )}

        {allSigned && (
          <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4 flex items-center gap-3">
            <i className="ri-shield-check-fill text-[#3b6ea5] text-lg"></i>
            <div>
              <p className="text-xs font-bold text-[#3b6ea5]">All BAAs on Record</p>
              <p className="text-xs text-[#2d5a8e]">Technical BAA coverage is complete. Remember to also maintain written policies, staff training records, and a risk assessment to fully satisfy HIPAA requirements.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Data Retention Panel ──────────────────────────────────────────────────────
function DataRetentionPanel() {
  const [settings, setSettings] = useState<RetentionSettings>(DEFAULT_RETENTION);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("data_retention_settings");
      if (raw) setSettings(JSON.parse(raw) as RetentionSettings);
    } catch { /* ignore */ }
  }, []);

  const update = <K extends keyof RetentionSettings>(key: K, value: RetentionSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem("data_retention_settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const retentionFields: { key: keyof RetentionSettings; label: string; desc: string; icon: string; hipaaNote?: string }[] = [
    { key: "completedOrders", label: "Completed Orders", desc: "Order records, patient info, assessment responses, confirmation IDs.", icon: "ri-file-list-3-line", hipaaNote: "HIPAA requires minimum 6 years from creation date or last use." },
    { key: "auditLogs", label: "Audit Logs", desc: "Admin actions, login events, status changes, and access records.", icon: "ri-history-line", hipaaNote: "Recommended 7+ years for HIPAA Security Rule compliance." },
    { key: "patientDocuments", label: "ESA Letters & Documents", desc: "Signed ESA letters and attached PDF documents.", icon: "ri-file-pdf-line", hipaaNote: "Minimum 6 years; some state laws may require longer (e.g., California: 10 years)." },
    { key: "leadData", label: "Lead / Incomplete Orders", desc: "Assessment started but not completed or not paid.", icon: "ri-user-search-line" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-xl flex-shrink-0">
            <i className="ri-archive-line text-orange-600 text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Data Retention Policy</h3>
            <p className="text-xs text-gray-400">Configure how long each data type is kept before archival.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            saved ? "bg-[#e8f0f9] text-[#3b6ea5] border border-[#b8cce4]" : "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]"
          }`}
        >
          <i className={saved ? "ri-checkbox-circle-fill" : "ri-save-line"}></i>
          {saved ? "Saved!" : "Save Policy"}
        </button>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* HIPAA callout */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <i className="ri-information-line text-orange-600 text-sm mt-0.5 flex-shrink-0"></i>
          <p className="text-xs text-orange-800 leading-relaxed">
            HIPAA requires covered entities to retain certain records for a minimum of <strong>6 years</strong> from creation date or the date they were last in effect (whichever is later).
            Many healthcare attorneys recommend <strong>7 years</strong> as a safe standard. State laws may impose longer requirements — consult your legal counsel.
          </p>
        </div>

        {/* Retention fields */}
        <div className="space-y-3">
          {retentionFields.map((f) => (
            <div key={String(f.key)} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0">
                  <i className={`${f.icon} text-gray-600 text-sm`}></i>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{f.label}</p>
                  <p className="text-xs text-gray-500">{f.desc}</p>
                  {f.hipaaNote && (
                    <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                      <i className="ri-shield-line" style={{ fontSize: "10px" }}></i>{f.hipaaNote}
                    </p>
                  )}
                </div>
              </div>
              <select
                value={settings[f.key] as string}
                onChange={(e) => update(f.key, e.target.value as RetentionSettings[typeof f.key])}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20 cursor-pointer"
              >
                {RETENTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Auto-archive toggle */}
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0">
                <i className="ri-robot-line text-gray-600 text-sm"></i>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Automatic Archival</p>
                <p className="text-xs text-gray-500">When enabled, data reaching its retention limit is automatically flagged for archival review.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => update("autoArchive", !settings.autoArchive)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.autoArchive ? "bg-[#3b6ea5]" : "bg-gray-200"}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${settings.autoArchive ? "translate-x-5" : "translate-x-0"}`}></span>
            </button>
          </div>

          {settings.autoArchive && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Notify this email when archival is triggered</label>
              <input
                type="email"
                value={settings.archiveNotifyEmail}
                onChange={(e) => update("archiveNotifyEmail", e.target.value)}
                placeholder="admin@yourdomain.com"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20"
              />
            </div>
          )}
        </div>

        {/* Summary card */}
        <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
          <p className="text-xs font-bold text-[#3b6ea5] uppercase tracking-widest mb-3">Current Policy Summary</p>
          <div className="grid grid-cols-2 gap-2">
            {retentionFields.map((f) => (
              <div key={String(f.key)} className="bg-white rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="text-xs font-bold text-[#3b6ea5]">
                  {RETENTION_OPTIONS.find((o) => o.value === settings[f.key])?.label ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#2d5a8e] mt-3 leading-relaxed">
            <i className="ri-information-line mr-1"></i>
            This policy is stored locally as a reference. Actual data deletion must be performed manually in Supabase or via a scheduled Edge Function — no data is deleted automatically by this panel.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Google Sheets Sync Panel ─────────────────────────────────────────────────
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1bzuIk-zmKo0xP-1skwQ2wBWQFYuox8IDVQJpIJ4OXto/edit";
const SHEET_COLUMNS = ["Timestamp", "Confirmation ID", "First Name", "Last Name", "Email", "Phone", "State", "Letter Type", "Order Status", "Payment Status", "Landing URL", "Traffic Source"];

function GoogleSheetsSyncPanel({ supabaseUrl }: { supabaseUrl: string }) {
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncResult, setSyncResult] = useState<{ synced: number } | null>(null);
  const [syncError, setSyncError] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(() => localStorage.getItem("sheets_last_synced"));

  const handleSync = async () => {
    setSyncState("syncing");
    setSyncError("");
    setSyncResult(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-to-sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json() as { ok: boolean; synced?: number; error?: string };
      if (json.ok) {
        setSyncState("success");
        setSyncResult({ synced: json.synced ?? 0 });
        const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        setLastSynced(ts);
        localStorage.setItem("sheets_last_synced", ts);
      } else {
        throw new Error(json.error ?? "Sync failed");
      }
    } catch (err) {
      setSyncState("error");
      setSyncError(err instanceof Error ? err.message : "Unknown error");
    }
    setTimeout(() => setSyncState("idle"), 8000);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-green-50 rounded-xl flex-shrink-0">
            <i className="ri-file-excel-2-line text-green-600 text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Google Sheets — Order Records</h3>
            <p className="text-xs text-gray-400">Manual backup of all orders &amp; leads to your Google Sheet</p>
          </div>
        </div>
        <a
          href={SHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 cursor-pointer transition-colors"
        >
          <i className="ri-external-link-line text-sm"></i>
          Open Sheet
        </a>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* Columns reference */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Sheet Column Structure</p>
          <div className="flex flex-wrap gap-2">
            {SHEET_COLUMNS.map((col, i) => (
              <span key={col} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1 text-gray-600 font-medium">
                <span className="text-gray-400 font-normal">{i + 1}.</span>
                {col}
              </span>
            ))}
          </div>
        </div>

        {/* Sync info */}
        <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-[#3b6ea5] text-sm mt-0.5 flex-shrink-0"></i>
            <div className="text-xs text-[#2d5a8e] leading-relaxed space-y-1">
              <p><strong>Auto-sync:</strong> New ESA leads are sent to the sheet automatically when a customer completes Step 2. Payment status updates automatically after checkout.</p>
              <p><strong>Full sync:</strong> Click the button below to wipe and rewrite the entire sheet with all orders from the database — useful to catch up on historical data or after schema changes.</p>
            </div>
          </div>
        </div>

        {/* Last synced */}
        {lastSynced && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <i className="ri-time-line text-gray-400"></i>
            Last full sync: <span className="font-semibold text-gray-700">{lastSynced}</span>
          </div>
        )}

        {/* Sync button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncState === "syncing"}
            className={`whitespace-nowrap flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-extrabold transition-colors cursor-pointer disabled:opacity-60 ${
              syncState === "success"
                ? "bg-green-500 text-white"
                : syncState === "error"
                  ? "bg-red-500 text-white"
                  : "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]"
            }`}
          >
            {syncState === "syncing" && <><i className="ri-loader-4-line animate-spin"></i>Syncing all orders...</>}
            {syncState === "success" && <><i className="ri-checkbox-circle-fill"></i>{syncResult?.synced} rows synced!</>}
            {syncState === "error" && <><i className="ri-error-warning-line"></i>Sync failed</>}
            {syncState === "idle" && <><i className="ri-refresh-line"></i>Sync All Orders to Google Sheets</>}
          </button>
          <p className="text-xs text-gray-400">Rewrites entire sheet. Existing data will be replaced.</p>
        </div>

        {syncState === "error" && syncError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 flex items-start gap-2">
            <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
            {syncError} — check that your Apps Script is deployed and the webhook URL is correct.
          </div>
        )}

        {/* Apps Script setup reminder */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <i className="ri-settings-4-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
            <div>
              <p className="text-xs font-bold text-amber-800 mb-1">Apps Script must be updated first</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Before syncing, make sure you&apos;ve replaced the code in your Google Sheet&apos;s Apps Script with the updated version (12-column format). If you haven&apos;t done this yet, the sync will fail or write to wrong columns.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Communications Templates Hub ─────────────────────────────────────────────

interface EmailTemplate {
  id: string;
  label: string;
  group: string;
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

interface SmsTemplate {
  id: string;
  label: string;
  group: string;
  body: string;
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "order_confirmed",
    label: "Order Confirmed",
    group: "Transactional",
    subject: "Your ESA Letter Order is Confirmed — PawTenant",
    body: `Hi {name},

Thank you for your order! Your ESA letter application has been received and is now being reviewed by one of our licensed mental health professionals.

You can track your order status at any time by logging into your customer portal. We'll notify you as soon as your letter is ready — usually within 24 hours.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "Track My Order",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
  {
    id: "letter_ready",
    label: "ESA Letter Ready",
    group: "Transactional",
    subject: "Your ESA Letter is Ready — Download Now",
    body: `Hi {name},

Great news! Your ESA letter has been reviewed and signed by a licensed mental health professional. Your official ESA letter is now ready to download.

Your letter is valid for housing purposes under the Fair Housing Act. Present it to your landlord or property manager to request reasonable accommodation for your emotional support animal.

If you have any questions about your letter, please don't hesitate to contact us.`,
    ctaLabel: "Download My ESA Letter",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
  {
    id: "renewal",
    label: "ESA Renewal Reminder",
    group: "Marketing",
    subject: "Time to Renew Your ESA Letter — Stay Protected",
    body: `Hi {name},

Your ESA letter may be approaching its annual renewal date. Most landlords and housing providers require an up-to-date letter from a licensed professional.

Renewing is quick and easy — our licensed providers are standing by to complete your evaluation within 24-48 hours.

Don't let your ESA protections lapse. Renew today and keep your housing rights secure.`,
    ctaLabel: "Renew My ESA Letter",
    ctaUrl: "https://pawtenant.com/renew-esa-letter",
  },
  {
    id: "finish_esa",
    label: "Abandoned Checkout Recovery",
    group: "Marketing",
    subject: "You're One Step Away — Complete Your ESA Letter",
    body: `Hi {name},

You're one step away from getting your ESA letter. Complete your order here and get protected today.

Your assessment answers are already saved — just finish the payment and our licensed providers will review your case within 24 hours.`,
    ctaLabel: "Complete My ESA Letter",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "psd_upsell",
    label: "PSD Upgrade Offer",
    group: "Marketing",
    subject: "Upgrade to a Psychiatric Service Dog Letter — Full Public Access",
    body: `Hi {name},

Did you know you can upgrade your ESA letter to a full Psychiatric Service Dog (PSD) letter?

A PSD letter grants your dog access to public spaces, transportation, and more. Unlike ESA letters, PSD protections extend beyond housing under the Americans with Disabilities Act.

Our licensed providers can evaluate your eligibility and issue a PSD letter — usually within 24 hours.`,
    ctaLabel: "Get My PSD Letter",
    ctaUrl: "https://pawtenant.com/how-to-get-psd-letter",
  },
  {
    id: "broadcast_promo",
    label: "Broadcast Promo",
    group: "Broadcast",
    subject: "Exclusive Offer from PawTenant — Just for You",
    body: `Hi {name},

As one of our valued customers, we wanted to share an exclusive offer just for you.

Whether you need a renewal, an upgrade, or a letter for a new pet — our licensed mental health professionals are here to help.

Use the button below to claim your offer. This is a limited-time deal available only to our existing customers.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "Claim My Offer",
    ctaUrl: "https://pawtenant.com/assessment",
  },
];

function buildEmailHtml(subject: string, body: string, ctaLabel: string, ctaUrl: string, previewName = "Jane"): string {
  const previewBody = body.replace(/\{name\}/g, previewName);
  const paragraphs = previewBody
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.65;color:#374151;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const ctaHtml = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${ctaUrl}" style="display:inline-block;background:#3b6ea5;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr>
      <td align="center">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <div style="background:#3b6ea5;padding:28px 32px;text-align:center;">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;" />
            <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.05em;">ESA &amp; PSD Letter Consultations</span>
          </div>
          <div style="padding:32px 36px;">
            ${subject ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${subject}</h1>` : ""}
            ${paragraphs}
            ${ctaHtml}
          </div>
          <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:hello@pawtenant.com" style="color:#3b6ea5;text-decoration:none;">hello@pawtenant.com</a></p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Letter Consultations &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const NEW_TEMPLATE_DEFAULTS: Omit<EmailTemplate, "id"> = {
  label: "New Template",
  group: "Marketing",
  subject: "Subject line here",
  body: `Hi {name},

Write your email body here. Use {name} to personalize with the recipient's name.

Separate paragraphs with a blank line.`,
  ctaLabel: "Click Here",
  ctaUrl: "https://pawtenant.com",
};

const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  { id: "sms_order_confirmed",     label: "Order Confirmed",        group: "Transactional", body: "Hi {name}, your ESA consultation with PawTenant is confirmed! Your Order ID is {order_id}. Track your order anytime at pawtenant.com/my-orders" },
  { id: "sms_documents_ready",     label: "Documents Ready",        group: "Transactional", body: "Hi {name}, great news! Your ESA letter is ready. Log in to download your documents at pawtenant.com/my-orders" },
  { id: "sms_under_review",        label: "Under Review",           group: "Transactional", body: "Hi {name}, your ESA assessment is under review by our licensed provider. We'll notify you as soon as it's complete, usually within 24 hours." },
  { id: "sms_finish_esa",          label: "Finish Your ESA Letter", group: "Lead Recovery",  body: "Hi {name}, you're one step away from your ESA letter! Complete your order here: pawtenant.com/assessment?resume={order_id}" },
  { id: "sms_still_thinking",      label: "Still Thinking?",        group: "Lead Recovery",  body: "Hi {name}, still thinking about your ESA letter? Get it today and avoid housing issues. Complete here: pawtenant.com/assessment?resume={order_id}" },
  { id: "sms_consultation_booked", label: "Consultation Booked",    group: "Lead Recovery",  body: "Hi {name}, your provider consultation with PawTenant is confirmed! Complete your payment to lock in your spot: pawtenant.com/assessment?resume={order_id}" },
  { id: "sms_need_more_info",      label: "Need More Info",          group: "Transactional", body: "Hi {name}, we need a bit more information to complete your ESA assessment. Please reply here or call us and we'll get you sorted quickly!" },
  { id: "sms_follow_up",           label: "Follow Up",              group: "General",        body: "Hi {name}, just checking in on your ESA order. Is there anything we can help you with?" },
  { id: "sms_refund_processed",    label: "Refund Processed",       group: "Transactional", body: "Hi {name}, your refund has been processed and should appear in your account within 3-5 business days. Thank you for your patience." },
];

const DEFAULT_MASTER_LAYOUT = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:#4a9e8a;padding:24px;text-align:center;color:#ffffff;">
        <h1 style="margin:0;font-size:22px;font-weight:800;">PawTenant</h1>
      </td></tr>
      <tr><td style="padding:32px;">{{content}}</td></tr>
      <tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Consultation</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

const SAMPLE_CONTENT = `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>Jane</strong>,</p>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">This is how your template body looks inside the master layout.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td align="center">
  <a href="#" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Sample CTA &rarr;</a>
</td></tr></table>`;

function MasterEmailLayoutPanel() {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("comms_settings")
        .select("value")
        .eq("key", "email_layout_html")
        .maybeSingle();
      setHtml((data?.value as string | null) ?? "");
      setLoading(false);
    })();
  }, []);

  const effective = html || DEFAULT_MASTER_LAYOUT;
  const hasPlaceholder = effective.includes("{{content}}");
  const previewHtml = effective.replace("{{content}}", SAMPLE_CONTENT);

  const save = async () => {
    if (html && !html.includes("{{content}}")) {
      setStatus("ERROR: must include {{content}} placeholder");
      return;
    }
    setSaving(true);
    setStatus("");
    const { error } = await supabase
      .from("comms_settings")
      .upsert({ key: "email_layout_html", value: html || null, updated_at: new Date().toISOString() });
    setSaving(false);
    setStatus(error ? `ERROR: ${error.message}` : "Saved.");
    setTimeout(() => setStatus(""), 3000);
  };

  const resetDefault = () => {
    setHtml("");
    setStatus("Reverted to built-in default (not yet saved).");
  };

  const loadDefaultIntoEditor = () => {
    setHtml(DEFAULT_MASTER_LAYOUT);
    setStatus("Default loaded into editor (not yet saved).");
  };

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">
        This HTML wraps every DB-driven email (sequences, checkout recovery, review request, broadcast, order-modal custom templates).
        Use <code className="px-1 rounded bg-gray-100">{"{{content}}"}</code> where the body of each email should appear.
        Leave empty to use each function&apos;s built-in layout.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-[#3b6ea5] text-white text-xs font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Layout"}
        </button>
        <button
          type="button"
          onClick={loadDefaultIntoEditor}
          className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 text-xs font-semibold"
        >
          Load Default Into Editor
        </button>
        <button
          type="button"
          onClick={resetDefault}
          className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 text-xs font-semibold"
        >
          Clear (Use Fallback)
        </button>
        {status && <span className={`text-xs ${status.startsWith("ERROR") ? "text-red-600" : "text-green-700"}`}>{status}</span>}
        {!hasPlaceholder && <span className="text-xs text-red-600">Missing {"{{content}}"} placeholder</span>}
      </div>

      <textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={14}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono"
        placeholder="Leave empty to use built-in layout. Must include {{content}} placeholder."
      />

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">Preview:</span>
        <button
          type="button"
          onClick={() => setViewMode("rendered")}
          className={`px-2 py-1 rounded text-xs ${viewMode === "rendered" ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Rendered
        </button>
        <button
          type="button"
          onClick={() => setViewMode("raw")}
          className={`px-2 py-1 rounded text-xs ${viewMode === "raw" ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Raw HTML
        </button>
      </div>

      {viewMode === "rendered" ? (
        <iframe
          title="Master layout preview"
          srcDoc={previewHtml}
          className="w-full h-[520px] border border-gray-200 rounded-md bg-white"
        />
      ) : (
        <pre className="w-full max-h-[520px] overflow-auto border border-gray-200 rounded-md p-3 text-[11px] font-mono bg-gray-50 whitespace-pre-wrap break-all">
          {previewHtml}
        </pre>
      )}
    </div>
  );
}

function CommsTemplatesPanel() {
  const [activeChannel, setActiveChannel] = useState<"email" | "sms">("email");
  // Email state
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedEmailId, setSelectedEmailId] = useState(DEFAULT_TEMPLATES[0].id);
  // SMS state
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>(DEFAULT_SMS_TEMPLATES);
  const [selectedSmsId, setSelectedSmsId] = useState(DEFAULT_SMS_TEMPLATES[0].id);
  // Shared state
  const [previewName, setPreviewName] = useState("Jane");
  const [showRaw, setShowRaw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("Marketing");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [dbLoaded, setDbLoaded] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load all templates from DB on mount, split by channel
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("created_at");
      if (!error && data && data.length > 0) {
        const emailRows = data.filter((r) => !r.channel || r.channel === "email");
        const smsRows   = data.filter((r) => r.channel === "sms");
        if (emailRows.length > 0) {
          const mapped: EmailTemplate[] = emailRows.map((r) => ({
            id: r.id as string, label: r.label as string, group: r.group as string,
            subject: r.subject as string, body: r.body as string,
            ctaLabel: r.cta_label as string, ctaUrl: r.cta_url as string,
          }));
          setEmailTemplates(mapped);
          setSelectedEmailId(mapped[0].id);
        }
        if (smsRows.length > 0) {
          const mapped: SmsTemplate[] = smsRows.map((r) => ({
            id: r.id as string, label: r.label as string, group: r.group as string,
            body: r.body as string,
          }));
          setSmsTemplates(mapped);
          setSelectedSmsId(mapped[0].id);
        }
      }
      setDbLoaded(true);
    };
    load();
  }, []);

  const saveAllToDb = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const emailRows = emailTemplates.map((t) => ({
        id: t.id, label: t.label, group: t.group, subject: t.subject,
        body: t.body, cta_label: t.ctaLabel, cta_url: t.ctaUrl,
        channel: "email", updated_at: new Date().toISOString(),
      }));
      const smsRows = smsTemplates.map((t) => ({
        id: t.id, label: t.label, group: t.group, subject: "",
        body: t.body, cta_label: "", cta_url: "",
        channel: "sms", updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("email_templates")
        .upsert([...emailRows, ...smsRows], { onConflict: "id" });
      // Delete orphaned email rows
      const emailIds = emailTemplates.map((t) => `"${t.id}"`).join(",");
      if (emailIds) await supabase.from("email_templates").delete().eq("channel", "email").not("id", "in", `(${emailIds})`);
      // Delete orphaned SMS rows
      const smsIds = smsTemplates.map((t) => `"${t.id}"`).join(",");
      if (smsIds) await supabase.from("email_templates").delete().eq("channel", "sms").not("id", "in", `(${smsIds})`);
      if (error) throw error;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    } finally {
      setSaving(false);
    }
  };

  const selectedEmail = emailTemplates.find((t) => t.id === selectedEmailId) ?? emailTemplates[0];
  const emailGroups = [...new Set(emailTemplates.map((t) => t.group))];
  const updateEmailField = (field: keyof EmailTemplate, value: string) =>
    setEmailTemplates((prev) => prev.map((t) => t.id === selectedEmailId ? { ...t, [field]: value } : t));
  const deleteEmailTemplate = (id: string) => {
    const rem = emailTemplates.filter((t) => t.id !== id);
    setEmailTemplates(rem);
    if (selectedEmailId === id) setSelectedEmailId(rem[0]?.id ?? "");
  };

  const selectedSms = smsTemplates.find((t) => t.id === selectedSmsId) ?? smsTemplates[0];
  const smsGroups = [...new Set(smsTemplates.map((t) => t.group))];
  const updateSmsField = (field: keyof SmsTemplate, value: string) =>
    setSmsTemplates((prev) => prev.map((t) => t.id === selectedSmsId ? { ...t, [field]: value } : t));
  const deleteSmsTemplate = (id: string) => {
    const rem = smsTemplates.filter((t) => t.id !== id);
    setSmsTemplates(rem);
    if (selectedSmsId === id) setSelectedSmsId(rem[0]?.id ?? "");
  };

  const html = useMemo(
    () => buildEmailHtml(selectedEmail.subject, selectedEmail.body, selectedEmail.ctaLabel, selectedEmail.ctaUrl, previewName),
    [selectedEmail, previewName]
  );

  const addTemplate = () => {
    if (!newLabel.trim()) return;
    const id = `custom_${Date.now()}`;
    if (activeChannel === "email") {
      setEmailTemplates((prev) => [...prev, { ...NEW_TEMPLATE_DEFAULTS, id, label: newLabel.trim(), group: newGroup }]);
      setSelectedEmailId(id);
    } else {
      setSmsTemplates((prev) => [...prev, { id, label: newLabel.trim(), group: newGroup, body: "Hi {name}," }]);
      setSelectedSmsId(id);
    }
    setAddingNew(false);
    setNewLabel("");
    setEditMode(true);
  };

  const copyHtml = () => {
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const resetToDefaults = async () => {
    setEmailTemplates(DEFAULT_TEMPLATES);
    setSelectedEmailId(DEFAULT_TEMPLATES[0].id);
    setSmsTemplates(DEFAULT_SMS_TEMPLATES);
    setSelectedSmsId(DEFAULT_SMS_TEMPLATES[0].id);
    setEditMode(false);
    setShowResetConfirm(false);
    setSaving(true);
    try { await supabase.from("email_templates").delete().neq("id", "__never__"); } catch { /* ignore */ }
    setSaving(false);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2500);
  };

  const totalCount = emailTemplates.length + smsTemplates.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0">
            <i className="ri-message-2-line text-[#3b6ea5] text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Communications Templates Hub</h3>
            <p className="text-xs text-gray-400">Manage all email + SMS templates — single source of truth, saved to DB</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => { setAddingNew(true); setEditMode(false); }}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e8f0f9] text-[#3b6ea5] hover:bg-[#b8cce4] transition-colors cursor-pointer">
            <i className="ri-add-line"></i> Add Template
          </button>
          <button type="button" onClick={() => setEditMode((v) => !v)}
            className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${editMode ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <i className={editMode ? "ri-eye-line" : "ri-edit-line"}></i>
            {editMode ? "Preview Mode" : "Edit Mode"}
          </button>
          <button type="button" onClick={() => setShowResetConfirm(true)}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer">
            <i className="ri-refresh-line"></i> Reset Defaults
          </button>
          <button type="button" onClick={saveAllToDb} disabled={saving || !dbLoaded}
            className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
              saveStatus === "saved" ? "bg-green-100 text-green-700" :
              saveStatus === "error" ? "bg-red-100 text-red-600" :
              "bg-gray-900 text-white hover:bg-gray-700"
            }`}>
            {saving ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</>
              : saveStatus === "saved" ? <><i className="ri-checkbox-circle-line"></i>Saved to DB</>
              : saveStatus === "error" ? <><i className="ri-error-warning-line"></i>Save Failed</>
              : <><i className="ri-save-line"></i>Save to DB</>}
          </button>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#e8f0f9] text-[#3b6ea5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3b6ea5] flex-shrink-0"></span>
            {totalCount} templates
          </span>
        </div>
      </div>

      {/* Channel switcher */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button type="button"
            onClick={() => { setActiveChannel("email"); setEditMode(false); setAddingNew(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${activeChannel === "email" ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <i className="ri-mail-line text-sm"></i> Email
            <span className="ml-1 px-1.5 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">{emailTemplates.length}</span>
          </button>
          <button type="button"
            onClick={() => { setActiveChannel("sms"); setEditMode(false); setAddingNew(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${activeChannel === "sms" ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <i className="ri-message-3-line text-sm"></i> SMS
            <span className="ml-1 px-1.5 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">{smsTemplates.length}</span>
          </button>
        </div>
        {activeChannel === "sms" && (
          <p className="text-[10px] text-gray-400">Placeholders: <span className="font-mono bg-gray-100 px-1 rounded">&#123;name&#125;</span> = first name &nbsp; <span className="font-mono bg-gray-100 px-1 rounded">&#123;order_id&#125;</span> = confirmation ID</p>
        )}
      </div>

      {/* Add new template bar */}
      {addingNew && (
        <div className="px-5 py-3 bg-[#e8f0f9] border-b border-[#b8cce4] flex items-center gap-3 flex-wrap">
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Template name..." autoFocus
            className="px-3 py-1.5 border border-[#b8cce4] rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white w-48" />
          <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
            className="px-3 py-1.5 border border-[#b8cce4] rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
            {activeChannel === "email"
              ? <><option>Transactional</option><option>Marketing</option><option>Broadcast</option></>
              : <><option>Transactional</option><option>Lead Recovery</option><option>General</option></>}
          </select>
          <button type="button" onClick={addTemplate} className="whitespace-nowrap px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] transition-colors cursor-pointer">Create</button>
          <button type="button" onClick={() => setAddingNew(false)} className="whitespace-nowrap px-3 py-1.5 bg-white text-gray-600 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
        </div>
      )}

      {/* ── EMAIL CHANNEL ── */}
      {activeChannel === "email" && (
        <div className="flex flex-col lg:flex-row" style={{ minHeight: "560px" }}>
          {/* Left: template picker */}
          <div className="w-full lg:w-60 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 bg-gray-50/50 p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Preview As</label>
              <input type="text" value={previewName} onChange={(e) => setPreviewName(e.target.value || "Jane")} placeholder="Jane"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
              <p className="text-[10px] text-gray-400 mt-1">Replaces &#123;name&#125; in preview</p>
            </div>
            <div className="space-y-3">
              {emailGroups.map((grp) => (
                <div key={grp}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <i className={`text-xs ${grp === "Transactional" ? "ri-mail-check-line text-[#3b6ea5]" : grp === "Marketing" ? "ri-megaphone-line text-amber-500" : "ri-broadcast-line text-violet-500"}`}></i>
                    {grp}
                  </p>
                  <div className="space-y-1">
                    {emailTemplates.filter((t) => t.group === grp).map((t) => (
                      <div key={t.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelectedEmailId(t.id)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${selectedEmailId === t.id ? "bg-[#3b6ea5] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                          {t.label}
                        </button>
                        {editMode && (
                          <button type="button" onClick={() => deleteEmailTemplate(t.id)} title="Delete"
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0">
                            <i className="ri-delete-bin-line text-xs"></i>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!editMode && (
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button type="button" onClick={() => setShowRaw(false)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${!showRaw ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500"}`}>Preview</button>
                  <button type="button" onClick={() => setShowRaw(true)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${showRaw ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500"}`}>HTML</button>
                </div>
              </div>
            )}
          </div>
          {/* Right: edit or preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {editMode ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-[#3b6ea5] flex-shrink-0"></div>
                  <span className="text-xs font-bold text-gray-700">Editing: {selectedEmail.label}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedEmail.group === "Transactional" ? "bg-[#e8f0f9] text-[#3b6ea5]" : selectedEmail.group === "Marketing" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}>{selectedEmail.group}</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Template Label</label>
                  <input type="text" value={selectedEmail.label} onChange={(e) => updateEmailField("label", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Group</label>
                  <select value={selectedEmail.group} onChange={(e) => updateEmailField("group", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                    <option>Transactional</option><option>Marketing</option><option>Broadcast</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subject Line</label>
                  <input type="text" value={selectedEmail.subject} onChange={(e) => updateEmailField("subject", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                    Body <span className="normal-case font-normal text-gray-400">— use &#123;name&#125; for personalization, blank line = new paragraph</span>
                  </label>
                  <textarea value={selectedEmail.body} onChange={(e) => updateEmailField("body", e.target.value)}
                    rows={10} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white font-mono resize-y" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CTA Button Label</label>
                    <input type="text" value={selectedEmail.ctaLabel} onChange={(e) => updateEmailField("ctaLabel", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CTA URL</label>
                    <input type="text" value={selectedEmail.ctaUrl} onChange={(e) => updateEmailField("ctaUrl", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <button type="button" onClick={() => setEditMode(false)}
                    className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] transition-colors cursor-pointer">
                    <i className="ri-eye-line"></i> Preview Result
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/30 flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">Subject:</span>
                  <span className="text-xs font-semibold text-gray-800 truncate flex-1">{selectedEmail.subject}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={copyHtml}
                      className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer">
                      <i className={copied ? "ri-check-line text-green-500" : "ri-clipboard-line"}></i>
                      {copied ? "Copied!" : "Copy HTML"}
                    </button>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedEmail.group === "Transactional" ? "bg-[#e8f0f9] text-[#3b6ea5]" : selectedEmail.group === "Marketing" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}>{selectedEmail.group}</span>
                  </div>
                </div>
                <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                  <i className="ri-information-line text-amber-500 text-xs flex-shrink-0"></i>
                  <p className="text-[11px] text-amber-700 font-semibold">
                    Preview only — &#123;name&#125; replaced with &ldquo;{previewName}&rdquo; &middot; No email is sent
                  </p>
                </div>
                {showRaw ? (
                  <div className="flex-1 overflow-auto bg-gray-900 p-4">
                    <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed">{html}</pre>
                  </div>
                ) : (
                  <div className="flex-1 bg-[#f3f4f6]" style={{ minHeight: "420px" }}>
                    <iframe srcDoc={html} title={`Email Preview: ${selectedEmail.label}`}
                      className="w-full h-full border-0" style={{ minHeight: "420px" }} sandbox="allow-same-origin" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SMS CHANNEL ── */}
      {activeChannel === "sms" && (
        <div className="flex flex-col lg:flex-row" style={{ minHeight: "480px" }}>
          {/* Left: SMS template list */}
          <div className="w-full lg:w-60 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 bg-gray-50/50 p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Preview Name</label>
              <input type="text" value={previewName} onChange={(e) => setPreviewName(e.target.value || "Jane")} placeholder="Jane"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
            </div>
            <div className="space-y-3">
              {smsGroups.map((grp) => (
                <div key={grp}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <i className={`text-xs ${grp === "Transactional" ? "ri-mail-check-line text-[#3b6ea5]" : grp === "Lead Recovery" ? "ri-user-follow-line text-orange-500" : "ri-chat-3-line text-gray-500"}`}></i>
                    {grp}
                  </p>
                  <div className="space-y-1">
                    {smsTemplates.filter((t) => t.group === grp).map((t) => (
                      <div key={t.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelectedSmsId(t.id)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${selectedSmsId === t.id ? "bg-[#3b6ea5] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                          {t.label}
                        </button>
                        {editMode && (
                          <button type="button" onClick={() => deleteSmsTemplate(t.id)} title="Delete"
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0">
                            <i className="ri-delete-bin-line text-xs"></i>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Right: SMS edit/preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {editMode ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <i className="ri-message-3-line text-[#3b6ea5] text-sm"></i>
                  <span className="text-xs font-bold text-gray-700">Editing: {selectedSms?.label}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0f9] text-[#3b6ea5]">{selectedSms?.group}</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Template Label</label>
                  <input type="text" value={selectedSms?.label ?? ""} onChange={(e) => updateSmsField("label", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Group</label>
                  <select value={selectedSms?.group ?? "Transactional"} onChange={(e) => updateSmsField("group", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                    <option>Transactional</option><option>Lead Recovery</option><option>General</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Message Body <span className="normal-case font-normal">— &#123;name&#125; = first name, &#123;order_id&#125; = confirmation ID</span>
                    </label>
                    <span className={`text-[10px] font-bold ${(selectedSms?.body?.length ?? 0) > 280 ? "text-red-500" : "text-gray-400"}`}>
                      {selectedSms?.body?.length ?? 0}/320
                    </span>
                  </div>
                  <textarea value={selectedSms?.body ?? ""} onChange={(e) => updateSmsField("body", e.target.value.slice(0, 320))}
                    rows={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white font-mono resize-y" />
                  <p className="text-[10px] text-gray-400 mt-1">160 chars = 1 SMS segment · 320 chars = 2 segments</p>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <button type="button" onClick={() => setEditMode(false)}
                    className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] transition-colors cursor-pointer">
                    <i className="ri-eye-line"></i> Preview Result
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <i className="ri-message-3-line text-[#3b6ea5] text-sm"></i>
                  <span className="text-xs font-bold text-gray-700">{selectedSms?.label}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0f9] text-[#3b6ea5]">{selectedSms?.group}</span>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 flex items-center gap-2">
                  <i className="ri-information-line text-amber-500 text-xs flex-shrink-0"></i>
                  <p className="text-[11px] text-amber-700 font-semibold">Preview — &#123;name&#125; → &ldquo;{previewName}&rdquo; · &#123;order_id&#125; → PT-XXXX</p>
                </div>
                {selectedSms && (
                  <div className="max-w-xs">
                    <div className="bg-[#3b6ea5] text-white rounded-2xl rounded-br-sm px-4 py-3">
                      <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-1.5">SMS Preview</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {selectedSms.body.replace(/\{name\}/g, previewName).replace(/\{order_id\}/g, "PT-XXXX")}
                      </p>
                      <p className="text-[10px] text-white/50 mt-2 text-right">
                        {selectedSms.body.length} chars · {Math.ceil(selectedSms.body.length / 160) || 1} segment{selectedSms.body.length > 160 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reset to Defaults Confirmation Dialog ── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowResetConfirm(false)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-refresh-line text-red-500 text-base"></i>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Reset to Defaults?</h3>
                <p className="text-xs text-gray-400">This will overwrite all current templates</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                All <strong>{totalCount} current templates</strong> will be replaced with factory defaults. This also clears any saved DB versions.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <i className="ri-error-warning-line text-amber-500 text-sm flex-shrink-0"></i>
                <p className="text-xs text-amber-700 font-semibold">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
              <button type="button" onClick={() => setShowResetConfirm(false)}
                className="whitespace-nowrap flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-white transition-colors">
                Cancel
              </button>
              <button type="button" onClick={resetToDefaults}
                className="whitespace-nowrap flex-1 px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-red-600 transition-colors">
                Yes, Reset All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notification Routing Test Panel ─────────────────────────────────────────
const NOTIF_DEFS_PREVIEW = [
  { key: "new_paid_order", label: "New Paid Order", icon: "ri-shopping-cart-2-line", color: "text-green-600" },
  { key: "unpaid_lead", label: "Unpaid Lead", icon: "ri-user-search-line", color: "text-amber-600" },
  { key: "order_under_review", label: "Order Under Review", icon: "ri-eye-line", color: "text-orange-500" },
  { key: "order_completed", label: "Order Completed", icon: "ri-checkbox-circle-line", color: "text-[#3b6ea5]" },
  { key: "order_cancelled", label: "Order Cancelled", icon: "ri-close-circle-line", color: "text-red-500" },
  { key: "refund_issued", label: "Refund Issued", icon: "ri-refund-2-line", color: "text-rose-500" },
  { key: "provider_application", label: "Provider Application", icon: "ri-user-add-line", color: "text-indigo-600" },
  { key: "provider_license_change", label: "License Change", icon: "ri-shield-check-line", color: "text-[#3b6ea5]" },
  { key: "provider_letter_submitted", label: "Letter Submitted", icon: "ri-file-text-line", color: "text-orange-500" },
  { key: "provider_rejected_order", label: "Provider Rejected", icon: "ri-user-unfollow-line", color: "text-red-500" },
  { key: "payout_reminder", label: "Payout Reminder", icon: "ri-money-dollar-circle-line", color: "text-green-600" },
  { key: "system_health_alert", label: "System Health Alert", icon: "ri-heart-pulse-line", color: "text-red-500" },
];

interface RoutingResult {
  enabled: boolean;
  recipients: string[];
  source: "specific" | "group" | "global" | "env_fallback";
}

function NotificationRoutingTestPanel({ supabaseUrl }: { supabaseUrl: string }) {
  const [results, setResults] = useState<Record<string, RoutingResult>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadRouting = async () => {
    setLoading(true);
    try {
      const token = await getAdminToken();
      const fetches = NOTIF_DEFS_PREVIEW.map(async (def) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/get-admin-notif-recipients`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ notificationKey: def.key }),
          });
          const data = await res.json() as RoutingResult;
          return [def.key, data] as [string, RoutingResult];
        } catch {
          return [def.key, { enabled: true, recipients: ["(error loading)"], source: "global" as const }] as [string, RoutingResult];
        }
      });
      const pairs = await Promise.all(fetches);
      setResults(Object.fromEntries(pairs));
      setLoaded(true);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const sourceLabel = (s: string) => s === "specific" ? "Specific" : s === "group" ? "Group" : "Default";
  const sourceBg = (s: string) => s === "specific" ? "bg-[#dbeafe] text-[#3b6ea5]" : s === "group" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-violet-50 rounded-xl flex-shrink-0">
            <i className="ri-route-line text-violet-600 text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Notification Routing Test</h3>
            <p className="text-xs text-gray-400">Live preview of who receives each notification — no emails sent</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadRouting}
          disabled={loading}
          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 cursor-pointer transition-colors"
        >
          {loading ? <><i className="ri-loader-4-line animate-spin"></i>Checking...</> : <><i className="ri-refresh-line"></i>{loaded ? "Refresh" : "Check Routing"}</>}
        </button>
      </div>

      <div className="px-5 py-5">
        {!loaded && !loading && (
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-start gap-3">
            <i className="ri-information-line text-violet-500 text-sm mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-violet-700 leading-relaxed">
              Click <strong>Check Routing</strong> to see exactly which email addresses would receive each notification type based on your current configuration — without sending any emails.
            </p>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
            <i className="ri-loader-4-line animate-spin text-violet-500"></i>
            <span className="text-sm">Resolving recipients for all notification types...</span>
          </div>
        )}
        {loaded && !loading && (
          <div className="space-y-2">
            {NOTIF_DEFS_PREVIEW.map((def) => {
              const r = results[def.key];
              if (!r) return null;
              return (
                <div key={def.key} className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${r.enabled ? "bg-gray-50 border-gray-100" : "bg-red-50/40 border-red-100"}`}>
                  <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className={`${def.icon} ${def.color} text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-xs font-bold ${r.enabled ? "text-gray-800" : "text-gray-400"}`}>{def.label}</p>
                      {!r.enabled && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-bold">
                          <i className="ri-close-circle-line" style={{ fontSize: "9px" }}></i>Disabled
                        </span>
                      )}
                    </div>
                    {r.enabled ? (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${sourceBg(r.source)}`}>
                          {sourceLabel(r.source)}
                        </span>
                        {r.recipients.map((email) => (
                          <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[10px] text-gray-700 font-mono">
                            <i className="ri-mail-line text-gray-400" style={{ fontSize: "9px" }}></i>{email}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 mt-0.5 italic">No alert will be sent when this event triggers</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-[10px] text-gray-400">{r.enabled ? `${r.recipients.length} recipient${r.recipients.length !== 1 ? "s" : ""}` : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pipeline Stage Map (static reference — matches edge function) ─────────────
const PIPELINE_STAGE_MAP = [
  { event: "assessment_started", stageName: "Assessment Started", secretKey: "GHL_STAGE_ASSESSMENT_STARTED", icon: "ri-file-edit-line", color: "text-gray-500", description: "Customer completes Step 2 personal info" },
  { event: "payment_confirmed / payment_confirmed_backfill", stageName: "Payment Confirmed", secretKey: "GHL_STAGE_PAYMENT_CONFIRMED", icon: "ri-bank-card-line", color: "text-[#3b6ea5]", description: "Stripe payment succeeds" },
  { event: "doctor_assigned", stageName: "Under Review", secretKey: "GHL_STAGE_DOCTOR_ASSIGNED", icon: "ri-stethoscope-line", color: "text-amber-600", description: "Admin assigns a provider to the order" },
  { event: "documents_ready_for_patient", stageName: "Documents Ready", secretKey: "GHL_STAGE_DOCUMENTS_READY", icon: "ri-file-check-line", color: "text-sky-600", description: "Provider submits letter, patient notified" },
  { event: "order_completed", stageName: "Completed", secretKey: "GHL_STAGE_ORDER_COMPLETED", icon: "ri-checkbox-circle-line", color: "text-[#3b6ea5]", description: "Provider submits final letter" },
  { event: "refund_issued", stageName: "Refunded", secretKey: "GHL_STAGE_REFUND_ISSUED", icon: "ri-refund-2-line", color: "text-rose-500", description: "Admin issues a refund" },
  { event: "order_cancelled", stageName: "Cancelled", secretKey: "GHL_STAGE_ORDER_CANCELLED", icon: "ri-close-circle-line", color: "text-red-500", description: "Admin cancels the order" },
];

// ── GHL Pipeline Config Panel ─────────────────────────────────────────────────
function GhlPipelineConfigPanel() {
  const STORAGE_KEY = "ghl_pipeline_config";

  interface PipelineConfig {
    pipelineId: string;
    stageIds: Record<string, string>;
  }

  const loadConfig = (): PipelineConfig => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as PipelineConfig;
    } catch { /* ignore */ }
    return { pipelineId: "", stageIds: {} };
  };

  const [config, setConfig] = useState<PipelineConfig>(loadConfig);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const updatePipelineId = (val: string) => {
    setConfig((prev) => ({ ...prev, pipelineId: val }));
    setSaved(false);
  };

  const updateStageId = (secretKey: string, val: string) => {
    setConfig((prev) => ({ ...prev, stageIds: { ...prev.stageIds, [secretKey]: val } }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const copySecret = (name: string) => {
    navigator.clipboard.writeText(name).then(() => {
      setCopied(name);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const configuredCount = PIPELINE_STAGE_MAP.filter((s) => !!config.stageIds[s.secretKey]).length;
  const allConfigured = !!config.pipelineId && configuredCount === PIPELINE_STAGE_MAP.length;

  return (
    <div className="mt-6 border-t border-gray-100 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
            <i className="ri-git-branch-line text-[#3b6ea5] text-sm"></i>
          </div>
          <div>
            <p className="text-xs font-extrabold text-gray-800">Pipeline Stage Auto-Mover</p>
            <p className="text-xs text-gray-400">Contacts move to the correct pipeline stage automatically on every event</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${allConfigured ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-amber-50 text-amber-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${allConfigured ? "bg-[#3b6ea5]" : "bg-amber-500"}`}></span>
            {allConfigured ? "Fully Configured" : `${configuredCount}/${PIPELINE_STAGE_MAP.length} stages set`}
          </span>
          <button
            type="button"
            onClick={handleSave}
            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${saved ? "bg-[#e8f0f9] text-[#3b6ea5] border border-[#b8cce4]" : "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]"}`}
          >
            <i className={saved ? "ri-checkbox-circle-fill" : "ri-save-line"}></i>
            {saved ? "Saved!" : "Save IDs"}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <i className="ri-information-line text-[#3b6ea5] text-sm mt-0.5 flex-shrink-0"></i>
          <div className="text-xs text-[#2d5a8e] leading-relaxed space-y-1.5">
            <p><strong>How it works:</strong> Every GHL webhook payload now includes <code className="bg-[#e0f5ef] px-1 rounded font-mono text-[10px]">pipelineId</code>, <code className="bg-[#e0f5ef] px-1 rounded font-mono text-[10px]">pipelineStageId</code>, and <code className="bg-[#e0f5ef] px-1 rounded font-mono text-[10px]">pipelineStage</code> fields — automatically set based on the event type.</p>
            <p><strong>GHL Workflow setup:</strong> In your GHL Workflow&apos;s &ldquo;Create/Update Contact&rdquo; action, map <code className="bg-[#e0f5ef] px-1 rounded font-mono text-[10px]">pipelineId</code> → Pipeline and <code className="bg-[#e0f5ef] px-1 rounded font-mono text-[10px]">pipelineStageId</code> → Stage. That&apos;s it — no If/Else branches needed.</p>
            <p><strong>Where to find IDs:</strong> GHL → Settings → Pipelines → click your pipeline → the URL contains the Pipeline ID. Stage IDs are in the pipeline settings page or via GHL API.</p>
          </div>
        </div>
      </div>

      {/* Supabase secrets instruction */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <i className="ri-key-2-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
          <div>
            <p className="text-xs font-bold text-amber-800 mb-1">Set these in Supabase Secrets (not here)</p>
            <p className="text-xs text-amber-700 leading-relaxed mb-2">
              The IDs below are stored locally for your reference only. The edge function reads them from <strong>Supabase Dashboard → Edge Functions → Secrets</strong>. Copy each secret name and paste it in Supabase with the corresponding ID as the value.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["GHL_PIPELINE_ID", ...PIPELINE_STAGE_MAP.map((s) => s.secretKey)].filter((n) => n !== "GHL_STAGE_LETTER_GENERATED").map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => copySecret(name)}
                  className="whitespace-nowrap inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-300 rounded text-[10px] font-mono text-amber-800 hover:bg-amber-200 cursor-pointer transition-colors"
                >
                  <i className={copied === name ? "ri-checkbox-circle-line text-[#3b6ea5]" : "ri-file-copy-line"} style={{ fontSize: "9px" }}></i>
                  {copied === name ? "Copied!" : name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline ID */}
      <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <i className="ri-git-branch-line text-gray-500 text-sm"></i>
          <p className="text-xs font-extrabold text-gray-700">Pipeline ID</p>
          <span className="ml-auto text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">GHL_PIPELINE_ID</span>
        </div>
        <input
          type="text"
          value={config.pipelineId}
          onChange={(e) => updatePipelineId(e.target.value)}
          placeholder="e.g. abc123def456..."
          className={`w-full text-xs border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20 ${config.pipelineId ? "border-[#b8cce4] bg-[#e8f0f9] text-[#3b6ea5]" : "border-gray-200 bg-white text-gray-700"}`}
        />
        <p className="text-[10px] text-gray-400 mt-1">Found in GHL → Settings → Pipelines → URL bar when viewing your pipeline</p>
      </div>

      {/* Stage map table */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Event → Pipeline Stage Mapping</p>
        <div className="space-y-2">
          {PIPELINE_STAGE_MAP.map((stage) => {
            const stageId = config.stageIds[stage.secretKey] ?? "";
            const isSet = !!stageId;
            return (
              <div key={stage.secretKey} className={`rounded-xl border overflow-hidden ${isSet ? "border-[#b8cce4]" : "border-gray-200"}`}>
                {/* Stage header row */}
                <div className={`flex items-center gap-3 px-4 py-2.5 ${isSet ? "bg-[#e8f0f9]" : "bg-gray-50"}`}>
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    <i className={`${stage.icon} ${stage.color} text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-extrabold text-gray-800">{stage.stageName}</p>
                      <span className="text-[10px] text-gray-400">←</span>
                      <code className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{stage.event}</code>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{stage.description}</p>
                  </div>
                  {isSet ? (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#3b6ea5] text-white rounded text-[10px] font-bold">
                      <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>Set
                    </span>
                  ) : (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                      <i className="ri-time-line" style={{ fontSize: "9px" }}></i>Pending
                    </span>
                  )}
                </div>
                {/* Stage ID input */}
                <div className="px-4 py-2.5 bg-white border-t border-gray-100 flex items-center gap-3">
                  <div className="flex-shrink-0 text-[10px] font-mono text-gray-400 w-52 truncate hidden sm:block">{stage.secretKey}</div>
                  <input
                    type="text"
                    value={stageId}
                    onChange={(e) => updateStageId(stage.secretKey, e.target.value)}
                    placeholder="Paste GHL Stage ID here..."
                    className={`flex-1 text-xs border rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20 ${isSet ? "border-[#b8cce4] bg-[#e8f0f9] text-[#3b6ea5]" : "border-gray-200 bg-gray-50 text-gray-700"}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GHL Workflow instruction */}
      <div className="mt-4 bg-gray-900 rounded-xl p-4">
        <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-3">GHL Workflow — Single Action Setup</p>
        <div className="space-y-2">
          {[
            { step: "1", label: "Trigger", desc: "Custom Webhook → paste GHL_WEBHOOK_URL", icon: "ri-webhook-line" },
            { step: "2", label: "Create/Update Contact", desc: "Map: email, phone, firstName, lastName, confirmationId, pipelineId, pipelineStageId", icon: "ri-user-settings-line" },
            { step: "3", label: "Add Tags", desc: "Map: tags (array) → GHL will apply all tags automatically", icon: "ri-price-tag-3-line" },
            { step: "4", label: "Done", desc: "No If/Else branches needed — pipelineStageId already encodes the correct stage per event", icon: "ri-checkbox-circle-line" },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="w-5 h-5 flex items-center justify-center bg-white/10 rounded-full flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-white/70">{s.step}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-white">{s.label}</p>
                <p className="text-[10px] text-white/50 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── GHL Connection Test Panel ─────────────────────────────────────────────────
interface GhlTestResult {
  ok: boolean;
  ghlStatus: number;
  ghlBody: string;
  phone: string;
  email: string;
  tagsSent: string[];
  error?: string;
  durationMs: number;
}

// Event options for the test panel
const GHL_TEST_EVENTS = [
  { value: "assessment_started",           label: "Assessment Started (Lead/Unpaid)" },
  { value: "payment_confirmed",            label: "Payment Confirmed (Paid — Live)" },
  { value: "doctor_assigned",              label: "Doctor Assigned / Under Review (Live)" },
  { value: "documents_ready_for_patient",  label: "Documents Ready (Live)" },
  { value: "order_completed",              label: "Order Completed (Live)" },
  { value: "refund_issued",                label: "Refund Issued (Live)" },
  { value: "order_cancelled",              label: "Order Cancelled (Live)" },
  // ── Backfill variants ──────────────────────────────────────────────────────
  { value: "payment_confirmed_backfill",   label: "Payment Confirmed — Backfill" },
  { value: "doctor_assigned_backfill",     label: "Doctor Assigned — Backfill" },
  { value: "order_completed_backfill",     label: "Order Completed — Backfill" },
  { value: "refund_issued_backfill",       label: "Refund Issued — Backfill" },
  { value: "order_cancelled_backfill",     label: "Order Cancelled — Backfill" },
];

function GhlConnectionTestPanel({ supabaseUrl }: { supabaseUrl: string }) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<GhlTestResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [testPhone, setTestPhone] = useState("+14099655885");
  const [testEmail, setTestEmail] = useState("ghl-test@pawtenant.com");
  const [testEvent, setTestEvent] = useState("assessment_started");
  const [testTagsRaw, setTestTagsRaw] = useState("GHL Test, Admin Connection Test");
  const rawRef = useRef<HTMLPreElement>(null);

  // ── Comms test state ──────────────────────────────────────────────────────
  const [commsState, setCommsState] = useState<"idle" | "running" | "done">("idle");
  const [commsResult, setCommsResult] = useState<{ ok: boolean; status: number; body: string; durationMs: number } | null>(null);
  const [commsShowRaw, setCommsShowRaw] = useState(false);

  const runCommsTest = async () => {
    setCommsState("running");
    setCommsResult(null);
    setCommsShowRaw(false);
    const start = Date.now();
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          eventType: "sms_outbound",
          email: testEmail.trim() || "ghl-test@pawtenant.com",
          phone: testPhone.trim() || "+14099655885",
          firstName: "GHL",
          lastName: "CommsTest",
          messageBody: "Test SMS payload from PawTenant admin — verifying GHL Call/SMS Hub routing.",
          direction: "outbound",
          timestamp: new Date().toISOString(),
        }),
      });
      const durationMs = Date.now() - start;
      let body = "";
      try { body = await res.text(); } catch { body = "(unreadable)"; }
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(body); } catch { /* raw */ }
      setCommsResult({ ok: (parsed.ok as boolean) ?? res.ok, status: res.status, body, durationMs });
    } catch (err) {
      setCommsResult({ ok: false, status: 0, body: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start });
    } finally {
      setCommsState("done");
    }
  };

  const parsedTags = testTagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  const runTest = async () => {
    setState("running");
    setResult(null);
    setShowRaw(false);
    const start = Date.now();
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          webhookType: "main",
          eventType: testEvent,
          event: testEvent,
          firstName: "GHL",
          lastName: "ConnectionTest",
          email: testEmail.trim() || "ghl-test@pawtenant.com",
          phone: testPhone.trim() || "+14099655885",
          state: "TX",
          confirmationId: `TEST-${Date.now()}`,
          letterType: "esa",
          leadSource: "Admin GHL Connection Test",
          submittedAt: new Date().toISOString(),
          tags: parsedTags,
        }),
      });
      const durationMs = Date.now() - start;
      const json = await res.json() as {
        ok: boolean; ghlStatus?: number; ghlBody?: string;
        phone?: string; email?: string; tagsSent?: string[];
        error?: string;
      };
      setResult({
        ok: json.ok ?? res.ok,
        ghlStatus: json.ghlStatus ?? res.status,
        ghlBody: json.ghlBody ?? JSON.stringify(json),
        phone: json.phone ?? testPhone,
        email: json.email ?? testEmail,
        tagsSent: json.tagsSent ?? [],
        error: json.error,
        durationMs,
      });
    } catch (err) {
      setResult({
        ok: false,
        ghlStatus: 0,
        ghlBody: "",
        phone: testPhone,
        email: testEmail,
        tagsSent: [],
        error: err instanceof Error ? err.message : "Network error",
        durationMs: Date.now() - start,
      });
    }
    setState("done");
  };

  const reset = () => { setState("idle"); setResult(null); setShowRaw(false); };

  return (
    <div className="mt-6 border-t border-gray-100 pt-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
            <i className="ri-plug-line text-amber-600 text-sm"></i>
          </div>
          <div>
            <p className="text-xs font-extrabold text-gray-800">GHL Connection Test</p>
            <p className="text-xs text-gray-400">Fires a real test payload and shows the raw GHL response</p>
          </div>
        </div>
        {state === "done" && (
          <button type="button" onClick={reset}
            className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 cursor-pointer transition-colors">
            <i className="ri-refresh-line"></i>Reset
          </button>
        )}
      </div>

      {/* Test inputs */}
      {state === "idle" && (
        <div className="space-y-3 mb-4">
          {/* Event type selector */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Event Type (Pipeline Stage)</label>
            <select
              value={testEvent}
              onChange={(e) => setTestEvent(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
            >
              {GHL_TEST_EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>{ev.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Controls which pipeline stage and tags are sent to GHL</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Test Phone (E.164 or raw)</label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+14099655885"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300 font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-1">Proxy normalizes to E.164 before sending to GHL</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Test Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="ghl-test@pawtenant.com"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <p className="text-[10px] text-gray-400 mt-1">GHL will create/update a contact with this email</p>
            </div>
          </div>

          {/* Tags editor */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Extra Tags (comma-separated)</label>
            <input
              type="text"
              value={testTagsRaw}
              onChange={(e) => setTestTagsRaw(e.target.value)}
              placeholder="GHL Test, Admin Connection Test"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <p className="text-[10px] text-gray-400 mt-1">These are appended to the auto-generated event tags. Separate with commas.</p>
          </div>

          {/* Preview of tags that will be sent */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tags Preview (auto + extra)</p>
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const autoTags: string[] = [];
                const isPSD = false;
                autoTags.push(isPSD ? "PSD Order" : "ESA Order");
                if (["payment_confirmed", "payment_confirmed_backfill"].includes(testEvent)) {
                  autoTags.push("Lead (Paid)", "Payment Confirmed");
                } else if (testEvent === "assessment_started") {
                  autoTags.push("Lead (Unpaid)", "Assessment Started");
                } else if (["doctor_assigned", "doctor_assigned_backfill"].includes(testEvent)) {
                  autoTags.push("Paid (Assigned)", "Doctor Assigned");
                } else if (["documents_ready_for_patient", "order_completed", "order_completed_backfill"].includes(testEvent)) {
                  autoTags.push("Letter Sent", "Completed");
                } else if (["refund_issued", "refund_issued_backfill"].includes(testEvent)) {
                  autoTags.push("Refunded");
                } else if (["order_cancelled", "order_cancelled_backfill"].includes(testEvent)) {
                  autoTags.push("Cancelled");
                }
                const allTags = [...autoTags, ...parsedTags.filter((t) => !autoTags.includes(t))];
                return allTags.map((tag) => (
                  <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${parsedTags.includes(tag) && !autoTags.includes(tag) ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-[#e8f0f9] border-[#b8cce4] text-[#3b6ea5]"}`}>
                    <i className="ri-price-tag-3-line" style={{ fontSize: "9px" }}></i>{tag}
                  </span>
                ));
              })()}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <i className="ri-information-line text-amber-500 text-xs mt-0.5 flex-shrink-0"></i>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              This fires a <strong>real</strong> webhook to GHL — a test contact will be created/updated in your GHL account.
              Use a test email to avoid polluting real contacts. The test event is tagged <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">GHL Test</code> so you can filter it in GHL.
            </p>
          </div>
        </div>
      )}

      {/* Run button */}
      <div className="flex flex-wrap gap-3">
        {state !== "done" && (
          <button
            type="button"
            onClick={runTest}
            disabled={state === "running"}
            className={`whitespace-nowrap flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-extrabold transition-colors cursor-pointer disabled:opacity-60 ${
              state === "running" ? "bg-amber-400 text-white" : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            {state === "running"
              ? <><i className="ri-loader-4-line animate-spin"></i>Firing test payload to GHL...</>
              : <><i className="ri-send-plane-line"></i>Fire GHL Connection Test</>}
          </button>
        )}
        {/* Comms webhook test button */}
        <button
          type="button"
          onClick={runCommsTest}
          disabled={commsState === "running"}
          className={`whitespace-nowrap flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-extrabold transition-colors cursor-pointer disabled:opacity-60 ${
            commsState === "running" ? "bg-sky-400 text-white" : "bg-sky-600 text-white hover:bg-sky-700"
          }`}
        >
          {commsState === "running"
            ? <><i className="ri-loader-4-line animate-spin"></i>Firing comms test...</>
            : <><i className="ri-message-2-line"></i>Fire Comms Hub Test (SMS)</>}
        </button>
      </div>

      {/* Comms test result */}
      {commsState === "done" && commsResult && (
        <div className={`mt-3 rounded-xl border overflow-hidden ${commsResult.ok ? "border-sky-200" : "border-red-200"}`}>
          <div className={`px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${commsResult.ok ? "bg-sky-50" : "bg-red-50"}`}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 ${commsResult.ok ? "bg-sky-600" : "bg-red-500"}`}>
                <i className={`${commsResult.ok ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"} text-white text-sm`}></i>
              </div>
              <div>
                <p className={`text-sm font-extrabold ${commsResult.ok ? "text-sky-700" : "text-red-700"}`}>
                  {commsResult.ok ? "Comms Hub accepted the payload" : "Comms Hub rejected the payload"}
                </p>
                <p className={`text-xs ${commsResult.ok ? "text-sky-500" : "text-red-500"}`}>
                  HTTP {commsResult.status} · {commsResult.durationMs}ms · Event: sms_outbound → GHL_COMMS_WEBHOOK_URL
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setCommsShowRaw(!commsShowRaw)}
              className="whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1">
              <i className={commsShowRaw ? "ri-eye-off-line" : "ri-code-line"}></i>
              {commsShowRaw ? "Hide Raw" : "Show Raw"}
            </button>
          </div>
          {commsShowRaw && (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <pre className="bg-gray-900 text-green-400 text-[10px] font-mono p-4 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap break-all leading-relaxed">
                {commsResult.body || "(empty)"}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {state === "done" && result && (
        <div className={`rounded-xl border overflow-hidden ${result.ok ? "border-[#b8cce4]" : "border-red-200"}`}>
          {/* Status bar */}
          <div className={`px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${result.ok ? "bg-[#e8f0f9]" : "bg-red-50"}`}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 ${result.ok ? "bg-[#3b6ea5]" : "bg-red-500"}`}>
                <i className={`${result.ok ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"} text-white text-sm`}></i>
              </div>
              <div>
                <p className={`text-sm font-extrabold ${result.ok ? "text-[#3b6ea5]" : "text-red-700"}`}>
                  {result.ok ? "GHL accepted the payload" : "GHL rejected the payload"}
                </p>
                <p className={`text-xs ${result.ok ? "text-[#2d5a8e]" : "text-red-500"}`}>
                  HTTP {result.ghlStatus} · {result.durationMs}ms · Event: {testEvent}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              className="whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1"
            >
              <i className={showRaw ? "ri-eye-off-line" : "ri-code-line"}></i>
              {showRaw ? "Hide Raw" : "Show Raw Response"}
            </button>
          </div>

          {/* Field check grid */}
          <div className="px-4 py-4 bg-white">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Payload Fields Verified</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {[
                { label: "Phone sent", value: result.phone, ok: !!result.phone },
                { label: "Email sent", value: result.email, ok: !!result.email },
                { label: "GHL HTTP status", value: `HTTP ${result.ghlStatus}`, ok: result.ghlStatus >= 200 && result.ghlStatus < 300 },
                { label: "Tags sent", value: result.tagsSent.length > 0 ? `${result.tagsSent.length} tags` : "None", ok: result.tagsSent.length > 0 },
                { label: "Phone format", value: result.phone?.startsWith("+") ? "E.164 ✓" : "Raw (proxy normalizes)", ok: true },
                { label: "Event type", value: testEvent, ok: true },
                { label: "Proxy response", value: result.ok ? "OK" : result.error ?? "Error", ok: result.ok },
              ].map((f) => (
                <div key={f.label} className={`rounded-lg px-3 py-2.5 border ${f.ok ? "bg-[#e8f0f9] border-[#b8cce4]" : "bg-red-50 border-red-200"}`}>
                  <p className="text-[10px] text-gray-400 mb-0.5">{f.label}</p>
                  <p className={`text-xs font-bold truncate ${f.ok ? "text-[#3b6ea5]" : "text-red-600"}`}>{f.value}</p>
                </div>
              ))}
            </div>

            {/* Tags list */}
            {result.tagsSent.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Tags Sent to GHL</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.tagsSent.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-semibold">
                      <i className="ri-price-tag-3-line" style={{ fontSize: "9px" }}></i>{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Error message */}
            {!result.ok && result.error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0 mt-0.5"></i>
                <div>
                  <p className="text-xs font-bold text-red-700 mb-0.5">Error Details</p>
                  <p className="text-xs text-red-600 font-mono break-all">{result.error}</p>
                </div>
              </div>
            )}

            {/* Diagnosis */}
            <div className={`rounded-lg px-3 py-2.5 flex items-start gap-2 ${result.ok ? "bg-[#e8f0f9] border border-[#b8cce4]" : "bg-red-50 border border-red-200"}`}>
              <i className={`${result.ok ? "ri-lightbulb-line text-[#3b6ea5]" : "ri-alert-line text-red-500"} text-sm flex-shrink-0 mt-0.5`}></i>
              <p className={`text-xs leading-relaxed ${result.ok ? "text-[#2d5a8e]" : "text-red-600"}`}>
                {result.ok
                  ? "GHL webhook URL is reachable and accepted the payload. Now verify in GHL that the contact was created with the phone number — if phone is missing, the GHL Workflow's \"Create/Update Contact\" action is not mapping the phone field."
                  : result.ghlStatus === 500 && !result.ghlBody
                    ? "The GHL_WEBHOOK_URL Supabase secret is likely missing or empty. Go to Supabase Dashboard → Edge Functions → Secrets and set GHL_WEBHOOK_URL."
                    : result.ghlStatus === 0
                      ? "Could not reach the GHL proxy at all. Check that the edge function is deployed and the Supabase URL is correct."
                      : `GHL returned HTTP ${result.ghlStatus}. This usually means the webhook URL is wrong or the GHL workflow is paused/deleted. Check the raw response for details.`}
              </p>
            </div>

            {/* Raw response */}
            {showRaw && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Raw GHL Response</p>
                  <CopyButton text={result.ghlBody} />
                </div>
                <pre
                  ref={rawRef}
                  className="bg-gray-900 text-green-400 text-[10px] font-mono p-4 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap break-all leading-relaxed"
                >
                  {result.ghlBody || "(empty response body)"}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sequence Management Panel ─────────────────────────────────────────────────
interface SeqOrderInfo {
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  payment_intent_id: string | null;
  seq_30min_sent_at: string | null;
  seq_24h_sent_at: string | null;
  seq_3day_sent_at: string | null;
  followup_opt_out: boolean | null;
  seq_opted_out_at: string | null;
}

function SequenceManagementPanel() {
  const [searchId, setSearchId] = useState("");
  const [lookupResult, setLookupResult] = useState<SeqOrderInfo | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // List of orders currently in sequence (not opted out, has at least one seq step)
  const [seqOrders, setSeqOrders] = useState<SeqOrderInfo[]>([]);
  const [seqLoading, setSeqLoading] = useState(true);

  const loadSeqOrders = async () => {
    setSeqLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("confirmation_id, email, first_name, last_name, status, payment_intent_id, seq_30min_sent_at, seq_24h_sent_at, seq_3day_sent_at, followup_opt_out, seq_opted_out_at")
      .or("seq_30min_sent_at.not.is.null,seq_24h_sent_at.not.is.null,seq_3day_sent_at.not.is.null")
      .order("seq_30min_sent_at", { ascending: false })
      .limit(200);
    setSeqOrders((data ?? []) as SeqOrderInfo[]);
    setSeqLoading(false);
  };

  useEffect(() => { loadSeqOrders(); }, []);

  const handleLookup = async () => {
    const id = searchId.trim().toUpperCase();
    if (!id) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    setActionMsg(null);
    const { data, error } = await supabase
      .from("orders")
      .select("confirmation_id, email, first_name, last_name, status, payment_intent_id, seq_30min_sent_at, seq_24h_sent_at, seq_3day_sent_at, followup_opt_out, seq_opted_out_at")
      .eq("confirmation_id", id)
      .maybeSingle();
    if (error || !data) {
      setLookupError(`Order "${id}" not found. Check the order ID and try again.`);
    } else {
      setLookupResult(data as SeqOrderInfo);
    }
    setLookupLoading(false);
  };

  const handleAddToSequence = async (order: SeqOrderInfo) => {
    setActionLoading(true);
    setActionMsg(null);
    // Re-enable sequence: clear opt-out flags, set seq_30min_sent_at to trigger re-entry
    const { error } = await supabase
      .from("orders")
      .update({
        followup_opt_out: false,
        seq_opted_out_at: null,
        // Reset sequence steps so the sequence restarts
        seq_30min_sent_at: null,
        seq_24h_sent_at: null,
        seq_3day_sent_at: null,
      })
      .eq("confirmation_id", order.confirmation_id);
    if (error) {
      setActionMsg({ ok: false, msg: `Failed to add to sequence: ${error.message}` });
    } else {
      setActionMsg({ ok: true, msg: `${order.confirmation_id} added to sequence — follow-up emails will fire on next scheduler run.` });
      setLookupResult((prev) => prev ? { ...prev, followup_opt_out: false, seq_opted_out_at: null, seq_30min_sent_at: null, seq_24h_sent_at: null, seq_3day_sent_at: null } : prev);
      await loadSeqOrders();
    }
    setActionLoading(false);
  };

  const handleRemoveFromSequence = async (order: SeqOrderInfo) => {
    setActionLoading(true);
    setActionMsg(null);
    const { error } = await supabase
      .from("orders")
      .update({
        followup_opt_out: true,
        seq_opted_out_at: new Date().toISOString(),
      })
      .eq("confirmation_id", order.confirmation_id);
    if (error) {
      setActionMsg({ ok: false, msg: `Failed to remove from sequence: ${error.message}` });
    } else {
      setActionMsg({ ok: true, msg: `${order.confirmation_id} removed from sequence — no further follow-up emails will be sent.` });
      setLookupResult((prev) => prev ? { ...prev, followup_opt_out: true, seq_opted_out_at: new Date().toISOString() } : prev);
      await loadSeqOrders();
    }
    setActionLoading(false);
  };

  const getSeqStepLabel = (o: SeqOrderInfo) => {
    if (o.seq_3day_sent_at) return "3-day sent";
    if (o.seq_24h_sent_at) return "24h sent";
    if (o.seq_30min_sent_at) return "30min sent";
    return "Not started";
  };

  const getSeqStepColor = (o: SeqOrderInfo) => {
    if (o.seq_3day_sent_at) return "bg-violet-100 text-violet-700";
    if (o.seq_24h_sent_at) return "bg-amber-100 text-amber-700";
    if (o.seq_30min_sent_at) return "bg-sky-100 text-sky-700";
    return "bg-gray-100 text-gray-500";
  };

  const activeInSeq = seqOrders.filter((o) => !o.followup_opt_out);
  const optedOut = seqOrders.filter((o) => o.followup_opt_out);

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex items-start gap-3">
        <i className="ri-information-line text-sky-500 text-sm mt-0.5 flex-shrink-0"></i>
        <div className="text-xs text-sky-700 leading-relaxed space-y-1">
          <p><strong>Automated Sequence:</strong> Lead orders automatically receive 3 follow-up emails — 30 minutes, 24 hours, and 3 days after assessment submission.</p>
          <p><strong>Add to sequence:</strong> Resets all sequence steps so the order re-enters from the beginning on the next scheduler run.</p>
          <p><strong>Remove from sequence:</strong> Sets opt-out flag — no further follow-up emails will be sent for that order.</p>
        </div>
      </div>

      {/* Lookup by Order ID */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <i className="ri-search-line text-gray-500 text-sm"></i>
          <p className="text-xs font-extrabold text-gray-700">Look Up Order by ID</p>
        </div>
        <div className="px-4 py-4 bg-white space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
              placeholder="e.g. PT-MNUCBDWO"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-sky-300 bg-gray-50"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={lookupLoading || !searchId.trim()}
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-lg hover:bg-sky-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {lookupLoading ? <><i className="ri-loader-4-line animate-spin"></i>Looking up...</> : <><i className="ri-search-line"></i>Look Up</>}
            </button>
          </div>

          {lookupError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <i className="ri-error-warning-line flex-shrink-0"></i>{lookupError}
            </div>
          )}

          {lookupResult && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Order info row */}
              <div className="px-4 py-3 bg-gray-50 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-extrabold text-gray-900 font-mono">{lookupResult.confirmation_id}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${getSeqStepColor(lookupResult)}`}>
                      <i className="ri-mail-send-line" style={{ fontSize: "9px" }}></i>
                      {getSeqStepLabel(lookupResult)}
                    </span>
                    {lookupResult.followup_opt_out && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[10px] font-bold">
                        <i className="ri-mail-forbid-line" style={{ fontSize: "9px" }}></i>Opted Out
                      </span>
                    )}
                    {!lookupResult.followup_opt_out && (lookupResult.seq_30min_sent_at || lookupResult.seq_24h_sent_at || lookupResult.seq_3day_sent_at) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
                        <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>In Sequence
                      </span>
                    )}
                    {!lookupResult.seq_30min_sent_at && !lookupResult.seq_24h_sent_at && !lookupResult.seq_3day_sent_at && !lookupResult.followup_opt_out && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">
                        Not in sequence
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{lookupResult.email} · {[lookupResult.first_name, lookupResult.last_name].filter(Boolean).join(" ") || "—"}</p>
                </div>
              </div>

              {/* Sequence steps */}
              <div className="px-4 py-3 bg-white border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sequence Steps</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "30min", sent: lookupResult.seq_30min_sent_at },
                    { label: "24h", sent: lookupResult.seq_24h_sent_at },
                    { label: "3-day", sent: lookupResult.seq_3day_sent_at },
                  ].map((step) => (
                    <div key={step.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${step.sent ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                      <i className={step.sent ? "ri-checkbox-circle-fill" : "ri-time-line"} style={{ fontSize: "10px" }}></i>
                      {step.label}
                      {step.sent && <span className="text-[10px] text-emerald-500 font-normal">sent</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                {lookupResult.followup_opt_out ? (
                  <button
                    type="button"
                    onClick={() => handleAddToSequence(lookupResult)}
                    disabled={actionLoading}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {actionLoading ? <><i className="ri-loader-4-line animate-spin"></i>Adding...</> : <><i className="ri-mail-add-line"></i>Add to Sequence</>}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAddToSequence(lookupResult)}
                      disabled={actionLoading}
                      className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-lg hover:bg-sky-700 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {actionLoading ? <><i className="ri-loader-4-line animate-spin"></i>Resetting...</> : <><i className="ri-restart-line"></i>Reset &amp; Re-add to Sequence</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromSequence(lookupResult)}
                      disabled={actionLoading}
                      className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-lg hover:bg-red-100 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {actionLoading ? <><i className="ri-loader-4-line animate-spin"></i>Removing...</> : <><i className="ri-mail-forbid-line"></i>Remove from Sequence</>}
                    </button>
                  </>
                )}
              </div>

              {/* Action result */}
              {actionMsg && (
                <div className={`px-4 py-2.5 border-t text-xs font-semibold flex items-center gap-2 ${actionMsg.ok ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"}`}>
                  <i className={actionMsg.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                  {actionMsg.msg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active in sequence list */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <i className="ri-mail-send-line text-sky-500 text-sm"></i>
          <p className="text-xs font-extrabold text-gray-700">Active in Sequence</p>
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-[10px] font-bold">{activeInSeq.length} orders</span>
          <button type="button" onClick={loadSeqOrders} disabled={seqLoading} className="whitespace-nowrap w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
            <i className={`ri-refresh-line text-sm ${seqLoading ? "animate-spin" : ""}`}></i>
          </button>
        </div>
        <div className="bg-white divide-y divide-gray-50 max-h-64 overflow-y-auto">
          {seqLoading ? (
            <div className="flex items-center gap-2 px-4 py-4 text-gray-400 text-xs">
              <i className="ri-loader-4-line animate-spin"></i>Loading...
            </div>
          ) : activeInSeq.length === 0 ? (
            <div className="px-4 py-4 text-xs text-gray-400 italic">No orders currently active in sequence.</div>
          ) : (
            activeInSeq.map((o) => (
              <div key={o.confirmation_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-gray-800 font-mono">{o.confirmation_id}</p>
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${getSeqStepColor(o)}`}>
                      {getSeqStepLabel(o)}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">{o.email}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setLookupResult(o);
                    setSearchId(o.confirmation_id);
                    setActionMsg(null);
                    await handleRemoveFromSequence(o);
                  }}
                  className="whitespace-nowrap flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-red-50 text-red-500 border border-red-100 rounded-lg text-[10px] font-bold hover:bg-red-100 cursor-pointer transition-colors"
                >
                  <i className="ri-mail-forbid-line" style={{ fontSize: "10px" }}></i>Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Opted-out list */}
      {optedOut.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <i className="ri-mail-forbid-line text-gray-400 text-sm"></i>
            <p className="text-xs font-extrabold text-gray-600">Opted Out of Sequence</p>
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">{optedOut.length} orders</span>
          </div>
          <div className="bg-white divide-y divide-gray-50 max-h-48 overflow-y-auto">
            {optedOut.map((o) => (
              <div key={o.confirmation_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-500 font-mono">{o.confirmation_id}</p>
                  <p className="text-[10px] text-gray-400 truncate">{o.email}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setLookupResult(o);
                    setSearchId(o.confirmation_id);
                    setActionMsg(null);
                    await handleAddToSequence(o);
                  }}
                  className="whitespace-nowrap flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[10px] font-bold hover:bg-emerald-100 cursor-pointer transition-colors"
                >
                  <i className="ri-mail-add-line" style={{ fontSize: "10px" }}></i>Re-add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Accordion Section wrapper ─────────────────────────────────────────────────
function AccordionSection({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  badge,
  badgeColor,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  badge?: string;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer text-left"
      >
        <div className={`w-10 h-10 flex items-center justify-center ${iconBg} rounded-xl flex-shrink-0`}>
          <i className={`${icon} ${iconColor} text-lg`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${badgeColor ?? "bg-gray-100 text-gray-600"}`}>
            {badge}
          </span>
        )}
        <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors ${open ? "bg-gray-100" : "bg-gray-50"}`}>
          <i className={`${open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-500 text-sm`}></i>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-5">
          {children}
        </div>
      )}
    </div>
  );
}

interface SettingsTabProps {
  adminRole?: string | null;
}

// Roles that are NOT allowed to access Settings
const SETTINGS_BLOCKED_ROLES = new Set(["support", "finance", "read_only"]);

export default function SettingsTab({ adminRole }: SettingsTabProps) {
  const [ghl, setGhl] = useState<GhlStats | null>(null);
  const [stripe, setStripe] = useState<StripeStats | null>(null);
  const [loadingGhl, setLoadingGhl] = useState(true);
  const [loadingStripe, setLoadingStripe] = useState(true);
  const [bulkRetry, setBulkRetry] = useState<BulkRetryState>(INIT_BULK);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const loadGhl = async () => {
    setLoadingGhl(true);
    const { data } = await supabase
      .from("orders")
      .select("confirmation_id, email, ghl_synced_at, ghl_sync_error, ghl_last_attempt_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (data) {
      const orders = data as { confirmation_id: string; email: string; ghl_synced_at: string | null; ghl_sync_error: string | null; ghl_last_attempt_at: string | null; created_at: string }[];
      const synced = orders.filter((o) => !!o.ghl_synced_at).length;
      const withErrors = orders.filter((o) => !!o.ghl_sync_error);
      const pending = orders.filter((o) => !o.ghl_synced_at && !o.ghl_sync_error);
      const lastSync = orders.filter((o) => o.ghl_synced_at).sort((a, b) => new Date(b.ghl_synced_at!).getTime() - new Date(a.ghl_synced_at!).getTime())[0]?.ghl_synced_at ?? null;
      const lastAttempt = orders.filter((o) => o.ghl_last_attempt_at).sort((a, b) => new Date(b.ghl_last_attempt_at!).getTime() - new Date(a.ghl_last_attempt_at!).getTime())[0]?.ghl_last_attempt_at ?? null;

      setGhl({
        total: orders.length,
        synced,
        failed: withErrors.length,
        pending: pending.length,
        lastSync,
        lastAttempt,
        recentErrors: withErrors.slice(0, 5).map((o) => ({
          confirmation_id: o.confirmation_id,
          email: o.email,
          error: o.ghl_sync_error ?? "Unknown error",
        })),
      });
    }
    setLoadingGhl(false);
  };

  useEffect(() => {
    // Stripe stats
    const loadStripe = async () => {
      setLoadingStripe(true);
      try {
        const token = await getAdminToken();
        const res = await fetch(`${supabaseUrl}/functions/v1/stripe-payment-history?period=30d`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json() as { ok: boolean; summary?: { total_revenue: number; available_balance: number; charge_count: number; refund_count: number }; error?: string };
        if (result.ok && result.summary) {
          setStripe({ ok: true, ...result.summary });
        } else {
          setStripe({ ok: false, total_revenue: 0, available_balance: 0, charge_count: 0, refund_count: 0, error: result.error ?? "Connection error" });
        }
      } catch {
        setStripe({ ok: false, total_revenue: 0, available_balance: 0, charge_count: 0, refund_count: 0, error: "Could not reach Stripe API" });
      }
      setLoadingStripe(false);
    };

    loadGhl();
    loadStripe();
  }, [supabaseUrl]);

  const handleBulkGhlRetry = async (mode: "unsynced" | "all" = "unsynced") => {
    // "unsynced" = only orders where ghl_synced_at IS NULL (never synced) — includes ALL orders (paid + unpaid)
    // "all" = re-fire every order regardless of sync status — includes ALL orders (paid + unpaid)
    let query = supabase
      .from("orders")
      .select("confirmation_id, ghl_synced_at, ghl_sync_error, payment_intent_id")
      .limit(1000);

    if (mode === "unsynced") {
      query = query.is("ghl_synced_at", null);
    }

    const { data } = await query;
    const targets = (data ?? []) as { confirmation_id: string; ghl_synced_at: string | null; ghl_sync_error: string | null }[];

    if (targets.length === 0) {
      setBulkRetry({ running: false, total: 0, done: 0, successCount: 0, failCount: 0, finished: true, mode });
      setTimeout(() => setBulkRetry(INIT_BULK), 5000);
      return;
    }

    setBulkRetry({ running: true, total: targets.length, done: 0, successCount: 0, failCount: 0, finished: false, mode });

    const token = await getAdminToken();
    const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

    let successCount = 0;
    let failCount = 0;

    for (const order of targets) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/backfill-order-ghl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: token === anonKey ? anonKey : token,
          },
          body: JSON.stringify({ confirmationId: order.confirmation_id }),
        });
        const result = await res.json() as { ok: boolean };
        if (result.ok) { successCount++; } else { failCount++; }
      } catch {
        failCount++;
      }
      setBulkRetry((prev) => ({ ...prev, done: prev.done + 1, successCount, failCount }));
    }

    setBulkRetry({ running: false, total: targets.length, done: targets.length, successCount, failCount, finished: true, mode });
    // Refresh GHL stats after retry
    await loadGhl();
    setTimeout(() => setBulkRetry(INIT_BULK), 10000);
  };

  const ghlHealthPct = ghl && ghl.total > 0 ? Math.round((ghl.synced / ghl.total) * 100) : 0;
  const unsyncedCount = ghl ? ghl.failed + ghl.pending : 0;

  // ── Role gate — block non-admin roles from Settings (after all hooks) ──────
  if (adminRole && SETTINGS_BLOCKED_ROLES.has(adminRole)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-2xl mx-auto mb-5">
            <i className="ri-lock-2-line text-gray-400 text-3xl"></i>
          </div>
          <h2 className="text-base font-extrabold text-gray-900 mb-2">Settings Access Restricted</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-5">
            The Settings tab is only accessible to <strong className="text-gray-700">Owners</strong> and <strong className="text-gray-700">Admins</strong>.
            Your current role (<span className="font-semibold text-gray-700 capitalize">{adminRole.replace(/_/g, " ")}</span>) does not have permission to view or modify integration settings.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-left">
            <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-amber-800 leading-relaxed">
              If you need access to a specific setting, contact your Owner or Admin to make the change on your behalf.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-extrabold text-gray-900 mb-1">Settings &amp; Integrations</h2>
        <p className="text-xs text-gray-500">Click any section to expand it.</p>
      </div>

      {/* ── GHL Integration ── */}
      <AccordionSection
        title="GoHighLevel (GHL)"
        subtitle="CRM for email, SMS, calling, and automation"
        icon="ri-radar-line"
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        badge={!loadingGhl && ghl ? (ghl.failed === 0 ? "All Synced" : `${ghlHealthPct}% Healthy`) : undefined}
        badgeColor={!loadingGhl && ghl ? (ghl.failed === 0 || ghlHealthPct >= 90 ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-red-100 text-red-600") : undefined}
        defaultOpen={true}
      >
        <div>
          {loadingGhl ? (
            <div className="flex items-center gap-2 py-4 text-gray-500">
              <i className="ri-loader-4-line animate-spin"></i>
              <span className="text-sm">Loading GHL stats...</span>
            </div>
          ) : ghl ? (
            <>
              {/* Sync stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Total Orders", value: ghl.total, color: "text-gray-700" },
                  { label: "Synced to GHL", value: `${ghl.synced} (${ghlHealthPct}%)`, color: "text-[#3b6ea5]" },
                  { label: "Sync Errors", value: ghl.failed, color: ghl.failed > 0 ? "text-red-500" : "text-gray-400" },
                  { label: "Pending Sync", value: ghl.pending, color: ghl.pending > 5 ? "text-amber-600" : "text-gray-400" },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                    <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>Sync Coverage</span>
                  <span className="font-bold">{ghlHealthPct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all"
                    style={{ width: `${ghlHealthPct}%`, backgroundColor: ghlHealthPct >= 90 ? "#1a5c4f" : ghlHealthPct >= 70 ? "#f59e0b" : "#ef4444" }}>
                  </div>
                </div>
              </div>

              {/* ── BULK SYNC SECTION ── */}
              <div className="mb-5 rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <i className="ri-cloud-line text-gray-500 text-sm"></i>
                  <p className="text-xs font-extrabold text-gray-700">Bulk GHL Sync</p>
                  {unsyncedCount > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                      {unsyncedCount} unsynced
                    </span>
                  )}
                  {unsyncedCount === 0 && ghl && (
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3b6ea5] flex-shrink-0"></span>
                      All synced
                    </span>
                  )}
                </div>

                <div className="px-4 py-4 space-y-3 bg-white">
                  {/* Primary: Sync unsynced only */}
                  <div className="flex items-start gap-3 p-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl">
                    <div className="w-8 h-8 flex items-center justify-center bg-[#3b6ea5] rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-upload-cloud-2-line text-white text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-extrabold text-[#3b6ea5] mb-0.5">
                        Sync Unsynced Orders Only
                        {unsyncedCount > 0 && <span className="ml-1.5 font-normal text-[#2d5a8e]">({unsyncedCount} orders)</span>}
                      </p>
                      <p className="text-xs text-[#2d5a8e] leading-relaxed mb-2">
                        {unsyncedCount > 0
                          ? `Pushes all ${unsyncedCount} order${unsyncedCount !== 1 ? "s" : ""} (paid + unpaid leads) where ghl_synced_at IS NULL to GHL. Safe one-click catch-up for orders never synced.`
                          : "No unsynced orders found — all orders (paid + unpaid) have been pushed to GHL at least once."}
                      </p>
                      {!bulkRetry.finished && (
                        <button
                          type="button"
                          onClick={() => handleBulkGhlRetry("unsynced")}
                          disabled={bulkRetry.running || unsyncedCount === 0}
                          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-extrabold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {bulkRetry.running && bulkRetry.mode === "unsynced"
                            ? <><i className="ri-loader-4-line animate-spin"></i>Syncing {bulkRetry.done}/{bulkRetry.total}...</>
                            : unsyncedCount > 0
                              ? <><i className="ri-upload-cloud-2-line"></i>Sync {unsyncedCount} Unsynced Orders</>
                              : <><i className="ri-checkbox-circle-line"></i>Nothing to Sync</>}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Secondary: Re-fire all */}
                  <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-refresh-line text-gray-600 text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-extrabold text-gray-700 mb-0.5">Re-fire All Orders (Paid + Unpaid)</p>
                      <p className="text-xs text-gray-500 leading-relaxed mb-2">
                        Re-sends every order (paid and unpaid leads) to GHL regardless of sync status. GHL will create or update contacts accordingly. Use after changing webhook URL or field mappings.
                      </p>
                      {!bulkRetry.finished && (
                        <button
                          type="button"
                          onClick={() => handleBulkGhlRetry("all")}
                          disabled={bulkRetry.running}
                          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-gray-700 text-white text-xs font-extrabold rounded-lg hover:bg-gray-800 disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {bulkRetry.running && bulkRetry.mode === "all"
                            ? <><i className="ri-loader-4-line animate-spin"></i>Re-firing {bulkRetry.done}/{bulkRetry.total}...</>
                            : <><i className="ri-refresh-line"></i>Re-fire All to GHL</>}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Live progress bar (shared) */}
                  {bulkRetry.running && (
                    <div className="px-1">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                        <span className="font-semibold">
                          {bulkRetry.mode === "unsynced" ? "Syncing unsynced orders..." : "Re-firing all orders..."}
                        </span>
                        <span className="font-extrabold">{bulkRetry.done} / {bulkRetry.total}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-[#3b6ea5] transition-all duration-300"
                          style={{ width: bulkRetry.total > 0 ? `${Math.round((bulkRetry.done / bulkRetry.total) * 100)}%` : "0%" }}
                        ></div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className="text-[#3b6ea5] font-semibold flex items-center gap-1">
                          <i className="ri-checkbox-circle-fill"></i>{bulkRetry.successCount} synced
                        </span>
                        {bulkRetry.failCount > 0 && (
                          <span className="text-red-500 font-semibold flex items-center gap-1">
                            <i className="ri-error-warning-line"></i>{bulkRetry.failCount} failed
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Finished result */}
                  {bulkRetry.finished && (
                    <div className={`px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${bulkRetry.failCount === 0 ? "bg-[#3b6ea5] text-white" : "bg-amber-100 text-amber-800"}`}>
                      <i className={bulkRetry.failCount === 0 ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                      {bulkRetry.total === 0
                        ? bulkRetry.mode === "unsynced"
                          ? "No unsynced orders found — all orders are already in GHL."
                          : "No orders found to re-fire."
                        : bulkRetry.failCount === 0
                          ? `All ${bulkRetry.successCount} order${bulkRetry.successCount !== 1 ? "s" : ""} synced to GHL successfully.`
                          : `${bulkRetry.successCount} synced, ${bulkRetry.failCount} still failed — check GHL_WEBHOOK_URL in Supabase Secrets.`}
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Last Successful Sync</p>
                  <p className="text-xs font-semibold text-gray-700">{ghl.lastSync ? fmt(ghl.lastSync) : "None recorded"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Last Sync Attempt</p>
                  <p className="text-xs font-semibold text-gray-700">{ghl.lastAttempt ? fmt(ghl.lastAttempt) : "None recorded"}</p>
                </div>
              </div>

              {/* Recent errors */}
              {ghl.recentErrors.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2">Recent Sync Errors</p>
                  <div className="space-y-2">
                    {ghl.recentErrors.map((err) => (
                      <div key={err.confirmation_id} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 flex items-start gap-3">
                        <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-red-700 truncate">{err.confirmation_id} — {err.email}</p>
                          <p className="text-xs text-red-600 mt-0.5 truncate">{err.error.slice(0, 100)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Use the bulk retry above to fix all at once, or &ldquo;Re-fire GHL&rdquo; per order.</p>
                </div>
              )}

              {/* Data synced fields */}
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4 mb-5">
                <p className="text-xs font-bold text-[#3b6ea5] uppercase tracking-widest mb-3">Fields Synced to GHL</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {["customer email", "first + last name", "phone", "state", "confirmation ID", "selected provider", "assigned doctor", "plan type", "delivery speed", "order total", "payment status", "letter URL", "order status", "doctor status", "assessment completed"].map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-[#3b6ea5]">
                      <i className="ri-checkbox-circle-fill text-[#3b6ea5]" style={{ fontSize: "10px" }}></i>
                      <span className="capitalize">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* ── Dual Webhook Architecture ── */}
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">GHL Webhook Configuration</p>

            {/* Architecture overview */}
            <div className="mb-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-information-line text-[#3b6ea5] text-sm flex-shrink-0 mt-0.5"></i>
                <div>
                  <p className="text-xs font-bold text-[#3b6ea5] mb-1.5">Dual Webhook Architecture</p>
                  <p className="text-xs text-[#2d5a8e] leading-relaxed mb-2">
                    The admin portal routes payloads to <strong>two separate GHL workflows</strong> based on event type. Set both secrets in <strong>Supabase Dashboard → Edge Functions → Secrets</strong>.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <div className="bg-white border border-[#b8cce4] rounded-lg px-3 py-2.5">
                      <p className="text-[10px] font-bold text-[#3b6ea5] uppercase tracking-widest mb-1">Workflow 1 — Order / Contact Sync</p>
                      <code className="text-[10px] font-mono bg-[#e0f5ef] px-1.5 py-0.5 rounded text-[#3b6ea5]">GHL_WEBHOOK_URL</code>
                      <p className="text-[10px] text-[#2d5a8e] mt-1.5 leading-relaxed">Receives order events. Updates GHL contact custom fields: orderStatus, orderAmount, assignedDoctor, orderSource, etc.</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {["assessment_started", "payment_confirmed", "doctor_assigned", "order_completed", "refund_issued", "order_cancelled"].map((e) => (
                          <span key={e} className="text-[9px] font-mono bg-[#e0f5ef] text-[#3b6ea5] px-1.5 py-0.5 rounded">{e}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-lg px-3 py-2.5">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">Workflow 2 — Comms / Call-SMS Sync</p>
                      <code className="text-[10px] font-mono bg-amber-50 px-1.5 py-0.5 rounded text-amber-700">GHL_COMMS_WEBHOOK_URL</code>
                      <p className="text-[10px] text-amber-700 mt-1.5 leading-relaxed">Receives communication events. Logs SMS and call activity to GHL contact timeline.</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {["sms_inbound", "sms_outbound", "call_inbound", "call_outbound", "call_completed", "call_missed"].map((e) => (
                          <span key={e} className="text-[9px] font-mono bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{e}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Secrets reminder */}
            <div className="mb-4 flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <i className="ri-key-2-line text-amber-500 text-sm flex-shrink-0 mt-0.5"></i>
              <div>
                <p className="text-xs font-bold text-amber-800">Set These Secrets in Supabase</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Go to <strong>Supabase Dashboard → Edge Functions → Secrets</strong> and set:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { name: "GHL_WEBHOOK_URL", desc: "Order/contact workflow trigger URL" },
                    { name: "GHL_COMMS_WEBHOOK_URL", desc: "Comms/call-SMS workflow trigger URL" },
                    { name: "GHL_API_KEY", desc: "GHL Private Integration API key" },
                    { name: "GHL_LOCATION_ID", desc: "GHL sub-account Location ID" },
                    { name: "GHL_PHONE_NUMBER", desc: "GHL-owned phone number (E.164)" },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-lg px-2 py-1">
                      <code className="text-[10px] font-mono font-bold text-amber-800">{s.name}</code>
                      <span className="text-[10px] text-amber-600">— {s.desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-amber-600 mt-2 italic">
                  Note: GHL_PIPELINE_ID and GHL_STAGE_* secrets are no longer used in code but can remain in Supabase until confirmed safe to delete.
                </p>
              </div>
            </div>

            {/* Reference webhook URLs */}
            <div className="space-y-3">
              {[
                { label: "Workflow 1 — Order/Contact Sync", url: GHL_WEBHOOK_MAIN, badge: "GHL_WEBHOOK_URL", badgeColor: "bg-[#3b6ea5] text-white", desc: "Paste this URL as the trigger in your GHL Order/Contact Sync workflow" },
                { label: "Network Webhook — Join Our Network", url: GHL_WEBHOOK_NETWORK, badge: "GHL_NETWORK_WEBHOOK_URL", badgeColor: "bg-gray-200 text-gray-600", desc: "Used when providers apply via the Join Our Network page" },
              ].map((w) => (
                <div key={w.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-gray-600">{w.label}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${w.badgeColor}`}>{w.badge}</span>
                    </div>
                    <CopyButton text={w.url} />
                  </div>
                  <p className="font-mono text-xs text-gray-600 break-all mb-1">{w.url}</p>
                  <p className="text-[10px] text-gray-400">{w.desc}</p>
                </div>
              ))}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-xs font-bold text-amber-700">Workflow 2 — Comms/Call-SMS Sync</p>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">GHL_COMMS_WEBHOOK_URL</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Create a new GHL Workflow with a <strong>Custom Webhook</strong> trigger and paste your comms workflow URL into the <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">GHL_COMMS_WEBHOOK_URL</code> Supabase secret.
                  This workflow receives SMS and call events — map <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">messageBody</code>, <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">direction</code>, <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">callStatus</code> to log communication activity on the contact timeline.
                </p>
              </div>
            </div>

            {/* GHL Workflow setup guide */}
            <div className="mt-4 bg-gray-900 rounded-xl p-4">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-3">GHL Workflow Setup — Both Workflows</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-[#4ade80] uppercase tracking-widest mb-2">Workflow 1 — Order/Contact</p>
                  <div className="space-y-2">
                    {[
                      { step: "1", label: "Trigger", desc: "Custom Webhook → paste GHL_WEBHOOK_URL value" },
                      { step: "2", label: "Create/Update Contact", desc: "Map: email, phone, firstName, lastName, confirmationId" },
                      { step: "3", label: "Update Custom Fields", desc: "Map: orderStatus, orderAmount, assignedDoctor, orderSource, refundAmount, state" },
                      { step: "4", label: "Add Tags", desc: "Map: tags field → GHL applies all tags automatically" },
                    ].map((s) => (
                      <div key={s.step} className="flex items-start gap-2">
                        <div className="w-4 h-4 flex items-center justify-center bg-white/10 rounded-full flex-shrink-0 mt-0.5">
                          <span className="text-[9px] font-bold text-white/70">{s.step}</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white">{s.label}</p>
                          <p className="text-[9px] text-white/50 leading-relaxed">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">Workflow 2 — Comms/Call-SMS</p>
                  <div className="space-y-2">
                    {[
                      { step: "1", label: "Trigger", desc: "Custom Webhook → paste GHL_COMMS_WEBHOOK_URL value" },
                      { step: "2", label: "Find Contact", desc: "Look up by email or phone from payload" },
                      { step: "3", label: "Add Note / Activity", desc: "Map: messageBody, direction, callStatus, timestamp" },
                      { step: "4", label: "Done", desc: "No contact creation needed — comms link to existing contacts" },
                    ].map((s) => (
                      <div key={s.step} className="flex items-start gap-2">
                        <div className="w-4 h-4 flex items-center justify-center bg-white/10 rounded-full flex-shrink-0 mt-0.5">
                          <span className="text-[9px] font-bold text-white/70">{s.step}</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white">{s.label}</p>
                          <p className="text-[9px] text-white/50 leading-relaxed">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── GHL Connection Test ── */}
          <GhlConnectionTestPanel supabaseUrl={supabaseUrl} />
        </div>
      </AccordionSection>

      {/* ── Sequence Management ── */}
      <AccordionSection
        title="Sequence Management"
        subtitle="Add or remove orders from the automated follow-up sequence"
        icon="ri-mail-send-line"
        iconBg="bg-sky-50"
        iconColor="text-sky-600"
      >
        <SequenceManagementPanel />
      </AccordionSection>

      {/* ── Stripe Integration ── */}
      <AccordionSection
        title="Stripe"
        subtitle="Payment processing and refunds"
        icon="ri-bank-card-line"
        iconBg="bg-[#e8f0f9]"
        iconColor="text-[#3b6ea5]"
        badge={!loadingStripe && stripe ? (stripe.ok ? "Connected" : "Error") : undefined}
        badgeColor={!loadingStripe && stripe ? (stripe.ok ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-red-100 text-red-600") : undefined}
      >
        {loadingStripe ? (
          <div className="flex items-center gap-2 py-4 text-gray-500">
            <i className="ri-loader-4-line animate-spin"></i>
            <span className="text-sm">Loading Stripe data...</span>
          </div>
        ) : stripe ? (
          stripe.ok ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Revenue (30d)", value: formatCurrency(stripe.total_revenue), color: "text-emerald-600" },
                  { label: "Available Balance", value: formatCurrency(stripe.available_balance), color: "text-[#3b6ea5]" },
                  { label: "Charges (30d)", value: stripe.charge_count, color: "text-gray-700" },
                  { label: "Refunds (30d)", value: stripe.refund_count, color: "text-orange-500" },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                    <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
                <div className="grid grid-cols-2 gap-2">
                  {["Payment intents", "Refund creation", "Balance retrieval", "Webhook handler", "Checkout sessions", "CSV export"].map((cap) => (
                    <div key={cap} className="flex items-center gap-1.5 text-xs text-[#3b6ea5]">
                      <i className="ri-checkbox-circle-fill" style={{ fontSize: "10px" }}></i>{cap}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <i className="ri-error-warning-line text-red-500 text-base mt-0.5 flex-shrink-0"></i>
              <div>
                <p className="text-sm font-bold text-red-700 mb-0.5">Stripe Connection Error</p>
                <p className="text-xs text-red-600">{stripe.error}</p>
                <p className="text-xs text-red-500 mt-1">Check that STRIPE_SECRET_KEY is set in Supabase Edge Function secrets.</p>
              </div>
            </div>
          )
        ) : null}
      </AccordionSection>

      {/* ── Email / Documents ── */}
      <AccordionSection
        title="Email & Documents"
        subtitle="Supabase Auth emails and ESA letter delivery"
        icon="ri-mail-settings-line"
        iconBg="bg-gray-50"
        iconColor="text-gray-600"
      >
        <div className="space-y-3 mb-5">
          {[
            { label: "Team Invite Email", desc: "Sent when adding new staff via Team tab. Uses Supabase Auth invite flow.", ok: true },
            { label: "Password Reset Email", desc: "Sent when staff request a password reset.", ok: true },
            { label: "ESA Letter Email", desc: "Sent to patients when their ESA letter is ready (notify-patient-letter function).", ok: true },
            { label: "Patient Portal Invite", desc: "Customer login invite via customer-login page.", ok: true },
          ].map((t) => (
            <div key={t.label} className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 ${t.ok ? "bg-[#e8f0f9]" : "bg-red-50"}`}>
                <i className={`${t.ok ? "ri-mail-check-line text-[#3b6ea5]" : "ri-mail-close-line text-red-500"} text-sm`}></i>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-gray-900">{t.label}</p>
                  <StatusBadge ok={t.ok} label={t.ok ? "Active" : "Issue"} />
                </div>
                <p className="text-xs text-gray-500">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
            <div>
              <p className="text-xs font-bold text-amber-800 mb-0.5">Custom Email Branding</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                To brand emails with PawTenant name/logo: Supabase Dashboard → Authentication → Email Templates.
                For custom sender domain: Authentication → Email → SMTP Settings.
              </p>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ── BAA Compliance Tracker ── */}
      <AccordionSection title="HIPAA BAA Compliance Tracker" subtitle="Track Business Associate Agreements with PHI vendors" icon="ri-shield-keyhole-line" iconBg="bg-indigo-50" iconColor="text-indigo-600">
        <BaaPanel />
      </AccordionSection>

      {/* ── Google Sheets Sync ── */}
      <AccordionSection title="Google Sheets — Order Records" subtitle="Manual backup of all orders & leads to your Google Sheet" icon="ri-file-excel-2-line" iconBg="bg-green-50" iconColor="text-green-600">
        <GoogleSheetsSyncPanel supabaseUrl={supabaseUrl} />
      </AccordionSection>

      {/* ── Data Retention Policy ── */}
      <AccordionSection title="Data Retention Policy" subtitle="Configure how long each data type is kept before archival" icon="ri-archive-line" iconBg="bg-orange-50" iconColor="text-orange-600">
        <DataRetentionPanel />
      </AccordionSection>

      {/* ── Notification Routing Test Panel ── */}
      <AccordionSection title="Notification Routing Test" subtitle="Live preview of who receives each notification — no emails sent" icon="ri-route-line" iconBg="bg-violet-50" iconColor="text-violet-600">
        <NotificationRoutingTestPanel supabaseUrl={supabaseUrl} />
      </AccordionSection>

      {/* ── Admin Notification Preferences ── */}
      <AccordionSection title="Admin Notification Preferences" subtitle="Configure which events trigger admin alerts" icon="ri-notification-3-line" iconBg="bg-sky-50" iconColor="text-sky-600">
        <AdminNotificationPrefsPanel />
      </AccordionSection>

      {/* ── Master Email Layout ── */}
      <AccordionSection title="Master Email Layout" subtitle="Editable HTML shell wrapping every template — use {{content}} placeholder" icon="ri-layout-2-line" iconBg="bg-[#e8f0f9]" iconColor="text-[#3b6ea5]">
        <MasterEmailLayoutPanel />
      </AccordionSection>

      {/* ── Communications Templates Hub ── */}
      <AccordionSection title="Communications Templates Hub" subtitle="Manage all email + SMS templates — single source of truth" icon="ri-message-2-line" iconBg="bg-[#e8f0f9]" iconColor="text-[#3b6ea5]">
        <CommsTemplatesPanel />
      </AccordionSection>

      {/* ── UTM Campaign Link Generator ── */}
      <AccordionSection title="UTM Campaign Link Generator" subtitle="Build trackable URLs for marketing campaigns" icon="ri-links-line" iconBg="bg-gray-50" iconColor="text-gray-600">
        <UTMLinkGenerator />
      </AccordionSection>

      {/* ── Admin Dashboard Source of Truth ── */}
      <AccordionSection title="Architecture Reference" subtitle="Admin Dashboard is Source of Truth" icon="ri-server-line" iconBg="bg-gray-900" iconColor="text-white">
        <div className="bg-[#0f1e1a] rounded-xl p-5 -mx-5 -mb-5">
          <p className="text-xs text-white/60 leading-relaxed mb-4">
            All case data lives in Supabase. GHL receives synced contact/communication data only and is used exclusively for email, SMS, calling, and automation campaigns. Never rely on GHL for case status or billing data.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { source: "Supabase (orders)", owns: "Orders, case status, letters" },
              { source: "Stripe", owns: "Payments, refunds, balances" },
              { source: "GHL", owns: "Email, SMS, calls, campaigns" },
              { source: "Doctor Portal", owns: "Case reviews, notes" },
              { source: "Customer Portal", owns: "Order tracking, downloads" },
              { source: "Admin Dashboard", owns: "Oversight of all above" },
            ].map((r) => (
              <div key={r.source} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                <p className="text-xs font-bold text-white/90">{r.source}</p>
                <p className="text-xs text-white/50 mt-0.5">{r.owns}</p>
              </div>
            ))}
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}
