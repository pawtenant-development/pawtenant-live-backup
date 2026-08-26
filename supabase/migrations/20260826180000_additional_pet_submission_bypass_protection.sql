-- ADDITIONAL-PET-SUBMISSION-BYPASS-PROTECTION-001  (LIVE port of TEST b11c558)
--
-- THE BYPASS THIS CLOSES (observed on LIVE, order PT-MT961EGI, 2026-08-26).
--
-- provider_submit_document_slot lets a provider replace a delivered letter when
-- `v_reopened or v_addpet`. `v_reopened` is derived from orders.last_reopened_at,
-- a PERSISTENT timestamp: once an admin manually returns a completed order to
-- Under Review, that flag stays true forever (restoring the order to Completed
-- does NOT clear it — measured on LIVE). So while an Additional Pet review was
-- still awaiting a clinical decision, the assigned provider could submit an
-- ORDINARY replacement letter that:
--   • created a new document version with a NULL pet_snapshot,
--   • left the Additional Pet request untouched (still awaiting review), and
--   • could physically name the added pet with NO recorded clinical approval.
-- The manual reopen therefore bypassed the Additional Pet workflow entirely.
--
--   §1 provider_submit_document_slot refuses an ESA/PSD letter submission while
--      an Additional Pet review is actively awaiting a provider decision. The
--      refusal is evaluated BEFORE and INDEPENDENTLY of the reopen flag, so a
--      manual reopen cannot unlock it. The only way through is to record the
--      decision via provider-additional-pet-decision, which keeps that function
--      the canonical clinical authorization.
--
--      Blocking statuses are exactly those where a decision is OWED BY THE
--      ASSIGNED REVIEWER: pending_provider_review, clarification_requested,
--      resubmitted. `needs_reassignment` deliberately does NOT block: nobody
--      owns that review until an admin reassigns it, and blocking it would
--      strand the customer's base letter behind an unrelated queue.
--      `approved_pending_document` does NOT block — that is the state that
--      legitimately owes the revision, and §2 then forces it to carry a snapshot.
--
--   §2 A document version that fulfils an APPROVED Additional Pet request can
--      never be written with a NULL pet snapshot.
--
-- LIVE PORT NOTE — WHY §1 IS A DYNAMIC REBUILD.
-- The rule for cross-repo DB work in this codebase is: rewrite a function from
-- its OWN pg_get_functiondef, never paste a body between repos. This migration
-- does exactly that mechanically: it reads THIS database's current definition,
-- injects the gate at a verified-unique anchor, and executes the result. No
-- byte of LIVE's body is retyped, so unrelated LIVE drift inside that function
-- is preserved by construction. Every assumption is asserted before anything
-- runs, and re-running is a no-op.

-- ── §1 · submission gate, injected into THIS database's own definition ──────

do $do$
declare
  v_def      text;
  v_new      text;
  v_declare  text := '  v_addpet     boolean := false;';
  v_anchor   text := '  select * into v_approved';
  v_gate     text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provider_submit_document_slot';

  if v_def is null then
    raise exception 'bypass-protection: provider_submit_document_slot not found on this database';
  end if;

  -- Idempotent: already ported.
  if position('additional_pet_review_pending' in v_def) > 0 then
    raise notice 'bypass-protection: gate already present - nothing to do';
    return;
  end if;

  -- Anchors must be unique, or the injection point is ambiguous.
  if (length(v_def) - length(replace(v_def, v_declare, ''))) / length(v_declare) <> 1 then
    raise exception 'bypass-protection: declare anchor is not unique';
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'bypass-protection: body anchor is not unique';
  end if;

  -- The gate must land AFTER the replay short-circuit (so a retried submission
  -- stays an idempotent no-op) and BEFORE the delivered-document/reopen branch.
  if position(v_anchor in v_def) < position('identical_submission_already_pending' in v_def) then
    raise exception 'bypass-protection: body anchor precedes the replay short-circuit';
  end if;
  if position(v_anchor in v_def) > position('v_reopened :=' in v_def) then
    raise exception 'bypass-protection: body anchor follows the reopen computation';
  end if;

  v_gate := $gate$  -- ADDITIONAL-PET-SUBMISSION-BYPASS-PROTECTION-001 §1.
  --
  -- Evaluated here, BEFORE the delivered-document/reopen branch below, and it
  -- reads NEITHER v_reopened NOR orders.last_reopened_at. A manual reopen
  -- therefore cannot unlock this path: the clinical decision must be recorded
  -- first, through provider-additional-pet-decision. Placed AFTER the replay
  -- short-circuit so a retried submission stays an idempotent no-op.
  if p_doc_type in ('esa_letter', 'psd_letter') then
    select exists (
      select 1 from public.order_additional_pet_requests
       where order_id = p_order_id
         and status in ('pending_provider_review', 'clarification_requested', 'resubmitted')
    ) into v_review_due;

    if v_review_due then
      return jsonb_build_object(
        'created',                 false,
        'replayed',                false,
        'rejected',                true,
        'document_id',             null,
        'file_url',                null,
        'review_status',           null,
        'superseded_document_ids', '[]'::jsonb,
        'superseded_count',        0,
        'reason',                  'additional_pet_review_pending');
    end if;
  end if;

$gate$;

  v_new := replace(v_def, v_declare, v_declare || chr(10) || '  v_review_due boolean := false;');
  v_new := replace(v_new, v_anchor, v_gate || v_anchor);

  execute v_new;

  -- Post-conditions: the gate is in, and it is in the right place.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provider_submit_document_slot';

  if position('additional_pet_review_pending' in v_def) = 0 then
    raise exception 'bypass-protection: gate did not land';
  end if;
  if position('additional_pet_review_pending' in v_def) > position('v_reopened :=' in v_def) then
    raise exception 'bypass-protection: gate landed AFTER the reopen branch';
  end if;
  if position('additional_pet_review_pending' in v_def) < position('identical_submission_already_pending' in v_def) then
    raise exception 'bypass-protection: gate landed BEFORE the replay short-circuit';
  end if;
end
$do$;

-- ── §2 · an approved add-on's version must carry a pet snapshot ─────────────
-- Structural backstop for the snapshot builder: if the order has an Additional
-- Pet request that has been APPROVED and is awaiting its document, then any
-- letter version created for that order must state the pets it covers. A null
-- snapshot there is precisely the silent-drop failure this task exists to
-- prevent, so it is refused at the table rather than trusted to a caller.

create or replace function public.tg_document_version_requires_pet_snapshot()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if new.doc_type in ('esa_letter', 'psd_letter')
     and new.pet_snapshot is null
     and exists (
       select 1 from public.order_additional_pet_requests r
        where r.order_id = new.order_id
          and r.status = 'approved_pending_document')
  then
    raise exception
      'order_document_versions: a letter version fulfilling an approved Additional Pet request must carry a pet snapshot (order=%)',
      new.order_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_document_version_requires_pet_snapshot on public.order_document_versions;
create trigger trg_document_version_requires_pet_snapshot
  before insert on public.order_document_versions
  for each row execute function public.tg_document_version_requires_pet_snapshot();

comment on function public.tg_document_version_requires_pet_snapshot() is
  'ADDITIONAL-PET-SUBMISSION-BYPASS-PROTECTION-001 §2: a letter version that '
  'fulfils an approved Additional Pet request must carry a pet snapshot. '
  'Enforced at the table so no caller can write a silent null.';
