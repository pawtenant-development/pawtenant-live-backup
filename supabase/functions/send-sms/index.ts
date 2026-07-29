import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN   = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM_NUMBER  = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// ── PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §16 ─────────────────
// The caller used to hand this function a `sentBy` STRING, which was written
// straight into communications.sent_by. That is a client-supplied actor name —
// anyone able to call the endpoint could claim to be any employee, and an
// automated send looked identical to a human one. `sentBy` is now treated as a
// display hint only and is ignored: the authoritative actor is resolved from the
// caller's JWT, and a caller without a user token is honestly recorded as System
// rather than being attributed to a person.
interface Actor {
  id: string | null;
  name: string;
  role: string;
  type: "employee" | "provider" | "system";
}

async function resolveActor(req: Request): Promise<Actor> {
  const header = req.headers.get("Authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!bearer || bearer === anonKey || bearer === serviceKey) {
    return { id: null, name: "PawTenant System", role: "system", type: "system" };
  }
  try {
    const { data: { user } } = await supabase.auth.getUser(bearer);
    if (!user) return { id: null, name: "PawTenant System", role: "system", type: "system" };
    const { data: prof } = await supabase
      .from("doctor_profiles")
      .select("full_name, role, is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    const p = prof as { full_name?: string; role?: string; is_admin?: boolean } | null;
    return {
      id: user.id,
      name: p?.full_name?.trim() || user.email || "Employee",
      role: p?.role ?? (p?.is_admin ? "admin" : "staff"),
      type: p?.is_admin ? "employee" : "provider",
    };
  } catch {
    return { id: null, name: "PawTenant System", role: "system", type: "system" };
  }
}

/** Last 4 digits only — the audit trail never needs the full number. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
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
    const { orderId, confirmationId, toPhone, message } = await req.json() as {
      orderId?: string;
      confirmationId?: string;
      toPhone: string;
      message: string;
      /** Accepted for backwards compatibility and deliberately IGNORED. */
      sentBy?: string;
    };

    if (!toPhone || !message) {
      return new Response(JSON.stringify({ ok: false, error: "toPhone and message are required" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 400,
      });
    }

    const actor = await resolveActor(req);

    // Normalise phone — ensure E.164 format
    let phone = toPhone.replace(/\D/g, "");
    if (phone.length === 10) phone = "1" + phone;
    if (!phone.startsWith("+")) phone = "+" + phone;

    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const body = new URLSearchParams({
      To: phone,
      From: TWILIO_FROM_NUMBER,
      Body: message,
    });

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

    const twilioData = await twilioRes.json() as { sid?: string; error_message?: string; status?: string };
    const now = new Date().toISOString();
    const delivered = twilioRes.ok;

    const { data: commRow } = await supabase.from("communications").insert({
      order_id: orderId ?? null,
      confirmation_id: confirmationId ?? null,
      type: "sms_outbound",
      direction: "outbound",
      body: message,
      phone_from: TWILIO_FROM_NUMBER,
      phone_to: phone,
      status: delivered ? (twilioData.status ?? "sent") : "failed",
      twilio_sid: delivered ? (twilioData.sid ?? null) : null,
      sent_by: actor.name,
    }).select("id").maybeSingle();

    const commId = (commRow as { id?: string } | null)?.id ?? null;

    // Audit the SEND with the resolved actor. The message body is deliberately
    // NOT duplicated here — `communications` is the authoritative record and the
    // audit row links to it by id (§19).
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      actor_type: actor.type,
      category: "communications",
      source: actor.id ? "admin_portal" : "system",
      object_type: "order",
      object_id: confirmationId ?? orderId ?? null,
      order_id: orderId ?? null,
      entity_type: "communication",
      entity_id: commId,
      communication_id: commId,
      action: "customer_sms_sent",
      description: delivered
        ? `${actor.name} sent an SMS to the customer (${maskPhone(phone)}).`
        : `SMS to the customer (${maskPhone(phone)}) FAILED: ${twilioData.error_message ?? "Twilio error"}`,
      metadata: {
        channel: "sms",
        direction: "outbound",
        recipient_type: "customer",
        recipient_masked: maskPhone(phone),
        delivery_status: delivered ? (twilioData.status ?? "sent") : "failed",
        error: delivered ? null : (twilioData.error_message ?? "Twilio error"),
        confirmation_id: confirmationId ?? null,
        sent_at: now,
      },
    });

    if (!delivered) {
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

    return new Response(JSON.stringify({ ok: true, sid: twilioData.sid, sentBy: actor.name }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  }
});
