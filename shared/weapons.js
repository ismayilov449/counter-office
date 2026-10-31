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
  // RPG-26: a throwaway one-shot tube for the Terrorists (one per team each round; anyone can pick up an unused one).
  // A smaller warhead than the RPG-7's and less accurate; once fired the empty tube is thrown away (disposable).
  rpg26: primary('launcher', { name: 'RPG-26', team: 'T', auto: false, price: 3500, damage: 400, rocket: true, disposable: true, perTeam: 1, blast: 6, rocketSpeed: 34, rate: 1.0, mag: 1, reserve: 0, reload: 0, spread: 0.012, moveSpread: 0.05, spreadInc: 0, recoil: 0.06, rangeMod: 1, pen: 0.95, speed: 5.4, killReward: 300 }),
  // 82-BM-37 mortar: set it up on open ground (setup seconds), then aim like a real crew: a bearing and an elevation
  // (in mils, see mortarRange); the shell drops there a few seconds later with some spread (server onMortar).
  // One per team; heavy to carry.
  mortar: primary('mortar', { name: '82-BM-37', auto: false, price: 6000, damage: 300, mortar: true, blast: 14, rate: 2.5, mag: 6, reserve: 0, reload: 0, spread: 0, moveSpread: 0, spreadInc: 0, recoil: 0, rangeMod: 1, pen: 1, speed: 4.2, killReward: 300, maxRange: 80, elev: [750, 1415], setup: 2 }),
  // Mounted on the pickup truck: only the gunner uses it, and it never runs out.
  pkt: { name: 'PKT', slot: 0, cls: 'mg', mounted: true, auto: true, damage: 38, rate: 0.085, spread: 0.006, moveSpread: 0, spreadInc: 0.0012, recoil: 0.007, rangeMod: 0.97, pen: 0.8, speed: 0 },

  m249: primary('mg', { name: 'M249', price: 5750, damage: 32, rate: 0.08, mag: 100, reserve: 200, reload: 4.7, spread: 0.008, moveSpread: 0.08, spreadInc: 0.002, recoil: 0.011, rangeMod: 0.97, pen: 0.8, speed: 5.5, ammoPrice: 60 }),

  he: { name: 'HE Grenade', slot: 4, cls: 'grenade', price: 300, grenade: true, max: 1, fuse: 1.6, speed: 6.3, pen: 0.5 },
  flash: { name: 'Flashbang', slot: 4, cls: 'grenade', price: 200, grenade: true, max: 2, fuse: 1.5, speed: 6.3 },
  smoke: { name: 'Smoke Grenade', slot: 4, cls: 'grenade', price: 300, grenade: true, max: 1, fuse: 1.6, speed: 6.3 },
  // Breaks on the first floor it lands on and sets the area on fire (see FIRE).
  molotov: { name: 'Molotov', slot: 4, cls: 'grenade', price: 400, grenade: true, impact: true, max: 1, fuse: 4, speed: 6.3 },
  c4: { name: 'C4 Explosive', slot: 5, cls: 'c4', speed: 6.3 },
  // Anti-personnel mines (buy menu -> Mines & camo; 6 selects them, Mouse1 lays one in front of you; see MINE).
  // PMN: a pressure mine flat on the ground, takes the leg off whoever steps on it. MON-50: directional, a tripwire
  // across its front fires a fan of fragments forward.
  pmn: { name: 'PMN mine', slot: 6, cls: 'mine', mine: 'pressure', price: 500, max: 2, speed: 6.3 },
  mon50: { name: 'MON-50 mine', slot: 6, cls: 'mine', mine: 'directional', price: 600, max: 2, speed: 6.3 },
  // Signal jammer (Terrorists): 6 selects it like a mine, Mouse1 puts it down; see JAMMER.
  jammer: { name: 'Signal jammer', slot: 6, cls: 'mine', device: true, team: 'T', price: 800, max: 1, speed: 6.3 },
  // Satchel charge (buy menu -> Mines & camo, Terrorists): Mouse1 throws it and it sticks to whatever it hits; then
  // you hold the detonator, an old phone, and Mouse1 sets it off from anywhere (see SATCHEL).
  satchel: { name: 'Satchel charge', slot: 6, cls: 'satchel', satchel: true, team: 'T', price: 1200, max: 1, speed: 6.3 },
  phone: { name: 'Detonator', slot: 6, cls: 'phone', speed: 6.3 },
  // FPV drone (Terrorists, one per team each round): 6 takes out its remote (with the mines), Mouse1 launches it, and
  // you fly it through its camera while you crouch with the remote; see DRONE.
  drone: { name: 'FPV drone', slot: 6, cls: 'drone', device: true, team: 'T', price: 5500, max: 1, perTeam: 1, speed: 6.3 },
  // The drone's bomb in the air: falls and goes off where it lands, an HE grenade's blast (never in anyone's hands).
  dronebomb: { name: 'Drone bomb', slot: 4, cls: 'grenade', impact: true, fuse: 6, speed: 6.3 },
};

export const GRENADES = ['he', 'flash', 'smoke', 'molotov'];
export const MINES = ['pmn', 'mon50'];

// Mines: armed arm seconds after they're laid; enemies only see one within seen metres (your own team always sees
// its own, and never sets them off); defused by holding E (defuse seconds, kitDefuse with a defuse kit). An
// explosion within chain metres sets a mine off too. Each player has at most perPlayer down at once.
// PMN: goes off when an enemy's feet come within trigger metres: damage to the one who stepped on it (a leg hit),
// splashDamage to others within splash metres. MON-50: its tripwire runs across its front (wire metres ahead,
// wireHalf to each side, all of it inside the cone); fragments fly up to range metres in a cone (cone radians each side), plus a small blast
// behind it (back metres).
export const MINE = {
  arm: 1.5, seen: 3, defuse: 3, kitDefuse: 1.5, chain: 3, perPlayer: 4,
  pmn: { trigger: 0.45, damage: 160, splash: 3, splashDamage: 60 },
  mon50: { wire: 3, wireHalf: 1.4, range: 25, cone: 0.52, damage: 180, back: 3, backDamage: 40 },
};

// Signal jammer: one per Terrorist team per round, active until the round ends or it's destroyed (hits bullets, or a
// blast within blast metres). Within radius metres: the CTs' radar shows static and they can't call in mortar targets
// or ping, nobody standing there is spotted onto a radar, and drones lose their signal.
export const JAMMER = { radius: 15, hits: 3, blast: 4 };

// Satchel charge: thrown at throw m/s, it sticks to the first wall, door, floor or car it hits (on a car it rides
// along). Its owner sets it off with the phone, from any distance, in the same life only (dead: it stays, but nobody can
// set it off). The blast is about 1.5 HE grenades: damage in the middle, nothing at radius m (walls protect), car
// damage to cars. Enemies defuse it with E (defuse s, kitDefuse with a kit, +reward), or shoot it (it goes off);
// an explosion within chain m sets it off too. Each player has at most perPlayer out. Cleared every round.
// FPV drone: flown through its camera while the pilot crouches with the remote and can't move or shoot. speed m/s
// across, climb m/s up and down; battery seconds in the air. The signal weakens from weak metres and is lost at range
// (with a wall between the pilot and the drone, distances count half as much again: droneSignal). It carries one bomb
// (dropped straight down: an HE grenade's blast where it lands); the kamikaze dive (dive m/s) goes off on impact:
// damage within radius metres (more than an HE), car damage to cars. One bullet brings it down (hit: its radius), so
// does a blast within blast metres, and it crashes inside a signal jammer's area. Landed within pickup metres of the
// pilot it goes back into the bag (with what's left of its battery and its bomb); landed anywhere else it's lost.
// fov: how far to each side its camera spots enemies for the radar (radians).
export const DRONE = { speed: 9, climb: 4, battery: 40, weak: 60, range: 80, dive: 24, damage: 140, radius: 7, car: 600, blast: 2.5, hit: 0.4, pickup: 4, fov: 0.9 };
// The drone's signal, 1 (full) to 0 (lost): dist from the pilot, through a wall or not.
export const droneSignal = (dist, blocked) => { const d = dist * (blocked ? 1.5 : 1); return d <= DRONE.weak ? 1 : Math.max(0, 1 - (d - DRONE.weak) / (DRONE.range - DRONE.weak)); };

export const SATCHEL = { throw: 12, damage: 150, radius: 10, car: 900, defuse: 3, kitDefuse: 1.5, reward: 200, reach: 1.6, chain: 3, perPlayer: 2 };

// Ghillie camouflage: crouched, not moving and not shooting for still seconds, you're nearly invisible to enemies
// (and bots can't make you out beyond botSees metres). Lost when you die.
export const CAMO = { still: 1.5, botSees: 4 };
// Breakable walls and furniture (cs_mansion): an explosion's [radius m, damage] against them, and the share of a
// bullet's damage the heavy guns do to them (other bullets don't hurt them). A wall chunk has 200-300 hp,
// furniture 80-130 (see shared/maps/breakables.js).
export const BREAK = {
  blast: { c4: [8, 900], mortar: [5, 700], rpg: [3, 520], rpg26: [2.4, 420], satchel: [3.6, 570], car: [4, 500], he: [2.6, 380], pmn: [1.6, 300], mon50: [2.4, 320], drone: [3, 480] },
  chip: { m249: 0.5, awp: 0.5, pkt: 0.5 },
};
// Maps with `realism` (cs_mansion): what explosions do besides breaking things.
//   push: [radius m, speed m/s] players are thrown back (and their aim knocked); doors within door m are blown off;
//   smoke: seconds the dust cloud blocks the bots' view; collapse: damage to someone under a falling piece;
//   burn: chance per fire tick that furniture within reach catches, how long it burns (s), its damage per tick,
//   the most fires at once, and how long a door can stand in a fire (s); wallShot: share of a bullet's damage
//   left after going through a thin wall or a door (at most thin m thick).
export const REAL = {
  push: { c4: [22, 16], mortar: [16, 12], rpg: [11, 10], rpg26: [8, 8], satchel: [12, 10], car: [11, 10], he: [8, 7], pmn: [4, 5], mon50: [5, 6], drone: [10, 9] },
  door: { c4: 8, mortar: 4, rpg: 3, rpg26: 2.5, satchel: 4, car: 4, he: 2.5, pmn: 1.5, mon50: 2, drone: 3 },
  smoke: { c4: 9, mortar: 6, rpg: 5, rpg26: 4, satchel: 5, car: 6, he: 4, drone: 4 },
  collapse: 25,
  burn: { chance: 0.12, life: 16, dps: 7, max: 28, door: 5 },
  wallShot: 0.5, thin: 0.45,
};
// Middle mouse button: a "!" on the team's radar where you're looking (it fades after life seconds).
export const PING = { life: 6, cooldown: 1, range: 300 };

// Molotov fire: an impact burst a bit weaker than an HE (up to 80 vs 100 in the middle, nothing at the edge), then a
// burning patch of this radius for life seconds. Standing in it burns dps HP per second (armor doesn't help), and you
// keep burning for afterburn seconds after stepping out. Running straight out costs ~20 HP; staying in kills.
export const FIRE = { radius: 3.5, life: 7, impact: 80, dps: 15, afterburn: 0.75, tick: 0.25 };
// A mortar shell, or an RPG rocket that goes off on the ground, leaves the spot burning (life s, radius m): the
// same flames as a Molotov's, hurting anyone in them.
export const BLAST_FIRE = { mortar: { life: 20, r: 3 }, rpg: { life: 8, r: 2.2 }, rpg26: { life: 6, r: 1.8 } };

export const ITEMS = {
  vest: { name: 'Kevlar Vest', price: 650 },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000 },
  kit: { name: 'Defuse Kit', price: 200, team: 'CT' },
  nvg: { name: 'Nightvision', price: 1250 },
  camo: { name: 'Ghillie camo', price: 1000 },
};

// CS 1.6 style buy menu: number keys pick a category, then an item.
// The buy menu's columns, in the order the old CS 1.6-style menu had its categories (the same numbers: a column's
// number, then the item's, 0 for a 10th). Ammo is in the menu's bottom row.
export const BUY_COLUMNS = [
  { title: 'Pistols', items: ['glock', 'usp', 'p228', 'deagle', 'fiveseven', 'elite'] },
  { title: 'Shotguns', items: ['m3', 'xm1014'] },
  { title: 'SMGs', items: ['mac10', 'tmp', 'mp5', 'ump45', 'p90'] },
  { title: 'Rifles', items: ['galil', 'famas', 'ak47', 'm4a1', 'scout', 'sg552', 'aug', 'sg550', 'g3sg1', 'awp'] },
  { title: 'Heavy', items: ['m249', 'rpg', 'rpg26', 'mortar', 'drone'] },
  { title: 'Equipment', items: ['vest', 'vesthelm', 'flash', 'he', 'smoke', 'molotov', 'kit', 'nvg'] },
  { title: 'Mines & camo', items: ['pmn', 'mon50', 'satchel', 'camo', 'jammer'] },
];

// Gun Game: one kill with each weapon moves you to the next; a knife kill on the last level wins.
export const GUNGAME = ['glock', 'usp', 'p228', 'deagle', 'fiveseven', 'elite', 'm3', 'xm1014', 'mac10', 'tmp', 'mp5', 'ump45', 'p90',
  'galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp', 'm249', 'rpg', 'he', 'knife'];

// Soviet artillery mils: 60-00 to the full circle, written like "31-50". Bearings go clockwise from north (-z on the
// maps, the top of the radar).
export const MILS = 6000;
export const milsText = mils => { const m = ((Math.round(mils) % MILS) + MILS) % MILS; return `${Math.floor(m / 100)}-${String(m % 100).padStart(2, '0')}`; };
export const bearingOf = (dx, dz) => (((Math.atan2(dx, -dz) / (Math.PI * 2)) * MILS) + MILS) % MILS;
// The mortar's firing table: how far a shell goes for an elevation (mils). Like a real one, 45 degrees (7-50) reaches
// furthest (80 m here) and the steeper the tube, the shorter: 14 m at 85 degrees (14-15).
export const mortarRange = elev => WEAPONS.mortar.maxRange * Math.sin((2 * elev * Math.PI * 2) / MILS);
// ...and back: the elevation (mils, the steep side of 45 degrees) that throws a shell dist metres.
export const mortarElev = dist => {
  const [lo, hi] = WEAPONS.mortar.elev;
  const e = ((Math.PI - Math.asin(Math.min(1, dist / WEAPONS.mortar.maxRange))) * MILS) / (4 * Math.PI);
  return Math.max(lo, Math.min(hi, e));
};

// Mortar shell flight time (ms) for a horizontal distance: a high arc, 3.4 s at 15 m to 5 s at 80 m.
export const shellFlight = dist => 3000 + dist * 25;

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
