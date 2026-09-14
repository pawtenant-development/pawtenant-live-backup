-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 5
-- Partner document, branding, QR, footer and verification isolation — DATABASE ARM.
--
-- WHY THIS EXISTS IN THE DATABASE AND NOT ONLY IN TYPESCRIPT
--
-- The edge-function gates added in this slice refuse partner orders early, before
-- any PDF is downloaded or any storage object is written. That is the right place
-- for an auditable, cheap refusal — but it is not a boundary.
--
-- The verification record is minted from FIVE distinct places:
--
--   1. provider-submit-letter  -> inline generateVerificationId()   (first letter)
--   2. issue-letter-verification                                    (standalone)
--   3. public.ensure_revision_verification_id()                     (REVISIONS —
--      runs entirely inside Postgres; a TypeScript gate on its caller cannot
--      constrain a direct RPC call)
--   4. inject-pdf-footer / generate-qr-verification-pdf READ the record and stamp
--      the QR that points at it
--   5. any future code path, backfill script or ad-hoc SQL
--
-- A gate that lives only in the callers therefore leaves (3) and (5) open, and
-- has to be re-implemented correctly every time a sixth path appears. The rule
-- "a partner-neutral order must never own a PawTenant verification record" is an
-- invariant of the DATA, so it is enforced on the TABLE. Every path above, plus
-- a forged client payload and plain psql, now hits the same wall.
--
-- Nothing here changes behaviour for direct PawTenant orders: order_document_policy()
-- returns 'pawtenant_branded' for them, which is exactly what the trigger requires,
-- so every existing insert continues to succeed unchanged.

-- ── 1. THE canonical policy resolver, mirroring _shared/partnerPolicy.ts ──────
--
-- Same contract as resolveOrderPolicy(): a row whose origin or policy cannot be
-- established RAISES rather than defaulting. "I could not tell" must never be
-- spelled "treat it as retail".
create or replace function public.order_document_policy(p_order_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_origin text;
  v_doc    text;
begin
  if p_order_id is null then
    raise exception 'partner policy: no order supplied; refusing to assume a direct order'
      using errcode = 'check_violation';
  end if;

  select o.order_origin, o.partner_document_policy
    into v_origin, v_doc
  from public.orders o
  where o.id = p_order_id;

  if not found then
    raise exception 'partner policy: order % not found; refusing to assume a direct order', p_order_id
      using errcode = 'check_violation';
  end if;

  v_origin := btrim(coalesce(v_origin, ''));

  if v_origin = 'direct' then
    -- Historical behaviour, completely unchanged.
    return 'pawtenant_branded';
  end if;

  if v_origin <> 'partner' then
    raise exception 'partner policy: order % has an unrecognised order_origin; refusing to guess', p_order_id
      using errcode = 'check_violation';
  end if;

  v_doc := btrim(coalesce(v_doc, ''));

  if v_doc not in ('pawtenant_branded', 'partner_neutral') then
    raise exception 'partner policy: order % has a missing or unknown document policy; refusing to brand a document', p_order_id
      using errcode = 'check_violation';
  end if;

  return v_doc;
end;
$function$;

comment on function public.order_document_policy(uuid) is
  'PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 Slice 5. THE database-side mirror of '
  '_shared/partnerPolicy.ts resolveOrderPolicy(). Returns pawtenant_branded | partner_neutral. '
  'RAISES for a missing order, an unrecognised order_origin or an unknown partner document '
  'policy — it never falls back to retail. Callers: trg_letter_verifications_partner_isolation.';

-- SUPABASE-REVOKE-AUTHENTICATED-EXPLICITLY: "from public" does NOT undo the
-- default grant that EXECUTE carries. Name every role.
revoke all on function public.order_document_policy(uuid) from public;
revoke all on function public.order_document_policy(uuid) from anon;
revoke all on function public.order_document_policy(uuid) from authenticated;

-- ── 2. The invariant, enforced on the table itself ───────────────────────────
create or replace function public.trg_letter_verifications_partner_isolation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_policy text;
begin
  -- Sample/demo verification records legitimately have NO order at all: they back
  -- the public sample letter, which belongs to no customer. They are allowed, but
  -- ONLY when explicitly flagged as demo. An orderless row that does NOT claim to
  -- be a demo cannot be classified, so it fails closed like everything else.
  if new.order_id is null then
    if coalesce(new.is_demo, false) then
      return new;
    end if;
    raise exception
      'partner policy: letter_verifications row % has no order_id and is not a demo record; refusing to create an unclassifiable PawTenant verification record',
      new.letter_id
      using errcode = 'check_violation';
  end if;

  -- Raises for an unknown origin / unknown policy / missing order. We deliberately
  -- do NOT trap that: an unclassifiable order must abort the insert, not proceed.
  v_policy := public.order_document_policy(new.order_id);

  if v_policy <> 'pawtenant_branded' then
    raise exception
      'partner policy: order % carries document policy %; a PawTenant verification record must not be created for it',
      new.order_id, v_policy
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

comment on function public.trg_letter_verifications_partner_isolation() is
  'PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 Slice 5. Refuses any PawTenant verification '
  'record for a partner-neutral order, whichever code path attempts it (provider-submit-letter, '
  'issue-letter-verification, ensure_revision_verification_id, a backfill script or ad-hoc SQL).';

revoke all on function public.trg_letter_verifications_partner_isolation() from public;
revoke all on function public.trg_letter_verifications_partner_isolation() from anon;
revoke all on function public.trg_letter_verifications_partner_isolation() from authenticated;

drop trigger if exists trg_letter_verifications_partner_isolation on public.letter_verifications;

-- BEFORE INSERT, and named so it sorts AFTER trg_letter_verifications_public_token
-- is irrelevant: refusal raises, so no token is ever minted for a refused row.
create trigger trg_letter_verifications_partner_isolation
  before insert on public.letter_verifications
  for each row
  execute function public.trg_letter_verifications_partner_isolation();
