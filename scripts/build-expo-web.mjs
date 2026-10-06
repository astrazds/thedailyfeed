import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generated = resolve(root, 'public/expo');
await rm(generated, { recursive: true, force: true });
await rm(resolve(root, '.expo-precache.json'), { force: true });
await rm(resolve(root, 'mobile/dist'), { recursive: true, force: true });
const exported = spawnSync('npm', ['run', 'export:web'], {
  cwd: resolve(root, 'mobile'), stdio: 'inherit', env: process.env,
});
if (exported.status !== 0) process.exit(exported.status ?? 1);
await mkdir(generated, { recursive: true });
await cp(resolve(root, 'mobile/dist'), generated, { recursive: true });
let html = await readFile(resolve(generated, 'index.html'), 'utf8');
html = html.replace(/<meta name="viewport"[^>]+>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">');
html = html.replace('</head>', `<meta name="description" content="A minimalist RSS reader that displays only today's feed items. Clean, focused, distraction-free reading.">
<meta name="theme-color" content="#faf8f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1816" media="(prefers-color-scheme: dark)">
<style>
html, body { background-color: #faf8f5; color-scheme: light; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: #1a1816; color-scheme: dark; }
}
</style>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="The Daily Feed">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="format-detection" content="telephone=no">
<meta property="og:title" content="The Daily Feed">
<meta property="og:description" content="Today's feed items from around the web">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/thedailyfeed-light-192.png">
<link rel="apple-touch-icon" href="/thedailyfeed-light-192.png">
</head>`);
await writeFile(resolve(generated, 'index.html'), html);
const entries = [];
for (const file of await readdir(resolve(root, 'public'), { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const path = resolve(file.parentPath, file.name);
  const relative = path.slice(resolve(root, 'public').length + 1).replaceAll('\\', '/');
  if (/^(sw\.js(?:\.map)?|swe-worker-.*|workbox-.*)$/.test(relative)) continue;
  if (relative === 'expo/metadata.json') continue;
  const url = relative === 'expo/index.html' ? '/' : `/${relative.replace(/^expo\//, '')}`;
  const revision = createHash('sha256').update(await readFile(path)).digest('hex');
  entries.push({ url, revision });
}
entries.push({ url: '/manifest.webmanifest', revision: createHash('sha256').update(await readFile(resolve(root, 'app/manifest.ts'))).digest('hex') });
entries.sort((a, b) => a.url.localeCompare(b.url));
await writeFile(resolve(root, '.expo-precache.json'), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Expo web assembled with ${entries.length} revisioned shell assets.`);
