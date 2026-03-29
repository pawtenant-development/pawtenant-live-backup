import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { user_ids } = await req.json() as { user_ids: string[] };

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, pending_ids: [] }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userIdSet = new Set(user_ids);
    const pendingIds: string[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error || !data?.users?.length) {
        hasMore = false;
        break;
      }
      for (const u of data.users) {
        if (userIdSet.has(u.id) && !u.email_confirmed_at) {
          pendingIds.push(u.id);
        }
      }
      if (data.users.length < 1000) hasMore = false;
      page++;
    }

    return new Response(JSON.stringify({ ok: true, pending_ids: pendingIds }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
