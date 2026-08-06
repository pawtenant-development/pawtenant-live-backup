-- 20260806160000_psd_legacy_assessment_version.sql
--
-- PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001 — assessment versioning.
--
-- The first cut registered ONE required set (psd_v1, 16 questions) and applied
-- it to every historical order. That is retroactive: 42 orders — 28 of them
-- already PAID and delivered — were completed under a 15-question form that had
-- no `safetyCheck` question at all, and were therefore reported as "required
-- answers missing" for a question nobody ever asked them.
--
-- Left alone this would have shown Admin 42 false "incomplete" orders and, for
-- any still unpaid, blocked checkout on an unanswerable question. Completion has
-- to be judged against the form the customer ACTUALLY saw, which is the entire
-- reason the model carries an assessment_version at all.
insert into public.psd_assessment_questions (assessment_version, question_id, sort_order, required)
select 'psd_v0_legacy', question_id, sort_order, required
from public.psd_assessment_questions
where assessment_version = 'psd_v1' and question_id <> 'safetyCheck'
on conflict (assessment_version, question_id) do nothing;

-- An order was asked the safety question iff the key exists on its record.
-- Absent key => it predates the question => judge it against v0.
update public.assessment_answers a
   set assessment_version = 'psd_v0_legacy'
  from public.orders o
 where o.id = a.order_id
   and lower(coalesce(o.letter_type,'')) = 'psd'
   and not (o.assessment_answers ? 'safetyCheck');

do $$
declare r record;
begin
  for r in select id from public.orders where lower(coalesce(letter_type,'')) = 'psd' loop
    perform public.psd_reproject_answers(r.id);
  end loop;
end $$;
