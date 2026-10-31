// Module resolution for running the browser's modules in Node (see client_smoke.mjs): the page's import map
// ('three', 'three/addons/') and its absolute paths ('/shared/', '/js/') mapped to the repo.
const ROOT = new URL('../../../', import.meta.url);
export async function resolve(spec, context, next) {
  if (spec === 'three') return next(new URL('node_modules/three/build/three.module.js', ROOT).href, context);
  if (spec.startsWith('three/addons/')) return next(new URL('node_modules/three/examples/jsm/' + spec.slice(13), ROOT).href, context);
  if (spec.startsWith('/shared/')) return next(new URL(spec.slice(1), ROOT).href, context);
  if (spec.startsWith('/js/')) return next(new URL('public' + spec, ROOT).href, context);
  return next(spec, context);
}
