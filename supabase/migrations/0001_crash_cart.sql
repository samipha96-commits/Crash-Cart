-- Crash Cart: multi-hospital schema with row-level security.
--
-- Every row carries the hospital it belongs to, and every policy checks that
-- the signed-in user is a member of that hospital with a role allowed to do
-- the action. Users of one hospital can never read or change another
-- hospital's carts, checks or staff.
--
-- Roles
--   hospital_admin  everything: carts, item catalogue, staff, checks, review
--   pharmacy        restock carts (quantities, lot, expiry) and run checks
--   nurse           run checks
--   quality         run checks, review and close checks
--   manager         read everything, review and close checks

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) >= 2),
  code text not null check (length(trim(code)) >= 2),
  near_expiry_days int not null default 30 check (near_expiry_days between 1 and 365),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  name text not null default '',
  role text not null check (role in ('hospital_admin','pharmacy','nurse','quality','manager')),
  created_at timestamptz not null default now(),
  unique (hospital_id, user_id)
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role text not null check (role in ('hospital_admin','pharmacy','nurse','quality','manager')),
  created_at timestamptz not null default now(),
  unique (hospital_id, email)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('medicine','surgical','misc')),
  category text not null default 'General',
  strength text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, hospital_id)
);

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  name text not null,
  location text not null,
  cart_type text not null default 'Ward',
  seal_number text not null default '',
  created_at timestamptz not null default now(),
  unique (id, hospital_id)
);

create table if not exists drawers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  cart_id uuid not null,
  sort_order int not null,
  name text not null,
  unique (id, hospital_id),
  foreign key (cart_id, hospital_id) references carts(id, hospital_id) on delete cascade
);

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  cart_id uuid not null,
  drawer_id uuid not null,
  item_id uuid not null,
  par_qty int not null default 1 check (par_qty >= 1),
  lot_number text not null default '',
  expiry_date date,
  updated_at timestamptz not null default now(),
  foreign key (cart_id, hospital_id) references carts(id, hospital_id) on delete cascade,
  foreign key (drawer_id, hospital_id) references drawers(id, hospital_id) on delete cascade,
  foreign key (item_id, hospital_id) references items(id, hospital_id) on delete cascade
);

create table if not exists checks (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  cart_id uuid not null,
  check_type text not null check (check_type in ('daily','monthly','quarterly','after_use')),
  status text not null default 'draft' check (status in ('draft','submitted','closed')),
  performed_by uuid not null default auth.uid(),
  performed_by_name text not null default '',
  seal_number text not null default '',
  remarks text not null default '',
  review_notes text not null default '',
  reviewed_by_name text not null default '',
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  unique (id, hospital_id),
  foreign key (cart_id, hospital_id) references carts(id, hospital_id) on delete cascade
);

create table if not exists check_lines (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  check_id uuid not null,
  cart_item_id uuid,
  item_name text not null,
  strength text not null default '',
  drawer_name text not null,
  drawer_order int not null default 0,
  par_qty int not null,
  found_qty int,
  expiry_date date,
  line_status text not null default 'present'
    check (line_status in ('present','short','absent','expired','near_expiry','damaged')),
  remarks text not null default '',
  foreign key (check_id, hospital_id) references checks(id, hospital_id) on delete cascade
);

create index if not exists memberships_user_idx on memberships (user_id);
create index if not exists invites_email_idx on invites (email);
create index if not exists items_hospital_idx on items (hospital_id);
create index if not exists carts_hospital_idx on carts (hospital_id);
create index if not exists drawers_cart_idx on drawers (cart_id);
create index if not exists cart_items_hospital_idx on cart_items (hospital_id, expiry_date);
create index if not exists checks_hospital_idx on checks (hospital_id, created_at desc);
create index if not exists check_lines_check_idx on check_lines (check_id);

-- ---------------------------------------------------------------- helpers

create or replace function has_role(hid uuid, roles text[] default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.hospital_id = hid
      and m.user_id = auth.uid()
      and (roles is null or m.role = any (roles))
  );
$$;

-- Create a hospital and make the caller its first admin.
create or replace function create_hospital(p_name text, p_code text, p_id uuid default gen_random_uuid())
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  jwt_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '');
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  insert into hospitals (id, name, code, created_by)
    values (p_id, trim(p_name), upper(trim(p_code)), uid);
  insert into memberships (hospital_id, user_id, email, name, role)
    values (p_id, uid, jwt_email, jwt_name, 'hospital_admin');
  return p_id;
end;
$$;

-- Turn any invites addressed to the caller's email into memberships.
create or replace function accept_invites()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  jwt_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'name', '');
  n int;
begin
  if uid is null or jwt_email = '' then return 0; end if;
  insert into memberships (hospital_id, user_id, email, name, role)
    select i.hospital_id, uid, jwt_email, jwt_name, i.role
    from invites i where i.email = jwt_email
  on conflict (hospital_id, user_id) do update set role = excluded.role;
  get diagnostics n = row_count;
  delete from invites where email = jwt_email;
  return n;
end;
$$;

grant execute on function has_role(uuid, text[]) to authenticated;
grant execute on function create_hospital(text, text, uuid) to authenticated;
grant execute on function accept_invites() to authenticated;
revoke execute on function create_hospital(text, text, uuid) from anon;
revoke execute on function accept_invites() from anon;

-- Workflow guard: only reviewers may close or reopen a check, and lines are
-- frozen once a check has been submitted.
create or replace function guard_check_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.hospital_id <> old.hospital_id or new.cart_id <> old.cart_id then
    raise exception 'A check cannot be moved.';
  end if;
  if new.status = 'closed' and old.status <> 'closed'
     and not has_role(new.hospital_id, array['hospital_admin','quality','manager']) then
    raise exception 'Only an admin, quality or manager can close a check.';
  end if;
  if old.status <> 'draft' and new.status = 'draft'
     and not has_role(new.hospital_id, array['hospital_admin','quality','manager']) then
    raise exception 'Only an admin, quality or manager can reopen a check.';
  end if;
  if old.status = 'closed' and new.status = 'submitted' then
    raise exception 'Reopen the check instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists checks_guard on checks;
create trigger checks_guard before update on checks
  for each row execute function guard_check_update();

create or replace function guard_line_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select status from checks where id = coalesce(new.check_id, old.check_id)) <> 'draft' then
    raise exception 'This check is already submitted.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists check_lines_guard on check_lines;
create trigger check_lines_guard before update or delete on check_lines
  for each row execute function guard_line_update();

-- ---------------------------------------------------------------- policies

alter table hospitals enable row level security;
alter table memberships enable row level security;
alter table invites enable row level security;
alter table items enable row level security;
alter table carts enable row level security;
alter table drawers enable row level security;
alter table cart_items enable row level security;
alter table checks enable row level security;
alter table check_lines enable row level security;

-- hospitals: members read; admins rename / change settings. Created via create_hospital().
drop policy if exists hospitals_read on hospitals;
create policy hospitals_read on hospitals for select using (has_role(id));
drop policy if exists hospitals_admin on hospitals;
create policy hospitals_admin on hospitals for update
  using (has_role(id, array['hospital_admin'])) with check (has_role(id, array['hospital_admin']));

-- memberships: members see the team; admins manage roles and remove people.
drop policy if exists memberships_read on memberships;
create policy memberships_read on memberships for select using (has_role(hospital_id));
drop policy if exists memberships_admin_update on memberships;
create policy memberships_admin_update on memberships for update
  using (has_role(hospital_id, array['hospital_admin'])) with check (has_role(hospital_id, array['hospital_admin']));
drop policy if exists memberships_admin_delete on memberships;
create policy memberships_admin_delete on memberships for delete
  using (has_role(hospital_id, array['hospital_admin']) and user_id <> auth.uid());

-- invites: admins only.
drop policy if exists invites_admin on invites;
create policy invites_admin on invites for all
  using (has_role(hospital_id, array['hospital_admin'])) with check (has_role(hospital_id, array['hospital_admin']));

-- item catalogue: members read; admins and pharmacy maintain.
drop policy if exists items_read on items;
create policy items_read on items for select using (has_role(hospital_id));
drop policy if exists items_write on items;
create policy items_write on items for all
  using (has_role(hospital_id, array['hospital_admin','pharmacy']))
  with check (has_role(hospital_id, array['hospital_admin','pharmacy']));

-- carts and floors: members read; admins maintain.
drop policy if exists carts_read on carts;
create policy carts_read on carts for select using (has_role(hospital_id));
drop policy if exists carts_write on carts;
create policy carts_write on carts for all
  using (has_role(hospital_id, array['hospital_admin'])) with check (has_role(hospital_id, array['hospital_admin']));
drop policy if exists drawers_read on drawers;
create policy drawers_read on drawers for select using (has_role(hospital_id));
drop policy if exists drawers_write on drawers;
create policy drawers_write on drawers for all
  using (has_role(hospital_id, array['hospital_admin'])) with check (has_role(hospital_id, array['hospital_admin']));

-- cart contents (par level, lot, expiry): admins and pharmacy restock.
drop policy if exists cart_items_read on cart_items;
create policy cart_items_read on cart_items for select using (has_role(hospital_id));
drop policy if exists cart_items_write on cart_items;
create policy cart_items_write on cart_items for all
  using (has_role(hospital_id, array['hospital_admin','pharmacy']))
  with check (has_role(hospital_id, array['hospital_admin','pharmacy']));

-- checks: members read; checkers start and fill them; reviewers close them.
drop policy if exists checks_read on checks;
create policy checks_read on checks for select using (has_role(hospital_id));
drop policy if exists checks_insert on checks;
create policy checks_insert on checks for insert
  with check (has_role(hospital_id, array['hospital_admin','pharmacy','nurse','quality']) and performed_by = auth.uid());
drop policy if exists checks_update on checks;
create policy checks_update on checks for update
  using (has_role(hospital_id, array['hospital_admin','pharmacy','nurse','quality','manager']))
  with check (has_role(hospital_id, array['hospital_admin','pharmacy','nurse','quality','manager']));
drop policy if exists checks_delete on checks;
create policy checks_delete on checks for delete
  using (has_role(hospital_id, array['hospital_admin']) or (status = 'draft' and performed_by = auth.uid()));

drop policy if exists check_lines_read on check_lines;
create policy check_lines_read on check_lines for select using (has_role(hospital_id));
drop policy if exists check_lines_write on check_lines;
create policy check_lines_write on check_lines for all
  using (has_role(hospital_id, array['hospital_admin','pharmacy','nurse','quality']))
  with check (has_role(hospital_id, array['hospital_admin','pharmacy','nurse','quality']));
