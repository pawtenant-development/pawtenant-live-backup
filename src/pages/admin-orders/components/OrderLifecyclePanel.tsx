// OrderLifecyclePanel — "Lifecycle & Payment" detail block for the Order Details modal.
//
// ADMIN-ORDERS-LIFECYCLE-UI-SIMPLIFICATION-001 §7
//
// This is where every lifecycle date REMOVED from the Orders list now lives. The
// list shows one status badge (plus an exceptional payment chip); the full,
// unambiguous picture is here.
//
// Deliberately a SEPARATE, non-frozen component so the merge-frozen
// OrderDetailModal.tsx only needs a one-line isolated component mount.
//
// Contract:
//   • Derives everything from the order row it is given — no fetches, no writes.
//   • Rows with no value are HIDDEN, not rendered as blank blocks. Only the two
//     always-meaningful states (payment, workflow) always render.
//   • No lifecycle-event metadata and no customer PII — dates and states only.

import {
  orderPaymentState, paymentStateLabel,
  orderWorkflowState, workflowStateLabel, workflowReason,
  orderActivityType, orderActivityIso,
  lifecycleEventLabel, lifecycleEventIcon,
  type LifecycleOrder,
} from "@/lib/orderLifecycle";
import { refundDisposition, refundDispositionLabel } from "@/lib/orderClassification";

export interface OrderLifecyclePanelProps {
  order: LifecycleOrder & {
    created_at: string;
    dispute_status?: string | null;
    dispute_reason?: string | null;
    dispute_created_at?: string | null;
  };
  /** Shared timestamp formatter from the host modal, so the panel matches its
   *  existing timezone/format contract exactly. */
  fmt: (ts: string) => string;
}

function Row({ label, value, muted, title }: { label: string; value: string; muted?: boolean; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-gray-50 last:border-b-0">
      <span className="text-[11px] text-gray-400 flex-shrink-0">{label}</span>
      <span
        className={`text-[12px] font-semibold text-right break-words ${muted ? "text-gray-400" : "text-gray-800"}`}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

export default function OrderLifecyclePanel({ order, fmt }: OrderLifecyclePanelProps) {
  const pay = orderPaymentState(order);
  const wf = orderWorkflowState(order);
  const reason = workflowReason(order);
  const evType = orderActivityType(order);
  const evIso = orderActivityIso(order);
  const refund = refundDisposition(order);

  // Only render a date row when the order actually has that date.
  const dateRows: { label: string; iso: string | null | undefined; title?: string }[] = [
    { label: "Created", iso: order.created_at, title: "Immutable — never rewritten by payment, reopen or completion" },
    { label: "First paid", iso: order.paid_at, title: "Immutable first successful payment — add-ons and renewals never move it" },
    { label: "Last payment", iso: order.last_payment_at, title: "Most recent successful payment (add-on, upgrade or renewal)" },
    { label: "First completed", iso: order.first_completed_at, title: "Original fulfilment — preserved across reopen cycles" },
    { label: "Last completed", iso: order.last_completed_at, title: "Most recent fulfilment" },
    { label: "Last reopened", iso: order.last_reopened_at, title: "Latest workflow reopening — creates no revenue" },
  ];
  const visibleDates = dateRows.filter((r) => !!r.iso);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <i className="ri-history-line text-[#3b6ea5] text-sm"></i>
        <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wide">Lifecycle &amp; Payment</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        {/* ── States ── */}
        <div>
          <Row label="Payment status" value={paymentStateLabel(pay)} />
          <Row label="Workflow status" value={workflowStateLabel(wf)} title={reason ?? undefined} />
          {reason && <Row label="Reason" value={reason} />}
          <Row
            label="Latest activity"
            value={lifecycleEventLabel(evType)}
            title={lifecycleEventIcon(evType)}
          />
          {evIso && <Row label="Latest activity at" value={fmt(evIso)} />}
          {refund !== "none" && <Row label="Refund" value={refundDispositionLabel(refund)} />}
          {order.dispute_status && (
            <Row
              label="Dispute"
              value={order.dispute_status}
              title={order.dispute_reason ?? undefined}
            />
          )}
          {order.dispute_created_at && <Row label="Dispute opened" value={fmt(order.dispute_created_at)} />}
        </div>

        {/* ── Dates — unavailable ones are omitted, never blank blocks ── */}
        <div>
          {visibleDates.map((r) => (
            <Row key={r.label} label={r.label} value={fmt(r.iso as string)} title={r.title} />
          ))}
          {visibleDates.length === 0 && <Row label="Dates" value="—" muted />}
        </div>
      </div>
    </div>
  );
}
