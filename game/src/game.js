// game.js — the match: rounds, the bomb, the economy and the buy phase.
// One state object (state.js) holds everything; this module is the only one that
// changes phase, score or money. main.js calls step() from the fixed-step loop.

import {
  ROUND_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME, WIN_ROUNDS, MAX_ROUNDS,
  ECONOMY, PLAYER_HP,
} from './state.js';

export function createGame(deps) {
  const { state, player, bots, weapons, hud, audio, map } = deps;
  const events = [];
  const smokes = []; // {x, z, r, until}
  const projectiles = []; // flying smoke grenades {x,y,z,vx,vy,vz}
  let beepTimer = 0;
  let plantBeepTimer = 0;

  function emit(type, data = {}) {
    events.push({ type, ...data });
  }

  function siteAt(x, z) {
    const dA = Math.hypot(x - map.siteA.x, z - map.siteA.z);
    const dB = Math.hypot(x - map.siteB.x, z - map.siteB.z);
    if (dA <= map.siteA.r) return 'A';
    if (dB <= map.siteB.r) return 'B';
    return '';
  }

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreAtk = 0;
    state.scoreDef = 0;
    state.money = ECONOMY.start;
    state.kills = 0;
    state.deaths = 0;
    state.owned = { p9: { mag: 12, reserve: 36 } };
    state.currentWeapon = 'p9';
    state.smokes = 0;
    state.armor = false;
    state.bombPlanted = false;
    state.bombSite = '';
    weapons.switchTo('p9');
    hud.clearFeed();
    hud.setScore(0, 0);
    hud.setKills(0, 0);
    hud.setMoney(state.money);
    hud.setRound(1);
    beginBuyPhase();
  }

  function beginBuyPhase() {
    state.phase = 'buy';
    state.buyTimer = 20;
    hud.showBuy(state);
    hud.setHint('Beli senjata, lalu tekan MULAI RONDE atau Enter.');
    hud.showHud(true);
  }

  function startRound() {
    state.phase = 'round';
    state.roundTimer = ROUND_TIME;
    state.bombPlanted = false;
    state.bombTimer = 0;
    state.bombSite = '';
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.plantSite = '';
    state.health = PLAYER_HP;
    state.armor = false;
    hud.hideBuy();
    hud.setHealth(state.health);
    hud.setRound(state.round);
    hud.setTimer(ROUND_TIME);
    hud.setBomb('BOM: BAWA — TANAM DI SITE A ATAU B', false);
    hud.setHint('Tahan E di dalam Site A atau B untuk menanam bom.');
    player.reset(map.attackerSpawn.x, map.attackerSpawn.z, 0);
    bots.resetRound(Math.random);
    const ammo = weapons.ammo();
    hud.setAmmo(ammo.mag, ammo.reserve, weapons.currentDef().name, ammo.mag === 0);
    hud.banner(`RONDE ${state.round}`, 'Tanam bom di Gudang Mesiu (A) atau Gerbang Benteng (B)');
    emit('roundStart', { round: state.round });
  }

  function endRound(winner, reason) {
    if (state.phase !== 'round') return;
    state.phase = 'roundEnd';
    state.roundEndTimer = 3.5;
    state.roundEndReason = reason;
    if (winner === 'atk') {
      state.scoreAtk += 1;
      state.money += ECONOMY.win;
      audio.roundWin();
      hud.banner('RONDE MENANG', reason);
    } else {
      state.scoreDef += 1;
      state.money += ECONOMY.loss;
      audio.roundLose();
      hud.banner('RONDE KALAH', reason);
    }
    state.armor = false;
    hud.setScore(state.scoreAtk, state.scoreDef);
    hud.setMoney(state.money);
    hud.setHint('');
    hud.plantBar(false);
    emit('roundEnd', { winner, reason });
  }

  function endMatch() {
    state.phase = 'matchEnd';
    state.matchWinner = state.scoreAtk > state.scoreDef ? 'atk' : 'def';
    hud.showEnd(state.matchWinner === 'atk', state.scoreAtk, state.scoreDef, state.kills, state.deaths, state.money);
    hud.showHud(false);
    emit('matchEnd', { winner: state.matchWinner });
  }

  function plantBomb(site, pos) {
    state.bombPlanted = true;
    state.bombTimer = BOMB_TIME;
    state.bombSite = site;
    state.bombPos.x = pos.x;
    state.bombPos.z = pos.z;
    state.money += ECONOMY.plant;
    state.plantProgress = 0;
    audio.plantDone();
    hud.setMoney(state.money);
    hud.setBomb(`BOM DITANAM DI SITE ${site} — ${BOMB_TIME} DETIK`, true);
    hud.banner('BOM DITANAM', `Jaga Site ${site} selama ${BOMB_TIME} detik!`);
    hud.feed(`<span class="ally">Kamu</span> menanam bom di Site ${site} <b>+$${ECONOMY.plant}</b>`);
    bots.onPlant(site);
    emit('planted', { site, x: pos.x, z: pos.z });
  }

  function stepBuy(dt, input) {
    state.buyTimer -= dt;
    if (state.buyTimer <= 0 || input.state.keys.has('Enter')) {
      input.state.keys.delete('Enter');
      startRound();
    }
  }

  function stepRound(dt, input, ctx) {
    // Round clock (the bomb clock takes over once planted).
    if (!state.bombPlanted) {
      state.roundTimer -= dt;
      if (state.roundTimer <= 0) {
        endRound('def', 'Waktu habis — bom tidak meledak.');
        return;
      }
    } else {
      state.bombTimer -= dt;
      beepTimer -= dt;
      if (beepTimer <= 0) {
        audio.plantBeep();
        beepTimer = state.bombTimer < 10 ? 0.5 : 1;
      }
      hud.setBomb(`BOM DI SITE ${state.bombSite} — MELEDAK ${Math.ceil(state.bombTimer)} DETIK`, true);
      if (state.bombTimer <= 0) {
        audio.explosion();
        emit('explosion', { x: state.bombPos.x, z: state.bombPos.z });
        endRound('atk', 'Bom meledak di Gudang Mesiu.');
        return;
      }
      // Defuse: a defender standing at the bomb holds it for DEFUSE_TIME.
      let defuser = null;
      for (const bot of bots.list) {
        if (bot.team !== 'enemy' || !bot.alive) continue;
        if (Math.hypot(bot.pos.x - state.bombPos.x, bot.pos.z - state.bombPos.z) < 1.8) { defuser = bot; break; }
      }
      if (defuser) {
        state.defuseProgress += dt;
        hud.plantBar(true, `MUSUH MENJINAKKAN BOM — ${defuser.name}`, state.defuseProgress / DEFUSE_TIME);
        if (Math.random() < dt * 2) audio.defuseBeep();
        if (state.defuseProgress >= DEFUSE_TIME) {
          hud.plantBar(false);
          endRound('def', `Bom dijinakkan oleh ${defuser.name}.`);
          return;
        }
      } else {
        state.defuseProgress = Math.max(0, state.defuseProgress - dt * 2);
        if (state.plantProgress === 0) hud.plantBar(false);
      }
    }

    // Planting: hold E while standing inside a site.
    if (ctx.playerAlive && !state.bombPlanted) {
      const site = siteAt(ctx.playerPos.x, ctx.playerPos.z);
      if (site && input.state.keys.has('KeyE')) {
        state.plantProgress += dt;
        state.plantSite = site;
        plantBeepTimer -= dt;
        if (plantBeepTimer <= 0) { audio.plantBeep(); plantBeepTimer = 0.5; }
        hud.plantBar(true, `MENANAM BOM DI SITE ${site}… TAHAN E`, state.plantProgress / PLANT_TIME);
        if (state.plantProgress >= PLANT_TIME) {
          hud.plantBar(false);
          plantBomb(site, ctx.playerPos);
        }
      } else {
        state.plantProgress = Math.max(0, state.plantProgress - dt * 2);
        if (state.plantProgress === 0 && !state.bombPlanted && state.defuseProgress === 0) hud.plantBar(false);
        if (site && !input.state.keys.has('KeyE')) {
          hud.setHint('Tahan E untuk menanam bom di sini.');
        }
      }
    }

    // Elimination wins.
    if (bots.aliveCount('enemy') === 0) {
      endRound('atk', 'Semua bertahan gugur.');
      return;
    }
    if (bots.aliveCount('ally') === 0 && !ctx.playerAlive) {
      endRound('def', 'Tim penyerang gugur.');
      return;
    }

    // Smoke grenade projectiles.
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y <= 0.1) {
        smokes.push({ x: p.x, z: p.z, r: 6, until: ctx.now + 12 });
        emit('smokeLanded', { x: p.x, z: p.z });
        projectiles.splice(i, 1);
      }
    }
    // Expire old smoke.
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      if (smokes[i].until <= ctx.now) smokes.splice(i, 1);
    }
  }

  return {
    smokes,
    projectiles,
    startMatch,
    startRound,
    beginBuyPhase,
    plantBomb,
    drainEvents() {
      const out = events.slice();
      events.length = 0;
      return out;
    },
    playerKilledBot(bot, headshot) {
      state.kills += 1;
      state.money += ECONOMY.kill;
      hud.setKills(state.kills, state.deaths);
      hud.setMoney(state.money);
      hud.feed(`<span class="ally">Kamu</span> ${headshot ? 'headshot ' : ''}☠ <span class="enemy">${bot.name}</span> <b>+$${ECONOMY.kill}</b>`);
    },
    botKilledBot(victim, killer) {
      const vTeam = victim.team === 'ally' ? 'ally' : 'enemy';
      const kTeam = killer.team === 'ally' ? 'ally' : 'enemy';
      hud.feed(`<span class="${kTeam}">${killer.name}</span> ☠ <span class="${vTeam}">${victim.name}</span>`);
    },
    playerDamaged(amount, fromBot) {
      if (state.phase !== 'round' || state.health <= 0) return;
      if (state.armor) amount *= 0.6;
      state.health -= amount;
      audio.hurt();
      hud.setHealth(state.health);
      if (state.health <= 0) {
        state.health = 0;
        state.deaths += 1;
        hud.setKills(state.kills, state.deaths);
        hud.feed(`<span class="enemy">${fromBot.name}</span> ☠ <span class="ally">Kamu</span>`);
        emit('playerDeath', { by: fromBot.name });
        if (!state.bombPlanted) endRound('def', `Kamu gugur ditembak ${fromBot.name}.`);
        else hud.setHint('Kamu gugur — sekutumu menjaga bom.');
      }
    },
    throwSmoke(from, dir) {
      if (state.smokes <= 0 || state.phase !== 'round') return false;
      state.smokes -= 1;
      projectiles.push({
        x: from.x, y: from.y, z: from.z,
        vx: dir.x * 14, vy: dir.y * 14 + 3.5, vz: dir.z * 14,
      });
      audio.throwSmoke();
      return true;
    },
    step(dt, input, ctx) {
      if (state.phase === 'buy') stepBuy(dt, input);
      else if (state.phase === 'round') stepRound(dt, input, ctx);
      else if (state.phase === 'roundEnd') {
        state.roundEndTimer -= dt;
        if (state.roundEndTimer <= 0) {
          if (state.scoreAtk >= WIN_ROUNDS || state.scoreDef >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
            endMatch();
          } else {
            state.round += 1;
            beginBuyPhase();
          }
        }
      }
    },
  };
}
