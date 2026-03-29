import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

interface BulkTarget {
  orderId: string;
  confirmationId: string;
  phone: string;
  name: string;
}

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
    const { targets, message, sentBy } = await req.json() as {
      targets: BulkTarget[];
      message: string;
      sentBy?: string;
    };

    if (!targets || targets.length === 0 || !message) {
      return new Response(JSON.stringify({ ok: false, error: "targets and message are required" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 400,
      });
    }

    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    let successCount = 0;
    let failCount = 0;
    const results: { phone: string; ok: boolean; error?: string }[] = [];

    await Promise.all(
      targets.map(async (target) => {
        let phone = target.phone.replace(/\D/g, "");
        if (phone.length === 10) phone = "1" + phone;
        if (!phone.startsWith("+")) phone = "+" + phone;

        // Personalise message — replace {name} placeholder
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

          await supabase.from("communications").insert({
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

          if (ok) { successCount++; results.push({ phone, ok: true }); }
          else { failCount++; results.push({ phone, ok: false, error: data.error_message }); }
        } catch (e) {
          failCount++;
          results.push({ phone, ok: false, error: String(e) });
        }
      }),
    );

    return new Response(
      JSON.stringify({ ok: true, successCount, failCount, results }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  }
});
