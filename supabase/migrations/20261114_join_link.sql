-- OweWise: general join link with name-only joining and a WhatsApp code check (2026-11-14)
--
-- Applied live to project cfbblqvtjnmwsxdqlkiv (two steps: join_link_with_code_check, join_link_allow_resend_after_lock;
-- this file is the final state). Do not apply again.
--
-- Flow: the owner shares one link for the whole business. A customer opens it, signs in, and types
-- ONLY their name (no phone number). The owner or staff see "X wants to connect" and pick which of
-- their existing customers that is. The app then makes a one-time 6-digit code that the business
-- sends by WhatsApp to the phone number it already has on file. The customer types the code; only then
-- is their account linked to that customer record and their debts appear. The code is stored hashed,
-- works once, expires after 24 hours, and locks after 5 wrong tries. Nothing in the replies ever
-- says whether a name or number matches a customer.

create table if not exists public.business_join_links (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  token text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.business_join_links enable row level security;
revoke all on public.business_join_links from anon, authenticated;

create table if not exists public.business_join_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'pending' check (status in ('pending','code_sent','connected','ignored','locked')),
  customer_id uuid references public.business_customers(id) on delete set null,
  code_hash text,
  code_expires_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
alter table public.business_join_requests enable row level security;
revoke all on public.business_join_requests from anon, authenticated;
create index if not exists business_join_requests_biz_idx on public.business_join_requests(business_id, status);

-- ---------- Owner: manage the link ----------
create or replace function public.get_join_link()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id(); l public.business_join_links;
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.business_join_links where business_id = bid;
  if l.business_id is null then
    insert into public.business_join_links(business_id, token)
      values (bid, replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
      returning * into l;
  end if;
  return jsonb_build_object('token', l.token, 'enabled', l.enabled);
end $$;

create or replace function public.reset_join_link()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id(); t text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.business_join_links(business_id, token) values (bid, t)
    on conflict (business_id) do update set token = excluded.token, enabled = true, created_at = now();
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (bid, (select auth.uid()), 'business_join_links', null, 'join_link_reset', '{}'::jsonb);
  return jsonb_build_object('token', t, 'enabled', true);
end $$;

create or replace function public.set_join_link_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id();
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.get_join_link();
  update public.business_join_links set enabled = coalesce(p_enabled, false) where business_id = bid;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (bid, (select auth.uid()), 'business_join_links', null, case when p_enabled then 'join_link_on' else 'join_link_off' end, '{}'::jsonb);
end $$;

-- ---------- Customer: ask to connect (name only) ----------
create or replace function public.request_join(p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare uid uuid := (select auth.uid()); acct text; l public.business_join_links; b public.businesses; r public.business_join_requests;
        n text := btrim(coalesce(p_name,''));
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  perform public._rate('join:' || uid, 20);
  select account_type into acct from public.profiles where id = uid;
  if acct is distinct from 'customer' then raise exception 'customer_account_required' using errcode = 'P0001'; end if;
  select * into l from public.business_join_links where token = coalesce(p_token,'') and enabled;
  if l.business_id is null then raise exception 'invalid_or_expired_link' using errcode = 'P0001'; end if;
  select * into b from public.businesses where id = l.business_id and status = 'active';
  if b.id is null then raise exception 'invalid_or_expired_link' using errcode = 'P0001'; end if;
  if char_length(n) < 1 or char_length(n) > 120 then raise exception 'name_required' using errcode = 'P0001'; end if;
  select * into r from public.business_join_requests where business_id = b.id and user_id = uid;
  if r.id is null then
    if (select count(*) from public.business_join_requests where business_id = b.id and created_at > now() - interval '24 hours') >= 100 then
      raise exception 'join_limit_reached' using errcode = 'P0001';
    end if;
    insert into public.business_join_requests(business_id, user_id, name) values (b.id, uid, left(n,120)) returning * into r;
  elsif r.status in ('pending','code_sent') then
    update public.business_join_requests set name = left(n,120), updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('business_name', b.name, 'status', case when r.status = 'connected' then 'connected' else 'waiting' end);
end $$;

-- The customer's own open requests (an ignored request looks like a waiting one, on purpose).
create or replace function public.my_join_requests()
returns table(id uuid, business_name text, status text)
language sql stable security definer set search_path to '' as $$
  select r.id, b.name,
         case when r.status = 'code_sent' and r.code_expires_at > now() then 'code_sent'
              when r.status = 'locked' then 'locked'
              else 'waiting' end
    from public.business_join_requests r
    join public.businesses b on b.id = r.business_id
   where r.user_id = (select auth.uid()) and r.status <> 'connected'
   order by r.created_at desc
$$;

-- ---------- Business (owner or staff): see and match requests ----------
create or replace function public.list_join_requests()
returns table(id uuid, name text, status text, created_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select r.id, r.name, r.status, r.created_at
    from public.business_join_requests r
   where r.business_id = public.acting_business_id()
     and r.status in ('pending','code_sent','locked')
   order by r.created_at desc
   limit 100
$$;

create or replace function public.match_join_request(p_request uuid, p_customer uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r public.business_join_requests; c public.business_customers; code text;
begin
  select * into r from public.business_join_requests where id = p_request for update;
  if r.id is null or not public.can_work_business(r.business_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if r.status not in ('pending','code_sent','locked') then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform public._rate('joinmatch:' || r.business_id, 200);
  select * into c from public.business_customers where id = p_customer and business_id = r.business_id;
  if c.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if c.customer_user_id is not null then raise exception 'customer_already_linked' using errcode = 'P0001'; end if;
  code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  update public.business_join_requests
     set status = 'code_sent', customer_id = c.id, attempts = 0, updated_at = now(),
         code_expires_at = now() + interval '24 hours',
         code_hash = encode(extensions.digest(code || ':' || r.id::text, 'sha256'), 'hex')
   where id = r.id;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (r.business_id, (select auth.uid()), 'business_join_requests', r.id, 'join_code_issued', jsonb_build_object('customer_id', c.id));
  return jsonb_build_object('code', code, 'phone', c.phone, 'customer_name', c.name);
end $$;

create or replace function public.ignore_join_request(p_request uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare r public.business_join_requests;
begin
  select * into r from public.business_join_requests where id = p_request for update;
  if r.id is null or not public.can_work_business(r.business_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.business_join_requests set status = 'ignored', code_hash = null, updated_at = now() where id = r.id and status in ('pending','code_sent','locked');
end $$;

-- ---------- Customer: type the code ----------
-- Wrong codes come back as ok=false (not an exception) so the attempt count is kept.
create or replace function public.confirm_join_code(p_request uuid, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare uid uuid := (select auth.uid()); r public.business_join_requests; c public.business_customers; b public.businesses;
        want text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  perform public._rate('joincode:' || uid, 30);
  select * into r from public.business_join_requests where id = p_request and user_id = uid for update;
  if r.id is null or r.status <> 'code_sent' or r.code_hash is null then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if r.code_expires_at <= now() then
    update public.business_join_requests set status = 'pending', code_hash = null, updated_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;
  want := encode(extensions.digest(btrim(coalesce(p_code,'')) || ':' || r.id::text, 'sha256'), 'hex');
  if want <> r.code_hash then
    if r.attempts + 1 >= 5 then
      update public.business_join_requests set status = 'locked', code_hash = null, attempts = r.attempts + 1, updated_at = now() where id = r.id;
      return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
    end if;
    update public.business_join_requests set attempts = r.attempts + 1, updated_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  select * into c from public.business_customers where id = r.customer_id for update;
  if c.id is null or (c.customer_user_id is not null and c.customer_user_id <> uid) then
    update public.business_join_requests set status = 'pending', code_hash = null, updated_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  update public.business_customers set customer_user_id = uid where id = c.id;
  update public.business_debts set customer_user_id = uid, claimed_at = coalesce(claimed_at, now()), updated_at = now()
   where business_customer_id = c.id and customer_user_id is null and cancelled_at is null;
  update public.business_join_requests set status = 'connected', code_hash = null, updated_at = now() where id = r.id;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (r.business_id, uid, 'business_join_requests', r.id, 'customer_connected', jsonb_build_object('customer_id', c.id));
  select * into b from public.businesses where id = r.business_id;
  return jsonb_build_object('ok', true, 'business_name', b.name);
end $$;

revoke all on function public.get_join_link(), public.reset_join_link(), public.set_join_link_enabled(boolean), public.request_join(text,text),
  public.my_join_requests(), public.list_join_requests(), public.match_join_request(uuid,uuid), public.ignore_join_request(uuid),
  public.confirm_join_code(uuid,text) from public, anon;
grant execute on function public.get_join_link(), public.reset_join_link(), public.set_join_link_enabled(boolean), public.request_join(text,text),
  public.my_join_requests(), public.list_join_requests(), public.match_join_request(uuid,uuid), public.ignore_join_request(uuid),
  public.confirm_join_code(uuid,text) to authenticated;
