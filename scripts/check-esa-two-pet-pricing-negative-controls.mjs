// scripts/check-esa-two-pet-pricing-negative-controls.mjs
//
// ESA-TWO-PET-129-PRICING-001 — negative controls for check-esa-two-pet-pricing.
//
// A guard that only ever passes proves nothing. This harness PLANTS each defect
// the guard is supposed to catch, re-runs the guard, and requires it to FAIL.
// Every mutation is restored from the original bytes in a finally block.
//
// Safety notes:
//   * Files are restored from an in-memory byte snapshot, so CRLF is preserved
//     exactly and a planted mutation can never be left on disk.
//   * process.exitCode is used, NEVER process.exit(), because process.exit()
//     inside a try would skip the finally and strand a planted mutation.
//
// Usage: node scripts/check-esa-two-pet-pricing-negative-controls.mjs

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TAG = "[esa-two-pet-negative-controls]";
const GUARD = resolve(__dirname, "check-esa-two-pet-pricing.mjs");

const CLIENT = "src/config/pricing.ts";
const SERVER = "supabase/functions/_shared/pricingMatrix.ts";
const CPI = "supabase/functions/create-payment-intent/index.ts";
const PQ = "supabase/functions/_shared/priceQuote.ts";
const MIGRATION = "supabase/migrations/20260819120000_esa_two_pet_pricing_quote_pet_count.sql";
const LP = "src/pages/lp-esa-housing/page.tsx";

/** Run the guard. Returns true when it FAILED (which is what a control wants). */
function guardFails() {
  const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: "utf8" });
  return { failed: r.status !== 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

/** Replace exactly once in a file's text, preserving its line endings. */
function patch(bytes, oldStr, newStr, label) {
  const crlf = bytes.includes("\r\n");
  const text = bytes.replace(/\r\n/g, "\n");
  const o = oldStr.replace(/\r\n/g, "\n");
  const n = text.split(o).length - 1;
  if (n !== 1) throw new Error(`${label}: anchor matched ${n}x (need exactly 1)`);
  const out = text.replace(o, newStr.replace(/\r\n/g, "\n"));
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}

const CONTROLS = [
  {
    name: "1. restore the old 1 -> $129 / 2-3 -> $149 rule",
    edits: [
      [CLIENT, 'return petCount <= 2 ? "single" : "multi";', 'return petCount === 1 ? "single" : "multi";'],
      [SERVER, 'return petCount <= 2 ? "single" : "multi";', 'return petCount === 1 ? "single" : "multi";'],
    ],
  },
  {
    name: "2. make three pets resolve to $129",
    edits: [
      [CLIENT, 'return petCount <= 2 ? "single" : "multi";', 'return petCount <= 3 ? "single" : "multi";'],
      [SERVER, 'return petCount <= 2 ? "single" : "multi";', 'return petCount <= 3 ? "single" : "multi";'],
    ],
  },
  {
    name: "3. trust a client-submitted amount",
    edits: [
      [CPI, "  const action = (body.action as string) ?? \"\";",
        "  const action = (body.action as string) ?? \"\";\n  const forcedAmount = Number(body.amount);"],
    ],
  },
  {
    name: "4. allow four pets through the base resolver",
    edits: [
      [CLIENT, "if (petCount < 1 || petCount > 3) return null;", "if (petCount < 1 || petCount > 4) return null;"],
      [SERVER, "if (petCount < 1 || petCount > 3) return null;", "if (petCount < 1 || petCount > 4) return null;"],
    ],
  },
  {
    name: "5. use a TEST Stripe price ID in LIVE",
    edits: [
      // The real TEST first-year ESA price — planting it here is exactly the
      // cross-environment mistake this control must catch.
      [SERVER, 'price_1TubftGwm9wIWlgihMaXmYGZ', 'price_1TuHnsGwm9wIWlgiEf4UgbO5'],
    ],
  },
  {
    name: "6. reprice a historical order in the migration",
    edits: [
      [MIGRATION, "grant execute on function public.trusted_price_quote_cents(text, integer) to service_role;",
        "grant execute on function public.trusted_price_quote_cents(text, integer) to service_role;\nupdate public.orders set price = 129 where price = 149;"],
    ],
  },
  {
    name: "7. leave a stale customer-facing '2-3 pets for $149' claim",
    edits: [
      [LP, "3 pets covered at a <span className=\"text-slate-900 font-medium\">fixed $149 total</span>",
        "2 or 3 pets covered at a <span className=\"text-slate-900 font-medium\">fixed $149 total</span>"],
    ],
  },
  {
    name: "8. remove server-side pet-count validation",
    edits: [
      [CPI, "  const petCount = parsePetCount(body.petCount);\n  if (petCount === null) {\n    return json({ error: \"petCount must be 1, 2 or 3\" }, 400);\n  }",
        "  const petCount = Math.max(1, Number(body.petCount ?? 1));"],
    ],
  },
  // ── P0 2026-08-19 (PT-MT08TGT2 + stale two-pet $149 quotes) ───────────────
  {
    name: "9. drop the stale-quote cap (stored $149 beats current $129 again)",
    edits: [
      [PQ, "    if (cents > configBaseCents) {\n      return { baseCents: configBaseCents, pricingSource: \"stale_quote_repriced\", usedTrustedQuote: false };\n    }\n\n",
        ""],
    ],
  },
  {
    name: "10. reprice a reused intent without erasing stale coupon metadata",
    edits: [
      [CPI, "          ...(discountCents > 0 ? {} : { coupon_code: \"\", coupon_discount_cents: \"\" }),\n",
        ""],
    ],
  },
  {
    name: "11. resolve the client couponCode instead of the recovered one",
    edits: [
      [CPI, "        const coupon = await resolveStripeCoupon(stripe, effectiveCouponCode);",
        "        const coupon = await resolveStripeCoupon(stripe, couponCode);"],
    ],
  },
  {
    name: "12. let recovery resurrect an explicitly removed coupon",
    edits: [
      [CPI, "    if (!effectiveCouponCode && !clearCoupon && confirmationId) {",
        "    if (!effectiveCouponCode && confirmationId) {"],
    ],
  },
];

async function main() {
  // Sanity: the guard must PASS before any mutation, otherwise every control
  // would "fail" for the wrong reason and prove nothing.
  const baseline = guardFails();
  if (baseline.failed) {
    console.error(`${TAG} ABORT — the guard is already failing before any control was planted:\n${baseline.out}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${TAG} baseline: guard PASSES on clean tree`);

  let bad = 0;
  for (const control of CONTROLS) {
    const snapshots = new Map();
    try {
      for (const [rel, oldStr, newStr] of control.edits) {
        const abs = resolve(ROOT, rel);
        if (!snapshots.has(rel)) snapshots.set(rel, await readFile(abs, "utf8"));
        const current = await readFile(abs, "utf8");
        await writeFile(abs, patch(current, oldStr, newStr, control.name), "utf8");
      }
      const { failed, out } = guardFails();
      if (failed) {
        console.log(`${TAG} OK   — control "${control.name}" was CAUGHT`);
      } else {
        bad += 1;
        console.error(`${TAG} FAIL — control "${control.name}" was NOT caught (guard still passed)`);
        if (out) console.error(`        guard said: ${out.split("\n")[0]}`);
      }
    } catch (err) {
      bad += 1;
      console.error(`${TAG} FAIL — control "${control.name}" could not be planted: ${err.message}`);
    } finally {
      // Restore from the byte snapshot no matter what happened above.
      for (const [rel, original] of snapshots) {
        await writeFile(resolve(ROOT, rel), original, "utf8");
      }
    }
  }

  // Prove the tree really is clean again.
  const after = guardFails();
  if (after.failed) {
    console.error(`${TAG} ABORT — the tree did not restore cleanly:\n${after.out}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${TAG} restored: guard PASSES again on clean tree`);

  if (bad) {
    console.error(`${TAG} FAILED — ${bad} of ${CONTROLS.length} negative control(s) were not caught`);
    process.exitCode = 1;
    return;
  }
  console.log(`${TAG} OK — all ${CONTROLS.length} negative controls were caught`);
}

await main();
