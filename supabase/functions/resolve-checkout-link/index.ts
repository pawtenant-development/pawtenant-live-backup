// resolve-checkout-link
//
// ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001
//
// The ONLY public read path for a stable checkout slug. The customer's browser
// POSTs { slug } and gets back the minimum needed to render Secure Checkout.
//
// SECURITY POSTURE
//   • The slug IS the credential, so every failure — malformed, unknown,
//     revoked, or an order that is no longer payable — returns the IDENTICAL
//     `{ ok: false }` body with HTTP 200. This is never an existence oracle and
//     never distinguishes "wrong slug" from "already paid".
//   • Rate limited per IP to blunt slug enumeration. The slug space is ~6.6e11,
//     so a limited attacker cannot walk it.
//   • Assessment answers are NEVER returned — resolve_order_checkout_slug does
//     not select them.
//   • The slug is never logged. Failures log nothing identifying at all.
//   • Referrer-Policy: no-referrer on every response.
//   • No coupon is invented here. `couponCode` is whatever is already saved
//     server-side on the order, or null.
//
// verify_jwt=false: this is opened by a customer clicking a link in an email,
// who has no session yet. Authorisation is the slug itself.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SECURITY = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const SLUG_RE = /^[2-9A-HJ-NP-TV-Z]{8}$/;

/** One generic answer for every failure. Callers cannot tell them apart. */
function unavailable(): Response {
  return new Response(JSON.stringify({ ok: false }), {
    status: 200,
    headers: { ...CORS, ...SECURITY, "Content-Type": "application/json" },
  });
}

// ── Rate limiting: in-memory sliding window, per instance ────────────────────
// Deliberately simple. It is a speed bump against enumeration, not an audit
// surface, so nothing here is persisted and no identifier is logged.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, ...SECURITY } });
  if (req.method !== "POST") return unavailable();

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    if (rateLimited(ip)) return unavailable();

    const body = (await req.json()) as { slug?: string };
    const slug = (body.slug ?? "").trim().toUpperCase();
    if (!SLUG_RE.test(slug)) return unavailable();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin.rpc("resolve_order_checkout_slug", { p_slug: slug });
    if (error || !Array.isArray(data) || data.length === 0) return unavailable();

    const r = data[0] as Record<string, unknown>;

    // Shape the payload for the checkout screen. No assessment answers, no
    // order UUID, no slug echoed back.
    return new Response(
      JSON.stringify({
        ok: true,
        resume: {
          confirmationId: r.confirmation_id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          phone: r.phone,
          state: r.state,
          letterType: r.letter_type,
          packageKey: r.package_key,
          billingPlan: r.billing_plan,
          planType: r.plan_type,
          deliverySpeed: r.delivery_speed,
          price: r.price,
          // Only a coupon already stored on the order survives. Nothing in the
          // URL can introduce one.
          couponCode: r.coupon_code ?? null,
          couponDiscount: r.coupon_discount ?? null,
          otpVerified: r.otp_verified === true,
          // COUNT only — drives multi-pet pricing (1 -> $129, 2-3 -> $149).
          // Without it checkout defaults to one pet and undercharges by $20.
          petCount: Number(r.pet_count ?? 1) || 1,
        },
      }),
      { status: 200, headers: { ...CORS, ...SECURITY, "Content-Type": "application/json" } },
    );
  } catch {
    // Never surface the reason, never log the slug.
    return unavailable();
  }
});
