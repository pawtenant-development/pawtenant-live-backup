#!/usr/bin/env node
import fs from "node:fs";

const pagePath = "src/pages/admin-orders/page.tsx";
const migrationPath = "supabase/migrations/20260821120000_admin_order_change_signal.sql";
const packagePath = "package.json";

const source = {
  page: fs.readFileSync(pagePath, "utf8"),
  migration: fs.readFileSync(migrationPath, "utf8"),
  pkg: fs.readFileSync(packagePath, "utf8"),
};

function evaluate(s) {
  const realtimeStart = s.page.indexOf("// ── Privacy-safe order change signal");
  const realtimeEnd = s.page.indexOf("// ── Real-time subscription for new inbound", realtimeStart);
  const realtime = realtimeStart >= 0 && realtimeEnd > realtimeStart
    ? s.page.slice(realtimeStart, realtimeEnd)
    : "";
  const tableStart = s.migration.indexOf("create table if not exists public.admin_order_change_signal");
  const tableEnd = s.migration.indexOf(");", tableStart);
  const tableDef = tableStart >= 0 && tableEnd > tableStart
    ? s.migration.slice(tableStart, tableEnd + 2)
    : "";

  return [
    ["signal table exists", tableDef.includes("admin_order_change_signal")],
    ["signal payload is minimal", !/email|first_name|last_name|phone|address|assessment|diagnos|price|gclid/i.test(tableDef)],
    ["single-row invariant", /check\s*\(id\s*=\s*1\)/i.test(tableDef)],
    ["RLS enabled and forced", /enable row level security/i.test(s.migration) && /force row level security/i.test(s.migration)],
    ["authenticated is read-only", /revoke all on table[\s\S]*authenticated/i.test(s.migration) && /grant select on table[\s\S]*to authenticated/i.test(s.migration)],
    ["admin policy is canonical", /using\s*\(public\.check_is_admin\(\)\)/i.test(s.migration)],
    ["trigger function is pinned", /security definer[\s\S]*set search_path = public, pg_temp/i.test(s.migration)],
    ["trigger function is not client-callable", /revoke all on function public\.bump_admin_order_change_signal\(\) from public, anon, authenticated/i.test(s.migration)],
    ["all order mutations signal", /after insert or update or delete on public\.orders/i.test(s.migration)],
    ["paid transition is explicit", /old\.status is distinct from 'paid'/i.test(s.migration)],
    ["only sanitized signal is published", /add table public\.admin_order_change_signal/i.test(s.migration) && !/add table public\.orders/i.test(s.migration)],
    ["client subscribes to signal", realtime.includes('table: "admin_order_change_signal"')],
    ["client does not subscribe to order rows", !realtime.includes('table: "orders"')],
    ["signal refreshes list and aggregates", realtime.includes("scheduleAggregateInvalidation()") && /\[listQueryKey, aggregateReloadToken, orderRowsGuard\]/.test(s.page)],
    ["reconnect reconciles missed changes", realtime.includes('status === "SUBSCRIBED"')],
    ["focus/online/visibility reconcile", realtime.includes('addEventListener("focus"') && realtime.includes('addEventListener("online"') && realtime.includes('addEventListener("visibilitychange"')],
    ["guard is wired into build", s.pkg.includes("check-admin-order-change-signal.mjs")],
  ];
}

function assertAll(label, candidate) {
  const checks = evaluate(candidate);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`[admin-order-change-signal] ${label}: FAIL`);
    for (const [name] of failed) console.error(`  - ${name}`);
    process.exitCode = 1;
  }
  return checks;
}

const checks = assertAll("source", source);
if (!process.exitCode) {
  console.log(`[admin-order-change-signal] ${checks.length}/${checks.length} source checks passed`);
}

const controls = [
  ["publish raw orders", (s) => ({ ...s, migration: s.migration + "\nalter publication supabase_realtime add table public.orders;\n" })],
  ["leak customer email", (s) => ({ ...s, migration: s.migration.replace("order_id uuid,", "order_id uuid,\n  email text,") })],
  ["drop forced RLS", (s) => ({ ...s, migration: s.migration.replace("alter table public.admin_order_change_signal force row level security;", "") })],
  ["allow authenticated writes", (s) => ({ ...s, migration: s.migration.replace("grant select on table public.admin_order_change_signal to authenticated;", "grant select, update on table public.admin_order_change_signal to authenticated;") })],
  ["remove admin predicate", (s) => ({ ...s, migration: s.migration.replace("using (public.check_is_admin());", "using (true);") })],
  ["unpin function search path", (s) => ({ ...s, migration: s.migration.replace("set search_path = public, pg_temp", "") })],
  ["omit delete events", (s) => ({ ...s, migration: s.migration.replace("after insert or update or delete on public.orders", "after insert or update on public.orders") })],
  ["subscribe to raw orders", (s) => ({ ...s, page: s.page.replace('table: "admin_order_change_signal"', 'table: "orders"') })],
  ["drop aggregate invalidation", (s) => ({ ...s, page: s.page.replaceAll("scheduleAggregateInvalidation();", "") })],
  ["drop list reload dependency", (s) => ({ ...s, page: s.page.replace("[listQueryKey, aggregateReloadToken, orderRowsGuard]", "[listQueryKey, orderRowsGuard]") })],
  ["drop reconnect reconciliation", (s) => ({ ...s, page: s.page.replace('status === "SUBSCRIBED"', 'status === "IGNORED"') })],
  ["drop focus reconciliation", (s) => ({ ...s, page: s.page.replace('window.addEventListener("focus", reconcileWhenActive);', "") })],
];

let controlsPassed = 0;
for (const [name, mutate] of controls) {
  const candidate = mutate(source);
  const failed = evaluate(candidate).filter(([, ok]) => !ok);
  if (failed.length === 0) {
    console.error(`[admin-order-change-signal] negative control did not bite: ${name}`);
    process.exitCode = 1;
  } else {
    controlsPassed += 1;
  }
}
if (!process.exitCode) {
  console.log(`[admin-order-change-signal] ${controlsPassed}/${controls.length} planted defects detected`);
}
