// SettingsTab — GHL, Stripe, and Email integration health
import { useState, useEffect, useMemo } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import CouponManagementPanel from "./CouponManagementPanel";
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
      <i className={copied ? "ri-checkbox-circle-line text-[#1a5c4f]" : "ri-file-copy-line"}></i>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${ok ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-red-100 text-red-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? "bg-[#1a5c4f]" : "bg-red-500"}`}></span>
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

const GHL_WEBHOOK_MAIN = "https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/d1962d95-66b5-4622-a16d-6d711c0bdd9b";
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
    iconBg: "bg-[#f0faf7]",
    iconColor: "text-[#1a5c4f]",
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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#f0faf7] text-[#1a5c4f]">
      <i className="ri-shield-check-fill text-[#1a5c4f]" style={{ fontSize: "10px" }}></i>BAA Signed
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
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${allSigned ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-red-50 text-red-600"}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${allSigned ? "bg-[#1a5c4f]" : "bg-red-500"}`}></span>
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
              style={{ width: `${(signedCount / BAA_VENDORS.length) * 100}%`, backgroundColor: allSigned ? "#1a5c4f" : signedCount > 1 ? "#f59e0b" : "#ef4444" }}>
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
                              ? s === "signed" ? "bg-[#1a5c4f] text-white border-[#1a5c4f]"
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
          <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4 flex items-center gap-3">
            <i className="ri-shield-check-fill text-[#1a5c4f] text-lg"></i>
            <div>
              <p className="text-xs font-bold text-[#1a5c4f]">All BAAs on Record</p>
              <p className="text-xs text-[#2d7a6a]">Technical BAA coverage is complete. Remember to also maintain written policies, staff training records, and a risk assessment to fully satisfy HIPAA requirements.</p>
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
            saved ? "bg-[#f0faf7] text-[#1a5c4f] border border-[#b8ddd5]" : "bg-[#1a5c4f] text-white hover:bg-[#17504a]"
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
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20 cursor-pointer"
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
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.autoArchive ? "bg-[#1a5c4f]" : "bg-gray-200"}`}
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
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20"
              />
            </div>
          )}
        </div>

        {/* Summary card */}
        <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
          <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest mb-3">Current Policy Summary</p>
          <div className="grid grid-cols-2 gap-2">
            {retentionFields.map((f) => (
              <div key={String(f.key)} className="bg-white rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="text-xs font-bold text-[#1a5c4f]">
                  {RETENTION_OPTIONS.find((o) => o.value === settings[f.key])?.label ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#2d7a6a] mt-3 leading-relaxed">
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
        <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-[#1a5c4f] text-sm mt-0.5 flex-shrink-0"></i>
            <div className="text-xs text-[#2d7a6a] leading-relaxed space-y-1">
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
                  : "bg-[#1a5c4f] text-white hover:bg-[#17504a]"
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

// ── Email Templates Preview ──────────────────────────────────────────────────

const PREVIEW_TEMPLATES = [
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
    label: "Broadcast Promo (Light Green)",
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
        <a href="${ctaUrl}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
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
          <div style="background:#1a5c4f;padding:28px 32px;text-align:center;">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;" />
            <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.05em;">ESA &amp; PSD Letter Consultations</span>
          </div>
          <div style="padding:32px 36px;">
            ${subject ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${subject}</h1>` : ""}
            ${paragraphs}
            ${ctaHtml}
          </div>
          <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:hello@pawtenant.com" style="color:#1a5c4f;text-decoration:none;">hello@pawtenant.com</a></p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Letter Consultations &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function EmailTemplatesPreview() {
  const [selectedId, setSelectedId] = useState(PREVIEW_TEMPLATES[0].id);
  const [previewName, setPreviewName] = useState("Jane");
  const [showRaw, setShowRaw] = useState(false);

  const selected = PREVIEW_TEMPLATES.find((t) => t.id === selectedId) ?? PREVIEW_TEMPLATES[0];

  const html = useMemo(
    () => buildEmailHtml(selected.subject, selected.body, selected.ctaLabel, selected.ctaUrl, previewName),
    [selected, previewName]
  );

  const groups = [...new Set(PREVIEW_TEMPLATES.map((t) => t.group))];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0">
            <i className="ri-eye-line text-[#1a5c4f] text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Email Templates Preview</h3>
            <p className="text-xs text-gray-400">Visually QA every email template before sending — no send required</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#f0faf7] text-[#1a5c4f]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1a5c4f] flex-shrink-0"></span>
          {PREVIEW_TEMPLATES.length} templates
        </span>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: "520px" }}>
        {/* Left: template picker */}
        <div className="w-full lg:w-56 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 bg-gray-50/50 p-4 space-y-4">
          {/* Preview name */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Preview As</label>
            <input
              type="text"
              value={previewName}
              onChange={(e) => setPreviewName(e.target.value || "Jane")}
              placeholder="Jane"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white"
            />
            <p className="text-[10px] text-gray-400 mt-1">Replaces &lbrace;name&rbrace; in preview</p>
          </div>

          {/* Template list grouped */}
          <div className="space-y-3">
            {groups.map((grp) => (
              <div key={grp}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <i className={`text-xs ${grp === "Transactional" ? "ri-mail-check-line text-[#1a5c4f]" : grp === "Marketing" ? "ri-megaphone-line text-amber-500" : "ri-broadcast-line text-violet-500"}`}></i>
                  {grp}
                </p>
                <div className="space-y-1">
                  {PREVIEW_TEMPLATES.filter((t) => t.group === grp).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        selectedId === t.id
                          ? "bg-[#1a5c4f] text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* View toggle */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setShowRaw(false)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${!showRaw ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500"}`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setShowRaw(true)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${showRaw ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500"}`}
              >
                HTML
              </button>
            </div>
          </div>
        </div>

        {/* Right: preview pane */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Subject bar */}
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/30 flex items-center gap-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">Subject:</span>
            <span className="text-xs font-semibold text-gray-800 truncate">{selected.subject}</span>
            <span className={`ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              selected.group === "Transactional" ? "bg-[#f0faf7] text-[#1a5c4f]" :
              selected.group === "Marketing" ? "bg-amber-50 text-amber-700" :
              "bg-violet-50 text-violet-700"
            }`}>{selected.group}</span>
          </div>

          {/* Preview notice */}
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <i className="ri-information-line text-amber-500 text-xs flex-shrink-0"></i>
            <p className="text-[11px] text-amber-700 font-semibold">
              Preview only — &lbrace;name&rbrace; replaced with &ldquo;{previewName}&rdquo; · No email is sent
            </p>
          </div>

          {/* Iframe or raw HTML */}
          {showRaw ? (
            <div className="flex-1 overflow-auto bg-gray-900 p-4">
              <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {html}
              </pre>
            </div>
          ) : (
            <div className="flex-1 bg-[#f3f4f6]" style={{ minHeight: "420px" }}>
              <iframe
                srcDoc={html}
                title={`Email Preview: ${selected.label}`}
                className="w-full h-full border-0"
                style={{ minHeight: "420px" }}
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Notification Routing Test Panel ─────────────────────────────────────────
const NOTIF_DEFS_PREVIEW = [
  { key: "new_paid_order", label: "New Paid Order", icon: "ri-shopping-cart-2-line", color: "text-green-600" },
  { key: "unpaid_lead", label: "Unpaid Lead", icon: "ri-user-search-line", color: "text-amber-600" },
  { key: "order_under_review", label: "Order Under Review", icon: "ri-eye-line", color: "text-orange-500" },
  { key: "order_completed", label: "Order Completed", icon: "ri-checkbox-circle-line", color: "text-[#1a5c4f]" },
  { key: "order_cancelled", label: "Order Cancelled", icon: "ri-close-circle-line", color: "text-red-500" },
  { key: "refund_issued", label: "Refund Issued", icon: "ri-refund-2-line", color: "text-rose-500" },
  { key: "provider_application", label: "Provider Application", icon: "ri-user-add-line", color: "text-indigo-600" },
  { key: "provider_license_change", label: "License Change", icon: "ri-shield-check-line", color: "text-[#1a5c4f]" },
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
  const sourceBg = (s: string) => s === "specific" ? "bg-[#e8f5f1] text-[#1a5c4f]" : s === "group" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700";

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

export default function SettingsTab() {
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

  const handleBulkGhlRetry = async () => {
    // Fetch all paid orders (not just unsynced), so re-fire works even when all are synced
    const { data } = await supabase
      .from("orders")
      .select("confirmation_id, ghl_synced_at, ghl_sync_error, payment_intent_id")
      .not("payment_intent_id", "is", null)
      .limit(500);

    const targets = (data ?? []) as { confirmation_id: string; ghl_synced_at: string | null; ghl_sync_error: string | null }[];

    if (targets.length === 0) {
      setBulkRetry({ running: false, total: 0, done: 0, successCount: 0, failCount: 0, finished: true });
      setTimeout(() => setBulkRetry(INIT_BULK), 5000);
      return;
    }

    setBulkRetry({ running: true, total: targets.length, done: 0, successCount: 0, failCount: 0, finished: false });

    const token = await getAdminToken();

    let successCount = 0;
    let failCount = 0;

    for (const order of targets) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/backfill-order-ghl`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ confirmationId: order.confirmation_id }),
        });
        const result = await res.json() as { ok: boolean };
        if (result.ok) { successCount++; } else { failCount++; }
      } catch {
        failCount++;
      }
      setBulkRetry((prev) => ({ ...prev, done: prev.done + 1, successCount, failCount }));
    }

    setBulkRetry({ running: false, total: targets.length, done: targets.length, successCount, failCount, finished: true });
    // Refresh GHL stats after retry
    await loadGhl();
    setTimeout(() => setBulkRetry(INIT_BULK), 10000);
  };

  const ghlHealthPct = ghl && ghl.total > 0 ? Math.round((ghl.synced / ghl.total) * 100) : 0;
  const unsyncedCount = ghl ? ghl.failed + ghl.pending : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-extrabold text-gray-900 mb-1">Settings &amp; Integrations</h2>
        <p className="text-xs text-gray-500">Monitor integration health and view configuration references.</p>
      </div>

      {/* ── GHL Integration ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-amber-50 rounded-xl flex-shrink-0">
              <i className="ri-radar-line text-amber-600 text-lg"></i>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">GoHighLevel (GHL)</h3>
              <p className="text-xs text-gray-400">CRM for email, SMS, calling, and automation</p>
            </div>
          </div>
          {!loadingGhl && ghl && (
            <StatusBadge ok={ghl.failed === 0 || ghlHealthPct >= 90} label={ghl.failed === 0 ? "All Synced" : `${ghlHealthPct}% Healthy`} />
          )}
        </div>

        <div className="px-5 py-5">
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
                  { label: "Synced to GHL", value: `${ghl.synced} (${ghlHealthPct}%)`, color: "text-[#1a5c4f]" },
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

              {/* ── BULK RETRY SECTION ── */}
              <div className="mb-5 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-extrabold text-[#1a5c4f] mb-0.5 flex items-center gap-2">
                      <i className="ri-refresh-line"></i> Bulk Re-sync All Orders to GHL
                    </p>
                    <p className="text-xs text-[#2d7a6a] leading-relaxed">
                      {unsyncedCount > 0
                        ? `${unsyncedCount} order${unsyncedCount !== 1 ? "s" : ""} not yet synced to GHL. Click to retry all at once.`
                        : "All orders are synced. Use this to re-fire all orders to GHL (e.g. after updating the webhook URL)."}
                    </p>
                  </div>

                  {!bulkRetry.finished && (
                    <button
                      type="button"
                      onClick={handleBulkGhlRetry}
                      disabled={bulkRetry.running}
                      className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-lg hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors flex-shrink-0"
                    >
                      {bulkRetry.running
                        ? <><i className="ri-loader-4-line animate-spin"></i>Syncing...</>
                        : unsyncedCount > 0
                          ? <><i className="ri-refresh-line"></i>Retry All ({unsyncedCount})</>
                          : <><i className="ri-refresh-line"></i>Re-fire All to GHL</>}
                    </button>
                  )}
                </div>

                {/* Live progress bar */}
                {bulkRetry.running && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-[#1a5c4f] mb-1.5">
                      <span className="font-semibold">Syncing orders to GHL...</span>
                      <span className="font-extrabold">{bulkRetry.done} / {bulkRetry.total}</span>
                    </div>
                    <div className="w-full bg-[#b8ddd5] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-[#1a5c4f] transition-all duration-300"
                        style={{ width: bulkRetry.total > 0 ? `${Math.round((bulkRetry.done / bulkRetry.total) * 100)}%` : "0%" }}
                      ></div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className="text-[#1a5c4f] font-semibold flex items-center gap-1">
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
                  <div className={`mt-3 px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${bulkRetry.failCount === 0 ? "bg-[#1a5c4f] text-white" : "bg-amber-100 text-amber-800"}`}>
                    <i className={bulkRetry.failCount === 0 ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                    {bulkRetry.total === 0
                      ? "Nothing to sync — all orders already in GHL."
                      : bulkRetry.failCount === 0
                        ? `All ${bulkRetry.successCount} order${bulkRetry.successCount !== 1 ? "s" : ""} synced to GHL successfully.`
                        : `${bulkRetry.successCount} synced, ${bulkRetry.failCount} still failed (check GHL API key in Supabase Secrets).`}
                  </div>
                )}
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
              <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4 mb-5">
                <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest mb-3">Fields Synced to GHL</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {["customer email", "first + last name", "phone", "state", "confirmation ID", "selected provider", "assigned doctor", "plan type", "delivery speed", "order total", "payment status", "letter URL", "order status", "doctor status", "assessment completed"].map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-[#1a5c4f]">
                      <i className="ri-checkbox-circle-fill text-[#1a5c4f]" style={{ fontSize: "10px" }}></i>
                      <span className="capitalize">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* Webhook URLs */}
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Webhook Configuration</p>
            <div className="space-y-3">
              {[
                { label: "Main Webhook — Paid Orders", url: GHL_WEBHOOK_MAIN },
                { label: "Network Webhook — Join Our Network", url: GHL_WEBHOOK_NETWORK },
              ].map((w) => (
                <div key={w.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600">{w.label}</p>
                    <CopyButton text={w.url} />
                  </div>
                  <p className="font-mono text-xs text-gray-600 break-all">{w.url}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">In GHL: Automation → ensure workflow is Published and set to &ldquo;Create/Update Contact&rdquo; as first action.</p>
          </div>
        </div>
      </div>

      {/* ── Stripe Integration ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0">
              <i className="ri-bank-card-line text-[#1a5c4f] text-lg"></i>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">Stripe</h3>
              <p className="text-xs text-gray-400">Payment processing and refunds</p>
            </div>
          </div>
          {!loadingStripe && stripe && <StatusBadge ok={stripe.ok} label={stripe.ok ? "Connected" : "Error"} />}
        </div>

        <div className="px-5 py-5">
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
                    { label: "Available Balance", value: formatCurrency(stripe.available_balance), color: "text-[#1a5c4f]" },
                    { label: "Charges (30d)", value: stripe.charge_count, color: "text-gray-700" },
                    { label: "Refunds (30d)", value: stripe.refund_count, color: "text-orange-500" },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                      <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                      <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-2">
                    {["Payment intents", "Refund creation", "Balance retrieval", "Webhook handler", "Checkout sessions", "CSV export"].map((cap) => (
                      <div key={cap} className="flex items-center gap-1.5 text-xs text-[#1a5c4f]">
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
        </div>
      </div>

      {/* ── Email / Documents ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl flex-shrink-0">
              <i className="ri-mail-settings-line text-gray-600 text-lg"></i>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">Email &amp; Documents</h3>
              <p className="text-xs text-gray-400">Supabase Auth emails and ESA letter delivery</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="space-y-3 mb-5">
            {[
              { label: "Team Invite Email", desc: "Sent when adding new staff via Team tab. Uses Supabase Auth invite flow.", ok: true },
              { label: "Password Reset Email", desc: "Sent when staff request a password reset.", ok: true },
              { label: "ESA Letter Email", desc: "Sent to patients when their ESA letter is ready (notify-patient-letter function).", ok: true },
              { label: "Patient Portal Invite", desc: "Customer login invite via customer-login page.", ok: true },
            ].map((t) => (
              <div key={t.label} className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <div className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 ${t.ok ? "bg-[#f0faf7]" : "bg-red-50"}`}>
                  <i className={`${t.ok ? "ri-mail-check-line text-[#1a5c4f]" : "ri-mail-close-line text-red-500"} text-sm`}></i>
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
                  To brand emails with PawTenant name/logo: Supabase Dashboard → Authentication → Email Templates (customize subjects + HTML).
                  For custom sender domain: Authentication → Email → SMTP Settings (add SendGrid, Postmark, etc.).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BAA Compliance Tracker ── */}
      <BaaPanel />

      {/* ── Google Sheets Sync ── */}
      <GoogleSheetsSyncPanel supabaseUrl={supabaseUrl} />

      {/* ── Coupon Code Management ── */}
      <CouponManagementPanel />

      {/* ── Data Retention Policy ── */}
      <DataRetentionPanel />

      {/* ── Notification Routing Test Panel ── */}
      <NotificationRoutingTestPanel supabaseUrl={supabaseUrl} />

      {/* ── Admin Notification Preferences ── */}
      <AdminNotificationPrefsPanel />

      {/* ── Email Templates Preview ── */}
      <EmailTemplatesPreview />

      {/* ── UTM Campaign Link Generator ── */}
      <UTMLinkGenerator />

      {/* ── Admin Dashboard Source of Truth ── */}
      <div className="bg-[#0f1e1a] rounded-xl p-5">
        <p className="text-sm font-bold text-white mb-1">Architecture: Admin Dashboard is Source of Truth</p>
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
    </div>
  );
}
