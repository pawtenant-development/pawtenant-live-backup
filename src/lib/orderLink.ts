// COMMS-CUSTOMER-ORDER-AUTO-LINKING
// Thin client wrapper around the admin-only `admin_find_order_for_contact` RPC.
// Resolves the single best-matching order for a chat / email / contact record
// using deterministic identifiers (confirmation_id > session > email > phone).
// The RPC is admin-gated server-side, so this is safe to call from admin
// surfaces only; non-admins receive null. Never throws.

import { supabase } from "./supabaseClient";
import {
  orderWorkflowState,
  orderPaymentState,
  isStalePaymentFailure,
  type LifecycleOrder,
} from "./orderLifecycle";
import { isPartialRefund, isFullRefund } from "./orderClassification";

/**
 * The linked-order projection. Extends LifecycleOrder so the CANONICAL
 * classifier can consume it directly — the fields below the identity block are
 * exactly what orderWorkflowState() / orderPaymentState() read, and they are
 * returned by the `admin_find_order_for_contact(s)` RPCs as of migration
 * 20260820120000. Dropping any of them silently degrades the classification
 * rather than failing, which is why they live in the type rather than being
 * spread in at the call site.
 */
export interface LinkedOrder extends LifecycleOrder {
  match_basis: "confirmation_id" | "session" | "email" | "phone" | null;
  confidence: "high" | "medium" | "low" | null;
  match_count: number;
  id: string;
  confirmation_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  status: string | null;
  doctor_status: string | null;
  doctor_name: string | null;
  letter_type: string | null;
  plan_type: string | null;
  paid_at: string | null;
  payment_intent_id: string | null;
  created_at: string;
  // ── canonical-lifecycle inputs (migration 20260820120000) ──
  doctor_email: string | null;
  doctor_user_id: string | null;
  refund_status: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  dispute_id: string | null;
  payment_failed_at: string | null;
  payment_failure_reason: string | null;
  official_letter_reopened_at: string | null;
  official_letter_final_completed_at: string | null;
}

export interface FindOrderArgs {
  email?: string | null;
  phone?: string | null;
  sessionId?: string | null;
  confirmationId?: string | null;
}

/**
 * Returns the best-matching order for the given identifiers, or null when
 * nothing matches / caller is not an admin / the lookup fails. Soft-fails by
 * design so it can never break a chat / contact surface.
 */
export async function findOrderForContact(args: FindOrderArgs): Promise<LinkedOrder | null> {
  const { email, phone, sessionId, confirmationId } = args;
  if (!email && !phone && !sessionId && !confirmationId) return null;
  try {
    const { data, error } = await supabase.rpc("admin_find_order_for_contact", {
      p_email: email ?? null,
      p_phone: phone ?? null,
      p_session_id: sessionId ?? null,
      p_confirmation_id: confirmationId ?? null,
    });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as LinkedOrder | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export interface ContactKey {
  id: string;
  email?: string | null;
  phone?: string | null;
}

const normEmail = (e: string) => e.trim().toLowerCase();
const phoneDigits = (p: string) => p.replace(/\D/g, "").slice(-10);

/**
 * Batched best-match lookup for many contacts in a single round-trip (avoids
 * N+1 when enriching a list). Returns a Map keyed by the caller's contact id.
 * Email match (high) is preferred over phone match (medium). Soft-fails to an
 * empty Map (non-admin / error). Admin-gated server-side.
 */
export async function findOrdersForContacts(contacts: ContactKey[]): Promise<Map<string, LinkedOrder>> {
  const out = new Map<string, LinkedOrder>();
  const emails = Array.from(new Set(contacts.map((c) => c.email).filter((v): v is string => !!v)));
  const phones = Array.from(new Set(contacts.map((c) => c.phone).filter((v): v is string => !!v)));
  if (emails.length === 0 && phones.length === 0) return out;
  try {
    const { data, error } = await supabase.rpc("admin_find_orders_for_contacts", {
      p_emails: emails,
      p_phones: phones,
    });
    if (error || !data) return out;
    const rows = data as Array<LinkedOrder & { key_type: "email" | "phone"; match_key: string }>;
    const byEmail = new Map<string, LinkedOrder>();
    const byPhone = new Map<string, LinkedOrder>();
    for (const r of rows) {
      const order: LinkedOrder = { ...r, match_basis: r.key_type };
      if (r.key_type === "email") byEmail.set(r.match_key, order);
      else if (r.key_type === "phone") byPhone.set(r.match_key, order);
    }
    for (const c of contacts) {
      const e = c.email ? byEmail.get(normEmail(c.email)) : undefined;
      const p = c.phone && phoneDigits(c.phone).length === 10 ? byPhone.get(phoneDigits(c.phone)) : undefined;
      const best = e ?? p ?? null;
      if (best) out.set(c.id, best);
    }
    return out;
  } catch {
    return out;
  }
}

export interface OrderStatusSummary {
  label: string;
  tone: "emerald" | "violet" | "sky" | "amber" | "red" | "gray";
  icon: string;
}

/**
 * Human-friendly lifecycle label for the linked-order card.
 *
 * ── CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001 §Item-2 ────────────────────
 * This used to be a SECOND, independent classifier that read only
 * `orders.status`. Because `status = 'processing'` is the paid-but-unassigned
 * state, it labelled such orders "Under Review" while the very same card's
 * Provider row read "Unassigned" — a card that contradicted itself. Observed on
 * PT-MSZGR2TS (status='processing', no provider, 15:11→16:18 UTC 2026-08-19).
 *
 * It now DELEGATES to the canonical classifier used by Admin Orders —
 * orderWorkflowState() / orderPaymentState(), the TypeScript mirrors of
 * public.order_workflow_state() / public.order_payment_state(). There is no
 * second lifecycle rule here any more: this function only maps a canonical state
 * to a label, tone and icon.
 *
 * Because provider assignment (`doctor_user_id` / `doctor_email`) is what
 * separates `under_review` from `paid_unassigned` in the canonical classifier,
 * the chip and the Provider row can no longer disagree: "Under Review" is now
 * reachable only when a provider is genuinely assigned.
 *
 * Payment state is resolved BEFORE workflow state only for genuinely terminal
 * financial outcomes (full refund / dispute), matching how Admin Orders ranks a
 * refund badge above a workflow badge. A PARTIAL refund deliberately stays
 * operational and keeps its workflow label (orderClassification.ts rule 7).
 */
export function summarizeOrderStatus(o: LinkedOrder | LifecycleOrder): OrderStatusSummary {
  const payment = orderPaymentState(o);

  // Terminal financial outcomes outrank the workflow badge.
  if (payment === "disputed") {
    return { label: "Disputed", tone: "red", icon: "ri-alert-line" };
  }
  if (payment === "fully_refunded" && isFullRefund(o)) {
    return { label: "Refunded", tone: "red", icon: "ri-refund-2-line" };
  }

  switch (orderWorkflowState(o)) {
    case "cancelled":
      return { label: "Cancelled", tone: "gray", icon: "ri-close-circle-line" };
    case "completed":
      return { label: "Completed", tone: "emerald", icon: "ri-checkbox-circle-fill" };
    case "pending_delivery":
      return { label: "Pending Delivery", tone: "violet", icon: "ri-send-plane-line" };
    case "reopened":
      return { label: "Reopened", tone: "amber", icon: "ri-restart-line" };
    case "under_review":
      return { label: "Under Review", tone: "violet", icon: "ri-time-line" };
    case "paid_unassigned":
      // A partial refund is still an operational paid order — say so rather than
      // hiding it behind a bare "Paid (Unassigned)".
      if (isPartialRefund(o)) {
        return { label: "Paid (Unassigned) · Partially refunded", tone: "amber", icon: "ri-bank-card-line" };
      }
      return { label: "Paid (Unassigned)", tone: "sky", icon: "ri-bank-card-line" };
    case "lead":
    default:
      // A failed payment attempt that a later successful charge superseded is
      // stale presentation, not an actionable failure (ORDER-PAID-STALE-FAILURE-
      // SUPPRESSION-001), so it must not turn a lead chip red.
      if (payment === "failed" && !isStalePaymentFailure(o)) {
        return { label: "Payment Failed", tone: "red", icon: "ri-error-warning-line" };
      }
      return { label: "Lead (Unpaid)", tone: "amber", icon: "ri-shopping-cart-line" };
  }
}

/** Tailwind classes for a status tone (border + bg + text). */
export function toneClasses(tone: OrderStatusSummary["tone"]): string {
  switch (tone) {
    case "emerald": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "violet":  return "bg-violet-50 text-violet-700 border-violet-200";
    case "sky":     return "bg-sky-50 text-sky-700 border-sky-200";
    case "amber":   return "bg-amber-50 text-amber-700 border-amber-200";
    case "red":     return "bg-red-50 text-red-700 border-red-200";
    default:        return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

export function customerName(o: LinkedOrder): string {
  const n = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
  return n || "—";
}

export function serviceLabel(o: LinkedOrder): string {
  const lt = (o.letter_type ?? "").toLowerCase();
  if (lt === "psd") return "PSD Letter";
  if (lt === "esa") return "ESA Letter";
  return o.plan_type || o.letter_type || "—";
}
