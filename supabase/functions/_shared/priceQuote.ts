// ORDERS-PUBLIC-LEAD-UPDATE-POLICY-HARDENING-001 · Phase B
//
// Replaces resolveLegacyQuoteLock() in BOTH charge paths (create-payment-intent
// and create-checkout-session). Those functions each carried their own copy of
// the same defect:
//
//     const { data } = await supabase.from("orders").select("price, ...")
//     out.baseCents = Math.round(data.price * 100);   // <-- charge base
//
// with a comment asserting "the saved price comes from the DB, not the client".
// That premise was false: `orders` grants UPDATE to anon/authenticated and RLS
// cannot restrict columns, so `orders.price` was client-writable. A customer
// could set it on their own unpaid lead and be charged that amount.
//
// The fix is provenance, not a floor: an amount is honoured only when the SERVER
// issued it (public.order_price_quotes, append-only, service-role only). A price
// floor or an allowlist of "known good amounts" would both be unsound, because
// orders.price legitimately holds post-discount and retired amounts across a
// continuous range — a forged value could sit inside that range.
//
// This module never reads orders.price.

export interface QuoteResolution {
  /** Amount to charge, in integer cents. */
  baseCents: number;
  /** Audit label: how the amount was decided. Safe for logs. */
  pricingSource: "trusted_quote" | "current_pricing";
  /** True when a server-issued quote was found and honoured. */
  usedTrustedQuote: boolean;
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };

/**
 * Resolve the charge base for an order.
 *
 * Honours a server-issued quote when one exists (this is what preserves a
 * legitimate retired price for a customer resuming an old lead) — but only when
 * the quote was issued for the SAME pet count, so a changed pet count always
 * reprices. Otherwise
 * falls back to the caller's canonical amount computed from the shared pricing
 * matrix. Never trusts a client-writable column, and never returns a
 * non-positive amount.
 */
export async function resolveTrustedQuote(
  supabase: SupabaseLike,
  confirmationId: string,
  configBaseCents: number,
  petCount?: number | null,
): Promise<QuoteResolution> {
  const canonical: QuoteResolution = {
    baseCents: configBaseCents,
    pricingSource: "current_pricing",
    usedTrustedQuote: false,
  };

  if (!confirmationId) return canonical;

  try {
    // ESA-TWO-PET-129-PRICING-001: when the caller knows the pet count, honour a
    // stored quote ONLY if it was issued for that same count. Without this, a
    // customer quoted at 3 pets ($149) who then removes a pet would resume at
    // the stale $149 instead of the correct $129. Legacy quotes carrying a NULL
    // pet_count are still honoured, so no existing unpaid lead is repriced.
    const { data, error } = typeof petCount === "number"
      ? await supabase.rpc("trusted_price_quote_cents", {
        p_confirmation_id: confirmationId,
        p_pet_count: petCount,
      })
      : await supabase.rpc("trusted_price_quote_cents", {
        p_confirmation_id: confirmationId,
      });
    if (error) return canonical;

    const cents = typeof data === "number" ? data : Number(data);
    // A quote must be a positive integer number of cents. Anything else (null,
    // NaN, 0, negative, fractional) falls back to canonical rather than
    // charging something we cannot justify.
    if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
      return canonical;
    }

    return { baseCents: cents, pricingSource: "trusted_quote", usedTrustedQuote: true };
  } catch {
    // Never let a quote lookup failure change the amount.
    return canonical;
  }
}

/**
 * Record the amount the server just decided to charge, so a later resume of the
 * same order reproduces it exactly. Best-effort: a failure here must never block
 * payment setup, because the canonical amount is already correct.
 */
export async function issueTrustedQuote(
  supabase: SupabaseLike,
  args: {
    confirmationId: string;
    amountCents: number;
    packageKey?: string | null;
    billingPlan?: string | null;
    letterType?: string | null;
    petCount?: number | null;
    pricingVersion: string;
    source: string;
  },
): Promise<void> {
  if (!args.confirmationId) return;
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) return;
  try {
    await supabase.rpc("issue_price_quote", {
      p_confirmation_id: args.confirmationId,
      p_amount_cents: args.amountCents,
      p_package_key: args.packageKey ?? null,
      p_billing_plan: args.billingPlan ?? null,
      p_letter_type: args.letterType ?? null,
      p_pet_count: args.petCount ?? null,
      p_pricing_version: args.pricingVersion,
      p_source: args.source,
    });
  } catch { /* best-effort audit only */ }
}
