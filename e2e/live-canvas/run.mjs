import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

execFileSync('npm', ['ci', '--prefix', 'e2e/live-canvas'], { stdio: 'inherit' });
execFileSync(process.execPath, ['e2e/live-canvas/build.mjs'], { stdio: 'inherit' });
const server = spawn(process.execPath, ['e2e/preview.mjs'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timed out')), 10000);
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited: ${code}`)); });
    server.on('error', reject);
    server.stdout.on('data', data => {
      const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0] + '/live-canvas'); }
    });
  });
  for (const check of ['check-live', 'check-edges', 'check-wheel', 'check-package']) {
    execFileSync(process.execPath, [`e2e/live-canvas/${check}.mjs`], { stdio: 'inherit', env: { ...process.env, UNSHIP_LIVE_URL: url } });
  }
} finally {
  server.kill();
  await once(server, 'exit');
}
