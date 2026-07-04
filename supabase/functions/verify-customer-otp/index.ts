// verify-customer-otp — checks the 6-digit code from send-customer-otp and,
// on success, creates/links the customer account shell and returns a
// best-effort one-time session token so the browser can establish a session.
//
// On a correct code we:
//   1. Delete the code (single use).
//   2. Ensure a Supabase auth user exists for the email (create a passwordless
//      shell with email_confirm:true if not — no password required before
//      payment; the customer sets one post-payment via the existing portal
//      welcome email). Never creates a duplicate.
//   3. Back-link any unpaid orders with this email to that user_id.
//   4. Generate a magic-link hashed_token so the client can log the customer
//      in (optional; the flow proceeds to checkout even if this fails).
//
// Brute-force protection: max 6 attempts per issued code, then the code is
// invalidated and a new one must be requested. Expired codes are rejected.
//
// verify_jwt disabled (public flow, anon key). No code or secret is echoed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function randomPassword(): string {
  // A long random password the customer never sees or uses. They set their own
  // via the post-payment portal welcome (recovery) email.
  const a = crypto.getRandomValues(new Uint8Array(24));
  return "Pt!" + Array.from(a, (b) => b.toString(36)).join("") + "9Z";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as { email?: string; code?: string; confirmationId?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const code = (body.code ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "A valid email is required" }, 400);
    if (!/^\d{6}$/.test(code)) return json({ ok: false, error: "Enter the 6-digit code from your email." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: row } = await admin
      .from("customer_otp_codes")
      .select("id, code, attempts, expires_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return json({ ok: false, error: "No active code. Please request a new one." }, 400);

    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      await admin.from("customer_otp_codes").delete().eq("id", row.id);
      return json({ ok: false, expired: true, error: "That code expired. Please request a new one." }, 400);
    }

    if ((row.attempts as number) >= MAX_ATTEMPTS) {
      await admin.from("customer_otp_codes").delete().eq("id", row.id);
      return json({ ok: false, tooManyAttempts: true, error: "Too many attempts. Please request a new code." }, 429);
    }

    if (String(row.code) !== code) {
      await admin.from("customer_otp_codes").update({ attempts: (row.attempts as number) + 1 }).eq("id", row.id);
      const remaining = MAX_ATTEMPTS - ((row.attempts as number) + 1);
      return json({ ok: false, error: remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : "Too many attempts. Please request a new code." }, 400);
    }

    // ── Correct code ──────────────────────────────────────────────────────
    await admin.from("customer_otp_codes").delete().eq("id", row.id);

    // 1) Ensure an auth user exists (passwordless shell). Look up by email.
    let userId: string | null = null;
    let accountCreated = false;
    try {
      const { data: found } = await admin.rpc("admin_find_auth_user_by_email", { p_email: email });
      // RPC returns a row with the user id when present.
      const foundId = Array.isArray(found) ? found[0]?.id : (found as { id?: string } | null)?.id;
      if (foundId) userId = foundId as string;
    } catch { /* RPC optional — fall through to listUsers below */ }

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
      });
      if (created?.user?.id) {
        userId = created.user.id;
        accountCreated = true;
      } else if (createErr) {
        // Likely already exists (race / RPC unavailable). Find via listUsers.
        try {
          const { data: list } = await admin.auth.admin.listUsers();
          const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
          if (match?.id) userId = match.id;
        } catch { /* non-fatal */ }
      }
    }

    // 2) Back-link unpaid orders with this email to the user.
    if (userId) {
      try {
        await admin.from("orders").update({ user_id: userId })
          .ilike("email", email)
          .is("user_id", null);
      } catch { /* non-fatal */ }
    }

    // 3) Best-effort session token for the browser (magic link, not emailed).
    let sessionToken: string | null = null;
    try {
      const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      // deno-lint-ignore no-explicit-any
      sessionToken = (link as any)?.properties?.hashed_token ?? null;
    } catch { /* non-fatal — checkout proceeds without an auto-session */ }

    return json({ ok: true, verified: true, accountLinked: !!userId, accountCreated, sessionToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[verify-customer-otp] error:", msg);
    return json({ ok: false, error: "Server error. Please try again." }, 500);
  }
});
