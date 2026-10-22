// Automatic quality: keeps the game smooth on a weak PC by turning down, step by step, what can change on the fly
// without a hitch — the render resolution, how often the sun's shadows are redrawn, their sharpness, and how much
// smoke and flame is drawn — and turning it back up once there's room again. It never switches shadows or lamps
// on or off: that would make every shader compile again (a freeze, see prewarm in main.js).
//
// Every frame: frame(dt seconds, now ms). It calls apply(level) whenever the level changes.

// From full quality (0) down: render scale, shadows redrawn every n frames, shadow map size factor, effect detail.
export const LEVELS = [
  { scale: 1, shadowEvery: 1, shadowSize: 1, detail: 1 },
  { scale: 0.85, shadowEvery: 1, shadowSize: 1, detail: 1 },
  { scale: 0.72, shadowEvery: 2, shadowSize: 1, detail: 0.75 },
  { scale: 0.6, shadowEvery: 2, shadowSize: 0.5, detail: 0.6 },
  { scale: 0.5, shadowEvery: 3, shadowSize: 0.5, detail: 0.45 },
];

const LOW_FPS = 48; // below this for a while: a step down
const GOOD_FPS = 57; // at or above this for a long while: try a step up
const DOWN_AFTER = 1500, UP_AFTER = 12000, SETTLE = 3000; // ms
const BOUNCE = 6000, HOLD = 90000; // dropped again within BOUNCE of a step up: stay down for HOLD

export class AutoQuality {
  constructor(apply) {
    this.apply = apply;
    this.level = 0;
    this.enabled = true;
    this.fps = 60; // smoothed
    this.lowSince = 0;
    this.goodSince = 0;
    this.changedAt = 0;
    this.upAt = -Infinity;
    this.ceiling = 0; // lowest level allowed (after a bounce)
    this.ceilingUntil = 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.set(0, performance.now());
  }

  set(level, now) {
    level = Math.max(0, Math.min(LEVELS.length - 1, level));
    if (level === this.level) return;
    if (level < this.level) this.upAt = now;
    this.level = level;
    this.changedAt = now;
    this.lowSince = this.goodSince = 0;
    this.apply(LEVELS[level]);
  }

  frame(dt, now) {
    // a long pause (loading a map, switching tabs) says nothing about how fast the game runs
    if (dt <= 0 || dt > 0.5 || document.hidden) { this.lowSince = this.goodSince = 0; return; }
    this.fps += (1 / dt - this.fps) * Math.min(1, dt * 2);
    if (!this.enabled || now - this.changedAt < SETTLE) return;
    if (now > this.ceilingUntil) this.ceiling = 0;
    if (this.fps < LOW_FPS) {
      this.goodSince = 0;
      this.lowSince ||= now;
      if (now - this.lowSince > DOWN_AFTER && this.level < LEVELS.length - 1) {
        // it went up and couldn't take it: stay at this level for a while
        if (now - this.upAt < BOUNCE) { this.ceiling = this.level + 1; this.ceilingUntil = now + HOLD; }
        this.set(this.level + 1, now);
      }
    } else if (this.fps >= GOOD_FPS) {
      this.lowSince = 0;
      this.goodSince ||= now;
      if (now - this.goodSince > UP_AFTER && this.level > this.ceiling) this.set(this.level - 1, now);
    } else {
      this.lowSince = this.goodSince = 0;
    }
  }
}
