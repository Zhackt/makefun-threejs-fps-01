// bots.js — the nine bots: 4 attacker allies and 5 defenders.
// Allies walk randomised routes to Site A or B (2 via Gerbang Utama, 2 via
// Lorong Samping). Defenders hold A (2), hold B (2) and roam mid (1); on a plant
// they rotate to the planted site, and the nearest defender investigates gunfire.
// Bots see with a 2D sightline test (tall colliders + smoke block it), react after
// a delay, and shoot in bursts with medium accuracy.

import * as THREE from 'three';
import { segmentBlocked, resolveCircle } from './map.js';

const ALLY_NAMES = ['Raka', 'Dimas', 'Fajar', 'Bimo'];
const ENEMY_NAMES = ['Arka', 'Bara', 'Cakra', 'Dara', 'Elang'];
const BOT_SPEED = 3.3;
const BOT_RADIUS = 0.42;
const SIGHT_RANGE = 46;
const TEAM_COLORS = { ally: 0x3f8f5f, enemy: 0xa03a2a };
const TEAM_TRIM = { ally: 0x8fe3a0, enemy: 0xff9a8a };

function makeBotMesh(scene, team) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[team] });
  const trimMat = new THREE.MeshLambertMaterial({ color: TEAM_TRIM[team] });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc9976b });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2b2620 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), bodyMat);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
  head.position.y = 1.66;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), trimMat);
  helmet.position.y = 1.86;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), darkMat);
  legL.position.set(-0.16, 0.33, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), darkMat);
  gun.position.set(0.28, 1.25, -0.3);
  group.add(body, head, helmet, legL, legR, gun);
  group.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
  scene.add(group);
  return { group, body, head, legL, legR };
}

function smokeBlocks(x0, z0, x1, z1, smokes, now) {
  for (let i = 0; i < smokes.length; i += 1) {
    const s = smokes[i];
    if (s.until <= now) continue;
    // Distance from segment to smoke centre in 2D.
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((s.x - x0) * dx + (s.z - z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    const d = Math.hypot(s.x - px, s.z - pz);
    if (d < s.r) return true;
  }
  return false;
}

export function createBots(scene, map, state) {
  const bots = [];
  const tracerPool = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
  const tracerGeo = new THREE.BufferGeometry();
  for (let i = 0; i < 24; i += 1) {
    const line = new THREE.Line(tracerGeo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function spawnTracer(from, to) {
    const slot = tracerPool[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracerPool.length;
    const positions = new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z]);
    slot.line.geometry.dispose();
    slot.line.geometry = new THREE.BufferGeometry();
    slot.line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    slot.line.material.opacity = 0.85;
    slot.line.visible = true;
    slot.life = 0.09;
  }

  function makeBot(team, name, index) {
    const mesh = makeBotMesh(scene, team);
    const bot = {
      id: `${team}-${index}`,
      team,
      name,
      pos: { x: 0, z: 0 },
      yaw: 0,
      hp: 100,
      alive: true,
      mode: 'route', // route | hold | roam | rotate | investigate
      route: [],
      wp: 0,
      hold: null,
      roamPoints: [],
      roamIndex: 0,
      target: null, // { kind: 'player' | 'bot', ref, x, z }
      reaction: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      engageTimer: 0,
      walkPhase: 0,
      mesh,
      hitMeshes: [mesh.body, mesh.head],
    };
    mesh.body.userData = { bot, part: 'body' };
    mesh.head.userData = { bot, part: 'head' };
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) makeBot('ally', ALLY_NAMES[i], i);
  for (let i = 0; i < 5; i += 1) makeBot('enemy', ENEMY_NAMES[i], i);

  function resetRound(random) {
    // Allies: 2 via the main gate, 2 via the side lane; targets randomised.
    const toAFirst = random() < 0.5;
    const allies = bots.filter((b) => b.team === 'ally');
    const plan = toAFirst
      ? [['gateA', 'gateA'], ['sideA', 'sideA'], ['gateB', 'sideB']]
      : [['gateB', 'sideB'], ['gateA', 'sideA'], ['gateA', 'sideA']];
    // Two allies take the first pair's routes, two take the second pair's.
    const assignments = [plan[0][0], plan[0][1], plan[1][0], plan[1][1]];
    for (let i = 0; i < allies.length; i += 1) {
      const bot = allies[i];
      bot.route = map.routes[assignments[i]].map(([x, z]) => ({ x, z }));
      bot.wp = 0;
      bot.mode = 'route';
      bot.hp = 100;
      bot.alive = true;
      bot.target = null;
      bot.reaction = 0;
      bot.burstLeft = 0;
      bot.pauseTimer = 0;
      bot.engageTimer = 0;
      bot.pos.x = map.attackerSpawn.x + (i - 1.5) * 2.2;
      bot.pos.z = map.attackerSpawn.z + (i % 2) * 2;
      bot.yaw = 0;
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.set(0, 0, 0);
      bot.mesh.group.position.set(bot.pos.x, 0, bot.pos.z);
    }
    // Defenders: 2 hold A, 2 hold B, 1 roams mid.
    const enemies = bots.filter((b) => b.team === 'enemy');
    const holdSpots = [map.holds.a1, map.holds.a2, map.holds.b1, map.holds.b2];
    for (let i = 0; i < enemies.length; i += 1) {
      const bot = enemies[i];
      bot.hp = 100;
      bot.alive = true;
      bot.target = null;
      bot.reaction = 0;
      bot.burstLeft = 0;
      bot.pauseTimer = 0;
      bot.engageTimer = 0;
      if (i < 4) {
        bot.mode = 'hold';
        bot.hold = { x: holdSpots[i][0], z: holdSpots[i][1] };
        bot.pos.x = holdSpots[i][0] + (random() - 0.5) * 1.5;
        bot.pos.z = holdSpots[i][1] + (random() - 0.5) * 1.5;
        bot.yaw = Math.atan2(-(bot.pos.x - 0), -(bot.pos.z - 20));
      } else {
        bot.mode = 'roam';
        bot.roamPoints = map.holds.roam.map(([x, z]) => ({ x, z }));
        bot.roamIndex = 0;
        bot.pos.x = 0;
        bot.pos.z = 0;
        bot.yaw = Math.PI;
      }
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.set(0, 0, 0);
      bot.mesh.group.position.set(bot.pos.x, 0, bot.pos.z);
    }
  }

  function canSee(bot, tx, tz, ctx) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SIGHT_RANGE) return false;
    if (segmentBlocked(bot.pos.x, bot.pos.z, tx, tz, map.colliders)) return false;
    if (smokeBlocks(bot.pos.x, bot.pos.z, tx, tz, ctx.smokes, ctx.now)) return false;
    return true;
  }

  function acquireTarget(bot, ctx) {
    // Nearest visible enemy: the player or an opposing bot.
    let best = null;
    let bestDist = Infinity;
    if (bot.team === 'enemy' && ctx.playerAlive) {
      const d = Math.hypot(ctx.playerPos.x - bot.pos.x, ctx.playerPos.z - bot.pos.z);
      if (d < bestDist && canSee(bot, ctx.playerPos.x, ctx.playerPos.z, ctx)) {
        best = { kind: 'player', ref: null, x: ctx.playerPos.x, z: ctx.playerPos.z, moving: ctx.playerMoving, crouched: ctx.playerCrouched };
        bestDist = d;
      }
    }
    const foes = bots.filter((b) => b.alive && b.team !== bot.team);
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      const d = Math.hypot(foe.pos.x - bot.pos.x, foe.pos.z - bot.pos.z);
      if (d < bestDist && canSee(bot, foe.pos.x, foe.pos.z, ctx)) {
        best = { kind: 'bot', ref: foe, x: foe.pos.x, z: foe.pos.z, moving: true, crouched: false };
        bestDist = d;
      }
    }
    return best ? { target: best, dist: bestDist } : null;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) return true;
    const step = Math.min(dist, speed * dt);
    bot.pos.x += (dx / dist) * step;
    bot.pos.z += (dz / dist) * step;
    bot.yaw = Math.atan2(-dx, -dz);
    resolveCircle(bot.pos, BOT_RADIUS, map.colliders);
    bot.walkPhase += dt * 9;
    return dist - step < 0.25;
  }

  function botShoot(bot, target, dist, ctx) {
    // One shot of a burst: roll accuracy, apply damage, draw a tracer.
    const from = { x: bot.pos.x, y: 1.45, z: bot.pos.z };
    const to = { x: target.x, y: target.kind === 'player' ? 1.35 : 1.2, z: target.z };
    spawnTracer(from, to);
    ctx.onShot(bot);
    let chance = 0.34 * (1 - dist / 60);
    if (target.moving) chance *= 0.75;
    if (target.crouched) chance *= 0.8;
    if (ctx.random() > chance) return;
    const head = ctx.random() < 0.08;
    const dmg = head ? 44 : 22;
    if (target.kind === 'player') ctx.onPlayerDamaged(dmg, bot);
    else ctx.onBotDamaged(target.ref, dmg, bot);
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    const found = acquireTarget(bot, ctx);
    if (found) {
      if (!bot.target) bot.reaction = 0.6 + ctx.random() * 0.6;
      bot.target = found.target;
      bot.engageTimer = 2;
      // Face the target.
      const dx = found.target.x - bot.pos.x;
      const dz = found.target.z - bot.pos.z;
      bot.yaw = Math.atan2(-dx, -dz);
      if (bot.reaction > 0) {
        bot.reaction -= dt;
      } else if (bot.pauseTimer > 0) {
        bot.pauseTimer -= dt;
      } else {
        if (bot.burstLeft <= 0) bot.burstLeft = 3 + Math.floor(ctx.random() * 3);
        if (bot.burstTimer <= 0) {
          botShoot(bot, bot.target, found.dist, ctx);
          bot.burstLeft -= 1;
          bot.burstTimer = 0.13;
          if (bot.burstLeft <= 0) bot.pauseTimer = 0.7 + ctx.random() * 0.7;
        } else {
          bot.burstTimer -= dt;
        }
      }
      return; // engaged bots hold their ground
    }
    bot.target = null;
    if (bot.engageTimer > 0) bot.engageTimer -= dt;

    // No target: follow the bot's orders.
    if (bot.mode === 'route') {
      if (bot.wp < bot.route.length) {
        const wp = bot.route[bot.wp];
        if (moveToward(bot, wp.x, wp.z, dt, BOT_SPEED)) bot.wp += 1;
      } else {
        bot.mode = 'hold';
        bot.hold = { x: bot.pos.x, z: bot.pos.z };
      }
    } else if (bot.mode === 'hold') {
      // Small idle sway so holders do not look frozen.
      bot.yaw += Math.sin(ctx.now * 0.5 + bot.id.length) * 0.0004;
    } else if (bot.mode === 'roam') {
      const pt = bot.roamPoints[bot.roamIndex];
      if (moveToward(bot, pt.x, pt.z, dt, BOT_SPEED * 0.8)) {
        bot.roamIndex = (bot.roamIndex + 1) % bot.roamPoints.length;
      }
    } else if (bot.mode === 'rotate' || bot.mode === 'investigate') {
      const dest = bot.mode === 'rotate' ? bot.rotateDest : bot.investigateDest;
      if (dest) {
        if (moveToward(bot, dest.x, dest.z, dt, BOT_SPEED * 1.05)) {
          bot.mode = 'hold';
          bot.hold = { x: bot.pos.x, z: bot.pos.z };
        }
      }
    }
  }

  return {
    list: bots,
    resetRound,
    // Called by game.js when the bomb is planted: defenders rotate.
    onPlant(site) {
      const dest = site === 'A' ? map.siteA : map.siteB;
      for (const bot of bots) {
        if (bot.team !== 'enemy' || !bot.alive) continue;
        bot.mode = 'rotate';
        bot.rotateDest = { x: dest.x + (Math.random() - 0.5) * 4, z: dest.z + (Math.random() - 0.5) * 4 };
      }
    },
    // Called by game.js when the player fires: the nearest defender investigates.
    onGunfire(x, z) {
      let best = null;
      let bestDist = 32;
      for (const bot of bots) {
        if (bot.team !== 'enemy' || !bot.alive || bot.mode === 'rotate') continue;
        const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
        if (d < bestDist) { best = bot; bestDist = d; }
      }
      if (best) {
        best.mode = 'investigate';
        best.investigateDest = { x, z };
      }
    },
    // Damage a bot; returns true if it died. byPlayer awards money via ctx.
    damage(bot, amount, byPlayer, ctx) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      if (bot.hp > 0) return false;
      bot.alive = false;
      bot.hp = 0;
      bot.mesh.group.rotation.x = -Math.PI / 2;
      bot.mesh.group.position.y = 0.25;
      if (ctx) ctx.onBotKilled(bot, byPlayer);
      return true;
    },
    aliveCount(team) {
      let n = 0;
      for (const bot of bots) if (bot.team === team && bot.alive) n += 1;
      return n;
    },
    step(dt, ctx) {
      for (let i = 0; i < bots.length; i += 1) stepBot(bots[i], dt, ctx);
      // Sync meshes (no allocation: reuse the group transform).
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        if (!bot.alive) continue;
        bot.mesh.group.position.x = bot.pos.x;
        bot.mesh.group.position.z = bot.pos.z;
        bot.mesh.group.rotation.y = bot.yaw;
        const swing = Math.sin(bot.walkPhase) * 0.35;
        bot.mesh.legL.rotation.x = swing;
        bot.mesh.legR.rotation.x = -swing;
      }
      // Fade tracers.
      for (let i = 0; i < tracerPool.length; i += 1) {
        const slot = tracerPool[i];
        if (slot.life > 0) {
          slot.life -= dt;
          if (slot.life <= 0) slot.line.visible = false;
          else slot.line.material.opacity = slot.life / 0.09 * 0.85;
        }
      }
    },
  };
}
