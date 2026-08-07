-- PSD-CHECKOUT-CANONICAL-ANSWER-GATE-LIVE-INCIDENT-002
--
-- COMPATIBILITY REPAIR: canonical per-answer rows from a complete legacy
-- projection.
--
-- The canonical answer model shipped with its payment gate but, on LIVE, without
-- the writer that populates it: `get-resume-order` never minted the autosave
-- credential, so the browser had nothing to authorise per-answer saves with and
-- `assessment_answers` stayed empty. The customer still completed all 16
-- questions and the lead-save still wrote them into `orders.assessment_answers`.
-- The gate then read 0/16 from the authoritative table and refused payment.
--
-- This repairs the RECORD, not the ANSWERS. Every value written here is a value
-- the customer already submitted and which is already stored on the order. It
-- invents nothing:
--
--   * blanks are never promoted — a blank is the absence of an answer, and a row
--     for one would make an unstarted assessment look attempted;
--   * an order is only repaired when EVERY required question for the version it
--     was actually asked is present and non-blank, so an incomplete assessment
--     can never be repaired into a complete one;
--   * `on conflict do nothing` means a newer canonical answer always wins — a
--     repair can only ever fill a hole, never overwrite a real save;
--   * paid orders are refused: the record is already settled and a provider may
--     have acted on it.
--
-- Rows are stamped `source_step = 'projection_repair'` so this is auditable and
-- distinguishable from a genuine autosave or the one-shot backfill.
--
-- VERSIONING. Completion is judged against the form the customer actually saw.
-- The canonical rule (from `psd_legacy_assessment_version`) is that an order was
-- asked the safety question iff the key exists on its record — so key present =>
-- psd_v1 (16 required), key absent => psd_v0_legacy (15 required). Counting
-- object keys is NOT completeness: a fully blanked record still has 24 keys.

create or replace function public.psd_repair_answers_from_projection(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_letter   text;
  v_paid     timestamptz;
  v_pj       jsonb;
  v_ver      text;
  v_required integer;
  v_proj_ok  integer;
  v_inserted integer;
begin
  -- Lock the order for the duration: the repair decision and the write must not
  -- straddle a concurrent autosave that is filling the same holes.
  select lower(coalesce(letter_type, '')), paid_at, coalesce(assessment_answers, '{}'::jsonb)
    into v_letter, v_paid, v_pj
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    return jsonb_build_object('repaired', false, 'reason', 'order_not_found');
  end if;
  if v_letter <> 'psd' then
    return jsonb_build_object('repaired', false, 'reason', 'not_psd');
  end if;
  if v_paid is not null then
    return jsonb_build_object('repaired', false, 'reason', 'already_paid');
  end if;
  -- A non-object projection is malformed, not empty. Refuse rather than guess.
  if jsonb_typeof(v_pj) <> 'object' then
    return jsonb_build_object('repaired', false, 'reason', 'projection_malformed');
  end if;

  v_ver := case when v_pj ? 'safetyCheck' then 'psd_v1' else 'psd_v0_legacy' end;

  select count(*) into v_required
    from public.psd_assessment_questions
   where assessment_version = v_ver and required;

  if v_required = 0 then
    return jsonb_build_object('repaired', false, 'reason', 'no_registry_for_version',
                              'assessment_version', v_ver);
  end if;

  -- How many REQUIRED questions the projection genuinely answers.
  select count(*) into v_proj_ok
    from public.psd_assessment_questions q
   where q.assessment_version = v_ver
     and q.required
     and v_pj ? q.question_id
     and (v_pj -> q.question_id) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);

  -- Fail closed. A partial projection is a partial assessment and must keep
  -- blocking payment.
  if v_proj_ok < v_required then
    return jsonb_build_object('repaired', false, 'reason', 'projection_incomplete',
                              'assessment_version', v_ver,
                              'required', v_required, 'projection_ok', v_proj_ok);
  end if;

  -- Promote every genuinely-answered question for this version (required and
  -- optional alike), mirroring the original backfill's mapping exactly:
  -- question_id IS the projection key.
  insert into public.assessment_answers
    (order_id, assessment_version, question_id, question_version,
     answer_value, source_step, answered_at, updated_at)
  select p_order_id, v_ver, q.question_id, q.question_version,
         v_pj -> q.question_id, 'projection_repair', now(), now()
    from public.psd_assessment_questions q
   where q.assessment_version = v_ver
     and v_pj ? q.question_id
     and (v_pj -> q.question_id) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
  on conflict (order_id, question_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Refresh `assessment_progress` so Admin stops showing a repaired order as
  -- unstarted. This merges canonical OVER the projection, and every value here
  -- came FROM the projection, so the stored answers are unchanged by it.
  perform public.psd_reproject_answers(p_order_id);

  return jsonb_build_object('repaired', v_inserted > 0, 'reason', 'ok',
                            'inserted', v_inserted,
                            'assessment_version', v_ver,
                            'required', v_required);
end;
$$;

-- The default grant is to PUBLIC, and "revoke from public" does not undo the
-- role-named grants. Revoke each by name.
revoke all on function public.psd_repair_answers_from_projection(uuid) from public;
revoke all on function public.psd_repair_answers_from_projection(uuid) from anon;
revoke all on function public.psd_repair_answers_from_projection(uuid) from authenticated;
grant execute on function public.psd_repair_answers_from_projection(uuid) to service_role;

comment on function public.psd_repair_answers_from_projection(uuid) is
  'PSD-CHECKOUT-CANONICAL-ANSWER-GATE-LIVE-INCIDENT-002: rebuild missing canonical answer rows from an order''s own already-submitted projection. Validated, fail-closed, never overwrites a newer answer, service_role only.';
