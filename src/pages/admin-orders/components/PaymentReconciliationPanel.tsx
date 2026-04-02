// PaymentReconciliationPanel — Admin tool to search orphaned Stripe payments and attach them to orders
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface ReconciliationResult {
  ok: boolean;
  message?: string;
  error?: string;
  paymentIntentId?: string;
  confirmationId?: string;
  priceUpdated?: number;
  matchedBy?: string;
  emailsTriggered?: boolean;
  alreadySynced?: boolean;
  // Search mode results
  searchResults?: SearchCandidate[];
  stripeAmount?: number;
  stripeEmail?: string;
  stripeConfirmationId?: string;
  resolvedPiId?: string;
}

interface SearchCandidate {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  payment_intent_id: string | null;
  created_at: string;
  price: number | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export default function PaymentReconciliationPanel() {
  const [stripeId, setStripeId] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [confirmationId, setConfirmationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<SearchCandidate | null>(null);
  const [confirmingAttach, setConfirmingAttach] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  };

  const handleSearch = async () => {
    if (!stripeId.trim()) return;
    setLoading(true);
    setResult(null);
    setSelectedCandidate(null);
    setConfirmingAttach(false);

    try {
      const token = await getToken();
      const isCharge = stripeId.trim().startsWith("ch_");
      const res = await fetch(`${supabaseUrl}/functions/v1/fix-order-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          searchMode: true,
          ...(confirmationId.trim() ? { confirmationId: confirmationId.trim() } : {}),
          ...(isCharge ? { stripeChargeId: stripeId.trim() } : { stripePaymentIntentId: stripeId.trim() }),
          ...(searchEmail.trim() ? { searchEmail: searchEmail.trim() } : {}),
        }),
      });
      const data = await res.json() as ReconciliationResult;
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Network error — please try again" });
    }
    setLoading(false);
  };

  const handleAttach = async (targetConfirmationId: string) => {
    setAttachLoading(true);
    try {
      const token = await getToken();
      const isCharge = stripeId.trim().startsWith("ch_");
      const res = await fetch(`${supabaseUrl}/functions/v1/fix-order-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId: targetConfirmationId,
          ...(isCharge ? { stripeChargeId: stripeId.trim() } : { stripePaymentIntentId: stripeId.trim() }),
        }),
      });
      const data = await res.json() as ReconciliationResult;
      setResult(data);
      setSelectedCandidate(null);
      setConfirmingAttach(false);
      if (data.ok) {
        // Refresh audit log
        loadAuditLog();
      }
    } catch {
      setResult({ ok: false, error: "Network error — please try again" });
    }
    setAttachLoading(false);
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, details, created_at")
      .in("action", ["admin_payment_linked", "orphaned_payment_intent", "orphaned_checkout_session"])
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLog((data as AuditEntry[]) ?? []);
    setAuditLoading(false);
    setAuditLoaded(true);
  };

  const fmt = (ts: string) => new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  const ACTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    admin_payment_linked: { label: "Payment Linked", color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "ri-link-m" },
    orphaned_payment_intent: { label: "Orphaned PI", color: "text-red-700 bg-red-50 border-red-200", icon: "ri-error-warning-line" },
    orphaned_checkout_session: { label: "Orphaned Session", color: "text-orange-700 bg-orange-50 border-orange-200", icon: "ri-error-warning-line" },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-extrabold text-gray-900">Payment Reconciliation Tool</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Search for a Stripe payment by PI ID, Charge ID, or customer email — then attach it to the correct order.
          Use this to fix orphaned payments where the webhook didn&apos;t link the payment to an order.
        </p>
      </div>

      {/* Search form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Search Stripe Payment</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Stripe ID */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Stripe Payment Intent ID or Charge ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={stripeId}
              onChange={(e) => setStripeId(e.target.value.trim())}
              placeholder="pi_3THUU0Gwm9wIWlgi0... or ch_..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a5c4f] bg-white"
            />
          </div>

          {/* Optional: confirmation ID */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Order Confirmation ID <span className="text-gray-400 font-normal">(optional — skip to auto-detect)</span>
            </label>
            <input
              type="text"
              value={confirmationId}
              onChange={(e) => setConfirmationId(e.target.value.trim())}
              placeholder="PT-MNGFNC71"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a5c4f] bg-white"
            />
          </div>

          {/* Optional: email */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Customer Email <span className="text-gray-400 font-normal">(optional — used as fallback if no confirmation ID found)</span>
            </label>
            <input
              type="email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value.trim())}
              placeholder="customer@example.com"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !stripeId.trim()}
            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
          >
            {loading
              ? <><i className="ri-loader-4-line animate-spin"></i>Searching...</>
              : <><i className="ri-search-line"></i>Search &amp; Auto-Attach</>
            }
          </button>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <i className="ri-information-line"></i>
            If a matching unpaid order is found automatically, it will be attached immediately.
          </p>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-5 ${result.ok ? "bg-emerald-50 border-emerald-200" : result.searchResults ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
          {result.ok ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
                  <i className="ri-checkbox-circle-fill text-emerald-600 text-base"></i>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-emerald-800">Payment Successfully Linked!</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{result.message}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Order ID", value: result.confirmationId ?? "—" },
                  { label: "Amount", value: result.priceUpdated != null ? `$${result.priceUpdated}` : "—" },
                  { label: "Matched By", value: result.matchedBy ?? "—" },
                  { label: "Emails", value: result.emailsTriggered ? "Sent" : "Already sent" },
                ].map((item) => (
                  <div key={item.label} className="bg-white/70 rounded-lg px-3 py-2">
                    <p className="text-xs text-emerald-600 font-bold">{item.label}</p>
                    <p className="text-sm font-extrabold text-emerald-900 truncate">{item.value}</p>
                  </div>
                ))}
              </div>
              {result.alreadySynced && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <i className="ri-information-line"></i>
                  This payment was already linked — no duplicate emails sent.
                </p>
              )}
            </div>
          ) : result.searchResults ? (
            // Multiple candidates — let admin pick
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                  <i className="ri-search-line text-amber-600 text-base"></i>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-amber-800">Multiple Orders Found — Pick the Correct One</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Stripe PI: <span className="font-mono">{result.resolvedPiId}</span> &nbsp;·&nbsp;
                    Amount: <strong>${result.stripeAmount}</strong> &nbsp;·&nbsp;
                    Email: <strong>{result.stripeEmail || "unknown"}</strong>
                  </p>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.searchResults.map((candidate) => (
                  <div
                    key={candidate.id}
                    className={`flex items-center justify-between gap-3 bg-white rounded-lg border px-4 py-3 cursor-pointer transition-colors ${selectedCandidate?.id === candidate.id ? "border-[#1a5c4f] bg-[#f0faf7]" : "border-gray-200 hover:border-gray-300"}`}
                    onClick={() => { setSelectedCandidate(candidate); setConfirmingAttach(false); }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-gray-800">{candidate.confirmation_id}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${candidate.payment_intent_id ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {candidate.payment_intent_id ? "Paid" : "Unpaid"}
                        </span>
                        <span className="text-xs text-gray-400">{candidate.status}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {[candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || candidate.email} &nbsp;·&nbsp;
                        {candidate.price != null ? `$${candidate.price}` : "—"} &nbsp;·&nbsp;
                        {new Date(candidate.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors border-gray-300">
                      {selectedCandidate?.id === candidate.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#1a5c4f]"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {selectedCandidate && (
                <div className="bg-white rounded-lg border border-[#1a5c4f] p-4">
                  {!confirmingAttach ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-gray-700">
                        Attach <span className="font-mono font-bold">{result.resolvedPiId?.slice(0, 24)}...</span> to order <span className="font-mono font-bold">{selectedCandidate.confirmation_id}</span>?
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmingAttach(true)}
                        className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors"
                      >
                        <i className="ri-link-m"></i>Attach Payment
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <i className="ri-error-warning-fill text-amber-500"></i>
                        Confirm: attach this Stripe payment to order {selectedCandidate.confirmation_id}?
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        This will set the order to <strong>Processing</strong>, write the payment intent ID, and send confirmation + receipt emails to the customer. This action is logged in the audit trail.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAttach(selectedCandidate.confirmation_id)}
                          disabled={attachLoading}
                          className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {attachLoading
                            ? <><i className="ri-loader-4-line animate-spin"></i>Attaching...</>
                            : <><i className="ri-check-line"></i>Yes, Attach</>
                          }
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingAttach(false)}
                          className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 hover:text-gray-700 font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Error
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-lg flex-shrink-0">
                <i className="ri-error-warning-fill text-red-600 text-base"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-red-800">Not Found</p>
                <p className="text-xs text-red-700 mt-0.5">{result.error}</p>
                {result.stripeEmail && (
                  <p className="text-xs text-red-600 mt-1">
                    Stripe email: <strong>{result.stripeEmail}</strong> &nbsp;·&nbsp;
                    Amount: <strong>${result.stripeAmount}</strong>
                  </p>
                )}
                <p className="text-xs text-red-600 mt-2 leading-relaxed">
                  Try entering the customer&apos;s email in the search field above, or paste the confirmation ID directly.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How matching works */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">How Auto-Matching Works</p>
        <div className="space-y-2">
          {[
            { step: "1", label: "confirmation_id in Stripe metadata", desc: "Primary match — always used when available", color: "bg-emerald-100 text-emerald-700" },
            { step: "2", label: "payment_intent_id already stored", desc: "Idempotency check — prevents duplicate processing", color: "bg-sky-100 text-sky-700" },
            { step: "3", label: "Email fallback", desc: "Matches most recent unpaid order for that email — used when confirmation_id is missing from Stripe metadata", color: "bg-amber-100 text-amber-700" },
            { step: "4", label: "Manual selection", desc: "If multiple orders exist for the email, you pick the correct one above", color: "bg-gray-200 text-gray-700" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-extrabold flex-shrink-0 mt-0.5 ${item.color}`}>
                {item.step}
              </span>
              <div>
                <p className="text-xs font-bold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-xs font-bold text-gray-800">Reconciliation Audit Log</p>
            <p className="text-xs text-gray-400">All payment link actions + orphaned payment alerts</p>
          </div>
          <button
            type="button"
            onClick={loadAuditLog}
            disabled={auditLoading}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
          >
            <i className={auditLoading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
            {auditLoaded ? "Refresh" : "Load Log"}
          </button>
        </div>

        {!auditLoaded ? (
          <div className="px-5 py-8 text-center">
            <p className="text-xs text-gray-400">Click &ldquo;Load Log&rdquo; to view reconciliation history</p>
          </div>
        ) : auditLoading ? (
          <div className="flex items-center justify-center py-8">
            <i className="ri-loader-4-line animate-spin text-xl text-[#1a5c4f]"></i>
          </div>
        ) : auditLog.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <i className="ri-checkbox-circle-line text-emerald-400 text-2xl block mb-2"></i>
            <p className="text-xs text-gray-500">No reconciliation events yet — all payments matched cleanly.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {auditLog.map((entry) => {
              const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, color: "text-gray-600 bg-gray-50 border-gray-200", icon: "ri-file-list-line" };
              const details = entry.details ?? {};
              return (
                <div key={entry.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border flex-shrink-0 mt-0.5 ${cfg.color}`}>
                      <i className={cfg.icon}></i>
                      {cfg.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {details.confirmation_id && (
                          <span className="text-xs font-mono font-bold text-gray-800">{details.confirmation_id as string}</span>
                        )}
                        {details.payment_intent_id && (
                          <span className="text-xs font-mono text-gray-500 truncate max-w-[180px]">{details.payment_intent_id as string}</span>
                        )}
                        {details.amount != null && (
                          <span className="text-xs font-bold text-emerald-700">${details.amount as number}</span>
                        )}
                        {details.matched_by && (
                          <span className="text-xs text-gray-400">via {details.matched_by as string}</span>
                        )}
                      </div>
                      {details.note && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{details.note as string}</p>
                      )}
                      {details.email_in_meta && (
                        <p className="text-xs text-gray-400 mt-0.5">Email: {details.email_in_meta as string}</p>
                      )}
                      <p className="text-xs text-gray-300 mt-0.5">{fmt(entry.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
