// Local visual fixture only. Never served by wrangler (assets directory is public/).
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/__qa') {
      let html=await readFile(path.join(root,'arena.html'),'utf8');
      html=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('id="arena-content" hidden','id="arena-content"');
      html=html.replace('</body>',`<script type="module">
        import {initGlobalBattle} from '/global-battle.js';
        const paused=new URLSearchParams(location.search).get('mode')!=='ready';
        const state={server_now:new Date().toISOString(),world:{hp:500000,enabled:!paused},active:null,latest:null,next_battle_at:null,rolling_count:0,
          monthly:{month:'2026-10',nickname:'QA_Player',tier:null,battle_count:0,heal_count:0,kill_count:0,heal_hp:0,kill_hp:0}};
        document.querySelector('.preview-bar').textContent='LOCAL QA FIXTURE — NO PRODUCTION WRITES';
        document.getElementById('arena-identity').textContent='HUMAN / QA_Player';
        await initGlobalBattle({sb:{rpc:async(name,args)=>{
          state.server_now=new Date().toISOString();
          if(name==='iid_battle_status')return {data:structuredClone(state)};
          if(name==='iid_battle_start') {state.active={id:'fixture',action:args.p_action,counted_taps:0,starts_at:new Date(Date.now()+3000).toISOString(),ends_at:new Date(Date.now()+23000).toISOString()};return {data:structuredClone({...state.active,server_now:state.server_now})};}
          if(name==='iid_battle_tap'){state.active.counted_taps=args.p_seq;return {data:{counted_taps:args.p_seq,server_now:state.server_now}};}
          if(name==='iid_battle_settle'){state.latest={...state.active,base:100,critical:1,bonus:0,power:100,applied_hp:100,hp_after:500100};state.active=null;state.world.hp=500100;state.monthly={...state.monthly,tier:'Common',battle_count:1,heal_count:1,heal_hp:100};state.rolling_count=1;state.next_battle_at=new Date(Date.now()+14400000).toISOString();return {data:state.latest};}
        }}});
      </script></body>`);
      res.setHeader('Content-Type','text/html');res.end(html);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
    res.end(await readFile(file));
  }catch{res.writeHead(404).end('Not found');}
}).listen(4387,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:4387/__qa'));
