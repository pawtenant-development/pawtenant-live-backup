-- ADMIN-ORDER-CUSTOMER-PET-EDITING-LIVE-001 · 2026-08-29 · LIVE-specific adaptation
--
-- OWNER REQUIREMENT (LIVE promotion): "Preserve every existing pet field,
-- including unknown/additional fields, during edits."
--
-- The TEST implementation rebuilds each pet row from the canonical key set and
-- DROPS anything else. That is the right default on TEST, where the canonical
-- contract (step1/PetSection.ts) is the only writer. On LIVE the assessment
-- restructure was never promoted, so the canonical shape is whatever
-- orders.assessment_answers.pets[] already holds — today exactly
-- {name, type, breed, age, weight} across all 2,438 stored pet objects, but an
-- admin correction must never be the thing that silently deletes a field this
-- editor did not know about.
--
-- The rule this file installs:
--
--   result = (STORED extras) || (SUBMITTED extras) || (validated canonical)
--
--   * STORED extras come from the row already on the order, so a client that
--     simply does not echo a key back cannot destroy it.
--   * SUBMITTED extras are kept too, so a future field starts round-tripping
--     the moment something writes it. The caller is already proven to be an
--     authorised admin (is_admin_staff() is checked before any of this runs),
--     so this grants no capability the caller did not already have.
--   * The validated canonical fields ALWAYS win — an extra key can never
--     shadow name/type/breed/age/weight.
--
-- Deliberate TEST/LIVE divergence, recorded here so nobody "fixes" it by
-- copying the TEST body over. Everything else about the function is unchanged.
--
-- Idempotent: re-running the file is a no-op.

-- ── 1. Two-argument normaliser ──────────────────────────────────────────────
-- The second argument defaults to '{}', so the existing 1-arg call sites keep
-- compiling and keep their old (drop-extras) behaviour until they opt in.

create or replace function public.normalize_order_pet_row(
  p_pet   jsonb,
  p_prior jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v jsonb := '{}'::jsonb;
  v_extra jsonb;
  -- Every key this editor understands. Anything NOT in here is an "extra" and
  -- is carried through untouched.
  v_canonical constant text[] := array[
    'name','type','breed','age','weight',
    'petId','vaccinated','supportFunctions','supportNarrative'];
  v_name  text := btrim(coalesce(p_pet ->> 'name', ''));
  v_type  text := btrim(coalesce(p_pet ->> 'type', ''));
  v_breed text := btrim(coalesce(p_pet ->> 'breed', ''));
  v_age   text := btrim(coalesce(p_pet ->> 'age', ''));
  v_wt    text := btrim(coalesce(p_pet ->> 'weight', ''));
  v_pid   text := btrim(coalesce(p_pet ->> 'petId', ''));
  v_narr  text := btrim(coalesce(p_pet ->> 'supportNarrative', ''));
begin
  if p_pet is null or jsonb_typeof(p_pet) <> 'object' then
    raise exception 'pet row must be a JSON object' using errcode = 'check_violation';
  end if;
  if v_name = '' then
    raise exception 'Every pet needs a name.' using errcode = 'check_violation';
  end if;
  if v_type = '' then
    raise exception 'Every pet needs an animal type.' using errcode = 'check_violation';
  end if;
  if length(v_name) > 120 or length(v_type) > 60 or length(v_breed) > 120
     or length(v_age) > 40 or length(v_wt) > 40 then
    raise exception 'A pet field is too long.' using errcode = 'check_violation';
  end if;
  if length(v_narr) > 600 then
    raise exception 'A pet note is too long (600 characters maximum).' using errcode = 'check_violation';
  end if;

  -- Extras: stored first, submitted second (submitted wins between the two),
  -- and the validated canonical block is applied last so it always wins.
  v_extra := '{}'::jsonb;
  if p_prior is not null and jsonb_typeof(p_prior) = 'object' then
    v_extra := v_extra || (p_prior - v_canonical);
  end if;
  v_extra := v_extra || (p_pet - v_canonical);
  v := v_extra;

  v := v || jsonb_build_object('name', v_name, 'type', v_type,
                               'breed', v_breed, 'age', v_age, 'weight', v_wt);

  if v_pid <> '' then v := v || jsonb_build_object('petId', v_pid); end if;
  if p_pet ? 'vaccinated' then
    v := v || jsonb_build_object('vaccinated', coalesce((p_pet ->> 'vaccinated')::boolean, false));
  end if;
  if jsonb_typeof(p_pet -> 'supportFunctions') = 'array' then
    v := v || jsonb_build_object('supportFunctions', (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
        from jsonb_array_elements(p_pet -> 'supportFunctions') e
       where jsonb_typeof(e) = 'string'
    ));
  end if;
  if v_narr <> '' then v := v || jsonb_build_object('supportNarrative', v_narr); end if;

  return v;
end;
$function$;

comment on function public.normalize_order_pet_row(jsonb, jsonb) is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-LIVE-001 — validates the canonical pet fields and CARRIES THROUGH every other key from the stored and submitted rows, so an admin correction can never silently delete a pet field this editor does not know about.';

revoke all on function public.normalize_order_pet_row(jsonb, jsonb) from public, anon, authenticated;

-- The 2-arg form carries a DEFAULT, so leaving the old 1-arg overload in place
-- makes every single-argument call ambiguous (42725: "is not unique"). The
-- mutation below always passes two arguments, so the old overload has no
-- callers and is dropped rather than left as a trap.
drop function if exists public.normalize_order_pet_row(jsonb);

-- ── 2. Pass the stored row into the normaliser ──────────────────────────────
-- The ONLY change to the mutation: the pet loop now walks the submitted array
-- WITH ORDINALITY and hands the stored pet at the same position to the
-- normaliser. Everything else in this function is byte-identical to the
-- verified TEST implementation.

do $mig$
declare
  src  text;
  body text;
  old_loop constant text :=
'  for v_pet in select value from jsonb_array_elements(p_pets) loop
    v_pets_after := v_pets_after || jsonb_build_array(public.normalize_order_pet_row(v_pet));
  end loop;';
  new_loop constant text :=
'  for v_pet_idx, v_pet in
    select (ord - 1)::int, value from jsonb_array_elements(p_pets) with ordinality as t(value, ord)
  loop
    v_pets_after := v_pets_after || jsonb_build_array(
      public.normalize_order_pet_row(
        v_pet,
        case when jsonb_typeof(v_pets_before -> v_pet_idx) = ''object''
             then v_pets_before -> v_pet_idx else ''{}''::jsonb end));
  end loop;';
  old_decl constant text := '  v_pet          jsonb;';
  new_decl constant text := '  v_pet          jsonb;
  v_pet_idx      integer;';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'admin_update_order_customer_and_pets'
     and p.pronamespace = 'public'::regnamespace;

  if src is null then
    raise exception 'admin_update_order_customer_and_pets not found — apply 20260828120000 first';
  end if;

  -- Already adapted? Then this file is a no-op.
  if position('v_pet_idx' in src) > 0 then
    raise notice 'normalize_order_pet_row prior-row passthrough already installed';
    return;
  end if;

  body := replace(src, old_decl, new_decl);
  if body = src then
    raise exception 'declaration anchor drifted — refusing to guess';
  end if;

  src  := body;
  body := replace(src, old_loop, new_loop);
  if body = src then
    raise exception 'pet-loop anchor drifted — refusing to guess';
  end if;

  execute body;
end $mig$;
