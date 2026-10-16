import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('V4 settlement runner has bounded catch-up and does not touch V2',async()=>{
 const code=await readFile('supabase/migrations/20261016184500_v4_scheduler_core_staged.sql','utf8');
 assert.match(code,/create function iid_v4\.scheduler_tick\(\)/i);
 assert.match(code,/where published and status='ACTIVE'/);
 assert.match(code,/for i in 1\.\.4 loop/);
 assert.match(code,/iid_v4\.settle_due\(\)/);
 assert.match(code,/exit when batch<16/);
 assert.match(code,/remaining_due/);
 assert.match(code,/revoke all on function iid_v4\.scheduler_tick\(\) from public,anon,authenticated/i);
 assert.doesNotMatch(code,/update public\.iid_world|iid_private\.run_v2_scheduler|cron\.schedule|update iid_v4\.epochs/i);
});

test('pg_cron registration is staged inactive atomically, not a production activation',async()=>{
 const sql=await readFile('supabase/migrations/20261016184600_v4_cron_registered_disabled.sql','utf8');
 assert.match(sql,/cron\.schedule\('iid-v4-settlement','\* \* \* \* \*'/);
 assert.match(sql,/cron\.alter_job\(job_id=>v_job,active=>false\)/);
 assert.match(sql,/raise exception 'V4_CRON_FAILED_TO_DISABLE'/);
 assert.doesNotMatch(sql,/v2_enabled|update public\.iid_world|update iid_v4\.epochs|admission=true|published=true/);
});

test('V4 routing remains unpublished, V2 game code untouched',async()=>{
 const flow=await readFile('public/flow.js','utf8');
 const v4=await readFile('src/v4-summary.js','utf8');
 assert.match(flow,/if\(v4World\?\.id\)/);
 assert.match(flow,/initGlobalBattle/);
 assert.match(v4,/iid_v4_summary/);
 assert.doesNotMatch(v4,/iid_v4\.scheduler_tick|iid_v4\.settle_due/);
 const original=await readFile('supabase/migrations/20261014132500_v2_auto_settle_guard.sql','utf8');
 assert.match(original,/run_v2_scheduler/);
});
