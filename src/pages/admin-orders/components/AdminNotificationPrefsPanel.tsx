import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────────────
interface NotifPref {
  key: string;
  enabled: boolean;
  emailOverride: string;
  groupEmails: string[];
  perNotifEmails: string[];
}

interface NotifDef {
  key: string;
  label: string;
  desc: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  group: string;
  defaultEnabled: boolean;
  edgeFnSlug?: string; // edge function slug to call for test
}

// ── Notification definitions ─────────────────────────────────────────────────
const NOTIF_DEFS: NotifDef[] = [
  // Orders
  {
    key: "new_paid_order",
    label: "New Paid Order",
    desc: "Triggered when a customer completes checkout and payment is confirmed.",
    icon: "ri-shopping-cart-2-line",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    group: "Orders",
    defaultEnabled: true,
  },
  {
    key: "unpaid_lead",
    label: "Unpaid Lead / Abandoned Checkout",
    desc: "Triggered when a customer completes Step 2 (personal info) but hasn't paid yet.",
    icon: "ri-user-search-line",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    group: "Orders",
    defaultEnabled: true,
  },
  {
    key: "order_under_review",
    label: "Order Under Review",
    desc: "Triggered when an order status is changed to 'Under Review' by a provider.",
    icon: "ri-eye-line",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    group: "Orders",
    defaultEnabled: false,
  },
  {
    key: "order_completed",
    label: "Order Completed — Customer Notified",
    desc: "Triggered when a provider marks an order complete and the customer letter email is sent.",
    icon: "ri-checkbox-circle-line",
    iconBg: "bg-[#f0faf7]",
    iconColor: "text-[#1a5c4f]",
    group: "Orders",
    defaultEnabled: true,
  },
  {
    key: "order_cancelled",
    label: "Order Cancelled",
    desc: "Triggered when an order is cancelled (with or without refund).",
    icon: "ri-close-circle-line",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
    group: "Orders",
    defaultEnabled: true,
  },
  {
    key: "refund_issued",
    label: "Refund Issued",
    desc: "Triggered when a refund is processed through Stripe.",
    icon: "ri-refund-2-line",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-500",
    group: "Orders",
    defaultEnabled: true,
  },
  // Providers
  {
    key: "provider_application",
    label: "New Provider Application",
    desc: "Triggered when a licensed professional submits a Join Our Network application.",
    icon: "ri-user-add-line",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    group: "Providers",
    defaultEnabled: true,
  },
  {
    key: "provider_license_change",
    label: "Provider License Change",
    desc: "Triggered when a provider updates their licensed states or license numbers.",
    icon: "ri-shield-check-line",
    iconBg: "bg-[#f0faf7]",
    iconColor: "text-[#1a5c4f]",
    group: "Providers",
    defaultEnabled: true,
  },
  {
    key: "provider_letter_submitted",
    label: "Provider Submitted a Letter",
    desc: "Triggered when a provider uploads and submits a completed ESA letter.",
    icon: "ri-file-text-line",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    group: "Providers",
    defaultEnabled: false,
  },
  {
    key: "provider_rejected_order",
    label: "Provider Rejected an Order",
    desc: "Triggered when a provider declines to complete an assigned order.",
    icon: "ri-user-unfollow-line",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
    group: "Providers",
    defaultEnabled: true,
  },
  // Renewals & Follow-ups
  {
    key: "renewal_reminder_sent",
    label: "Renewal Reminder Sent",
    desc: "Triggered when the 30-day renewal reminder batch runs and emails are dispatched.",
    icon: "ri-refresh-line",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    group: "Renewals & Follow-ups",
    defaultEnabled: false,
    edgeFnSlug: "send-renewal-reminders",
  },
  {
    key: "checkout_recovery_sent",
    label: "Checkout Recovery Email Sent",
    desc: "Triggered when an abandoned checkout recovery email is dispatched to a lead.",
    icon: "ri-mail-send-line",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    group: "Renewals & Follow-ups",
    defaultEnabled: false,
  },
  // System
  {
    key: "system_health_alert",
    label: "System Health Alert",
    desc: "Triggered when a system health check detects a critical failure or degraded service.",
    icon: "ri-heart-pulse-line",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
    group: "System",
    defaultEnabled: true,
    edgeFnSlug: "health-check",
  },
  {
    key: "payout_reminder",
    label: "Provider Payout Reminder",
    desc: "Sent to admin on the 12th & 27th of each month with unpaid provider earnings + CSV breakdown.",
    icon: "ri-money-dollar-circle-line",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    group: "System",
    defaultEnabled: true,
    edgeFnSlug: "send-payout-reminder",
  },
];

const GROUPS = [...new Set(NOTIF_DEFS.map((d) => d.group))];

const GROUP_ICONS: Record<string, string> = {
  "Orders": "ri-shopping-bag-line",
  "Providers": "ri-stethoscope-line",
  "Renewals & Follow-ups": "ri-refresh-line",
  "System": "ri-server-line",
};

// ── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${enabled ? "bg-[#1a5c4f]" : "bg-gray-200"}`}
      aria-pressed={enabled}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${enabled ? "translate-x-4" : "translate-x-0"}`}></span>
    </button>
  );
}

// ── Multi-email input (tag-style) ────────────────────────────────────────────
function MultiEmailInput({
  emails,
  onChange,
  placeholder,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmail = (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return;
    if (emails.includes(trimmed)) return;
    onChange([...emails, trimmed]);
    setInputVal("");
  };

  const removeEmail = (em: string) => {
    onChange(emails.filter((e) => e !== em));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addEmail(inputVal);
    } else if (e.key === "Backspace" && !inputVal && emails.length > 0) {
      removeEmail(emails[emails.length - 1]);
    }
  };

  return (
    <div
      className="min-h-[38px] flex flex-wrap gap-1.5 items-center border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white cursor-text focus-within:ring-2 focus-within:ring-[#1a5c4f]/20 focus-within:border-[#1a5c4f]/40"
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map((em) => (
        <span
          key={em}
          className="inline-flex items-center gap-1 bg-[#f0faf7] border border-[#b8ddd5] text-[#1a5c4f] text-xs font-semibold px-2 py-0.5 rounded-full"
        >
          {em}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeEmail(em); }}
            className="w-3 h-3 flex items-center justify-center text-[#1a5c4f] hover:text-red-500 cursor-pointer ml-0.5"
          >
            <i className="ri-close-line text-xs"></i>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="email"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addEmail(inputVal)}
        placeholder={emails.length === 0 ? (placeholder ?? "Add email and press Enter...") : "Add another..."}
        className="flex-1 min-w-[160px] text-xs bg-transparent outline-none text-gray-800 placeholder-gray-400 py-0.5"
      />
    </div>
  );
}

// ── Per-notification email manager ───────────────────────────────────────────
function PerNotifEmailManager({
  notifKey,
  notifLabel,
  emails,
  onChange,
  groupEmails,
  globalEmail,
}: {
  notifKey: string;
  notifLabel: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  groupEmails: string[];
  globalEmail: string;
}) {
  const fallbackDesc =
    emails.length === 0
      ? groupEmails.length > 0
        ? `Using group recipients (${groupEmails.join(", ")})`
        : globalEmail
          ? `Using default: ${globalEmail}`
          : "No recipients configured"
      : null;

  return (
    <div className="px-4 pb-4 pt-3 bg-[#fafffe] border-t border-[#e0f2ee]">
      <div className="flex items-center gap-2 mb-1.5">
        <i className="ri-mail-settings-line text-[#1a5c4f] text-xs"></i>
        <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest">
          Specific Recipients — {notifLabel}
        </p>
      </div>
      <p className="text-xs text-gray-500 mb-2 leading-relaxed">
        Only <strong>these addresses</strong> will receive this specific notification (overrides group &amp; global). Press{" "}
        <kbd className="bg-gray-100 border border-gray-200 rounded px-1 text-xs">Enter</kbd> or{" "}
        <kbd className="bg-gray-100 border border-gray-200 rounded px-1 text-xs">,</kbd> after each.
      </p>
      <MultiEmailInput
        emails={emails}
        onChange={onChange}
        placeholder={`Add specific recipients for "${notifLabel}"...`}
      />
      {fallbackDesc ? (
        <p className="text-xs text-gray-400 mt-1.5 italic flex items-center gap-1">
          <i className="ri-arrow-right-line text-gray-300"></i>
          {fallbackDesc}
        </p>
      ) : (
        <p className="text-xs text-[#2d7a6a] mt-1.5 flex items-center gap-1">
          <i className="ri-checkbox-circle-line"></i>
          {emails.length} specific recipient{emails.length !== 1 ? "s" : ""} for this notification only
        </p>
      )}
    </div>
  );
}

// ── Group email manager ──────────────────────────────────────────────────────
function GroupEmailManager({
  group,
  groupEmails,
  onChange,
  globalEmail,
}: {
  group: string;
  groupEmails: string[];
  onChange: (emails: string[]) => void;
  globalEmail: string;
}) {
  return (
    <div className="px-4 pb-4 pt-3 bg-[#f8fffe] border-t border-[#e0f2ee]">
      <div className="flex items-center gap-2 mb-2">
        <i className="ri-mail-settings-line text-[#1a5c4f] text-sm"></i>
        <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest">
          Group Recipients — {group}
        </p>
      </div>
      <p className="text-xs text-gray-500 mb-2 leading-relaxed">
        All <strong>{group}</strong> notifications (without specific per-notification overrides) go to these addresses.
        Add multiple — press <kbd className="bg-gray-100 border border-gray-200 rounded px-1 text-xs">Enter</kbd> or{" "}
        <kbd className="bg-gray-100 border border-gray-200 rounded px-1 text-xs">,</kbd> after each.
      </p>
      <MultiEmailInput
        emails={groupEmails}
        onChange={onChange}
        placeholder={globalEmail ? `Default: ${globalEmail} — add more...` : "Add email and press Enter..."}
      />
      {groupEmails.length === 0 ? (
        <p className="text-xs text-gray-400 mt-1.5 italic">
          No group emails set — using default fallback email above.
        </p>
      ) : (
        <p className="text-xs text-[#2d7a6a] mt-1.5">
          {groupEmails.length} recipient{groupEmails.length !== 1 ? "s" : ""} will receive all {group} notifications (unless a notification has specific recipients).
        </p>
      )}
    </div>
  );
}

// ── Test email result ────────────────────────────────────────────────────────
interface TestResult {
  ok: boolean;
  message: string;
  resendId?: string;
}

// ── Main Panel ───────────────────────────────────────────────────────────────
export default function AdminNotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<Record<string, NotifPref>>({});
  const [globalEmail, setGlobalEmail] = useState("");
  const [groupEmails, setGroupEmails] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>("Orders");
  const [expandedGroupEmail, setExpandedGroupEmail] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedPerNotifEmail, setExpandedPerNotifEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState<string | null>(null); // key being tested
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from("admin_notification_prefs")
      .select("notification_key, enabled, email_override, group_emails, per_notif_emails")
      .eq("user_id", user.id);

    const map: Record<string, NotifPref> = {};
    NOTIF_DEFS.forEach((def) => {
      map[def.key] = { key: def.key, enabled: def.defaultEnabled, emailOverride: "", groupEmails: [], perNotifEmails: [] };
    });

    const gEmails: Record<string, string[]> = {};
    GROUPS.forEach((g) => { gEmails[g] = []; });

    // Read global fallback email from the dedicated _global_settings row first
    const globalSettingsRow = (data ?? []).find(
      (row: { notification_key: string }) => row.notification_key === "_global_settings"
    ) as { email_override: string | null } | undefined;
    const dbGlobalEmail = globalSettingsRow?.email_override ?? "";

    // Fall back to localStorage for backwards compat, then user email
    const fallbackEmail = dbGlobalEmail || localStorage.getItem("admin_notif_global_email") || user.email || "";
    setGlobalEmail(fallbackEmail);

    (data ?? []).forEach((row: {
      notification_key: string;
      enabled: boolean;
      email_override: string | null;
      group_emails: string[] | null;
      per_notif_emails: string[] | null;
    }) => {
      // Skip the _global_settings meta row — it's not a real notification
      if (row.notification_key === "_global_settings") return;

      map[row.notification_key] = {
        key: row.notification_key,
        enabled: row.enabled,
        emailOverride: row.email_override ?? "",
        groupEmails: row.group_emails ?? [],
        perNotifEmails: row.per_notif_emails ?? [],
      };
      const def = NOTIF_DEFS.find((d) => d.key === row.notification_key);
      if (def && row.group_emails?.length) {
        const existing = new Set(gEmails[def.group] ?? []);
        row.group_emails.forEach((e) => existing.add(e));
        gEmails[def.group] = Array.from(existing);
      }
    });

    setPrefs(map);
    setGroupEmails(gEmails);
    setLoading(false);
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const updatePref = (key: string, patch: Partial<NotifPref>) => {
    setPrefs((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setSaved(false);
  };

  const updateGroupEmails = (group: string, emails: string[]) => {
    setGroupEmails((prev) => ({ ...prev, [group]: emails }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    // Also save to localStorage as backup
    localStorage.setItem("admin_notif_global_email", globalEmail);

    // Build upsert rows for all notification prefs
    const upserts = Object.values(prefs).map((p) => {
      const def = NOTIF_DEFS.find((d) => d.key === p.key);
      const gEmails = def ? (groupEmails[def.group] ?? []) : [];
      return {
        user_id: userId,
        notification_key: p.key,
        enabled: p.enabled,
        // Clear email_override — we no longer use it for individual notifications
        // (legacy field; keeping null to avoid confusion)
        email_override: null,
        group_emails: gEmails.length > 0 ? gEmails : null,
        // Save null when empty so the DB row is truly empty (not [])
        // This is critical: empty array means "no recipients" but null means "use fallback"
        per_notif_emails: p.perNotifEmails.length > 0 ? p.perNotifEmails : null,
        updated_at: new Date().toISOString(),
      };
    });

    // Add the dedicated _global_settings row to persist the global fallback email in the DB
    // This is read by the edge function to resolve fallback recipients
    upserts.push({
      user_id: userId,
      notification_key: "_global_settings",
      enabled: true,
      email_override: globalEmail || null,
      group_emails: null,
      per_notif_emails: null,
      updated_at: new Date().toISOString(),
    });

    const { error } = await supabase
      .from("admin_notification_prefs")
      .upsert(upserts, { onConflict: "user_id,notification_key" });

    if (error) {
      console.error("[AdminNotificationPrefsPanel] Save error:", error);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSendTest = async (def: NotifDef) => {
    setSendingTest(def.key);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[def.key];
      return next;
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

      // Determine which recipients would receive this (mirrors edge function logic exactly)
      const pref = prefs[def.key];
      const gEmails = groupEmails[def.group] ?? [];
      // Priority: specific > group > global fallback (NO mixing — each tier is exclusive)
      const effectiveRecipients =
        pref?.perNotifEmails?.length
          ? [...pref.perNotifEmails]
          : gEmails.length
            ? [...gEmails]
            : [globalEmail].filter(Boolean);

      if (effectiveRecipients.length === 0) {
        setTestResults((prev) => ({
          ...prev,
          [def.key]: { ok: false, message: "No recipients configured — add at least one email address first" },
        }));
        setSendingTest(null);
        return;
      }

      // If there's a specific edge function slug, call it
      if (def.edgeFnSlug) {
        const res = await fetch(`${supabaseUrl}/functions/v1/${def.edgeFnSlug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ force: true, testMode: true }),
        });
        const result = await res.json() as { ok?: boolean; error?: string; message?: string };
        const ok = res.ok && (result.ok !== false);
        setTestResults((prev) => ({
          ...prev,
          [def.key]: {
            ok,
            message: ok
              ? `Test sent to ${effectiveRecipients.join(", ")} — ${result.message ?? "check your inbox"}`
              : (result.error ?? result.message ?? "Test failed"),
          },
        }));
      } else {
        // Generic test — send via broadcast-email in bulk mode to configured recipients
        const subject = `[TEST] ${def.label} — Admin Notification Preview`;
        const bodyText = `This is a test notification for: ${def.label}\n\n${def.desc}\n\nThis email was sent from the Admin Notification Preferences panel to verify your recipient routing.\n\nConfigured recipients: ${effectiveRecipients.join(", ")}`;

        const recipientObjs = effectiveRecipients.map((email) => ({
          email,
          name: "Admin",
          confirmation_id: "TEST",
        }));

        const res = await fetch(`${supabaseUrl}/functions/v1/broadcast-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            recipients: recipientObjs,
            subject,
            bodyText,
            includePortalCta: false,
            sentBy: "Notification Prefs Test",
            audienceKey: "admin_notif_test",
          }),
        });
        const result = await res.json() as { ok?: boolean; error?: string; successCount?: number; failCount?: number };
        const ok = res.ok && (result.ok !== false) && (result.failCount === 0 || (result.successCount ?? 0) > 0);
        setTestResults((prev) => ({
          ...prev,
          [def.key]: {
            ok,
            message: ok
              ? `Test sent to ${effectiveRecipients.join(", ")} (${result.successCount ?? effectiveRecipients.length} delivered)`
              : (result.error ?? "Test send failed — check Resend API key in Supabase secrets"),
          },
        }));
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [def.key]: { ok: false, message: "Network error — could not send test" },
      }));
    }
    setSendingTest(null);
    setTimeout(() => {
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[def.key];
        return next;
      });
    }, 10000);
  };

  const enabledCount = Object.values(prefs).filter((p) => p.enabled).length;
  const totalCount = NOTIF_DEFS.length;

  const toggleGroup = (group: string, enable: boolean) => {
    const keys = NOTIF_DEFS.filter((d) => d.group === group).map((d) => d.key);
    setPrefs((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = { ...next[k], enabled: enable }; });
      return next;
    });
    setSaved(false);
  };

  // Recipient summary for a notification
  const getRecipientSummary = (def: NotifDef) => {
    const pref = prefs[def.key];
    if (!pref) return null;
    if (pref.perNotifEmails.length > 0) {
      return { emails: pref.perNotifEmails, source: "specific" as const };
    }
    const gEmails = groupEmails[def.group] ?? [];
    if (gEmails.length > 0) {
      return { emails: gEmails, source: "group" as const };
    }
    if (globalEmail) {
      return { emails: [globalEmail], source: "global" as const };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center gap-3 text-gray-400">
        <i className="ri-loader-4-line animate-spin text-lg"></i>
        <span className="text-sm">Loading notification preferences...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-xl flex-shrink-0">
            <i className="ri-notification-3-line text-orange-500 text-lg"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Admin Notification Preferences</h3>
            <p className="text-xs text-gray-400">Choose which events trigger an email — and who receives them.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500">
            <span className="text-[#1a5c4f]">{enabledCount}</span>/{totalCount} active
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 ${
              saved ? "bg-[#f0faf7] text-[#1a5c4f] border border-[#b8ddd5]" : "bg-[#1a5c4f] text-white hover:bg-[#17504a]"
            }`}
          >
            <i className={saving ? "ri-loader-4-line animate-spin" : saved ? "ri-checkbox-circle-fill" : "ri-save-line"}></i>
            {saving ? "Saving..." : saved ? "Saved!" : "Save Preferences"}
          </button>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Routing legend */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <i className="ri-route-line text-gray-500"></i>Email Routing Priority
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#e8f5f1] border border-[#b8ddd5] rounded-full text-[#1a5c4f] font-bold">
              <i className="ri-mail-settings-line text-xs"></i>Specific (per-notification)
            </div>
            <i className="ri-arrow-right-line text-gray-300"></i>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 border border-sky-200 rounded-full text-sky-700 font-bold">
              <i className="ri-stack-line text-xs"></i>Group recipients
            </div>
            <i className="ri-arrow-right-line text-gray-300"></i>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 font-bold">
              <i className="ri-shield-line text-xs"></i>Default fallback
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Specific recipients override group, which overrides the default. All levels support multiple email addresses.
          </p>
        </div>

        {/* Global email */}
        <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg flex-shrink-0 border border-[#b8ddd5]">
              <i className="ri-mail-settings-line text-[#1a5c4f] text-sm"></i>
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-[#1a5c4f] mb-1">Default Fallback Email</p>
              <p className="text-xs text-[#2d7a6a] mb-3 leading-relaxed">
                Used when no group-specific or notification-specific emails are set. This is your last-resort catchall.
              </p>
              <input
                type="email"
                value={globalEmail}
                onChange={(e) => { setGlobalEmail(e.target.value); setSaved(false); }}
                placeholder="admin@pawtenant.com"
                className="w-full text-sm border border-[#b8ddd5] rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20"
              />
            </div>
          </div>
        </div>

        {/* Info callout */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
          <p className="text-xs text-amber-800 leading-relaxed">
            Toggling a notification off prevents the admin alert from being sent. It does <strong>not</strong> affect emails sent to customers or providers — those always go out regardless.
          </p>
        </div>

        {/* Notification groups */}
        <div className="space-y-3">
          {GROUPS.map((group) => {
            const groupDefs = NOTIF_DEFS.filter((d) => d.group === group);
            const groupEnabled = groupDefs.filter((d) => prefs[d.key]?.enabled).length;
            const allOn = groupEnabled === groupDefs.length;
            const allOff = groupEnabled === 0;
            const isOpen = expandedGroup === group;
            const isEmailOpen = expandedGroupEmail === group;
            const gEmails = groupEmails[group] ?? [];

            return (
              <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
                {/* Group header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => setExpandedGroup(isOpen ? null : group)}
                >
                  <div className="w-7 h-7 flex items-center justify-center bg-white rounded-lg border border-gray-200 flex-shrink-0">
                    <i className={`${GROUP_ICONS[group] ?? "ri-notification-line"} text-gray-500 text-sm`}></i>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">{group}</p>
                    <p className="text-xs text-gray-400">
                      {groupEnabled}/{groupDefs.length} active
                      {gEmails.length > 0 && (
                        <span className="ml-2 text-sky-600 font-semibold">
                          · {gEmails.length} group recipient{gEmails.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Group email button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedGroupEmail(isEmailOpen ? null : group);
                      if (!isOpen) setExpandedGroup(group);
                    }}
                    className={`whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer mr-1 ${
                      isEmailOpen
                        ? "bg-sky-600 text-white"
                        : gEmails.length > 0
                          ? "bg-sky-50 text-sky-700 border border-sky-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    title="Set group-level email recipients"
                  >
                    <i className="ri-mail-add-line text-xs"></i>
                    {gEmails.length > 0 ? `${gEmails.length} group` : "Group Emails"}
                  </button>

                  {/* Group quick toggles */}
                  <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group, true)}
                      className={`whitespace-nowrap px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${allOn ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      All On
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group, false)}
                      className={`whitespace-nowrap px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${allOff ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      All Off
                    </button>
                  </div>
                  <i className={`${isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-400 text-sm flex-shrink-0`}></i>
                </div>

                {/* Group email manager */}
                {isEmailOpen && (
                  <GroupEmailManager
                    group={group}
                    groupEmails={gEmails}
                    onChange={(emails) => updateGroupEmails(group, emails)}
                    globalEmail={globalEmail}
                  />
                )}

                {/* Notification rows */}
                {isOpen && (
                  <div className="divide-y divide-gray-50">
                    {groupDefs.map((def) => {
                      const pref = prefs[def.key] ?? { key: def.key, enabled: def.defaultEnabled, emailOverride: "", groupEmails: [], perNotifEmails: [] };
                      const isSettingsExpanded = expandedKey === def.key;
                      const isEmailExpanded = expandedPerNotifEmail === def.key;
                      const recipientSummary = getRecipientSummary(def);
                      const testResult = testResults[def.key];
                      const isTesting = sendingTest === def.key;

                      return (
                        <div key={def.key} className="bg-white">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${def.iconBg}`}>
                              <i className={`${def.icon} ${def.iconColor} text-sm`}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${pref.enabled ? "text-gray-900" : "text-gray-400"}`}>{def.label}</p>
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                <p className="text-xs text-gray-400 truncate">{def.desc}</p>
                              </div>
                              {/* Recipient summary chip */}
                              {pref.enabled && recipientSummary && (
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-semibold ${
                                    recipientSummary.source === "specific"
                                      ? "bg-[#e8f5f1] text-[#1a5c4f]"
                                      : recipientSummary.source === "group"
                                        ? "bg-sky-50 text-sky-700"
                                        : "bg-amber-50 text-amber-700"
                                  }`}>
                                    <i className={`text-xs ${
                                      recipientSummary.source === "specific" ? "ri-mail-settings-line" :
                                      recipientSummary.source === "group" ? "ri-stack-line" : "ri-shield-line"
                                    }`}></i>
                                    {recipientSummary.source === "specific" ? "Specific" : recipientSummary.source === "group" ? "Group" : "Default"}:
                                    {" "}{recipientSummary.emails.slice(0, 2).join(", ")}{recipientSummary.emails.length > 2 ? ` +${recipientSummary.emails.length - 2}` : ""}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Recipient config button */}
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedPerNotifEmail(isEmailExpanded ? null : def.key);
                                setExpandedKey(null);
                              }}
                              className={`whitespace-nowrap flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex-shrink-0 ${
                                isEmailExpanded
                                  ? "bg-[#1a5c4f] text-white"
                                  : pref.perNotifEmails?.length > 0
                                    ? "bg-[#e8f5f1] text-[#1a5c4f] border border-[#b8ddd5]"
                                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                              }`}
                              title="Set specific recipients for this notification"
                            >
                              <i className="ri-user-settings-line text-sm"></i>
                              {pref.perNotifEmails?.length > 0 ? `${pref.perNotifEmails.length}` : ""}
                            </button>

                            {/* Test email button */}
                            {pref.enabled && (
                              <button
                                type="button"
                                onClick={() => handleSendTest(def)}
                                disabled={isTesting}
                                title={`Send a test "${def.label}" notification`}
                                className="whitespace-nowrap flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 cursor-pointer transition-colors disabled:opacity-50 flex-shrink-0"
                              >
                                {isTesting
                                  ? <i className="ri-loader-4-line animate-spin text-xs"></i>
                                  : <i className="ri-test-tube-line text-xs"></i>
                                }
                                Test
                              </button>
                            )}

                            <Toggle
                              enabled={pref.enabled}
                              onChange={(v) => updatePref(def.key, { enabled: v })}
                            />
                          </div>

                          {/* Test result feedback */}
                          {testResult && (
                            <div className={`mx-4 mb-2 flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${testResult.ok ? "bg-violet-50 border border-violet-200 text-violet-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
                              <i className={testResult.ok ? "ri-checkbox-circle-fill flex-shrink-0 mt-0.5" : "ri-error-warning-line flex-shrink-0 mt-0.5"}></i>
                              <span>{testResult.message}</span>
                              {testResult.ok && (
                                <a
                                  href="https://resend.com/emails"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto whitespace-nowrap text-violet-600 hover:underline flex items-center gap-1 flex-shrink-0"
                                >
                                  <i className="ri-external-link-line"></i>View in Resend
                                </a>
                              )}
                            </div>
                          )}

                          {/* Per-notification email recipients */}
                          {isEmailExpanded && (
                            <PerNotifEmailManager
                              notifKey={def.key}
                              notifLabel={def.label}
                              emails={pref.perNotifEmails ?? []}
                              onChange={(emails) => updatePref(def.key, { perNotifEmails: emails })}
                              groupEmails={groupEmails[def.group] ?? []}
                              globalEmail={globalEmail}
                            />
                          )}

                          {/* Per-notification legacy override (kept for compatibility) */}
                          {isSettingsExpanded && (
                            <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                                Legacy Single Override (use Recipients above instead)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="email"
                                  value={pref.emailOverride}
                                  onChange={(e) => updatePref(def.key, { emailOverride: e.target.value })}
                                  placeholder={globalEmail || "Leave blank to use group emails above"}
                                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20"
                                />
                                {pref.emailOverride && (
                                  <button
                                    type="button"
                                    onClick={() => updatePref(def.key, { emailOverride: "" })}
                                    className="whitespace-nowrap text-xs text-red-500 hover:text-red-700 font-semibold cursor-pointer px-2"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Active Notifications Summary</p>
          <div className="flex flex-wrap gap-2">
            {NOTIF_DEFS.filter((d) => prefs[d.key]?.enabled).map((d) => {
              const summary = getRecipientSummary(d);
              return (
                <span key={d.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-700">
                  <i className={`${d.icon} text-xs ${d.iconColor}`}></i>
                  {d.label}
                  {summary && (
                    <span className={`text-[10px] px-1 rounded font-bold ml-0.5 ${
                      summary.source === "specific" ? "text-[#1a5c4f]" :
                      summary.source === "group" ? "text-sky-600" : "text-amber-600"
                    }`}>
                      {summary.emails.length > 1 ? `${summary.emails.length}` : "1"}
                    </span>
                  )}
                </span>
              );
            })}
            {enabledCount === 0 && (
              <span className="text-xs text-gray-400 italic">No notifications enabled.</span>
            )}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Changes are saved to your account and persist across sessions.</p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`whitespace-nowrap flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer disabled:opacity-60 ${
              saved ? "bg-[#f0faf7] text-[#1a5c4f] border border-[#b8ddd5]" : "bg-[#1a5c4f] text-white hover:bg-[#17504a]"
            }`}
          >
            <i className={saving ? "ri-loader-4-line animate-spin" : saved ? "ri-checkbox-circle-fill" : "ri-save-line"}></i>
            {saving ? "Saving..." : saved ? "Saved!" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
