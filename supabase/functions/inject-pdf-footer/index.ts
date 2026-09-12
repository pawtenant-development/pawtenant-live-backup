// inject-pdf-footer
// LETTER-PORTAL-ID-NO-QR-001: retired. The endpoint keeps its existing admin-only
// authorization boundary, then refuses all stamping without reading or writing a PDF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ ok: false, error: "Unauthorized — no token provided" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (token === SERVICE_ROLE_KEY) {
    return json({
      ok: false,
      error: "Unauthorized — the service-role key is not an accepted credential. An admin employee session is required.",
    }, 403);
  }

  const { data: userResp, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userResp?.user) return json({ ok: false, error: "Unauthorized — invalid token" }, 401);

  const { data: callerProfile } = await supabase.from("doctor_profiles")
    .select("is_admin, is_active").eq("user_id", userResp.user.id).maybeSingle();
  const caller = callerProfile as { is_admin?: boolean; is_active?: boolean } | null;
  if (!caller || caller.is_admin !== true || caller.is_active === false) {
    return json({ ok: false, error: "Forbidden — admin privileges are required." }, 403);
  }

  return json({
    ok: false,
    retired: true,
    reason: "pdf_verification_stamping_retired",
    error: "Verification IDs are available in the customer portal; letters are delivered without embedded IDs or QR codes.",
  }, 410);
});

