/**
 * CommunicationsTemplatesPanel — Phase G
 *
 * Communications templates UI (email + SMS) extracted verbatim from
 * SettingsTab.tsx so it can mount in BOTH:
 *   1. The legacy Settings tab (where it lived as `CommsTemplatesPanel`).
 *   2. The Communications Hub → Templates sub-tab
 *      (/admin-orders?tab=communications&sub=templates).
 *
 * No logic changes. No template content changes. No placeholder edits.
 * Same Supabase reads / writes against the `email_templates` table.
 * Same channel split (channel='email' vs channel='sms') the DB already
 * supports.
 *
 * The internal function and its types kept their original names where
 * they cross module boundaries (EmailTemplate, SmsTemplate,
 * DEFAULT_TEMPLATES, NEW_TEMPLATE_DEFAULTS, DEFAULT_SMS_TEMPLATES). The
 * default export is the panel itself, renamed to
 * CommunicationsTemplatesPanel for hub clarity.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";

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

// Phase G hotfix — re-exported so SettingsTab.tsx can keep rendering it
// at its existing AccordionSection. The component is conceptually part
// of the communications surface and will be migrated into the hub's
// Templates / Settings & Automation sub-tabs in a future phase.
export function MasterEmailLayoutPanel() {
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

// ── Recovery Sequence Settings panel ─────────────────────────────────────────
// Reads + writes 5 keys in `comms_settings`. ONLY the 3 email stages actually
// wired in the backend (lead-followup-sequence) are surfaced here:
//   recovery_stage_1_minutes (30-min), recovery_stage_2_hours (24-hr),
//   recovery_stage_4_days (3-day — historical key name).
// 48-hour, 5-day, and all SMS stages are intentionally hidden until backend
// support lands. Inactive comms_settings rows in DB are left untouched so no
// data is lost; they simply do not appear in the UI.
type RecoveryToggleKey =
  | "recovery_enabled"
  | "recovery_email_enabled";

type RecoveryNumKey =
  | "recovery_stage_1_minutes"
  | "recovery_stage_2_hours"
  | "recovery_stage_4_days";

const RECOVERY_NUM_DEFAULTS: Record<RecoveryNumKey, number> = {
  recovery_stage_1_minutes: 30,
  recovery_stage_2_hours:   24,
  recovery_stage_4_days:    3,
};

const RECOVERY_TOGGLE_DEFAULTS: Record<RecoveryToggleKey, boolean> = {
  recovery_enabled:       true,
  recovery_email_enabled: true,
};

// Phase G hotfix — re-exported alongside MasterEmailLayoutPanel for the
// same reason: SettingsTab.tsx still mounts this component today.
export function RecoverySequencePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [toggles, setToggles] = useState<Record<RecoveryToggleKey, boolean>>(RECOVERY_TOGGLE_DEFAULTS);
  const [nums, setNums]       = useState<Record<RecoveryNumKey, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]) {
      init[k] = String(RECOVERY_NUM_DEFAULTS[k]);
    }
    return init as Record<RecoveryNumKey, string>;
  });

  useEffect(() => {
    (async () => {
      const allKeys = [
        ...Object.keys(RECOVERY_TOGGLE_DEFAULTS),
        ...Object.keys(RECOVERY_NUM_DEFAULTS),
      ];
      const { data, error } = await supabase
        .from("comms_settings")
        .select("key, value")
        .in("key", allKeys);

      if (!error && data) {
        const map = new Map<string, string>();
        for (const r of data as Array<{ key: string; value: string | null }>) {
          if (r.value !== null) map.set(r.key, r.value);
        }

        setToggles((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(RECOVERY_TOGGLE_DEFAULTS) as RecoveryToggleKey[]) {
            const v = map.get(k);
            if (v !== undefined) {
              const lower = v.trim().toLowerCase();
              next[k] = lower === "true" || lower === "1" || lower === "yes";
            }
          }
          return next;
        });

        setNums((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]) {
            const v = map.get(k);
            if (v !== undefined) next[k] = v;
          }
          return next;
        });
      }
      setLoading(false);
    })();
  }, []);

  const validateNums = (): { ok: boolean; firstError?: string } => {
    for (const k of Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]) {
      const raw = nums[k];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || !/^\d+$/.test(raw.trim())) {
        return { ok: false, firstError: `${k} must be a positive whole number` };
      }
    }
    return { ok: true };
  };

  const save = async () => {
    const v = validateNums();
    if (!v.ok) {
      setStatus({ kind: "err", msg: v.firstError ?? "Invalid input" });
      setTimeout(() => setStatus(null), 4000);
      return;
    }
    setSaving(true);
    setStatus(null);

    const nowIso = new Date().toISOString();
    const rows = [
      ...(Object.keys(RECOVERY_TOGGLE_DEFAULTS) as RecoveryToggleKey[]).map((k) => ({
        key: k,
        value: toggles[k] ? "true" : "false",
        updated_at: nowIso,
      })),
      ...(Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]).map((k) => ({
        key: k,
        value: String(Number(nums[k])),
        updated_at: nowIso,
      })),
    ];

    const { error } = await supabase
      .from("comms_settings")
      .upsert(rows, { onConflict: "key" });

    setSaving(false);
    if (error) {
      setStatus({ kind: "err", msg: error.message });
    } else {
      setStatus({ kind: "ok", msg: "Saved." });
    }
    setTimeout(() => setStatus(null), 4000);
  };

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  const Toggle = ({
    label, sub, k,
  }: { label: string; sub: string; k: RecoveryToggleKey }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white">
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={toggles[k]}
        onClick={() => setToggles((p) => ({ ...p, [k]: !p[k] }))}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
          toggles[k] ? "bg-[#3b6ea5]" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            toggles[k] ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );

  const NumField = ({
    label, suffix, k,
  }: { label: string; suffix: string; k: RecoveryNumKey }) => (
    <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          step={1}
          value={nums[k]}
          onChange={(e) => setNums((p) => ({ ...p, [k]: e.target.value }))}
          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-md text-right focus:outline-none focus:border-[#3b6ea5]"
        />
        <span className="text-[11px] text-gray-500 w-12">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Active-stage banner — backend currently supports 3 email stages only */}
      <div className="px-3 py-2.5 rounded-md border border-amber-200 bg-amber-50">
        <p className="text-[12px] text-amber-900 leading-relaxed">
          <strong>Active 3-stage email recovery.</strong> Only the 30-minute, 24-hour,
          and 3-day recovery emails are currently active. Additional email/SMS stages
          should not be enabled until backend support is implemented.
        </p>
      </div>

      <div className="text-xs text-gray-600">
        Controls the automated email recovery sequence for unpaid leads.
        Stop conditions (paid, unsubscribe) are enforced regardless of these settings.
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Master Toggles</p>
        <Toggle label="Recovery Sequence Enabled" sub="Master switch — turns the entire automated sequence on or off" k="recovery_enabled" />
        <Toggle label="Email Recovery Enabled"    sub="Controls all 3 active email stages"                            k="recovery_email_enabled" />
      </div>

      {/* Email stages — 3 active stages only */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Stage Timings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NumField label="30-minute follow-up" suffix="minutes" k="recovery_stage_1_minutes" />
          <NumField label="24-hour follow-up"   suffix="hours"   k="recovery_stage_2_hours" />
          <NumField label="3-day follow-up"     suffix="days"    k="recovery_stage_4_days" />
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-[#3b6ea5] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {status && (
          <span className={`text-xs font-semibold ${status.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
            {status.kind === "ok" ? "✓ " : "⚠ "}{status.msg}
          </span>
        )}
      </div>

      {/* Future improvement marker — referenced by SETTINGS-IA-CLEANUP-GROUPED-SECTIONS */}
      <div className="mt-3 px-3 py-2 rounded-md border border-dashed border-gray-300 bg-gray-50">
        <p className="text-[11px] text-gray-500">
          <strong className="text-gray-600">Planned (not yet wired):</strong> additional email stages
          (48-hour, 5-day) and SMS recovery (3 stages). UI controls will return here once the backend
          sequence engine implements them.
        </p>
      </div>
    </div>
  );
}

// Slugs that are actively consumed by Edge Functions for automatic / button-driven sends.
// Anything NOT in this set is admin-editable but currently lives only as a preset
// (not wired to any automatic transactional flow yet).
//
// IMPORTANT — keep in sync with the backend reality. The lead-followup-sequence
// engine (supabase/functions/lead-followup-sequence/core.ts) currently sends
// ONLY the 3 active recovery stages (seq_30min, seq_24h, seq_3day). seq_48h,
// seq_5day, and the seq_sms_* slugs are template presets without wired
// senders — do NOT mark them as DB-managed or admins will believe edits go
// live when they do not.
const DB_MANAGED_EMAIL_SLUGS = new Set<string>([
  "review_request",
  "checkout_recovery",
  "checkout_recovery_discount",
  "seq_30min",
  "seq_24h",
  "seq_3day",
]);
const DB_MANAGED_SMS_SLUGS = new Set<string>([
  "review_request_sms",
]);

export default function CommunicationsTemplatesPanel() {
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
  // Test send state
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sent" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [testCooldown, setTestCooldown] = useState(0);

  // Tick cooldown down each second; reset status to idle when it hits 0
  useEffect(() => {
    if (testCooldown <= 0) return;
    const t = setTimeout(() => {
      setTestCooldown((c) => {
        if (c <= 1) { setTestStatus("idle"); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [testCooldown]);

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

  const handleSendTest = async () => {
    const email = testEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setTestError("Enter a valid email address");
      setTestStatus("error");
      return;
    }
    setTestSending(true);
    setTestStatus("idle");
    setTestError("");
    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/send-template-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: email,
          subject: selectedEmail.subject,
          html,
          template_id: selectedEmail.id,
          template_label: selectedEmail.label,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Send failed");
      setTestStatus("sent");
      setTestCooldown(10);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Unknown error");
      setTestStatus("error");
      setTimeout(() => setTestStatus("idle"), 6000);
    } finally {
      setTestSending(false);
    }
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
            <p className="text-xs text-gray-400">Edit DB-managed templates here. Some transactional emails still use legacy hardcoded templates until migrated.</p>
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

      {/* DB-managed status notice */}
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2.5">
        <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
        <div className="text-[11px] text-amber-800 leading-relaxed">
          <p className="font-semibold mb-0.5">Not every send uses these templates yet.</p>
          <p>
            Templates marked <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] align-middle"><span className="w-1 h-1 rounded-full bg-emerald-600"></span>Active DB</span> are wired to Edge Functions and edits go live immediately.
            Other rows are admin-editable presets and may not yet drive an automatic flow.
            Order confirmation, payment receipt, status emails, and most provider notifications still use legacy hardcoded templates &mdash; see <span className="font-mono">AI/email-system-audit.md</span> for the full mapping.
          </p>
        </div>
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
                          <span className="flex items-center justify-between gap-1.5">
                            <span className="truncate">{t.label}</span>
                            {DB_MANAGED_EMAIL_SLUGS.has(t.id) && (
                              <span title="Wired to an Edge Function — edits go live"
                                className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${selectedEmailId === t.id ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                                <span className={`w-1 h-1 rounded-full ${selectedEmailId === t.id ? "bg-white" : "bg-emerald-600"}`}></span>
                                DB
                              </span>
                            )}
                          </span>
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

                {/* ── Test Send ── */}
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/40 flex items-center gap-2 flex-wrap">
                  <i className="ri-send-plane-line text-[#3b6ea5] text-sm flex-shrink-0"></i>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex-shrink-0">Test Send</span>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => { setTestEmail(e.target.value); setTestStatus("idle"); setTestError(""); }}
                    placeholder="admin@example.com"
                    className="flex-1 min-w-0 max-w-[220px] px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSendTest}
                    disabled={testSending || !testEmail.trim() || testCooldown > 0}
                    className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                      testStatus === "sent" ? "bg-green-100 text-green-700" :
                      testStatus === "error" ? "bg-red-100 text-red-600" :
                      "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]"
                    }`}
                  >
                    {testSending
                      ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                      : testStatus === "sent"
                        ? <><i className="ri-checkbox-circle-line"></i>Sent!</>
                        : testStatus === "error"
                          ? <><i className="ri-error-warning-line"></i>Failed</>
                          : <><i className="ri-send-plane-line"></i>Send Test</>}
                  </button>
                  {testStatus === "error" && testError && (
                    <span className="text-[10px] text-red-500 font-semibold truncate max-w-[200px]">{testError}</span>
                  )}
                  {testStatus === "sent" && (
                    <span className="text-[10px] text-green-600 font-semibold">
                      Sent.{testCooldown > 0 ? ` You can send again in ${testCooldown}s` : ""}
                    </span>
                  )}
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
                          <span className="flex items-center justify-between gap-1.5">
                            <span className="truncate">{t.label}</span>
                            {DB_MANAGED_SMS_SLUGS.has(t.id) && (
                              <span title="Wired to an Edge Function — edits go live"
                                className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${selectedSmsId === t.id ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                                <span className={`w-1 h-1 rounded-full ${selectedSmsId === t.id ? "bg-white" : "bg-emerald-600"}`}></span>
                                DB
                              </span>
                            )}
                          </span>
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
