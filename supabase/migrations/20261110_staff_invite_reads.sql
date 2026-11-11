-- OweWise: staff invite read functions and tighter accept rules (2026-11-10)
--
-- ALREADY APPLIED to Supabase project cfbblqvtjnmwsxdqlkiv as migration
-- "staff_invite_reads_and_hardening", after 20261110_staff_roles.sql. Do not apply it again.
--
-- Why: the invited person had no way to find their invite (only the owner can read
-- business_invites), and the owner could not see staff emails (business_members has user ids).
--
-- Also tightens accept_staff_invite:
--   * the invited person's email must be CONFIRMED (stops someone registering another
--     person's address and claiming the invite),
--   * a business owner cannot join another shop as staff (their own business always wins),
--   * a person can be staff of one shop only,
--   * a suspended business cannot take on staff.

-- Owner: staff of my business, with email.
create or replace function public.list_staff()
returns table(user_id uuid, email text, joined_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select m.user_id, u.email::text, m.created_at
    from public.business_members m
    join auth.users u on u.id = m.user_id
   where m.business_id = public.my_business_id()
   order by m.created_at
$$;

-- Invited person: pending invites addressed to my confirmed email.
create or replace function public.my_staff_invites()
returns table(id uuid, business_name text, expires_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select i.id, b.name, i.expires_at
    from public.business_invites i
    join public.businesses b on b.id = i.business_id
    join auth.users u on u.id = (select auth.uid())
   where i.status = 'pending'
     and i.expires_at > now()
     and b.status = 'active'
     and u.email_confirmed_at is not null
     and lower(u.email) = i.email
   order by i.created_at desc
$$;

create or replace function public.accept_staff_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare r record; my_email text; confirmed timestamptz;
begin
  select lower(email), email_confirmed_at into my_email, confirmed from auth.users where id = (select auth.uid());
  if my_email is null or confirmed is null then raise exception 'email_not_confirmed' using errcode = 'P0001'; end if;
  select * into r from public.business_invites where id = p_invite and status = 'pending' for update;
  if not found or r.expires_at < now() then raise exception 'invite_invalid' using errcode = 'P0001'; end if;
  if r.email <> my_email then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.businesses where owner_id = (select auth.uid())) then
    raise exception 'already_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.business_members where user_id = (select auth.uid())) then
    raise exception 'already_staff' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.businesses where id = r.business_id and status <> 'active') then
    raise exception 'business_suspended' using errcode = 'P0001';
  end if;
  insert into public.business_members(business_id, user_id, invited_by)
    values (r.business_id, (select auth.uid()), r.invited_by);
  update public.business_invites set status = 'accepted', accepted_at = now() where id = r.id;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (r.business_id, (select auth.uid()), 'business_members', r.id, 'staff_joined', jsonb_build_object('email', my_email));
  return r.business_id;
end $$;

-- Staff member leaves their shop (back to a normal customer account).
create or replace function public.leave_business()
returns void language plpgsql security definer set search_path to '' as $$
declare b uuid;
begin
  delete from public.business_members where user_id = (select auth.uid()) returning business_id into b;
  if b is not null then
    insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
      values (b, (select auth.uid()), 'business_members', null, 'staff_left', '{}'::jsonb);
  end if;
end $$;

revoke all on function public.list_staff(), public.my_staff_invites(), public.accept_staff_invite(uuid), public.leave_business() from public, anon;
grant execute on function public.list_staff(), public.my_staff_invites(), public.accept_staff_invite(uuid), public.leave_business() to authenticated;
