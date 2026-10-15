// Client-side traffic smoothing. Authoritative game timing and mutation RPCs are untouched.
// Jitter avoids synchronous periodic refresh spikes from large cohorts of open tabs.
export function jitterDelay(base,spread,random=Math.random){
 const value=Math.max(0,Math.min(0.999999,Number(random())||0));
 return Math.round(base+spread*value);
}
export function battlePollDelay(failures=0,random=Math.random){
 // After success: 45-75 s. On transient failure: 10-15, 20-25, 40-45 ... up to 300 s.
 if(failures>0)return jitterDelay(Math.min(295000,10000*2**Math.min(5,failures-1)),5000,random);
 return jitterDelay(45000,30000,random);
}
export function chaosPollDelay(enabled,failures=0,random=Math.random){
 if(failures>0)return battlePollDelay(failures,random);
 return enabled?jitterDelay(60000,30000,random):jitterDelay(120000,60000,random);
}
export function economyRefreshDue(lastSuccessful,now){
 return !lastSuccessful||now-lastSuccessful>=120000;
}
