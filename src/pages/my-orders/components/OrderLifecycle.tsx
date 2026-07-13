// OrderLifecycle — the one reusable, prominent customer-facing lifecycle
// (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001). Replaces the old compact
// OrderStatusTimeline. Four steps, mapped by the shared resolveLifecycle():
//   1. Book & Pay for Your Consultation
//   2. Provider Assignment
//   3. Evaluation Started
//   4. Letter Delivered
//
// States: done = emerald · active = amber (current) · locked = muted gray/blue.
// Light-only, admin-style navy structure, mobile-first (vertical stepper so the
// long step labels never overflow). Customer-safe wording only.

import { resolveLifecycle, isUnpaidLead, type BookingOrderLike, type StepState } from "@/lib/bookingProgress";
import CustomerPortalSection from "./CustomerPortalSection";

const DOT: Record<StepState, string> = {
  done: "bg-emerald-500 text-white ring-emerald-100",
  active: "bg-amber-400 text-white ring-amber-100",
  locked: "bg-gray-100 text-gray-400 ring-transparent",
};
const LABEL: Record<StepState, string> = {
  done: "text-[#1e3a5f]",
  active: "text-[#1e3a5f]",
  locked: "text-gray-400",
};
const CONNECTOR: Record<StepState, string> = {
  done: "bg-emerald-300",
  active: "bg-amber-200",
  locked: "bg-gray-200",
};

export default function OrderLifecycle({ order }: { order: BookingOrderLike }) {
  const steps = resolveLifecycle(order);
  const unpaid = isUnpaidLead(order);

  return (
    <CustomerPortalSection
      title="Your Progress"
      icon="ri-route-line"
      tone="blue"
      headerRight={
        unpaid ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
            <i className="ri-time-line"></i>Booking incomplete
          </span>
        ) : undefined
      }
      bodyClassName="px-4 sm:px-5 py-4 sm:py-5"
    >
      <ol>
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3.5">
              {/* rail */}
              <div className="flex flex-col items-center flex-shrink-0">
                <span
                  className={`w-10 h-10 flex items-center justify-center rounded-full ring-4 transition-colors ${DOT[s.state]}`}
                >
                  {s.state === "done" ? (
                    <i className="ri-check-line text-lg"></i>
                  ) : s.state === "locked" ? (
                    <i className="ri-lock-2-line text-sm"></i>
                  ) : (
                    <i className={`${s.icon} text-base`}></i>
                  )}
                </span>
                {!last && <span className={`w-0.5 flex-1 min-h-[22px] my-1 rounded ${CONNECTOR[s.state]}`}></span>}
              </div>

              {/* content */}
              <div className={`min-w-0 ${last ? "pb-0" : "pb-5"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-extrabold leading-tight ${LABEL[s.state]}`}>
                    <span className="text-[11px] font-bold text-gray-300 mr-1.5">{i + 1}</span>
                    {s.label}
                  </p>
                  {s.state === "active" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                      <i className="ri-focus-3-line"></i>You are here
                    </span>
                  )}
                  {s.state === "done" && (
                    <i className="ri-checkbox-circle-fill text-emerald-500 text-sm" aria-label="completed"></i>
                  )}
                </div>
                <p className={`text-xs mt-0.5 leading-relaxed ${s.state === "locked" ? "text-gray-400" : "text-gray-500"}`}>
                  {s.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </CustomerPortalSection>
  );
}
