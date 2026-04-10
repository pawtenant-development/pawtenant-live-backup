import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

interface BulkTarget {
  orderId: string;
  confirmationId: string;
  phone: string;
  name: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // ── Auth: verify caller is an admin ─────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing Authorization header — please log in again." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();

    if (authErr || !caller) {
      const errMsg = authErr?.message ?? "Token invalid or session expired";
      return new Response(
        JSON.stringify({ ok: false, error: `Authentication failed: ${errMsg}. Please refresh the page and log in again.` }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, role, full_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAdmin =
      callerProfile?.is_admin === true ||
      ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin access required" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    // ────────────────────────────────────────────────────────────────────

    const { targets, message, sentBy } = await req.json() as {
      targets: BulkTarget[];
      message: string;
      sentBy?: string;
    };

    if (!targets || targets.length === 0 || !message) {
      return new Response(
        JSON.stringify({ ok: false, error: "targets and message are required" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    let successCount = 0;
    let failCount = 0;
    const results: { phone: string; ok: boolean; error?: string }[] = [];
    const nowIso = new Date().toISOString();
    const successfulConfirmationIds: string[] = [];

    await Promise.all(
      targets.map(async (target) => {
        let phone = target.phone.replace(/\D/g, "");
        if (phone.length === 10) phone = "1" + phone;
        if (!phone.startsWith("+")) phone = "+" + phone;

        // Personalise — replace {name} placeholder
        const personalised = message.replace(/\{name\}/gi, target.name.split(" ")[0] || "there");

        try {
          const body = new URLSearchParams({ To: phone, From: TWILIO_FROM_NUMBER, Body: personalised });
          const twilioRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: body.toString(),
            },
          );
          const data = await twilioRes.json() as { sid?: string; error_message?: string; status?: string };
          const ok = twilioRes.ok;

          await adminClient.from("communications").insert({
            order_id: target.orderId ?? null,
            confirmation_id: target.confirmationId ?? null,
            type: "sms_outbound",
            direction: "outbound",
            body: personalised,
            phone_from: TWILIO_FROM_NUMBER,
            phone_to: phone,
            status: ok ? (data.status ?? "sent") : "failed",
            twilio_sid: data.sid ?? null,
            sent_by: sentBy ?? "Admin (Bulk)",
          });

          if (ok) {
            successCount++;
            results.push({ phone, ok: true });
            if (target.confirmationId) {
              successfulConfirmationIds.push(target.confirmationId);
            }
          } else {
            failCount++;
            results.push({ phone, ok: false, error: data.error_message });
          }
        } catch (e) {
          failCount++;
          results.push({ phone, ok: false, error: String(e) });
        }
      }),
    );

    // ── Stamp last_broadcast_sent_at on all successfully sent orders ──────
    if (successfulConfirmationIds.length > 0) {
      const STAMP_BATCH = 50;
      for (let i = 0; i < successfulConfirmationIds.length; i += STAMP_BATCH) {
        const chunk = successfulConfirmationIds.slice(i, i + STAMP_BATCH);
        try {
          await adminClient
            .from("orders")
            .update({ last_broadcast_sent_at: nowIso })
            .in("confirmation_id", chunk);
        } catch (stampErr) {
          console.warn("[bulk-sms] Failed to stamp last_broadcast_sent_at:", stampErr);
        }
      }
    }

    // ── Log the broadcast ─────────────────────────────────────────────────
    try {
      await adminClient.from("broadcast_logs").insert({
        sent_by: sentBy ?? callerProfile?.full_name ?? "Admin",
        sent_by_user_id: caller.id,
        channel: "sms",
        audience_key: "bulk_sms",
        subject: message.slice(0, 200),
        message_preview: message.slice(0, 200),
        recipients_count: targets.length,
        success_count: successCount,
        fail_count: failCount,
        excluded_count: 0,
        is_test: false,
        test_email: null,
      });
    } catch (logErr) {
      console.warn("[bulk-sms] Failed to log broadcast:", logErr);
    }

    return new Response(
      JSON.stringify({ ok: true, successCount, failCount, results }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
