// PartnerFinanceTab — PARTNER-PLATFORM-ADMIN-WORKSPACE-001.
//
// The Finance sub-tab of the Partner Platform workspace. This is the Slice 7
// finance surface (formerly the PartnerFinancePanel accordion under Partner
// Orders) reorganized into a first-class screen with a partner filter, status
// and date filters, invoice search and explicit confirmation before every
// sensitive action.
//
// FINANCIAL LOGIC LIVES SERVER-SIDE, UNCHANGED:
//   * reads through is_chat_admin()-gated RLS;
//   * writes ONLY through the Slice 7 SECURITY DEFINER RPCs
//     (partner_create_draft_invoice / partner_issue_invoice /
//      partner_void_invoice / partner_record_invoice_payment);
//   * invoice PDFs render once from frozen snapshots via partner-invoice-pdf;
//   * billable amounts stay acceptance-frozen; nothing here edits a rate.
//
// Scope guard: wholesale economics — mounts ONLY inside the admin Partner
// Platform workspace. Never import into provider- or customer-facing surfaces.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import PartnerReceivablesPanel from "./PartnerReceivablesPanel";
import {
  type PartnerOrg, money, Badge, ConfirmDialog, EmptyState, Notice, Section, useDebounced,
} from "./shared";

interface FinanceOrderRow {
  id: string;
  confirmation_id: string;
  partner_id: string | null;
  partner_order_id: string | null;
  letter_type: string | null;
  doctor_status: string | null;
}

interface FinancialsRow {
  order_id: string;
  billable_status: string;
  wholesale_fee_cents: number;
  currency: string;
}

interface SnapshotRow {
  order_id: string;
  target_assessment_version: string;
}

interface EventRow {
  id: string;
  order_id: string;
  partner_id: string;
  service: string;
  event_kind: string;
  event_type: string;
  amount_cents: number;
  occurred_at: string;
}

interface LineRow { billable_event_id: string; invoice_id: string }

interface AgingRow {
  id: string;
  partner_id: string;
  partner_name: string;
  invoice_number: string;
  status: string;
  currency: string;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  issued_at: string | null;
  due_at: string | null;
  is_overdue: boolean;
  days_overdue: number;
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 ring-gray-300",
  issued: "bg-blue-50 text-blue-700 ring-blue-200",
  partially_paid: "bg-amber-50 text-amber-700 ring-amber-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  void: "bg-gray-100 text-gray-500 ring-gray-300",
};

const INVOICE_FILTERS = ["all", "draft", "issued", "partially_paid", "paid", "overdue", "void"] as const;
type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

interface OrderFinanceRow {
  order_id: string; confirmation_id: string; partner_id: string; partner_name: string; partner_reference: string | null;
  service: string; intake_method: string; created_at: string; clinical_state: string | null;
  billable_status: string; charge_cents: number; rate_card_version: number | null;
  provider_cost_cents: number; provider_cost_known: boolean; adjustments_cents: number; net_contribution_cents: number;
  invoice_status: string; invoice_number: string | null; invoice_payment_status: string | null;
  manual_paid_at: string | null; manual_paid_by: string | null;
  needs_reconciliation: boolean; reconciliation_reason: string | null; currency: string;
}

export default function PartnerFinanceTab({
  partners, selected,
}: {
  partners: PartnerOrg[];
  selected: PartnerOrg | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [orders, setOrders] = useState<FinanceOrderRow[]>([]);
  const [financials, setFinancials] = useState<FinancialsRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [invoices, setInvoices] = useState<AgingRow[]>([]);
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the per-order finance
  // snapshot from ONE server function (partner_admin_order_finance_rows) —
  // the same numbers the Payments tab and the billing summary read.
  const [finRows, setFinRows] = useState<OrderFinanceRow[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; run: () => void } | null>(null);

  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the partner scope is
  // the WORKSPACE header's choice (URL ?partner=) — one scope control, not two.
  // null = All partners, and every card and list below widens with it.
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");
  const [invoiceSearchInput, setInvoiceSearchInput] = useState("");
  const invoiceSearch = useDebounced(invoiceSearchInput.trim().toLowerCase());
  const [eventsFrom, setEventsFrom] = useState("");
  const [eventsTo, setEventsTo] = useState("");

  const scopePartnerId = selected?.id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, f, s, e, l, i, fr] = await Promise.all([
        supabase.from("orders")
          .select("id, confirmation_id, partner_id, partner_order_id, letter_type, doctor_status")
          .eq("order_origin", "partner")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("partner_order_financials")
          .select("order_id, billable_status, wholesale_fee_cents, currency").limit(1000),
        supabase.from("partner_assessment_snapshots")
          .select("order_id, target_assessment_version").limit(1000),
        supabase.from("partner_billable_events")
          .select("id, order_id, partner_id, service, event_kind, event_type, amount_cents, occurred_at")
          .order("occurred_at", { ascending: false }).limit(1000),
        supabase.from("partner_invoice_lines").select("billable_event_id, invoice_id").limit(2000),
        supabase.from("partner_invoice_aging").select("*").order("issued_at", { ascending: false, nullsFirst: true }).limit(500),
        supabase.rpc("partner_admin_order_finance_rows", { p_partner_id: null }),
      ]);
      const firstErr = [o, f, s, e, l, i, fr].find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
      setFinRows((fr.data as OrderFinanceRow[]) ?? []);
      setOrders((o.data as FinanceOrderRow[]) ?? []);
      setFinancials((f.data as FinancialsRow[]) ?? []);
      setSnapshots((s.data as SnapshotRow[]) ?? []);
      setEvents((e.data as EventRow[]) ?? []);
      setLines((l.data as LineRow[]) ?? []);
      setInvoices((i.data as AgingRow[]) ?? []);
    } catch (err) {
      console.error("[partner-finance] load failed:", err);
      setError("Could not load partner finance data (admin/finance access required).");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invoiceById = useMemo(() => new Map(invoices.map((x) => [x.id, x])), [invoices]);
  const financialsByOrder = useMemo(() => new Map(financials.map((x) => [x.order_id, x])), [financials]);
  const snapshotByOrder = useMemo(() => new Map(snapshots.map((x) => [x.order_id, x])), [snapshots]);
  const orderById = useMemo(() => new Map(orders.map((x) => [x.id, x])), [orders]);
  const partnerName = useCallback(
    (id: string | null) => partners.find((p) => p.id === id)?.display_name ?? "Partner",
    [partners],
  );

  // An event is billed when it sits on a line of a NON-void invoice.
  const billedInvoiceForEvent = useCallback((eventId: string): AgingRow | null => {
    for (const ln of lines) {
      if (ln.billable_event_id !== eventId) continue;
      const inv = invoiceById.get(ln.invoice_id);
      if (inv && inv.status !== "void") return inv;
    }
    return null;
  }, [lines, invoiceById]);

  const inPartnerScope = useCallback(
    (partnerId: string | null) => !scopePartnerId || partnerId === scopePartnerId,
    [scopePartnerId],
  );

  const scopedOrders = useMemo(
    () => orders.filter((o) => inPartnerScope(o.partner_id)),
    [orders, inPartnerScope],
  );
  const scopedFinRows = useMemo(
    () => finRows.filter((r) => inPartnerScope(r.partner_id)),
    [finRows, inPartnerScope],
  );
  void scopedOrders;
  void financialsByOrder;

  const scopedEvents = useMemo(() => events.filter((e) => {
    if (!inPartnerScope(e.partner_id)) return false;
    if (eventsFrom && e.occurred_at < `${eventsFrom}T00:00:00`) return false;
    if (eventsTo && e.occurred_at > `${eventsTo}T23:59:59`) return false;
    return true;
  }), [events, inPartnerScope, eventsFrom, eventsTo]);

  const unbilledCharges = useMemo(
    () => scopedEvents.filter((e) => e.event_kind === "charge" && !billedInvoiceForEvent(e.id)),
    [scopedEvents, billedInvoiceForEvent],
  );

  const visibleInvoices = useMemo(() => invoices.filter((inv) => {
    if (!inPartnerScope(inv.partner_id)) return false;
    if (invoiceFilter === "overdue") { if (!inv.is_overdue) return false; }
    else if (invoiceFilter !== "all" && inv.status !== invoiceFilter) return false;
    if (invoiceSearch && !inv.invoice_number.toLowerCase().includes(invoiceSearch)) return false;
    return true;
  }), [invoices, inPartnerScope, invoiceFilter, invoiceSearch]);

  /** Truthful PSD intake state: canonical snapshot, or unsupported/unassignable. */
  const intakeLabel = useCallback((o: FinanceOrderRow): { label: string; tone: string } => {
    if ((o.letter_type ?? "").toLowerCase() !== "psd") return { label: "ESA — n/a", tone: "text-gray-500" };
    const snap = snapshotByOrder.get(o.id);
    if (snap) return { label: `Canonical (${snap.target_assessment_version})`, tone: "text-emerald-700" };
    return { label: "Unsupported intake — unassignable", tone: "text-red-600" };
  }, [snapshotByOrder]);

  const toggle = (id: string) => setSelectedEvents((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(label);
    setNotice("");
    setError("");
    try {
      const { error: err } = await fn();
      if (err) setError(`${label} failed: ${err.message}`);
      else { setNotice(`${label} done.`); setSelectedEvents(new Set()); await load(); }
    } finally {
      setBusy(null);
    }
  };

  const createDraft = () => {
    const chosen = events.filter((e) => selectedEvents.has(e.id));
    if (chosen.length === 0) return;
    const partnerIds = new Set(chosen.map((e) => e.partner_id));
    if (partnerIds.size > 1) {
      setError("An invoice belongs to one partner — select events for a single partner.");
      return;
    }
    setConfirm({
      title: "Create draft invoice",
      body: `Create a draft invoice for ${partnerName(chosen[0].partner_id)} from ${chosen.length} billable event${chosen.length === 1 ? "" : "s"} totalling ${money(chosen.reduce((a, e) => a + e.amount_cents, 0))}? Drafts can still be voided before issuing.`,
      confirmLabel: "Create draft",
      run: () => void run("Create draft invoice", () =>
        supabase.rpc("partner_create_draft_invoice", {
          p_partner_id: chosen[0].partner_id,
          p_event_ids: chosen.map((e) => e.id),
        })),
    });
  };

  const issue = (inv: AgingRow) => setConfirm({
    title: `Issue ${inv.invoice_number}`,
    body: `Issuing freezes this invoice permanently — its lines and totals become an immutable record of ${money(inv.total_cents, inv.currency)}. Continue?`,
    confirmLabel: "Issue invoice",
    run: () => void run(`Issue ${inv.invoice_number}`, () =>
      supabase.rpc("partner_issue_invoice", { p_invoice_id: inv.id })),
  });

  const voidInvoice = (inv: AgingRow) => {
    const reason = window.prompt(`Void ${inv.invoice_number} — reason (required):`);
    if (!reason?.trim()) return;
    setConfirm({
      title: `Void ${inv.invoice_number}`,
      body: `Voiding releases its billable events for rebilling and produces a separate void notice. Reason: "${reason.trim()}". Continue?`,
      confirmLabel: "Void invoice",
      run: () => void run(`Void ${inv.invoice_number}`, () =>
        supabase.rpc("partner_void_invoice", { p_invoice_id: inv.id, p_reason: reason.trim() })),
    });
  };

  const recordPayment = (inv: AgingRow) => {
    const raw = window.prompt(`Record payment for ${inv.invoice_number} — amount in USD (balance ${money(inv.balance_cents)}):`);
    if (!raw) return;
    const cents = Math.round(Number(raw) * 100);
    if (!Number.isFinite(cents) || cents === 0) { setError("Enter a non-zero amount."); return; }
    const reference = window.prompt("Payment reference (wire/check id, optional):") ?? undefined;
    setConfirm({
      title: `Record payment on ${inv.invoice_number}`,
      body: `Record a ${money(cents)} payment${reference ? ` (ref ${reference})` : ""}? Payment records are append-only.`,
      confirmLabel: "Record payment",
      run: () => void run(`Record payment on ${inv.invoice_number}`, () =>
        supabase.rpc("partner_record_invoice_payment", {
          p_invoice_id: inv.id, p_amount_cents: cents, p_method: "manual", p_reference: reference || null,
        })),
    });
  };

  // Slice 8 · Part D: rendered PDFs are immutable administrative records —
  // the edge function renders once from the frozen invoice snapshot, then
  // returns the SAME artifact (re-signed) forever. Never emailed from here.
  const openInvoicePdf = async (inv: AgingRow, kind: "invoice" | "void_notice") => {
    setBusy(`pdf:${inv.id}:${kind}`);
    setNotice("");
    setError("");
    try {
      const { data, error: err } = await supabase.functions.invoke("partner-invoice-pdf", {
        body: { invoiceId: inv.id, kind },
      });
      const res = data as { ok?: boolean; signedUrl?: string; error?: string } | null;
      if (err || !res?.ok || !res.signedUrl) {
        setError(`PDF for ${inv.invoice_number} failed: ${res?.error ?? err?.message ?? "unknown error"}`);
        return;
      }
      window.open(res.signedUrl, "_blank", "noopener");
      setNotice(`${kind === "void_notice" ? "Void notice" : "Invoice"} PDF ready for ${inv.invoice_number}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Notice notice={notice} error={error} />
      {loading && <p className="text-sm text-gray-500">Loading finance data…</p>}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Partner scope</span>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" data-finance-scope={scopePartnerId ?? "all"}>
              {selected ? selected.display_name : "All partners"}
              <span className="ml-1 text-xs text-gray-400">(header selector)</span>
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Invoice status</span>
            <select
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value as InvoiceFilter)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {INVOICE_FILTERS.map((f) => (
                <option key={f} value={f}>{f === "all" ? "All statuses" : f.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Invoice search</span>
            <input
              type="text"
              value={invoiceSearchInput}
              onChange={(e) => setInvoiceSearchInput(e.target.value)}
              placeholder="Invoice number"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Events from</span>
              <input type="date" value={eventsFrom} onChange={(e) => setEventsFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Events to</span>
              <input type="date" value={eventsTo} onChange={(e) => setEventsTo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Order finance roll-up ──────────────────────────────────────────── */}
      {/* PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — Stripe
          receivables, the billing profile and MANUAL per-order reconciliation.
          Mounted above the existing ledger views, which are unchanged. */}
      <PartnerReceivablesPanel selected={selected} />

      <Section
        title="Order finance status"
        subtitle="Per order: frozen partner charge − provider cost − adjustments = net contribution, with clinical, invoice and manual-paid state kept as separate facts."
      >
        {scopedFinRows.length === 0 ? (
          <EmptyState title="No partner orders in scope" hint="Charges are frozen at acceptance and become billable when clinical work completes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Partner ref</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">PSD intake</th>
                  <th className="py-2 pr-3">Clinical</th>
                  <th className="py-2 pr-3 text-right">Charge</th>
                  <th className="py-2 pr-3 text-right">Provider cost</th>
                  <th className="py-2 pr-3 text-right">Adjust.</th>
                  <th className="py-2 pr-3 text-right">Net</th>
                  <th className="py-2 pr-3">Invoice</th>
                  <th className="py-2 pr-3">Marked paid</th>
                </tr>
              </thead>
              <tbody>
                {scopedFinRows.map((r) => {
                  const o = orderById.get(r.order_id);
                  const intake = o ? intakeLabel(o) : { label: "—", tone: "text-gray-400" };
                  return (
                    <tr key={r.order_id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs">
                        {r.confirmation_id}
                        {r.needs_reconciliation && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200" title={r.reconciliation_reason ?? ""}>
                            Needs financial reconciliation
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.partner_reference ?? "—"}</td>
                      <td className="py-2 pr-3 uppercase">{r.service}</td>
                      <td className={`py-2 pr-3 ${intake.tone}`}>{intake.label}</td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        {r.clinical_state ?? "—"}
                        <span className="block text-[11px] text-gray-400">{r.billable_status}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.charge_cents, r.currency)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.provider_cost_known ? money(r.provider_cost_cents, r.currency) : <span className="text-amber-700">not yet</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.adjustments_cents, r.currency)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold">{money(r.net_contribution_cents, r.currency)}</td>
                      <td className="py-2 pr-3 text-xs">
                        {r.invoice_number
                          ? <span className="font-mono">{r.invoice_number} · {r.invoice_payment_status ?? r.invoice_status}</span>
                          : <span className={r.billable_status === "billable" ? "text-amber-700" : "text-gray-400"}>{r.invoice_status}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        {r.manual_paid_at ? `${r.manual_paid_by ?? "admin"} · ${new Date(r.manual_paid_at).toLocaleDateString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Unbilled events → draft invoice ───────────────────────────────── */}
      <Section
        title="Unbilled billable events"
        subtitle={`Unbilled balance in scope: ${money(unbilledCharges.reduce((a, e) => a + e.amount_cents, 0))}`}
        actions={
          <button
            type="button"
            disabled={selectedEvents.size === 0 || busy !== null}
            onClick={createDraft}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Create draft invoice ({selectedEvents.size})
          </button>
        }
      >
        {unbilledCharges.length === 0 ? (
          <EmptyState title="Nothing unbilled" hint="Every completed charge in scope already sits on an invoice." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3"></th>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Partner</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Occurred</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {unbilledCharges.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedEvents.has(e.id)}
                        onChange={() => toggle(e.id)}
                        aria-label={`Select event for ${orderById.get(e.order_id)?.confirmation_id ?? e.order_id}`}
                      />
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{orderById.get(e.order_id)?.confirmation_id ?? "…"}</td>
                    <td className="py-2 pr-3">{partnerName(e.partner_id)}</td>
                    <td className="py-2 pr-3 uppercase">{e.service}</td>
                    <td className="py-2 pr-3">{e.event_type}</td>
                    <td className="py-2 pr-3">{new Date(e.occurred_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(e.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Invoices & aging ──────────────────────────────────────────────── */}
      <Section
        title="Invoices, payments & aging"
        subtitle="Issued invoices are immutable snapshots; a void produces its own separate notice artifact."
      >
        {visibleInvoices.length === 0 ? (
          <EmptyState
            title={invoices.length === 0 ? "No invoices yet" : "No invoice matches these filters"}
            hint={invoices.length === 0 ? "Draft an invoice from unbilled events above." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Invoice</th>
                  <th className="py-2 pr-3">Partner</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Paid</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="py-2 pr-3">{inv.partner_name}</td>
                    <td className="py-2 pr-3">
                      <Badge label={inv.status.replace("_", " ")} tone={STATUS_TONE[inv.status] ?? ""} />
                      {inv.is_overdue && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                          overdue {inv.days_overdue}d
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(inv.total_cents, inv.currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(inv.paid_cents, inv.currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(inv.balance_cents, inv.currency)}</td>
                    <td className="py-2 pr-3">{inv.due_at ? new Date(inv.due_at).toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        {inv.status === "draft" && (
                          <button type="button" disabled={busy !== null} onClick={() => issue(inv)}
                            className="rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-700 disabled:opacity-40">
                            Issue
                          </button>
                        )}
                        {(inv.status === "issued" || inv.status === "partially_paid") && (
                          <button type="button" disabled={busy !== null} onClick={() => recordPayment(inv)}
                            className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700 disabled:opacity-40">
                            Record payment
                          </button>
                        )}
                        {inv.status !== "void" && inv.status !== "paid" && (
                          <button type="button" disabled={busy !== null} onClick={() => voidInvoice(inv)}
                            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 disabled:opacity-40">
                            Void
                          </button>
                        )}
                        {(inv.status === "issued" || inv.status === "partially_paid" || inv.status === "paid") && (
                          <button type="button" disabled={busy !== null} onClick={() => void openInvoicePdf(inv, "invoice")}
                            className="rounded border border-indigo-300 px-2 py-0.5 text-xs text-indigo-700 disabled:opacity-40">
                            Invoice PDF
                          </button>
                        )}
                        {inv.status === "void" && (
                          <button type="button" disabled={busy !== null} onClick={() => void openInvoicePdf(inv, "void_notice")}
                            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 disabled:opacity-40">
                            Void notice PDF
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          tone="primary"
          onConfirm={() => { const r = confirm.run; setConfirm(null); r(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
