// node --import ./dev/test-scripts/gas/register.mjs <script>: the browser's import paths resolve to the repo (hooks.mjs).
import { register } from 'node:module';
register(new URL('./hooks.mjs', import.meta.url));
