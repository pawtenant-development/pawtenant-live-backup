-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 8)
--
-- Performance advisors, run after the work was done, flagged three things on
-- the tables this task added. None is a correctness problem; all three are
-- cheap, and leaving new advisor debt behind is how it accumulates.
--
--   1. auth_rls_initplan — a policy that calls auth.uid() / is_chat_admin()
--      directly re-evaluates it PER ROW. Wrapping each in a scalar sub-select
--      makes PostgreSQL compute it once per query (an InitPlan).
--   2. multiple_permissive_policies — partner_users carried TWO permissive
--      SELECT policies for `authenticated`, so both were evaluated for every
--      row. The semantics are an OR, so ONE policy expresses it exactly.
--   3. unindexed_foreign_keys on the two new tables.
--
-- The isolation is unchanged and was re-proved with RLS enforced afterwards:
-- a partner user still sees exactly their own membership row, no colleague's,
-- no billing profile and no draft row.
drop policy if exists partner_users_admin_read on public.partner_users;
drop policy if exists partner_users_self_read  on public.partner_users;

-- An admin sees every membership; a partner user sees THEIR OWN row and
-- nothing else — not a colleague's, and never another organisation's.
create policy partner_users_read on public.partner_users
  for select to authenticated
  using ((select public.is_chat_admin()) or user_id = (select auth.uid()));

drop policy if exists partner_billing_profiles_admin_read on public.partner_billing_profiles;
create policy partner_billing_profiles_admin_read on public.partner_billing_profiles
  for select to authenticated using ((select public.is_chat_admin()));

drop policy if exists partner_order_drafts_admin_read on public.partner_order_drafts;
create policy partner_order_drafts_admin_read on public.partner_order_drafts
  for select to authenticated using ((select public.is_chat_admin()));

drop policy if exists partner_recon_admin_read on public.partner_order_reconciliations;
create policy partner_recon_admin_read on public.partner_order_reconciliations
  for select to authenticated using ((select public.is_chat_admin()));

create index if not exists partner_order_drafts_submitted_order_idx
  on public.partner_order_drafts (submitted_order_id) where submitted_order_id is not null;
create index if not exists partner_recon_partner_idx
  on public.partner_order_reconciliations (partner_id);
