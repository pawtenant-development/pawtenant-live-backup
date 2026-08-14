-- QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 / F5
-- TEST-only generator privilege and search_path hardening.

begin;

do $preflight$
begin
  if to_regprocedure('public.generate_letter_verification_id(text)') is null then
    raise exception 'preflight: generator is missing';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.generate_letter_verification_id(text)'::regprocedure
      and prosecdef and pg_get_userbyid(proowner) = 'postgres'
  ) then
    raise exception 'preflight: generator security/owner drift';
  end if;
end
$preflight$;

create or replace function public.generate_letter_verification_id(p_state text)
returns text
language plpgsql
security definer
set search_path = ''
as $generate_letter_verification_id$
declare
  v_state_code text;
  v_random text;
  v_letter_id text;
  v_exists boolean;
  v_attempts int := 0;
  v_max int := 20;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len int;
  v_i int;
begin
  v_state_code := pg_catalog.upper(
    pg_catalog.regexp_replace(pg_catalog.left(p_state, 2), '[^A-Za-z]', '', 'g')
  );
  if pg_catalog.length(v_state_code) < 2 then
    v_state_code := 'XX';
  end if;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > v_max then
      raise exception 'generate_letter_verification_id: could not generate unique ID after % attempts', v_max;
    end if;
    v_random := '';
    v_len := 7;
    for v_i in 1..v_len loop
      v_random := v_random || pg_catalog.substr(
        v_chars,
        pg_catalog.floor(pg_catalog.random() * pg_catalog.length(v_chars))::int + 1,
        1
      );
    end loop;
    v_letter_id := 'ESA-' || v_state_code || '-' || v_random;
    select exists (
      select 1 from public.letter_verifications where letter_id = v_letter_id
    ) into v_exists;
    exit when not v_exists;
  end loop;
  return v_letter_id;
end;
$generate_letter_verification_id$;

revoke all on function public.generate_letter_verification_id(text) from public, anon, authenticated;
grant execute on function public.generate_letter_verification_id(text) to service_role;

do $postflight$
declare
  v_id text;
begin
  if has_function_privilege('public', 'public.generate_letter_verification_id(text)', 'execute')
     or has_function_privilege('anon', 'public.generate_letter_verification_id(text)', 'execute')
     or has_function_privilege('authenticated', 'public.generate_letter_verification_id(text)', 'execute')
     or not has_function_privilege('service_role', 'public.generate_letter_verification_id(text)', 'execute') then
    raise exception 'postflight: generator ACL is wrong';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.generate_letter_verification_id(text)'::regprocedure
      and prosecdef and pg_get_userbyid(proowner) = 'postgres'
      and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'postflight: generator search_path/security state is wrong';
  end if;
  v_id := public.generate_letter_verification_id('CA');
  if v_id !~ '^ESA-CA-[A-HJ-NP-Z2-9]{7}$' then raise exception 'bad CA id: %', v_id; end if;
  v_id := public.generate_letter_verification_id('ZZ');
  if v_id !~ '^ESA-ZZ-[A-HJ-NP-Z2-9]{7}$' then raise exception 'bad ZZ id: %', v_id; end if;
  v_id := public.generate_letter_verification_id('9');
  if v_id !~ '^ESA-XX-[A-HJ-NP-Z2-9]{7}$' then raise exception 'bad XX fallback: %', v_id; end if;
end
$postflight$;

commit;
