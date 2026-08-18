-- ESA-TWO-PET-129-PRICING-001
--
-- A server-issued trusted quote is honoured when a customer RESUMES an unpaid
-- checkout, so a legitimately retired price survives. It resolved by
-- confirmation_id ALONE, which under the new ESA tiering becomes a stale-price
-- bug: a customer who was quoted 3 pets ($149) and then removed a pet would
-- still resume at $149 instead of the correct $129.
--
-- This adds a pet-count-aware resolver. A stored quote is honoured only when its
-- pet_count matches the count being priced right now. Legacy quotes that carry a
-- NULL pet_count keep the previous behaviour, so no existing unpaid lead is
-- repriced as a side effect of this change.
--
-- PAID ORDERS ARE UNTOUCHED: the underlying predicate still requires
-- o.paid_at is null and o.payment_intent_id is null. Nothing here reads, writes
-- or recalculates a historical paid order.
--
-- The original single-argument function is left in place unchanged.

create or replace function public.trusted_price_quote_cents(
  p_confirmation_id text,
  p_pet_count integer
) returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
  select q.amount_cents
  from public.order_price_quotes q
  join public.orders o on o.id = q.order_id
  where o.confirmation_id = p_confirmation_id
    and o.paid_at is null
    and o.payment_intent_id is null
    and (q.pet_count is null or p_pet_count is null or q.pet_count = p_pet_count)
  order by q.issued_at desc
  limit 1
$function$;

-- "from public" does NOT undo the default grant to AUTHENTICATED — revoke by name.
revoke all on function public.trusted_price_quote_cents(text, integer) from public, anon, authenticated;
grant execute on function public.trusted_price_quote_cents(text, integer) to service_role;
