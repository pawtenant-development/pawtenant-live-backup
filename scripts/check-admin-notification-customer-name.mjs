// scripts/check-admin-notification-customer-name.mjs
//
// ADMIN-NOTIFICATIONS-CUSTOMER-NAME-FOR-COMMUNICATIONS-001 — identity guard.
//
// WHAT THIS PINS. The admin notification bell used to headline incoming SMS
// and calls with the EVENT ("New SMS", "Incoming call") and put the raw phone
// number and the order confirmation id in the body. Operators had to translate
// PT-MSDGF5ST into a human before they could act. The repair moves the CUSTOMER
// to the primary line — but a friendlier label is worthless if it can be the
// WRONG customer, so every control below exists to keep the resolution honest.
//
//   R1  resolution is EXPLICIT-FIRST: communications.order_id, then
//       communications.confirmation_id, then (last) a normalized phone.
//   R2  phone matching uses the COMPLETE normalized number — never a partial
//       or last-four match.
//   R3  an ambiguous phone NEVER picks a customer: a name is returned only
//       when every matching order carries the same name, and an order id only
//       when exactly one order matches.
//   R4  the SMS and call arms emit the resolved customer as the row title, and
//       fall back to "Unknown contact" rather than inventing one.
//   R5  the confirmation id survives as SECONDARY traceability, and is printed
//       only when an order actually resolved (never fabricated).
//   R6  the raw phone is never printed — the arms go through
//       mask_phone_for_display() and the old "Call from <full number>" preview
//       is gone.
//   R7  the linked order travels to the client as link_order_id so click
//       navigation opens the order that was DISPLAYED.
//   R8  grants: the two helpers are revoked from public/anon/authenticated by
//       name; the bell RPC keeps authenticated EXECUTE and stays off anon.
//   R9  resolution is BATCHED server-side — the row set is bounded BEFORE the
//       lateral resolver, so the helper runs at most 8 times per group.
//   R10 the bell still issues exactly ONE rpc round-trip and never queries per
//       notification item (no N+1 reintroduced in React).
//   R11 the bell headlines the contact identity for sms/call only, and leaves
//       every other notification group's layout alone.
//   R12 click navigation uses the row's OWN linked order — never a
//       latest-order guess — and a group only auto-opens an order when every
//       item in it points at that same order.
//   R13 SMS content is never rendered as HTML.
//   R14 unread state is not conveyed by colour alone.
//   R15 no LIVE project reference in any task-owned file.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-admin-notification-customer-name.mjs             → guard (exit 1 on fail)
//   node scripts/check-admin-notification-customer-name.mjs --warn-only → audit (exit 0)
//   node scripts/check-admin-notification-customer-name.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  migration: "supabase/migrations/20260803120000_admin_notification_communication_customer_name.sql",
  bell: "src/pages/admin-orders/components/CompanyNotificationsBell.tsx",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing required file: ${F[key]}`);
  // Normalize CRLF: the repo is checked out with autocrlf=true, so a guard
  // matching raw bytes would behave differently on Windows and Linux — and the
  // planted controls (which anchor on "\n") would silently no-op.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Strip comments AND string literals used purely as prose, so a MENTION can
 * never satisfy a USE assertion and a "must NOT contain" scan can never be
 * defeated by a comment that happens to quote the forbidden text.
 */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
/** SQL comment stripper (`--` lines). */
function sql(src) {
  return src.replace(/^\s*--.*$/gm, "");
}
const has = (s, ...needles) => needles.every((n) => s.includes(n));
const lacks = (s, ...needles) => needles.every((n) => !s.includes(n));

/** Body of one SQL function, so an assertion cannot drift into a neighbour. */
function fnBody(m, startNeedle, endNeedle) {
  const i = m.indexOf(startNeedle);
  if (i < 0) return "";
  const j = m.indexOf(endNeedle, i);
  return j < 0 ? m.slice(i) : m.slice(i, j);
}
/** One `return query (...)` arm of the notification RPC, keyed on its group. */
function arm(m, groupLiteral) {
  const i = m.indexOf(`(select '${groupLiteral}'::text,`);
  if (i < 0) return "";
  const j = m.indexOf("return query", i);
  return j < 0 ? m.slice(i) : m.slice(i, j);
}

const CHECKS = [
  ["R1", "resolution is explicit-first: order_id, then confirmation_id, then phone", (S) => {
    const body = fnBody(sql(S.migration),
      "function public.resolve_communication_contact(", "comment on function public.resolve_communication_contact");
    if (!body) return false;
    const iOrder = body.indexOf("where o.id = p_order_id");
    const iConf  = body.indexOf("upper(o.confirmation_id) = upper(btrim(p_confirmation_id))");
    const iPhone = body.indexOf("v_digits := regexp_replace(coalesce(p_phone");
    if (iOrder < 0 || iConf < 0 || iPhone < 0) return false;
    // Order matters: each weaker basis must be gated on the stronger one
    // having failed, otherwise a phone hit could overwrite an explicit link.
    return iOrder < iConf && iConf < iPhone
      && has(body,
        "if v_order_id is null and nullif(btrim(coalesce(p_confirmation_id, '')), '') is not null then",
        "if v_order_id is null and v_name is null then");
  }],

  ["R2", "phone matching uses the complete normalized number, never a partial", (S) => {
    const body = fnBody(sql(S.migration),
      "function public.resolve_communication_contact(", "comment on function public.resolve_communication_contact");
    if (!body) return false;
    // Full 10-digit national number on BOTH sides, and short numbers are
    // rejected outright rather than compared on whatever digits exist.
    return has(body,
      "if length(v_digits) >= 10 then",
      "v_digits := right(v_digits, 10);",
      "where length(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g')) >= 10",
      "and right(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g'), 10) = v_digits")
      // No last-four / suffix / prefix shortcut against the orders table.
      && !/right\(\s*regexp_replace\(coalesce\(o\.phone[^)]*\)[^)]*\)\s*,\s*[1-9]\)/.test(body)
      && lacks(body, "like '%' || v_digits", "v_digits || '%'", "right(v_digits, 4)");
  }],

  ["R3", "an ambiguous phone never picks a customer", (S) => {
    const body = fnBody(sql(S.migration),
      "function public.resolve_communication_contact(", "comment on function public.resolve_communication_contact");
    if (!body) return false;
    const n = body.replace(/\s+/g, " ");
    // A name only when every match agrees on it; an order id only when there
    // is exactly one order. Anything else reports 'ambiguous' and resolves to
    // nothing, which the UI renders as "Unknown contact".
    return has(n,
      "count(distinct lower(m.nm))::int",
      "if v_names = 1 then v_name := v_name_any;",
      "if v_orders = 1 then v_order_id := v_oid_any;",
      "if v_basis = 'none' and v_orders > 0 then v_basis := 'ambiguous'; end if;")
      // The confirmation-id branch is equally strict.
      && has(n, "if v_orders = 1 then v_order_id := v_oid_any; v_conf := v_cid_any; v_name := v_name_any; v_basis := 'confirmation_id';")
      && !/if v_names >= 1 then/.test(n)
      && !/order by o\.created_at desc limit 1/.test(n);
  }],

  ["R4", "sms and call arms title the row with the resolved customer, else Unknown contact", (S) => {
    const m = sql(S.migration);
    const smsArm = arm(m, "sms");
    const callArm = arm(m, "call");
    if (!smsArm || !callArm) return false;
    return has(smsArm, "coalesce(k.display_name, 'Unknown contact'),")
      && has(callArm, "coalesce(k.display_name, 'Unknown contact'),")
      // The old event-label titles must be gone from these two arms.
      && lacks(smsArm, "'New SMS'::text")
      && lacks(callArm, "'Incoming call'::text,");
  }],

  ["R5", "the confirmation id stays as secondary traceability and is never fabricated", (S) => {
    const m = sql(S.migration);
    const smsArm = arm(m, "sms");
    const callArm = arm(m, "call");
    if (!smsArm || !callArm) return false;
    // Printed from the RESOLVER's confirmation id (so it belongs to the order
    // that actually resolved), and only when that resolved.
    return has(smsArm, "case when k.confirmation_id is not null then ' · ' || k.confirmation_id")
      && has(callArm, "case when k.confirmation_id is not null then ' · ' || k.confirmation_id else '' end")
      // Never echo the communication's own unverified confirmation id.
      && lacks(smsArm, "c.confirmation_id is not null")
      && lacks(callArm, "c.confirmation_id is not null");
  }],

  ["R6", "the raw phone is never printed — masking is mandatory in both arms", (S) => {
    const m = sql(S.migration);
    const smsArm = arm(m, "sms");
    const callArm = arm(m, "call");
    if (!smsArm || !callArm) return false;
    const masker = fnBody(m, "function public.mask_phone_for_display(", "comment on function public.mask_phone_for_display");
    return has(callArm, "'Incoming call · ' || public.mask_phone_for_display(c.phone_from)")
      && has(smsArm, "public.mask_phone_for_display(c.phone_from)")
      // The pre-repair preview leaked the full number.
      && lacks(callArm, "'Call from ' || coalesce(c.phone_from")
      // Middle digits are actually removed, not merely reformatted.
      && has(masker, "') ***-'", "'***-' || right(s.d, 4)")
      && lacks(masker, "then right(s.d, 10)");
  }],

  ["R7", "the linked order travels to the client as link_order_id", (S) => {
    const m = sql(S.migration);
    return has(m, "link_order_id text)")
      && has(arm(m, "sms"), "k.order_id::text")
      && has(arm(m, "call"), "k.order_id::text")
      // Order rows keep carrying their own id, so navigation has one source.
      && has(arm(m, "order_paid"), "o.id::text")
      && has(code(S.bell), "link_order_id: string | null;");
  }],

  ["R8", "grants: helpers locked to the definer, bell RPC keeps authenticated and stays off anon", (S) => {
    const m = sql(S.migration);
    return has(m,
      "revoke all on function public.mask_phone_for_display(text) from public;",
      "revoke all on function public.mask_phone_for_display(text) from anon;",
      "revoke all on function public.mask_phone_for_display(text) from authenticated;",
      "revoke all on function public.resolve_communication_contact(uuid, text, text) from public;",
      "revoke all on function public.resolve_communication_contact(uuid, text, text) from anon;",
      "revoke all on function public.resolve_communication_contact(uuid, text, text) from authenticated;",
      "revoke all on function public.get_company_notifications() from public;",
      "revoke all on function public.get_company_notifications() from anon;",
      "grant execute on function public.get_company_notifications() to authenticated;")
      // Both helpers pin search_path; the bell RPC stays SECURITY DEFINER.
      && has(m, "set search_path to 'public'", "security definer")
      && lacks(m, "grant execute on function public.resolve_communication_contact(uuid, text, text) to authenticated;");
  }],

  ["R9", "resolution is batched — the row set is bounded before the lateral resolver", (S) => {
    const m = sql(S.migration);
    for (const g of ["sms", "call"]) {
      const a = arm(m, g);
      const iLimit = a.indexOf("order by c2.created_at desc limit 8) c");
      const iLateral = a.indexOf("join lateral public.resolve_communication_contact(");
      if (iLimit < 0 || iLateral < 0 || iLimit > iLateral) return false;
    }
    return true;
  }],

  ["R10", "the bell makes one rpc round-trip and never queries per item", (S) => {
    const c = code(S.bell);
    const rpcLoads = (c.match(/supabase\.rpc\("get_company_notifications"\)/g) || []).length;
    return rpcLoads === 1
      // No table reads, no per-row lookups, no fetch inside the render tree.
      && lacks(c, "supabase.from(", "Promise.all(", "await supabase.rpc(\"get_order");
  }],

  ["R11", "only sms/call are identity-led; every other group keeps its layout", (S) => {
    const c = code(S.bell);
    return has(c,
      'const CONTACT_IDENTITY_GROUPS = new Set(["sms", "call"]);',
      "const identityLed = CONTACT_IDENTITY_GROUPS.has(g.key) && sharesOneIdentity(g.items);",
      "? latest.title",
      "`${g.unread > 0 ? `${g.unread} ` : \"\"}${cfg.label}`")
      // The group label is preserved on the meta line, so nothing is lost.
      && has(c, "${identityLed ? `${cfg.label} · ` : \"\"}")
      // A mixed-contact group must not headline one arbitrary customer.
      && has(c, "function sharesOneIdentity(items: CompanyNotification[]): boolean");
  }],

  ["R12", "click navigation opens the displayed order, never a latest-order guess", (S) => {
    const c = code(S.bell);
    return has(c,
      'const orderId = item.link_order_id ?? (item.entity_type === "order" ? item.entity_id : null);',
      "if (orderId && onOpenOrder) {",
      "function soleLinkedOrderId(items: CompanyNotification[]): string | null {",
      "return items.every((i) => i.link_order_id === first) ? first : null;",
      "if (groupOrderId && onOpenOrder) {")
      // No client-side ordering heuristic standing in for an explicit link.
      && lacks(c, "orders[0].id", "latestOrder", "mostRecentOrder");
  }],

  ["R13", "SMS content is never rendered as HTML", (S) => {
    return lacks(code(S.bell), "dangerouslySetInnerHTML", "innerHTML");
  }],

  ["R14", "unread state is not conveyed by colour alone", (S) => {
    const c = code(S.bell);
    return has(c, '<span className="sr-only">Unread</span>')
      && has(c, 'aria-label={unreadTotal > 0 ? `Notifications — ${unreadTotal} unread` : "Notifications"}')
      && has(c, "${g.unread > 0 ? `, ${g.unread} unread` : \"\"}");
  }],

  ["R15", "no LIVE project reference in any task-owned file", (S) => {
    return lacks(S.migration, "cvwbozlbbmrjxznknouq") && lacks(S.bell, "cvwbozlbbmrjxznknouq");
  }],
];

// Negative controls: each plants the exact regression its check exists to stop.
const CONTROLS = [
  ["R1", "confirmation-id branch no longer waits for the explicit order to fail",
    (S) => ({ migration: S.migration.replace(
      "if v_order_id is null and nullif(btrim(coalesce(p_confirmation_id, '')), '') is not null then",
      "if nullif(btrim(coalesce(p_confirmation_id, '')), '') is not null then") })],
  ["R2", "phone match degraded to a last-four suffix compare",
    (S) => ({ migration: S.migration.replace(
      "and right(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g'), 10) = v_digits",
      "and right(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g'), 4) = right(v_digits, 4)") })],
  ["R3", "an ambiguous phone is allowed to pick the first matching customer",
    (S) => ({ migration: S.migration.replace("if v_names = 1 then", "if v_names >= 1 then") })],
  ["R4", "the SMS arm goes back to titling the row with the event label",
    (S) => ({ migration: S.migration.replace(
      "'sms'::text, 'communication'::text, c.id::text,\n          coalesce(k.display_name, 'Unknown contact'),",
      "'sms'::text, 'communication'::text, c.id::text,\n          'New SMS'::text,") })],
  ["R5", "the confirmation id is echoed from the unverified communication row",
    (S) => ({ migration: S.migration.replace(
      "case when k.confirmation_id is not null then ' · ' || k.confirmation_id\n                    else ' · ' || public.mask_phone_for_display(c.phone_from) end",
      "case when c.confirmation_id is not null then ' · ' || c.confirmation_id\n                    else ' · ' || public.mask_phone_for_display(c.phone_from) end") })],
  ["R6", "the call preview prints the full number again",
    (S) => ({ migration: S.migration.replace(
      "'Incoming call · ' || public.mask_phone_for_display(c.phone_from)",
      "'Call from ' || coalesce(c.phone_from, 'unknown')") })],
  ["R7", "the linked order is dropped from the payload",
    (S) => ({ migration: S.migration.replace("          k.order_id::text\n     from (select c2.id, c2.order_id, c2.confirmation_id, c2.phone_from, c2.body, c2.created_at",
      "          null::text\n     from (select c2.id, c2.order_id, c2.confirmation_id, c2.phone_from, c2.body, c2.created_at") })],
  ["R8", "the resolver is exposed straight to signed-in users",
    (S) => ({ migration: S.migration.replace(
      "revoke all on function public.resolve_communication_contact(uuid, text, text) from authenticated;",
      "grant execute on function public.resolve_communication_contact(uuid, text, text) to authenticated;") })],
  ["R9", "the resolver runs before the row set is bounded (N+1 server-side)",
    (S) => ({ migration: S.migration.replace(
      "     from (select c2.id, c2.order_id, c2.confirmation_id, c2.phone_from, c2.body, c2.created_at\n             from public.communications c2\n            where c2.direction = 'inbound' and c2.type = 'sms_inbound' and c2.created_at >= v_since\n            order by c2.created_at desc limit 8) c",
      "     from public.communications c\n            where c.direction = 'inbound' and c.type = 'sms_inbound' and c.created_at >= v_since") })],
  ["R10", "a per-item order lookup is reintroduced in React",
    (S) => ({ bell: S.bell.replace("    const { data, error } = await supabase.rpc(\"get_company_notifications\");",
      "    const { data, error } = await supabase.rpc(\"get_company_notifications\");\n    await supabase.from(\"orders\").select(\"id\");") })],
  ["R11", "every group is forced into the identity-led layout",
    (S) => ({ bell: S.bell.replace(
      "const identityLed = CONTACT_IDENTITY_GROUPS.has(g.key) && sharesOneIdentity(g.items);",
      "const identityLed = true;") })],
  ["R12", "navigation falls back to a client-side latest-order guess",
    (S) => ({ bell: S.bell.replace(
      'const orderId = item.link_order_id ?? (item.entity_type === "order" ? item.entity_id : null);',
      'const orderId = item.entity_type === "order" ? item.entity_id : null;') })],
  ["R13", "the SMS preview is rendered as HTML",
    (S) => ({ bell: S.bell.replace(
      '<p title={item.preview} className="text-[11px] text-gray-500 leading-snug line-clamp-2">{item.preview}</p>',
      '<p className="text-[11px]" dangerouslySetInnerHTML={{ __html: item.preview }}></p>') })],
  ["R14", "the unread dot loses its text equivalent",
    (S) => ({ bell: S.bell.replace('<span className="sr-only">Unread</span>\n                                    ', "") })],
  ["R15", "a LIVE project reference is pasted into the migration",
    (S) => ({ migration: `${S.migration}\n-- cvwbozlbbmrjxznknouq\n` })],
];

function loadAll() {
  return { migration: read("migration"), bell: read("bell") };
}

function runChecks(S) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok = false;
    try { ok = !!fn(S); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-admin-notification-customer-name";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      // A control that fails to modify the source proves nothing.
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`,
      );
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
