#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  ui: "src/pages/admin-orders/components/ProviderRecruitmentTab.tsx",
  send: "supabase/functions/send-provider-recruitment-email/index.ts",
  approve: "supabase/functions/approve-provider-application/index.ts",
  migration: "supabase/migrations/20260825120000_provider_self_service_welcome_email.sql",
};
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

function checks(f) {
  const out = [];
  const add = (name, ok) => out.push({ name, ok: Boolean(ok) });

  add("UI permits sending with no state selection",
    !f.ui.includes('if (selectedStates.length === 0) return "Select at least one target state."')
    && !f.ui.includes("validEmails.length === 0 || selectedStates.length === 0"));
  add("UI explains that states are optional context", f.ui.includes("optional context only"));
  add("per-send copy explicitly replaces the standard message",
    f.ui.includes("replaces the standard message for this send")
    && f.ui.includes("customMessage: customMessage.trim() || undefined"));
  add("preview always renders a safe fallback", f.ui.includes("tplBody ? substitute(tplBody, vars) : fallbackEmail(vars)"));
  add("server accepts an empty state list but rejects invalid supplied states",
    f.send.includes("const invalidStates = requestedStates.filter")
    && !f.send.includes('error: "Select at least one valid U.S. state."'));
  add("custom copy is length bounded and HTML escaped",
    f.send.includes("MAX_CUSTOM_MESSAGE = 4_000")
    && f.send.includes("plainTextToHtml(customMessage)")
    && f.send.includes("escapeHtml(paragraph)"));
  add("custom copy replaces rather than prepends to the saved template",
    /const html = customMessage\s*\? fallbackEmail\(vars, plainTextToHtml\(customMessage\)\)\s*:\s*tplBody/.test(f.send));
  add("welcome email requires no meeting and gates cases on setup completion",
    f.approve.includes("No onboarding meeting is required")
    && f.approve.includes("before cases can be assigned")
    && f.approve.includes("ready for case assignments"));
  add("welcome checklist includes payout, profile and licensing requirements",
    f.approve.includes("voided check or ACH details")
    && f.approve.includes("headshot and short bio")
    && f.approve.includes("license details for each state and your NPI"));
  add("database template matches the self-service welcome contract",
    f.migration.includes("No onboarding meeting is required")
    && f.migration.includes("Required before case assignment")
    && !f.migration.includes("short onboarding call"));
  return out;
}

const base = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--self-test")) {
  const plants = [
    ["state required in UI", (f) => { f.ui += '\nif (selectedStates.length === 0) return "Select at least one target state.";'; }],
    ["state disables send", (f) => { f.ui += "\nconst planted = validEmails.length === 0 || selectedStates.length === 0;"; }],
    ["replacement label removed", (f) => { f.ui = f.ui.replace("replaces the standard message for this send", "added above the standard message"); }],
    ["fallback preview removed", (f) => { f.ui = f.ui.replace("tplBody ? substitute(tplBody, vars) : fallbackEmail(vars)", "tplBody ? substitute(tplBody, vars) : null"); }],
    ["server rejects empty states", (f) => { f.send += '\nreturn json({ error: "Select at least one valid U.S. state." }, 400);'; }],
    ["custom message escaping removed", (f) => { f.send = f.send.replace("escapeHtml(paragraph)", "paragraph"); }],
    ["custom message appended", (f) => { f.send = f.send.replace("const html = customMessage", "const html = tplBody + customMessage"); }],
    ["meeting requirement restored", (f) => { f.approve = f.approve.replace("No onboarding meeting is required", "An onboarding meeting is required"); }],
    ["case readiness gate removed", (f) => { f.approve = f.approve.replace("before cases can be assigned", "after cases are assigned").replace("ready for case assignments", "ready"); }],
    ["payout requirement removed", (f) => { f.approve = f.approve.replace("voided check or ACH details", "payment details later"); }],
    ["database call wording restored", (f) => { f.migration += "\n-- short onboarding call"; }],
  ];
  let failures = 0;
  for (const [name, plant] of plants) {
    const f = { ...base };
    plant(f);
    const failed = checks(f).some((r) => !r.ok);
    console.log(`${failed ? "✓" : "✗"} ${name}`);
    if (!failed) failures++;
  }
  if (failures) process.exit(1);
  console.log(`${plants.length}/${plants.length} planted defects detected`);
  process.exit(0);
}

const results = checks(base);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
const failures = results.filter((r) => !r.ok);
if (failures.length) process.exit(1);
console.log(`${results.length}/${results.length} provider recruitment and self-service welcome checks passed`);
