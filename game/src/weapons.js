// weapons.js — weapon state, firing, recoil/spread, reload, and the viewmodel gun.
// Spread grows while moving and firing and shrinks while crouched and still, so
// stopping to aim pays. Ammo is per owned weapon and can run out entirely.

import * as THREE from 'three';
import { WEAPONS } from './state.js';

export function createWeapons(camera, state) {
  const weaponState = {
    cooldown: 0,
    reloading: 0,
    reloadTotal: 0,
    scoped: false,
    spreadBloom: 0,
  };

  // --- viewmodel: a simple procedural rifle/pistol held at the camera --------
  const viewmodel = new THREE.Group();
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x2b2620 });
  const gunMat2 = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat);
  barrel.position.set(0, -0.02, -0.32);
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.34), gunMat);
  bodyMesh.position.set(0, -0.02, 0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), gunMat2);
  grip.position.set(0, -0.12, 0.06);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), gunMat2);
  sight.position.set(0, 0.06, -0.12);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), gunMat);
  mag.position.set(0, -0.12, -0.08);
  viewmodel.add(barrel, bodyMesh, grip, sight, mag);
  viewmodel.position.set(0.3, -0.27, -0.55);
  viewmodel.scale.setScalar(0.62);
  camera.add(viewmodel);
  // Muzzle flash: a small additive plane at the barrel tip, shown for 40 ms.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc95e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
  flash.position.set(0, -0.02, -0.68);
  viewmodel.add(flash);
  let flashTime = 0;

  function currentDef() {
    return WEAPONS[state.currentWeapon];
  }

  function setViewmodelFor(id) {
    // Pistol is shorter and lighter than the rifles.
    const scale = id === 'p9' ? 0.75 : 1;
    barrel.scale.set(scale, scale, id === 'p9' ? 0.55 : 1);
    bodyMesh.scale.set(scale, scale, id === 'p9' ? 0.7 : 1);
    mag.visible = id !== 'sr2';
    sight.visible = id === 'sr2';
  }

  return {
    state: weaponState,
    viewmodel,
    currentDef,
    switchTo(id) {
      if (!state.owned[id] || state.currentWeapon === id) return false;
      state.currentWeapon = id;
      weaponState.reloading = 0;
      weaponState.scoped = false;
      setViewmodelFor(id);
      return true;
    },
    buy(id) {
      const def = WEAPONS[id];
      if (!def || state.owned[id] || state.money < def.price) return false;
      state.money -= def.price;
      state.owned[id] = { mag: def.mag, reserve: def.reserveMax };
      return true;
    },
    buyItem(id) {
      if (id === 'smoke') {
        if (state.money < 300 || state.smokes >= 2) return false;
        state.money -= 300;
        state.smokes += 1;
        return true;
      }
      if (id === 'armor') {
        if (state.money < 650 || state.armor) return false;
        state.money -= 650;
        state.armor = true;
        return true;
      }
      return false;
    },
    // Current spread in radians: base + movement + bloom, reduced by crouch/scope.
    spread(moveSpeed, crouched) {
      const def = currentDef();
      let s = def.spread + def.moveSpread * Math.min(1, moveSpeed / 5.4);
      s += weaponState.spreadBloom;
      if (crouched) s *= 0.55;
      if (weaponState.scoped) s *= 0.25;
      return s;
    },
    ready() {
      return weaponState.cooldown <= 0 && weaponState.reloading <= 0;
    },
    // Returns 'fired' | 'empty' | 'not-ready'. main.js performs the raycast.
    tryFire() {
      const def = currentDef();
      if (!this.ready()) return 'not-ready';
      const slot = state.owned[state.currentWeapon];
      if (!slot || slot.mag <= 0) return 'empty';
      slot.mag -= 1;
      weaponState.cooldown = def.rate;
      weaponState.spreadBloom = Math.min(0.05, weaponState.spreadBloom + (def.id === 'ss1' ? 0.007 : 0.004));
      flashTime = 0.045;
      flashMat.opacity = 0.95;
      return 'fired';
    },
    reload() {
      const def = currentDef();
      const slot = state.owned[state.currentWeapon];
      if (!slot || weaponState.reloading > 0 || slot.mag >= def.mag || slot.reserve <= 0) return false;
      weaponState.reloading = def.reload;
      weaponState.reloadTotal = def.reload;
      return true;
    },
    setScoped(on) {
      if (!currentDef().scoped) return false;
      weaponState.scoped = on;
      return true;
    },
    isScoped() { return weaponState.scoped; },
    step(dt) {
      if (weaponState.cooldown > 0) weaponState.cooldown -= dt;
      if (weaponState.spreadBloom > 0) weaponState.spreadBloom = Math.max(0, weaponState.spreadBloom - dt * 0.045);
      if (flashTime > 0) {
        flashTime -= dt;
        if (flashTime <= 0) flashMat.opacity = 0;
      }
      if (weaponState.reloading > 0) {
        weaponState.reloading -= dt;
        if (weaponState.reloading <= 0) {
          const def = currentDef();
          const slot = state.owned[state.currentWeapon];
          const need = def.mag - slot.mag;
          const take = Math.min(need, slot.reserve);
          slot.mag += take;
          slot.reserve -= take;
        }
      }
    },
    ammo() {
      const slot = state.owned[state.currentWeapon];
      return slot ? { mag: slot.mag, reserve: slot.reserve } : { mag: 0, reserve: 0 };
    },
  };
}
