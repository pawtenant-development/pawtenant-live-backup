#!/usr/bin/env node
// COMMAND-CENTER-UX-SLICE-001 — build guard + logic tests + negative controls.
//
// Locks the five behaviours this slice shipped so a later refactor cannot
// quietly undo them:
//
//   §2 PERSISTENT UNREAD  — read state is SERVER-backed and per-admin; it is
//                           stamped on OPEN, never on render; outbound activity
//                           can never mark a thread unread.
//   §3 FILTER MENU        — one compact dropdown, not a wrapping pill strip.
//   §4 THREAD IDENTITY    — the customer is named ONCE, and no message bubble
//                           is near-black-on-white.
//   §5 EXACT ORDER        — "Open order" deep-links to THAT order and is
//                           resolved by the existing lookup controller.
//   §7 BELL ROUTING       — SMS/call notifications open the Command Center
//                           thread, and are marked read only AFTER navigating.
//
//   node scripts/check-command-center-ux.mjs              → static + logic
//   node scripts/check-command-center-ux.mjs --self-test  → + negative controls

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const QUEUE  = resolve(ROOT, "src/pages/admin-orders/components/commandCenter/useCommsQueue.ts");
const PANEL  = resolve(ROOT, "src/pages/admin-orders/components/commandCenter/CommandCenterPanel.tsx");
const MENU   = resolve(ROOT, "src/pages/admin-orders/components/commandCenter/QueueFilterMenu.tsx");
const THREAD = resolve(ROOT, "src/pages/admin-orders/components/commandCenter/UnifiedThreadPane.tsx");
const BELL   = resolve(ROOT, "src/pages/admin-orders/components/CompanyNotificationsBell.tsx");
const PAGE   = resolve(ROOT, "src/pages/admin-orders/page.tsx");
const MIG    = resolve(ROOT, "supabase/migrations/20260816070000_command_center_persistent_unread_state.sql");

function read(p) {
  try { return readFileSync(p, "utf8"); }
  catch (e) { throw new Error(`cannot read ${p}: ${e.message}`); }
}

// Comments out, string/template literals KEPT — a "must not contain" scan has to
// see `className="bg-[#1E293B] text-white"`, but must not be tripped by a note
// explaining why that colour was removed.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// ── STATIC INVARIANTS ────────────────────────────────────────────────────────

const REQUIRED = [
  // §2 — server-backed, per-admin, inbound-only.
  { file: MIG, label: "read state is a per-admin table keyed by (admin,conversation)",
    re: /create table if not exists public\.admin_conversation_reads[\s\S]{0,600}primary key \(admin_user_id, conversation_key\)/ },
  { file: MIG, label: "read table has RLS enabled",
    re: /alter table public\.admin_conversation_reads enable row level security/ },
  { file: MIG, label: "an admin can only touch their OWN watermark",
    re: /admin_user_id = auth\.uid\(\) and public\.check_is_admin\(\)/ },
  { file: MIG, label: "reuses the EXISTING admin predicate (no new authz surface)",
    re: /if not public\.check_is_admin\(\) then\s*\n\s*raise exception 'not_authorized'/ },
  { file: MIG, label: "authenticated is revoked BY NAME before being granted",
    re: /revoke all on public\.admin_conversation_reads from authenticated;/ },
  { file: MIG, label: "search_path pinned on the queue-state RPC",
    re: /create or replace function public\.admin_conversation_queue_state[\s\S]{0,400}set search_path to 'public'/ },
  { file: MIG, label: "chat arm counts VISITOR messages only (outbound must not unread)",
    re: /from public\.chats c\s*\n\s*where c\.sender = 'visitor'/ },
  { file: MIG, label: "sms arm uses the inbound-only watermark",
    re: /a\.last_inbound_at is not null/ },
  { file: MIG, label: "watermark only ever moves forward",
    re: /set last_read_at = greatest\(public\.admin_conversation_reads\.last_read_at, excluded\.last_read_at\)/ },
  { file: MIG, label: "conversation key shape is constrained",
    re: /\^\(chat\|sms\|call\|email\|order\):/ },

  { file: QUEUE, label: "queue reads server unread state via RPC",
    re: /supabase\.rpc\("admin_conversation_queue_state"/ },
  { file: QUEUE, label: "queue writes read state via RPC",
    re: /supabase\s*\n?\s*\.rpc\("admin_mark_conversation_read"/ },
  { file: QUEUE, label: "rows carry server unread + last-inbound",
    re: /unread: boolean;[\s\S]{0,900}lastInboundAt: string \| null;/ },
  { file: QUEUE, label: "ordering is unread → needs-reply → activity",
    re: /if \(a\.unread !== b\.unread\) return a\.unread \? -1 : 1;[\s\S]{0,260}needs_reply[\s\S]{0,200}activityMs\(b\) - activityMs\(a\)/ },
  { file: QUEUE, label: "activity key prefers the INBOUND timestamp",
    re: /new Date\(r\.lastInboundAt \?\? r\.when\)/ },
  { file: QUEUE, label: "unread is a filterable facet",
    re: /\{ key: "unread", label: "Unread" \}/ },

  { file: PANEL, label: "read is stamped on explicit open",
    re: /const onSelect = useCallback\(\(key: string\) => \{[\s\S]{0,420}markRead\(key\);/ },
  { file: PANEL, label: "queue row renders a restrained unread marker",
    re: /row\.unread[\s\S]{0,200}rounded-full bg-\[#059669\]/ },

  // §3 — the dropdown.
  { file: PANEL, label: "panel mounts the filter dropdown",
    re: /<QueueFilterMenu\b/ },
  { file: PANEL, label: "filters are a SET (empty = All), not one key",
    re: /useState<Set<FilterKey>>\(\(\) => new Set\(\)\)/ },
  { file: PANEL, label: "multiple filters intersect",
    re: /\[\.\.\.filters\]\.every\(\(f\) => r\.facets\.has\(f\)\)/ },
  { file: MENU, label: "menu is a real aria-expanded trigger",
    re: /aria-expanded=\{open\}/ },
  { file: MENU, label: "Escape closes and restores focus",
    re: /if \(e\.key === "Escape"\)[\s\S]{0,80}close\(true\)/ },
  { file: MENU, label: "click-outside closes",
    re: /window\.addEventListener\("pointerdown", onDown\)/ },
  { file: MENU, label: "arrow-key roving focus",
    re: /e\.key === "ArrowDown"[\s\S]{0,140}e\.key === "ArrowUp"/ },
  { file: MENU, label: "active-filter count on the button",
    re: /activeCount > 0 && \(\s*\n?\s*<span/ },
  { file: MENU, label: "removable active chips",
    re: /aria-label=\{`Remove \$\{labelFor\(k\)\} filter`\}/ },
  { file: MENU, label: "Clear filters action",
    re: /onClick=\{onClear\}[\s\S]{0,200}Clear filters/ },
  { file: MENU, label: "grouped options (Attention / Channel / Order)",
    re: /label: "Attention"[\s\S]{0,300}label: "Channel"[\s\S]{0,200}label: "Order"/ },

  // §4 — identity once, light bubbles.
  { file: PANEL, label: "toolbar suppresses the name when the pane owns it",
    re: /const usesUnifiedPane = !!target[\s\S]{0,900}\{!usesUnifiedPane && \(/ },
  { file: THREAD, label: "thread header names the customer once, larger",
    re: /text-\[15px\] font-extrabold text-\[#0F172A\] truncate leading-tight/ },
  { file: THREAD, label: "bubbles are light-tinted with dark text",
    re: /bg-sky-50 border-sky-200[\s\S]{0,120}bg-emerald-50 border-emerald-200/ },
  { file: THREAD, label: "long unbroken text still wraps",
    re: /overflowWrap: "anywhere"/ },
  { file: THREAD, label: "ambiguity + unknown badges preserved",
    re: /identityState === "unknown"[\s\S]{0,700}identityState === "ambiguous"/ },

  // §5 — exact order.
  { file: PANEL, label: "durable order deep link helper",
    re: /export function orderDeepLink\(orderRef: string\): string \{[\s\S]{0,140}tab=orders&order=\$\{encodeURIComponent\(orderRef\)\}/ },
  { file: PANEL, label: "Open order uses the deep link",
    re: /onClick=\{\(\) => navigate\(orderDeepLink\(row\.orderId!\)\)\}/ },
  { file: PAGE, label: "page resolves ?order= through the EXISTING lookup controller",
    re: /get\("order"\)[\s\S]{0,420}handleDirectLookup\(ref\)/ },
  { file: PAGE, label: "?order= resolves once per distinct value",
    re: /resolvedOrderParamRef\.current === ref\) return;/ },
  { file: PAGE, label: "closing the modal drops ?order=",
    re: /onClose=\{\(\) => \{ setOrderDetail\(null\); setOrderDetailSection\(undefined\); clearOrderParam\(\); \}\}/ },

  // §7 — bell routing.
  { file: BELL, label: "sms/call route to the Command Center",
    re: /const COMMAND_CENTER_GROUPS = new Set\(\["sms", "call"\]\)/ },
  { file: BELL, label: "read is stamped only AFTER a successful navigation",
    re: /if \(onOpenConversation\(item\.entity_id\)\) \{\s*\n\s*markGroupRead\(item\.group_key\);/ },
  { file: PAGE, label: "conversation deep link sets ?comm= on the inbox",
    re: /params\.set\("sub", "inbox"\);[\s\S]{0,200}params\.set\("comm", communicationId\);/ },
  { file: PANEL, label: "?comm= resolves by exact primary key",
    re: /\.from\("communications"\)[\s\S]{0,220}\.eq\("id", commParam\)/ },
  { file: PANEL, label: "an unresolvable notification fails visibly, opens nothing",
    re: /\{commParamError \?[\s\S]{0,700}Conversation not opened/ },
];

// Must NOT come back.
const FORBIDDEN = [
  { file: PANEL, label: "wrapping pill strip (FILTERS.map over buttons)",
    re: /FILTERS\.map\(\([\s\S]{0,400}<button/ },
  { file: PANEL, label: "near-black chat bubble",
    re: /bg-\[#1E293B\] text-white(?![^"]*\bhover)[^"]*"/ },
  { file: THREAD, label: "near-black message bubble",
    re: /bg-\[#1E293B\] text-white rounded-tr-sm/ },
  { file: PANEL, label: "Open order navigating to the bare Orders tab",
    re: /Open order[\s\S]{0,200}navigate\("\/admin-orders\?tab=orders"\)/ },
  { file: QUEUE, label: "browser-local read state",
    re: /localStorage[\s\S]{0,60}(unread|read)|sessionStorage/ },
];

function runStatic() {
  const fails = [];
  for (const { file, label, re } of REQUIRED) {
    if (!re.test(read(file))) fails.push(`missing: ${label}`);
  }
  for (const { file, label, re } of FORBIDDEN) {
    if (re.test(stripComments(read(file)))) fails.push(`forbidden pattern present: ${label}`);
  }
  // The queue must never mark read as a side effect of rendering/polling.
  const q = stripComments(read(QUEUE));
  if (/useEffect\([^)]*\)\s*=>\s*\{[^}]{0,200}markRead\(/.test(q)) {
    fails.push("markRead is called from an effect — rendering would mark work read");
  }
  // Auto-select on desktop must NOT go through onSelect (which stamps read).
  const p = stripComments(read(PANEL));
  if (/window\.innerWidth >= 1024[\s\S]{0,160}onSelect\(/.test(p)) {
    fails.push("desktop auto-select routes through onSelect — it would mark unread work read");
  }

  if (fails.length) {
    console.error(`${RED}✗ command-center UX STATIC FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ command-center UX static passed${RESET} (${REQUIRED.length} required, ${FORBIDDEN.length} forbidden, 2 side-effect)`);
  return 0;
}

// ── LOGIC (JS twins of the shipped rules) ────────────────────────────────────

/** Mirrors admin_conversation_queue_state()'s unread derivation. */
const isUnread = (lastInboundAt, lastReadAt) =>
  !!lastInboundAt && (lastReadAt === null || lastReadAt === undefined || lastInboundAt > lastReadAt);

/** Mirrors the queue's ordering. */
function orderRows(rows) {
  const ms = (r) => {
    const t = new Date(r.lastInboundAt ?? r.when).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  return rows.slice().sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    const an = a.facets.has("needs_reply"), bn = b.facets.has("needs_reply");
    if (an !== bn) return an ? -1 : 1;
    const d = ms(b) - ms(a);
    if (d !== 0) return d;
    return a.key.localeCompare(b.key);
  });
}

const row = (key, { unread = false, needs = false, at = null, when = "2026-01-01T00:00:00Z" } = {}) => ({
  key, unread, when, lastInboundAt: at, facets: new Set(needs ? ["needs_reply"] : []),
});

function runLogic() {
  const fails = [];
  let n = 0;
  const t = (label, actual, expected) => {
    n++;
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) fails.push(`${label}: expected ${e}, got ${a}`);
  };

  // ── unread derivation ──
  t("1 never read → unread", isUnread("2026-08-16T10:00:00Z", null), true);
  t("2 read before the message → unread", isUnread("2026-08-16T10:00:00Z", "2026-08-16T09:00:00Z"), true);
  t("3 read after the message → read", isUnread("2026-08-16T10:00:00Z", "2026-08-16T11:00:00Z"), false);
  t("4 read exactly at the message → read (strict >)", isUnread("2026-08-16T10:00:00Z", "2026-08-16T10:00:00Z"), false);
  t("5 no inbound activity at all → never unread", isUnread(null, null), false);
  // NEW inbound after a read makes it unread again — the watermark is unchanged
  // and the inbound timestamp advanced past it.
  t("6 new inbound after read → unread again", isUnread("2026-08-16T12:00:00Z", "2026-08-16T11:00:00Z"), true);
  // An OUTBOUND reply does not move last_inbound_at, so it cannot re-unread.
  t("7 outbound reply does not unread", isUnread("2026-08-16T10:00:00Z", "2026-08-16T11:00:00Z"), false);

  // ── ordering ──
  t("8 unread outranks newer read",
    orderRows([
      row("b", { at: "2026-08-16T12:00:00Z" }),                 // read, newest
      row("a", { unread: true, at: "2026-08-10T00:00:00Z" }),   // unread, older
    ]).map((r) => r.key), ["a", "b"]);

  t("9 needs-reply outranks newer plain row",
    orderRows([
      row("b", { at: "2026-08-16T12:00:00Z" }),
      row("a", { needs: true, at: "2026-08-10T00:00:00Z" }),
    ]).map((r) => r.key), ["a", "b"]);

  t("10 unread outranks needs-reply",
    orderRows([
      row("n", { needs: true, at: "2026-08-16T12:00:00Z" }),
      row("u", { unread: true, at: "2026-08-01T00:00:00Z" }),
    ]).map((r) => r.key), ["u", "n"]);

  t("11 within a tier, newest inbound first",
    orderRows([
      row("old", { unread: true, at: "2026-08-01T00:00:00Z" }),
      row("new", { unread: true, at: "2026-08-16T00:00:00Z" }),
    ]).map((r) => r.key), ["new", "old"]);

  // An outbound reply bumps `when` but NOT lastInboundAt, so it must not jump.
  t("12 outbound reply does not bump a thread to the top",
    orderRows([
      row("replied", { at: "2026-08-01T00:00:00Z", when: "2026-08-16T23:00:00Z" }),
      row("fresh",   { at: "2026-08-10T00:00:00Z", when: "2026-08-10T00:00:00Z" }),
    ]).map((r) => r.key), ["fresh", "replied"]);

  t("13 equal keys tie-break deterministically",
    orderRows([
      row("z", { at: "2026-08-10T00:00:00Z" }),
      row("a", { at: "2026-08-10T00:00:00Z" }),
    ]).map((r) => r.key), ["a", "z"]);

  // ── filter intersection ──
  const match = (active, facets) => active.length === 0 || active.every((f) => facets.has(f));
  t("14 empty selection = All", match([], new Set(["sms"])), true);
  t("15 one filter behaves as the old single pill", match(["sms"], new Set(["all", "sms"])), true);
  t("16 two filters intersect (AND)", match(["unread", "sms"], new Set(["all", "sms", "unread"])), true);
  t("17 intersection excludes a partial match", match(["unread", "sms"], new Set(["all", "sms"])), false);

  // ── conversation key shape (mirrors the CHECK constraint) ──
  const KEY = /^(chat|sms|call|email|order):[A-Za-z0-9_-]{1,128}$/;
  t("18 chat key valid", KEY.test("chat:2f6c1f7a-1a2b-4c3d-8e9f-000000000001"), true);
  t("19 order key valid", KEY.test("order:abc123"), true);
  t("20 unknown prefix rejected", KEY.test("visitor:abc"), false);
  t("21 injection-ish key rejected", KEY.test("chat:abc'; drop table--"), false);
  t("22 empty id rejected", KEY.test("chat:"), false);

  if (fails.length) {
    console.error(`${RED}✗ command-center UX LOGIC FAILED${RESET} (${fails.length}/${n})`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ command-center UX logic passed${RESET} (${n} scenarios)`);
  return 0;
}

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────

function runSelfTest() {
  const fails = [];

  // NC1 — sorting purely by `when` (the PRE-FIX behaviour) must get the
  // unread-first case WRONG, otherwise scenario 8 proves nothing.
  const byWhen = (rows) => rows.slice().sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  const case8 = [
    row("b", { at: "2026-08-16T12:00:00Z", when: "2026-08-16T12:00:00Z" }),
    row("a", { unread: true, at: "2026-08-10T00:00:00Z", when: "2026-08-10T00:00:00Z" }),
  ];
  if (byWhen(case8)[0].key === "a") fails.push("NC1: when-sort control is vacuous (it should MISS unread-first)");
  if (orderRows(case8)[0].key !== "a") fails.push("NC1b: the real comparator did not put unread first");

  // NC2 — sorting on `when` must wrongly bump an outbound-replied thread.
  const case12 = [
    row("replied", { at: "2026-08-01T00:00:00Z", when: "2026-08-16T23:00:00Z" }),
    row("fresh",   { at: "2026-08-10T00:00:00Z", when: "2026-08-10T00:00:00Z" }),
  ];
  if (byWhen(case12)[0].key !== "replied") fails.push("NC2: outbound-bump control is vacuous");
  if (orderRows(case12)[0].key !== "fresh") fails.push("NC2b: an outbound reply bumped the thread to the top");

  // NC3 — a NON-strict unread comparison must wrongly re-unread a just-read
  // conversation, proving the `>` in the RPC is load-bearing.
  const loose = (inb, read_) => !!inb && (read_ == null || inb >= read_);
  if (loose("2026-08-16T10:00:00Z", "2026-08-16T10:00:00Z") === false) {
    fails.push("NC3: strict-comparison control is vacuous");
  }
  if (isUnread("2026-08-16T10:00:00Z", "2026-08-16T10:00:00Z") === true) {
    fails.push("NC3b: reading at the exact message time left it unread");
  }

  // NC4 — a UNION-style filter must wrongly accept a partial match, proving
  // the intersection in the panel is load-bearing.
  const anyMatch = (active, facets) => active.length === 0 || active.some((f) => facets.has(f));
  if (anyMatch(["unread", "sms"], new Set(["all", "sms"])) === false) {
    fails.push("NC4: union control is vacuous");
  }

  // NC5 — every required anchor must match the SHIPPED source. A guard whose
  // anchor drifted silently reports a NO-OP.
  for (const { file, label, re } of REQUIRED) {
    if (!re.test(read(file))) fails.push(`NC5: required anchor "${label}" does not match shipped source`);
  }

  // NC6 — the forbidden patterns must match the bad code they exist to reject.
  const BAD = [
    ["pill strip", 'FILTERS.map((f) => { return (<button key={f.key} type="button">x</button>); })', FORBIDDEN[0].re],
    ["black chat bubble", 'className={`rounded-2xl ${isVisitor ? "bg-white" : "bg-[#1E293B] text-white"}`}', FORBIDDEN[1].re],
    ["black thread bubble", ': "bg-[#1E293B] text-white rounded-tr-sm"', FORBIDDEN[2].re],
    ["bare orders nav", 'Open order</button>{x}navigate("/admin-orders?tab=orders")', FORBIDDEN[3].re],
    ["local read state", 'localStorage.setItem("cc_unread", x)', FORBIDDEN[4].re],
  ];
  for (const [name, sample, re] of BAD) {
    if (!re.test(sample)) fails.push(`NC6: forbidden control for "${name}" no longer matches the code it must reject`);
  }

  // NC7 — stripComments must drop prose but keep a className string, or the
  // FORBIDDEN scans could be defeated (or tripped) by a comment.
  const s = '/* we removed bg-[#1E293B] text-white here */\nconst c = "bg-sky-50";';
  if (/bg-\[#1E293B\] text-white/.test(stripComments(s))) fails.push("NC7: stripComments left comment prose behind");
  if (!/bg-sky-50/.test(stripComments(s))) fails.push("NC7b: stripComments ate a real class string");

  if (fails.length) {
    console.error(`${RED}✗ command-center UX SELF-TEST FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ command-center UX self-test passed${RESET} (7 negative controls)`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
let code = 0;
try {
  code |= runStatic();
  code |= runLogic();
  if (selfTest) code |= runSelfTest();
  if (code === 0) console.log(`${DIM}  contract: unread is server-side + per-admin, stamped on OPEN, driven by INBOUND activity only${RESET}`);
} catch (e) {
  console.error(`${RED}✗ command-center UX guard error: ${e.message}${RESET}`);
  code = 1;
}
process.exit(code);
