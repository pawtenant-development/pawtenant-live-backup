// scripts/check-refund-consumer-guard.mjs
//
// PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001 regression guard (2026-07-17).
//
// `orders.refunded_at` is stamped for PARTIAL **and** FULL refunds. It therefore
// proves only that some refund activity happened — never that an order is over.
// Every bare `!!refunded_at` gate silently treated a partially-refunded order —
// one the customer PAID for and is still owed a letter on — as terminal:
//
//   • it dropped out of the provider queue and Submit Letter disappeared;
//   • admin showed "Refunded Order — Assignment Disabled";
//   • the customer portal lifecycle regressed and documents locked;
//   • provider earnings were hidden;
//   • analytics deleted the entire order value.
//
// That is how the verification ID on PT-MR1HX27H came to be revoked by mistake
// (LIVE-PARTIAL-REFUND-VERIFICATION-ID-RECOVERY-001).
//
// THE RULE: outside the canonical classifier, `refunded_at` must never be read
// in a BOOLEAN context. Ask the classifier instead:
//
//     import { isRefundTerminal, isPartialRefund, isRefundedBucket,
//              refundDisposition } from "@/lib/orderClassification";
//
// STILL ALLOWED (this guard does not touch them, because none are boolean reads):
//   • displaying the refund date      →  fmt(order.refunded_at)
//   • sorting                         →  new Date(a.refunded_at) - new Date(b.refunded_at)
//   • audit / history payloads        →  metadata: { refunded_at }
//   • writer persistence              →  update({ refunded_at: now })
//   • type declarations + selects     →  refunded_at?: string | null
//   • showing that SOME refund occurred → hasAnyRefund(order)
//
// Genuine exceptions are allow-listed below by exact code SNIPPET (not line
// number, which drifts). Changing an allow-listed line re-trips the guard on
// purpose — that is the review hook.
//
// Usage:
//   node scripts/check-refund-consumer-guard.mjs             → exit 1 on drift
//   node scripts/check-refund-consumer-guard.mjs --warn-only → always exit 0
//   node scripts/check-refund-consumer-guard.mjs --self-test → negative control
//   node scripts/check-refund-consumer-guard.mjs --root <dir> --warn-only
//        → audit another checkout read-only (used to inventory the LIVE mirror;
//          --warn-only there because LIVE is expected to fail until mirrored).
//
// The build invokes this with --warn-only, matching the other parity checks.

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// --root lets the guard audit another checkout (e.g. the LIVE repo) READ-ONLY.
// It only ever reads files; it never writes anything anywhere.
const rootArgIdx = process.argv.indexOf("--root");
const ROOT = rootArgIdx !== -1 && process.argv[rootArgIdx + 1]
  ? resolve(process.argv[rootArgIdx + 1])
  : resolve(__dirname, "..");

const warnOnly = process.argv.includes("--warn-only");
const selfTest = process.argv.includes("--self-test");
const TAG = "[check-refund-consumer-guard]";

const SCAN_ROOTS = ["src", "supabase/functions"];
const EXTS = [".ts", ".tsx"];

// The ONLY modules permitted to read refunded_at in a boolean context — they
// ARE the definition of what it means.
const CANONICAL = new Set([
  "src/lib/orderClassification.ts",
  "supabase/functions/_shared/orderClassification.ts",
]);

/**
 * Documented exceptions, matched on the exact (whitespace-collapsed) snippet.
 * Each MUST state why the boolean read is safe.
 */
const ALLOW = [
  {
    file: "src/pages/admin-orders/components/OrderDetailModal.tsx",
    snippet: '!order.refunded_at &&',
    why: "paymentRepairNeeded — guarded by !order.payment_intent_id, and a refund is impossible without a payment intent, so this can never fire on a refunded order (partial or full).",
  },
  {
    file: "src/pages/admin-orders/components/OrderDetailModal.tsx",
    snippet: '{(order.status === "refunded" || order.refunded_at) && (',
    why: 'DISPLAY: renders the "Refund Issued / Partial Refund" payment-rail block. Showing that SOME refund occurred is a legitimate use of refunded_at (the block itself labels partial vs full correctly).',
  },
  {
    file: "src/pages/admin-orders/components/OrderDetailModal.tsx",
    snippet: "{order.refunded_at && (",
    why: "DISPLAY: renders the refund DATE row. Pure presentation of the timestamp, gates no behaviour.",
  },
  {
    file: "supabase/functions/sync-google-ads-conversions/lib.ts",
    snippet: "const refundedMs = order.refunded_at ? new Date(order.refunded_at).getTime() : NaN;",
    why: "TIMESTAMP: derives the Google adjustmentDateTime instant. Full-vs-partial there is decided by refund_status (lib.ts isFull/isPartial), not by this timestamp. Google Ads conversion-value logic is explicitly out of scope for this task.",
  },
];

const collapse = (s) => s.replace(/\s+/g, " ").trim();
const ALLOW_KEY = new Set(ALLOW.map((a) => `${a.file}::${collapse(a.snippet)}`));

/** Strip comments so documentation of the rule never trips it. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Blank the CONTENTS of string literals, preserving length.
 *
 * A boolean gate is always code — never text inside a string. PostgREST selects
 * legitimately contain refunded_at (and embedded-resource syntax like
 * `orders!order_id(...)` even contains a `!`), which would otherwise read as a
 * `!refunded_at` gate. Selecting the column is REQUIRED by the classifier, so
 * flagging it would be exactly backwards.
 */
function stripStringContents(src) {
  return src.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (m) =>
    m[0] + m.slice(1, -1).replace(/[^\n]/g, " ") + m[m.length - 1]
  );
}

/**
 * Boolean-context reads of refunded_at. Deliberately NOT matched:
 *   • `refunded_at?: string | null`   (type declaration)
 *   • `refunded_at: value`            (object literal / writer / select)
 *   • `new Date(o.refunded_at)`       (timestamp / sorting)
 *   • `fmt(order.refunded_at)`        (display)
 */
// NOTE: the accessor pattern must tolerate a TypeScript cast, because the real
// harmful code in the customer portal was written as
//   (order as Order & { refunded_at?: string | null }).refunded_at
// An accessor regex of only [\w$.[\]?"'] silently misses that form — a blind
// spot proven by running this guard against the un-migrated LIVE checkout.
const ACC = `[\\w$.[\\]?"'()<>{}:|\\s&,-]*?`;

const BOOLEAN_READS = [
  { re: new RegExp(`!!\\s*${ACC}\\brefunded_at\\b`), kind: "!!refunded_at" },
  { re: new RegExp(`(^|[^!=<>])!\\s*${ACC}\\brefunded_at\\b`), kind: "!refunded_at" },
  { re: /\brefunded_at\b\s*(&&|\|\|)/, kind: "refunded_at &&/||" },
  { re: new RegExp(`(&&|\\|\\|)\\s*${ACC}\\brefunded_at\\b\\s*(\\)|&&|\\|\\||\\?)`), kind: "&&/|| refunded_at" },
  { re: /\brefunded_at\b\s*(===|!==|==|!=)\s*null/, kind: "refunded_at ==/!= null" },
  { re: /Boolean\s*\(\s*[\w$.[\]?"']*\brefunded_at\b/, kind: "Boolean(refunded_at)" },
  { re: /\bif\s*\(\s*[\w$.[\]?"']*\brefunded_at\b\s*\)/, kind: "if (refunded_at)" },
  // Ternary GATE — excludes `? new Date(` / `? fmt(` style value derivation.
  { re: /\brefunded_at\b\s*\?(?!\?)(?!\s*:)(?!\s*new\s+Date)(?!\s*fmt\()/, kind: "refunded_at ? (gate)" },
];

// A type declaration or an object-literal key is never a boolean read.
const NOT_A_READ = [
  /\brefunded_at\s*\?\s*:/,   // refunded_at?: string | null
  /\brefunded_at\s*:/,        // refunded_at: <value>
];

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walk(p, out);
    } else if (EXTS.some((x) => e.name.endsWith(x))) {
      out.push(p);
    }
  }
  return out;
}

function scanSource(relPath, src) {
  const hits = [];
  const original = src.split("\n");
  const lines = stripStringContents(stripComments(src)).split("\n");
  lines.forEach((rawLine, i) => {
    if (!rawLine.includes("refunded_at")) return;
    // Remove the non-read forms before testing, so `refunded_at?: string | null`
    // and `refunded_at: now` can never be mistaken for a gate.
    let line = rawLine;
    for (const re of NOT_A_READ) line = line.replace(new RegExp(re.source, "g"), " __decl__ ");
    if (!line.includes("refunded_at")) return;

    for (const { re, kind } of BOOLEAN_READS) {
      if (re.test(line)) {
        // Allow-list and reporting use the ORIGINAL source line, so the
        // documented snippet is what a reviewer actually sees.
        const sourceLine = original[i] ?? rawLine;
        if (ALLOW_KEY.has(`${relPath}::${collapse(sourceLine)}`)) return;
        hits.push({ line: i + 1, kind, code: sourceLine.trim().slice(0, 120) });
        return;
      }
    }
  });
  return hits;
}

async function collectFiles() {
  const files = [];
  for (const r of SCAN_ROOTS) files.push(...(await walk(resolve(ROOT, r))));
  return files;
}

// ── Negative control ────────────────────────────────────────────────────────
// Proves the guard actually bites: a harmful gate MUST be caught, and each
// legitimate use MUST pass. If this ever inverts, the guard is decorative.
async function runSelfTest() {
  const harmful = [
    ['const isRefunded = order.status === "refunded" || !!order.refunded_at;', "!!refunded_at"],
    ["if (order.refunded_at) return false;", "if (refunded_at)"],
    ["return TERMINAL.has(o.status) || !!o.refunded_at;", "!!refunded_at"],
    ["const closed = order.status === \"cancelled\" || !!order.refunded_at;", "!!refunded_at"],
    ["if (o.refunded_at != null) return true;", "refunded_at ==/!= null"],
    ["const dead = Boolean(order.refunded_at);", "Boolean(refunded_at)"],
    ["const blocked = order.refunded_at && !order.doctor_email;", "refunded_at &&/||"],
    ["const locked = order.refunded_at ? true : false;", "refunded_at ? (gate)"],
    ['{order.status !== "refunded" && !order.refunded_at && (', "!refunded_at"],
    // Cast form — the shape the customer portal actually used. A naive accessor
    // regex misses this; it must not.
    ['if (s === "refunded" || (order as Order & { refunded_at?: string | null }).refunded_at) return TERMINAL;', "&&/|| refunded_at"],
    ['const isRefunded = order.status === "refunded" || !!(order as Order & { refunded_at?: string | null }).refunded_at;', "!!refunded_at"],
    ['const isCancelled = order.status === "cancelled" && !(order as Order & { refunded_at?: string | null }).refunded_at;', "!refunded_at"],
  ];
  const legitimate = [
    "refunded_at?: string | null;",
    'refunded_at: new Date().toISOString(),',
    '.select("id, status, refunded_at, refund_status")',
    "const ms = new Date(o.refunded_at).getTime();",
    "<p>{fmt(order.refunded_at)}</p>",
    "metadata: { refunded_at: refundedAt },",
    "rows.sort((a, b) => new Date(a.refunded_at) - new Date(b.refunded_at));",
    "const refundedMs = order.refunded_at ? new Date(order.refunded_at).getTime() : NaN;",
    "// a bare !!refunded_at gate is wrong — this is a comment and must not trip",
  ];

  let bad = 0;
  console.log(`${TAG} negative control — harmful patterns MUST be caught:`);
  for (const [code, expectKind] of harmful) {
    const hits = scanSource("virtual/harmful.ts", code);
    if (hits.length === 0) { console.error(`  ✗ MISSED (guard is blind): ${code}`); bad++; }
    else console.log(`  ✓ caught [${hits[0].kind}] ${code.slice(0, 62)}`);
    if (hits.length && expectKind && hits[0].kind !== expectKind) {
      console.log(`      (kind ${hits[0].kind}, expected ${expectKind} — still caught)`);
    }
  }
  console.log(`${TAG} negative control — legitimate uses MUST pass:`);
  for (const code of legitimate) {
    const hits = scanSource("virtual/ok.ts", code);
    if (hits.length > 0) { console.error(`  ✗ FALSE POSITIVE [${hits[0].kind}]: ${code}`); bad++; }
    else console.log(`  ✓ allowed: ${code.slice(0, 62)}`);
  }

  if (bad > 0) {
    console.error(`${TAG} SELF-TEST FAILED — ${bad} problem(s).`);
    process.exit(1);
  }
  console.log(`${TAG} SELF-TEST PASSED — guard catches harm and permits valid timestamp use.`);
}

// ── Deno port drift ─────────────────────────────────────────────────────────
// The edge-function port must keep the same rules as the canonical module.
async function checkPortDrift() {
  const problems = [];
  const canon = await readFile(resolve(ROOT, "src/lib/orderClassification.ts"), "utf8").catch(() => null);
  const port = await readFile(resolve(ROOT, "supabase/functions/_shared/orderClassification.ts"), "utf8").catch(() => null);
  if (!canon) return ["src/lib/orderClassification.ts — MISSING (canonical classifier)"];
  if (!port) return ["supabase/functions/_shared/orderClassification.ts — MISSING (Deno port)"];

  // The load-bearing predicate bodies must be character-identical.
  const bodies = [
    { name: "isFullRefund", re: /export function isFullRefund\(o: ClassifiableOrder\): boolean \{([\s\S]*?)\n\}/ },
    { name: "isPartialRefund", re: /export function isPartialRefund\(o: ClassifiableOrder\): boolean \{([\s\S]*?)\n\}/ },
    { name: "hasAnyRefund", re: /export function hasAnyRefund\(o: ClassifiableOrder\): boolean \{([\s\S]*?)\n\}/ },
    { name: "refundDisposition", re: /export function refundDisposition\(o: ClassifiableOrder\): RefundDisposition \{([\s\S]*?)\n\}/ },
  ];
  const norm = (s) => stripComments(s).replace(/\s+/g, " ").trim();
  for (const { name, re } of bodies) {
    const a = canon.match(re)?.[1];
    const b = port.match(re)?.[1];
    if (!a) { problems.push(`src/lib/orderClassification.ts — ${name}() not found`); continue; }
    if (!b) { problems.push(`supabase/functions/_shared/orderClassification.ts — ${name}() not found`); continue; }
    if (norm(a) !== norm(b)) {
      problems.push(`${name}() DRIFTED between src/lib/orderClassification.ts and the Deno port — they must encode identical rules`);
    }
  }
  return problems;
}

async function main() {
  if (selfTest) return runSelfTest();

  const files = await collectFiles();
  const problems = [];

  for (const abs of files) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (CANONICAL.has(rel)) continue;
    const src = await readFile(abs, "utf8");
    for (const h of scanSource(rel, src)) {
      problems.push(`${rel}:${h.line} — reads refunded_at as a boolean [${h.kind}]\n      ${h.code}`);
    }
  }

  problems.push(...(await checkPortDrift()));

  if (problems.length === 0) {
    console.log(`${TAG} OK — no consumer treats refunded_at as proof of a full/terminal refund; Deno port in sync.`);
    return;
  }

  console.error(`${TAG} DRIFT — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`${TAG} refunded_at is set for PARTIAL refunds too — a bare boolean read wrongly ends a live order.`);
  console.error(`${TAG} Use isRefundTerminal / isRefundedBucket / isPartialRefund / refundDisposition from`);
  console.error(`${TAG}   src/lib/orderClassification.ts (or ../_shared/orderClassification.ts in edge functions).`);
  console.error(`${TAG} Legitimate display/sort/audit/writer uses are not boolean reads and never trip this.`);
  console.error(`${TAG} A genuine exception must be added to ALLOW[] in this file WITH a reason.`);

  if (!warnOnly) process.exit(1);
}

main().catch((err) => {
  console.error(`${TAG} fatal:`, err);
  process.exit(1);
});
