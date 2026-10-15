import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("all four origin cards use monochrome pixel icons, not letter glyphs",async()=>{
 const html=await readFile("public/onboarding.html","utf8");
 for(const type of ["human","bot","alien","glitch"]){
  assert.match(html,new RegExp('data-origin="'+type.toUpperCase()+'"[^>]*>[\\s\\S]*?avatar-'+type+'\\.svg"'));
  const svg=await readFile("public/assets/avatar-"+type+".svg","utf8");
  assert.match(svg,/viewBox="0 0 44 44"/);
  assert.match(svg,/shape-rendering="crispEdges"/);
  assert.match(svg,/fill="#F6F1E7"/);
  assert.doesNotMatch(svg,/gradient|filter|<script|<image/i);
  assert.ok(svg.length<6000,"sprite should stay lightweight");
 }
 assert.doesNotMatch(html,/<span class="avatar-icon" aria-hidden="true">[HBAG]<\/span>/);
});

test("arena badge uses selected persisted character and does not mutate game state",async()=>{
 const html=await readFile("public/arena.html","utf8");
 const js=await readFile("public/flow.js","utf8");
 assert.match(html,/id="arena-origin-avatar"/);
 assert.match(js,/\["HUMAN","BOT","ALIEN","GLITCH"\]\.includes\(p\.origin\)/);
 assert.match(js,/\$\("arena-origin-avatar"\)\.src="\.\/assets\/avatar-"\+originKey\+"\.svg"/);
 assert.match(js,/\$\("arena-identity"\)\.textContent=p\.origin\+" \/ "\+p\.nickname/);
 assert.match(html,/src="\.\/flow\.js\?v=32"/);
 const css=await readFile("public/styles.css","utf8");
 const arenaCss=await readFile("public/arena.css","utf8");
 assert.match(css,/\.avatar-icon img\{[^}]*image-rendering:pixelated/);
 assert.match(arenaCss,/\.arena-origin-avatar\{[^}]*image-rendering:pixelated/);
});
