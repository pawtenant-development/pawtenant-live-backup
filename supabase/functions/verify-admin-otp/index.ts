import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json() as { email: string; otp: string; challenge?: boolean };
    const { email, otp, challenge = false } = body;
    if (!email || !otp) return json({ ok: false, error: "Email and OTP are required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find the profile
    const { data: profile, error: profileErr } = await adminClient
      .from("doctor_profiles")
      .select("id, full_name, user_id, is_admin, is_active, role, email")
      .ilike("email", email.trim())
      .maybeSingle();

    console.log("[verify-admin-otp] Profile lookup:", { email: email.trim(), found: !!profile, profileErr });

    if (!profile || !profile.is_admin || !profile.is_active) {
      return json({ ok: false, error: "Invalid credentials" }, 401);
    }

    const otpKey = `otp_${profile.id}`;

    // Retrieve stored OTP
    const { data: otpRecord, error: otpErr } = await adminClient
      .from("admin_notification_prefs")
      .select("email_override, per_notif_emails")
      .eq("user_id", profile.id)
      .eq("notification_key", otpKey)
      .maybeSingle();

    console.log("[verify-admin-otp] OTP record lookup:", {
      user_id: profile.id,
      notification_key: otpKey,
      found: !!otpRecord,
      has_code: !!otpRecord?.email_override,
      otpErr,
    });

    if (!otpRecord || !otpRecord.email_override) {
      return json({ ok: false, error: "No OTP found. Please request a new code." }, 401);
    }

    // Check expiry
    const expiresAt = otpRecord.per_notif_emails?.[0];
    if (expiresAt && new Date(expiresAt) < new Date()) {
      await adminClient
        .from("admin_notification_prefs")
        .delete()
        .eq("user_id", profile.id)
        .eq("notification_key", otpKey);
      console.log("[verify-admin-otp] OTP expired for:", email.trim());
      return json({ ok: false, error: "OTP has expired. Please request a new code." }, 401);
    }

    // Verify OTP
    const submittedCode = otp.trim();
    const storedCode = otpRecord.email_override.trim();

    console.log("[verify-admin-otp] Code comparison:", {
      submitted_length: submittedCode.length,
      stored_length: storedCode.length,
      match: submittedCode === storedCode,
    });

    if (storedCode !== submittedCode) {
      return json({ ok: false, error: "Invalid code. Please check and try again." }, 401);
    }

    // OTP is valid — delete it (one-time use)
    await adminClient
      .from("admin_notification_prefs")
      .delete()
      .eq("user_id", profile.id)
      .eq("notification_key", otpKey);

    console.log("[verify-admin-otp] OTP verified and consumed for:", email.trim());

    // For device challenge mode: the user is already signed in via password.
    // Just confirm the OTP is valid — the frontend handles session + device trust.
    if (challenge) {
      return json({
        ok: true,
        verified: true,
        profile: {
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          email: profile.email,
        },
      });
    }

    // Legacy path (non-challenge): generate magic link for session
    if (!profile.user_id) {
      return json({ ok: false, error: "No auth account linked to this profile." }, 401);
    }

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: email.trim(),
      options: {
        redirectTo: `${supabaseUrl.replace("https://", "https://")}/auth/v1/callback`,
      },
    });

    if (linkErr || !linkData) {
      console.error("[verify-admin-otp] generateLink error:", linkErr);
      return json({ ok: false, error: "Failed to create session. Please try again." }, 500);
    }

    const raw = linkData as unknown as Record<string, unknown>;
    const props = raw["properties"] as Record<string, string> | undefined;
    const actionLink = props?.["action_link"] ?? "";

    let token = "";
    try {
      const url = new URL(actionLink);
      token = url.searchParams.get("token") ?? "";
    } catch {
      console.error("[verify-admin-otp] Could not parse action link:", actionLink);
    }

    if (!token) {
      return json({ ok: false, error: "Failed to generate sign-in token." }, 500);
    }

    return json({
      ok: true,
      token,
      action_link: actionLink,
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        email: profile.email,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[verify-admin-otp] Unexpected error:", msg);
    return json({ ok: false, error: `Server error: ${msg}` }, 500);
  }
});
