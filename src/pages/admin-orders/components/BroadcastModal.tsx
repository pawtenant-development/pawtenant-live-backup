// BroadcastModal — Send bulk SMS or Email to targeted customer segments
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import BroadcastHistoryModal from "./BroadcastHistoryModal";

interface Order {
  id: string;
  confirmation_id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  state: string | null;
  payment_intent_id: string | null;
  doctor_email: string | null;
  doctor_user_id: string | null;
  doctor_status: string | null;
  status: string;
  created_at: string;
}

interface BroadcastModalProps {
  orders: Order[];
  adminName: string;
  adminEmail?: string;
  onClose: () => void;
}

type Channel = "email" | "sms";

type AudienceKey =
  | "all_paid"
  | "completed"
  | "unassigned"
  | "under_review"
  | "all_leads"
  | "all_everyone";

interface AudienceOption {
  key: AudienceKey;
  label: string;
  description: string;
  icon: string;
  color: string;
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    key: "all_paid",
    label: "All Paid Customers",
    description: "Everyone who has completed payment",
    icon: "ri-money-dollar-circle-line",
    color: "text-emerald-600",
  },
  {
    key: "completed",
    label: "Completed Orders",
    description: "Customers who received their ESA letter",
    icon: "ri-checkbox-circle-line",
    color: "text-[#1a5c4f]",
  },
  {
    key: "unassigned",
    label: "Paid · Unassigned",
    description: "Paid but not yet assigned to a provider",
    icon: "ri-user-unfollow-line",
    color: "text-orange-600",
  },
  {
    key: "under_review",
    label: "Under Review",
    description: "Assigned and currently being evaluated",
    icon: "ri-time-line",
    color: "text-sky-600",
  },
  {
    key: "all_leads",
    label: "All Leads (Unpaid)",
    description: "Started assessment but haven't paid",
    icon: "ri-user-follow-line",
    color: "text-amber-600",
  },
  {
    key: "all_everyone",
    label: "Everyone",
    description: "All customers in the system",
    icon: "ri-group-line",
    color: "text-violet-600",
  },
];

const EMAIL_TEMPLATES = [
  {
    id: "renewal",
    label: "ESA Renewal",
    subject: "Time to Renew Your ESA Letter — Stay Protected",
    body: `Hi {name},

Your ESA letter may be approaching its annual renewal date. Most landlords and housing providers require an up-to-date letter from a licensed professional.

Renewing is quick and easy — our licensed providers are standing by to complete your evaluation within 24-48 hours.

Don't let your ESA protections lapse. Renew today and keep your housing rights secure.`,
    ctaLabel: "Renew My ESA Letter",
    ctaUrl: "https://pawtenant.com/renew-esa-letter",
  },
  {
    id: "psd_upsell",
    label: "PSD Upgrade",
    subject: "Upgrade to a Psychiatric Service Dog Letter — Fly Anywhere",
    body: `Hi {name},

Did you know you can upgrade your ESA letter to a full Psychiatric Service Dog (PSD) letter?

A PSD letter grants your dog access to public spaces, transportation, and more. Unlike ESA letters, PSD protections extend beyond housing.

Our licensed providers can evaluate your eligibility and issue a PSD letter — usually within 24 hours.`,
    ctaLabel: "Get My PSD Letter",
    ctaUrl: "https://pawtenant.com/how-to-get-psd-letter",
  },
  {
    id: "promo",
    label: "Promotion / Offer",
    subject: "Special Offer from PawTenant — For Our Valued Customers",
    body: `Hi {name},

As one of our valued customers, we wanted to share an exclusive offer just for you.

Whether you need a renewal, an upgrade, or a letter for a new pet — our licensed mental health professionals are here to help.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "View Offer",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "update",
    label: "General Update",
    subject: "An Important Update from PawTenant",
    body: `Hi {name},

We wanted to reach out with an important update regarding your PawTenant account.

Our team is committed to providing you with the best ESA consultation experience. If you have any questions or need assistance, please don't hesitate to contact us.

Thank you for being a PawTenant customer.`,
    ctaLabel: "Visit My Portal",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
  {
    id: "custom",
    label: "Custom",
    subject: "",
    body: "",
    ctaLabel: "Visit My Portal",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
];

const SMS_TEMPLATES = [
  {
    id: "renewal",
    label: "ESA Renewal",
    text: "Hi {name}! Your ESA letter may need renewal soon. Renew today at pawtenant.com/renew-esa-letter — our licensed providers complete it within 24-48hrs. Reply STOP to opt out.",
  },
  {
    id: "promo",
    label: "Promotion",
    text: "Hi {name}! PawTenant here with an exclusive offer for our valued customers. Visit pawtenant.com to see your options. Questions? Reply to this message.",
  },
  {
    id: "update",
    label: "Status Update",
    text: "Hi {name}, this is PawTenant. We have an important update regarding your account. Log into pawtenant.com/my-orders to view details. Reply STOP to opt out.",
  },
  {
    id: "custom",
    label: "Custom",
    text: "",
  },
];

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

function dedupeByEmail(orders: Order[]): Order[] {
  const seen = new Set<string>();
  return orders.filter((o) => {
    const key = o.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function BroadcastModal({ orders, adminName, adminEmail, onClose }: BroadcastModalProps) {
  const [channel, setChannel] = useState<Channel>("email");
  const [audience, setAudience] = useState<AudienceKey>("all_paid");
  const [excludedEmails, setExcludedEmails] = useState<Set<string>>(new Set());
  const [recipientSearch, setRecipientSearch] = useState("");
  const [showRecipients, setShowRecipients] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState("renewal");
  const [smsTemplateId, setSmsTemplateId] = useState("renewal");
  const [subject, setSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState(EMAIL_TEMPLATES[0].body);
  const [smsText, setSmsText] = useState(SMS_TEMPLATES[0].text);
  const [ctaLabel, setCtaLabel] = useState(EMAIL_TEMPLATES[0].ctaLabel);
  const [ctaUrl, setCtaUrl] = useState(EMAIL_TEMPLATES[0].ctaUrl);
  const [includePortalCta, setIncludePortalCta] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ successCount: number; failCount: number; errors?: string[] } | null>(null);
  const [sendProgress, setSendProgress] = useState(0);
  const [testEmail, setTestEmail] = useState(adminEmail ?? "");
  const [testSending, setTestSending] = useState(false);
  const [testSendResult, setTestSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Reset exclusions whenever the audience changes
  useEffect(() => {
    setExcludedEmails(new Set());
    setRecipientSearch("");
  }, [audience]);

  // Filter orders by audience
  const audienceOrders = useMemo(() => {
    let filtered: Order[] = [];
    switch (audience) {
      case "all_paid":
        filtered = orders.filter((o) => !!o.payment_intent_id && o.status !== "cancelled");
        break;
      case "completed":
        filtered = orders.filter((o) => o.doctor_status === "patient_notified");
        break;
      case "unassigned":
        filtered = orders.filter(
          (o) => !!o.payment_intent_id && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified"
        );
        break;
      case "under_review":
        filtered = orders.filter(
          (o) =>
            !!o.payment_intent_id &&
            !!(o.doctor_email || o.doctor_user_id) &&
            o.doctor_status !== "patient_notified"
        );
        break;
      case "all_leads":
        filtered = orders.filter((o) => !o.payment_intent_id);
        break;
      case "all_everyone":
        filtered = [...orders];
        break;
    }
    return dedupeByEmail(filtered);
  }, [orders, audience]);

  const withPhone = useMemo(() => audienceOrders.filter((o) => !!o.phone), [audienceOrders]);
  const withoutPhone = useMemo(() => audienceOrders.filter((o) => !o.phone), [audienceOrders]);

  // Apply exclusions
  const recipients = useMemo(() => {
    const base = channel === "sms" ? withPhone : audienceOrders;
    return base.filter((o) => !excludedEmails.has(o.email.toLowerCase()));
  }, [channel, withPhone, audienceOrders, excludedEmails]);

  const toggleExclude = (email: string) => {
    const key = email.toLowerCase();
    setExcludedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const excludeAll = () => {
    const base = channel === "sms" ? withPhone : audienceOrders;
    setExcludedEmails(new Set(base.map((o) => o.email.toLowerCase())));
  };

  const includeAll = () => setExcludedEmails(new Set());

  // Build live HTML preview of the email
  const buildPreviewHtml = (): string => {
    const previewName = "Jane";
    const previewBody = body.replace(/\{name\}/g, previewName);
    const paragraphs = previewBody
      .split("\n\n")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:0 0 16px 0;line-height:1.65;color:#374151;">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const ctaHtml = includePortalCta && ctaLabel && ctaUrl
      ? `<div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
        </div>`
      : "";

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email Preview</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr>
      <td align="center">
        <!-- Preview notice -->
        <div style="max-width:600px;margin:0 auto 12px auto;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 16px;text-align:center;">
          <span style="font-size:12px;font-weight:700;color:#92400e;">⚠ PREVIEW — not a real send · {name} replaced with "${previewName}"</span>
        </div>

        <!-- Email card -->
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <div style="background:#1a5c4f;padding:28px 32px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">🐾 PawTenant</span>
          </div>

          <!-- Body -->
          <div style="padding:32px 36px;">
            ${subject ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${subject}</h1>` : ""}
            ${paragraphs}
            ${ctaHtml}
          </div>

          <!-- Footer -->
          <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">Sent by ${adminName || "PawTenant Admin"} via PawTenant</p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant · ESA &amp; PSD Letters · <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  };

  // Filtered list for the recipient panel
  const displayedRecipients = useMemo(() => {
    const base = channel === "sms" ? withPhone : audienceOrders;
    const q = recipientSearch.toLowerCase();
    return base.filter((o) =>
      !q ||
      o.email.toLowerCase().includes(q) ||
      `${o.first_name ?? ""} ${o.last_name ?? ""}`.toLowerCase().includes(q) ||
      (o.phone ?? "").includes(q)
    );
  }, [channel, withPhone, audienceOrders, recipientSearch]);

  // Audience counts for all options
  const audienceCounts = useMemo(() => {
    const counts: Record<AudienceKey, number> = {
      all_paid: 0,
      completed: 0,
      unassigned: 0,
      under_review: 0,
      all_leads: 0,
      all_everyone: 0,
    };
    const paid = dedupeByEmail(orders.filter((o) => !!o.payment_intent_id && o.status !== "cancelled"));
    counts.all_paid = paid.length;
    counts.completed = dedupeByEmail(orders.filter((o) => o.doctor_status === "patient_notified")).length;
    counts.unassigned = dedupeByEmail(
      orders.filter((o) => !!o.payment_intent_id && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified")
    ).length;
    counts.under_review = dedupeByEmail(
      orders.filter(
        (o) =>
          !!o.payment_intent_id &&
          !!(o.doctor_email || o.doctor_user_id) &&
          o.doctor_status !== "patient_notified"
      )
    ).length;
    counts.all_leads = dedupeByEmail(orders.filter((o) => !o.payment_intent_id)).length;
    counts.all_everyone = dedupeByEmail(orders).length;
    return counts;
  }, [orders]);

  const handleEmailTemplateSelect = (id: string) => {
    setEmailTemplateId(id);
    const tmpl = EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tmpl) return;
    if (id !== "custom") {
      setSubject(tmpl.subject);
      setBody(tmpl.body);
      setCtaLabel(tmpl.ctaLabel);
      setCtaUrl(tmpl.ctaUrl);
    }
  };

  const handleSmsTemplateSelect = (id: string) => {
    setSmsTemplateId(id);
    const tmpl = SMS_TEMPLATES.find((t) => t.id === id);
    if (tmpl && id !== "custom") setSmsText(tmpl.text);
    else if (id === "custom") setSmsText("");
  };

  const isReadyToSend =
    channel === "email"
      ? subject.trim().length > 0 && body.trim().length > 0 && recipients.length > 0
      : smsText.trim().length > 0 && recipients.length > 0;

  const handleTestSend = async () => {
    if (!subject.trim() || !body.trim() || !testEmail.trim()) return;
    setTestSending(true);
    setTestSendResult(null);

    try {
      // Always refresh session before API calls to avoid expired JWT
      const { data: refreshData } = await supabase.auth.refreshSession();
      const token = refreshData.session?.access_token;
      if (!token) {
        setTestSendResult({ ok: false, message: "Session expired — please refresh the page and log in again." });
        setTestSending(false);
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          isTest: true,
          testEmail: testEmail.trim(),
          subject: subject.trim(),
          bodyText: body.trim(),
          includePortalCta,
          ctaLabel,
          ctaUrl,
          sentBy: adminName,
          audienceKey: audience,
        }),
      });

      let data: { ok?: boolean; successCount?: number; error?: string; message?: string } = {};
      try {
        const rawText = await res.text();
        data = JSON.parse(rawText);
      } catch {
        setTestSendResult({ ok: false, message: `HTTP ${res.status}: Unexpected server response` });
        setTestSending(false);
        return;
      }

      if (data.ok) {
        setTestSendResult({ ok: true, message: `Test email sent to ${testEmail.trim()} — check your inbox!` });
      } else {
        setTestSendResult({ ok: false, message: data.error ?? data.message ?? "Test send failed" });
      }
    } catch {
      setTestSendResult({ ok: false, message: "Network error — could not reach server" });
    } finally {
      setTestSending(false);
    }
  };

  const handleSend = async () => {
    if (!isReadyToSend) return;
    setSending(true);
    setSendProgress(0);
    setResult(null);

    try {
      // Always refresh session to avoid stale/expired JWT
      const { data: refreshData } = await supabase.auth.refreshSession();
      let token = refreshData.session?.access_token;

      // Fallback: try getSession if refresh fails
      if (!token) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData.session?.access_token;
      }

      if (!token) {
        setResult({ successCount: 0, failCount: recipients.length, errors: ["Session expired — please refresh the page and log in again."] });
        setSending(false);
        return;
      }

      if (channel === "email") {
        const emailRecipients = recipients.map((o) => ({
          email: o.email,
          name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
          confirmation_id: o.confirmation_id,
        }));
        const res = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            recipients: emailRecipients,
            subject: subject.trim(),
            bodyText: body.trim(),
            includePortalCta,
            ctaLabel,
            ctaUrl,
            sentBy: adminName,
            audienceKey: audience,
            excludedCount: excludedEmails.size,
          }),
        });

        let data: { ok?: boolean; successCount?: number; failCount?: number; errors?: string[]; error?: string; message?: string } = {};
        try {
          const rawText = await res.text();
          data = JSON.parse(rawText);
        } catch {
          setResult({ successCount: 0, failCount: recipients.length, errors: [`HTTP ${res.status}: Server returned an unexpected response. Check Supabase edge function logs.`] });
          setSending(false);
          return;
        }

        if (data.ok) {
          setResult({ successCount: data.successCount ?? 0, failCount: data.failCount ?? 0, errors: data.errors });
        } else {
          const errMsg = data.error ?? data.message ?? `HTTP ${res.status}: Unknown error — check Supabase edge function logs`;
          setResult({ successCount: 0, failCount: recipients.length, errors: [errMsg] });
        }
      } else {
        // SMS
        const targets = recipients.map((o) => ({
          orderId: o.id,
          confirmationId: o.confirmation_id,
          phone: o.phone!,
          name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
        }));
        const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ targets, message: smsText.trim(), sentBy: adminName }),
        });

        let data: { ok?: boolean; successCount?: number; failCount?: number; error?: string; message?: string } = {};
        try {
          const rawText = await res.text();
          data = JSON.parse(rawText);
        } catch {
          setResult({ successCount: 0, failCount: recipients.length, errors: [`HTTP ${res.status}: Server returned an unexpected response`] });
          setSending(false);
          return;
        }

        if (data.ok) {
          setResult({ successCount: data.successCount ?? 0, failCount: data.failCount ?? 0 });
        } else {
          setResult({ successCount: 0, failCount: recipients.length, errors: [data.error ?? data.message ?? "Send failed — check Supabase edge function logs"] });
        }
      }
    } catch {
      setResult({ successCount: 0, failCount: recipients.length, errors: ["Network error — could not reach server"] });
    } finally {
      setSending(false);
      setSendProgress(0);
    }
  };

  const selectedAudienceOption = AUDIENCE_OPTIONS.find((a) => a.key === audience)!;
  const charCount = smsText.length;
  const smsCredits = Math.ceil(charCount / 160) || 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 flex items-center justify-center bg-[#1a5c4f] rounded-xl flex-shrink-0">
            <i className="ri-broadcast-line text-white text-lg"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-gray-900">Customer Broadcast</h2>
            <p className="text-xs text-gray-400">Send SMS or email to targeted customer segments</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <i className="ri-history-line text-sm"></i>
            <span className="hidden sm:inline">History</span>
          </button>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {result ? (
            /* ── Result screen ── */
            <div className="text-center py-12 space-y-4">
              <div className={`w-20 h-20 flex items-center justify-center rounded-full mx-auto ${result.failCount === 0 ? "bg-[#f0faf7]" : "bg-amber-50"}`}>
                <i className={`text-4xl ${result.failCount === 0 ? "ri-checkbox-circle-fill text-[#1a5c4f]" : "ri-error-warning-fill text-amber-500"}`}></i>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-gray-900">
                  {result.successCount} {channel === "email" ? "emails" : "texts"} sent
                  {result.failCount > 0 ? `, ${result.failCount} failed` : ""}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {result.failCount === 0
                    ? "All messages delivered successfully!"
                    : `${result.failCount} message(s) failed — see details below`}
                </p>
                {result.errors && result.errors.length > 0 && (
                  <div className="mt-4 text-left bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={onClose}
                  className="whitespace-nowrap px-6 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl cursor-pointer hover:bg-[#17504a]">
                  Done
                </button>
                <button type="button" onClick={() => { setShowHistory(true); }}
                  className="whitespace-nowrap flex items-center gap-1.5 px-6 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl cursor-pointer hover:bg-gray-50">
                  <i className="ri-history-line"></i>View History
                </button>
                <button type="button" onClick={() => setResult(null)}
                  className="whitespace-nowrap px-6 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl cursor-pointer hover:bg-gray-50">
                  Send Another
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Channel selector ── */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Channel</p>
                <div className="flex gap-2">
                  {(["email", "sms"] as Channel[]).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={`whitespace-nowrap flex items-center gap-2 px-5 py-3 rounded-xl border-2 text-sm font-bold transition-all cursor-pointer ${
                        channel === ch
                          ? "border-[#1a5c4f] bg-[#f0faf7] text-[#1a5c4f]"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <i className={ch === "email" ? "ri-mail-send-line text-base" : "ri-chat-1-line text-base"}></i>
                      {ch === "email" ? "Email" : "SMS"}
                      {ch === "email" && (
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-extrabold rounded-full">
                          All customers
                        </span>
                      )}
                      {ch === "sms" && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-extrabold rounded-full">
                          Phone only
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {channel === "sms" && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <i className="ri-information-line"></i>
                    SMS is sent via Twilio — standard per-message rates apply. Only customers with a phone number on file will receive it.
                  </p>
                )}
              </div>

              {/* ── Audience selector ── */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Audience</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AUDIENCE_OPTIONS.map((opt) => {
                    const count = audienceCounts[opt.key];
                    const smsCount = channel === "sms"
                      ? (audience === opt.key ? withPhone.length : null)
                      : null;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setAudience(opt.key)}
                        className={`whitespace-nowrap text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                          audience === opt.key
                            ? "border-[#1a5c4f] bg-[#f0faf7]"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <i className={`${opt.icon} ${opt.color} text-sm`}></i>
                          <span className={`text-sm font-extrabold ${audience === opt.key ? "text-[#1a5c4f]" : "text-gray-700"}`}>
                            {count}
                          </span>
                        </div>
                        <p className={`text-xs font-bold leading-tight ${audience === opt.key ? "text-[#1a5c4f]" : "text-gray-700"}`}>
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 leading-tight">{opt.description}</p>
                        {channel === "sms" && audience === opt.key && smsCount !== null && (
                          <p className="text-xs text-amber-600 font-bold mt-1">{smsCount} w/ phone</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Recipients Panel (always visible, with exclusion) ── */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer"
                  onClick={() => setShowRecipients((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <i className="ri-group-line text-[#1a5c4f] text-sm"></i>
                    <span className="text-xs font-bold text-gray-700">
                      Recipients
                    </span>
                    <span className="px-2 py-0.5 bg-[#1a5c4f] text-white text-xs font-extrabold rounded-full">
                      {recipients.length} will receive
                    </span>
                    {excludedEmails.size > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-extrabold rounded-full">
                        {excludedEmails.size} excluded
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {excludedEmails.size > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); includeAll(); }}
                        className="whitespace-nowrap text-xs font-bold text-[#1a5c4f] hover:underline cursor-pointer"
                      >
                        Include all
                      </button>
                    )}
                    <i className={`text-gray-400 text-sm ${showRecipients ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
                  </div>
                </div>

                {showRecipients && (
                  <div>
                    {/* Search + bulk actions */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white">
                      <div className="relative flex-1">
                        <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                        <input
                          type="text"
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          placeholder="Search name, email, phone..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); excludeAll(); }}
                        className="whitespace-nowrap text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Exclude all
                      </button>
                    </div>

                    {/* Recipient list */}
                    <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                      {displayedRecipients.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                          <p className="text-xs text-gray-400">No contacts match your search</p>
                        </div>
                      ) : (
                        displayedRecipients.map((o) => {
                          const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
                          const isExcluded = excludedEmails.has(o.email.toLowerCase());
                          return (
                            <div
                              key={o.id}
                              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isExcluded ? "bg-red-50/60 opacity-60" : "bg-white hover:bg-gray-50"}`}
                              onClick={(e) => { e.stopPropagation(); toggleExclude(o.email); }}
                            >
                              {/* Custom checkbox */}
                              <div
                                className="w-4 h-4 flex items-center justify-center rounded border-2 flex-shrink-0 transition-colors"
                                style={{
                                  borderColor: isExcluded ? "#ef4444" : "#1a5c4f",
                                  backgroundColor: isExcluded ? "#fef2f2" : "#1a5c4f",
                                }}
                              >
                                {isExcluded
                                  ? <i className="ri-close-line text-red-500" style={{ fontSize: "9px" }}></i>
                                  : <i className="ri-check-line text-white" style={{ fontSize: "9px" }}></i>
                                }
                              </div>
                              <div className="w-6 h-6 flex items-center justify-center bg-[#f0faf7] rounded-full flex-shrink-0">
                                <i className="ri-user-3-line text-[#1a5c4f] text-xs"></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold truncate ${isExcluded ? "line-through text-gray-400" : "text-gray-900"}`}>{name}</p>
                                <p className="text-xs text-gray-400 truncate">
                                  {o.email}{channel === "sms" && o.phone ? ` · ${o.phone}` : ""}
                                </p>
                              </div>
                              <span className="text-xs text-gray-300 flex-shrink-0">{o.state ?? ""}</span>
                              {isExcluded && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-red-100 text-red-500 text-[10px] font-bold rounded-full">
                                  excluded
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {channel === "sms" && withoutPhone.length > 0 && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200">
                        <p className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                          <i className="ri-alert-line text-amber-500"></i>
                          {withoutPhone.length} customer{withoutPhone.length > 1 ? "s" : ""} skipped — no phone number on file
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Email compose ── */}
              {channel === "email" && (
                <div className="space-y-4">
                  {/* Template picker */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Template</p>
                    <div className="flex flex-wrap gap-2">
                      {EMAIL_TEMPLATES.map((t) => (
                        <button key={t.id} type="button"
                          onClick={() => handleEmailTemplateSelect(t.id)}
                          className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                            emailTemplateId === t.id
                              ? "bg-[#1a5c4f] text-white border-[#1a5c4f]"
                              : "border-gray-200 text-gray-600 hover:border-[#1a5c4f] hover:text-[#1a5c4f]"
                          }`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Subject Line</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => { setSubject(e.target.value); setEmailTemplateId("custom"); }}
                      placeholder="e.g. Time to Renew Your ESA Letter"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f]"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Message Body</label>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <i className="ri-lightbulb-line text-amber-500"></i>
                        Use <code className="bg-gray-100 px-1 rounded text-[10px]">&lbrace;name&rbrace;</code> for personalization
                      </span>
                    </div>
                    <textarea
                      value={body}
                      onChange={(e) => { setBody(e.target.value); setEmailTemplateId("custom"); }}
                      rows={7}
                      placeholder="Write your message here..."
                      className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] resize-none"
                    />
                  </div>

                  {/* CTA toggle + fields */}
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-gray-700">Include Call-to-Action Button</p>
                        <p className="text-xs text-gray-400 mt-0.5">Adds a prominent orange button at the bottom of the email</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIncludePortalCta((v) => !v)}
                        className={`whitespace-nowrap w-10 h-5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ${includePortalCta ? "bg-[#1a5c4f]" : "bg-gray-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${includePortalCta ? "translate-x-5" : "translate-x-0.5"}`}></div>
                      </button>
                    </div>
                    {includePortalCta && (
                      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Button Label</label>
                          <input
                            type="text"
                            value={ctaLabel}
                            onChange={(e) => setCtaLabel(e.target.value)}
                            placeholder="e.g. Renew My Letter"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Button URL</label>
                          <input
                            type="url"
                            value={ctaUrl}
                            onChange={(e) => setCtaUrl(e.target.value)}
                            placeholder="https://pawtenant.com/..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Preview Email panel ── */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowEmailPreview((v) => !v)}
                      className="whitespace-nowrap w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <i className="ri-eye-line text-[#1a5c4f] text-sm"></i>
                        <span className="text-xs font-bold text-gray-700">Preview Email</span>
                        <span className="px-2 py-0.5 bg-[#1a5c4f]/10 text-[#1a5c4f] text-[10px] font-extrabold rounded-full uppercase tracking-wide">Live</span>
                      </div>
                      <i className={`text-gray-400 text-sm transition-transform ${showEmailPreview ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
                    </button>
                    {showEmailPreview && (
                      <div className="border-t border-gray-200">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <p className="text-[11px] text-gray-400 font-semibold flex items-center gap-1">
                            <i className="ri-information-line text-amber-500"></i>
                            This preview uses <strong>&quot;Jane&quot;</strong> as a sample name — live emails will personalize per recipient
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowEmailPreview(false)}
                            className="whitespace-nowrap text-[10px] font-bold text-gray-400 hover:text-gray-600 cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                        <div className="bg-[#f3f4f6] p-1" style={{ height: "480px" }}>
                          <iframe
                            srcDoc={buildPreviewHtml()}
                            title="Email Preview"
                            className="w-full h-full rounded border-0"
                            sandbox="allow-same-origin"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Test Send section ── */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                        <i className="ri-test-tube-line text-amber-600 text-base"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-amber-800">Test Send — Preview Before Going Live</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Send to just one email address to verify how it looks before broadcasting to all recipients.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-amber-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleTestSend}
                        disabled={testSending || !subject.trim() || !body.trim() || !testEmail.trim()}
                        className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {testSending
                          ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                          : <><i className="ri-send-plane-line"></i>Test Send</>
                        }
                      </button>
                    </div>
                    {testSendResult && (
                      <p className={`text-xs flex items-center gap-1 font-semibold ${testSendResult.ok ? "text-emerald-700" : "text-red-600"}`}>
                        <i className={testSendResult.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                        {testSendResult.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── SMS compose ── */}
              {channel === "sms" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Template</p>
                    <div className="flex flex-wrap gap-2">
                      {SMS_TEMPLATES.map((t) => (
                        <button key={t.id} type="button"
                          onClick={() => handleSmsTemplateSelect(t.id)}
                          className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                            smsTemplateId === t.id
                              ? "bg-[#1a5c4f] text-white border-[#1a5c4f]"
                              : "border-gray-200 text-gray-600 hover:border-[#1a5c4f] hover:text-[#1a5c4f]"
                          }`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Message</p>
                      <span className="text-xs text-gray-400">{charCount} chars · {smsCredits} credit{smsCredits > 1 ? "s" : ""} each</span>
                    </div>
                    <textarea
                      value={smsText}
                      onChange={(e) => { setSmsText(e.target.value.slice(0, 640)); setSmsTemplateId("custom"); }}
                      rows={5}
                      placeholder="Type your SMS message... Use {name} to personalise"
                      className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <i className="ri-lightbulb-line text-amber-500"></i>
                      Use <code className="bg-gray-100 px-1 rounded text-[10px]">&lbrace;name&rbrace;</code> to auto-insert each customer&apos;s first name
                    </p>
                  </div>
                </div>
              )}

              {/* ── Stats bar ── */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-[#1a5c4f]">{recipients.length}</p>
                  <p className="text-xs text-gray-500">Will receive</p>
                </div>
                <div className="text-center border-x border-gray-200">
                  <p className="text-2xl font-extrabold text-red-500">{excludedEmails.size}</p>
                  <p className="text-xs text-gray-500">Manually excluded</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-extrabold text-gray-500 capitalize">{channel}</p>
                  <p className="text-xs text-gray-500">
                    {channel === "sms" ? `${smsCredits} credit${smsCredits > 1 ? "s" : ""} each` : "via Resend"}
                  </p>
                </div>
              </div>

              {/* Audience summary */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${audience === "all_everyone" ? "bg-violet-50 border-violet-200" : "bg-[#f0faf7] border-[#b8ddd5]"}`}>
                <i className={`${selectedAudienceOption.icon} ${selectedAudienceOption.color} text-base flex-shrink-0`}></i>
                <div>
                  <p className="text-xs font-bold text-gray-700">{selectedAudienceOption.label}</p>
                  <p className="text-xs text-gray-500">{selectedAudienceOption.description}</p>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                  {excludedEmails.size > 0 && (
                    <span className="text-xs font-bold text-red-500 line-through">{(channel === "sms" ? withPhone : audienceOrders).length}</span>
                  )}
                  <span className={`text-lg font-extrabold ${selectedAudienceOption.color}`}>
                    {recipients.length}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!result && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="whitespace-nowrap px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl cursor-pointer hover:bg-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !isReadyToSend}
              className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {sending ? (
                <><i className="ri-loader-4-line animate-spin"></i>Sending to {recipients.length} customers...</>
              ) : (
                <>
                  <i className={channel === "email" ? "ri-mail-send-line" : "ri-chat-1-line"}></i>
                  Send {channel === "email" ? "Email" : "SMS"} to {recipients.length} customer{recipients.length !== 1 ? "s" : ""}
                  {excludedEmails.size > 0 && <span className="text-white/60 text-xs font-normal">({excludedEmails.size} excluded)</span>}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Broadcast History Modal */}
      {showHistory && <BroadcastHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}
