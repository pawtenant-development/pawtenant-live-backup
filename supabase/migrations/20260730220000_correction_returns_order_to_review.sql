-- ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 · Phase 3
-- REQUESTING A CORRECTION MUST RETURN THE ORDER TO AN ACTIONABLE STATE (LIVE)
-- =============================================================================
-- LIVE port of TEST bd6227d / 20260730131000.
-- TEST 64d7393 (20260730170000, "link correction audit events to orders") is
-- DELIBERATELY NOT PORTED — see below.
--
-- >>> LIVE ADAPTATION — REBUILT FROM THE DEPLOYED LIVE BODY, NOT FROM TEST <<<
--
--   TEST's final version writes an audit row with ONLY:
--     actor_id, actor_name, actor_role, object_type, object_id, order_id,
--     action, description, old_values, new_values, metadata
--
--   The DEPLOYED LIVE body is RICHER. It additionally sets actor_type, category,
--   source, entity_type, entity_id, document_id and provider_id — and it ALREADY
--   populates order_id.
--
--   Two consequences, both verified against LIVE before writing this migration:
--     1. Porting TEST verbatim would have DROPPED five audit columns that LIVE's
--        Audit timeline filters on (category / source / actor_type) plus the
--        document and provider linkage.
--     2. TEST 64d7393 repaired a TEST-ONLY regression. LIVE never had that bug,
--        so it has no LIVE counterpart; the "correction audit populates order_id"
--        requirement is already satisfied by the deployed LIVE definition.
--
--   The single pre-existing LIVE correction audit row with a NULL order_id
--   predates the current definition and is left BYTE-FOR-BYTE untouched:
--   audit_logs is append-only evidence and is never backfilled.
--
-- LIVE's body is therefore preserved and receives exactly TWO deltas:
--   1. the orders.doctor_status hand-back to 'in_review';
--   2. 'doctor_status','in_review' added to new_values, so the timeline explains
--      why the order left the Pending Delivery queue.
--
-- WHY 'in_review' RATHER THAN A NEW STATUS VALUE:
--   It RESTORES the state the order sat in before the provider submitted rather
--   than inventing one. order_workflow_state() maps it to 'under_review', the
--   customer portal already maps it to Under Review, and the provider portal
--   already lists it in the actionable queue. A new enum value would have meant
--   auditing every consumer's `else` branch again.
--
--   The "Correction Requested" badge does NOT come from doctor_status — it comes
--   from the document's own review_status = 'needs_correction'.
--
-- Idempotent and non-destructive.
-- =============================================================================

begin;

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

  select * into v_doc from public.order_documents where id = p_document_id for update;
  if not found then
    raise exception 'request_order_document_correction: document % not found', p_document_id;
  end if;

  if v_doc.review_status <> 'pending_admin_approval' then
    return jsonb_build_object('transitioned',false,'review_status',v_doc.review_status,'document_id',v_doc.id,
      'order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,
      'reason', case when v_doc.review_status='needs_correction' then 'already_needs_correction'
                     when v_doc.review_status='approved' then 'already_approved' else 'not_pending' end);
  end if;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name,'Employee'); v_role := coalesce(v_role,'admin');

  update public.order_documents
     set review_status='needs_correction', reviewed_by=v_actor_id, reviewed_at=now(),
         correction_note=v_note, customer_visible=false
   where id = v_doc.id returning * into v_doc;

  -- DELTA 1: hand the order back to the provider. Guarded on the exact prior
  -- value so a correction can never resurrect an already-delivered order, and so
  -- a replay (which cannot reach here anyway, per the idempotency gate above) is
  -- inert.
  update public.orders
     set doctor_status = 'in_review'
   where id = v_doc.order_id
     and doctor_status = 'pending_admin_approval';

  select * into v_order from public.orders where id = v_doc.order_id;

  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type, entity_id, document_id, provider_id,
    action, description, old_values, new_values, metadata)
  values (v_actor_id, v_name, v_role, 'employee', 'documents', 'admin_portal',
    'order_document', v_doc.confirmation_id, v_doc.order_id, 'order_document', v_doc.id::text,
    v_doc.id, v_order.doctor_user_id, 'document_correction_requested',
    format('%s requested a correction on %s for order %s.', v_name, v_doc.label, v_doc.confirmation_id),
    jsonb_build_object('review_status','pending_admin_approval'),
    -- DELTA 2: record the order-level hand-back too.
    jsonb_build_object('review_status','needs_correction','doctor_status','in_review'),
    jsonb_build_object('order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,'document_id',v_doc.id,
      'doc_type',v_doc.doc_type,'document_label',v_doc.label,'correction_note',v_note,
      'provider_id',v_order.doctor_user_id,'provider_name',v_order.doctor_name));

  return jsonb_build_object('transitioned',true,'review_status','needs_correction','document_id',v_doc.id,
    'order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,'doc_type',v_doc.doc_type,
    'document_label',v_doc.label,'correction_note',v_note,'reviewed_by',v_actor_id,
    'reviewed_by_name',v_name,'provider_user_id',v_order.doctor_user_id);
end;
$$;

revoke all on function public.request_order_document_correction(uuid, text) from public, anon, authenticated;
grant execute on function public.request_order_document_correction(uuid, text) to authenticated;

commit;
