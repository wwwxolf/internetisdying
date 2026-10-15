import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderCountryBadge,FLAG_COLORS} from "../public/identity-flag.js";
const mk=tag=>({tag,children:[],style:{},textContent:"",append(child){this.children.push(child)}});
const target=()=>({children:[],hidden:true,attrs:{},replaceChildren(){this.children=[]},append(child){this.children.push(child)},setAttribute(k,v){this.attrs[k]=v}});
test("saved IDN renders flag and three-letter code",()=>{
 const badge=target();
 renderCountryBadge(badge,{country_code:"IDN",custom_flag:null},mk);
 assert.equal(badge.hidden,false);
 assert.equal(badge.children.length,2);
 assert.match(badge.children[0].src,/\/id\.png$/);
 assert.equal(badge.children[1].textContent,"IDN");
 assert.match(badge.attrs["aria-label"],/Indonesia/);
});
test("saved OTH flag decodes precisely 96 color pixels",()=>{
 const badge=target();
 renderCountryBadge(badge,{country_code:"OTH",custom_flag:"1B".repeat(24)},mk);
 assert.equal(badge.hidden,false);
 assert.equal(badge.children[0].children.length,96);
 assert.deepEqual(badge.children[0].children.slice(0,4).map(x=>x.style.backgroundColor),FLAG_COLORS);
 assert.equal(badge.children[1].textContent,"OTH");
});
test("invalid country stays hidden; missing OTH flag shows code without fabricating pixels",()=>{
 const badge=target();
 renderCountryBadge(badge,{country_code:"ZZZ",custom_flag:null},mk);
 assert.equal(badge.hidden,true);
 renderCountryBadge(badge,{country_code:"OTH",custom_flag:null},mk);
 assert.equal(badge.hidden,false);
 assert.equal(badge.children.length,1);
 assert.equal(badge.children[0].textContent,"OTH");
});
test("auth profile select includes country fields; first-visit welcome and nickname CSS are wired",async()=>{
 const flow=await readFile("public/flow.js","utf8");
 const arena=await readFile("public/arena.html","utf8");
 const world=await readFile("public/world-return.js","utf8");
 const style=await readFile("public/styles.css","utf8");
 assert.match(flow,/\.select\("user_id,nickname,origin,country_code,custom_flag"\)/);
 assert.match(flow,/renderCountryBadge\(\$\("arena-country"\),p\)/);
 assert.match(arena,/id="arena-country"/);
 assert.match(arena,/id="world-return-eyebrow"/);
 assert.match(world,/visited\?"WHILE YOU WERE AWAY_":"FIRST VISIT_"/);
 assert.match(world,/if\(data\.first_visit\)return "WELCOME TO WORLD_001_"/);
 assert.match(style,/\.auth-panel #nickname\{/);
});
