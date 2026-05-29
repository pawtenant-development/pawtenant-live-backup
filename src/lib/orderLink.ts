// COMMS-CUSTOMER-ORDER-AUTO-LINKING
// Thin client wrapper around the admin-only `admin_find_order_for_contact` RPC.
// Resolves the single best-matching order for a chat / email / contact record
// using deterministic identifiers (confirmation_id > session > email > phone).
// The RPC is admin-gated server-side, so this is safe to call from admin
// surfaces only; non-admins receive null. Never throws.

import { supabase } from "./supabaseClient";

export interface LinkedOrder {
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

/** Human-friendly lifecycle/payment label derived from order fields. */
export function summarizeOrderStatus(o: Pick<LinkedOrder, "status" | "doctor_status" | "paid_at" | "payment_intent_id">): OrderStatusSummary {
  const status = (o.status ?? "").toLowerCase();
  if (o.doctor_status === "patient_notified" || status === "completed") {
    return { label: "Completed", tone: "emerald", icon: "ri-checkbox-circle-fill" };
  }
  if (status === "under-review" || status === "under_review" || status === "processing") {
    return { label: "Under Review", tone: "violet", icon: "ri-time-line" };
  }
  if (status === "refunded") return { label: "Refunded", tone: "red", icon: "ri-refund-2-line" };
  if (status === "cancelled") return { label: "Cancelled", tone: "gray", icon: "ri-close-circle-line" };
  if (o.paid_at || o.payment_intent_id || status === "paid · unassigned") {
    return { label: "Paid", tone: "sky", icon: "ri-bank-card-line" };
  }
  return { label: "Lead (Unpaid)", tone: "amber", icon: "ri-shopping-cart-line" };
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
