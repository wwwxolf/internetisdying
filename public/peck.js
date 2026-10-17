import {simulate,readChallenge,challengeURL} from './peck-engine.js';
import {LEVELS} from './peck-levels.js';
const $=id=>document.getElementById(id);
const chicken=`<svg class="sprite chicken" viewBox="0 0 24 24" aria-hidden="true"><path fill="#e65232" d="M13 2h3v2h3v4h-7V4h1z"/><path fill="#fff8df" d="M12 6h8v9h-3v4H5v-3H2v-6h3v3h7z"/><path fill="#d6cb9c" d="M6 13h7v4H6z"/><path fill="#efb744" d="M20 9h4v3h-4zM7 19h2v3H5v-2h2zM14 19h2v3h-4v-2h2z"/><path fill="#172b2a" d="M17 8h2v2h-2z"/><path fill="#e65232" d="M18 13h3v3h-3z"/></svg>`;
const server=`<svg class="sprite" viewBox="0 0 24 24" aria-hidden="true"><path fill="#203e36" d="M5 3h14v18H5z"/><path fill="#89bfa0" d="M7 5h10v4H7zM7 11h10v4H7zM7 17h10v2H7z"/><path fill="#e6f78a" d="M8 6h2v2H8zM8 12h2v2H8z"/></svg>`;
const coop=`<svg class="sprite" viewBox="0 0 24 24" aria-hidden="true"><path fill="#9e592d" d="M3 11h18v11H3z"/><path fill="#e68e44" d="M1 9h3V6h4V3h8v3h4v3h3v3H1z"/><path fill="#3d4231" d="M8 14h8v8H8z"/><path fill="#f4d987" d="M5 13h2v7H5zM17 13h2v7h-2z"/></svg>`;
$('portrait').innerHTML=chicken.replace('sprite chicken','sprite');
const initial=readChallenge(location.search,LEVELS);let index=initial.index,side=initial.side,crumbs=[],running=false,result=null,frame=null,trail=new Set(),token=0;
let records={};try{const parsed=JSON.parse(localStorage.getItem('iid-peck-records-v1')||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))records=parsed;}catch{}
const level=()=>LEVELS[index];const tiles=[];
for(let n=0;n<36;n++){const b=document.createElement('button');b.type='button';b.className='tile';b.dataset.cell=n;b.addEventListener('click',()=>place(n));b.addEventListener('keydown',e=>{const dir={ArrowRight:1,ArrowLeft:-1,ArrowDown:6,ArrowUp:-6}[e.key];if(dir){e.preventDefault();const next=n+dir;if(next>=0&&next<36&&(Math.abs(dir)!==1||Math.floor(next/6)===Math.floor(n/6)))tiles[next].focus();}});tiles.push(b);$('board').append(b);}
LEVELS.forEach((l,i)=>{const o=document.createElement('option');o.value=i;o.textContent=String(i+1).padStart(2,'0')+' / '+LEVELS.length;$('level-select').append(o);});
$('share-notice').hidden=!initial.shared;
function updateURL(){const u=new URL(location.href);u.search=new URLSearchParams({level:level().id,side}).toString();try{history.replaceState(null,'',u);}catch{}}
function paint(){
 const l=level(),pos=frame?.position??l.start,remaining=frame?.remaining??crumbs;
 document.body.dataset.side=side;
 tiles.forEach((b,n)=>{const wall=l.walls.includes(n);b.className='tile'+(wall?' wall':'')+(n===l.server?' server':'')+(n===l.coop?' coop':'')+(trail.has(n)?' trail':'');
 const order=remaining.includes(n)?crumbs.indexOf(n)+1:0;
 b.innerHTML=(n===l.server?server+'<span class="cell-label">SERVER</span>':n===l.coop?coop+'<span class="cell-label">COOP</span>':'')+(order?'<span class="crumb"></span><span class="crumb-order">'+order+'</span>':'')+(n===pos?chicken:'');
 // Keep every tile keyboard-focusable for predictable arrow navigation.
 b.setAttribute('aria-disabled',String(running||!!result||wall||n===l.start||n===l.server));
 b.setAttribute('aria-label',`Row ${Math.floor(n/6)+1}, column ${n%6+1}: ${wall?'firewall':n===l.server?'server':n===l.coop?'coop':'floor'}${n===pos?', chicken':''}${order?', crumb '+order:''}`);
 });
 $('save').setAttribute('aria-pressed',String(side==='save'));$('kill').setAttribute('aria-pressed',String(side==='kill'));
 $('mission-title').innerHTML=side==='save'?'Outsmart<br>the appetite.':'Feed the<br>catastrophe.';
 $('mission-copy').textContent=side==='save'?'Lure the chicken into the coop before it reaches the server.':'Eat all 3 crumbs, then reach the server. Stay out of the coop.';
 $('level-name').textContent=l.name;$('sector').textContent=String(index+1).padStart(2,'0');$('level-select').value=index;
 $('crumb-count').textContent=crumbs.length+' / 3 CRUMBS PLACED';$('move-count').textContent=(frame?trail.steps||0:0)+' STEPS';
 $('undo').disabled=running||!!result||!crumbs.length;$('clear').disabled=$('undo').disabled;
 $('release').disabled=running||!!result||crumbs.length===0||(side==='kill'&&crumbs.length!==3);
 $('release').innerHTML=running?'CHICKEN ON THE LOOSE…':result?'RUN COMPLETE <span>✓</span>':'RELEASE THE CHICKEN <span>→</span>';
 for(const id of ['save','kill','previous','forward','level-select'])$(id).disabled=running;
 $('record').textContent=LEVELS.filter(l=>records[l.id+':'+side]).length+' / '+LEVELS.length+' '+side.toUpperCase()+' MISSIONS';
 $('board-state').textContent=running?'● CHICKEN.EXE IS RUNNING':result?(result.won?'● MISSION ACCOMPLISHED':'● PLAN NEEDS MORE THOUGHT'):'● AWAITING QUESTIONABLE PLAN';
}
function place(n){if(running||result)return;const l=level();if(l.walls.includes(n)||n===l.start||n===l.server)return;
 if(crumbs.includes(n))crumbs=crumbs.filter(c=>c!==n);else if(crumbs.length<3)crumbs.push(n);else{$('status').textContent='All three crumbs are placed. Remove one or undo to change your plan.';return;}
 $('status').textContent=side==='kill'&&crumbs.length<3?'Place all three crumbs. The chicken must eat them before reaching the server.':'Crumbs attract within 3 walking steps. You can place one on the coop.';paint();}
function reset(keep=false){token++;running=false;result=null;frame=null;trail=new Set();if(!keep)crumbs=[];$('result').hidden=true;$('copy-fallback').hidden=true;$('status').textContent='Tap a tile to place a crumb. The chicken smells them within 3 walking steps.';paint();updateURL();}
async function run(){if($('release').disabled)return;const id=++token;running=true;result=null;const outcome=simulate(level(),crumbs,side);paint();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 for(let i=1;i<outcome.frames.length;i++){await new Promise(resolve=>setTimeout(resolve,reduced?90:340));if(id!==token)return;frame=outcome.frames[i];trail.add(outcome.frames[i-1].position);trail.steps=i;paint();}
 if(id!==token)return;running=false;result=outcome;
 if(outcome.won){const key=level().id+':'+side;records[key]=Math.min(records[key]||Infinity,outcome.steps);try{localStorage.setItem('iid-peck-records-v1',JSON.stringify(records));}catch{}}
 const perfect=outcome.won&&outcome.steps<=level().par[side];
 $('result-tag').textContent=outcome.won?(perfect?'★ SHORTEST ROUTE · VERY SUSPICIOUSLY CLEVER':'✓ MISSION COMPLETE'):'↶ EVERY BAD PLAN IS A NEW PLAN';
 $('result-title').textContent=outcome.won?(side==='save'?'The internet lives. For now.':'The server was delicious.'):(outcome.reason==='server'?(side==='save'?'Your firewall was edible.':'You forgot the side dishes.'):outcome.reason==='coop'?'Congratulations. You saved it.':'The chicken is going in circles.');
 $('result-copy').textContent=outcome.steps+' steps. '+outcome.eaten+' crumbs eaten. '+(outcome.won?(side==='save'?'One chicken safely in the coop. Send this puzzle to your most chaotic friend.':'Three crumbs and one server. The internet would like a word.'):(side==='kill'?'Eat all 3 crumbs, then reach the server.':'Try a crumb closer to the chicken’s route. Lead it all the way into the coop.'));
 $('status').textContent='Same crumbs, same route. Try a different plan or challenge a friend.';$('result').hidden=false;paint();$('result').focus({preventScroll:true});$('result').scrollIntoView({block:'nearest',behavior:reduced?'instant':'smooth'});
}
async function share(){const url=challengeURL(location.origin,level(),side),text=(result?.won?'I '+(side==='save'?'saved the internet':'fed the chicken')+' in '+result.steps+' steps. ':'Three crumbs. One hungry chicken. ')+(side==='save'?'Can you save this server?':'Can you feed it all three crumbs and the server?');
 try{if(navigator.share){await navigator.share({title:'Chicken Eats the Internet',text,url});$('status').textContent='Challenge shared.';return;}}catch(e){if(e.name==='AbortError')return;}
 try{await navigator.clipboard.writeText(text+' '+url);$('status').textContent='Challenge link copied. Send it to a friend.';}catch{$('copy-fallback').hidden=false;$('share-url').value=url;$('share-url').focus();$('share-url').select();$('status').textContent='Copy the link below to send this exact puzzle.';}
}
$('release').addEventListener('click',run);$('retry').addEventListener('click',()=>{reset(true);tiles[crumbs[0]??0].focus();});
$('undo').addEventListener('click',()=>{crumbs.pop();paint();});$('clear').addEventListener('click',()=>reset());
for(const s of ['save','kill'])$(s).addEventListener('click',()=>{side=s;reset();});
function change(i){index=(i+LEVELS.length)%LEVELS.length;$('share-notice').hidden=true;reset();}
$('previous').addEventListener('click',()=>change(index-1));$('forward').addEventListener('click',()=>change(index+1));$('next').addEventListener('click',()=>change(index+1));$('level-select').addEventListener('change',e=>change(Number(e.target.value)));
$('share').addEventListener('click',share);$('share-plan').addEventListener('click',share);
$('help-open').addEventListener('click',()=>$('help').showModal());$('help-close').addEventListener('click',()=>$('help').close());$('help').addEventListener('click',e=>{if(e.target===$('help')){const r=$('help').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('help').close();}});
window.addEventListener('pagehide',()=>{token++;});paint();updateURL();
