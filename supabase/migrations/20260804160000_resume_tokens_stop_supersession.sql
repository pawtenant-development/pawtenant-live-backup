-- ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001 — emergency mitigation (step 1)
--
-- ROOT CAUSE (measured on LIVE 2026-08-04):
--   134 resume tokens issued since 2026-08-02.
--     used            : 11
--     expired unused  :  1     <- expiry is NOT the problem
--     revoked         : 40, of which 39 = 'superseded_by_new_token'
--   43 of 90 orders (48%) hold 2+ tokens, and 40 UNPAID orders currently have a
--   customer holding at least one dead link.
--
--   `issue_order_resume_token` revoked every prior UNUSED token for the same
--   (order, purpose) each time a new one was minted. The lead-followup drip
--   sends 30min / 24h / 48h / 3day / 5day plus SMS, and each send minted a new
--   token — so the 30-minute email's link died the instant the 24-hour email
--   went out. A customer scrolling back to an earlier message got
--   "Link expired or not found".
--
--   Note this is SUPERSESSION, not expiry or consumption. Lengthening the TTL
--   would not have fixed it.
--
-- WHAT THIS CHANGES:
--   Drop the supersession UPDATE. Every link a customer was ever sent keeps
--   working until it is used once or expires normally.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE:
--   Tokens stay single-use, order-bound, purpose-bound, environment-bound and
--   expiring. `consume_order_resume_token` is untouched. Admin revocation via
--   `revoke_order_resume_tokens` is untouched. This only stops the system from
--   revoking links the customer still holds.
--
--   The security delta is that an order may now have several live single-use
--   tokens at once instead of exactly one. Each remains independently bounded,
--   so the blast radius of any single leaked token is unchanged.
--
-- This is step 1 of the stable `/checkout/<slug>` replacement, not a substitute
-- for it. Forward-only; safe to re-run.

create or replace function public.issue_order_resume_token(
  p_order_id uuid, p_purpose text, p_token_hash text,
  p_environment text, p_ttl_minutes integer, p_created_by text default 'system'
) returns table (token_id uuid, expires_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare v_ttl integer := least(greatest(coalesce(p_ttl_minutes, 1440), 5), 4320);
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then raise exception 'invalid token digest'; end if;
  if p_purpose not in ('resume_checkout','resume_assessment') then raise exception 'invalid purpose'; end if;
  if p_environment not in ('test','live') then raise exception 'invalid environment'; end if;
  if not public.order_is_resumable(p_order_id) then raise exception 'order is not resumable'; end if;

  -- ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001: the supersession UPDATE that
  -- used to sit here has been REMOVED. Issuing a new token must never kill a
  -- link the customer is still holding in an older email or SMS.

  return query
  insert into public.order_resume_tokens
    (order_id, purpose, token_hash, environment, expires_at, created_by)
  values
    (p_order_id, p_purpose, p_token_hash, p_environment,
     now() + make_interval(mins => v_ttl), coalesce(p_created_by,'system'))
  returning id, order_resume_tokens.expires_at;
end;
$$;

revoke all on function public.issue_order_resume_token(uuid, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.issue_order_resume_token(uuid, text, text, text, integer, text)
  to service_role;

comment on function public.issue_order_resume_token(uuid, text, text, text, integer, text) is
  'Mints a single-use, order/purpose/environment-bound resume token. Does NOT revoke prior unused tokens — see ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001.';
