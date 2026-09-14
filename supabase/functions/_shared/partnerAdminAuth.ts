// Partner Platform admin authorization for edge functions.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 extracted the
// probe `partner-manual-intake` already used, so every admin-only partner
// function gates the same way instead of each rewriting it.
//
// THE TWO RULES THIS ENCODES
//
//   1. `verify_jwt = true` IS NOT AUTHORIZATION. The project's PUBLIC anon key
//      is a valid project JWT and satisfies the gateway on its own. Every
//      function must therefore run its own caller check, and this one refuses
//      the anon key and the service-role key by value before doing anything
//      else (GOOGLE-ADS-SYNC-INVOCATION-AUTHORIZATION-001).
//
//   2. The CALLER'S OWN JWT must satisfy `public.is_chat_admin()`. The service
//      role bypasses RLS, so asking the service client whether "the user" is an
//      admin would always answer yes; the probe is therefore executed through a
//      client carrying the caller's bearer and the anon key
//      (SUPABASE-SERVICE-ROLE-KEY-AMBIGUITY).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AdminActor {
  id: string;
  email: string | null;
  bearer: string;
}

export type AdminAuthResult =
  | { ok: true; actor: AdminActor; service: SupabaseClient }
  | { ok: false; status: number; code: string; error: string };

export function partnerServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false }, db: { schema: "public" } },
  );
}

export async function requirePartnerPlatformAdmin(req: Request): Promise<AdminAuthResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return { ok: false, status: 500, code: "not_configured", error: "Server not configured" };
  }

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  // A project key is not a person. Refusing by value keeps a leaked anon key —
  // which is public by design — from reaching an admin capability.
  if (!bearer || bearer === SERVICE_ROLE_KEY || bearer === ANON_KEY) {
    return { ok: false, status: 401, code: "unauthenticated", error: "Admin sign-in required" };
  }

  const service = partnerServiceClient();
  const { data: userResp, error: userErr } = await service.auth.getUser(bearer);
  if (userErr || !userResp?.user) {
    return { ok: false, status: 401, code: "unauthenticated", error: "Admin sign-in required" };
  }

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc("is_chat_admin");
  if (adminErr || isAdmin !== true) {
    return { ok: false, status: 403, code: "forbidden", error: "Partner Platform admin access required" };
  }

  return {
    ok: true,
    actor: { id: userResp.user.id, email: userResp.user.email ?? null, bearer },
    service,
  };
}

export const PARTNER_ADMIN_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function partnerJson(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PARTNER_ADMIN_CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
