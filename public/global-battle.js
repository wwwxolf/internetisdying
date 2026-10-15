import {evaluateWindows} from "./utc-battle-windows.js?v=1";
import {battlePollDelay,economyRefreshDue,jitterDelay} from "./arena-polling.js";
// Browser renders server facts. It never sends HP, bonus, RNG or a tap total.
export async function initGlobalBattle({sb}) {
  const $=id=>document.getElementById(id);
  const choices=[...document.querySelectorAll('[data-arena-action]')];
  let state=null, battle=null, offset=0, busy=false, tapBusy=false, settling=false;
  let retryAfter=0, tapRetryAfter=0, localTaps=0, disposed=false, refreshBusy=false, syncOk=false;
  let economy={enabled:false},holdLoop=null;
  let pollTimer=null,pollErrors=0,lastEconomySuccess=0;
  const maxTaps=()=>battle?.engine_version===2?24:50;
  const v2Mode=()=>battle?.engine_version===2||(!battle&&economy.enabled);
  const haltHold=()=>{if(holdLoop!==null){clearInterval(holdLoop);holdLoop=null;}};
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
    const side=r.action==='HEAL'?'SAVE':r.action;
    if(r.engine_version===2){
      const crit=(r.critical/100).toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
      $('arena-result-title').textContent=side+' • '+fmt(r.power)+' PERSONAL POWER';
      $('arena-result-text').textContent='CRIT ×'+crit+' • TAP BONUS +'+r.bonus+'% • '+
        fmt(r.war_influence)+' WAR INFLUENCE. Faction impact settles after the UTC window closes. Your result is verified and recorded.';
      return;
    }
    $('arena-result-title').textContent=side+' • '+fmt(r.applied_hp)+' HP APPLIED';
    $('arena-result-text').textContent=`Base ${fmt(r.base)} × critical ${r.critical} + ${r.bonus}% bonus = ${fmt(r.power)} HP. World after this battle: ${fmt(r.hp_after)}. Permanently recorded.`;
  }
  function render() {
    if(!state)return;
    const w=state.world, m=state.monthly;
    $('arena-hp').textContent=fmt(w.hp);
    $('arena-fill').style.width=(w.hp/10000)+'%';
    $('arena-progress').setAttribute('aria-valuenow',String(w.hp/10000));
    $('arena-percent').textContent=(w.hp/10000).toFixed(1)+'% LIFE REMAINING';
    $('save-impact-caption').textContent=economy.enabled?'+ WAR INFLUENCE':'+ RANDOM HP';
    $('kill-impact-caption').textContent=economy.enabled?'− WAR INFLUENCE':'− RANDOM HP';
    $('v2-war').hidden=!economy.enabled;
    if(economy.enabled){
      const save=Math.max(0,Number(economy.save_influence)||0);
      const kill=Math.max(0,Number(economy.kill_influence)||0);
      const total=save+kill;
      const savePct=total?100*save/total:50;
      $('v2-save-influence').textContent=fmt(save);
      $('v2-kill-influence').textContent=fmt(kill);
      $('v2-war-save-fill').style.width=savePct+'%';
      $('v2-war-kill-fill').style.width=(100-savePct)+'%';
      const until=Math.max(0,Math.ceil((Date.parse(economy.window_start)+4*3600000-now())/60000));
      $('v2-war-status').textContent=(total?'PROVISIONAL INFLUENCE':'AWAITING FIRST V2 BATTLE')+
        ' • WINDOW CLOSES IN '+until+' MIN • '+fmt(economy.battle_count)+' VERIFIED BATTLES';
      const latest=economy.latest_window;
      $('v2-war-latest').textContent=latest
        ?'LAST CLOSED WAR: '+(latest.applied_hp>0?'+':'')+fmt(latest.applied_hp)+' VERIFIED WORLD HP'
        :'FIRST WORLD WINDOW RESULT PENDING • LIVE HP IS NOT A FORECAST';
    }
    const stage=w.hp===0?'DEAD':w.hp<=250000?'NEAR DEATH':w.hp<=500000?'CRITICAL':w.hp<=750000?'STABLE':'RECOVERING';
    $('arena-status').textContent='● '+stage;
    $('heart-zone').dataset.stage=w.hp===0?'dead':w.hp<=250000?'danger':'critical';
    // V2 rows represent influence, not per-player World HP; never display 0 HP as damage.
    $('monthly-summary').textContent=economy.enabled
      ?`${m.month} UTC • ${m.nickname} • ${m.battle_count} verified battles\nSAVE ${m.heal_count} | KILL ${m.kill_count}\nCURRENT WAR WINDOW • SAVE +${fmt(economy.save_influence||0)} / KILL −${fmt(economy.kill_influence||0)} INFLUENCE\nWORLD HP CHANGES ONLY AFTER THE 4H WINDOW SETTLES`
      :`${m.month} UTC • ${m.nickname} • ${m.tier||'No card yet'} • ${m.battle_count} battles\nSAVE ${m.heal_count} · +${fmt(m.heal_hp)} HP | KILL ${m.kill_count} · −${fmt(m.kill_hp)} HP`;
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
        ?'Window '+(i+1)+', '+item.start+' to '+item.end+' UTC: '+kind
        :'Window '+(i+1)+': server sync pending');
    }
    const allowed=slots.ready&&!slots.currentUsed;
    choices.forEach(b=>{b.disabled=!syncOk||busy||refreshBusy||!!battle||!w.enabled||!allowed;});
    $('arena-move-rule').textContent=!w.enabled?'GLOBAL BATTLES PAUSED':
      !syncOk||!slots.ready?'SYNCING UTC BATTLE WINDOWS...':
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
    const isV2=battle.engine_version===2,max=isV2?24:50,duration=isV2?12000:20000;
    $('tap-battle').setAttribute('aria-label',(duration/1000)+'-second Global Chaos Tap Battle');
    $('tap-target').disabled=before>0||remain<=0||refreshBusy||localTaps>=max;
    $('tap-hold').hidden=!isV2||before>0;
    $('tap-hold').disabled=before>0||remain<=0||refreshBusy||localTaps>=max;
    if(remain<=0||localTaps>=max)haltHold();
    $('tap-instruction').textContent=isV2?'2 • 1 • GO! TAP OR HOLD TO CHARGE.':'3 • 2 • 1 • GO! THEN TAP AS FAST AS YOU CAN.';
    $('tap-max-label').textContent='MAX '+max;
    $('tap-bonus-label').textContent=isV2?'MAX +6%':'MAX +10%';
    $('tap-safety').textContent=max+' TAPS = MAX CHARGE. THE ROUND LASTS '+duration/1000+' SECONDS.';
    $('tap-charge-track').setAttribute('aria-label','Charge rises from zero to maximum at '+max+' taps');
    $('tap-time').textContent=(Math.min(duration,Math.max(0,remain))/1000).toFixed(1);
    $('tap-count').textContent=localTaps+' / '+max;
    $('tap-bonus').textContent='+'+(isV2?Math.floor(battle.counted_taps/4):Math.floor(battle.counted_taps/10)*2)+'%';
    $('tap-charge').style.width=(battle.counted_taps*100/max)+'%';
    $('tap-combo').textContent=settling?'RECORDING RESULT…':battle.counted_taps===max?'MAX CHARGE VERIFIED':localTaps===max?'MAX TAPPED • VERIFYING '+battle.counted_taps+'/'+max:'SERVER CONFIRMED '+battle.counted_taps+'/'+max;
  }
  function scheduleRefresh(delay){
    clearTimeout(pollTimer);pollTimer=null;
    if(disposed||document.hidden)return;
    pollTimer=setTimeout(()=>{
      pollTimer=null;
      if(battle||busy||tapBusy||settling||refreshBusy){
        if(!battle)scheduleRefresh(jitterDelay(3500,2000));
        return;
      }
      void refresh();
    },delay);
  }
  async function refresh() {
    if(refreshBusy||busy||tapBusy||settling||disposed)return;
    refreshBusy=true;
    try {
      state=await rpc('status');
      // Rarely-changing server flag is sampled at most once per two minutes.
      // The server remains authoritative for all mutations even if UI state is stale.
      if(economyRefreshDue(lastEconomySuccess,Date.now())){
        try{
          const response=await sb.rpc('iid_economy_status');
          if(!response.error&&response.data){
            economy=response.data;lastEconomySuccess=Date.now();
          }
        }catch{}
      }
      pollErrors=0;
      const previousId=battle?.id;battle=state.active;syncOk=true;
      localTaps=!battle?0:battle.id===previousId?Math.max(localTaps,battle.counted_taps):battle.counted_taps;
      if(!battle&&state.latest)showResult(state.latest);
      message(state.world.enabled?'GLOBAL BATTLE • RESULTS VERIFIED BY SERVER':'GLOBAL ENGINE PAUSED • YOUR PROFILE IS READY');
      render();
    } catch(e) {pollErrors++;syncOk=false;message('Could not sync the server: '+e.message+'. Retrying automatically; use RETRY SYNC if needed.');choices.forEach(b=>b.disabled=true);}
    finally{
      refreshBusy=false;render();
      if(!battle)scheduleRefresh(battlePollDelay(pollErrors));
    }
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
    if(!battle||refreshBusy||settling||now()<Date.parse(battle.starts_at)||now()>=Date.parse(battle.ends_at)||localTaps>=maxTaps())return;
    localTaps+=1;render();
    void flushTaps();
  }
  async function flushTaps() {
    if(!battle||tapBusy||refreshBusy||settling||now()<tapRetryAfter||now()>=Date.parse(battle.ends_at))return;
    const confirmed=battle.counted_taps;
    const next=Math.min(maxTaps(),confirmed+10,localTaps);
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
    try {
      const r=await rpc('settle',{p_battle_id:battle.id});
      showResult(r);battle=null;
      // Leaderboard is a separate read-only module; notify after verified settlement.
      if(typeof document.dispatchEvent==='function'){
        document.dispatchEvent(new Event('iid:battle-settled'));
      }
    }
    catch(e){retryAfter=now()+3000;message('Result pending: '+e.message+'. Retrying the same battle safely…');}
    finally{settling=false;if(!battle)await refresh();render();}
  }
  choices.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.arenaAction)));
  $('tap-target').addEventListener('click',tap);
  const hold=$('tap-hold');
  const beginHold=()=>{if(!battle||battle.engine_version!==2||holdLoop!==null||hold.disabled)return;
    tap();holdLoop=setInterval(tap,500);};
  hold.addEventListener('pointerdown',beginHold);
  ['pointerup','pointercancel','pointerleave'].forEach(name=>hold.addEventListener(name,haltHold));
  hold.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();beginHold();}});
  hold.addEventListener('keyup',haltHold);
  hold.addEventListener('blur',haltHold);
  $('battle-refresh').addEventListener('click',refresh);
  choices.forEach(b=>b.disabled=true);
  await refresh();
  const timer=setInterval(()=>{render();if(battle&&now()<Date.parse(battle.ends_at))void flushTaps();else if(battle&&!tapBusy)void settle();},100);
  const visibility=()=>{
    if(document.hidden){clearTimeout(pollTimer);pollTimer=null;return;}
    // Spread foreground reconnects; active battle settlement still uses the timer above.
    scheduleRefresh(jitterDelay(1500,5500));
  };
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',()=>{disposed=true;haltHold();clearInterval(timer);clearTimeout(pollTimer);document.removeEventListener('visibilitychange',visibility);},{once:true});
}
