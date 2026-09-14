// _shared/partnerDocumentGate.ts
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 5
//
// ONE function, used by every PawTenant-branding / QR / footer / verification
// entry point, so that "may we stamp this?" is asked in exactly one voice.
//
// WHY A HELPER AND NOT FOUR INLINE CHECKS
// Four call sites re-implementing "select the columns, resolve the policy, decide
// what to do when the read fails" is four chances to get the failure branch
// subtly wrong — and the failure branch is the entire point of the gate. The
// dangerous mistake is not forgetting the check, it is writing
// `if (order?.order_origin === "partner") refuse;`, which waves through exactly
// the row whose projection forgot to select order_origin.
//
// So this helper OWNS the read as well as the decision. A caller hands over an
// order id, never a pre-fetched row, and therefore cannot under-select the
// columns the policy needs.
//
// THIS IS THE CHEAP, AUDITABLE ARM. The authoritative one is the database:
// trg_letter_verifications_partner_isolation refuses the verification record
// itself. This gate exists so a partner order is refused BEFORE a PDF is
// downloaded, parsed, stamped and uploaded — not to be the only thing standing
// between a partner order and PawTenant branding.

import { PARTNER_POLICY_COLUMNS, type PolicyDecision, resolveOrderPolicy } from "./partnerPolicy.ts";

export interface BrandingGateResult {
  /** True only when PawTenant branding / QR / footer / verification may proceed. */
  allowed: boolean;
  /** Machine-readable refusal code, null when allowed. */
  reason: string | null;
  /** Non-PHI explanation suitable for logs, audit rows and API responses. */
  detail: string;
  /** The resolved decision, when one could be resolved at all. */
  decision: PolicyDecision | null;
}

/** Refusal code returned when a partner order is correctly classified and excluded. */
export const PARTNER_NEUTRAL_REFUSAL = "partner_document_policy_neutral";
/** Refusal code returned when the order's policy could not be established at all. */
export const PARTNER_POLICY_UNRESOLVED = "partner_policy_unresolved";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

/**
 * May PawTenant apply its branding, QR, footer or verification identity to this
 * order's documents?
 *
 * Fails closed in every direction: an unreadable order, an order that does not
 * exist, an unrecognised origin and an unknown partner policy all return
 * allowed=false. The ONLY input is the order id — the caller cannot supply a
 * row, so it cannot supply an under-selected one.
 */
export async function mayBrandOrderDocuments(
  supabase: AnyClient,
  orderId: string | null | undefined,
): Promise<BrandingGateResult> {
  if (!orderId) {
    return {
      allowed: false,
      reason: PARTNER_POLICY_UNRESOLVED,
      detail: "no order id supplied; refusing to assume a direct order",
      decision: null,
    };
  }

  const { data, error } = await supabase
    .from("orders")
    .select(`id, confirmation_id, ${PARTNER_POLICY_COLUMNS}`)
    .eq("id", orderId)
    .maybeSingle();

  // A read failure is NOT permission to proceed. This is the branch an inline
  // check gets wrong: `if (error) { /* carry on */ }` brands a partner order.
  if (error || !data) {
    return {
      allowed: false,
      reason: PARTNER_POLICY_UNRESOLVED,
      detail: error
        ? `order policy could not be read (${error.message}); refusing to brand a document`
        : "order not found; refusing to brand a document",
      decision: null,
    };
  }

  try {
    const decision = resolveOrderPolicy(data);
    if (decision.neutralDocuments) {
      return {
        allowed: false,
        reason: PARTNER_NEUTRAL_REFUSAL,
        detail:
          "partner-origin order with a neutral document policy — no PawTenant branding, QR, footer or verification record",
        decision,
      };
    }
    return { allowed: true, reason: null, detail: decision.reason, decision };
  } catch (e) {
    const code = e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "policy_unavailable";
    return {
      allowed: false,
      reason: PARTNER_POLICY_UNRESOLVED,
      detail: `order policy could not be determined (${code}); refusing to brand a document`,
      decision: null,
    };
  }
}
