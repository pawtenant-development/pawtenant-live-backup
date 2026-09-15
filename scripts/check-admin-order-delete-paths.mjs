// scripts/check-admin-order-delete-paths.mjs
//
// ADMIN-ORDER-DELETE-REPAIR-002 — 2026-09-16
//
// ADMIN-ORDER-DELETE-REPAIR-001 moved the order purge into the admin-gated
// `admin_delete_order` SECURITY DEFINER RPC, but repaired only ONE of the four
// admin controls that delete orders. A crawl of the deployed LIVE bundle found
// one `admin_delete_order` call sitting alongside THREE hand-rolled browser
// cascades that were still shipping — and those cascades filtered the on-screen
// list by the operator's selection rather than by what the database actually
// removed, so a refused delete looked like a success until the next refresh.
//
// This guard makes that class of partial repair impossible to ship again:
//
//   1. No source file may delete from `orders` in the browser. The RPC is the
//      only sanctioned purge.
//   2. No source file may hand-roll the child-table cascade the RPC replaced.
//   3. Every admin delete control must call the shared helper in
//      src/lib/adminDeleteOrder.ts.
//   4. The helper must map EVERY refusal code the migration can return to an
//      operator-facing sentence — a new code must never reach the UI as a raw
//      token.
//   5. Bulk call sites must drive their list update from the helper's
//      `deleted` result, never from the selection.
//
// Usage:
//   node scripts/check-admin-order-delete-paths.mjs             → check
//   node scripts/check-admin-order-delete-paths.mjs --self-test → negative controls
//
// The negative controls mutate IN-MEMORY copies of the sources, so nothing on
// disk is ever touched and an interrupted run cannot leave a damaged file.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const HELPER = "src/lib/adminDeleteOrder.ts";
const MIGRATION =
  "supabase/migrations/20260916090000_admin_delete_order_catalog_driven_blockers.sql";

// Every file that owns an admin "delete this order" control.
const DELETE_CALL_SITES = [
  "src/pages/admin-orders/page.tsx",
  "src/pages/admin-orders/components/PaymentsTab.tsx",
  "src/pages/admin-orders/components/OrderDetailModal.tsx",
];

// Call sites that delete MANY orders and therefore must reconcile their list
// against what actually got deleted.
const BULK_CALL_SITES = [
  "src/pages/admin-orders/page.tsx",
  "src/pages/admin-orders/components/PaymentsTab.tsx",
];

// Child tables the pre-repair browser cascade used to clear by hand.
const LEGACY_CASCADE_TABLES = [
  "doctor_earnings",
  "order_documents",
  "doctor_notes",
  "order_status_logs",
  "doctor_notifications",
];

// ── Single read point: normalise CRLF→LF exactly once. ──────────────────────
async function readSource(rel) {
  return (await readFile(resolve(ROOT, rel), "utf8")).replace(/\r\n/g, "\n");
}

/**
 * Strip // and /* *\/ comments so a doc comment that DESCRIBES the old cascade
 * (there are several, deliberately) can never be mistaken for the cascade.
 *
 * String literals are deliberately NOT stripped: the thing being detected is
 * `from("orders").delete()`, whose table name lives inside a literal. Removing
 * literals here would erase the very evidence the check depends on — this
 * guard asserts a USE, and the literal is part of that use.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let mode = "code"; // code | line | block | single | double | tick
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && d === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") mode = "single";
      else if (c === '"') mode = "double";
      else if (c === "`") mode = "tick";
      out += c; i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; }
      i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && d === "/") { mode = "code"; i += 2; continue; }
      if (c === "\n") out += c;
      i++; continue;
    }
    // inside a string literal — copy verbatim, honour escapes
    out += c;
    if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
    if ((mode === "single" && c === "'") || (mode === "double" && c === '"') || (mode === "tick" && c === "`")) {
      mode = "code";
    }
    i++;
  }
  return out;
}

/** Refusal codes the migration can return, read from the SQL itself. */
function migrationErrorCodes(sql) {
  const codes = new Set();
  for (const m of sql.matchAll(/'error',\s*'([a-z_]+)'/g)) codes.add(m[1]);
  return codes;
}

async function collectFindings(overrides = {}) {
  const findings = [];
  const read = async (rel) =>
    Object.prototype.hasOwnProperty.call(overrides, rel)
      ? overrides[rel].replace(/\r\n/g, "\n")
      : await readSource(rel);

  const helperSrc = await read(HELPER);
  const helperCode = stripComments(helperSrc);
  const migrationSql = await read(MIGRATION);

  // ── 1 + 2: no browser-side purge anywhere in src/ ────────────────────────
  const scanned = new Set([...DELETE_CALL_SITES, HELPER]);
  for (const rel of scanned) {
    const code = stripComments(await read(rel));

    if (/\.from\(\s*["']orders["']\s*\)\s*\.delete\(/.test(code)) {
      findings.push(
        `${rel}: deletes from "orders" in the browser. Call adminDeleteOrder/adminDeleteOrders instead — ` +
          "the admin_delete_order RPC is the only sanctioned purge.",
      );
    }

    // The legacy cascade is recognisable as 3+ of its child tables being
    // .delete()d in one file. Any single one may be legitimate elsewhere.
    const hit = LEGACY_CASCADE_TABLES.filter((t) =>
      new RegExp(`\\.from\\(\\s*["']${t}["']\\s*\\)\\s*\\.delete\\(`).test(code),
    );
    if (hit.length >= 3) {
      findings.push(
        `${rel}: hand-rolled child cascade detected (${hit.join(", ")}). ` +
          "That list cannot stay in step with the schema — the RPC reads its blockers from pg_constraint.",
      );
    }
  }

  // ── 3: every delete control routes through the shared helper ─────────────
  for (const rel of DELETE_CALL_SITES) {
    const code = stripComments(await read(rel));
    if (!/\badminDeleteOrders?\s*\(/.test(code)) {
      findings.push(
        `${rel}: has an order-delete control but never calls adminDeleteOrder/adminDeleteOrders from ${HELPER}.`,
      );
    }
  }

  // ── 4: helper handles every refusal code the migration can emit ──────────
  const codes = migrationErrorCodes(migrationSql);
  if (codes.size === 0) {
    findings.push(`${MIGRATION}: no refusal codes found — has the RPC contract moved?`);
  }
  for (const code of codes) {
    if (!helperCode.includes(`"${code}"`)) {
      findings.push(
        `${HELPER}: does not handle refusal code "${code}" returned by ${MIGRATION}. ` +
          "An unmapped code reaches the administrator as a raw token.",
      );
    }
  }

  // ── 5: bulk call sites reconcile against what was actually deleted ───────
  for (const rel of BULK_CALL_SITES) {
    const code = stripComments(await read(rel));
    if (!/\bdeleted\b/.test(code)) {
      findings.push(
        `${rel}: never reads the helper's \`deleted\` result. A bulk control must update its list from ` +
          "what the database actually removed, not from the operator's selection.",
      );
    }
  }

  return findings;
}

async function selfTest() {
  const baseline = await collectFindings();
  if (baseline.length) {
    console.error("[check-admin-order-delete-paths] --self-test ABORTED: the real tree already fails.");
    for (const f of baseline) console.error(`    - ${f}`);
    process.exitCode = 1;
    return;
  }

  const page = await readSource("src/pages/admin-orders/page.tsx");
  const helper = await readSource(HELPER);
  const payments = await readSource("src/pages/admin-orders/components/PaymentsTab.tsx");

  const anchor = "const { deleted, message } = await adminDeleteOrders(targets);";
  if (!page.includes(anchor)) {
    console.error(
      "[check-admin-order-delete-paths] --self-test ABORTED: the page.tsx anchor moved; " +
        "update the planted controls so they still mutate real code.",
    );
    process.exitCode = 1;
    return;
  }

  const controls = [
    {
      name: "a browser-side orders delete reintroduced",
      overrides: {
        "src/pages/admin-orders/page.tsx": page.replace(
          anchor,
          `await supabase.from("orders").delete().eq("id", targets[0].id);\n    ${anchor}`,
        ),
      },
      expect: /deletes from "orders" in the browser/,
    },
    {
      name: "the hand-rolled child cascade reintroduced",
      overrides: {
        "src/pages/admin-orders/page.tsx": page.replace(
          anchor,
          `await supabase.from("doctor_earnings").delete().eq("order_id", 1);
           await supabase.from("order_documents").delete().eq("order_id", 1);
           await supabase.from("doctor_notes").delete().eq("order_id", 1);
           ${anchor}`,
        ),
      },
      expect: /hand-rolled child cascade detected/,
    },
    {
      name: "a delete control stops calling the shared helper",
      overrides: {
        "src/pages/admin-orders/components/PaymentsTab.tsx": payments.replaceAll(
          "adminDeleteOrders(",
          "legacyInlineDelete(",
        ),
      },
      expect: /never calls adminDeleteOrder/,
    },
    {
      name: "the helper drops a refusal code the RPC still returns",
      overrides: {
        [HELPER]: helper.replace('case "has_child_orders":', 'case "SOMETHING_ELSE":'),
      },
      expect: /does not handle refusal code "has_child_orders"/,
    },
    {
      name: "a bulk control stops reconciling against `deleted`",
      overrides: {
        "src/pages/admin-orders/page.tsx": page
          .replaceAll("deleted", "selectedIds")
          .replace(/selectedIdsSet/g, "selectedIdsSet"),
      },
      expect: /never reads the helper's `deleted` result/,
    },
  ];

  let failed = 0;
  for (const c of controls) {
    const found = await collectFindings(c.overrides);
    if (found.some((f) => c.expect.test(f))) {
      console.log(`  ✓ detected: ${c.name}`);
    } else {
      failed++;
      console.error(`  ✗ NOT DETECTED: ${c.name}`);
      console.error(`      expected a finding matching ${c.expect}`);
      console.error(`      got: ${found.length ? found.join(" | ") : "<no findings>"}`);
    }
  }

  if (failed) {
    console.error(
      `[check-admin-order-delete-paths] --self-test FAILED — ${failed}/${controls.length} planted control(s) went undetected.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[check-admin-order-delete-paths] --self-test OK — all ${controls.length} planted negative controls were detected.`,
  );
}

async function main() {
  if (process.argv.includes("--self-test")) {
    await selfTest();
    return;
  }
  const findings = await collectFindings();
  if (findings.length) {
    console.error("[check-admin-order-delete-paths] FAILED:");
    for (const f of findings) console.error(`    - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[check-admin-order-delete-paths] OK — all ${DELETE_CALL_SITES.length} admin delete controls route through ` +
      `${HELPER}, no browser-side purge remains, and every RPC refusal code maps to an operator-facing message.`,
  );
}

main().catch((err) => {
  console.error("[check-admin-order-delete-paths] fatal:", err);
  process.exitCode = 1;
});
