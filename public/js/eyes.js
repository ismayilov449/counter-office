// Eyes adjust to darkness (ROADMAP 9.1): from a lit place, the flashlight or nightvision into the dark, the view goes
// almost black, then the eyes adjust in steps of brightness, like eyes do (`dark` s a step into the dark, `light` s
// back into the light): from a lit room into a blackout, normal after ~2.5 s. Once used to real darkness (below `deep`)
// you see more than the plain picture: up to `boost` more exposure and a faint flat light (`see`, the nightvision's
// light in roomlight.js, which gives 0.5) so walls, people and hostages show as dim shapes. Nothing extra is drawn.
export const EYES = { dark: 1.5, light: 0.15, floor: 0.1, deep: 0.3, boost: 0.35, see: 0.14 };
let e = 1; // what the eyes are used to: 0 black .. 1 daylight

// light: how bright it is where you are (0..1); dt: seconds. Returns the factor for the exposure.
export function adaptEyes(light, dt) {
  const l = Math.max(0.01, light);
  e = Math.exp(Math.log(e) + (Math.log(l) - Math.log(e)) * Math.min(1, dt / (l > e ? EYES.light : EYES.dark)));
  const shock = Math.max(EYES.floor, Math.min(1, (light + 0.03) / (e + 0.03)));
  return shock * (1 + EYES.boost * Math.max(0, EYES.deep - e) / EYES.deep);
}
// the faint light of eyes used to the dark (0 .. see)
export const nightEyes = () => EYES.see * Math.max(0, EYES.deep - e) / EYES.deep;
export const resetEyes = () => { e = 1; };
