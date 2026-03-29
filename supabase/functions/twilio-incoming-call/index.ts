// Twilio hits this URL when someone calls your Twilio number.
// We log the inbound call, enable recording, and return TwiML that connects to the admin portal browser client.
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
    const callSid   = params.get("CallSid") ?? "";
    const callerRaw = params.get("From") ?? "";
    const toNumber  = params.get("To") ?? "";

    // Normalise caller number for DB lookup
    const callerDigits = callerRaw.replace(/\D/g, "");

    // Look up matching order by phone
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id, confirmation_id, first_name, last_name, email, phone, state, status, payment_intent_id")
      .or(`phone.eq.${callerRaw},phone.eq.+${callerDigits},phone.eq.${callerDigits}`)
      .order("created_at", { ascending: false })
      .limit(1);

    const matchedOrder = orderRows && orderRows.length > 0 ? orderRows[0] as {
      id: string; confirmation_id: string; first_name: string | null; last_name: string | null;
      email: string; phone: string | null; state: string | null; status: string; payment_intent_id: string | null;
    } : null;

    // Log inbound call
    await supabase.from("communications").insert({
      order_id: matchedOrder?.id ?? null,
      confirmation_id: matchedOrder?.confirmation_id ?? null,
      type: "call_inbound",
      direction: "inbound",
      phone_from: callerRaw,
      phone_to: toNumber,
      status: "in_progress",
      twilio_sid: callSid,
      body: matchedOrder
        ? `Inbound call from ${matchedOrder.first_name ?? ""} ${matchedOrder.last_name ?? ""} (${matchedOrder.email})`
        : `Inbound call from unknown caller`,
    });

    // ── Push to GHL so call appears on contact timeline ───────────────────
    if (matchedOrder) {
      try {
        const ghlPayload = {
          webhookType: "comms",
          eventType: "call_inbound",
          confirmationId: matchedOrder.confirmation_id,
          email: matchedOrder.email,
          phone: callerRaw,
          firstName: matchedOrder.first_name ?? "",
          lastName: matchedOrder.last_name ?? "",
          callSid,
          callFrom: callerRaw,
          callTo: toNumber,
          timestamp: new Date().toISOString(),
          note: `📞 Inbound call from ${matchedOrder.first_name ?? ""} ${matchedOrder.last_name ?? ""} (${callerRaw})`,
        };
        fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ghlPayload),
        }).catch((e) => console.error("[twilio-incoming-call] GHL push failed:", e));
      } catch (e) {
        console.error("[twilio-incoming-call] GHL push error:", e);
      }
    }

    // Recording callback URL — Twilio will POST here when recording is done
    const recordingCallbackUrl = `${SUPABASE_URL}/functions/v1/twilio-recording-callback`;

    // Return TwiML — connect to browser client "admin_portal" with recording enabled
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${toNumber}" timeout="30" record="record-from-answer" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST">
    <Client>
      <Identity>admin_portal</Identity>
      <Parameter name="callerPhone" value="${callerRaw}" />
      <Parameter name="orderId" value="${matchedOrder?.id ?? ""}" />
      <Parameter name="confirmationId" value="${matchedOrder?.confirmation_id ?? ""}" />
      <Parameter name="callerName" value="${encodeURIComponent([matchedOrder?.first_name, matchedOrder?.last_name].filter(Boolean).join(" ") || "Unknown")}" />
      <Parameter name="callerEmail" value="${encodeURIComponent(matchedOrder?.email ?? "")}" />
      <Parameter name="orderStatus" value="${matchedOrder?.payment_intent_id ? "paid" : "unpaid"}" />
      <Parameter name="state" value="${matchedOrder?.state ?? ""}" />
    </Client>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, there was an error. Please try again later.</Say></Response>`;
    console.error("twilio-incoming-call error:", err);
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  }
});
