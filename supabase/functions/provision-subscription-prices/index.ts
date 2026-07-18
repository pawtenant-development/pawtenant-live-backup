// CHECKOUT-PRICING-LIVE-ROLLOUT-006 · LIVE provisioning
// Idempotent, LIVE provisioning of the eight durable subscription Prices that
// back the phased (first-year -> renewal) subscription model. This is the LIVE
// twin of the TEST provisioner — every livemode rail is INVERTED to require LIVE.
//
// Hard safety rails:
//   • Refuses to run unless STRIPE_SECRET_KEY is a *_live_* key.
//   • Probes Stripe balance.livemode and aborts if livemode === false.
//   • Asserts livemode === true on every created/reused object; aborts and
//     writes nothing if any object is NOT livemode.
//   • Never creates a Price during checkout (this is a standalone admin fn).
//   • Deterministic lookup_keys → re-running creates ZERO duplicates
//     (DB read-through first, then Stripe lookup_key, then create).
//   • Requires a SERVICE-ROLE JWT + the PROVISION_SECRET env value.
//     Ops-only; never called from the app.
//
// Invoke with:  POST /functions/v1/provision-subscription-prices
//   headers: Authorization: Bearer <service_role_jwt>, x-provision-secret: <env PROVISION_SECRET>
//   body (optional): {"dryRun": true}   -> reports plan without creating.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provision-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVISION_SECRET = Deno.env.get("PROVISION_SECRET") ?? "";

function bearerRole(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ─── The canonical eight (owner-approved 2026-07) ─────────────────────────────
// first year:  single $115 / multi $135    renewal:  single $100 / multi $115
interface Target {
  lookup_key: string;
  product: "esa" | "psd";
  tier: "single" | "multi";
  phase: "first_year" | "renewal";
  product_key: string;
  product_name: string;
  unit_amount: number;
}

const TARGETS: Target[] = [
  { lookup_key: "pawtenant_esa_single_first_year_v1", product: "esa", tier: "single", phase: "first_year", product_key: "esa_subscription_single", product_name: "PawTenant ESA Letter — Annual (1 pet)", unit_amount: 11500 },
  { lookup_key: "pawtenant_esa_single_renewal_v1",    product: "esa", tier: "single", phase: "renewal",    product_key: "esa_subscription_single", product_name: "PawTenant ESA Letter — Annual (1 pet)", unit_amount: 10000 },
  { lookup_key: "pawtenant_esa_multi_first_year_v1",  product: "esa", tier: "multi",  phase: "first_year", product_key: "esa_subscription_multi",  product_name: "PawTenant ESA Letter — Annual (2–3 pets)", unit_amount: 13500 },
  { lookup_key: "pawtenant_esa_multi_renewal_v1",     product: "esa", tier: "multi",  phase: "renewal",    product_key: "esa_subscription_multi",  product_name: "PawTenant ESA Letter — Annual (2–3 pets)", unit_amount: 11500 },
  { lookup_key: "pawtenant_psd_single_first_year_v1", product: "psd", tier: "single", phase: "first_year", product_key: "psd_subscription_single", product_name: "PawTenant PSD Letter — Annual (1 dog)", unit_amount: 11500 },
  { lookup_key: "pawtenant_psd_single_renewal_v1",    product: "psd", tier: "single", phase: "renewal",    product_key: "psd_subscription_single", product_name: "PawTenant PSD Letter — Annual (1 dog)", unit_amount: 10000 },
  { lookup_key: "pawtenant_psd_multi_first_year_v1",  product: "psd", tier: "multi",  phase: "first_year", product_key: "psd_subscription_multi",  product_name: "PawTenant PSD Letter — Annual (2–3 dogs)", unit_amount: 13500 },
  { lookup_key: "pawtenant_psd_multi_renewal_v1",     product: "psd", tier: "multi",  phase: "renewal",    product_key: "psd_subscription_multi",  product_name: "PawTenant PSD Letter — Annual (2–3 dogs)", unit_amount: 11500 },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const callerRole = bearerRole(req.headers.get("Authorization"));
  const secretOk = PROVISION_SECRET.length > 0 && req.headers.get("x-provision-secret") === PROVISION_SECRET;
  if (callerRole !== "service_role" || !secretOk) {
    return json({ error: "Forbidden — requires a service-role token and the provisioning secret." }, 403);
  }

  let body: { dryRun?: boolean } = {};
  try { body = (await req.json()) as { dryRun?: boolean }; } catch { /* empty body ok */ }
  const dryRun = body.dryRun === true;

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeSecretKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  // HARD RAIL 1: reject anything that is not a LIVE key before ANY Stripe call.
  if (!stripeSecretKey.includes("_live_")) {
    return json({ error: "Refusing to run: STRIPE_SECRET_KEY is not a *_live_* key. LIVE-only provisioning aborted." }, 400);
  }

  // @ts-ignore esm typing
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // HARD RAIL 2: probe account mode.
    const balance = await stripe.balance.retrieve();
    if (balance.livemode !== true) {
      return json({ error: "Refusing to run: Stripe account reports livemode=false. LIVE-only provisioning aborted." }, 400);
    }

    const productIdByKey: Record<string, string> = {};
    const results: Array<Record<string, unknown>> = [];
    const conflicts: Array<Record<string, unknown>> = [];

    for (const t of TARGETS) {
      let priceId: string | null = null;
      let productId: string | null = null;
      let result: "created" | "reused" | "planned" = "planned";

      // 1) DB read-through — deterministic, independent of Stripe search lag.
      const { data: dbRow } = await supabase
        .from("pricing_stripe_map")
        .select("stripe_price_id, stripe_product_id, unit_amount, livemode")
        .eq("lookup_key", t.lookup_key)
        .maybeSingle();

      if (dbRow?.stripe_price_id) {
        try {
          const existing = await stripe.prices.retrieve(dbRow.stripe_price_id, { expand: ["product"] });
          if (existing && existing.active && existing.livemode === true && existing.unit_amount === t.unit_amount) {
            priceId = existing.id;
            productId = typeof existing.product === "string" ? existing.product : existing.product.id;
            productIdByKey[t.product_key] = productId;
            result = "reused";
          }
        } catch { /* stale row — fall through to Stripe lookup */ }
      }

      // 2) Stripe lookup_key (unique per active price/mode) — reuse if present.
      if (!priceId) {
        const list = await stripe.prices.list({ lookup_keys: [t.lookup_key], active: true, limit: 1, expand: ["data.product"] });
        const found = list.data[0];
        if (found) {
          if (found.livemode !== true) {
            return json({ error: `Abort: price ${found.id} for ${t.lookup_key} is NOT livemode. Nothing written.` }, 400);
          }
          if (found.unit_amount !== t.unit_amount) {
            conflicts.push({ lookup_key: t.lookup_key, existing_price: found.id, existing_amount: found.unit_amount, expected_amount: t.unit_amount });
            results.push({ lookup_key: t.lookup_key, result: "conflict_skipped", price_id: found.id });
            continue;
          }
          priceId = found.id;
          productId = typeof found.product === "string" ? found.product : (found.product as Stripe.Product).id;
          productIdByKey[t.product_key] = productId;
          result = "reused";
        }
      }

      // 3) Create (product first if needed), unless dry run.
      if (!priceId) {
        if (dryRun) {
          results.push({ lookup_key: t.lookup_key, result: "would_create", unit_amount: t.unit_amount, product_key: t.product_key });
          continue;
        }
        productId = productIdByKey[t.product_key] ?? null;
        if (!productId) {
          const product = await stripe.products.create({
            name: t.product_name,
            metadata: { pawtenant_product_key: t.product_key, pawtenant_managed: "true", pricing_version: "v1" },
          });
          if (product.livemode !== true) {
            return json({ error: `Abort: product ${product.id} created NOT livemode. Nothing written.` }, 400);
          }
          productId = product.id;
          productIdByKey[t.product_key] = productId;
        }
        const price = await stripe.prices.create({
          product: productId,
          currency: "usd",
          unit_amount: t.unit_amount,
          recurring: { interval: "year" },
          lookup_key: t.lookup_key,
          transfer_lookup_key: true,
          metadata: {
            pawtenant_lookup_key: t.lookup_key,
            product: t.product,
            tier: t.tier,
            phase: t.phase,
            pricing_version: "v1",
          },
        });
        if (price.livemode !== true) {
          return json({ error: `Abort: price ${price.id} created NOT livemode. Nothing written.` }, 400);
        }
        priceId = price.id;
        result = "created";
      }

      // Persist mapping (skip on dry run).
      if (!dryRun && priceId && productId) {
        const nowIso = new Date().toISOString();
        await supabase.from("pricing_stripe_map").upsert({
          lookup_key: t.lookup_key,
          product: t.product,
          package: "standard",
          tier: t.tier,
          phase: t.phase,
          stripe_price_id: priceId,
          stripe_product_id: productId,
          unit_amount: t.unit_amount,
          currency: "usd",
          bill_interval: "year",
          livemode: true,
          last_result: result,
          provisioned_at: nowIso,
          updated_at: nowIso,
        }, { onConflict: "lookup_key" });
      }

      results.push({
        lookup_key: t.lookup_key,
        result,
        price_id: priceId,
        product_id: productId,
        unit_amount: t.unit_amount,
        livemode: true,
      });
    }

    return json({
      ok: true,
      dryRun,
      livemode: true,
      account_livemode: balance.livemode,
      created: results.filter((r) => r.result === "created").length,
      reused: results.filter((r) => r.result === "reused").length,
      conflicts,
      prices: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[provision-subscription-prices] error:", message);
    return json({ error: message }, 500);
  }
});
