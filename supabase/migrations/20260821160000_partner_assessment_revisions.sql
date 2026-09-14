-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part C
-- API-mediated partner assessment revisions: immutable, linked versions.
--
-- MODEL
--   * The accepted snapshot (partner_assessment_snapshots revision 1 + the
--     verbatim raw submission) is NEVER updated or deleted — the existing
--     immutability triggers stay in force, untouched.
--   * A revision INSERTS revision N+1: a complete, re-validated canonical
--     payload with its own source hash, its own verbatim raw record, an
--     explicit reason, and prior_snapshot_id linking it to the version it
--     supersedes. Supersession is DERIVED (current = max revision) — nothing
--     is ever marked, so nothing immutable is ever touched.
--   * The canonical working answers (assessment_answers — UNIQUE per
--     order+question) are re-materialized from the new complete payload. The
--     one canonical completeness gate (psd_assessment_status) then re-evaluates
--     them natively. Nothing here approves, rejects or advances the order.
--
-- ALLOWED / FORBIDDEN STATES (documented contract)
--   allowed:   accepted, not yet assigned to a provider, not completed, not
--              cancelled — and only for canonical-contract (PSD) submissions,
--              which are the ones that HAVE a snapshot chain.
--   forbidden: assigned / completed / cancelled (fail closed: an explicit
--              administrative + clinical review path is required once a
--              provider may have read the answers), ESA generic-contract
--              orders (no canonical schema to re-validate — support-mediated),
--              cross-partner references (not_found), duplicate versions
--              (same content → replay, never a new version).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Version columns (additive; existing rows become revision 1)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.partner_assessment_snapshots
  add column if not exists revision integer not null default 1,
  add column if not exists prior_snapshot_id uuid references public.partner_assessment_snapshots(id),
  add column if not exists revision_reason text;

-- One snapshot per order becomes one snapshot per (order, revision).
alter table public.partner_assessment_snapshots
  drop constraint if exists partner_assessment_snapshots_order_id_key;
create unique index if not exists partner_assessment_snapshots_order_revision_key
  on public.partner_assessment_snapshots (order_id, revision);

alter table private.partner_raw_submissions
  add column if not exists revision integer not null default 1;

alter table private.partner_raw_submissions
  drop constraint if exists partner_raw_submissions_order_id_key;
create unique index if not exists partner_raw_submissions_order_revision_key
  on private.partner_raw_submissions (order_id, revision);

-- The idempotency ledger predates revisions: its outcome vocabulary gains the
-- revision outcome (Slice 2's accepted/rejected rows are untouched).
alter table private.partner_api_requests
  drop constraint if exists partner_api_req_outcome_valid;
alter table private.partner_api_requests
  add constraint partner_api_req_outcome_valid
  check (outcome in ('accepted', 'rejected', 'revision_accepted'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The revision RPC — the only write path
-- ═══════════════════════════════════════════════════════════════════════════
-- Called exclusively by partner-orders-v1 (service role) AFTER full canonical
-- contract validation of the complete replacement payload. Everything here is
-- one transaction: the snapshot, the raw record and the re-materialized
-- answers land together or not at all.

create or replace function public.partner_revise_assessment(
  p_partner_id uuid,
  p_partner_order_id text,
  p_answers jsonb,
  p_payload jsonb,
  p_payload_hash text,
  p_schema_version text,
  p_reason text,
  p_idempotency_key text,
  p_request_id text
)
returns table(revision integer, snapshot_id uuid, replayed boolean, accepted_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_order    public.orders%rowtype;
  v_current  public.partner_assessment_snapshots%rowtype;
  v_new_rev  integer;
  v_new_id   uuid;
  v_target   text;
  v_key      text;
  v_value    jsonb;
  v_catalog  text[];
begin
  if coalesce(p_reason, '') = '' then
    raise exception 'revision_reason_required' using errcode = '22023';
  end if;

  -- TENANT ISOLATION: partner_id is part of the lookup predicate. Another
  -- partner's reference is indistinguishable from a nonexistent one.
  select * into v_order from public.orders
   where partner_id = p_partner_id and partner_order_id = p_partner_order_id
   for update;
  if not found then
    raise exception 'revision_not_found' using errcode = 'P0002';
  end if;

  -- FAIL-CLOSED STATE GATE. Once a provider may have read the answers, an API
  -- write may not silently change them under the review.
  if v_order.status = 'cancelled' then
    raise exception 'revision_locked_cancelled' using errcode = '23514';
  end if;
  if v_order.doctor_status = 'patient_notified' or v_order.partner_clinical_completed_at is not null then
    raise exception 'revision_locked_completed' using errcode = '23514';
  end if;
  if v_order.doctor_user_id is not null or v_order.doctor_email is not null then
    raise exception 'revision_locked_assigned' using errcode = '23514';
  end if;

  -- Canonical-contract orders only: the snapshot chain IS the revision model.
  select * into v_current from public.partner_assessment_snapshots
   where order_id = v_order.id
   order by public.partner_assessment_snapshots.revision desc
   limit 1;
  if not found then
    raise exception 'revision_unsupported_for_service' using errcode = '23514';
  end if;

  -- Replay safety inside the transaction: identical content can never mint a
  -- duplicate version, whatever idempotency key it arrives under.
  if v_current.source_payload_hash = p_payload_hash then
    return query select v_current.revision, v_current.id, true, v_current.accepted_at;
    return;
  end if;

  v_target  := v_current.target_assessment_version;
  v_new_rev := v_current.revision + 1;

  insert into public.partner_assessment_snapshots (
    order_id, partner_id, partner_order_id,
    source_schema_version, target_assessment_version, normalization_version,
    source_payload_hash, question_ids, revision, prior_snapshot_id, revision_reason,
    created_by
  ) values (
    v_order.id, p_partner_id, p_partner_order_id,
    p_schema_version, v_target, v_current.normalization_version,
    p_payload_hash,
    coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) as k), '[]'::jsonb),
    v_new_rev, v_current.id, p_reason,
    'partner-orders-v1:revision'
  ) returning id into v_new_id;

  insert into private.partner_raw_submissions (
    order_id, partner_id, partner_order_id, schema_version, payload, payload_hash, revision
  ) values (
    v_order.id, p_partner_id, p_partner_order_id, p_schema_version, p_payload, p_payload_hash, v_new_rev
  );

  -- Re-materialize the canonical working answers from the COMPLETE new
  -- payload. The canonical completeness gate re-evaluates these natively; no
  -- status column moves here.
  for v_key, v_value in
    select key, value from jsonb_each(coalesce(p_answers, '{}'::jsonb))
  loop
    insert into public.assessment_answers
      (order_id, assessment_version, question_id, answer_value, source_step, answered_at, revision)
    values (v_order.id, v_target, v_key, v_value, 'partner_api_revision', now(), v_new_rev)
    on conflict (order_id, question_id) do update
      set answer_value = excluded.answer_value,
          assessment_version = excluded.assessment_version,
          source_step = excluded.source_step,
          answered_at = excluded.answered_at,
          revision = excluded.revision;
  end loop;

  -- A canonical answer the new complete payload no longer carries (an optional
  -- question that was withdrawn) must not survive as a stale row. Partner-
  -- sourced canonical rows only — nothing else is ever touched.
  select coalesce(array_agg(question_id), '{}') into v_catalog
    from public.psd_assessment_questions where assessment_version = v_target;
  delete from public.assessment_answers a
   where a.order_id = v_order.id
     and a.assessment_version = v_target
     and a.source_step like 'partner_api%'
     and a.question_id = any(v_catalog)
     and not (coalesce(p_answers, '{}'::jsonb) ? a.question_id);

  -- Keep the order's legacy jsonb copy coherent: meta keys survive, canonical
  -- answer keys are replaced wholesale by the new payload.
  update public.orders
     set assessment_answers = (coalesce(assessment_answers, '{}'::jsonb) - v_catalog) || coalesce(p_answers, '{}'::jsonb)
   where id = v_order.id;

  insert into private.partner_api_requests (
    partner_id, idempotency_key, request_hash, partner_order_id, order_id, outcome, response_code, http_status)
  values (p_partner_id, p_idempotency_key, p_payload_hash, p_partner_order_id, v_order.id,
          'revision_accepted', 'revision_accepted', 201)
  on conflict (partner_id, idempotency_key) do nothing;

  return query select v_new_rev, v_new_id, false, now()::timestamptz;
end;
$function$;

revoke all on function public.partner_revise_assessment(uuid, text, jsonb, jsonb, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.partner_revise_assessment(uuid, text, jsonb, jsonb, text, text, text, text, text)
  to service_role;
