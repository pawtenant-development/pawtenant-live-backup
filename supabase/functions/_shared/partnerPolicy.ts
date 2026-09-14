// _shared/partnerPolicy.ts
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001
//
// THE central gate for partner orders. Every question of the form
//   "may PawTenant do <customer-facing thing> for this order?"
// is answered here and nowhere else.
//
// WHY THIS IS ONE MODULE AND NOT SCATTERED CHECKS
// The brief is explicit: do not rely on scattered checks for the literal Rapid
// name. A check like `if (order.partner_name === "Rapid")` fails the moment a
// second partner exists, and a check like `if (order.partner_id)` silently
// treats "policy column is NULL" as "no restriction". Both failure modes send a
// real customer a real email.
//
// So the contract here is the opposite: callers ask a QUESTION and get a
// DECISION, and an order whose policy cannot be established is REFUSED, never
// waved through. There is exactly one place to audit.
//
// FAIL-CLOSED IS THE WHOLE POINT
//   * order_origin = 'partner' + a known policy   -> that policy applies.
//   * order_origin = 'partner' + missing/unknown  -> REFUSE. We do not guess.
//   * order_origin = 'direct'                     -> historical behaviour,
//                                                    completely unchanged.
//   * order_origin missing entirely (a projection
//     that forgot to select it)                   -> REFUSE, because we cannot
//                                                    prove it is a direct order.
//
// That last case matters more than it looks. A caller that selects a narrow
// column list and forgets order_origin would otherwise get "direct" by
// omission — which is precisely how a partner order would end up receiving a
// PawTenant-branded letter and a customer email.

/** Communication policy values. Mirrors partner_policy_vocabulary. */
export type CommunicationPolicy = "pawtenant_managed" | "partner_managed";

/** Document policy values. Mirrors partner_policy_vocabulary. */
export type DocumentPolicy = "pawtenant_branded" | "partner_neutral";

export type OrderOrigin = "direct" | "partner";

const COMMUNICATION_POLICIES: readonly string[] = ["pawtenant_managed", "partner_managed"];
const DOCUMENT_POLICIES: readonly string[] = ["pawtenant_branded", "partner_neutral"];

/**
 * The minimum an order row must carry for a policy decision. Any caller that
 * cannot supply these three columns cannot get a decision — by design.
 */
export interface PolicyBearingOrder {
  order_origin?: string | null;
  partner_communication_policy?: string | null;
  partner_document_policy?: string | null;
  // Optional, only used to make refusal messages actionable.
  id?: string | null;
  confirmation_id?: string | null;
}

/** The columns every call site MUST select before asking for a decision. */
export const PARTNER_POLICY_COLUMNS =
  "order_origin, partner_id, partner_communication_policy, partner_document_policy";

export class PartnerPolicyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PartnerPolicyError";
    this.code = code;
  }
}

export interface PolicyDecision {
  origin: OrderOrigin;
  communication: CommunicationPolicy;
  document: DocumentPolicy;
  /** True when PawTenant must send the customer NOTHING. */
  suppressCustomerCommunication: boolean;
  /** True when PawTenant branding/QR/verification must NOT be applied. */
  neutralDocuments: boolean;
  /** Honest, non-PHI explanation suitable for logs and audit rows. */
  reason: string;
}

function orderRef(order: PolicyBearingOrder): string {
  return order.confirmation_id ?? order.id ?? "unknown-order";
}

/**
 * Resolve the effective policy for an order, or THROW.
 *
 * Throwing rather than returning a default is deliberate: the caller is about
 * to send an email or stamp a QR code, and "I could not determine the policy"
 * must abort that action loudly, not proceed with an assumption.
 */
export function resolveOrderPolicy(order: PolicyBearingOrder | null | undefined): PolicyDecision {
  if (!order) {
    throw new PartnerPolicyError(
      "policy_order_missing",
      "partner policy: no order supplied; refusing to assume a direct order",
    );
  }

  const origin = (order.order_origin ?? "").trim();

  // An absent order_origin means the caller's projection did not select it. We
  // cannot prove this is a direct order, so we refuse instead of defaulting.
  if (!origin) {
    throw new PartnerPolicyError(
      "policy_origin_unknown",
      `partner policy: order ${orderRef(order)} was read without order_origin; ` +
        `select ${PARTNER_POLICY_COLUMNS} before requesting a policy decision`,
    );
  }

  if (origin === "direct") {
    return {
      origin: "direct",
      communication: "pawtenant_managed",
      document: "pawtenant_branded",
      suppressCustomerCommunication: false,
      neutralDocuments: false,
      reason: "direct PawTenant order — historical behaviour, unchanged",
    };
  }

  if (origin !== "partner") {
    throw new PartnerPolicyError(
      "policy_origin_unrecognised",
      `partner policy: order ${orderRef(order)} has an unrecognised order_origin; refusing to guess`,
    );
  }

  const comm = (order.partner_communication_policy ?? "").trim();
  const doc = (order.partner_document_policy ?? "").trim();

  if (!COMMUNICATION_POLICIES.includes(comm)) {
    throw new PartnerPolicyError(
      "policy_communication_unknown",
      `partner policy: order ${orderRef(order)} has a missing or unknown communication policy; ` +
        "refusing to contact the customer",
    );
  }
  if (!DOCUMENT_POLICIES.includes(doc)) {
    throw new PartnerPolicyError(
      "policy_document_unknown",
      `partner policy: order ${orderRef(order)} has a missing or unknown document policy; ` +
        "refusing to produce or brand a document",
    );
  }

  return {
    origin: "partner",
    communication: comm as CommunicationPolicy,
    document: doc as DocumentPolicy,
    suppressCustomerCommunication: comm === "partner_managed",
    neutralDocuments: doc === "partner_neutral",
    reason: `partner order — communication=${comm}, document=${doc}`,
  };
}

/**
 * Non-throwing variant for call sites that must degrade safely rather than
 * crash — but which still must NOT proceed. The returned decision is the
 * MAXIMALLY RESTRICTIVE one, so an unreadable policy suppresses everything.
 *
 * Use this only where an exception would break an unrelated flow; prefer
 * resolveOrderPolicy() so the failure is visible.
 */
export function resolveOrderPolicySafe(
  order: PolicyBearingOrder | null | undefined,
): PolicyDecision {
  try {
    return resolveOrderPolicy(order);
  } catch (e) {
    const code = e instanceof PartnerPolicyError ? e.code : "policy_unavailable";
    return {
      origin: "partner",
      communication: "partner_managed",
      document: "partner_neutral",
      suppressCustomerCommunication: true,
      neutralDocuments: true,
      reason: `policy could not be determined (${code}) — failing closed: no customer contact, no branding`,
    };
  }
}

// ── Question helpers ────────────────────────────────────────────────────────
// Named after what the CALLER wants to do, so a call site reads as a sentence
// and a reviewer can see the intent without opening this file.

/**
 * May PawTenant send this order's CUSTOMER an email / SMS / portal invite /
 * review request / renewal / recovery message?
 *
 * Throws when the policy is unknown — the caller must not send.
 */
export function mayContactCustomer(order: PolicyBearingOrder): boolean {
  return !resolveOrderPolicy(order).suppressCustomerCommunication;
}

/**
 * May PawTenant stamp its QR / verification ID / footer / logo on this order's
 * documents, and issue a public letter_verifications record for it?
 */
export function mayApplyPawTenantBranding(order: PolicyBearingOrder): boolean {
  return !resolveOrderPolicy(order).neutralDocuments;
}

/**
 * May PawTenant deliver documents through its own customer portal?
 * Partner-managed delivery means the partner hands the document to the
 * customer; we never do.
 */
export function mayDeliverViaCustomerPortal(order: PolicyBearingOrder): boolean {
  return !resolveOrderPolicy(order).suppressCustomerCommunication;
}

/**
 * Internal staff notifications, authorized provider-assignment notifications,
 * partner status events and clinical exception alerts remain permitted for
 * partner orders — they are not customer-facing. This helper exists so the
 * distinction is explicit at the call site rather than implied.
 */
export function mayNotifyInternalStaff(_order: PolicyBearingOrder): boolean {
  return true;
}

/**
 * Whether this order's economics may be shown to a PROVIDER.
 *
 * Always false for partner orders: the wholesale rate, the partner's retail
 * price and the Zeek margin must never reach a provider surface. The provider
 * sees their own earning (from doctor_earnings) and nothing else.
 */
export function mayShowOrderValueToProvider(order: PolicyBearingOrder): boolean {
  return resolveOrderPolicy(order).origin === "direct";
}

/**
 * Neutral operational label for provider-facing surfaces. Partner-origin work
 * is LABELLED, not hidden: concealing it would defeat the contractual
 * authorization a provider agreement must give, which is tracked as a
 * production blocker.
 */
export function providerFacingOriginLabel(order: PolicyBearingOrder): string | null {
  return resolveOrderPolicySafe(order).origin === "partner" ? "Partner Case" : null;
}
