#!/usr/bin/env node

import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260902213000_paid_incomplete_psd_continuation.sql", "utf8");
const resolver = fs.readFileSync("supabase/functions/resolve-continue-assessment/index.ts", "utf8");
const page = fs.readFileSync("src/pages/psd-assessment/page.tsx", "utf8");

function check(files) {
  const failures = [];
  const need = (id, ok, message) => { if (!ok) failures.push(`${id}: ${message}`); };
  need("D1", /lower\(coalesce\(v_order\.letter_type[\s\S]{0,80}<> 'psd'/.test(files.migration), "continuation must remain PSD-only");
  need("D2", /v_order\.paid_at is not null[\s\S]{0,120}v_status ->> 'complete'/.test(files.migration), "paid complete orders must stay closed");
  need("D3", /'already_paid', v_order\.paid_at is not null/.test(files.migration), "resolver must project paid state");
  need("D4", /in \('completed','cancelled','canceled','refunded','archived'\)/.test(files.migration), "terminal orders must stay closed");
  need("E1", /alreadyPaid: r\.already_paid === true/.test(files.resolver), "edge response must carry server paid state");
  need("U1", /setPaidAssessmentCompletion\(o\.alreadyPaid === true\)/.test(files.page), "client must adopt server paid state");
  need("U2", /if \(!paidAssessmentCompletion\)[\s\S]{0,100}setStep\(2\)/.test(files.page), "ordinary unpaid flow must stay unchanged");
  need("U3", /await autosave\.flush\(\)[\s\S]{0,900}action: "status"/.test(files.page), "paid completion must flush and verify canonical answers");
  need("U4", /data\?\.status\?\.complete !== true/.test(files.page), "paid completion must fail closed");
  need("U5", /Payment already received — no second payment is required\./.test(files.page), "customer must see no-second-charge copy");
  need("U6", !/if \(paidAssessmentCompletion\)[\s\S]{0,1000}setStep\(3\)/.test(files.page), "paid continuation must never enter checkout");
  return failures;
}

const baseline = { migration, resolver, page };
const failures = check(baseline);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const controls = [
  ["PSD-only guard removed", { ...baseline, migration: migration.replaceAll("<> 'psd'", "= 'psd'") }],
  ["paid-complete closure removed", { ...baseline, migration: migration.replaceAll("v_order.paid_at is not null", "false") }],
  ["paid projection removed", { ...baseline, migration: migration.replace("'already_paid', v_order.paid_at is not null", "'already_paid', false") }],
  ["edge paid flag removed", { ...baseline, resolver: resolver.replace("alreadyPaid: r.already_paid === true", "alreadyPaid: false") }],
  ["client paid flag removed", { ...baseline, page: page.replace("setPaidAssessmentCompletion(o.alreadyPaid === true)", "setPaidAssessmentCompletion(false)") }],
  ["canonical flush removed", { ...baseline, page: page.replace("await autosave.flush();", "") }],
  ["completion fail-opened", { ...baseline, page: page.replace("data?.status?.complete !== true", "false") }],
  ["no-charge copy removed", { ...baseline, page: page.replace("Payment already received — no second payment is required.", "Continue") }],
];

let caught = 0;
for (const [name, files] of controls) {
  if (check(files).length) caught += 1;
  else console.error(`negative control escaped: ${name}`);
}
if (caught !== controls.length) process.exit(1);

console.log(`Paid incomplete PSD continuation guard: 11/11 assertions; ${caught}/${controls.length} negative controls caught.`);
