// The storm (Hotel Meridian, map.storm; the browser's part: public/js/storm.js). The server picks when lightning
// strikes, so everyone sees the same flash: 'storm' { near } (0 overhead .. 1 far: the thunder comes later and
// quieter). Now and then a strike knocks the power out: every room's lights go off for a while (the 'lights' message
// the light switches use, marked storm: 1), then come back on by themselves.
export const STORM = {
  every: [7, 16], // s between strikes
  cut: 0.25, // the chance a strike knocks the power out
  dark: [10, 18], // s the power stays out
};
const rnd = ([a, b]) => a + Math.random() * (b - a);

// api: { game, map(), now, broadcast }
export function createStorm(api) {
  const { game } = api;
  let next = 0, darkUntil = 0;
  const groups = () => [...new Set((api.map().rooms || []).map(r => r.group))];
  function lights(on) {
    game.lights ||= {}; // (in the warmup, before the first round has made it)
    for (const g of groups()) { if (on) delete game.lights[g]; else game.lights[g] = false; }
    api.broadcast({ t: 'lights', lights: game.lights, storm: 1 });
  }
  return {
    // A new round: the power is on (the round's lights are fresh), the first strike soon.
    roundStart(t) { darkUntil = 0; next = t + rnd(STORM.every) * 500; },
    tick(t) {
      if (!api.map().storm) return;
      if (!next) next = t + rnd(STORM.every) * 500; // (the warmup: no round has started it)
      if (darkUntil && t >= darkUntil) { darkUntil = 0; lights(true); }
      if (t < next) return;
      next = t + rnd(STORM.every) * 1000;
      const near = Math.random();
      api.broadcast({ t: 'storm', near: Math.round(near * 100) / 100 });
      if (!darkUntil && near < 0.5 && Math.random() < STORM.cut * 2) { // (only a strike close by takes the power out)
        darkUntil = t + rnd(STORM.dark) * 1000;
        lights(false);
      }
    },
  };
}
