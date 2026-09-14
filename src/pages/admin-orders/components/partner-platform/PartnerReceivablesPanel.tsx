// Partner Platform → Finance → Receivables.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// Three things live here and the boundaries between them are the point:
//
//   1. BILLING PROFILE — who we invoice, in what currency, on what schedule.
//      Weekly sending cannot be switched on until the billing email, the
//      Stripe Customer and the schedule are all set; the database refuses it.
//
//   2. CREATE PARTNER INVOICE — pick eligible unbilled orders for ONE partner
//      and send a Stripe invoice. The confirmation screen shows exactly what
//      Stripe will receive: PawTenant order id, service and charge. No customer
//      name, no pet name, no health information ever reaches a line item.
//
//   3. MARK PARTNER ORDER PAID — the partner counterpart of "Mark Provider
//      Payout Complete", and a DIFFERENT ledger. A paid Stripe invoice moves
//      its orders to `invoice_paid_unreconciled` and stops. A human settles
//      each order by hand. That action changes a billing state and nothing
//      else: no clinical status, no provider workflow, no document, no
//      customer email, no second provider earning.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { ConfirmDialog, EmptyState, Notice, Section, money, type PartnerOrg } from "./shared";
import { aggregateBillingSummaries, type BillingSummary } from "../../../../lib/partnerBillingSummary";

interface BillingProfile {
  partner_id: string;
  legal_business_name: string;
  billing_email: string | null;
  stripe_customer_id: string | null;
  currency: string;
  payment_terms_days: number;
  weekly_invoicing_enabled: boolean;
  invoice_weekday: number;
  invoice_hour: number;
  active: boolean;
}

interface InvoiceableOrder {
  order_id: string;
  confirmation_id: string;
  service: string;
  amount_cents: number;
  currency: string;
  completed_at: string;
  billable_event_id: string;
  rate_card_version: number;
}

interface UnreconciledRow {
  order_id: string;
  confirmation_id: string;
  invoice_status: string;
  wholesale_fee_cents: number;
  currency: string;
  invoice_id: string | null;
  invoice_number: string | null;
}

// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the summary row shape
// and the pure "All partners" aggregate live in src/lib/partnerBillingSummary.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NY_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "short", day: "2-digit",
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-gray-900">{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export default function PartnerReceivablesPanel({ selected }: { selected: PartnerOrg | null }) {
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [draft, setDraft] = useState<Partial<BillingProfile>>({});
  const [invoiceable, setInvoiceable] = useState<InvoiceableOrder[]>([]);
  const [unreconciled, setUnreconciled] = useState<UnreconciledRow[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [pickedOrders, setPickedOrders] = useState<Set<string>>(new Set());
  const [pickedRecon, setPickedRecon] = useState<Set<string>>(new Set());
  const [reconNote, setReconNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; tone?: "danger" | "primary"; run: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!selected) {
      // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — "All partners":
      // one row per organization from the same server function, summed here.
      // Money is summed only within one currency; a mixed set is flagged
      // rather than added together.
      const { data, error: err } = await supabase.rpc("partner_admin_billing_summary", { p_partner_id: null });
      if (err) setError(err.message);
      setSummary(aggregateBillingSummaries((data ?? []) as BillingSummary[]));
      setProfile(null); setInvoiceable([]); setUnreconciled([]);
      setPickedOrders(new Set()); setPickedRecon(new Set());
      setLoading(false);
      return;
    }
    const [p, inv, sum, unrec] = await Promise.all([
      supabase.from("partner_billing_profiles").select("*").eq("partner_id", selected.id).maybeSingle(),
      supabase.rpc("partner_admin_invoiceable_orders", { p_partner_id: selected.id }),
      supabase.rpc("partner_admin_billing_summary", { p_partner_id: selected.id }),
      supabase.from("partner_order_financials")
        .select("order_id, invoice_status, wholesale_fee_cents, currency, invoice_id")
        .eq("partner_id", selected.id)
        .eq("invoice_status", "invoice_paid_unreconciled"),
    ]);
    const prof = (p.data as BillingProfile | null) ?? null;
    setProfile(prof);
    setDraft(prof ?? { legal_business_name: selected.legal_name ?? selected.display_name, currency: "USD", payment_terms_days: 14, invoice_weekday: 1, invoice_hour: 9, active: true, weekly_invoicing_enabled: false });
    setInvoiceable((inv.data ?? []) as InvoiceableOrder[]);
    setSummary(((sum.data ?? [])[0] as BillingSummary) ?? null);

    // Decorate the unreconciled rows with their order id and invoice number so
    // the admin can see exactly which invoice each settlement belongs to.
    const rows = (unrec.data ?? []) as { order_id: string; invoice_status: string; wholesale_fee_cents: number; currency: string; invoice_id: string | null }[];
    if (rows.length > 0) {
      const [o, i] = await Promise.all([
        supabase.from("orders").select("id, confirmation_id").in("id", rows.map((r) => r.order_id)),
        supabase.from("partner_invoices").select("id, invoice_number")
          .in("id", rows.map((r) => r.invoice_id).filter(Boolean) as string[]),
      ]);
      const conf = new Map((o.data ?? []).map((x) => [x.id as string, x.confirmation_id as string]));
      const nums = new Map((i.data ?? []).map((x) => [x.id as string, x.invoice_number as string]));
      setUnreconciled(rows.map((r) => ({
        ...r,
        confirmation_id: conf.get(r.order_id) ?? r.order_id,
        invoice_number: r.invoice_id ? nums.get(r.invoice_id) ?? null : null,
      })));
    } else {
      setUnreconciled([]);
    }
    setPickedOrders(new Set());
    setPickedRecon(new Set());
    setLoading(false);
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  const saveProfile = async () => {
    if (!selected) return;
    setBusy("profile"); setError(""); setNotice("");
    try {
      const { error: err } = await supabase.rpc("partner_admin_upsert_billing_profile", {
        p_partner_id: selected.id,
        p_patch: {
          legal_business_name: draft.legal_business_name,
          billing_email: draft.billing_email ?? null,
          stripe_customer_id: draft.stripe_customer_id ?? null,
          currency: draft.currency,
          payment_terms_days: draft.payment_terms_days,
          weekly_invoicing_enabled: draft.weekly_invoicing_enabled,
          invoice_weekday: draft.invoice_weekday,
          invoice_hour: draft.invoice_hour,
          active: draft.active,
        },
      });
      if (err) throw err;
      setNotice("Billing profile saved.");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("partner_billing_weekly_ready")
        ? "Weekly invoicing needs an active profile with a billing email and a Stripe Customer ID before it can be enabled."
        : msg);
    } finally { setBusy(null); }
  };

  const picked = useMemo(() => invoiceable.filter((o) => pickedOrders.has(o.order_id)), [invoiceable, pickedOrders]);
  const pickedTotal = picked.reduce((s, o) => s + o.amount_cents, 0);

  const createInvoice = async () => {
    if (!selected || picked.length === 0) return;
    setBusy("invoice"); setError(""); setNotice("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Your admin session expired — sign in again.");
      const base = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string).replace(/\/$/, "");
      const res = await fetch(`${base}/functions/v1/partner-stripe-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partner_id: selected.id, order_ids: picked.map((o) => o.order_id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Invoice failed (${res.status})`);
      setNotice(`Invoice ${body.invoice_number} created and sent to ${body.billing_email} (${money(body.total_cents, body.currency)}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const markPaid = async () => {
    const ids = [...pickedRecon];
    if (ids.length === 0) return;
    setBusy("recon"); setError(""); setNotice("");
    try {
      const { data, error: err } = await supabase.rpc("partner_admin_mark_orders_paid", {
        p_order_ids: ids, p_note: reconNote.trim() || null,
      });
      if (err) throw err;
      setNotice(`${(data as { marked: number }).marked} partner order(s) marked paid. Clinical status, provider workflow and documents are unchanged.`);
      setReconNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  return (
    <>
      {/* ── Accounts summary ────────────────────────────────────────────── */}
      <Section
        title="Partner contribution"
        subtitle="Partner charges less provider cost and adjustments. Kept entirely apart from provider payout accounting."
      >
        <Notice notice={notice} error={error} />
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : summary ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Awaiting invoice" value={money(summary.awaiting_invoice_cents, summary.currency)}
              hint={`${summary.orders_awaiting_invoice} order(s)`} />
            <Stat label="Open invoices" value={money(summary.open_invoice_cents, summary.currency)}
              hint={`${summary.open_invoice_count} invoice(s)`} />
            <Stat label="Paid invoices" value={money(summary.paid_invoice_cents, summary.currency)}
              hint={`${summary.paid_invoice_count} invoice(s)`} />
            <Stat label="Awaiting reconciliation" value={money(summary.unreconciled_cents, summary.currency)}
              hint={`${summary.orders_unreconciled} order(s)`} />
            <Stat label="Orders marked paid" value={money(summary.paid_order_cents, summary.currency)}
              hint={`${summary.orders_paid} order(s)`} />
            <Stat label="Partner charges (completed)" value={money(summary.partner_charges_cents, summary.currency)}
              hint="frozen charges on clinically completed orders" />
            <Stat label="Provider cost (completed)" value={money(summary.provider_cost_cents, summary.currency)}
              hint="provider payout ledger, same orders" />
            <Stat label="Net partner contribution" value={money(summary.net_contribution_cents, summary.currency)}
              hint={`charges − provider cost − adjustments (${money(summary.adjustments_cents, summary.currency)})`} />
            <Stat label="In progress (not yet billable)" value={money(summary.in_progress_charges_cents, summary.currency)}
              hint={`${summary.orders_in_progress} order(s) · provider cost so far ${money(summary.in_progress_provider_cost_cents, summary.currency)}`} />
            {summary.orders_needing_reconciliation > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 sm:col-span-2 lg:col-span-4">
                <p className="text-xs font-semibold text-amber-800">
                  <i className="ri-error-warning-line mr-1"></i>
                  {summary.orders_needing_reconciliation} order(s) need financial reconciliation — a completed order with no provider cost evidence, or no financial snapshot. Values are flagged, never guessed.
                </p>
              </div>
            )}
          </div>
        ) : <EmptyState title="No contribution yet" hint={selected ? undefined : "Figures appear once a partner order exists. Mixed currencies are not summed."} />}
      </Section>

      {!selected && (
        <Section title="Billing profile, invoices and reconciliation">
          <EmptyState title="Select a partner" hint="Invoices are created and settled per organization. Choose a partner in the header to manage its billing profile, create an invoice or mark orders paid." />
        </Section>
      )}

      {selected && (<>
      {/* ── Billing profile ─────────────────────────────────────────────── */}
      <Section
        title="Billing profile"
        subtitle="Who Stripe invoices, and when. Weekly sending stays off until the email, Stripe Customer and schedule are configured."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Legal / business name</span>
            <input value={draft.legal_business_name ?? ""} onChange={(e) => setDraft({ ...draft, legal_business_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" /></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Billing email</span>
            <input type="email" value={draft.billing_email ?? ""} onChange={(e) => setDraft({ ...draft, billing_email: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" /></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Stripe Customer ID</span>
            <input value={draft.stripe_customer_id ?? ""} onChange={(e) => setDraft({ ...draft, stripe_customer_id: e.target.value })}
              placeholder="cus_…"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono outline-none focus:border-indigo-500" /></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Currency</span>
            <input value={draft.currency ?? "USD"} maxLength={3}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" /></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Payment terms (days)</span>
            <input type="number" min={0} max={120} value={draft.payment_terms_days ?? 14}
              onChange={(e) => setDraft({ ...draft, payment_terms_days: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" /></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Invoice weekday (America/New_York)</span>
            <select value={draft.invoice_weekday ?? 1} onChange={(e) => setDraft({ ...draft, invoice_weekday: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500">
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-600">Invoice hour (America/New_York)</span>
            <input type="number" min={0} max={23} value={draft.invoice_hour ?? 9}
              onChange={(e) => setDraft({ ...draft, invoice_hour: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" /></label>
          <label className="flex items-center gap-2 pt-5 text-sm text-gray-700">
            <input type="checkbox" checked={draft.active ?? true}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Billing profile active
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm text-gray-700">
            <input type="checkbox" checked={draft.weekly_invoicing_enabled ?? false}
              onChange={(e) => setDraft({ ...draft, weekly_invoicing_enabled: e.target.checked })} /> Send a weekly invoice automatically
          </label>
        </div>
        <div className="mt-3">
          <button type="button" disabled={busy === "profile"} onClick={() => void saveProfile()}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
            {busy === "profile" ? "Saving…" : "Save billing profile"}
          </button>
          {profile?.weekly_invoicing_enabled && (
            <span className="ml-3 text-xs text-gray-500">
              Weekly invoice every {WEEKDAYS[profile.invoice_weekday]} from {String(profile.invoice_hour).padStart(2, "0")}:00 New York time.
            </span>
          )}
        </div>
      </Section>

      {/* ── Create a Stripe invoice ─────────────────────────────────────── */}
      <Section
        title="Create partner invoice"
        subtitle="Eligible unbilled orders for this partner. Stripe only ever sees the PawTenant order id, the service and the charge."
      >
        {invoiceable.length === 0 ? (
          <EmptyState title="Nothing to invoice" hint="Charges become invoiceable when the clinical work completes." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">
                      <input type="checkbox"
                        checked={pickedOrders.size === invoiceable.length && invoiceable.length > 0}
                        onChange={(e) => setPickedOrders(e.target.checked ? new Set(invoiceable.map((o) => o.order_id)) : new Set())} />
                    </th>
                    <th className="py-2 pr-3">PawTenant order</th>
                    <th className="py-2 pr-3">Service</th>
                    <th className="py-2 pr-3">Completed</th>
                    <th className="py-2 pr-3">Rate</th>
                    <th className="py-2 pr-3 text-right">Charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoiceable.map((o) => (
                    <tr key={o.order_id}>
                      <td className="py-2 pr-3">
                        <input type="checkbox" checked={pickedOrders.has(o.order_id)}
                          onChange={(e) => {
                            const next = new Set(pickedOrders);
                            if (e.target.checked) next.add(o.order_id); else next.delete(o.order_id);
                            setPickedOrders(next);
                          }} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs font-semibold text-gray-900">{o.confirmation_id}</td>
                      <td className="py-2 pr-3 uppercase text-gray-600">{o.service}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{NY_DATE.format(new Date(o.completed_at))}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">v{o.rate_card_version}</td>
                      <td className="py-2 pr-3 text-right font-medium text-gray-900">{money(o.amount_cents, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={picked.length === 0 || busy === "invoice"}
                onClick={() => setConfirm({
                  title: "Create partner invoice",
                  tone: "primary",
                  confirmLabel: "Create and send",
                  body: `${selected.display_name} · ${picked.length} order(s) · ${money(pickedTotal, picked[0]?.currency ?? "USD")}\n` +
                        `Orders: ${picked.map((o) => o.confirmation_id).join(", ")}\n` +
                        `Billing email: ${profile?.billing_email ?? "not set"} · terms ${profile?.payment_terms_days ?? 14} days.\n` +
                        `Each Stripe line reads "<order id> — <SERVICE> clinical fulfillment". No customer or health information is sent.`,
                  run: () => void createInvoice(),
                })}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                {busy === "invoice" ? "Creating…" : "Create Partner Invoice"}
              </button>
              <span className="text-sm text-gray-600">
                {picked.length} selected · {money(pickedTotal, picked[0]?.currency ?? "USD")}
              </span>
            </div>
          </>
        )}
      </Section>

      {/* ── Manual reconciliation ───────────────────────────────────────── */}
      <Section
        title="Mark Partner Order Paid"
        subtitle="Orders inside a paid partner invoice, awaiting settlement. This records money only — it never completes an order, moves a provider or sends a customer anything."
      >
        {unreconciled.length === 0 ? (
          <EmptyState title="Nothing awaiting reconciliation" hint="Orders appear here once Stripe reports their invoice paid." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">
                      <input type="checkbox"
                        checked={pickedRecon.size === unreconciled.length && unreconciled.length > 0}
                        onChange={(e) => setPickedRecon(e.target.checked ? new Set(unreconciled.map((r) => r.order_id)) : new Set())} />
                    </th>
                    <th className="py-2 pr-3">PawTenant order</th>
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unreconciled.map((r) => (
                    <tr key={r.order_id}>
                      <td className="py-2 pr-3">
                        <input type="checkbox" checked={pickedRecon.has(r.order_id)}
                          onChange={(e) => {
                            const next = new Set(pickedRecon);
                            if (e.target.checked) next.add(r.order_id); else next.delete(r.order_id);
                            setPickedRecon(next);
                          }} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs font-semibold text-gray-900">{r.confirmation_id}</td>
                      <td className="py-2 pr-3 text-gray-600">{r.invoice_number ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-medium text-gray-900">{money(r.wholesale_fee_cents, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1">
                <span className="mb-1 block text-xs font-medium text-gray-600">Reconciliation note (optional)</span>
                <input value={reconNote} onChange={(e) => setReconNote(e.target.value)}
                  placeholder="e.g. matched to Stripe payout 2026-09-12"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" />
              </label>
              <button type="button" disabled={pickedRecon.size === 0 || busy === "recon"}
                onClick={() => setConfirm({
                  title: "Mark partner orders paid",
                  tone: "primary",
                  confirmLabel: `Mark ${pickedRecon.size} paid`,
                  body: "This records the partner settlement for the selected orders. Clinical status, provider workflow, documents, customer communications and provider earnings are all unchanged.",
                  run: () => void markPaid(),
                })}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                {busy === "recon" ? "Recording…" : `Mark ${pickedRecon.size || ""} Partner Order Paid`}
              </button>
            </div>
          </>
        )}
      </Section>
      </>)}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone ?? "danger"}
          onConfirm={() => { confirm.run(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
