import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('NEXT CHAOS defense stays left of chaos in visual and DOM reading order',async()=>{
 const html=await readFile('public/arena.html','utf8');
 const left=html.indexOf('class="chaos-event recovery"');
 const right=html.indexOf('class="chaos-event damage"');
 assert.ok(left>0&&right>left,'Defense card must be left / first');
 assert.ok(html.indexOf('id="chaos-vote-meter-recovery"') < html.indexOf('id="chaos-vote-meter-damage"'));
 assert.match(html,/id="chaos-projected-impact"/);
 assert.match(html,/MAX ±12,000 HP/);
 assert.doesNotMatch(html,/[\u2212+-]6,000 HP/);
});
test('NEXT CHAOS uses server-projected impact, not legacy static catalog HP',async()=>{
 const js=await readFile('public/daily-chaos.js','utf8');
 assert.match(js,/data\.projected_impact_hp/);
 assert.match(js,/data\.min_votes/);
 assert.match(js,/data-chaos-choice/);
 assert.doesNotMatch(js,/p\.damage_hp|p\.recovery_hp/);
 assert.match(js,/chaos-vote-meter-recovery/);
 assert.match(js,/chaos-vote-meter-damage/);
});
