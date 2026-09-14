// _shared/partnerCommsGate.ts
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 6
//
// ONE function, used by every server-side path that is about to contact an
// order's CUSTOMER — email, SMS, GHL contact/workflow sync, payment link,
// ad-platform identity push — so that "may PawTenant contact this customer?"
// is asked in exactly one voice.
//
// WHY THIS OWNS THE READ (same contract as partnerDocumentGate)
// A caller hands over an order reference, never a pre-fetched row, so it
// cannot under-select the policy columns. The dangerous mistake is not a
// missing check, it is `if (order?.order_origin === "partner") skip;`, which
// waves through exactly the row whose projection forgot order_origin.
//
// FAIL-CLOSED IN EVERY DIRECTION
//   * order resolves + direct                     -> allowed.
//   * order resolves + partner, pawtenant_managed -> allowed (policy decides,
//                                                    never the partner name).
//   * order resolves + partner, partner_managed   -> refused.
//   * order resolves + unknown/missing policy     -> refused.
//   * order cannot be read / does not exist       -> refused. An order we
//     cannot classify must not be contacted; the classification universe is
//     rows in `orders`, and "not found" means we cannot prove it is direct.
//   * no reference supplied                       -> refused.
//
// The refusal is a DECISION, not an error: callers must treat it as a normal,
// audited outcome (Rapid owns these customers' communications), never as a
// failed send, and must not mark any communication row "sent" or "failed"
// for a message that was deliberately never composed.

import { PARTNER_POLICY_COLUMNS, type PolicyDecision, resolveOrderPolicy } from "./partnerPolicy.ts";

/** Refusal code when the order is a correctly classified partner-managed case. */
export const PARTNER_COMMS_REFUSAL = "partner_policy_suppressed";
/** Refusal code when the order's policy could not be established at all. */
export const PARTNER_COMMS_UNRESOLVED = "partner_policy_unresolved";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface CustomerContactRef {
  orderId?: string | null;
  confirmationId?: string | null;
}

export interface CustomerContactGateResult {
  /** True only when PawTenant may contact this order's customer. */
  allowed: boolean;
  /** PARTNER_COMMS_REFUSAL | PARTNER_COMMS_UNRESOLVED, null when allowed. */
  reason: string | null;
  /** Non-PHI explanation suitable for logs, audit rows and API responses. */
  detail: string;
  /** The resolved decision, when one could be resolved at all. */
  decision: PolicyDecision | null;
  /** Resolved identifiers, for the caller's audit row. */
  orderId: string | null;
  confirmationId: string | null;
}

function refuse(
  reason: string,
  detail: string,
  extra: Partial<CustomerContactGateResult> = {},
): CustomerContactGateResult {
  return {
    allowed: false, reason, detail, decision: null,
    orderId: null, confirmationId: null, ...extra,
  };
}

/**
 * May PawTenant send this order's CUSTOMER an email / SMS / GHL sync /
 * payment link / lifecycle message?
 *
 * The ONLY inputs are order identifiers — the caller cannot supply a row, so
 * it cannot supply an under-selected one, and a forged request payload cannot
 * change the classification: the decision comes from the database row.
 */
export async function mayContactCustomerForOrder(
  supabase: AnyClient,
  ref: CustomerContactRef | null | undefined,
): Promise<CustomerContactGateResult> {
  const orderId = ref?.orderId?.trim?.() ? ref.orderId!.trim() : null;
  const confirmationId = ref?.confirmationId?.trim?.() ? ref.confirmationId!.trim() : null;

  if (!orderId && !confirmationId) {
    return refuse(
      PARTNER_COMMS_UNRESOLVED,
      "no order reference supplied; refusing to assume a direct order",
    );
  }

  let query = supabase
    .from("orders")
    .select(`id, confirmation_id, ${PARTNER_POLICY_COLUMNS}`);
  query = orderId ? query.eq("id", orderId) : query.eq("confirmation_id", confirmationId);
  const { data, error } = await query.maybeSingle();

  // A read failure is NOT permission to proceed — that is the branch an
  // inline check gets wrong: `if (error) { /* carry on */ }` emails a partner
  // customer the moment the read hiccups.
  if (error || !data) {
    return refuse(
      PARTNER_COMMS_UNRESOLVED,
      error
        ? `order policy could not be read (${error.message}); refusing to contact the customer`
        : "order not found; refusing to contact the customer",
    );
  }

  const ids = {
    orderId: (data as { id?: string }).id ?? null,
    confirmationId: (data as { confirmation_id?: string }).confirmation_id ?? null,
  };

  try {
    const decision = resolveOrderPolicy(data);
    if (decision.suppressCustomerCommunication) {
      return refuse(
        PARTNER_COMMS_REFUSAL,
        "partner-managed order — the partner owns all customer communication; PawTenant sends nothing",
        { decision, ...ids },
      );
    }
    return { allowed: true, reason: null, detail: decision.reason, decision, ...ids };
  } catch (e) {
    const code = e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "policy_unavailable";
    return refuse(
      PARTNER_COMMS_UNRESOLVED,
      `order policy could not be determined (${code}); refusing to contact the customer`,
      ids,
    );
  }
}

/**
 * Structured, PHI-free audit record for a communication that the partner
 * policy suppressed. Deliberately records the CHANNEL and the EVENT, never
 * the recipient address, never the message body — the suppression itself is
 * the fact worth keeping, not the message we refused to compose.
 *
 * Never throws: the suppression must hold even when the audit insert fails.
 */
export async function auditSuppressedCustomerContact(
  supabase: AnyClient,
  opts: {
    orderId?: string | null;
    confirmationId?: string | null;
    /** email | sms | ghl | meta_capi | payment_link */
    channel: string;
    /** e.g. provider_assigned_customer, doctor_assigned, checkout_recovery */
    event: string;
    /** the emitting function, e.g. assign-doctor */
    source: string;
    /** PARTNER_COMMS_REFUSAL | PARTNER_COMMS_UNRESOLVED */
    reason: string;
  },
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: null,
      actor_name: "PawTenant System",
      actor_role: "system",
      actor_type: "system",
      category: "communication",
      source: opts.source,
      object_type: "order",
      object_id: opts.confirmationId ?? opts.orderId ?? "unknown-order",
      order_id: opts.orderId ?? null,
      action: "partner_policy_suppressed",
      description:
        `Customer ${opts.channel} (${opts.event}) was not sent: partner communication policy (${opts.reason}).`,
      metadata: {
        channel: opts.channel,
        event: opts.event,
        reason: opts.reason,
        confirmation_id: opts.confirmationId ?? null,
      },
    });
  } catch (e) {
    console.warn(
      "[partnerCommsGate] suppression audit insert failed (suppression still holds):",
      e instanceof Error ? e.message : String(e),
    );
  }
}

// ─── PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 ─────────────────────────
//
// IDENTITY-scoped gate, for the flows that carry NO order reference: customer
// portal sign-in codes, password resets, account creation, ad-hoc SMS to a
// phone number, broadcast recipients without a confirmation id.
//
// Rule: if ANY partner-managed order carries this email or phone, PawTenant
// must not contact the identity. A customer who is both a direct customer and
// a partner's customer is AMBIGUOUS, and ambiguity fails closed — an operator
// who really needs to reach a direct order's customer uses an order-scoped
// action, which decides on that order's row instead.

export interface CustomerIdentityRef {
  email?: string | null;
  phone?: string | null;
}

function phoneDigits(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export async function mayContactCustomerIdentity(
  supabase: AnyClient,
  ref: CustomerIdentityRef | null | undefined,
): Promise<CustomerContactGateResult> {
  const email = (ref?.email ?? "").trim().toLowerCase();
  const phone = phoneDigits(ref?.phone);
  if (!email && phone.length < 7) {
    return refuse(PARTNER_COMMS_UNRESOLVED, "no customer identity supplied; refusing to assume a direct customer");
  }

  const arms: string[] = [];
  if (email) arms.push(`email.ilike.${JSON.stringify(email)}`);
  if (phone.length >= 7) arms.push(`phone.ilike.%${phone.slice(-4)}%`);

  const { data, error } = await supabase
    .from("orders")
    .select(`id, confirmation_id, email, phone, ${PARTNER_POLICY_COLUMNS}`)
    .eq("order_origin", "partner")
    .or(arms.join(","))
    .limit(50);

  if (error) {
    return refuse(
      PARTNER_COMMS_UNRESOLVED,
      `partner identity check failed (${error.message}); refusing to contact the customer`,
    );
  }

  const rows = (data ?? []) as Array<{ id: string; confirmation_id: string; email?: string | null; phone?: string | null }>;
  const hit = rows.find((r) =>
    (email && (r.email ?? "").trim().toLowerCase() === email) ||
    (phone.length >= 7 && phoneDigits(r.phone) === phone),
  );
  if (!hit) {
    return { allowed: true, reason: null, detail: "no partner-managed order carries this identity", decision: null, orderId: null, confirmationId: null };
  }
  return {
    allowed: false,
    reason: PARTNER_COMMS_REFUSAL,
    detail: "this customer belongs to a partner-managed order; the partner owns customer communication",
    decision: null,
    orderId: hit.id,
    confirmationId: hit.confirmation_id,
  };
}

/** Identity gate + audit row on refusal, in one call. */
export async function gateCustomerContactIdentity(
  supabase: AnyClient,
  ref: CustomerIdentityRef | null | undefined,
  audit: { channel: string; event: string; source: string },
): Promise<CustomerContactGateResult> {
  const result = await mayContactCustomerIdentity(supabase, ref);
  if (!result.allowed) {
    await auditSuppressedCustomerContact(supabase, {
      orderId: result.orderId,
      confirmationId: result.confirmationId,
      channel: audit.channel,
      event: audit.event,
      source: audit.source,
      reason: result.reason ?? PARTNER_COMMS_UNRESOLVED,
    });
  }
  return result;
}

/**
 * Convenience: resolve the gate and, when refused, write the audit row in one
 * call. Most emitters want exactly this.
 */
export async function gateCustomerContact(
  supabase: AnyClient,
  ref: CustomerContactRef | null | undefined,
  audit: { channel: string; event: string; source: string },
): Promise<CustomerContactGateResult> {
  const result = await mayContactCustomerForOrder(supabase, ref);
  if (!result.allowed) {
    await auditSuppressedCustomerContact(supabase, {
      orderId: result.orderId ?? ref?.orderId ?? null,
      confirmationId: result.confirmationId ?? ref?.confirmationId ?? null,
      channel: audit.channel,
      event: audit.event,
      source: audit.source,
      reason: result.reason ?? PARTNER_COMMS_UNRESOLVED,
    });
  }
  return result;
}
