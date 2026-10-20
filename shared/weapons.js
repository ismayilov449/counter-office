// Weapon and equipment definitions shared by server and client.
// spread / moveSpread / spreadInc are cone radii in radians; recoil is view punch per shot.
// zoom lists the field-of-view steps for scoped weapons; sniper weapons are inaccurate unscoped.

const pistol = o => ({ slot: 2, cls: 'pistol', speed: 6.3, moveSpread: 0.035, ...o });
const primary = (cls, o) => ({ slot: 1, cls, auto: true, ...o });

export const WEAPONS = {
  knife: { name: 'Knife', slot: 3, cls: 'knife', damage: 34, altDamage: 65, rate: 0.4, altRate: 1.0, range: 1.9, melee: true, pen: 0.85, speed: 6.6, killReward: 1500 },
  // Zombie mode: a zombie's only weapon. A hit on a human without armor turns them into a zombie.
  claws: { name: 'Claws', slot: 3, cls: 'knife', damage: 40, altDamage: 70, rate: 0.45, altRate: 1.0, range: 2.0, melee: true, pen: 1, speed: 7.6, killReward: 300 },

  glock: pistol({ name: 'Glock-18', team: 'T', price: 200, damage: 25, rate: 0.15, mag: 20, reserve: 120, reload: 2.2, spread: 0.010, spreadInc: 0.004, recoil: 0.012, rangeMod: 0.75, pen: 0.47, ammoPrice: 20 }),
  usp: pistol({ name: 'USP .45', team: 'CT', price: 200, damage: 34, rate: 0.16, mag: 12, reserve: 100, reload: 2.7, spread: 0.008, spreadInc: 0.004, recoil: 0.014, rangeMod: 0.79, pen: 0.5, ammoPrice: 25 }),
  p228: pistol({ name: 'P228', price: 600, damage: 32, rate: 0.15, mag: 13, reserve: 52, reload: 2.7, spread: 0.009, spreadInc: 0.005, recoil: 0.016, rangeMod: 0.8, pen: 0.625, ammoPrice: 50 }),
  deagle: pistol({ name: 'Desert Eagle', price: 650, damage: 54, rate: 0.28, mag: 7, reserve: 35, reload: 2.2, spread: 0.009, moveSpread: 0.05, spreadInc: 0.012, recoil: 0.04, rangeMod: 0.81, pen: 0.93, ammoPrice: 40 }),
  fiveseven: pistol({ name: 'Five-SeveN', team: 'CT', price: 750, damage: 20, rate: 0.15, mag: 20, reserve: 100, reload: 2.7, spread: 0.009, spreadInc: 0.004, recoil: 0.012, rangeMod: 0.885, pen: 0.75, ammoPrice: 50 }),
  elite: pistol({ name: 'Dual Berettas', team: 'T', price: 800, damage: 36, rate: 0.12, mag: 30, reserve: 120, reload: 4.5, spread: 0.012, spreadInc: 0.005, recoil: 0.015, rangeMod: 0.75, pen: 0.575, ammoPrice: 20 }),

  m3: primary('shotgun', { name: 'M3 Super 90', auto: false, price: 1700, damage: 20, pellets: 9, pelletSpread: 0.06, rate: 0.88, mag: 8, reserve: 32, reload: 3.5, spread: 0, moveSpread: 0.02, recoil: 0.06, rangeMod: 0.7, pen: 0.5, speed: 5.9, killReward: 900, ammoPrice: 65 }),
  xm1014: primary('shotgun', { name: 'XM1014', price: 3000, damage: 20, pellets: 6, pelletSpread: 0.065, rate: 0.25, mag: 7, reserve: 32, reload: 3.0, spread: 0, moveSpread: 0.02, recoil: 0.04, rangeMod: 0.7, pen: 0.5, speed: 6.0, killReward: 900, ammoPrice: 65 }),

  mac10: primary('smg', { name: 'MAC-10', team: 'T', price: 1400, damage: 29, rate: 0.07, mag: 30, reserve: 100, reload: 3.2, spread: 0.014, moveSpread: 0.02, spreadInc: 0.002, recoil: 0.008, rangeMod: 0.82, pen: 0.475, speed: 6.3, killReward: 600, ammoPrice: 25 }),
  tmp: primary('smg', { name: 'TMP', team: 'CT', price: 1250, damage: 26, rate: 0.07, mag: 30, reserve: 120, reload: 2.1, spread: 0.012, moveSpread: 0.02, spreadInc: 0.002, recoil: 0.007, rangeMod: 0.84, pen: 0.5, speed: 6.3, killReward: 600, ammoPrice: 20 }),
  mp5: primary('smg', { name: 'MP5 Navy', price: 1500, damage: 26, rate: 0.08, mag: 30, reserve: 120, reload: 2.6, spread: 0.010, moveSpread: 0.02, spreadInc: 0.0015, recoil: 0.006, rangeMod: 0.84, pen: 0.5, speed: 6.3, killReward: 600, ammoPrice: 20 }),
  ump45: primary('smg', { name: 'UMP45', price: 1700, damage: 30, rate: 0.105, mag: 25, reserve: 100, reload: 3.5, spread: 0.011, moveSpread: 0.02, spreadInc: 0.002, recoil: 0.009, rangeMod: 0.82, pen: 0.5, speed: 6.3, killReward: 600, ammoPrice: 25 }),
  p90: primary('smg', { name: 'P90', price: 2350, damage: 26, rate: 0.066, mag: 50, reserve: 100, reload: 3.4, spread: 0.012, moveSpread: 0.02, spreadInc: 0.0015, recoil: 0.007, rangeMod: 0.885, pen: 0.75, speed: 6.3, killReward: 300, ammoPrice: 50 }),

  galil: primary('rifle', { name: 'Galil', team: 'T', price: 2000, damage: 30, rate: 0.0875, mag: 35, reserve: 90, reload: 3.0, spread: 0.006, moveSpread: 0.065, spreadInc: 0.003, recoil: 0.013, rangeMod: 0.98, pen: 0.775, speed: 6.0, ammoPrice: 80 }),
  famas: primary('rifle', { name: 'FAMAS', team: 'CT', price: 2250, damage: 30, rate: 0.0825, mag: 25, reserve: 90, reload: 3.3, spread: 0.005, moveSpread: 0.065, spreadInc: 0.003, recoil: 0.012, rangeMod: 0.96, pen: 0.7, speed: 6.0, ammoPrice: 60 }),
  ak47: primary('rifle', { name: 'AK-47', team: 'T', price: 2500, damage: 36, rate: 0.1, mag: 30, reserve: 90, reload: 2.5, spread: 0.004, moveSpread: 0.07, spreadInc: 0.0035, recoil: 0.016, rangeMod: 0.98, pen: 0.775, speed: 5.9, ammoPrice: 80 }),
  m4a1: primary('rifle', { name: 'M4A1', team: 'CT', price: 3100, damage: 33, rate: 0.09, mag: 30, reserve: 90, reload: 3.0, spread: 0.0035, moveSpread: 0.06, spreadInc: 0.003, recoil: 0.012, rangeMod: 0.97, pen: 0.7, speed: 5.9, ammoPrice: 60 }),
  sg552: primary('rifle', { name: 'SG 552', team: 'T', price: 3500, damage: 33, rate: 0.0825, mag: 30, reserve: 90, reload: 3.0, spread: 0.0035, moveSpread: 0.065, spreadInc: 0.003, recoil: 0.012, rangeMod: 0.955, pen: 0.7, speed: 5.7, zoom: [50], ammoPrice: 60 }),
  aug: primary('rifle', { name: 'AUG', team: 'CT', price: 3500, damage: 32, rate: 0.09, mag: 30, reserve: 90, reload: 3.3, spread: 0.0035, moveSpread: 0.065, spreadInc: 0.003, recoil: 0.011, rangeMod: 0.96, pen: 0.7, speed: 5.8, zoom: [50], ammoPrice: 60 }),
  scout: primary('sniper', { name: 'Scout', auto: false, price: 2750, damage: 75, rate: 1.25, mag: 10, reserve: 90, reload: 2.0, spread: 0.001, unscoped: 0.04, moveSpread: 0.05, spreadInc: 0, recoil: 0.04, rangeMod: 0.98, pen: 0.85, speed: 6.6, zoom: [30, 12], sniper: true, ammoPrice: 80 }),
  // Semi-automatic snipers: stay scoped between shots, heavy and slow to move with.
  g3sg1: primary('sniper', { name: 'D3/AU-1', team: 'T', price: 5000, damage: 80, rate: 0.25, mag: 20, reserve: 90, reload: 3.5, spread: 0.0015, unscoped: 0.05, moveSpread: 0.1, spreadInc: 0.004, recoil: 0.025, rangeMod: 0.98, pen: 0.825, speed: 5.3, zoom: [30, 12], sniper: true, autoSniper: true, ammoPrice: 80 }),
  sg550: primary('sniper', { name: 'Krieg 550 Commando', team: 'CT', price: 4200, damage: 70, rate: 0.25, mag: 30, reserve: 90, reload: 3.35, spread: 0.0015, unscoped: 0.045, moveSpread: 0.1, spreadInc: 0.004, recoil: 0.022, rangeMod: 0.98, pen: 0.775, speed: 5.4, zoom: [30, 12], sniper: true, autoSniper: true, ammoPrice: 60 }),
  awp: primary('sniper', { name: 'AWP', auto: false, price: 4750, damage: 115, rate: 1.45, mag: 10, reserve: 30, reload: 2.9, spread: 0.0008, unscoped: 0.08, moveSpread: 0.12, spreadInc: 0, recoil: 0.06, rangeMod: 0.99, pen: 0.97, speed: 5.3, zoom: [30, 11], sniper: true, killReward: 100, ammoPrice: 125 }),

  // Rocket launcher: CTs buy it, anyone can pick it up. The rocket flies, then explodes (see server explodeRocket).
  rpg: primary('launcher', { name: 'RPG-7', team: 'CT', auto: false, price: 6000, damage: 500, rocket: true, blast: 9, rocketSpeed: 38, rate: 1.0, mag: 1, reserve: 3, reload: 3.0, spread: 0.002, moveSpread: 0.03, spreadInc: 0, recoil: 0.07, rangeMod: 1, pen: 0.95, speed: 5.0, killReward: 300, ammoPrice: 600 }),
  // Mounted on the pickup truck: only the gunner uses it, and it never runs out.
  pkt: { name: 'PKT', slot: 0, cls: 'mg', mounted: true, auto: true, damage: 38, rate: 0.085, spread: 0.006, moveSpread: 0, spreadInc: 0.0012, recoil: 0.007, rangeMod: 0.97, pen: 0.8, speed: 0 },

  m249: primary('mg', { name: 'M249', price: 5750, damage: 32, rate: 0.08, mag: 100, reserve: 200, reload: 4.7, spread: 0.008, moveSpread: 0.08, spreadInc: 0.002, recoil: 0.011, rangeMod: 0.97, pen: 0.8, speed: 5.5, ammoPrice: 60 }),

  he: { name: 'HE Grenade', slot: 4, cls: 'grenade', price: 300, grenade: true, max: 1, fuse: 1.6, speed: 6.3, pen: 0.5 },
  flash: { name: 'Flashbang', slot: 4, cls: 'grenade', price: 200, grenade: true, max: 2, fuse: 1.5, speed: 6.3 },
  smoke: { name: 'Smoke Grenade', slot: 4, cls: 'grenade', price: 300, grenade: true, max: 1, fuse: 1.6, speed: 6.3 },
  // Breaks on the first floor it lands on and sets the area on fire (see FIRE).
  molotov: { name: 'Molotov', slot: 4, cls: 'grenade', price: 400, grenade: true, impact: true, max: 1, fuse: 4, speed: 6.3 },
  c4: { name: 'C4 Explosive', slot: 5, cls: 'c4', speed: 6.3 },
};

export const GRENADES = ['he', 'flash', 'smoke', 'molotov'];

// Molotov fire: an impact burst a bit weaker than an HE (up to 80 vs 100 in the middle, nothing at the edge), then a
// burning patch of this radius for life seconds. Standing in it burns dps HP per second (armor doesn't help), and you
// keep burning for afterburn seconds after stepping out. Running straight out costs ~20 HP; staying in kills.
export const FIRE = { radius: 3.5, life: 7, impact: 80, dps: 15, afterburn: 0.75, tick: 0.25 };

export const ITEMS = {
  vest: { name: 'Kevlar Vest', price: 650 },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000 },
  kit: { name: 'Defuse Kit', price: 200, team: 'CT' },
  nvg: { name: 'Nightvision', price: 1250 },
};

// CS 1.6 style buy menu: number keys pick a category, then an item.
export const BUY_MENU = [
  { title: 'Pistols', items: ['glock', 'usp', 'p228', 'deagle', 'fiveseven', 'elite'] },
  { title: 'Shotguns', items: ['m3', 'xm1014'] },
  { title: 'SMGs', items: ['mac10', 'tmp', 'mp5', 'ump45', 'p90'] },
  { title: 'Rifles', items: ['galil', 'famas', 'ak47', 'm4a1', 'scout', 'sg552', 'aug', 'sg550', 'g3sg1', 'awp'] },
  { title: 'Heavy', items: ['m249', 'rpg'] },
  { title: 'Primary ammo', action: 'ammo1' },
  { title: 'Secondary ammo', action: 'ammo2' },
  { title: 'Equipment', items: ['vest', 'vesthelm', 'flash', 'he', 'smoke', 'molotov', 'kit', 'nvg'] },
];

// Gun Game: one kill with each weapon moves you to the next; a knife kill on the last level wins.
export const GUNGAME = ['glock', 'usp', 'p228', 'deagle', 'fiveseven', 'elite', 'm3', 'xm1014', 'mac10', 'tmp', 'mp5', 'ump45', 'p90',
  'galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp', 'm249', 'rpg', 'he', 'knife'];

export const defaultPistol = team => (team === 'CT' ? 'usp' : 'glock');
export const itemInfo = id => WEAPONS[id] || ITEMS[id];
export const slotKey = id => (WEAPONS[id]?.slot === 1 ? 'primary' : WEAPONS[id]?.slot === 2 ? 'secondary' : null);
export const availableTo = (id, team) => { const i = itemInfo(id); return !!i && (!i.team || i.team === team); };

// Cost to fill the reserve of `item` (a { id, mag, res } entry), and how many rounds that buys.
export function ammoCost(item) {
  const def = WEAPONS[item?.id];
  if (!def || !def.reserve) return null;
  const missing = def.reserve - item.res;
  if (missing <= 0) return null;
  const clips = Math.ceil(missing / def.mag);
  return { price: clips * def.ammoPrice, rounds: missing };
}
