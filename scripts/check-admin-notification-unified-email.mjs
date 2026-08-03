// scripts/check-admin-notification-unified-email.mjs
//
// ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-THREAD-LIVE-PARITY-001 — email arm guard.
//
// WHAT THIS PINS. The bell's email arms titled every row with an EVENT ("New
// customer email", "Customer replied", "Email delivery failed") and led the
// preview with the customer's FULL email address. Separately, LIVE's email arm
// read `public.communications` for inbound rows that NOTHING has ever written
// there — 0 rows across the whole history — so the LIVE email group could never
// fire. Each environment now reads ITS OWN canonical inbound-email store and
// both render the same contract: contact first, subject second, order id as
// traceability, masked sender when no order resolved.
//
//   E1  the email arms resolve a CONTACT and title the row with it, falling
//       back to the submitter's own name and then to "Unknown contact".
//   E2  the full sender address is never printed — mask_email_for_display()
//       keeps one character of the local part, and the old
//       `coalesce(customer_email, 'Customer') || ' · '` lead is gone.
//   E3  resolution is explicit-first and fails closed: order id, then an order
//       reference matching exactly ONE order ('general' ignored), then a sender
//       email that yields ONE name / ONE order.
//   E4  markup is stripped SERVER-SIDE by safe_text_preview() — an HTML body
//       can never reach the panel as markup.
//   E5  the linked order travels as link_order_id and is never fabricated.
//   E6  grants: the three helpers are revoked from public/anon/authenticated by
//       name; the bell RPC keeps authenticated EXECUTE and stays off anon.
//   E7  resolution is BATCHED — every email arm bounds its row set before the
//       lateral resolver, and the per-thread "first message" lateral is gone.
//   E8  a repeatedly failing thread cannot duplicate itself: the failure arm
//       returns ONE row per thread.
//   E9  the email groups are identity-led in the bell, exactly like SMS/calls,
//       and order/booking/approval groups are NOT.
//   E10 an email notification opens the exact THREAD, never an order guess.
//   E11 PRESERVATION — the SMS and call arms of the previous task are intact:
//       resolve_communication_contact, masked phone, ambiguity fallback.
//   E12 PRESERVATION — the bell still makes ONE rpc round-trip and never
//       renders any notification content as HTML.
//   E13 read state stays in company_notification_reads — the bell never writes
//       thread/submission state as a side effect of showing a notification.
//   E14 no LIVE project reference in any task-owned file.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-admin-notification-unified-email.mjs             → guard
//   node scripts/check-admin-notification-unified-email.mjs --warn-only → audit
//   node scripts/check-admin-notification-unified-email.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  migration: "supabase/migrations/20260803140000_admin_notification_unified_email_contact_identity.sql",
  bell: "src/pages/admin-orders/components/CompanyNotificationsBell.tsx",
  page: "src/pages/admin-orders/page.tsx",
  hub: "src/pages/admin-orders/components/CommunicationsHub.tsx",
  contactsTab: "src/pages/admin-orders/components/ContactRequestsTab.tsx",
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

/** Strip comments so PROSE can never satisfy a CODE assertion. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
/** SQL comment stripper (`--` lines). */
function sql(src) {
  return src.replace(/^\s*--.*$/gm, "");
}
const has = (s, ...needles) => needles.every((n) => s.includes(n));
const lacks = (s, ...needles) => needles.every((n) => !s.includes(n));

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
/** Every email arm present in this repo (LIVE carries only the first). */
function emailArms(m) {
  return ["email", "email_reply", "email_failed"].map((g) => arm(m, g)).filter(Boolean);
}

/**
 * The two environments read DIFFERENT canonical inbound-email stores — TEST the
 * unified thread model, LIVE contact_submissions, because the thread tables do
 * not exist there. One guard serves both by asserting the CONTRACT against
 * whichever store this repo's migration actually emits. It never assumes a
 * flavour: an arm that emits neither entity type fails every check below.
 */
function ownDestinationType(m) {
  if (m.includes("'email_thread'::text")) return "email_thread";
  if (m.includes("'contact_submission'::text")) return "contact_submission";
  return null;
}

const CHECKS = [
  ["E1", "email arms title the row with the resolved contact, then the submitter, then Unknown", (S) => {
    const m = sql(S.migration);
    const arms = emailArms(m);
    if (arms.length === 0) return false;
    return arms.every((a) =>
      /coalesce\(k\.display_name, nullif\(btrim\(cs\.name\), ''\), 'Unknown contact'\)/.test(a))
      // The event labels must no longer be the row title.
      && arms.every((a) => lacks(a, "'New customer email'::text", "'Customer replied'::text", "'Email delivery failed'::text"));
  }],

  ["E2", "the full sender address is never printed", (S) => {
    const m = sql(S.migration);
    const arms = emailArms(m);
    if (arms.length === 0) return false;
    const masker = fnBody(m, "function public.mask_email_for_display(", "comment on function public.mask_email_for_display");
    // The address may be READ (projected into the bounded subquery, passed to
    // the resolver) but never PRINTED. Strip the two legitimate uses, then any
    // surviving mention is an address on its way to the panel.
    const printed = (a) => a
      .replace(/public\.mask_email_for_display\([^)]*\)/g, "")
      // Whole lateral-join line: the resolver ARGUMENTS are a read, and the
      // call contains nested parentheses that a lazy match stops short of.
      .replace(/join lateral public\.resolve_email_contact\(.*$/gm, "")
      // The bounded subquery's projection is a READ, not a print.
      .replace(/\b(?:c2|t2)\.(?:customer_)?email\b/g, "");
    return arms.every((a) => lacks(a, "coalesce(t.customer_email, 'Customer')"))
      && arms.every((a) => !/\b(?:cs|t|c)\.(?:customer_)?email\b/.test(printed(a)))
      && has(masker, "left(s.local, 1) || '***@' || s.domain", "'***@' || s.domain")
      && lacks(masker, "then s.e");
  }],

  ["E3", "email resolution is explicit-first and fails closed", (S) => {
    const body = fnBody(sql(S.migration),
      "function public.resolve_email_contact(", "comment on function public.resolve_email_contact");
    if (!body) return false;
    const iOrder = body.indexOf("where o.id = p_order_id");
    const iConf  = body.indexOf("upper(o.confirmation_id) = upper(btrim(p_confirmation_id))");
    const iMail  = body.indexOf("lower(btrim(coalesce(o.email, ''))) = v_email");
    if (iOrder < 0 || iConf < 0 || iMail < 0) return false;
    const n = body.replace(/\s+/g, " ");
    return iOrder < iConf && iConf < iMail
      // Each weaker basis waits for the stronger one to fail.
      && has(body,
        "if v_order_id is null and nullif(btrim(coalesce(p_confirmation_id, '')), '') is not null",
        "if v_order_id is null and v_name is null then")
      // The contact-form 'general' sentinel is not an order reference.
      && has(body, "lower(btrim(p_confirmation_id)) <> 'general'")
      // A name only when every match agrees; an order only when there is one.
      && has(n, "count(distinct lower(m.nm))::int",
                "if v_names = 1 then v_name := v_name_any;",
                "if v_orders = 1 then v_order_id := v_oid_any;",
                "if v_basis = 'none' and v_orders > 0 then v_basis := 'ambiguous'; end if;")
      && !/if v_names >= 1 then/.test(n)
      && !/order by o\.created_at desc limit 1/.test(n);
  }],

  ["E4", "markup is stripped server-side before any preview is built", (S) => {
    const m = sql(S.migration);
    const sanitiser = fnBody(m, "function public.safe_text_preview(", "comment on function public.safe_text_preview");
    const arms = emailArms(m);
    if (!sanitiser || arms.length === 0) return false;
    return has(sanitiser, "'<[^>]*>', ' ', 'g'", "'\\s+', ' ', 'g'")
      // Every arm's subject/body/error goes through it — no raw column concat.
      && arms.every((a) => a.includes("public.safe_text_preview("))
      && arms.every((a) => !/\|\|\s*t\.subject/.test(a) && !/left\(t\.subject/.test(a));
  }],

  ["E5", "the linked order travels as link_order_id and is never fabricated", (S) => {
    const m = sql(S.migration);
    const arms = emailArms(m);
    if (arms.length === 0) return false;
    return arms.every((a) => a.includes("k.order_id::text"))
      // The confirmation id printed is the RESOLVER's, never the thread's own
      // unverified value.
      && arms.every((a) => a.includes("k.confirmation_id is not null"))
      && arms.every((a) => lacks(a, "t.linked_confirmation_id is not null"))
      && has(code(S.bell), "link_order_id: string | null;");
  }],

  ["E6", "grants: helpers locked to the definer, bell RPC keeps authenticated and stays off anon", (S) => {
    const m = sql(S.migration);
    const need = [];
    for (const f of ["mask_email_for_display(text)", "safe_text_preview(text, int)", "resolve_email_contact(uuid, text, text)"]) {
      for (const role of ["public", "anon", "authenticated"]) {
        need.push(`revoke all on function public.${f} from ${role};`);
      }
    }
    return has(m, ...need)
      && has(m, "set search_path to 'public'", "security definer")
      // CREATE OR REPLACE keeps the RPC's grants, so a DROP here would be a
      // silent regrant of anon EXECUTE.
      && lacks(m, "drop function if exists public.get_company_notifications()")
      && lacks(m, "grant execute on function public.resolve_email_contact(uuid, text, text) to authenticated;");
  }],

  ["E7", "every email arm bounds its row set before the lateral resolver", (S) => {
    const m = sql(S.migration);
    const arms = emailArms(m);
    if (arms.length === 0) return false;
    for (const a of arms) {
      const iLimit = a.search(/limit (8|12)\) \w+\b/);
      const iLateral = a.indexOf("join lateral public.resolve_email_contact(");
      if (iLimit < 0 || iLateral < 0 || iLimit > iLateral) return false;
    }
    // Thread flavour only: the per-thread "first inbound message" lateral is
    // replaced by the maintained rollup column.
    if (ownDestinationType(m) !== "email_thread") return true;
    return has(arm(m, "email"), "t2.first_message_at >= v_since")
      && lacks(arm(m, "email"), "from public.admin_email_messages m2");
  }],

  ["E8", "a repeatedly failing thread yields one row, not one per failure", (S) => {
    const a = arm(sql(S.migration), "email_failed");
    // No delivery-failure arm in this repo (LIVE has no thread model, so it has
    // no per-message failure rows to collapse) — nothing to duplicate.
    if (!a) return ownDestinationType(sql(S.migration)) === "contact_submission";
    return has(a, "select distinct on (m2.thread_id) m2.thread_id", "order by m2.thread_id, m2.created_at desc");
  }],

  ["E9", "email groups are identity-led like SMS/calls; event-titled groups are not", (S) => {
    const c = code(S.bell);
    const m = c.match(/const CONTACT_IDENTITY_GROUPS = new Set\(\[([^\]]*)\]\);/);
    if (!m) return false;
    const keys = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    return ["sms", "call", "email"].every((k) => keys.includes(k))
      && !keys.some((k) => k.startsWith("order") || k === "approval" || k === "consultation")
      && has(c, "const identityLed = CONTACT_IDENTITY_GROUPS.has(g.key) && sharesOneIdentity(g.items);");
  }],

  ["E10", "an email notification opens the exact conversation, never an order guess", (S) => {
    const c = code(S.bell);
    const m = sql(S.migration);
    const own = ownDestinationType(m);
    if (!own) return false;
    // Rows carry their own destination id, and the client resolves that type
    // BEFORE it ever considers an order, so a linked order — which email rows
    // only started carrying in this task — can never hijack the click.
    const ownFirst = c.indexOf(`item.entity_type === "${own}"`);
    const orderNext = c.indexOf("const orderId = item.link_order_id");
    if (ownFirst < 0 || orderNext < 0 || ownFirst > orderNext) return false;
    return emailArms(m).every((a) => a.includes(`'${own}'::text`));
  }],

  ["E16", "a group of own-destination rows never falls through to a shared order", (S) => {
    const c = code(S.bell);
    const own = ownDestinationType(sql(S.migration));
    if (!own) return false;
    const set = c.match(/const OWN_DESTINATION_TYPES = new Set\(\[([^\]]*)\]\);/);
    if (!set) return false;
    const keys = set[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    return keys.includes(own)
      // Without this gate, a group whose items all resolve to the SAME order
      // opens that order instead of the conversation the operator clicked.
      && has(c, "const groupOrderId = OWN_DESTINATION_TYPES.has(latest.entity_type)",
                "? null",
                ": soleLinkedOrderId(g.items);");
  }],

  ["E11", "PRESERVED — the SMS and call arms still resolve a customer safely", (S) => {
    const m = sql(S.migration);
    const smsArm = arm(m, "sms");
    const callArm = arm(m, "call");
    if (!smsArm || !callArm) return false;
    return [smsArm, callArm].every((a) =>
      has(a, "join lateral public.resolve_communication_contact(c.order_id, c.confirmation_id, c.phone_from) k on true",
             "coalesce(k.display_name, 'Unknown contact'),"))
      && has(callArm, "'Incoming call · ' || public.mask_phone_for_display(c.phone_from)")
      && has(smsArm, "public.mask_phone_for_display(c.phone_from)")
      && lacks(callArm, "'Call from ' || coalesce(c.phone_from");
  }],

  ["E12", "PRESERVED — one rpc round-trip, and nothing is rendered as HTML", (S) => {
    const c = code(S.bell);
    const rpcLoads = (c.match(/supabase\.rpc\("get_company_notifications"\)/g) || []).length;
    return rpcLoads === 1
      && lacks(c, "supabase.from(", "dangerouslySetInnerHTML", "innerHTML");
  }],

  ["E13", "showing a notification never writes thread or submission state", (S) => {
    const m = sql(S.migration);
    const arms = emailArms(m);
    if (arms.length === 0) return false;
    // Bell read state is per-admin in company_notification_reads. The arms are
    // read-only: no write to unread_admin / contact_submissions.status.
    return arms.every((a) => a.includes("from public.company_notification_reads r"))
      && lacks(m, "update public.admin_email_threads", "update public.contact_submissions",
                  "set unread_admin", "set status =")
      && has(code(S.bell), 'supabase.rpc("mark_company_notifications_read"');
  }],

  ["E14", "no LIVE project reference in any task-owned file", (S) => {
    return lacks(S.migration, "cvwbozlbbmrjxznknouq") && lacks(S.bell, "cvwbozlbbmrjxznknouq");
  }],

  ["E15", "the deep link survives the destination mounting", (S) => {
    const p = code(S.page);
    const own = ownDestinationType(sql(S.migration));
    if (own === "email_thread") {
      const i = p.indexOf("onOpenEmailThread={(threadId) => {");
      if (i < 0) return false;
      const handler = p.slice(i, i + 900);
      const iNav = handler.indexOf("navigate(`/admin-orders?${params.toString()}`");
      const iTab = handler.indexOf('setActiveTabState("communications")');
      // The URL must land BEFORE the hub is mounted, and the hub's mount-time
      // "normalize missing ?sub=" effect must consult the LIVE url — either
      // alone lets the default sub replace the whole deep link.
      return iNav > -1 && iTab > -1 && iNav < iTab
        && has(handler, 'params.set("sub", "emails");', 'params.set("thread", threadId)')
        && /const params = new URLSearchParams\(window\.location\.search\);\s*\n\s*if \(!isSubKey\(params\.get\("sub"\)\)/.test(code(S.hub));
    }
    if (own === "contact_submission") {
      const i = p.indexOf("onOpenContactSubmission={(submissionId) => {");
      if (i < 0) return false;
      const handler = p.slice(i, i + 900);
      const iNav = handler.indexOf("navigate(`/admin-orders?${params.toString()}`");
      const iTab = handler.indexOf('setActiveTabState("communications")');
      const t = code(S.contactsTab);
      // The destination is Communications → Emails, which mounts
      // ContactRequestsTab. The legacy standalone "Contacts" tab no longer
      // renders in the sidebar for most roles, so ?tab=contacts is normalised
      // away and the click lands on Command Center.
      return iNav > -1 && iTab > -1 && iNav < iTab
        && has(handler, 'params.set("tab", "communications");', 'params.set("sub", "emails");',
                        'params.set("submission", submissionId);')
        && has(code(S.hub), 'focusSubmissionId={new URLSearchParams(location.search).get("submission")}')
        && /const params = new URLSearchParams\(window\.location\.search\);\s*\n\s*if \(!isSubKey\(params\.get\("sub"\)\)/.test(code(S.hub))
        && has(sql(S.migration), "cs.created_at, 'communications'::text,")
        // Applied once, only after the list arrives, and an id that is not in
        // the list is ignored rather than guessed at.
        && has(t, "if (!focusSubmissionId || items.length === 0) return;",
                  "if (appliedFocusRef.current === focusSubmissionId) return;",
                  "const row = items.find((i) => i.id === focusSubmissionId);",
                  "if (!row) return;");
    }
    return false;
  }],

];

// Negative controls: each plants the exact regression its check exists to stop.
const CONTROLS = [
  ["E1", "the new-email arm goes back to titling the row with the event label",
    (S) => ({ migration: S.migration.replace(
      "'email'::text, 'email_thread'::text, t.id::text,\n          coalesce(k.display_name, nullif(btrim(cs.name), ''), 'Unknown contact'),",
      "'email'::text, 'email_thread'::text, t.id::text,\n          'New customer email'::text,") }), "email_thread"],
  ["E2", "the preview leads with the full customer address again",
    (S) => ({ migration: S.migration.replace(
      "else ' · ' || public.mask_email_for_display(t.customer_email) end,",
      "else ' · ' || t.customer_email end,") }), "email_thread"],
  ["E3", "an ambiguous sender email is allowed to pick the first customer",
    (S) => ({ migration: S.migration.replace(
      "      if v_names = 1 then\n        v_name  := v_name_any;\n        v_basis := 'email';",
      "      if v_names >= 1 then\n        v_name  := v_name_any;\n        v_basis := 'email';") })],
  ["E3b", "the 'general' order-reference sentinel is treated as a real reference",
    (S) => ({ migration: S.migration.replace(
      "     and lower(btrim(p_confirmation_id)) <> 'general' then", " then") })],
  ["E4", "the subject is concatenated raw instead of being sanitised",
    (S) => ({ migration: S.migration.replace(
      `'Email: "' || coalesce(nullif(public.safe_text_preview(t.subject, 70), ''), 'No subject') || '"'`,
      `'Email: "' || coalesce(nullif(btrim(t.subject), ''), 'No subject') || '"'`) }), "email_thread"],
  ["E4b", "the sanitiser stops stripping tags",
    (S) => ({ migration: S.migration.replace("'<[^>]*>', ' ', 'g'", "'<!!!>', ' ', 'g'") })],
  ["E5", "the reply arm echoes the thread's own unverified confirmation id",
    (S) => ({ migration: S.migration.replace(
      "            || case when k.confirmation_id is not null then ' · ' || k.confirmation_id else '' end,\n          t.last_message_at, 'comms'::text,",
      "            || case when t.linked_confirmation_id is not null then ' · ' || t.linked_confirmation_id else '' end,\n          t.last_message_at, 'comms'::text,") }), "email_thread"],
  ["E6", "the email resolver is exposed straight to signed-in users",
    (S) => ({ migration: S.migration.replace(
      "revoke all on function public.resolve_email_contact(uuid, text, text) from authenticated;",
      "grant execute on function public.resolve_email_contact(uuid, text, text) to authenticated;") })],
  ["E6b", "the RPC is dropped and recreated, silently regranting anon EXECUTE",
    (S) => ({ migration: S.migration.replace(
      "create or replace function public.get_company_notifications()",
      "drop function if exists public.get_company_notifications();\ncreate function public.get_company_notifications()") })],
  ["E7", "the new-email arm resolves before its row set is bounded",
    (S) => ({ migration: S.migration.replace(
      "            order by t2.first_message_at desc limit 8) t\n     join lateral public.resolve_email_contact",
      "            order by t2.first_message_at desc) t\n     join lateral public.resolve_email_contact") }), "email_thread"],
  ["E8", "the failure arm returns one row per failure again",
    (S) => ({ migration: S.migration.replace(
      "select distinct on (m2.thread_id) m2.thread_id, m2.created_at, m2.error_message",
      "select m2.thread_id, m2.created_at, m2.error_message") }), "email_thread"],
  ["E9", "the email groups lose their identity-led layout",
    (S) => ({ bell: S.bell.replace(/"sms", "call", "email"[^\]]*/, '"sms", "call"') })],
  ["E10", "an email row falls through to the order destination",
    (S) => ({ bell: S.bell.replace(
      'if (item.entity_type === "email_thread" && item.entity_id && onOpenEmailThread) {',
      "if (false) {") }), "email_thread"],
  ["E11", "the call arm loses its phone masking",
    (S) => ({ migration: S.migration.replace(
      "'Incoming call · ' || public.mask_phone_for_display(c.phone_from)",
      "'Call from ' || coalesce(c.phone_from, 'unknown')") })],
  ["E11b", "the SMS arm stops resolving a customer",
    (S) => ({ migration: S.migration.replace(
      "'sms'::text, 'communication'::text, c.id::text,\n          coalesce(k.display_name, 'Unknown contact'),",
      "'sms'::text, 'communication'::text, c.id::text,\n          'New SMS'::text,") })],
  ["E12", "a second load path is added to the bell",
    (S) => ({ bell: S.bell.replace(
      '    const { data, error } = await supabase.rpc("get_company_notifications");',
      '    const { data, error } = await supabase.rpc("get_company_notifications");\n    await supabase.from("admin_email_threads").select("id");') })],
  ["E13", "showing a notification flips thread unread state as a side effect",
    (S) => ({ migration: `${S.migration}\nupdate public.admin_email_threads set unread_admin = false;\n` })],
  ["E14", "a LIVE project reference is pasted into the migration",
    (S) => ({ migration: `${S.migration}\n-- cvwbozlbbmrjxznknouq\n` })],
  ["E15", "the hub is mounted before the deep link lands",
    (S) => ({ page: S.page.replace(
      "              navigate(`/admin-orders?${params.toString()}`, { replace: false });\n              setActiveTabState(\"communications\");",
      "              setActiveTabState(\"communications\");\n              navigate(`/admin-orders?${params.toString()}`, { replace: false });") }), "email_thread"],
  ["E15b", "the hub normalizes against the stale mount-render URL again",
    (S) => ({ hub: S.hub.replace(
      'const params = new URLSearchParams(window.location.search);\n    if (!isSubKey(params.get("sub"))',
      'const params = new URLSearchParams(location.search);\n    if (!isSubKey(params.get("sub"))') }), "email_thread"],
  // Flavour-scoped: the contact deep link only exists where contact_submissions
  // is the canonical inbound-email store.
  ["E15d", "the contact deep link targets the retired standalone Contacts tab again",
    (S) => ({ page: S.page.replace(
      `params.set("tab", "communications");\n              params.set("sub", "emails");`,
      `params.set("tab", "contacts");`) }), "contact_submission"],
  ["E15c", "the contact deep link stops ignoring an id that is not in the list",
    (S) => ({ contactsTab: S.contactsTab.replace(
      "    const row = items.find((i) => i.id === focusSubmissionId);\n    if (!row) return;",
      "    const row = items.find((i) => i.id === focusSubmissionId) ?? items[0];") }),
    "contact_submission"],
  ["E16", "an own-destination group falls through to its shared order",
    (S) => ({ bell: S.bell.replace(
      "const groupOrderId = OWN_DESTINATION_TYPES.has(latest.entity_type)",
      "const groupOrderId = false") })],
  ["E16b", "the own-destination set forgets the email row type",
    (S) => ({ bell: S.bell.replace(
      /const OWN_DESTINATION_TYPES = new Set\(\[[^\]]*\]\);/,
      "const OWN_DESTINATION_TYPES = new Set([]);") })],
  // ── contact_submission flavour (LIVE) twins of the thread-flavour controls ──
  ["E1", "the LIVE email arm goes back to titling the row with the event label",
    (S) => ({ migration: S.migration.replace(
      `(select 'email'::text, 'contact_submission'::text, cs.id::text,\n          coalesce(k.display_name, nullif(btrim(cs.name), ''), 'Unknown contact'),`,
      `(select 'email'::text, 'contact_submission'::text, cs.id::text,\n          'New customer email'::text,`) }), "contact_submission"],
  ["E2", "the LIVE preview prints the submitter address in full",
    (S) => ({ migration: S.migration.replace(
      "else ' · ' || public.mask_email_for_display(cs.email) end,",
      "else ' · ' || cs.email end,") }), "contact_submission"],
  ["E4", "the LIVE subject is concatenated raw instead of being sanitised",
    (S) => ({ migration: S.migration.replace(
      "public.safe_text_preview(coalesce(nullif(btrim(cs.subject), ''), cs.message), 70)",
      "coalesce(nullif(btrim(cs.subject), ''), cs.message)") }), "contact_submission"],
  ["E5", "the LIVE arm echoes the submission order_reference instead of the resolved id",
    (S) => ({ migration: S.migration.replace(
      `case when k.confirmation_id is not null then ' · ' || k.confirmation_id\n                    else ' · ' || public.mask_email_for_display(cs.email) end,`,
      `case when cs.metadata->>'order_reference' is not null then ' · ' || (cs.metadata->>'order_reference')\n                    else ' · ' || public.mask_email_for_display(cs.email) end,`) }), "contact_submission"],
  ["E7", "the LIVE arm resolves before its row set is bounded",
    (S) => ({ migration: S.migration.replace(
      `            order by c2.created_at desc limit 8) cs\n     join lateral public.resolve_email_contact`,
      `            order by c2.created_at desc) cs\n     join lateral public.resolve_email_contact`) }), "contact_submission"],
  ["E10", "a LIVE email row falls through to the order destination",
    (S) => ({ bell: S.bell.replace(
      'if (item.entity_type === "contact_submission" && item.entity_id && onOpenContactSubmission) {',
      "if (false) {") }), "contact_submission"],
];

function loadAll() {
  return {
    migration: read("migration"), bell: read("bell"),
    page: read("page"), hub: read("hub"), contactsTab: read("contactsTab"),
  };
}

function runChecks(S) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok = false;
    try { ok = !!fn(S); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-admin-notification-unified-email";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    const flavour = ownDestinationType(sql(base.migration));
    let bad = 0;
    let skipped = 0;
    for (const [target, label, mutate, onlyFlavour] of CONTROLS) {
      // A control for the other environment's store has nothing to plant here.
      // Counting it as a miss would train the reader to ignore red lines.
      if (onlyFlavour && onlyFlavour !== flavour) {
        skipped++;
        console.log(`  SKIP    ${target.padEnd(5)} ${label} (not the ${flavour} store)`);
        continue;
      }
      const patch = mutate(base);
      // A control that fails to modify the source proves nothing.
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      // "E15c" is a second control for check E15 — strip the suffix letters.
      const hit = results.find((r) => r.id === target.replace(/[a-z]+$/, ""));
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(5)} ${label}`,
      );
    }
    const applicable = CONTROLS.length - skipped;
    console.log(`\n${applicable - bad}/${applicable} negative controls caught${skipped ? ` (${skipped} not applicable to this store)` : ""}.`);
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
