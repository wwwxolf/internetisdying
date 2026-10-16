import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('V4 cutover guard is installed inert; owner-only control prevents late legacy HP writes',async()=>{
 const src=await readFile('supabase/migrations/20261016192500_v4_legacy_world_freeze_guard.sql','utf8');
 assert.match(src,/legacy_frozen boolean not null default false/);
 assert.match(src,/legacy_frozen\) values\(1,false\)/);
 assert.match(src,/for share/);
 assert.match(src,/raise exception 'LEGACY_WORLD_FROZEN'/);
 assert.match(src,/before update or delete on public\.iid_world/);
 assert.match(src,/before truncate on public\.iid_world/);
 assert.match(src,/exists\(select 1 from iid_v4\.epochs where published\)/);
 assert.match(src,/enable row level security/);
 assert.match(src,/revoke all on iid_v4\.cutover_control from public,anon,authenticated/);
 assert.doesNotMatch(src,/update public\.iid_world|cron\.alter_job|cron\.unschedule|published=true|admission=true/);
});

test('Owner read-only status enumerates all launch blockers, V2 cron failures and V4 backlog',async()=>{
 const src=await readFile('supabase/migrations/20261016192600_v4_owner_readiness_status.sql','utf8');
 for(const needle of ['public.iid_battles','iid_v4.events','iid_v4.epochs',
  'cron.job_run_details','cron.job','public.iid_world','iid_v4.cutover_control',
  'BACKUP_NOT_ATTESTED','MOBILE_OAUTH_AND_V4_END_TO_END_NOT_ATTESTED'])
   assert.ok(src.includes(needle),needle);
 assert.match(src,/'production_ready',false/);
 assert.match(src,/'cutover_authorized',false/);
 assert.match(src,/revoke all on function iid_v4\.cutover_readiness\(\) from public,anon,authenticated/);
 assert.doesNotMatch(src,/update public|update iid_v4|insert into|delete from|truncate|cron\.alter_job|cron\.schedule|cron\.unschedule/i);
});

test('Existing V2 and V4 settlement functions and scheduled activation are unchanged',async()=>{
 const guard=await readFile('supabase/migrations/20261016192500_v4_legacy_world_freeze_guard.sql','utf8');
 const status=await readFile('supabase/migrations/20261016192600_v4_owner_readiness_status.sql','utf8');
 assert.ok(!guard.includes('iid_private.process_v2_windows('));
 assert.ok(!guard.includes('iid_private.run_v2_scheduler('));
 assert.ok(!status.includes('iid_v4.scheduler_tick()'));
 const cron=await readFile('supabase/migrations/20261016184600_v4_cron_registered_disabled.sql','utf8');
 assert.match(cron,/active=>false/);
});
