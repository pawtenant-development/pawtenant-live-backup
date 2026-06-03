// send-provider-recruitment-email  (v2)
// PAWTENANT-PROVIDER-RECRUITMENT-V2
//
// Admin-only outreach tool: emails potential licensed mental health providers
// in ANY U.S. state where PawTenant is expanding coverage. Renders the editable
// DB template `provider_recruitment_outreach` (Communications Template Hub),
// falling back to a built-in branded default. CTA points to /join-our-network.
//
// Security: owner/admin_manager JWT only; Resend key server-side; recipient cap;
// join URL validated to a PawTenant host. Logs every attempt to
// provider_recruitment_outreach (service-role insert, bypasses RLS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const DEFAULT_JOIN_URL = "https://pawtenant.com/join-our-network";

const MAX_RECIPIENTS = 50;

// All 50 states + DC — campaigns may target any U.S. state.
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois",
  "Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts",
  "Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota",
  "Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];
const US_STATES_SET = new Set(US_STATES);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Single-brace {var} substitution — matches send-templated-email.
function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function statesSentence(states: string[]): string {
  if (states.length === 1) return states[0];
  if (states.length === 2) return `${states[0]} and ${states[1]}`;
  return `${states.slice(0, -1).join(", ")}, and ${states[states.length - 1]}`;
}

// Only allow join URLs on a PawTenant host pointing at the join page.
function safeJoinUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return DEFAULT_JOIN_URL;
  try {
    const u = new URL(raw);
    const okHost = u.protocol === "https:" &&
      (u.hostname === "pawtenant.com" || u.hostname.endsWith(".pawtenant.com") || u.hostname === "pawtenant-test.vercel.app");
    if (okHost && u.pathname.replace(/\/$/, "") === "/join-our-network") return u.toString();
  } catch { /* fall through */ }
  return DEFAULT_JOIN_URL;
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string; text?: string;
  reply_to?: string; tags?: Array<{ name: string; value: string }>;
}, apiKey: string): Promise<{ ok: boolean; messageId: string | null; error: string | null }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.reply_to ? { reply_to: opts.reply_to } : {}),
        ...(opts.tags ? { tags: opts.tags } : {}),
      }),
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, messageId: null, error: `HTTP ${res.status}${raw ? `: ${raw.slice(0, 200)}` : ""}` };
    let messageId: string | null = null;
    try { messageId = (JSON.parse(raw) as { id?: string })?.id ?? null; } catch { /* non-JSON */ }
    return { ok: true, messageId, error: null };
  } catch (err) {
    return { ok: false, messageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

interface RecipientIn { email?: string; name?: string }

// Built-in fallback used only if the DB template is missing.
function fallbackEmail(vars: Record<string, string>): string {
  const introBlock = vars.custom_intro
    ? `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">${vars.custom_intro}</p>` : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="background:#4a9e8a;padding:32px;text-align:center;">
<img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
<h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">Partner with PawTenant</h1></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 20px;font-size:15px;color:#374151;">Hi <strong>${vars.name}</strong>,</p>
${introBlock}
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">PawTenant is expanding its licensed mental health provider network in <strong>${vars.states}</strong>. Providers review structured client intake, apply their own clinical judgment, and approve only when clinically appropriate.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center">
<a href="${vars.join_url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Join Our Provider Network &rarr;</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;">Or reply with your licensed state(s).<br/><br/>Warm regards,<br/><strong>The PawTenant Provider Partnerships Team</strong><br/>${SUPPORT_EMAIL}</p>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ ok: false, error: "RESEND_API_KEY not configured" }, 500);

  const adminClient = createClient(supabaseUrl, serviceKey);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) return json({ ok: false, error: "Unauthorized — session expired, please refresh" }, 401);

  const { data: profile } = await adminClient
    .from("doctor_profiles").select("is_admin, role, full_name, is_active").eq("user_id", user.id).maybeSingle();
  const role = profile?.role ?? "";
  if (profile?.is_active === false || !["owner", "admin_manager"].includes(role)) {
    return json({ ok: false, error: "Access denied — owner or admin manager only" }, 403);
  }

  let body: {
    recipients?: RecipientIn[]; emails?: string[]; targetStates?: string[];
    subject?: string; intro?: string; sendTest?: boolean; joinUrl?: string;
  };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const sendTest = body.sendTest === true;
  const targetStates = (body.targetStates ?? []).filter((s) => US_STATES_SET.has(s));
  if (targetStates.length === 0) return json({ ok: false, error: "Select at least one valid U.S. state." }, 400);

  const rawRecipients: RecipientIn[] = body.recipients?.length
    ? body.recipients : (body.emails ?? []).map((e) => ({ email: e }));
  const seen = new Set<string>();
  const recipients: { email: string; name?: string }[] = [];
  const invalid: string[] = [];
  for (const r of rawRecipients) {
    const email = (r.email ?? "").trim();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) { invalid.push(email); continue; }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ email, name: r.name?.trim() || undefined });
  }
  if (invalid.length > 0) return json({ ok: false, error: `Invalid email address(es): ${invalid.slice(0, 5).join(", ")}` }, 400);
  if (recipients.length === 0) return json({ ok: false, error: "Add at least one recipient email." }, 400);
  if (sendTest && recipients.length > 1) return json({ ok: false, error: "Send Test allows only one recipient." }, 400);
  if (recipients.length > MAX_RECIPIENTS) return json({ ok: false, error: `Too many recipients (${recipients.length}). Max ${MAX_RECIPIENTS} per send.` }, 400);

  const baseSubjectDefault = "Partner with PawTenant — Licensed Provider Network";
  const intro = (body.intro ?? "").trim();
  const joinUrl = safeJoinUrl(body.joinUrl);
  const statesText = statesSentence(targetStates);
  const actorName = profile?.full_name ?? "Admin";
  const nowIso = new Date().toISOString();

  // Load the editable DB template (subject + body), fall back to built-in.
  let tplSubject = baseSubjectDefault;
  let tplBody: string | null = null;
  try {
    const { data: tpl } = await adminClient
      .from("email_templates")
      .select("subject, body, archived")
      .eq("slug", "provider_recruitment_outreach").eq("channel", "email").maybeSingle();
    if (tpl && !tpl.archived) {
      if (tpl.subject) tplSubject = tpl.subject as string;
      if (tpl.body) tplBody = tpl.body as string;
    }
  } catch { /* fall back to built-in */ }

  const overrideSubject = (body.subject ?? "").trim();
  const baseSubject = overrideSubject || tplSubject;
  const subject = sendTest ? `[TEST] ${baseSubject}` : baseSubject;

  const results: Array<{ email: string; ok: boolean; messageId: string | null; error: string | null }> = [];

  for (const r of recipients) {
    const introHtml = intro
      ? `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">${escapeHtml(intro)}</p>` : "";
    const vars: Record<string, string> = {
      name: escapeHtml(r.name || "there"),
      states: escapeHtml(statesText),
      join_url: joinUrl,
      custom_intro: introHtml,
      company_name: COMPANY_NAME,
      sender_name: escapeHtml(actorName),
    };
    const subjVars = { ...vars, states: statesText };
    const html = tplBody ? substitute(tplBody, vars) : fallbackEmail(vars);
    const finalSubject = substitute(subject, subjVars);

    const res = await sendViaResend({
      to: r.email,
      subject: finalSubject,
      html,
      reply_to: SUPPORT_EMAIL,
      tags: [
        { name: "email_type", value: "provider_recruitment" },
        { name: "is_test", value: sendTest ? "true" : "false" },
      ],
    }, resendKey);

    try {
      await adminClient.from("provider_recruitment_outreach").insert({
        recipient_email: r.email,
        recipient_name: r.name ?? null,
        target_states: targetStates,
        provider_type: null,
        subject: finalSubject,
        message_html: html,
        status: res.ok ? "sent" : "failed",
        resend_message_id: res.messageId,
        sent_by: user.id,
        sent_by_name: actorName,
        sent_at: res.ok ? nowIso : null,
        last_error: res.error,
        source: "admin_provider_recruitment",
        is_test: sendTest,
      });
    } catch (logErr) {
      console.error("[send-provider-recruitment-email] log insert failed:", logErr);
    }

    results.push({ email: r.email, ok: res.ok, messageId: res.messageId, error: res.error });
  }

  const sentCount = results.filter((x) => x.ok).length;
  return json({ ok: sentCount > 0, sentCount, failedCount: results.length - sentCount, isTest: sendTest, targetStates, joinUrl, results });
});
