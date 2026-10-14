-- NEXT CHAOS + WORLD DECAY. REVIEW BRANCH ONLY.
-- No pg_cron job and no active feature gates are installed by this migration.
-- Do not start scheduler jobs or set chaos_control.enabled until QA and explicit rollout.
create table public.iid_chaos_catalog(
  day_rotation smallint primary key check(day_rotation between 1 and 30),
  damage_title text not null,
  damage_slug text not null unique,
  damage_description text not null,
  damage_hp integer not null check(damage_hp=-6000),
  damage_pixel_prompt text not null,
  recovery_title text not null,
  recovery_slug text not null unique,
  recovery_description text not null,
  recovery_hp integer not null check(recovery_hp=6000),
  recovery_pixel_prompt text not null
);
insert into public.iid_chaos_catalog
(day_rotation,damage_title,damage_slug,damage_description,damage_hp,damage_pixel_prompt,
 recovery_title,recovery_slug,recovery_description,recovery_hp,recovery_pixel_prompt)
values
(1,'BOT INVASION','bot-invasion','An army of bots floods the internet with malicious requests.',-6000,'16-bit pixel art of bot invasion, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','GLOBAL FIREWALL','global-firewall','A planet-wide firewall shields the internet core.',6000,'16-bit pixel art of global firewall, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(2,'MALWARE STORM','malware-storm','Malware spreads across connected devices.',-6000,'16-bit pixel art of malware storm, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','PATCH DEPLOYMENT','patch-deployment','Emergency security patches secure vulnerable systems.',6000,'16-bit pixel art of patch deployment, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(3,'DDOS TSUNAMI','ddos-tsunami','Fake traffic overwhelms crucial servers.',-6000,'16-bit pixel art of ddos tsunami, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','LOAD BALANCER SURGE','load-balancer-surge','Traffic is redistributed across resilient infrastructure.',6000,'16-bit pixel art of load balancer surge, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(4,'RANSOMWARE LOCKDOWN','ransomware-lockdown','Ransomware encrypts digital services.',-6000,'16-bit pixel art of ransomware lockdown, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','BACKUP RESTORE','backup-restore','Clean backups bring essential systems online.',6000,'16-bit pixel art of backup restore, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(5,'ZERO-DAY BREACH','zero-day-breach','A hidden exploit tears through network defenses.',-6000,'16-bit pixel art of zero-day breach, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','EMERGENCY HOTFIX','emergency-hotfix','Developers deploy a critical security fix.',6000,'16-bit pixel art of emergency hotfix, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(6,'PHISHING SWARM','phishing-swarm','Fake messages harvest digital credentials.',-6000,'16-bit pixel art of phishing swarm, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','TRUST SHIELD','trust-shield','Identity protection systems block scams.',6000,'16-bit pixel art of trust shield, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(7,'DATA LEAK CASCADE','data-leak-cascade','Sensitive records spill across the network.',-6000,'16-bit pixel art of data leak cascade, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','ENCRYPTION WAVE','encryption-wave','Encrypted connections protect private data.',6000,'16-bit pixel art of encryption wave, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(8,'SPAM APOCALYPSE','spam-apocalypse','An avalanche of junk floods global messaging.',-6000,'16-bit pixel art of spam apocalypse, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','CLEAN INBOX PROTOCOL','clean-inbox-protocol','Powerful filters restore clear communication.',6000,'16-bit pixel art of clean inbox protocol, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(9,'SERVER MELTDOWN','server-meltdown','Critical server racks overheat and shut down.',-6000,'16-bit pixel art of server meltdown, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','COOLING GRID RECOVERY','cooling-grid-recovery','Cooling and failover systems revive data centers.',6000,'16-bit pixel art of cooling grid recovery, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(10,'DNS CHAOS','dns-chaos','Internet addresses fail to resolve.',-6000,'16-bit pixel art of dns chaos, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','ROOT DNS STABILIZED','root-dns-stabilized','Global DNS infrastructure is stabilized.',6000,'16-bit pixel art of root dns stabilized, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(11,'DARK WEB LEAK','dark-web-leak','Stolen credentials spread through hidden networks.',-6000,'16-bit pixel art of dark web leak, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','PURGE OPERATION','purge-operation','Security teams revoke compromised credentials.',6000,'16-bit pixel art of purge operation, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(12,'AI BOT RIOT','ai-bot-riot','Rogue automated agents flood digital platforms.',-6000,'16-bit pixel art of ai bot riot, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','HUMAN MODERATION NET','human-moderation-net','Human moderators restore order across feeds.',6000,'16-bit pixel art of human moderation net, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(13,'CLICKBAIT EXPLOSION','clickbait-explosion','Misleading headlines drown out useful signals.',-6000,'16-bit pixel art of clickbait explosion, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','TRUTH VERIFICATION GRID','truth-verification-grid','Verification networks spotlight trustworthy information.',6000,'16-bit pixel art of truth verification grid, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(14,'TROJAN DROP','trojan-drop','Trojan software infects devices in secret.',-6000,'16-bit pixel art of trojan drop, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','DEVICE PURIFICATION','device-purification','A global cleanup removes malicious programs.',6000,'16-bit pixel art of device purification, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(15,'ACCOUNT HIJACK WAVE','account-hijack-wave','Attackers seize control of user accounts.',-6000,'16-bit pixel art of account hijack wave, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','2FA UPRISING','2fa-uprising','Stronger account verification blocks intruders.',6000,'16-bit pixel art of 2fa uprising, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(16,'ROGUE ALGORITHM','rogue-algorithm','A runaway recommendation engine spreads chaos.',-6000,'16-bit pixel art of rogue algorithm, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','ETHICAL AI PATCH','ethical-ai-patch','A safety update stabilizes automated systems.',6000,'16-bit pixel art of ethical ai patch, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(17,'DEEPFAKE OUTBREAK','deepfake-outbreak','Synthetic fakes erode trust across the web.',-6000,'16-bit pixel art of deepfake outbreak, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','AUTHENTICITY SCANNER','authenticity-scanner','Content provenance checks help expose deception.',6000,'16-bit pixel art of authenticity scanner, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(18,'COOKIE CORRUPTION','cookie-corruption','Broken sessions lock users out of the internet.',-6000,'16-bit pixel art of cookie corruption, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','SESSION REPAIR PROTOCOL','session-repair-protocol','Authentication systems restore secure sessions.',6000,'16-bit pixel art of session repair protocol, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(19,'ROUTER UPRISING','router-uprising','Network routers misdirect packets worldwide.',-6000,'16-bit pixel art of router uprising, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','NETWORK REROUTE','network-reroute','Resilient routes keep important traffic moving.',6000,'16-bit pixel art of network reroute, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(20,'CABLE CUT CRISIS','cable-cut-crisis','A major internet backbone connection breaks.',-6000,'16-bit pixel art of cable cut crisis, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','BACKBONE REPAIR','backbone-repair','Technicians reconnect critical network links.',6000,'16-bit pixel art of backbone repair, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(21,'MEME VIRUS','meme-virus','An unstoppable meme storm buries useful content.',-6000,'16-bit pixel art of meme virus, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','QUALITY FILTER','quality-filter','Signal filters restore clarity to the feed.',6000,'16-bit pixel art of quality filter, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(22,'APP STORE INFESTATION','app-store-infestation','Malicious apps spread through download stores.',-6000,'16-bit pixel art of app store infestation, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','SAFE APP SWEEP','safe-app-sweep','Security sweeps remove dangerous software.',6000,'16-bit pixel art of safe app sweep, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(23,'CLOUD COLLAPSE','cloud-collapse','Cloud service outages ripple worldwide.',-6000,'16-bit pixel art of cloud collapse, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','MULTI-CLOUD FAILOVER','multi-cloud-failover','Backup cloud regions keep services online.',6000,'16-bit pixel art of multi-cloud failover, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(24,'PASSWORD PANIC','password-panic','Weak passwords fuel a wave of account attacks.',-6000,'16-bit pixel art of password panic, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','PASSKEY REVOLUTION','passkey-revolution','Safer sign-in methods protect user accounts.',6000,'16-bit pixel art of passkey revolution, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(25,'API CHAOS','api-chaos','Critical APIs break between connected platforms.',-6000,'16-bit pixel art of api chaos, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','STABLE PROTOCOL UPDATE','stable-protocol-update','Protocol updates restore service compatibility.',6000,'16-bit pixel art of stable protocol update, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(26,'ROGUE EXTENSION','rogue-extension','Malicious browser extensions steal information.',-6000,'16-bit pixel art of rogue extension, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','BROWSER SHIELD','browser-shield','Browser defenses identify risky extensions.',6000,'16-bit pixel art of browser shield, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(27,'NOTIFICATION OVERLOAD','notification-overload','Endless alerts paralyze digital communication.',-6000,'16-bit pixel art of notification overload, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','FOCUS MODE NETWORK','focus-mode-network','Smart prioritization restores healthy signals.',6000,'16-bit pixel art of focus mode network, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(28,'CRYPTOMINER SWARM','cryptominer-swarm','Hidden miners drain computing power.',-6000,'16-bit pixel art of cryptominer swarm, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','RESOURCE CLEANUP','resource-cleanup','Cleanup tools restore device performance.',6000,'16-bit pixel art of resource cleanup, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(29,'SOCIAL PANIC LOOP','social-panic-loop','Viral misinformation creates a global panic.',-6000,'16-bit pixel art of social panic loop, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','CALM SIGNAL BROADCAST','calm-signal-broadcast','Accurate broadcasts help calm online communities.',6000,'16-bit pixel art of calm signal broadcast, protected internet core, green-cyan defensive pixels, dark arcade background; no text'),
(30,'INTERNET BLACKOUT THREAT','internet-blackout-threat','A cascading outage threatens the digital core.',-6000,'16-bit pixel art of internet blackout threat, damaged internet infrastructure, crimson-magenta alert pixels, dark arcade background; no text','CORE REBOOT','core-reboot','The internet core comes back online.',6000,'16-bit pixel art of core reboot, protected internet core, green-cyan defensive pixels, dark arcade background; no text');

create table public.iid_chaos_control(
 id integer primary key check(id=1),
 enabled boolean not null default false,
 anchor_utc date,
 decay_anchor_at timestamptz,
 min_votes integer not null default 20 check(min_votes between 1 and 1000000)
);
insert into public.iid_chaos_control(id) values (1);
create table public.iid_chaos_days(
 day_utc date primary key,
 rotation_day smallint not null references public.iid_chaos_catalog(day_rotation),
 closed boolean not null default false
);
create table public.iid_chaos_votes(
 day_utc date not null references public.iid_chaos_days(day_utc),
 user_id uuid not null,
 choice text not null check(choice in ('damage','recovery')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(day_utc,user_id)
);
create index iid_chaos_vote_tally on public.iid_chaos_votes(day_utc,choice);
create table public.iid_chaos_results(
 day_utc date primary key references public.iid_chaos_days(day_utc),
 rotation_day smallint not null references public.iid_chaos_catalog(day_rotation),
 damage_votes bigint not null,
 recovery_votes bigint not null,
 winner text not null check(winner in ('damage','recovery','tie','no_quorum')),
 nominal_hp integer not null check(nominal_hp in (-6000,0,6000)),
 applied_hp integer not null,
 hp_after integer not null check(hp_after between 0 and 1000000),
 settled_at timestamptz not null default clock_timestamp(),
 world_version bigint
);
create table public.iid_decay_pulses(
 slot_no bigint primary key check(slot_no > 0),
 scheduled_at timestamptz not null unique,
 rolled_hp integer not null check(rolled_hp between 800 and 1000),
 applied_hp integer not null check(applied_hp between 0 and 1000),
 hp_after integer not null check(hp_after between 0 and 1000000),
 world_version bigint not null,
 settled_at timestamptz not null default clock_timestamp()
);

alter table public.iid_chaos_catalog enable row level security;
alter table public.iid_chaos_control enable row level security;
alter table public.iid_chaos_days enable row level security;
alter table public.iid_chaos_votes enable row level security;
alter table public.iid_chaos_results enable row level security;
alter table public.iid_decay_pulses enable row level security;
revoke all on public.iid_chaos_catalog,public.iid_chaos_control,public.iid_chaos_days,
 public.iid_chaos_votes,public.iid_chaos_results,public.iid_decay_pulses from public,anon,authenticated;
grant select on public.iid_chaos_catalog, public.iid_chaos_results,public.iid_decay_pulses to anon,authenticated;
grant select on public.iid_chaos_votes to authenticated;
create policy iid_chaos_catalog_read on public.iid_chaos_catalog
 for select to anon,authenticated using(true);
create policy iid_chaos_results_read on public.iid_chaos_results
 for select to anon,authenticated using(true);
create policy iid_chaos_pulses_read on public.iid_decay_pulses
 for select to anon,authenticated using(true);
create policy iid_chaos_vote_owner on public.iid_chaos_votes
 for select to authenticated using((select auth.uid())=user_id);

-- Current day for display: starts at rotation 1 while paused, automatically
-- cycles through thirty pairs from the operator-set UTC activation date.
create function iid_private.chaos_rotation(p_day date,p_anchor date) returns smallint
language sql immutable set search_path='' as $$
 select case when p_anchor is null or p_day < p_anchor then 1::smallint
 else (1+mod((p_day-p_anchor),30))::smallint end
$$;

create function iid_private.chaos_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); c public.iid_chaos_control;
 t timestamptz:=clock_timestamp(); d date:=(t at time zone 'UTC')::date;
 rotation smallint; vote_choice text; votes_d bigint; votes_r bigint;
 next_pulse timestamptz; last_pulse jsonb; last_result jsonb;
begin
 select * into strict c from public.iid_chaos_control where id=1;
 rotation:=iid_private.chaos_rotation(d,c.anchor_utc);
 select v.choice into vote_choice from public.iid_chaos_votes v
   where v.day_utc=d and v.user_id=u;
 select count(*) filter(where choice='damage'),count(*) filter(where choice='recovery')
 into votes_d,votes_r from public.iid_chaos_votes where day_utc=d;
 select to_jsonb(p) into last_pulse from public.iid_decay_pulses p
  order by p.slot_no desc limit 1;
 select to_jsonb(r) into last_result from public.iid_chaos_results r
  order by r.day_utc desc limit 1;
 if c.decay_anchor_at is not null then
   select c.decay_anchor_at + (coalesce(max(slot_no),0)+1)*interval '3 hours'
   into next_pulse from public.iid_decay_pulses;
 end if;
 return jsonb_build_object(
  'server_now',t,'enabled',c.enabled and (select enabled from public.iid_world where id=1),
  'day_utc',d,'day_rotation',rotation,
  'event',(select to_jsonb(e) from public.iid_chaos_catalog e where e.day_rotation=rotation),
  'voted_for',vote_choice,'damage_votes',votes_d,'recovery_votes',votes_r,
  'closes_at',((d+1)::timestamp at time zone 'UTC'),
  'next_decay_at',next_pulse,'last_decay',last_pulse,'latest_result',last_result,
  'min_votes',c.min_votes,'preview',not c.enabled
 );
end $$;

-- One immutable vote per verified account for each UTC date, regardless of
-- battle count. Day-row locking serializes voting against daily settlement.
create function iid_private.chaos_vote(p_choice text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); c public.iid_chaos_control;
 d date; rot smallint; already text; dayrow public.iid_chaos_days;
begin
 if p_choice is null or p_choice not in ('damage','recovery') then
   raise exception 'INVALID_CHAOS_CHOICE'; end if;
 select * into strict c from public.iid_chaos_control where id=1;
 if not c.enabled or not (select enabled from public.iid_world where id=1)
    or c.anchor_utc is null then raise exception 'CHAOS_PAUSED'; end if;
 d:=(clock_timestamp() at time zone 'UTC')::date;
 if d<c.anchor_utc then raise exception 'CHAOS_NOT_STARTED'; end if;
 rot:=iid_private.chaos_rotation(d,c.anchor_utc);
 insert into public.iid_chaos_days(day_utc,rotation_day)
   values(d,rot) on conflict(day_utc) do nothing;
 select * into strict dayrow from public.iid_chaos_days where day_utc=d for update;
 if dayrow.closed or (clock_timestamp() at time zone 'UTC')::date<>d then
   raise exception 'CHAOS_VOTING_CLOSED'; end if;
 select choice into already from public.iid_chaos_votes where day_utc=d and user_id=u;
 if already is not null then
   if already<>p_choice then raise exception 'VOTE_ALREADY_CAST'; end if;
 else
   insert into public.iid_chaos_votes(day_utc,user_id,choice) values(d,u,p_choice);
 end if;
 return jsonb_build_object('day_utc',d,'choice',p_choice,'recorded',true,'server_now',clock_timestamp());
end $$;

-- Privileged scheduler entrypoint. Draws 800–1000 HP inclusive once per due
-- 3-hour slot; unique slot ledger + world lock prevent double application.
-- Catch-up is bounded to 8 slots per invocation; no scheduler enabled yet.
create function iid_private.process_decay() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.iid_chaos_control; w public.iid_world;
 current_slot bigint; last_slot bigint; i bigint; roll integer;
 new_hp integer; processed integer:=0; t timestamptz:=clock_timestamp();
begin
 select * into strict c from public.iid_chaos_control where id=1 for update;
 select * into strict w from public.iid_world where id=1 for update;
 if not c.enabled or not w.enabled or c.decay_anchor_at is null then
   return jsonb_build_object('status','PAUSED','processed',0);
 end if;
 current_slot:=floor(extract(epoch from (t-c.decay_anchor_at))/10800)::bigint;
 if current_slot<1 then return jsonb_build_object('status','WAITING','processed',0); end if;
 select coalesce(max(slot_no),0) into last_slot from public.iid_decay_pulses;
 for i in (last_slot+1)..least(current_slot,last_slot+8) loop
   roll:=800+iid_private.random_int(201);
   new_hp:=greatest(0,w.hp-roll);
   update public.iid_world set hp=new_hp,version=version+1,updated_at=t where id=1;
   insert into public.iid_decay_pulses(slot_no,scheduled_at,rolled_hp,applied_hp,hp_after,world_version)
     values(i,c.decay_anchor_at+i*interval '3 hours',roll,w.hp-new_hp,new_hp,w.version+1);
   w.hp:=new_hp;w.version:=w.version+1;
   processed:=processed+1;
 end loop;
 return jsonb_build_object('status','OK','processed',processed,'hp',w.hp);
end $$;

-- Resolve the PREVIOUS UTC day. At least 20 unique voters required.
-- Tie/no quorum produces a recorded zero-HP event, never a fabricated winner.
-- One day row lock + one shared world lock ensures atomic one-time settlement.
create function iid_private.resolve_previous_chaos() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.iid_chaos_control; w public.iid_world;
 d date:=((clock_timestamp() at time zone 'UTC')::date-1);
 rotation smallint; damage_n bigint; recovery_n bigint; total_n bigint;
 winner text; nominal integer:=0; after_hp integer; effect integer;
 recorded jsonb;
begin
 select * into strict c from public.iid_chaos_control where id=1;
 if not c.enabled or c.anchor_utc is null or d<c.anchor_utc then
   return jsonb_build_object('status','PAUSED_OR_NOT_STARTED'); end if;
 insert into public.iid_chaos_days(day_utc,rotation_day)
   values(d,iid_private.chaos_rotation(d,c.anchor_utc))
   on conflict(day_utc) do nothing;
 select rotation_day into strict rotation from public.iid_chaos_days where day_utc=d for update;
 select to_jsonb(r) into recorded from public.iid_chaos_results r where day_utc=d;
 if recorded is not null then return recorded; end if;
 select * into strict w from public.iid_world where id=1 for update;
 if not w.enabled then return jsonb_build_object('status','WORLD_PAUSED');end if;
 select count(*) filter(where choice='damage'),count(*) filter(where choice='recovery')
   into damage_n,recovery_n from public.iid_chaos_votes where day_utc=d;
 total_n:=damage_n+recovery_n;
 if total_n<c.min_votes then winner:='no_quorum';
 elsif damage_n=recovery_n then winner:='tie';
 elsif damage_n>recovery_n then winner:='damage';nominal:=-6000;
 else winner:='recovery';nominal:=6000; end if;
 after_hp:=greatest(0,least(1000000,w.hp+nominal));
 effect:=after_hp-w.hp;
 if nominal<>0 then
  update public.iid_world set hp=after_hp,version=version+1,updated_at=clock_timestamp() where id=1;
 end if;
 update public.iid_chaos_days set closed=true where day_utc=d;
 insert into public.iid_chaos_results(day_utc,rotation_day,damage_votes,recovery_votes,
   winner,nominal_hp,applied_hp,hp_after,world_version)
 values(d,rotation,damage_n,recovery_n,winner,nominal,effect,after_hp,
   case when nominal<>0 then w.version+1 else w.version end)
 returning to_jsonb(iid_chaos_results) into recorded;
 return recorded;
end $$;

-- Only two user-facing RPCs. Scheduler functions remain private and
-- unexposed, never grant scheduler privileges to anon/authenticated.
revoke all on function iid_private.chaos_rotation(date,date),
 iid_private.chaos_status(),iid_private.chaos_vote(text),
 iid_private.process_decay(),iid_private.resolve_previous_chaos()
 from public,anon,authenticated;
grant execute on function iid_private.chaos_status(),iid_private.chaos_vote(text)
 to authenticated;

create function public.iid_chaos_status() returns jsonb
language sql security invoker set search_path='' as
$$ select iid_private.chaos_status() $$;
create function public.iid_chaos_vote(p_choice text) returns jsonb
language sql security invoker set search_path='' as
$$ select iid_private.chaos_vote(p_choice) $$;
revoke all on function public.iid_chaos_status(),public.iid_chaos_vote(text)
 from public,anon,authenticated;
grant execute on function public.iid_chaos_status(),public.iid_chaos_vote(text)
 to authenticated;
