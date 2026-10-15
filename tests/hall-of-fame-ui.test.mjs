import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {initHallOfFame} from "../public/hall-of-fame.js";

function fixture(){
 const old=globalThis.document;
 const nodes=new Map();
 const make=tag=>({tag,children:[],attrs:{},style:{},hidden:false,disabled:false,textContent:"",className:"",
   append(...v){this.children.push(...v)},replaceChildren(){this.children=[]},
   setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this["on_"+k]=fn}});
 globalThis.document={createElement:make,getElementById:id=>{if(!nodes.has(id))nodes.set(id,make("div"));return nodes.get(id)}};
 return {nodes,reset(){globalThis.document=old}};
}
const row=(n,code="IDN")=>({rank:n,nickname:"Player_"+n,country_code:code,custom_flag:null,is_you:false});
test("Hall of Fame renders ten per side and YOU at true rank 13 without leaking IDs",async()=>{
 const f=fixture();
 try{
  const data={engine_version:1,score_unit:"PERSONAL POWER",save:{top:Array.from({length:10},(_,i)=>row(i+1)),self:{rank:13,qualified:true,in_top10:false,nickname:"Myself",country_code:"JPN",custom_flag:null}},
   kill:{top:[row(1)],self:{rank:2,qualified:true,in_top10:true,nickname:"Myself",country_code:"JPN",custom_flag:null}}};
  let calls=0;
  await initHallOfFame({sb:{rpc:async name=>{assert.equal(name,"iid_hall_of_fame");calls++;return {data}}}});
  assert.equal(calls,1);
  assert.equal(f.nodes.get("hof-save-list").children.length,10);
  assert.equal(f.nodes.get("hof-kill-list").children.length,1);
  const mine=f.nodes.get("hof-save-self");
  assert.equal(mine.hidden,false);
  assert.equal(mine.children[1].children[0].textContent,"#13");
  assert.equal(mine.children[1].children[1].textContent,"Myself");
  assert.equal(mine.children[1].children[2].children[1].textContent,"JPN");
  assert.equal(f.nodes.get("hof-kill-self").hidden,true);
  assert.match(f.nodes.get("hof-scoring").textContent,/V1 PERSONAL POWER/);
  await f.nodes.get("hof-refresh").on_click();
  assert.equal(calls,2);
 }finally{f.reset()}
});
test("empty verified leaderboards show UNRANKED; errors do not fabricate rankings",async()=>{
 const f=fixture();
 try{
  const self={rank:null,qualified:false,in_top10:false,nickname:"Myself",country_code:"OTH",custom_flag:"0".repeat(48)};
  let fail=false;
  await initHallOfFame({sb:{rpc:async()=>fail?{error:{message:"Offline"}}:{data:{engine_version:2,score_unit:"WAR INFLUENCE",save:{top:[],self},kill:{top:[],self}}}}});
  assert.equal(f.nodes.get("hof-save-list").children[0].textContent,"NO VERIFIED BATTLES YET");
  assert.equal(f.nodes.get("hof-save-self").children[1].children.at(-1).textContent,"UNRANKED");
  assert.match(f.nodes.get("hof-scoring").textContent,/V2 WAR INFLUENCE/);
  fail=true;
  await f.nodes.get("hof-refresh").on_click();
  assert.match(f.nodes.get("hof-status").textContent,/UNAVAILABLE/);
 }finally{f.reset()}
});
test("Arena wires isolated Hall of Fame without changing game engine imports",async()=>{
 const flow=await readFile("public/flow.js","utf8"),html=await readFile("public/arena.html","utf8");
 assert.match(flow,/initHallOfFame\(\{sb\}\)/);
 assert.match(flow,/global-battle\.js\?v=7/);
 assert.match(html,/id="hall-of-fame"/);
 for(const id of ["hof-save-list","hof-kill-list","hof-save-self","hof-kill-self","hof-status"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/hall-of-fame\.css\?v=1/);
});
