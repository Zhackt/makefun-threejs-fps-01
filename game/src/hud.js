// hud.js — every DOM element the player sees: health, ammo, timer, score, money,
// bomb status, crosshair spread, hitmarker, kill feed, buy menu and overlays.
// hud.js never decides game rules; it only renders what game.js tells it.

import { WEAPONS, ITEMS } from './state.js';

function $(id) { return document.getElementById(id); }

export function createHud(callbacks) {
  const els = {
    hud: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    health: $('health'),
    healthNum: $('health-num'),
    healthBar: $('health-bar'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    roundLabel: $('round-label'),
    timer: $('timer'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    money: $('money'),
    kills: $('kills'),
    bombStatus: $('bomb-status'),
    plantBar: $('plant-bar'),
    plantLabel: $('plant-label'),
    plantFill: $('plant-fill'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    feed: $('feed'),
    hint: $('hint'),
    scope: $('scope'),
    start: $('overlay-start'),
    buy: $('overlay-buy'),
    end: $('overlay-end'),
    shop: $('shop'),
    buyMoney: $('buy-money'),
    endTitle: $('end-title'),
    endSub: $('end-sub'),
    endScore: $('end-score'),
    endStats: $('end-stats'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;
  const feedItems = [];

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(hp) {
      els.healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      els.healthBar.style.width = `${Math.max(0, hp)}%`;
      els.health.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, weaponName, empty) {
      els.ammoMag.textContent = String(mag);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.weaponName.textContent = weaponName;
      els.ammoMag.parentElement.classList.toggle('empty', !!empty);
    },
    setTimer(seconds) {
      els.timer.textContent = fmtTime(seconds);
      els.timer.classList.toggle('low', seconds <= 15);
    },
    setRound(round) { els.roundLabel.textContent = `RONDE ${round}`; },
    setScore(atk, def) {
      els.scoreAtk.textContent = String(atk);
      els.scoreDef.textContent = String(def);
    },
    setMoney(money) {
      els.money.textContent = `$${money}`;
      els.buyMoney.textContent = `$${money}`;
    },
    setKills(kills, deaths) {
      els.kills.textContent = `KILL ${kills}  •  MATI ${deaths}`;
    },
    setBomb(text, planted) {
      els.bombStatus.textContent = text;
      els.bombStatus.classList.toggle('planted', !!planted);
    },
    setSpread(spreadRadians) {
      // Crosshair gap grows with spread: 0.004 rad -> tight, 0.06 rad -> wide.
      const gap = 4 + Math.min(26, spreadRadians * 380);
      els.crosshair.style.width = `${12 + gap * 2}px`;
      els.crosshair.style.height = `${12 + gap * 2}px`;
    },
    hitmarker(kill) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', !!kill);
      hitTimer = kill ? 0.28 : 0.12;
    },
    tick(dt) {
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) els.hitmarker.classList.remove('on');
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) els.banner.classList.remove('show');
      }
    },
    banner(title, sub, seconds = 3) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('show');
      bannerTimer = seconds;
    },
    plantBar(show, label, fraction) {
      els.plantBar.classList.toggle('show', !!show);
      if (show) {
        els.plantLabel.textContent = label;
        els.plantFill.style.width = `${Math.round(fraction * 100)}%`;
      }
    },
    setHint(text) { els.hint.textContent = text; },
    setScope(on) { els.scope.classList.toggle('on', !!on); },
    feed(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      els.feed.prepend(div);
      feedItems.unshift(div);
      while (feedItems.length > 5) {
        const old = feedItems.pop();
        old.remove();
      }
      window.setTimeout(() => { div.style.opacity = '0.35'; }, 5000);
    },
    clearFeed() {
      els.feed.innerHTML = '';
      feedItems.length = 0;
    },
    showStart() { els.start.hidden = false; els.buy.hidden = true; els.end.hidden = true; },
    showBuy(state) {
      els.start.hidden = true;
      els.end.hidden = true;
      els.buy.hidden = false;
      this.setMoney(state.money);
      els.shop.innerHTML = '';
      for (const def of Object.values(WEAPONS)) {
        const owned = !!state.owned[def.id];
        const row = document.createElement('div');
        row.className = `shop-item${owned ? ' owned' : ''}`;
        row.innerHTML = `<div class="info"><div class="name">${def.name}</div>` +
          `<div class="desc">Damage ${def.damage} • Mag ${def.mag} • ${def.auto ? 'Otomatis' : 'Semi-otomatis'}${def.scoped ? ' • Scope' : ''}</div></div>` +
          `<div class="price">${owned ? 'DIMILIKI' : '$' + def.price}</div>`;
        if (!owned) {
          const btn = document.createElement('button');
          btn.className = 'btn ghost';
          btn.type = 'button';
          btn.textContent = 'BELI';
          btn.disabled = state.money < def.price;
          btn.addEventListener('click', () => callbacks.onBuyWeapon(def.id));
          row.appendChild(btn);
        }
        els.shop.appendChild(row);
      }
      for (const item of Object.values(ITEMS)) {
        const owned = item.id === 'armor' ? state.armor : state.smokes >= 2;
        const row = document.createElement('div');
        row.className = `shop-item${owned ? ' owned' : ''}`;
        row.innerHTML = `<div class="info"><div class="name">${item.name}</div><div class="desc">${item.desc}</div></div>` +
          `<div class="price">${owned ? 'DIMILIKI' : '$' + item.price}</div>`;
        if (!owned) {
          const btn = document.createElement('button');
          btn.className = 'btn ghost';
          btn.type = 'button';
          btn.textContent = 'BELI';
          btn.disabled = state.money < item.price;
          btn.addEventListener('click', () => callbacks.onBuyItem(item.id));
          row.appendChild(btn);
        }
        els.shop.appendChild(row);
      }
    },
    hideBuy() { els.buy.hidden = true; },
    showEnd(won, atk, def, kills, deaths, money) {
      els.start.hidden = true;
      els.buy.hidden = true;
      els.end.hidden = false;
      els.endTitle.textContent = won ? 'MENANG — BENTENG KALISUSU' : 'KALAH — BENTENG KALISUSU';
      els.endSub.textContent = won
        ? 'Benteng Kalisusu jatuh ke tangan penyerang. Gudang mesiu meledak, gerbang terbuka.'
        : 'Bertahan berhasil mempertahankan benteng. Serangan penyerang gagal.';
      els.endScore.textContent = `${atk} – ${def}`;
      els.endStats.textContent = `Kill ${kills} • Mati ${deaths} • Uang akhir $${money}`;
    },
    hideEnd() { els.end.hidden = true; },
    showHud(show) { els.hud.hidden = !show; },
    onPlay(fn) { $('play').addEventListener('click', fn); },
    onBuyDone(fn) { $('buy-done').addEventListener('click', fn); },
    onAgain(fn) { $('again').addEventListener('click', fn); },
  };
}
