// send-templated-email — generic DB template sender used by admin Comms tab
// Input: { slug, to, vars?, confirmationId? }
// Looks up email_templates by slug, substitutes vars, wraps in master layout (or fallback), sends via Resend.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logEmailComm } from "../_shared/logEmailComm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(v = "") {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const FALLBACK_LAYOUT = `<!DOCTYPE html>
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

async function loadMasterLayout(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("comms_settings")
    .select("value")
    .eq("key", "email_layout_html")
    .maybeSingle();
  const val = (data?.value as string | null) ?? "";
  if (val && val.includes("{{content}}")) return val;
  return FALLBACK_LAYOUT;
}

function renderBodyAsHtml(bodyText: string, ctaLabel: string, ctaUrl: string): string {
  const paragraphs = bodyText
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${line}</p>`)
    .join("");

  const cta = ctaUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
         <tr><td align="center">
           <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${ctaLabel || "Open"} &rarr;</a>
         </td></tr>
       </table>`
    : "";

  return `${paragraphs}${cta}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as {
      slug: string;
      to: string;
      vars?: Record<string, string>;
      confirmationId?: string;
    };

    if (!body.slug || !body.to) {
      return json({ ok: false, error: "slug and to are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tmpl, error } = await supabase
      .from("email_templates")
      .select("subject, body, cta_label, cta_url")
      .eq("slug", body.slug)
      .eq("channel", "email")
      .maybeSingle();

    if (error || !tmpl) {
      return json({ ok: false, error: `Template not found for slug: ${body.slug}` }, 404);
    }

    const vars: Record<string, string> = {
      site_url: SITE_URL,
      ...(body.vars ?? {}),
    };

    const subject = substitute(tmpl.subject as string, vars);
    const bodyText = substitute(tmpl.body as string, vars);
    const ctaLabel = substitute((tmpl.cta_label as string) ?? "", vars);
    const ctaUrl = substitute((tmpl.cta_url as string) ?? "", vars);

    const content = renderBodyAsHtml(bodyText, ctaLabel, ctaUrl);
    const layout = await loadMasterLayout(supabase);
    const html = layout.replace("{{content}}", content);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [body.to],
        subject,
        html,
        tags: [
          { name: "slug", value: body.slug },
          ...(body.confirmationId ? [{ name: "confirmation_id", value: body.confirmationId }] : []),
        ],
      }),
    });

    const resendText = await resendRes.text();
    if (!resendRes.ok) {
      return json({ ok: false, error: `Resend error (${resendRes.status}): ${resendText}` }, 500);
    }

    // Primary log → communications (single source of truth for the unified Comms timeline)
    await logEmailComm({
      supabase,
      confirmationId: body.confirmationId ?? null,
      to: body.to,
      from: FROM_EMAIL,
      subject,
      body: bodyText,
      slug: body.slug,
      templateSource: "db",
      sentBy: "admin_comms",
    });

    // Backup log → orders.email_log (kept for legacy consumers; not source of truth)
    if (body.confirmationId) {
      const { data: order } = await supabase
        .from("orders")
        .select("email_log")
        .eq("confirmation_id", body.confirmationId)
        .maybeSingle();
      const existingLog = (order?.email_log as unknown[]) ?? [];
      await supabase.from("orders").update({
        email_log: [...existingLog, {
          type: `templated_${body.slug}`,
          sentAt: new Date().toISOString(),
          to: body.to,
          success: true,
          slug: body.slug,
        }],
      }).eq("confirmation_id", body.confirmationId);
    }

    return json({ ok: true, to: body.to, slug: body.slug });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Internal error: ${msg}` }, 500);
  }
});
