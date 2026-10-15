import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PROLOGUE_SCENES,initPrologue} from "../public/prologue.js";

function fixture({seen=false,replay=false}={}){
 const nodes=new Map(),handlers=new Map(), dots=Array.from({length:4},()=>({classes:new Set(),classList:{toggle(){}}}));
 const mk=id=>({
  id,hidden:false,dataset:{},textContent:"",focused:false,
  addEventListener(type,fn){handlers.set(id+":"+type,fn);},
  focus(){this.focused=true;}
 });
 for(const id of ["prologue-frame","prologue-line","prologue-aside","prologue-count",
  "prologue-next","prologue-skip","prologue-final","prologue-save","prologue-kill"])nodes.set(id,mk(id));
 const controls=mk("controls");
 const doc={
  visibilityState:"visible",
  getElementById:id=>nodes.get(id),
  querySelector:sel=>sel===".prologue-controls"?controls:null,
  querySelectorAll:sel=>sel==="[data-progress]"?dots:[],
  addEventListener(type,fn){handlers.set("document:"+type,fn);}
 };
 const state=new Map(seen?[["iid_world001_prologue_seen_v1","1"]]:[]);
 const storage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)};
 let redirect=null,pending=null,clears=0;
 const locationObj={href:"https://test.example/prologue.html"+(replay?"?replay=1":""),search:replay?"?replay=1":"",
  replace:url=>{redirect=url;}};
 return {nodes,controls,doc,storage,locationObj,
  schedule:fn=>{pending=fn;return 1;},cancel:()=>{pending=null;clears++;},
  fire:id=>handlers.get(id+":click")(),read:k=>state.get(k),get redirect(){return redirect;},
  get pending(){return pending;}};
}

test("four short scenes retain the approved jokes and end in a choice",()=>{
 assert.deepEqual(PROLOGUE_SCENES.map(x=>x.line),[
  "Once upon a time, the internet was peaceful.",
  "Then one chicken got hungry.",
  "It ate the internet.",
  "You could stop this."
 ]);
 assert.equal(PROLOGUE_SCENES[1].aside,"Nobody knows where it came from.");
 assert.equal(PROLOGUE_SCENES[2].aside,"Yep. The actual internet.");
 assert.match(PROLOGUE_SCENES[3].aside,/feeding the chicken sounds fun/);
 const f=fixture();
 const r=initPrologue(f);
 assert.equal(r.getCurrentScene(),0);
 assert.equal(f.nodes.get("prologue-line").textContent,PROLOGUE_SCENES[0].line);
 for(let i=1;i<4;i++){
  f.fire("prologue-next");assert.equal(r.getCurrentScene(),i);
  assert.equal(f.nodes.get("prologue-line").textContent,PROLOGUE_SCENES[i].line);
 }
 assert.equal(f.nodes.get("prologue-final").hidden,true); // still waiting for explicit choice
 f.fire("prologue-next");
 assert.equal(f.nodes.get("prologue-final").hidden,false);
 assert.equal(f.controls.hidden,true);
 assert.equal(f.read("iid_world001_prologue_seen_v1"),undefined);
 f.fire("prologue-save");
 assert.equal(f.read("iid_world001_prologue_seen_v1"),"1");
});

test("skip reaches final choice without implying a verified battle",()=>{
 const f=fixture();
 initPrologue(f);
 f.fire("prologue-skip");
 assert.equal(f.nodes.get("prologue-line").textContent,PROLOGUE_SCENES[3].line);
 assert.equal(f.nodes.get("prologue-final").hidden,false);
 assert.equal(f.controls.hidden,true);
 assert.equal(f.read("iid_world001_prologue_seen_v1"),undefined);
 f.fire("prologue-kill");
 assert.equal(f.read("iid_world001_prologue_seen_v1"),"1");
});

test("returning visitors bypass prologue; replay explicitly overrides browser-only flag",()=>{
 const returning=fixture({seen:true});
 assert.deepEqual(initPrologue(returning),{skippedForReturningVisitor:true});
 assert.equal(returning.redirect,"https://test.example/auth.html");
 const replay=fixture({seen:true,replay:true});
 assert.equal(initPrologue(replay).getCurrentScene(),0);
 assert.equal(replay.redirect,null);
});

test("landing Enter World connects to prologue, while server-authenticated Arena stays untouched",async()=>{
 const landing=await readFile("public/index.html","utf8");
 const flow=await readFile("public/flow.js","utf8");
 const page=await readFile("public/prologue.html","utf8");
 const css=await readFile("public/prologue.css","utf8");
 assert.match(landing,/id="join-btn" href="\.\/prologue\.html"/);
 assert.match(landing,/href="\.\/prologue\.html\?replay=1"/);
 assert.doesNotMatch(flow.slice(flow.indexOf('if(page==="landing")'),flow.indexOf('if(page==="auth")')), /next\("\.\/auth\.html"\)/);
 assert.match(page,/id="prologue-save" href="\.\/auth\.html"/);
 assert.match(page,/id="prologue-kill" href="\.\/auth\.html"/);
 assert.match(page,/class="prologue-choice prologue-choice-save"/);
 assert.match(page,/class="prologue-choice prologue-choice-kill"/);
 assert.match(page,/assets\/world-chicken\.svg/);
 assert.match(page,/assets\/dying-internet-core\.svg/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(flow,/async function route\(u\)/);
 assert.match(flow,/if\(page==="arena"\)/);
});
