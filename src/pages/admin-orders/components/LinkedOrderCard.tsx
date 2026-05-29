// COMMS-CUSTOMER-ORDER-AUTO-LINKING
// Admin-only "linked order" context for chat / email / contact surfaces.
// Either self-fetches the best-matching order (findOrderForContact) or renders
// a prefetched order (passed by a batched list enrichment).
//
//   variant="card"  → full card for the contact/email detail panel
//                     (renders an "unlinked" note when nothing matches).
//   variant="chip"  → compact inline chip for the chat context panel
//                     (renders nothing when nothing matches).
//
// No "Open Order" navigation here (it only opened a useless tab) — the order
// identity is shown inline; confirmation_id is copyable.

import { useEffect, useState } from "react";
import {
  findOrderForContact,
  summarizeOrderStatus,
  toneClasses,
  customerName,
  serviceLabel,
  type LinkedOrder,
  type FindOrderArgs,
} from "../../../lib/orderLink";

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 30 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function copyId(confirmationId: string | null) {
  try { if (confirmationId) void navigator.clipboard.writeText(confirmationId); } catch { /* ignore */ }
}

interface LinkedOrderCardProps extends FindOrderArgs {
  variant?: "card" | "chip";
  /** Prefetched order (e.g. from a batched list lookup). */
  order?: LinkedOrder | null;
  /** When true, use `order` as-is and skip the self-fetch. */
  prefetched?: boolean;
}

export default function LinkedOrderCard({
  variant = "card",
  email,
  phone,
  sessionId,
  confirmationId,
  order: providedOrder,
  prefetched = false,
}: LinkedOrderCardProps) {
  const [order, setOrder] = useState<LinkedOrder | null>(prefetched ? (providedOrder ?? null) : null);
  const [loading, setLoading] = useState(!prefetched);

  useEffect(() => {
    if (prefetched) { setOrder(providedOrder ?? null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setOrder(null);
    void findOrderForContact({ email, phone, sessionId, confirmationId }).then((o) => {
      if (!cancelled) { setOrder(o); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [prefetched, providedOrder, email, phone, sessionId, confirmationId]);

  // ── Chip variant (compact, chat context) ────────────────────────────────
  if (variant === "chip") {
    if (loading || !order) return null;
    const s = summarizeOrderStatus(order);
    const possible = order.confidence !== "high";
    return (
      <button
        type="button"
        onClick={() => copyId(order.confirmation_id)}
        title={`Copy ${order.confirmation_id}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border cursor-pointer hover:opacity-80 ${toneClasses(s.tone)}`}
      >
        <i className={s.icon} style={{ fontSize: "10px" }} />
        {possible && <span className="opacity-70">Possible:</span>}
        {order.confirmation_id}
        <span className="opacity-70">· {s.label}</span>
        {order.match_count > 1 && <span className="opacity-60">· +{order.match_count - 1}</span>}
      </button>
    );
  }

  // ── Card variant (contact / email detail) ───────────────────────────────
  if (loading) {
    return (
      <div className="mb-5 pb-5 border-b border-gray-100">
        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Linked Order</p>
        <div className="bg-[#f8f7f4] rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
          <i className="ri-loader-4-line animate-spin text-[#3b6ea5]"></i>
          Checking for a matching order…
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mb-5 pb-5 border-b border-gray-100">
        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Linked Order</p>
        <div className="bg-[#f8f7f4] rounded-xl px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
          <i className="ri-link-unlink text-gray-400"></i>
          No matching order — unlinked contact.
        </div>
      </div>
    );
  }

  const s = summarizeOrderStatus(order);
  const possible = order.confidence !== "high";

  return (
    <div className="mb-5 pb-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Linked Order</p>
        {possible && (
          <span className="text-[10px] font-bold text-amber-600 inline-flex items-center gap-1">
            <i className="ri-question-line"></i>Possible match
          </span>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold ${toneClasses(s.tone)}`}>
            <i className={s.icon} style={{ fontSize: "11px" }} />{s.label}
          </span>
          <span className="font-mono text-xs font-bold text-gray-700">{order.confirmation_id ?? "—"}</span>
          {order.confirmation_id && (
            <button
              type="button"
              onClick={() => copyId(order.confirmation_id)}
              title="Copy order ID"
              className="text-gray-400 hover:text-[#3b6ea5] text-xs cursor-pointer"
            >
              <i className="ri-file-copy-line"></i>
            </button>
          )}
          {order.match_count > 1 && (
            <span className="text-[10px] text-gray-400">+{order.match_count - 1} other match{order.match_count - 1 !== 1 ? "es" : ""}</span>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">Customer</dt>
            <dd className="text-gray-800 font-medium truncate" title={customerName(order)}>{customerName(order)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">Service</dt>
            <dd className="text-gray-800 font-medium truncate">{serviceLabel(order)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">State</dt>
            <dd className="text-gray-800 font-medium truncate">{order.state || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">Provider</dt>
            <dd className="text-gray-800 font-medium truncate">{order.doctor_name || "Unassigned"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">Order email</dt>
            <dd className="text-gray-800 font-medium truncate" title={order.email ?? ""}>{order.email || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">Order phone</dt>
            <dd className="text-gray-800 font-medium truncate">{order.phone || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <dt className="text-gray-500 shrink-0">Order created</dt>
            <dd className="text-gray-800 font-medium truncate">{fmtWhen(order.created_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
