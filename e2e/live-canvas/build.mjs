import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { compileLivePicker } from './compile.mjs';
const output = new URL('../../.unship/live-canvas/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('picker.js', output), await compileLivePicker({ probe: true }));
await build({entryPoints:[new URL('app.jsx', import.meta.url).pathname],bundle:true,format:'iife',outfile:new URL('app.js', output).pathname,define:{'process.env.NODE_ENV':'"development"'}});
console.log('Live Canvas fixture built. Run npm run demo and open /live-canvas.');
