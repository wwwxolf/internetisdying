import {evaluateWindows} from "./wib-battle-windows.js?v=1";
// Browser renders server facts. It never sends HP, bonus, RNG or a tap total.
export async function initGlobalBattle({sb}) {
  const $=id=>document.getElementById(id);
  const choices=[...document.querySelectorAll('[data-arena-action]')];
  let state=null, battle=null, offset=0, busy=false, tapBusy=false, settling=false;
  let retryAfter=0, tapRetryAfter=0, localTaps=0, disposed=false, refreshBusy=false, syncOk=false;
  const now=()=>Date.now()+offset;
  const fmt=n=>Number(n).toLocaleString('en-US');
  const message=text=>{$('flow-status').textContent=text;};
  async function rpc(name,args={}) {
    const {data,error}=await sb.rpc('iid_battle_'+name,args);
    if(error)throw error;
    if(data?.server_now)offset=Date.parse(data.server_now)-Date.now();
    return data;
  }
  function showResult(r) {
    $('arena-result').hidden=false;
    $('arena-result-title').textContent=(r.action==='HEAL'?'SAVE':r.action)+' • '+fmt(r.applied_hp)+' HP APPLIED';
    $('arena-result-text').textContent=`Base ${fmt(r.base)} × critical ${r.critical} + ${r.bonus}% bonus = ${fmt(r.power)} HP. World after this battle: ${fmt(r.hp_after)}. Permanently recorded.`;
  }
  function render() {
    if(!state)return;
    const w=state.world, m=state.monthly;
    $('arena-hp').textContent=fmt(w.hp);
    $('arena-fill').style.width=(w.hp/10000)+'%';
    $('arena-progress').setAttribute('aria-valuenow',String(w.hp/10000));
    $('arena-percent').textContent=(w.hp/10000).toFixed(1)+'% LIFE REMAINING';
    const stage=w.hp===0?'DEAD':w.hp<=250000?'NEAR DEATH':w.hp<=500000?'CRITICAL':w.hp<=750000?'STABLE':'RECOVERING';
    $('arena-status').textContent='● '+stage;
    $('heart-zone').dataset.stage=w.hp===0?'dead':w.hp<=250000?'danger':'critical';
    $('monthly-summary').textContent=`${m.month} UTC • ${m.nickname} • ${m.tier||'No card yet'} • ${m.battle_count} battles\nSAVE ${m.heal_count} · +${fmt(m.heal_hp)} HP | KILL ${m.kill_count} · −${fmt(m.kill_hp)} HP`;
    const slots=evaluateWindows(state,now());
    for(let i=0;i<6;i++){
      const tile=$('battle-window-'+i),icon=$('battle-window-icon-'+i),
        title=$('battle-window-state-'+i);
      const item=slots.ready?slots.windows[i]:null;
      const kind=item?.state||'LOCKED';
      tile.dataset.windowState=kind;
      icon.textContent=kind==='USED'?'✓':kind==='MISSED'?'—':kind==='ACTIVE'?'◆':'■';
      title.textContent=kind;
      tile.setAttribute('aria-label',item
        ?'Window '+(i+1)+', '+item.start+' to '+item.end+' WIB: '+kind
        :'Window '+(i+1)+': server sync pending');
    }
    const allowed=slots.ready&&!slots.currentUsed;
    choices.forEach(b=>{b.disabled=!syncOk||busy||refreshBusy||!!battle||!w.enabled||!allowed;});
    $('arena-move-rule').textContent=!w.enabled?'GLOBAL BATTLES PAUSED':
      !syncOk||!slots.ready?'SYNCING WIB BATTLE WINDOWS...':
      slots.currentUsed?'SLOT USED · NEXT WINDOW IN '+slots.minutesLeft+' MIN':
      'CURRENT WINDOW · '+slots.minutesLeft+' MIN LEFT';
    $('arena-decision').hidden=!!battle;
    $('tap-battle').hidden=!battle;
    if(!battle)return;
    const before=Date.parse(battle.starts_at)-now(), remain=Date.parse(battle.ends_at)-now();
    $('tap-battle').dataset.side=battle.action.toLowerCase();
    $('tap-side').textContent=battle.action==='HEAL'?'SAVE':battle.action;
    $('tap-target-mark').textContent=battle.action==='HEAL'?'+':'×';
    $('tap-countdown').hidden=before<=0;
    $('tap-countdown').textContent=String(Math.max(1,Math.ceil(before/1000)));
    $('tap-target').hidden=before>0;
    $('tap-target').disabled=before>0||remain<=0||refreshBusy||localTaps>=50;
    $('tap-time').textContent=(Math.min(20000,Math.max(0,remain))/1000).toFixed(1);
    $('tap-count').textContent=localTaps+' / 50';
    $('tap-bonus').textContent='+'+(Math.floor(battle.counted_taps/10)*2)+'%';
    $('tap-charge').style.width=(battle.counted_taps*2)+'%';
    $('tap-combo').textContent=settling?'RECORDING RESULT…':battle.counted_taps===50?'MAX CHARGE VERIFIED':localTaps===50?'MAX TAPPED • VERIFYING '+battle.counted_taps+'/50':'SERVER CONFIRMED '+battle.counted_taps+'/50';
  }
  async function refresh() {
    if(refreshBusy||busy||tapBusy||settling||disposed)return;
    refreshBusy=true;
    try {
      state=await rpc('status');const previousId=battle?.id;battle=state.active;syncOk=true;
      localTaps=!battle?0:battle.id===previousId?Math.max(localTaps,battle.counted_taps):battle.counted_taps;
      if(!battle&&state.latest)showResult(state.latest);
      message(state.world.enabled?'GLOBAL BATTLE • RESULTS VERIFIED BY SERVER':'GLOBAL ENGINE PAUSED • YOUR PROFILE IS READY');
      render();
    } catch(e) {syncOk=false;message('Could not sync the server: '+e.message+'. Use RETRY SYNC.');choices.forEach(b=>b.disabled=true);}
    finally{refreshBusy=false;render();}
  }
  async function choose(action) {
    if(!syncOk||busy||battle||refreshBusy)return;
    busy=true;render();
    try {
      // A lost response is recoverable via status or another start (one pending/player).
      battle=await rpc('start',{p_request_id:crypto.randomUUID(),p_action:action});localTaps=battle.counted_taps;
      if(battle.settled_at){showResult(battle);battle=null;}
      else $('arena-result').hidden=true;
    }catch(e){syncOk=false;message('Battle not started: '+e.message+'. Use RETRY SYNC before trying again.');}
    finally{busy=false;render();}
  }
  // A phone can register touches immediately while bounded batches are in-flight.
  // Server alone decides which events count toward bonus; this is NOT bot protection.
  function tap() {
    if(!battle||refreshBusy||settling||now()<Date.parse(battle.starts_at)||now()>=Date.parse(battle.ends_at)||localTaps>=50)return;
    localTaps+=1;render();
    void flushTaps();
  }
  async function flushTaps() {
    if(!battle||tapBusy||refreshBusy||settling||now()<tapRetryAfter||now()>=Date.parse(battle.ends_at))return;
    const confirmed=battle.counted_taps;
    const next=Math.min(50,confirmed+10,localTaps);
    if(next<=confirmed)return;
    const id=battle.id;
    tapBusy=true;
    try {
      const ack=await rpc('tap_batch',{p_battle_id:id,p_total:next});
      if(battle?.id===id)battle.counted_taps=Math.max(battle.counted_taps,ack.counted_taps);
    }catch(e){
      // Rate rejection can occur when a new batch arrives before server pacing.
      // A retry with the SAME absolute total cannot double-count.
      tapRetryAfter=now()+(String(e.message).includes('TAP_TOO_FAST')?500:850);
      if(!String(e.message).includes('TAP_TOO_FAST'))
        message('Some taps were not confirmed: '+e.message+'. The server only rewards accepted taps.');
    }finally{tapBusy=false;render();}
  }
  async function settle() {
    if(!battle||settling||refreshBusy||tapBusy||now()<retryAfter)return;
    settling=true;render();
    try {const r=await rpc('settle',{p_battle_id:battle.id});showResult(r);battle=null;}
    catch(e){retryAfter=now()+3000;message('Result pending: '+e.message+'. Retrying the same battle safely…');}
    finally{settling=false;if(!battle)await refresh();render();}
  }
  choices.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.arenaAction)));
  $('tap-target').addEventListener('click',tap);
  $('battle-refresh').addEventListener('click',refresh);
  choices.forEach(b=>b.disabled=true);
  await refresh();
  const timer=setInterval(()=>{render();if(battle&&now()<Date.parse(battle.ends_at))void flushTaps();else if(battle&&!tapBusy)void settle();},100);
  const poll=setInterval(()=>{if(!battle)void refresh();},15000);
  const visibility=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);clearInterval(poll);document.removeEventListener('visibilitychange',visibility);},{once:true});
}
