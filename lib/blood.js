// Blood trails, the server's side: who bleeds and how much, bandaging (P), the bleeding's small HP loss, and the
// snapshot's `bl` list. The browsers drop the blood themselves behind the players that list names (see
// public/js/blood.js), so nothing per drop goes over the network.
//
// Player fields (p.bleeding is the one other features read):
//   p.bleeding      0, or the bleeding level 1 (light) .. 3 (heavy)
//   p.bleedDmg      wound damage added up since the bleeding began (sets the level)
//   p.bleedUntil    when it stops by itself (BLOOD.secs after the last wound)
//   p.bleedHpAt     when the next HP goes
//   p.bandageUntil  bandaging until then (0: not bandaging)
//   p.bandages      bandages left this life
// A downed player (p.downed, another feature's) bleeds all the time, like a heavy wound; someone playing dead
// (p.playingDead, the same feature's) isn't listed, so no drops give the act away. Bots never bandage.
import { WEAPONS } from '../shared/weapons.js';
import { BLOOD, bleedLevel, BL_BANDAGING, BL_NODROPS } from '../shared/blood.js';

// Bullets, knives and shrapnel make you bleed; fire, falling debris and being run over don't. Zombies' claws are
// handled by clawHit (they only wound through armor: without it the human turns).
export function bleeds(weapon, part) {
  if (part === 'he') return weapon !== 'molotov'; // any blast: shrapnel
  if (weapon === 'pmn') return true; // stepped on a mine
  const def = WEAPONS[weapon];
  if (!def) return false; // 'car', 'collapse', 'world' ...
  if (def.melee) return true;
  // (a rocket's or a shell's fire burns with the launcher's name: not a wound)
  return !!(def.mag || def.mounted) && !def.rocket && !def.mortar && !def.grenade;
}

export function createBlood({ players, now, send, sendMe, inTeam }) {
  const stop = p => { p.bleeding = 0; p.bleedDmg = 0; p.bleedUntil = 0; p.bleedHpAt = 0; };
  const say = (p, text) => send(p, { t: 'msg', text });

  // A hit that hurt v (dmg: what it took, after armor). Called from applyDamage and clawHit.
  function wound(v, dmg, weapon, part) {
    if (!v.alive || v.hp <= 0 || v.zombie || !(dmg > 0) || !bleeds(weapon, part)) return;
    const t = now();
    const was = v.bleeding || 0;
    v.bleedDmg = (was ? v.bleedDmg || 0 : 0) + dmg;
    v.bleeding = Math.max(was, bleedLevel(v.bleedDmg));
    v.bleedUntil = t + BLOOD.secs * 1000;
    const every = BLOOD.drain[v.bleeding];
    if (every && (!was || !v.bleedHpAt)) v.bleedHpAt = t + every * 1000;
  }

  // P: bandage (BLOOD.bandage seconds; the browser slows you down and holds your fire, onShoot/onNade refuse shots).
  function bandage(p, t) {
    if (!p.alive || !inTeam(p) || p.bandageUntil) return;
    if (p.downed) return say(p, "You can't bandage yourself while you're down.");
    if (!p.bleeding) return say(p, "You're not bleeding.");
    if (p.driving != null) return say(p, "You can't bandage yourself while driving.");
    if (p.piloting != null) return say(p, 'Land the drone first.');
    if (p.zip) return say(p, "You can't bandage yourself on the zip line.");
    if ((p.bandages ?? BLOOD.bandages) <= 0) return say(p, `No bandages left (${BLOOD.bandages} a life).`);
    p.bandages = (p.bandages ?? BLOOD.bandages) - 1;
    p.bandageUntil = t + BLOOD.bandage * 1000;
    send(p, { t: 'bloodBandage', s: 'start', dur: BLOOD.bandage * 1000, left: p.bandages });
  }

  // Bandaging now: no shooting or throwing.
  const busy = p => !!p.bandageUntil && now() < p.bandageUntil;

  function tick(t) {
    for (const p of players.values()) {
      // a new life (or round): fresh bandages, no bleeding
      if (p.blSeq !== p.spawnSeq) {
        p.blSeq = p.spawnSeq;
        stop(p);
        p.bandageUntil = 0;
        p.bandages = BLOOD.bandages;
        if (p.alive && !p.bot) send(p, { t: 'bloodKit', left: p.bandages });
      }
      if (!p.bleeding && !p.bandageUntil) continue;
      if (!p.alive || p.zombie) { stop(p); p.bandageUntil = 0; continue; }
      if (p.bandageUntil && t >= p.bandageUntil) {
        p.bandageUntil = 0;
        stop(p);
        send(p, { t: 'bloodBandage', s: 'done', left: p.bandages });
        continue;
      }
      if (!p.bleeding) continue;
      if (t >= p.bleedUntil) { stop(p); continue; }
      const every = BLOOD.drain[p.bleeding];
      // (down, the body feature's: no drain; the clock waits, so a revive doesn't cost an HP at once)
      if (every && p.downed) { p.bleedHpAt = t + every * 1000; continue; }
      if (every && t >= p.bleedHpAt) {
        p.bleedHpAt = t + every * 1000;
        if (p.hp > BLOOD.minHp) { p.hp--; sendMe(p); }
      }
    }
  }

  // The snapshot's `bl`: everyone bleeding, [id, level, flags], or nothing when nobody is.
  function snap() {
    let bl = null;
    for (const p of players.values()) {
      if (!inTeam(p) || p.playingDead) continue; // (playing dead, another feature's: a "body" that drips would give it away)
      const lv = p.downed ? Math.max(BLOOD.downed, p.bleeding || 0) : p.alive ? p.bleeding || 0 : 0;
      if (!lv) continue;
      const flags = (p.bandageUntil ? BL_BANDAGING : 0) | (p.driving != null || p.riding != null ? BL_NODROPS : 0);
      (bl ||= []).push([p.id, lv, flags]);
    }
    return bl && { bl };
  }

  return { wound, bandage, busy, tick, snap };
}
