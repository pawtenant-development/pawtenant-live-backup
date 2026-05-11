// supabase/functions/lead-followup-sequence/index.ts
//
// HTTP handler — public Edge Function endpoint hit by:
//   - Supabase Cron (POST {})                          → run the sequence
//   - Email unsubscribe links (GET ?action=unsubscribe&id=...) → opt the lead out
//   - Admin per-order opt-in/opt-out (POST {action,orderId})    → flip flag
//
// Core sequence-run logic lives in ./core.ts and is also imported directly
// (no HTTP) by ../manual-run-lead-followup-sequence so the admin button does
// not need to coordinate inter-function auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runLeadFollowupSequence,
  buildUnsubscribePage,
  writeAuditLog,
} from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const html = (content: string, status = 200) =>
    new Response(content, { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const now = new Date();

    // ── GET ?action=unsubscribe&id=<orderId> — unsubscribe a single lead ─────
    if (req.method === "GET" && url.searchParams.get("action") === "unsubscribe") {
      const orderId = url.searchParams.get("id");
      if (!orderId) return html(buildUnsubscribePage(false), 400);

      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("id, email, followup_opt_out")
        .eq("id", orderId)
        .maybeSingle();

      if (fetchErr || !order) return html(buildUnsubscribePage(false), 404);

      const { error: updateErr } = await supabase
        .from("orders")
        .update({ followup_opt_out: true, seq_opted_out_at: now.toISOString() })
        .eq("id", orderId);

      if (updateErr) return html(buildUnsubscribePage(false), 500);

      await writeAuditLog(supabase, {
        action: "seq_unsubscribed",
        description: `Lead unsubscribed from follow-up sequence (${order.email})`,
        object_id: orderId,
        metadata: { email: order.email },
      });

      return html(buildUnsubscribePage(true, order.email as string));
    }

    // ── POST {action: "opt_out"|"opt_in", orderId} — per-order opt-in/out ────
    if (req.method === "POST") {
      let body: Record<string, unknown> = {};
      try { body = await req.json() as Record<string, unknown>; } catch { /* empty body = run sequence */ }

      if (body.action === "opt_out" || body.action === "opt_in") {
        const orderId = body.orderId as string;
        if (!orderId) return json({ ok: false, error: "orderId required" }, 400);
        const optOut = body.action === "opt_out";
        const { error } = await supabase
          .from("orders")
          .update({ followup_opt_out: optOut, seq_opted_out_at: optOut ? now.toISOString() : null })
          .eq("id", orderId);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, action: body.action, orderId });
      }
    }

    // ── Default POST path — run the sequence over eligible leads ─────────────
    const result = await runLeadFollowupSequence(supabase);
    return json(result, result.ok ? 200 : 500);
  } catch (err) {
    console.error("[lead-followup-sequence] HTTP handler error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
