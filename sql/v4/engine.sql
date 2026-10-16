-- V4 additive staging SQL. Not a production migration until SQL/concurrency tests pass.
-- No epoch, cron, legacy flag or production HP is changed by installing this file.
begin;
create schema iid_v4;
revoke all on schema iid_v4 from public,anon,authenticated;
create table iid_v4.epochs(
 id uuid primary key default gen_random_uuid(), starts_at timestamptz not null,
 deadline_at timestamptz not null, hp integer not null default 500000 check(hp between 0 and 1000000),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','FINAL')),
 winner text check(winner in ('SAVE','KILL')), ended_at timestamptz,
 admission boolean not null default false, version bigint not null default 0,
 parameters text not null default 'V4:12000:4000:10000:24000:3000:9:20:100:105',
 check(starts_at=date_trunc('day',starts_at at time zone 'UTC') at time zone 'UTC'),
 check(deadline_at=starts_at+interval '720 hours'),
 check((status='ACTIVE' and winner is null and ended_at is null) or (status='FINAL' and winner is not null and ended_at is not null))
);
create unique index v4_one_active on iid_v4.epochs((true)) where status='ACTIVE';
create table iid_v4.events(
 epoch_id uuid not null references iid_v4.epochs, kind text not null check(kind in ('BATTLE','CHAOS','DECAY','FINAL')),
 seq integer not null, scheduled_at timestamptz not null, priority integer not null,
 settled_at timestamptz, nominal integer, applied integer, hp_before integer,hp_after integer,
 save_sum bigint,kill_sum bigint,decay integer,
 primary key(epoch_id,kind,seq)
);
create index v4_due on iid_v4.events(epoch_id,scheduled_at,priority) where settled_at is null;
create table iid_v4.attempts(
 id uuid primary key default gen_random_uuid(),epoch_id uuid not null,kind text not null default 'BATTLE' check(kind='BATTLE'),
 seq integer not null,user_id uuid not null references auth.users,request_id uuid not null,
 action text not null check(action in ('HEAL','KILL')),started_at timestamptz not null,
 completed_at timestamptz,taps integer check(taps between 0 and 50),critical integer check(critical in (100,105)),
 power integer check(power between 100 and 110),
 foreign key(epoch_id,kind,seq) references iid_v4.events,
 unique(epoch_id,seq,user_id), unique(user_id,request_id),
 check((completed_at is null and taps is null and critical is null and power is null) or
 (completed_at is not null and taps is not null and critical is not null and power is not null))
);
create table iid_v4.votes(
 epoch_id uuid not null,kind text not null default 'CHAOS' check(kind='CHAOS'),seq integer not null,
 user_id uuid not null references auth.users,request_id uuid not null,choice text not null check(choice in ('HEAL','KILL')),
 created_at timestamptz not null,
 primary key(epoch_id,seq,user_id),unique(user_id,request_id),
 foreign key(epoch_id,kind,seq) references iid_v4.events
);
create table iid_v4.buckets(
 epoch_id uuid not null,kind text not null,seq integer not null,shard integer not null check(shard between 0 and 63),
 save_sum bigint not null default 0 check(save_sum>=0),kill_sum bigint not null default 0 check(kill_sum>=0),
 primary key(epoch_id,kind,seq,shard),foreign key(epoch_id,kind,seq) references iid_v4.events
);
create table iid_v4.player_totals(
 epoch_id uuid not null references iid_v4.epochs,user_id uuid not null references auth.users,
 save_power bigint not null default 0,kill_power bigint not null default 0,battles integer not null default 0,
 primary key(epoch_id,user_id)
);
alter table iid_v4.epochs enable row level security;
alter table iid_v4.events enable row level security;
alter table iid_v4.attempts enable row level security;
alter table iid_v4.votes enable row level security;
alter table iid_v4.buckets enable row level security;
alter table iid_v4.player_totals enable row level security;

create function iid_v4.power(t integer,c integer) returns integer language plpgsql immutable set search_path='' as $$
begin
 if t is null or t not between 0 and 50 or c is null or c not in (100,105) then raise exception 'INVALID_POWER';end if;
 return round((100+t/10)::numeric*c/100)::integer;
end $$;
create function iid_v4.battle_delta(s bigint,k bigint) returns integer language plpgsql immutable set search_path='' as $$
begin
 if s is null or k is null or s<0 or k<0 then raise exception 'INVALID_SUM';end if;
 return round(12000*(s::numeric-k)/(s::numeric+k+4000))::integer;
end $$;
create function iid_v4.chaos_delta(s bigint,k bigint) returns integer language plpgsql immutable set search_path='' as $$
declare a numeric;b numeric;
begin
 if s is null or k is null or s<0 or k<0 then raise exception 'INVALID_SUM';end if;
 a:=greatest(0,s-9);b:=greatest(0,k-9);
 return round(3000*(a-b)/(a+b+20))::integer;
end $$;
create function iid_v4.decay_cumulative(t integer) returns integer language plpgsql immutable set search_path='' as $$
begin
 if t is null or t not between 0 and 2592000 then raise exception 'INVALID_AGE';end if;
 return round(10000*t::numeric/86400+7000*t::numeric*t/(30::numeric*86400*86400))::integer;
end $$;
-- Owner-only preparation. It never enables admission or disables the old world.
create function iid_v4.prepare_epoch(p_start timestamptz) returns uuid language plpgsql set search_path='' as $$
declare e uuid;n integer;t integer;prev integer:=0;
begin
 if p_start is null or p_start<>date_trunc('day',p_start at time zone 'UTC') at time zone 'UTC' then raise exception 'UTC_MIDNIGHT_REQUIRED';end if;
 insert into iid_v4.epochs(starts_at,deadline_at)values(p_start,p_start+interval '720 hours')returning id into e;
 for n in 1..180 loop insert into iid_v4.events values(e,'BATTLE',n,p_start+n*interval '4 hours',1,null,null,null,null,null,null,null,null);end loop;
 for n in 1..30 loop insert into iid_v4.events values(e,'CHAOS',n,p_start+n*interval '24 hours',2,null,null,null,null,null,null,null,null);end loop;
 for n in 1..120 loop
 t:=18000+(n-1)*21600;
 insert into iid_v4.events(epoch_id,kind,seq,scheduled_at,priority,decay)values(e,'DECAY',n,p_start+t*interval '1 second',3,iid_v4.decay_cumulative(t)-iid_v4.decay_cumulative(prev));prev:=t;
 end loop;
 insert into iid_v4.events(epoch_id,kind,seq,scheduled_at,priority,decay)values(e,'FINAL',1,p_start+interval '720 hours',4,510000-iid_v4.decay_cumulative(prev));
 return e;
end $$;
create function iid_v4.check_open(e iid_v4.epochs,t timestamptz) returns void language plpgsql set search_path='' as $$
begin
 if not e.admission or e.status<>'ACTIVE' or t<e.starts_at or t>=e.deadline_at then raise exception 'V4_CLOSED';end if;
 if exists(select 1 from iid_v4.events where epoch_id=e.id and settled_at is null and scheduled_at<=t) then raise exception 'V4_SYNC_PENDING';end if;
end $$;
create function iid_v4.add_power(e uuid,k text,n integer,u uuid,s bigint,d bigint)returns void language sql set search_path='' as $$
 insert into iid_v4.buckets(epoch_id,kind,seq,shard,save_sum,kill_sum)
 values(e,k,n,get_byte(decode(replace(u::text,'-',''),'hex'),15)%64,s,d)
 on conflict(epoch_id,kind,seq,shard)do update set save_sum=iid_v4.buckets.save_sum+excluded.save_sum,kill_sum=iid_v4.buckets.kill_sum+excluded.kill_sum;
$$;
create function iid_v4.start_battle(p_request_id uuid,p_action text)returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); e iid_v4.epochs;g iid_v4.events;b iid_v4.attempts;t timestamptz;n integer;
begin
 if p_request_id is null or p_action is null or p_action not in ('HEAL','KILL')then raise exception 'INVALID_START';end if;
 select * into b from iid_v4.attempts where user_id=u and request_id=p_request_id;
 if found then
 if b.action<>p_action then raise exception 'REQUEST_CONFLICT';end if;
 return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());end if;
 select * into e from iid_v4.epochs where status='ACTIVE' for share;
 if not found then raise exception 'V4_CLOSED';end if;
 t:=clock_timestamp();perform iid_v4.check_open(e,t);
 n:=floor(extract(epoch from(t-e.starts_at))/14400)::integer+1;
 select * into strict g from iid_v4.events where epoch_id=e.id and kind='BATTLE' and seq=n for share;
 t:=clock_timestamp();perform iid_v4.check_open(e,t);
 if g.settled_at is not null or t+interval '12 seconds'>=g.scheduled_at then raise exception 'WINDOW_CLOSED';end if;
 insert into iid_v4.attempts(epoch_id,seq,user_id,request_id,action,started_at)values(e.id,n,u,p_request_id,p_action,t)returning * into b;
 return to_jsonb(b)||jsonb_build_object('server_now',t,'ready_at',t+interval '2 seconds','finish_not_before',t+interval '12 seconds','window_end',g.scheduled_at);
end $$;
create function iid_v4.finish_battle(p_battle_id uuid,p_tap_total integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); e iid_v4.epochs;g iid_v4.events;b iid_v4.attempts;t timestamptz;c integer;p integer;
begin
 if p_tap_total is null or p_tap_total not between 0 and 50 then raise exception 'INVALID_TAPS';end if;
 select * into b from iid_v4.attempts where id=p_battle_id and user_id=u;
 if not found then raise exception 'BATTLE_NOT_FOUND';end if;
 select * into strict e from iid_v4.epochs where id=b.epoch_id for share;
 select * into strict g from iid_v4.events where epoch_id=e.id and kind='BATTLE' and seq=b.seq for share;
 select * into strict b from iid_v4.attempts where id=b.id for update;
 if b.completed_at is not null then
 if b.taps<>p_tap_total then raise exception 'REQUEST_CONFLICT';end if;
 return to_jsonb(b);end if;
 t:=clock_timestamp();perform iid_v4.check_open(e,t);
 if g.settled_at is not null or t>=g.scheduled_at then raise exception 'WINDOW_CLOSED';end if;
 if t<b.started_at+interval '12 seconds' then raise exception 'BATTLE_NOT_FINISHED';end if;
 c:=case when iid_private.random_int(10)=0 then 105 else 100 end;p:=iid_v4.power(p_tap_total,c);
 update iid_v4.attempts set completed_at=t,taps=p_tap_total,critical=c,power=p where id=b.id returning * into b;
 perform iid_v4.add_power(e.id,'BATTLE',b.seq,u,case when b.action='HEAL' then p else 0 end,case when b.action='KILL' then p else 0 end);
 insert into iid_v4.player_totals(epoch_id,user_id,save_power,kill_power,battles)
 values(e.id,u,case when b.action='HEAL' then p else 0 end,case when b.action='KILL' then p else 0 end,1)
 on conflict(epoch_id,user_id)do update set save_power=iid_v4.player_totals.save_power+excluded.save_power,kill_power=iid_v4.player_totals.kill_power+excluded.kill_power,battles=iid_v4.player_totals.battles+1;
 return to_jsonb(b);
end $$;
create function iid_v4.vote(p_request_id uuid,p_choice text)returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player();e iid_v4.epochs;g iid_v4.events;v iid_v4.votes;t timestamptz;n integer;
begin
 if p_request_id is null or p_choice is null or p_choice not in ('HEAL','KILL')then raise exception 'INVALID_VOTE';end if;
 select * into v from iid_v4.votes where user_id=u and request_id=p_request_id;
 if found then
 if v.choice<>p_choice then raise exception 'REQUEST_CONFLICT';end if;return to_jsonb(v);end if;
 select * into e from iid_v4.epochs where status='ACTIVE' for share;
 if not found then raise exception 'V4_CLOSED';end if;
 t:=clock_timestamp();perform iid_v4.check_open(e,t);n:=floor(extract(epoch from(t-e.starts_at))/86400)::integer+1;
 select * into strict g from iid_v4.events where epoch_id=e.id and kind='CHAOS' and seq=n for share;
 t:=clock_timestamp();perform iid_v4.check_open(e,t);
 if g.settled_at is not null or t>=g.scheduled_at then raise exception 'VOTE_CLOSED';end if;
 insert into iid_v4.votes(epoch_id,seq,user_id,request_id,choice,created_at)values(e.id,n,u,p_request_id,p_choice,t)returning * into v;
 perform iid_v4.add_power(e.id,'CHAOS',n,u,case when p_choice='HEAL' then 1 else 0 end,case when p_choice='KILL' then 1 else 0 end);
 return to_jsonb(v);
end $$;
-- One transaction, maximum 16 events. Caller may invoke at most 4 times separately.
create function iid_v4.settle_due()returns integer language plpgsql set search_path='' as $$
declare e iid_v4.epochs;g iid_v4.events;s bigint;k bigint;d integer;v_hp integer;n integer:=0;
begin
 if not pg_try_advisory_xact_lock(484944,4)then return 0;end if;
 select * into e from iid_v4.epochs where status='ACTIVE' and admission for update;
 if not found then return 0;end if;
 for g in select * from iid_v4.events where epoch_id=e.id and settled_at is null and scheduled_at<=clock_timestamp() order by scheduled_at,priority limit 16 for update loop
 select coalesce(sum(save_sum),0),coalesce(sum(kill_sum),0)into s,k from iid_v4.buckets where epoch_id=e.id and kind=g.kind and seq=g.seq;
 d:=case g.kind when 'BATTLE' then iid_v4.battle_delta(s,k) when 'CHAOS' then iid_v4.chaos_delta(s,k) else -g.decay end;
 v_hp:=greatest(0,least(1000000,e.hp+d));
 update iid_v4.events set settled_at=clock_timestamp(),nominal=d,applied=v_hp-e.hp,hp_before=e.hp,hp_after=v_hp,save_sum=s,kill_sum=k where epoch_id=e.id and kind=g.kind and seq=g.seq;
 update iid_v4.epochs set hp=v_hp,status=case when v_hp=0 or g.kind='FINAL' then 'FINAL' else 'ACTIVE' end,
 winner=case when v_hp=0 then 'KILL' when g.kind='FINAL' then 'SAVE' end,
 ended_at=case when v_hp=0 or g.kind='FINAL' then g.scheduled_at end,version=version+1 where id=e.id returning * into e;
 n:=n+1;if e.status='FINAL'then exit;end if;
 end loop;return n;
end $$;
create function iid_v4.summary()returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'hp',hp,'max_hp',1000000,'status',status,'winner',winner,'starts_at',starts_at,'deadline_at',deadline_at,'version',version,'admission',admission)
 from iid_v4.epochs order by starts_at desc limit 1;
$$;
create function iid_v4.bootstrap()returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player();e iid_v4.epochs;t timestamptz:=clock_timestamp();b iid_v4.attempts;v iid_v4.votes;
begin
 select * into e from iid_v4.epochs order by starts_at desc limit 1;
 select * into b from iid_v4.attempts where epoch_id=e.id and user_id=u and seq=floor(extract(epoch from(t-e.starts_at))/14400)::integer+1;
 select * into v from iid_v4.votes where epoch_id=e.id and user_id=u and seq=floor(extract(epoch from(t-e.starts_at))/86400)::integer+1;
 return jsonb_build_object('server_now',t,'world',iid_v4.summary(),'battle',to_jsonb(b),'vote',to_jsonb(v),'sync_pending',exists(select 1 from iid_v4.events where epoch_id=e.id and settled_at is null and scheduled_at<=t));
end $$;
-- Public API wrappers invoke only checked operations. No direct table permissions.
create function public.iid_v4_start(p_request_id uuid,p_action text)returns jsonb language sql security invoker set search_path='' as $$select iid_v4.start_battle(p_request_id,p_action)$$;
create function public.iid_v4_finish(p_battle_id uuid,p_tap_total integer)returns jsonb language sql security invoker set search_path='' as $$select iid_v4.finish_battle(p_battle_id,p_tap_total)$$;
create function public.iid_v4_vote(p_request_id uuid,p_choice text)returns jsonb language sql security invoker set search_path='' as $$select iid_v4.vote(p_request_id,p_choice)$$;
create function public.iid_v4_bootstrap()returns jsonb language sql security invoker set search_path='' as $$select iid_v4.bootstrap()$$;
create function public.iid_v4_summary()returns jsonb language sql security invoker set search_path='' as $$select iid_v4.summary()$$;
revoke all on all tables in schema iid_v4 from public,anon,authenticated;
revoke execute on all functions in schema iid_v4 from public,anon,authenticated;
grant usage on schema iid_v4 to authenticated,anon;
grant execute on function iid_v4.start_battle(uuid,text),iid_v4.finish_battle(uuid,integer),iid_v4.vote(uuid,text),iid_v4.bootstrap()to authenticated;
grant execute on function iid_v4.summary()to anon,authenticated;
revoke execute on function public.iid_v4_start(uuid,text),public.iid_v4_finish(uuid,integer),public.iid_v4_vote(uuid,text),public.iid_v4_bootstrap(),public.iid_v4_summary()from public,anon,authenticated;
grant execute on function public.iid_v4_start(uuid,text),public.iid_v4_finish(uuid,integer),public.iid_v4_vote(uuid,text),public.iid_v4_bootstrap()to authenticated;
grant execute on function public.iid_v4_summary()to anon,authenticated;
commit;
