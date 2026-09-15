// ADDITIONAL-PET-REASSIGNMENT-PRIVACY-EARNINGS-PRICE-001
// Static guard for request-level handoff, separate payout, provider-history
// privacy, and the post-completion-only $60 price.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const migration = read("supabase/migrations/20260915054500_additional_pet_reassignment_privacy_earnings_price.sql");
const payment = read("supabase/functions/_shared/completeAdditionalPetPayment.ts");
const history = read("src/pages/admin-orders/components/PaymentHistoryTab.tsx");
const summary = read("src/pages/admin-orders/components/ProviderPayoutSummary.tsx");
const provider = read("src/pages/provider-portal/components/ProviderEarnings.tsx");
const review = read("src/pages/provider-portal/components/ProviderAdditionalPetReview.tsx");
const queue = read("src/pages/provider-portal/components/ProviderAdditionalPetQueue.tsx");
const submit = read("supabase/functions/provider-submit-letter/index.ts");
const assignment = read("supabase/migrations/20260915061500_additional_pet_full_case_assignment_message.sql");
const assessmentProjection = read("supabase/migrations/20260915013358_sync_reassigned_additional_pet_into_assessment.sql");
const neutralAssessment = read("src/components/partner/PartnerNeutralAssessment.tsx");
const adminModal = read("src/pages/admin-orders/components/OrderDetailModal.tsx");
const providerDetail = read("src/pages/provider-portal/components/ProviderOrderDetail.tsx");

const checks = [
  ["request-keyed earning FK exists", /additional_pet_request_id uuid[\s\S]*references public\.order_additional_pet_requests\(id\) on delete restrict/.test(migration)],
  ["one earning per request is enforced", /unique index[\s\S]*doctor_earnings_additional_pet_request_uniq[\s\S]*where additional_pet_request_id is not null/.test(migration)],
  ["earning is created only on completion transition", /after update of status[\s\S]*new\.status = 'completed'[\s\S]*old\.status is distinct from new\.status/.test(migration)],
  ["replacement assignee receives configured provider rate", /new\.assigned_provider_user_id[\s\S]*v_profile\.per_order_rate[\s\S]*'additional_pet'/.test(migration)],
  ["migration never rewrites or deletes the base earning", !/(update|delete from)\s+public\.doctor_earnings/i.test(migration)],
  ["provider projection is assigned-reviewer scoped", /r\.assigned_provider_user_id = auth\.uid\(\)/.test(migration)],
  ["original provider cannot follow a reassigned request", /r\.assigned_provider_user_id is null[\s\S]*v_order\.doctor_user_id = auth\.uid\(\)/.test(migration)],
  ["provider event allowlist excludes declines and reassignment", /e\.event_type in \('clarification_requested','resubmitted',[\s\S]*'provider_approved'\)/.test(migration) && !/e\.event_type in \([^;]*provider_declined/.test(migration)],
  ["provider history begins at current reassignment cycle", /v_cycle_start[\s\S]*e\.event_type = 'reassigned'[\s\S]*e\.created_at >= v_cycle_start/.test(migration)],
  ["current post-completion quote is $60", /'post_completion_v2_6000', 6000/.test(migration)],
  ["existing frozen requests bypass the price overlay", /Existing[\s\S]*resume_payment[\s\S]*bypass/.test(migration)],
  ["$60 overlay is post-completion paid-upgrade only", /v_result->>'phase' = 'post_completion'[\s\S]*v_result->>'outcome' = 'paid_upgrade'/.test(migration)],
  ["generic pre-completion price stays on v2_3000", /generic pre-completion[\s\S]*remains v2_3000/.test(migration)],
  ["payment audit uses frozen request amount", (payment.match(/amount_cents:\s*expectedCents/g) || []).length >= 2],
  ["admin payout UI separates additional-pet earnings", /earning_type === "additional_pet"/.test(history) && /Additional Pet completion payout/.test(history)],
  ["admin summary treats additional-pet payout as extra", /t === "additional_pet"/.test(summary)],
  ["provider earnings labels additional-pet work", /earning_type === "additional_pet"/.test(provider)],
  ["new assignee sees neutral normal-case details language", /Case Details/.test(review) && !/Complete Case Review|Case Review|replacement letter/.test(review)],
  ["new assignee sees every pet in one neutral list", /const showAsStandardCase = isReplacementCase/.test(review) && /const allCasePets = showAsStandardCase/.test(review) && />Pets</.test(review) && !/isReplacementCase \? "Pet"|isReplacementCase \? "Other pets"/.test(review)],
  ["new assignee queue contains no handoff terminology", /New Cases/.test(queue) && /isReplacementCase=\{!r\.is_order_provider\}/.test(queue) && !/Complete Case Reviews|Assigned Cases|fresh full-case assignment|multi-pet complete case|Submit the revised letter|Submit revised letter/.test(queue)],
  ["new assignee decline copy contains no reassignment disclosure", /internal review/.test(review) && /isReplacementCase/.test(review)],
  ["provider queue receives the complete target pet count", /'target_pet_count', r\.target_pet_count/.test(migration) && /target_pet_count: number \| null/.test(queue)],
  ["provider UI contains no prior-provider decline rendering", !/h\.event_type === "provider_declined"/.test(review) && !/next reviewer/.test(review)],
  ["submitted revision snapshot covers original and every approved added pet", /const pets = \[\.\.\.originals, \.\.\.approvedAdded\];/.test(submit) && /p_pet_snapshot: addPetSnapshot/.test(submit)],
  ["assignment notification is neutral normal-case language", /New case assigned/.test(assignment) && /A new %s-pet %s case/.test(assignment) && /assessment and all pets/.test(assignment) && !/replacement letter|complete multi-pet case/i.test(assignment)],
  ["assignment validates the provider's state licence", /provider_not_licensed_for_state/.test(assignment)],
  ["internal assessment preserves original answers and merges pets at read time", /coalesce\(o\.assessment_answers[\s\S]*jsonb_set\(v_answers, '\{pets\}', v_pets, true\)/.test(assessmentProjection)],
  ["assessment projection is admin/base-provider/current-assignee gated", /v_is_admin[\s\S]*v_order_provider is distinct from v_actor[\s\S]*not v_is_assignee/.test(assessmentProjection)],
  ["assessment projection includes paid active work and completed additions", /r\.paid_at is not null or r\.pricing_outcome = 'included'/.test(assessmentProjection) && /'needs_reassignment'[\s\S]*'completed'/.test(assessmentProjection)],
  ["assessment projection excludes financial and provider-history output", /return jsonb_set\(v_answers/.test(assessmentProjection) && !/jsonb_build_object\([\s\S]*(amount_cents|provider_decision|provider_decision_reason|event_type)/.test(assessmentProjection)],
  ["assessment projection deduplicates an already-present pet", /v_pets @> jsonb_build_array\(v_pet\)/.test(assessmentProjection)],
  ["assessment RPC is unavailable to public and anon", /revoke all on function public\.get_internal_assessment_answers\(uuid\) from public/.test(assessmentProjection) && /from anon/.test(assessmentProjection)],
  ["neutral assessment resolves complete server data and fails closed", /get_internal_assessment_answers/.test(neutralAssessment) && /Unable to load the complete assessment/.test(neutralAssessment) && /aria-busy="true"/.test(neutralAssessment)],
  ["neutral screen and PDF use the same resolved order", /buildAssessmentDocumentModel\(\{ \.\.\.resolvedOrder/.test(neutralAssessment) && /buildPrintHTML\(\{[\s\S]*\.\.\.resolvedOrder/.test(neutralAssessment)],
  ["admin assessment delegates its PDF to the complete neutral renderer", /<PartnerNeutralAssessment order=\{order\} audience="admin" showDownload \/>/.test(adminModal) && !/buildPrintHTML\(order\)/.test(adminModal)],
  ["provider assessment and existing PDF controls resolve complete pets without a duplicate button", /<PartnerNeutralAssessment order=\{order\} \/>/.test(providerDetail) && /resolveInternalAssessmentOrder\(order\)/.test(providerDetail) && !/<PartnerNeutralAssessment order=\{order\} showDownload \/>/.test(providerDetail)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (failed.length) {
  console.error(`\n${failed.length} additional-pet invariant(s) failed.`);
  process.exit(1);
}
console.log(`\nPASS: ${checks.length} additional-pet invariants.`);
