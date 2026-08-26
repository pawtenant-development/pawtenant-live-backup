#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  ui: "src/pages/admin-orders/components/ProviderRecruitmentTab.tsx",
  send: "supabase/functions/send-provider-recruitment-email/index.ts",
  approve: "supabase/functions/approve-provider-application/index.ts",
  notify: "supabase/functions/notify-provider-application/index.ts",
  followup: "supabase/functions/send-followup-email/index.ts",
  migration: "supabase/migrations/20260826120000_provider_email_wording_cleanup.sql",
};
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

function checks(f) {
  const out = [];
  const add = (name, ok) => out.push({ name, ok: Boolean(ok) });
  const providerEmailSource = f.approve.slice(
    f.approve.indexOf("function buildProviderInviteHtml"),
    f.approve.indexOf("async function getSetupLink"),
  );

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
  add("welcome email omits meeting language and gates cases on setup completion",
    !f.approve.includes("No onboarding meeting is required")
    && f.approve.includes("outstanding account details before cases can be assigned")
    && f.approve.includes("ready for case assignments"));
  add("welcome checklist asks only for outstanding payout and profile details",
    f.approve.includes("voided check or ACH details")
    && f.approve.includes("headshot and short bio")
    && !/NPI/i.test(providerEmailSource));
  add("application confirmation contains no meeting language",
    !/onboarding/i.test(f.notify)
    && f.notify.includes("email you with an update within <strong>48 hours</strong>"));
  add("pending-application follow-up contains no meeting language",
    !/onboarding/i.test(f.followup)
    && f.followup.includes("complete the review within the next <strong>24 hours</strong> and email you with an update"));
  add("database cleanup removes meeting, repeat-license and NPI requests",
    f.migration.includes("Please complete any outstanding account details by email")
    && f.migration.includes("<p[^>]*>To finish onboarding</p>")
    && f.migration.includes("<strong>Availability</strong> for a short onboarding call")
    && f.migration.includes("Active <strong>license details</strong> for every state and your <strong>NPI</strong>")
    && f.migration.includes("Once the required payout and profile details are complete and verified")
    && f.migration.includes("Provider welcome body still contains prohibited meeting/setup terminology")
    && f.migration.includes("Provider welcome body still requests NPI information"));
  add("application NPI remains captured and copied internally",
    f.approve.includes("const applicationNpi = appRow.npi")
    && f.approve.includes("npi_number: applicationNpiOrNull"));
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
    ["meeting language restored in welcome", (f) => { f.approve = f.approve.replace("Please complete any outstanding account details before cases can be assigned", "An onboarding meeting is required before cases can be assigned"); }],
    ["case readiness gate removed", (f) => { f.approve = f.approve.replace("before cases can be assigned", "after cases are assigned").replace("ready for case assignments", "ready"); }],
    ["payout requirement removed", (f) => { f.approve = f.approve.replace("voided check or ACH details", "payment details later"); }],
    ["NPI requested again", (f) => { f.approve = f.approve.replace("Your preferred display name and professional title", "Your NPI and active license details"); }],
    ["application meeting language restored", (f) => { f.notify = f.notify.replace("Application Decision", "Onboarding Call"); }],
    ["follow-up meeting language restored", (f) => { f.followup = f.followup.replace("Application Decision", "Onboarding Call"); }],
    ["database NPI cleanup removed", (f) => { f.migration = f.migration.replace("Active <strong>license details</strong> for every state and your <strong>NPI</strong>", "already cleaned"); }],
    ["legacy template heading cleanup removed", (f) => { f.migration = f.migration.replace("<p[^>]*>To finish onboarding</p>", "legacy heading cleanup removed"); }],
    ["legacy meeting bullet cleanup removed", (f) => { f.migration = f.migration.replace("<strong>Availability</strong> for a short onboarding call", "legacy meeting cleanup removed"); }],
    ["database fail-closed NPI assertion removed", (f) => { f.migration = f.migration.replace("Provider welcome body still requests NPI information", "NPI check removed"); }],
    ["internal NPI sync removed", (f) => { f.approve = f.approve.replaceAll("npi_number: applicationNpiOrNull", "npi_number: null"); }],
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
