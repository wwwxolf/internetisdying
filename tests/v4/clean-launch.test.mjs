import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const path='supabase/migrations/20261016210500_v4_scheduled_clean_launch.sql';
test('V4 clean launch is 2026-10-17 00:00 UTC, inert until future cron and precisely bounded',async()=>{
 const sql=await readFile(path,'utf8');
 assert.match(sql,/2026-10-17 00:00:00\+00/);
 assert.match(sql,/state text not null default 'SCHEDULED'/);
 assert.match(sql,/t<ctl\.launch_at/);
 assert.match(sql,/t>=ctl\.launch_at\+interval '3 minutes'/);
 assert.match(sql,/if ctl\.state='COMPLETED'/);
 assert.match(sql,/lock table public\.iid_world/);
 assert.match(sql,/cron\.alter_job\(job_id=>v2_job,active=>false\)/);
 assert.match(sql,/cron\.alter_job\(job_id=>v4_job,active=>true\)/);
 assert.match(sql,/cron\.alter_job\(job_id=>launch_job,active=>false\)/);
 assert.match(sql,/iid_v4\.prepare_epoch\(ctl\.launch_at\)/);
 assert.match(sql,/update iid_v4\.epochs set admission=true/);
 assert.match(sql,/legacy_admission_open=false/);
 assert.match(sql,/legacy_frozen=true/);
 assert.match(sql,/CUTOVER_POSTCONDITION_FAILED/);
 assert.doesNotMatch(sql,/delete from auth\.|truncate auth\.|update auth\.|drop table auth\./i);
 assert.doesNotMatch(sql,/create\s+extension|cron\.schedule\(/i);
});
test('Deleted V2 competitive data and profile require onboarding while Google Auth survives',async()=>{
 const sql=await readFile(path,'utf8');
 for(const table of ['iid_profiles','iid_battles','iid_chaos_votes',
  'iid_chaos_results','iid_chaos_days','iid_decay_pulses','iid_share_cards',
  'iid_hof_totals','iid_hof_season_totals','iid_player_presence',
  'iid_v2_window_results','iid_v2_live_buckets']){
  assert.ok(sql.includes('delete from public.'+table+';'),table);
 }
 const flow=await readFile('public/flow.js','utf8');
 assert.match(flow,/if\(!p\)\{next\("\.\/onboarding\.html"\)/);
 assert.match(flow,/if\(await profile\(u\.id\)\)\{next\("\.\/arena\.html"\)/);
 assert.match(sql,/account_count=n_accounts/);
});
test('V4 cutover performs no unconditional production reset at installation',async()=>{
 const sql=await readFile(path,'utf8');
 const def=sql.indexOf('create function iid_v4.execute_clean_launch()');
 assert.ok(def>0);
 const ddl=sql.slice(0,def);
 assert.doesNotMatch(ddl,/delete from public|update public|truncate public|cron\.alter_job/);
 assert.match(sql,/revoke all on function iid_v4\.execute_clean_launch\(\) from public,anon,authenticated/);
});
