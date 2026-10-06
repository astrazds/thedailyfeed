import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const fixtureOrigin = `http://127.0.0.1:${probe.address().port}`;
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: 'inherit' });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { ready = (await fetch(origin)).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Production web host did not start.');
  for (const script of ['verify:style', 'verify:articles', 'verify:web']) {
    const child = spawn('npm', ['run', script, '--prefix', 'mobile'], {
      stdio: 'inherit', env: { ...process.env, STYLE_TARGET_URL: origin, EXPO_WEB_URL: script === 'verify:web' ? fixtureOrigin : origin },
    });
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    if (code !== 0) throw new Error(`${script} failed with exit ${code}.`);
  }
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
}
