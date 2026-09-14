// Partner receivables through Stripe Invoices.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// Shared by the admin action (`partner-stripe-invoice`) and the scheduled job
// (`partner-weekly-invoices`) so a weekly invoice and a hand-made one are
// produced by exactly the same code.
//
// THE PHI RULE, ENCODED
//   A Stripe invoice line is built ONLY from the PawTenant order id, the
//   service and the charge. `assertNoCustomerData` re-checks every description
//   before it is sent, because "we would never put a name there" is a promise
//   and this is a control. Stripe is an external processor; a customer name, a
//   pet name or a questionnaire answer must never reach it.
//
// THE ORDERING RULE
//   PawTenant's own invoice row and its order locks are written FIRST, by
//   `partner_prepare_invoice`. Only then is Stripe called. A Stripe failure
//   therefore leaves a draft invoice we can retry or void — never an order that
//   was silently billed twice, and never orders left unbilled with money
//   collected.

const STRIPE_API = "https://api.stripe.com/v1";

export interface PreparedLine {
  line_id: string;
  description: string;
  amount_cents: number;
  service: string;
}

export interface PreparedInvoice {
  invoice_id: string;
  already_existed: boolean;
  invoice_number: string;
  total_cents: number;
  currency: string;
  status: string;
  billing_email?: string;
  stripe_customer_id?: string | null;
  due_at?: string;
  lines?: PreparedLine[];
}

/**
 * A description may contain the PawTenant order id, the service word and the
 * fixed phrase. Anything else — in particular an `@`, a digit run that looks
 * like a phone number, or more words than the template can produce — is
 * treated as a leak and refuses the send.
 */
const DESCRIPTION_RE = /^PT-[A-Z0-9]+ — (ESA|PSD) clinical fulfillment$/;

export function assertNoCustomerData(lines: PreparedLine[]): void {
  for (const l of lines) {
    if (!DESCRIPTION_RE.test(l.description)) {
      throw new Error(
        `invoice line description is not the canonical order-id form — refusing to send it to Stripe`,
      );
    }
  }
}

function form(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, String(v));
  }
  return body.toString();
}

async function stripe(
  key: string, path: string, params: Record<string, string | number | undefined>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, { method: "POST", headers, body: form(params) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return json as Record<string, unknown>;
}

async function stripeGet(key: string, path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

export interface SendResult {
  stripe_customer_id: string;
  stripe_invoice_id: string;
  stripe_invoice_number: string | null;
  hosted_invoice_url: string | null;
  stripe_status: string;
  idempotency_key: string;
}

/**
 * Create, finalize and send ONE Stripe invoice for an already-prepared
 * PawTenant invoice.
 *
 * Idempotency is keyed on the PawTenant invoice id, so a retry after a timeout
 * returns Stripe's original objects instead of creating a second invoice.
 */
export async function createAndSendStripeInvoice(opts: {
  stripeKey: string;
  prepared: PreparedInvoice;
  billingEmail: string;
  legalName: string;
  currency: string;
  dueDays: number;
  existingCustomerId: string | null;
}): Promise<SendResult> {
  const { stripeKey, prepared, billingEmail, legalName, currency, dueDays } = opts;
  const lines = prepared.lines ?? [];
  if (lines.length === 0) throw new Error("prepared invoice has no lines");
  assertNoCustomerData(lines);

  const idem = `ptinv:${prepared.invoice_id}`;

  // 1. Verified Stripe Customer, reused when the billing profile already names
  //    one and that customer still exists.
  let customerId = opts.existingCustomerId ?? "";
  if (customerId) {
    const existing = await stripeGet(stripeKey, `/customers/${customerId}`);
    if (!existing || existing.deleted === true) customerId = "";
  }
  if (!customerId) {
    const created = await stripe(stripeKey, "/customers", {
      email: billingEmail,
      name: legalName,
      "metadata[pawtenant_partner_id]": "",
    }, `${idem}:customer`);
    customerId = String(created.id);
  }

  // 2. The invoice shell, then one line per order.
  const invoice = await stripe(stripeKey, "/invoices", {
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: Math.max(dueDays, 0),
    currency: currency.toLowerCase(),
    auto_advance: "false",
    description: `PawTenant clinical fulfillment — invoice ${prepared.invoice_number}`,
    "metadata[pawtenant_invoice_id]": prepared.invoice_id,
    "metadata[pawtenant_invoice_number]": prepared.invoice_number,
    "metadata[pawtenant_kind]": "partner_receivable",
  }, idem);
  const stripeInvoiceId = String(invoice.id);

  for (const l of lines) {
    await stripe(stripeKey, "/invoiceitems", {
      customer: customerId,
      invoice: stripeInvoiceId,
      currency: currency.toLowerCase(),
      amount: l.amount_cents,
      description: l.description,
      "metadata[pawtenant_line_id]": l.line_id,
    }, `${idem}:line:${l.line_id}`);
  }

  // 3. Finalize, then send.
  const finalized = await stripe(stripeKey, `/invoices/${stripeInvoiceId}/finalize`, {}, `${idem}:finalize`);
  const sent = await stripe(stripeKey, `/invoices/${stripeInvoiceId}/send`, {}, `${idem}:send`)
    .catch(() => finalized);

  return {
    stripe_customer_id: customerId,
    stripe_invoice_id: stripeInvoiceId,
    stripe_invoice_number: (sent.number ?? finalized.number ?? null) as string | null,
    hosted_invoice_url: (sent.hosted_invoice_url ?? finalized.hosted_invoice_url ?? null) as string | null,
    stripe_status: String(sent.status ?? finalized.status ?? "open"),
    idempotency_key: idem,
  };
}
