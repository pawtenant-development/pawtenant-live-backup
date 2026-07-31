-- PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-LIVE-ROLLOUT-001
-- ONE CURRENT UNAPPROVED PROVIDER DOCUMENT PER (ORDER, DOCUMENT CLASS)
-- =============================================================================
-- LIVE rollout of the TEST-verified fix (TEST `6bd0eca`,
-- PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-001).
--
-- THE DEFECT THIS CLOSES (found in LIVE Pending Delivery lifecycle QA)
-- ─────────────────────────────────────────────────────────────────────────────
--   provider-submit-letter retired a prior submission ONLY when that row was in
--   `needs_correction`:
--
--       .eq("review_status", "needs_correction")
--
--   So: v1 submitted -> admin requests correction -> v2 submitted (v1 correctly
--   retired) -> v2 submitted AGAIN -> nothing in `needs_correction` to retire ->
--   TWO rows left at `pending_admin_approval`.
--
--   OrderDocumentReviewPanel selects
--   `review_status in (pending_admin_approval, needs_correction)` and renders one
--   card per row, so the employee saw TWO "Approve & Deliver" buttons and TWO
--   attestation checkboxes. approve_order_document() is idempotent PER DOCUMENT
--   but has no cross-document exclusivity, so BOTH could be approved — releasing
--   two customer-visible letters carrying two different verification IDs.
--
-- WHY THE FIX IS NOT "ALSO SUPERSEDE pending_admin_approval"
-- ─────────────────────────────────────────────────────────────────────────────
--   That one-line change fixes the SEQUENTIAL case and leaves the CONCURRENT one
--   wide open. The edge function's shape was SELECT candidates -> INSERT ->
--   UPDATE candidates: three round trips, no lock. Two submissions interleaving
--   between the SELECT and the UPDATE each read an empty candidate set and each
--   insert. Enumerating one more status does not change that.
--
--   So the fix is structural, in two layers:
--     1. ONE transactional, order-scoped-locked RPC does dedupe + supersede +
--        insert as a single atomic unit (provider_submit_document_slot).
--     2. A PARTIAL UNIQUE INDEX makes two current unapproved rows impossible at
--        the storage layer — for the RPC, for a direct SQL write, for a replayed
--        PostgREST request, and for any code path written after this task.
--   Layer 2 is what makes the invariant true rather than merely intended.
--
-- WHY THE SCOPE IS (order_id, doc_type) AND NOT order_id ALONE
-- ─────────────────────────────────────────────────────────────────────────────
--   A combo order legitimately has the ESA/PSD letter AND the completed Housing
--   Accommodation form in flight at the same time; provider-submit-letter inserts
--   each as its own pending row (esa_letter/psd_letter vs housing_completed) and
--   each needs its own approval. Constraining per ORDER would make the second of
--   those submissions fail and would break every combo order.
--
--   The reported defect is TWO CARDS FOR ONE DOCUMENT CLASS. Two cards for two
--   genuinely different deliverables is correct behaviour.
--
-- LIVE HISTORICAL CONFLICT AUDIT — run 2026-07-31, BEFORE this migration
-- ─────────────────────────────────────────────────────────────────────────────
--   (order, doc_type) groups with >1 pending_admin_approval ......... 0
--   (order, doc_type) groups with >1 needs_correction ............... 0
--   (order, doc_type) groups with >1 current unapproved ............. 0   <- blocker
--   (order, doc_type) groups with >1 approved+customer_visible ...... 0
--   self-referencing document supersede links ....................... 0
--   dangling supersede links ........................................ 0
--   supersede cycles ................................................ 0
--   version self-reference / self-parent / orphan parent ............ 0 / 0 / 0
--   (order, doc_type) with >1 ACTIVE version ........................ 0
--   ROWS CURRENTLY IN THE INDEX SUBSET .............................. 0
--
--   The index subset is EMPTY on LIVE right now (476 documents, none in
--   pending_admin_approval or needs_correction), so index creation cannot fail
--   and repairs nothing.
--
--   REPORTED, NOT REPAIRED: 5 documents are `superseded` while still
--   customer_visible — PT-PSDWRWALQ8J (x2), PT-MQZQBUZR, PT-MR18ROL7,
--   PT-MR285V7Y, all uploaded 2026-06-30/07-01, i.e. BEFORE the approval gate
--   shipped (2026-07-29). Each has sent_to_customer=true and
--   footer_injected=true: they were genuinely DELIVERED under the pre-gate
--   regime, then superseded by a later revision. A delivered document is never
--   taken away from the customer (resolveCustomerDocuments picks the NEWEST
--   finalized letter), so this is the documented design, not a leak. They sit
--   outside every state this migration constrains and are deliberately untouched.
--
-- Idempotent and non-destructive. Adds columns, an index and two functions.
-- Deletes nothing and rewrites no historical row.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.order_documents
  add column if not exists superseded_at          timestamptz,
  add column if not exists submission_fingerprint text;

comment on column public.order_documents.superseded_at is
  'PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-001: when this submission was retired by a newer one. The row, its file and its history are preserved; only its eligibility for review ends.';

comment on column public.order_documents.submission_fingerprint is
  'Content identity of the provider submission (sha256 of the uploaded bytes, or the source URL for a link submission). Used ONLY to recognise an exact replay inside provider_submit_document_slot(); never unique-constrained, because a genuine resubmission of an unchanged file after a correction request must still be accepted.';

create index if not exists idx_order_documents_submission_fingerprint
  on public.order_documents (order_id, doc_type, submission_fingerprint)
  where submission_fingerprint is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE INVARIANT
--
--    At most ONE document per (order, doc_type) may sit in a state the Admin
--    review queue treats as a live candidate. This is the same pair of statuses
--    OrderDocumentReviewPanel selects on, so the index and the UI cannot drift:
--    if the index holds, the panel cannot render two approval cards.
--
--    Deliberately NOT extended to 'approved' or 'not_applicable'. LIVE holds 475
--    customer_visible documents, most of them pre-gate `not_applicable` rows, and
--    an index over delivered documents would either fail to create or would
--    demand a historical repair this task is not authorised to make.
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists uq_order_documents_one_current_unapproved
  on public.order_documents (order_id, doc_type)
  where review_status in ('pending_admin_approval', 'needs_correction');

comment on index public.uq_order_documents_one_current_unapproved is
  'PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-001: exactly one current review candidate per order and document class. Makes a second Approve & Deliver card structurally impossible, independent of any application code.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The atomic submission slot
--
--    Replaces provider-submit-letter's read-then-insert-then-update sequence
--    with one transaction that: takes the order+type lock, recognises a replay,
--    refuses to silently replace a delivered document, retires every current
--    unapproved row, and inserts the replacement.
--
--    AUTHORISATION IS DELIBERATELY *NOT* THE PROVIDER CHECK. This function is
--    service_role-only and assumes its caller has already proven the submitter
--    is the assigned provider for the order — provider-submit-letter does that
--    against doctor_user_id / doctor_email before it ever gets here. Duplicating
--    that check here on auth.uid() would be wrong, not stricter: the edge
--    function calls this with the service role, so auth.uid() is null.
--
--    Authorised by CAPABILITY (auth.role()), never by comparing a bearer token
--    to SUPABASE_SERVICE_ROLE_KEY — LIVE carries BOTH a legacy JWT and
--    sb_secret_ keys, so a string compare is not a reliable identity test. Same
--    rule auto_deliver_order_document() follows.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.provider_submit_document_slot(
  p_order_id               uuid,
  p_confirmation_id        text,
  p_doc_type               text,
  p_label                  text,
  p_file_url               text,
  p_file_path              text    default null,
  p_mime_type              text    default null,
  p_file_size_bytes        integer default null,
  p_notes                  text    default null,
  p_uploaded_by            text    default null,
  p_submitted_by           uuid    default null,
  p_submission_fingerprint text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_id     uuid := gen_random_uuid();
  v_order      public.orders;
  v_existing   public.order_documents;
  v_approved   public.order_documents;
  v_superseded uuid[] := '{}';
  v_fp         text   := nullif(btrim(coalesce(p_submission_fingerprint, '')), '');
  v_reopened   boolean := false;
  v_addpet     boolean := false;
  v_since      timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'provider_submit_document_slot: service role required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_order_id is null or p_doc_type is null or btrim(coalesce(p_file_url, '')) = '' then
    raise exception 'provider_submit_document_slot: order id, doc type and file url are required'
      using errcode = 'null_value_not_allowed';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'provider_submit_document_slot: order % not found', p_order_id;
  end if;

  -- ONE writer per (order, document class) for the rest of this transaction.
  -- Same key construction as create_document_version()/activate_document_version()
  -- so a submission that later creates a version re-enters the SAME lock rather
  -- than taking a second, differently-derived one.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text || ':' || p_doc_type, 0));

  -- ── 3a. REPLAY ──────────────────────────────────────────────────────────────
  -- The SAME BYTES for the same order and document class, where the row that
  -- already holds them has NOT been sent back for changes, is a replay: the
  -- retry, the double-click, the resent request. Return what already exists and
  -- create nothing — no second document, no second version, no second
  -- verification ID, no second notification.
  --
  -- `approved` is included alongside `pending_admin_approval` because of the
  -- Employee Letter Quality Check toggle. With the gate OFF, submission IS
  -- delivery: provider-submit-letter calls auto_deliver_order_document() in the
  -- same request, so by the time a replay arrives the row is already `approved`.
  -- Matching only `pending_admin_approval` would drop that replay through to the
  -- delivered-document guard below and answer a harmless retry with "this order
  -- needs a reopen". Returning it as the no-op it is, is both truthful and safer;
  -- nothing is written either way, and the downstream auto-delivery call is
  -- itself idempotent, so no second customer email can follow.
  --
  -- `needs_correction` is deliberately EXCLUDED, and that exclusion is the
  -- product decision rather than an oversight. If the same bytes arrive while
  -- the row sits at `needs_correction`, an employee has explicitly asked for a
  -- change; swallowing that as a replay would park the document in the
  -- correction state while telling the provider it was resubmitted, and the
  -- order would never return to the review queue. It is therefore treated as a
  -- genuine (if unproductive) resubmission and supersedes normally below.
  if v_fp is not null then
    select * into v_existing
      from public.order_documents
     where order_id = p_order_id
       and doc_type = p_doc_type
       and submission_fingerprint = v_fp
       and review_status in ('pending_admin_approval', 'approved')
     order by uploaded_at desc
     limit 1;

    if found then
      return jsonb_build_object(
        'created',                 false,
        'replayed',                true,
        'rejected',                false,
        'document_id',             v_existing.id,
        'file_url',                v_existing.file_url,
        'review_status',           v_existing.review_status,
        'superseded_document_ids', '[]'::jsonb,
        'superseded_count',        0,
        'reason',                  case when v_existing.review_status = 'approved'
                                        then 'identical_submission_already_delivered'
                                        else 'identical_submission_already_pending' end);
    end if;
  end if;

  -- ── 3b. A DELIVERED DOCUMENT IS NOT SILENTLY REPLACEABLE ───────────────────
  -- The customer already holds this letter and a landlord may already have
  -- verified it. An ordinary provider re-upload must not quietly mint a
  -- replacement; that requires a deliberate reopen.
  select * into v_approved
    from public.order_documents
   where order_id = p_order_id
     and doc_type = p_doc_type
     and review_status = 'approved'
     and coalesce(customer_visible, false)
   order by approved_at desc nulls last
   limit 1;

  if found then
    -- The exemptions are the two workflows that legitimately produce a new
    -- version of an already-delivered letter. Both are compared against the
    -- delivery time, so a reopen from BEFORE this delivery cannot be reused to
    -- authorise a later replacement. Reopen is read from authoritative
    -- timestamps, never inferred from the order's current status.
    v_since := coalesce(v_approved.approved_at, v_approved.delivered_at, v_approved.uploaded_at);

    v_reopened :=
         (v_order.official_letter_reopened_at is not null
          and v_order.official_letter_final_completed_at is null
          and v_order.official_letter_reopened_at > v_since)
      or (v_order.last_reopened_at is not null
          and v_order.last_reopened_at > v_since);

    select exists (
      select 1 from public.order_additional_pet_requests
       where order_id = p_order_id
         and status = 'approved_pending_document'
    ) into v_addpet;

    if not (v_reopened or v_addpet) then
      return jsonb_build_object(
        'created',                 false,
        'replayed',                false,
        'rejected',                true,
        'document_id',             v_approved.id,
        'file_url',                v_approved.file_url,
        'review_status',           v_approved.review_status,
        'superseded_document_ids', '[]'::jsonb,
        'superseded_count',        0,
        'reason',                  'approved_document_requires_reopen');
    end if;
  end if;

  -- ── 3c. RETIRE every current unapproved row ────────────────────────────────
  -- `in (...)` rather than `= 'needs_correction'` is the literal defect fix, but
  -- it only holds because of the lock above and the index in §2.
  --
  -- Runs BEFORE the insert so the partial unique index never sees two rows in a
  -- constrained state, which is also why the replacement's id is generated up
  -- front: the retired rows must point AT it.
  --
  -- The row, its file_url, its file_path, its provider notes and its correction
  -- note are all left intact. Only eligibility ends.
  with retired as (
    update public.order_documents
       set review_status              = 'superseded',
           customer_visible           = false,
           superseded_by_document_id  = v_new_id,
           superseded_at              = now()
     where order_id = p_order_id
       and doc_type = p_doc_type
       and review_status in ('pending_admin_approval', 'needs_correction')
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_superseded from retired;

  -- ── 3d. The new current review candidate ───────────────────────────────────
  insert into public.order_documents (
    id, order_id, confirmation_id, label, doc_type, file_url, file_path,
    mime_type, file_size_bytes, notes, uploaded_by,
    sent_to_customer, customer_visible, footer_injected,
    review_status, submitted_by, submitted_at, submission_fingerprint
  ) values (
    v_new_id, p_order_id, p_confirmation_id, p_label, p_doc_type, p_file_url, p_file_path,
    p_mime_type, p_file_size_bytes, p_notes, p_uploaded_by,
    false, false, false,
    'pending_admin_approval', p_submitted_by, now(), v_fp
  );

  -- ── 3e. Audit the replacement ──────────────────────────────────────────────
  -- Only when something was actually retired: a first submission is already
  -- audited by the caller as provider_document_submitted, and a second row here
  -- would double-count it. actor_name is NOT NULL on audit_logs.
  if coalesce(array_length(v_superseded, 1), 0) > 0 then
    insert into public.audit_logs (
      actor_name, actor_role, actor_type, category, source,
      object_type, object_id, order_id, entity_type, entity_id, document_id,
      action, description, old_values, new_values, metadata
    ) values (
      coalesce(nullif(btrim(coalesce(p_uploaded_by, '')), ''), 'Provider'),
      'provider', 'provider', 'documents', 'provider_portal',
      'order_document', p_confirmation_id, p_order_id,
      'order_document', v_new_id, v_new_id,
      'provider_document_superseded_by_resubmission',
      format('A newer %s submission replaced %s earlier submission(s) awaiting review for order %s. The earlier document(s) and file(s) are preserved and are no longer eligible for approval.',
             p_doc_type, coalesce(array_length(v_superseded, 1), 0), p_confirmation_id),
      jsonb_build_object('review_status', 'pending_admin_approval or needs_correction'),
      jsonb_build_object('review_status', 'superseded', 'customer_visible', false),
      jsonb_build_object(
        'order_id',                p_order_id,
        'confirmation_id',         p_confirmation_id,
        'doc_type',                p_doc_type,
        'document_id',             v_new_id,
        'superseded_document_ids', to_jsonb(v_superseded),
        'superseded_count',        coalesce(array_length(v_superseded, 1), 0))
    );
  end if;

  return jsonb_build_object(
    'created',                 true,
    'replayed',                false,
    'rejected',                false,
    'document_id',             v_new_id,
    'file_url',                p_file_url,
    'review_status',           'pending_admin_approval',
    'superseded_document_ids', to_jsonb(v_superseded),
    'superseded_count',        coalesce(array_length(v_superseded, 1), 0),
    'reason',                  case when coalesce(array_length(v_superseded, 1), 0) > 0
                                    then 'replaced_current_unapproved'
                                    else 'first_current_submission' end);
end;
$$;

-- Revoke BY NAME from every role — revoking "from public" alone does NOT undo
-- PostgreSQL's default explicit EXECUTE grant. No signed-in user may call this;
-- the only caller is provider-submit-letter on the service role.
revoke all on function public.provider_submit_document_slot(
  uuid, text, text, text, text, text, text, integer, text, text, uuid, text)
  from public, anon, authenticated;

comment on function public.provider_submit_document_slot(
  uuid, text, text, text, text, text, text, integer, text, text, uuid, text) is
  'PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-001: atomic provider submission slot. Under one order+doc_type advisory lock it recognises an exact replay, refuses to silently replace a delivered document, retires every current unapproved submission (preserving the rows and files) and inserts the single new review candidate. service_role only; the caller must already have verified the provider owns the order.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Invariant reporter
--
--    A read-only check any future audit can call, so "exactly one current
--    candidate" is verifiable on demand instead of being re-derived by hand.
--
--    Revoked from EVERY role including authenticated: get_advisors(security)
--    correctly flags a SECURITY DEFINER function reachable at /rest/v1/rpc/ by
--    any signed-in user, and no UI calls this. Callers are service-role SQL and
--    the guard suite only.
--
--    NOTE for LIVE: `superseded_but_customer_visible` reports 5 on LIVE. Those
--    are the pre-gate delivered letters described in the header — expected, not
--    a defect. The blocker field is `groups_with_multiple_unapproved`.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.audit_order_document_current_conflicts()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with per_group as (
    select order_id, doc_type,
           count(*) filter (where review_status = 'pending_admin_approval') as n_pending,
           count(*) filter (where review_status in ('pending_admin_approval','needs_correction')) as n_unapproved
      from public.order_documents
     where order_id is not null
     group by order_id, doc_type
  )
  select jsonb_build_object(
    'groups_with_multiple_pending',    (select count(*) from per_group where n_pending > 1),
    'groups_with_multiple_unapproved', (select count(*) from per_group where n_unapproved > 1),
    'superseded_but_customer_visible',
      (select count(*) from public.order_documents
        where review_status = 'superseded' and coalesce(customer_visible, false)),
    'self_referencing_supersede_links',
      (select count(*) from public.order_documents where superseded_by_document_id = id),
    'checked_at', now());
$$;

revoke all on function public.audit_order_document_current_conflicts() from public, anon, authenticated;

commit;
