#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
preview.stdout.on('data', (d) => {
  const s = d.toString();
  if (s.includes('4173') || s.includes('Local:')) ready = true;
});
preview.stderr.on('data', (d) => {
  const s = d.toString();
  if (s.includes('4173') || s.includes('Local:')) ready = true;
});

const kill = () => {
  try { preview.kill('SIGTERM'); } catch {}
};
process.on('exit', kill);
process.on('SIGINT', () => { kill(); process.exit(130); });

for (let i = 0; i < 40 && !ready; i++) await sleep(250);
if (!ready) {
  // still try — vite may have started
  await sleep(500);
}

const smoke = spawn('node', ['scripts/smoke-game.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'inherit',
  env: { ...process.env, SMOKE_URL: 'http://127.0.0.1:4173/' },
});

smoke.on('exit', (code) => {
  kill();
  process.exit(code ?? 1);
});
