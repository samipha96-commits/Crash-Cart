-- Crash Cart 0002: ward rights, new roles, portal branding, pharmacy audits.
-- Run after 0001_crash_cart.sql.
--
-- Super admin          creates hospital portals (theme, look, logo) and wards (carts),
--                      and every kind of ID, including Hospital admins for some or all wards
-- hospital_admin       sets the crash cart items of its wards; creates nurse and
--                      pharmacist IDs inside its own wards
-- nurse                ONE ward: item list (CSV), updates expiry dates, sees the pharmacy's checks
-- nursing_manager      every ward: item lists, expiry dates, the pharmacy's checks (read-only)
-- pharmacy             pharmacist: monthly audits of its wards, closes observations
-- pharmacy_manager     reviews pharmacists' audits; reports of every ward (was "quality")
--
-- memberships.ward_ids / invites.ward_ids hold cart ids; an empty array means every ward.

-- ---------------------------------------------------------------- columns

alter table hospitals add column if not exists theme jsonb not null default '{}'::jsonb;
alter table hospitals add column if not exists logo_url text not null default ''
  check (length(logo_url) <= 400000);
-- Hospital details printed in the header of every report.
alter table hospitals add column if not exists address text not null default '';
alter table hospitals add column if not exists phone text not null default '';
alter table hospitals add column if not exists email text not null default '';

alter table memberships add column if not exists ward_ids uuid[] not null default '{}';
alter table invites add column if not exists ward_ids uuid[] not null default '{}';

alter table memberships drop constraint if exists memberships_role_check;
alter table invites drop constraint if exists invites_role_check;
update memberships set role = 'pharmacy_manager' where role = 'quality';
update memberships set role = 'nursing_manager' where role = 'manager';
update invites set role = 'pharmacy_manager' where role = 'quality';
update invites set role = 'nursing_manager' where role = 'manager';
alter table memberships add constraint memberships_role_check
  check (role in ('hospital_admin','nurse','nursing_manager','pharmacy','pharmacy_manager'));
alter table invites add constraint invites_role_check
  check (role in ('hospital_admin','nurse','nursing_manager','pharmacy','pharmacy_manager'));
alter table memberships drop constraint if exists memberships_nurse_one_ward;
alter table memberships add constraint memberships_nurse_one_ward
  check (role <> 'nurse' or cardinality(ward_ids) = 1);
alter table invites drop constraint if exists invites_nurse_one_ward;
alter table invites add constraint invites_nurse_one_ward
  check (role <> 'nurse' or cardinality(ward_ids) = 1);

alter table checks add column if not exists audience text not null default 'nursing'
  check (audience in ('nursing','pharmacy'));
update checks c set audience = 'pharmacy'
  from memberships m
  where m.hospital_id = c.hospital_id and m.user_id = c.performed_by and m.role in ('pharmacy','pharmacy_manager');
alter table checks drop constraint if exists checks_status_check;
alter table checks add constraint checks_status_check check (status in ('draft','submitted','in_review','closed'));

alter table checks add column if not exists issue_count int not null default 0;
alter table check_lines add column if not exists item_code text not null default '';
alter table items add column if not exists code text not null default '';
alter table items add column if not exists generic text not null default '';
create unique index if not exists items_code_unique on items (hospital_id, upper(code)) where code <> '';
alter table check_lines add column if not exists obs_action text not null default '';
alter table check_lines add column if not exists obs_closed boolean not null default false;

create index if not exists checks_audience_idx on checks (hospital_id, audience, cart_id, created_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function my_membership(hid uuid)
returns memberships
language sql stable security definer set search_path = public
as $$
  select m from memberships m where m.hospital_id = hid and m.user_id = auth.uid() limit 1;
$$;

-- The caller covers this ward (cart) with one of these roles (null = any role).
create or replace function ward_ok(hid uuid, cart uuid, roles text[] default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select is_super_admin() or exists (
    select 1 from memberships m
    where m.hospital_id = hid and m.user_id = auth.uid()
      and (roles is null or m.role = any (roles))
      and (cardinality(m.ward_ids) = 0 or cart = any (m.ward_ids))
  );
$$;

-- Pharmacy checks are seen by pharmacy and by the ward's nurses (read-only).
-- Older nursing checks stay inside nursing.
create or replace function can_see_check(hid uuid, cart uuid, aud text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select ward_ok(hid, cart,
    case when aud = 'nursing' then array['nurse','nursing_manager']
         else array['pharmacy','pharmacy_manager','nurse','nursing_manager'] end);
$$;

-- Super admin: any role. Hospital admin: nurses and pharmacists inside its own wards.
create or replace function can_grant(hid uuid, r text, wards uuid[])
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  me memberships;
begin
  if r = 'nurse' and cardinality(coalesce(wards, '{}')) <> 1 then return false; end if;
  if is_super_admin() then return true; end if;
  me := my_membership(hid);
  if me.id is null or me.role <> 'hospital_admin' or r not in ('nurse','pharmacy') then return false; end if;
  if cardinality(me.ward_ids) = 0 then return true; end if;
  return cardinality(coalesce(wards, '{}')) > 0 and wards <@ me.ward_ids;
end;
$$;

grant execute on function ward_ok(uuid, uuid, text[]) to authenticated;
grant execute on function can_see_check(uuid, uuid, text) to authenticated;
grant execute on function can_grant(uuid, text, uuid[]) to authenticated;
grant execute on function my_membership(uuid) to authenticated;

-- Invites carry their wards into the membership.
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
  insert into memberships (hospital_id, user_id, email, name, role, ward_ids)
    select i.hospital_id, uid, jwt_email, jwt_name, i.role, i.ward_ids
    from invites i where i.email = jwt_email
  on conflict (hospital_id, user_id) do update set role = excluded.role, ward_ids = excluded.ward_ids;
  get diagnostics n = row_count;
  delete from invites where email = jwt_email;
  return n;
end;
$$;

-- ---------------------------------------------------------------- workflow guards

create or replace function guard_check_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  me memberships := my_membership(old.hospital_id);
  checker text := case when old.audience = 'nursing' then 'nurse' else 'pharmacy' end;
  reviewer boolean := is_super_admin()
    or coalesce(me.role = case when old.audience = 'nursing' then 'nursing_manager' else 'pharmacy_manager' end, false);
  is_checker boolean := not is_super_admin() and coalesce(me.role = checker, false);
  step text := old.status || '>' || new.status;
begin
  if new.hospital_id <> old.hospital_id or new.cart_id <> old.cart_id or new.audience <> old.audience then
    raise exception 'A check cannot be moved.';
  end if;
  if old.status = new.status then
    if old.status = 'draft' and not is_checker then raise exception 'Only the checker can change a check in progress.'; end if;
    if old.status <> 'draft' and not (is_checker or reviewer) then raise exception 'Your role cannot change this check.'; end if;
    return new;
  end if;
  if step = 'draft>submitted' then
    if not is_checker then raise exception 'Only the checker can submit.'; end if;
  elsif step = 'submitted>in_review' then
    if old.audience <> 'pharmacy' or not is_checker then raise exception 'Only a pharmacist can send an audit for review.'; end if;
    if exists (select 1 from check_lines l where l.check_id = old.id and l.line_status <> 'present' and not l.obs_closed) then
      raise exception 'Close all observations first.';
    end if;
  elsif step = 'in_review>closed' or (step = 'submitted>closed' and old.audience = 'nursing') then
    if not reviewer then raise exception 'Only the % manager can close this.', old.audience; end if;
  elsif step = 'submitted>closed' then
    raise exception 'The pharmacist closes the observations and sends the audit for review first.';
  elsif new.status = 'draft' or step in ('in_review>submitted', 'closed>submitted') then
    if not reviewer then raise exception 'Only the manager can send a check back.'; end if;
  else
    raise exception 'That status change is not allowed.';
  end if;
  return new;
end;
$$;

-- Lines: filled in by the checker while in progress; afterwards only the
-- pharmacist's follow-up (obs_action / obs_closed) of a submitted audit may change.
create or replace function guard_line_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c checks;
  me memberships;
begin
  select * into c from checks where id = coalesce(new.check_id, old.check_id);
  me := my_membership(c.hospital_id);
  if c.status = 'draft' then
    if is_super_admin() or me.role is distinct from (case when c.audience = 'nursing' then 'nurse' else 'pharmacy' end) then
      raise exception 'Only the checker can fill in a check.';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and c.status = 'submitted' and c.audience = 'pharmacy' and coalesce(me.role = 'pharmacy', false)
     and not is_super_admin()
     and (to_jsonb(new) - 'obs_action' - 'obs_closed') = (to_jsonb(old) - 'obs_action' - 'obs_closed') then
    return new;
  end if;
  raise exception 'This check is already submitted.';
end;
$$;

-- ---------------------------------------------------------------- policies

-- hospitals: only the Super admin changes a portal (name, settings, theme, logo).
drop policy if exists hospitals_admin on hospitals;
drop policy if exists hospitals_super_update on hospitals;
create policy hospitals_super_update on hospitals for update using (is_super_admin()) with check (is_super_admin());

-- memberships and invites: Super admin, or a Hospital admin within can_grant().
drop policy if exists memberships_super_update on memberships;
drop policy if exists memberships_grant_update on memberships;
create policy memberships_grant_update on memberships for update
  using (can_grant(hospital_id, role, ward_ids)) with check (can_grant(hospital_id, role, ward_ids));
drop policy if exists memberships_super_delete on memberships;
drop policy if exists memberships_grant_delete on memberships;
create policy memberships_grant_delete on memberships for delete using (can_grant(hospital_id, role, ward_ids));

drop policy if exists invites_super on invites;
drop policy if exists invites_read on invites;
create policy invites_read on invites for select
  using (is_super_admin() or has_role(hospital_id, array['hospital_admin']));
drop policy if exists invites_write on invites;
create policy invites_write on invites for insert with check (can_grant(hospital_id, role, ward_ids));
drop policy if exists invites_delete on invites;
create policy invites_delete on invites for delete using (can_grant(hospital_id, role, ward_ids));
drop policy if exists invites_update on invites;
create policy invites_update on invites for update
  using (can_grant(hospital_id, role, ward_ids)) with check (can_grant(hospital_id, role, ward_ids));

-- wards (carts): staff see their wards; the Super admin adds and removes them;
-- the ward's Hospital admin may rename or reseal.
drop policy if exists carts_read on carts;
create policy carts_read on carts for select using (ward_ok(hospital_id, id));
drop policy if exists carts_write on carts;
drop policy if exists carts_insert on carts;
create policy carts_insert on carts for insert with check (is_super_admin());
drop policy if exists carts_delete on carts;
create policy carts_delete on carts for delete using (is_super_admin());
drop policy if exists carts_update on carts;
create policy carts_update on carts for update
  using (ward_ok(hospital_id, id, array['hospital_admin'])) with check (ward_ok(hospital_id, id, array['hospital_admin']));

drop policy if exists drawers_read on drawers;
create policy drawers_read on drawers for select using (ward_ok(hospital_id, cart_id));
drop policy if exists drawers_write on drawers;
create policy drawers_write on drawers for all
  using (ward_ok(hospital_id, cart_id, array['hospital_admin']))
  with check (ward_ok(hospital_id, cart_id, array['hospital_admin']));

-- item list: each hospital's own, kept by its Hospital admins.
drop policy if exists items_write on items;
create policy items_write on items for all
  using (has_role(hospital_id, array['hospital_admin'])) with check (has_role(hospital_id, array['hospital_admin']));

-- cart contents: the ward's Hospital admin sets items; pharmacists and nurses of
-- the ward update only lot and expiry (guarded below).
drop policy if exists cart_items_read on cart_items;
create policy cart_items_read on cart_items for select using (ward_ok(hospital_id, cart_id));
drop policy if exists cart_items_write on cart_items;
drop policy if exists cart_items_admin on cart_items;
create policy cart_items_admin on cart_items for all
  using (ward_ok(hospital_id, cart_id, array['hospital_admin']))
  with check (ward_ok(hospital_id, cart_id, array['hospital_admin']));
drop policy if exists cart_items_restock on cart_items;
create policy cart_items_restock on cart_items for update
  using (ward_ok(hospital_id, cart_id, array['pharmacy','nurse','nursing_manager']))
  with check (ward_ok(hospital_id, cart_id, array['pharmacy','nurse','nursing_manager']));

create or replace function guard_cart_item_restock()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if ward_ok(old.hospital_id, old.cart_id, array['hospital_admin']) then return new; end if;
  if (to_jsonb(new) - 'lot_number' - 'expiry_date' - 'updated_at') <> (to_jsonb(old) - 'lot_number' - 'expiry_date' - 'updated_at') then
    raise exception 'Only the Hospital admin of this ward can change its items; others update expiry and lot.';
  end if;
  return new;
end;
$$;
drop trigger if exists cart_items_restock_guard on cart_items;
create trigger cart_items_restock_guard before update on cart_items
  for each row execute function guard_cart_item_restock();

-- checks: only pharmacists check carts (nurses check against the CSV item list off the app).
drop policy if exists checks_read on checks;
create policy checks_read on checks for select using (can_see_check(hospital_id, cart_id, audience));
drop policy if exists checks_insert on checks;
create policy checks_insert on checks for insert
  with check (
    performed_by = auth.uid() and not is_super_admin()
    and audience = 'pharmacy' and ward_ok(hospital_id, cart_id, array['pharmacy'])
  );
drop policy if exists checks_update on checks;
create policy checks_update on checks for update
  using (can_see_check(hospital_id, cart_id, audience)) with check (can_see_check(hospital_id, cart_id, audience));
drop policy if exists checks_delete on checks;
create policy checks_delete on checks for delete
  using (is_super_admin() or (status = 'draft' and performed_by = auth.uid()));

drop policy if exists check_lines_read on check_lines;
create policy check_lines_read on check_lines for select
  using (exists (select 1 from checks c where c.id = check_id and can_see_check(c.hospital_id, c.cart_id, c.audience)));
drop policy if exists check_lines_write on check_lines;
create policy check_lines_write on check_lines for all
  using (exists (select 1 from checks c where c.id = check_id and can_see_check(c.hospital_id, c.cart_id, c.audience)))
  with check (exists (select 1 from checks c where c.id = check_id and can_see_check(c.hospital_id, c.cart_id, c.audience)));

-- check_lines inserts: only by the checker of a draft (the update/delete trigger covers the rest).
drop trigger if exists check_lines_guard_insert on check_lines;
create trigger check_lines_guard_insert before insert on check_lines
  for each row execute function guard_line_update();
