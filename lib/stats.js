// Office leaderboard: lifetime stats per player name, saved to data/stats.json.
import fs from 'node:fs';
import path from 'node:path';

const FIELDS = ['kills', 'deaths', 'headshots', 'damage', 'wins', 'losses', 'rounds', 'mvps', 'rescues', 'matches', 'matchWins',
  // counters for achievements
  'knifeKills', 'nadeKills', 'molotovKills', 'rpgKills', 'pktKills', 'plants', 'defuses', 'ggWins', 'infections', 'zombieKills', 'emotes'];

export function rating(e) {
  return Math.round(e.kills * 2 + e.headshots + e.mvps * 5 + e.wins * 3 + e.rescues * 4 + e.matchWins * 10 + e.damage / 100 - e.deaths);
}

export class Stats {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')).players || {}; } catch { /* first run */ }
  }

  entry(name) {
    const key = name.trim().toLowerCase();
    if (!this.data[key]) {
      this.data[key] = { name };
      for (const f of FIELDS) this.data[key][f] = 0;
    }
    return this.data[key];
  }

  add(name, field, n = 1) {
    if (!name || !n) return null;
    const e = this.entry(name);
    e.name = name;
    e[field] = (e[field] || 0) + n;
    e.lastSeen = new Date().toISOString();
    this.save();
    return e;
  }

  // The saved entry for a name, without creating one.
  get(name) {
    return this.data[String(name || '').trim().toLowerCase()] || null;
  }

  // Marks an achievement as unlocked; true the first time.
  unlock(name, id) {
    const e = this.entry(name);
    e.ach ||= {};
    if (e.ach[id]) return false;
    e.ach[id] = new Date().toISOString();
    this.save();
    return true;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ players: this.data }, null, 1));
        fs.renameSync(tmp, this.file);
      } catch (e) {
        console.warn('Could not save stats:', e.message);
      }
    }, 2000);
  }

  top(n = 50) {
    return Object.values(this.data)
      .filter(e => e.rounds > 0)
      .map(e => ({
        name: e.name, kills: e.kills, deaths: e.deaths, headshots: e.headshots, wins: e.wins, losses: e.losses,
        mvps: e.mvps, rescues: e.rescues, matches: e.matches, matchWins: e.matchWins, damage: Math.round(e.damage),
        kd: e.deaths ? +(e.kills / e.deaths).toFixed(2) : e.kills, hsPct: e.kills ? Math.round((100 * e.headshots) / e.kills) : 0,
        rating: rating(e), rounds: e.rounds, ach: Object.keys(e.ach || {}).length, lastSeen: e.lastSeen,
      }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, n);
  }
}
