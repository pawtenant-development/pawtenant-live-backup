// partner-invoice-pdf
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part D
//
// Renders the immutable partner invoice / remittance PDF.
//
// SOURCE OF TRUTH: the frozen invoice snapshot only — partner_invoices (whose
// financial identity froze at issue), partner_invoice_lines (immutable
// per-event amount snapshots) and partner_invoice_payments. This function
// NEVER reads a rate card and never recomputes an amount: re-pricing an
// issued invoice from a newer rate card is the exact bug the freeze-at-issue
// trigger exists to prevent, so the renderer is structurally incapable of it.
//
// IMMUTABILITY: one artifact per (invoice, kind). The first render stores the
// PDF in the private partner-invoices bucket and records it in
// partner_invoice_documents (DB-unique, trigger-frozen). Every later request
// returns the SAME artifact re-signed — never a re-render. A void produces a
// SEPARATE 'void_notice' artifact beside the original.
//
// CONTENT DISCIPLINE: partner legal/display identity, invoice identity,
// service-level line descriptions with the PARTNER'S OWN order references,
// quantities, unit amounts, credits, payments, balance, status and synthetic
// TEST remittance placeholders. Never: a customer name or contact detail, an
// assessment answer, an internal order UUID, provider compensation, margin.
// The order lookup in this file selects id + partner_order_id and NOTHING
// else, so customer identity cannot even transit this isolate.
//
// AUTH: admin user JWT proven by a user-context is_chat_admin() capability
// probe (never a service-key comparison). No partner-facing path exists yet:
// exposing invoice PDFs through the partner API is an owner decision recorded
// in the production activation package.
//
// No email is ever sent from here. Invoice PDFs are administrative records.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ARTIFACT_BUCKET = "partner-invoices";
const SIGNED_URL_TTL_SECONDS = 600;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Data assembly (exported for the executable guard) ───────────────────────

export interface InvoicePdfLine {
  description: string;
  partnerRef: string;
  service: string;
  isCredit: boolean;
  amountCents: number;
}

export interface InvoicePdfPayment {
  receivedAt: string;
  method: string;
  reference: string;
  amountCents: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  currency: string;
  partnerLegalName: string;
  partnerDisplayName: string;
  issuedAt: string | null;
  dueAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  totalCents: number;
  paidCents: number;
  lines: InvoicePdfLine[];
  payments: InvoicePdfPayment[];
}

/**
 * Assemble everything the PDF shows, from the frozen snapshot tables only.
 * The ONLY orders columns this touches are id and partner_order_id — the
 * partner's own reference. No customer column is selected anywhere here.
 */
export async function assembleInvoiceData(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true; data: InvoicePdfData } | { ok: false; status: number; error: string }> {
  const { data: inv, error: invErr } = await admin
    .from("partner_invoices")
    .select("id, partner_id, invoice_number, status, currency, total_cents, issued_at, due_at, voided_at, void_reason")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return { ok: false, status: 500, error: "invoice lookup failed" };
  if (!inv) return { ok: false, status: 404, error: "invoice not found" };

  const { data: org } = await admin
    .from("partner_organizations")
    .select("legal_name, display_name")
    .eq("id", inv.partner_id)
    .maybeSingle();

  const { data: lineRows, error: lineErr } = await admin
    .from("partner_invoice_lines")
    .select("id, billable_event_id, service, description, amount_cents, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (lineErr) return { ok: false, status: 500, error: "line lookup failed" };

  const eventIds = (lineRows ?? []).map((l) => l.billable_event_id).filter(Boolean);
  const eventOrder = new Map<string, string>();
  const orderRef = new Map<string, string>();
  if (eventIds.length) {
    const { data: events } = await admin
      .from("partner_billable_events")
      .select("id, order_id")
      .in("id", eventIds);
    const orderIds = Array.from(new Set((events ?? []).map((e) => e.order_id).filter(Boolean)));
    for (const e of events ?? []) eventOrder.set(e.id as string, e.order_id as string);
    if (orderIds.length) {
      // Partner reference ONLY. Deliberately not first_name / last_name /
      // email / phone — customer identity never enters an invoice.
      const { data: orders } = await admin
        .from("orders")
        .select("id, partner_order_id")
        .in("id", orderIds);
      for (const o of orders ?? []) orderRef.set(o.id as string, (o.partner_order_id as string) ?? "");
    }
  }

  const { data: payRows } = await admin
    .from("partner_invoice_payments")
    .select("amount_cents, received_at, method, reference")
    .eq("invoice_id", invoiceId)
    .order("received_at", { ascending: true });

  const paidCents = (payRows ?? []).reduce((sum, p) => sum + (p.amount_cents as number), 0);

  return {
    ok: true,
    data: {
      invoiceNumber: inv.invoice_number as string,
      status: inv.status as string,
      currency: (inv.currency as string) ?? "USD",
      partnerLegalName: (org?.legal_name as string) ?? "Partner organization",
      partnerDisplayName: (org?.display_name as string) ?? "Partner",
      issuedAt: inv.issued_at as string | null,
      dueAt: inv.due_at as string | null,
      voidedAt: inv.voided_at as string | null,
      voidReason: inv.void_reason as string | null,
      totalCents: inv.total_cents as number,
      paidCents,
      lines: (lineRows ?? []).map((l) => ({
        description: l.description as string,
        partnerRef: orderRef.get(eventOrder.get(l.billable_event_id as string) ?? "") ?? "",
        service: (l.service as string) ?? "",
        isCredit: (l.amount_cents as number) < 0,
        amountCents: l.amount_cents as number,
      })),
      payments: (payRows ?? []).map((p) => ({
        receivedAt: p.received_at as string,
        method: (p.method as string) ?? "manual",
        reference: (p.reference as string) ?? "",
        amountCents: p.amount_cents as number,
      })),
    },
  };
}

// ── Text model (pure; exported for the executable guard) ────────────────────

const REMITTANCE_PLACEHOLDER_LINES = [
  "Remittance (TEST environment placeholder - not for payment):",
  "ACH - Example Bank N.A. - Routing 000000000 - Account 0000000000",
  "Reference the invoice number on all payments.",
];

function money(cents: number, currency: string): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${currency === "USD" ? "$" : currency + " "}${(Math.abs(cents) / 100).toFixed(2)}`;
}

function dateOnly(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}

/** WinAnsi-safe: the standard PDF fonts cannot encode arbitrary unicode. */
function pdfSafe(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, "?");
}

export interface InvoiceTextModel {
  title: string;
  headerLines: string[];
  billTo: string[];
  tableRows: Array<{ description: string; ref: string; qty: string; amount: string }>;
  totals: string[];
  payments: string[];
  remittance: string[];
  footer: string[];
}

/**
 * Everything the PDF will say, as plain strings. Pure function of the frozen
 * snapshot data — the guard executes THIS with poisoned stub data to prove no
 * customer identity, provider economics or rate-card value can appear.
 */
export function buildInvoiceTextModel(data: InvoicePdfData, kind: "invoice" | "void_notice"): InvoiceTextModel {
  const balance = data.totalCents - data.paidCents;
  const headerLines = [
    `Invoice number: ${data.invoiceNumber}`,
    `Status: ${data.status.toUpperCase()}`,
    `Issue date: ${dateOnly(data.issuedAt)}`,
    `Due date: ${dateOnly(data.dueAt)}`,
  ];
  if (kind === "void_notice") {
    headerLines.push(`Voided: ${dateOnly(data.voidedAt)}`);
    headerLines.push(`Void reason: ${pdfSafe(data.voidReason ?? "-")}`);
  }
  return {
    title: kind === "void_notice" ? "VOID NOTICE" : "Partner Invoice",
    headerLines,
    billTo: [
      "Bill to:",
      pdfSafe(data.partnerLegalName),
      pdfSafe(data.partnerDisplayName !== data.partnerLegalName ? data.partnerDisplayName : ""),
    ].filter(Boolean),
    tableRows: data.lines.map((l) => ({
      description: pdfSafe(l.description).slice(0, 64),
      ref: pdfSafe(l.partnerRef).slice(0, 32) || "-",
      qty: "1",
      amount: money(l.amountCents, data.currency),
    })),
    totals: [
      `Invoice total: ${money(data.totalCents, data.currency)}`,
      `Paid to date: ${money(data.paidCents, data.currency)}`,
      `Balance: ${money(balance, data.currency)}`,
    ],
    payments: data.payments.map((p) =>
      `${dateOnly(p.receivedAt)}  ${pdfSafe(p.method)}  ${pdfSafe(p.reference) || "-"}  ${money(p.amountCents, data.currency)}`
    ),
    remittance: kind === "void_notice"
      ? ["This invoice was voided. Its billable events were released for re-billing."]
      : REMITTANCE_PLACEHOLDER_LINES,
    footer: [
      "Administrative record generated from the issued invoice snapshot.",
      "Not a payment request. PawTenant does not charge partners automatically.",
    ],
  };
}

// ── PDF rendering ───────────────────────────────────────────────────────────

async function renderPdf(model: InvoiceTextModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.42, 0.45, 0.5);
  const dark = rgb(0.07, 0.09, 0.15);

  let page = doc.addPage([612, 792]);
  let y = 740;
  const left = 54;
  const right = 558;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < 60) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
  };
  const text = (s: string, opts: { size?: number; boldFace?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    page.drawText(s, {
      x: opts.x ?? left, y, size: opts.size ?? 10,
      font: opts.boldFace ? bold : font, color: opts.color ?? dark,
    });
  };

  text("PawTenant", { size: 20, boldFace: true });
  y -= 22;
  text(model.title, { size: 13, boldFace: true, color: model.title === "VOID NOTICE" ? rgb(0.7, 0.1, 0.1) : dark });
  y -= 24;

  for (const line of model.headerLines) { text(line); y -= 14; }
  y -= 8;
  for (const line of model.billTo) { text(line, { boldFace: line === "Bill to:" }); y -= 14; }
  y -= 12;

  // Table header
  newPageIfNeeded(40);
  text("Description", { boldFace: true, size: 9, color: gray });
  text("Partner ref", { boldFace: true, size: 9, color: gray, x: 330 });
  text("Qty", { boldFace: true, size: 9, color: gray, x: 460 });
  text("Amount", { boldFace: true, size: 9, color: gray, x: 500 });
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: gray });
  y -= 14;

  for (const row of model.tableRows) {
    newPageIfNeeded(16);
    text(row.description, { size: 9 });
    text(row.ref, { size: 9, x: 330 });
    text(row.qty, { size: 9, x: 460 });
    text(row.amount, { size: 9, x: 500 });
    y -= 14;
  }

  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: gray });
  y -= 16;
  for (const line of model.totals) {
    newPageIfNeeded(16);
    text(line, { boldFace: line.startsWith("Balance"), x: 380 });
    y -= 14;
  }

  if (model.payments.length) {
    y -= 10;
    newPageIfNeeded(30 + model.payments.length * 14);
    text("Payments received", { boldFace: true, size: 10 });
    y -= 14;
    for (const line of model.payments) { text(line, { size: 9 }); y -= 13; }
  }

  y -= 16;
  newPageIfNeeded(30 + model.remittance.length * 13);
  for (const line of model.remittance) { text(line, { size: 9, color: gray }); y -= 13; }

  y -= 10;
  newPageIfNeeded(40);
  for (const line of model.footer) { text(line, { size: 8, color: gray }); y -= 11; }

  return await doc.save();
}

async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  // Capability probe: the caller's own JWT must satisfy is_chat_admin().
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: isAdmin } = await asUser.rpc("is_chat_admin");
  if (isAdmin !== true) return json(403, { ok: false, error: "Admin access required" });

  let body: { invoiceId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }
  const invoiceId = (body.invoiceId ?? "").trim();
  if (!invoiceId) return json(400, { ok: false, error: "invoiceId is required" });
  const kind = (body.kind ?? "invoice").trim() as "invoice" | "void_notice";
  if (kind !== "invoice" && kind !== "void_notice") {
    return json(400, { ok: false, error: "kind must be invoice or void_notice" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Existing artifact wins — issued PDFs are never re-rendered ──────────
  const { data: existing } = await admin
    .from("partner_invoice_documents")
    .select("id, storage_bucket, storage_path, file_sha256, file_size_bytes")
    .eq("invoice_id", invoiceId)
    .eq("kind", kind)
    .maybeSingle();

  if (existing) {
    const { data: signed, error: signErr } = await admin.storage
      .from(existing.storage_bucket as string)
      .createSignedUrl(existing.storage_path as string, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) return json(500, { ok: false, error: "sign failed" });
    return json(200, {
      ok: true, kind, reused: true, signedUrl: signed.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      sha256: existing.file_sha256, sizeBytes: existing.file_size_bytes,
    });
  }

  const assembled = await assembleInvoiceData(admin, invoiceId);
  if (!assembled.ok) return json(assembled.status, { ok: false, error: assembled.error });
  const data = assembled.data;

  // State discipline: drafts have no frozen identity to render; a void notice
  // requires an actual void; an 'invoice' artifact is rendered from the
  // frozen issued snapshot (issued / partially_paid / paid).
  if (kind === "invoice" && !["issued", "partially_paid", "paid"].includes(data.status)) {
    return json(409, { ok: false, error: `no invoice artifact for status '${data.status}' — issue the invoice first` });
  }
  if (kind === "void_notice" && data.status !== "void") {
    return json(409, { ok: false, error: "void_notice requires a voided invoice" });
  }

  const bytes = await renderPdf(buildInvoiceTextModel(data, kind));
  const sha256 = await sha256HexOf(bytes);
  const path = `invoices/${data.invoiceNumber}/${kind}.pdf`;

  const { error: upErr } = await admin.storage
    .from(ARTIFACT_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  // A concurrent render may have won; the DB row decides below either way.
  if (upErr && !`${upErr.message}`.toLowerCase().includes("exists")) {
    return json(500, { ok: false, error: "artifact upload failed" });
  }

  const { error: insErr } = await admin
    .from("partner_invoice_documents")
    .insert({
      invoice_id: invoiceId, kind, storage_bucket: ARTIFACT_BUCKET, storage_path: path,
      file_sha256: sha256, file_size_bytes: bytes.length, rendered_by: "partner-invoice-pdf",
    });
  if (insErr) {
    // Concurrent winner: serve THEIR artifact (unique on invoice_id+kind).
    const { data: winner } = await admin
      .from("partner_invoice_documents")
      .select("storage_bucket, storage_path, file_sha256, file_size_bytes")
      .eq("invoice_id", invoiceId)
      .eq("kind", kind)
      .maybeSingle();
    if (!winner) return json(500, { ok: false, error: "artifact record failed" });
    const { data: signed } = await admin.storage
      .from(winner.storage_bucket as string)
      .createSignedUrl(winner.storage_path as string, SIGNED_URL_TTL_SECONDS);
    if (!signed?.signedUrl) return json(500, { ok: false, error: "sign failed" });
    return json(200, {
      ok: true, kind, reused: true, signedUrl: signed.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      sha256: winner.file_sha256, sizeBytes: winner.file_size_bytes,
    });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(ARTIFACT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) return json(500, { ok: false, error: "sign failed" });

  return json(200, {
    ok: true, kind, reused: false, signedUrl: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS, sha256, sizeBytes: bytes.length,
  });
});
