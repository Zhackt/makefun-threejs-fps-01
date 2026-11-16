// map.js — Benteng Kalisusu: one original fort map, built from procedural geometry.
// Layout (x east, z south, metres): attacker spawn at the foot of the hill south of
// the gate (z ~ 34); the fort is the walled rectangle x[-26, 26], z[-26, 24].
// Site A Gudang Mesiu sits in front of the powder store in the north-west;
// Site B Gerbang Benteng sits just inside the main gate.
// Three lanes: Gerbang Utama (middle, long sightline), Lorong Samping (west flank
// through a gap in the west wall), Halaman Benteng (the courtyard).

import * as THREE from 'three';

export const PALETTE = {
  sky: 0xff9a45,
  skyTop: 0xcf5a2e,
  fog: 0xe07a35,
  stone: 0x8a7a68,
  stoneDark: 0x6b5d4e,
  stoneLight: 0xa89478,
  terracotta: 0xb5502e,
  wood: 0x6e4a2a,
  ground: 0x9a7f5e,
  grass: 0x7a7a3a,
  leaf: 0x4a6b2f,
  torch: 0xffb347,
};

function lambert(color, emissive = 0x000000, emissiveIntensity = 1) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity });
}

function box(scene, material, x, y, z, w, h, d, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeSignTexture(text, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2a1c10';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#ff8c2e';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = '#f5e9d3';
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 256, 72);
  g.fillStyle = '#c9b18c';
  g.font = '30px system-ui, sans-serif';
  g.fillText(sub, 256, 122);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const colliders = []; // {x0, z0, x1, z1, tall} — tall blocks bot sightlines
  const shootables = []; // meshes bullets can hit (walls, buildings, crates)
  const torches = [];

  function addCollider(x0, z0, x1, z1, tall = true) {
    colliders.push({ x0, z0, x1, z1, tall });
  }

  // --- sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 130);
  const hemi = new THREE.HemisphereLight(0xffc98a, 0x5a4632, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb060, 1.8);
  sun.position.set(-40, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 140;
  scene.add(sun);
  // Low orange sun disc on the horizon, west.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(7, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sunDisc.position.set(-95, 14, -30);
  sunDisc.lookAt(0, 8, 0);
  scene.add(sunDisc);
  // Distant hills as dark silhouettes.
  const hillMat = lambert(0x7a4a30);
  for (const [hx, hz, hr, hh] of [[-70, -70, 42, 16], [60, -80, 50, 20], [80, 40, 44, 14], [-80, 50, 38, 12]]) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(hr, hh, 7), hillMat);
    hill.position.set(hx, hh / 2 - 1, hz);
    scene.add(hill);
  }

  // --- ground --------------------------------------------------------------
  const groundMat = lambert(PALETTE.ground);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Courtyard stone paving inside the fort.
  const pave = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 50),
    lambert(0x8f7d66),
  );
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(0, 0.02, -1);
  pave.receiveShadow = true;
  scene.add(pave);
  // Dirt path from spawn through the gate.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(7, 20), lambert(0xb08d5e));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.03, 30);
  path.receiveShadow = true;
  scene.add(path);

  // --- materials -----------------------------------------------------------
  const stone = lambert(PALETTE.stone);
  const stoneDark = lambert(PALETTE.stoneDark);
  const stoneLight = lambert(PALETTE.stoneLight);
  const terra = lambert(PALETTE.terracotta);
  const wood = lambert(PALETTE.wood);
  const leaf = lambert(PALETTE.leaf);

  // --- fort walls (height 5, thickness 2) ---------------------------------
  // South wall z=24 with the main gate opening x[-3.5, 3.5].
  box(scene, stone, -14.75, 2.5, 24, 22.5, 5, 2); addCollider(-26, 23, -3.5, 25);
  box(scene, stone, 14.75, 2.5, 24, 22.5, 5, 2); addCollider(3.5, 23, 26, 25);
  // Gate lintel + arch above the opening.
  box(scene, stoneDark, 0, 5.6, 24, 9, 1.2, 2.4);
  box(scene, wood, -3.2, 2.2, 24, 0.6, 4.4, 0.4);
  box(scene, wood, 3.2, 2.2, 24, 0.6, 4.4, 0.4);
  // North wall.
  box(scene, stone, 0, 2.5, -26, 52, 5, 2); addCollider(-26, -27, 26, -25);
  // West wall with the side-lane gap z[-2, 2].
  box(scene, stone, -26, 2.5, -14, 2, 5, 24); addCollider(-27, -25, -25, -2);
  box(scene, stone, -26, 2.5, 13, 2, 5, 22); addCollider(-27, 2, -25, 23);
  // East wall, solid.
  box(scene, stone, 26, 2.5, -1, 2, 5, 50); addCollider(25, -26, 27, 24);
  // Crenellation blocks along the tops.
  for (let x = -24; x <= 24; x += 4) {
    if (Math.abs(x) < 5) continue;
    box(scene, stoneLight, x, 5.4, 24, 1.6, 0.8, 2.2);
    box(scene, stoneLight, x, 5.4, -26, 1.6, 0.8, 2.2);
  }
  for (let z = -24; z <= 22; z += 4) {
    if (z > -4 && z < 4) continue;
    box(scene, stoneLight, -26, 5.4, z, 2.2, 0.8, 1.6);
    box(scene, stoneLight, 26, 5.4, z, 2.2, 0.8, 1.6);
  }

  // --- watchtowers on the four corners ------------------------------------
  for (const [tx, tz] of [[-26, -26], [26, -26], [-26, 24], [26, 24]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 7.5, 8), stoneDark);
    tower.position.set(tx, 3.75, tz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 8), terra);
    roof.position.set(tx, 8.7, tz);
    roof.castShadow = true;
    scene.add(roof);
    addCollider(tx - 2.6, tz - 2.6, tx + 2.6, tz + 2.6);
  }

  // --- Site A: Gudang Mesiu (powder store), north-west ----------------------
  // Solid store building x[-24,-12], z[-24,-14]; plant zone in front of it.
  box(scene, stoneDark, -18, 2, -19, 12, 4, 10); addCollider(-24, -24, -12, -14);
  const roofA = new THREE.Mesh(new THREE.ConeGeometry(9.2, 3, 4), terra);
  roofA.position.set(-18, 5.5, -19);
  roofA.rotation.y = Math.PI / 4;
  roofA.scale.set(1, 1, 0.75);
  roofA.castShadow = true;
  scene.add(roofA);
  box(scene, wood, -18, 1.6, -13.8, 3.2, 3.2, 0.4); // store door
  // Barrels beside the store.
  for (const [bx, bz] of [[-11, -12], [-11.8, -10.6], [-24.5, -12], [-24.5, -10.8]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10), wood);
    barrel.position.set(bx, 0.65, bz);
    barrel.castShadow = true;
    scene.add(barrel);
    addCollider(bx - 0.55, bz - 0.55, bx + 0.55, bz + 0.55, false);
  }

  // --- Site B: Gerbang Benteng area ----------------------------------------
  // A guard house east of the gate.
  box(scene, stone, 16, 1.8, 18, 8, 3.6, 6); addCollider(12, 15, 20, 21);
  const roofB = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.2, 4), terra);
  roofB.position.set(16, 4.7, 18);
  roofB.rotation.y = Math.PI / 4;
  roofB.castShadow = true;
  scene.add(roofB);
  // Flag pole with a terracotta banner at the gate.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), wood);
  pole.position.set(6.5, 3.5, 22.5);
  pole.castShadow = true;
  scene.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshLambertMaterial({ color: 0xe4572e, side: THREE.DoubleSide }));
  flag.position.set(7.7, 6.2, 22.5);
  scene.add(flag);
  addCollider(6.3, 22.3, 6.7, 22.7, false);

  // Rubble just inside the main gate: it breaks the long sightline from the
  // courtyard to the attacker spawn, so defenders cannot farm the spawn
  // through the gate — attackers must push past it to open the lane.
  box(scene, stoneDark, -0.9, 0.9, 19, 1.8, 1.8, 1.6, 0.15);
  box(scene, stone, 0.9, 0.6, 19.4, 1.8, 1.2, 1.4, -0.2);
  box(scene, stoneLight, 0, 1.6, 19, 1.4, 0.8, 1.2, 0.4);
  addCollider(-1.8, 17.8, 1.8, 20.4);
  // Broken cart beside the rubble.
  box(scene, wood, -3.4, 0.7, 20.5, 1.6, 0.7, 1.0, 0.5);
  addCollider(-4.2, 20.0, -2.6, 21.0, false);
  const crateMat = lambert(0x7a5c33);
  function crate(x, z, s = 1.2, ry = 0) {
    const m = box(scene, crateMat, x, s / 2, z, s, s, s, ry);
    shootables.push(m);
    addCollider(x - s / 2, z - s / 2, x + s / 2, z + s / 2, false);
  }
  crate(-6, 8, 1.4); crate(-4.4, 8.4, 1.1, 0.4); crate(-5.2, 6.6, 1.0, 0.9);
  crate(8, 2, 1.4); crate(9.6, 2.6, 1.1, 0.3);
  crate(-12, 2, 1.3); crate(-13.4, 3.2, 1.0, 0.7);
  crate(14, -8, 1.4); crate(15.6, -7.4, 1.1, 0.5);
  crate(-20, -6, 1.3); crate(-21.4, -4.8, 1.0, 0.2);
  crate(2, -14, 1.4); crate(3.6, -13.4, 1.1, 0.6);
  crate(-2, -20, 1.3);
  // Stone pillars in the courtyard.
  for (const [px, pz] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 3.4, 8), stoneLight);
    pillar.position.set(px, 1.7, pz);
    pillar.castShadow = true;
    scene.add(pillar);
    shootables.push(pillar);
    addCollider(px - 0.8, pz - 0.8, px + 0.8, pz + 0.8, false);
  }
  // The old well at the courtyard centre.
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.1, 12), stoneDark);
  well.position.set(0, 0.55, -2);
  well.castShadow = true;
  scene.add(well);
  shootables.push(well);
  addCollider(-1.5, -3.5, 1.5, -0.5, false);
  box(scene, wood, 0, 2.2, -2, 3.4, 0.3, 0.3);
  box(scene, terra, 0, 2.6, -2, 3.8, 0.25, 1.6); // little roof over the well
  // Market stalls with striped canvas (two-tone boxes).
  for (const [sx, sz, sry] of [[-16, 8, 0.3], [12, -16, -0.4]]) {
    box(scene, wood, sx, 0.55, sz, 3.4, 1.1, 1.6, sry);
    const awning = box(scene, terra, sx, 1.7, sz, 3.8, 0.15, 2.0, sry);
    awning.castShadow = true;
    addCollider(sx - 1.7, sz - 0.8, sx + 1.7, sz + 0.8, false);
  }

  // --- outside the walls: rocks and palms ----------------------------------
  const rockMat = lambert(0x6e6258);
  for (const [rx, rz, rs] of [[-14, 36, 1.6], [12, 40, 2.1], [-34, 16, 1.8], [34, 12, 1.5], [-38, -14, 2.4], [36, -20, 1.9], [10, -34, 1.7]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), rockMat);
    rock.position.set(rx, rs * 0.5, rz);
    rock.castShadow = true;
    scene.add(rock);
    addCollider(rx - rs, rz - rs, rx + rs, rz + rs, false);
  }
  function palm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 7), wood);
    trunk.position.set(x, 2.5, z);
    trunk.rotation.z = 0.12;
    trunk.castShadow = true;
    scene.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 7), leaf);
    top.position.set(x + 0.6, 6, z);
    top.castShadow = true;
    scene.add(top);
    addCollider(x - 0.4, z - 0.4, x + 0.4, z + 0.4, false);
  }
  palm(-10, 38); palm(14, 34); palm(-36, 4); palm(34, 28); palm(-12, -34); palm(20, -32);

  // --- torches ---------------------------------------------------------------
  const torchMat = new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0xff8c2e, emissiveIntensity: 1.6 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc95e });
  for (const [tx, tz] of [[-4.4, 22.6], [4.4, 22.6], [-12, -12.6], [10, 12.6], [-26, 0, 0]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.8, 6), wood);
    post.position.set(tx, 0.9, tz);
    scene.add(post);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), flameMat);
    flame.position.set(tx, 2.0, tz);
    scene.add(flame);
    const glow = new THREE.PointLight(0xff9a3c, 6, 12, 1.8);
    glow.position.set(tx, 2.1, tz);
    scene.add(glow);
    torches.push({ flame, glow, x: tx, z: tz, phase: Math.random() * 6 });
  }

  // --- site markers: glowing rings + signs ----------------------------------
  function siteRing(x, z, r) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.35, r, 40),
      new THREE.MeshBasicMaterial({ color: 0xff8c2e, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    scene.add(ring);
    return ring;
  }
  function sign(text, sub, x, y, z, ry) {
    const tex = makeSignTexture(text, sub);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.375),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
  }
  const siteA = { x: -18, z: -11, r: 5, ring: siteRing(-18, -11, 5) };
  const siteB = { x: 6, z: 14, r: 5, ring: siteRing(6, 14, 5) };
  sign('SITE A', 'GUDANG MESIU', -18, 4.6, -13.9, 0);
  sign('SITE B', 'GERBANG BENTENG', 6, 4.4, 22.4, Math.PI);
  sign('BENTENG KALISUSU', 'EREKE • BUTON UTARA', 0, 7.0, 24.2, Math.PI);

  // Wall meshes are raycast targets for bullets; collect them.
  scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry && obj.geometry.type === 'BoxGeometry' && obj.material === stone) shootables.push(obj);
  });

  return {
    colliders,
    shootables,
    torches,
    siteA,
    siteB,
    bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    attackerSpawn: { x: 0, z: 34 },
    defenderSpawn: { x: 0, z: -18 },
    // Bot routes: waypoints the attackers walk, randomised per round.
    routes: {
      gateA: [[0, 32], [0, 26], [0, 20], [0, 10], [-6, 2], [-12, -4], [-18, -8], [-18, -11]],
      sideA: [[-8, 32], [-18, 30], [-28, 24], [-30, 12], [-30, 0], [-28, -8], [-24, -12], [-18, -11]],
      gateB: [[2, 32], [2, 26], [2, 20], [4, 16], [6, 14]],
      sideB: [[-8, 32], [-18, 30], [-28, 24], [-30, 12], [-28, 2], [-16, 6], [-6, 10], [6, 14]],
    },
    holds: {
      a1: [-14, -8],
      a2: [-22, -8],
      b1: [11, 16],
      b2: [2, 9],
      roam: [[0, 0], [0, -8], [-4, 2], [4, -2]],
    },
  };
}

// 2D segment vs AABB test (x/z plane) — used for bot sightlines and tracer walls.
export function segmentBlocked(x0, z0, x1, z1, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (!c.tall) continue;
    if (segmentHitsBox(x0, z0, x1, z1, c)) return true;
  }
  return false;
}

function segmentHitsBox(x0, z0, x1, z1, c) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tMin = 0;
  let tMax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < c.x0 || x0 > c.x1) return false;
  } else {
    let t1 = (c.x0 - x0) / dx;
    let t2 = (c.x1 - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < c.z0 || z0 > c.z1) return false;
  } else {
    let t1 = (c.z0 - z0) / dz;
    let t2 = (c.z1 - z0) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

// Circle (radius r) vs AABB push-out on the x/z plane. Mutates pos {x, z}.
export function resolveCircle(pos, r, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 === 0) {
      if (d2 === 0) pos.x = c.x1 + r; // centre inside the box: push out east
      continue;
    }
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    pos.x += dx * push;
    pos.z += dz * push;
  }
}
