// send-template-test — manual test send for a single email template
// Called from Settings → Templates → Test Send button.
// Input: { to, subject, html, template_id, template_label }
// Auth: requires admin Bearer token (same pattern as broadcast-email)
// Isolation: logs with slug="template_test", sent_by="admin_template_test"
//            NO order_id, NO confirmation_id — zero lifecycle impact, no dedupe block

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    // Auth: validate admin token
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "Unauthorized — missing token" }, 401);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json() as {
      to: string;
      subject: string;
      html: string;
      template_id?: string;
      template_label?: string;
    };

    if (!body.to || !body.subject || !body.html) {
      return json({ ok: false, error: "to, subject, and html are required" }, 400);
    }
    if (!isValidEmail(body.to)) {
      return json({ ok: false, error: "Invalid email address" }, 400);
    }

    const templateId = body.template_id ?? "unknown";
    const templateLabel = body.template_label ?? templateId;
    const testSubject = `[TEST] ${body.subject}`;

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [body.to.trim()],
        subject: testSubject,
        html: body.html,
        tags: [
          { name: "type", value: "template_test" },
          { name: "template_id", value: templateId },
        ],
      }),
    });

    const resendText = await resendRes.text();
    if (!resendRes.ok) {
      return json({ ok: false, error: `Resend error (${resendRes.status}): ${resendText}` }, 500);
    }

    // Log to communications — clearly marked as test, no order linkage
    await adminClient.from("communications").insert({
      order_id: null,
      confirmation_id: null,
      type: "email",
      direction: "outbound",
      body: `[TEST SEND] Template: ${templateLabel} (${templateId})`,
      email_to: body.to.trim(),
      email_from: FROM_EMAIL,
      subject: testSubject,
      slug: "template_test",
      template_source: "db",
      status: "sent",
      sent_by: "admin_template_test",
      dedupe_key: null,
    });

    return json({ ok: true, to: body.to.trim(), template_id: templateId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Internal error: ${msg}` }, 500);
  }
});
