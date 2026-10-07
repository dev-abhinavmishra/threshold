/* eslint-disable */
// Function body lifted from e2e/playtest.spec.ts playOnce — invoked as (argObj) => rep.
function soak({ seed, style, space }) {
  const g = window.__thresholdGame;
  g.renderFrame = () => {};
  g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
  g.startRun({ seedText: seed, difficulty: 'standard' });
  g.renderFrame = () => {};
  if (space === 'under') g.enterUnderscript();
  const rooms = space === 'under' ? g.route.underRooms : g.route.rooms;

  const rep = {
    seed, style, rooms: rooms.length, roomsReached: 0, deaths: {}, deathsTotal: 0, deathsHidden: 0,
    panics: 0, farthestRoom: 0, encounters: 0, socketsTouched: 0,
    stats: null, inventory: [], errors: [],
  };
  const deaths = [];
  const banked = { imprintsEarned: 0, marginaliaEarned: 0 };
  const econBase = { imprintsEarned: 0, marginaliaEarned: 0 };

  const standIn = (room) => {
    const en = room.entryPos, ex = room.exitPos;
    const dx = ex.x - en.x, dz = ex.z - en.z, L = Math.hypot(dx, dz) || 1;
    g.player.teleport(en.x + (dx / L) * 1.3, 0, en.z + (dz / L) * 1.3, Math.atan2(dx, dz));
  };
  const moveToExit = (room) => {
    const en = room.entryPos, ex = room.exitPos;
    const dx = ex.x - en.x, dz = ex.z - en.z, L = Math.hypot(dx, dz) || 1;
    g.player.teleport(ex.x - (dx / L) * 1.0, 0, ex.z - (dz / L) * 1.0, Math.atan2(dx, dz));
  };
  const RUNNERISH = new Set(['sweep', 'reprise', 'maelstrom', 'redline', 'returner', 'pursuer', 'orrery']);
  const runnerLive = () => g.entities.some((e) => RUNNERISH.has(e.id));
  const gazeYaw = () => {
    const pp = g.player.pos;
    let away = null, toward = null;
    for (const e of g.entities) {
      const t = e.threatPos?.();
      if (!t) continue;
      if (e.id === 'witness') away = t;
      else if (e.id === 'whisper' || e.id === 'echoskin') toward = t;
    }
    if (toward) return Math.atan2(toward.x - pp.x, toward.z - pp.z);
    if (away) return Math.atan2(pp.x - away.x, pp.z - away.z);
    return null;
  };
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (g.player.hiddenSpot) {
      let w = 0;
      while (runnerLive() && w++ < 600 && !g.player.dead) g.frame();
      g.player.exitHiding(g.clock.time);
    }
    g.godMode = !!(room.spec?.special || room.authored);
    g.currentRoom = room.index;
    standIn(room);
    if (style !== 'walker' && runnerLive() && !g.player.hiddenSpot) {
      for (let j = i; j >= Math.max(0, i - 2); j--) {
        if (rooms[j].hidingSpots.length) {
          const spot = rooms[j].hidingSpots[0];
          g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z, 0);
          g.player.enterHiding(spot, g.clock.time);
          break;
        }
      }
    }
    g.frame();
    const budget = room.spec?.special ? 90 : (space === 'under' && style !== 'looter' ? 150 : 240);
    let sawEntities = false;
    const nearestCover = () => {
      for (let j = i; j >= Math.max(0, i - 2); j--) {
        if (rooms[j].hidingSpots.length) return rooms[j].hidingSpots[0];
      }
      return null;
    };
    let crossed = style === 'walker';
    for (let f = 0; f < budget && !g.player.dead; f++) {
      if (style !== 'walker' && runnerLive() && !g.player.hiddenSpot) {
        const spot = nearestCover();
        if (spot) {
          g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z, 0);
          g.player.enterHiding(spot, g.clock.time);
        }
      }
      if (g.player.hiddenSpot) g.keys.clear();
      g.frame();
      if (!crossed && !g.player.hiddenSpot && f >= 12) {
        moveToExit(room);
        crossed = true;
      }
      if (style !== 'walker' && !g.player.hiddenSpot) {
        const y = gazeYaw();
        if (y !== null) g.player.yaw = y;
      }
      if (g.player.hiddenSpot && !runnerLive()) g.player.exitHiding(g.clock.time);
      if (style === 'looter' && f === 30) {
        const LOOT_PROMPT = /search|loot|take|open|drawer|pry|claim|feed|vend|register|read/i;
        for (const s of room.sockets) {
          if (!/loot|drawer|key|cabinet|machine/.test(s.kind)) continue;
          g.player.teleport(s.pos.x, 0, s.pos.z, 0);
          for (let t = 0; t < 45; t++) {
            if (LOOT_PROMPT.test(g.interaction.focused?.prompt ?? '')) {
              g.keys.add('KeyE');
              g.input.interactPressed = true;
            } else {
              g.keys.delete('KeyE');
              break;
            }
            g.frame();
          }
          g.keys.delete('KeyE');
          g.input.interactPressed = false;
          rep.socketsTouched++;
        }
        moveToExit(room);
      }
      if (f > 60 && g.entities.length === 0 && !g.player.dead) break;
      if (g.entities.length) sawEntities = true;
    }
    if (sawEntities) rep.encounters++;
    if (g.player.dead) {
      const cause = g.lastDeathCause || 'unknown';
      const live = g.entities.map((e) => e.id).join('+');
      deaths.push(`${room.index}:${cause}~${live || '-'}${g.player.hiddenSpot ? '^' : ''}`);
      if (g.player.hiddenSpot) rep.deathsHidden++;
      for (const k of Object.keys(banked)) banked[k] += g.stats[k] - econBase[k];
      g.retryFromCheckpoint();
      g.renderFrame = () => {};
      g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
      for (const k of Object.keys(econBase)) econBase[k] = g.stats[k];
    }
    rep.farthestRoom = Math.max(rep.farthestRoom, i);
    rep.roomsReached = i + 1;
  }
  rep.style = `${style}-${space}`;
  for (const d of deaths) {
    const c = (d.split(':').slice(1).join(':') || 'unknown').split('~')[0];
    rep.deaths[c] = (rep.deaths[c] ?? 0) + 1;
  }
  rep.deathsTotal = deaths.length;
  rep.deathsSeq = deaths.join(' ');
  rep.stats = {
    ...g.stats,
    imprintsEarned: banked.imprintsEarned + g.stats.imprintsEarned - econBase.imprintsEarned,
    marginaliaEarned: banked.marginaliaEarned + g.stats.marginaliaEarned - econBase.marginaliaEarned,
  };
  rep.inventory = g.inventory.map((x) => ({ ...x }));
  return rep;
}
