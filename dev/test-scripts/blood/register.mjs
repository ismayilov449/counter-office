// node --import ./dev/test-scripts/blood/register.mjs ... : the browser paths for client modules (see loader.mjs).
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
