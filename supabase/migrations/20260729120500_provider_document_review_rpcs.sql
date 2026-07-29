-- PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 · Part A (server actions)
--
-- Approve & Deliver / Needs Correction, enforced in the database.
--
-- Design rules these functions exist to satisfy:
--   • The APPROVER IS auth.uid(). No caller-supplied approver id or approver
--     name takes any part in the decision or in the audit row.
--   • Idempotent. A double-click, a replay, or two concurrent employees produce
--     exactly ONE transition; the loser is told `transitioned = false` so the
--     caller never sends a second customer notification.
--   • A provider can never approve their own document — authorization is
--     is_admin_staff() only, which is admin-flagged ACTIVE staff.
--   • Correction requires a real note.
--
-- All functions are SECURITY DEFINER with a pinned search_path, and are
-- explicitly revoked from public/anon/authenticated before being granted back
-- to authenticated by name (revoking "from public" alone does NOT undo
-- PostgreSQL's default EXECUTE grant).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared: resolve the calling employee into an audit actor.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.current_staff_actor()
returns table (user_id uuid, display_name text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dp.user_id,
         coalesce(nullif(btrim(dp.full_name), ''), 'Employee') as display_name,
         coalesce(nullif(btrim(dp.role), ''), 'admin')         as role
    from public.doctor_profiles dp
   where dp.user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.current_staff_actor() from public, anon, authenticated;
grant execute on function public.current_staff_actor() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- APPROVE & DELIVER
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.approve_order_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc      public.order_documents;
  v_order    public.orders;
  v_actor_id uuid   := auth.uid();
  v_name     text;
  v_role     text;
  v_version  public.order_document_versions;
begin
  if not public.is_admin_staff() then
    raise exception 'approve_order_document: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  -- Serialise concurrent approvals of the same document.
  select * into v_doc
    from public.order_documents
   where id = p_document_id
     for update;

  if not found then
    raise exception 'approve_order_document: document % not found', p_document_id;
  end if;

  -- Idempotency / staleness. Already-approved returns cleanly so a replay is a
  -- no-op; a superseded version can never be (re)approved into delivery.
  if v_doc.review_status <> 'pending_admin_approval' then
    return jsonb_build_object(
      'transitioned', false,
      'review_status', v_doc.review_status,
      'document_id',  v_doc.id,
      'order_id',     v_doc.order_id,
      'confirmation_id', v_doc.confirmation_id,
      'doc_type',     v_doc.doc_type,
      'reason', case
        when v_doc.review_status = 'approved'   then 'already_approved'
        when v_doc.review_status = 'superseded' then 'version_superseded'
        else 'not_pending'
      end
    );
  end if;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  update public.order_documents
     set review_status    = 'approved',
         approved_by      = v_actor_id,
         approved_at      = now(),
         reviewed_by      = v_actor_id,
         reviewed_at      = now(),
         delivered_at     = now(),
         customer_visible = true
   where id = v_doc.id
  returning * into v_doc;

  select * into v_order from public.orders where id = v_doc.order_id;

  -- Activate the document version that this approval releases, so the customer's
  -- version history and the ACTIVE-version pointer only ever advance on a real
  -- delivery. Best effort: a missing/failed version must not block the release
  -- of a document the employee has already approved.
  begin
    select * into v_version
      from public.order_document_versions
     where order_document_id = v_doc.id
       and approval_status = 'pending'
     order by version desc
     limit 1;
    if found then
      perform public.activate_document_version(v_version.id);
    end if;
  exception when others then
    raise warning 'approve_order_document: version activation skipped for doc % (%)',
      v_doc.id, sqlerrm;
  end;

  insert into public.audit_logs (
    actor_id, actor_name, actor_role, object_type, object_id,
    action, description, old_values, new_values, metadata
  ) values (
    v_actor_id, v_name, v_role, 'order_document', v_doc.confirmation_id,
    'document_approved',
    format('%s approved %s for order %s and released it to the customer.',
           v_name, v_doc.label, v_doc.confirmation_id),
    jsonb_build_object('review_status', 'pending_admin_approval', 'customer_visible', false),
    jsonb_build_object('review_status', 'approved', 'customer_visible', true),
    jsonb_build_object(
      'order_id',        v_doc.order_id,
      'confirmation_id', v_doc.confirmation_id,
      'document_id',     v_doc.id,
      'doc_type',        v_doc.doc_type,
      'document_label',  v_doc.label,
      'document_version', coalesce(v_version.version, 1),
      'submitted_by',    v_doc.submitted_by,
      'provider_id',     v_order.doctor_user_id,
      'provider_name',   v_order.doctor_name,
      'approved_at',     v_doc.approved_at
    )
  );

  insert into public.audit_logs (
    actor_id, actor_name, actor_role, object_type, object_id,
    action, description, metadata
  ) values (
    v_actor_id, v_name, v_role, 'order_document', v_doc.confirmation_id,
    'document_delivered',
    format('%s is now available to the customer for order %s.',
           v_doc.label, v_doc.confirmation_id),
    jsonb_build_object(
      'order_id',        v_doc.order_id,
      'confirmation_id', v_doc.confirmation_id,
      'document_id',     v_doc.id,
      'doc_type',        v_doc.doc_type,
      'delivered_at',    v_doc.delivered_at
    )
  );

  return jsonb_build_object(
    'transitioned',    true,
    'review_status',   'approved',
    'document_id',     v_doc.id,
    'order_id',        v_doc.order_id,
    'confirmation_id', v_doc.confirmation_id,
    'doc_type',        v_doc.doc_type,
    'document_label',  v_doc.label,
    'approved_by',     v_actor_id,
    'approved_by_name', v_name,
    'approved_at',     v_doc.approved_at,
    'version_id',      v_version.id
  );
end;
$$;

revoke all on function public.approve_order_document(uuid) from public, anon, authenticated;
grant execute on function public.approve_order_document(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- NEEDS CORRECTION
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.request_order_document_correction(
  p_document_id uuid,
  p_note        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc      public.order_documents;
  v_order    public.orders;
  v_actor_id uuid := auth.uid();
  v_name     text;
  v_role     text;
  v_note     text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin_staff() then
    raise exception 'request_order_document_correction: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  if length(v_note) < 5 then
    raise exception 'request_order_document_correction: a correction note is required (min 5 characters)'
      using errcode = 'check_violation';
  end if;
  if length(v_note) > 1000 then
    raise exception 'request_order_document_correction: correction note exceeds 1000 characters'
      using errcode = 'check_violation';
  end if;

  select * into v_doc
    from public.order_documents
   where id = p_document_id
     for update;

  if not found then
    raise exception 'request_order_document_correction: document % not found', p_document_id;
  end if;

  if v_doc.review_status <> 'pending_admin_approval' then
    return jsonb_build_object(
      'transitioned',  false,
      'review_status', v_doc.review_status,
      'document_id',   v_doc.id,
      'order_id',      v_doc.order_id,
      'confirmation_id', v_doc.confirmation_id,
      'reason', case
        when v_doc.review_status = 'needs_correction' then 'already_needs_correction'
        when v_doc.review_status = 'approved'         then 'already_approved'
        else 'not_pending'
      end
    );
  end if;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  update public.order_documents
     set review_status    = 'needs_correction',
         reviewed_by      = v_actor_id,
         reviewed_at      = now(),
         correction_note  = v_note,
         customer_visible = false
   where id = v_doc.id
  returning * into v_doc;

  select * into v_order from public.orders where id = v_doc.order_id;

  insert into public.audit_logs (
    actor_id, actor_name, actor_role, object_type, object_id,
    action, description, old_values, new_values, metadata
  ) values (
    v_actor_id, v_name, v_role, 'order_document', v_doc.confirmation_id,
    'document_correction_requested',
    format('%s requested a correction on %s for order %s.',
           v_name, v_doc.label, v_doc.confirmation_id),
    jsonb_build_object('review_status', 'pending_admin_approval'),
    jsonb_build_object('review_status', 'needs_correction'),
    jsonb_build_object(
      'order_id',        v_doc.order_id,
      'confirmation_id', v_doc.confirmation_id,
      'document_id',     v_doc.id,
      'doc_type',        v_doc.doc_type,
      'document_label',  v_doc.label,
      'correction_note', v_note,
      'provider_id',     v_order.doctor_user_id,
      'provider_name',   v_order.doctor_name
    )
  );

  return jsonb_build_object(
    'transitioned',    true,
    'review_status',   'needs_correction',
    'document_id',     v_doc.id,
    'order_id',        v_doc.order_id,
    'confirmation_id', v_doc.confirmation_id,
    'doc_type',        v_doc.doc_type,
    'document_label',  v_doc.label,
    'correction_note', v_note,
    'reviewed_by',     v_actor_id,
    'reviewed_by_name', v_name,
    'provider_user_id', v_order.doctor_user_id
  );
end;
$$;

revoke all on function public.request_order_document_correction(uuid, text) from public, anon, authenticated;
grant execute on function public.request_order_document_correction(uuid, text) to authenticated;

commit;
