-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 6 closure correction.
--
-- THE DEFECT THIS FIXES (diagnostic honesty, not eligibility)
-- A partner PSD order stores its answers under the server-side constant
-- 'partner.assessment.v1' (partner-orders-v1 always stamps the constant — a
-- partner cannot steer the stored version). psd_assessment_status derived the
-- required-question set from that stored version, and since
-- psd_assessment_questions has no rows for it, the status collapsed to
-- required_total 0 / answered 0 / missing [] / complete false. The gate
-- correctly refused (complete demands required_total > 0 — fail-closed by
-- design), but the refusal was VACUOUS: it identified nothing, so an admin saw
-- "0 of 0 answers missing" on a case that can never be assigned.
--
-- WHAT CHANGES — and what deliberately does NOT
-- A PSD order whose stored answer-version is unknown to the question catalog
-- is now judged against the CANONICAL CURRENT retail version ('psd_v1', the
-- same constant the existing no-answers fallback already uses):
--   * required_total / missing report the real retail requirement set, so the
--     blocked state names exactly which clinical questions stand unmet;
--   * answered counts NOTHING — no partner answer may satisfy any retail
--     question implicitly, not even one whose question_id happens to collide
--     with a retail id. Equivalence requires an explicit, versioned,
--     clinically-approved mapping (Slice 7), which this migration does NOT
--     invent;
--   * unmapped_version=true and judged_version are added to the status JSON so
--     callers can say WHY the case is blocked.
--
-- Orders whose stored version IS in the catalog — every direct PSD order,
-- psd_v1 and psd_v0_legacy alike — take exactly the pre-existing path:
-- required set from their own version, answered counted as before, byte-
-- identical results. Non-PSD orders are untouched (no canonical answer rows;
-- the fallback version is catalog-known, and is_psd=false short-circuits the
-- gate anyway).
--
-- Partner identity is NOT an input: the arm keys purely on "is this stored
-- assessment_version present in the question catalog", never on order_origin,
-- partner_id or a partner name. A future retail version bump behaves the same
-- way any unknown version does — blocked loudly instead of blocked silently.
create or replace function public.psd_assessment_status(p_order_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with o as (select id, letter_type from public.orders where id = p_order_id),
  ver as (select coalesce((select assessment_version from public.assessment_answers
                            where order_id = p_order_id limit 1), 'psd_v1') as v),
  known as (select exists (select 1 from public.psd_assessment_questions q, ver
                            where q.assessment_version = ver.v) as catalog_known),
  -- The version this order is JUDGED against. An unknown stored version can
  -- only be a schema that no clinically-approved mapping covers yet, so it is
  -- held to the canonical current requirement set and can never pass by the
  -- absence of a catalog.
  eff as (select case when known.catalog_known then ver.v else 'psd_v1' end as v
          from known, ver),
  req as (select q.question_id from public.psd_assessment_questions q, eff
           where q.assessment_version = eff.v and q.required),
  -- Unmapped version ⇒ no stored answer may satisfy any requirement, not even
  -- on a question_id collision: equivalence needs an explicit mapping.
  ans as (select a.question_id from public.assessment_answers a, known
           where a.order_id = p_order_id
             and known.catalog_known
             and a.answer_value is not null
             and a.answer_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)),
  missing as (select question_id from req except select question_id from ans)
  select jsonb_build_object(
    'order_id', p_order_id,
    'is_psd', (select lower(coalesce(letter_type,'')) = 'psd' from o),
    'required_total', (select count(*) from req),
    'answered', (select count(*) from req) - (select count(*) from missing),
    'missing_count', (select count(*) from missing),
    'missing', coalesce((select jsonb_agg(question_id order by question_id) from missing), '[]'::jsonb),
    'complete', ((select count(*) from missing) = 0 and (select count(*) from req) > 0),
    'unmapped_version', (select not catalog_known from known),
    'judged_version', (select v from eff));
$function$;

comment on function public.psd_assessment_status(uuid) is
  'Canonical PSD assessment completeness for one order. Requirement set comes '
  'from psd_assessment_questions at the order''s own stored answer version; a '
  'stored version absent from the catalog (e.g. the partner intake constant) '
  'is judged against the canonical current version with NOTHING counted as '
  'answered — unmapped_version=true names the reason. Fail-closed everywhere: '
  'complete demands required_total > 0 and zero missing.';
