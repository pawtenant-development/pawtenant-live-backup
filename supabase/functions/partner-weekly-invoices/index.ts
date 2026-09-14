// partner-weekly-invoices
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// Scheduled job: one weekly Stripe invoice per ENABLED partner, on that
// partner's own weekday and hour in America/New_York.
//
// SAFETY PROPERTIES
//   * Runs for a partner ONLY when its billing profile is active, has a billing
//     email and a Stripe Customer, and weekly sending was explicitly enabled by
//     an admin. The database CHECK makes a half-configured partner impossible.
//   * The billing period key is the New York ISO week. `partner_invoices` has a
//     unique index on (partner_id, billing_period_key), and
//     `partner_prepare_invoice` returns the EXISTING invoice for a period
//     instead of making a second one — so a retry, an overlapping run or a
//     double schedule cannot duplicate an invoice.
//   * One invoice per partner. Partners and currencies are never mixed: the
//     candidate query groups by partner, and `partner_prepare_invoice` refuses
//     mixed currencies outright.
//   * A Stripe failure for one partner leaves that partner's draft invoice for
//     an admin to retry or void, and does not stop the other partners.
//   * Audit rows carry ids, counts and amounts. No customer or health data.
//
// AUTH: `verify_jwt = false` — pg_cron calls this without a user session. The
// real gate is the `x-partner-invoice-secret` header, verified INSIDE the
// database against the vault (the payout-cron pattern). A bare anon key gets
// nothing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAndSendStripeInvoice, type PreparedInvoice } from "../_shared/partnerStripeInvoice.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-partner-invoice-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

interface Candidate {
  partner_id: string;
  partner_name: string;
  billing_email: string;
  stripe_customer_id: string | null;
  currency: string;
  payment_terms_days: number;
  billing_period_key: string;
  period_start: string;
  period_end: string;
  order_ids: string[];
  total_cents: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "Server not configured" });

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  const secret = req.headers.get("x-partner-invoice-secret") ?? "";
  const { data: okSecret } = await service.rpc("verify_partner_invoice_cron_secret", { p_secret: secret });
  if (okSecret !== true) return json(401, { ok: false, error: "unauthorized" });

  if (!stripeKey) return json(500, { ok: false, error: "Stripe is not configured" });

  // `dry_run` lets an operator see exactly which partners are due without
  // creating anything.
  let body: { dry_run?: boolean } = {};
  try { body = (await req.json()) as { dry_run?: boolean }; } catch { /* no body is fine */ }

  const { data: candidatesRaw, error: candErr } = await service.rpc("partner_weekly_invoice_candidates");
  if (candErr) return json(500, { ok: false, error: candErr.message });
  const candidates = (candidatesRaw ?? []) as Candidate[];

  if (body.dry_run) {
    return json(200, {
      ok: true, dry_run: true,
      due: candidates.map((c) => ({
        partner_id: c.partner_id, partner_name: c.partner_name,
        period: c.billing_period_key, order_count: c.order_ids.length, total_cents: c.total_cents,
      })),
    });
  }

  const results: Record<string, unknown>[] = [];

  for (const c of candidates) {
    try {
      const { data: preparedRaw, error: prepErr } = await service.rpc("partner_prepare_invoice", {
        p_partner_id: c.partner_id,
        p_order_ids: c.order_ids,
        p_source: "weekly",
        p_billing_period_key: c.billing_period_key,
        p_period_start: c.period_start,
        p_period_end: c.period_end,
        p_due_days: c.payment_terms_days,
      });
      if (prepErr) throw new Error(prepErr.message);
      const prepared = preparedRaw as PreparedInvoice;

      // The period already produced an invoice — this run is a retry, not a
      // second billing. Nothing further to do.
      if (prepared.already_existed) {
        results.push({
          partner_id: c.partner_id, period: c.billing_period_key,
          outcome: "already_invoiced", invoice_number: prepared.invoice_number,
        });
        continue;
      }

      const sent = await createAndSendStripeInvoice({
        stripeKey,
        prepared,
        billingEmail: c.billing_email,
        legalName: c.partner_name,
        currency: prepared.currency ?? c.currency,
        dueDays: c.payment_terms_days,
        existingCustomerId: c.stripe_customer_id,
      });

      const { error: attachErr } = await service.rpc("partner_attach_stripe_invoice", {
        p_invoice_id: prepared.invoice_id,
        p_stripe_customer_id: sent.stripe_customer_id,
        p_stripe_invoice_id: sent.stripe_invoice_id,
        p_stripe_invoice_number: sent.stripe_invoice_number,
        p_hosted_url: sent.hosted_invoice_url,
        p_stripe_status: sent.stripe_status,
        p_idempotency_key: sent.idempotency_key,
      });
      if (attachErr) throw new Error(`sent but not recorded: ${attachErr.message}`);

      results.push({
        partner_id: c.partner_id, period: c.billing_period_key, outcome: "invoiced",
        invoice_number: prepared.invoice_number, order_count: c.order_ids.length,
        total_cents: prepared.total_cents,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // One partner's failure never touches another's. The draft invoice stays
      // for an admin, and the audit row says what happened without PHI.
      results.push({ partner_id: c.partner_id, period: c.billing_period_key, outcome: "failed", error: message });
      await service.from("audit_logs").insert({
        actor_type: "system", actor_name: "partner-weekly-invoices", actor_role: "system",
        object_type: "partner_platform", object_id: c.partner_id,
        action: "partner_weekly_invoice_failed", entity_type: "partner_invoice", entity_id: c.billing_period_key,
        category: "partner_finance", source: "partner-weekly-invoices",
        metadata: { partner_id: c.partner_id, period: c.billing_period_key, order_count: c.order_ids.length, error: message },
      }).then(() => {}, () => {});
    }
  }

  return json(200, { ok: true, considered: candidates.length, results });
});
