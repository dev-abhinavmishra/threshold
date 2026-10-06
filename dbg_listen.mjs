import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ baseURL: 'http://localhost:4173' })).newPage();
await p.goto('/?debug');
const input = p.locator('.seed-input');
await input.evaluate((el) => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(el,'s'); el.dispatchEvent(new Event('input',{bubbles:true})); });
await p.getByRole('button',{name:'Seeded Run'}).click();
await p.waitForFunction(() => window.__thresholdGame, undefined, {timeout: 90000});
const out = await p.evaluate(() => {
  const g = window.__thresholdGame;
  g.renderFrame = () => {};
  g.clock.tick = () => { g.clock.dt = 1/30; g.clock.time += g.clock.dt; return true; };
  g.godMode = true;
  const inRoom = (r,x,z) => { const dx=x-r.origin.x,dz=z-r.origin.z; const c=Math.cos(r.yaw),s=Math.sin(r.yaw); const lx=dx*c-dz*s,lz=dx*s+dz*c; return Math.abs(lx)<=r.spec.width/2+0.5 && Math.abs(lz)<=r.spec.depth/2+0.5; };
  const main = g.route.rooms.filter(r=>r.index>=0).sort((a,b)=>a.index-b.index);
  const log = [];
  for (let i = 0; i < main.length-1 && log.length < 6; i++) {
    const next = main[i+1];
    if (!next.scheduled?.length) continue;
    const door = (next.doors??[]).find(d=>d.id===`door-${next.index}-in`);
    if (!door) { log.push({i, why:'no-door'}); continue; }
    const nx=Math.sin(door.yaw), nz=Math.cos(door.yaw);
    const cand=[1,-1].map(s=>({x:door.pos.x+nx*1.4*s,z:door.pos.z+nz*1.4*s})).find(pt=>inRoom(main[i],pt.x,pt.z));
    if (!cand) { log.push({i, why:'no-cand', door:{x:door.pos.x,z:door.pos.z,yaw:door.yaw}}); continue; }
    g.player.teleport(cand.x,0,cand.z); g.currentRoom = main[i].index;
    g.keys.add('KeyC');
    for (let f=0;f<40;f++) g.frame();
    const listens = g.interaction.interactables.filter(it=>it.kind==='listen');
    const doors = g.interaction.interactables.filter(it=>it.kind==='door');
    log.push({i, ent: next.scheduled[0].entity, listens: listens.map(l=>({id:l.id,x:+l.pos.x.toFixed(2),z:+l.pos.z.toFixed(2)})), doors: doors.map(d=>d.id)});
    if (listens.length) {
      const seam = listens.find(l=>l.id===`listen-${door.id}`) ?? listens[0];
      const dx=main[i].origin.x-seam.pos.x, dz=main[i].origin.z-seam.pos.z, L=Math.hypot(dx,dz)||1;
      g.player.teleport(seam.pos.x+dx/L*0.55, 0, seam.pos.z+dz/L*0.55);
      for (let f=0;f<30;f++){ g.player.yaw=Math.atan2(seam.pos.x-g.player.pos.x, seam.pos.z-g.player.pos.z); g.player.pitch=Math.atan2(seam.pos.y+0.4-(g.player.pos.y+g.player.eyeHeight),0.55); g.frame(); }
      log.push({focused: g.interaction.focused?.prompt, crouching: g.player.crouching, pos:{x:+g.player.pos.x.toFixed(2),z:+g.player.pos.z.toFixed(2)}});
      g.keys.delete('KeyC');
      break;
    }
  }
  return log;
});
console.log(JSON.stringify(out,null,1));
await b.close();
