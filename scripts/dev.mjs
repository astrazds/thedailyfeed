import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const portIndex = args.findIndex((arg) => arg === '--port' || arg === '-p');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT ?? 3000);
const metroPort = Number(process.env.EXPO_PORT ?? port + 4970);
if (!Number.isInteger(port) || !Number.isInteger(metroPort) || port < 1 || port > 65535 || metroPort < 1 || metroPort > 65535) {
  throw new Error('Web and Expo ports must be valid TCP ports.');
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    }
  }
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
function run(command, commandArgs, cwd, env) {
  const child = spawn(command, commandArgs, { cwd, env, stdio: 'inherit', detached: true });
  children.push(child);
  child.on('error', (error) => { console.error(error); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
  return child;
}
run('npm', ['exec', '--', 'expo', 'start', '--web', '--localhost', '--port', String(metroPort)], resolve(root, 'mobile'), process.env);
let metroReady = false;
for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
  try { metroReady = (await fetch(`http://localhost:${metroPort}`)).ok; } catch {}
  if (metroReady) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!metroReady) { stop(1); throw new Error('Expo did not start.'); }
run('node', ['node_modules/next/dist/bin/next', 'dev', ...args], root, {
  ...process.env, EXPO_DEV_ORIGIN: `http://localhost:${metroPort}`,
});
