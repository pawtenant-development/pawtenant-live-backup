// SelectedOrderHeader — strong header for the currently-selected order.
// CUSTOMER-PORTAL-ACCOUNT-HUB-REDESIGN-001. Order ID is the primary identifier
// (visually stronger than the customer name), with a copy button, product +
// package, primary status, amount / billing, created date, and a per-order help CTA.

import { useState } from "react";
import { OrderLike, productLabel, packageName, billingLabel, isPSD, isPaid } from "./orderDisplay";
import { resolveCustomerDisplayName, type NameUserLike } from "@/lib/customerName";

export interface HeaderOrder extends OrderLike {
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  assessment_answers?: Record<string, unknown> | null;
}

interface DisplayStatus { label: string; color: string; icon: string; bgGradient?: string }

export default function SelectedOrderHeader({
  order,
  status,
  onContactSupport,
  user = null,
}: {
  order: HeaderOrder;
  status: DisplayStatus;
  onContactSupport: () => void;
  // The viewer's auth identity — used ONLY as a last-resort name source for the
  // viewer's own order. Pass null in admin "Customer View" so the admin's name
  // never lands on a previewed order.
  user?: NameUserLike | null;
}) {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(order.confirmation_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const created = new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Order-safe display name (this order's own name first; viewer metadata only as
  // a last resort, and only for the viewer's own order — never in admin preview).
  const name = resolveCustomerDisplayName(order, null, user);

  const copyBtn = (
    <button
      type="button"
      onClick={copyId}
      className="whitespace-nowrap inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-[#1e3a5f] border border-gray-200 bg-white/70 rounded-md px-1.5 py-1 transition-colors cursor-pointer"
      title="Copy Order ID"
    >
      <i className={copied ? "ri-check-line text-emerald-600" : "ri-file-copy-line"}></i>{copied ? "Copied" : "Copy"}
    </button>
  );

  const packageLine = (
    <>
      {packageName(order)} <span className="text-gray-300">·</span> {billingLabel(order)}
      {isPaid(order) && order.price != null && <> <span className="text-gray-300">·</span> <span className="font-semibold text-gray-800">${order.price}.00 paid</span></>}
    </>
  );

  return (
    <div className={`rounded-2xl border border-gray-200 bg-gradient-to-r ${status.bgGradient ?? "from-[#e8f0f9] to-white"} px-5 sm:px-6 py-4`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {/* product eyebrow */}
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isPSD(order) ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-slate-100 text-slate-600"}`}>
            <i className={isPSD(order) ? "ri-service-line" : "ri-heart-line"}></i>{productLabel(order)}
          </span>

          {!name.isFallback ? (
            <>
              {/* primary: the customer's full name (order-safe) */}
              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight mt-1.5 break-words" title={name.fullName}>{name.fullName}</h2>
              <p className="text-sm text-gray-700 mt-1">{packageLine}</p>
              {/* order id preserved (secondary) + copy + date */}
              <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-gray-500">Order #{order.confirmation_id}</span>
                {copyBtn}
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-xs text-gray-500">{created}</span>
              </div>
            </>
          ) : (
            <>
              {/* no resolvable name — the Order ID stays the primary heading (never blank) */}
              <div className="flex items-center gap-2 mt-1.5">
                <h2 className="font-mono text-xl sm:text-2xl font-extrabold text-gray-900 leading-none">#{order.confirmation_id}</h2>
                {copyBtn}
              </div>
              <p className="text-xs text-gray-600 mt-1.5">{packageLine}<span className="text-gray-300"> · </span>{created}</p>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${status.color}`}>
            <i className={status.icon}></i>{status.label}
          </span>
          <button
            type="button"
            onClick={onContactSupport}
            className="whitespace-nowrap inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#3b6ea5] transition-colors cursor-pointer"
          >
            <i className="ri-question-line"></i>Need help with this order?
          </button>
        </div>
      </div>
    </div>
  );
}
