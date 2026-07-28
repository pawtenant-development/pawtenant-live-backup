// scripts/check-edge-function-modules.mjs
//
// ADDITIONAL-PET-ADMIN-MORE-MENU-AND-COMPLETED-ORDER-GATING-002 — release-safety guard.
//
// WHY THIS EXISTS (real incident, 2026-07-28):
// A completed-order race guard added `const parentOrderId` to
// supabase/functions/_shared/completeAdditionalPetPayment.ts, but that
// identifier was ALREADY declared later in the same function scope. A duplicate
// `const` is a PARSE-TIME SyntaxError, so every edge function importing that
// shared module failed to start with BOOT_ERROR — stripe-webhook,
// create-additional-pet-request and provider-additional-pet-decision were all
// down on TEST.
//
// Nothing in the existing chain caught it:
//   • `tsc --noEmit` only covers the frontend project (tsconfig.app.json) and
//     does not include supabase/functions at all;
//   • the Vite build never bundles edge functions;
//   • POST probes returned 401 at the API GATEWAY, before the function was ever
//     invoked, so a 401 is NOT boot proof;
//   • the static Additional Pet guards read source as TEXT, so a text-search
//     guard can never see a module-graph or parse failure.
//
// This guard therefore PARSES AND LINKS the real module graph of each edge
// function entry point with esbuild: it resolves every relative import
// (including the shared modules), parses TypeScript, and fails on duplicate
// declarations, syntax errors, missing modules and duplicate exports.
//
// Remote `https://` imports (esm.sh, deno.land) are marked EXTERNAL: this guard
// is a deterministic offline parse/link check, not a network fetch. Local
// correctness — which is what broke — is fully covered.
//
// Usage:
//   node scripts/check-edge-function-modules.mjs             → guard (exit 1 on fail)
//   node scripts/check-edge-function-modules.mjs --warn-only → audit (exit 0)
//   node scripts/check-edge-function-modules.mjs --self-test → prove controls trip

import { build } from "esbuild";
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

/** Edge function entry points whose module graph must parse and link. */
const ENTRIES = [
  "supabase/functions/create-additional-pet-request/index.ts",
  "supabase/functions/provider-additional-pet-decision/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
];

/** Treat every remote specifier as external — we check the LOCAL graph. */
const externalRemote = {
  name: "external-remote",
  setup(b) {
    b.onResolve({ filter: /^(https?:|npm:|node:|jsr:)/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

/** Parse + link one entry point. Returns [] when clean, else error strings. */
async function checkEntry(absEntry) {
  try {
    await build({
      entryPoints: [absEntry],
      bundle: true,          // follow and LINK the local module graph
      write: false,          // never emit — this is a check
      format: "esm",
      platform: "neutral",
      target: "esnext",
      logLevel: "silent",
      plugins: [externalRemote],
    });
    return [];
  } catch (e) {
    const errs = (e && e.errors) || [];
    if (errs.length) {
      return errs.map((x) => {
        const loc = x.location ? ` (${x.location.file}:${x.location.line})` : "";
        return `${x.text}${loc}`;
      });
    }
    return [String(e && e.message ? e.message : e)];
  }
}

const NAME = "check-edge-function-modules";

async function runAll(rootDir) {
  const results = [];
  for (const rel of ENTRIES) {
    const abs = resolve(rootDir, rel);
    if (!existsSync(abs)) {
      results.push({ rel, ok: false, errors: [`missing entry point: ${rel}`] });
      continue;
    }
    const errors = await checkEntry(abs);
    results.push({ rel, ok: errors.length === 0, errors });
  }
  return results;
}

// ── Planted negative controls ─────────────────────────────────────────────
// Each mutates a COPY of the tree and must make the guard fail. They target the
// shared module, because that is the file whose breakage took three functions
// down at once.
const SHARED = "supabase/functions/_shared/completeAdditionalPetPayment.ts";

const CONTROLS = [
  ["duplicate const declaration (the real 2026-07-28 incident)", (dir) => {
    const p = join(dir, SHARED);
    let s = readFileSync(p, "utf8");
    s = s.replace(
      "  const raceOrderId = (reqRow.order_id as string) ?? opts.parentOrderId ?? null;",
      "  const raceOrderId = (reqRow.order_id as string) ?? opts.parentOrderId ?? null;\n  const parentOrderId = 'dupe';",
    );
    return [p, s];
  }],
  ["syntax error", (dir) => {
    const p = join(dir, SHARED);
    return [p, readFileSync(p, "utf8") + "\nexport function broken( {\n"];
  }],
  ["broken relative import", (dir) => {
    const p = join(dir, SHARED);
    const s = readFileSync(p, "utf8").replace(
      './logEmailComm.ts"',
      './this-module-does-not-exist.ts"',
    );
    return [p, s];
  }],
  ["duplicate exported identifier", (dir) => {
    const p = join(dir, SHARED);
    return [p, readFileSync(p, "utf8") + "\nexport const ADDITIONAL_PET_CURRENCY = 'dupe';\n"];
  }],
  ["missing shared module", (dir) => {
    const p = join(dir, SHARED);
    rmSync(p, { force: true });
    return null;                 // deletion only
  }],
];

try {
  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST fail the check\n`);
    let bad = 0;
    for (const [label, mutate] of CONTROLS) {
      const dir = mkdtempSync(join(tmpdir(), "efm-"));
      try {
        cpSync(join(ROOT, "supabase"), join(dir, "supabase"), { recursive: true });
        const out = mutate(dir);
        if (out) {
          const [p, s] = out;
          const { writeFileSync } = await import("node:fs");
          writeFileSync(p, s, "utf8");
        }
        const results = await runAll(dir);
        const failed = results.some((r) => !r.ok);
        if (!failed) bad++;
        console.log(`  ${failed ? "CAUGHT " : "MISSED "} ${label}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = await runAll(ROOT);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.rel}`);
    for (const e of r.errors) console.log(`          ${e}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} edge function module graphs parse and link.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
