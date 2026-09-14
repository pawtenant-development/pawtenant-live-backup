# PROPOSED MIGRATION — NOT APPLIED

**Task:** PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 (supersedes the
proposal written under PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 closure).
**Status:** proposal only. Nothing in this file has been run against TEST or LIVE.
**Why it is a proposal:** the task forbids applying any migration. The frontend half
is shipped and deliberately kept **visibly unavailable** until this backend contract
exists (`PARTNER_PSD_MANUAL_INTAKE_ENABLED = false` in `src/lib/partnerPsdIntake.ts`).

Suggested filename once approved:
`supabase/migrations/20260913120000_partner_manual_psd_canonical_answers.sql`

---

## Root cause this fixes (proven on TEST; every probe rolled back, zero residue)

`partner_submit_manual_order` is the only PSD partner intake that never collects or
normalizes the canonical `psd_v1` clinical answers:

* it builds `assessment.answers` from the pasted free text only
  (`partnerQuestionnaireText`, `partnerIntakeChannel`), and
* it calls `partner_accept_order(..., p_target_assessment_version => NULL, ...)`.

So `partner_accept_order` stores the answer rows under
`assessment_version = 'portal.manual.v1'`. That version has no rows in
`psd_assessment_questions`, so `psd_assessment_status` returns
`unmapped_version = true`, `answered = 0`, `missing_count = 16`, `complete = false`,
and `assign-doctor` refuses with HTTP 409 `psd_assessment_incomplete`.

| intake path | stored version | answered | complete | assign-doctor |
|---|---|---|---|---|
| manual portal (`portal.manual.v1`) | `portal.manual.v1` | 0/16 | false | **409 unmapped** |
| canonical contract (`partner.assessment.psd.v1` → `psd_v1`) | `psd_v1` | 16/16 | true | **200 assigned** |

`letter_type='psd'`, `order_origin='partner'` and `order_workflow_state='paid_unassigned'`
were already correct on both paths. The gap is the manual intake contract only.

## What is ALREADY SHIPPED on the frontend (TEST), waiting on this contract

* `src/lib/partnerPsdIntake.ts` — the availability flag, the canonical target version
  (`psd_v1`), and `psdManualAnswerProblems()`, the client twin of the SQL validator
  below (same refusals: empty catalog, unknown key, claim key, missing required,
  wrong value shape).
* `src/components/partner/PartnerPsdQuestionnaire.tsx` — the structured question form.
  The requirement set is read from the LIVE `psd_assessment_questions` catalog
  (`assessment_version = 'psd_v1'`; authenticated-readable), never a hardcoded list;
  wording and option labels come from `psdAssessmentSchema.ts`, the same module the
  provider's assessment renders from.
* `src/components/partner/PartnerOrderWizard.tsx` — with the flag on, a PSD order shows
  the structured questions above the pasted transcript, refuses submission until the
  validator is clean, and sends `p_psd_answers`. With the flag off (today), the PSD
  service tile is disabled with the honest reason and the key is **never sent**, so
  the form cannot appear to work while the database discards the answers.
* Build guard: the flag may be `true` only when this migration file exists in
  `supabase/migrations/` and declares `p_psd_answers jsonb` — so the frontend cannot be
  switched on ahead of the backend.

## What this migration does NOT do

* It does **not** map free text onto clinical answers. No answer is inferred, derived or
  manufactured from the pasted questionnaire.
* It does **not** weaken `psd_assessment_status`, the completion gate, or the
  unmapped-version block. An order without real answers stays blocked.
* It does **not** touch ESA intake, direct PawTenant PSD/ESA orders, or the
  `partner-orders-v1` API path.

## Frontend step once applied

Set `PARTNER_PSD_MANUAL_INTAKE_ENABLED = true` in `src/lib/partnerPsdIntake.ts`
(one line), re-run `node scripts/check-partner-simple-manual-fulfillment.mjs`, and
retire the `M1`-style "no new migration" control if a guard still carries one.

---

```sql
-- PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — manual PSD partner
-- intake collects the canonical psd_v1 clinical answers.
--
-- Idempotent. Every function is rewritten from THIS database's own
-- pg_get_functiondef at application time (never pasted across repos).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Catalog-driven validation of a manual PSD answer set.
-- ───────────────────────────────────────────────────────────────────────────
-- The SQL twin of psdManualAnswerProblems() in src/lib/partnerPsdIntake.ts and
-- of validatePsdContractAssessment() in partner-orders-v1/validate.ts. The
-- requirement set comes from the LIVE registry, never a hardcoded list, so a
-- catalog change can never leave intake and the assignment gate disagreeing.
-- Fails closed on an unreadable or empty catalog.
create or replace function public.partner_manual_psd_answers_problems(p_answers jsonb)
returns text[]
language plpgsql
stable
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_problems text[] := '{}';
  v_known    text[];
  v_required text[];
  v_key      text;
  v_val      jsonb;
  -- Answers whose canonical shape is an array of strings.
  v_arrays   text[] := array['conditions','dogTasks'];
  -- Keys that would claim a clinical decision. Never accepted.
  v_claims   text[] := array['complete','eligible','eligibility','approved','approval',
                             'qualified','qualifies','decision','outcome','passed'];
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return array['assessment answers must be a JSON object'];
  end if;

  select array_agg(question_id), array_agg(question_id) filter (where required)
    into v_known, v_required
    from public.psd_assessment_questions
   where assessment_version = 'psd_v1';

  if v_known is null or cardinality(v_known) = 0 then
    return array['psd question catalog unavailable'];
  end if;

  -- Duplicate keys cannot survive jsonb, but a caller may try to smuggle the
  -- same question under two spellings; the catalog is the only vocabulary.
  for v_key in select jsonb_object_keys(p_answers) loop
    if v_key = any(v_claims) then
      return array[format('%s is not accepted: clinical eligibility is determined by PawTenant clinicians, never submitted', v_key)];
    end if;
    if not (v_key = any(v_known)) then
      return array[format('unknown question: %s', v_key)];
    end if;
  end loop;

  foreach v_key in array coalesce(v_required, '{}') loop
    if not (p_answers ? v_key) then
      v_problems := array_append(v_problems, format('missing required question: %s', v_key));
    end if;
  end loop;

  for v_key, v_val in select key, value from jsonb_each(p_answers) loop
    if v_key = any(v_arrays) then
      if jsonb_typeof(v_val) <> 'array'
         or jsonb_array_length(v_val) = 0
         or jsonb_array_length(v_val) > 64
         or exists (select 1 from jsonb_array_elements(v_val) e
                     where jsonb_typeof(e) <> 'string'
                        or btrim(e #>> '{}') = ''
                        or length(e #>> '{}') > 500) then
        v_problems := array_append(v_problems, format('%s: must be a non-empty array of short strings', v_key));
      end if;
    else
      if jsonb_typeof(v_val) <> 'string'
         or btrim(v_val #>> '{}') = ''
         or length(v_val #>> '{}') > 4000 then
        v_problems := array_append(v_problems, format('%s: must be a non-empty string', v_key));
      end if;
    end if;
  end loop;

  return v_problems;
end;
$fn$;

revoke all on function public.partner_manual_psd_answers_problems(jsonb) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. partner_submit_manual_order gains p_psd_answers.
-- ───────────────────────────────────────────────────────────────────────────
-- The 11-argument overload is dropped so PostgREST never sees two candidates.
drop function if exists public.partner_submit_manual_order(uuid, text, jsonb, jsonb, text, text, boolean, text, uuid, jsonb, jsonb);

create or replace function public.partner_submit_manual_order(
  p_partner_id uuid, p_service text, p_customer jsonb, p_pets jsonb, p_questionnaire_text text,
  p_partner_reference text, p_authorization_confirmed boolean, p_client_request_id text,
  p_draft_id uuid default null::uuid,
  p_questionnaire_blocks jsonb default null,
  p_questionnaire_additional jsonb default null,
  p_psd_answers jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  -- ... every declaration from the CURRENT definition, unchanged, plus:
  v_psd_problems   text[];
  v_target_version text := null;
begin
  -- ... every statement from the CURRENT definition down to and including the
  -- questionnaire-blocks losslessness check, UNCHANGED (partner resolution
  -- from the session for a portal caller, is_chat_admin for an admin caller,
  -- client_request_id_required, validation, rate lookup, idempotent replay,
  -- duplicate_partner_reference).

  -- NEW — PSD orders must carry the canonical psd_v1 answer set.
  -- ESA is untouched: it has no clinical catalog and keeps the free-text step.
  if v_service = 'psd' then
    if p_psd_answers is null then
      raise exception 'psd_answers_required' using errcode = '22023';
    end if;
    v_psd_problems := public.partner_manual_psd_answers_problems(p_psd_answers);
    if cardinality(v_psd_problems) > 0 then
      raise exception 'psd_assessment_incomplete: %', array_to_string(v_psd_problems, ',')
        using errcode = '22023';
    end if;
    v_target_version := 'psd_v1';
  elsif p_psd_answers is not null then
    -- A non-PSD order may not smuggle clinical answers in.
    raise exception 'psd_answers_not_applicable' using errcode = '22023';
  end if;

  v_answers := jsonb_build_object(
    'partnerQuestionnaireText', p_questionnaire_text,
    'partnerIntakeChannel', 'partner_portal_manual');
  if v_blocks_ok then
    v_answers := v_answers || jsonb_build_object(
      'partnerQuestionnaireBlocks', p_questionnaire_blocks,
      'partnerQuestionnaireAdditional', coalesce(p_questionnaire_additional, '[]'::jsonb),
      'partnerQuestionnaireFormat', 'qa_blocks.v1');
  end if;
  -- NEW — the canonical clinical answers travel as assessment.answers so
  -- partner_accept_order writes them as psd_v1 rows. The verbatim questionnaire
  -- stays on the order as supporting context, never as a clinical answer.
  if v_target_version is not null then
    v_answers := v_answers || p_psd_answers;
  end if;

  -- ... v_payload construction UNCHANGED ...

  -- CHANGED — the 7th argument was hardcoded NULL. That is the whole defect.
  select * into v_res from public.partner_accept_order(
    v_pid, v_payload, v_hash, 'portal.manual.v1', p_client_request_id,
    p_client_request_id, v_target_version, 'partner_portal_manual');

  -- ... partner_intake_audit, draft close-out and the return value UNCHANGED,
  -- except the audit metadata gains (ids and counts only, never answers):
  --   'psd_answer_count', case when v_target_version is null then 0
  --                            else (select count(*) from jsonb_object_keys(p_psd_answers)) end
end;
$function$;

revoke all on function public.partner_submit_manual_order(uuid, text, jsonb, jsonb, text, text, boolean, text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.partner_submit_manual_order(uuid, text, jsonb, jsonb, text, text, boolean, text, uuid, jsonb, jsonb, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. partner_clinical_state must not call an unassignable PSD case "ready".
-- ───────────────────────────────────────────────────────────────────────────
-- Observed on TEST: a partner PSD order the assignment gate refuses still read
-- "Ready for assignment" in Partner Platform. The state now defers to the SAME
-- authority the gate uses, so the two can never disagree.
create or replace function public.partner_clinical_state(o orders)
returns text
language sql
stable
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
  select case
    when o.order_origin is distinct from 'partner' then null
    when o.status = 'cancelled'                    then 'cancelled'
    when o.doctor_user_id is null and o.doctor_email is null
         and o.status = 'validation_hold'          then 'validation_hold'
    else (
      case public.order_workflow_state(o)
        when 'lead'            then 'received'
        when 'paid_unassigned' then
          case when lower(coalesce(o.letter_type,'')) = 'psd'
                    and coalesce((public.psd_assessment_status(o.id)->>'complete')::boolean, false) is not true
               then 'assessment_incomplete' else 'ready_for_assignment' end
        when 'under_review'    then
          case when o.additional_documentation_required
                    and coalesce(o.additional_documentation_status,'') <> 'completed'
               then 'consultation_required' else 'provider_review' end
        when 'pending_delivery' then 'document_ready'
        when 'completed'        then 'clinical_work_completed'
        when 'reopened'         then 'correction_required'
        else public.order_workflow_state(o)
      end
    )
  end;
$function$;
```

---

## Callers to re-check before applying

`partner_clinical_state` gains a new return value, `assessment_incomplete`. Every reader
must be checked, not assumed:

* `src/pages/admin-orders/components/PartnerOrdersTab.tsx` — status chip and filter list
* `src/pages/admin-orders/components/partner-platform/PartnerOverviewTab.tsx` — the
  "Recent partner orders" CLINICAL STATE column
* `src/pages/partner-portal/components/PartnerPortalOrders.tsx` — `CLINICAL_LABELS`
  (add `assessment_incomplete: "Assessment incomplete"`)
* `supabase/functions/partner-orders-v1/` status projection — a published contract;
  adding a value is a contract change and may need a version note

`partner_clinical_state` becomes dependent on `psd_assessment_status(o.id)`.
`order_workflow_state(orders)` must never be called in a `WHERE` clause (whole-row ⇒
TOAST expansion); the same caution applies to any list query that would now evaluate
this per row.

## Guards to extend in the same commit

`scripts/check-partner-simple-manual-fulfillment.mjs` — flip the coupling check from
"flag off ⇒ no migration" to "flag on ⇒ migration present and declares `p_psd_answers`"
(already written both ways; the guard reads the flag), and add the verification-matrix
items: a valid manual PSD order classifies and assigns; missing clinical evidence refuses;
contradictory service/answer identifiers fail closed; ESA and direct PSD stay unchanged.
