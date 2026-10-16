import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initCoopMenu} from '../public/coop-menu.js';

function fixture(){
 const elements=new Map(),classes=new Map();
 const doc={activeElement:null,body:{classList:makeClasses()},listeners:{},
  getElementById(id){return elements.get(id)||null;},
  querySelector(q){return classes.get(q)||null;},
  addEventListener(name,fn){this.listeners[name]=fn;}
 };
 function makeClasses(){const items=new Set();return {
  add(x){items.add(x)},remove(x){items.delete(x)},contains(x){return items.has(x)},
  toggle(x,on){if(on)items.add(x);else items.delete(x);return on;}}}
 function el(id,{hidden=false}={}){
  const node={id,hidden,disabled:false,inert:false,isConnected:true,children:[],parent:null,
   dataset:{},listeners:{},attrs:new Map(),classList:makeClasses(),scrollTop:99,
   append(child){if(child.parent)child.parent.children=child.parent.children.filter(x=>x!==child);
    child.parent=this;this.children.push(child);},
   closest(q){let p=this;while(p){if(q==='[hidden]'&&p.hidden)return p;p=p.parent;}return null;},
   setAttribute(k,v){this.attrs.set(k,v)},getAttribute(k){return this.attrs.get(k)||null},
   addEventListener(event,fn){this.listeners[event]=fn},
   focus(){doc.activeElement=this},
   click(){this.listeners.click?.({key:null,stopImmediatePropagation(){}})},
   querySelectorAll(){return []}
  };
  elements.set(id,node);return node;
 }
 const arena=el('arena-content'),drawer=el('coop-menu-drawer',{hidden:true}),
  tab=el('coop-menu-toggle',{hidden:true}),backdrop=el('coop-menu-backdrop',{hidden:true}),
  closeButton=el('coop-menu-close'),scroll=el('coop-menu-scroll');
 const nav=['report','fame','stats','schedule','fighter'].map(view=>{
  const node=el('nav-'+view);node.dataset.coopView=view;drawer.append(node);return node;});
 drawer.querySelectorAll=selector=>selector==='[data-coop-view]'?nav:
   selector.startsWith('button:not(')?[closeButton,...nav].filter(n=>!n.disabled):[];
 for(const id of ['report','fame','stats','schedule','fighter'])el('coop-pane-'+id);
 for(const id of ['world-return','hall-of-fame','arena-dev-mode','signout','world-return-dismiss',
  'world-return-share','coop-account-actions','coop-menu-current','coop-share-cta',
  'tap-battle'])el(id);
 const stats=el('stats-source'),schedule=el('schedule-source');
 classes.set('.arena-test-tools',stats);classes.set('.battle-windows',schedule);
 elements.get('tap-battle').hidden=true;
 elements.get('world-return').hidden=true;
 elements.get('arena-dev-mode').hidden=true;
 return {doc,el:elements,nav,drawer,tab,backdrop,arena,closeButton};
}

test('Coop drawer preserves original game sections/IDs and moves only presentation',()=>{
 const {doc,el,nav}=fixture(),ui=initCoopMenu({doc,win:{}});
 assert.ok(ui);
 for(const [view,id] of [['report','world-return'],['fame','hall-of-fame'],
  ['stats','stats-source'],['schedule','schedule-source'],['fighter','arena-dev-mode']])
  assert.equal(el.get(id).parent,el.get('coop-pane-'+view),view);
 assert.equal(el.get('signout').parent,el.get('coop-account-actions'));
 assert.equal(el.get('tap-battle').parent,null,'Tap Battle never moved');
 assert.equal(el.get('coop-share-cta').hidden,false);
 assert.equal(el.get('coop-menu-toggle').hidden,false);
 assert.equal(ui.isOpen(),false);
 assert.equal(el.get('world-return').hidden,true,'old server-owned hidden state kept');
 assert.equal(el.get('arena-dev-mode').hidden,true,'server-only owner panel kept');
 assert.equal(nav.length,5);
});

test('Coop Menu supports open/select/outside/Escape and short Pixel Card shortcut',()=>{
 const {doc,el,tab,backdrop,nav}=fixture(),ui=initCoopMenu({doc,win:{}});
 tab.focus();tab.click();
 assert.equal(ui.isOpen(),true);assert.equal(tab.getAttribute('aria-expanded'),'true');
 assert.equal(el.get('coop-pane-report').hidden,false);
 nav[1].click();assert.equal(el.get('coop-pane-fame').hidden,false);
 assert.equal(el.get('coop-pane-report').hidden,true);
 assert.equal(el.get('coop-menu-current').textContent,'HALL OF FAME_');
 doc.listeners.keydown({key:'Escape'});
 assert.equal(ui.isOpen(),false);
 assert.equal(tab.getAttribute('aria-expanded'),'false');
 assert.equal(doc.activeElement,tab);
 el.get('coop-share-cta').click();
 assert.equal(ui.isOpen(),true);
 assert.equal(el.get('coop-pane-report').hidden,false);
 backdrop.click();assert.equal(ui.isOpen(),false);
});

test('Active Tap Battle automatically closes and disables Coop Menu, then restores it',()=>{
 const {doc,el,tab}=fixture();
 const old=globalThis.MutationObserver;
 let observed;
 globalThis.MutationObserver=class{constructor(fn){this.cb=fn;observed=this;}observe(){}disconnect(){}};
 try{
  const ui=initCoopMenu({doc,win:{}});
  ui.open('stats');
  assert.equal(ui.isOpen(),true);
  el.get('tap-battle').hidden=false;observed.cb();
  assert.equal(ui.isOpen(),false);
  assert.equal(tab.disabled,true);
  assert.equal(doc.body.classList.contains('coop-battle-live'),true);
  tab.click();assert.equal(ui.isOpen(),false);
  el.get('tap-battle').hidden=true;observed.cb();
  assert.equal(tab.disabled,false);
  assert.equal(doc.body.classList.contains('coop-battle-live'),false);
 }finally{globalThis.MutationObserver=old;}
});

test('Arena is presentation-only: V4, V2 and OAuth scripts are untouched',async()=>{
 const html=await readFile('public/arena.html','utf8');
 const js=await readFile('public/coop-menu.js','utf8');
 const css=await readFile('public/coop-menu.css','utf8');
 assert.match(html,/coop-menu\.js\?v=1/);assert.match(html,/coop-menu\.css\?v=1/);
 for(const id of ['arena-hp','arena-decision','tap-battle','next-chaos','world-return',
  'hall-of-fame','monthly-summary','battle-windows-grid','arena-dev-mode','signout']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(js,/MutationObserver\(battleState\)/);
 assert.match(js,/pane\.hidden=id!==view/);
 assert.match(js,/drawer\.inert=true/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(html,/flow\.js\?v=38/);
 assert.doesNotMatch(js,/\.rpc\(|iid_v4_start|iid_battle_start|iid_world|fetch\(/);
 assert.doesNotMatch(css,/iid_v4|iid_world|settle_due/);
});
