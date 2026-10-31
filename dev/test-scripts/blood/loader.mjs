// Node module hooks for clientsmoke.mjs: the browser's paths (/shared/..., 'three') mapped to the repo.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: pathToFileURL(path.join(ROOT, 'node_modules/three/build/three.module.js')).href, shortCircuit: true };
  if (spec.startsWith('/shared/')) return { url: pathToFileURL(path.join(ROOT, spec)).href, shortCircuit: true };
  return next(spec, ctx);
}
