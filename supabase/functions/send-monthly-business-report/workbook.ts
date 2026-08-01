// Styled Excel workbook builder for the monthly business report — v2, rendering
// THE CANONICAL PAYLOAD (get_monthly_business_report(p_month)) verbatim.
//
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §K contract:
//   • Eleven sheets: Executive Summary, Profit & Loss, Orders, Paid Marketing,
//     Organic Search, Traffic & Attribution, Providers, States, Refunds,
//     Expenses, Data Quality & Reconciliation — plus the pre-existing
//     confidential Salary Payroll sheet.
//   • Every sheet: title, reporting period, timezone, generated timestamp,
//     source/environment indicator, frozen header rows, autofilters on data
//     tables, proper number formats, sensible widths.
//   • NO fake placeholder values: an unavailable source renders its connection
//     state as TEXT ("not connected", "connected_stale — last synced …"),
//     never a fabricated 0.
//   • NO independent recalculation: cells are payload values; the only
//     arithmetic here is display-level (bar-glyph scaling, MoM delta arrows).
//
// Uses xlsx-js-style (SheetJS community fork that DOES write cell styling) +
// fflate to inject freeze panes (the SheetJS writer omits them). Pure JS, runs
// in the Deno edge runtime. Falls back to CSV on any failure. Native Excel
// charts are not supported by any Deno-safe writer, so "charts" are styled
// KPI cards + in-cell bar glyphs + MoM trend arrows (kept to the Executive
// Summary to avoid chart clutter).
import * as XLSXns from "https://esm.sh/xlsx-js-style@1.2.0";
const XLSX: any = (XLSXns as any)?.utils ? (XLSXns as any) : ((XLSXns as any)?.default ?? XLSXns);
import * as fflateNs from "https://esm.sh/fflate@0.8.2";
const fflate: any = (fflateNs as any)?.unzipSync ? (fflateNs as any) : ((fflateNs as any)?.default ?? fflateNs);
const { unzipSync, zipSync, strToU8, strFromU8 } = fflate;

const C = {
  dark: "0F2E26", teal: "1A5C4F", blue: "3B6EA5",
  posFill: "E7F6EF", posText: "0B6E4F",
  negFill: "FCEBEA", negText: "B42318",
  neuFill: "E8F0F9", neuText: "2D5A8E",
  headText: "FFFFFF", sectFill: "EEF2F4", sectText: "0F2E26",
  zebra: "F6FAF9", white: "FFFFFF", line: "D9E1E1",
  amberFill: "FFF7E6", amberText: "92400E", muted: "6B7280", barTeal: "2E8B73",
};
const F = {
  usd: '"$"#,##0.00', usd0: '"$"#,##0',
  usdNeg: '"$"#,##0.00;[Red]-"$"#,##0.00', usd0Neg: '"$"#,##0;[Red]-"$"#,##0',
  int: "#,##0", pct: '0.0"%"', x: '0.00"x"',
  pkr: '#,##0.00" PKR"', pkr0: '#,##0" PKR"', num1: "0.0",
};
const b = (col?: string) => ({ style: "thin", color: { rgb: col || C.line } });
const allBorder = () => ({ top: b(), bottom: b(), left: b(), right: b() });
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
const round2 = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

function grid() { return { ws: {} as Record<string, any>, R: 0, Cc: 0, merges: [] as any[] }; }
function set(g: any, r: number, c: number, v: any, s?: any) {
  const addr = XLSX.utils.encode_cell({ r, c });
  let t = "s", val = v;
  if (v === null || v === undefined || v === "") { t = "s"; val = ""; }
  else if (typeof v === "number") { t = "n"; }
  else { t = "s"; val = String(v); }
  const cell: any = { t, v: val };
  if (s) cell.s = s;
  g.ws[addr] = cell;
  if (r > g.R) g.R = r;
  if (c > g.Cc) g.Cc = c;
}
function mrg(g: any, r: number, c: number, r2: number, c2: number) { g.merges.push({ s: { r, c }, e: { r: r2, c: c2 } }); }
function done(g: any, opts: any = {}) {
  g.ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: g.R, c: Math.max(g.Cc, 0) } });
  if (g.merges.length) g.ws["!merges"] = g.merges;
  if (opts.cols) g.ws["!cols"] = opts.cols;
  if (opts.rows) g.ws["!rows"] = opts.rows;
  if (opts.autofilter) g.ws["!autofilter"] = { ref: opts.autofilter };
  return g.ws;
}
function bar(v: number, max: number, width = 16) {
  if (!max || max <= 0) return "";
  const n = Math.max(0, Math.min(width, Math.round((Math.abs(v) / max) * width)));
  return "█".repeat(n);
}
function arrow(cur: number, pv: number | null | undefined) {
  if (pv == null || pv === 0) return { txt: cur ? "▲ new" : "—", color: cur ? C.posText : C.muted };
  const p = ((cur - pv) / Math.abs(pv)) * 100;
  const up = cur >= pv;
  return { txt: `${up ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`, color: up ? C.posText : C.negText };
}

// Inject freeze panes into the written xlsx (SheetJS community omits them).
// Best-effort: caller keeps original bytes on any failure.
function injectFreeze(u8: Uint8Array, ySplits: number[]): Uint8Array {
  const zip = unzipSync(u8);
  const pfx = "xl/worksheets/sheet";
  for (const name of Object.keys(zip)) {
    if (!(name.startsWith(pfx) && name.endsWith(".xml"))) continue;
    const idx = Number(name.slice(pfx.length, name.length - 4));
    const ys = ySplits[idx - 1];
    if (!ys) continue;
    let xml = strFromU8(zip[name]);
    if (xml.indexOf("<pane ") !== -1) continue;
    const cell = "A" + (ys + 1);
    const pane = '<pane ySplit="' + ys + '" topLeftCell="' + cell + '" activePane="bottomLeft" state="frozen"/>' +
                 '<selection pane="bottomLeft" activeCell="' + cell + '" sqref="' + cell + '"/>';
    const i = xml.indexOf("<sheetView");
    if (i === -1) continue;
    const gt = xml.indexOf(">", i);
    if (gt === -1) continue;
    if (xml[gt - 1] === "/") xml = xml.slice(0, gt - 1) + ">" + pane + "</sheetView>" + xml.slice(gt + 1);
    else xml = xml.slice(0, gt + 1) + pane + xml.slice(gt + 1);
    zip[name] = strToU8(xml);
  }
  return zipSync(zip);
}

function u8ToBase64(u8: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

type R = Record<string, any>;

export interface Attachment {
  filename: string; content: string; content_type: string; kind: string;
  sheets?: string[]; error?: string;
}

export const REQUIRED_SHEETS = [
  "Executive Summary", "Profit & Loss", "Orders", "Paid Marketing",
  "Organic Search", "Traffic & Attribution", "Providers", "States",
  "Refunds", "Expenses", "Data Quality & Reconciliation",
] as const;

export function buildWorkbook(
  report: R, prev: R | null, label: string, monthKey: string,
  payroll: R | null = null, env = "UNKNOWN",
): Attachment {
  try {
    const meta = report.meta || {};
    const tz = meta.timezone || "America/New_York";
    const envTag = env === "LIVE" ? "LIVE production data" : `${env} PREVIEW — not production data`;

    // Every sheet header: title • period • timezone • generated • source/env.
    function titleBlock(g: any, sheetTitle: string, cols: number) {
      const lastC = cols - 1;
      set(g, 0, 0, sheetTitle, { font: { bold: true, sz: 15, color: { rgb: C.headText }, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: C.dark } }, alignment: { vertical: "center", horizontal: "left" } });
      for (let c = 1; c <= lastC; c++) set(g, 0, c, "", { fill: { patternType: "solid", fgColor: { rgb: C.dark } } });
      mrg(g, 0, 0, 0, lastC);
      set(g, 1, 0, `PawTenant Monthly Business Report  •  ${label}  •  ${meta.from || report.period?.from} → ${meta.to_inclusive || report.period?.to} (${tz})  •  Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC  •  Source: canonical payload v${meta.report_version || 2}  •  ${envTag}`,
        { font: { sz: 9, color: { rgb: C.muted } }, alignment: { vertical: "center", wrapText: true } });
      for (let c = 1; c <= lastC; c++) set(g, 1, c, "");
      mrg(g, 1, 0, 1, lastC);
    }

    // Generic data table. A STRING value in a numeric column renders as text
    // (that is how unavailable metrics say "not connected" instead of a fake 0).
    function tableSheet(title: string, columns: any[], rows: any[], opts: any = {}) {
      const g = grid();
      const nc = columns.length;
      titleBlock(g, title, nc);
      const hr = 3;
      columns.forEach((col, c) => set(g, hr, c, col.label,
        { font: { bold: true, sz: 10, color: { rgb: C.headText } }, fill: { patternType: "solid", fgColor: { rgb: C.teal } },
          alignment: { horizontal: col.type && col.type !== "text" && col.type !== "bar" ? "right" : "left", vertical: "center", wrapText: true }, border: allBorder() }));
      const barMax: Record<number, number> = {};
      columns.forEach((col, c) => { if (col.type === "bar") barMax[c] = Math.max(1, ...rows.map((rw) => Math.abs(num(rw[col.barFrom])))); });
      rows.forEach((rw, i) => {
        const r = hr + 1 + i;
        const zebra = i % 2 === 1;
        columns.forEach((col, c) => {
          const base: any = { alignment: { vertical: "center" }, border: allBorder(),
            fill: { patternType: "solid", fgColor: { rgb: zebra ? C.zebra : C.white } }, font: { sz: 10, color: { rgb: "222222" } } };
          let v = rw[col.key];
          if (col.type === "bar") {
            v = bar(num(rw[col.barFrom]), barMax[c], 18);
            base.font = { sz: 10, color: { rgb: C.barTeal }, name: "Consolas" };
          } else if (col.type === "text") {
            base.alignment.horizontal = "left";
            v = (v === null || v === undefined) ? "" : v;
          } else if (typeof v === "string") {
            // unavailable metric: render the state string, right-aligned italics
            base.alignment.horizontal = "right";
            base.font = { sz: 9, italic: true, color: { rgb: C.muted } };
          } else if (v === null || v === undefined) {
            base.alignment.horizontal = "right";
            base.font = { sz: 9, italic: true, color: { rgb: C.muted } };
            v = "—";
          } else {
            base.alignment.horizontal = "right";
            v = num(v);
            base.numFmt = col.type === "usd" ? F.usd : col.type === "usd0" ? F.usd0 : col.type === "usdneg" ? F.usdNeg : col.type === "pct" ? F.pct : col.type === "x" ? F.x : F.int;
          }
          set(g, r, c, v, base);
        });
      });
      if (opts.totals) {
        const r = hr + 1 + rows.length;
        columns.forEach((col, c) => {
          const base: any = { font: { bold: true, sz: 10, color: { rgb: C.sectText } }, fill: { patternType: "solid", fgColor: { rgb: C.sectFill } }, border: { top: b(C.teal), bottom: b(), left: b(), right: b() }, alignment: { vertical: "center" } };
          let v = opts.totals[c];
          if (v == null) { v = c === 0 ? "TOTAL" : ""; }
          if (typeof v === "number") { base.alignment.horizontal = "right"; base.numFmt = col.type === "usd" ? F.usd : col.type === "usd0" ? F.usd0 : col.type === "usdneg" ? F.usdNeg : col.type === "pct" ? F.pct : F.int; }
          else base.alignment.horizontal = c === 0 ? "left" : "right";
          set(g, r, c, v, base);
        });
      }
      if (opts.notes) {
        let r = hr + 1 + rows.length + (opts.totals ? 1 : 0) + 1;
        opts.notes.forEach((n: string) => {
          set(g, r, 0, n, { font: { italic: true, sz: 9, color: { rgb: C.muted } }, alignment: { wrapText: true, vertical: "top" } });
          mrg(g, r, 0, r, nc - 1);
          r++;
        });
      }
      return done(g, {
        cols: columns.map((col) => ({ wch: col.width || 14 })),
        autofilter: `${XLSX.utils.encode_cell({ r: hr, c: 0 })}:${XLSX.utils.encode_cell({ r: hr, c: nc - 1 })}`,
      });
    }

    const rev = report.revenue || {}, ops = report.operations || {}, p = report.pnl || {};
    const acq = report.acquisition || {}, gAds = acq.google_ads || {}, gb = gAds.backend || {};
    const mAds = acq.meta_ads || {}, msAds = acq.microsoft_ads || {};
    const channels: R[] = acq.cross_channel || [];
    const queue = ops.queue_now || {};
    const adAvailable = report.ad_spend_available === true;

    // ── 1. Executive Summary ──────────────────────────────────────────────
    function executiveSummary() {
      const g = grid();
      const COLS = 8;
      titleBlock(g, "Executive Summary", COLS);
      const tones: R = { pos: { fill: C.posFill, text: C.posText }, neg: { fill: C.negFill, text: C.negText }, neu: { fill: C.neuFill, text: C.neuText }, warn: { fill: C.amberFill, text: C.amberText } };
      function card(r: number, c: number, lblTxt: string, value: any, fmt: string, toneKey: string) {
        const tone = tones[toneKey];
        for (let cc = c; cc <= c + 1; cc++) set(g, r, cc, cc === c ? lblTxt : "", { font: { bold: true, sz: 9, color: { rgb: tone.text } }, fill: { patternType: "solid", fgColor: { rgb: tone.fill } }, alignment: { vertical: "center", horizontal: "left" }, border: { top: b("FFFFFF"), left: b("FFFFFF"), right: b("FFFFFF") } });
        mrg(g, r, c, r, c + 1);
        for (let cc = c; cc <= c + 1; cc++) set(g, r + 1, cc, cc === c ? value : "", { font: { bold: true, sz: 15, color: { rgb: tone.text } }, fill: { patternType: "solid", fgColor: { rgb: tone.fill } }, alignment: { vertical: "center", horizontal: "left" }, border: { bottom: b("FFFFFF"), left: b("FFFFFF"), right: b("FFFFFF") }, numFmt: typeof value === "number" ? fmt : undefined });
        mrg(g, r + 1, c, r + 1, c + 1);
      }
      const netTone = !adAvailable ? "warn" : num(p.operating_net) >= 0 ? "pos" : "neg";
      const netVal: any = adAvailable ? num(p.operating_net) : "unavailable — paid media not synced";
      const adVal: any = (adAvailable || num(gAds.days_synced_in_period) > 0) ? num(p.ad_spend) : String(gAds.connection || "not connected").replace(/_/g, " ");
      let r = 3;
      const band = [
        [["Gross Revenue", num(p.gross_revenue), F.usd0, "pos"], ["Operating Net", netVal, F.usd0Neg, netTone], ["Paid Orders", num(rev.paid_orders), F.int, "neu"], ["Ad Spend", adVal, F.usd0, typeof adVal === "number" ? "neg" : "warn"]],
        [["Avg Order Value", num(rev.avg_order_value), F.usd, "neu"], ["Paid Conversion", num(rev.paid_conversion_rate), F.pct, "neu"], ["Completed", num(ops.completed_orders), F.int, "pos"], ["Refund Rate", num(ops.refund_rate), F.pct, "neg"]],
        [["Business Net", num(p.business_net), F.usd0Neg, "neu"], ["Salary (est.)", num(p.salary_expense_est), F.usd0, "neg"], ["Under Review now", num(queue.under_review), F.int, "neu"], ["Pending Delivery now", num(queue.pending_delivery), F.int, "neu"]],
      ];
      band.forEach((rowCards) => { rowCards.forEach((cd: any, i: number) => card(r, i * 2, cd[0], cd[1], cd[2], cd[3])); r += 3; });

      function section(title: string) {
        set(g, r, 0, title, { font: { bold: true, sz: 11, color: { rgb: C.sectText } }, fill: { patternType: "solid", fgColor: { rgb: C.sectFill } }, alignment: { vertical: "center" } });
        for (let c = 1; c < COLS; c++) set(g, r, c, "", { fill: { patternType: "solid", fgColor: { rgb: C.sectFill } } });
        mrg(g, r, 0, r, COLS - 1); r++;
      }
      function barRow(lblTxt: string, value: number, max: number, fmt: string, extra?: number, extraFmt?: string) {
        set(g, r, 0, lblTxt, { font: { sz: 10, bold: true, color: { rgb: "222222" } }, alignment: { vertical: "center" } });
        set(g, r, 1, bar(value, max, 20), { font: { sz: 10, color: { rgb: C.barTeal }, name: "Consolas" }, alignment: { vertical: "center" } });
        mrg(g, r, 1, r, 4);
        set(g, r, 5, num(value), { font: { sz: 10, bold: true, color: { rgb: C.sectText } }, numFmt: fmt, alignment: { horizontal: "right", vertical: "center" } });
        mrg(g, r, 5, r, 6);
        if (extra !== undefined) set(g, r, 7, num(extra), { font: { sz: 10, color: { rgb: C.muted } }, numFmt: extraFmt || F.int, alignment: { horizontal: "right", vertical: "center" } });
        r++;
      }

      section("Revenue vs Expenses vs Operating Net");
      const maxRE = Math.max(num(p.gross_revenue), num(p.total_expenses), Math.abs(num(p.operating_net)), 1);
      barRow("Gross Revenue", num(p.gross_revenue), maxRE, F.usd0);
      barRow("Total Expenses", num(p.total_expenses), maxRE, F.usd0);
      barRow("Operating Net", num(p.operating_net), maxRE, F.usd0Neg);
      if (!adAvailable) {
        set(g, r, 0, "⚠ Operating Net is not reliable this period: paid-media spend is not fully synced.", { font: { italic: true, sz: 9, color: { rgb: C.amberText } } });
        mrg(g, r, 0, r, COLS - 1); r++;
      }
      r++;

      section("Top Channels by Revenue");
      const chMax = Math.max(1, ...channels.map((c: R) => num(c.revenue)));
      channels.slice(0, 6).forEach((c: R) => barRow(String(c.channel), num(c.revenue), chMax, F.usd0, num(c.orders), F.int));
      r++;

      section("Top States by Revenue");
      const states: R[] = report.top_states || [];
      const stMax = Math.max(1, ...states.map((s: R) => num(s.revenue)));
      states.slice(0, 6).forEach((s: R) => barRow(String(s.state), num(s.revenue), stMax, F.usd0, num(s.orders), F.int));
      r++;

      section("Month over Month");
      set(g, r, 0, "Metric", { font: { bold: true, sz: 9, color: { rgb: C.muted } } });
      set(g, r, 2, "This Month", { font: { bold: true, sz: 9, color: { rgb: C.muted } }, alignment: { horizontal: "right" } }); mrg(g, r, 2, r, 3);
      set(g, r, 4, "Prev Month", { font: { bold: true, sz: 9, color: { rgb: C.muted } }, alignment: { horizontal: "right" } }); mrg(g, r, 4, r, 5);
      set(g, r, 6, "Change", { font: { bold: true, sz: 9, color: { rgb: C.muted } }, alignment: { horizontal: "right" } }); mrg(g, r, 6, r, 7); r++;
      const moms: any[] = [
        ["Gross Revenue", num(p.gross_revenue), prev ? num(prev.pnl?.gross_revenue) : null, F.usd0],
        ["Paid Orders", num(rev.paid_orders), prev ? num(prev.revenue?.paid_orders) : null, F.int],
        ["Ad Spend", num(p.ad_spend), prev ? num(prev.pnl?.ad_spend ?? prev.pnl?.marketing_spend) : null, F.usd0],
        ["Operating Net", num(p.operating_net), prev ? num(prev.pnl?.operating_net) : null, F.usd0Neg],
      ];
      moms.forEach(([lblTxt, cur, pv, fmt]) => {
        set(g, r, 0, lblTxt, { font: { sz: 10, bold: true, color: { rgb: "222222" } } }); mrg(g, r, 0, r, 1);
        set(g, r, 2, cur, { font: { sz: 10, color: { rgb: C.sectText } }, numFmt: fmt, alignment: { horizontal: "right" } }); mrg(g, r, 2, r, 3);
        set(g, r, 4, pv == null ? "—" : pv, { font: { sz: 10, color: { rgb: C.muted } }, numFmt: pv == null ? undefined : fmt, alignment: { horizontal: "right" } }); mrg(g, r, 4, r, 5);
        const a = arrow(cur, pv);
        set(g, r, 6, a.txt, { font: { sz: 10, bold: true, color: { rgb: a.color } }, alignment: { horizontal: "right" } }); mrg(g, r, 6, r, 7);
        r++;
      });

      return done(g, { cols: [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }], rows: [{ hpt: 22 }, { hpt: 26 }] });
    }

    // ── 2. Profit & Loss ─────────────────────────────────────────────────
    function pnlSheet() {
      const g = grid();
      titleBlock(g, "Profit & Loss", 4);
      const hr = 3;
      ["Line Item", "This Month", "Prev Month", "Change"].forEach((h, c) => set(g, hr, c, h, { font: { bold: true, sz: 10, color: { rgb: C.headText } }, fill: { patternType: "solid", fgColor: { rgb: C.teal } }, alignment: { horizontal: c === 0 ? "left" : "right", vertical: "center" }, border: allBorder() }));
      const pp = (prev && prev.pnl) || {};
      let r = hr + 1; let zi = 0;
      const line = (lblTxt: string, cur: number | null, pv: number | null, o: any = {}) => {
        const zebra = !o.sect && (zi++ % 2 === 1);
        const fill = o.sect ? C.sectFill : (zebra ? C.zebra : C.white);
        set(g, r, 0, (o.indent ? "    " : "") + lblTxt, { font: { bold: o.bold || o.sect, sz: 10, color: { rgb: o.sect ? C.sectText : "222222" } }, fill: { patternType: "solid", fgColor: { rgb: fill } }, alignment: { horizontal: "left", vertical: "center" }, border: allBorder() });
        const fmt = o.neg ? F.usdNeg : F.usd;
        set(g, r, 1, cur == null ? "" : num(cur), { font: { bold: o.bold || o.sect, sz: 10 }, fill: { patternType: "solid", fgColor: { rgb: fill } }, numFmt: fmt, alignment: { horizontal: "right", vertical: "center" }, border: allBorder() });
        set(g, r, 2, pv == null ? "" : num(pv), { font: { sz: 10, color: { rgb: C.muted } }, fill: { patternType: "solid", fgColor: { rgb: fill } }, numFmt: fmt, alignment: { horizontal: "right", vertical: "center" }, border: allBorder() });
        if (cur != null && pv != null) { const a = arrow(num(cur), num(pv)); set(g, r, 3, a.txt, { font: { sz: 10, bold: true, color: { rgb: a.color } }, fill: { patternType: "solid", fgColor: { rgb: fill } }, alignment: { horizontal: "right", vertical: "center" }, border: allBorder() }); }
        else set(g, r, 3, "", { fill: { patternType: "solid", fgColor: { rgb: fill } }, border: allBorder() });
        r++;
      };
      line("REVENUE", null, null, { sect: true });
      line("Gross Revenue", p.gross_revenue, pp.gross_revenue, { indent: true });
      line("DEDUCTIONS", null, null, { sect: true });
      line("Stripe Fees (est.)", -num(p.stripe_fees_est), null, { neg: true, indent: true });
      line("Refunds", -num(p.refund_amount), null, { neg: true, indent: true });
      line("Provider Payouts", -num(p.provider_payouts), null, { neg: true, indent: true });
      line("Business Net", p.business_net, pp.business_net, { bold: true });
      line("OPERATING EXPENSES", null, null, { sect: true });
      line("Salary (est.)", -num(p.salary_expense_est), null, { neg: true, indent: true });
      line("Paid Media (synced)", -num(p.ad_spend), null, { neg: true, indent: true });
      line("Other Expenses", -num(p.other_expenses), null, { neg: true, indent: true });
      line("Total Expenses", p.total_expenses, pp.total_expenses, { bold: true });
      line("OPERATING NET", p.operating_net, pp.operating_net, { sect: true, bold: true, neg: true });
      set(g, r + 1, 0, `Formula (the ONE formula): ${p.operating_net_formula || "business_net - other_expenses - salary_expense_est - ad_spend"}. ${adAvailable ? "" : "⚠ Paid media is NOT fully synced this period; Operating Net is unreliable until it is."}`,
        { font: { italic: true, sz: 9, color: { rgb: adAvailable ? C.muted : C.amberText } }, alignment: { wrapText: true, vertical: "top" } });
      mrg(g, r + 1, 0, r + 1, 3);
      if (payroll && payroll.totals) {
        r += 3;
        const pt = payroll.totals, fx = (payroll.policy && payroll.policy.fx_pkr_per_usd) || 280;
        line("PAYROLL DETAIL (memo — not re-added to Operating Net)", null, null, { sect: true });
        line("Salary Payroll Net (USD)", num(pt.net_payroll_usd), null, { indent: true });
        line("Payroll Additions (USD)", num(pt.approved_additions_pkr) / fx, null, { indent: true });
        line("Payroll Deductions (USD)", -num(pt.approved_deductions_pkr) / fx, null, { neg: true, indent: true });
        line("Owner Salary Excluded (USD)", num(pt.owner_excluded_usd), null, { indent: true });
      }
      return done(g, { cols: [{ wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 12 }] });
    }

    // ── 3. Orders (metrics + lifecycle event audit) ──────────────────────
    function ordersSheet() {
      const snap = ops.snapshot_now || {};
      const lifecycleRows = ((report.lifecycle?.events || []) as R[]).map((e) => ({
        k: `Lifecycle: ${e.event}`, v: e.count_in_period,
        src: e.source, note: [e.note, e.missing_timestamp_rows ? `${e.missing_timestamp_rows} row(s) lack a usable timestamp` : "", e.legacy_rows_missing_patient_notification_sent_at ? `${e.legacy_rows_missing_patient_notification_sent_at} legacy row(s) missing patient_notification_sent_at` : ""].filter(Boolean).join(" · "),
      }));
      return tableSheet("Orders", [
        { label: "Metric", key: "k", type: "text", width: 34 },
        { label: "Value", key: "v", type: "int", width: 12 },
        { label: "Authoritative Source", key: "src", type: "text", width: 38 },
        { label: "Notes", key: "note", type: "text", width: 60 },
      ], [
        { k: "Total Orders Created", v: rev.total_orders_created, src: "orders.created_at", note: "" },
        { k: "Paid Orders", v: rev.paid_orders, src: "orders.paid_at", note: "" },
        { k: "Leads / Unpaid (created)", v: rev.leads_created, src: "orders.created_at + status", note: "" },
        { k: "Completed (this month)", v: ops.completed_orders, src: "orders.last_completed_at", note: "excludes unpaid and pending-delivery re-completions" },
        { k: "Cancelled (this month)", v: ops.cancelled_orders, src: "orders.last_cancelled_at", note: "event basis — v1 wrongly counted by creation date" },
        { k: "Reopened (this month)", v: ops.reopened_orders, src: "orders.last_reopened_at", note: "" },
        { k: "Refunds (this month)", v: p.refund_count, src: "orders.refunded_at", note: "" },
        { k: "ESA Orders", v: rev.esa_orders, src: "orders.letter_type", note: "" },
        { k: "PSD Orders", v: rev.psd_orders, src: "orders.letter_type", note: "" },
        { k: "New Customers", v: rev.new_customers, src: "first paid order for the email", note: "" },
        { k: "Returning Customers", v: rev.returning_customers, src: "", note: "" },
        { k: "Under Review (queue now)", v: queue.under_review, src: "order_workflow_state()", note: "live queue depth at generation time" },
        { k: "Pending Delivery (queue now)", v: queue.pending_delivery, src: "order_workflow_state()", note: "live queue depth at generation time" },
        { k: "Processing (status snapshot now)", v: snap["processing"] || 0, src: "orders.status", note: "" },
        ...lifecycleRows,
      ], { notes: [
        "Counts are for the report month unless marked \"now\" (live at generation time).",
        "Lifecycle rows are the §E timestamp audit: each event on its authoritative column; gaps are disclosed, never invented.",
      ] });
    }

    // ── 4. Paid Marketing ────────────────────────────────────────────────
    function paidMarketingSheet() {
      const gConn = String(gAds.connection || "not_connected");
      const mConn = String(mAds.connection || "not_connected");
      const naIf = (available: boolean, v: any, elseTxt: string) => available ? v : elseTxt;
      const gOk = gConn === "synced" || num(gAds.days_synced_in_period) > 0;
      const mOk = num(mAds.days_synced_in_period) > 0;
      const rows: R[] = [
        {
          plat: "Google Ads", conn: gConn.replace(/_/g, " "),
          spend: naIf(gOk, num(gAds.spend_usd), gConn.replace(/_/g, " ")),
          orders: num(gb.attributed_orders), rev: num(gb.attributed_revenue),
          cpa: gb.cpa == null ? "—" : num(gb.cpa), roas: gb.roas == null ? "—" : num(gb.roas),
          refc: num(gb.refund_count), refa: num(gb.refund_amount),
          adjrev: num(gb.refund_adjusted_revenue),
          adjroas: gb.refund_adjusted_roas == null ? "—" : num(gb.refund_adjusted_roas),
          last: gAds.last_synced_day || "never",
        },
        {
          plat: "Meta Ads", conn: mConn.replace(/_/g, " "),
          spend: naIf(mOk, num(mAds.spend_usd), mConn.replace(/_/g, " ")),
          orders: num(mAds.attributed_orders), rev: num(mAds.attributed_revenue),
          cpa: "—", roas: "—", refc: "—", refa: "—", adjrev: "—", adjroas: "—",
          last: mAds.last_synced_day || "never",
        },
        {
          plat: "Microsoft/Bing Ads", conn: String(msAds.label || "Not connected"),
          spend: msAds.manual_expense_usd_in_period != null ? num(msAds.manual_expense_usd_in_period) : "manual expense only / none",
          orders: "—", rev: "—", cpa: "—", roas: "—", refc: "—", refa: "—", adjrev: "—", adjroas: "—",
          last: "n/a",
        },
      ];
      const gws = tableSheet("Paid Marketing", [
        { label: "Platform", key: "plat", type: "text", width: 18 },
        { label: "Connection", key: "conn", type: "text", width: 22 },
        { label: "Spend (USD)", key: "spend", type: "usd", width: 13 },
        { label: "Attributed Orders", key: "orders", type: "int", width: 12 },
        { label: "Attributed Revenue", key: "rev", type: "usd0", width: 14 },
        { label: "CPA", key: "cpa", type: "usd", width: 10 },
        { label: "ROAS", key: "roas", type: "x", width: 9 },
        { label: "Refunds", key: "refc", type: "int", width: 9 },
        { label: "Refund $", key: "refa", type: "usd0", width: 11 },
        { label: "Refund-adj Revenue", key: "adjrev", type: "usd0", width: 14 },
        { label: "Refund-adj ROAS", key: "adjroas", type: "x", width: 11 },
        { label: "Synced Through", key: "last", type: "text", width: 13 },
      ], rows, { notes: [
        `Google Ads ${gOk ? `native spend ${num(gAds.spend_native).toLocaleString("en-US")} ${gAds.currency || "USD"}${gAds.currency === "PKR" ? " converted at FX 280 PKR/USD" : ""}; ${num(gAds.clicks).toLocaleString("en-US")} clicks, ${num(gAds.impressions).toLocaleString("en-US")} impressions.` : "spend not synced for this period — no figures are fabricated."}`,
        gAds.platform_vs_backend ? `Platform-vs-backend: platform reported ${num(gAds.platform_vs_backend.platform_conversions)} conversions vs ${num(gAds.platform_vs_backend.backend_paid_orders)} backend-attributed paid orders (delta ${num(gAds.platform_vs_backend.delta)}). ${gAds.platform_vs_backend.note || ""}` : "Platform conversion export unavailable — backend paid-order DB is the sole basis (standing rule: never assess Google Ads from platform conversions alone).",
        `Backend attribution: ${num(gb.missing_click_id_orders)} google_ads order(s) missing a click id (gclid/gbraid/wbraid).`,
        "Refund figures are cohort basis (refunds observed to date on orders paid this period).",
        String(msAds.note || ""),
      ].filter(Boolean) });
      return gws;
    }

    // ── 5. Organic Search ────────────────────────────────────────────────
    function organicSheet() {
      const og = report.organic_search || {};
      const gsc = og.gsc || {};
      const ba = og.backend_attribution || {};
      return tableSheet("Organic Search", [
        { label: "Metric", key: "k", type: "text", width: 34 },
        { label: "Value", key: "v", type: "usd0", width: 16 },
        { label: "Status / Source", key: "s", type: "text", width: 60 },
      ], [
        { k: "GSC Clicks", v: "not integrated", s: String(gsc.label || "Google Search Console not integrated") },
        { k: "GSC Impressions", v: "not integrated", s: "" },
        { k: "GSC CTR", v: "not integrated", s: "" },
        { k: "GSC Average Position", v: "not integrated", s: "" },
        { k: "Branded vs Non-branded split", v: "not integrated", s: "requires GSC query data" },
        { k: "Top Queries / Pages / Page-2 opportunities", v: "not integrated", s: "requires GSC query data" },
        { k: "Organic-attributed Paid Orders", v: num(ba.organic_orders), s: "backend attribution (orders.attribution_json / last_touch / utm_source)" },
        { k: "Organic-attributed Revenue", v: num(ba.organic_revenue), s: "backend attribution" },
        { k: "Organic Refunds (cohort)", v: num(ba.organic_refund_amount), s: "backend attribution" },
        { k: "Organic Refund-adjusted Revenue", v: num(ba.organic_refund_adjusted_revenue), s: "backend attribution" },
      ], { notes: [
        String(gsc.note || ""),
        "DATA QUALITY: GSC metrics are marked 'not integrated' rather than rendered as zeros. Standing up a GSC connector is a tracked follow-up dependency.",
      ] });
    }

    // ── 6. Traffic & Attribution ─────────────────────────────────────────
    function trafficSheet() {
      const aq = acq.attribution_quality || {};
      const chRows = channels.map((c: R) => ({
        ch: c.channel, ord: c.orders, po: c.pct_orders, rev: c.revenue, pr: c.pct_revenue,
        refc: c.refund_count, refa: c.refund_amount, adj: c.refund_adjusted_revenue,
        raw: c.raw_channels || "",
      }));
      return tableSheet("Traffic & Attribution", [
        { label: "Channel", key: "ch", type: "text", width: 16 },
        { label: "Paid Orders", key: "ord", type: "int", width: 11 },
        { label: "% Orders", key: "po", type: "pct", width: 9 },
        { label: "Revenue", key: "rev", type: "usd0", width: 12 },
        { label: "% Revenue", key: "pr", type: "pct", width: 10 },
        { label: "Refunds", key: "refc", type: "int", width: 9 },
        { label: "Refund $", key: "refa", type: "usd0", width: 10 },
        { label: "Refund-adj Revenue", key: "adj", type: "usd0", width: 14 },
        { label: "Raw values (other)", key: "raw", type: "text", width: 24 },
      ], chRows, {
        totals: ["TOTAL", chRows.reduce((a, x) => a + num(x.ord), 0), "", chRows.reduce((a, x) => a + num(x.rev), 0), "", chRows.reduce((a, x) => a + num(x.refc), 0), chRows.reduce((a, x) => a + num(x.refa), 0), chRows.reduce((a, x) => a + num(x.adj), 0), ""],
        notes: [
          `SITE TRAFFIC: ${String(report.traffic?.label || "Traffic analytics not connected")} — ${String(report.traffic?.note || "")}`,
          `Attribution quality: ${num(aq.unknown_or_unattributed)} unknown/unattributed · ${num(aq.conflicting_google_signal)} order(s) with a Google click id on a non-Google channel · ${num(aq.conflicting_meta_signal)} with a Meta click id on a non-Meta channel · ${num(aq.duplicate_gclids_in_period)} duplicate gclid(s).`,
          String(aq.note || ""),
          String(acq.refund_basis_note || ""),
        ].filter(Boolean),
      });
    }

    // ── 7–10. Providers / States / Refunds / Expenses ────────────────────
    function providersSheet() {
      const provRows = ((report.providers || []) as R[]).map((pr) => ({ name: pr.provider, comp: pr.completed_orders, pay: num(pr.payout_usd), avg: num(pr.completed_orders) > 0 ? round2(num(pr.payout_usd) / num(pr.completed_orders)) : 0 }));
      return tableSheet("Providers", [
        { label: "Provider", key: "name", type: "text", width: 24 },
        { label: "Completed Orders", key: "comp", type: "int", width: 16 },
        { label: "Payout (USD)", key: "pay", type: "usd0", width: 14 },
        { label: "Avg Payout / Order", key: "avg", type: "usd", width: 16 },
        { label: "Completed", type: "bar", barFrom: "comp", width: 20 },
      ], provRows, { totals: ["TOTAL", provRows.reduce((a: number, x: R) => a + num(x.comp), 0), provRows.reduce((a: number, x: R) => a + num(x.pay), 0), "", ""], notes: [
        "Payout = de-duplicated doctor_earnings accrued in the month (non-cancelled).",
      ] });
    }

    function statesSheet() {
      const refByState: R = {}; ((report.refunds?.by_state || []) as R[]).forEach((s: R) => refByState[s.state] = s);
      const stRows = ((report.top_states || []) as R[]).map((s: R) => ({ st: s.state, ord: s.orders, rev: s.revenue, rf: refByState[s.state] ? num(refByState[s.state].amount) : 0 }));
      return tableSheet("States", [
        { label: "State", key: "st", type: "text", width: 10 },
        { label: "Paid Orders", key: "ord", type: "int", width: 12 },
        { label: "Revenue (USD)", key: "rev", type: "usd0", width: 14 },
        { label: "Revenue", type: "bar", barFrom: "rev", width: 22 },
        { label: "Refunds (USD)", key: "rf", type: "usd0", width: 14 },
      ], stRows, { totals: ["TOTAL", stRows.reduce((a: number, x: R) => a + num(x.ord), 0), stRows.reduce((a: number, x: R) => a + num(x.rev), 0), "", stRows.reduce((a: number, x: R) => a + num(x.rf), 0)], notes: [
        "Top 10 states by paid orders. Refund column is event basis for the month, by order state.",
      ] });
    }

    function refundsSheet() {
      const rf = report.refunds || {};
      const rfRows = ((rf.by_state || []) as R[]).map((s: R) => ({ st: s.state, cnt: s.refunds, amt: s.amount }));
      return tableSheet("Refunds", [
        { label: "State", key: "st", type: "text", width: 10 },
        { label: "Refund Count", key: "cnt", type: "int", width: 14 },
        { label: "Refund Amount (USD)", key: "amt", type: "usd0", width: 18 },
        { label: "Amount", type: "bar", barFrom: "amt", width: 22 },
      ], rfRows.length ? rfRows : [{ st: "— none —", cnt: 0, amt: 0 }], { totals: ["TOTAL", num(rf.count), num(rf.amount), ""], notes: [
        `Month refund rate: ${num(rf.rate_pct_of_paid)}% of paid orders (${num(rf.count)} of ${num(rev.paid_orders)}).`,
        `Google-attributed refunds executed this month: ${num(rf.google_attributed_refunds_in_period)}.`,
        "P&L refunds are EVENT basis (executed this month); channel/platform refund columns are COHORT basis (orders paid this month). The two are different views and are not expected to match.",
      ] });
    }

    function expensesSheet() {
      const exRows = ((report.expenses?.rows || []) as R[]).map((e) => ({ cat: e.label, amt: num(e.amount_usd), basis: e.basis }));
      return tableSheet("Expenses", [
        { label: "Category", key: "cat", type: "text", width: 26 },
        { label: "Amount (USD)", key: "amt", type: "usd", width: 16 },
        { label: "Share", type: "bar", barFrom: "amt", width: 20 },
        { label: "Basis", key: "basis", type: "text", width: 64 },
      ], exRows, { totals: ["TOTAL EXPENSES", num(report.expenses?.total_usd), "", ""], notes: [
        "Paid media comes from the synced marketing source only and is deducted exactly once — never from company_expenses.",
      ] });
    }

    // ── 11. Data Quality & Reconciliation ────────────────────────────────
    function dataQualitySheet() {
      const g = grid();
      const NC = 6;
      titleBlock(g, "Data Quality & Reconciliation", NC);
      let r = 3;

      set(g, r, 0, `Reconciliation: ${report.reconciliation?.reconciled ? "PASS — summary and detail agree to the cent" : "FAIL — a real send is blocked"}`,
        { font: { bold: true, sz: 12, color: { rgb: report.reconciliation?.reconciled ? C.posText : C.negText } } });
      mrg(g, r, 0, r, NC - 1); r += 2;

      ["Check", "Left", "Right", "Delta", "Pass", ""].forEach((h, c) => set(g, r, c, h, { font: { bold: true, sz: 10, color: { rgb: C.headText } }, fill: { patternType: "solid", fgColor: { rgb: C.teal } }, alignment: { horizontal: c === 0 ? "left" : "right" }, border: allBorder() }));
      r++;
      ((report.reconciliation?.checks || []) as R[]).forEach((chk, i) => {
        const zebra = i % 2 === 1;
        const fill = { patternType: "solid", fgColor: { rgb: zebra ? C.zebra : C.white } };
        set(g, r, 0, chk.name, { font: { sz: 10 }, fill, border: allBorder(), alignment: { horizontal: "left" } });
        set(g, r, 1, num(chk.left), { font: { sz: 10 }, fill, border: allBorder(), numFmt: F.usdNeg, alignment: { horizontal: "right" } });
        set(g, r, 2, num(chk.right), { font: { sz: 10 }, fill, border: allBorder(), numFmt: F.usdNeg, alignment: { horizontal: "right" } });
        set(g, r, 3, num(chk.delta), { font: { sz: 10, bold: num(chk.delta) !== 0, color: { rgb: num(chk.delta) === 0 ? "222222" : C.negText } }, fill, border: allBorder(), numFmt: F.usdNeg, alignment: { horizontal: "right" } });
        set(g, r, 4, chk.pass ? "PASS" : "FAIL", { font: { sz: 10, bold: true, color: { rgb: chk.pass ? C.posText : C.negText } }, fill, border: allBorder(), alignment: { horizontal: "right" } });
        set(g, r, 5, "", { fill, border: allBorder() });
        r++;
      });
      r++;

      set(g, r, 0, "Source availability", { font: { bold: true, sz: 11, color: { rgb: C.sectText } }, fill: { patternType: "solid", fgColor: { rgb: C.sectFill } } });
      for (let c = 1; c < NC; c++) set(g, r, c, "", { fill: { patternType: "solid", fgColor: { rgb: C.sectFill } } });
      mrg(g, r, 0, r, NC - 1); r++;
      const sources: Array<[string, string]> = [
        ["Google Ads spend", `${String(gAds.connection || "not_connected").replace(/_/g, " ")} — synced through ${gAds.last_synced_day || "never"}`],
        ["Meta Ads spend", `${String(mAds.connection || "not_connected").replace(/_/g, " ")} — synced through ${mAds.last_synced_day || "never"}`],
        ["Microsoft/Bing Ads", String(msAds.label || "Not connected")],
        ["Google Search Console", "not integrated — follow-up dependency"],
        ["Site traffic (GA4)", "not connected — follow-up dependency"],
        ["Stripe fees", "estimated 2.9% + $0.30 per paid order"],
        ["Salary", "estimated (prorated base + approved adjustments, FX 280)"],
        ["QA fixtures in period", `${num(report.qa_fixture_rows_in_period)} (must be 0 for a real send)`],
      ];
      sources.forEach(([s, st], i) => {
        const fill = { patternType: "solid", fgColor: { rgb: i % 2 ? C.zebra : C.white } };
        set(g, r, 0, s, { font: { sz: 10, bold: true }, fill, border: allBorder() });
        set(g, r, 1, st, { font: { sz: 10 }, fill, border: allBorder(), alignment: { horizontal: "left" } });
        for (let c = 2; c < NC; c++) set(g, r, c, "", { fill, border: allBorder() });
        mrg(g, r, 1, r, NC - 1);
        r++;
      });
      r++;

      set(g, r, 0, "Data Warnings", { font: { bold: true, sz: 11, color: { rgb: C.amberText } } }); mrg(g, r, 0, r, NC - 1); r++;
      ((report.data_warnings || []) as string[]).forEach((w: string, i: number) => {
        set(g, r, 0, `${i + 1}.`, { font: { bold: true, sz: 9, color: { rgb: C.amberText } }, fill: { patternType: "solid", fgColor: { rgb: C.amberFill } }, alignment: { horizontal: "center", vertical: "top" }, border: allBorder() });
        set(g, r, 1, w, { font: { sz: 9, color: { rgb: "222222" } }, fill: { patternType: "solid", fgColor: { rgb: C.amberFill } }, alignment: { wrapText: true, vertical: "top" }, border: allBorder() });
        for (let c = 2; c < NC; c++) set(g, r, c, "", { fill: { patternType: "solid", fgColor: { rgb: C.amberFill } }, border: allBorder() });
        mrg(g, r, 1, r, NC - 1);
        r++;
      });

      return done(g, { cols: [{ wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 40 }], rows: Array.from({ length: r }, () => ({})) });
    }

    // ── Salary Payroll (pre-existing confidential sheet, unchanged shape) ──
    function payrollSheet(pr: R) {
      const g = grid();
      const cols: any[] = [
        { l: "Code", k: "employee_code", t: "text", w: 9 },
        { l: "Employee", k: "employee_name", t: "text", w: 18 },
        { l: "Role", k: "role", t: "text", w: 16 },
        { l: "Dept", k: "department", t: "text", w: 13 },
        { l: "Status", k: "status", t: "text", w: 10 },
        { l: "Base Salary", k: "base_salary", t: "pkr", w: 15 },
        { l: "Cur", k: "currency", t: "text", w: 6 },
        { l: "Work Days", k: "working_days", t: "int", w: 9 },
        { l: "Present", k: "present_days", t: "int", w: 8 },
        { l: "Absent", k: "absent_days", t: "int", w: 8 },
        { l: "Leave", k: "leave_days", t: "num1", w: 8 },
        { l: "Paid Lv", k: "paid_leave_days", t: "num1", w: 8 },
        { l: "Unpaid Lv", k: "unpaid_leave_days", t: "num1", w: 9 },
        { l: "Late", k: "late_days", t: "int", w: 7 },
        { l: "½-Day Ded", k: "half_day_late_days", t: "int", w: 9 },
        { l: "Attend Ded", k: "attendance_deduction", t: "pkr", w: 14, neg: true },
        { l: "Additions", k: "approved_additions", t: "pkr", w: 14, pos: true },
        { l: "Deductions", k: "approved_deductions", t: "pkr", w: 14, neg: true },
        { l: "Medical Add", k: "medical_addition", t: "na", w: 11 },
        { l: "Medical Ded", k: "medical_deduction", t: "na", w: 11 },
        { l: "Other Adj", k: "other_adjustments", t: "pkr", w: 12 },
        { l: "Gross Payable", k: "gross_payable", t: "pkr", w: 15 },
        { l: "Net Payable", k: "net_payable", t: "pkr", w: 16, hot: true },
        { l: "Net (USD)", k: "net_payable_usd", t: "usd", w: 12 },
        { l: "Net", t: "bar", barFrom: "net_payable", w: 16 },
        { l: "Owner Excl?", k: "owner_excluded", t: "yesno", w: 10 },
        { l: "Notes", k: "exclude_reason", t: "text", w: 24 },
      ];
      const nc = cols.length;
      titleBlock(g, "Monthly Salary Payroll", nc);
      const pol = pr.policy || {}, tot = pr.totals || {}, emps: R[] = pr.employees || [];
      set(g, 2, 0, `Policy: ${pol.working_days_basis || "Mon–Fri"} working days · ${pol.grace_minutes || 30}-min grace · >${pol.grace_minutes || 30} min late = half-day deduction · attendance deductions from ${pol.effective_date} · owner salary excluded from business payroll · FX 1 USD = ${pol.fx_pkr_per_usd || 280} PKR. Salary amounts in PKR; USD shown for tie-out.`,
        { font: { italic: true, sz: 9, color: { rgb: C.muted } }, alignment: { wrapText: true, vertical: "center" } });
      for (let c = 1; c < nc; c++) set(g, 2, c, "");
      mrg(g, 2, 0, 2, nc - 1);

      const tones: R = { pos: { fill: C.posFill, text: C.posText }, neg: { fill: C.negFill, text: C.negText }, neu: { fill: C.neuFill, text: C.neuText } };
      function card(r: number, c: number, lbl: string, val: any, fmt: string, toneKey: string, sub?: string) {
        const tn = tones[toneKey];
        for (let cc = c; cc <= c + 2; cc++) set(g, r, cc, cc === c ? lbl : "", { font: { bold: true, sz: 9, color: { rgb: tn.text } }, fill: { patternType: "solid", fgColor: { rgb: tn.fill } }, alignment: { vertical: "center" }, border: { top: b("FFFFFF"), left: b("FFFFFF"), right: b("FFFFFF") } });
        mrg(g, r, c, r, c + 2);
        for (let cc = c; cc <= c + 2; cc++) set(g, r + 1, cc, cc === c ? val : "", { font: { bold: true, sz: 14, color: { rgb: tn.text } }, fill: { patternType: "solid", fgColor: { rgb: tn.fill } }, alignment: { vertical: "center" }, border: { bottom: b("FFFFFF"), left: b("FFFFFF"), right: b("FFFFFF") }, numFmt: typeof val === "number" ? fmt : undefined });
        mrg(g, r + 1, c, r + 1, c + 2);
        if (sub) set(g, r + 1, c + 2, sub, { font: { sz: 8, color: { rgb: tn.text } }, fill: { patternType: "solid", fgColor: { rgb: tn.fill } }, alignment: { horizontal: "right", vertical: "bottom" } });
      }
      card(3, 0, "Employees Included", tot.employees_included || 0, F.int, "neu", `of ${tot.employees_total || 0}`);
      card(3, 3, "Net Payroll (PKR)", tot.net_payroll_pkr || 0, F.pkr0, "pos");
      card(3, 6, "Net Payroll (USD)", tot.net_payroll_usd || 0, F.usd, "pos");
      card(3, 9, "Gross Base (PKR)", tot.gross_base_pkr || 0, F.pkr0, "neu");
      card(5, 0, "Approved Additions", tot.approved_additions_pkr || 0, F.pkr0, "pos");
      card(5, 3, "Approved Deductions", tot.approved_deductions_pkr || 0, F.pkr0, "neg");
      card(5, 6, "Attendance Deductions", tot.attendance_deduction_pkr || 0, F.pkr0, "neg");
      card(5, 9, "Owner Excluded (PKR)", tot.owner_excluded_pkr || 0, F.pkr0, "neu", `${tot.owner_excluded_count || 0} excl`);

      const hr = 8;
      cols.forEach((col, c) => set(g, hr, c, col.l, { font: { bold: true, sz: 9, color: { rgb: C.headText } }, fill: { patternType: "solid", fgColor: { rgb: C.teal } }, alignment: { horizontal: (col.t === "text" || col.t === "bar" || col.t === "na" || col.t === "yesno") ? "left" : "right", vertical: "center", wrapText: true }, border: allBorder() }));
      const maxNet = Math.max(1, ...emps.filter((e) => e.included).map((e) => num(e.net_payable)));
      emps.forEach((e, i) => {
        const r = hr + 1 + i;
        const excl = !e.included;
        const rowFill = excl ? "F3F4F6" : (i % 2 === 1 ? C.zebra : C.white);
        cols.forEach((col, c) => {
          const base: any = { alignment: { vertical: "center" }, border: allBorder(), fill: { patternType: "solid", fgColor: { rgb: rowFill } }, font: { sz: 9, color: { rgb: excl ? "6B7280" : "222222" } } };
          let v = e[col.k];
          if (col.t === "bar") { v = excl ? "" : bar(num(e.net_payable), maxNet, 16); base.font = { sz: 9, color: { rgb: C.barTeal }, name: "Consolas" }; }
          else if (col.t === "na") { v = "N/A"; base.font = { sz: 9, italic: true, color: { rgb: C.muted } }; base.alignment.horizontal = "left"; }
          else if (col.t === "yesno") { v = e[col.k] ? "Yes" : "No"; base.alignment.horizontal = "left"; if (e[col.k]) base.font = { sz: 9, bold: true, color: { rgb: C.negText } }; }
          else if (col.t === "text") { base.alignment.horizontal = "left"; v = (v === null || v === undefined) ? "" : v; }
          else {
            base.alignment.horizontal = "right"; v = num(v);
            base.numFmt = col.t === "pkr" ? F.pkr : col.t === "usd" ? F.usd : col.t === "num1" ? F.num1 : F.int;
            if (col.neg && v > 0) base.font = { sz: 9, color: { rgb: C.negText } };
            if (col.pos && v > 0) base.font = { sz: 9, color: { rgb: C.posText } };
            if (col.hot) { base.font = { sz: 9, bold: true, color: { rgb: excl ? "6B7280" : C.sectText } }; base.fill = { patternType: "solid", fgColor: { rgb: excl ? rowFill : "E7F6EF" } }; }
          }
          set(g, r, c, v, base);
        });
      });
      const tr = hr + 1 + emps.length;
      const sum = (k: string) => emps.filter((e) => e.included).reduce((a, e) => a + num(e[k]), 0);
      cols.forEach((col, c) => {
        const base: any = { font: { bold: true, sz: 9, color: { rgb: C.sectText } }, fill: { patternType: "solid", fgColor: { rgb: C.sectFill } }, border: { top: b(C.teal), bottom: b(), left: b(), right: b() }, alignment: { vertical: "center" } };
        let v: any = "";
        if (c === 0) v = "TOTAL";
        else if (c === 1) v = "(included employees)";
        else if (["base_salary", "attendance_deduction", "approved_additions", "approved_deductions", "other_adjustments", "gross_payable", "net_payable", "net_payable_usd"].includes(col.k)) { v = round2(sum(col.k)); base.alignment.horizontal = "right"; base.numFmt = col.k === "net_payable_usd" ? F.usd : F.pkr; }
        else if (col.k === "leave_days") { v = sum(col.k); base.alignment.horizontal = "right"; base.numFmt = F.num1; }
        if (c <= 1) base.alignment.horizontal = "left";
        set(g, tr, c, v, base);
      });
      let wr = tr + 2;
      set(g, wr, 0, "Data Warnings", { font: { bold: true, sz: 10, color: { rgb: C.amberText } } }); mrg(g, wr, 0, wr, nc - 1); wr++;
      (pr.warnings || []).forEach((w: string) => { set(g, wr, 0, "• " + w, { font: { sz: 9, color: { rgb: C.amberText } }, fill: { patternType: "solid", fgColor: { rgb: C.amberFill } }, alignment: { wrapText: true, vertical: "top" } }); mrg(g, wr, 0, wr, nc - 1); wr++; });

      return done(g, { cols: cols.map((c) => ({ wch: c.w })), autofilter: `${XLSX.utils.encode_cell({ r: hr, c: 0 })}:${XLSX.utils.encode_cell({ r: hr, c: nc - 1 })}` });
    }

    // ── Assemble in the §K order ─────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const append = (name: string, ws: any) => XLSX.utils.book_append_sheet(wb, ws, name);
    append("Executive Summary", executiveSummary());
    append("Profit & Loss", pnlSheet());
    append("Orders", ordersSheet());
    append("Paid Marketing", paidMarketingSheet());
    append("Organic Search", organicSheet());
    append("Traffic & Attribution", trafficSheet());
    append("Providers", providersSheet());
    append("States", statesSheet());
    append("Refunds", refundsSheet());
    append("Expenses", expensesSheet());
    append("Data Quality & Reconciliation", dataQualitySheet());
    if (payroll) append("Salary Payroll", payrollSheet(payroll));

    let u8 = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const ySplits = wb.SheetNames.map((n: string) => n === "Executive Summary" ? 2 : n === "Salary Payroll" ? 9 : 4);
    try { u8 = injectFreeze(u8, ySplits); } catch (_e) { /* keep styled-but-unfrozen */ }
    return {
      filename: `pawtenant-monthly-report-${monthKey}.xlsx`,
      content: u8ToBase64(u8),
      content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "xlsx",
      sheets: wb.SheetNames.slice(),
    };
  } catch (err) {
    console.error("[monthly-report] xlsx build failed, CSV fallback:", err);
    const p = report.pnl || {};
    const lines: string[] = [];
    const row = (cells: any[]) => lines.push(cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    row(["PawTenant Monthly Business Report", label, env]);
    row(["Date range", `${report.meta?.from || report.period?.from} to ${report.meta?.to_inclusive || report.period?.to}`, report.meta?.timezone || "America/New_York"]);
    row(["Generated", new Date().toISOString()]);
    row([]);
    row(["P&L (USD)", "Amount"]);
    row(["Gross Revenue", num(p.gross_revenue)]);
    row(["Stripe Fees (est.)", num(p.stripe_fees_est)]);
    row(["Refunds", num(p.refund_amount)]);
    row(["Provider Payouts", num(p.provider_payouts)]);
    row(["Business Net", num(p.business_net)]);
    row(["Salary (est.)", num(p.salary_expense_est)]);
    row(["Paid Media (synced)", num(p.ad_spend)]);
    row(["Other Expenses", num(p.other_expenses)]);
    row(["Total Expenses", num(p.total_expenses)]);
    row(["Operating Net", num(p.operating_net)]);
    row([]);
    row(["Channel", "Orders", "Revenue"]);
    ((report.acquisition?.cross_channel || []) as R[]).forEach((c: R) => row([c.channel, num(c.orders), num(c.revenue)]));
    const csv = lines.join("\n");
    return {
      filename: `pawtenant-monthly-report-${monthKey}.csv`,
      content: btoa(unescape(encodeURIComponent(csv))),
      content_type: "text/csv",
      kind: "csv",
      error: String((err as any)?.stack || err).slice(0, 600),
    };
  }
}
