import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260915021810_reopen_assignment_current_provider.sql");
const review = read("src/pages/provider-portal/components/ProviderAdditionalPetReview.tsx");
const detail = read("src/pages/provider-portal/components/ProviderOrderDetail.tsx");
const submit = read("supabase/functions/provider-submit-letter/index.ts");
const notify = read("supabase/functions/notify-reopened-case-provider/index.ts");
const adminOrder = read("src/pages/admin-orders/components/OrderDetailModal.tsx");

const checks = [
  ["reassignment makes provider current", /update public\.orders[\s\S]*doctor_user_id = p_provider_user_id[\s\S]*doctor_status = 'pending_review'[\s\S]*status = 'under-review'/.test(migration)],
  ["reassignment never edits earnings", !/(update|delete from) public\.doctor_earnings/i.test(migration)],
  ["reassignment never clears delivered document", !/signed_letter_url\s*=|patient_notification_sent_at\s*=|letter_id\s*=/.test(migration)],
  ["provider gets one ordinary queue entry", /o\.doctor_user_id is distinct from auth\.uid\(\)/.test(migration)],
  ["reopened assessment uses neutral case details", /isReplacementCase=\{order\.status === "under-review" && Boolean\(order\.signed_letter_url\)\}/.test(detail) && /showAsStandardCase \? "Case Details"/.test(review)],
  ["pending-decision upload error is neutral", /This case requires your clinical decision before a letter can be submitted/.test(submit) && !/This order has an Additional Pet request awaiting your clinical decision/.test(submit)],
  ["provider email is admin-authenticated", /caller\.rpc\("is_admin_staff"\)/.test(notify) && /Admin access required/.test(notify)],
  ["provider email re-derives active assignment", /assigned_provider_user_id", order\.doctor_user_id/.test(notify) && /Order is not an active reassigned case/.test(notify)],
  ["provider email is idempotent", /reserveEmailSend/.test(notify) && /provider_assigned_reopened_case/.test(notify)],
  ["provider email sends no customer notification", !/provider_assigned_customer|notify-order-status|ghl-webhook-proxy/.test(notify)],
  ["provider email copy is ordinary-case language", /New \$\{caseType\} Case Assigned/.test(notify) && !/replacement letter|complete case review|full case replacement/i.test(notify)],
  ["admin resend protects original earning", /isReopenedDeliveredCase[\s\S]*notify-reopened-case-provider[\s\S]*await getAdminToken\(\)/.test(adminOrder)],
];

let failures = 0;
for (const [label, ok] of checks) {
  if (!ok) { failures += 1; console.error(`FAIL: ${label}`); }
  else console.log(`PASS: ${label}`);
}
if (failures) process.exit(1);
