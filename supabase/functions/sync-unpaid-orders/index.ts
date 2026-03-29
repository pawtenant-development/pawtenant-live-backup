import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  // Fetch all orders that are missing payment_intent_id — these are the broken ones
  const { data: unpaidOrders, error: fetchErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, status, payment_intent_id, price, created_at")
    .is("payment_intent_id", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (fetchErr) return json({ error: fetchErr.message }, 500);
  if (!unpaidOrders || unpaidOrders.length === 0) return json({ ok: true, synced: 0, message: "All orders already have payment_intent_id — nothing to sync" });

  const results: { confirmationId: string; synced: boolean; paymentIntentId?: string; error?: string }[] = [];

  for (const order of unpaidOrders) {
    const confirmationId = order.confirmation_id as string;
    try {
      // Search Stripe payment intents by confirmationId in metadata
      const search = await stripe.paymentIntents.search({
        query: `metadata["confirmationId"]:"${confirmationId}" AND status:"succeeded"`,
        limit: 1,
      });

      if (search.data.length === 0) {
        results.push({ confirmationId, synced: false, error: "No succeeded payment found in Stripe" });
        continue;
      }

      const pi = search.data[0];
      const piId = pi.id;
      const priceInDollars = Math.round((pi.amount ?? 0) / 100);

      // Fetch receipt URL from charge
      let receiptUrl = "";
      try {
        if (pi.latest_charge) {
          const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as { id: string }).id;
          const charge = await stripe.charges.retrieve(chargeId);
          receiptUrl = charge.receipt_url ?? "";
        }
      } catch { /* ignore */ }

      // Update order in Supabase
      const { error: updateErr } = await supabase.from("orders").update({
        payment_intent_id: piId,
        price: priceInDollars || (order.price as number),
        status: (order.status === "lead" || !order.status) ? "processing" : (order.status as string),
      }).eq("id", order.id as string);

      if (updateErr) {
        results.push({ confirmationId, synced: false, error: updateErr.message });
      } else {
        results.push({ confirmationId, synced: true, paymentIntentId: piId });
        console.log(`[SYNC] Fixed order ${confirmationId} → ${piId} receipt: ${receiptUrl}`);
      }
    } catch (err: unknown) {
      results.push({ confirmationId, synced: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const syncedCount = results.filter((r) => r.synced).length;
  return json({ ok: true, synced: syncedCount, total: unpaidOrders.length, results });
});
