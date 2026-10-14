-- Immutable public-by-unguessable-link pixel share snapshots.
-- No emails, nicknames, user IDs, or auth tokens are emitted to share viewers.
create table public.iid_share_cards(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null references public.iid_profiles(user_id) on delete cascade,
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 snapshot jsonb not null,
 constraint iid_share_cards_verified check(snapshot->>'source'='SERVER_LEDGER')
);
create index iid_share_cards_owner_recent on public.iid_share_cards(user_id,created_at desc);
alter table public.iid_share_cards enable row level security;
revoke all on public.iid_share_cards from public,anon,authenticated;

create function iid_private.publish_share_card() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=iid_private.require_player();
 d jsonb;
 new_id uuid;
begin
 -- Only authenticated verified profiles can publish. Limit abuse and DB growth.
 if (select count(*) from public.iid_share_cards
     where user_id=u and created_at>pg_catalog.clock_timestamp()-interval '1 hour')>=30 then
   raise exception 'SHARE_RATE_LIMITED';
 end if;
 -- Recalculate the authenticated world-ledger snapshot at this click.
 d:=iid_private.share_snapshot();
 insert into public.iid_share_cards(user_id,snapshot) values(u,d)
 returning id into new_id;
 return pg_catalog.jsonb_build_object('id',new_id,'snapshot',d);
end $$;
revoke all on function iid_private.publish_share_card() from public,anon,authenticated;
grant execute on function iid_private.publish_share_card() to authenticated;

create function public.iid_publish_share_card() returns jsonb
language sql security invoker set search_path='' as
$$select iid_private.publish_share_card()$$;
revoke all on function public.iid_publish_share_card() from public,anon,authenticated;
grant execute on function public.iid_publish_share_card() to authenticated;

-- Public link reader. A narrow SECURITY DEFINER reads only the
-- anonymous snapshot selected by an unguessable UUID; no player data.
-- Keep iid_private schema inaccessible to anonymous visitors.
create function public.iid_public_share_card(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select c.snapshot from public.iid_share_cards c where c.id=p_id
$$;
revoke all on function public.iid_public_share_card(uuid) from public,anon,authenticated;
grant execute on function public.iid_public_share_card(uuid) to anon,authenticated;
