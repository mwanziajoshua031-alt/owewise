-- OweWise: customer trust score (bulk), reminder schedule, branches (2026-11-12)
--
-- Applied live to project cfbblqvtjnmwsxdqlkiv. Do not apply again.
-- customer_trust(p_customer) was applied earlier the same day as "customer_trust_score" and
-- "customer_trust_score_threshold_fix": it rates a customer reliable / mixed / risky from finished
-- debts only (paid, or unpaid and past due; cancelled, disputed and awaiting_review are ignored),
-- and says not_enough with fewer than 3 finished debts. Its final definition is kept at the bottom
-- of this file for the repo record.

-- ---------- Trust: all customers of my business in one call ----------
create or replace function public.customer_trust_all()
returns table(customer_id uuid, trust jsonb)
language sql stable security definer set search_path to '' as $$
  select c.id, public.customer_trust(c.id)
    from public.business_customers c
   where c.business_id = public.acting_business_id()
$$;

-- ---------- Reminder schedule ----------
-- Who should be reminded today: due within 3 days (not reminded in the last 3 days) and overdue
-- (not reminded in the last 7 days). Amounts stay per currency, one row per debt.
drop function if exists public.reminders_due();
create or replace function public.reminders_due()
returns table(debt_id uuid, customer_name text, customer_phone text, description text, currency text,
              outstanding numeric, due_date date, days_to_due int, stage text, last_reminded timestamptz, customer_user_id uuid)
language sql stable security definer set search_path to '' as $$
  with t as (select (now() at time zone 'Africa/Nairobi')::date as today),
  x as (
    select b.id, b.customer_name, b.customer_phone, b.description, b.currency, b.outstanding, b.due_date, b.customer_user_id,
           (b.due_date - t.today) as dd,
           (select max(m.created_at) from public.debt_messages m where m.debt_id = b.id and m.kind = 'reminder') as lr
      from public.business_debt_balances b, t
     where b.business_id = public.acting_business_id()
       and b.status in ('awaiting_payment','partially_paid','overdue')
       and b.outstanding > 0
  )
  select id, customer_name, customer_phone, description, currency, outstanding, due_date, dd::int,
         case when dd < 0 then 'overdue' when dd = 0 then 'due_today' else 'due_soon' end,
         lr, customer_user_id
    from x
   where dd <= 3
     and (lr is null or lr < now() - case when dd < 0 then interval '7 days' else interval '3 days' end)
   order by dd, customer_name
$$;

-- ---------- Branches ----------
create table if not exists public.business_branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists business_branches_name_uq on public.business_branches (business_id, lower(btrim(name)));
alter table public.business_branches enable row level security;
drop policy if exists bb_select on public.business_branches;
create policy bb_select on public.business_branches for select to authenticated
  using (public.can_work_business(business_id) or public.is_admin());
revoke all on public.business_branches from anon, authenticated;
grant select on public.business_branches to authenticated;

alter table public.business_debts add column if not exists branch_id uuid references public.business_branches(id) on delete set null;
alter table public.business_members add column if not exists branch_id uuid references public.business_branches(id) on delete set null;
create index if not exists business_debts_branch_idx on public.business_debts(branch_id);

-- New column appended to the end of the balances view (security_invoker stays on).
create or replace view public.business_debt_balances with (security_invoker = true) as
 SELECT d.id, d.business_id, d.business_customer_id, d.customer_user_id, d.customer_name, d.customer_phone,
    d.amount, d.currency, d.description, d.incurred_on, d.due_date, d.invoice_path, d.sent_at,
    d.claim_token_hash, d.claim_expires_at, d.claimed_at, d.customer_confirmed_at, d.cancelled_at,
    d.cancel_reason, d.created_by, d.created_at, d.updated_at, d.source,
    (COALESCE(p.paid, (0)::numeric))::numeric(14,2) AS paid_total,
    (COALESCE(p.pend, (0)::numeric))::numeric(14,2) AS pending_total,
    (GREATEST((d.amount - COALESCE(p.paid, (0)::numeric)), (0)::numeric))::numeric(14,2) AS outstanding,
        CASE
            WHEN (d.cancelled_at IS NOT NULL) THEN 'cancelled'::text
            WHEN (EXISTS ( SELECT 1 FROM disputes x WHERE ((x.debt_id = d.id) AND (x.status = 'open'::text)))) THEN 'disputed'::text
            WHEN ((d.amount - COALESCE(p.paid, (0)::numeric)) <= (0)::numeric) THEN 'paid'::text
            WHEN ((d.customer_confirmed_at IS NULL) AND (COALESCE(p.paid, (0)::numeric) = (0)::numeric) AND ((d.source = 'request'::text) OR (d.claimed_at IS NOT NULL))) THEN 'awaiting_review'::text
            WHEN (d.due_date < ((now() AT TIME ZONE 'Africa/Nairobi'::text))::date) THEN 'overdue'::text
            WHEN (COALESCE(p.paid, (0)::numeric) > (0)::numeric) THEN 'partially_paid'::text
            ELSE 'awaiting_payment'::text
        END AS status,
    d.branch_id
   FROM (business_debts d
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN ((bp.kind = 'payment'::text) AND (bp.status = 'succeeded'::text)) THEN bp.amount
                    WHEN ((bp.kind = 'reversal'::text) AND (bp.status = 'succeeded'::text)) THEN (- bp.amount)
                    ELSE (0)::numeric
                END) AS paid,
            sum(
                CASE
                    WHEN ((bp.kind = 'payment'::text) AND (bp.status = 'pending'::text)) THEN bp.amount
                    ELSE (0)::numeric
                END) AS pend
           FROM business_payments bp
          WHERE (bp.debt_id = d.id)) p ON (true));
grant select on public.business_debt_balances to authenticated;

-- A staff member assigned to a branch gets that branch on the debts they create.
create or replace function public.debt_default_branch()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.branch_id is null and new.created_by is not null then
    select m.branch_id into new.branch_id from public.business_members m
     where m.user_id = new.created_by and m.business_id = new.business_id;
  end if;
  return new;
end $$;
drop trigger if exists bd_default_branch on public.business_debts;
create trigger bd_default_branch before insert on public.business_debts
  for each row execute function public.debt_default_branch();
revoke all on function public.debt_default_branch() from public, anon, authenticated;

-- Owner: add / rename / delete branches (max 20). Deleting keeps the debts, they become "No branch".
create or replace function public.add_branch(p_name text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id(); nid uuid; n text := btrim(coalesce(p_name,''));
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(n) < 1 or char_length(n) > 60 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if (select count(*) from public.business_branches where business_id = bid) >= 20 then raise exception 'branch_limit_reached' using errcode = 'P0001'; end if;
  if exists (select 1 from public.business_branches where business_id = bid and lower(btrim(name)) = lower(n)) then raise exception 'branch_exists' using errcode = 'P0001'; end if;
  insert into public.business_branches(business_id, name) values (bid, n) returning id into nid;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (bid, (select auth.uid()), 'business_branches', nid, 'branch_added', jsonb_build_object('name', n));
  return nid;
end $$;

create or replace function public.rename_branch(p_branch uuid, p_name text)
returns void language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id(); n text := btrim(coalesce(p_name,''));
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(n) < 1 or char_length(n) > 60 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.business_branches where business_id = bid and id <> p_branch and lower(btrim(name)) = lower(n)) then raise exception 'branch_exists' using errcode = 'P0001'; end if;
  update public.business_branches set name = n where id = p_branch and business_id = bid;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (bid, (select auth.uid()), 'business_branches', p_branch, 'branch_renamed', jsonb_build_object('name', n));
end $$;

create or replace function public.delete_branch(p_branch uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id();
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.business_branches where id = p_branch and business_id = bid;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.business_audit_logs(business_id, actor, table_name, row_id, action, detail)
    values (bid, (select auth.uid()), 'business_branches', p_branch, 'branch_deleted', '{}'::jsonb);
end $$;

-- Tag a debt with a branch (owner or staff; null clears it).
create or replace function public.set_debt_branch(p_debt uuid, p_branch uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.business_debts;
begin
  select * into d from public.business_debts where id = p_debt;
  if d.id is null or not public.can_work_business(d.business_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_branch is not null and not exists (select 1 from public.business_branches where id = p_branch and business_id = d.business_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.business_debts set branch_id = p_branch where id = p_debt;
end $$;

-- Owner: the branch a staff member's new debts default to (null clears it).
create or replace function public.set_staff_branch(p_user uuid, p_branch uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare bid uuid := public.my_business_id();
begin
  if bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_branch is not null and not exists (select 1 from public.business_branches where id = p_branch and business_id = bid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.business_members set branch_id = p_branch where user_id = p_user and business_id = bid;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;

-- list_staff now also returns each person's branch.
drop function if exists public.list_staff();
create or replace function public.list_staff()
returns table(user_id uuid, email text, joined_at timestamptz, branch_id uuid)
language sql stable security definer set search_path to '' as $$
  select m.user_id, u.email::text, m.created_at, m.branch_id
    from public.business_members m
    join auth.users u on u.id = m.user_id
   where m.business_id = public.my_business_id()
   order by m.created_at
$$;

revoke all on function public.customer_trust_all(), public.reminders_due(), public.add_branch(text), public.rename_branch(uuid,text),
  public.delete_branch(uuid), public.set_debt_branch(uuid,uuid), public.set_staff_branch(uuid,uuid), public.list_staff() from public, anon;
grant execute on function public.customer_trust_all(), public.reminders_due(), public.add_branch(text), public.rename_branch(uuid,text),
  public.delete_branch(uuid), public.set_debt_branch(uuid,uuid), public.set_staff_branch(uuid,uuid), public.list_staff() to authenticated;

-- ---------- customer_trust (final definition, applied earlier on 2026-11-12) ----------
create or replace function public.customer_trust(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  bid uuid; today date := (now() at time zone 'Africa/Nairobi')::date; r jsonb;
begin
  select business_id into bid from public.business_customers where id = p_customer;
  if bid is null or not public.can_work_business(bid) then raise exception 'not_found'; end if;

  with d as (
    select b.id, b.currency, b.due_date, b.status, b.outstanding,
      (select max((p.completed_at at time zone 'Africa/Nairobi')::date)
         from public.business_payments p
        where p.debt_id = b.id and p.kind = 'payment' and p.status = 'succeeded') as last_paid_on
    from public.business_debt_balances b
    where b.business_customer_id = p_customer
      and b.status not in ('cancelled','disputed','awaiting_review')
  ),
  fin as (
    select *,
      case when status = 'paid' then last_paid_on <= due_date else false end as on_time,
      case when status = 'paid' then greatest(last_paid_on - due_date, 0) else greatest(today - due_date, 0) end as days_late
    from d
    where status = 'paid' or (outstanding > 0 and due_date < today)
  ),
  agg as (
    select count(*) as finished,
           count(*) filter (where on_time) as on_time,
           coalesce(round(avg(days_late)::numeric, 1), 0) as avg_days_late,
           coalesce(max(days_late), 0) as worst_days_late
    from fin
  ),
  od as (
    select currency, sum(outstanding) as amount, count(*) as n
      from d where outstanding > 0 and due_date < today group by currency
  )
  select jsonb_build_object(
    'finished', agg.finished,
    'on_time', agg.on_time,
    'avg_days_late', agg.avg_days_late,
    'worst_days_late', agg.worst_days_late,
    'overdue_now', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount, 'debts', n)) from od), '[]'::jsonb),
    'rating', case
      when agg.finished < 3 then 'not_enough'
      when agg.on_time::numeric / agg.finished >= 0.75 and agg.avg_days_late <= 3 then 'reliable'
      when agg.on_time::numeric / agg.finished >= 0.5 then 'mixed'
      else 'risky' end
  ) into r from agg;
  return r;
end $$;
revoke all on function public.customer_trust(uuid) from public, anon;
grant execute on function public.customer_trust(uuid) to authenticated;
