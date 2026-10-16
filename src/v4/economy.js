// Frozen V4 contract. Server SQL is authoritative; this module is the parity oracle.
export const MAX_HP=1_000_000, INITIAL_HP=500_000, DAY=86_400, DURATION=30*DAY;
function integer(n) { if(!Number.isSafeInteger(n)||n<0) throw new RangeError('nonnegative safe integer required'); return BigInt(n); }
export function roundRatio(n,d) { if(d<=0n) throw new RangeError('denominator'); const s=n<0n?-1n:1n; n=n<0n?-n:n; return Number(s*((2n*n+d)/(2n*d))); }
export function power(taps,critical) { integer(taps); if(taps>50||![100,105].includes(critical))throw new RangeError('invalid power input'); return roundRatio(BigInt(100+Math.floor(taps/10))*BigInt(critical),100n); }
export function battleImpact(save,kill) {const s=integer(save),k=integer(kill);return roundRatio(12000n*(s-k),s+k+4000n);}
export function chaosImpact(save,kill) {integer(save);integer(kill);const s=BigInt(Math.max(0,save-9)),k=BigInt(Math.max(0,kill-9));return roundRatio(3000n*(s-k),s+k+20n);}
export function cumulativeDecay(seconds) {const t=integer(seconds);if(seconds>DURATION)throw new RangeError('epoch range');return roundRatio(300000n*t*86400n+7000n*t*t,30n*86400n*86400n);}
export function schedule(start) {
 const ms=Date.parse(start); if(!Number.isFinite(ms)||ms%(DAY*1000)!==0)throw new RangeError('start must be UTC midnight');
 const events=[];const add=(kind,seq,seconds,priority,delta=null)=>events.push({kind,seq,seconds,priority,at:new Date(ms+seconds*1000).toISOString(),delta});
 for(let n=1;n<=180;n++)add('BATTLE',n,n*14400,1);
 for(let n=1;n<=30;n++)add('CHAOS',n,n*DAY,2);
 let prev=0,n=0;for(let t=18000;t<DURATION;t+=21600){add('DECAY',++n,t,3,-(cumulativeDecay(t)-cumulativeDecay(prev)));prev=t;}
 add('FINAL',1,DURATION,4,-(cumulativeDecay(DURATION)-cumulativeDecay(prev)));
 return events.sort((a,b)=>a.seconds-b.seconds||a.priority-b.priority);
}
export function applyEvent(state,event,save=0,kill=0) {
 if(state.status==='FINAL')return {...state};
 const nominal=event.kind==='BATTLE'?battleImpact(save,kill):event.kind==='CHAOS'?chaosImpact(save,kill):event.delta;
 const hp=Math.max(0,Math.min(MAX_HP,state.hp+nominal));
 const terminal=hp===0||event.kind==='FINAL';
 return {hp,status:terminal?'FINAL':'ACTIVE',winner:terminal?(hp===0?'KILL':'SAVE'):null,nominal,applied:hp-state.hp};
}
