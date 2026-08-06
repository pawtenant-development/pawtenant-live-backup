-- 20260806140000_psd_assessment_answer_model.sql
--
-- PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001
--
-- THE PROBLEM THIS MODEL SOLVES
-- -----------------------------
-- Clinical answers lived in exactly one place — a single JSONB blob on `orders`
-- that the client rewrote wholesale on one submit at the end of the flow. That
-- gave one client, at one moment, total authority over a customer's entire
-- mental-health intake. A resume path that reset the client's memory was enough
-- to erase it (LIVE order PT-PSDCUFKXQ61: 22 answered fields -> 3).
--
-- The authoritative record is now ONE ROW PER ANSWER. Saving an answer touches
-- only that answer's row, so there is no payload in the system that is capable
-- of erasing the others — the blast radius of any single write is one question.
--
-- `orders.assessment_answers` is still maintained, unchanged in shape, because
-- providers and Admin read it. It is now a PROJECTION built server-side from the
-- authoritative rows, never the source of truth.

-- ── 1. Required-question registry ────────────────────────────────────────────
-- Completion must be decided by the SERVER. A disabled button in React is a
-- courtesy, not a gate: anything can POST to the API. This table is what
-- checkout, payment and provider assignment actually consult.
create table if not exists public.psd_assessment_questions (
  assessment_version text    not null,
  question_id        text    not null,
  question_version   integer not null default 1,
  required           boolean not null default true,
  sort_order         integer not null default 0,
  primary key (assessment_version, question_id)
);

alter table public.psd_assessment_questions enable row level security;
revoke all on table public.psd_assessment_questions from public, anon, authenticated;
-- Readable by the app for progress display; never writable by a client.
grant select on table public.psd_assessment_questions to anon, authenticated;
drop policy if exists psd_questions_readable on public.psd_assessment_questions;
create policy psd_questions_readable on public.psd_assessment_questions for select using (true);

comment on table public.psd_assessment_questions is
  'Server-authoritative list of PSD questions per assessment version. Completion gates read this, never the client.';

-- v1 mirrors psd-assessment/components/PSDStep1.tsx REQUIRED exactly (16 items).
insert into public.psd_assessment_questions (assessment_version, question_id, sort_order, required) values
  ('psd_v1','safetyCheck',         1,  true),
  ('psd_v1','dogTasks',            2,  true),
  ('psd_v1','taskTraining',        3,  true),
  ('psd_v1','taskDescription',     4,  true),
  ('psd_v1','taskReliability',     5,  true),
  ('psd_v1','taskPublicAccess',    6,  true),
  ('psd_v1','dogDuration',         7,  true),
  ('psd_v1','emotionalFrequency',  8,  true),
  ('psd_v1','conditions',          9,  true),
  ('psd_v1','lifeChangeStress',   10,  true),
  ('psd_v1','dailyImpact',        11,  true),
  ('psd_v1','medication',         12,  true),
  ('psd_v1','priorDiagnosis',     13,  true),
  ('psd_v1','currentTreatment',   14,  true),
  ('psd_v1','dogHelpDescription', 15,  true),
  ('psd_v1','housingType',        16,  true),
  -- Conditional follow-ups. Captured and versioned, but never gate checkout:
  -- they only apply when a parent answer selects them.
  ('psd_v1','medicationDetails',  17, false),
  ('psd_v1','specificDiagnosis',  18, false),
  ('psd_v1','treatmentDetails',   19, false),
  ('psd_v1','taskEvidenceUrl',    20, false),
  ('psd_v1','taskEvidenceType',   21, false)
on conflict (assessment_version, question_id) do nothing;

-- ── 2. Authoritative per-answer rows ─────────────────────────────────────────
create table if not exists public.assessment_answers (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  assessment_version text not null default 'psd_v1',
  question_id        text not null,
  question_version   integer not null default 1,
  -- jsonb so a multi-select array and a scalar share one column honestly.
  answer_value       jsonb not null,
  source_step        text,
  answered_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Optimistic concurrency. Every accepted write bumps this; a writer holding an
  -- older revision is refused. Two tabs, or a slow request overtaken by a newer
  -- one, cannot silently undo a customer's later answer.
  revision           bigint  not null default 1,
  unique (order_id, question_id)
);

create index if not exists assessment_answers_order_idx on public.assessment_answers (order_id);

alter table public.assessment_answers enable row level security;
-- No policies: RLS with zero policies denies every role except service_role,
-- which bypasses it. Clinical answers are reachable ONLY through the
-- SECURITY DEFINER RPCs below, which bind every call to a specific order.
revoke all on table public.assessment_answers from public, anon, authenticated;

comment on table public.assessment_answers is
  'Authoritative PSD clinical answers, one row per question. orders.assessment_answers is a projection of this. Service-role only.';

-- ── 3. Progress metadata on the order ────────────────────────────────────────
-- Distinguishes "never started" from "in progress" from "save failing" — the
-- distinction Admin could not previously make, which is why a customer who had
-- genuinely attempted the assessment showed as "No questionnaire answers".
alter table public.orders
  add column if not exists assessment_progress jsonb;

comment on column public.orders.assessment_progress is
  'Server-maintained PSD progress: version, required_total, required_answered, pct, complete, timestamps, last save failure. Never written by a client.';

-- ── 4. Projection + progress recompute ───────────────────────────────────────
-- Rebuilds orders.assessment_answers from the authoritative rows, PRESERVING
-- every non-clinical key already there (pets, dob, letterType,
-- stateAcknowledgment, additionalDocs...). Those are owned by other steps and
-- this must never drop them.
create or replace function public.psd_reproject_answers(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_existing  jsonb;
  v_clinical  jsonb;
  v_version   text;
  v_required  integer;
  v_answered  integer;
  v_progress  jsonb;
begin
  select coalesce(assessment_answers, '{}'::jsonb) into v_existing
    from public.orders where id = p_order_id;

  select coalesce(jsonb_object_agg(question_id, answer_value), '{}'::jsonb),
         coalesce(max(assessment_version), 'psd_v1')
    into v_clinical, v_version
    from public.assessment_answers where order_id = p_order_id;

  -- Clinical answers overlay the existing object; non-clinical keys survive.
  update public.orders
     set assessment_answers = v_existing || v_clinical
   where id = p_order_id;

  select count(*) into v_required
    from public.psd_assessment_questions
   where assessment_version = v_version and required;

  select count(*) into v_answered
    from public.assessment_answers a
    join public.psd_assessment_questions q
      on q.assessment_version = a.assessment_version
     and q.question_id = a.question_id and q.required
   where a.order_id = p_order_id
     and a.answer_value is not null
     and a.answer_value <> 'null'::jsonb
     and a.answer_value <> '""'::jsonb
     and a.answer_value <> '[]'::jsonb;

  v_progress := jsonb_build_object(
    'assessment_version', v_version,
    'required_total',     v_required,
    'required_answered',  v_answered,
    'pct',                case when v_required > 0
                               then round((v_answered::numeric / v_required) * 100)::int
                               else 0 end,
    'complete',           (v_required > 0 and v_answered >= v_required),
    'last_saved_at',      now()
  );

  update public.orders
     set assessment_progress =
           coalesce(assessment_progress, '{}'::jsonb) || v_progress
   where id = p_order_id;

  return v_progress;
end;
$$;

revoke all on function public.psd_reproject_answers(uuid) from public, anon, authenticated;

-- ── 5. Atomic single-answer save ─────────────────────────────────────────────
-- The one write path for a clinical answer. Touches exactly one question's row,
-- so no call can affect any other answer.
--
-- Stale-write protection: a caller passes the revision it last saw. If the
-- stored revision has moved on, the write is REFUSED and the current value is
-- returned so the caller can reconcile. Passing null opts out (first write).
create or replace function public.psd_save_answer(
  p_order_id          uuid,
  p_question_id       text,
  p_answer_value      jsonb,
  p_client_revision   bigint default null,
  p_assessment_version text default 'psd_v1',
  p_source_step       text default 'psd_step1'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_existing  public.assessment_answers%rowtype;
  v_qversion  integer;
  v_new_rev   bigint;
  v_progress  jsonb;
begin
  if p_order_id is null or p_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'order_id and question_id are required');
  end if;

  -- Refuse unknown questions outright: an unregistered key is either a bug or a
  -- probe, and either way it must not land in a clinical record.
  select question_version into v_qversion
    from public.psd_assessment_questions
   where assessment_version = p_assessment_version and question_id = p_question_id;
  if v_qversion is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_question', 'question_id', p_question_id);
  end if;

  -- The order must still be open for editing. A paid/completed/cancelled order
  -- must not have its clinical record rewritten from the assessment UI.
  if not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.paid_at is null
       and coalesce(o.status,'') not in ('completed','cancelled','refunded','archived')
  ) then
    return jsonb_build_object('ok', false, 'error', 'order_not_editable');
  end if;

  select * into v_existing from public.assessment_answers
   where order_id = p_order_id and question_id = p_question_id
   for update;

  if found and p_client_revision is not null and p_client_revision < v_existing.revision then
    -- A slower request carrying an older view lost the race. Return the winner
    -- rather than applying the stale value.
    return jsonb_build_object(
      'ok', false, 'error', 'stale_revision',
      'question_id', p_question_id,
      'current_revision', v_existing.revision,
      'current_value', v_existing.answer_value);
  end if;

  insert into public.assessment_answers
    (order_id, assessment_version, question_id, question_version, answer_value, source_step)
  values
    (p_order_id, p_assessment_version, p_question_id, v_qversion, p_answer_value, p_source_step)
  on conflict (order_id, question_id) do update
    set answer_value     = excluded.answer_value,
        assessment_version = excluded.assessment_version,
        question_version = excluded.question_version,
        source_step      = excluded.source_step,
        updated_at       = now(),
        revision         = public.assessment_answers.revision + 1
  returning revision into v_new_rev;

  v_progress := public.psd_reproject_answers(p_order_id);

  return jsonb_build_object(
    'ok', true,
    'question_id', p_question_id,
    'revision', v_new_rev,
    'saved_at', now(),
    'progress', v_progress);
end;
$$;

revoke all on function public.psd_save_answer(uuid, text, jsonb, bigint, text, text) from public, anon, authenticated;

-- ── 6. Server-authoritative completion status ────────────────────────────────
-- The single predicate every gate consults. Returns the missing question ids so
-- Admin can say WHICH answers are absent instead of just "incomplete".
create or replace function public.psd_assessment_status(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with o as (select id, letter_type, assessment_progress from public.orders where id = p_order_id),
  ver as (select coalesce((select assessment_version from public.assessment_answers
                            where order_id = p_order_id limit 1), 'psd_v1') as v),
  req as (select q.question_id from public.psd_assessment_questions q, ver
           where q.assessment_version = ver.v and q.required),
  ans as (select a.question_id from public.assessment_answers a
           where a.order_id = p_order_id
             and a.answer_value is not null
             and a.answer_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)),
  missing as (select question_id from req except select question_id from ans)
  select jsonb_build_object(
    'order_id',        p_order_id,
    'is_psd',          (select lower(coalesce(letter_type,'')) = 'psd' from o),
    'required_total',  (select count(*) from req),
    'answered',        (select count(*) from req) - (select count(*) from missing),
    'missing_count',   (select count(*) from missing),
    'missing',         coalesce((select jsonb_agg(question_id order by question_id) from missing), '[]'::jsonb),
    'complete',        ((select count(*) from missing) = 0 and (select count(*) from req) > 0)
  );
$$;

revoke all on function public.psd_assessment_status(uuid) from public;
revoke all on function public.psd_assessment_status(uuid) from anon;
-- Admin/staff read it through the portal; it exposes counts and question IDS
-- only, never answer values.
grant execute on function public.psd_assessment_status(uuid) to authenticated;

comment on function public.psd_assessment_status(uuid) is
  'Server-authoritative PSD completion check. Returns counts and MISSING QUESTION IDS ONLY — never answer values.';

-- ── 7. Backfill from existing orders ─────────────────────────────────────────
-- Every PSD order that already holds real clinical answers gets authoritative
-- rows, so Admin/provider views and the gates agree from day one. Blank values
-- are deliberately NOT backfilled: a blank is the absence of an answer, and
-- writing rows for them would make an unstarted assessment look attempted.
insert into public.assessment_answers
  (order_id, assessment_version, question_id, question_version, answer_value, source_step, answered_at, updated_at)
select o.id, 'psd_v1', q.question_id, q.question_version,
       o.assessment_answers -> q.question_id, 'backfill', o.created_at, now()
from public.orders o
join public.psd_assessment_questions q on q.assessment_version = 'psd_v1'
where lower(coalesce(o.letter_type,'')) = 'psd'
  and o.assessment_answers ? q.question_id
  and (o.assessment_answers -> q.question_id) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
on conflict (order_id, question_id) do nothing;

-- Prime progress for every PSD order, including the ones with nothing to
-- backfill — an explicit "0 of 16" is the signal Admin was missing.
do $$
declare r record;
begin
  for r in select id from public.orders where lower(coalesce(letter_type,'')) = 'psd' loop
    perform public.psd_reproject_answers(r.id);
  end loop;
end $$;
