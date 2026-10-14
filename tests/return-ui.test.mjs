import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('While You Were Gone exists after identity and before Global Internet HP',async()=>{
 const html=await readFile('public/arena.html','utf8');
 const identity=html.indexOf('class="arena-player"');
 const report=html.indexOf('id="world-return"');
 const hp=html.indexOf('class="arena-stage"');
 assert.ok(identity>0&&report>identity&&hp>report);
 for(const id of ['world-return-heal','world-return-kill','world-return-decay',
  'world-return-chaos','world-return-net','world-return-world',
  'world-return-share','world-return-dismiss','world-return-status']) {
  assert.ok(html.includes('id="'+id+'"'),id+' missing');
 }
 assert.match(html,/world-return\.css\?v=4/);
});
test('While You Were Gone is authenticated and never invents offline world statistics',async()=>{
 const flow=await readFile('public/flow.js','utf8');
 const js=await readFile('public/world-return.js','utf8');
 assert.match(flow,/initWorldReturn\(\{sb,nickname:p\.nickname\}\)/);
 assert.match(js,/sb\.rpc\("iid_return_digest"/);
 assert.match(js,/data\.heal_hp/);
 assert.match(js,/data\.kill_hp/);
 assert.match(js,/data\.decay_hp/);
 assert.match(js,/data\.chaos_hp/);
 assert.match(js,/data\.net_hp/);
 assert.match(js,/share\.disabled=false/);
 assert.match(js,/https:\/\/wa\.me\/\?text=/);
 assert.doesNotMatch(js,/Math\.random|localStorage/);
});
