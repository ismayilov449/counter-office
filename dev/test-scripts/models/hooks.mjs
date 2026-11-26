// Module hooks for the browser code under Node (see check.mjs): '/shared/...' and 'three' as the browser's import map has them.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const file = p => pathToFileURL(path.join(ROOT, p)).href;
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('/shared/')) return { url: file(spec), shortCircuit: true };
  if (spec === 'three') return { url: file('node_modules/three/build/three.module.js'), shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: file('node_modules/three/examples/jsm/' + spec.slice(13)), shortCircuit: true };
  return next(spec, ctx);
}
