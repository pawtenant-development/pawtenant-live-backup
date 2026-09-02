#!/usr/bin/env node

import fs from "node:fs";

const serverPath = "supabase/functions/get-resume-order/index.ts";
const pagePath = "src/pages/psd-assessment/page.tsx";
const server = fs.readFileSync(serverPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

function checks(files) {
  const failures = [];
  const require = (id, condition, message) => {
    if (!condition) failures.push(`${id}: ${message}`);
  };
  const emailStart = files.server.indexOf("// 3. Email fallback");
  const emailEnd = files.server.indexOf("// 4. Payment upserts", emailStart);
  const emailBlock = files.server.slice(emailStart, emailEnd);

  require("R1", emailStart >= 0 && emailEnd > emailStart, "email fallback block must remain identifiable");
  require("R2", /!isPaymentUpsert[\s\S]{0,120}body\.letterType[\s\S]{0,160}emailQuery = emailQuery\.eq\("letter_type", body\.letterType\)/.test(emailBlock), "lead email lookup must be isolated by product");
  require("R3", /isAlreadyPaid\(byEmail\) && !isPaymentUpsert[\s\S]{0,550}repeat purchase:[\s\S]{0,220}creating a new order/.test(emailBlock), "a paid-email lead must fall through as a repeat purchase");
  require("R4", !/isAlreadyPaid\(byEmail\) && !isPaymentUpsert[\s\S]{0,700}(status:\s*409|emailConflict:\s*true)/.test(emailBlock), "a paid order must not block a new lead with the same email");
  require("R5", /else \{[\s\S]{0,1100}existingOrder = byEmail;[\s\S]{0,120}matchedBy = "email"/.test(emailBlock), "an eligible unpaid order must still resume");
  require("R6", /isAlreadyPaid\(byEmail\) && isPaymentUpsert[\s\S]{0,650}different payment intent/.test(emailBlock), "payment-upsert conflict protection must remain");
  require("R7", files.server.indexOf('.eq("confirmation_id", confirmationId)') < emailStart, "confirmation id must remain the first order identity lookup");
  require("U1", /const leadSaved = await saveLeadToSupabase\(step2\);[\s\S]{0,180}if \(!leadSaved\)[\s\S]{0,180}return;/.test(files.page), "PSD must not advance when its lead row was not saved");
  require("U2", /role="alert"[^>]*>[\s\S]{0,180}\{leadSaveError\}/.test(files.page), "the customer must see a save failure");
  require("U3", /your answers are still on this device/.test(files.page), "failure copy must accurately preserve the local-draft recovery path");
  return failures;
}

const baseline = { server, page };
const failures = checks(baseline);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const controls = [
  ["paid-email 409 restored", { server: server.replace("console.info(\n              `[get-resume-order] repeat purchase:", "return new Response(JSON.stringify({ emailConflict: true }), { status: 409 });\n            console.info(\n              `[get-resume-order] repeat purchase:"), page }],
  ["product scope removed", { server: server.replace('emailQuery = emailQuery.eq("letter_type", body.letterType);', "emailQuery = emailQuery;"), page }],
  ["unpaid resume removed", { server: server.replace("existingOrder = byEmail;", "existingOrder = null;"), page }],
  ["payment conflict removed", { server: server.replace("if (isAlreadyPaid(byEmail) && isPaymentUpsert)", "if (false)"), page }],
  ["failed save advances", { server, page: page.replace("if (!leadSaved) {", "if (false) {") }],
  ["visible error removed", { server, page: page.replace('{leadSaveError}', '{null}') }],
];

let caught = 0;
for (const [name, files] of controls) {
  if (checks(files).length) caught += 1;
  else console.error(`negative control escaped: ${name}`);
}
if (caught !== controls.length) process.exit(1);

console.log(`PSD repeat-purchase order-save guard: 10/10 assertions; ${caught}/${controls.length} negative controls caught.`);
