-- PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 · Part A (delivery)
--
-- Completes approve_order_document(): approval IS delivery, so the order-level
-- delivery state moves here out of provider-submit-letter. Also corrects the
-- customer projection on order_document_versions from the first cut.
--
-- 1. ORDER STATE. `status = completed`, `doctor_status = patient_notified`,
--    `signed_letter_url` and `patient_notification_sent_at` used to be written
--    the instant a provider uploaded a file. They are delivery facts, not
--    submission facts — and signed_letter_url in particular is read by
--    resolveCustomerDocuments()'s legacy fallback, so leaving it at submission
--    would have delivered an unapproved letter even with the document row
--    hidden. They are written here, atomically with the release.
--
-- 2. VERSION PROJECTION. order_document_versions.file_url is a long-lived signed
--    URL, so a version row is a delivery channel in its own right. The first cut
--    gated it on approval_status alone, which is wrong: versions are ACTIVATED
--    at submission time (that timing is deliberately left untouched, because the
--    Additional Pet completion linkage hangs off it), so an activated-but-
--    unapproved version would still have been readable. It is now gated on the
--    same fact that gates the file: the BACKING order_documents row must be
--    released.
--
-- 3. SUPERSEDE WITHOUT HIDING. Only one letter may RESOLVE as current, but a
--    letter the customer already received must never be taken away (§23). Prior
--    letters are marked `superseded` and keep customer_visible = true, so
--    "Previous document versions" keeps working. The ordering bug this protects
--    against — resolveCustomerDocuments() took the FIRST finalized letter in
--    ascending upload order, i.e. the OLDEST — is fixed in the resolver instead.

begin;

drop policy if exists docver_customer_select on public.order_document_versions;
create policy docver_customer_select
  on public.order_document_versions
  for select
  to authenticated
  using (
    approval_status in ('approved', 'superseded')
    and exists (
      select 1
        from public.order_documents od
       where od.id = order_document_versions.order_document_id
         and od.customer_visible = true
         and od.review_status not in ('pending_admin_approval', 'needs_correction')
    )
    and exists (
      select 1 from public.orders o
       where o.id = order_document_versions.order_id
         and (o.user_id = auth.uid()
              or lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

create or replace function public.approve_order_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc        public.order_documents;
  v_order      public.orders;
  v_actor_id   uuid := auth.uid();
  v_name       text;
  v_role       text;
  v_version    public.order_document_versions;
  v_is_letter  boolean;
  v_final_url  text;
  v_superseded int := 0;
begin
  if not public.is_admin_staff() then
    raise exception 'approve_order_document: not authorised' using errcode = 'insufficient_privilege';
  end if;

  select * into v_doc from public.order_documents where id = p_document_id for update;
  if not found then
    raise exception 'approve_order_document: document % not found', p_document_id;
  end if;

  -- Idempotency / staleness gate. This single check is what makes a double
  -- click, a replay and two concurrent employees produce exactly one delivery
  -- and exactly one customer notification.
  if v_doc.review_status <> 'pending_admin_approval' then
    return jsonb_build_object(
      'transitioned', false, 'review_status', v_doc.review_status,
      'document_id', v_doc.id, 'order_id', v_doc.order_id,
      'confirmation_id', v_doc.confirmation_id, 'doc_type', v_doc.doc_type,
      'reason', case
        when v_doc.review_status = 'approved'   then 'already_approved'
        when v_doc.review_status = 'superseded' then 'version_superseded'
        else 'not_pending' end);
  end if;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  v_is_letter := v_doc.doc_type in ('esa_letter','psd_letter','signed_letter','letter');

  update public.order_documents
     set review_status='approved', approved_by=v_actor_id, approved_at=now(),
         reviewed_by=v_actor_id, reviewed_at=now(), delivered_at=now(),
         customer_visible=true
   where id = v_doc.id
  returning * into v_doc;

  if v_is_letter then
    update public.order_documents
       set review_status = 'superseded',
           superseded_by_document_id = v_doc.id
     where order_id = v_doc.order_id
       and id <> v_doc.id
       and doc_type in ('esa_letter','psd_letter','signed_letter','letter')
       and customer_visible = true
       and review_status in ('not_applicable','approved');
    get diagnostics v_superseded = row_count;
  end if;

  select * into v_version from public.order_document_versions
   where order_document_id = v_doc.id
   order by version desc limit 1;

  select * into v_order from public.orders where id = v_doc.order_id for update;

  if v_is_letter then
    v_final_url := coalesce(v_doc.processed_file_url, v_doc.file_url);
    update public.orders
       set status                       = 'completed',
           doctor_status                = 'patient_notified',
           signed_letter_url            = coalesce(v_final_url, signed_letter_url),
           patient_notification_sent_at = now()
     where id = v_order.id
    returning * into v_order;
  end if;

  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type, entity_id, document_id, provider_id,
    action, description, old_values, new_values, metadata)
  values (v_actor_id, v_name, v_role, 'employee', 'documents', 'admin_portal',
    'order_document', v_doc.confirmation_id, v_doc.order_id, 'order_document', v_doc.id::text,
    v_doc.id, v_order.doctor_user_id, 'document_approved',
    format('%s approved %s for order %s and released it to the customer.', v_name, v_doc.label, v_doc.confirmation_id),
    jsonb_build_object('review_status','pending_admin_approval','customer_visible',false),
    jsonb_build_object('review_status','approved','customer_visible',true),
    jsonb_build_object('order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,'document_id',v_doc.id,
      'doc_type',v_doc.doc_type,'document_label',v_doc.label,'document_version',coalesce(v_version.version,1),
      'submitted_by',v_doc.submitted_by,'provider_id',v_order.doctor_user_id,'provider_name',v_order.doctor_name,
      'letter_id',v_order.letter_id,'superseded_documents',v_superseded,'approved_at',v_doc.approved_at));

  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type, entity_id, document_id,
    action, description, metadata)
  values (v_actor_id, v_name, v_role, 'employee', 'documents', 'admin_portal',
    'order_document', v_doc.confirmation_id, v_doc.order_id, 'order_document', v_doc.id::text, v_doc.id,
    'document_delivered',
    format('%s is now available to the customer for order %s.', v_doc.label, v_doc.confirmation_id),
    jsonb_build_object('order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,'document_id',v_doc.id,
      'doc_type',v_doc.doc_type,'delivered_at',v_doc.delivered_at));

  return jsonb_build_object('transitioned',true,'review_status','approved','document_id',v_doc.id,
    'order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,'doc_type',v_doc.doc_type,
    'document_label',v_doc.label,'is_letter',v_is_letter,'approved_by',v_actor_id,'approved_by_name',v_name,
    'approved_at',v_doc.approved_at,'version_id',v_version.id,'letter_id',v_order.letter_id,
    'superseded_documents',v_superseded);
end;
$$;

revoke all on function public.approve_order_document(uuid) from public, anon, authenticated;
grant execute on function public.approve_order_document(uuid) to authenticated;

commit;
