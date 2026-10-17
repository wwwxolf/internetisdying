import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Arena Internet Vitals uses World 001 pixel round Earth with pecking chickens",async()=>{
 const arena=await readFile("public/arena.html","utf8");
 const css=await readFile("public/styles.css","utf8");
 const asset="./assets/world001-pecking-globe.svg";
 for(const page of [arena]){
  assert.match(page,/class="heart-zone world-core-zone"[^>]*id="heart-zone"/);
  assert.match(page,/class="world-core-visual"/);
  assert.match(page,/class="world-core-img" src="\.\/assets\/world001-pecking-globe\.svg"/);
  assert.match(page,/class="world-core-signal" aria-hidden="true"/);
  assert.ok(page.includes(asset));
 }
 assert.doesNotMatch(arena,/<svg viewBox="0 0 16 16" class="pixel-heart"/);
 assert.match(css,/@keyframes internet-core-pulse/); // legacy landing pulse remains available
 assert.match(css,/\.world-core-zone\[data-stage="dead"\] \.world-core-img/);
 const graphic=await readFile("public/assets/world001-pecking-globe.svg","utf8");
 assert.match(graphic,/viewBox="0 0 400 240"/);
 assert.match(graphic,/Four pixel chickens peck the internet globe/);
 assert.match(graphic,/three comic bubbles saying PECK!/);
 assert.match(graphic,/shape-rendering="crispEdges"/);
 const body=await readFile("public/arena.css","utf8");
 assert.match(body,/world-core-visual\{\s*width:min\(100%,420px\)/);
 assert.match(body,/world-core-signal\{display:none\}/);
});

test("only Arena illustration changed; server HP and live battle hooks remain wired",async()=>{
 const arena=await readFile("public/arena.html","utf8");
 const battle=await readFile("public/global-battle.js","utf8");
 for(const id of ["heart-zone","arena-hp","arena-status","arena-progress","arena-fill","arena-percent"]){
  assert.ok(arena.includes('id="'+id+'"'),id+" must stay present");
 }
 assert.match(battle,/\$\('heart-zone'\)\.dataset\.stage/);
 assert.match(battle,/\$\('arena-status'\)\.textContent/);
 assert.match(arena,/SERVER VERIFIED/);
 assert.match(arena,/SHARED WORLD HEALTH/);
});

test("World_002–005 artwork is monochrome, readable and World_001 remains full-color",async()=>{
 const landing=await readFile("public/multiverse.html","utf8");
 const css=await readFile("public/multiverse.css","utf8");
 assert.match(landing,/multiverse\.css\?v=3/);
 for(const [no,animal] of [["002","cat"],["003","cow"],["004","pigeon"],["005","monkey"]]){
  assert.match(landing,new RegExp('WORLD_'+no));
  assert.match(landing,new RegExp('src="\\.\\/assets\\/world-'+animal+'\\.svg"'));
 }
 assert.match(landing,/class="world-active"/);
 assert.match(landing,/src="\.\/assets\/world-chicken\.svg"/);
 assert.match(css,/\.world-locked \.world-art\s*\{[^}]*filter:grayscale\(1\)/);
 assert.doesNotMatch(css,/\.world-active \.world-art\s*\{[^}]*grayscale/);
 assert.match(landing,/LOCKED/);
});

