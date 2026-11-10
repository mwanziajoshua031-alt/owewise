-- OweWise: staff roles (2026-11-10)
--
-- ALREADY APPLIED to Supabase project cfbblqvtjnmwsxdqlkiv (owewise) in four steps:
--   add_business_staff_members_and_invites
--   fix_staff_functions_audit_columns_and_grants
--   fix_staff_audit_detail_jsonb
--   staff_access_read_and_daily_actions
-- This file is the consolidated final state of those four steps, kept here so the repo
-- documents the database. It has NOT been re-run as one file; do not apply it again to
-- the live project. It is written to be safe to re-run (create ... if not exists,
-- create or replace, drop policy if exists).
--
-- Model: one owner per business (businesses.owner_id, unchanged) plus optional staff.
-- Solo owners are unaffected. Staff belong to ONE business for now.
--
-- Staff CAN: view customers, debts, payments, receipts; add customers/debts (quick record
--   and debt request); record manual (cash/other) payments; log reminders.
-- Staff CANNOT (owner only, still checked with owns_business()): business reports,
--   M-Pesa settings and credentials, business profile, credit limits, cancelling debts,
--   reversing payments, resolving disputes, inviting/removing staff.

-- ---------------------------------------------------------------- tables

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role = 'staff'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists business_members_user_idx on public.business_members(user_id);
alter table public.business_members enable row level security;

create table if not exists public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (position('@' in email) > 1 and char_length(email) <= 254),
  invited_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index if not exists business_invites_one_pending
  on public.business_invites(business_id, lower(email)) where status = 'pending';
alter table public.business_invites enable row level security;

-- ---------------------------------------------------------------- helpers

-- owner OR staff (everyday actions only). owns_business() is untouched and stays owner-only.
create or replace function public.can_work_business(b uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.businesses where id = b and owner_id = (select auth.uid()))
      or exists (select 1 from public.business_members where business_id = b and user_id = (select auth.uid()));
$$;

create or replace function public.is_staff_of(b uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.business_members where business_id = b and user_id = (select auth.uid()));
$$;

-- The shop this user acts for: their own business first, else the one they work for.
create or replace function public.acting_business_id()
returns uuid language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select id from public.businesses where owner_id = (select auth.uid())),
    (select business_id from public.business_members where user_id = (select auth.uid()) order by created_at limit 1));
$$;

-- ---------------------------------------------------------------- policies

drop policy if exists bm_select on public.business_members;
drop policy if exists bm_delete on public.business_members;
drop policy if exists bi_select on public.business_invites;
create policy bm_select on public.business_members for select to authenticated
  using (public.owns_business(business_id) or user_id = (select auth.uid()) or public.is_admin());
create policy bm_delete on public.business_members for delete to authenticated
  using (public.owns_business(business_id));
create policy bi_select on public.business_invites for select to authenticated
  using (public.owns_business(business_id) or public.is_admin());

-- Staff may READ shop data (owner rules kept, staff added).
drop policy if exists bc_select on public.business_customers;
create policy bc_select on public.business_customers for select to authenticated
  using (public.can_work_business(business_id) or customer_user_id = (select auth.uid()) or public.is_admin());

drop policy if exists bd_select on public.business_debts;
create policy bd_select on public.business_debts for select to authenticated
  using (customer_user_id = (select auth.uid()) or public.can_work_business(business_id) or public.is_admin());

drop policy if exists bp_select on public.business_payments;
create policy bp_select on public.business_payments for select to authenticated
  using (customer_user_id = (select auth.uid()) or public.can_work_business(business_id) or public.is_admin());

drop policy if exists pr_select on public.payment_receipts;
create policy pr_select on public.payment_receipts for select to authenticated
  using (customer_user_id = (select auth.uid()) or public.can_work_business(business_id) or public.is_admin());

drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_staff_of(id) or public.is_customer_of_business(id) or public.is_admin());

-- ---------------------------------------------------------------- staff management (owner only)

create or replace function public.invite_staff(p_email text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare b uuid; e text := lower(trim(p_email)); inv uuid;
begin
  b := public.my_business_id();
  if b is null then raise exception 'no_business' using errcode = '42501'; end if;
  if e is null or position('@' in e) < 2 then raise exception 'invalid_email' using errcode = 'P0001'; end if;
  perform public._rate('invite_staff:' || (select auth.uid())::text, 20, interval '1 day');
  if (select count(*) from public.business_members where business_id = b) >= 10 then
    raise exception 'staff_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.business_invites(business_id, email) values (b, e)
    on conflict (business_id, lower(email)) where status = 'pending'
    do update set expires_at = now() + interval '7 days'
  returning id into inv;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (b, (select auth.uid()), 'business_invites', inv, 'staff_invited', jsonb_build_object('email', e));
  return inv;
end $$;

-- The invited person accepts. Their signed-in email must match the invite.
create or replace function public.accept_staff_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare r record; my_email text;
begin
  select lower(email) into my_email from auth.users where id = (select auth.uid());
  select * into r from public.business_invites where id = p_invite and status = 'pending' for update;
  if not found or r.expires_at < now() then raise exception 'invite_invalid' using errcode = 'P0001'; end if;
  if r.email <> my_email then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.businesses where id = r.business_id and owner_id = (select auth.uid())) then
    raise exception 'already_owner' using errcode = 'P0001';
  end if;
  insert into public.business_members(business_id, user_id, invited_by)
    values (r.business_id, (select auth.uid()), r.invited_by) on conflict do nothing;
  update public.business_invites set status = 'accepted', accepted_at = now() where id = r.id;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (r.business_id, (select auth.uid()), 'business_members', r.id, 'staff_joined', jsonb_build_object('email', my_email));
  return r.business_id;
end $$;

create or replace function public.revoke_staff_invite(p_invite uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update public.business_invites set status = 'revoked'
   where id = p_invite and status = 'pending' and public.owns_business(business_id);
end $$;

create or replace function public.remove_staff(p_user uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare b uuid := public.my_business_id();
begin
  if b is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.business_members where business_id = b and user_id = p_user;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (b, (select auth.uid()), 'business_members', null, 'staff_removed', jsonb_build_object('user_id', p_user));
end $$;

-- ---------------------------------------------------------------- daily actions: owner OR staff

create or replace function public.create_debt_request(p_name text, p_phone text, p_email text, p_amount numeric, p_currency text, p_description text, p_incurred date, p_due date, p_invoice_path text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare uid uuid := (select auth.uid()); b public.businesses; ph text := public.normalize_phone(p_phone); bc public.business_customers; tok text; did uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.businesses where id = public.acting_business_id();
  if b.id is null then raise exception 'not_a_business'; end if;
  if b.status<>'active' then raise exception 'business_suspended'; end if;
  perform public._rate('debtreq:'||b.id, 60);
  if ph is null then raise exception 'invalid_phone'; end if;
  if char_length(btrim(coalesce(p_name,''))) < 1 then raise exception 'name_required'; end if;
  if p_amount is null or p_amount<=0 or p_amount>100000000 then raise exception 'invalid_amount'; end if;
  if p_invoice_path is not null and split_part(p_invoice_path,'/',1) <> b.id::text then raise exception 'invalid_invoice_path'; end if;
  insert into public.business_customers(business_id,name,phone,email) values (b.id,left(btrim(p_name),120),ph,nullif(left(p_email,200),''))
    on conflict (business_id,phone) do update set name=excluded.name, email=coalesce(excluded.email,public.business_customers.email)
    returning * into bc;
  if bc.customer_user_id = uid then raise exception 'cannot_bill_yourself'; end if;
  perform public._credit_ok(bc.id, coalesce(p_currency,'KES'), round(p_amount,2));
  if bc.customer_user_id is null then tok := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''); end if;
  insert into public.business_debts(id,business_id,business_customer_id,customer_user_id,customer_name,customer_phone,amount,currency,description,incurred_on,due_date,invoice_path,claim_token_hash,claim_expires_at,claimed_at,created_by)
  values (did,b.id,bc.id,bc.customer_user_id,bc.name,bc.phone,round(p_amount,2),coalesce(p_currency,'KES'),btrim(p_description),coalesce(p_incurred,(now() at time zone 'Africa/Nairobi')::date),p_due,p_invoice_path,
          case when tok is null then null else encode(extensions.digest(tok,'sha256'),'hex') end,
          case when tok is null then null else now()+interval '30 days' end,
          case when bc.customer_user_id is null then null else now() end, uid);
  if bc.customer_user_id is not null then
    perform public._notify(bc.customer_user_id,'debt_request','New debt request from '||b.name, 'Please review and confirm or dispute it.', did, 'debtreq:'||did);
  end if;
  return jsonb_build_object('debt_id',did,'claim_token',tok,'linked',bc.customer_user_id is not null);
end $$;

create or replace function public.create_quick_debt(p_name text, p_phone text, p_amount numeric, p_currency text, p_description text, p_incurred date, p_due date)
returns uuid language plpgsql security definer set search_path to '' as $$
declare uid uuid := (select auth.uid()); b public.businesses; ph text := public.normalize_phone(p_phone); bc public.business_customers; did uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.businesses where id = public.acting_business_id();
  if b.id is null then raise exception 'not_a_business'; end if;
  if b.status<>'active' then raise exception 'business_suspended'; end if;
  perform public._rate('quick:'||b.id, 200);
  if ph is null then raise exception 'invalid_phone'; end if;
  if char_length(btrim(coalesce(p_name,''))) < 1 then raise exception 'name_required'; end if;
  if p_amount is null or p_amount<=0 or p_amount>100000000 then raise exception 'invalid_amount'; end if;
  if char_length(btrim(coalesce(p_description,'')))<2 then raise exception 'invalid_description'; end if;
  insert into public.business_customers(business_id,name,phone) values (b.id,left(btrim(p_name),120),ph)
    on conflict (business_id,phone) do update set name=public.business_customers.name returning * into bc;
  if bc.customer_user_id is not null then raise exception 'customer_linked_use_request'; end if;
  perform public._credit_ok(bc.id, coalesce(p_currency,'KES'), round(p_amount,2));
  insert into public.business_debts(id,business_id,business_customer_id,customer_name,customer_phone,amount,currency,description,incurred_on,due_date,source,created_by)
  values (did,b.id,bc.id,bc.name,bc.phone,round(p_amount,2),coalesce(p_currency,'KES'),btrim(p_description),coalesce(p_incurred,(now() at time zone 'Africa/Nairobi')::date),p_due,'quick',uid);
  return did;
end $$;

create or replace function public.record_manual_payment(p_debt uuid, p_amount numeric, p_method text, p_note text, p_ref text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare d public.business_debts; pid uuid := gen_random_uuid(); rno text; uid uuid := (select auth.uid());
begin
  select * into d from public.business_debts where id=p_debt for update;
  if d.id is null or not public.can_work_business(d.business_id) then raise exception 'not_found'; end if;
  perform public._rate('manualpay:'||d.business_id, 120);
  if p_method not in ('cash','other') then raise exception 'invalid_method'; end if;
  if d.cancelled_at is not null then raise exception 'debt_cancelled'; end if;
  if exists (select 1 from public.disputes where debt_id=p_debt and status='open') then raise exception 'debt_disputed'; end if;
  if p_amount is null or p_amount<=0 or round(p_amount,2) > public._outstanding(p_debt) - public._pending(p_debt) then raise exception 'amount_exceeds_outstanding'; end if;
  insert into public.business_payments(id,debt_id,business_id,customer_user_id,amount,currency,method,status,recorded_by,external_reference,note,completed_at)
  values (pid,p_debt,d.business_id,d.customer_user_id,round(p_amount,2),d.currency,p_method,'succeeded',uid,left(p_ref,100),left(p_note,500),now());
  rno := public._issue_receipt(pid);
  if d.customer_user_id is not null then perform public._notify(d.customer_user_id,'receipt','Payment recorded: '||d.currency||' '||round(p_amount,2),'Receipt '||rno,p_debt,'rcpt:'||pid); end if;
  return jsonb_build_object('payment_id',pid,'receipt_no',rno);
end $$;

create or replace function public.log_reminder(p_debt uuid, p_channel text)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.business_debts; uid uuid := (select auth.uid());
begin
  select * into d from public.business_debts where id=p_debt;
  if d.id is null or not public.can_work_business(d.business_id) then raise exception 'not_found'; end if;
  perform public._rate('remind:'||d.business_id, 200);
  insert into public.debt_messages(debt_id,sender_id,sender_role,kind,body) values (p_debt,uid,'business','reminder','Payment reminder sent via '||case when p_channel in ('whatsapp','sms','call') then p_channel else 'message' end);
end $$;

-- ---------------------------------------------------------------- execute rights: signed-in users only

revoke all on function
  public.can_work_business(uuid), public.is_staff_of(uuid), public.acting_business_id(),
  public.invite_staff(text), public.accept_staff_invite(uuid), public.revoke_staff_invite(uuid), public.remove_staff(uuid),
  public.create_debt_request(text,text,text,numeric,text,text,date,date,text),
  public.create_quick_debt(text,text,numeric,text,text,date,date),
  public.record_manual_payment(uuid,numeric,text,text,text),
  public.log_reminder(uuid,text)
  from public, anon;
grant execute on function
  public.can_work_business(uuid), public.is_staff_of(uuid), public.acting_business_id(),
  public.invite_staff(text), public.accept_staff_invite(uuid), public.revoke_staff_invite(uuid), public.remove_staff(uuid),
  public.create_debt_request(text,text,text,numeric,text,text,date,date,text),
  public.create_quick_debt(text,text,numeric,text,text,date,date),
  public.record_manual_payment(uuid,numeric,text,text,text),
  public.log_reminder(uuid,text)
  to authenticated;
