import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Batch insert ─────────────────────────────────────────────────────────────
async function batchInsert(
  supabase: ReturnType<typeof createClient>,
  payloads: Record<string, unknown>[]
): Promise<{ inserted: number; errors: { email: string; error: string }[] }> {
  const CHUNK = 50;
  let inserted = 0;
  const errors: { email: string; error: string }[] = [];

  for (let i = 0; i < payloads.length; i += CHUNK) {
    const chunk = payloads.slice(i, i + CHUNK);
    const { error } = await supabase.from("orders").insert(chunk);
    if (error) {
      for (const p of chunk) {
        const { error: singleErr } = await supabase.from("orders").insert(p);
        if (singleErr) {
          if (singleErr.code === "23505") {
            errors.push({ email: String(p.email), error: "__DUPLICATE__" });
          } else {
            errors.push({ email: String(p.email), error: singleErr.message });
          }
        } else {
          inserted++;
        }
      }
    } else {
      inserted += chunk.length;
    }
  }
  return { inserted, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json() as {
      rows?: Record<string, unknown>[];
      test_mode?: boolean;
    };

    const { rows: preRows, test_mode = false } = body;

    if (!preRows || preRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "No rows received." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalParsed = preRows.length;
    console.log(`[legacy-import] Received ${totalParsed} pre-mapped rows, test_mode=${test_mode}`);

    const rows = test_mode ? preRows.slice(0, 5) : preRows;

    // ── Duplicate detection ──────────────────────────────────────────────────
    const allEmails = rows.map(r => String(r.email ?? "")).filter(e => e.includes("@"));
    const allConfIds = rows.map(r => String(r.confirmation_id ?? ""));

    const { data: existingLive } = await supabase
      .from("orders")
      .select("email, confirmation_id")
      .in("email", allEmails)
      .eq("historical_import", false);

    const liveEmails = new Set((existingLive ?? []).map((o: { email: string }) => o.email?.toLowerCase()));

    const { data: existingLegacy } = await supabase
      .from("orders")
      .select("confirmation_id")
      .in("confirmation_id", allConfIds);

    const legacyConfIds = new Set((existingLegacy ?? []).map((o: { confirmation_id: string }) => o.confirmation_id));

    console.log(`[legacy-import] Live conflicts: ${liveEmails.size}, already-imported: ${legacyConfIds.size}`);

    // ── Build insert list ────────────────────────────────────────────────────
    const toInsert: Record<string, unknown>[] = [];
    const results: {
      row: number; email: string; confirmation_id: string;
      action: "queued" | "skipped" | "error" | "inserted"; reason?: string;
    }[] = [];
    let skippedCount = 0;
    const preErrors: { row: number; email: string; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const email = String(row.email ?? "").toLowerCase().trim();
      const confirmationId = String(row.confirmation_id ?? "");

      if (!email || !email.includes("@")) {
        preErrors.push({ row: rowNum, email: email || "(blank)", error: "Invalid or missing email" });
        results.push({ row: rowNum, email: email || "(blank)", confirmation_id: confirmationId, action: "error", reason: "Invalid email" });
        continue;
      }
      if (liveEmails.has(email)) {
        skippedCount++;
        results.push({ row: rowNum, email, confirmation_id: confirmationId, action: "skipped", reason: "Live order already exists for this email" });
        continue;
      }
      if (legacyConfIds.has(confirmationId)) {
        skippedCount++;
        results.push({ row: rowNum, email, confirmation_id: confirmationId, action: "skipped", reason: "Already imported" });
        continue;
      }

      toInsert.push(row);
      results.push({ row: rowNum, email, confirmation_id: confirmationId, action: "queued" });
    }

    console.log(`[legacy-import] Queued ${toInsert.length}, skipped ${skippedCount}, pre-errors ${preErrors.length}`);

    const { inserted, errors: insertErrors } = await batchInsert(supabase, toInsert);

    let extraSkipped = 0;
    const finalErrors: { row: number; email: string; error: string }[] = [...preErrors];

    for (const ie of insertErrors) {
      if (ie.error === "__DUPLICATE__") {
        extraSkipped++;
        const idx = results.findIndex(r => r.email === ie.email && r.action === "queued");
        if (idx >= 0) results[idx] = { ...results[idx], action: "skipped", reason: "Duplicate key" };
      } else {
        const idx = results.findIndex(r => r.email === ie.email && r.action === "queued");
        if (idx >= 0) results[idx] = { ...results[idx], action: "error", reason: ie.error };
        finalErrors.push({ row: 0, email: ie.email, error: ie.error });
      }
    }

    for (const r of results) {
      if ((r.action as string) === "queued") (r as { action: string }).action = "inserted";
    }

    const finalSkipped = skippedCount + extraSkipped;
    const finalErrorCount = finalErrors.length;

    console.log(`[legacy-import] Done: inserted=${inserted}, skipped=${finalSkipped}, errors=${finalErrorCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        test_mode,
        total_parsed: totalParsed,
        rows_processed: rows.length,
        success_count: inserted,
        skipped_count: finalSkipped,
        error_count: finalErrorCount,
        errors: finalErrors,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[legacy-import] Fatal error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
