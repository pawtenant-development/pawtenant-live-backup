-- ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 · Phase 1
-- EMPLOYEE LETTER QUALITY CHECK — SERVER-ENFORCED FEATURE TOGGLE (LIVE)
-- =============================================================================
-- LIVE port of TEST ab2dbab (20260730120000) FOLDED WITH TEST 280a72e
-- (20260730160000, the RBAC hardening of the reader).
--
-- WHY THE TWO TEST MIGRATIONS ARE FOLDED INTO ONE HERE:
--   On TEST the reader shipped first with EXECUTE granted to every authenticated
--   user, and 280a72e closed that four commits later. Replaying that sequence on
--   LIVE would deliberately publish a known information-disclosure to production
--   and then close it. Forward-only means the FINAL state, so the hardened reader
--   is what gets created — the intermediate never exists on LIVE.
--
-- LIVE AUTHORIZATION ADAPTATION — VERIFIED, NOT ASSUMED:
--   is_admin_staff() and is_chat_admin() were compared function-body to
--   function-body between TEST (opudhofjbydrljgleofq) and LIVE
--   (cvwbozlbbmrjxznknouq) before this migration was written. Both resolve
--   against public.doctor_profiles on auth.uid() with is_admin AND is_active, and
--   is_chat_admin() additionally requires role in ('owner','admin_manager') on
--   BOTH projects. They are semantically identical, so the TEST authorisation
--   shape ports unchanged and NO second admin-role system is introduced.
--   LIVE also carries check_is_admin() (no is_active predicate); it is
--   deliberately NOT used here — is_admin_staff() is the stricter, correct gate.
--
-- WHY THE DEFAULT IS TRUE / FAIL-CLOSED:
--   A missing row, a NULL, a malformed jsonb value or an unreadable table all
--   resolve to ENABLED. The dangerous direction is auto-delivering an unreviewed
--   letter to a real customer, so every ambiguous state means "keep reviewing".
--
-- WHY TURNING IT OFF RELEASES NOTHING:
--   auto_deliver_order_document() is only ever called by provider-submit-letter
--   on the submission it just created. Nothing sweeps the pending backlog, and
--   this migration performs no UPDATE on order_documents. Measured on LIVE before
--   writing this: order_documents with review_status='pending_admin_approval' = 0,
--   so there is no backlog to release even in principle.
--
-- Idempotent and non-destructive.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Workflow settings store
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.workflow_settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.workflow_settings is
  'Admin-controlled operational workflow toggles. Mirrors the ai_support_settings shape. Read via the dedicated reader functions, never trusted from a client.';

alter table public.workflow_settings enable row level security;

-- Defence in depth. RLS already blocks anon (it has no policy), but the DEFAULT
-- table GRANT survives "revoke ... from public" and would become live the moment
-- RLS were disabled or a policy were written loosely. Revoke BY NAME.
revoke all on table public.workflow_settings from anon;
revoke all on table public.workflow_settings from authenticated;
revoke all on table public.workflow_settings from public;
grant select on table public.workflow_settings to service_role;

drop policy if exists workflow_settings_read  on public.workflow_settings;
drop policy if exists workflow_settings_write on public.workflow_settings;

create policy workflow_settings_read
  on public.workflow_settings
  for select
  using (public.is_admin_staff());

create policy workflow_settings_write
  on public.workflow_settings
  for all
  using (public.is_chat_admin())
  with check (public.is_chat_admin());

-- Seed the gate as ENABLED so behaviour is byte-identical to today.
insert into public.workflow_settings (key, value)
values ('provider_document_approval_gate_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reader — authorisation-first, then fail-closed
-- ─────────────────────────────────────────────────────────────────────────────
-- The EXECUTE grant to `authenticated` is intentionally coarse: PostgREST
-- resolves an admin's own browser session to `authenticated` like anyone else, so
-- revoking it would break the Settings panel for admins too. The FUNCTION BODY
-- does the real authorisation — the same pattern approve_order_document() uses.
--
-- The authorisation RAISE sits OUTSIDE the `when others` handler, and that
-- handler re-raises insufficient_privilege explicitly. If the check lived inside
-- it, the denial would be SWALLOWED and converted into `true` — i.e. the
-- disclosure would survive, just harder to see.
create or replace function public.is_provider_approval_gate_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_raw jsonb;
begin
  if not (public.is_admin_staff() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'is_provider_approval_gate_enabled: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select value into v_raw
    from public.workflow_settings
   where key = 'provider_document_approval_gate_enabled';

  -- Absent row, SQL NULL, JSON null, or a non-boolean value => ENABLED.
  if v_raw is null or jsonb_typeof(v_raw) <> 'boolean' then
    return true;
  end if;

  return coalesce((v_raw #>> '{}')::boolean, true);
exception
  when insufficient_privilege then
    -- Never convert a denial into a value.
    raise;
  when others then
    -- An unreadable settings table must never auto-deliver an unreviewed letter.
    return true;
end;
$fn$;

revoke all on function public.is_provider_approval_gate_enabled() from public, anon;
grant execute on function public.is_provider_approval_gate_enabled() to authenticated, service_role;

comment on function public.is_provider_approval_gate_enabled() is
  'Reads the Employee Letter Quality Check toggle. Admin staff or service_role ONLY — raises insufficient_privilege for customers/providers/anon. Fails CLOSED (returns true) if the settings row is absent or unreadable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Setter — owner/admin-manager only, audited
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_provider_approval_gate(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name     text;
  v_role     text;
  v_previous boolean;
begin
  -- is_chat_admin() is uid-based, so a service-role bearer cannot flip a business
  -- rule with no human actor attached.
  if not public.is_chat_admin() then
    raise exception 'set_provider_approval_gate: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  if p_enabled is null then
    raise exception 'set_provider_approval_gate: enabled flag is required';
  end if;

  v_previous := public.is_provider_approval_gate_enabled();

  insert into public.workflow_settings (key, value, updated_at, updated_by)
  values ('provider_document_approval_gate_enabled', to_jsonb(p_enabled), now(), v_actor_id)
  on conflict (key) do update
     set value = to_jsonb(p_enabled), updated_at = now(), updated_by = v_actor_id;

  -- No-op changes are still recorded: "who confirmed this was correct, and when"
  -- is itself operational history.
  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type,
    category, source, object_type, object_id, action, description,
    old_values, new_values, metadata)
  values (v_actor_id, v_name, v_role, 'employee', 'settings', 'admin_portal',
    'workflow_setting', 'provider_document_approval_gate_enabled',
    case when p_enabled then 'approval_gate_enabled' else 'approval_gate_disabled' end,
    format('%s %s the Employee Letter Quality Check. %s',
           v_name,
           case when p_enabled then 'enabled' else 'disabled' end,
           case when p_enabled
                then 'Provider-submitted letters now require employee approval before customer delivery.'
                else 'Provider-submitted letters are now delivered to the customer automatically. Documents already awaiting review are NOT released.'
           end),
    jsonb_build_object('provider_document_approval_gate_enabled', v_previous),
    jsonb_build_object('provider_document_approval_gate_enabled', p_enabled),
    jsonb_build_object('setting_key', 'provider_document_approval_gate_enabled',
                       'previous_value', v_previous, 'new_value', p_enabled,
                       'changed_at', now()));

  return jsonb_build_object('ok', true, 'previous', v_previous, 'enabled', p_enabled);
end;
$$;

revoke all on function public.set_provider_approval_gate(boolean) from public, anon, authenticated;
grant execute on function public.set_provider_approval_gate(boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Automatic delivery when the gate is OFF
-- ─────────────────────────────────────────────────────────────────────────────
-- Deliberately a SEPARATE function from approve_order_document():
--   * that one is uid-gated on is_admin_staff() and attributes the release to a
--     named employee — neither is true here;
--   * this one must additionally prove the gate is disabled;
--   * its audit trail must say the release was AUTOMATIC. Recording a human
--     approver that never existed would corrupt the very record the approval gate
--     was built to produce.
create or replace function public.auto_deliver_order_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc        public.order_documents;
  v_order      public.orders;
  v_version    public.order_document_versions;
  v_is_letter  boolean;
  v_final_url  text;
  v_superseded int := 0;
begin
  -- Service-role only. Authorised by CAPABILITY, not by comparing a bearer to a
  -- key: LIVE carries both a legacy JWT and sb_secret_ keys, so a string compare
  -- is not a reliable identity test. auth.role() is what Postgres actually
  -- resolved for this connection.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'auto_deliver_order_document: service role required'
      using errcode = 'insufficient_privilege';
  end if;

  -- THE toggle enforcement point. While the gate is ON, nothing may
  -- auto-deliver, no matter who calls this or how many times.
  if public.is_provider_approval_gate_enabled() then
    return jsonb_build_object('transitioned', false, 'reason', 'approval_gate_enabled');
  end if;

  select * into v_doc from public.order_documents where id = p_document_id for update;
  if not found then
    raise exception 'auto_deliver_order_document: document % not found', p_document_id;
  end if;

  -- Same idempotency gate as approve_order_document(): exactly one delivery and
  -- exactly one customer notification per document, under replay or concurrency.
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

  v_is_letter := v_doc.doc_type in ('esa_letter','psd_letter','signed_letter','letter');

  -- approved_by / reviewed_by stay NULL: no employee reviewed this document.
  update public.order_documents
     set review_status = 'approved',
         approved_at = now(), reviewed_at = now(), delivered_at = now(),
         customer_visible = true
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
  values (null, 'System - Automatic Delivery', 'system', 'system', 'documents', 'system',
    'order_document', v_doc.confirmation_id, v_doc.order_id, 'order_document', v_doc.id::text,
    v_doc.id, v_order.doctor_user_id, 'document_auto_delivered',
    format('%s was delivered to the customer automatically for order %s because the Employee Letter Quality Check was disabled. No employee reviewed this document.',
           v_doc.label, v_doc.confirmation_id),
    jsonb_build_object('review_status','pending_admin_approval','customer_visible',false),
    jsonb_build_object('review_status','approved','customer_visible',true),
    jsonb_build_object('order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,
      'document_id',v_doc.id,'doc_type',v_doc.doc_type,'document_label',v_doc.label,
      'document_version',coalesce(v_version.version,1),'submitted_by',v_doc.submitted_by,
      'provider_id',v_order.doctor_user_id,'provider_name',v_order.doctor_name,
      'letter_id',v_order.letter_id,'superseded_documents',v_superseded,
      'approval_gate_enabled', false,
      'reason','provider_document_approval_gate_disabled',
      'delivered_at',v_doc.delivered_at));

  return jsonb_build_object('transitioned',true,'review_status','approved','document_id',v_doc.id,
    'order_id',v_doc.order_id,'confirmation_id',v_doc.confirmation_id,'doc_type',v_doc.doc_type,
    'document_label',v_doc.label,'is_letter',v_is_letter,'automatic',true,
    'delivered_at',v_doc.delivered_at,'version_id',v_version.id,'letter_id',v_order.letter_id,
    'superseded_documents',v_superseded);
end;
$$;

-- Revoke BY NAME from authenticated: revoking "from public" does not undo the
-- default explicit grant.
revoke all on function public.auto_deliver_order_document(uuid) from public, anon, authenticated;
grant execute on function public.auto_deliver_order_document(uuid) to service_role;

commit;
