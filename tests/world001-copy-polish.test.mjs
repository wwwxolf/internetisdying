import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {worldReturnHeadline} from "../public/world-return.js";
import {chickenEventCopy} from "../public/daily-chaos.js";

test("Arena World 001 uses chicken themed display copy and unchanged action protocols",async()=>{
 const arena=await readFile("public/arena.html","utf8");
 const flow=await readFile("public/flow.js","utf8");
 const css=await readFile("public/arena.css","utf8");
 for(const copy of [
  "WORLD_001 / CHICKEN APOCALYPSE","THE CHICKEN",
  "YOUR FIGHTER","THE COOP REPORT","WHILE YOU WERE AWAY_",
  "INTERNET REPAIRED","CHICKEN DAMAGE","NATURAL DECAY",
  "NET INTERNET CHANGE","INTERNET HEALTH NOW",
  "ONE INTERNET. ONE HUNGRY CHICKEN.","PATCH THE NET",
  "KEEP IT AWAY FROM THE CHICKEN","FEED THE CHICKEN",
  "LET IT EAT THE INTERNET","CHICKEN-PROOF FIREWALL","PECK STORM",
  "IMPACT SCALES WITH VOTES"
 ])assert.ok(arena.includes(copy),copy+" should be visible in Arena HTML");
 assert.match(arena,/data-arena-action="HEAL"/);
 assert.match(arena,/data-arena-action="KILL"/);
 assert.match(arena,/data-chaos-choice="recovery"/);
 assert.match(arena,/data-chaos-choice="damage"/);
 assert.match(arena,/id="world-return-heal"/);
 assert.match(arena,/id="world-return-kill"/);
 assert.match(arena,/flow\.js\?v=34/);
 assert.match(arena,/arena\.css\?v=11/);
 assert.match(css,/\.arena-choice \.choice-title\{[^}]*white-space:normal/);
 assert.match(flow,/world-return\.js\?v=7/);
 assert.match(flow,/daily-chaos\.js\?v=4/);
 assert.match(flow,/global-battle\.js\?v=13/);
});

test("World Return headline does not blame chicken for decay or negative chaos",()=>{
 const basic={first_visit:false,net_hp:0,heal_battles:0,kill_battles:0,
  chaos_events:0,decay_pulses:0,kill_hp:0,decay_hp:0,chaos_hp:0};
 assert.equal(worldReturnHeadline({...basic,first_visit:true}),"WELCOME TO WORLD_001_");
 assert.equal(worldReturnHeadline(basic),"NOT A SINGLE PECK WAS HEARD_");
 assert.equal(worldReturnHeadline({...basic,net_hp:40}),"THE INTERNET BITES BACK_");
 assert.equal(worldReturnHeadline({...basic,net_hp:-100,kill_hp:150,decay_hp:20}),"THE CHICKEN IS WINNING_");
 assert.equal(worldReturnHeadline({...basic,net_hp:-100,kill_hp:50,decay_hp:140}),"THE INTERNET TOOK A HIT_");
 assert.equal(worldReturnHeadline({...basic,net_hp:-50,kill_hp:30,chaos_hp:-75}),"THE INTERNET TOOK A HIT_");
 assert.equal(worldReturnHeadline({...basic,net_hp:0,kill_battles:1}),"A PERFECT STALEMATE_");
});

test("Chicken event aliases are display-only and preserve all other rotations",async()=>{
 assert.deepEqual(chickenEventCopy("GLOBAL FIREWALL","Original server description"),{
  title:"CHICKEN-PROOF FIREWALL",
  description:"Defenders reinforce the internet core to block incoming pecks."
 });
 assert.deepEqual(chickenEventCopy("BOT INVASION","Original server description"),{
  title:"PECK STORM",
  description:"The chicken unleashes a furious pecking attack across the network."
 });
 assert.deepEqual(chickenEventCopy("DNS RECOVERY","Unrelated server description"),{
  title:"DNS RECOVERY",description:"Unrelated server description"
 });
 const js=await readFile("public/daily-chaos.js","utf8");
 assert.match(js,/text\("chaos-damage-title",damageCopy\.title\)/);
 assert.match(js,/text\("chaos-recovery-title",recoveryCopy\.title\)/);
 assert.match(js,/pixelIcon\(p\.damage_title,"damage"\)/);
 assert.match(js,/pixelIcon\(p\.recovery_title,"recovery"\)/);
});
