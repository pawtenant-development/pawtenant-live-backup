
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function html(body: string) {
  return new Response(body, {
    status: 200,
    headers: { ...CORS, "Content-Type": "text/html" },
  });
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const OWNER_EMAIL = "hamzaengr94@gmail.com";
  const TEMP_PASSWORD = "PawTenant2026!";

  // Check if already exists
  const { data: existing } = await supabase.auth.admin.listUsers();
  const alreadyExists = existing?.users?.find((u) => u.email === OWNER_EMAIL);

  if (alreadyExists) {
    const { data: existingProfile } = await supabase
      .from("doctor_profiles")
      .select("id, is_admin")
      .eq("user_id", alreadyExists.id)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from("doctor_profiles").insert({
        user_id: alreadyExists.id,
        full_name: "Hamza (Owner)",
        email: OWNER_EMAIL,
        is_admin: true,
        is_active: true,
        licensed_states: [],
      });
    } else if (!existingProfile.is_admin) {
      await supabase.from("doctor_profiles").update({ is_admin: true }).eq("id", existingProfile.id);
    }

    return html(`<h2 style="font-family:sans-serif;color:green">&#10003; Admin access confirmed for ${OWNER_EMAIL}. You can close this tab and log in.</h2>`);
  }

  // Create new auth user
  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: TEMP_PASSWORD,
    email_confirm: true,
  });

  if (createErr || !newUser?.user) {
    return html(`<h2 style="font-family:sans-serif;color:red">Error: ${createErr?.message ?? "Failed to create user"}</h2>`);
  }

  const { error: profileErr } = await supabase.from("doctor_profiles").insert({
    user_id: newUser.user.id,
    full_name: "Hamza (Owner)",
    email: OWNER_EMAIL,
    is_admin: true,
    is_active: true,
    licensed_states: [],
  });

  if (profileErr) {
    return html(`<h2 style="font-family:sans-serif;color:orange">User created but profile failed: ${profileErr.message}</h2>`);
  }

  return html(`<h2 style="font-family:sans-serif;color:green">&#10003; Owner admin account created! Email: ${OWNER_EMAIL} | Temp password: ${TEMP_PASSWORD}</h2><p style="font-family:sans-serif">Log in at /customer-login then change your password.</p>`);
});
