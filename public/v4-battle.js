// Two mutations per completed round. Tap count is a bounded client claim, not proof of humanity.
export async function initV4Battle({sb}){
 const $=id=>document.getElementById(id),choices=[...document.querySelectorAll('[data-arena-action]')];
 let state,offset=0,busy=false,disposed=false,taps=0,hold=null,round=null,finishClaim=null,failed=false;
 let request=null,voteRequest=null;
 const now=()=>Date.now()+offset;
 const text=(id,value)=>{if($(id))$(id).textContent=value;};
 const status=m=>text('flow-status',m);
 async function rpc(name,args={}){const {data,error}=await sb.rpc('iid_v4_'+name,args);if(error)throw error;if(data?.server_now)offset=Date.parse(data.server_now)-Date.now();return data;}
 function render(){
  if(!state?.world)return;const w=state.world;
  text('arena-hp',w.hp.toLocaleString('en-US'));$('arena-fill').style.width=w.hp/10000+'%';
  $('arena-progress').setAttribute('aria-valuenow',String(w.hp/10000));text('arena-percent',(w.hp/10000).toFixed(1)+'% LIFE REMAINING');
  const slot=Math.floor((now()-Date.parse(w.starts_at))/14400000)+1;
  const used=state.battle?.seq===slot;
  const day=Math.floor((now()-Date.parse(w.starts_at))/86400000)+1;
  const voted=state.vote?.seq===day;
  const over=now()>=Date.parse(w.deadline_at);
  for(let i=0;i<6;i++){text('battle-window-state-'+i,i===(slot-1)%6?(used?'USED':'OPEN'):'LOCKED');}
  text('chaos-day','DAY '+Math.min(30,day)+' / 30');
  text('chaos-vote-time',new Date(Date.parse(w.starts_at)+day*86400000).toISOString().slice(11,16)+' UTC');
  text('chaos-decay-time','00 / 06 / 12 / 18 WIB');
  text('chaos-status',voted?'VOTE RECORDED':'ONE IMMUTABLE VOTE PER DAY');
  text('chaos-recovery-desc','Vote to restore World HP at the daily settlement.');
  text('chaos-damage-desc','Vote to damage World HP at the daily settlement.');
  text('chaos-last-decay','WORLD DECAY INCREASES WITH EPOCH AGE');
  text('chaos-last-result','WORLD HP SHOWN IS THE LAST SETTLED SNAPSHOT');
  document.querySelector('.chaos-vote-meter')?.setAttribute('hidden','');
  choices.forEach(b=>b.disabled=busy||!!round||used||state.sync_pending||!w.admission||over||w.status==='FINAL');
  text('save-impact-caption','+ FACTION POWER');text('kill-impact-caption','− FACTION POWER');
  text('arena-hp-pending-score','V4 • FACTION HP SETTLES EVERY 4 HOURS');$('arena-hp-pending').hidden=false;
  $('v2-war').hidden=true;
  text('chaos-projected-impact','UP TO ±3,000 HP • EACH SIDE’S FIRST 9 VOTES DO NOT ADD POWER');
  text('chaos-vote-count',voted?'YOUR VOTE: '+(state.vote.choice==='HEAL'?'SAVE':'KILL'):'ONE VOTE PER UTC DAY');
  document.querySelectorAll('[data-chaos-choice]').forEach(b=>b.disabled=busy||voted||state.sync_pending||!w.admission||over||w.status==='FINAL');
  // V4 owns these controls; legacy V2 modules are never initialized on this route.
  $('next-chaos').hidden=false;
  $('arena-decision').hidden=!!round;
  $('tap-battle').hidden=!round;
  if(w.status==='FINAL')status('EPOCH FINISHED • '+w.winner+' WINS');
  else if(state.sync_pending)status('WORLD IS SYNCHRONIZING • TRY AGAIN SHORTLY');
  if(!round)return;
  const ready=Date.parse(round.started_at)+2000,end=ready+10000;
  // Shared HTML defaults to SAVE; reset the faction visuals for KILL too.
  $('tap-battle').dataset.side=round.action.toLowerCase();
  text('tap-target-mark',round.action==='HEAL'?'+':'×');
  $('tap-target').setAttribute('aria-label',round.action==='HEAL'
    ? 'Tap to patch the internet' : 'Tap to feed the chicken');
  $('tap-countdown').hidden=now()>=ready;text('tap-countdown',String(Math.max(1,Math.ceil((ready-now())/1000))));
  $('tap-target').hidden=now()<ready;$('tap-target').disabled=busy||now()<ready||now()>=end||taps>=50;
  $('tap-hold').hidden=false;$('tap-hold').disabled=$('tap-target').disabled;
  text('tap-side',round.action==='HEAL'?'SAVE':'KILL');text('tap-count',taps+' / 50');text('tap-time',(Math.max(0,end-now())/1000).toFixed(1));
  text('tap-bonus','+'+Math.floor(taps/10)+'%');text('tap-max-label','MAX 50');text('tap-bonus-label','MAX +5%');
  text('tap-instruction','2 • 1 • GO! TAP OR HOLD TO CHARGE.');text('tap-safety','50 TAPS = MAX CHARGE. 10 SECOND ROUND.');
  text('tap-combo',busy?'RECORDING RESULT…':'LOCAL CHARGE • RESULT CONFIRMED ON FINISH');$('tap-charge').style.width=taps*2+'%';
 }
 async function bootstrap(){
  if(busy||disposed)return;busy=true;
  try{state=await rpc('bootstrap');round=state.battle&&!state.battle.completed_at?state.battle:null;
   if(round&&now()>=Date.parse(state.world.starts_at)+round.seq*14400000)round=null;
   if(round&&round.taps!==null)taps=round.taps;failed=false;status('V4 • KEEP THE WORLD ALIVE UNTIL DAY 30');
  }catch(e){status('SYNC FAILED: '+e.message);}finally{busy=false;render();}
 }
 async function start(action){
  if(busy||round)return;busy=true;render();
  try{request??={p_request_id:crypto.randomUUID(),p_action:action};round=await rpc('start',request);state.battle=round;taps=round.taps??0;finishClaim=null;failed=false;request=null;
  }catch(e){status('START PENDING: '+e.message+'. Retry the same action.');}finally{busy=false;render();}
 }
 async function finish(){
  if(busy||!round||failed)return;busy=true;finishClaim??=taps;
  try{const r=await rpc('finish',{p_battle_id:round.id,p_tap_total:finishClaim});state.battle=r;round=null;
   $('arena-result').hidden=false;text('arena-result-title',(r.action==='HEAL'?'SAVE':'KILL')+' • '+r.power+' PERSONAL POWER');
   text('arena-result-text','Critical ×'+r.critical/100+' • Your contribution is recorded. World HP settles when the window closes.');
   if(typeof document.dispatchEvent==='function'&&typeof Event==='function')
    document.dispatchEvent(new Event('iid:battle-settled'));
  }catch(e){failed=true;status('RESULT PENDING: '+e.message+'. Use RETRY SYNC.');}finally{busy=false;render();}
 }
 const tap=()=>{if(round&&!busy&&now()>=Date.parse(round.started_at)+2000&&now()<Date.parse(round.started_at)+12000)taps=Math.min(50,taps+1);};
 const stopHold=()=>{clearInterval(hold);hold=null;};
 choices.forEach(b=>b.addEventListener('click',()=>start(b.dataset.arenaAction)));
 $('tap-target').addEventListener('click',tap);
 const beginHold=()=>{if(hold||$('tap-hold').disabled)return;tap();hold=setInterval(tap,180);};
 $('tap-hold').addEventListener('pointerdown',beginHold);
 for(const event of ['pointerup','pointercancel','pointerleave','blur'])$('tap-hold').addEventListener(event,stopHold);
 $('tap-hold').addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();beginHold();}});$('tap-hold').addEventListener('keyup',stopHold);
 $('battle-refresh').addEventListener('click',()=>{if(round&&failed){failed=false;void finish();}else void bootstrap();});
 document.querySelectorAll('[data-chaos-choice]').forEach(b=>b.addEventListener('click',async()=>{
  if(busy)return;busy=true;render();
  try{voteRequest??={p_request_id:crypto.randomUUID(),p_choice:b.dataset.chaosChoice==='recovery'?'HEAL':'KILL'};state.vote=await rpc('vote',voteRequest);voteRequest=null;}
  catch(e){text('chaos-status','VOTE PENDING: '+e.message);}finally{busy=false;render();}
 }));
 await bootstrap();
 const paint=setInterval(()=>{if(disposed)return;render();if(round&&now()>=Date.parse(round.started_at)+12000)void finish();},100);
 const poll=setInterval(async()=>{if(document.hidden||busy||disposed)return;try{const r=await fetch('/api/v4-summary');if(r.ok){const w=await r.json();if(w?.id===state?.world?.id){state.world=w;render();}}}catch{}},60000);
 window.addEventListener('pagehide',()=>{disposed=true;stopHold();clearInterval(paint);clearInterval(poll);},{once:true});
}
