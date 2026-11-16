// state.js — the one state object and every tuning constant for Benteng Kalisusu.
// Nothing else in the game keeps its own copy of match state: game.js owns this
// object and every module reads or writes through it.

export const ROUND_TIME = 105; // 1:45 per round
export const BOMB_TIME = 30; // seconds from plant to explosion
export const PLANT_TIME = 3; // seconds holding E inside a site
export const DEFUSE_TIME = 5; // seconds a defender must hold at the bomb
export const WIN_ROUNDS = 5; // first to 5 round wins takes the match
export const MAX_ROUNDS = 9;
export const PLAYER_HP = 100;
export const BOT_HP = 100;

export const ECONOMY = {
  start: 800,
  win: 300,
  loss: 150,
  kill: 100,
  plant: 200,
};

// Weapon table: damage is per body hit; headshots multiply by headMult.
// rate is seconds between shots; spread is radians of cone half-angle.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'PISTOL P-9', price: 0, damage: 26, headMult: 2,
    mag: 12, reserveMax: 36, rate: 0.28, auto: false, reload: 1.1,
    spread: 0.014, moveSpread: 0.030, range: 60, kick: 0.010,
  },
  ss1: {
    id: 'ss1', name: 'SENAPAN SERBU SS-1', price: 700, damage: 22, headMult: 2,
    mag: 30, reserveMax: 90, rate: 0.11, auto: true, reload: 1.8,
    spread: 0.020, moveSpread: 0.045, range: 70, kick: 0.013,
  },
  sr2: {
    id: 'sr2', name: 'SENAPAN RUNDUK SR-2', price: 2500, damage: 95, headMult: 2,
    mag: 5, reserveMax: 15, rate: 1.15, auto: false, reload: 2.6,
    spread: 0.004, moveSpread: 0.030, range: 90, kick: 0.045, scoped: true,
  },
};

export const ITEMS = {
  smoke: { id: 'smoke', name: 'GRANAT ASAP', price: 300, desc: 'Menutup sightline 12 detik. Lempar dengan G.' },
  armor: { id: 'armor', name: 'ROMPI ANTI PELURU', price: 650, desc: 'Damage yang diterima berkurang 40% selama satu ronde.' },
};

export function createState() {
  return {
    // Match flow
    phase: 'menu', // menu | buy | round | roundEnd | matchEnd
    round: 1,
    scoreAtk: 0,
    scoreDef: 0,
    roundTimer: ROUND_TIME,
    buyTimer: 20,
    roundEndTimer: 0,
    roundEndReason: '',
    matchWinner: '',
    // Player
    money: ECONOMY.start,
    kills: 0,
    deaths: 0,
    health: PLAYER_HP,
    armor: false,
    // Bomb
    bombPlanted: false,
    bombTimer: 0,
    bombSite: '',
    bombPos: { x: 0, z: 0 },
    plantProgress: 0,
    defuseProgress: 0,
    plantSite: '',
    // Inventory: weapon id -> { mag, reserve }; owned set; smokes left
    owned: { p9: { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserveMax } },
    currentWeapon: 'p9',
    smokes: 0,
    // Run flags
    muted: false,
    started: false,
  };
}
