// TwiML App Voice URL — handles outbound calls made from the browser via Twilio Voice SDK
// Twilio sends: To (destination phone), From, Caller params

Deno.serve(async (req) => {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const to   = params.get("To") ?? "";
    const from = Deno.env.get("TWILIO_PHONE_NUMBER") ?? params.get("From") ?? "";

    // Validate 'to' is a phone number (not a client identity)
    let twiml: string;
    if (to.startsWith("client:") || !to) {
      twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination specified.</Say></Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}" timeout="30" record="do-not-record">
    <Number statusCallbackEvent="initiated ringing answered completed" statusCallback="">${to}</Number>
  </Dial>
</Response>`;
    }

    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("twilio-outbound-twiml error:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Server error. Please try again.</Say></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }
});
