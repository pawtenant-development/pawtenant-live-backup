// BroadcastModal — Send bulk SMS or Email to targeted customer segments
import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getAdminToken } from "../../../lib/supabaseClient";
import BroadcastHistoryModal from "./BroadcastHistoryModal";
import { logAudit } from "../../../lib/auditLogger";
import ApprovalRequestModal from "./ApprovalRequestModal";

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
  letter_type?: string | null;
  broadcast_opt_out?: boolean | null;
  last_broadcast_sent_at?: string | null;
  source_system?: string | null;
  historical_import?: boolean | null;
}

interface BroadcastModalProps {
  orders: Order[];
  adminName: string;
  adminEmail?: string;
  adminRole?: string | null;
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

type TimeRange = "all" | "24h" | "3d" | "7d";

const RECIPIENT_LIMIT = 30;

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
    color: "text-[#3b6ea5]",
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
  // ── Review Requests ────────────────────────────────────────────────────────
  {
    id: "trustpilot_review",
    label: "Trustpilot Review Request",
    group: "Review Requests",
    subject: "{name}, share your PawTenant experience ⭐",
    body: `Hi {name},

We hope your ESA letter is everything you needed. It was a pleasure supporting you and your pet through this process.

If you had a positive experience, we'd love to hear about it! Your review helps other pet owners find the support they need — and it means the world to our small team.

Leaving a review takes less than 60 seconds and makes a huge difference for us.`,
    ctaLabel: "⭐ Write My Review on Trustpilot",
    ctaUrl: "https://www.trustpilot.com/review/pawtenant.com",
  },
  // ── Lead Recovery ──────────────────────────────────────────────────────────
  {
    id: "finish_esa",
    label: "Finish Your ESA Letter",
    group: "Lead Recovery",
    subject: "You're One Step Away — Complete Your ESA Letter",
    body: `Hi {name},

You're one step away from getting your ESA letter. Complete your order here and get protected today.

Your assessment answers are already saved — just finish the payment and our licensed providers will review your case within 24 hours.`,
    ctaLabel: "Complete My ESA Letter",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "still_thinking",
    label: "Still Thinking?",
    group: "Lead Recovery",
    subject: "Still Thinking? Get Your ESA Letter Today — Avoid Housing Issues",
    body: `Hi {name},

Still thinking about your ESA letter? Don't wait until your landlord asks — get protected today.

Our licensed mental health professionals are standing by to complete your evaluation. Most letters are delivered within 24 hours.

Avoid housing issues before they start. Complete your application now.`,
    ctaLabel: "Get My ESA Letter Now",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "abandoned_checkout",
    label: "Abandoned Checkout Recovery",
    group: "Lead Recovery",
    subject: "Complete Your ESA Letter — Your Assessment is Saved",
    body: `Hi {name},

We noticed you started your ESA letter application but didn't complete checkout. Your assessment answers are saved — you can pick up right where you left off.

Our licensed providers are ready to review your case. Most letters are delivered within 24 hours of payment.

Don't let your housing protections lapse — complete your order today.`,
    ctaLabel: "Complete My Payment",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "consultation_booking",
    label: "Confirm Provider Consultation",
    group: "Lead Recovery",
    subject: "Your Provider Consultation is Confirmed — Complete Your Payment",
    body: `Hi {name},

Your consultation with a licensed PawTenant provider has been confirmed!

To lock in your appointment and get your ESA letter, please complete your payment. Our providers are ready to review your case and deliver your letter within 24 hours.

Don't miss your spot — complete your payment now.`,
    ctaLabel: "Complete My Booking",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  // ── Existing Customers ─────────────────────────────────────────────────────
  {
    id: "renewal",
    label: "ESA Renewal",
    group: "Existing Customers",
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
    group: "Existing Customers",
    subject: "Upgrade to a Psychiatric Service Dog Letter — Full Public Access",
    body: `Hi {name},

Did you know you can upgrade your ESA letter to a full Psychiatric Service Dog (PSD) letter?

A PSD letter grants your dog access to public spaces, transportation, and more. Unlike ESA letters, PSD protections extend beyond housing under the Americans with Disabilities Act.

Our licensed providers can evaluate your eligibility and issue a PSD letter — usually within 24 hours.`,
    ctaLabel: "Get My PSD Letter",
    ctaUrl: "https://pawtenant.com/how-to-get-psd-letter",
  },
  {
    id: "order_confirmed",
    label: "Order Confirmed",
    group: "Existing Customers",
    subject: "Your ESA Letter Order is Confirmed — PawTenant",
    body: `Hi {name},

Thank you for your order! Your ESA letter application has been received and is now being reviewed by one of our licensed mental health professionals.

You can track your order status at any time by logging into your customer portal. We'll notify you as soon as your letter is ready — usually within 24 hours.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "Track My Order",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
  {
    id: "landlord_verification",
    label: "Landlord Verification Feature",
    group: "Existing Customers",
    subject: "Your PawTenant ESA Letter Is Landlord-Verifiable — Here's What That Means for You",
    body: `Hi {name},

At PawTenant, we do something no other ESA provider does: every letter we issue includes a unique Verification ID and QR code that allows your landlord to instantly confirm your letter's authenticity — without ever seeing your personal health information.

This is our unique feature, built specifically to protect you.

Here's how it works:
• Your letter includes a unique Verification ID and QR code
• Your landlord visits pawtenant.com/esa-letter-verification
• They enter the ID or scan the QR code to confirm your letter is valid
• Zero health information is disclosed — only letter validity is confirmed

Why does this matter? Landlords who question the legitimacy of ESA letters are common. With PawTenant's verification system, you can hand your landlord a QR code and let them confirm it themselves — instantly, privately, and without any back-and-forth.

Your privacy is fully protected under HIPAA. Landlords only see that your letter is valid — nothing else.

This is what makes PawTenant the most credible ESA letter service available. No other provider offers this level of verification.

If you have any questions about how verification works, visit the link below.`,
    ctaLabel: "How ESA Letter Verification Works",
    ctaUrl: "https://pawtenant.com/esa-letter-verification",
  },
  {
    id: "discount",
    label: "Discount / Promo",
    group: "Existing Customers",
    subject: "Exclusive Offer from PawTenant — Just for You",
    body: `Hi {name},

As one of our valued customers, we wanted to share an exclusive offer just for you.

Whether you need a renewal, an upgrade, or a letter for a new pet — our licensed mental health professionals are here to help.

Use the button below to claim your offer. This is a limited-time deal available only to our existing customers.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "Claim My Offer",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "promo",
    label: "Promotion / Offer",
    group: "Existing Customers",
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
    group: "General",
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
    group: "General",
    subject: "",
    body: "",
    ctaLabel: "Visit My Portal",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
];

const SMS_TEMPLATES = [
  {
    id: "trustpilot_review",
    label: "Trustpilot Review Request",
    group: "Review Requests",
    text: "Hi {name}! Your ESA letter from PawTenant is complete. If you had a great experience, we'd love a quick Trustpilot review! ⭐ https://www.trustpilot.com/review/pawtenant.com",
  },
  {
    id: "finish_esa",
    label: "Finish Your ESA Letter",
    group: "Lead Recovery",
    text: "Hi {name}, you're one step away from your ESA letter! Complete your order here: pawtenant.com/assessment",
  },
  {
    id: "still_thinking",
    label: "Still Thinking?",
    group: "Lead Recovery",
    text: "Hi {name}, still thinking about your ESA letter? Get it today and avoid housing issues. Complete here: pawtenant.com/assessment",
  },
  {
    id: "consultation_booking",
    label: "Consultation Confirmed",
    group: "Lead Recovery",
    text: "Hi {name}, your provider consultation with PawTenant is confirmed! Complete your payment to lock in your spot: pawtenant.com/assessment",
  },
  {
    id: "renewal",
    label: "ESA Renewal",
    group: "Existing Customers",
    text: "Hi {name}! Your ESA letter may need renewal soon. Renew today at pawtenant.com/renew-esa-letter — our licensed providers complete it within 24-48hrs.",
  },
  {
    id: "order_confirmed",
    label: "Order Confirmed",
    group: "Existing Customers",
    text: "Hi {name}, your ESA letter order with PawTenant is confirmed! Track your order at pawtenant.com/my-orders. We'll notify you when your letter is ready.",
  },
  {
    id: "promo",
    label: "Promotion",
    group: "Existing Customers",
    text: "Hi {name}! PawTenant here with an exclusive offer for our valued customers. Visit pawtenant.com to see your options. Questions? Reply to this message.",
  },
  {
    id: "update",
    label: "Status Update",
    group: "General",
    text: "Hi {name}, this is PawTenant. We have an important update regarding your account. Log into pawtenant.com/my-orders to view details.",
  },
  {
    id: "custom",
    label: "Custom",
    group: "General",
    text: "",
  },
];

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

function isLegacyOrder(o: Order): boolean {
  return o.source_system === "wordpress_legacy" || !!o.historical_import;
}

function dedupeByEmail(orders: Order[]): Order[] {
  const seen = new Set<string>();
  return orders.filter((o) => {
    const key = o.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyTimeRange(orders: Order[], range: TimeRange): Order[] {
  if (range === "all") return orders;
  const msMap: Record<TimeRange, number> = { all: 0, "24h": 24 * 60 * 60 * 1000, "3d": 3 * 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 };
  const cutoff = Date.now() - msMap[range];
  return orders.filter((o) => new Date(o.created_at).getTime() >= cutoff);
}



export default function BroadcastModal({ orders: rawOrders, adminName, adminEmail, adminRole, onClose }: BroadcastModalProps) {
  // ── Fresh broadcast timestamps ──────────────────────────────────────────
  // The parent `orders` prop may be stale (loaded before the last broadcast).
  // On mount we re-fetch last_broadcast_sent_at for all orders so the 24h
  // cooldown filter works correctly even right after a previous send.
  const [freshTimestamps, setFreshTimestamps] = useState<Record<string, string | null>>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const ids = rawOrders.map((o) => o.confirmation_id).filter(Boolean);
    if (ids.length === 0) return;

    // Fetch in chunks of 500 to stay within URL limits
    const CHUNK = 500;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

    Promise.all(
      chunks.map((chunk) =>
        supabase
          .from("orders")
          .select("confirmation_id,last_broadcast_sent_at")
          .in("confirmation_id", chunk)
      )
    ).then((results) => {
      const map: Record<string, string | null> = {};
      for (const { data } of results) {
        if (!data) continue;
        for (const row of data) {
          map[row.confirmation_id] = row.last_broadcast_sent_at ?? null;
        }
      }
      setFreshTimestamps(map);
    }).catch((err) => {
      console.warn("[BroadcastModal] Failed to refresh broadcast timestamps:", err);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge fresh timestamps into orders so all downstream logic uses up-to-date data
  const orders = useMemo<Order[]>(() => {
    if (Object.keys(freshTimestamps).length === 0) return rawOrders;
    return rawOrders.map((o) =>
      o.confirmation_id in freshTimestamps
        ? { ...o, last_broadcast_sent_at: freshTimestamps[o.confirmation_id] }
        : o
    );
  }, [rawOrders, freshTimestamps]);

  // Track how many batches have been sent so "Send Next 30" can skip already-sent recipients
  const [batchOffset, setBatchOffset] = useState(0);

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
  const [exclude24hRecent, setExclude24hRecent] = useState(false);
  const [neverContacted, setNeverContacted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  // Load templates from DB (fallback to hardcoded constants)
  const [dbEmailTemplates, setDbEmailTemplates] = useState<typeof EMAIL_TEMPLATES | null>(null);
  const [dbSmsTemplates, setDbSmsTemplates] = useState<typeof SMS_TEMPLATES | null>(null);
  useEffect(() => {
    supabase
      .from("email_templates")
      .select("id, label, \"group\", subject, body, cta_label, cta_url, channel")
      .order("created_at")
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        const emailRows = data.filter((r) => !r.channel || r.channel === "email");
        const smsRows   = data.filter((r) => r.channel === "sms");
        if (emailRows.length > 0) {
          setDbEmailTemplates(emailRows.map((r) => ({
            id: r.id as string, label: r.label as string, group: r.group as string,
            subject: r.subject as string, body: r.body as string,
            ctaLabel: r.cta_label as string, ctaUrl: r.cta_url as string,
          })));
        }
        if (smsRows.length > 0) {
          setDbSmsTemplates(smsRows.map((r) => ({
            id: r.id as string, label: r.label as string, group: r.group as string,
            text: r.body as string,
          })));
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeEmailTemplates = dbEmailTemplates ?? EMAIL_TEMPLATES;
  const activeSmsTemplates   = dbSmsTemplates   ?? SMS_TEMPLATES;

  // Reset exclusions + filters + batch offset whenever the audience changes
  useEffect(() => {
    setExcludedEmails(new Set());
    setRecipientSearch("");
    setTimeRange("all");
    setBatchOffset(0);
  }, [audience]);

  // Reset batch offset when filters change
  useEffect(() => {
    setBatchOffset(0);
  }, [timeRange, exclude24hRecent, neverContacted, channel]);

  // Filter orders by audience — also exclude opted-out and legacy customers
  const audienceOrders = useMemo(() => {
    // Always exclude legacy/imported orders first
    const nonLegacy = orders.filter((o) => !isLegacyOrder(o));

    let filtered: Order[] = [];
    switch (audience) {
      case "all_paid":
        filtered = nonLegacy.filter((o) => !!o.payment_intent_id && o.status !== "cancelled");
        break;
      case "completed":
        filtered = nonLegacy.filter((o) => o.doctor_status === "patient_notified");
        break;
      case "unassigned":
        filtered = nonLegacy.filter(
          (o) => !!o.payment_intent_id && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified"
        );
        break;
      case "under_review":
        filtered = nonLegacy.filter(
          (o) =>
            !!o.payment_intent_id &&
            !!(o.doctor_email || o.doctor_user_id) &&
            o.doctor_status !== "patient_notified"
        );
        break;
      case "all_leads":
        filtered = nonLegacy.filter((o) => !o.payment_intent_id);
        break;
      case "all_everyone":
        filtered = [...nonLegacy];
        break;
    }

    // Apply time range filter
    filtered = applyTimeRange(filtered, timeRange);

    // Always exclude opted-out customers from broadcast sends
    filtered = filtered.filter((o) => !o.broadcast_opt_out);
    return dedupeByEmail(filtered);
  }, [orders, audience, timeRange]);

  // Count legacy orders excluded from broadcast
  const legacyExcludedCount = useMemo(() => orders.filter(isLegacyOrder).length, [orders]);

  // Count opted-out customers in the current audience (before filtering)
  const optOutCount = useMemo(() => {
    const nonLegacy = orders.filter((o) => !isLegacyOrder(o));
    let base: Order[] = [];
    switch (audience) {
      case "all_paid": base = nonLegacy.filter((o) => !!o.payment_intent_id && o.status !== "cancelled"); break;
      case "completed": base = nonLegacy.filter((o) => o.doctor_status === "patient_notified"); break;
      case "unassigned": base = nonLegacy.filter((o) => !!o.payment_intent_id && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified"); break;
      case "under_review": base = nonLegacy.filter((o) => !!o.payment_intent_id && !!(o.doctor_email || o.doctor_user_id) && o.doctor_status !== "patient_notified"); break;
      case "all_leads": base = nonLegacy.filter((o) => !o.payment_intent_id); break;
      case "all_everyone": base = [...nonLegacy]; break;
    }
    return dedupeByEmail(base).filter((o) => !!o.broadcast_opt_out).length;
  }, [orders, audience]);

  const withPhone = useMemo(() => audienceOrders.filter((o) => !!o.phone), [audienceOrders]);
  const withoutPhone = useMemo(() => audienceOrders.filter((o) => !o.phone), [audienceOrders]);

  // Count how many in the current audience received a broadcast in the past 24h
  const recent24hCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const base = channel === "sms" ? withPhone : audienceOrders;
    return base.filter((o) => {
      if (!o.last_broadcast_sent_at) return false;
      return new Date(o.last_broadcast_sent_at).getTime() > cutoff;
    }).length;
  }, [audienceOrders, withPhone, channel]);

  // Count how many in the current audience have NEVER received a broadcast
  const neverContactedCount = useMemo(() => {
    const base = channel === "sms" ? withPhone : audienceOrders;
    return base.filter((o) => !o.last_broadcast_sent_at).length;
  }, [audienceOrders, withPhone, channel]);

  // Apply exclusions + optional 24h cooldown filter + never contacted filter
  // batchOffset skips already-sent batches when using "Send Next 30"
  const allEligibleRecipients = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const base = channel === "sms" ? withPhone : audienceOrders;
    return base.filter((o) => {
      if (excludedEmails.has(o.email.toLowerCase())) return false;
      if (exclude24hRecent && o.last_broadcast_sent_at) {
        if (new Date(o.last_broadcast_sent_at).getTime() > cutoff) return false;
      }
      if (neverContacted && o.last_broadcast_sent_at) return false;
      return true;
    });
  }, [channel, withPhone, audienceOrders, excludedEmails, exclude24hRecent, neverContacted]);

  // Current batch window (offset → offset + RECIPIENT_LIMIT)
  const recipients = useMemo(() => {
    return allEligibleRecipients.slice(batchOffset, batchOffset + RECIPIENT_LIMIT);
  }, [allEligibleRecipients, batchOffset]);

  const hasNextBatch = batchOffset + RECIPIENT_LIMIT < allEligibleRecipients.length;

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
          <a href="${ctaUrl}" style="display:inline-block;background:#3b6ea5;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
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
          <div style="background:#3b6ea5;padding:28px 32px;text-align:center;">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;" />
            <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.05em;">ESA &amp; PSD Letter Consultations</span>
          </div>

          <!-- Body -->
          <div style="padding:32px 36px;">
            ${subject ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${subject}</h1>` : ""}
            ${paragraphs}
            ${ctaHtml}
          </div>

          <!-- Footer -->
          <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:hello@pawtenant.com" style="color:#3b6ea5;text-decoration:none;">hello@pawtenant.com</a></p>
            <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Sent by ${adminName || "PawTenant Admin"} via PawTenant</p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Letter Consultations &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  };

  // Filtered list for the recipient panel (shows ALL audience members including auto-excluded)
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

  // Returns the reason a recipient is auto-excluded (24h cooldown or never-contacted filter)
  const getAutoExcludeReason = (o: Order): string | null => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (exclude24hRecent && o.last_broadcast_sent_at && new Date(o.last_broadcast_sent_at).getTime() > cutoff) {
      return "24h cooldown";
    }
    if (neverContacted && o.last_broadcast_sent_at) {
      return "has prior contact";
    }
    return null;
  };

  // Audience counts for all options (legacy excluded)
  const audienceCounts = useMemo(() => {
    const nonLegacy = orders.filter((o) => !isLegacyOrder(o));
    const counts: Record<AudienceKey, number> = {
      all_paid: 0, completed: 0, unassigned: 0, under_review: 0, all_leads: 0, all_everyone: 0,
    };
    counts.all_paid = dedupeByEmail(nonLegacy.filter((o) => !!o.payment_intent_id && o.status !== "cancelled")).length;
    counts.completed = dedupeByEmail(nonLegacy.filter((o) => o.doctor_status === "patient_notified")).length;
    counts.unassigned = dedupeByEmail(nonLegacy.filter((o) => !!o.payment_intent_id && !o.doctor_email && !o.doctor_user_id && o.doctor_status !== "patient_notified")).length;
    counts.under_review = dedupeByEmail(nonLegacy.filter((o) => !!o.payment_intent_id && !!(o.doctor_email || o.doctor_user_id) && o.doctor_status !== "patient_notified")).length;
    counts.all_leads = dedupeByEmail(nonLegacy.filter((o) => !o.payment_intent_id)).length;
    counts.all_everyone = dedupeByEmail(nonLegacy).length;
    return counts;
  }, [orders]);

  const handleEmailTemplateSelect = (id: string) => {
    setEmailTemplateId(id);
    const tmpl = activeEmailTemplates.find((t) => t.id === id);
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
    const tmpl = activeSmsTemplates.find((t) => t.id === id);
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
      const token = await getAdminToken();

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
      const token = await getAdminToken();

      if (channel === "email") {
        const emailRecipients = recipients.slice(0, RECIPIENT_LIMIT).map((o) => ({
          email: o.email,
          name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
          confirmation_id: o.confirmation_id,
          letter_type: o.letter_type ?? "esa",
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
          // Advance batch offset so "Send Next 30" skips already-sent recipients
          setBatchOffset((prev) => prev + RECIPIENT_LIMIT);

          // ── Audit log: broadcast email sent ──
          const { data: { session } } = await supabase.auth.getSession();
          await logAudit({
            actor_name: adminName,
            actor_role: adminRole ?? "admin",
            object_type: "system",
            object_id: null,
            action: "broadcast_email_sent",
            description: `Broadcast email sent to ${data.successCount ?? 0} recipients (${data.failCount ?? 0} failed) by ${adminName} — Subject: "${subject.trim().slice(0, 80)}"`,
            new_values: {
              sent_by: adminName,
              sent_by_user_id: session?.user?.id ?? null,
              channel: "email",
              audience_key: audience,
              audience_label: selectedAudienceOption.label,
              subject: subject.trim(),
              recipient_count: data.successCount ?? 0,
              failed_count: data.failCount ?? 0,
              excluded_count: excludedEmails.size,
              recipients: recipients.slice(0, 50).map((o) => ({
                confirmation_id: o.confirmation_id,
                email: o.email,
                name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
              })),
              total_targeted: recipients.length,
              sent_at: new Date().toISOString(),
            },
          });
        } else {
          const errMsg = data.error ?? data.message ?? `HTTP ${res.status}: Unknown error — check Supabase edge function logs`;
          setResult({ successCount: 0, failCount: recipients.length, errors: [errMsg] });
        }
      } else {
        // SMS
        const targets = recipients.slice(0, RECIPIENT_LIMIT).map((o) => ({
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
          // Advance batch offset so "Send Next 30" skips already-sent recipients
          setBatchOffset((prev) => prev + RECIPIENT_LIMIT);

          // ── Audit log: broadcast SMS sent ──
          const { data: { session } } = await supabase.auth.getSession();
          await logAudit({
            actor_name: adminName,
            actor_role: adminRole ?? "admin",
            object_type: "system",
            object_id: null,
            action: "broadcast_sms_sent",
            description: `Broadcast SMS sent to ${data.successCount ?? 0} recipients (${data.failCount ?? 0} failed) by ${adminName} — Audience: ${selectedAudienceOption.label}`,
            new_values: {
              sent_by: adminName,
              sent_by_user_id: session?.user?.id ?? null,
              channel: "sms",
              audience_key: audience,
              audience_label: selectedAudienceOption.label,
              message_preview: smsText.trim().slice(0, 100),
              recipient_count: data.successCount ?? 0,
              failed_count: data.failCount ?? 0,
              excluded_count: excludedEmails.size,
              recipients: recipients.slice(0, 50).map((o) => ({
                confirmation_id: o.confirmation_id,
                email: o.email,
                phone: o.phone,
                name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
              })),
              total_targeted: recipients.length,
              sent_at: new Date().toISOString(),
            },
          });
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

  // ── Role checks ──
  // Finance: not shown at all (handled in page.tsx — modal won't open for finance)
  // Read Only: read-only info screen, no send capability
  // Support: can request approval (shows approval request flow)
  // Owner/Admin: full access
  const canBroadcast = adminRole === "owner" || adminRole === "admin_manager" || adminRole == null;
  const isSupportRole = adminRole === "support";
  const isReadOnlyRole = adminRole === "read_only";

  // Approval request state for support role
  const [showSupportApproval, setShowSupportApproval] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 flex items-center justify-center bg-[#3b6ea5] rounded-xl flex-shrink-0">
            <i className="ri-broadcast-line text-white text-lg"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-gray-900">Customer Broadcast</h2>
            <p className="text-xs text-gray-400">Send SMS or email to targeted customer segments</p>
          </div>
          {canBroadcast && (
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <i className="ri-history-line text-sm"></i>
              <span className="hidden sm:inline">History</span>
            </button>
          )}
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* ── Read Only role: view-only info screen ── */}
        {isReadOnlyRole ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
            <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-full mb-5">
              <i className="ri-eye-line text-gray-400 text-4xl"></i>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 text-xs font-extrabold rounded-full">
                <i className="ri-eye-line text-sm"></i>
                Read Only View
              </span>
            </div>

            <h3 className="text-lg font-extrabold text-gray-900 mb-2">Broadcast — View Only</h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-6">
              Your <strong>Read Only</strong> role lets you view broadcast statistics and history, but sending broadcasts requires Owner or Admin Manager access.
            </p>

            {/* Stats panel — view only */}
            <div className="w-full max-w-sm bg-gray-50 border border-gray-200 rounded-2xl p-5 text-left mb-4">
              <p className="text-xs font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="ri-bar-chart-2-line text-base"></i>
                Audience Overview (Read Only)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "All Paid", value: orders.filter((o) => !!o.payment_intent_id && o.status !== "cancelled").length, icon: "ri-money-dollar-circle-line", color: "text-emerald-600" },
                  { label: "Completed", value: orders.filter((o) => o.doctor_status === "patient_notified").length, icon: "ri-checkbox-circle-line", color: "text-[#3b6ea5]" },
                  { label: "Under Review", value: orders.filter((o) => !!o.payment_intent_id && !!(o.doctor_email || o.doctor_user_id) && o.doctor_status !== "patient_notified").length, icon: "ri-time-line", color: "text-sky-600" },
                  { label: "Leads", value: orders.filter((o) => !o.payment_intent_id).length, icon: "ri-user-follow-line", color: "text-amber-600" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                    <i className={`${stat.icon} ${stat.color} text-sm flex-shrink-0`}></i>
                    <div>
                      <p className="text-sm font-extrabold text-gray-800">{stat.value}</p>
                      <p className="text-xs text-gray-400">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What you CAN do */}
            <div className="w-full max-w-sm bg-[#e8f0f9] border border-[#b8cce4] rounded-2xl p-5 text-left mb-4">
              <p className="text-xs font-extrabold text-[#3b6ea5] uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-base"></i>
                What you can view
              </p>
              <div className="space-y-2">
                {[
                  "Audience segment sizes and counts",
                  "Broadcast history and past sends",
                  "Opt-out statistics",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <i className="ri-check-line text-[#3b6ea5] text-sm flex-shrink-0"></i>
                    <p className="text-xs text-[#3b6ea5]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* What requires Owner/Admin */}
            <div className="w-full max-w-sm bg-gray-50 border border-gray-200 rounded-2xl p-5 text-left mb-6">
              <p className="text-xs font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="ri-lock-2-line text-base"></i>
                Requires Owner or Admin Manager
              </p>
              <div className="space-y-2">
                {[
                  "Send bulk email broadcasts",
                  "Send bulk SMS campaigns",
                  "Exclude or filter recipients",
                  "Use or create message templates",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <i className="ri-lock-2-line text-gray-400 text-sm flex-shrink-0"></i>
                    <p className="text-xs text-gray-500">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap px-6 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        ) : null}

        {/* ── Role-restricted screen for support: Request Approval flow ── */}
        {isSupportRole ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
            <div className="w-20 h-20 flex items-center justify-center bg-amber-100 rounded-full mb-5">
              <i className="ri-lock-2-line text-amber-600 text-4xl"></i>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-100 text-cyan-700 text-xs font-extrabold rounded-full">
                <i className="ri-customer-service-2-line text-sm"></i>
                Support Role
              </span>
            </div>

            <h3 className="text-lg font-extrabold text-gray-900 mb-2">Approval Required</h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-6">
              Bulk broadcasts require <strong>Owner</strong> or <strong>Admin Manager</strong> approval. You can submit a request and they&apos;ll be notified immediately.
            </p>

            {/* What happens when approved */}
            <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left mb-4">
              <p className="text-xs font-extrabold text-amber-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="ri-information-line text-base"></i>
                What happens when approved
              </p>
              <div className="space-y-2">
                {[
                  "Your request is sent to all Owners and Admin Managers",
                  "They receive an email + in-app notification",
                  "If approved, the broadcast will be sent on your behalf",
                  "You'll be notified of the decision via the bell icon",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <i className="ri-arrow-right-s-line text-amber-600 text-sm flex-shrink-0"></i>
                    <p className="text-xs text-amber-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* What you CAN do */}
            <div className="w-full max-w-sm bg-[#e8f0f9] border border-[#b8cce4] rounded-2xl p-5 text-left mb-6">
              <p className="text-xs font-extrabold text-[#3b6ea5] uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-base"></i>
                What you can do without approval
              </p>
              <div className="space-y-2">
                {[
                  "Send individual order emails (Communications tab)",
                  "Send individual SMS messages (Communications tab)",
                  "Make outbound calls from individual orders",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <i className="ri-check-line text-[#3b6ea5] text-sm flex-shrink-0"></i>
                    <p className="text-xs text-[#3b6ea5]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full max-w-sm">
              <button
                type="button"
                onClick={() => setShowSupportApproval(true)}
                className="whitespace-nowrap flex items-center justify-center gap-2 px-6 py-3 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors"
              >
                <i className="ri-send-plane-line"></i>
                Request Approval for Broadcast
              </button>
              <button
                type="button"
                onClick={onClose}
                className="whitespace-nowrap px-6 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : !canBroadcast ? (
          /* Finance or other restricted roles — should not reach here (button hidden in page.tsx) */
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-gray-400">Access restricted for your role.</p>
          </div>
        ) : (
          <>
            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {result ? (
                /* ── Result screen ── */
                <div className="text-center py-10 space-y-4">
                  <div className={`w-20 h-20 flex items-center justify-center rounded-full mx-auto ${result.failCount === 0 ? "bg-[#e8f0f9]" : "bg-amber-50"}`}>
                    <i className={`text-4xl ${result.failCount === 0 ? "ri-checkbox-circle-fill text-[#3b6ea5]" : "ri-error-warning-fill text-amber-500"}`}></i>
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

                  {/* ── Send Next 30 CTA ── */}
                  {hasNextBatch && (
                    <div className="mx-auto max-w-sm bg-[#e8f0f9] border border-[#b8cce4] rounded-2xl px-5 py-4 text-left space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 flex items-center justify-center bg-[#3b6ea5] rounded-lg flex-shrink-0">
                          <i className="ri-skip-forward-line text-white text-sm"></i>
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-[#3b6ea5]">More recipients waiting</p>
                          <p className="text-xs text-[#2d5a8e]">
                            {allEligibleRecipients.length - batchOffset} remaining · {allEligibleRecipients.length} total eligible
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResult(null)}
                        className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-2.5 bg-[#3b6ea5] text-white text-sm font-extrabold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors"
                      >
                        <i className={channel === "email" ? "ri-mail-send-line" : "ri-chat-1-line"}></i>
                        Send Next {Math.min(RECIPIENT_LIMIT, allEligibleRecipients.length - batchOffset)} Recipients
                      </button>
                      <p className="text-[10px] text-[#2d5a8e] text-center">
                        Batch {Math.ceil(batchOffset / RECIPIENT_LIMIT)} of {Math.ceil(allEligibleRecipients.length / RECIPIENT_LIMIT)} complete — same message &amp; filters apply
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <button type="button" onClick={onClose}
                      className="whitespace-nowrap px-6 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl cursor-pointer hover:bg-[#2d5a8e]">
                      Done
                    </button>
                    <button type="button" onClick={() => setShowHistory(true)}
                      className="whitespace-nowrap flex items-center gap-1.5 px-6 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl cursor-pointer hover:bg-gray-50">
                      <i className="ri-history-line"></i>View History
                    </button>
                    <button type="button" onClick={() => { setResult(null); setBatchOffset(0); }}
                      className="whitespace-nowrap px-6 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl cursor-pointer hover:bg-gray-50">
                      Start Over
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
                              ? "border-[#3b6ea5] bg-[#e8f0f9] text-[#3b6ea5]"
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
                                ? "border-[#3b6ea5] bg-[#e8f0f9]"
                                : "border-gray-200 hover:border-gray-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <i className={`${opt.icon} ${opt.color} text-sm`}></i>
                              <span className={`text-sm font-extrabold ${audience === opt.key ? "text-[#3b6ea5]" : "text-gray-700"}`}>
                                {count}
                              </span>
                            </div>
                            <p className={`text-xs font-bold leading-tight ${audience === opt.key ? "text-[#3b6ea5]" : "text-gray-700"}`}>
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

                  {/* ── Time Range + Payment Filter row ── */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Audience Filters</p>

                    {/* Legacy exclusion notice */}
                    {legacyExcludedCount > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                        <i className="ri-archive-line text-amber-500 text-sm flex-shrink-0"></i>
                        <p className="text-xs text-amber-800">
                          <strong>{legacyExcludedCount} legacy/imported orders</strong> are automatically excluded from all broadcasts.
                        </p>
                      </div>
                    )}

                    {/* Time Range */}
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Order Date Range</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {([
                          { key: "all", label: "All Time" },
                          { key: "24h", label: "Last 24h" },
                          { key: "3d", label: "Last 3 Days" },
                          { key: "7d", label: "Last 7 Days" },
                        ] as { key: TimeRange; label: string }[]).map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setTimeRange(opt.key)}
                            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                              timeRange === opt.key
                                ? "bg-[#3b6ea5] text-white border-[#3b6ea5]"
                                : "border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>


                  </div>

                  {/* ── Smart Filters row ── */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Smart Filters</p>

                    {/* 24h Cooldown */}
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors cursor-pointer ${exclude24hRecent ? "bg-sky-50 border-sky-300" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}
                      onClick={() => { setExclude24hRecent((v) => !v); if (neverContacted) setNeverContacted(false); }}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${exclude24hRecent ? "bg-sky-100" : "bg-gray-100"}`}>
                          <i className={`ri-time-line text-sm ${exclude24hRecent ? "text-sky-600" : "text-gray-400"}`}></i>
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${exclude24hRecent ? "text-sky-800" : "text-gray-700"}`}>
                            Skip recently contacted (24h cooldown)
                          </p>
                          <p className={`text-xs mt-0.5 ${exclude24hRecent ? "text-sky-600" : "text-gray-400"}`}>
                            {exclude24hRecent
                              ? recent24hCount > 0
                                ? `${recent24hCount} customer${recent24hCount !== 1 ? "s" : ""} will be skipped — received a broadcast via this system in the last 24 hours`
                                : "No customers received a broadcast via this system in the last 24 hours"
                              : `Exclude contacts broadcast-emailed/texted in the past 24h via this system — ${recent24hCount} in this audience`}
                          </p>
                        </div>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${exclude24hRecent ? "bg-sky-500" : "bg-gray-300"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${exclude24hRecent ? "translate-x-5" : "translate-x-0.5"}`}></div>
                      </div>
                    </div>

                    {/* Never Contacted */}
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors cursor-pointer ${neverContacted ? "bg-violet-50 border-violet-300" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}
                      onClick={() => { setNeverContacted((v) => !v); if (exclude24hRecent) setExclude24hRecent(false); }}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${neverContacted ? "bg-violet-100" : "bg-gray-100"}`}>
                          <i className={`ri-user-star-line text-sm ${neverContacted ? "text-violet-600" : "text-gray-400"}`}></i>
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${neverContacted ? "text-violet-800" : "text-gray-700"}`}>
                            Target only never-contacted customers
                          </p>
                          <p className={`text-xs mt-0.5 ${neverContacted ? "text-violet-600" : "text-gray-400"}`}>
                            {neverContacted
                              ? neverContactedCount > 0
                                ? `${neverContactedCount} customer${neverContactedCount !== 1 ? "s" : ""} have never received a broadcast`
                                : "Everyone in this audience has been contacted before"
                              : `Send only to fresh contacts — ${neverContactedCount} in this audience have never been broadcast-emailed`}
                          </p>
                        </div>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${neverContacted ? "bg-violet-500" : "bg-gray-300"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${neverContacted ? "translate-x-5" : "translate-x-0.5"}`}></div>
                      </div>
                    </div>
                  </div>

                  {/* ── Recipients Panel (always visible, with exclusion) ── */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer"
                      onClick={() => setShowRecipients((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <i className="ri-group-line text-[#3b6ea5] text-sm"></i>
                        <span className="text-xs font-bold text-gray-700">
                          Recipients
                        </span>
                        <span className="px-2 py-0.5 bg-[#3b6ea5] text-white text-xs font-extrabold rounded-full">
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
                            className="whitespace-nowrap text-xs font-bold text-[#3b6ea5] hover:underline cursor-pointer"
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
                              className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5]"
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
                              const isManualExcluded = excludedEmails.has(o.email.toLowerCase());
                              const autoExcludeReason = getAutoExcludeReason(o);
                              const isExcluded = isManualExcluded || !!autoExcludeReason;
                              return (
                                <div
                                  key={o.id}
                                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isExcluded ? "bg-red-50/60 opacity-60" : "bg-white hover:bg-gray-50"}`}
                                  onClick={(e) => { e.stopPropagation(); if (!autoExcludeReason) toggleExclude(o.email); }}
                                >
                                  <div
                                    className="w-4 h-4 flex items-center justify-center rounded border-2 flex-shrink-0 transition-colors"
                                    style={{
                                      borderColor: isExcluded ? "#ef4444" : "#3b6ea5",
                                      backgroundColor: isExcluded ? "#fef2f2" : "#3b6ea5",
                                    }}
                                  >
                                    {isExcluded
                                      ? <i className="ri-close-line text-red-500" style={{ fontSize: "9px" }}></i>
                                      : <i className="ri-check-line text-white" style={{ fontSize: "9px" }}></i>
                                    }
                                  </div>
                                  <div className="w-6 h-6 flex items-center justify-center bg-[#e8f0f9] rounded-full flex-shrink-0">
                                    <i className="ri-user-3-line text-[#3b6ea5] text-xs"></i>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-semibold truncate ${isExcluded ? "line-through text-gray-400" : "text-gray-900"}`}>{name}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                      {o.email}{channel === "sms" && o.phone ? ` · ${o.phone}` : ""}
                                    </p>
                                  </div>
                                  <span className="text-xs text-gray-300 flex-shrink-0">{o.state ?? ""}</span>
                                  {isManualExcluded && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 bg-red-100 text-red-500 text-[10px] font-bold rounded-full">
                                      excluded
                                    </span>
                                  )}
                                  {!isManualExcluded && autoExcludeReason && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 bg-sky-100 text-sky-600 text-[10px] font-bold rounded-full whitespace-nowrap">
                                      {autoExcludeReason}
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
                      {/* Template picker — grouped */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Template</p>
                        {(() => {
                          const groups = [...new Set(activeEmailTemplates.map((t) => t.group))];
                          return (
                            <div className="space-y-2">
                              {groups.map((grp) => (
                                <div key={grp}>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    <i className={`text-xs ${grp === "Lead Recovery" ? "ri-user-follow-line text-orange-400" : grp === "Existing Customers" ? "ri-group-line text-[#3b6ea5]" : "ri-settings-3-line text-gray-400"}`}></i>
                                    {grp}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {activeEmailTemplates.filter((t) => t.group === grp).map((t) => (
                                      <button key={t.id} type="button"
                                        onClick={() => handleEmailTemplateSelect(t.id)}
                                        className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                          emailTemplateId === t.id
                                            ? "bg-[#3b6ea5] text-white border-[#3b6ea5]"
                                            : "border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
                                        }`}>
                                        {t.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Subject */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Subject Line</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => { setSubject(e.target.value); setEmailTemplateId("custom"); }}
                          placeholder="e.g. Time to Renew Your ESA Letter"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3b6ea5]"
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
                          className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3b6ea5] resize-none"
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
                            className={`whitespace-nowrap w-10 h-5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ${includePortalCta ? "bg-[#3b6ea5]" : "bg-gray-300"}`}
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
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Button URL</label>
                              <input
                                type="url"
                                value={ctaUrl}
                                onChange={(e) => setCtaUrl(e.target.value)}
                                placeholder="https://pawtenant.com/..."
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                              />
                            </div>
                          </div>
                        )}
                        {includePortalCta && (audience === "all_leads" || audience === "all_everyone") && (ctaUrl.includes("assessment") || ctaUrl.includes("resume=")) && (
                          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="w-5 h-5 flex items-center justify-center bg-emerald-100 rounded-full flex-shrink-0 mt-0.5">
                              <i className="ri-magic-line text-emerald-600" style={{ fontSize: "11px" }}></i>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-emerald-800">CTA button will be personalized per customer</p>
                              <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                                Each lead will receive their own unique resume link:{" "}
                                <span className="font-mono text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded">
                                  pawtenant.com/assessment?resume=ORDER_ID
                                </span>
                                {" "}— clicking it takes them directly to their saved checkout, not the first step.
                              </p>
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
                            <i className="ri-eye-line text-[#3b6ea5] text-sm"></i>
                            <span className="text-xs font-bold text-gray-700">Preview Email</span>
                            <span className="px-2 py-0.5 bg-[#3b6ea5]/10 text-[#3b6ea5] text-[10px] font-extrabold rounded-full uppercase tracking-wide">Live</span>
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
                        {(() => {
                          const groups = [...new Set(activeSmsTemplates.map((t) => t.group))];
                          return (
                            <div className="space-y-2">
                              {groups.map((grp) => (
                                <div key={grp}>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    <i className={`text-xs ${grp === "Lead Recovery" ? "ri-user-follow-line text-orange-400" : grp === "Existing Customers" ? "ri-group-line text-[#3b6ea5]" : "ri-settings-3-line text-gray-400"}`}></i>
                                    {grp}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {activeSmsTemplates.filter((t) => t.group === grp).map((t) => (
                                      <button key={t.id} type="button"
                                        onClick={() => handleSmsTemplateSelect(t.id)}
                                        className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                          smsTemplateId === t.id
                                            ? "bg-[#3b6ea5] text-white border-[#3b6ea5]"
                                            : "border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
                                        }`}>
                                        {t.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
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
                          className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3b6ea5] resize-none"
                        />
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <i className="ri-lightbulb-line text-amber-500"></i>
                          Use <code className="bg-gray-100 px-1 rounded text-[10px]">&lbrace;name&rbrace;</code> to auto-insert each customer&apos;s first name
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Stats bar ── */}
                  {(() => {
                    const show24h = exclude24hRecent && recent24hCount > 0;
                    const showNever = neverContacted;
                    const neverSkipped = showNever ? (channel === "sms" ? withPhone : audienceOrders).filter((o) => !!o.last_broadcast_sent_at).length : 0;
                    const extraCols = (optOutCount > 0 ? 1 : 0) + (show24h ? 1 : 0) + (showNever ? 1 : 0);
                    const totalCols = 3 + extraCols;
                    return (
                      <div className="grid gap-3 bg-gray-50 rounded-xl border border-gray-200 p-4"
                        style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>
                        <div className="text-center">
                          <p className="text-2xl font-extrabold text-[#3b6ea5]">{recipients.length}</p>
                          <p className="text-xs text-gray-500">Will receive</p>
                        </div>
                        <div className="text-center border-x border-gray-200">
                          <p className="text-2xl font-extrabold text-red-500">{excludedEmails.size}</p>
                          <p className="text-xs text-gray-500">Manually excluded</p>
                        </div>
                        {optOutCount > 0 && (
                          <div className="text-center border-r border-gray-200">
                            <p className="text-2xl font-extrabold text-orange-500">{optOutCount}</p>
                            <p className="text-xs text-gray-500">Opted out</p>
                          </div>
                        )}
                        {show24h && (
                          <div className="text-center border-r border-gray-200">
                            <p className="text-2xl font-extrabold text-sky-500">{recent24hCount}</p>
                            <p className="text-xs text-gray-500">24h cooldown</p>
                          </div>
                        )}
                        {showNever && (
                          <div className="text-center border-r border-gray-200">
                            <p className="text-2xl font-extrabold text-violet-500">{neverSkipped}</p>
                            <p className="text-xs text-gray-500">Prior contact skipped</p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-sm font-extrabold text-gray-500 capitalize">{channel}</p>
                          <p className="text-xs text-gray-500">
                            {channel === "sms" ? `${smsCredits} credit${smsCredits > 1 ? "s" : ""} each` : "via Resend"}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Opt-out notice ── */}
                  {optOutCount > 0 && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-orange-50 border border-orange-200 rounded-xl">
                      <div className="w-5 h-5 flex items-center justify-center bg-orange-100 rounded-full flex-shrink-0 mt-0.5">
                        <i className="ri-mail-forbid-line text-orange-600" style={{ fontSize: "11px" }}></i>
                      </div>
                      <p className="text-xs text-orange-800 leading-relaxed">
                        <strong>{optOutCount} customer{optOutCount > 1 ? "s" : ""}</strong> in this audience have unsubscribed from marketing emails and will be automatically excluded from this broadcast.
                      </p>
                    </div>
                  )}

                  {/* Audience summary */}
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${audience === "all_everyone" ? "bg-violet-50 border-violet-200" : "bg-[#e8f0f9] border-[#b8cce4]"}`}>
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
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={sending || !isReadyToSend}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#3b6ea5] text-white text-sm font-extrabold rounded-xl hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors"
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
          </>
        )}

        {/* Broadcast History Modal */}
        {showHistory && <BroadcastHistoryModal onClose={() => setShowHistory(false)} />}

        {/* Approval Request Modal for Support role */}
        {showSupportApproval && (
          <ApprovalRequestModal
            actionType="broadcast"
            actionLabel="Customer Broadcast"
            actionDescription="Request to send a bulk email or SMS broadcast to a customer segment. As a Support user, this requires Owner or Admin Manager approval."
            payload={{
              channel: "email/sms",
              audience: "to be determined by approver",
            }}
            requesterName={adminName}
            requesterRole="support"
            requesterUserId=""
            onClose={() => setShowSupportApproval(false)}
          />
        )}

        {/* ── Send Confirmation Dialog ── */}
        {showConfirmDialog && canBroadcast && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowConfirmDialog(false)}></div>
            <div className="relative bg-white rounded-2xl w-full max-w-md overflow-hidden">

              {/* Dialog header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-xl flex-shrink-0">
                  <i className="ri-send-plane-2-line text-amber-600 text-lg"></i>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900">Confirm Broadcast Send</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Review before sending — this cannot be undone</p>
                </div>
                <button type="button" onClick={() => setShowConfirmDialog(false)}
                  className="whitespace-nowrap ml-auto w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
                  <i className="ri-close-line text-base"></i>
                </button>
              </div>

              {/* Summary rows */}
              <div className="px-5 py-4 space-y-3">

                {/* Channel */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Channel</span>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold ${channel === "email" ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-amber-50 text-amber-700"}`}>
                    <i className={channel === "email" ? "ri-mail-send-line" : "ri-chat-1-line"}></i>
                    {channel === "email" ? "Email" : "SMS"}
                  </span>
                </div>

                {/* Audience */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Audience</span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <i className={`${selectedAudienceOption.icon} ${selectedAudienceOption.color} text-sm`}></i>
                    {selectedAudienceOption.label}
                  </span>
                </div>

                {/* Subject / Message */}
                {channel === "email" ? (
                  <div className="py-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Subject</span>
                    <p className="text-sm font-semibold text-gray-800 leading-snug">{subject.trim() || <span className="text-gray-400 italic">No subject</span>}</p>
                  </div>
                ) : (
                  <div className="py-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Message Preview</span>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{smsText.trim() || <span className="text-gray-400 italic">No message</span>}</p>
                  </div>
                )}

                {/* Active filters */}
                {(exclude24hRecent || neverContacted || excludedEmails.size > 0 || optOutCount > 0 || timeRange !== "all") && (
                  <div className="py-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Active Filters</span>
                    <div className="flex flex-wrap gap-1.5">
                      {optOutCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full">
                          <i className="ri-mail-forbid-line"></i>
                          {optOutCount} opt-out excluded
                        </span>
                      )}
                      {timeRange !== "all" && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] text-[10px] font-bold rounded-full">
                          <i className="ri-calendar-line"></i>
                          {timeRange === "24h" ? "Last 24h" : timeRange === "3d" ? "Last 3 days" : "Last 7 days"}
                        </span>
                      )}

                      {exclude24hRecent && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-bold rounded-full">
                          <i className="ri-time-line"></i>
                          24h cooldown ({recent24hCount} skipped)
                        </span>
                      )}
                      {neverContacted && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-[10px] font-bold rounded-full">
                          <i className="ri-user-star-line"></i>
                          Never-contacted only
                        </span>
                      )}
                      {excludedEmails.size > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">
                          <i className="ri-user-unfollow-line"></i>
                          {excludedEmails.size} manually excluded
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Recipient count — big highlight */}
                <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#3b6ea5]">Final recipient count</p>
                    <p className="text-xs text-[#2d5a8e] mt-0.5">
                      {channel === "email" ? "Each will receive a personalized email" : "Each will receive an SMS via Twilio"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-extrabold text-[#3b6ea5]">{recipients.length}</p>
                    <p className="text-xs text-[#2d5a8e] font-semibold">{channel === "email" ? "emails" : "texts"}</p>
                  </div>
                </div>

                {/* 30-recipient limit warning */}
                {recipients.length > RECIPIENT_LIMIT && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                    <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-red-800 leading-relaxed">
                      <strong>Recipient limit exceeded.</strong> Broadcasts are capped at {RECIPIENT_LIMIT} contacts per send. Only the first {RECIPIENT_LIMIT} recipients will receive this message. Use filters to narrow your audience.
                    </p>
                  </div>
                )}
              </div>

              {/* Dialog actions */}
              <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  className="whitespace-nowrap flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl cursor-pointer hover:bg-white transition-colors"
                >
                  Go Back &amp; Review
                </button>
                <button
                  type="button"
                  onClick={() => { setShowConfirmDialog(false); handleSend(); }}
                  disabled={sending}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-extrabold rounded-xl hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <i className={channel === "email" ? "ri-mail-send-line" : "ri-chat-1-line"}></i>
                  Confirm &amp; Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
