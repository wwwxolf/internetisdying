-- V4 cutover safety net. INERT by default. Does not pause V2, create an
-- epoch, publish V4, or modify world HP. Owner approval is required to arm.
create table iid_v4.cutover_control (
  id smallint primary key default 1 check (id=1),
  legacy_frozen boolean not null default false,
  armed_at timestamptz,
  check (not legacy_frozen or armed_at is not null)
);
insert into iid_v4.cutover_control(id,legacy_frozen) values(1,false);
alter table iid_v4.cutover_control enable row level security;
revoke all on iid_v4.cutover_control from public,anon,authenticated;

-- Last-line guard for ALL functions that update public.iid_world, including
-- historical battle settlement, V2 window/decay/chaos and developer reset.
-- FOR SHARE serializes an owner's freeze update with in-flight HP updates.
create function iid_v4.reject_frozen_legacy_world() returns trigger
language plpgsql security definer set search_path='' as $$
declare frozen boolean;
begin
 select legacy_frozen into strict frozen
   from iid_v4.cutover_control where id=1 for share;
 if frozen or exists(select 1 from iid_v4.epochs where published) then
   raise exception 'LEGACY_WORLD_FROZEN' using errcode='55000';
 end if;
 if tg_op='UPDATE' then return new;end if;
 if tg_op='DELETE' then return old;end if;
 return null;
end $$;
revoke all on function iid_v4.reject_frozen_legacy_world()
 from public,anon,authenticated;

create trigger iid_v4_guard_world_dml
 before update or delete on public.iid_world for each row
 execute function iid_v4.reject_frozen_legacy_world();
create trigger iid_v4_guard_world_truncate
 before truncate on public.iid_world for each statement
 execute function iid_v4.reject_frozen_legacy_world();

-- This guard is deliberately NOT a complete V2 input freeze. Stop legacy
-- battle starts and drain events before arming it. Do not arm in this migration.
