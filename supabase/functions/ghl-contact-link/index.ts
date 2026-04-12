import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let body: {
    confirmationId?: string;
    contact_id?: string;
    contact_email?: string;
    contact_phone?: string;
  };

  try {
    body = await req.json();
  } catch {
    console.error("[ghl-contact-link] Failed to parse request body");
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const { confirmationId, contact_id, contact_email, contact_phone } = body;

  // Validate required fields
  if (!confirmationId || !contact_id) {
    console.error("[ghl-contact-link] Missing required fields", { confirmationId, contact_id });
    return new Response(
      JSON.stringify({ ok: false, error: "confirmationId and contact_id are required" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  console.log("[ghl-contact-link] Received request", {
    confirmationId,
    contact_id,
    contact_email: contact_email ?? "(not provided)",
    contact_phone: contact_phone ?? "(not provided)",
  });

  // Init Supabase with service role key
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Find the order by confirmation_id
  const { data: order, error: findError } = await supabase
    .from("orders")
    .select("id, confirmation_id, ghl_contact_id")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (findError) {
    console.error("[ghl-contact-link] DB lookup error", findError.message);
    return new Response(
      JSON.stringify({ ok: false, error: "Database error during lookup", detail: findError.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  if (!order) {
    console.warn("[ghl-contact-link] Order not found for confirmationId:", confirmationId);
    return new Response(
      JSON.stringify({ ok: false, error: "Order not found", confirmationId }),
      { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  console.log("[ghl-contact-link] Found order", {
    orderId: order.id,
    existingGhlContactId: order.ghl_contact_id ?? "(none)",
    newContactId: contact_id,
  });

  // Update ghl_contact_id on the order
  const { error: updateError } = await supabase
    .from("orders")
    .update({ ghl_contact_id: contact_id })
    .eq("id", order.id);

  if (updateError) {
    console.error("[ghl-contact-link] Failed to update order", updateError.message);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to update order", detail: updateError.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  console.log("[ghl-contact-link] Successfully linked contact", {
    orderId: order.id,
    confirmationId,
    contact_id,
  });

  return new Response(
    JSON.stringify({ ok: true, confirmationId, contact_id }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
