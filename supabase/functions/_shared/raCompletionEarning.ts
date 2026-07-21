// raCompletionEarning — canonical, idempotent reconciliation for the provider's
// Reasonable-Accommodation COMPLETION payout on a COMBO order.
// PROVIDER-EARNINGS-RA-DOUBLE-PAYOUT-001.
//
// Business rule: a combo order (ESA/PSD + Reasonable Accommodation) bundles a
// SECOND piece of professional work — the completed Housing Accommodation / RA
// form — at no extra customer charge. When the assigned provider COMPLETES that
// RA work, they earn a second payout equal to their normal per-order rate
// (doctor_profiles.per_order_rate) — a separate 'ra_completion' row in the
// existing doctor_earnings ledger, so it flows through every existing reader.
//
// This is the SINGLE decision point. The pure predicate (isRaCompletionEligible)
// and amount (raCompletionAmount) are exported with NO imports so the guard
// (scripts/check-provider-ra-earnings.mjs) can transpile + assert them, and the
// DB-side ensureRaCompletionEarning is safe to call from every authoritative
// event (provider RA submission, admin repair, historical backfill).
//
// NOT altered here: the standalone Additional Documentation add-on
// (earning_type 'additional_documentation') keeps its own payment-triggered
// mechanism (completeAdditionalDocPayment.ensureAddonEarning). This module only
// closes the combo gap.

// ── Pure eligibility ────────────────────────────────────────────────────────
// A combo order earns the RA-completion payout ONLY when ALL hold:
//   1. it is a combo (includes_reasonable_accommodation_letter OR ra bundle key),
//   2. the RA workflow is COMPLETED (additional_documentation_status='completed')
//      — a provider-only state; customer uploads set 'uploaded'/'in_review', not
//      this, so the extra payout never fires on a blank/under-review upload,
//   3. the base consultation was actually paid (canonical payment fields), and
//   4. a provider is assigned (the one credited with the work).
// It is NEVER inferred from customer price, coupon, $159/$179, or document count.

export const RA_COMBO_PACKAGE_KEYS = new Set(["esa_ra_bundle", "psd_ra_bundle"]);

export interface RaEarningOrderFacts {
  includes_reasonable_accommodation_letter?: boolean | null;
  package_key?: string | null;
  additional_documentation_status?: string | null;
  doctor_user_id?: string | null;
  payment_intent_id?: string | null;
  paid_at?: string | null;
}

export type RaEligibilityReason =
  | "eligible"
  | "not_combo"
  | "ra_not_completed"
  | "base_unpaid"
  | "no_provider";

export function isRaCombo(o: RaEarningOrderFacts): boolean {
  return o.includes_reasonable_accommodation_letter === true ||
    RA_COMBO_PACKAGE_KEYS.has((o.package_key ?? "").trim());
}

export function isRaCompletionEligible(
  o: RaEarningOrderFacts,
): { eligible: boolean; reason: RaEligibilityReason } {
  if (!isRaCombo(o)) return { eligible: false, reason: "not_combo" };
  if ((o.additional_documentation_status ?? "") !== "completed") {
    return { eligible: false, reason: "ra_not_completed" };
  }
  const baseIsPaid = !!o.payment_intent_id || !!o.paid_at;
  if (!baseIsPaid) return { eligible: false, reason: "base_unpaid" };
  if (!o.doctor_user_id) return { eligible: false, reason: "no_provider" };
  return { eligible: true, reason: "eligible" };
}

// RA-completion payout = the provider's STANDARD per-order rate (same as base).
// Never the customer price / Stripe charge / bundle price. null when the rate is
// unset (row is created with a null amount and the earnings panel prompts to set
// it, exactly like base/add-on).
export function raCompletionAmount(perOrderRate: number | null | undefined): number | null {
  return perOrderRate ?? null;
}

// ── DB-side reconciliation (idempotent) ─────────────────────────────────────
// Loosely typed client (no esm.sh import) so this file stays transpile-clean for
// the Node guard. Callers pass their existing service-role Supabase client.
type MinimalClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export interface EnsureRaCompletionResult {
  created: boolean;
  reason:
    | "created"
    | "race_dedup"
    | "already_exists"
    | "no_order"
    | RaEligibilityReason
    | "insert_error"
    | "exception";
}

// ensureRaCompletionEarning — record ONE provider RA-completion payout for a
// combo order whose RA work is completed. Idempotent on three levels:
//   1. eligibility gate (combo + completed + base paid + provider),
//   2. skip when an RA-completion earning already exists for this order,
//   3. the partial UNIQUE index doctor_earnings_ra_completion_order_uniq makes a
//      racing double-insert fail at the DB (caught + treated as success).
// Amount = provider per-order rate AT completion time. Credits order.doctor_user_id
// (the assigned provider who performed the work); reassignment keeps the historical
// credit on the row that was already created.
export async function ensureRaCompletionEarning(
  supabase: MinimalClient,
  orderId: string,
): Promise<EnsureRaCompletionResult> {
  try {
    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, confirmation_id, includes_reasonable_accommodation_letter, package_key, additional_documentation_status, doctor_user_id, doctor_name, doctor_email, state, first_name, last_name, price, payment_intent_id, paid_at",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return { created: false, reason: "no_order" };

    const gate = isRaCompletionEligible(order as RaEarningOrderFacts);
    if (!gate.eligible) {
      return { created: false, reason: gate.reason };
    }

    // Already recorded? (cheap pre-check before the unique-index backstop)
    const { data: existing } = await supabase
      .from("doctor_earnings")
      .select("id")
      .eq("order_id", orderId)
      .eq("earning_type", "ra_completion")
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();
    if (existing) return { created: false, reason: "already_exists" };

    const doctorUserId = (order.doctor_user_id as string) ?? null;

    // Provider's per-order rate AT THE TIME this earning is created.
    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("per_order_rate, full_name, email")
      .eq("user_id", doctorUserId)
      .maybeSingle();
    const rate = raCompletionAmount((profile?.per_order_rate as number | null) ?? null);

    const patientName = [order.first_name, order.last_name]
      .filter((p: unknown) => !!p && String(p).trim())
      .join(" ")
      .trim() || null;

    const { error: insertErr } = await supabase.from("doctor_earnings").insert({
      doctor_user_id: doctorUserId,
      doctor_name: (order.doctor_name as string) ?? profile?.full_name ?? null,
      doctor_email: (order.doctor_email as string) ?? profile?.email ?? null,
      order_id: orderId,
      confirmation_id: (order.confirmation_id as string) ?? null,
      patient_name: patientName,
      patient_state: (order.state as string) ?? null,
      order_amount: (order.price as number | null) ?? null,
      doctor_amount: rate,
      status: "pending",
      earning_type: "ra_completion",
      notes: rate == null
        ? "Reasonable Accommodation completion payout — rate not set; set the provider's per-order rate in the Providers tab"
        : "Reasonable Accommodation completion payout (provider per-order rate)",
    });

    if (insertErr) {
      // 23505 = unique_violation on the partial index → another run won the race.
      if ((insertErr as { code?: string }).code === "23505") return { created: false, reason: "race_dedup" };
      console.warn(`[raCompletionEarning] insert failed for order ${orderId}:`, insertErr.message);
      return { created: false, reason: "insert_error" };
    }
    console.info(`[raCompletionEarning] ✓ RA-completion earning recorded for ${order.confirmation_id ?? orderId} (rate=${rate})`);
    return { created: true, reason: "created" };
  } catch (e) {
    console.warn(`[raCompletionEarning] ensureRaCompletionEarning threw for ${orderId}:`, e instanceof Error ? e.message : String(e));
    return { created: false, reason: "exception" };
  }
}
