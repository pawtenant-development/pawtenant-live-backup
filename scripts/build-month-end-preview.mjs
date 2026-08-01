#!/usr/bin/env node
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §L — preview builder.
//
// Renders the report EMAIL and the .xlsx WORKBOOK locally from a saved
// canonical-payload JSON, using THE SAME buildEmail/buildInsights/buildWorkbook
// code that ships in the edge function (extracted from the real sources via
// esbuild — never reimplemented), then VALIDATES the workbook:
//   • all eleven §K sheets present (+ Salary Payroll when payroll passed)
//   • every data sheet has a frozen header pane and an autofilter
//   • the file re-parses; no sheet is empty
//
// Usage:
//   node scripts/build-month-end-preview.mjs <payload.json> <outdir> <ENV_LABEL> [prev.json]
//
// This is a dev/preview tool. It sends nothing, writes only into <outdir>, and
// never talks to Supabase.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FN = join(ROOT, "supabase", "functions", "send-monthly-business-report", "index.ts");
const WB = join(ROOT, "supabase", "functions", "send-monthly-business-report", "workbook.ts");

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ── Extract buildEmail + buildInsights (+ their helpers) from the REAL index.ts ──
async function loadEmailBuilder() {
  const src = read(FN);
  const slice = (startMarker, endMarker) => {
    const a = src.indexOf(startMarker);
    if (a < 0) throw new Error(`marker not found: ${startMarker}`);
    const b = src.indexOf(endMarker, a);
    if (b < 0) throw new Error(`end marker not found after ${startMarker}`);
    return src.slice(a, b);
  };
  const tz = (src.match(/BUSINESS_TIMEZONE/) ? 'const BUSINESS_TIMEZONE = "America/New_York";\n' : "");
  const consts = slice("const COMPANY_NAME", "const REPORT_TYPE") ;
  const helpers = slice("function esc(", "// ── Business-period helpers");
  const typing = 'type EnvLabel = "LIVE" | "TEST" | "UNKNOWN";\ntype Report = Record<string, any>;\n';
  const delta = slice("function deltaHtml(", "// ── Owner insights");
  const insights = slice("export function buildInsights", "// ── HTML email");
  const email = slice("export function buildEmail", "Deno.serve(");
  const snippet = tz + typing + consts + "\n" + helpers + "\n" + delta + "\n" + insights + "\n" + email;
  const { transform } = await import("esbuild");
  const { code } = await transform(snippet, { loader: "ts", format: "esm", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`);
}

// ── Load buildWorkbook from the REAL workbook.ts (esm.sh → npm specifiers) ──
// Emitted as CommonJS to a cache file so the CJS deps (xlsx-js-style pulls in
// Node builtins via dynamic require) resolve natively.
async function loadWorkbookBuilder() {
  const src = read(WB)
    .replace('https://esm.sh/xlsx-js-style@1.2.0', "xlsx-js-style")
    .replace('https://esm.sh/fflate@0.8.2', "fflate");
  const { build } = await import("esbuild");
  const out = await build({
    stdin: { contents: src, loader: "ts", resolveDir: ROOT, sourcefile: "workbook.ts" },
    bundle: true, format: "cjs", platform: "node", write: false, target: "es2022",
    external: ["stream", "crypto", "fs", "path", "os", "util", "buffer", "process"],
  });
  const cacheDir = join(ROOT, "node_modules", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, "month-end-preview-workbook.cjs");
  writeFileSync(cachePath, out.outputFiles[0].text);
  return require(cachePath);
}

function validateWorkbook(bytes, expectPayroll) {
  const { unzipSync, strFromU8 } = require("fflate");
  const XLSX = require("xlsx-js-style");
  const problems = [];

  const wb = XLSX.read(bytes, { type: "buffer" });
  const REQUIRED = [
    "Executive Summary", "Profit & Loss", "Orders", "Paid Marketing",
    "Organic Search", "Traffic & Attribution", "Providers", "States",
    "Refunds", "Expenses", "Data Quality & Reconciliation",
  ];
  for (const s of REQUIRED) if (!wb.SheetNames.includes(s)) problems.push(`sheet missing: ${s}`);
  if (expectPayroll && !wb.SheetNames.includes("Salary Payroll")) problems.push("Salary Payroll sheet missing");
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws["!ref"]) { problems.push(`sheet empty: ${name}`); continue; }
    const a1 = ws["A1"]?.v ?? "";
    if (String(a1).trim() === "") problems.push(`sheet ${name} has an empty title cell`);
  }

  // Freeze panes + autofilters live in the raw XML (SheetJS read drops panes).
  const zip = unzipSync(new Uint8Array(bytes));
  let frozen = 0, filters = 0, sheets = 0;
  for (const f of Object.keys(zip)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(f)) continue;
    sheets++;
    const xml = strFromU8(zip[f]);
    if (xml.includes("<pane ySplit=")) frozen++;
    if (xml.includes("<autoFilter ")) filters++;
  }
  if (frozen < sheets) problems.push(`only ${frozen}/${sheets} sheets have a frozen header pane`);
  if (filters === 0) problems.push("no sheet carries an autofilter");

  return { problems, sheetNames: wb.SheetNames, frozen, filters, sheets };
}

async function main() {
  const [payloadPath, outDir, envLabel = "TEST", prevPath] = process.argv.slice(2);
  if (!payloadPath || !outDir) {
    console.error("usage: node scripts/build-month-end-preview.mjs <payload.json> <outdir> <ENV_LABEL> [prev.json]");
    process.exit(2);
  }
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  const prev = prevPath ? JSON.parse(readFileSync(prevPath, "utf8")) : null;
  const month = payload?.meta?.month ?? "unknown";
  const label = payload?.meta?.label ?? month;
  mkdirSync(outDir, { recursive: true });

  const emailMod = await loadEmailBuilder();
  const wbMod = await loadWorkbookBuilder();

  const attach = wbMod.buildWorkbook(payload, prev, label, month, null, envLabel);
  if (attach.kind !== "xlsx") throw new Error(`workbook fell back to ${attach.kind}: ${attach.error}`);
  const bytes = Buffer.from(attach.content, "base64");
  const xlsxPath = join(outDir, attach.filename.replace(".xlsx", `-${envLabel}.xlsx`));
  writeFileSync(xlsxPath, bytes);

  const html = emailMod.buildEmail(payload, prev, label,
    { kind: attach.kind, filename: attach.filename, sheets: attach.sheets }, envLabel, null);
  const htmlPath = join(outDir, `email-${month}-${envLabel}.html`);
  writeFileSync(htmlPath, html);

  const v = validateWorkbook(bytes, false);
  const insights = emailMod.buildInsights(payload, prev);

  const summary = {
    month, envLabel,
    email: { path: htmlPath, bytes: html.length, insights },
    workbook: {
      path: xlsxPath, bytes: bytes.length,
      sheets: v.sheetNames, frozenPanes: `${v.frozen}/${v.sheets}`, autofilteredSheets: v.filters,
      problems: v.problems,
    },
    reconciliation: payload.reconciliation,
    ad_spend_available: payload.ad_spend_available,
    qa_fixture_rows_in_period: payload.qa_fixture_rows_in_period,
  };
  writeFileSync(join(outDir, `preview-summary-${month}-${envLabel}.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (v.problems.length) process.exit(1);
}

main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
