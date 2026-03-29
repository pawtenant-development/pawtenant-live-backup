// Generates a Twilio Voice Access Token for browser-based calling
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const TWILIO_ACCOUNT_SID   = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_API_KEY       = Deno.env.get("TWILIO_API_KEY") ?? "";
const TWILIO_API_SECRET    = Deno.env.get("TWILIO_API_SECRET") ?? "";
const TWILIO_TWIML_APP_SID = Deno.env.get("TWILIO_TWIML_APP_SID") ?? "";

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
    const identity = "admin_portal";
    const now = Math.floor(Date.now() / 1000);
    const ttl = 3600; // 1 hour

    const grants: Record<string, unknown> = {
      identity,
    };

    if (TWILIO_TWIML_APP_SID) {
      grants.voice = {
        incoming: { allow: true },
        outgoing: { application_sid: TWILIO_TWIML_APP_SID },
      };
    }

    const payload = {
      jti: `${TWILIO_API_KEY}-${now}`,
      iss: TWILIO_API_KEY,
      sub: TWILIO_ACCOUNT_SID,
      iat: now,
      exp: now + ttl,
      grants,
    };

    const secretBytes = new TextEncoder().encode(TWILIO_API_SECRET);
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const token = await create({ alg: "HS256", typ: "JWT" }, payload, key);

    return new Response(JSON.stringify({ ok: true, token, identity }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  }
});
