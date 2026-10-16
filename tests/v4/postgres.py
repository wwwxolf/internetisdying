"""Real PostgreSQL integration/concurrency tests. Disposable database ONLY.
PGDATABASE must be iid_v4_test; never accepts a production URL.
No external Python dependencies: psql is the transport.
"""
import os,subprocess,json,uuid,concurrent.futures,time
from pathlib import Path
assert os.environ.get('PGDATABASE')=='iid_v4_test', 'requires disposable iid_v4_test database'
def sql(s,fail=False):
 p=subprocess.run(['psql','-XAt','-v','ON_ERROR_STOP=1','-c',s],capture_output=True,text=True)
 if fail:
  assert p.returncode!=0,(s,p.stdout);return p.stderr
 assert p.returncode==0,p.stderr
 return p.stdout.strip()
def file(p):sql(Path(p).read_text())
U='10000000-0000-4000-8000-000000000001';V='10000000-0000-4000-8000-000000000002';S='20000000-0000-4000-8000-000000000001'
sql('''create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
create table auth.identities(user_id uuid,provider text);
create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create function auth.jwt()returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
create function auth.uid()returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to anon,authenticated;''')
file('supabase/migrations/20261014003346_create_iid_profiles_with_rls.sql')
file('supabase/migrations/20261014033444_global_battle_engine.sql')
file('supabase/migrations/20261015010610_phase1_player_identity.sql')
file('sql/v4/engine.sql')
file('supabase/migrations/20261016145800_v4_paused_admission_settlement.sql')
file('supabase/migrations/20261016171500_v4_readonly_rankings_return.sql')
file('supabase/migrations/20261016175500_v4_immutable_share_cards.sql')
file('supabase/migrations/20261016184500_v4_scheduler_core_staged.sql')
file('supabase/migrations/20261016192500_v4_legacy_world_freeze_guard.sql')
file('supabase/migrations/20261016192600_v4_owner_readiness_status.sql')
sql(f"insert into auth.users(id)values('{U}'),('{V}');insert into auth.identities values('{U}','google'),('{V}','google');insert into auth.sessions values('{S}','{U}',null),('{V}','{V}',null);insert into public.iid_profiles(user_id,nickname,origin)values('{U}','PlayerOne','HUMAN'),('{V}','PlayerTwo','GLITCH');")
def rpc(expr,u=U,fail=False):
 claims=json.dumps({'sub':u,'session_id':S if u==U else V,'app_metadata':{'provider':'google'}})
 out=sql(f"begin;set local role authenticated;set local request.jwt.claims='{claims}';select {expr};commit;",fail)
 if fail:return out
 return json.loads(next(l for l in out.splitlines() if l.startswith('{')))
def fresh():
 sql('truncate iid_v4.epochs cascade;')
 e=sql("select iid_v4.prepare_epoch(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC');")
 # Move past periods to closed in fixture only; actual scheduler tested separately.
 sql("update iid_v4.epochs set published=true,admission=true;update iid_v4.events set settled_at=clock_timestamp() where scheduled_at<=clock_timestamp();")
 return e
# SQL contract parity: exact expected cases, all powers, signed ties, overflow.
assert sql('select iid_v4.battle_delta(73500,31500),iid_v4.chaos_delta(10,0),iid_v4.decay_cumulative(2592000)')=='4624|143|510000'
assert sql("select bool_and(iid_v4.power(t,c) = round((100+t/10)::numeric*c/100)) from generate_series(0,50)t cross join (values(100),(105))v(c)")=='t'
assert sql('select iid_v4.battle_delta(9223372036854775807,9223372036854775807)')=='0'
e=fresh()
assert sql('select count(*),sum(decay) from iid_v4.events')=='331|510000'
assert sql("select decay from iid_v4.events where kind='FINAL'")=='1000'
assert 'permission denied' in sql('set role anon;select public.iid_v4_start(gen_random_uuid(),\'HEAL\');',True)
assert 'permission denied' in sql('set role authenticated;select * from iid_v4.attempts;',True)
assert 'permission denied' in sql('set role authenticated;select iid_v4.settle_due();',True)
key=str(uuid.uuid4());b=rpc(f"public.iid_v4_start('{key}','HEAL')")
assert rpc(f"public.iid_v4_start('{key}','HEAL')")['id']==b['id']
assert 'REQUEST_CONFLICT' in rpc(f"public.iid_v4_start('{key}','KILL')",fail=True)
assert 'BATTLE_NOT_FINISHED' in rpc(f"public.iid_v4_finish('{b['id']}',50)",fail=True)
assert 'BATTLE_NOT_FOUND' in rpc(f"public.iid_v4_finish('{b['id']}',50)",u=V,fail=True)
sql(f"update iid_v4.attempts set started_at=clock_timestamp()-interval '13 seconds' where id='{b['id']}'")
with concurrent.futures.ThreadPoolExecutor(8) as ex:
 rs=list(ex.map(lambda _:rpc(f"public.iid_v4_finish('{b['id']}',50)"),range(8)))
assert all(r==rs[0] for r in rs)
assert sql("select sum(save_sum) from iid_v4.buckets where kind='BATTLE'")==str(rs[0]['power'])
assert 'REQUEST_CONFLICT' in rpc(f"public.iid_v4_finish('{b['id']}',49)",fail=True)
# Different users hit same period; every contribution retained.
b2=rpc(f"public.iid_v4_start('{uuid.uuid4()}','KILL')",u=V)
sql(f"update iid_v4.attempts set started_at=clock_timestamp()-interval '13 seconds' where id='{b2['id']}'")
r2=rpc(f"public.iid_v4_finish('{b2['id']}',0)",u=V)
assert sql("select sum(kill_sum) from iid_v4.buckets where kind='BATTLE'")==str(r2['power'])
key=str(uuid.uuid4())
with concurrent.futures.ThreadPoolExecutor(8) as ex:vs=list(ex.map(lambda _:rpc(f"public.iid_v4_vote('{key}','HEAL')"),range(8)))
assert all(v==vs[0] for v in vs)
assert sql("select sum(save_sum) from iid_v4.buckets where kind='CHAOS'")=='1'
assert 'REQUEST_CONFLICT' in rpc(f"public.iid_v4_vote('{key}','KILL')",fail=True)
print('PASS formula parity, 331-event schedule, RLS, ownership, replay, parallel duplicate finish/vote')
# Read-only V4 leaderboard is authenticated, rank ordered, scoped to epoch,
# and never exposes auth UUIDs or repackages faction power as settled World HP.
assert 'permission denied' in sql('set role anon;select public.iid_v4_hall_of_fame();',True)
assert 'permission denied' in sql('set role anon;select public.iid_v4_return_report();',True)
assert 'permission denied' in sql('set role authenticated;select * from iid_v4.return_cursors;',True)
hof=rpc("public.iid_v4_hall_of_fame()")
assert hof['engine_version']==4 and hof['score_unit']=='FACTION POWER'
assert hof['personal']=={'battles':1,'save_power':rs[0]['power'],'kill_power':0},hof['personal']
assert hof['save']['top'][0]['nickname']=='PlayerOne',hof['save']
assert hof['save']['top'][0]['rank']==1
assert hof['kill']['top'][0]['nickname']=='PlayerTwo'
assert len(hof['legendary'])==2 and hof['legendary'][0]['power']>=hof['legendary'][1]['power']
assert hof['legendary'][0]['is_you'] is True
assert '"user_id"' not in json.dumps(hof) and U not in json.dumps(hof)
other=rpc("public.iid_v4_hall_of_fame()",u=V)
assert other['save']['self']['qualified'] is False
assert other['kill']['self']['rank']==1
first=rpc("public.iid_v4_return_report()")
assert first['source']=='V4_SETTLED_LEDGER' and first['first_visit'] is True
assert first['save_power']==rs[0]['power'] and first['kill_power']==r2['power']
second=rpc("public.iid_v4_return_report()")
assert second['first_visit'] is False and second['save_power']==0 and second['kill_power']==0
sql("update iid_v4.events set settled_at=clock_timestamp(),applied=-27 where kind='DECAY' and seq=1;update iid_v4.epochs set hp=499973;")
third=rpc("public.iid_v4_return_report()")
assert third['net_hp']==-27 and third['decay_hp']==27 and third['chaos_hp']==0,third
assert third['world_hp']==499973 and third['decay_pulses']==1
assert third['save_power']==0 and third['kill_power']==0
assert rpc("public.iid_v4_return_report()")['net_hp']==0
assert sql("select visits from iid_v4.return_cursors where user_id='"+U+"'")=='4'
print('PASS V4 authenticated top10, Legendary Top3, personal stats, private cursors and world HP accounting')
# Immutable anonymous V4 share is strictly the settled, current-epoch, last-24h ledger.
assert 'permission denied' in sql('set role anon;select public.iid_v4_publish_share_card();',True)
assert 'permission denied' in sql('set role anon;select * from iid_v4.share_cards;',True)
assert 'permission denied' in sql('set role authenticated;select * from iid_v4.share_cards;',True)
published=rpc('public.iid_v4_publish_share_card()')
assert published['snapshot']['engine_version']==4
assert published['snapshot']['source']=='V4_SETTLED_LEDGER_SHARE'
assert published['snapshot']['period']=='LAST_24H'
assert published['snapshot']['net_hp']==-27
assert published['snapshot']['decay_hp']==27
assert published['snapshot']['heal_hp']==0 and published['snapshot']['kill_hp']==0
assert published['snapshot']['world_hp']==499973
assert published['snapshot']['battle_windows']>=0
assert 'user_id' not in published['snapshot'] and 'nickname' not in published['snapshot']
frozen=sql("select public.iid_v4_public_share_card('"+published['id']+"')")
assert json.loads(frozen)==published['snapshot']
sql("update iid_v4.events set applied=-42 where kind='DECAY' and seq=1;update iid_v4.epochs set hp=499958;")
assert json.loads(sql("select public.iid_v4_public_share_card('"+published['id']+"')"))==published['snapshot']
again=rpc('public.iid_v4_publish_share_card()')
assert again['snapshot']['world_hp']==499958
assert again['snapshot']['decay_hp']==42
assert again['snapshot']['net_hp']==-42
assert again['id']!=published['id']
assert rpc("public.iid_v4_public_share_card('"+published['id']+"')") == published['snapshot']
anonymous=sql("set role anon;select public.iid_v4_public_share_card('"+published['id']+"')")
assert json.loads(next(line for line in anonymous.splitlines() if line.startswith('{'))) == published['snapshot']
assert sql("select public.iid_v4_public_share_card(gen_random_uuid())") == ''
print('PASS V4 anonymous immutable share, corrected live cards, applied HP, privacy and V2 isolation')


# Admission pauses new input but MUST NOT stop settlement of already scheduled
# events. This test uses a disposable epoch and never touches production.
sql('truncate iid_v4.epochs cascade;')
sql("select iid_v4.prepare_epoch((date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '1 day');update iid_v4.epochs set published=true,admission=false;")
assert sql('select iid_v4.settle_due()')!='0', 'paused epoch must drain due events'
assert int(sql('select version from iid_v4.epochs'))>0, 'settled event must update epoch version'
assert 'V4_CLOSED' in rpc(f"public.iid_v4_start('{uuid.uuid4()}','HEAL')",fail=True)
assert 'V4_CLOSED' in rpc(f"public.iid_v4_vote('{uuid.uuid4()}','KILL')",fail=True)
print('PASS admission=false disables inputs while preserving chronological event recovery')

# Catch-up and duplicate scheduler, all-empty world. No input changes between runs.
def abandoned(parallel):
 sql('truncate iid_v4.epochs cascade;')
 sql("select iid_v4.prepare_epoch((date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '31 days');update iid_v4.epochs set published=true,admission=true;")
 for _ in range(24):
  if parallel:
   with concurrent.futures.ThreadPoolExecutor(4) as ex:list(ex.map(lambda _:sql('select iid_v4.settle_due()'),range(4)))
  else:sql('select iid_v4.settle_due()')
 result=sql("select hp,status,winner,extract(epoch from ended_at-starts_at)::integer from iid_v4.epochs")
 ledger=sql("select kind,seq,nominal,applied,hp_after from iid_v4.events where settled_at is not null order by scheduled_at,priority")
 before=sql('select version from iid_v4.epochs');assert sql('select iid_v4.settle_due()')=='0';assert sql('select version from iid_v4.epochs')==before
 return result,ledger
one=abandoned(False);many=abandoned(True);assert one==many
assert one[0]=='0|FINAL|KILL|2566800',one[0]
print('PASS chronological catch-up, duplicate scheduler, abandonment, terminal immutability')
print('NOT COVERED: production load, OAuth browser flow, deployment integration')
# Wait until a real exclusive gate lock is visible, then submit an input which
# was valid before waiting but is expired when its shared lock is granted.
for operation in ['finish','vote']:
 fresh()
 if operation=='finish':
  b=rpc(f"public.iid_v4_start('{uuid.uuid4()}','HEAL')")
  sql(f"update iid_v4.attempts set started_at=clock_timestamp()-interval '13 seconds' where id='{b['id']}'")
  expr=f"public.iid_v4_finish('{b['id']}',50)";kind='BATTLE';seq=b['seq']
 else:
  expr=f"public.iid_v4_vote('{uuid.uuid4()}','HEAL')";kind='CHAOS';seq=int(sql("select floor(extract(epoch from(clock_timestamp()-starts_at))/86400)::integer+1 from iid_v4.epochs"))
 sql(f"update iid_v4.events set scheduled_at=clock_timestamp()+interval '1 second' where kind='{kind}' and seq={seq}")
 holder=subprocess.Popen(['psql','-XAt','-v','ON_ERROR_STOP=1','-c',"begin;set application_name='v4_gate_test';select id from iid_v4.epochs for update;select pg_sleep(2);commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 for _ in range(50):
  if sql("select count(*) from pg_stat_activity where application_name='v4_gate_test' and wait_event='PgSleep'")=='1':break
  time.sleep(.02)
 else:raise AssertionError('gate holder not observed')
 err=rpc(expr,fail=True);assert 'V4_SYNC_PENDING' in err or 'WINDOW_CLOSED' in err or 'VOTE_CLOSED' in err,err
 holder.communicate(timeout=5);assert holder.returncode==0
 assert sql('select count(*) from iid_v4.buckets')=='0'
print('PASS real lock-wait finish/cutoff and vote/cutoff races; no late contribution')

# Scheduler wrapper: explicit no-epoch idle; no anonymous/browser execution.
sql('truncate iid_v4.epochs cascade;')
idle=json.loads(sql('select iid_v4.scheduler_tick()'))
assert idle=={'status':'IDLE','settled':0,'remaining_due':0},idle
assert 'permission denied' in sql('set role anon;select iid_v4.scheduler_tick();',True)
assert 'permission denied' in sql('set role authenticated;select iid_v4.scheduler_tick();',True)

# 12 days of abandoned events: <=64 per tick, deterministic chronological catch-up.
# Admission remains CLOSED so settlement must not be prevented by maintenance mode.
sql("select iid_v4.prepare_epoch((date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '12 days');")
sql("update iid_v4.epochs set published=true,admission=false,hp=800000;")
due_before=int(sql("select count(*) from iid_v4.events where settled_at is null and scheduled_at<=clock_timestamp()"))
assert due_before>64,due_before
first_tick=json.loads(sql('select iid_v4.scheduler_tick()'))
assert first_tick['settled']==64 and first_tick['status']=='CATCHING_UP',first_tick
assert first_tick['remaining_due']==due_before-64,first_tick
assert sql("select admission::text from iid_v4.epochs")=='false'
replayed=first_tick['settled']
while True:
 nxt=json.loads(sql('select iid_v4.scheduler_tick()'))
 replayed+=nxt['settled']
 if nxt['remaining_due']==0:break
 assert replayed<=331,'unexpected event replay'
assert replayed==due_before,replayed
assert nxt['status']=='CURRENT' and int(sql('select version from iid_v4.epochs'))==due_before
assert json.loads(sql('select iid_v4.scheduler_tick()'))['settled']==0
assert int(sql('select count(*) from iid_v4.events where settled_at is not null'))==due_before
assert sql('select hp from public.iid_world where id=1')=='500000'
print('PASS scheduler max64/tick, idle fail-closed, admission paused, recovery idempotence and V2 HP isolation')

# Disposable cutover rehearsal. V2 is turned off BEFORE V4 publication.
# This is NOT a production cutover and must not be run in production.
sql('truncate iid_v4.epochs cascade;')
sql("update public.iid_world set enabled=true,hp=506000 where id=1;")
assert sql('select enabled::text from public.iid_world where id=1')=='true'
assert json.loads(sql('select iid_v4.scheduler_tick()'))['status']=='IDLE'
sql("update public.iid_world set enabled=false where id=1;")
assert 'BATTLE_PAUSED' in rpc(f"public.iid_battle_start('{uuid.uuid4()}','HEAL')",fail=True)
sql("select iid_v4.prepare_epoch(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC');")
assert sql('select count(*) from iid_v4.events')=='331'
assert sql('select count(*) from iid_v4.epochs where published')=='0'
assert 'V4_CLOSED' in rpc(f"public.iid_v4_start('{uuid.uuid4()}','HEAL')",fail=True)
sql('update iid_v4.epochs set published=true,admission=false;')
assert json.loads(sql('select iid_v4.summary()'))['admission'] is False
assert 'V4_CLOSED' in rpc(f"public.iid_v4_start('{uuid.uuid4()}','HEAL')",fail=True)
# A newly published epoch may contain due events since UTC midnight.
# Drain them BEFORE opening admission; this is a mandatory cutover gate.
while True:
 pre=json.loads(sql('select iid_v4.scheduler_tick()'))
 if pre['remaining_due']==0:break
assert pre['status'] in ('CURRENT','FINAL'),pre
assert pre['status']=='CURRENT','a finalized epoch must never admit new players'
sql('update iid_v4.epochs set admission=true;')
accepted=rpc(f"public.iid_v4_start('{uuid.uuid4()}','HEAL')")
assert accepted['action']=='HEAL' and accepted['completed_at'] is None
assert sql('select hp from public.iid_world where id=1')=='506000'
assert sql('select enabled::text from public.iid_world where id=1')=='false'
print('PASS isolated V2->V4 cutover rehearsal: old writer paused, epoch prepared privately, V4 admission explicit; V2 HP unchanged')

# Cutover HP guard: dormant during V2, and blocks all old world mutations once
# explicitly armed OR if a V4 epoch has accidentally been published.
sql('truncate iid_v4.epochs cascade;')
sql('update public.iid_world set hp=503777,version=14,enabled=true where id=1;')
assert sql('select hp,version from public.iid_world where id=1')=='503777|14'
assert sql('select legacy_frozen::text from iid_v4.cutover_control')=='false'
assert 'permission denied' in sql('set role anon;select * from iid_v4.cutover_control;',True)
assert 'permission denied' in sql('set role authenticated;select iid_v4.cutover_readiness();',True)
assert 'permission denied' in sql('set role anon;select iid_v4.cutover_readiness();',True)

# cron mock is disposable schema used ONLY to validate the read-only operator
# status query; production cron is queried separately from Supabase.
sql("create schema cron;create table cron.job(jobid bigint,jobname text,schedule text,active boolean);create table cron.job_run_details(jobid bigint,status text,start_time timestamptz);")
sql("insert into cron.job values(1,'iid-v2-world-tick','*/2 * * * *',true),(2,'iid-v4-settlement','* * * * *',false);")
sql("insert into cron.job_run_details values(1,'succeeded',clock_timestamp());")
before=json.loads(sql('select iid_v4.cutover_readiness()'))
assert before['read_only'] is True and before['cutover_authorized'] is False
assert before['production_ready'] is False and before['legacy_cron_healthy'] is True
assert before['v2']['hp']==503777 and before['v2']['cron_active'] is True
assert before['v4']['cron_registered'] is True and before['v4']['cron_active'] is False
assert before['v4']['published_epochs']==0 and before['freeze']['legacy_frozen'] is False
assert len(before['manual_blockers'])>=3
assert sql('select hp from public.iid_world where id=1')=='503777'

sql('update iid_v4.cutover_control set legacy_frozen=true,armed_at=clock_timestamp() where id=1;')
assert 'LEGACY_WORLD_FROZEN' in sql('update public.iid_world set hp=503776 where id=1;',True)
assert 'LEGACY_WORLD_FROZEN' in sql('update public.iid_world set enabled=false where id=1;',True)
assert 'LEGACY_WORLD_FROZEN' in sql('delete from public.iid_world where id=1;',True)
assert 'LEGACY_WORLD_FROZEN' in sql('truncate public.iid_world;',True)
assert sql('select hp from public.iid_world where id=1')=='503777'
during=json.loads(sql('select iid_v4.cutover_readiness()'))
assert during['freeze']['legacy_frozen'] is True and during['production_ready'] is False
sql('update iid_v4.cutover_control set legacy_frozen=false,armed_at=null where id=1;')
sql('update public.iid_world set hp=503776 where id=1;')
assert sql('select hp from public.iid_world where id=1')=='503776'

sql("select iid_v4.prepare_epoch(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC');")
sql('update iid_v4.epochs set published=true,admission=false;')
assert 'LEGACY_WORLD_FROZEN' in sql('update public.iid_world set hp=503775 where id=1;',True)
assert json.loads(sql('select iid_v4.cutover_readiness()'))['v4']['published_epochs']==1
assert sql('select hp from public.iid_world where id=1')=='503776'
print('PASS dormant cutover guard, legacy freeze, published-world HP protection, private readiness status and cron diagnostics')
