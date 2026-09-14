// Partner Portal → Orders.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// Shows ONLY this partner's orders. The list comes from
// `partner_portal_orders()`, whose WHERE clause is `current_partner_id()` —
// this component never sends a partner id, so there is nothing to tamper with.
//
// COLUMNS ARE DELIBERATELY LIMITED. A partner sees the PawTenant order id,
// their own reference, the service, the customer, the animals, the submission
// date in America/New_York, a high-level clinical status and their billing
// status. Provider identity, provider pay, PawTenant margin and internal
// workflow notes are not in the projection at all — they cannot leak from a
// column that was never selected.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import type { PartnerPortalContext } from "../page";

interface PortalOrder {
  order_id: string;
  confirmation_id: string;
  partner_reference: string | null;
  service: string;
  customer_name: string | null;
  pet_names: string | null;
  pet_count: number;
  submitted_at: string | null;
  clinical_status: string | null;
  billing_status: string;
  invoice_number: string | null;
  invoice_status: string | null;
  partner_charge_cents: number | null;
  currency: string;
  document_available: boolean;
  clinical_completed_at: string | null;
}

export interface PortalDraft {
  id: string;
  service: string | null;
  form: Record<string, unknown> | null;
  questionnaire_text: string | null;
  partner_reference: string | null;
  updated_at: string;
}

/** Submission dates are shown on the America/New_York business day, the same
 *  clock the admin side reports on. */
const NY_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "short", day: "2-digit",
});
const nyDate = (iso: string | null) => (iso ? NY_DATE.format(new Date(iso)) : "—");

const money = (cents: number | null, currency = "USD") =>
  cents === null || cents === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/** Partner-safe clinical vocabulary. Anything unmapped is humanised rather
 *  than shown raw, and nothing here names a provider or a workflow queue. */
const CLINICAL_LABELS: Record<string, string> = {
  received: "Received",
  ready_for_assignment: "In queue",
  provider_review: "In clinical review",
  consultation_required: "More information needed",
  document_ready: "Document ready",
  clinical_work_completed: "Completed",
  correction_required: "Correction in progress",
  validation_hold: "On hold",
  cancelled: "Cancelled",
};

const BILLING_LABELS: Record<string, string> = {
  uninvoiced: "Not yet invoiced",
  invoiced: "Invoiced",
  invoice_paid_unreconciled: "Payment received",
  paid: "Paid",
  void: "Voided",
  credited: "Credited",
};

const BILLING_STYLES: Record<string, string> = {
  uninvoiced: "bg-gray-100 text-gray-600 border-gray-200",
  invoiced: "bg-amber-50 text-amber-700 border-amber-200",
  invoice_paid_unreconciled: "bg-sky-50 text-sky-700 border-sky-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
  credited: "bg-violet-50 text-violet-700 border-violet-200",
};

const humanise = (v: string | null) =>
  !v ? "—" : v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function PartnerPortalOrders({ ctx, reloadToken = 0, onNewOrder }: {
  ctx: PartnerPortalContext;
  /** Bumped by the page after the wizard closes so the list refetches. */
  reloadToken?: number;
  /** PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: New Order is a
   *  top-level tab; the page owns the wizard. A saved draft resumes there. */
  onNewOrder: (draft: PortalDraft | null) => void;
}) {
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [drafts, setDrafts] = useState<PortalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: row detail + document retrieval.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const retrieveDocument = async (orderId: string) => {
    setDocBusy(orderId);
    setDocError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sign in again to retrieve documents.");
      const { data, error: err } = await supabase.functions.invoke("partner-portal-document", {
        body: { order_id: orderId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (err) throw err;
      const url = (data as { document?: { download_url?: string } } | null)?.document?.download_url;
      if (!url) {
        const code = (data as { error?: { code?: string } } | null)?.error?.code;
        throw new Error(code === "document_not_ready" ? "The document is not ready yet." : "The document could not be retrieved.");
      }
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "The document could not be retrieved.");
    } finally {
      setDocBusy(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [o, d] = await Promise.all([
      supabase.rpc("partner_portal_orders", { p_limit: 200, p_offset: 0 }),
      supabase.rpc("partner_portal_drafts"),
    ]);
    if (o.error) setError(o.error.message);
    setOrders((o.data ?? []) as PortalOrder[]);
    setDrafts((d.data ?? []) as PortalDraft[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, reloadToken]);

  const deleteDraft = async (id: string) => {
    const { error: err } = await supabase.rpc("partner_portal_delete_draft", { p_draft_id: id });
    if (err) { setError(err.message); return; }
    void load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Every order {ctx.display_name} has submitted to PawTenant.
          </p>
        </div>
        <button type="button" onClick={() => onNewOrder(null)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black cursor-pointer">
          <i className="ri-add-line"></i>New Order
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {docError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{docError}</div>
      )}

      {drafts.length > 0 && (
        <section className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Saved drafts</h3>
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {drafts.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {d.service ? d.service.toUpperCase() : "Unfinished"} draft
                    {d.partner_reference ? ` · ${d.partner_reference}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">Last saved {nyDate(d.updated_at)}</p>
                </div>
                <button type="button" onClick={() => onNewOrder(d)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
                  Continue
                </button>
                <button type="button" onClick={() => void deleteDraft(d.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5 font-semibold">PawTenant Order ID</th>
                <th className="px-4 py-2.5 font-semibold">Your reference</th>
                <th className="px-4 py-2.5 font-semibold">Service</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Animals</th>
                <th className="px-4 py-2.5 font-semibold">Submitted</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Billing</th>
                <th className="px-4 py-2.5 font-semibold">Invoice</th>
                <th className="px-4 py-2.5 font-semibold">Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && orders.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                  No orders yet. Use <span className="font-semibold">New Order</span> to submit one.
                </td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.order_id}
                  tabIndex={0}
                  role="button"
                  aria-expanded={openOrderId === o.order_id}
                  aria-label={`Order ${o.confirmation_id}`}
                  onClick={() => setOpenOrderId((cur) => (cur === o.order_id ? null : o.order_id))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenOrderId((cur) => (cur === o.order_id ? null : o.order_id)); } }}
                  className={`cursor-pointer hover:bg-gray-50/60 focus:outline-none focus-visible:bg-gray-100 ${openOrderId === o.order_id ? "bg-gray-50" : ""}`}>
                  <td className="px-4 py-2.5 font-mono text-[12.5px] font-semibold text-gray-900">{o.confirmation_id}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {o.partner_reference && !o.partner_reference.startsWith("portal-") ? o.partner_reference : "—"}
                  </td>
                  <td className="px-4 py-2.5 uppercase text-gray-700 font-semibold text-xs">{o.service}</td>
                  <td className="px-4 py-2.5 text-gray-900">{o.customer_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {o.pet_names || `${o.pet_count} animal${o.pet_count === 1 ? "" : "s"}`}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{nyDate(o.submitted_at)}</td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {CLINICAL_LABELS[o.clinical_status ?? ""] ?? humanise(o.clinical_status)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${
                      BILLING_STYLES[o.billing_status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {BILLING_LABELS[o.billing_status] ?? humanise(o.billing_status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {o.invoice_number ?? "—"}
                    {o.partner_charge_cents !== null && (
                      <span className="block text-[11px] text-gray-400">
                        {money(o.partner_charge_cents, o.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {o.document_available ? (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); void retrieveDocument(o.order_id); }}
                        disabled={docBusy === o.order_id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50 cursor-pointer">
                        <i className="ri-download-2-line"></i>{docBusy === o.order_id ? "Preparing…" : "Download"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Not ready</span>
                    )}
                  </td>
                </tr>
              ))}
              {openOrderId && (() => {
                const o = orders.find((x) => x.order_id === openOrderId);
                if (!o) return null;
                return (
                  <tr key={`${o.order_id}-detail`} className="bg-gray-50/80">
                    <td colSpan={10} className="px-4 py-4">
                      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Order ID</p><p className="font-mono font-semibold text-gray-900">{o.confirmation_id}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Your reference</p><p className="text-gray-900">{o.partner_reference && !o.partner_reference.startsWith("portal-") ? o.partner_reference : "—"}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Workflow status</p><p className="text-gray-900">{CLINICAL_LABELS[o.clinical_status ?? ""] ?? humanise(o.clinical_status)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Completed</p><p className="text-gray-900">{o.clinical_completed_at ? nyDate(o.clinical_completed_at) : "Not yet"}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Customer</p><p className="text-gray-900">{o.customer_name ?? "—"}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Animals</p><p className="text-gray-900">{o.pet_names || `${o.pet_count} animal${o.pet_count === 1 ? "" : "s"}`}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Billing</p><p className="text-gray-900">{BILLING_LABELS[o.billing_status] ?? humanise(o.billing_status)}{o.invoice_number ? ` · ${o.invoice_number}` : ""}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Document</p><p className="text-gray-900">{o.document_available ? "Ready to download" : "Available once the clinical review is complete"}</p></div>
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Submitted orders cannot be edited. Contact PawTenant if something needs to change.
      </p>
    </div>
  );
}
