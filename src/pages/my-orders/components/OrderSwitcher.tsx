// OrderSwitcher — compact, selectable list of the customer's orders
// (CUSTOMER-PORTAL-ACCOUNT-HUB-REDESIGN-001). Order ID is the primary identifier.
// Selecting an item drives which order's full detail is shown on the right.

import { OrderLike, productLabel, packageShort, billingLabel, isPSD, isPaid } from "./orderDisplay";

export interface SwitcherOrder extends OrderLike {
  id: string;
  created_at: string;
  selected_provider?: string | null;
}

interface DisplayStatus { label: string; color: string; icon: string }

export default function OrderSwitcher({
  orders,
  selectedId,
  onSelect,
  getStatus,
}: {
  orders: SwitcherOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  getStatus: (o: SwitcherOrder) => DisplayStatus;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <i className="ri-stack-line text-[#3b6ea5]"></i>
        <p className="text-sm font-extrabold text-gray-900">Your orders</p>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{orders.length}</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
        {orders.map((o) => {
          const st = getStatus(o);
          const active = o.id === selectedId;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              aria-current={active}
              className={`w-full text-left px-4 py-3 transition-colors cursor-pointer focus:outline-none ${
                active ? "bg-[#e8f0f9]/70 border-l-[3px] border-[#3b6ea5]" : "hover:bg-gray-50 border-l-[3px] border-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-sm font-extrabold text-gray-900 truncate">{o.confirmation_id}</span>
                {active && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#3b6ea5] text-white flex-shrink-0">
                    <i className="ri-eye-line text-[9px]"></i>Viewing
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isPSD(o) ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-slate-100 text-slate-600"}`}>
                  <i className={isPSD(o) ? "ri-service-line" : "ri-heart-line"}></i>{productLabel(o)}
                </span>
                <span className="text-[10px] font-semibold text-gray-500">{packageShort(o)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>
                  <i className={st.icon}></i>{st.label}
                </span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[10px] text-gray-500">
                  {isPaid(o) && o.price != null ? `$${o.price}.00 · ${billingLabel(o)}` : billingLabel(o)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
