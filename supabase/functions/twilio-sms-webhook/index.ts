// Twilio calls this when a customer replies or sends an SMS to your Twilio number
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

Deno.serve(async (req) => {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);

    const from    = params.get("From") ?? "";
    const to      = params.get("To") ?? "";
    const body    = params.get("Body") ?? "";
    const smsSid  = params.get("SmsSid") ?? "";

    // Normalise phone for lookup
    const fromDigits = from.replace(/\D/g, "");

    // Look up matching order
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id, confirmation_id, first_name, last_name, email, phone, ghl_contact_id")
      .or(`phone.eq.${from},phone.eq.+${fromDigits},phone.eq.${fromDigits}`)
      .order("created_at", { ascending: false })
      .limit(1);

    const match = orderRows && orderRows.length > 0 ? (orderRows[0] as {
      id: string; confirmation_id: string; first_name: string | null; last_name: string | null;
      email: string; phone: string | null; ghl_contact_id: string | null;
    }) : null;

    await supabase.from("communications").insert({
      order_id: match?.id ?? null,
      confirmation_id: match?.confirmation_id ?? null,
      type: "sms_inbound",
      direction: "inbound",
      body,
      phone_from: from,
      phone_to: to,
      status: "received",
      twilio_sid: smsSid,
      sent_by: match ? `${match.first_name ?? ""} ${match.last_name ?? ""}`.trim() || match.email : from,
    });

    // ── Push to GHL comms webhook so it appears on contact timeline ──────
    if (match) {
      try {
        // eventType "sms_inbound" auto-routes to GHL_COMMS_WEBHOOK_URL in the proxy
        const ghlCommsPayload = {
          eventType:   "sms_inbound",
          email:       match.email,
          phone:       from,
          firstName:   match.first_name ?? "",
          lastName:    match.last_name ?? "",
          messageBody: body,
          direction:   "inbound",
          timestamp:   new Date().toISOString(),
          confirmationId: match.confirmation_id,
          ...(match.ghl_contact_id ? { contactId: match.ghl_contact_id } : {}),
        };
        fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ghlCommsPayload),
        }).catch((e) => console.error("[twilio-sms-webhook] GHL comms push failed:", e));
      } catch (e) {
        console.error("[twilio-sms-webhook] GHL comms push error:", e);
      }
    }

    // Return empty TwiML (no auto-reply)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  } catch (err) {
    console.error("twilio-sms-webhook error:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }
});
