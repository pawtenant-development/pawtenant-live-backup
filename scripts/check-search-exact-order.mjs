#!/usr/bin/env node
// COMMAND-CENTER-SEARCH-EXACT-ORDER-001 — build guard + logic + negative controls.
//
// An order with no usable phone was unreachable by ANY Command Center search
// term, including its own confirmation id, because every arm of
// admin_search_conversations was keyed on contact_e164.
//
// Locks:
//   * the phone-independent `order_direct` arm exists and is EXACT-only,
//   * it never duplicates an order the phone-keyed arms already returned,
//   * ambiguity handling on the existing arms is untouched,
//   * the RPC keeps its authorization and its anon revoke.
//
//   node scripts/check-search-exact-order.mjs              → static + logic
//   node scripts/check-search-exact-order.mjs --self-test  → + negative controls

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";
const MIG = resolve(ROOT, "supabase/migrations/20260816160000_search_exact_order_without_phone.sql");

const read = (p) => readFileSync(p, "utf8");
const stripComments = (s) => s.replace(/^[ \t]*--.*$/gm, "");

const REQUIRED = [
  { label: "phone-independent arm exists", re: /order_direct as \(/ },
  { label: "arm reads orders directly, not a phone-keyed CTE",
    re: /order_direct as \([\s\S]{0,900}from public\.orders o/ },
  { label: "EXACT confirmation id match (=, case/space normalised)",
    re: /upper\(btrim\(o\.confirmation_id\)\) = upper\(v_q\)/ },
  { label: "EXACT orders.id uuid match",
    re: /v_uuid is not null and o\.id = v_uuid/ },
  { label: "uuid parse cannot raise",
    re: /begin\s*\n\s*v_uuid := v_q::uuid;\s*\n\s*exception when others then\s*\n\s*v_uuid := null;/ },
  { label: "no duplicate with the phone-keyed arms",
    re: /and not exists \(\s*\n\s*select 1 from merged m\s*\n\s*where m\.any_order = o\.id/ },
  { label: "exact order resolves to ONE known customer",
    re: /1::bigint as people/ },
  { label: "existing ambiguity rule untouched",
    re: /when coalesce\(m\.people, 0\) > 1  then 'ambiguous'/ },
  { label: "authorization preserved",
    re: /if not public\.check_is_admin\(\) then\s*\n\s*raise exception 'not_authorized' using errcode = '42501';/ },
  { label: "anon execute revoked",
    re: /revoke all on function public\.admin_search_conversations\(text, integer\) from anon;/ },
  { label: "authenticated retains execute",
    re: /grant execute on function public\.admin_search_conversations\(text, integer\) to authenticated;/ },
  { label: "signature unchanged (body-only replace, no DROP)",
    re: /create or replace function public\.admin_search_conversations\(p_query text, p_limit integer DEFAULT 25\)/ },
];

const FORBIDDEN = [
  { label: "DROP of the search function (would re-add anon EXECUTE)",
    re: /drop function[^\n]*admin_search_conversations/i },
  { label: "fuzzy LIKE on the exact-order arm",
    re: /order_direct as \([\s\S]{0,900}(ilike|like)\s/i },
];

function runStatic() {
  const fails = [];
  const src = read(MIG);
  for (const { label, re } of REQUIRED) if (!re.test(src)) fails.push(`missing: ${label}`);
  for (const { label, re } of FORBIDDEN) if (re.test(stripComments(src))) fails.push(`forbidden: ${label}`);
  if (fails.length) {
    console.error(`${RED}✗ search-exact-order STATIC FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ search-exact-order static passed${RESET} (${REQUIRED.length} required, ${FORBIDDEN.length} forbidden)`);
  return 0;
}

// ── LOGIC ────────────────────────────────────────────────────────────────────

/** Mirrors the order_direct predicate. */
const matchesExact = (order, q, uuid) =>
  (!!order.confirmationId && order.confirmationId.trim().toUpperCase() === q.trim().toUpperCase())
  || (!!uuid && order.id === uuid);

/** Mirrors the istate resolution. */
const istate = (row) =>
  (row.people ?? 0) > 1 ? "ambiguous" : row.people === 1 ? "linked" : row.linkedOrder ? "linked" : "unknown";

function runLogic() {
  const fails = [];
  let n = 0;
  const t = (label, a, e) => { n++; if (JSON.stringify(a) !== JSON.stringify(e)) fails.push(`${label}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

  const o = { confirmationId: "PT-CPRQA-UNPAID", id: "f3db2a9f-25f2-4a43-a938-a34a6c6aaf48", phone: null };

  t("1 exact confirmation id matches", matchesExact(o, "PT-CPRQA-UNPAID", null), true);
  t("2 case-insensitive", matchesExact(o, "pt-cprqa-unpaid", null), true);
  t("3 surrounding whitespace tolerated", matchesExact(o, "  PT-CPRQA-UNPAID  ", null), true);
  t("4 PREFIX does NOT match (no fuzzy widening)", matchesExact(o, "PT-CPRQA", null), false);
  t("5 SUFFIX does NOT match", matchesExact(o, "UNPAID", null), false);
  t("6 different order does not match", matchesExact(o, "PT-SEQGHL-A3", null), false);
  t("7 exact uuid matches", matchesExact(o, "anything", o.id), true);
  t("8 wrong uuid does not match", matchesExact(o, "anything", "00000000-0000-0000-0000-000000000000"), false);

  // A phone-less order still resolves to a linked identity, because the id we
  // were handed IS the identity — this is not a shared-phone inference.
  t("9 exact order is linked with one candidate", istate({ people: 1 }), "linked");
  t("10 shared phone stays ambiguous on the phone arms", istate({ people: 4 }), "ambiguous");
  t("11 unknown number stays unknown", istate({ people: 0, linkedOrder: null }), "unknown");
  t("12 conversation-linked order stays linked", istate({ people: 0, linkedOrder: "o1" }), "linked");

  if (fails.length) {
    console.error(`${RED}✗ search-exact-order LOGIC FAILED${RESET} (${fails.length}/${n})`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ search-exact-order logic passed${RESET} (${n} scenarios)`);
  return 0;
}

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────

function runSelfTest() {
  const fails = [];

  // NC1 — the PRE-FIX arms were phone-keyed. A phone-keyed resolver MUST miss a
  // phone-less order, otherwise scenario 1 proves nothing.
  const phoneKeyed = (order) => !!order.phone;
  if (phoneKeyed({ confirmationId: "PT-CPRQA-UNPAID", phone: null }) === true) {
    fails.push("NC1: phone-keyed control is vacuous (it should MISS a phone-less order)");
  }

  // NC2 — a LIKE-based arm MUST match a prefix, which is why this one uses `=`.
  const likeArm = (order, q) => (order.confirmationId ?? "").toUpperCase().includes(q.toUpperCase());
  if (likeArm({ confirmationId: "PT-CPRQA-UNPAID" }, "PT-CPRQA") === false) {
    fails.push("NC2: LIKE control is vacuous");
  }
  if (matchesExact({ confirmationId: "PT-CPRQA-UNPAID" }, "PT-CPRQA", null) === true) {
    fails.push("NC2b: the shipped arm matched a PREFIX");
  }

  // NC3 — required anchors must match the shipped migration.
  const src = read(MIG);
  for (const { label, re } of REQUIRED) if (!re.test(src)) fails.push(`NC3: anchor "${label}" does not match shipped source`);

  // NC4 — forbidden patterns must match the code they reject.
  if (!FORBIDDEN[0].re.test("drop function if exists public.admin_search_conversations(text,integer);")) {
    fails.push("NC4: DROP control no longer matches");
  }

  if (fails.length) {
    console.error(`${RED}✗ search-exact-order SELF-TEST FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ search-exact-order self-test passed${RESET} (4 negative controls)`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
let code = 0;
try {
  code |= runStatic();
  code |= runLogic();
  if (selfTest) code |= runSelfTest();
  if (code === 0) console.log(`${DIM}  contract: an EXACT order id finds its order with or without a phone — never a prefix, never a guess${RESET}`);
} catch (e) {
  console.error(`${RED}✗ search-exact-order guard error: ${e.message}${RESET}`);
  code = 1;
}
process.exit(code);
