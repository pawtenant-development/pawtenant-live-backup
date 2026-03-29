// IncomingCallBanner — Real-time incoming call notifications with order lookup
// Uses Supabase realtime to detect inbound calls logged by the Twilio webhook
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface Order {
  id: string;
  confirmation_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  state: string | null;
  status: string;
  payment_intent_id: string | null;
  doctor_email: string | null;
  doctor_user_id: string | null;
}

interface IncomingCall {
  id: string;
  phone_from: string;
  body: string | null;
  created_at: string;
  order: Order | null;
}

interface IncomingCallBannerProps {
  orders: Order[];
  onViewOrder?: (order: Order) => void;
}

function fmtPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function elapsedSecs(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
}

function fmtElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function IncomingCallBanner({ orders, onViewOrder }: IncomingCallBannerProps) {
  const [activeCalls, setActiveCalls] = useState<IncomingCall[]>([]);
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set());
  const [elapsed, setElapsed]         = useState<Record<string, number>>({});
  const audioRef                      = useRef<HTMLAudioElement | null>(null);

  // ── Match phone to order ─────────────────────────────────────────────────
  const findOrder = (phone: string): Order | null => {
    const digits = phone.replace(/\D/g, "");
    return orders.find((o) => {
      if (!o.phone) return false;
      const oDigits = o.phone.replace(/\D/g, "");
      return oDigits === digits || oDigits.endsWith(digits) || digits.endsWith(oDigits);
    }) ?? null;
  };

  // ── Listen for new inbound call communications ───────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("incoming-calls-banner")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "communications",
          filter: "type=eq.call_inbound",
        },
        (payload) => {
          const comm = payload.new as {
            id: string; phone_from: string; body: string | null; created_at: string;
          };
          // Find matching order
          const matchedOrder = findOrder(comm.phone_from);
          const newCall: IncomingCall = {
            id: comm.id,
            phone_from: comm.phone_from,
            body: comm.body,
            created_at: comm.created_at,
            order: matchedOrder,
          };
          setActiveCalls((prev) => [newCall, ...prev]);
          // Play ring sound
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // ── Tick elapsed timer ───────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next: Record<string, number> = {};
        activeCalls.forEach((c) => {
          next[c.id] = elapsedSecs(c.created_at);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCalls]);

  const visibleCalls = activeCalls.filter((c) => !dismissed.has(c.id));
  if (visibleCalls.length === 0) return null;

  return (
    <>
      {/* Hidden audio element for ring notification */}
      <audio ref={audioRef} preload="auto" loop>
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA" type="audio/wav" />
      </audio>

      {/* Floating call stack */}
      <div className="fixed top-20 right-4 z-[300] space-y-3 w-80">
        {visibleCalls.map((call) => {
          const order    = call.order;
          const name     = order
            ? [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email
            : "Unknown Caller";
          const isPaid   = order ? !!order.payment_intent_id : false;
          const isAssigned = order ? !!(order.doctor_email || order.doctor_user_id) : false;
          const secs     = elapsed[call.id] ?? 0;

          return (
            <div
              key={call.id}
              className="bg-white rounded-2xl border-2 border-[#1a5c4f] overflow-hidden animate-bounce-in"
              style={{ animation: "slideInRight 0.3s ease-out" }}
            >
              {/* Green header */}
              <div className="flex items-center gap-3 bg-[#1a5c4f] px-4 py-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-full">
                    <i className="ri-phone-incoming-line text-white text-xl"></i>
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-[#1a5c4f]">
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Incoming Call</p>
                  <p className="text-sm font-extrabold text-white truncate">{name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-mono text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                    {fmtElapsed(secs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => new Set([...prev, call.id]))}
                    className="whitespace-nowrap w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                  >
                    <i className="ri-close-line text-sm"></i>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3 space-y-2.5">
                {/* Phone */}
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className="ri-phone-line text-gray-400 text-sm"></i>
                  </div>
                  <span className="text-sm font-mono font-semibold text-gray-800">{fmtPhone(call.phone_from)}</span>
                </div>

                {/* Matched order info */}
                {order ? (
                  <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-3 py-2.5 space-y-1.5">
                    <p className="text-xs font-bold text-[#1a5c4f] flex items-center gap-1">
                      <i className="ri-checkbox-circle-fill"></i>
                      Order Found
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold">Email:</span> {order.email}
                      </p>
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold">State:</span> {order.state ?? "—"}
                      </p>
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold">Order:</span>{" "}
                        <span className="font-mono">{order.confirmation_id}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {isPaid ? "Paid" : "Unpaid"}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${isAssigned ? "bg-sky-100 text-sky-700" : "bg-orange-100 text-orange-700"}`}>
                        {isAssigned ? "Assigned" : "Unassigned"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                    <i className="ri-user-search-line text-gray-400 text-sm flex-shrink-0"></i>
                    <p className="text-xs text-gray-500">Phone not registered in the system</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {order && onViewOrder && (
                    <button
                      type="button"
                      onClick={() => { onViewOrder(order); setDismissed((prev) => new Set([...prev, call.id])); }}
                      className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors"
                    >
                      <i className="ri-external-link-line"></i>View Order
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => new Set([...prev, call.id]))}
                    className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <i className="ri-close-line"></i>Dismiss
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
