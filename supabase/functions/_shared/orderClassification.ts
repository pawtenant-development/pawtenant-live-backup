// Deno-side port of the canonical refund classifier.
//
// PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001
//
// The canonical module is `src/lib/orderClassification.ts`. Edge functions run on
// Deno and cannot import from the Vite `src/` tree, so this is the ONE shared
// Deno copy — never duplicate these predicates inside an individual function.
// It intentionally ports only the predicates edge functions need.
//
// The rules are identical to the canonical module and must stay that way:
//
//   1. `refunded_at` only proves refund ACTIVITY occurred.
//   2. `refunded_at` alone NEVER proves a full refund.
//   3. A positive `refund_amount` alone NEVER proves a full refund.
//   4. Explicit partial evidence overrides a stale `status='refunded'`.
//   5. A full refund requires AUTHORITATIVE evidence.
//   6. Cancellation is separate from refund completeness.
//   7. Partial refunds stay OPERATIONAL.
//   8. Unknown/conflicting data is NEVER terminal.
//
// Drift between this file and src/lib/orderClassification.ts is caught by
// scripts/check-refund-consumer-guard.mjs.

export interface ClassifiableOrder {
  status?: string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  refund_amount?: number | string | null;
}

export type RefundDisposition = "none" | "partial" | "full" | "full_cancelled" | "unknown";

function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().trim();
}

function amount(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string") return parseFloat(v);
  return NaN;
}

/** Some refund activity occurred — partial OR full. Display only, never a gate. */
export function hasAnyRefund(o: ClassifiableOrder): boolean {
  if (o.refunded_at) return true;
  const rs = norm(o.refund_status);
  if (rs === "partial" || rs === "full") return true;
  const amt = amount(o.refund_amount);
  if (Number.isFinite(amt) && amt > 0) return true;
  if (norm(o.status) === "refunded") return true;
  return false;
}

/** Authoritative partial refund — the order remains operational. */
export function isPartialRefund(o: ClassifiableOrder): boolean {
  return norm(o.refund_status) === "partial";
}

/** Authoritative FULL refund — requires authoritative evidence (rules 2–5, 8). */
export function isFullRefund(o: ClassifiableOrder): boolean {
  if (isPartialRefund(o)) return false;
  if (norm(o.refund_status) === "full") return true;
  if (norm(o.status) === "refunded") return true;
  return false;
}

/** The refund itself ends the order. Only ever true for a full refund. */
export function isRefundTerminal(o: ClassifiableOrder): boolean {
  return isFullRefund(o);
}

/** Explicit operational cancellation — owned by cancel-order. */
export function isOperationallyCancelled(o: ClassifiableOrder): boolean {
  return norm(o.status) === "cancelled";
}

/** Fully refunded OR cancelled — the order is over. */
export function isRefundedBucket(o: ClassifiableOrder): boolean {
  return isFullRefund(o) || isOperationallyCancelled(o);
}

/** The canonical refund disposition. */
export function refundDisposition(o: ClassifiableOrder): RefundDisposition {
  if (!hasAnyRefund(o)) return "none";
  if (isPartialRefund(o)) return "partial";
  if (isFullRefund(o)) return isOperationallyCancelled(o) ? "full_cancelled" : "full";
  return "unknown";
}
