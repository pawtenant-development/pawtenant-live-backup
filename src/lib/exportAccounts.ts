// Accounts / P&L export — CSV that opens cleanly in Excel (UTF-8 BOM + CRLF,
// multiple stacked sections in one file). No xlsx dependency added.
import { CATEGORY_LABEL, type CompanyExpense, type ExpenseCategory } from "./companyExpenses";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export interface AccountsSummaryLine {
  label: string;
  amount: number;
  note?: string;
}

export interface ProfitabilityRow {
  order_id: string;
  customer: string;
  gross: number;
  stripe_fee: number;
  refund: number;
  net_after_fees: number; // gross − Stripe fee − refund (before provider payout)
  provider: string;
  provider_payout: number;
  payout_basis: string; // confirmed | estimated | none
  business_net: number;  // net_after_fees − confirmed provider payout
  chain_paid_count: number; // paid charges in this recovery chain (>1 = duplicate advisory)
  status: string;
}

export interface AccountsExportData {
  rangeLabel: string;
  generatedAt: string;
  summary: AccountsSummaryLine[];
  expenses: CompanyExpense[];
  profitability: ProfitabilityRow[];
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function exportAccountsCSV(data: AccountsExportData): void {
  const rows: string[][] = [];

  // ── Section 1: Summary ──
  rows.push(["PawTenant — Accounts / Estimated P&L"]);
  rows.push(["Date range", data.rangeLabel]);
  rows.push(["Generated", data.generatedAt]);
  rows.push([]);
  rows.push(["--- SUMMARY (USD) ---"]);
  rows.push(["Line", "Amount (USD)", "Note"]);
  data.summary.forEach((s) => rows.push([s.label, money(s.amount), s.note ?? ""]));

  // ── Section 2: Expense detail ──
  rows.push([]);
  rows.push(["--- EXPENSE DETAIL ---"]);
  rows.push(["Date", "Category", "Vendor", "Description", "Amount", "Currency", "Source", "Status", "Recurring", "Created By"]);
  data.expenses.forEach((e) => rows.push([
    e.expense_date,
    CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category,
    e.vendor ?? "",
    e.description ?? "",
    money(e.amount),
    e.currency,
    e.source,
    e.status,
    e.recurring ? "Yes" : "No",
    e.created_by ?? "",
  ]));

  // ── Section 3: Payment profitability detail ──
  rows.push([]);
  rows.push(["--- PAYMENT PROFITABILITY (USD) ---"]);
  rows.push(["Business Net = Gross − Stripe Fee − Refund − confirmed Provider Payout (per charge)."]);
  rows.push(["This is the per-order direct margin. It is NOT Contribution Margin or Operating Net (those are range totals in the SUMMARY section above, after company expenses & salary)."]);
  rows.push(["Chain Paid = paid charges sharing this charge's recovery chain; >1 is a duplicate/over-charge advisory only and does not change the payout deduction."]);
  rows.push(["Order ID", "Customer", "Gross", "Stripe Fee", "Refund", "Net After Fees & Refunds", "Provider", "Provider Payout", "Payout Basis", "Business Net", "Chain Paid", "Status"]);
  data.profitability.forEach((p) => rows.push([
    p.order_id,
    p.customer,
    money(p.gross),
    money(p.stripe_fee),
    money(p.refund),
    money(p.net_after_fees),
    p.provider,
    money(p.provider_payout),
    p.payout_basis,
    money(p.business_net),
    String(p.chain_paid_count ?? 1),
    p.status,
  ]));

  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  // UTF-8 BOM so Excel renders currency / accents correctly.
  const csv = "﻿" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pawtenant-accounts-pnl-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
