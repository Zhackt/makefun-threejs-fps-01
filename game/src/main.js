// main.js — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. Shooting, tracers, smoke and bomb visuals live here; the
// rules (rounds, bomb, economy) live in game.js; bot brains live in bots.js.
// ?shot=cover|buy|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.

import * as THREE from 'three';
import { createState } from './state.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const state = createState();
const map = createMap(scene);
const audio = createAudio();
const player = createPlayer(map.colliders, map.attackerSpawn);
const weapons = createWeapons(camera, state);
const bots = createBots(scene, map, state);
const hud = createHud({
  onBuyWeapon(id) {
    if (weapons.buy(id)) {
      audio.buy();
      hud.showBuy(state);
      refreshAmmoHud();
    }
  },
  onBuyItem(id) {
    if (weapons.buyItem(id)) {
      audio.buy();
      hud.showBuy(state);
    }
  },
});
const game = createGame({ state, player, bots, weapons, hud, audio, map });
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 95;
const shootTargets = map.shootables.slice();
for (const bot of bots.list) shootTargets.push(bot.mesh.body, bot.mesh.head);

// Preallocated scratch objects: no new objects per frame in hot loops.
const dirVec = new THREE.Vector3();
const muzzleVec = new THREE.Vector3();
const hitVec = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// Player tracer pool (12 preallocated lines).
const tracers = [];
for (let i = 0; i < 12; i += 1) {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffe1a0, transparent: true, opacity: 0 }),
  );
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const slot = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  slot.line.geometry.dispose();
  slot.line.geometry = new THREE.BufferGeometry();
  slot.line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z]), 3));
  slot.line.material.opacity = 0.9;
  slot.line.visible = true;
  slot.life = 0.08;
}

// Bomb visual: a dark case with a blinking red light.
const bombGroup = new THREE.Group();
const bombCase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), new THREE.MeshLambertMaterial({ color: 0x1c1a18 }));
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
bombLight.position.set(0, 0.2, 0);
bombGroup.add(bombCase, bombLight);
bombGroup.visible = false;
scene.add(bombGroup);

// Explosion visual: an expanding orange sphere + light, reused every round.
const explosionMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0 }),
);
explosionMesh.visible = false;
scene.add(explosionMesh);
const explosionLight = new THREE.PointLight(0xff8c2e, 0, 40, 1.5);
scene.add(explosionLight);
let explosionLife = 0;

// Smoke visuals: 3 reusable clouds of 4 spheres each.
const smokeGroups = [];
for (let i = 0; i < 3; i += 1) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xcfc8bd, transparent: true, opacity: 0.5 });
  for (let j = 0; j < 4; j += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), mat);
    puff.position.set((j % 2) * 2.4 - 1.2, 1.2 + (j >> 1) * 1.4, (j % 3) * 1.6 - 1.6);
    group.add(puff);
  }
  group.visible = false;
  scene.add(group);
  smokeGroups.push(group);
}

const body = player.state;
let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let stepDistance = 0;
let scoped = false;

function refreshAmmoHud() {
  const ammo = weapons.ammo();
  hud.setAmmo(ammo.mag, ammo.reserve, weapons.currentDef().name, ammo.mag === 0);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw + body.recoilYaw, 0, 'YXZ');
}

function damageBot(bot, dmg, byPlayer, headshot, killer) {
  const died = bots.damage(bot, dmg, byPlayer, { onBotKilled: () => {} });
  if (died) {
    if (byPlayer) game.playerKilledBot(bot, headshot);
    else if (killer) game.botKilledBot(bot, killer);
  }
  return died;
}

function shoot() {
  const result = weapons.tryFire();
  if (result === 'not-ready') return;
  if (result === 'empty') {
    audio.dry();
    if (weapons.reload()) audio.reload();
    return;
  }
  const def = weapons.currentDef();
  audio.shot(def.id);
  camera.getWorldDirection(dirVec);
  const spread = weapons.spread(player.groundSpeed(), body.crouched);
  dirVec.x += (random() * 2 - 1) * spread;
  dirVec.y += (random() * 2 - 1) * spread;
  dirVec.z += (random() * 2 - 1) * spread;
  dirVec.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, dirVec);
  const hits = raycaster.intersectObjects(shootTargets, false);
  const hit = hits[0];
  muzzleVec.set(0.3, -0.27, -0.94);
  camera.localToWorld(muzzleVec);
  if (hit) {
    hitVec.copy(hit.point);
    spawnTracer(muzzleVec, hitVec);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const headshot = hit.object.userData.part === 'head';
      const dmg = def.damage * (headshot ? def.headMult : 1);
      const died = damageBot(bot, dmg, true, headshot, null);
      hud.hitmarker(died);
      audio.hit(died);
    }
  } else {
    hitVec.copy(camera.position).addScaledVector(dirVec, def.range);
    spawnTracer(muzzleVec, hitVec);
  }
  player.recoil(def.kick * (0.9 + random() * 0.2), (random() * 2 - 1) * def.kick * 0.35);
  bots.onGunfire(body.position.x, body.position.z);
  refreshAmmoHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    document.getElementById('overlay-start').hidden = true;
    hud.showHud(true);
  } else if (state.phase === 'round' || state.phase === 'buy' || state.phase === 'roundEnd') {
    const title = document.querySelector('#overlay-start h1');
    const copy = document.querySelector('#overlay-start p');
    if (title) title.textContent = 'JEDA — BENTENG KALISUSU';
    if (copy) copy.textContent = 'Klik LANJUTKAN untuk kembali ke pertandingan.';
    document.getElementById('play').textContent = 'LANJUTKAN';
    document.getElementById('overlay-start').hidden = false;
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'menu') {
    // Buy phase first: do NOT take pointer lock yet, or the buy menu's own
    // buttons would never receive the click (a locked pointer routes mouse
    // events to the canvas). Lock is taken when the round starts.
    game.startMatch();
  } else {
    input.requestLock();
  }
});
hud.onBuyDone(() => {
  if (state.phase === 'buy') {
    input.state.keys.delete('Enter');
    game.startRound();
    input.requestLock();
  }
});
hud.onAgain(() => {
  audio.unlock();
  // Same as onPlay: the buy phase comes first, so no pointer lock yet.
  game.startMatch();
});

renderer.domElement.addEventListener('mousedown', (event) => {
  if (event.button === 2 && state.phase === 'round' && state.currentWeapon === 'sr2' && input.state.locked) {
    scoped = !scoped;
    weapons.setScoped(scoped);
    camera.fov = scoped ? 28 : 74;
    camera.updateProjectionMatrix();
    hud.setScope(scoped);
  }
});

function step(dt) {
  elapsed += dt;
  const ctx = {
    now: elapsed,
    random,
    playerPos: body.position,
    playerAlive: state.health > 0,
    playerMoving: player.groundSpeed() > 1,
    playerCrouched: body.crouched,
  };
  // Player movement + look (only while alive and in a round).
  const look = input.takeLook();
  if (state.phase === 'round' && state.health > 0 && input.state.locked) {
    player.look(look.x, look.y);
    player.step(dt, input.state.keys);
  } else if (state.phase === 'round') {
    player.step(dt, new Set());
  }
  // Footsteps.
  const speed = player.groundSpeed();
  if (speed > 1 && state.health > 0) {
    stepDistance += speed * dt;
    if (stepDistance > 2.4) { stepDistance = 0; audio.step(); }
  }
  // Firing / reload / weapon switching.
  if (state.phase === 'round' && state.health > 0 && input.state.locked) {
    if (input.state.firing) shoot();
    if (input.state.keys.has('KeyR')) {
      if (weapons.reload()) audio.reload();
      input.state.keys.delete('KeyR');
    }
    if (input.state.keys.has('Digit1')) { weapons.switchTo('p9'); refreshAmmoHud(); input.state.keys.delete('Digit1'); }
    if (input.state.keys.has('Digit2')) { weapons.switchTo('ss1'); refreshAmmoHud(); input.state.keys.delete('Digit2'); }
    if (input.state.keys.has('Digit3')) { weapons.switchTo('sr2'); refreshAmmoHud(); input.state.keys.delete('Digit3'); }
    if (input.state.keys.has('KeyG')) {
      camera.getWorldDirection(tmpVec);
      if (game.throwSmoke({ x: body.position.x, y: body.position.y + body.eye - 0.2, z: body.position.z }, tmpVec)) {
        hud.setHint('Granat asap dilempar.');
      }
      input.state.keys.delete('KeyG');
    }
    if (input.state.keys.has('KeyM')) {
      audio.setMuted(!audio.isMuted());
      hud.setHint(audio.isMuted() ? 'Suara dimatikan (M).' : 'Suara menyala (M).');
      input.state.keys.delete('KeyM');
    }
  }
  weapons.step(dt);
  game.step(dt, input, ctx);

  // Bots.
  const botCtx = {
    now: elapsed,
    random,
    smokes: game.smokes,
    playerAlive: state.health > 0 && state.phase === 'round',
    playerPos: body.position,
    playerMoving: speed > 1,
    playerCrouched: body.crouched,
    onShot() { audio.enemyShot(); },
    onPlayerDamaged(dmg, bot) { game.playerDamaged(dmg, bot); },
    onBotDamaged(victim, dmg, killer) { damageBot(victim, dmg, false, false, killer); },
    onBotKilled() {},
  };
  bots.step(dt, botCtx);

  // Drain game events into visuals.
  for (const event of game.drainEvents()) {
    if (event.type === 'explosion') {
      explosionMesh.position.set(event.x, 1.5, event.z);
      explosionMesh.visible = true;
      explosionLight.position.set(event.x, 4, event.z);
      explosionLight.intensity = 60;
      explosionLife = 1;
    }
  }

  // HUD refresh.
  hud.setSpread(weapons.spread(speed, body.crouched));
  if (state.phase === 'round') {
    hud.setTimer(state.bombPlanted ? state.bombTimer : state.roundTimer);
  }
  hud.tick(dt);
  // Bomb visual + blinking light.
  if (state.bombPlanted) {
    bombGroup.visible = true;
    bombGroup.position.set(state.bombPos.x, 0.2, state.bombPos.z);
    bombLight.material.color.setHex(Math.floor(elapsed * 2) % 2 === 0 ? 0xff3b30 : 0x550000);
  } else {
    bombGroup.visible = false;
  }
  // Explosion fade.
  if (explosionLife > 0) {
    explosionLife -= dt;
    const t = Math.max(0, explosionLife);
    explosionMesh.scale.setScalar(1 + (1 - t) * 14);
    explosionMesh.material.opacity = t * 0.85;
    explosionLight.intensity = t * 60;
    if (t <= 0) { explosionMesh.visible = false; explosionLight.intensity = 0; }
  }
  // Smoke visuals follow the live smoke list.
  for (let i = 0; i < smokeGroups.length; i += 1) {
    const group = smokeGroups[i];
    const smoke = game.smokes[i];
    if (smoke) {
      group.visible = true;
      group.position.set(smoke.x, 0, smoke.z);
      group.rotation.y += dt * 0.15;
    } else {
      group.visible = false;
    }
  }
  // Torch flicker (cheap: scale the flame, no allocation).
  for (let i = 0; i < map.torches.length; i += 1) {
    const torch = map.torches[i];
    const flicker = 0.85 + Math.sin(elapsed * 11 + torch.phase) * 0.15;
    torch.flame.scale.set(flicker, 1 + (1 - flicker) * 0.6, flicker);
    torch.glow.intensity = 6 * flicker;
  }
  // Tracers fade.
  for (let i = 0; i < tracers.length; i += 1) {
    const slot = tracers[i];
    if (slot.life > 0) {
      slot.life -= dt;
      if (slot.life <= 0) slot.line.visible = false;
      else slot.line.material.opacity = slot.life / 0.08 * 0.9;
    }
  }
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.showHud(true);
  document.getElementById('overlay-start').hidden = true;
  if (name === 'cover') {
    game.startMatch();
    game.startRound();
    // Arm the player with the SS-1 for a mid-round firefight look.
    state.money = 100;
    state.owned.ss1 = { mag: 24, reserve: 90 };
    weapons.switchTo('ss1');
    refreshAmmoHud();
    state.roundTimer = 72;
    state.scoreAtk = 2;
    state.scoreDef = 1;
    state.kills = 3;
    hud.setScore(2, 1);
    hud.setKills(3, 0);
    hud.setMoney(100);
    hud.setTimer(72);
    body.position.x = 0;
    body.position.z = 30;
    body.yaw = 0.04;
    body.pitch = 0.01;
    const enemies = bots.list.filter((b) => b.team === 'enemy');
    enemies[0].pos.x = 2; enemies[0].pos.z = 19;
    enemies[1].pos.x = -3.5; enemies[1].pos.z = 17;
    enemies[2].pos.x = 12; enemies[2].pos.z = 10;
    const allies = bots.list.filter((b) => b.team === 'ally');
    allies[0].pos.x = 3.2; allies[0].pos.z = 27;
    settle(30);
    // One shot toward the gate defender, tracer + muzzle flash in frame.
    body.yaw = Math.atan2(-(2 - 0), -(19 - 30));
    body.pitch = 0.02;
    syncCamera();
    shoot();
    settle(4);
    hud.setHint('');
  } else if (name === 'buy') {
    game.startMatch();
    state.money = 1250;
    hud.setMoney(1250);
    hud.showBuy(state);
    body.position.x = 0;
    body.position.z = 34;
    body.yaw = 0;
    settle(10);
  } else if (name === 'plant') {
    game.startMatch();
    game.startRound();
    state.money = 450;
    hud.setMoney(450);
    state.owned.ss1 = { mag: 18, reserve: 60 };
    weapons.switchTo('ss1');
    refreshAmmoHud();
    body.position.x = -18;
    body.position.z = -6.5;
    body.yaw = 0;
    body.pitch = -0.02;
    state.plantProgress = 2.1;
    state.plantSite = 'A';
    hud.plantBar(true, 'MENANAM BOM DI SITE A… TAHAN E', 2.1 / 3);
    const enemies = bots.list.filter((b) => b.team === 'enemy');
    enemies[0].pos.x = -10; enemies[0].pos.z = -6;
    const allies = bots.list.filter((b) => b.team === 'ally');
    allies[0].pos.x = -14; allies[0].pos.z = -4;
    settle(20);
    // Hide the round-start banner so the SITE A sign reads clearly.
    document.getElementById('banner').classList.remove('show');
  } else if (name === 'end') {
    game.startMatch();
    state.scoreAtk = 5;
    state.scoreDef = 2;
    state.kills = 14;
    state.deaths = 3;
    state.money = 2400;
    hud.showEnd(true, 5, 2, 14, 3, 2400);
    hud.showHud(false);
    body.position.x = 0;
    body.position.z = 20;
    body.yaw = 0;
    settle(10);
  }
  hud.setTimer(state.phase === 'round' ? state.roundTimer : 105);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for local play-testing (not part of the game UI).
window.__bk = { state, game, player, bots, weapons, map };

syncCamera();
hud.setHealth(100);
refreshAmmoHud();
hud.setScore(0, 0);
hud.setMoney(800);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
