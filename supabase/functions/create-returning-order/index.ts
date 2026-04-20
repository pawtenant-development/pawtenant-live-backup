import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function newConfirmationId(): string {
  // Matches client format: `PT-<base36 timestamp>`
  return `PT-${Date.now().toString(36).toUpperCase()}-R${Math.floor(Math.random() * 1000).toString(36).toUpperCase()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { parentOrderId?: string; action?: "upgrade" | "repeat" };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const parentOrderId = (body.parentOrderId ?? "").trim();
  const action = body.action;
  if (!parentOrderId) return json({ error: "parentOrderId is required" }, 400);
  if (action !== "upgrade" && action !== "repeat") return json({ error: "action must be 'upgrade' or 'repeat'" }, 400);

  // ── Auth: caller must be admin OR owner of parent order (by email match) ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!callerToken) return json({ error: "Missing Authorization bearer token" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await admin.auth.getUser(callerToken);
  const callerUser = userData?.user;
  if (userErr || !callerUser) return json({ error: "Invalid or expired auth token" }, 401);

  // Load parent order (service-role: bypass RLS)
  const { data: parent, error: parentErr } = await admin
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, phone, state, letter_type, assessment_answers, payment_intent_id, paid_at, status, selected_provider, user_id")
    .eq("id", parentOrderId)
    .maybeSingle();

  if (parentErr || !parent) return json({ error: "Parent order not found" }, 404);

  // Parent must actually be paid — refuse to spawn children off an unpaid lead
  const parentPaid = !!(parent.payment_intent_id || parent.paid_at);
  if (!parentPaid) return json({ error: "Parent order is not paid" }, 400);

  // Admin check
  const { data: callerProfile } = await admin
    .from("doctor_profiles")
    .select("role, is_admin")
    .eq("user_id", callerUser.id)
    .maybeSingle();
  const isAdmin =
    callerProfile?.is_admin === true ||
    ["owner", "admin_manager", "support"].includes((callerProfile?.role as string) ?? "");

  // Customer check: email on parent matches authed user's email (case-insensitive)
  const callerEmail = (callerUser.email ?? "").trim().toLowerCase();
  const parentEmail = ((parent.email as string) ?? "").trim().toLowerCase();
  const isOwner = !!callerEmail && callerEmail === parentEmail;

  if (!isAdmin && !isOwner) {
    return json({ error: "Forbidden — you do not own this order" }, 403);
  }

  // ── Insert child order ────────────────────────────────────────────────────
  const confirmationId = newConfirmationId();
  const planType = action === "upgrade" ? "Subscription (Annual)" : "One-Time Purchase";

  const { error: insertErr } = await admin.from("orders").insert({
    confirmation_id: confirmationId,
    parent_order_id: parent.id,
    user_id: parent.user_id ?? null,
    status: "lead",
    letter_type: parent.letter_type ?? "esa",
    email: parent.email,
    first_name: parent.first_name,
    last_name: parent.last_name,
    phone: parent.phone,
    state: parent.state,
    plan_type: planType,
    assessment_answers: parent.assessment_answers ?? {},
    // Inherit preferred provider for repeat flows; admins can change in Step 3.
    selected_provider: action === "repeat" ? parent.selected_provider ?? null : null,
  });

  if (insertErr) {
    console.error("[create-returning-order] insert failed:", insertErr.message);
    return json({ error: insertErr.message }, 500);
  }

  console.info(
    `[create-returning-order] ${action} spawned ${confirmationId} from parent ${parent.confirmation_id} by ${isAdmin ? "admin" : "owner"} ${callerUser.email}`,
  );

  return json({ ok: true, confirmationId, action, parentOrderId: parent.id });
});
