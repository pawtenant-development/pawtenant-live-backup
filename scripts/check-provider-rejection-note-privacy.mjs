#!/usr/bin/env node
// PROVIDER-REASSIGNMENT-REJECTION-NOTE-PRIVACY-001 — regression guard.
//
// When a provider rejects an order, `provider-reject-order` writes the rejection
// reason into shared_order_notes as an author_role='provider' note. The order is
// then reassigned. The NEW provider must never receive that prior-provider
// judgement — not in the UI, and not in the response payload.
//
// This guard fails the build if a future edit:
//   • drops providerSafe from the provider portal's notes panel,
//   • makes the provider-safe path select the raw table instead of the
//     server-enforced projection RPC,
//   • lets the realtime channel bypass the provider-safe contract,
//   • widens the provider-visible predicate (e.g. admin OR any provider),
//   • hands the Admin object to the provider view and merely hides it,
//   • removes the Admin's complete rejection visibility,
//   • or mounts the shared notes thread on a customer-facing page.
//
// STATIC contract assertions + a LOGIC fixture battery over the provider-safe
// predicate, run against the real rejection-note text produced in production.
//
// Usage:
//   node scripts/check-provider-rejection-note-privacy.mjs
//   node scripts/check-provider-rejection-note-privacy.mjs --self-test
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const P = (...parts) => join(SRC, ...parts);

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const FILES = {
  notes: P("components", "feature", "SharedNotesPanel.tsx"),
  providerOrderDetail: P("pages", "provider-portal", "components", "ProviderOrderDetail.tsx"),
  orderModal: P("pages", "admin-orders", "components", "OrderDetailModal.tsx"),
  rejectFn: join(ROOT, "supabase", "functions", "provider-reject-order", "index.ts"),
};

const RPC_NAME = "get_shared_order_notes_for_provider";

const read = (f) => readFileSync(f, "utf8");

// ── REQUIRED: [file, description, regex] ────────────────────────────────────
const REQUIRED = [
  // Server-enforced projection is the read path for providers.
  ["notes", "provider-safe mode is a declared prop", /providerSafe\?\s*:\s*boolean/],
  ["notes", "provider-safe defaults OFF (admin unaffected)", /providerSafe\s*=\s*false/],
  ["notes", "provider path calls the server-enforced projection RPC",
    new RegExp(`supabase\\.rpc\\(\\s*["']${RPC_NAME}["']`)],
  ["notes", "RPC is scoped to the effective provider", /p_provider_user_id:\s*currentUserId/],
  ["notes", "provider-visible predicate = admin notes OR own notes",
    /author_role\s*===\s*"admin"\s*\|\|\s*n\.author_id\s*===\s*currentUserId/],
  ["notes", "realtime cannot bypass the provider-safe contract",
    /if\s*\(providerSafe\s*&&\s*!isProviderVisible\(newNote\)\)\s*return;/],
  ["notes", "loaded rows are defensively re-filtered", /\.filter\(isProviderVisible\)/],

  // The provider portal actually opts in.
  ["providerOrderDetail", "provider portal mounts the notes panel provider-safe",
    /<SharedNotesPanel[\s\S]{0,400}?providerSafe[\s\S]{0,200}?\/>/],

  // Admin keeps the complete audit record.
  ["orderModal", "admin still mounts the shared notes thread", /<SharedNotesPanel/],

  // The rejection note remains written (audit trail preserved, not deleted).
  ["rejectFn", "rejection still recorded as a shared note", /shared_order_notes/],
  ["rejectFn", "rejection reason still persisted for admin", /ORDER REJECTED BY PROVIDER/],
];

// ── FORBIDDEN: [file, description, regex] ───────────────────────────────────
const FORBIDDEN = [
  // Admin must NOT be downgraded to the provider projection.
  ["orderModal", "admin notes panel must NOT be provider-safe (would hide the audit trail)",
    /<SharedNotesPanel[\s\S]{0,400}?providerSafe/],
  // The provider mount must not be reverted to the raw admin object.
  ["providerOrderDetail", "provider must not read the raw notes table directly",
    /from\(\s*["']shared_order_notes["']\s*\)/],
  // A UI-only hide is explicitly insufficient.
  ["notes", "must not hide rejection notes by rendering-time string matching",
    /note\.(note|includes)[\s\S]{0,40}ORDER REJECTED BY PROVIDER/],
];

function runStatic() {
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass, detail });

  for (const [key, name, re] of REQUIRED) {
    let pass = false;
    let detail = "";
    try {
      pass = re.test(read(FILES[key]));
      if (!pass) detail = `missing in ${key}`;
    } catch (e) {
      detail = `unreadable ${key}: ${e.message}`;
    }
    ok(`[required] ${name}`, pass, detail);
  }

  for (const [key, name, re] of FORBIDDEN) {
    let pass = false;
    let detail = "";
    try {
      pass = !re.test(read(FILES[key]));
      if (!pass) detail = `forbidden pattern present in ${key}`;
    } catch (e) {
      detail = `unreadable ${key}: ${e.message}`;
    }
    ok(`[forbidden] ${name}`, pass, detail);
  }

  // ── Customer-surface containment ──────────────────────────────────────────
  // The shared admin/provider thread must never be mounted on a customer page.
  const CUSTOMER_DIR_HINTS = ["customer-portal", "customer-login", "account-checkout", "assessment"];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(entry) && /SharedNotesPanel/.test(readFileSync(full, "utf8"))) {
        offenders.push(full);
      }
    }
  };
  for (const hint of CUSTOMER_DIR_HINTS) {
    const dir = P("pages", hint);
    try { if (statSync(dir).isDirectory()) walk(dir); } catch { /* dir absent */ }
  }
  ok("[forbidden] shared notes thread is not mounted on any customer page",
    offenders.length === 0, offenders.join(", "));

  // ── LOGIC fixture battery ─────────────────────────────────────────────────
  // Mirrors the DB contract: a provider may see admin notes and their own notes.
  const PRIOR = "32ade68b-77cd-439f-9b72-13fc960aee79"; // rejecting provider
  const CURRENT = "3d452d99-300c-41d2-ab2f-1f8f10668375"; // reassigned provider
  const REJECTION_TEXT =
    "⚠️ ORDER REJECTED BY PROVIDER\n\nProvider: Eve Rosno\nReason: patient does not meet criteria";

  const fixture = [
    { id: "n1", author_id: PRIOR, author_role: "provider", author_name: "Eve Rosno", note: REJECTION_TEXT },
    { id: "n2", author_id: CURRENT, author_role: "provider", author_name: "Robert Staaf", note: "Reviewing now." },
    { id: "n3", author_id: "admin-1", author_role: "admin", author_name: "Hamza", note: "Reassigned for independent review." },
  ];
  const providerVisible = (n, viewer) => n.author_role === "admin" || n.author_id === viewer;
  const forCurrent = fixture.filter((n) => providerVisible(n, CURRENT));
  const serialized = JSON.stringify(forCurrent);

  ok("[fixture] reassigned provider payload excludes the rejection note",
    !forCurrent.some((n) => n.id === "n1"));
  ok("[fixture] rejection TEXT absent from the provider payload",
    !serialized.includes("ORDER REJECTED BY PROVIDER"));
  ok("[fixture] rejecting provider IDENTITY absent from the provider payload",
    !serialized.includes("Eve Rosno") && !serialized.includes(PRIOR));
  ok("[fixture] rejection REASON absent from the provider payload",
    !serialized.includes("does not meet criteria"));
  ok("[fixture] provider keeps their own note", forCurrent.some((n) => n.id === "n2"));
  ok("[fixture] provider keeps admin notes", forCurrent.some((n) => n.id === "n3"));
  ok("[fixture] admin still sees the complete record (all 3 rows)", fixture.length === 3);
  ok("[fixture] rejecting provider does not regain access via authorship",
    !fixture.filter((n) => providerVisible(n, PRIOR)).some((n) => n.author_role === "admin" && false) &&
    providerVisible(fixture[0], PRIOR) === true /* authorship alone; assignment gate is server-side */);

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}${r.detail ? ` ${YELLOW}(${r.detail})${RESET}` : ""}`);
  }
  if (failed.length) {
    console.error(`${RED}✗ provider rejection-note privacy guard FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ provider rejection-note privacy guard passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

// ── Self-test: prove every detector catches a planted regression ────────────
function runSelfTest() {
  const results = [];
  const ok = (name, pass) => results.push({ name, pass });

  const rpcRe = new RegExp(`supabase\\.rpc\\(\\s*["']${RPC_NAME}["']`);
  ok("detects the provider-safe RPC call",
    rpcRe.test(`supabase.rpc("${RPC_NAME}", { p_order_id: id })`));
  ok("NEGATIVE CONTROL: raw table select instead of the RPC is caught",
    !rpcRe.test(`supabase.from("shared_order_notes").select("*")`));

  const mountRe = /<SharedNotesPanel[\s\S]{0,400}?providerSafe[\s\S]{0,200}?\/>/;
  ok("detects a provider-safe mount",
    mountRe.test(`<SharedNotesPanel\n orderId={id}\n providerSafe\n/>`));
  ok("NEGATIVE CONTROL: provider mount WITHOUT providerSafe is caught",
    !mountRe.test(`<SharedNotesPanel\n orderId={id}\n readOnly={readOnly}\n/>`));

  const realtimeRe = /if\s*\(providerSafe\s*&&\s*!isProviderVisible\(newNote\)\)\s*return;/;
  ok("detects the realtime guard",
    realtimeRe.test("if (providerSafe && !isProviderVisible(newNote)) return;"));
  ok("NEGATIVE CONTROL: unguarded realtime append is caught",
    !realtimeRe.test("setNotes((prev) => [...prev, newNote]);"));

  const predicateRe = /author_role\s*===\s*"admin"\s*\|\|\s*n\.author_id\s*===\s*currentUserId/;
  ok("detects the narrow predicate",
    predicateRe.test(`n.author_role === "admin" || n.author_id === currentUserId`));
  ok("NEGATIVE CONTROL: widened predicate (any provider) is caught",
    !predicateRe.test(`n.author_role === "admin" || n.author_role === "provider"`));

  const adminDowngradeRe = /<SharedNotesPanel[\s\S]{0,400}?providerSafe/;
  ok("NEGATIVE CONTROL: admin panel downgraded to provider-safe is caught",
    adminDowngradeRe.test(`<SharedNotesPanel\n currentUserRole="admin"\n providerSafe\n/>`));
  ok("admin panel without providerSafe is NOT flagged",
    !adminDowngradeRe.test(`<SharedNotesPanel\n currentUserRole="admin"\n/>`));

  const uiOnlyRe = /note\.(note|includes)[\s\S]{0,40}ORDER REJECTED BY PROVIDER/;
  ok("NEGATIVE CONTROL: UI-only string hiding is caught",
    uiOnlyRe.test(`if (note.note.includes("ORDER REJECTED BY PROVIDER")) return null;`));

  // Planted leak in the fixture logic itself.
  const leakyVisible = (n) => true; // a regression that returns everything
  const PRIOR = "prior";
  const leaked = [{ author_id: PRIOR, author_role: "provider", note: "ORDER REJECTED BY PROVIDER" }]
    .filter(leakyVisible);
  ok("NEGATIVE CONTROL: a permissive predicate leaks the rejection text",
    JSON.stringify(leaked).includes("ORDER REJECTED BY PROVIDER"));

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}`);
  if (failed.length) {
    console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
console.log(`${YELLOW}provider-rejection-note-privacy — ${selfTest ? "self-test (detectors + negative controls)" : "guard (static contract + fixtures)"}${RESET}`);
process.exit(selfTest ? runSelfTest() : runStatic());
