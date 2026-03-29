import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_ACCOUNT_SID   = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN    = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM_NUMBER   = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { orderId, confirmationId, toPhone, sentBy } = await req.json() as {
      orderId?: string;
      confirmationId?: string;
      toPhone: string;
      sentBy?: string;
    };

    if (!toPhone) {
      return new Response(JSON.stringify({ ok: false, error: "toPhone is required" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 400,
      });
    }

    // Normalise phone
    let phone = toPhone.replace(/\D/g, "");
    if (phone.length === 10) phone = "1" + phone;
    if (!phone.startsWith("+")) phone = "+" + phone;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const twimlUrl = `${supabaseUrl}/functions/v1/twilio-outbound-twiml`;

    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const body = new URLSearchParams({
      To: phone,
      From: TWILIO_FROM_NUMBER,
      Url: twimlUrl,
    });

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    const twilioData = await twilioRes.json() as { sid?: string; error_message?: string; status?: string };
    const status = twilioRes.ok ? (twilioData.status ?? "initiated") : "failed";
    const now = new Date().toISOString();

    await supabase.from("communications").insert({
      order_id: orderId ?? null,
      confirmation_id: confirmationId ?? null,
      type: "call_outbound",
      direction: "outbound",
      phone_from: TWILIO_FROM_NUMBER,
      phone_to: phone,
      status,
      twilio_sid: twilioData.sid ?? null,
      body: twilioRes.ok ? `Outbound call initiated` : `Call failed: ${twilioData.error_message}`,
      sent_by: sentBy ?? "Admin",
    });

    if (!twilioRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: twilioData.error_message ?? "Twilio error" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ── Update last_contacted_at on the order ──────────────────────────────
    if (orderId) {
      await supabase.from("orders").update({ last_contacted_at: now }).eq("id", orderId);
    } else if (confirmationId) {
      await supabase.from("orders").update({ last_contacted_at: now }).eq("confirmation_id", confirmationId);
    }

    return new Response(JSON.stringify({ ok: true, sid: twilioData.sid, status: twilioData.status }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  }
});
