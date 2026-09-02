// resolve-continue-assessment
//
// PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001
//
// Exchanges an opaque Continue-Assessment slug for the order identity the PSD
// form needs, the SERVER's verdict on whether the assessment is complete, and a
// freshly minted write credential.
//
// WHY A SEPARATE ROUTE FROM /checkout/<slug>
// ------------------------------------------
// The stable checkout link exists to take a COMPLETED order to payment. Sending
// an incomplete assessment down it is what created the trap this task exists to
// fix: the customer landed on checkout, could not reach the questions, and a
// step-2 resubmit wrote blanks over their intake. Routing is therefore decided
// HERE, by the server, from the authoritative answer rows:
//
//     incomplete        -> continue_assessment
//     complete + unpaid -> resume_checkout
//
// The client is told which journey it is on; it does not get to choose.
//
// CREDENTIAL SPLIT
// ----------------
// The slug in the URL is a READ capability — it names an order and nothing more.
// The WRITE credential is generated in this call and returned in the response
// body, so it never enters a URL, a history entry, a referrer header or a
// server log. Clinical answers are NOT returned here; they come from the
// authenticated `load` action using that write credential.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SECURITY = {
  // A page holding mental-health intake must not be cached or referred onward.
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** One shape for every failure — unknown, revoked, paid, malformed. */
function notFound(): Response {
  return new Response(JSON.stringify({ ok: false }), {
    status: 404, headers: { ...CORS, ...SECURITY, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, ...SECURITY } });
  if (req.method !== "POST") return notFound();

  let body: { slug?: string };
  try { body = await req.json(); } catch { return notFound(); }

  const slug = String(body.slug ?? "").trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-TV-Z]{12}$/.test(slug)) return notFound();

  // Mint the write credential up front so the RPC can bind it atomically with
  // the resolve — there is no window where a slug resolves without one.
  const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data, error } = await supabase.rpc("resolve_assessment_continue_slug", {
    p_slug: slug,
    p_token_hash: await sha256Hex(rawToken),
  });

  if (error || !data) return notFound();

  const r = data as Record<string, unknown>;
  return new Response(
    JSON.stringify({
      ok: true,
      // The server's routing decision. The client renders what it is told.
      route: r.route,
      assessmentToken: rawToken,
      order: {
        confirmationId: r.confirmation_id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
        state: r.state,
        letterType: r.letter_type,
        packageKey: r.package_key,
        deliverySpeed: r.delivery_speed,
        pets: r.pets,
        dob: r.dob,
        // Paid-incomplete PSD orders may finish clinical questions, but this
        // flag keeps the client out of lead upsert and payment entirely.
        alreadyPaid: r.already_paid === true,
      },
      // Counts and missing question IDs only — never answer values.
      status: r.status,
    }),
    { status: 200, headers: { ...CORS, ...SECURITY, "Content-Type": "application/json" } },
  );
});
