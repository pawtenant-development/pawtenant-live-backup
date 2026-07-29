-- PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 · Part A
--
-- Provider submission must no longer equal customer delivery. A provider-
-- generated final customer-facing document now enters `pending_admin_approval`
-- and stays INVISIBLE to the customer until an authorized employee previews it
-- and explicitly approves & delivers it.
--
-- Why the gate lives on order_documents.customer_visible:
--   That flag is ALREADY the server-enforced customer visibility control —
--   RLS policy `customers_read_own_docs` requires customer_visible = true, and
--   the get-document-signed-url edge function returns 403 to an owning customer
--   when the row is not customer_visible. Re-using it means the release gate is
--   enforced by mechanisms that already exist and are already proven, rather
--   than by a second parallel flag that React could forget to apply.
--
-- Historical rows: every existing document is backfilled to 'not_applicable',
-- so already-delivered customer documents remain delivered and visible. Nothing
-- is retroactively hidden and no re-approval is ever required.
--
-- Idempotent and non-destructive.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Review columns on order_documents
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.order_documents
  add column if not exists review_status              text,
  add column if not exists submitted_by               uuid,
  add column if not exists submitted_at               timestamptz,
  add column if not exists reviewed_by                uuid,
  add column if not exists reviewed_at                timestamptz,
  add column if not exists correction_note            text,
  add column if not exists approved_by                uuid,
  add column if not exists approved_at                timestamptz,
  add column if not exists delivered_at               timestamptz,
  add column if not exists superseded_by_document_id  uuid;

-- Backfill BEFORE the NOT NULL default is enforced: every pre-existing document
-- predates the gate and must stay exactly as delivered as it is today.
update public.order_documents
   set review_status = 'not_applicable'
 where review_status is null;

alter table public.order_documents
  alter column review_status set default 'not_applicable';

alter table public.order_documents
  alter column review_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'order_documents_review_status_check'
  ) then
    alter table public.order_documents
      add constraint order_documents_review_status_check
      check (review_status in (
        'not_applicable',        -- legacy / customer upload / admin attachment
        'pending_admin_approval',
        'needs_correction',
        'approved',
        'superseded'
      ));
  end if;
end $$;

create index if not exists idx_order_documents_review_status
  on public.order_documents (review_status)
  where review_status in ('pending_admin_approval', 'needs_correction');

create index if not exists idx_order_documents_order_review
  on public.order_documents (order_id, review_status);

comment on column public.order_documents.review_status is
  'Admin release gate. pending_admin_approval / needs_correction are NEVER customer-visible (enforced by tg_order_document_release_gate). not_applicable = pre-gate historical row, customer upload, or internal admin attachment.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HARD server-side release invariant
--
--    This is the guarantee that a React bug, a direct SQL write, a replayed
--    edge-function call or a hand-crafted PostgREST request cannot release an
--    unapproved provider document. It RAISES rather than silently correcting,
--    so a violation surfaces instead of being masked.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_order_document_release_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.review_status in ('pending_admin_approval', 'needs_correction') then
    if coalesce(new.customer_visible, false) then
      raise exception
        'order_documents %: review_status=% cannot be customer_visible — approval is required before delivery',
        new.id, new.review_status
        using errcode = 'check_violation';
    end if;
    if coalesce(new.sent_to_customer, false) then
      raise exception
        'order_documents %: review_status=% cannot be sent_to_customer',
        new.id, new.review_status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_document_release_gate on public.order_documents;
create trigger trg_order_document_release_gate
  before insert or update on public.order_documents
  for each row execute function public.tg_order_document_release_gate();

-- A trigger function is never invoked directly. Revoke by name — revoking "from
-- public" alone does NOT undo PostgreSQL's default explicit EXECUTE grant.
revoke all on function public.tg_order_document_release_gate() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tighten the customer projection on order_document_versions
--
--    The previous policy let a customer read EVERY version row for their own
--    order — including rows still in generation (`approval_status = 'pending'`),
--    whose file_url is a long-lived signed URL. That is a pre-approval leak
--    channel independent of order_documents. Customers now see only versions
--    that reached the customer-facing lifecycle (approved = the activated
--    version, or superseded = a previously delivered one).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists docver_customer_select on public.order_document_versions;
create policy docver_customer_select
  on public.order_document_versions
  for select
  to authenticated
  using (
    approval_status in ('approved', 'superseded')
    and exists (
      select 1
        from public.orders o
       where o.id = order_document_versions.order_id
         and (
           o.user_id = auth.uid()
           or lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         )
    )
  );

commit;
