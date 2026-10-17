// Pure deterministic puzzle engine. No account, world HP or network mutations.
export const SIZE=6;
export const SCENT=3;
export function neighbors(n){const x=n%SIZE,y=Math.floor(n/SIZE);return [[x+1,y],[x,y+1],[x-1,y],[x,y-1]].filter(([a,b])=>a>=0&&b>=0&&a<SIZE&&b<SIZE).map(([a,b])=>b*SIZE+a);}
export function pathTo(level,from,to){
 const walls=new Set(level.walls),queue=[[from]],seen=new Set([from]);
 for(let i=0;i<queue.length;i++){const route=queue[i],n=route.at(-1);if(n===to)return route;
 for(const next of neighbors(n)){if(!walls.has(next)&&!seen.has(next)){seen.add(next);queue.push([...route,next]);}}}return null;
}
export function simulate(level,crumbs,side='save'){
 if(!['save','kill'].includes(side)||!Array.isArray(crumbs)||crumbs.length>3||new Set(crumbs).size!==crumbs.length||crumbs.some(n=>!Number.isInteger(n)||n<0||n>=36||level.walls.includes(n)||n===level.start||n===level.server))throw new Error('Invalid plan');
 let remaining=[...crumbs],position=level.start,eaten=0;const frames=[{position,eaten,remaining:[...remaining],target:null}],seen=new Set();
 for(let turn=0;turn<72;turn++){
  const key=position+':'+remaining.join(',');if(seen.has(key))return finish('loop');seen.add(key);
  const candidates=remaining.map((n,i)=>({n,i,path:pathTo(level,position,n)})).filter(x=>x.path&&x.path.length-1<=SCENT).sort((a,b)=>a.path.length-b.path.length||a.i-b.i);
  const target=candidates[0]?.n??level.server,route=candidates[0]?.path??pathTo(level,position,level.server);
  if(!route||route.length<2)return finish('stuck');
  position=route[1];if(remaining.includes(position)){remaining=remaining.filter(n=>n!==position);eaten++;}
  frames.push({position,eaten,remaining:[...remaining],target});
  if(position===level.server)return finish('server');if(position===level.coop)return finish('coop');
 }
 return finish('loop');
 function finish(reason){const won=side==='save'?reason==='coop':reason==='server'&&eaten===3;return {reason,won,eaten,steps:frames.length-1,frames};}
}
export function readChallenge(search,levels){
 const p=new URLSearchParams(search),id=p.get('level');const index=Math.max(0,levels.findIndex(l=>l.id===id));
 return {index,side:p.get('side')==='kill'?'kill':'save',shared:p.get('challenge')==='1'};
}
export function challengeURL(origin,level,side){const u=new URL('/',origin);u.search=new URLSearchParams({level:level.id,side,challenge:'1'}).toString();return u.href;}
